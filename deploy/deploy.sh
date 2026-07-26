#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 1067/BirJoy — serverda yangi kodni chiqarish (VPS ichida yuradi).
# GitHub Actions CI yashil bo'lgach SSH orqali shu skriptni chaqiradi;
# qo'lda ham yurgizsa bo'ladi: bash /opt/app/deploy/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd /opt/app

echo "══ git pull"
git fetch origin main
git reset --hard origin/main   # serverda lokal o'zgarish bo'lmaydi — repo faqat o'qish uchun

echo "══ install + prisma generate"
pnpm install --frozen-lockfile
pnpm --filter @t1067/server exec prisma generate

echo "══ frontend build (miniapp + admin) → /var/www"
API_URL="$(grep '^PUBLIC_API_URL' .env | cut -d= -f2- | tr -d '"')"
VITE_API_URL="$API_URL" pnpm --filter @t1067/miniapp build
VITE_API_URL="$API_URL" pnpm --filter @t1067/admin build
# --delete YO'Q (ataylab): Vite har build'da fayl nomiga yangi hash beradi va ilovasi OCHIQ
# turgan mijozning sahifasi hali ESKI nomlarni so'raydi (lazy-chunk: Do'kon, Restoran...).
# --delete ularni o'chirib yuborardi → mijoz deploy paytida "ilova sindi" holatiga tushardi.
# Endi eski fayllar joyida qoladi; 7 kundan oshganlari quyida tozalanadi (disk to'lmasin).
rsync -a packages/miniapp/dist/ /var/www/miniapp/
rsync -a packages/admin/dist/ /var/www/admin/
find /var/www/miniapp/assets /var/www/admin/assets -type f -mtime +7 -delete 2>/dev/null || true

echo "══ bot restart"
systemctl restart bot1067
sleep 5
systemctl is-active bot1067 || { echo "❌ bot ko'tarilmadi!"; journalctl -u bot1067 -n 30 --no-pager; exit 1; }

echo "══ health tekshiruv"
curl -sf http://localhost:8080/health || { echo "❌ health yiqildi"; exit 1; }
echo ""
echo "✅ deploy tayyor: $(git rev-parse --short HEAD)"
