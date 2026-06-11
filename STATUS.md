% 1067 Taxi Super-App — Holat hisoboti (Handoff)
% Yangi chat uchun. Sana: 2026-06-11. Hamma "✅ verified" elementlar JONLI tekshirilgan.

# 1067 Taxi Super-App — Holat hisoboti

**Maqsad:** Telegram-native taksi super-app — taxi chaqirish + o'yinlashtirilgan cashback (haqiqiy pul). Koson 1067 Taxi (kas1067) ustiga qurilgan.

## 🌐 Jonli manzillar (hammasi ishlayapti)

| Qism | Manzil | Holat |
|---|---|---|
| 🤖 Bot | @koson1067bot | ✅ 24/7 (Render webhook) |
| 📱 Mini App | https://1067taxi-miniapp.vercel.app | ✅ Vercel |
| 🖥 Admin panel | https://admin-seven-ebon-95.vercel.app | ✅ Vercel (**parol bilan kirish**, parol = `ADMIN_PANEL_TOKEN` Render env'da) |
| ⚙️ Backend | https://kas1067-taxi-bot.onrender.com | ✅ Render (KAS_MODE=live, BOOKING_LIVE=true) |
| 🗄 Baza | Render Postgres | ⚠️ bepul tarif **2026-07-10** tugaydi |
| 💻 Kod | github.com/SarvarkhonH/1067-taxi-bot | ✅ |

---

# ✅ BAJARILDI (jonli tekshirilgan)

### 1. Poydevor
- pnpm monorepo (server / miniapp / admin / shared), TypeScript.
- grammY bot + React/Vite Mini App + React admin + Express API + Prisma/Postgres.
- kas1067 integratsiya: login, on-demand telefon-qidiruv (bulk scan yo'q), **cashback yozish** (`PUT api/clients` + `bonusSecretKey` 1303 — jonli isbotlangan).

### 2. Ikki hamyon (iqtisod poydevori)
- 🚕 **Cashback** (kas points, real so'm — faqat safarlardan).
- 🪙 **Coin** (bizning DB, `CoinTxn` ledger — barcha o'yinlardan).
- 💸 **2-tomonlama konversiya**: coin→cashback (withdraw) va cashback→coin (topup). 1 coin = 1 so'm.

### 3. Engagement mexanikalari
Streak · 🎡 g'ildirak (1 bepul + coin'ga respin) · 🎁 quti (bepul + premium) · 🎯 missiya (5 kunlik/3 haftalik) · 🏆 haftalik liga + **tier** (Bronza→Olmos, promotion/relegation) · 👥 double-referral · 🎰 o'suvchi jackpot · 🎁 surprise drop.

### 4. ~~Arcade o'yinlar~~ → SUPER-APP (2026-06-11 pivot)
Poyga/Tezlik/Duel/Viktorina/Park **OLIB TASHLANDI** (kitob strategiyasiga zid, balanslar saqlanib drain qilindi, drift 0). O'rniga: **1-tap booking** (bot CTA + miniapp hero, `Member`da saqlanadigan manzil xotirasi, `/api/booking/now`) · **Haydovchi bo'limi** (panel + daromad + tip tugmalari safar oxirida) · **P2P o'tkazma** (atomik, 2% burn, 2 tomonlama 30k cap, ring-guard, 48h yosh darvozasi — `testTransfer.ts` 25 tekshiruv) · **🏪 Bozor** (do'konlar coin'ga sotadi, vaucher kod, ABSORB — bizga 0 xarajat; `testMarket.ts` 12 tekshiruv) · **Withdraw ride-gate** (`trips<1` → so'm yechib bo'lmaydi — soxta ferma yopildi). Reja: `SUPERAPP_PLAN.md` + `SUPERAPP_SAFETY.json`.

### 5. Taxi booking (Uber patterns qo'llangan)
- Mini App: Leaflet **jonli xarita**, pin tanlash, **fare prognoz** (haversine+tariff), mashina turi, qo'shimchalar (BAGAJ/MOTO), **ETA**, **bekor qilish**, 3s kuzatuv, "📍 Mening joylashuvim" (GPS).
- Bot: **📍 GPS joylashuv yuborish** → eng yaqin manzil, narx kartasi, ETA, bekor, **🔁 1-tap qayta chaqirish** (/qayta).

### 6. kas1067 client power-ups
Narx kalkulyatori (`clientTariffs`) · cashback qoidalari (`bonusProperties`) · 9 mashina turi (`carModels`) · qo'shimchalar · xizmat hududi (`cityBorders`) · **revenue/safar signali** (`mainReports`).

### 7. Dizayn (premium)
Mini App 2.0/v3: glass kartalar, harakatlanuvchi aurora fon, **SVG navigatsiya** + sirpanuvchi indikator, spring toast, boot splash, count-up, confetti.

### 8. Admin command center (web + endpointlar)
🚦 **Salomatlik** (kas/baza/bot/sync latency) · 💰 **Iqtisod** (coin emission/sink/withdraw/jackpot) · 📈 **O'sish** · 🚖 **Jonli buyurtmalar** (haydovchisiz alert) · ⚡ **Amallar** (cashback berish, e'lon) · 📜 **Audit** · 🔐 **Integrity**.

### 9. In-bot ops console (Telegram'dan boshqaruv)
`/dash` (to'liq operatsion holat) · `/orders` (jonli buyurtmalar) · `/admin`. **Har session push**: yangi buyurtma, safar yakuni, withdraw, anomaliya, drift — adminlarga avtomatik.

### 10. 🛡 IQTISODIY XAVFSIZLIK (eng muhim)
- **Revenue-linked withdraw budget**: real pul chiqishi = real safarlarga bog'langan (kas `mainReports`). Safar kamaysa → budget kamayadi. **Jonli: 38 safar → 31 400 so'm/kun.** Hech qanday exploit bizni bankrot qila olmaydi.
- **Exploit yopildi**: g'ildirak respin endi sink (−150 EV, avval +50 mint edi).
- **Money integrity**: balans = ledger reconciliation, drift/anomaliya avto-aniqlash + heal. Jonli: 0 drift.

### 11. Hardening (Sprint-0)
DB backup (3473 satr snapshot) · stuck-sync watchdog · rate-limit (withdraw/o'yin/admin) · ALLOW_DEBUG_AUTH boot-guard · backup script.

---

# ⏳ QOLDI (keyingi ishlar)

### 🔴 Kritik (faqat EGANING qarori/hisobi kerak)
- **Postgres upgrade/migratsiya** 2026-07-10 gacha — aks holda barcha ma'lumot o'chadi (kunlik backup endi avto keladi, lekin doimiy yechim — to'lov qarori).
- **Maxfiy kalitlarni rotatsiya** (BOT_TOKEN, KAS parol, Vercel/GitHub/Render tokenlar — chatda ko'rsatilgan).
- **Bozor'ga 3-5 ta real do'kon qo'shish** (admin route tayyor — biznes nomlari kerak).
- Sentry/Slack monitoring (ixtiyoriy — admin alertlar botda allaqachon bor).

### ✅ 2026-06-11 da TUGATILDI (avval "qoldi" edi)
- 🎲 **Variable safar-cashback** 80/15/4/1 + omad kuni + safar boqadigan jackpot (`cashbackService`, RideReward idempotent).
- 🚗 Haydovchi avto-bonus (250/safar, 20k/kun cap) + haydovchi miniapp tabi.
- 🛡 riskFlag muzlatish + detektorlar (safarısız boyish, transfer/referral fan-in) + `/api/admin/unflag`.
- 👥 Referral himoyasi: taklif mukofoti do'st BIRINCHI SAFAR qilganda to'lanadi + telefon de-dup.
- 🚫 Cancel-farm cap (kuniga ≥4 bekor → to'liq tasdiqlash).
- 📜 **Safar tarixi** (bookingReports to'liq param bilan ishladi: `/tarix` + miniapp).
- 🏪 Bozor REDEEM mexanizmi (alohida byudjet, haftalik settle) — DEFAULT O'CHIQ, admin yoqadi.
- 🗄 **Avto-backup**: har kuni to'liq JSON snapshot adminga Telegram'da keladi.
- ❌ Bonus bilan to'lash: kas SPA'da yozish maydoni YO'Q (faqat config flag) — xavfsiz amalga oshirib bo'lmaydi, yopildi.

### 🟡 Sifat / kelajak
- Float→Int pul migratsiyasi (kechiktirilgan — jonli ma'lumot xavfi).
- CI/testlar, i18n (uz/ru/en), accessibility.
- Liga kohortlari, season-pass.

---

# ⚠️ MUHIM ESLATMALAR (yangi chat boshida o'qing)

1. **BOOKING_LIVE=true** — Mini App/bot'dan buyurtma = **haqiqiy taxi** chaqiriladi.
2. **kas1067 = pickup-only** (taximetr — Uber'dagi "qayerdan→qayerga" va qat'iy narx yo'q). Booking dizayni shu cheklov ichida.
3. **Postgres bepul tarif 2026-07-10** — o'chmasligi uchun upgrade kerak (eslatma 07-05 ga qo'yilgan).
4. **Admin kirish: parol bilan** (login ekrani). Parol = Render env `ADMIN_PANEL_TOKEN`. O'zgartirish: Render env'ni yangilang → server redeploy. Eski `?key=<token>` URL ham ishlaydi (zaxira).
5. **Render deploy avtomatik EMAS** — push'dan keyin `POST api.render.com/v1/services/srv-d8k27oernols73dhm0ng/deploys` kerak (yoki auto-deploy yoqilgan — hozir ishlayapti).
6. Mini App/admin deploy = `VITE_API_URL=<render> build` → Vercel prebuilt.
7. Budget sozlamalari env: `WITHDRAW_BASE_BUDGET` (20k), `WITHDRAW_PER_RIDE` (300), `ANOMALY_24H_GAIN` (80k).

---

# 📦 Tarix (oxirgi commitlar)
e00e0d4 In-bot ops console + every booking session pushed to admins ·
d4d07f8 Uber-level taxi booking (BOT + Mini App) ·
507f988 Money integrity (reconciliation + alerts) ·
b6af735 Economic solvency (revenue-linked budget + exploit fix) ·
6f2a4b4 Bot UX polish + Sprint-0 hardening + first backup ·
3a6d0da v4 admin command center ·
d31da3c v3 premium design ·
S1-S4: dual wallet → games → duel/quiz/league → map booking.

**Hajm:** ~30 commit, 5 paket, server+miniapp+admin+shared.

> Hammasi jonli va tekshirilgan. Keyingi chatda eng kuchli ish: **booking'ni yana soddalashtirish (Mini App xarita asosiy) + Postgres mustahkamlash.**
