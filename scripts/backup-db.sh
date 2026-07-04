#!/usr/bin/env bash
# Nightly backup of data/app.db (PLAN.md §7): dated copy, keep the 14 newest.
# Uses sqlite3's online .backup so a copy taken while the app writes (WAL mode)
# is still consistent. Safe to run on the host while the container is up.
set -euo pipefail

cd "$(dirname "$0")/.."

DB="data/app.db"
BACKUP_DIR="data/backups"
STAMP="$(date +%Y-%m-%d)"
TARGET="${BACKUP_DIR}/app-${STAMP}.db"

if [[ ! -f "$DB" ]]; then
  echo "backup: $DB not found, nothing to do" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" ".backup '${TARGET}'"
# The backup inherits WAL mode and leaves -wal/-shm sidecars; fold everything
# into the single .db file so a backup is always exactly one file.
sqlite3 "$TARGET" 'PRAGMA journal_mode=DELETE;' > /dev/null
rm -f "${TARGET}-wal" "${TARGET}-shm"
echo "backup: wrote ${TARGET} ($(du -h "$TARGET" | cut -f1))"

# Keep the 14 most recent backups (count-based, so gaps in the schedule never
# silently shrink the retention window).
ls -1t "$BACKUP_DIR"/app-*.db 2>/dev/null | tail -n +15 | while read -r old; do
  rm -- "$old"
  echo "backup: pruned ${old}"
done
