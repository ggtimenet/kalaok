# KalaOK — YouTube Karaoke Migration Preview

This is a **demo** running on https://kalaok.ggtime.net/. It is **not** a completed migration of the legacy 2020 ASP.NET KTV system.

## Features in this preview
- Three independent host-configured demo accounts; per-account queue and favorites.
- Eight real karaoke video references from existing YouTube uploads (metadata and video IDs only). No video or music is downloaded, proxied, ripped, or stored in this repository.
- Responsive song catalogue, language/category search, queue insertion, favorites.
- Official YouTube IFrame Player API, playback / pause controls, next-in-queue button, end-of-video advance when browser and video allow it.
- Direct **Open in YouTube** link as a fallback when embedding, regional rights, or autoplay is restricted.
- `/healthz` and server-side login with scrypt password hashes, signed Secure HttpOnly session cookie.

### Important content/rights limits
These videos remain on YouTube and belong to their uploaders/rightsholders; embedding and playback are subject to YouTube's terms, rights restrictions, geo restrictions, and each uploader's embed permissions. An embedded video being visible does **not** grant a separate commercial karaoke license. Test only with authorized videos as appropriate.

A YouTube player may fail to load or show an error; use the original YouTube link. Mobile browsers often require a fresh tap to start the next video. Media availability is not guaranteed.

## Deployment
- `Dockerfile` uses Node.js 22 Alpine, port 8080.
- Required environment variables: `KALAOK_DEMO_USERS_B64` (Base64 JSON test users, each `{username,displayName,salt,hash}`), `KALAOK_SESSION_SECRET` (random hex HMAC key), and `KALAOK_DATA_DIR=/data`.
- The public repo contains no test passwords, password hashes, real subscriber records, SQL database files, video or secret config.
- Running deployment: Docker Compose at `/opt/kalaok-preview`, on the existing host `srv1815868`.
- GitHub `main` checked via a systemd timer every 5 minutes, with image rebuild, health check and best-effort rollback; **this is not a GitHub Webhook or a registered Coolify Application**.
- Cloudflare DNS + Traefik HTTPS route are pre-existing deployment infrastructure and not stored in this repository.

## Legacy modernization
The original source, including .NET Framework Web API and SQL Server backup, remains offline on the authorized Mac at `/Volumes/1T/Case/GPKTV/KTV原始檔`. It is not uploaded here. See [docs/MIGRATION.md](docs/MIGRATION.md).

The demo does **not** yet implement the original real database, commercial karaoke licensing, live multiplayer synchronization, full account registration, payment processing, or cross-device TV control.

## Cross-device remote control

Same-account TV + phone control, playback state acknowledgements and test limitations are documented in [docs/CROSS_SCREEN.md](docs/CROSS_SCREEN.md).

## Embedded YouTube restrictions and local diagnostic playback

See [docs/PLAYBACK_TEST.md](docs/PLAYBACK_TEST.md). YouTube embed error 150 cannot be bypassed; a self-generated 10-second MP4 is provided for controlled two-screen playback testing.

## Mobile layout and YouTube sources (2026-11-14)

The mobile CSS was redesigned after a verified 475px intrinsic grid overflow on 320–430px viewports. It uses `minmax(0,1fr)`, intrinsic min-width corrections, and a two-row mobile song card so buttons remain readable. Mobile Chromium checks at 320/360/390/430 and tablet 768px show document width exactly equal to the viewport.

The original eight karaoke references are still **unverified for embedding** and may return YouTube errors 101/150. Metadata or oEmbed alone cannot establish permission to embed. This version adds a distinctly labeled **Google for Developers YouTube IFrame API official sample video** (`M7lc1UVf-VE`) as a separate *non-karaoke* diagnostic entry. The locally self-produced video remains the reliable playback test.

No third-party karaoke video has been independently proven embeddable; do not claim the 8 songs are licensed or certified. For an actual usable karaoke catalogue, request the uploader's permission or confirm YouTube Data API `status.embeddable` and on-device playback, then separately handle public/commercial music rights.

## Updated YouTube video test catalogue

The eight initial broken/unverified karaoke video links were replaced with identifiable traditional karaoke uploads from Lugn Karaoke. These remain **unverified for embedding** until a real-device test confirms availability. See [docs/YOUTUBE_REPLACEMENT.md](docs/YOUTUBE_REPLACEMENT.md) for source URLs, test scope and rights limitations.
