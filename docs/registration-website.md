# Registration Website (Concept)

Registration is **not** available in the Windows client. Users sign up via a separate HTTPS website.

## Pages

1. **Register** — username, email, password, confirm password
2. **Verify email** — link from email activates `email_verified`
3. **2FA setup** — QR code (TOTP secret), confirm with first OTP

## Security

- CSRF tokens on all forms
- Rate limiting (same 5 attempts / 15 min pattern)
- HTTPS only (Caddy)
- Password policy: min 12 chars, complexity rules
- Argon2id hashing via the same API utilities

## API (website-only, not used by client)

Suggested endpoints for a future web registration service:

```
POST /api/register
POST /api/verify-email
POST /api/2fa/setup
POST /api/2fa/confirm
```

These can live in the same Node.js app or a separate service behind Caddy.
