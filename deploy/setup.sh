#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 1067/BirJoy — Contabo VPS birinchi-sozlash skripti (Ubuntu 24.04)
# Idempotent: qayta yurgizish xavfsiz. Yurgizish (root sifatida):
#   bash setup.sh <DOMEN>        # masalan: bash setup.sh birjoy.uz
# Nima qiladi: paketlar, Node 20 + pnpm, Postgres 16 (localhost-only),
# Caddy, ufw (22/80/443), fail2ban, /opt/app klon-joyi, systemd unit.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
DOMEN="${1:?usage: bash setup.sh <domen> (masalan birjoy.uz)}"

echo "══ 1/8 Paketlar"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw fail2ban postgresql postgresql-contrib \
  debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "══ 2/8 Node 20 + pnpm (corepack)"
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@10.33.0 --activate
node -v && pnpm -v

echo "══ 3/8 Caddy (rasmiy repo)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "══ 4/8 Postgres: birjoy DB + lokal user (tashqariga YOPIQ — default listen localhost)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='birjoy'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE birjoy LOGIN PASSWORD '$(openssl rand -hex 24)';"
# parolni keyin .env'ga o'zimiz yozamiz — hozircha md5 auth localhost'da
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='birjoy'" | grep -q 1 || \
  sudo -u postgres createdb -O birjoy birjoy
systemctl enable --now postgresql

echo "══ 5/8 Firewall: faqat 22/80/443"
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
ufw status

echo "══ 6/8 fail2ban (SSH qo'pol-kuch himoyasi, default sozlama yetadi)"
systemctl enable --now fail2ban

echo "══ 7/8 Katalog tuzilmasi"
mkdir -p /opt/app /var/www/miniapp /var/www/admin /root/backups
chown -R www-data:www-data /var/www

echo "══ 8/8 systemd unit + Caddyfile (shablonlardan, DOMEN=$DOMEN)"
sed "s/DOMEN/$DOMEN/g" /opt/app/deploy/Caddyfile > /etc/caddy/Caddyfile 2>/dev/null \
  || echo "  (Caddyfile keyin: repo hali klon qilinmagan — migratsiya runbook 3-qadami)"
cp /opt/app/deploy/bot1067.service /etc/systemd/system/bot1067.service 2>/dev/null \
  || echo "  (unit keyin: repo hali klon qilinmagan)"
systemctl daemon-reload

echo "✅ Bazaviy sozlash tayyor. Keyingisi: MIGRATSIYA_RUNBOOK.md 3-qadam (repo klon + .env)."
