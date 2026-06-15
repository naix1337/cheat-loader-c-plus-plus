# Registration Page – Deployment Guide

## Was wurde gebaut

| Komponente | Beschreibung |
|---|---|
| `POST /api/register` | Erstellt User mit Argon2id-Hash, CSRF-geschützt, Rate-Limited (5/15min) |
| `GET /register` | Dark-Theme Registrierungsformular (serverseitig gerendert) |
| `/register-success` | Bestätigungsseite nach erfolgreicher Registrierung |
| `/` | Landing-Page (index.html) |
| CSRF-Schutz | Double-Submit Cookie Pattern, Single-Use Tokens, 30min TTL |

**Aktuell:** Keine Email-Verifikation nötig – `email_verified=TRUE` sofort.
Migration `002_email_verification.sql` liegt bereit für später.

---

## Deployment-Schritte auf dem Server

```bash
# 1. Auf dem Server einloggen
ssh root@insolution.cloud

# 2. Neuen Code pullen
cd /opt/cloader/backend
git pull origin main

# 3. Dependencies installieren & build
npm install
npm run build

# 4. Migration (optional – erstmal nicht nötig, da email_verified=TRUE)
# npm run migrate

# 5. Service neustarten
systemctl restart auth-api
systemctl status auth-api

# 6. Caddy-Konfiguration aktualisieren
cp /opt/cloader/deploy/Caddyfile /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl reload caddy

# 7. Testen
curl -s https://insolution.cloud/ | head -5
curl -s https://insolution.cloud/register | head -5
curl -s https://api.insolution.cloud/health
```

---

## Test-API-Aufruf

```bash
# Erfolgreiche Registrierung
curl -X POST https://api.insolution.cloud/api/register \
  -H "Content-Type: application/json" \
  -H "Cookie: csrf_token=TESTTOKEN" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPass123!",
    "csrf_token": "TESTTOKEN"
  }'

# → 201 { "message": "Account created successfully! ..." }

# Duplikat
curl -X POST https://api.insolution.cloud/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"TestPass123!","csrf_token":"x"}'

# → 409 { "error": "A user with that username or email already exists" }
```

---

## Nächste Ausbauschritte

- [ ] Email-Verifikation via SMTP (Resend/Mailgun)
- [ ] "Passwort vergessen"-Flow
- [ ] Web-Login für Account-Einstellungen
- [ ] 2FA-Setup über Web-UI

---

## Offene Punkte

- **CORS:** Der CSRF-Endpoint setzt Cookies mit `secure:true, sameSite:strict`.
  Da Browser-Cookies nur bei HTTPS gesendet werden, ist das sicher – aber
  der `Authorization`-Header wird für die Windows-Client-Auth weiterhin
  separat gehandhabt.
- **Build-Script:** Die `public/`-Dateien werden per `cpSync` nach `dist/`
  kopiert – das `tsc`-Kompilieren allein reicht nicht.
