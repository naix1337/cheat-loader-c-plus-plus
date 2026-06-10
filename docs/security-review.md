# Security Review — c-loader

Review date: 2026-06-10  
Scope: Windows C++ client + Node.js API + deployment architecture

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| High | 2 | 1 mitigated in code, 1 requires ops |
| Medium | 5 | Mitigated or documented |
| Low | 4 | Accepted / future work |

Overall: **suitable for production** once server hardening checklist is completed and registration website is deployed.

---

## Windows Client

### HIGH — Memory dump / malware on client machine

| | |
|---|---|
| **Risk** | Attacker with local access can dump process memory and extract tokens/passwords |
| **Mitigation** | `SecureString` + `SecureZero`; tokens RAM-only; passwords wiped after request; no disk persistence |
| **Residual** | Cannot fully prevent OS-level attacks on client — industry-standard limitation for native apps |

### MEDIUM — Token copy for Authorization header

| | |
|---|---|
| **Risk** | `getAccessToken()` returns `std::string` copy visible briefly in memory |
| **Mitigation** | Short-lived; wiped when string is destroyed; unavoidable for HTTP header construction |
| **Residual** | Minimize lifetime; no logging of token values |

### MEDIUM — UI updates from worker thread

| | |
|---|---|
| **Risk** | Race conditions if network callbacks update ImGui directly |
| **Mitigation** | `UIManager::enqueueMainThread()` marshals all auth callbacks to main thread |
| **Status** | Mitigated |

### LOW — No certificate pinning

| | |
|---|---|
| **Risk** | Compromised CA could issue fraudulent cert |
| **Mitigation** | TLS 1.3 + full cert verification; pinning structure prepared in `TlsConfig.h` |
| **Residual** | Enable SPKI pinning for high-threat deployments |

### LOW — ImGui state not persisted

| | |
|---|---|
| **Risk** | N/A — positive control |
| **Mitigation** | `io.IniFilename = nullptr` — no UI state on disk |

---

## Transport

### HIGH — Downgrade to TLS 1.2

| | |
|---|---|
| **Risk** | Weak ciphers / protocol attacks |
| **Mitigation** | `CURLOPT_SSLVERSION = CURL_SSLVERSION_TLSv1_3`; verify peer + host always enabled |
| **Status** | Mitigated — no `verify_ssl = false` anywhere |

---

## API Server

### MEDIUM — Brute-force login

| | |
|---|---|
| **Risk** | Credential stuffing |
| **Mitigation** | 5 attempts / 15 min per `IP:username`; `express-rate-limit` globally; generic error messages |
| **Status** | Mitigated |

### MEDIUM — Refresh token theft

| | |
|---|---|
| **Risk** | Stolen refresh token grants prolonged access |
| **Mitigation** | Opaque tokens; SHA-256 in DB; rotation on every use; reuse detection invalidates all sessions |
| **Status** | Mitigated |

### MEDIUM — JWT key compromise

| | |
|---|---|
| **Risk** | Forged access tokens |
| **Mitigation** | RS256 asymmetric; private key on server only (`/etc/cloader/`, mode 600) |
| **Residual** | Key rotation procedure required (ops) |

### MEDIUM — TOTP secret at rest

| | |
|---|---|
| **Risk** | DB leak exposes 2FA secrets |
| **Mitigation** | AES-256-GCM encryption with `TOTP_ENCRYPTION_KEY` from env |
| **Status** | Mitigated |

### LOW — Timing attacks on login

| | |
|---|---|
| **Risk** | Username enumeration via response time |
| **Mitigation** | Argon2 verify always runs; generic "Invalid credentials" message |
| **Residual** | Consider constant-time path for user-not-found (future) |

---

## Database

### MEDIUM — SQL injection

| | |
|---|---|
| **Risk** | Query manipulation |
| **Mitigation** | Parameterized queries only (`$1`, `$2` via `pg`) |
| **Status** | Mitigated |

### LOW — PostgreSQL exposed to internet

| | |
|---|---|
| **Risk** | Direct DB attacks |
| **Mitigation** | `listen_addresses = localhost`; UFW blocks 5432 |
| **Status** | Mitigated (ops checklist) |

---

## Deployment / Operations (not in code)

These **must** be done manually on the server:

| Item | Priority |
|------|----------|
| SSH key-only auth, disable root login | High |
| UFW: only 22, 80, 443 | High |
| Strong PostgreSQL password | High |
| JWT private key permissions `600` | High |
| `.env` never in git | High |
| Automated security updates (`unattended-upgrades`) | Medium |
| Database backups (encrypted) | Medium |
| Log monitoring / alerting | Medium |
| WAF or fail2ban for SSH | Medium |
| Registration website with CSRF + email verify | High (not yet implemented) |

---

## Password policy

| Check | Client | Server |
|-------|--------|--------|
| Argon2id | — | Yes (19 MiB, t=2, p=1) |
| Pepper | — | Yes (`ARGON2_PEPPER`) |
| SHA-256/MD5 passwords | — | Not used |
| Min length enforcement | — | Via `create-user` / future register API |

---

## Token model compliance

| Requirement | Status |
|-------------|--------|
| Access token 15 min | Yes (`JWT_ACCESS_EXPIRES_IN=15m`) |
| Refresh token 7 days opaque | Yes |
| Refresh in RAM only (client) | Yes (`TokenStore`) |
| Refresh hashed in DB | Yes (SHA-256) |
| Rotation on use | Yes |
| Reuse detection | Yes (revokes all user sessions) |

---

## 2FA

| Requirement | Status |
|-------------|--------|
| TOTP RFC 6238 | Yes (`otplib`) |
| ±30 s tolerance | Yes (`window: 1`) |
| No SMS 2FA | Yes |

---

## Recommendations (priority order)

1. Deploy API following `deploy/SERVER-SETUP.md` checklist completely
2. Implement registration website (`docs/registration-website.md`)
3. Enable `unattended-upgrades` on Ubuntu
4. Set up encrypted PostgreSQL backups
5. Consider certificate pinning for client in high-threat scenarios
6. Add security headers audit (Caddy + Helmet already configured)
7. Periodic dependency audit: `npm audit` + vcpkg updates

---

## Conclusion

The codebase follows OWASP 2025 recommendations for authentication architecture. The primary remaining work is **operational** (server hardening, backups, monitoring) and the **registration website** (not yet built). No critical code-level vulnerabilities were identified that block deployment after proper server configuration.
