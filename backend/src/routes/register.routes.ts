import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { hashPassword } from "../utils/argon2";
import { pool } from "../db/pool";
import { rateLimit } from "express-rate-limit";

const router = Router();

/** Tighter rate limit for registration — prevents account stuffing. */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later.", retry_after: 900 },
});

// ── Zod schemas ──────────────────────────────────────────

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, digits, and underscores"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(256, "Password must be at most 256 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol"),
});

// ── CSRF helpers ─────────────────────────────────────────

const csrfTokens = new Map<string, { expires: number }>();
const CSRF_EXPIRY_MS = 30 * 60 * 1000; // 30 min

function generateCsrfToken(): string {
  // Clean expired
  const now = Date.now();
  for (const [token, data] of csrfTokens) {
    if (data.expires < now) csrfTokens.delete(token);
  }

  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(token, { expires: now + CSRF_EXPIRY_MS });
  return token;
}

function verifyCsrfToken(token: string | undefined): boolean {
  if (!token) return false;
  const data = csrfTokens.get(token);
  if (!data) return false;
  if (data.expires < Date.now()) {
    csrfTokens.delete(token);
    return false;
  }
  csrfTokens.delete(token); // single-use
  return true;
}

// ── Routes ───────────────────────────────────────────────

/**
 * GET /register — serves the registration HTML page.
 * The page includes a CSRF token in a meta tag.
 */
router.get("/", (_req: Request, res: Response) => {
  const csrfToken = generateCsrfToken();
  res.cookie("csrf_token", csrfToken, {
    httpOnly: false,   // read by JS to embed in form
    secure: true,
    sameSite: "strict",
    maxAge: CSRF_EXPIRY_MS,
  });
  res.send(renderRegisterPage(csrfToken));
});

/**
 * POST /api/register — creates a new user account.
 * Body: { username, email, password, csrf_token }
 */
router.post("/", registerLimiter, async (req: Request, res: Response): Promise<void> => {
  // CSRF check
  const csrfCookie = req.cookies?.csrf_token;
  const csrfBody = req.body?.csrf_token;
  if (!csrfCookie || !csrfBody || csrfCookie !== csrfBody) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }
  if (!verifyCsrfToken(csrfBody)) {
    res.status(403).json({ error: "CSRF token expired or already used" });
    return;
  }

  // Validate body
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    const firstMsg = Object.values(fields).flat()[0] ?? "Validation failed";
    res.status(400).json({ error: firstMsg, fields });
    return;
  }

  const { username, email, password } = parsed.data;

  // Normalize
  const normalizedEmail = email.toLowerCase().trim();

  // Block reserved usernames
  if (username.toLowerCase() === "admin") {
    res.status(400).json({ error: "This username is reserved" });
    return;
  }

  // Check duplicate
  const existing = await pool.query(
    `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
    [username, normalizedEmail]
  );
  if (existing.rows.length > 0) {
    // Don't reveal whether it's username or email
    res.status(409).json({ error: "A user with that username or email already exists" });
    return;
  }

  // Create user
  try {
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, email_verified, two_fa_enabled, role)
       VALUES ($1, $2, $3, TRUE, FALSE, 'user')`,
      [username, normalizedEmail, passwordHash]
    );

    // Clear CSRF cookie
    res.clearCookie("csrf_token", { secure: true, sameSite: "strict" });

    res.status(201).json({
      message: "Account created successfully! You can now log in with the Windows client.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("unique") || message.includes("duplicate")) {
      res.status(409).json({ error: "A user with that username or email already exists" });
      return;
    }
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── HTML page renderer ──────────────────────────────────

function renderRegisterPage(csrfToken: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Register — insolution.cloud</title>
  <meta name="csrf-token" content="${csrfToken}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #12121a;
      border: 1px solid #1e1e2a;
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo h1 {
      font-size: 24px;
      font-weight: 600;
      color: #00d4ff;
      letter-spacing: -0.5px;
    }
    .logo p {
      color: #888;
      font-size: 14px;
      margin-top: 4px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #aaa;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 15px;
      transition: border-color 0.2s;
      outline: none;
    }
    input:focus {
      border-color: #00d4ff;
      box-shadow: 0 0 0 3px rgba(0,212,255,0.1);
    }
    input.invalid {
      border-color: #ff4444;
    }
    .error-text {
      color: #ff4444;
      font-size: 12px;
      margin-top: 4px;
      display: none;
    }
    .error-text.visible { display: block; }
    .password-rules {
      font-size: 11px;
      color: #666;
      margin-top: 6px;
      line-height: 1.5;
    }
    .password-rules .ok { color: #4caf50; }
    .password-rules .no { color: #666; }
    .btn {
      width: 100%;
      padding: 14px;
      background: #00d4ff;
      color: #0a0a0f;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      margin-top: 8px;
    }
    .btn:hover { background: #00bde6; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled {
      background: #2a2a3a;
      color: #666;
      cursor: not-allowed;
    }
    .message {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }
    .message.error { display: block; background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.3); color: #ff6666; }
    .message.success { display: block; background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); color: #4caf50; }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 13px;
      color: #666;
    }
    .footer a { color: #00d4ff; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(10,10,15,0.3);
      border-top-color: #0a0a0f;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) {
      .container { padding: 32px 20px; border-radius: 0; border: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>insolution.cloud</h1>
      <p>Create your account</p>
    </div>

    <div id="message" class="message"></div>

    <form id="registerForm" novalidate>
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" autocomplete="username"
               minlength="3" maxlength="50" pattern="[a-zA-Z0-9_]+" required />
        <div class="error-text" id="usernameError"></div>
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required />
        <div class="error-text" id="emailError"></div>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="new-password"
               minlength="12" required />
        <div class="error-text" id="passwordError"></div>
        <div class="password-rules" id="passwordRules">
          <span id="ruleLength">✗ At least 12 characters</span><br />
          <span id="ruleUpper">✗ One uppercase letter</span><br />
          <span id="ruleLower">✗ One lowercase letter</span><br />
          <span id="ruleDigit">✗ One digit</span><br />
          <span id="ruleSymbol">✗ One symbol</span>
        </div>
      </div>

      <div class="form-group">
        <label for="confirm">Confirm password</label>
        <input type="password" id="confirm" name="confirm" autocomplete="new-password" required />
        <div class="error-text" id="confirmError"></div>
      </div>

      <button type="submit" class="btn" id="submitBtn">Create Account</button>
    </form>

    <div class="footer">
      Already have an account?
      <a href="https://github.com/nix1337/ntztwerktool/releases" target="_blank">Download the client</a>
    </div>
  </div>

  <script>
    const form = document.getElementById('registerForm');
    const submitBtn = document.getElementById('submitBtn');
    const message = document.getElementById('message');
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    // Live password rules check
    const pw = document.getElementById('password');
    const checks = {
      length:   el => el.value.length >= 12,
      upper:    el => /[A-Z]/.test(el.value),
      lower:    el => /[a-z]/.test(el.value),
      digit:    el => /[0-9]/.test(el.value),
      symbol:   el => /[^A-Za-z0-9]/.test(el.value),
    };

    pw.addEventListener('input', () => {
      for (const [key, fn] of Object.entries(checks)) {
        const ok = fn(pw);
        const span = document.getElementById('rule' + key.charAt(0).toUpperCase() + key.slice(1));
        span.textContent = (ok ? '✓' : '✗') + ' ' + span.textContent.slice(2);
        span.className = ok ? 'ok' : 'no';
      }
    });

    // Field error cleanup
    document.querySelectorAll('input').forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('invalid');
        const err = document.getElementById(el.name + 'Error');
        if (err) err.classList.remove('visible');
      });
    });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      message.className = 'message';
      message.textContent = '';

      // Client-side validation
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = pw.value;
      const confirm = document.getElementById('confirm').value;
      let valid = true;

      if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
        showError('username', 'Username: 3–50 chars, letters, digits, underscores only');
        valid = false;
      }
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        showError('email', 'Please enter a valid email address');
        valid = false;
      }
      if (password !== confirm) {
        showError('confirm', 'Passwords do not match');
        valid = false;
      }
      // Check all password rules
      for (const fn of Object.values(checks)) {
        if (!fn(pw)) { valid = false; break; }
      }
      if (!valid) {
        document.getElementById('password').classList.add('invalid');
        return;
      }

      // Submit
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Creating account…';

      try {
        const res = await fetch('/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, csrf_token: csrfToken }),
        });

        const data = await res.json();
        if (res.ok) {
          message.className = 'message success';
          message.textContent = data.message || 'Account created! Redirecting…';
          form.style.display = 'none';
          document.querySelector('.logo p').textContent = 'Registration successful!';
          setTimeout(() => {
            window.location.href = '/register-success';
          }, 2000);
        } else {
          message.className = 'message error';
          message.textContent = data.error || 'Registration failed';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      } catch (err) {
        message.className = 'message error';
        message.textContent = 'Network error. Please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });

    function showError(field, text) {
      const input = document.getElementById(field);
      const err = document.getElementById(field + 'Error');
      if (input) input.classList.add('invalid');
      if (err) { err.textContent = text; err.classList.add('visible'); }
    }
  </script>
</body>
</html>`;
}

export default router;
