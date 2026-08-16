#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 1067/BirJoy — tungi baza zaxirasi (VPS ichida cron orqali).
#
# NEGA GitHub Actions EMAS: migratsiyadan keyin Postgres faqat localhost'da
# tinglaydi (5432 tashqariga YOPIQ — ataylab). Demak GH runner bazaga yeta
# olmaydi va backup.yml "Dump all tables" qadamida yiqiladi. Zaxira endi shu
# yerda, serverning o'zida olinadi.
#
# Uch qatlam:
#   1. pg_dump (custom format) — Postgres'ning o'z tiklash yo'li, eng ishonchli
#   2. backup.ts JSON snapshot — sxemadan xabardor, restore.ts bilan tiklanadi
#      (98/98 jadval parity tekshiruvi bilan — yangi jadval unutilsa YIQILADI)
#   3. OFFSITE — 1+2 ni bitta arxivga yig'ib AES-256 bilan SHIFRLAB Telegram'ga jo'natadi.
#      Sabab: 1-2 shu serverning O'ZIDA turibdi; server yo'qolsa ular ham ketadi. Shifr —
#      zaxirada haydovchi kalitlari/a'zo ma'lumoti bor, ochiq jo'natish xavfli. Kalit
#      /root/.backup_passphrase da; EGA nusxasini parol menejerida saqlaydi (server
#      yo'qolsa ochishning YAGONA yo'li). Ochish: openssl enc -d -aes-256-cbc -pbkdf2
#      -iter 200000 -pass file:<kalit> -in <fayl>.enc | tar -xzf -
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

echo "-- 1/4 pg_dump"
if pg_dump "$DB_URL" -Fc -f "$DIR/pg-$STAMP.dump"; then
  [ -s "$DIR/pg-$STAMP.dump" ] || note_fail "pg_dump bosh fayl qoldirdi"
else
  note_fail "pg_dump yiqildi"
fi

echo "-- 2/4 JSON snapshot (sxema-parity tekshiruvi bilan)"
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
echo "-- 3/4 rotatsiya (${KEEP_DAYS} kundan eskisi ochiriladi)"
find "$DIR" -name 'pg-*.dump'       -mtime +$KEEP_DAYS -delete
find "$DIR" -name 'snapshot-*.json' -mtime +$KEEP_DAYS -delete

# ── OFFSITE: shifrlangan nusxa Telegram'ga ──────────────────────────────────
# Bugungi dump+snapshot bitta tar.gz ga yig'iladi, AES-256 (PBKDF2, 200k iter) bilan
# shifrlanadi va sendDocument bilan jo'natiladi. Bot ~50MB/fayl chegarasi bor: bundle
# 45MB'dan oshsa JSON snapshot tashlanadi (faqat pg-dump — asosiy tiklash yo'li);
# 49MB'dan ham oshsa alert (R2/Drive'ga o'tish signali). Nishon: .env'dagi
# BACKUP_TG_CHAT (maxfiy kanal ID) bo'lsa o'sha, bo'lmasa ega DM (ADMIN_ID).
echo "-- 4/4 offsite (shifrlangan → Telegram)"
PASS_FILE=/root/.backup_passphrase
OFFSITE_CHAT=$(grep '^BACKUP_TG_CHAT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')
OFFSITE_CHAT="${OFFSITE_CHAT:-$ADMIN_ID}"
if [ ! -s "$PASS_FILE" ]; then
  note_fail "offsite: $PASS_FILE yo'q — shifrlash kaliti sozlanmagan"
elif [ -z "${BOT_TOKEN:-}" ] || [ -z "$OFFSITE_CHAT" ]; then
  note_fail "offsite: BOT_TOKEN yoki chat_id yo'q"
else
  OFF_FILES=()
  [ -f "$DIR/pg-$STAMP.dump" ]       && OFF_FILES+=("pg-$STAMP.dump")
  [ -f "$DIR/snapshot-$STAMP.json" ] && OFF_FILES+=("snapshot-$STAMP.json")
  if [ ${#OFF_FILES[@]} -eq 0 ]; then
    note_fail "offsite: jo'natishga fayl yo'q (dump va snapshot ikkalasi ham yiqilgan)"
  else
    BUNDLE="/tmp/birjoy-offsite-$STAMP.tar.gz.enc"
    tar -czf - -C "$DIR" "${OFF_FILES[@]}" \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:"$PASS_FILE" -out "$BUNDLE"
    SZ=$(du -m "$BUNDLE" 2>/dev/null | cut -f1)
    # 45MB'dan oshsa: JSON tashlab faqat pg-dump'ni qayta shifrlaymiz
    if [ "${SZ:-0}" -ge 45 ] && [ -f "$DIR/pg-$STAMP.dump" ]; then
      echo "   bundle ${SZ}MB — katta, faqat pg-dump jo'natiladi"
      tar -czf - -C "$DIR" "pg-$STAMP.dump" \
        | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:"$PASS_FILE" -out "$BUNDLE"
      SZ=$(du -m "$BUNDLE" 2>/dev/null | cut -f1)
    fi
    if [ "${SZ:-0}" -ge 49 ]; then
      note_fail "offsite: ${SZ}MB Telegram 50MB chegarasidan oshdi — R2/Drive'ga o'tish vaqti"
    else
      HTTP=$(curl -s -o /tmp/tg_offsite.json -w '%{http_code}' \
        -F chat_id="$OFFSITE_CHAT" \
        -F document=@"$BUNDLE" \
        -F caption="🔐 BirJoy offsite zaxira $STAMP (shifrlangan, ${SZ}MB)" \
        "https://api.telegram.org/bot$BOT_TOKEN/sendDocument")
      if [ "$HTTP" = "200" ]; then
        echo "   ✅ offsite ketdi (${SZ}MB → chat $OFFSITE_CHAT)"
      else
        note_fail "offsite Telegram yiqildi (HTTP $HTTP)"
      fi
    fi
    rm -f "$BUNDLE" /tmp/tg_offsite.json
  fi
fi

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
