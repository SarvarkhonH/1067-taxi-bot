#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 1067/BirJoy — serverda yangi kodni chiqarish (VPS ichida yuradi).
# GitHub Actions CI yashil bo'lgach SSH orqali shu skriptni chaqiradi;
# qo'lda ham yurgizsa bo'ladi: bash /opt/app/deploy/deploy.sh
#
# 2026-08-16 audit o'zgarishlari:
#  1. FRONTEND CI'da quriladi (GitHub runner) va tayyor dist $PREBUILT_DIST ga
#     scp qilinadi — VPS'da og'ir Vite build YO'Q (swapsiz box'da OOM xavfi edi).
#     $PREBUILT_DIST bo'lmasa (qo'lda deploy) VPS'da build fallback bor.
#  2. ROLLBACK: yangi kod sog'lom ko'tarilmasa AVVALGI commit'ga avto-qaytadi.
#     Frontend faqat server SOG'LOM bo'lgach yangilanadi — muvaffaqiyatsiz deploy
#     server+frontend'ni eski, ishlaydigan holatda qoldiradi.
#  3. Health SOBIT sleep emas, ~30s poll — sekin cold-start yolg'on-fail bermaydi.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd /opt/app || exit 1

BOT_TOKEN=$(grep '^BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
ADMIN_ID=$(grep '^ADMIN_TELEGRAM_IDS=' .env | cut -d= -f2- | tr -d '"' | cut -d, -f1)
alert() {
  if [ -n "${BOT_TOKEN:-}" ] && [ -n "${ADMIN_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d chat_id="$ADMIN_ID" --data-urlencode text="$1" >/dev/null || true
  fi
}

# health'ni ~30s gacha poll qiladi (bot active + /health 200). Sobit sleep emas.
wait_health() {
  for _ in $(seq 1 15); do
    if systemctl is-active --quiet bot1067 && curl -sf -m 5 http://localhost:8080/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restart_from_tree() {
  pnpm install --frozen-lockfile || return 1
  pnpm --filter @t1067/server exec prisma generate || return 1
  systemctl restart bot1067
  wait_health
}

PREV=$(git rev-parse HEAD)   # rollback nishoni = hozir ISHLAYOTGAN versiya
echo "══ git pull (avvalgi ishlaydigan: ${PREV:0:8})"
git fetch origin main || { alert "🛑 BirJoy deploy: git fetch yiqildi — bot eski kodda qoldi."; exit 1; }
git reset --hard origin/main
NEW=$(git rev-parse HEAD)

echo "══ install + prisma generate + restart (${NEW:0:8})"
if restart_from_tree; then
  echo "✅ server sog'lom (${NEW:0:8})"
else
  echo "❌ yangi kod sog'lom ko'tarilmadi — ${PREV:0:8} ga QAYTAMIZ"
  journalctl -u bot1067 -n 30 --no-pager
  git reset --hard "$PREV"
  if restart_from_tree; then
    echo "↩️  rollback muvaffaqiyatli: ${PREV:0:8}"
    alert "↩️ BirJoy deploy YIQILDI (${NEW:0:8}) — avvalgi ${PREV:0:8} ga qaytdim, bot SOG'LOM. Frontend tegilmadi (eski holicha)."
  else
    echo "🛑 ROLLBACK HAM YIQILDI — qo'lda aralashuv shart"
    alert "🛑 BirJoy deploy VA rollback YIQILDI (${NEW:0:8}→${PREV:0:8}) — bot NOSOZ, DARHOL qo'lda tekshiring!"
  fi
  exit 1
fi

# ── frontend faqat server SOG'LOM bo'lgach yangilanadi (rollback bu yergacha yetmaydi) ──
echo "══ frontend → /var/www"
if [ -n "${PREBUILT_DIST:-}" ] && [ -f "$PREBUILT_DIST/miniapp/index.html" ] && [ -f "$PREBUILT_DIST/admin/index.html" ]; then
  echo "   CI'da qurilgan dist ishlatiladi ($PREBUILT_DIST)"
  MP="$PREBUILT_DIST/miniapp"; AD="$PREBUILT_DIST/admin"
else
  echo "   tayyor dist yo'q — VPS'da build (qo'lda deploy fallback)"
  API_URL="$(grep '^PUBLIC_API_URL' .env | cut -d= -f2- | tr -d '"')"
  VITE_API_URL="$API_URL" pnpm --filter @t1067/miniapp build || { alert "⚠️ BirJoy: miniapp build yiqildi — server yangi (${NEW:0:8}), frontend eski."; exit 1; }
  VITE_API_URL="$API_URL" pnpm --filter @t1067/admin build   || { alert "⚠️ BirJoy: admin build yiqildi — server yangi (${NEW:0:8}), frontend eski."; exit 1; }
  MP=packages/miniapp/dist; AD=packages/admin/dist
fi
# ⚠️ TARTIB MUHIM (2026-07-28): AVVAL /assets, KEYIN index.html. rsync atomik emas — index.html
# oldin ko'chsa, o'sha lahzada ochgan mijoz yangi index.html oladi-yu chunk hali yo'q → 404.
# --delete YO'Q: ochiq turgan eski mijoz hali eski chunk'larni so'raydi; 7 kundan eskisi tozalanadi.
rsync -a "$MP/assets/" /var/www/miniapp/assets/
rsync -a "$AD/assets/" /var/www/admin/assets/
rsync -a "$MP/" /var/www/miniapp/
rsync -a "$AD/" /var/www/admin/
find /var/www/miniapp/assets /var/www/admin/assets -type f -mtime +7 -delete 2>/dev/null || true

echo "$NEW" > /opt/app/.last-good-sha
echo ""
echo "✅ deploy tayyor: ${NEW:0:8}"
