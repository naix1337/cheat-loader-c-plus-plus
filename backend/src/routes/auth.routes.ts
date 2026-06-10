import { Router } from "express";
import { z } from "zod";
import { login, logout, refresh } from "../services/auth.service";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(256),
  otp: z.string().length(6).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

router.post("/login", authRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", message: parsed.error.message });
    return;
  }

  const clientIp = req.ip ?? "unknown";
  const result = await login(
    parsed.data.username,
    parsed.data.password,
    parsed.data.otp,
    clientIp
  );

  if ("requires2fa" in result && result.requires2fa) {
    res.status(200).json({
      requires_2fa: true,
      user: result.user,
    });
    return;
  }

  if (!result.success) {
    if ("error" in result) {
      if (result.status === 429) {
        res.status(429).json({
          error: result.error,
          retry_after: 15 * 60,
        });
        return;
      }
      res.status(result.status).json({ error: result.error });
      return;
    }
    return;
  }

  res.status(200).json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: result.expiresIn,
    user: result.user,
    requires_2fa: false,
  });
});

router.post("/refresh", authRateLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }

  const result = await refresh(parsed.data.refresh_token);
  if (!result.success) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: result.expiresIn,
  });
});

router.post("/logout", authRateLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }

  await logout(parsed.data.refresh_token);
  res.status(200).json({ message: "Logged out" });
});

export default router;
