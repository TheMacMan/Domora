#!/usr/bin/env bash
# Nächtliche Datensicherung von Domora (Cron, 02:15) — siehe RESTORE.md
#
# Sichert verschlüsselt (restic) auf die NAS-Freigabe /mnt/domora-backup (von dort nach OneDrive):
#   - konsistenten Datenbank-Snapshot (sqlite3 .backup, auch bei laufendem Dienst)
#   - alle Dokumente (data/uploads)
#   - .env.local und die Service-Unit
# Schreibt data/backup-status.json (Dashboard-Warnung bei Fehler / Alter > 2 Tage).
# Am 1. des Monats zusätzlich: Stichprobenprüfung des Repositorys + Test-Wiederherstellung der DB.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/mnt/domora-backup/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-$HOME/.config/domora/restic.pass}"
STAGE="$HOME/.cache/domora-backup"
STATUS="$APP_DIR/data/backup-status.json"
STARTED="$(date -Iseconds)"

write_status() { # ok message [snapshot] [bytes] [checked]
  local tmp="$STATUS.tmp"
  printf '{"ok":%s,"startedAt":"%s","finishedAt":"%s","message":"%s","snapshot":"%s","bytes":%s,"repository":"%s","verifiedAt":%s}\n' \
    "$1" "$STARTED" "$(date -Iseconds)" "$2" "${3:-}" "${4:-0}" "$RESTIC_REPOSITORY" "${5:-null}" > "$tmp"
  mv "$tmp" "$STATUS"
}

fail() { write_status false "$1"; echo "FEHLER: $1" >&2; exit 1; }
trap 'fail "Abbruch in Zeile $LINENO"' ERR

cd "$APP_DIR"
# Automount auslösen und prüfen, dass wirklich die NAS-Freigabe eingehängt ist
ls /mnt/domora-backup >/dev/null 2>&1 || fail "NAS-Freigabe nicht erreichbar"
mountpoint -q /mnt/domora-backup || fail "NAS-Freigabe nicht eingehängt"
[ -f "$RESTIC_PASSWORD_FILE" ] || fail "Schlüsseldatei fehlt"

# 1) Konsistenter DB-Snapshot
rm -rf "$STAGE" && mkdir -p "$STAGE" && chmod 700 "$STAGE"
sqlite3 data/db.sqlite ".backup '$STAGE/db.sqlite'"
[ "$(sqlite3 "$STAGE/db.sqlite" 'pragma integrity_check;')" = "ok" ] || fail "DB-Snapshot fehlerhaft"
cp .env.local "$STAGE/env.local"
cp /etc/systemd/system/miete.service "$STAGE/miete.service" 2>/dev/null || true

# 2) Sicherung (inkrementell, verschlüsselt)
OUT="$(restic backup --host domora --tag nightly --json --quiet "$STAGE" data/uploads | tail -1)"
SNAP="$(printf '%s' "$OUT" | sed -n 's/.*"snapshot_id":"\([0-9a-f]*\)".*/\1/p' | cut -c1-8)"
BYTES="$(printf '%s' "$OUT" | sed -n 's/.*"total_bytes_processed":\([0-9]*\).*/\1/p')"
[ -n "$SNAP" ] || fail "restic backup ohne Snapshot"

# 3) Aufbewahrung
restic forget --host domora --keep-daily 14 --keep-weekly 8 --keep-monthly 24 --keep-yearly 10 --prune --quiet

# 4) Monatlich: Prüfung + Test-Wiederherstellung
VERIFIED=null
if [ "$(date +%d)" = "01" ] || [ "${FORCE_VERIFY:-0}" = "1" ]; then
  restic check --read-data-subset=10% --quiet
  RT="$(mktemp -d)"
  restic restore latest --host domora --target "$RT" --include "$STAGE/db.sqlite" --quiet
  R="$RT$STAGE/db.sqlite"
  [ "$(sqlite3 "$R" 'pragma integrity_check;')" = "ok" ] || fail "Test-Wiederherstellung: DB fehlerhaft"
  [ "$(sqlite3 "$R" 'select count(*) from expenses;')" = "$(sqlite3 data/db.sqlite 'select count(*) from expenses;')" ] || fail "Test-Wiederherstellung: Datenstand weicht ab"
  rm -rf "$RT"
  VERIFIED="\"$(date -Iseconds)\""
fi

# 5) Eigene Sicherungen vor Datenänderungen nach 30 Tagen aufräumen (sind im Backup enthalten)
find data/backups -name '*.sqlite' -mtime +30 -delete 2>/dev/null || true

rm -rf "$STAGE"
trap - ERR
write_status true "Sicherung erfolgreich" "$SNAP" "${BYTES:-0}" "$VERIFIED"
echo "OK $SNAP $(date -Iseconds)"
