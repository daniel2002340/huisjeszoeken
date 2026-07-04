#!/bin/bash
# Update the bare-metal (launchd) deployment on the Mac Mini (DEPLOY.md):
# pull, install, ensure the Playwright browser, build API + dashboard,
# restart the agent, show the log tail. Safe to run from any directory.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

LABEL="nl.huisjeszoeken.app"

echo "==> git pull"
git pull --ff-only

echo "==> pnpm install"
pnpm install --frozen-lockfile

# Needed by the Cloudflare-challenged sources (browser-fetch.ts); a no-op
# when the browser is already downloaded.
echo "==> playwright chromium"
pnpm exec playwright install chromium

echo "==> build API + dashboard"
pnpm build
pnpm web:build

echo "==> restart $LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

sleep 3
echo "==> last log lines (data/app.log)"
tail -n 15 data/app.log
