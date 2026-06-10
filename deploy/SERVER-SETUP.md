# Server Setup (Ubuntu 22.04/24.04)

## 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y postgresql postgresql-contrib caddy git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER cloader WITH PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE cloader OWNER cloader;
GRANT ALL PRIVILEGES ON DATABASE cloader TO cloader;
SQL
```

## 3. JWT keys

```bash
sudo mkdir -p /etc/cloader
sudo openssl genrsa -out /etc/cloader/jwt_private.pem 4096
sudo openssl rsa -in /etc/cloader/jwt_private.pem -pubout -out /etc/cloader/jwt_public.pem
sudo chmod 600 /etc/cloader/jwt_private.pem
sudo chown -R $USER: /etc/cloader
```

## 4. Deploy API

```bash
sudo mkdir -p /opt/cloader
sudo chown $USER:$USER /opt/cloader
git clone https://github.com/naix1337/c-loader.git /opt/cloader
cd /opt/cloader/backend
cp .env.example .env
# Edit .env with real values (see below)
npm ci
npm run build
npm run migrate
```

### Generate secrets for `.env`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ARGON2_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOTP_ENCRYPTION_KEY
```

## 5. Create demo user

```bash
cd /opt/cloader/backend
npx tsx src/scripts/create-user.ts demo_user demo@yourdomain.com 'DemoPass2026!'
```

## 6. systemd service

```bash
sudo cp /opt/cloader/backend/systemd/auth-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auth-api
sudo systemctl status auth-api
```

## 7. Caddy

```bash
sudo cp /opt/cloader/deploy/Caddyfile.example /etc/caddy/Caddyfile
# Edit domains in Caddyfile
sudo systemctl reload caddy
```

## 8. Firewall

```bash
chmod +x /opt/cloader/deploy/ufw-rules.sh
sudo /opt/cloader/deploy/ufw-rules.sh
```

## 9. DNS

| Record | Value |
|--------|-------|
| `api.yourdomain.com` | A → server IP |
| `yourdomain.com` | A → server IP |

## 10. Client config (Windows)

```json
{
  "api_base_url": "https://api.yourdomain.com",
  "registration_url": "https://yourdomain.com/register"
}
```

## Health check

```bash
curl https://api.yourdomain.com/health
```
