#!/bin/bash
# ─── The way back ─────────────────────────────────────────────────────────────
#
# KAS_MODE=live is the only way out of a cutover, and the boot guard refuses the
# switch partly because "nobody has walked it". This is the walk, written down.
#
# It exists because of when it would be used: not calmly, but at the moment
# orders are failing and somebody has to undo a change under pressure. Four
# remembered steps at 3am is how a rollback becomes a second outage — a typo in
# .env and the bot does not come back at all.
#
# Default is a DRY RUN: it prints the exact diff and changes nothing. Pass --go
# to apply and restart.
#
#   bash /opt/app/deploy/rollback-to-kas.sh        # show me what would change
#   bash /opt/app/deploy/rollback-to-kas.sh --go   # do it
#
# Safe to run when already on kas: it says so and exits without touching a
# thing, which is also what makes it rehearsable.

set -euo pipefail

# Overridable so the script itself can be tested without a live .env — a
# rollback script nobody has run is not a rollback plan.
ENV=${ENV_FILE:-/opt/app/.env}
GO=0
[ "${1:-}" = "--go" ] && GO=1

[ -f "$ENV" ] || { echo "✗ $ENV topilmadi"; exit 1; }

CUR=$(grep -E '^KAS_MODE=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "\r")
# NB: no apostrophe inside ${...} — bash starts a quote context there and the
# whole file stops parsing. Caught by running this script, not by reading it.
echo "hozirgi KAS_MODE : ${CUR:-YOQ}"

if [ "$CUR" = "live" ]; then
  echo "✓ allaqachon kas1067 da — qaytadigan joy yo'q."
  echo "  (KAS_BIRJOY_FORCE ham tekshirildi: $(grep -cE '^KAS_BIRJOY_FORCE=' "$ENV" || true) satr)"
  exit 0
fi

# Build the new file beside the old one, so a failure here cannot leave a
# half-written .env behind — the bot reads this file on every boot.
NEW=$(mktemp)
grep -v -E '^KAS_MODE=|^KAS_BIRJOY_FORCE=' "$ENV" > "$NEW" || true
{
  echo 'KAS_MODE="live"'
  echo '# KAS_BIRJOY_FORCE olib tashlandi — qorovul yana yopiq.'
} >> "$NEW"

echo
echo "─── o'zgarish ──────────────────────────────────────────────"
diff <(grep -E '^KAS_' "$ENV" | sort) <(grep -E '^KAS_' "$NEW" | sort) || true
echo "────────────────────────────────────────────────────────────"

if [ "$GO" != "1" ]; then
  echo
  echo "QURUQ YURGIZISH — hech narsa o'zgartirilmadi."
  echo "Bajarish uchun: bash $0 --go"
  rm -f "$NEW"
  exit 0
fi

BAK="$ENV.bak.rollback.$(date +%Y%m%d-%H%M%S)"
cp "$ENV" "$BAK"
cat "$NEW" > "$ENV"
chmod 600 "$ENV"
rm -f "$NEW"
echo "zaxira: $BAK"

systemctl restart bot1067

# The restart is not the finish line — the bot answering is. Without this the
# script reports success while the process is in a crash loop.
for i in $(seq 1 20); do
  sleep 2
  H=$(curl -s -m 5 https://api.birjoy.online/health || true)
  case "$H" in
    *'"ok":true'*)
      echo "✓ qaytdi ($((i * 2))s): $H"
      MODE=$(printf '%s' "$H" | grep -o '"mode":"[^"]*"' || true)
      [ "$MODE" = '"mode":"live"' ] || echo "⚠️  kutilgan mode=live emas: $MODE"
      exit 0
      ;;
  esac
done

echo "✗ 40 soniyada javob bermadi — journalctl -u bot1067 -n 50"
exit 1
