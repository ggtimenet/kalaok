# KalaOK — Interactive Migration Demo

This **testing-only** app provides functional demo login, song search, personal queue and favorites on [kalaok.ggtime.net](https://kalaok.ggtime.net/). It is **not** the restored 2020 legacy KTV service.

## What is implemented

- 3 host-configured testing accounts with individual seeded queues and favorites.
- 20 fictional song records, searchable by title, artist and language.
- Add/remove queue items, toggle favorites, logout, persistent JSON state.
- Server-side password validation using scrypt hashes; HMAC-signed, HttpOnly, Secure, SameSite cookies.
- Node.js HTTP server with built-in dependencies only; health endpoint `/healthz`.
- Production preview routes through Cloudflare and the existing Traefik proxy.
- No real video, audio, payments, signups, original song library, old API, legacy DB or user data.

**Security:** Credentials and signing secret are generated on the authorized host and stored in `/opt/kalaok-preview/.env`, **never** in Git. Do not put password hashes or the `TEST-ACCOUNTS.txt` file in the public repository. The actual test passwords are provided privately to the tester. Accounts carry no production permissions.

## Deployment

This source uses the root `Dockerfile` (Node 22 Alpine, port `8080`) and requires:

- `KALAOK_DEMO_USERS_B64`: Base64-encoded JSON array of user objects `{ username, displayName, salt, hash }`. Each hash is 32-byte scrypt `N=16384,r=8,p=1` hex.
- `KALAOK_SESSION_SECRET`: Random hex string of at least 32 bytes.
- `KALAOK_DATA_DIR`: Writable persisted path (default `/data`).

The existing deployment uses Docker Compose in `/opt/kalaok-preview`. A systemd timer checks GitHub `main` every five minutes, rebuilds the service on changes and attempts rollback if the container fails its health check. This is **polling, not a GitHub webhook**, and the deployment is **not registered as a Coolify Application**.

A local test may set `COOKIE_SECURE=false` for HTTP-only smoke tests. Leave the variable unset when serving the site publicly on HTTPS.

## Legacy modernization

The real 2020 legacy source remains offline at `/Volumes/1T/Case/GPKTV/KTV原始檔` on the authorized Mac. It contains old ASP.NET/.NET Framework applications and a SQL Server backup that are **not** published here. See [docs/MIGRATION.md](docs/MIGRATION.md).

Do not copy old credentials, SQL backups, personal records, copyrighted music, third-party binary assets or production keys into this repository.
