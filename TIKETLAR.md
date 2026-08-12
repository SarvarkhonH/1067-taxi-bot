# 🎫 TIKETLAR — 2026-08-11 auditi

7 ta mustaqil agent butun kodbazani ko'rib chiqdi. Har tiket `fayl:satr` isboti bilan.

**⚠️ CHEGARA:** bularning hammasi **KOD** haqiqati. «Bu jonlida ham shundaymi» degan savolga faqat
VPS'dan javob bor — ayniqsa bayroqlar (`AppState` `feature:` qatorlari) va operator tokenlari
(`oprtoken:`). Hech bir tiket «jonlida shunday» deb da'vo qilmaydi.

**✅ = men shaxsan tekshirdim** (agent da'vosi emas, o'z ko'zim bilan ko'rdim).

---

## 🔴 P — PUL (eng oldin)

| # | Nima | Isbot | Nima qilinadi |
|---|---|---|---|
| P1 ✅ | **Yo'l haqi ikki marta to'lanadi.** `transfer()` idempotentlik kalitini YANGI yaratilgan satr id'sidan yasaydi → takror ushlanmaydi. Tugma pul ko'chgandan KEYIN o'chiriladi. | `transferService.ts:266`, `bot.ts:1164-1168` | Kalitni `payfare:<bookingId>` dan yasash; tugmani oldin o'chirish; `fare`/`tip` ga cap |
| P2 ✅ | **Cashout withdraw qorovullarisiz.** `trips`, `riskFlag`, `consumeWithdrawBudget`, `Withdrawal` qatori — **birortasi yo'q**. | `cashoutService.ts:38-66`, `server.ts:552-611`, `bot/cashout.ts:57-170` | withdraw'dagi 4 qorovulni cashout'ga ham; `Withdrawal` qatori yozilsin |
| P3 | **Yakun kartasida BOSHQA safarning narxi** va o'sha summa to'lov tugmasida. `matchFareRow` ga `sinceMs` berilmagan → eng oxirgi to'langan safar olinadi. | `bookingNotifier.ts:759` vs `:930`, `:797` | `sinceMs` uzatilsin; mos kelmasa tugma umuman chizilmasin |
| P4 | **Qisqa safar butun mukofotni yo'qotadi** va «❌ bekor qilindi» deb ko'rsatiladi. `rideStartedAt` talab qilinadi, sweep 15s da bir ko'radi, «started» oynasi jonli o'lchovda 4s. | `bookingNotifier.ts:433`, `index.ts:519`, `booking3.tsx:1104` | Ikkinchi dalil (`meterPayment > 0`) serverda ham qabul qilinsin |
| P5 | `spendCoins` — na tranzaksiya, na idempotent kalit. Ledger yozuvi yiqilsa tanga yechilgan, yozuv yo'q. To'g'ri variant yonida turibdi (`spendCoinsIdempotent`). | `coinService.ts:117-127`, `:136-167` | withdraw idempotent variantga o'tkazilsin |
| P6 | `adminGrantCoins` kaliti **soxta**: `admincoin:<id>:${Date.now()}`. Ikki marta bosish = ikki marta tanga. | `adminOps.ts:281` | Kalit amaliyotdan yasalsin |
| P7 | `adminMoveToBalance` kunlik cap'ni ATAYLAB, lekin ride-gate/riskFlag/**revenue-byudjet**ni ham beixtiyor chetlab o'tadi; `Withdrawal` yozmaydi. | `adminOps.ts:298-348` | Byudjet va iz saqlansin |
| P8 | **`freeSpin` da bayroq YO'Q** — `featureOn` umuman chaqirilmaydi. Kunlik ~78 tanga/odam safarsiz jo'mrak, o'chirish tugmasi yo'q. | `rewardService.ts:190-210`, `server.ts:515` | Kill-switch qo'yilsin |
| P9 | `spinRideWheel` servis darajasida gate'siz — bayroq o'chgan lahzada ochiq tokenlar to'layveradi. Bu naqsh g'ildirak uchun allaqachon tuzatilgan. | `rideWheelService.ts:118` vs `rewardService.ts:129-134` | Servisga gate |
| P10 | Byudjet ikki marta qaytarilishi: kas-fail tarmog'ida jarayon qulasa `retryPendingMoney` byudjetni yana qaytaradi + ikkinchi `Withdrawal` yozadi. | `coinService.ts:334-339`, `:412-419` | Marker bilan bir martalik qilinsin |
| P11 | `resilient()` 3 urinishdan keyin **jim** taslim bo'ladi. Ostida: cashback-roll, waitcomp, vaucher, driver_bonus. Mijoz tangasini olmaydi, hech kim bilmaydi. | `bookingNotifier.ts:43-57`, `:532`, `:559`, `:562`, `:619` | Taslim bo'lganda `alertAdmins` |
| P12 | Baraban tokeni `used:true` qilinadi, KEYIN `grantCoins`. Grant yiqilsa token kuygan, pul yo'q, retry yo'q. | `rideWheelService.ts:128-134` | Teskari tartib yoki retry-marker |
| P13 | **Cashout uchun qaytarish yo'li YO'Q** — ega pulni jo'natmasa tangani qaytaradigan funksiya yozilmagan (withdraw'da bor). | `cashoutService.ts:58-66` | Refund yo'li |
| P14 | `healMember` izsiz — na `CoinTxn` tuzatish qatori, na audit yozuvi. | `reconciliation.ts:62-69` | Iz qoldirilsin |
| P15 | **Kunlik emissiya hisoboti yo'q** — faqat CHIQISH o'lchanadi. 800 odam × 78 tanga freespin ko'rinmas. | `economyService.ts` (getWithdrawBudget) | Kunlik mint hisobi kind-kesimida |

---

## 🔴 X — XAVFSIZLIK

| # | Nima | Isbot | Nima qilinadi |
|---|---|---|---|
| X1 ✅ | **`/api/admin/users` va `/api/admin/linkcode` da `requireOwner` YO'Q** — yonidagi `relink`/`unlink` da bor. Telefon ol → kod ol → botda ulan → hisob seniki. | `server.ts:3782`, `:3796` (vs `:3786`, `:3791`) | `requireOwner` qo'shilsin |
| X2 ✅ | **`"operator"` roliga yo'l cheklovi qo'llanmaydi** — faqat `shopseller`/`chatops` cheklangan. | `server.ts:303-311` | Oq ro'yxat barcha rollarga |
| X3 | initData replay oynasi **7 kun**; nonce yo'q, bekor qilish yo'q. Bir marta oqib chiqqan imzo 7 kun to'liq hisob beradi. | `telegramAuth.ts:29` | Qisqa TTL + jonli yangilash (X4 bilan birga) |
| X4 | Imzo rad etilishi jonlida **loglanmaydi** — hujum ham, buzilish ham bir xil: sukut. | `server.ts:171-174` | Sababni yozish (ID'siz) |
| X5 | `cors()` yalang'och — barcha origin. Cookie yo'qligi uchun hozir zararsiz. | `server.ts:357` | Origin ro'yxati |
| X6 | `linkByPhone` "taken" tekshiruvi tranzaksiyasiz — invariant DB darajasida emas. | `memberService.ts:405-415` | Unique constraint |
| X7 | **`scripts/reset.ts` filtrsiz `telegramUser.deleteMany()`** — jonli bazada yurgizilsa HAMMA uziladi. | `scripts/reset.ts:6` | Qo'riq: prod URL'da ishlashdan bosh tortsin |

---

## 🔴 B — BOT OQIMI UZILGAN

| # | Nima | Isbot | Nima qilinadi |
|---|---|---|---|
| B1 ✅ | **`/naxt` karta yo'li O'LIK.** Telefon-filtri 16 xonali kartani ushlaydi va `next()` chaqirmaydi; karta-tutqichi 895 satr keyin ulanadi. Mijoz kartasini yozadi → ma'ruza oladi → **puli chiqmaydi**. | `bot.ts:680` vs `registerCashout` `bot.ts:1575` | Filtr belgi emas RAQAM sansin (9–13); ulanganni o'tkazsin; `next()` |
| B2 | Ravella «Aloqa raqami» qadami ham shu tuzoqda. | `ravella.ts:296`, `registerRavella` `bot.ts:1591` | B1 bilan birga hal bo'ladi |
| B3 ✅ | **`/taksi` O'LIK.** AI catch-all barcha matnni yutadi (`next` parametri ham yo'q), `/taksi` 53 satr keyin ro'yxatdan o'tgan. Guruhdagi «/taksi yozing» taklifi yolg'on. | `bot.ts:2117` (0 ta `next()`) vs `:2170` | Buyruqlar AI'dan OLDIN ro'yxatdan o'tsin |
| B4 | `/baraban` menyuda, bayrog'i o'chiq → **yolg'on sabab** («safardan keyin 5 daqiqa ichida»). `/reys` bosilsa mutlaqo sukunat. | `bot.ts:2267`, `:1103`, `intercity.ts:73` | Bayroq o'chiq bo'lsa menyudan olinsin |
| B5 | Xodim chek-rasmi yutiladi — javob ham, `next()` ham yo'q. | `bot.ts:535`, `staff.ts:152` | `next()` qo'shilsin |
| B6 | **1067-kod yo'li `completeLink` ni chaqirmaydi** → referal va haydovchi-QR ulushi **hech qachon to'lanmaydi**, referal abadiy "pending". Izoh «ikkalasi bitta funksiyani chaqiradi» deydi — haqiqatga zid. | `bot.ts:656` vs `linkService.ts:6-8, 89-116` | Ikkala yo'l `completeLink` dan yursin |
| B7 | Ilova ichida ulanganda klaviatura olib tashlanmaydi (bot yo'lida bor). | `server.ts:481-483` vs `bot.ts:157` | Removal qo'shilsin |
| B8 | Ulangandan keyin ham «📱 Raqamni ulashish» tugmasi turadi (ega skrinshoti bilan isbotlangan). Mexanizm bahsli: `remove_keyboard` tashigan xabar darrov o'chiriladi. | `bot.ts:150-153` + ega skrinshoti | Removal o'chirilmaydigan xabarga biriktirilsin |
| B9 | `promptLink` izohi «ikkala yo'l taklif qilinadi» deydi, aslida faqat bittasi yuboriladi. | `bot.ts:169-174` | Inline «Boshqa raqam» qo'shilsin |
| B10 | AI enum barcha provayderni sanaydi, lekin `xizmatProvider`/`elonProvider` da `order`/`execute` **yo'q** → mijozga noto'g'ri sabab. | `agent.ts:214,228`, `bot.ts:2030,2056` | Enum faqat `order` bor provayderlardan |
| B11 | Mijoz `pendingReminders` in-memory — bot qayta ishga tushsa «✅ Saqlash» hech narsa qilmaydi, matn ham yo'q. | `bot.ts:1636`, `:1643-1646` | DB'ga |
| B12 | `pushSend` 429/tarmoq xatosi **loglanmaydi** va `notifyService` uni «yuborildi» deb sanaydi. | `pushSend.ts:73`, `notifyService.ts:84` | Log + to'g'ri sanoq |
| B13 | 10 ta bo'sh `catch { }` — buzuq tool-argument jim yo'qoladi, mijoz «anglamadim» oladi. | `agent.ts:466-559` | Log |

---

## 🔴 V — BOT YOLG'ON VA'DA QILADI

Sabab bitta: **har va'da qo'lda yozilgan va bayroqqa bog'lanmagan.**

| # | Qayerda | Nima deydi | Haqiqat |
|---|---|---|---|
| V1 | `linkReminderService.ts:37` | «+5 000 tanga sovg'a» | `welcomebonus` OFF → hech qachon tushmaydi |
| V2 | `bot.ts:1007` (haydovchi QR) | «birinchi safaringiz BEPUL» | `recruit` OFF — haydovchi og'zaki yolg'on aytadi |
| V3 | `bookingNotifier.ts:651` | «yillik katta o'yinda chiptangiz bor» | Garaj o'yini olib tashlangan |
| V4 | `render.ts:357` | «/driver_login bilan ulang» | Bunday buyruq kodda YO'Q |
| V5 | `bot.ts:1910`, `needsEngine.ts:148` | «2000+ tanga» | Haqiqiy qiymat 1500 |
| V6 | `notifyService.ts:151` | «Safarsiz ham tanga yutib oling» | G'ildirak FAQAT safar ichida aylanadi |
| V7 | — | **Ildiz sabab** | `bonusText(flag, knob)` helperi yo'q — bayroq o'chganda matn so'nmaydi |

---

## 🟠 M — QURILGAN, LEKIN MIJOZ KO'RMAYDI

| # | Nima | Isbot |
|---|---|---|
| M1 ✅ | **Xizmatlar + E'lonlar qulflangan.** Bayroqlari ON, butun quvur (67 seed e'lon, moderatsiya, qidiruv) qurilgan. Mehmon Xizmatlarni KO'RADI, ulangan mijoz KO'RMAYDI. | `uy.tsx:411` `FOCUS_MODE = true`, `:470-471`, `App.tsx:407` |
| M2 ✅ | **Restoran buyurtmasi restoranga bormaydi** — `Restaurant` da `ownerChatId` yo'q (do'konda bor), hammasi bitta qattiq yozilgan raqamga. Javob bo'lmasa buyurtma abadiy `pending`. | `bot/restoran.ts:8`, `schema.prisma:595-620` vs `:365` |
| M3 | Restoran o'z menyusini boshqara olmaydi (izohda tan olingan). | `schema.prisma:634` |
| M4 | Tarmoq xatosi «Hali e'lon yo'q» bo'lib ko'rinadi. Do'konda tuzatilgan, uch ekranda qaytgan. | `elonlar.tsx:421`, `:358`, `ravella.tsx:616`, `:357` |
| M5 | Tarmoq xatosi = MANGU SKELET, «qayta urinish» yo'q. | `elonlar.tsx:223`, `restoran.tsx:249`, `ravella.tsx:547` |
| M6 | **Qaytarish (refund) hech bir bozor modulida yo'q** — «yoqmasa olmang» va'dasi bajarilmaydi. | `marketOrderService.ts:173`, `:230` |
| M7 | `stock` 0 ga tushsa mahsulot jimgina yo'qoladi, sotuvchi bilmaydi. | `shopService.ts:49` |
| M8 | Xizmat egasi o'z e'lonini tahrirlay olmaydi. | `server.ts:1189,1195` |
| M9 | E'lon/xizmat egasiga qiziqish haqida xabar bormaydi — faqat sanoq. | `classifiedService.ts:201-206`, `serviceDirectory.ts:233-237` |
| M10 | @username yo'q bo'lsa «Yozish» tugmasi chizilmaydi — O'zbekistonda ko'pchilikda yo'q. | `elonlar.tsx:331` |
| M11 | Do'kon-chat mosligi xotirada — bot restart = suhbat adashadi. | `shopChatService.ts:16,111` |

---

## 🟠 O — O'YIN

| # | Nima | Isbot |
|---|---|---|
| O1 | **Ilova hali ham «Ball muddatga bog'liq emas» deydi** — server esa ballni mavsum bilan kesadi. (Mening regressiyam: `3c72d8e1` da `packages/miniapp/` yo'q.) | `oyin.tsx:484`, `:2284`, `:1366` |
| O2 | `seasonClose()` **hech narsa kuydirmaydi** — ball muzlaydi, nolga faqat ega qo'lda yangi mavsum ochganda tushadi. Avtomatika yo'q. | `oyinService.ts:3280-3316` |
| O3 | **Mijozga ogohlantirish yo'q** — «mavsum tugaydi, ball yonadi» pushi butun kodda yo'q. Yagona signal — ilovani ochgan odam ko'radigan banner. | `oyin.tsx:1335-1339` |
| O4 | **G'olibga xabar bormaydi** — faqat `alertAdmins`. Odam yutganini hech qayerdan bilmaydi. | `server.ts:2502` |
| O5 | `myTickets` javobida `result` maydoni yo'q — karta yutdi/yutmadi mijozga yetmaydi. | `oyinService.ts:1355-1391` vs `:3236` |
| O6 | **Seed katalog yetib bo'lmaydigan narxda** — eng arzon karta ≈350 safarlik, `OYIN_MAX_REALISTIC_BALL = 4000`. Avto-fallback bilan urug'lansa ball saqlashning yagona yo'li yopiq. | `shared/oyin.ts:210+`, `:171`, `oyinService.ts:1042-1047` |
| O7 | `adminAdjustBall` poyga (lock yo'q) + jurnal 50 yozuvda kesiladi — 51-tuzatishdan keyin eng eskisi ballni jimgina tark etadi. | `oyinService.ts:3397-3411` |
| O8 | `touchDays` butunlay o'lik — `for` tanasi bo'sh, 4 marta chaqiriladi. | `oyinService.ts:401-411` |
| O9 | `oyin:home:` ball mijoz so'ziga ishonadi (zarar 20 ball bilan cheklangan). | `server.ts:1695-1701` |
| O10 | Eski `OyinTabLegacy` admin panelda hali turibdi. | `admin/App.tsx:5431` |
| O12 ✅ | **Tiraj muzlatishi GLOBAL.** `FREEZE_KEY = "oyin:freeze"` — bitta kalit (izohda «singleton» deb yozilgan). `buyTicket` muzlatishni qaysi sovg'a ekanidan QAT'I NAZAR tekshiradi → bitta sovg'a tirajiga muzlatilsa **butun o'yinda karta xaridi to'xtaydi**. Minglab sovg'a va navbatma-navbat tiraj bo'lsa — do'kon doim yopiq. | `oyinService.ts:610,615,1591` |
| O13 | Admin paneli `ready` ni `sold >= limit` deb hisoblaydi, server esa `sold >= minSell` — ikki xil haqiqat. | `Kartalar.tsx:36` vs `oyinService.ts:3157` |
| O11 ✅ | **O'tgan mavsum kartasini bekor qilsa ball QAYTMAYDI, lekin sotuv sanog'i kamayadi.** `spent` mavsum oynasidan filtrlanadi, eski chipta oynadan tashqarida — ya'ni u ballga qo'shilmagan, olib tashlansa ham qaytmaydi. Mijoz kartasini bekorga yo'qotadi, to'lib kelayotgan sovg'a esa orqaga tepadi. | `oyinService.ts:1401-1427` (`releaseSoldSlot`) + `:430` (`ms >= fromMs`) |

---

## 🟠 F — BAYROQLAR VA PANEL

| # | Nima | Isbot |
|---|---|---|
| F1 | **5 bayroq DB satri yo'qolsa O'Z-O'ZIDAN YONADI**: `garage`, `gap`, `plus`, `recruit`, `ravellastory` — ikkala ro'yxatda ham yo'q. `recruit` pul to'laydi. | `featureFlags.ts:182`, `:215-287`, `:289-293` |
| F2 | **5 o'lik bayroq** (kodda 0 ta gate): `garage`, `items`, `mahalla`, `tolqin`, `carupgrade`. | grep `featureOn("…")` |
| F3 | `jamoa` `EXPECTED_ON` da yo'q, holbuki V1 jonli — DB reset jim o'chiradi. | `featureFlags.ts:167-170` |
| F4 | `pickup2`/`taxistory` izohi «ega-preview ATAYLAB yo'q» deydi, kodda esa bor. | `featureFlags.ts:126`, `:143` vs `server.ts:442` |
| F5 | **Admin v2 — 24 manzildan 4 tasi ishlaydi**, «Flaglar» ekrani YO'Q. v2 default qilinsa bayroq boshqaruvi yo'qoladi. | `v2/nav.ts`, `AdminV2.tsx:33-63` |
| F6 | 3 ta route panelda umuman chaqirilmaydi. | `server.ts:2039`, `:850`, `:3652` |

---

## 🟠 S — TIZIM

| # | Nima | Isbot |
|---|---|---|
| S1 | **Express 4 + async handler** — rad etilgan promise error-middleware'ga bormaydi: mijoz «Chaqirish» bosadi, hech narsa bo'lmaydi, xato ko'rinmaydi. | `server.ts:242`, `:1830`, `booking3.tsx:1544-1564` |
| S2 | Taksi issiq halqasida 10 ta begona sweep — mijoz haydovchi kutayotganda restoran/ravella/do'kon SLA'lari har 5s yuguradi. | `index.ts:456-513` |
| S3 | Sweep tezligi qulaydi — oldingi sweep band bo'lsa keyingi tik **90 soniyaga** siljiydi. | `index.ts:440-442`, `:519` |
| S4 | `withMemberLock` in-process — ikkinchi nusxa qo'shilsa clamp, kunlik cap va withdraw serializatsiyasi bir vaqtda yiqiladi. Izoh «Render» deydi, infra Contabo'ga ko'chgan. | `coinService.ts:22-27` |
| S5 | `/api/booking/cancel` da rate-limit yo'q (`create`/`now` da bor). | `server.ts:1944` |
| S6 | `setMyCommands` ro'yxati bilan haqiqiy buyruqlar mosligi tekshirilmaydi — `/taksi` o'limi shu sababdan sezilmagan. | — |

---

## Tavsiya etilgan tartib

1. **P1 · P2 · B1 · X1** — pul chiqib ketishi va hisob egallash. Har biri kichik tuzatish.
2. **P3 · P4 · B3 · B6** — mijoz pulini/mukofotini yo'qotadigan yo'llar.
3. **V1–V7** — yolg'on va'dalar to'xtatiladi (V7 ildizni yopadi).
4. **O1** — o'yin matni haqiqatga keltiriladi (ega regressiyasi).
5. **M1** — `FOCUS_MODE` (ega qarori), **M2** — restoran egasiga marshrutlash.
6. Qolganlari.
