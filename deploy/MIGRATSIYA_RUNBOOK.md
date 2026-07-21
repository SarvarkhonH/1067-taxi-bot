# CONTABO MIGRATSIYA RUNBOOK

Tartib qat'iy — har qadam oldingisiga tayanadi. Yulduzchali (*) qadamlarni ega qiladi,
qolganini Claude. Maqsad-vaqt: tayyorgarlik 1-2 soat, cutover (uzilish) 15-30 daqiqa.

## 0. OLDINDAN (*ega)
- [ ] Contabo Cloud VPS 4, EU region, Ubuntu 24.04 — IP + root parol qo'lda
- [ ] Domen sotib olingan
- [ ] DNS panelda 3 ta A-yozuv: `api.DOMEN`, `app.DOMEN`, `admin.DOMEN` → VPS IP
      (tarqalishi 5 daq - 2 soat; cutover'dan OLDIN qilinsin)

## 1. SERVER BAZASI
- [ ] `ssh root@IP` — kirish ishlaydi
- [ ] repo'dagi `deploy/setup.sh`ni serverga ko'chirish, `bash setup.sh <DOMEN>`
- [ ] SSH-kalit o'rnatish (`ssh-copy-id`), keyin `/etc/ssh/sshd_config`da
      `PasswordAuthentication no` + `systemctl restart ssh`
- [ ] Deploy-kalit: serverda `ssh-keygen` (bo'sh parol) → ochiq kalitni GitHub repo
      Settings→Deploy keys ga READ-ONLY qo'shish (*ega tasdiqlaydi)

## 2. ILOVA
- [ ] `git clone git@github.com:SarvarkhonH/1067-taxi-bot.git /opt/app`
- [ ] `/opt/app/.env` yaratish: Render'dagi env'lar asosida, FARQLAR:
      `DATABASE_URL=postgresql://birjoy:<parol>@localhost:5432/birjoy`
      `PUBLIC_API_URL=https://api.DOMEN`  `TELEGRAM_WEBAPP_URL=https://app.DOMEN`
      `PORT=8080`
- [ ] Caddyfile + bot1067.service o'rnatish (setup.sh 8-qadami qayta), `systemctl reload caddy`
- [ ] HTTPS isboti: `curl https://api.DOMEN` — sertifikat xatosisiz javob

## 3. SINOV (jonli botga TEGMAYMIZ)
⚠️ MUHIM: sinovda bot1067'ni REAL BOT_TOKEN bilan ishga tushirMANG — start webhook'ni
o'ziga tortib oladi va jonli bot o'ladi. Sinov .env'da BOT_TOKEN bo'sh tursin.
- [ ] Neon'dan sinov-dump: `pg_dump "<NEON_URL>" | sudo -u postgres psql birjoy`
- [ ] `sudo -u birjoy psql -c 'SELECT count(*) FROM "Member";'` — 3050±
- [ ] BOT_TOKEN'siz `systemctl start bot1067` → `curl localhost:8080/health` → 200
- [ ] `bash /opt/app/deploy/deploy.sh` — frontend build + /var/www to'ldirilishi
- [ ] `https://app.DOMEN` brauzerda ochiladi (miniapp), `https://admin.DOMEN` ham

## 4. CUTOVER (kechasi 02:00-03:00 Toshkent, past-trafik)
- [ ] Render'ni to'xtatish: suspend srv-d8mj9kkm0tmc73d72440 (yozuvlar to'xtaydi)
- [ ] YAKUNIY dump: local birjoy bazani tozalab, `pg_dump <NEON> | psql` qayta
- [ ] Satr-son solishtiruv: Neon vs local (Member, CoinTxn, FoodOrder...) — TENG bo'lsin
- [ ] `.env`ga real BOT_TOKEN qaytarish → `systemctl restart bot1067`
      → bot o'zi webhookni `https://api.DOMEN/tg/...`ga o'rnatadi (loglarda ko'rinadi)
- [ ] getWebhookInfo: url yangi, pending 0 ga tushadi
- [ ] *Ega real telefonda: botga /start, miniapp ochish, bitta buyurtma-oqim sinovi
- [ ] Bot menyu tugmasi yangi app.DOMEN'ni ochayotganini tekshirish

## 5. MIGRATSIYADAN KEYIN (o'sha kun)
- [ ] health.yml URL → `https://api.DOMEN/health`
- [ ] ci.yml deploy jobi → SSH-deploy (secrets: VPS_HOST, VPS_SSH_KEY) — Render API o'rniga
      `ssh root@VPS "bash /opt/app/deploy/deploy.sh"`
- [ ] Backup yangi sxema: GH Actions endi lokal DBga yeta olmaydi (5432 yopiq) —
      VPS cron: har kecha `pg_dump birjoy | gzip > /root/backups/...` + 14 kun rotatsiya
      + dump'ni GitHub'ga (release-asset, token bilan) yuklash = tashqi nusxa
- [ ] OPS_QOLLANMA.md'ga real IP/domen yozish
- [ ] Xotira/hujjatlar yangilash (STATUS.md, CLAUDE.md deploy bo'limi)

## 6. KUZATUV (2 hafta) — keyin eski uyni yopish
- [ ] Render suspend holicha qoladi (zaxira), Neon'ga TEGILMAYDI (asosiy zaxira)
- [ ] 2 hafta barqaror → Render servislarni delete, Vercel loyihalarni pause/delete,
      Neon'ni oxirgi dump olib arxivlash
- [ ] ROLLBACK REJASI (agar 1-kunda muammo): VPS bot'ni stop → Render resume →
      webhook o'zi qaytadi (Render start webhook set qiladi) → Neon'dagi data
      cutover'dan beri o'zgarmagan bo'ladi FAQAT hech kim yozmagan bo'lsa —
      shuning uchun rollback qarori cutover'dan keyin BIRINCHI SOATLARDA qilinadi.
