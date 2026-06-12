# AUDIT.md — T0 RENTGEN (2026-06-12)

**Metodika:** 5 parallel read-only auditor (o'lik kod · sekinlik · xavf · UX · arxitektura) + o'lik-kod da'volariga adversarial qarshi-tekshiruv (dynamic import / callback-string / fetch-path tuzoqlarini hisobga olgan holda). Jami 13 agent, 394 ta o'qish-amali. **Hech bir manba fayl o'zgartirilmadi.**

---

## 1. O'LIK KOD

Tasdiqlangan (2):

| # | Nima | Joy | Isbot |
|---|---|---|---|
| 1.1 | `grantCashback()` + `GrantResult` — legacy, hech qayerdan chaqirilmaydi | `packages/server/src/services/rewardService.ts:50-93` | grep: 3 hit — export qatori + 2 komentariy; static/dynamic import, test — hech biri chaqirmaydi. ~40 qator |
| 1.2 | `POST /api/admin/market/shop` — admin UI'da formasi yo'q | `packages/server/src/api/server.ts:357-364` | adminApi'da metod yo'q, hech qayerdan fetch yo'q (do'kon yaratish hozir qo'lda/skript) |

Tekshirildi — **TIRIK chiqdi** (adversarial verify rad etdi, O'CHIRMANG):
- `/api/admin/link` — `scripts/linkOwner.ts:21` ishlatadi (dev-util).
- `/api/admin/market/listing`, `/api/admin/market/shopmode` — `settleShopsWeekly` uchun operatsion (settlementMode flip), testMarket qamrovida.
- `/api/ai/ask` — bot ichidagi intent zanjirining REST ekvivalenti (bot.ts:513-540 xuddi shu servisni ishlatadi); miniapp integratsiyasi uchun qoldirilgan.
- `/api/family/remove` — backend to'liq ishlaydi, lekin **miniapp api.ts'da `familyRemove()` metodi YO'Q** → UI'dan yetib bo'lmaydi. Bu o'lik kod emas — **UX teshigi** (4-bo'limga ko'chirildi).

**Xulosa:** kodbazada deyarli o'lik kod yo'q — oldingi to'lqinlarda tozalangan. 1.1/1.2 ni o'chirish T2 da 10 daqiqalik ish.

---

## 2. SEKINLIK XARITASI (18 band)

Eng og'irlari:

| # | Muammo | Joy | Yechim | Kutilgan |
|---|---|---|---|---|
| 2.1 🔴 | `/api/me` — rank uchun BUTUN jadval o'qiladi (10k+ satr har chaqiriqda) | `services/memberService.ts:55-57` | `prisma.member.count({ where: { type, points: { gt: mine.points } } })` — count-ahead | **~1.5s → ~50ms**, DB yuk −80% |
| 2.2 🔴 | Sweep ichida har a'zoga 2-3 alohida so'rov (rideGuess + wheelSpin har tick) | `services/bookingNotifier.ts:148-149` | tick boshida `findMany({ memberId: { in } })` batch | sweep **8-12s → 2-4s** |
| 2.3 🔴 | Liga: top-50 dan tashqari foydalanuvchi uchun full-scan | `services/memberService.ts:109-131` | count-ahead (2.1 bilan bir xil usul) | −40% latency |
| 2.4 🟠 | Haydovchi lookup indekssiz (`type, carNumber`) | `bookingNotifier.ts:280-284` + `schema.prisma:66` | `@@index([type, carNumber])` migration | scan → seek (100x+) |
| 2.5 🟠 | `Member.phone` endsWith qidiruvlar indekssiz (corp, transfer, 360) | `schema.prisma:19` | last-9 ni alohida indeksli ustunda saqlash yoki `@@index([phone])` | scan → seek |
| 2.6 🟠 | `CoinTxn(memberId, createdAt)` indeks yo'q — tarix/agregatlar sekin | `schema.prisma:303` | qoplamali indeks `(memberId, createdAt DESC, kind)` | IO −20-30% |
| 2.7 🟠 | `corpReport` — har xodimga 2 so'rov (N+1) | `services/corpService.ts:38-42` | bitta `findMany` + `groupBy` | **2-5s → 0.2-0.4s** |
| 2.8 🟠 | Analitika: kas sahifalari KETMA-KET (40 tagacha) | `services/analyticsService.ts:18-29` | birinchi 5-10 sahifa `Promise.all` (kas rate-limitiga ehtiyot bilan) | **8-20s → 1-2s** |
| 2.9 🟠 | Miniapp: hamma tab eager — bitta 200KB chunk | `miniapp/src/App.tsx:111-119` | `React.lazy()` + Suspense har View | asosiy bundle **−40%** |
| 2.10 🟡 | `buildMe()` — 3 ketma-ket await (streak/wheel/jackpot) | `memberService.ts:86-88` | `Promise.all` | 150ms → 50ms |
| 2.11 🟡 | RideReward oylik countlar indekssiz | `schema.prisma:201` | `@@index([createdAt])` | hisobotlar 1-2s → 0.1-0.3s |
| 2.12 🟡 | Leaflet CDN preconnect yo'q | `miniapp/src/leaflet.ts:10-14` | `<link rel=preconnect>` index.html'da | 3G'da xarita −150ms |
| 2.13 🟡 | Safar tarixi paginatsiyasiz | `miniapp/src/booking.tsx:62-86` | limit 10 + "yana" tugmasi | 50+ safarda DOM −50% |
| 2.14 🟡 | member360 ledger take:30 lekin orderBy'siz barqaror emas | `api/server.ts:632-633` | `orderBy: { id: "desc" }` (bor) + cursor | barqaror sahifa |
| 2.15 🟡 | recentReports kesh 10 daq — peak'da eskiradi | `analyticsService.ts:13-29` | safar yakunida invalidate yoki peak'da TTL 2 daq | yangiroq panel |
| 2.16 🟡 | getMe achievements filtrlanmagan select | `memberService.ts:38` | faqat (code, earnedAt) | kichik IO |
| 2.17 🟡 | admin mashina: groupBy + alohida findMany | `api/server.ts:671-679` | bitta so'rovga birlashtirish | −100-200ms |
| 2.18 🟡 | jonli xarita 30s, jadval avto-refresh yo'q | `admin/App.tsx:125` | live tabda 10s interval | tezroq ko'rinish |

---

## 3. XAVF (17 band)

| # | Xavf | Joy | Stsenariy → Yechim |
|---|---|---|---|
| 3.1 🔴 | **Jackpot pool insert'dan OLDIN talon qilinadi** | `services/cashbackService.ts:64-66 + 71-77` | `claimJackpot()` poolni nolga tushiradi, KEYIN `rideReward.create` duplicate bo'lsa `return null` — pool to'lovsiz YO'QOLADI. Yechim: avval RideReward insert (unique guard), keyin claim |
| 3.2 🔴 | Referral payout tranzaksiyasiz + ride-scoped idem-key emas | `bookingNotifier.ts:334-357` | ikkala grant + `referrerPaidAt` update bitta `$transaction`ga; kalitga bookingId qo'shilsin |
| 3.3 🔴 | Withdraw: kas yiqilsa refund kafolati zaif | `coinService.ts:154-184` | kas debit + coin spend atomik emas; refund grantCoins ham yiqilsa — yo'qotish. Yechim: outbox-pattern yoki retry-jadval |
| 3.4 🔴 | Barter fee race: fee olindi → item g'oyib → faqat bitta tomonga refund yo'li | `tradeService.ts:91-104` | validatsiyani spend'dan OLDIN tugatish; fee'larni accept-tranzaksiya ichiga olish |
| 3.5 🟠 | `requireAdmin` operator-tarmoq: `void promise.then(next)` — async-await emas | `api/server.ts:110-123` | ishlaydi, lekin xato yo'lida res osilib qolishi mumkin; async middleware'ga aylantirish |
| 3.6 🟠 | acceptOffer: status-guard tranzaksiyadan TASHQARIDA | `tradeService.ts:107-119` | guard'ni `$transaction(async tx)` ichiga ko'chirish |
| 3.7 🟠 | buyListedItem: spendCoins tranzaksiyadan tashqarida | `itemService.ts:145-171` | spend + delete + flip + seller-grant bitta tranzaksiya |
| 3.8 🟠 | topUpFromBonus idempotent kalitsiz | `coinService.ts:196-224` | grant'ga idem-key |
| 3.9 🟠 | AI text handler: HAR matnga DB so'rov, per-user rate-limit yo'q | `bot/bot.ts:513-540` | flood himoyasi: per-user 10/daq throttle |
| 3.10 🟠 | Referral xatosi sweep'da indamay yutiladi | `bookingNotifier.ts:359-361` | duplicate'dan boshqa xatoda admin-alert |
| 3.11 🟠 | llmRouter kunlik cap read-modify-write atomik emas | `services/ai/llmRouter.ts` | raw upsert increment (jackpot patterni) |
| 3.12 🟡 | Garaj clamp'lansa log yo'q | `bookingNotifier.ts:267-273` | `g.clamped > 0` logga |
| 3.13 🟡 | Periodik joblar yiqilsa faqat console.error | `index.ts:93-137` | pul-joblar (weekly, settle) xatosida egaga TG alert |
| 3.14 🟡 | Referrer TG xabari yiqilsa retry yo'q (pul o'tgan) | `bookingNotifier.ts:352-354` | warn-log yetarli, hozircha qabul |
| 3.15-17 | mayda: spendCoins balans race (faqat ko'rinish), trade escrow check-then-act (aslida atomik — OK deb tasdiqlandi), sweep per-booking try/catch bor | — | — |

Hardcoded secret kodda topilmadi (hammasi env'da) ✅. Kill-switch barcha pul-mexanikani qoplaydi ✅.

---

## 4. UX DARD XARITASI (24 band)

Yuqori og'irlik:

| # | Dard | Joy | Yechim |
|---|---|---|---|
| 4.1 🔴 | Oila qo'shish `prompt()` bilan — mobilda yomon, validatsiyasiz | `miniapp/booking.tsx:124-126` | Sheet-modal (T1 komponenti) |
| 4.2 🔴 | Savdo taklifi narxi `prompt()` bilan — pul operatsiyasi! | `miniapp/market.tsx:126` | Sheet: raqam input + min/max + preview |
| 4.3 🔴 | Admin broadcast `confirm()` bilan — tasodifiy ommaviy yuborish xavfi | `admin/App.tsx:450` | Modal: qabul qiluvchilar soni + preview |
| 4.4 🔴 | `familyRemove` UI'da YO'Q — qo'shib bo'ladi, o'chirib bo'lmaydi | `miniapp/api.ts` (metod yo'q) | api metod + ro'yxatda ✗ tugma |
| 4.5 🟠 | Silent catch epidemiyasi: garaj/missiya/liga/predict fetch yiqilsa — bo'sh joy yoki abadiy spinner (xato holati YO'Q) | `rewards.tsx:11`, `components.tsx:100,143`, `App.tsx:55,64` va b. | yagona xato-holat: matn + retry tugma |
| 4.6 🟠 | Baho yuborish natijani kutmay "Rahmat" deydi | `booking.tsx:414` | r.ok tekshirish |
| 4.7 🟠 | Transfer telefon-lookup paytida indikator yo'q | `wallet.tsx:82-91` | "Tekshirilmoqda…" |
| 4.8 🟠 | G'ildirak nega aylanmasligini tushuntirmaydi (safar yo'qligida) | `rewards.tsx:193-194` | hint bor lekin spin-bosqichida emas |
| 4.9 🟠 | Chat moderation sababi opaque ("nima taqiq?") | `market.tsx:23` | taqiq ro'yxatini inputda ko'rsatish |
| 4.10 🟡 | 91 ta inline style (miniapp+admin) — T1 dizayn-tizimga to'siq | hamma .tsx | T1 da token/klasslarga ko'chirish |
| qolganlari | bekor-sabablari nomuvofiq matnlar, gap setNote o'chmasligi, server-uyg'onish ekranida timeout yo'qligi, box skeleton'siz... | ro'yxat workflow-natijada | T1/T3 da |

**Bosqich o'lchovi (kod rekonstruksiyasi):** miniapp booking: chip→tasdiqlash hozir 2-3 bosish ✅ (T4 talabiga yaqin); bot booking: 4-5 bosish; eng katta kutish nuqtasi — server cold-start (Render free tier, 15 daq uyqu) — hech qanday UI bunga 5s+ deb mo'ljallanmagan.

---

## 5. ARXITEKTURA QARZI (14 band)

| # | Qarz | Joy | Yechim |
|---|---|---|---|
| 5.1 | **Xudo-fayl:** `api/server.ts` 843 qator — routing+auth+biznes | `api/server.ts:1-843` | domen bo'yicha bo'lish: adminRoutes/bookingRoutes/marketRoutes/memberRoutes |
| 5.2 | **Xudo-fayl:** `admin/App.tsx` 848 qator — hamma tab bitta faylda | `admin/App.tsx` | tabs/ papkaga komponentlar |
| 5.3 | `withMember` vs `withMember2` dublikat | `api/server.ts:89-98` | bittaga birlashtirish (modul boshida) |
| 5.4 | Servislar `bot.api`ni to'g'ridan chaqiradi (test qiyin) | `bookingNotifier`, `gapService`, `notifyService` | notifier-callback inversiyasi |
| 5.5 | 40+ dynamic import tarqoq | `index.ts`, `api/server.ts` | barrel export; lazy faqat og'irlarga |
| 5.6 | Magic numberlar shared/economy'dan tashqarida (CITY_KMH, AI caplar, admin caplar) | `bookingNotifier.ts:14` va b. | shared/limits.ts |
| 5.7 | `as never` / `(window as any).L` tip-teshiklari | `api/server.ts:607`, `booking.tsx:221` | typed FEATURES, leaflet.d.ts |
| 5.8 | Bot callback stringlari markazsiz ("bk:now", "wheel:ride"...) | `bot.ts:282-392` | callbackKeys.ts enum |
| 5.9 | AppState read-modify-write nusxalari (fund, ai-cap, strikes) | `featureFlags.ts`, `llmRouter.ts`, `tradeService.ts` | bitta atomicIncrement util (raw SQL) |
| 5.10 | Test setup/teardown ~300 qator dublikat | `scripts/test*.ts` | testHelpers.ts |
| 5.11 | Route ichida prisma chaqiriqlar (shop update, mashina) | `api/server.ts:374+, 671+` | servisga ko'chirish |
| 5.12-14 | mayda: Sheet/panel JSX takrori miniappda, booking.tsx 17 useState, leaflet global declare yo'q | — | T1/T4 da |

---

## 6. TOP-10 TEZKOR G'ALABA (effekt ÷ mehnat)

| # | Ish | Mehnat | Effekt | Manba |
|---|---|---|---|---|
| 1 | `/api/me` + liga rank → count-ahead | S (30 daq) | eng ko'p bosiladigan endpoint **30x** tez | 2.1, 2.3 |
| 2 | 3 ta indeks migration: Member(type,carNumber) · Member(phone) · CoinTxn(memberId,createdAt) | S | scan→seek hamma issiq yo'lda | 2.4-2.6 |
| 3 | Jackpot claim'ni RideReward insert'dan KEYINGA ko'chirish | S | pul yo'qolish xavfi yopiladi | 3.1 |
| 4 | Sweep batch (rideGuess/wheelSpin in-query) | S | sweep 3x tez, DB yuk −60% | 2.2 |
| 5 | React.lazy tab-split | S | bundle −40%, birinchi ochilish tez | 2.9 |
| 6 | prompt()/confirm() → Sheet (3 joy) | M | 3 ta yuqori UX dard yopiladi | 4.1-4.3 |
| 7 | Silent catch → xato+retry holati (yagona pattern, ~8 joy) | M | "ishlamayapti" sezgisining asosiy manbai | 4.5 |
| 8 | Referral tranzaksiya + ride-scoped idem-key | M | pul-race yopiladi | 3.2 |
| 9 | corpReport + buildMe parallellashtirish | S | B2B hisobot 10x, /me −100ms | 2.7, 2.10 |
| 10 | familyRemove api+tugma | S | yarim-tugallangan funksiya yopiladi | 4.4 |

---

*T1-T8 tiketlari shu audit ustiga quriladi. "RAD ETILDI" bo'limidagi narsalarni o'chirmaslik — ular tirik.*
