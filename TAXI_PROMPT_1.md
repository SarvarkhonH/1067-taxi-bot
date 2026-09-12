# TAXI YADRO — PROMPT №1: O'RGANISH VA BOSH REJA

> Bu birinchi topshiriq. **Kod yozilmaydi.** Natija — to'rtta hujjat.
> Keyingi promptlar (№2, №3…) shu hujjatlar tasdiqlangandan keyin quriladi.

---

## 0. AVVAL O'QI (shu tartibda)

1. `CLAUDE.md` — buzilmas qoidalar va DoD protokoli (8 qoida). Ayniqsa: hech qachon "done" dema.
2. `ARCHITECTURE.md` — bot kodbazasining xaritasi.
3. `DIZAYN_QOIDALARI.md` — 17 dizayn qoidasi. APK va admin panel rejasi shularga bo'ysunadi.
4. `1067-taxi/docs/MASTER-PLAN.md` — taxi yadrosining o'z-o'zini baholashi (2026-06-08).
   ⚠️ Buni **da'vo** deb o'qi, haqiqat deb emas. Sening ishing — uni tekshirish.
5. `PROGRESS.md` — faqat kerakli qismini grep bilan (fayl 583 KB, to'liq o'qima).

---

## 1. VAZIYAT — tekshirilgan faktlar (2026-09-07, o'lchangan)

Ikkita alohida repozitoriy, bitta kompyuterda:

| | Yo'l | Nima |
|---|---|---|
| **A** | `C:\Users\sarva\Desktop\1067 bot` | Jonli BirJoy boti + miniapp + admin. VPS'da ishlaydi. |
| **B** | `C:\Users\sarva\Desktop\1067 bot\1067-taxi` | Alohida git repo: **o'z taxi dispetcherlik platformamiz**. |

**A hozir B'ni umuman bilmaydi.** A butun taxi ishini tashqi `kas1067` tizimidan oladi.

### Ulanish nuqtasi — bitta interfeys (o'lchandi)

```
packages/server/src/kas/types.ts   → interface KasDataSource — 27 ta metod
packages/server/src/kas/client.ts  → KasLiveSource  (kas1067 HTTP, 59 KB)
packages/server/src/kas/mock.ts    → KasMockSource  (test)
packages/server/src/kas/index.ts   → getDataSource() — env.KAS_MODE bilan tanlaydi
```

Butun bot shu interfeysdan o'tadi: **42 faylda 126 ta chaqiruv.** 27 metodning **hammasi**
ishlatiladi (eng ko'p: `getActiveBooking` 12×, `getAllAddresses` 10×, `getDriverAccount` 9×,
`fetchByPhone` 8×, `checkClient` 7×; eng kam: `cancelBooking`, `getBonusRules`, `getCarModels`,
`getDriverPins`, `listDriverRoster` — 1×).

**Strategik xulosa:** uchinchi implementatsiya — `BirJoySource` — yozilsa va u B'ning API'sidan
o'qisa, butun bot kas1067'dan uziladi. Almashish = bitta env qatori (`KAS_MODE=birjoy`).
126 joyni qo'lda o'zgartirishdan ko'ra bu bir necha barobar xavfsiz. **Reja shu o'q ustiga quriladi.**

### B'da nima bor (o'lchandi, MASTER-PLAN da'vosi emas)

- **API** (NestJS 10 + Fastify + Drizzle + Socket.IO + BullMQ): **40 modul** — dispatch, pricing,
  surge, queue, geofence, routing, orders, drivers, clients, commissions, loyalty, gamification,
  operator, safety, sla, corporate, fleet, intercity, incentives, promos, topup, support, chat,
  scheduled-rides, audit, monitoring, telegram, payments…
- **Baza**: Postgres 16 + PostGIS, **70 jadval** (orders, dispatch_offer_logs, surge_zones,
  queue_entries, driver_fatigue_logs, sla_violations, trip_shares, emergency_alerts…).
- **Admin panel** (Next.js 15): **26 sahifa** — dashboard+jonli xarita, operator, orders, drivers,
  clients, finance/topup, pricing, gamification, outreach, safety, scheduled, support, analytics,
  audit, broadcast, reports, system, settings/phones, admins.
- **Haydovchi APK** (Kotlin + Compose + Hilt): **10 ekran** — Auth, Onboarding, Permissions, Home
  (xarita+heatmap), Earnings, Balls, Documents, Profile, Settings, RideCompleted. 22 MB debug APK.
- **Mijoz Mini App** (Next.js 15) — Telegram OTP, loyalty, tarix, safar kuzatuvi.
- Ma'lumot: **550 haydovchi** ko'chirilgan, 8 tuman, ~98 Koson manzili, 3 avto sinf.

### B'ning xavfli holati

- Lokal `main` o'z origin'idan **8 commit oldinda** (oxirgi push 2026-05-01, ish 2026-06-09 gacha).
  Ya'ni GPS taximetr, haydovchi V2 redizayni, operator CTI — **faqat shu diskda**.
- APK **hech qachon real telefonda ishlatilmagan**.
- `.git/config` ichida GitHub tokeni ochiq matnda (kuzatiladigan fayllarda emas — tekshirildi).

---

## 2. MAQSAD

BirJoy o'z taxi dispetcherligiga o'tsin: kas1067 o'chirilsa ham hech narsa to'xtamasin.
Natija kas1067'dan **10 barobar kuchli**, haydovchi va operator uchun Yandex Go'dan **yaxshiroq**
bo'lsin — Koson sharoitida, Yandex'ni ko'r-ko'rona nusxa qilib emas.

### "10x" — his emas, o'lchov

Real bozor raqamlari (2026-iyul, Koson 1067): oyiga **1956 buyurtma**, **21.5% rad javobi**
(haydovchi topilmadi / mijoz kutmadi), ilova ulushi **10.6%**, o'rtacha chek **~1700 so'm**.
Cheklov — talab emas, **taklif va konversiya**. Demak 10x quyidagi raqamlarda o'lchanadi:

| Ko'rsatkich | Hozir (kas1067) | Maqsad |
|---|---|---|
| Rad javobi | 21.5% | **< 5%** |
| Ilova orqali buyurtma | 10.6% | **> 60%** |
| Haydovchi tayinlanish vaqti | o'lchanmaydi | **median < 45 s, p95 < 120 s** |
| 8 soatda o'tkazib yuborilgan buyurtma | noma'lum | **0** |
| Operator bir buyurtmaga sarflagan vaqti | qo'lda | **< 20 s yoki 0 (avto)** |
| Haydovchi kunlik daromadi ko'rinishi | yo'q | real vaqt, tekshiriladigan |

Bu raqamlarni rejaning har fazasi uchun bo'lib chiq: qaysi faza qaysi raqamni qanchaga suradi.

---

## 3. SHU TOPSHIRIQNING NATIJASI — 4 hujjat, kod emas

### 3.1 `TAXI_YADRO_AUDIT.md` — B'da HAQIQATDA nima ishlaydi

MASTER-PLAN "~80% pilotga tayyor" deydi. Buni **isbotla yoki rad et**. Har satr uchun:
`fayl:qator` + kod iqtibosi. Uchta ustun: **da'vo / kodda bormi / isbot**.

Majburiy tekshiriladigan joylar:
- `dispatch` moduli: haydovchi tanlash algoritmi qanday? Qayta-tarqatish (re-dispatch) bormi?
  Hech kim qabul qilmasa nima bo'ladi? "O'lik buyurtma" holati bormi?
- `pricing` + `surge` + GPS taximetr: narx qayerda hisoblanadi, manzilsiz safar qanday o'lchanadi?
- Socket.IO real vaqt oqimi: haydovchi ilovasi ↔ API ↔ admin — uzilish bo'lsa nima bo'ladi?
- Auth: OTP uzunligi (MASTER-PLAN 4 xonali deydi — tekshir), token muddati, admin rollari.
- Nima **yozilgan lekin ulanmagan** (dead code): modul bor, lekin route yoki UI yo'q.
- Testlar: nechta bor, nimani qamraydi, oxirgi marta qachon yashil bo'lgan?

⚠️ Bu repo'da `pnpm install` yoki build qilishdan **oldin ayt** — u alohida turborepo.
Hech qanday docker/servis o'z-o'zidan ko'tarilmasin; ega ruxsatisiz port ochma.

### 3.2 `KAS_PARITET.md` — 27 metodlik jadval (eng muhim hujjat)

`KasDataSource`ning **har 27 metodi** uchun bitta satr:

| # | Metod | Bot qayerda ishlatadi (fayl:qator) | B'da qaysi endpoint/jadval beradi | Gap | Qiyinlik |
|---|---|---|---|---|---|

- "Gap" ustuni aniq bo'lsin: `to'liq bor` / `qisman (nimasi yo'q)` / `umuman yo'q`.
- Ma'lumot shakli mos kelmasa (masalan `RideHistoryItem` maydonlari) — aynan qaysi maydon
  yo'qligini yoz.
- Oxirida: **nechta metod tayyor, nechta qisman, nechta yo'q** — raqam bilan.
- Bu jadval keyingi promptning ish rejasiga aylanadi.

### 3.3 `KAS1067_XUSUSIYATLAR.md` — kas1067 nima qila oladi (to'liq ro'yxat)

Paritet jadvali (3.2) faqat **bot iste'mol qiladigan** 27 metodni qamraydi. Lekin kas1067 mahsulot
sifatida bundan kengroq: mijoz ilovasi, operator ekrani, haydovchi tomoni. Hech bir xususiyat
tasodifan tushib qolmasligi uchun to'liq ro'yxat kerak.

Ikki manbadan yig':

1. **`packages/server/src/kas/client.ts` (59 KB) — asosiy va ishonchli manba.** Bu bizning kodimiz,
   kas1067 API'sining aniq tavsifi: qaysi endpoint, qanday parametr, qanday javob. Har HTTP
   chaqiruvni ro'yxatga ol — 27 metod ortida nechta real endpoint borligini sanab chiq.
2. **`client-apk-decomp/` — kas1067 mijoz ilovasining dekompilyatsiyasi** (jadx, ~10 870 Java fayl).
   Bundan faqat **xususiyatlar va xatti-harakat** olinadi: qanday ekranlar bor, buyurtma qanday
   maydonlarni tashiydi, mijozga nima ko'rsatiladi, qanday holatlar (status) mavjud.

⛔ **Ularning kodi bizga KO'CHIRILMAYDI.** Dekompilyatsiya qilingan kod — boshqa kompaniyaning
mualliflik huquqi, ustiga obfuskatsiya qilingan va kontekstsiz (noldan yozishdan qiyinroq).
Undan **spetsifikatsiya** o'qiladi, satr emas. Har xususiyat o'z so'zimiz bilan qayta yoziladi.

Natija — jadval: **xususiyat / kas1067'da qanday ishlaydi / bizda bormi / kerakmi**.
"Kerakmi" ustuni muhim: kas1067'ning har odati yaxshi degani emas — ba'zilari ataylab tashlanadi
(sababi bilan). Oxirida: **nechta xususiyat bor, nechta yo'q, nechta ataylab tashlanadi.**

### 3.4 `TAXI_10X_PLAN.md` — bosh reja

Bo'limlar:

1. **Strategiya** — nega BirJoySource yo'li, muqobillari nima edi va nega rad etildi.
2. **Fazalar** — har fazaga: maqsad, o'zgaradigan fayllar, **qabul darvozasi** (o'lchov bilan),
   orqaga qaytish yo'li. Faza tartibi xavfga qarab: eng arzon-eng foydali birinchi.
3. **Kas1067 paritet ro'yxati** — 3.2 va 3.3 dan chiqadi: hech bir metod va hech bir xususiyat
   tashlab ketilmaydi (ataylab tashlanganlari sababi bilan yoziladi).
4. **Haydovchi APK — dizayn blueprint.** Ekran-ekran: nima ko'rinadi, nima bosiladi, nima his
   qilinadi. Yandex Go bilan solishtir: qayerda undan yaxshi va **nega aynan Koson haydovchisi
   uchun shu yaxshi**. Haydovchining haqiqiy shikoyatlaridan boshla (kas1067'da nimadan aziyat
   chekadi). `DIZAYN_QOIDALARI.md` har ekranga qo'llaniladi.
5. **Admin/dispetcher konsoli — dizayn blueprint.** Operator 3 soniyada nima ko'radi?
   Bitta ekranda nechta buyurtmani boshqara oladi? Rad javobi 21.5%'dan qanday tushadi?
6. **Migratsiya rejasi** — kas1067'dan uzilish. Ikki tizim parallel ishlaydigan davr bormi?
   Ma'lumot ko'chishi (mijozlar, bonuslar, haydovchi qarzlari) qanday? Orqaga qaytish qanday?
7. **Xavflar jadvali** — har xavfga: ehtimollik, zarar, oldini olish, aniqlash belgisi.
8. **Nima QILINMAYDI** — ataylab tashlanadigan narsalar ro'yxati (bu ham qaror).

---

## 4. BUZILMAS QOIDALAR

1. **Kod yozilmaydi.** Faqat o'qish, o'lchash va hujjat yozish. Bitta `.ts` fayl ham tegilmaydi.
2. **Push yo'q.** Hech narsa GitHub'ga jo'natilmaydi. Ega ruxsatisiz commit ham yo'q.
3. **Prod tegilmaydi.** VPS'ga SSH yo'q, bazaga yozuv yo'q. Neon — muzlatilgan, o'qilmaydi ham.
4. **Real foydalanuvchiga xabar yo'q.** Bot orqali hech kimga test xabari jo'natilmaydi.
5. **Isbotsiz da'vo yo'q.** Har "bor / ishlaydi / tayyor" — `fayl:qator` yoki buyruq natijasi bilan.
   Tor grep bilan "hammasi tekshirildi" dema — nimani QAMRAMAGANingni ayt.
6. **"Done" demaysan.** Tugatganda: **"READY FOR VERIFICATION"** + isbotlar ro'yxati.
7. Butun-repo tekshiruvi: har "0 ta" / "hamma joyda" da'vosi `packages/*/src` bo'ylab xom natija bilan.

---

## 5. TARIXDAN CHIQQAN TUZOQLAR (takrorlanmasin)

- **Ega-preview yolg'oni.** Bir marta butun bozor mijozlarga ko'rinmay turgan edi, ega esa
  o'zida ishlayotganini ko'rib "jonli" deb o'ylagan. Har flag uchun: **oddiy mijoz nima ko'radi?**
- **Neon aldovi.** Muzlatilgan bazadan olingan raqam "jonli haqiqat" deb taqdim etilgan.
  Raqam keltirsang — manbasini ayt.
- **Bitta shoxobcha.** Yangi git branch ochilmaydi. Hamma sessiya bitta ish-papkani baham ko'radi.
- **Yangi poller yo'q.** Vaqt bo'yicha ishlaydigan yangi sikl qo'shilmaydi — bori kengaytiriladi.
- **"tanga", "coin" emas.** UI'da hech qachon "coin" yozilmaydi.
- **Bir safar emissiyasi ≤ 350 tanga.** Pul mexanikasi tegiladigan bo'lsa — shu chegara.
- **Prototip ≠ mahsulot.** Ma'lumotsiz element foydalanuvchiga ko'rsatilmaydi.

---

## 6. QANDAY BOSHLAYSAN

1. §0 dagi hujjatlarni o'qi.
2. **Ish rejangni yoz** — qaysi fayllarni qaysi tartibda o'rganasan, qanday isbot keltirasan.
   **Tasdiqni kut.** Ega "boshla" demaguncha audit boshlanmaydi.
3. Tasdiqdan keyin: 3.1 → 3.2 → 3.3 → 3.4 tartibida. Har hujjat tugagach qisqa hisobot ber, keyingisiga o't.
4. Yakunda: **"READY FOR VERIFICATION"** + har hujjat uchun isbot xulosasi + ochiq savollar ro'yxati.

**Ochiq savol bo'lsa — taxmin qilma, so'ra.** Ega qisqa yozadi; noaniq joyni aniqlashtirish
sening ishing, taxmin qilib noto'g'ri yo'lga ketish emas.
