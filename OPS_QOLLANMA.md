# OPS QO'LLANMA — o'z serveringizni o'zingiz boshqarish

Maqsad: sysadmin'ga ish tushmasin. Bu hujjat 1067/BirJoy loyihasi uchun yozilgan —
umumiy nazariya emas, AYNAN bizning stack (Node bot + Postgres + Caddy + systemd).

---

## 1. CONTABO NIMA BERADI (va nima BERMAYDI)

VPS = Germaniyadagi data-markazda turgan, faqat sizniki bo'lgan "yalang'och kompyuter".

**Beradi:**
- CPU (4-6 yadro), RAM (8GB+), NVMe disk (~150GB), doimiy IP manzil
- Root huquq — istalgan narsani o'rnatasiz, hech kim aralashmaydi
- Veb-panel: serverni restart qilish, OSni qayta o'rnatish, parolni tiklash
- 24/7 ishlash — "uxlash" (Render free kabi) tushunchasi yo'q

**BERMAYDI (hammasi o'zimizda):**
- Deploy tizimi yo'q — biz GitHub Actions bilan quramiz (qurilgan, ko'chiriladi)
- HTTPS yo'q — Caddy o'zi hal qiladi (bir marta sozlanadi)
- Monitoring yo'q — bizning health.yml allaqachon bor, URLni almashtiramiz
- Backup yo'q (pullik qo'shimcha) — bizning backup.yml bor, u ham ko'chadi
- Support deyarli yo'q — lekin bizga ular kerak emas, server ichida hamma narsani o'zimiz qilamiz

**Narx eslatmalari:** oylik to'lovda bir martalik setup-to'lov bo'lishi mumkin;
to'lovni kechiktirmang — VPS o'chirilsa DATA HAM KETADI (shuning uchun backup tashqarida).

---

## 2. BIZNING ARXITEKTURA (bitta rasm)

```
Internet (mijozlar, Telegram)
        │ 443 (HTTPS)
        ▼
   ┌─── CADDY ───────────────────────────┐  ← darvozabon: HTTPS sertifikat avto
   │  app.DOMEN  → /var/www/miniapp      │  ← statik fayllar (Mini App build)
   │  admin.DOMEN→ /var/www/admin        │  ← statik fayllar (admin build)
   │  api.DOMEN  → localhost:8080        │  ← Node'ga uzatadi (reverse proxy)
   └─────────────────────────────────────┘
        │
        ▼
   NODE (bot + API) ← systemd boshqaradi: o'lsa 3 soniyada qayta ko'taradi
        │
        ▼
   POSTGRES (localhost:5432) ← faqat server ichidan, internetga OCHIQ EMAS
```

Uch xizmat, bitta server. Har birining "boshqaruvchisi" — systemd.

---

## 3. 10 TA BUYRUQ — ISHNING 85%I SHU

SSH bilan kirgach (`ssh root@SERVER_IP`), bilishingiz kerak bo'lganlar:

| # | Buyruq | Nima qiladi | Qachon |
|---|---|---|---|
| 1 | `systemctl status bot1067` | Bot tirikmi? qachondan beri? | Har shubhada — BIRINCHI buyruq |
| 2 | `journalctl -u bot1067 -n 100 -f` | Botning oxirgi 100 log qatori (+jonli oqim) | Xato sababini ko'rish |
| 3 | `systemctl restart bot1067` | Botni qayta ishga tushirish | Log ko'rib sabab tushunilgach |
| 4 | `df -h` | Disk qancha to'lgan | Haftada 1; 80%+ = tozalash |
| 5 | `free -h` | RAM holati | Sekinlik sezilsa |
| 6 | `htop` | Qaysi jarayon CPU/RAM yeyapti (q = chiqish) | Sekinlik sezilsa |
| 7 | `sudo -u postgres psql -d birjoy -c "SELECT count(*) FROM \"Member\";"` | Bazaga to'g'ridan savol | Data tekshirish |
| 8 | `systemctl status caddy` + `caddy validate` | Darvozabon tirikmi, config to'g'rimi | Sayt ochilmasa |
| 9 | `apt update && apt upgrade -y` | Xavfsizlik yangilanishlari | Oyda 1 |
| 10 | `ls -lh /root/backups/` | Backuplar kelyaptimi, sanasi yangimi | Haftada 1 — MUQADDAS odat |

Qoida: **hech qachon sababini bilmasdan restart qilmang** — avval №1 va №2, KEYIN №3.
Restart ko'p xatoni yashiradi, lekin kasallikni davolamaydi — ertaga qaytib keladi.

---

## 4. 5 TA TUSHUNCHA (bir marta tushunilsa yetadi)

1. **SSH-kalit** — parolning kuchli ukasi. Kompyuteringizda maxfiy kalit, serverda ochiq
   nusxasi. Parol bilan kirish O'CHIRILADI (butun internet parol terib ko'rishni to'xtatadi).
2. **systemd unit** — "bu dasturni doim yurgiz, o'lsa qayta ko'tar, loglarini yig'"
   degan 10 qatorli fayl (`/etc/systemd/system/bot1067.service`). Bot 24/7ligining siri shu.
3. **Reverse proxy (Caddy)** — bitta serverda 3 sayt: domen nomiga qarab Caddy trafikni
   kerakli joyga uzatadi va HTTPS sertifikatni O'ZI olib, O'ZI yangilab turadi.
4. **DNS A-yozuv** — domen sotib olgach, registrator panelida `api.DOMEN → SERVER_IP`
   qatori qo'shiladi. 3 ta subdomain = 3 ta A-yozuv. 5 daqiqalik ish.
5. **Firewall (ufw)** — faqat 22 (SSH), 80, 443 portlar ochiq. Postgres 5432 YOPIQ —
   baza faqat server ichidan ko'rinadi. Bu bilan hujum yuzasi 100× kichrayadi.

---

## 5. RITUALLAR (kalendar)

**Har kuni (0 daqiqa):** hech narsa. Monitoring o'zi qaraydi — bot yiqilsa Telegram'dan
signal keladi. Signal yo'q = hammasi joyida.

**Haftada 1 (5 daqiqa):**
```
ssh root@SERVER_IP
systemctl status bot1067 caddy postgresql   # uchchalasi ham "active (running)"mi
df -h                                        # disk < 80%mi
ls -lh /root/backups/ | tail -3              # eng yangi backup KECHAGI sanami
```

**Oyda 1 (10 daqiqa):**
```
apt update && apt upgrade -y                 # xavfsizlik yamoqlari
reboot                                       # (kerak bo'lsa) — systemd hammasini o'zi ko'taradi
```
Reboot'dan keyin 2 daqiqada bot o'z-o'zidan ishlashi shart — ishlamasa runbook §6.

**Choraklik (15 daqiqa):** backup'dan TIKLAB KO'RISH mashqi. Tiklanmagan backup —
backup emas, umid xolos. (Buni birinchi marta birga qilamiz.)

---

## 6. RUNBOOK — "hammasi yondi" stsenariylari

### A. Telegram'dan "HEALTH FAIL" signal keldi
```
ssh root@SERVER_IP
systemctl status bot1067        # active? failed?
journalctl -u bot1067 -n 100    # oxirgi xato nima deyapti
```
- `failed` + logda xato → xatoni o'qing (ko'pincha o'zi tushunarli), `systemctl restart bot1067`
- `active` lekin javob bermayapti → `systemctl restart bot1067`, keyin `journalctl -f` bilan kuzating
- Tushunarsiz bo'lsa → log matnini menga (Claude) ko'chirib tashlang — birga hal qilamiz

### B. SSH ham ulanmayapti (server o'lik)
1. Contabo veb-paneliga kiring → serverni ko'ring: yashilmi?
2. Panel orqali **Restart** bosing (bu "tokdan uzib qayta ulash")
3. 3 daqiqa kutib SSH urinib ko'ring; systemd hammasini o'zi ko'taradi
4. Hali ham yo'q → panelda "Rescue mode" bor, lekin bu bosqichda meni chaqiring

### C. Disk to'ldi (df -h 95%+)
```
du -sh /root/backups/* | tail   # eng katta nima
journalctl --vacuum-size=500M   # eski loglarni qisqartirish
```
Eski lokal backuplarni o'chiring (tashqi nusxalar GitHub artifactda baribir bor).

### D. Baza buzildi / data shubhali
HECH NARSANI O'CHIRMANG. Eng yangi backupni aniqlang (`ls /root/backups/`),
meni chaqiring — tiklashni birga qilamiz. Bu yagona "yolg'iz qilmang" stsenariysi.

### E. Yangi kod chiqarish (deploy)
Siz faqat `git push` qilasiz. CI tekshiradi → yashil bo'lsa server o'zi tortib oladi.
Qizil CI = prodga hech narsa tushmadi, bot eski holida ishlayveradi. GitHub Actions
sahifasida qaysi qadam qizilligini ko'rasiz — xato matnini menga tashlang.

---

## 7. XAVFSIZLIK — 4 QOIDA

1. SSH faqat kalit bilan (parol o'chiq) + `fail2ban` o'rnatilgan (buzishga urinishlarni bloklaydi)
2. Firewall: faqat 22/80/443. Postgres tashqariga YOPIQ
3. Secretlar (.env) FAQAT serverda va GitHub Secrets'da — hech qachon git ichida emas
4. Oyda 1 `apt upgrade` — yamalmagan server = ochiq eshik

---

## 8. MEN (Claude) vs SIZ — halol taqsimot

**Men qilaman (siz o'rganguningizcha va undan keyin ham):**
- Butun boshlang'ich sozlash (migratsiya kuni): Postgres, Caddy, systemd, deploy, monitoring
- Har qanday tushunarsiz log/xato tahlili — ko'chirib tashlaysiz, tushuntirib hal qilamiz
- Konfiguratsiya o'zgarishlari, yangi xizmat qo'shish, performance tuning

**Siz qilasiz (mustaqillik shu yerda):**
- Haftalik 5-daqiqalik ritual (§5) — serverni "his qilib" turasiz
- Signal kelganda runbook §6.A — 80% holatda o'zingiz hal qilasiz
- To'lovlar (Contabo, domen) va Contabo panel restart (§6.B)

3-4 hafta ichida §6.A stsenariylari sizga oddiy ishga aylanadi — shundan keyin
sysadmin darajasida emas, O'Z LOYIHASINI biladigan ega darajasida bo'lasiz,
bu esa yollangan sysadmin'dan qimmatroq bilim.

---

*Migratsiya kuni bu hujjatga server IP, domen va aniq yo'llar yoziladi
(hozircha SERVER_IP/DOMEN — joy tutuvchilar).*
