# AETHER — insolution.cloud

Secure authentication infrastructure with forum, store, loader, and admin panel.

## Architecture

```
insolution.cloud          → Express (Port 3000) → Landing, Register, Forum, Store, Loader, Profile
api.insolution.cloud      → Express (Port 3000) → REST API (auth, forum, admin, etc.)
PostgreSQL                → cloader DB          → users, forum, permissions, notifications, etc.
Caddy                     → Reverse Proxy        → TLS (Let's Encrypt), Security Headers, Gzip
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20, Express 4, TypeScript 5 |
| **Database** | PostgreSQL 16 with pgcrypto, Full-Text Search (tsvector) |
| **Auth** | Argon2id (19 MiB), JWT RS256, Refresh Token Rotation, TOTP 2FA |
| **Frontend** | Vanilla JS, EJS (legacy), Static HTML (new design) |
| **Proxy** | Caddy 2 with automatic Let's Encrypt TLS |
| **Design** | CRT aesthetic — dark theme, scanlines, grid overlay, cyan/purple accents |

## Pages

| Path | Description | Auth |
|------|-------------|------|
| `/` | Landing page | - |
| `/register` | Create account (CSRF-protected) | - |
| `/forum` | Discussion board with thread listing, filters, search | Optional |
| `/forum/t/:slug` | Thread detail with posts, reactions, replies | Optional |
| `/store` | Product store with game selection, pricing tiers | - |
| `/loader` | Module loader with animated boot sequence | - |
| `/profile` | User profile with stats, activity, badges | JWT |
| `/profile/:username` | Public user profile | Optional |
| `/notifications` | Notification center | JWT |
| `/conversations` | Private messages list | JWT |
| `/conversations/:id` | Private conversation detail | JWT |
| `/admin` | Admin dashboard (reports, groups, bans, mod-log) | Admin |
| `/health` | API health check | - |

## REST API

### Auth
```
POST /api/auth/login         — Login with username + password (+ optional TOTP)
POST /api/auth/refresh       — Rotate refresh token
POST /api/auth/logout        — Revoke refresh token
POST /api/register           — Create new account (CSRF-protected)
```

### Forum
```
GET    /api/forum/categories                 — List categories with thread counts
GET    /api/forum/threads/:slug              — List threads in category (paginated)
POST   /api/forum/threads                    — Create thread
POST   /api/forum/posts                     — Create post/reply
PUT    /api/forum/posts/:id                  — Edit own post
DELETE /api/forum/posts/:id                  — Delete post (owner or admin)
POST   /api/forum/posts/:id/reaction         — Toggle reaction (like/love/haha/wow/sad/angry)
POST   /api/forum/posts/:id/bookmark         — Toggle bookmark
POST   /api/forum/threads/:id/watch          — Toggle thread watch
GET    /api/forum/search?q=&type=posts       — Full-text search
```

### User
```
GET  /api/user/:id/profile    — Public profile
PUT  /api/user/profile        — Update own profile
GET  /api/user/:id/posts      — User's post history
GET  /api/user/:id/threads    — User's threads
```

### Notifications
```
GET  /api/notifications              — List notifications (paginated)
GET  /api/notifications/unread-count — Unread count
POST /api/notifications/:id/read     — Mark as read
POST /api/notifications/read-all     — Mark all as read
```

### Conversations (PM)
```
GET  /api/conversations                  — List conversations
POST /api/conversations                  — Create conversation
GET  /api/conversations/:id              — Get messages
POST /api/conversations/:id/reply        — Reply
POST /api/conversations/:id/leave        — Leave conversation
POST /api/conversations/:id/add          — Add recipients
```

### Admin
```
GET  /api/admin/stats                  — Dashboard stats
GET  /api/admin/groups                 — List groups
POST /api/admin/groups                 — Create group
GET  /api/admin/groups/:id/permissions  — Group permissions
PUT  /api/admin/groups/:id/permissions  — Set group permissions
GET  /api/admin/reports                — List reports
POST /api/admin/reports/:id/resolve    — Resolve report
GET  /api/admin/bans                   — Active bans
POST /api/admin/users/:id/ban          — Ban user
POST /api/admin/users/:id/unban        — Unban user
GET  /api/admin/mod-log                — Moderation log
```

## Database (PostgreSQL)

11 migrations covering:

| Migration | Tables |
|-----------|--------|
| 001 | users, refresh_tokens, login_attempts |
| 002 | email_verification_tokens |
| 003 | forum_categories, forum_threads, forum_posts |
| 004 | role column on users |
| 005 | forum_user_groups, permissions, group/category permissions |
| 006 | profile columns (signature, about, avatar, etc.) |
| 007 | forum_reactions (6 types, like/love/haha/wow/sad/angry) |
| 008 | forum_notifications |
| 009 | forum_conversations, messages, recipients |
| 010 | forum_reports, bans, warnings, mod_log, watches, bookmarks |
| 011 | Full-text search indexes (tsvector + triggers) |

## Deployment

```bash
# Server setup
ssh root@insolution.cloud
cd /opt/cloader/backend

# Update
git pull origin main
npm install
npm run build
node dist/scripts/migrate.js

# Restart
systemctl restart auth-api

# Caddy (if changed)
systemctl reload caddy
```

## Development

```bash
cd backend
npm run dev     # Hot-reload via tsx watch
npm run build   # TypeScript compile + assets copy
npm run migrate # Run database migrations
```

## Security Features

- **Argon2id** password hashing (19 MiB memory, 2 iterations, pepper)
- **RS256** asymmetric JWT signing (private/public key pair)
- **Refresh token rotation** with reuse detection (theft protection)
- **TOTP 2FA** via otplib, secrets encrypted with AES-256-GCM
- **Rate limiting** per endpoint (5-30 req/15min)
- **CSRF protection** via double-submit cookie pattern
- **XSS protection** via esc() on all user content
- **Helmet** security headers (HSTS, X-Content-Type-Options, X-Frame-Options)
- **CORS** whitelist for API origins
- **PostgreSQL** parameterized queries (no SQL injection)
- **Permission system** with 4 groups, 14 permissions, category overrides

## Windows Client

Native C++20 ImGui client with:
- TLS 1.3 enforced, certificate verification always on
- RAM-only token storage (no disk writes)
- Login + TOTP 2FA flow
- Registration URL integration
