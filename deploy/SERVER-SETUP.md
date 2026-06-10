# Deployment Guide — Ubuntu vServer

Complete guide for deploying the c-loader API on Ubuntu 22.04/24.04 LTS.

---

## Architecture

```
Internet
   │
   ▼
[UFW]  ports 22, 80, 443
   │
   ▼
[Caddy]  TLS 1.3, Let's Encrypt auto-renewal
   │
   ├── api.yourdomain.com  → 127.0.0.1:3000  (Node.js API)
   └── yourdomain.com      → 127.0.0.1:8080  (registration site, future)
   │
   ▼
[PostgreSQL]  localhost:5432 only
```

---

## 1. Initial server hardening

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone Europe/Berlin   # adjust as needed
sudo adduser cloader
sudo usermod -aG sudo cloader
```

Copy your SSH key, then disable password SSH login in `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart sshd
```

---

## 2. Firewall (UFW)

```bash
chmod +x deploy/ufw-rules.sh
sudo ./deploy/ufw-rules.sh
```

Only **22**, **80**, **443** are open. PostgreSQL stays on `127.0.0.1`.

---

## 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

```bash
sudo -u postgres psql <<'SQL'
CREATE USER cloader WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE cloader OWNER cloader;
GRANT ALL PRIVILEGES ON DATABASE cloader TO cloader;
SQL
```

### Harden PostgreSQL

Edit `/etc/postgresql/*/main/postgresql.conf`:

```
listen_addresses = 'localhost'
ssl = on
```

Edit `/etc/postgresql/*/main/pg_hba.conf` — only local connections:

```
local   all   all                    peer
host    all   all   127.0.0.1/32     scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

---

## 4. Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
node --version   # v20+
```

---

## 5. JWT keys (RS256)

```bash
sudo mkdir -p /etc/cloader
sudo openssl genrsa -out /etc/cloader/jwt_private.pem 4096
sudo openssl rsa -in /etc/cloader/jwt_private.pem -pubout -out /etc/cloader/jwt_public.pem
sudo chmod 600 /etc/cloader/jwt_private.pem
sudo chmod 644 /etc/cloader/jwt_public.pem
sudo chown cloader:cloader /etc/cloader/*.pem
```

Never commit these files to git.

---

## 6. Deploy application

```bash
sudo mkdir -p /opt/cloader
sudo chown cloader:cloader /opt/cloader
sudo -u cloader git clone https://github.com/naix1337/c-loader.git /opt/cloader
cd /opt/cloader/backend
sudo -u cloader cp .env.example .env
```

### `.env` configuration

```bash
# Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edit `/opt/cloader/backend/.env`:

```env
PORT=3000
NODE_ENV=production

DATABASE_URL=postgresql://cloader:YOUR_DB_PASSWORD@127.0.0.1:5432/cloader

JWT_PRIVATE_KEY_PATH=/etc/cloader/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/etc/cloader/jwt_public.pem
JWT_ACCESS_EXPIRES_IN=15m

ARGON2_PEPPER=<64-char-hex>
TOTP_ENCRYPTION_KEY=<64-char-hex>

CORS_ORIGINS=https://yourdomain.com
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
```

```bash
sudo -u cloader npm ci
sudo -u cloader npm run build
sudo -u cloader npm run migrate
```

---

## 7. Create first user

```bash
cd /opt/cloader/backend
sudo -u cloader npx tsx src/scripts/create-user.ts demo_user demo@yourdomain.com 'DemoPass2026!'
```

---

## 8. systemd service

Create system user if needed:

```bash
sudo useradd -r -s /bin/false cloader 2>/dev/null || true
sudo chown -R cloader:cloader /opt/cloader
```

```bash
sudo cp /opt/cloader/backend/systemd/auth-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable auth-api
sudo systemctl start auth-api
sudo systemctl status auth-api
```

Logs:

```bash
journalctl -u auth-api -f
```

---

## 9. Caddy (HTTPS)

```bash
sudo apt install -y caddy
sudo cp /opt/cloader/deploy/Caddyfile.example /etc/caddy/Caddyfile
```

Edit domains, then:

```bash
sudo systemctl enable caddy
sudo systemctl reload caddy
```

Caddy obtains and renews Let's Encrypt certificates automatically.

Verify TLS:

```bash
curl -I https://api.yourdomain.com/health
```

---

## 10. DNS records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api.yourdomain.com` | `<server-ip>` | 300 |
| A | `yourdomain.com` | `<server-ip>` | 300 |

Wait for propagation, then Caddy will issue certificates on first request.

---

## 11. Windows client config

Copy next to `cpp-auth-client.exe`:

```json
{
  "api_base_url": "https://api.yourdomain.com",
  "app_name": "Auth Client",
  "version": "1.0.0",
  "log_level": "info",
  "registration_url": "https://yourdomain.com/register"
}
```

---

## 12. Updates

```bash
cd /opt/cloader
sudo -u cloader git pull
cd backend
sudo -u cloader npm ci
sudo -u cloader npm run build
sudo -u cloader npm run migrate   # if new migrations exist
sudo systemctl restart auth-api
```

---

## 13. Troubleshooting

| Problem | Fix |
|---------|-----|
| `health` returns connection refused | `systemctl status auth-api`, check PORT in `.env` |
| TLS certificate error | DNS must point to server; ports 80/443 open |
| Login 401 | User must have `email_verified=true` (use `create-user` script) |
| DB connection failed | Check `DATABASE_URL`, PostgreSQL running |
| CORS error in browser | Add origin to `CORS_ORIGINS` in `.env` |

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_PRIVATE_KEY_PATH` | Yes | RS256 private key PEM path |
| `JWT_PUBLIC_KEY_PATH` | Yes | RS256 public key PEM path |
| `ARGON2_PEPPER` | Yes | Server-side password pepper (32+ bytes hex) |
| `TOTP_ENCRYPTION_KEY` | Yes | AES-256 key for TOTP secrets (32 bytes hex) |
| `CORS_ORIGINS` | No | Comma-separated allowed web origins |
| `LOGIN_MAX_ATTEMPTS` | No | Default: 5 |
| `LOGIN_LOCKOUT_MINUTES` | No | Default: 15 |
