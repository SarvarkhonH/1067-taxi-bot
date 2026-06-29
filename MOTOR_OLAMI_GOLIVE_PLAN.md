# MOTOR OLAMI — GO-LIVE PLAN (fix all 35 gaps + model-upgrade ladder → full live)

> **HOLAT (2026-06-29): FAZA 1-4 BAJARILDI + JONLI.** FAZA 5 (ism/hikoya) = ixtiyoriy, o'tkazib yuborildi.
> FAZA 6 gate O'TDI: simEconomy 0-violation · testGarajP1 ~115 tekshiruv **3× yashil** · mustaqil 6-agent
> R4 audit = **42/45 da'vo HOLDS, 0 pul-invariant buzilishi** (2 risky tuzatildi: shop-strand gate +
> CarCheck retry-dedup). Commitlar: `969e983`(F1) `2928ba4`(F2) `e12e411`(starter-fix) `5ca753f`(F3)
> `5e92f80`(F4) `358fff1`(R4-fix). carupgrade ON. **Qolgan yagona narsa: ega real-telefon QABUL (R6).**



**Maqsad:** auditda topilgan barcha farqlarni tuzatib + siz so'ragan **model-zinapoyasi**ni qo'shib,
Motor Olami'ni rejadagidek TO'LIQ ishlaydigan holatga keltirish, keyin owner-QABUL bilan jonli yoqish.

**Asos:** plan-vs-code-vs-live audit (2026-06-29, 6-agent) — 67 da'vo: **32 rejadagidek, 35 farq**
(8 missing · 3 broken · 11 diverged · 13 partial). Test suite `testGarajP1` yashil; barcha route'lar jonli.

**Ishlash qoidasi (har item):** flag ortida qur → `pnpm -r typecheck` → `testGarajP1` 3× → simEconomy
0-violation (pulga tegsa) → mustaqil R4 → owner telefon-QABUL → flag flip. Pul-xavfsizligi BUZILMAS:
≤350/safar · withdraw real-safar+revenue gated · har op idempotent · korp-ledger alohida.

---

## ⚙️ OWNER QARORLARI (boshlashdan oldin — raqamlar siznikidir)

| # | Qaror | Tavsiyam (default) |
|---|---|---|
| Q1 | Passiv kunlik cap (`dailyEarnCap`) hozir **3000** — qoldiramizmi yoki pasaytiramizmi? | **1000/kun** (reja ~300 juda past, 3000 juda baland — o'rtacha) |
| Q2 | Real taksida **2× daromad** qolsinmi? (real safarni rag'batlantiradi, lekin emissiya) | **Ha** (cap ichida; biznesni rag'batlantiradi) |
| Q3 | Model-upgrade **narx formulasi** | `(keyingi−hozirgi narx) × 1.3` (pure sink) |
| Q4 | "🛒 yangi mashina" do'koni | **Butunlay olib tashlash** (faqat P2P + yo'l-sovg'a qoladi) |
| Q5 | Speeder boost | **×3** (×4 juda kuchli) + yoqilg'i proporsional |

---

## FAZA 1 — 🔴 IQTISOD TUZATISH (money-balance — solvency, eng birinchi)

### 1.1 Real-taksi 2× + `totalTrips++` (ride-finish hook)
- **Gap:** `MOTOR_TAXI_MULT=2` o'lik — `taxiHours=0` doim; haydovchi mashinasi turgan mashinadek ishlaydi. `totalTrips` hech qachon oshmaydi (doim 0).
- **Fix:** `bookingNotifier` ride-finish sweep'ida haydovchining aktiv motor-mashinasiga safar-bonusi (2×-soatlik accrual) + `totalTrips++`. Idempotent (ride-id key, `GarajRideDrop` pattern). Cap ichida.
- **Fayllar:** `bookingNotifier.ts`, `garajService.ts` (yangi `creditTaxiMotorBonus(memberId, bookingId)`), `garajGame.ts`.
- **DoD:** real safar → haydovchi mashinasi 2× soat accrual oladi (cap ichida) · `totalTrips` oshadi · 1 safar = 1 marta (idempotent) · simEconomy ≤350/safar BUZILMAYDI.

### 1.2 Speeder yoqilg'isi proporsional (×N tekin emas)
- **Gap:** speeder gross+wear 4× oshiradi, lekin refuel narxi FLAT → speeder ≈ tekin ×4 (faqat cap ushlaydi).
- **Fix:** `computeMotorRefillCost`'ga `speederMult` (va speedMult) ko'paytuvchisini qo'shish → boostlangan mashina yoqilg'isi qimmatroq, net% ~20% qoladi.
- **Fayllar:** `garajGame.ts` (refill formula), `garajService.ts` (motorRefuel + preview).
- **DoD:** speeder aktiv → refuel narxi ×N oshadi · simEconomy speeder×3 stacklab ham 0-violation · UI'da yangilangan narx.

### 1.3 `dailyEarnCap` qayta sozlash (Q1)
- **Fix:** owner tanlagan qiymat (`setMotorEcon dailyEarnCap <Q1>`). Kod o'zgarmaydi (knob bor).
- **DoD:** jonli cap = Q1 qiymat · preview mos.

### 1.4 simEconomy — to'liq stack isboti
- **Fix:** simEconomy'ni 2× taksi + speeder + parts + bonus HAMMASI yoqilgan worst-case bilan yugurtirish.
- **DoD:** ≤350/safar + flip-cap + withdraw-byudjet + motor-cap **0-violation** (go-live shartı).

---

## FAZA 2 — 🚗 MODEL ZINAPOYASI + SCARCITY (sizning g'oyangiz — do'kon o'rniga)

### 2.1 Model-upgrade ladder
- **Gap:** do'kondan cheksiz yangi mashina mint (per-model cap yo'q) — rejadagi scarcity buzilgan.
- **Fix:** `CAR_UPGRADE_CHAIN` = Tiko→Damas→Matiz→Spark→Nexia→Cobalt→Lacetti→Malibu→Tracker→Tahoe→Gelik. `upgradeCarModel(memberId, carId)` — tanga **SINK** (Q3 narx) → `carCode` keyingi modelga, **#serial + bornAt + tarix SAQLANADI**, engineHp 100. `@@unique([memberId,carCode])` to'qnashuvini bloklash (o'sha modelni allaqachon ushlasa). Flag `carupgrade` (OFF).
- **Fayllar:** `garajGame.ts` (chain + `nextModel` + `upgradeCost` + knob `carUpgradeFactor`), `garajService.ts` (`upgradeCarModel`), `server.ts`+`api.ts` (route), `garaj.tsx` ("⬆️ ko'tarish" tugma), `testGarajP1.ts`.
- **DoD:** Tiko#1042 → Damas#1042 (serial saqlandi) · tanga yechildi (sink, emissiya yo'q) · engineHp 100 · owned-model bloklandi · OFF-safe · ledger invariant.

### 2.2 "🛒 yangi mashina" do'konini olib tashlash (Q4)
- **Fix:** `getGarajState` shop'ni flag ON da bermaydi; `garaj.tsx` bo'limni yashiradi; `acquireCar` faqat starter/FTUE + (agar Q4=keep) starter Tiko. Yangi o'yinchi 1 bepul Tiko oladi (FTUE — tekshiriladi).
- **DoD:** flag ON → "yangi mashina" do'koni yo'q · yangi o'yinchi 1 Tiko oladi · ko'proq mashina faqat P2P/yo'l-sovg'a.

### 2.3 `ownerCount++` har transferda (broken fix)
- **Gap:** sotuvda oshmaydi → har sotilgan mashina "1 ega, toza" ko'rinadi (cleanHistory yolg'on).
- **Fix:** `garajBazaarBuy` + auction settle tx'ida `ownerCount: { increment: 1 }`.
- **DoD:** P2P sotuvdan keyin `ownerCount` oshadi · cleanHistory faqat haqiqiy 1-ega'da true.

### 2.4 Bozor listing'da #serial ko'rinadi
- **Gap:** P0 DoD "bozorda #serial ko'rinadi" — listing'da yo'q.
- **Fix:** `getBazaar` + `getAuctions` serial qaytaradi; `garaj.tsx` karta + `api.ts` tip.
- **DoD:** bozor kartasida `#1042` ko'rinadi (pullik CarCheck shart emas).

---

## FAZA 3 — 🔗 MERGE + 💀 O'LIM TO'G'RILIGI (reja va'dalariga mos)

### 3.1 Merge +10% DAROMAD (earn, faqat resale emas)
- **Gap:** `mergeMult` faqat flip/resale narxiga; daromadga EMAS.
- **Fix:** `motorCollect` speed'iga `mergeMult(mergeCount)` qo'shish (parts/speeder bilan bir qatorda). Preview ham.
- **DoD:** merged mashina /soat ko'proq ishlaydi (+10%/bosqich) · cap ichida.

### 3.2 Merge +25% UMR (haqiqiy uzaytirish)
- **Gap:** engineHp 100 reset (to'liq tiklash), reja "+25% umr" emas.
- **Fix:** qaror — yo (a) `bornAt`ni oldinga surib lifespan'ni +25% uzaytirish, yo (b) reja matnini "to'liq tiklash" deb yangilash. Tavsiya: (a) — har merge `lifespanDays × 1.25` effekti (per-car bonus maydon yoki bornAt shift).
- **DoD:** merged mashina umri +25% uzun · UI to'g'ri yozadi ("+10% daromad · +25% umr").

### 3.3 O'lim 50%-daromad ogohlantirishi
- **Gap:** ~2 kun qolganda 50% yo'q — engineHp 5 bo'lsa ham to'liq ishlaydi, keyin 0.
- **Fix:** `motorCollect`: `engineHp < O'LIM_OSTONA` (mas. <20%) → earn ×0.5 + view'da "qariyapti" bayrog'i + umr-bar qizil.
- **DoD:** engineHp<20% → daromad yarmiga · UI ogohlantiradi.

### 3.4 O'lik mashinada 4 tugma (reja: remont/sot/merge/qoldir)
- **Gap:** Eskirdi sheet'da 3 tugma (Ofis/Kapital/Hozir-emas) — Merge + "Bozorga" yo'q.
- **Fix:** `GarajEskirdiSheet`'ga 🔗 Merge + 🛒 Bozorga qo'yish tugmalari.
- **DoD:** o'lik mashina sheet'ida 4 yo'l: Kapital remont · Sotish (Ofis/Bozor) · Merge · Qoldir.

---

## FAZA 4 — ⭐ BOZOR HALOLLIGI + ORZU (ishonch + maqsad)

### 4.1 Sotuvchi-baho UI + reputatsiya (broken fix)
- **Gap:** `garajRateSeller` UI'dan chaqirilmaydi + faqat star-avg'ga, reputationScore'ga emas.
- **Fix:** P2P xariddan keyin "Sotuvchini baholang ⭐" prompt; `rateSeller` past baho → `reputationScore` tushiradi.
- **DoD:** xaridor baho beradi · yomon mashina → sotuvchi reputatsiyasi tushadi (4.8→4.3).

### 4.2 Sotuvdan keyin yashirin nuqson ochiladi
- **Fix:** P2P xariddan keyin yangi egaga nuqson avtomatik ko'rinadi (bepul reveal) + bot xabar.
- **DoD:** xaridor mashina nuqsonini sotuvdan keyin ko'radi (Premium-check shart emas).

### 4.3 Clean History narx-premiumi
- **Gap:** faqat badge, narxga ta'sir yo'q.
- **Fix:** `referencePrice`/Ofis-bid clean-history mashinaga +premium (mas. ×1.15).
- **DoD:** 0-remont 1-ega mashina qimmatroq baholanadi.

### 4.4 CarCheck "original detal" + o'rnatilgan detal tarixi
- **Fix:** Premium CarCheck'ga `installedParts` + original/almashtirilgan ko'rsatish.
- **DoD:** xaridor pullik CarCheck'da detal tarixini ko'radi.

### 4.5 ORZU to'liqligi
- **Gaps:** Top-20 (Top-100 emas) · boshqaning profilini ocholmaydi · myRank foiz emas · per-model "Top-1" = eng eski serial (qiymat-podshoh emas).
- **Fix:** Top-100; reyting qatorini bosish → o'sha o'yinchi garaji (`GarajProfileSheet target`); myRank + "Top N%"; per-model qiymat-podshoh (+ OG alohida).
- **DoD:** Top-100 ko'rinadi · qatorni bosib boshqa garaj ochiladi · foiz ko'rinadi.

### 4.6 Newbie 1-tekshir bepul (har tier)
- **Gap:** faqat 1-Premium bepul.
- **Fix:** birinchi CarCheck (qaysi tier bo'lsa ham) bepul.
- **DoD:** yangi o'yinchi 1-tekshiruvi (oddiy ham) bepul.

---

## FAZA 5 — 🎨 IDENTITY POLISH (ixtiyoriy, his-tuyg'u)

### 5.1 Ism berish (rename)
- **Fix:** `GarajCar.nickname` + rename UI; karta/profil/CarCheck'da ism.
- **DoD:** o'yinchi mashinaga ism qo'yadi, ko'rinadi.

### 5.2 Mashina hikoyasi (flavor)
- **Fix:** acquire/upgrade'da deterministik origin-hikoya ("aeroportdan kelgan Damas").
- **DoD:** har mashina kichik hikoyaga ega.

---

## FAZA 6 — ✅ GO-LIVE GATE

- 6.1 simEconomy **0-violation** (HAMMA mexanika yoqilgan worst-case).
- 6.2 `testGarajP1` + yangi testlar **3× ket-ket yashil**.
- 6.3 Mustaqil **R4 audit** (kod yozMAGAN sub-agent har fix'ni jonli kodga qarshi qayta tekshiradi).
- 6.4 Owner **telefon-QABUL** (har ekran real autentifikatsiyalangan render).
- 6.5 Flag flip: `carupgrade` ON + (xohlasangiz) part mint-event'lar ochiladi.

---

## TARTIB & BOG'LIQLIK

`FAZA 1 (iqtisod)` → `FAZA 2 (zinapoya+scarcity)` → `FAZA 3 (merge/o'lim)` → `FAZA 4 (halollik/ORZU)` →
`FAZA 5 (ixtiyoriy)` → `FAZA 6 (go-live gate)`. Har faza alohida tekshiruv + (kerak bo'lsa) DARK flag.
FAZA 1 + 2 = **minimal jonli-tayyor** (iqtisod sog' + scarcity bor). FAZA 3-4 = reja-to'liqligi. FAZA 5 = bezak.

## ⏱ HAJM (taxminiy)
FAZA 1 ~4 item · FAZA 2 ~4 · FAZA 3 ~4 · FAZA 4 ~6 · FAZA 5 ~2 = **~20 ish bloki**. Har biri qur+test+isbot.
