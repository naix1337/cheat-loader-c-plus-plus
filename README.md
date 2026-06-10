# c-loader

Windows C++20 authentication client with Dear ImGui (DirectX 11), secure token handling (RAM-only), and TLS 1.3 API communication.

## Features

- Dark launcher-style UI (ImGui + DirectX 11)
- Login + TOTP 2FA flow
- Access/refresh tokens stored only in RAM
- TLS 1.3 enforced, certificate verification always on
- No registration in the client (external website only)

## Requirements (Windows build)

- Windows 10/11 x64
- Visual Studio 2026 (or 2022) with **Desktop development with C++**
- CMake tools
- vcpkg (bundled with VS or standalone)

### vcpkg

```powershell
setx VCPKG_ROOT "C:\Program Files\Microsoft Visual Studio\18\Community\VC\vcpkg"
```

Restart Visual Studio after setting `VCPKG_ROOT`.

## Build (Visual Studio)

1. Open this folder: **File → Open → Folder**
2. Select CMake preset: **Release (x64-windows-static)**
3. If `build/release` was deleted: **Project → Delete CMake Cache**, then reconfigure
4. Build: `Ctrl+Shift+B`

Output:

```
build/release/Release/cpp-auth-client.exe
```

## Run locally

```powershell
copy config\config.example.json build\release\Release\config\config.json
```

Edit `config.json`:

```json
{
  "api_base_url": "https://api.yourdomain.com",
  "registration_url": "https://yourdomain.com/register"
}
```

Optional font: `assets/fonts/Roboto-Regular.ttf`

## Server (Linux vServer)

Full setup guide: **[deploy/SERVER-SETUP.md](deploy/SERVER-SETUP.md)**

| Component | Purpose |
|-----------|---------|
| **Ubuntu 22.04/24.04** | OS |
| **Caddy** | HTTPS reverse proxy, Let's Encrypt |
| **PostgreSQL** | Users, refresh tokens, login attempts |
| **Node.js API** (`backend/`) | Auth endpoints, Argon2id, JWT RS256, TOTP |
| **Registration website** | Account signup (see `docs/registration-website.md`) |

### Quick start on server

```bash
git clone https://github.com/naix1337/c-loader.git /opt/cloader
cd /opt/cloader/backend
cp .env.example .env   # edit secrets
npm ci && npm run build && npm run migrate
npx tsx src/scripts/create-user.ts demo_user demo@example.com 'DemoPass2026!'
sudo systemctl enable --now auth-api   # after copying systemd unit
```

### API endpoints (required)

```
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/user/me
PUT  /api/user/me
```

### Firewall (UFW)

- `22` SSH
- `80` HTTP (Let's Encrypt)
- `443` HTTPS

### Environment variables (API)

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — RS256 key pair
- `ARGON2_PEPPER` — extra secret for password hashing

### DNS

Point your API host to the server, e.g. `api.yourdomain.com` → vServer IP.

Caddy terminates TLS; the client connects to `https://api.yourdomain.com` via `api_base_url`.

## Security notes

- Tokens are never written to disk on the client
- Passwords are wiped from memory after login requests
- Only TLS 1.3 is accepted
- Registration is not available inside the client

## Documentation

| Document | Description |
|----------|-------------|
| [deploy/SERVER-SETUP.md](deploy/SERVER-SETUP.md) | Full vServer deployment guide |
| [docs/registration-website.md](docs/registration-website.md) | Registration site architecture |
| [docs/security-review.md](docs/security-review.md) | Security analysis & risk matrix |

## License

Private project — all rights reserved unless otherwise specified.
