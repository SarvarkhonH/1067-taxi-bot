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

# Xatolarni YIG'AMIZ, darhol chiqmaymiz. Sabab (2026-08-16 saboq): avval har fail() `exit 1`
# qilardi — backup.ts yiqilganda skript rotatsiyaga YETMASDAN to'xtardi. Natijada 17 kun davomida
# eski zaxiralar tozalanmay yig'ildi (35 fayl / 487 MB, 14 kunlik siyosatga zid). Endi PG-dump ham,
# JSON snapshot ham, rotatsiya ham MUSTAQIL ishlaydi; alert oxirida bitta yig'ma xabar bilan ketadi.
ERRORS=""
note_fail() { echo "❌ $1"; ERRORS="${ERRORS:+$ERRORS; }$1"; }

echo "-- 1/3 pg_dump"
if pg_dump "$DB_URL" -Fc -f "$DIR/pg-$STAMP.dump"; then
  [ -s "$DIR/pg-$STAMP.dump" ] || note_fail "pg_dump bosh fayl qoldirdi"
else
  note_fail "pg_dump yiqildi"
fi

echo "-- 2/3 JSON snapshot (sxema-parity tekshiruvi bilan)"
if pnpm --filter @t1067/server exec tsx src/scripts/backup.ts; then
  # backup.ts repo ichidagi backups/ ga yozadi — eng yangisini /root/backups ga ko'chiramiz
  LATEST=$(ls -t /opt/app/backups/snapshot-*.json 2>/dev/null | head -1)
  [ -n "$LATEST" ] && mv "$LATEST" "$DIR/snapshot-$STAMP.json"
else
  note_fail "backup.ts yiqildi (ehtimol yangi jadval qoshilgan - backup.ts ni yangilang)"
fi
# repo ichida eskilarini yig'ilib qolishiga yo'l qo'ymaymiz (snapshot yozilgan bo'lsa ham, bo'lmasa ham)
rm -f /opt/app/backups/snapshot-*.json

# ── rotatsiya HAR DOIM ishlaydi (yuqoridagi qadamlar yiqilsa ham) ────────────
echo "-- 3/3 rotatsiya (${KEEP_DAYS} kundan eskisi ochiriladi)"
find "$DIR" -name 'pg-*.dump'       -mtime +$KEEP_DAYS -delete
find "$DIR" -name 'snapshot-*.json' -mtime +$KEEP_DAYS -delete

if [ -n "$ERRORS" ]; then
  if [ -n "${BOT_TOKEN:-}" ] && [ -n "${ADMIN_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d chat_id="$ADMIN_ID" \
      --data-urlencode text="🚨 BirJoy tungi zaxira: $ERRORS (server: 169.58.55.249). Rotatsiya baribir ishladi." >/dev/null
  fi
  exit 1
fi

PG_SIZE=$(du -h "$DIR/pg-$STAMP.dump" 2>/dev/null | cut -f1)
JS_SIZE=$(du -h "$DIR/snapshot-$STAMP.json" 2>/dev/null | cut -f1)
echo "✅ zaxira tayyor: pg=${PG_SIZE:-none} json=${JS_SIZE:-none} → $DIR"
