# Deploying on the Mac Mini (PLAN.md §7)

Docker Compose deployment: one `app` container, `restart: unless-stopped`, SQLite in a
volume-mounted `./data`, dashboard reachable **only over the tailnet**.

> **⚠️ Known issue (observed 2026-07-02):** from inside the Linux container both sources
> answered 403 while the exact same code succeeded on the macOS host — Cloudflare scores
> the TLS handshake, and Node-on-Linux fingerprints differently than Node-on-macOS. We
> deliberately do not spoof fingerprints (PLAN.md §9). After the first `docker compose
> up`, check `docker compose logs app`: if every run fails with HTTP 403, deploy bare
> metal via launchd instead (see the last section) — same code, no container.

## Prerequisites

- Docker with Compose v2 (Docker Desktop or OrbStack — OrbStack is lighter and starts
  at login).
- Tailscale installed and logged in (already on the Mac Mini).
- The Mac Mini set to never sleep: System Settings → Energy → "Prevent automatic
  sleeping when the display is off", or `sudo pmset -a sleep 0`.

## One-time setup

```sh
git clone <repo-url> ~/huisjeszoeken
cd ~/huisjeszoeken

cp .env.example .env
```

Edit `.env`:

1. `TAILSCALE_IP` — the Mini's tailnet address: `tailscale ip -4` (e.g. `100.101.102.103`).
   The compose file publishes the app port on this interface **only**; it is never
   reachable via the LAN or the public internet. If you leave it empty, the port binds
   to `127.0.0.1` (this machine only) as a safe fallback.
2. SMTP settings — a dedicated Gmail address with an
   [app password](https://myaccount.google.com/apppasswords) (needs 2FA), or Resend.
3. `DASHBOARD_PASSWORD` — the password for the dashboard's built-in `admin` login.
   Friends log in with the username/password you set on their profile and only see
   their own matches.
4. Keep `DRY_RUN=true` for the first run; flip to `false` once the logged emails look right.

Then build and start:

```sh
docker compose up -d --build
```

Migrations run automatically at container startup. Create the search profiles
(edit `src/db/seed.ts` first, or insert via `sqlite3 data/app.db`):

```sh
docker compose exec app node dist/db/seed.js
```

## Verify

```sh
docker compose ps                        # healthy after ~15s
docker compose logs -f app               # scheduler lines + DRY_RUN emails
curl http://$(tailscale ip -4):3000/health   # from any device on the tailnet
```

When the DRY_RUN output looks right: set `DRY_RUN=false` in `.env`, then
`docker compose up -d` to recreate.

## Nightly backups (keep 14 days)

`scripts/backup-db.sh` writes a consistent dated copy to `data/backups/` via sqlite3's
online backup (WAL-safe while the app runs) and prunes to the 14 newest. Schedule it at
03:15 with cron:

```sh
crontab -e
# add:
15 3 * * * /Users/<you>/huisjeszoeken/scripts/backup-db.sh >> /Users/<you>/huisjeszoeken/data/backups/backup.log 2>&1
```

macOS note: `cron` works fine for this, but the job only runs while the Mini is awake —
hence the no-sleep setting above. Restore = stop the app, copy a backup over
`data/app.db` (and delete `app.db-wal`/`app.db-shm`), start again.

## Updating

```sh
cd ~/huisjeszoeken
git pull
docker compose up -d --build
```

## Troubleshooting

- **Container restarts immediately** — `docker compose logs app`. A zod config error
  means a missing/invalid `.env` value (e.g. `DRY_RUN=false` without SMTP creds).
- **better-sqlite3 install fails in the image** — the build relies on prebuilt binaries
  (present for linux amd64/arm64 on Node 22). If a future Node bump breaks this, add
  `python3 make g++` to the build stage.
- **403/429 in the logs** — expected occasionally; the scheduler backs off
  5 min → 30 min → 2 h automatically. Persistent blocks: raise the poll intervals in `.env`.
- **Port already in use** — change `PORT` in `.env`; compose maps the same value.

## Alternative without Docker (launchd)

Use this when the container gets 403'd (see the known issue at the top). Node 22 via
nvm or Homebrew, then:

```sh
cd ~/huisjeszoeken
corepack enable && pnpm install && pnpm build
node dist/db/seed.js   # once, after editing the profiles in src/db/seed.ts
```

Create `~/Library/LaunchAgents/nl.huisjeszoeken.app.plist` (adjust paths and the node
binary location — `which node`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>nl.huisjeszoeken.app</string>
  <key>WorkingDirectory</key><string>/Users/YOU/huisjeszoeken</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>dist/index.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DRY_RUN</key><string>true</string>
    <key>HOST</key><string>100.x.y.z</string><!-- tailscale ip -4: binds the API to the tailnet only -->
    <key>PORT</key><string>3000</string>
    <key>SMTP_HOST</key><string>smtp.gmail.com</string>
    <key>SMTP_PORT</key><string>587</string>
    <key>SMTP_USER</key><string>you@gmail.com</string>
    <key>SMTP_PASS</key><string>app-password</string>
    <key>DASHBOARD_PASSWORD</key><string>choose-an-admin-password</string>
  </dict>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/huisjeszoeken/data/app.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/huisjeszoeken/data/app.log</string>
</dict>
</plist>
```

```sh
launchctl load ~/Library/LaunchAgents/nl.huisjeszoeken.app.plist
tail -f data/app.log
```

Note the difference from Docker: here the app itself binds to the Tailscale IP
(`HOST=100.x.y.z`), because there is no container port mapping in between. Backups work
identically (same cron line). Update with `git pull && pnpm install && pnpm build &&
launchctl kickstart -k gui/$(id -u)/nl.huisjeszoeken.app`.
