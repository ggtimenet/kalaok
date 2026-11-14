# KalaOK — Linux / Coolify deployment

This is a **new, intentionally minimal and safe deployment scaffold**, not a direct upload or successful port of the 2020 legacy system.

## What is deployed

- A responsive, static **migration preview** served by Nginx on port `8080`.
- A `/healthz` endpoint for Docker / Coolify health monitoring.
- No database connection, credentials, user accounts, legacy videos or original program binaries.
- Frontend UI explicitly labels unimplemented song-search and queue features.

## Original source (kept offline, NOT uploaded)

Source location on the authorized Mac: `/Volumes/1T/Case/GPKTV/KTV原始檔`.

The original source includes an ASP.NET **.NET Framework 4.7.2** Web API (Web API 2 / Entity Framework 6), several .NET Framework Windows console utilities, a static frontend, a legacy SQL Server SQL script and an approximately 973 MB SQL Server backup (`data20240326`). These do not run together unchanged on Linux containers.

Do not publish the old `.config`, JS auth values, SQL backup, copyrighted artwork, vendor binaries or any user/customer data. **A Basic authorization value was hardcoded in the legacy browser-side JS and must be revoked / replaced before any production release.**

## Local preview

```bash
docker build -t kalaok-preview:local .
docker run --rm -p 127.0.0.1:18080:8080 kalaok-preview:local
curl -fsS http://127.0.0.1:18080/healthz
```

## Coolify deployment

- Source: public Git repository `https://github.com/ggtimenet/kalaok`
- Branch: `main`
- Build pack: **Dockerfile**, path `/Dockerfile`
- Exposed port: `8080`
- Set the app to **noindex**; prefer an isolated temporary hostname and optional access controls.
- Do not mark song requests, login, or payment features production-ready.

See [docs/MIGRATION.md](docs/MIGRATION.md) for architecture and migration roadmap.
