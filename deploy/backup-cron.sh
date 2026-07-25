#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 1067/BirJoy — tungi baza zaxirasi (VPS ichida cron orqali).
#
# NEGA GitHub Actions EMAS: migratsiyadan keyin Postgres faqat localhost'da
# tinglaydi (5432 tashqariga YOPIQ — ataylab). Demak GH runner bazaga yeta
# olmaydi va backup.yml "Dump all tables" qadamida yiqiladi. Zaxira endi shu
# yerda, serverning o'zida olinadi.
#
# Ikki qatlam:
#   1. pg_dump (custom format) — Postgres'ning o'z tiklash yo'li, eng ishonchli
#   2. backup.ts JSON snapshot — sxemadan xabardor, restore.ts bilan tiklanadi
#      (109/109 jadval parity tekshiruvi bilan — yangi jadval unutilsa YIQILADI)
#
# Saqlash: /root/backups, 14 kunlik rotatsiya. Yiqilsa egaga Telegram alert.
# Cron: 0 22 * * *  (UTC 22:00 = Toshkent 03:00)
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

DIR=/root/backups
KEEP_DAYS=14
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
mkdir -p "$DIR"

cd /opt/app || exit 1
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
BOT_TOKEN=$(grep '^BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
ADMIN_ID=$(grep '^ADMIN_TELEGRAM_IDS=' .env | cut -d= -f2- | tr -d '"' | cut -d, -f1)

fail() {
  echo "❌ $1"
  if [ -n "${BOT_TOKEN:-}" ] && [ -n "${ADMIN_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d chat_id="$ADMIN_ID" \
      --data-urlencode text="🚨 BirJoy tungi zaxira YIQILDI: $1 (server: 169.58.55.249)" >/dev/null
  fi
  exit 1
}

echo "-- 1/2 pg_dump"
pg_dump "$DB_URL" -Fc -f "$DIR/pg-$STAMP.dump" || fail "pg_dump yiqildi"
[ -s "$DIR/pg-$STAMP.dump" ] || fail "pg_dump bosh fayl qoldirdi"

echo "-- 2/2 JSON snapshot (sxema-parity tekshiruvi bilan)"
pnpm --filter @t1067/server exec tsx src/scripts/backup.ts \
  || fail "backup.ts yiqildi (ehtimol yangi jadval qoshilgan - backup.ts ni yangilang)"
# backup.ts repo ichidagi backups/ ga yozadi — eng yangisini /root/backups ga ko'chiramiz
LATEST=$(ls -t /opt/app/backups/snapshot-*.json 2>/dev/null | head -1)
[ -n "$LATEST" ] && mv "$LATEST" "$DIR/snapshot-$STAMP.json"
# repo ichida eskilarini yig'ilib qolishiga yo'l qo'ymaymiz
rm -f /opt/app/backups/snapshot-*.json

echo "-- rotatsiya (${KEEP_DAYS} kundan eskisi ochiriladi)"
find "$DIR" -name 'pg-*.dump' -mtime +$KEEP_DAYS -delete
find "$DIR" -name 'snapshot-*.json' -mtime +$KEEP_DAYS -delete

PG_SIZE=$(du -h "$DIR/pg-$STAMP.dump" | cut -f1)
JS_SIZE=$(du -h "$DIR/snapshot-$STAMP.json" 2>/dev/null | cut -f1)
echo "✅ zaxira tayyor: pg=$PG_SIZE json=${JS_SIZE:-none} → $DIR"
