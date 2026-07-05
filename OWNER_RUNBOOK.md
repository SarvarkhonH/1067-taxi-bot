# 1067 — EGA QO'LLANMASI (Claude'siz davr uchun)

> Bu fayl: bot/Mini App 1 oy qarovsiz ishlashi uchun nimalar o'z-o'zidan tuzaladi, nima sizga
> Telegram'da alert beradi, va har vaziyatda SIZ nima bosishingiz kerak. Kod bilmasangiz ham yetadi.

## 1. Har kuni o'zi ishlaydigan himoya (siz hech narsa qilmaysiz)

| Tizim | Nima qiladi | Qachon |
|---|---|---|
| 🌙 Nightly self-check | pul-ledger butunligi, manfiy balans, emissiya-vs-cap, fond, osilgan markerlar — RED bo'lsa qattiq alert, sog' bo'lsa «hammasi joyida» xabari | har kecha 21:00 dan keyin |
| 💾 Kunlik backup | BUTUN baza JSON fayli Telegram'ingizga yuboriladi — baza o'lsa ham ma'lumot sizda | har kun 1 marta |
| 🩺 kas-health | kas 429/login/timeout ko'paysa — soniyalarda alert | doimiy |
| 🚩 Flag-audit (boot) | server qayta ishga tushganda flaglar yo'qolgan bo'lsa (DB reset) — alert | har restart |
| 🛑 Crash-alert | server ichida kutilmagan xato — 60s throttle bilan alert | doimiy |
| 💸 Withdraw-alert | HAR real pul chiqishida sizga xabar | har withdraw |
| ⏳ NOANIQ kas-yozuv | pul kas'ga yetgan-yetmagani noaniq qolsa — o'sha zahoti + har boot'da alert, o'sha odamning kassasi avto-bloklanadi (ikki marta to'lanmaydi) | bo'lsa |
| 🔁 O'z-o'zini tuzatish | kas sessiya o'lsa → avto re-login; sweep xatosi → keyingi tick qayta uradi; socket uzilsa → backoff bilan qayta ulanadi; hamma pul-amal idempotent (takror = no-op) | doimiy |

**Kunlik 2 daqiqalik tekshiruv:** kechqurun «hammasi joyida» self-check xabari kelganini ko'ring.
Kelmagan bo'lsa → server uxlagan/o'lgan bo'lishi mumkin (pastda 4-bo'lim).

## 2. Admin paneldan boshqariladiganlar (kod KERAK EMAS)

Panel: admin-seven-ebon-95.vercel.app (admin token bilan)

- **💸 Naqd fond (YANGI):** Boshqaruv → Bonus iqtisodi → «Naqd fond» guruhi:
  - *Kunlik fond — baza* (hozir 20 000) va *har safar uchun* (hozir 300) — haydovchilar «fond tugadi»
    desa SHU YERDAN oshirasiz. Tavsiya: baza 30 000, har safar 1000 (2000 komissiyangizdan xavfsiz kam).
  - *Bir odam kunlik limiti* (100 000) va *minimal yechish* (5 000) ham shu yerda.
- **Kill-switch flaglar:** Boshqaruv → Features — HAR mexanikani bir tugma bilan o'chirish/yoqish
  (trackcta, drvrank, spinreminder, waitcomp, baraban…). Biror funksiya muammo chiqarsa — OFF bosing, tamom.
- **Bonus miqdorlari:** birinchi-safar 5000, taklif 1500, revshare va h.k. — hammasi knob.
- **Anomaliya banneri + tasdiqlash inbox'i** (Overview) · **Bloklaganlar** ro'yxati · CSV eksportlar ·
  Puls (K-faktor voronkasi) · Obzvon panel.

## 3. Terminal buyruqlar (Claude SHART EMAS — kopipast yetadi)

Kompyuterda: `cd Desktop\1067 bot\packages\server` keyin:

| Vaziyat | Buyruq |
|---|---|
| Flag yoqish/o'chirish (panel ishlamasa) | `npx tsx src/scripts/setFlag.ts <nom> on` (yoki `off`) |
| «NOANIQ kas-yozuv» alerti keldi | `npx tsx src/scripts/clearPending.ts list` → kas balansini tekshiring → yetib borgan: `... resolve <key>` · bormagan: `... refund <key>` |
| Flaglar ro'yxati/holati | server log'da boot'da chiqadi; yoki panel → Features |

## 4. FAVQULODDA holatlar

**Bot javob bermayapti (self-check ham kelmadi):**
1. dashboard.render.com → kas1067-taxi-fra → holatga qarang.
2. «Manual Deploy» → «Deploy latest commit» bosing (bu qayta ishga tushiradi).
3. 5 daqiqada bot tirilmasa — Logs bo'limida oxirgi qatorlarni o'qing (qizil xato ko'rinadi).

**Mini App ochilmayapti, bot ishlayapti:** Telegram'da chatni yopib-oching (kesh). Bo'lmasa —
vercel.com → 1067taxi-miniapp → oxirgi deployment «Ready»mi qarang.

**«DB reset» alerti (flag-audit):** panel → Features'dan o'chgan flaglarni qayta yoqing.
Ma'lumot yo'qolgan bo'lsa — oxirgi kunlik backup JSON sizning Telegram'ingizda.

**Pul shubhali (self-check RED):** alert matni aniq nimani ko'rsatadi (drift/negativ/emissiya).
Eng xavfsiz birinchi qadam: panel → Features → shubhali mexanikani OFF. Pul-yadro (safar, booking)
flag'larga bog'liq emas — taxi chaqirish ishlayveradi.

**Hech narsa yordam bermasa:** Render'da «Rollback» — oldingi deploy'ga bir tugma bilan qaytish.

## 5. Tegmang (buzilishi mumkin)

- Render env o'zgaruvchilari (DATABASE_URL, KAS_*, WEBHOOK_*) — o'zgartirmang.
- `prisma db push` / migratsiya buyruqlari — ishlatmang.
- Neon (baza) dashboardida delete/reset — hech qachon.
- Bir vaqtda IKKINCHI server instans ochmang (pul-lock buziladi).

## 6. Cheklovlar (bilib qo'ying)

- Server Render'da bitta instans: restart ~1-2 daqiqa (webhook kelganda o'zi turadi).
- kas1067 o'z serveringiz bo'lsa ham HTTP + sessiya scraping'da ishlaydi — kas panel parolini
  o'zgartirsangiz, Render env'da KAS_USERNAME/KAS_PASSWORD ham yangilanishi SHART (aks holda bot ko'r bo'ladi).
- kas UI'sini yangilamang (login sahifasi o'zgarsa integratsiya sinadi) — Claude qaytguncha kutsin.
