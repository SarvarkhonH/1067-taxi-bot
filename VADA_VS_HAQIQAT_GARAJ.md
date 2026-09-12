# VA'DA vs HAQIQAT — GARAJ_PLAN · KAS_PARITET · TAXI_BIRJOYSOURCE_DOD

**Sana:** 2026-09-10 · **Tekshiruvchi:** mustaqil audit agenti (kod YOZILMADI, commit/push YO'Q, VPS/bazaga ULANILMADI)
**Qamrov:** A = `C:\Users\sarva\Desktop\1067 bot` (jonli BirJoy bot) · B = `C:\Users\sarva\Desktop\1067 bot\1067-taxi` (taxi yadrosi)
**Usul:** har da'vo `fayl:qator` yoki NATIJASIZ QAYTGAN QIDIRUV BUYRUG'I bilan. Taxmin YO'Q.

**Status lug'ati (aynan beshta):**
`BAJARILGAN` = kodda bor VA yetib boriladi (ikkalasi isbotlangan) · `YOZILGAN, ULANMAGAN` = kod bor, hech kim chaqirmaydi (bo'sh qidiruv bilan isbot) · `QISMAN` = qaysi yarmi bajarilgani aytiladi · `YO'Q` = qanday qidiruv qilingani ko'rsatiladi · `FLAG BILAN O'CHIQ` = flag nomi aytiladi

---

## ⚠️ 0. BIRINCHI VA ENG MUHIM TUZATISH — GARAJ_PLAN taxi-parkka OID EMAS

**`GARAJ_PLAN.md` (91 KB, 1 758 qator) haydovchi parki / avtopark boshqaruvi haqida EMAS.** U mijoz Mini App ichidagi **mashina-tiklash va qayta-sotish o'yini** (car-restoration + flip mini-game) dizayni: buzilgan Tiko sotib olasan → diagnoz qilasan → ta'mirlaysan → NPC xaridorga sotasan → foyda qilasan. Ikki valyuta (🪙 Tanga + 🏺 Ko'zacha), ustalik daraxti, mahalla ligasi, auksion, prestij.

Hujjatning o'z ta'rifi — `GARAJ_PLAN.md:55`:
> *"You are not a garage owner. You are a person growing into the legendary master mechanic of Koson."*

Ya'ni bu hujjat qolgan ikkitasi (`KAS_PARITET.md`, `TAXI_BIRJOYSOURCE_DOD.md` — haqiqiy taxi dispetcherlik migratsiyasi) bilan **bir loyihada emas**. Quyida u o'zi nima bo'lsa, o'sha sifatida tekshirildi.

## ⚠️ 0b. IKKINCHI TUZATISH — GARAJ "jimgina unutilgan" EMAS

Ega "reja tuzilgan, keyin jimgina unutilgan" deb o'ylaydi. GARAJ uchun bu **noto'g'ri, va haqiqat undan yomonroq/qiziqroq**:

| Bosqich | Sana | Isbot |
|---|---|---|
| Reja yozildi | 2026-06-18 | `GARAJ_PLAN.md` |
| **QURILDI** | 2026-06-18 | commit `1228c63a` *"feat(garaj): GARAJ v2 — deep car-restoration + flip game (W0-W5, dark)"* |
| **JONLI CHIQDI** | 2026-06-18 | `PROGRESS.md:1797` — *"🟢 GO-LIVE … `setFlag.ts garajx on` + `kozacha on` → live DB'da `feature:garajx=on feature:kozacha=on`"* |
| Chuqurlashtirildi | 2026-06-20 | `PROGRESS.md:1804-1815` — post-go-live #1–#11 |
| Ega bekor qildi | 2026-07-02 | `PROGRESS.md:2014` — *"Ega qarori: yengil/tez/buzilmas bot; GARAJ va og'ir o'yin-tizimlar butunlay olib tashlanadi."* → 9 flag OFF |
| **KOD O'CHIRILDI** | 2026-07-02 | commit `d1c84ed1` / `84c2d3b7` — **48 fayl, +51 / −9 728 qator** |
| Flag nomlari o'chirildi | 2026-07-07 | commit `185719a1` — `garajx`/`kozacha`/`motorolami` endi `FeatureName` ham emas |
| Prisma modellari o'chirildi | 2026-07-30 | commit `8acef3f6` — 20 yetim model (⚠️ **jadvallar bazada TURIBDI**) |
| Reja hujjati QAYTARILDI | — | commit `6c2015d8` *"revert: restore GARAJ_PLAN.md"* |

Ya'ni: **reja unutilmagan — u bajarilgan, jonli bo'lgan, keyin ega buyrug'i bilan ongli ravishda o'chirilgan.** Quyidagi jadvaldagi har bir `YO'Q` ning ma'nosi "hech qachon qilinmagan" emas, balki **"qilingan, keyin o'chirilgan"** — va bu farq "Tarixda bormidi?" ustunida aniq ko'rsatilgan. Haqiqatan hech qachon qurilmaganlar §5 «JIMGINA TASHLAB KETILGAN» da alohida sanalgan.

---

## 1. HUJJAT BO'YICHA HALOL XULOSA (foiz + nimaga asoslangani)

### 1.1 `GARAJ_PLAN.md` — **bugungi kodda 0%** · tarixiy cho'qqida **~65%**

Bugungi `main` da GARAJ o'yinining **birorta qatori yo'q**. `computeFlipGrant`, `garajConfig`, `GarajShell`, `ustaKozRank`, `kozacha`, `FEATURE_GARAGE_V3`, `/api/garaj`, `market:demand`, `GarajCar`, `MemberGarajMeta` — **hammasi butun `packages/**` bo'ylab 0 natija** (qidiruvlar §2 jadvalining «Isbot» ustunida). Butun repoda `garaj`/`garage` nomli **bitta ham fayl yo'q** (`git ls-files | grep -iE "garaj|garage"` → faqat `GARAJ_PLAN.md`). Prisma sxemasida faqat **yetim izoh** qolgan: `packages/server/prisma/schema.prisma:1004-1006` — o'chirilgan `garajx` flagiga va o'chirilgan `MemberCar` modeliga ishora qiladi. Foiz asosi: rejadagi ~90 tekshiriladigan va'dadan bugun **3 tasi** kodda (`spendCoinsIdempotent` atomikligi, `WinBurst`, `simEconomy` skeleti) — ularning ikkitasi GARAJ uchun emas, boshqa xususiyatlar uchun yashaydi. **Tarixiy 65%** — o'chirishdan oldingi holat (`d1c84ed1^`) bo'yicha: rejadagi ~28 jadvaldan **19 tasi**, 7 qadamli asosiy sikl to'liq, ustalik daraxti to'liq, 4 uslub + 4 xaridor to'liq, mahalla/prestij/shifr/streak/auksion/bozor to'liq — LEKIN drop-jadvali, buyurtma taxtasi, ta'mir-ish jadvallari, obuna va audio hech qachon qurilmagan.

### 1.2 `KAS_PARITET.md` — **~40%**

Bu hujjat ikki qismdan iborat: (a) 27 metodlik **diagnostika** (o'lchov — hech narsa va'da qilmaydi) va (b) **ish rejasi** (§6: F1.0 to'siqlar, F1.1 B tomonda 13 tiket, F1.2 A tomonda 7 tiket, F1.3 DoD 6 satr) + (c) §5.5 **arxitektura qarori** va 7 ta ko'chirish elementi. Faqat (b) va (c) tekshiriladi. Natija: **B tomonda 13 tiketdan 5 tasi bajarilgan** (`ServiceTokenGuard`, `POST /orders`, `by-phone/active`, `by-phone/history`, `GET /addresses`, `GET /drivers/by-car/:plate` — texnik jihatdan 6 route, 5 tiket), **A tomonda 7 tiketdan 3 tasi + 1 qismi**, **5 to'siqdan 2 tasi yechilgan** (B2 servis-guard ✓, B5 manzil/koordinata ✓), **§5.5 dagi 7 ko'chirish elementidan 0 tasi** bajarilgan. Eng katta gap o'zgarmagan: hujjat "eng muhim to'siq" deb atagan **B1 — mijozning so'mdagi cashback hamyoni** hali ham yo'q (`grep -rni "cashback\|bonus_uzs\|bonus_logs" B` → **0 natija**).

### 1.3 `TAXI_BIRJOYSOURCE_DOD.md` — **~30%**

DoD ning yuragi — 4-mezon: *"27/27 metod implementatsiya qilingan; **birortasi `throw new Error("not implemented")` EMAS**"*. Haqiqat: **27 metoddan 8 tasi implementatsiya qilingan, 19 tasi stub** (`grep -c 'this.notImpl(' packages/server/src/kas/birjoy.ts` → **19**). Ya'ni asosiy o'lchov bo'yicha **8/27 = 29.6%**. 8 ta qabul mezonidan: **3 tasi to'liq isbotlangan** (#1 env enum, #2 tip birlashmasi, #8 flag yoqilmagan), **3 tasi qisman** (#3, #6, #7), **2 tasi yiqilgan** (#4, #5). Parity testi va `birjoy.spec.ts` **umuman yozilmagan** (`find packages -iname "*birjoy*"` → faqat `birjoy.ts`, `birjoy.tsx` (dizayn), `migrateBirjoySeller.ts` — **hech biri test emas**).

---

## 2. GARAJ_PLAN.md — VA'DA vs HAQIQAT

**Umumiy isbot (bir marta, hamma satr uchun amal qiladi):**
```
cd "C:/Users/sarva/Desktop/1067 bot"
git ls-files | grep -iE "garaj|garage"          → faqat GARAJ_PLAN.md
find packages -not -path "*/node_modules/*" -iname "*garaj*" -o -iname "*garage*"   → 0 natija
grep -rni "kozacha" packages/                    → 0 natija
grep -rn "computeFlipGrant\|garajConfig\|GarajShell\|/api/garaj" packages/   → 0 natija
```
**Tarixda bormidi?** ustuni `d1c84ed1^` (o'chirishdan oldingi oxirgi commit) ga qarshi `git grep` bilan o'lchandi.

| # | Va'da (bo'lim) | Status (bugun) | Isbot | Tarixda bormidi? | Gap |
|---|---|---|---|---|---|
| G1 | Eski idle garaj OLIB TASHLANADI (§0 ega qarori) | **BAJARILGAN** | `garageService.ts`, `earnForRide`, `RewardsTab`, `shared/garage.ts` — hammasi o'chirilgan (`d1c84ed1` stat: `garageService.ts −165`, `shared/garage.ts −75`). `grep -rn "garageService\|earnForRide\|RewardsTab" packages/` → **0 natija** | ✓ | Yagona bajarilgan §0 qarori — lekin o'rniga kelgan narsa ham o'chirilgan |
| G2 | Migratsiya/refund/bonus YO'Q (§0, §3 bekor) | **BAJARILGAN** | `grep -rn "migrateGaraj\|garaj_migration_policy\|purchaseCost" packages/` → **0 natija** | ✗ (ataylab) | Reja o'zi bekor qilgan — bajarilgan |
| G3 | Ikki valyuta: Tanga + 🏺 Ko'zacha (§0, §4.4) | **YO'Q** | `grep -rni "kozacha" packages/` → **0 natija**. `KozachaTxn` modeli `eeddc7ca` da o'chirilgan | ✓ (`KozachaTxn` `d1c84ed1^:schema.prisma:747`, kod 8 hit) | Butun ikkinchi valyuta yo'q |
| G4 | Audit B1 — `GarajFlip.saleId @unique`, kalit `flip:{memberId}:{memberCarId}:{saleId}` | **YO'Q** | `GarajFlip` modeli yo'q (`grep "^model GarajFlip" schema.prisma` → 0) | ✓ **bajarilgan edi** — `d1c84ed1^:schema.prisma:716` `saleId String @unique`, izoh `:709-710` | Kod bilan birga o'chdi |
| G5 | Audit B4 — kunlik flip-cap 8000t bitta `$transaction` ichida | **YO'Q** | `grep -rn "FLIP_DAILY_CAP" packages/` → 0 | ✓ **bajarilgan edi** — `d1c84ed1^:packages/shared/src/garajGame.ts:86` `export const FLIP_DAILY_CAP = 8000;` + `garajService.ts:1946` | — |
| G6 | Audit M4 — `computeFlipGrant` cap `Math.min(basePrice*2.5, (acquire+repair)*3.0 + basePrice*0.5)` | **YO'Q** | `grep -rn "computeFlipGrant" packages/` → 0 | ✓ **AYNAN bajarilgan edi** — `d1c84ed1^:garajGame.ts:143`: `const cap = Math.min(p.basePrice * 2.5, (p.acquireCost + p.repairSpent) * 3.0 + p.basePrice * 0.5);` | Audit talab qilgan formula so'zma-so'z yozilgan edi |
| G7 | Audit M1 — demand qayta-hisob `AppState market:demand:nextRecalcAt` bilan | **YO'Q** | `grep -rn "market:demand" packages/` → 0 | ✓ `d1c84ed1^:garajService.ts:2622,2641` | — |
| G8 | Audit M2 — `carsOwnedCount`/`sumCarLevels` denormalizatsiya | **YO'Q** | `grep -rn "carsOwnedCount\|sumCarLevels" packages/` → 0 | ✗ **HECH QACHON** — `git grep "carsOwnedCount" d1c84ed1^` → faqat `GARAJ_PLAN.md:764-765` | 🔴 **Haqiqiy tashlab ketilgan audit-tuzatish** |
| G9 | Audit M3 — mahalla haftalik reset crash-xavfsiz | **YO'Q** | `MahallaWeeklyResult` yo'q | ✓ `d1c84ed1^:schema.prisma:901` | — |
| G10 | Audit M5 — `GarajBazaarListing` raw partial index | **YO'Q** | model yo'q | ✓ model bor edi (`:774`), partial-index shakli tekshirilmadi | — |
| G11 | §2.1 shell slide-up + lazy chunk `GarajShell` | **YO'Q** | `grep -rn "GarajShell\|openGarajShell" packages/` → **0** | ✓ `garaj.tsx` 1 848 qator (`d1c84ed1` stat) | — |
| G12 | §2.1 `FEATURE_GARAGE_V3` flagi bilan cutover | **YO'Q** | `grep -rniE "FEATURE_GARAGE_V3\|garagev3\|garajv3" packages/` → **0** | ✗ — jonlida flag nomi `garajx` bo'lgan (`PROGRESS.md:1797`), `FEATURE_GARAGE_V3` hech qachon mavjud bo'lmagan | Reja nomi hech qachon ishlatilmagan (kosmetik) |
| G13 | §2.2 Shell ichida 5 tab (Garaj/Bozor/Buyurtma/Mahalla/Men) | **YO'Q** | `packages/miniapp/src/App.tsx:58` `type Tab` da `garaj` a'zosi yo'q; jonli tabbar `App.tsx:419-422` = **Uy · Do'kon · Restoran · Profil** | ✓ qisman (Bozor tab `a56fa56d`) | — |
| G14 | §2.2 `GET /api/garaj/state` bitta round-trip | **YO'Q** | `grep -rn "/api/garaj" packages/server/src` → **0** | ✓ | — |
| G15 | §2.3 Workshop Action chip (kunlik bepul ish) | **YO'Q** | `grep -rn "garaj:free_action\|workshopAction\|craftsman" packages/` → **0** | ✓ qisman — bitta umumiy usta-slot `GarajCraftJob` bilan (`PROGRESS.md:1808`) | Reja "kunlik BEPUL" degan; jonli versiyada oldindan to'lov bo'lgan |
| G16 | §2.3 Offline box chip + `POST /api/garaj/collect-box` | **YO'Q** | `grep -rn "collect-box" packages/` → **0** | ✓ (`PROGRESS.md:1792` "offline quti ≤75/kun") | — |
| G17 | §4.1 7 qadamli sikl FIND→DIAGNOSE→…→GROW | **YO'Q** | butun `garajService.ts` (2 817 qator) o'chirilgan | ✓ to'liq (`PROGRESS.md:1789`) | — |
| G18 | §4.1 Sourcing Board (3 karta, kunlik) | **YO'Q** | `grep -rn "SourcingBoard" packages/` → **0** | ✓ (`PROGRESS.md:1806` da bozor/manba) | — |
| G19 | §4.2 Usta Ko'z ranki 0–100 | **YO'Q** | `grep -rn "ustaKoz" packages/` → **0** | ✓ `git grep -c ustaKozRank d1c84ed1^` → **5** | — |
| G20 | §4.2 Timing mini-o'yin (yashil zona, EXCELLENT/GOOD/…) | **YO'Q** | — | 🟡 qisman — `git grep -c "timing" d1c84ed1^` → **8** (reja darajasidagi to'liq bar emas) | — |
| G21 | §4.2 4-shoxli ixtisoslik daraxti (Muhandis/Kuzovchi/Savdogar/Kollektsioner) | **YO'Q** | — | ✓ to'liq — `muhandisXp` 6, `kuzovchi` 14, `savdogar` 11, `kollektsioner` 9 hit | — |
| G22 | §4.3 4 uslub (QUICK_FLIP/FULL_RESTORE/TUNING/PERIOD_CORRECT) | **YO'Q** | `grep -rn "QUICK_FLIP\|FULL_RESTORE\|PERIOD_CORRECT" packages/` → **0** | ✓ to'liq — 10/13/9/11 hit | — |
| G23 | §4.3 4 xaridor arxetipi + `BUYER_STYLE_MATCH` | **YO'Q** | `grep -rn "BUYER_STYLE_MATCH\|STYLE_BASE_MULT" packages/` → **0** | ✓ — `d1c84ed1^:garajGame.ts:127` `BUYER_STYLE_MATCH[p.buyerArchetype][p.style]`; `COLLECTOR` 9, `NEWLYWED` 7 | — |
| G24 | §4.4 `grantKozacha` faqat sweep'da + CI lint (`.husky/pre-push`) | **YO'Q** | `grep -rn "grantKozacha" packages/` → **0**; `.husky/` da bunday lint yo'q | 🟡 Ko'zacha bor edi (5 hit), **lekin CI lint hech qachon qo'shilmagan** | 🔴 Lint-himoya hech qachon qurilmagan |
| G25 | §4.4 Ko'zacha do'koni (7 mahsulot: FLIP_BOOST, TURBO_ENGINE, …) | **YO'Q** | — | ✗ **HECH QACHON** — `git grep "KOZACHA_FLIP_BOOST\|PART_TURBO_ENGINE" d1c84ed1^` → 0 | 🔴 Ko'zacha ishlab topilardi, sarflanmasdi |
| G26 | §4.5 `computeDemandMultiplier` sigmoid formulasi | **YO'Q** | `grep -rn "computeDemandMultiplier" packages/` → **0** | ✗ **HECH QACHON** — `git grep -c computeDemandMultiplier d1c84ed1^` → **0** (talab bor edi: `demand` 33 hit, lekin bu formula emas) | 🔴 Reja formulasi hech qachon yozilmagan |
| G27 | §4.5 `GarajRideStats` jadvali (CoinTxn skanini almashtiruvchi) | **YO'Q** | model yo'q | ✗ **HECH QACHON** — `d1c84ed1^:schema.prisma` da `GarajRideStats` yo'q | 🔴 Red-Team MAJOR-4 tuzatishi hech qachon qurilmagan |
| G28 | §4.5 Bazaar P2P (claim-before-pay, 3% soliq, self-buy blok) | **YO'Q** | `GarajBazaarListing` yo'q | ✓ to'liq — `d1c84ed1^:schema.prisma:774`; `PROGRESS.md:1784` "#6 Detal-bozori P2P (claim-before-pay + 3% burn + self-trade blok)" | — |
| G29 | §4.5 Yopiq-taklif auksioni + anti-snayp | **YO'Q** | — | ✓ `GarajAuction`/`GarajAuctionBid` (`:793`,`:808`), `auction` 49 hit | — |
| G30 | §4.5 `GarajCounterOffer` / Haggling Window | **YO'Q** | — | ✗ **HECH QACHON** — `git grep -c GarajCounterOffer d1c84ed1^` → **0** | 🔴 |
| G31 | §4.5 `GarajPriceAlert` narx-ogohlantirish | **YO'Q** | — | ✗ **HECH QACHON** — 0 hit | 🔴 |
| G32 | §4.6 5 garaj darajasi + tier-unlock marosimi | **YO'Q** | — | ✓ `a4c0f2f8` *"#10 tier-unlock ceremony + synthesized fanfare"* | — |
| G33 | §4.6 Prestij sikli (max 5, `prestigeMultiplier` ≤1.25) | **YO'Q** | — | ✓ `prestige` **62 hit** — eng chuqur qurilgan qism | — |
| G34 | §4.7 Drop-jadvali 9 turli (PART_COMMON/RARE, GUEST_CAR, BARN_FIND, LEGENDARY_PART…) | **YO'Q** | — | ✗ **DEYARLI HECH QACHON** — `PART_COMMON` 0, `PART_RARE` 0, `GUEST_CAR` 0, `CUSTOMER_VISIT` 0, `BARN_FIND` 0, `LEGENDARY_PART` 0 hit. Faqat `TOWED` **5 hit** (`a1193924` *"#4 Yo'l sovg'alari"*) | 🔴 **9 drop turidan faqat 1 tasi qurilgan** |
| G35 | §4.7 `GarajRideDrop(memberId,bookingId)` UNIQUE idempotensiya | **YO'Q** | model yo'q | ✓ `d1c84ed1^:schema.prisma:730`; `PROGRESS.md:1793` unique-win gate | — |
| G36 | §4.8 Mahalla ligasi (`MahallaGroup`, 20-cap, haftalik reset) | **YO'Q** | `MahallaGroup*` modellari `8acef3f6` da o'chirilgan. ⚠️ Bugungi `schema.prisma:427` dagi `Mahalla` — bu **manzil katalogi** (39 real mahalla, `seedMahalla.ts`), liga emas | ✓ (`:876`,`:888`,`:901`) | Nom bir xil, narsa boshqa — chalkashmaslik kerak |
| G37 | §4.8 Ikki tomonlama referral (ikkovi ham OEM qism oladi) | **YO'Q** | — | ✗ **HECH QACHON** — `git grep "GarajPartDrop\|referral_bonus" d1c84ed1^` → 0 | 🔴 Reja buni *"primary social hook"* deb atagan |
| G38 | §4.9 Kechirimli streak (freeze/zaxira g'ildirak, ladder 3/5/7/14/30) | **YO'Q** | `GarajStreak` yo'q. ⚠️ Bugungi `schema.prisma:803` dagi `Streak` — **kunlik check-in** streaki (`freezeAvailable` maydoni YO'Q) | ✓ `d1c84ed1^:schema.prisma:864` `GarajStreak` + `freezeAvailable` 11 hit | — |
| G39 | §4.9 Kunlik shifr (server-side urinish hisoblagichi, 5-lockout) | **YO'Q** | — | ✓ `cipher` **32 hit** | — |
| G40 | §4.9 `GarajWeeklyEvent` + `GarajCalendar` | **YO'Q** | — | ✓ `WeeklyEvent` 14 hit (`PROGRESS.md:1796` R7-tuzatish buni tasdiqlaydi) | — |
| G41 | §4.9 5 ta mavsumiy event (Navruz/Ramadan/Mustaqillik/Qish/Hamjamiyat) | **YO'Q** | — | 🟡 qisman — `seasonal` 17 hit, `Navruz` **2 hit**; `PROGRESS.md:1792` faqat "Navro'z/Qish" | 3 mavsum hech qachon qurilmagan |
| G42 | §4.10 6 ta `.ogg` audio fayli (≤41KB gz) | **YO'Q** | — | ✗ **HECH QACHON** — `git ls-tree -r --name-only d1c84ed1^ \| grep -i "\.ogg\|\.mp3"` → **0 fayl**. O'rniga `a4c0f2f8` *"synthesized fanfare"* | 🔴 Butun audio quvuri qurilmagan |
| G43 | §4.10 `WinBurst` qayta-ishlatish (sm/md/lg) | **BAJARILGAN** (lekin GARAJ uchun emas) | `packages/miniapp/src/rewards.tsx:14` `export function WinBurst(...)`; chaqiriladi `homeGames.tsx:33`, `rewards.tsx:356` | ✓ | Komponent tirik — spin/quti uchun; GARAJ'dan oldin ham bor edi (`2a0bb4df`) |
| G44 | §4.11 90-soniyalik FTUE (5 qadam, `telegramUserId` kalitli grant) | **YO'Q** | — | ✓ `PROGRESS.md:1789` "FTUE (90s, bir martalik +80 grant, telegram-id keyed multi-akkaunt himoya)" | — |
| G45 | §4.12 Battle Pass "Usta Obunasi" 4 000t/oy | **YO'Q** | — | ✗ **HECH QACHON** — `git grep -c "UstaSubscription\|Obunasi" d1c84ed1^` → **0** | 🔴 |
| G46 | §5 `spendCoinsIdempotent` = `updateMany` + `coinTxn.create` BITTA `$transaction` da | **BAJARILGAN** | `packages/server/src/services/coinService.ts:136`. Chaqiruvchilar (yetib boriladi): `cashoutService.ts:62`, `driverDebtService.ts:96`, `intercityService.ts:269` | ✓ | Rejadan qolgan yagona tirik infratuzilma |
| G47 | §5 Redis/Socket.IO ga bir fayllik almashish yo'li | **YO'Q** | `grep -rn "redlock\|Redlock" packages/` → 0 | ✗ (shart-bog'liq, hech qachon ishga tushmagan) | — |
| G48 | §6 ~28 yangi Prisma jadvali | **YO'Q** | `grep -n "^model Garaj" schema.prisma` → **0**. Yagona qoldiq: yetim izoh `schema.prisma:1004-1006` | 🟡 **19/28** — `d1c84ed1^:schema.prisma` da: `MemberGarajMeta:629`, `GarajCar:656`, `GarajFlip:711`, `GarajRideDrop:730`, `KozachaTxn:747`, `MemberMechanicSkill:760`, `GarajBazaarListing:774`, `GarajAuction:793`, `GarajAuctionBid:808`, `GarajPart:825`, `GarajPartListing:845`, `GarajStreak:864`, `MahallaGroup:876`, `MahallaGroupMember:888`, `MahallaWeeklyResult:901`, `GarajHallOfFame:913`, `GarajExhibitionEntry:924`, `GarajExhibitionVote:938`, `GarajCraftJob:953` | Qurilmaganlar: `GarajRepairJob`, `GarajRepairTask`, `GarajRepairResult`, `GarajRideStats`, `GarajOrder`, `GarajCounterOffer`, `GarajDemandEvent`, `GarajTraderRep`, `GarajNpc`, `GarajSeasonProgress`, `GarajMuseum`, `GarajCalendar`, `GarajPriceAlert`, `MemberCosmetic`, `MemberReputation`, `UstaSubscription` |
| G49 | §7.8 XP-farming himoyasi: `GarajRepairResult @@unique([jobId, taskCode])` | **YO'Q** | — | ✗ **HECH QACHON** — `GarajRepairResult` modeli `d1c84ed1^` sxemasida yo'q | 🔴 Red-Team MAJOR-3 tuzatishi hech qachon qurilmagan |
| G50 | §8 Phase 1 DoD #11 — `simEconomy.ts` flip-yo'li + `flipGrantDaily` statistikasi | **QISMAN** | `simEconomy.ts` **bor va CI'da yuradi** — `packages/server/src/scripts/simEconomy.ts`, `.github/workflows/ci.yml:47`. **LEKIN** garaj/flip/Ko'zacha ssenariylari o'chirilgan (`d1c84ed1` stat: `simEconomy.ts −113 qator`); `DAMAS_HEAVY_KOZACHA` yo'q | ✓ | Skelet tirik, GARAJ qismi o'chgan |
| G51 | §8 Phase 1 DoD #17 — garaj chunk ≤80KB gz | **YO'Q** | chunk yo'q | ✓ **bajarilgan edi** — `PROGRESS.md:1795` "garaj chunk 17.7KB/6KB-gz (≤80KB DoD)" | — |
| G52 | §8 Phase 1 DoD #19-#20 — R4 mustaqil audit + ega QABUL real telefonda | **QISMAN** | R4 bajarilgan (`PROGRESS.md:1795` "R4 mustaqil audit … 8/8 savol SAFE"), **lekin R6 (ega QABUL) ataylab o'tkazib yuborilgan** — `PROGRESS.md:1797`: *"owner global ochishni AVTORIZATSIYA qildi (R6 QABUL-first qadamini ataylab o'tkazib …)"* | ✓ | 🔴 O'yin ega telefonida qabul qilinmasdan jonli chiqarilgan — 14 kundan keyin butunlay o'chirilgan |

**GARAJ yakuni:** 52 tekshirilgan va'dadan bugun **2 tasi BAJARILGAN** (G1 eski garajni olib tashlash, G46 `spendCoinsIdempotent`) + 1 begona (G43 `WinBurst`) + 2 QISMAN (G50, G52) → **bugungi kodda ~4%**, mazmunan **0%** (o'yinning o'zi yo'q). Tarixiy cho'qqi ~65%.

---

## 3. KAS_PARITET.md — VA'DA vs HAQIQAT

### 3.1 §6 F1.0 — «To'siqlar» (kod yozishdan OLDIN ega qarori kerak edi)

| # | To'siq (§6 F1.0) | Status | Isbot | Gap |
|---|---|---|---|---|
| B1 | Mijozning so'mdagi cashback hamyoni B'da yo'q | **YO'Q** | B'da: `grep -rni "cashback" --include=*.ts --include=*.sql .` → **0 natija**; `grep -rn "bonus_uzs\|bonusUzs"` → **0**; `grep -rn "bonus_logs"` → **0**. `packages/db/src/schema/clients.ts` to'liq ustun ro'yxatida `bonus_uzs` yo'q (eng yaqini `balls:20`, `totalBalls:21` — boshqa valyuta) | 🔴 **Eng katta to'siq o'zgarmagan.** DoD §5c "tanga metodlari A ichida hal bo'ladi" degan yechimni tanlagan — **lekin u ham yozilmagan** (3 metod ham `notImpl`) |
| B2 | Servis-servis autentifikatsiyasi yo'q | **BAJARILGAN** | `1067-taxi/apps/api/src/common/guards/service-token.guard.ts:15` `export class ServiceTokenGuard implements CanActivate`; fail-closed `:20` (`if (!expected \|\| expected.length < 32)`); testi `service-token.guard.spec.ts` (37 qator, 4 holat). A tomonda mos: `packages/server/src/kas/birjoy.ts:65` `"x-service-token": this.config.serviceToken` | Yagona to'liq yechilgan to'siq |
| B3 | Ikkita Telegram bot (B'ning `@koson1067bot` mijoz oqimi) | **FLAG BILAN O'CHIQ** (env, kod emas) | `1067-taxi/apps/api/src/modules/telegram/telegram.service.ts` — **hali ham 1 212 qator**, buyurtma yaratadi `:1161` (`this.orders.createOrder(client.id, …)`). Faqat env bilan o'chadi: `:131-133` `const token = this.cfg.get('TELEGRAM_BOT_TOKEN'); … 'TELEGRAM_BOT_TOKEN not set — Telegram bot disabled'`, `:152` `new TelegramBot(token, { polling: true })` | Kod olib tashlanmagan. Bitta env o'zgarishi ikkinchi mijoz-oqimini qayta yoqadi → ikkita mijoz identifikatori xavfi saqlanib qolgan |
| B4 | Identifikatorlarni bog'lash (`Member.kasId` ↔ `clients.id`) | **YO'Q** | `BirJoySource` hamma joyda telefon ishlatadi (`birjoy.ts:161,190,206`), `kasId` ↔ `clients.id` xaritasi hech qayerda yo'q. B'da `phoneNorm` tushunchasi ham yo'q: `grep -rn "phoneNorm\|phone_norm" B` → **0**; moslash aniq `eq(clients.phone, phone)` (`orders.service.ts:647`) | 🔴 A telefonlarni normallashtiradi, B aniq mos kelishni talab qiladi → format farqi = topilmagan mijoz |
| B5 | Manzil vs koordinata (`pickupLat/Lng` majburiy edi) | **BAJARILGAN** | `1067-taxi/apps/api/src/modules/orders/dto/orders.dto.ts:45-71` — `CreateServiceOrderDto`: `phone` majburiy `:47`, `pickupAddress` majburiy `:50`, `addressId?` `:54`, `pickupLat?` `:58`, `pickupLng?` `:62` — **koordinatalar ixtiyoriy**. Xizmat `orders.service.ts:110-116` `addressId` dan katalogdan koordinata oladi | Yechildi |

### 3.2 §6 F1.1 — B tomonda qo'shiladigan endpoint/ustunlar (13 tiket)

| P | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| P0 | `ServiceTokenGuard` + `SERVICE_TOKEN` env | **BAJARILGAN** | `service-token.guard.ts:15`. **Yetib boriladi:** 4 route — `orders.controller.ts:21,28,35` va `drivers.controller.ts:17` | Faqat 4 route himoyalangan; qolgan hammasi admin/initData guard ostida → `BirJoySource` ularga kira olmaydi |
| P0 | `POST /orders` — mijoz buyurtmasi route'i | **BAJARILGAN** | `orders.controller.ts:22` `@Post()` → `createServiceOrder`; xizmat `orders.service.ts:103` (`findOrCreateByPhone` + `addressId`→koordinata) | ⚠️ DTO'da **`requirementIds` YO'Q** (reja aynan uni so'ragan edi) → A'ning qo'shimcha-xizmatlari (bagaj, DAMAS…) buyurtmaga yetib bormaydi |
| P0 | `clients.bonus_uzs` + `bonus_logs` + `POST /clients/bonus` | **YO'Q** | `grep -rn "bonus_uzs\|bonus_logs" B` → **0**. `clients.controller.ts` (61 qator) da **birorta `@Post()` yo'q** (faqat `@Get()` :11, `@Get(':id')` :28, `@Patch(':id')` :33, `@Get(':id/orders')` :44, `@Get(':id/loyalty')` :57) | 🔴 B1 to'sig'ining bevosita natijasi. 5 metodni bloklaydi (#17,#18,#23,#1,#2) |
| P0 | `orders.cashback_uzs` ustuni | **YO'Q** | `packages/db/src/schema/orders.ts` to'liq ustun ro'yxatida yo'q (`additionalPaymentUzs:75`, `commissionUzs:86` bor, cashback yo'q); `grep -rni "cashback" B` → **0** | 🔴 5 metodni bloklaydi (#11,#12,#15,#9,#10). `BirJoySource.getRideHistory` shuning uchun `cashback: 0` qattiq yozadi (`birjoy.ts:198`) |
| P1 | `GET /orders/by-phone/active` + `/history` | **BAJARILGAN** | `orders.controller.ts:29,36` (ikkalasi `ServiceTokenGuard`); xizmat `orders.service.ts:652,659`; telefon topilmasa `null`/`[]` (`:645` — o'qish hech qachon mijoz yaratmaydi) | ⚠️ `history` da **haydovchi join YO'Q** (`orders.service.ts:704-729` faqat `driverId`) → `birjoy.ts:195` `carNumber: ""`, `carModel: ""` |
| P1 | `GET /orders/active` javobiga `phoneNorm` + `clientBonus` + `notifiedCount` | **YO'Q** | `grep -rn "phoneNorm\|clientBonus\|notifiedCount" B` → **har biri 0 natija** | 🔴 A'ning `bookingNotifier` sweep'i a'zoni aynan `phoneNorm` bilan topadi → `listActiveBookings` migratsiya qilinmaydi |
| P1 | `GET /addresses` — to'liq katalog | **BAJARILGAN** | `addresses.controller.ts:9` `@Get()` `getAll`, limit 1..1000 (default 500); xizmat `addresses.service.ts:47`. Guardsiz (ochiq) | A tomonda ulangan: `birjoy.ts:121-126` |
| P1 | `GET /drivers/by-car/:plate` | **BAJARILGAN** | `drivers.controller.ts:18` (`ServiceTokenGuard` :17); xizmat `drivers.service.ts:18-35`, raqamni normallashtiradi (`:19`) | ⚠️ **Jonli joylashuv YO'Q** (lat/lng tanlanmaydi; `drivers` jadvalida geometriya ustuni izohga olingan — `schema/drivers.ts:46`), **`debt` YO'Q**, **`cancels` YO'Q** (`grep "cancel" schema/drivers.ts` → 0) |
| P2 | `settings` ga `COMPANY_NAME`/`DISPATCHER_PHONES`/`CITY_CENTER_*` seed | **YO'Q** | `grep -rn "COMPANY_NAME\|DISPATCHER_PHONES\|CITY_CENTER" B` → **har biri 0**. `settings.service.ts:7-17` `DEFAULT_SETTINGS` = 9 kalit, hammasi dispatch/narx | `getCompanyInfo` (A'da **5 jonli chaqiruv**) migratsiya qilinmaydi |
| P2 | `GET /admin/dashboard` ga `completedYesterday` + `bookingsYesterday` | **YO'Q** | `admin.service.ts` — `completedYesterday` **hisoblanadi** (:38, so'rov :61-66) lekin javobga chiqmaydi; `:96` `completedDelta: diffPct(completedToday, completedYesterday)` — xom qiymat foizga aylantirilib **tashlanadi**. Javob bloki `:89-108`. `bookingsYesterday` → **0 natija** | `getMainReport` (3 jonli chaqiruv, revenue-byudjetni boshqaradi) migratsiya qilinmaydi |
| P2 | `GET /drivers/outreach/list` ga `lastRideAt`/`cancels`/`licenseTerm` join | **YO'Q** | `drivers.service.ts:337-351` — 13 ustun, uchtasi ham yo'q. Ustunlar `drivers` jadvalida **umuman mavjud emas** (`grep "lastRideAt\|cancel\|licenseTerm" schema/drivers.ts` → 0) | `listDriverRoster` migratsiya qilinmaydi |
| P3 | `orders` ga uch bo'lakli qo'shimcha to'lov ustunlari | **YO'Q** | `schema/orders.ts:75` faqat `additionalPaymentUzs` (bitta yig'indi) | Ega qarori kutilmoqda (§8 savol 5) — javob berilmagan |
| P3 | Taximetr o'qish route'i `GET /orders/:id/meter` | **YO'Q** | `@(Get\|Post)\(['"][^'"]*meter` butun `apps/` bo'ylab → **0 natija**. `taximeter.service.ts:104` o'qish metodi bor, **hech qanday HTTP route uni ochmaydi** | `meterPayment`/`meterDistance` (haydovchi hisoboti) migratsiya qilinmaydi |

**B tomoni: 13 tiketdan 5 tasi BAJARILGAN (38%).**

### 3.3 §6 F1.2 — A tomonda qilinadigan ishlar (7 tiket)

| P | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| P0 | `env.KAS_MODE` → `z.enum(["mock","live","birjoy"])` | **BAJARILGAN** | `packages/server/src/env.ts:29` `KAS_MODE: z.enum(["mock", "live", "birjoy"]).default("mock")` + `:30-31` `KAS_BIRJOY_URL`, `KAS_SERVICE_TOKEN` | — |
| P0 | `KasDataSource.name` birlashmasini kengaytirish | **BAJARILGAN** | `packages/server/src/kas/types.ts:211` `readonly name: "mock" \| "live" \| "birjoy";`. Ogohlantirilgan `ds.name !== "live"` tekshiruvlari saqlanib qolgan va xavfsiz: `scripts/reverseOurDebtBug.ts:14`, `scripts/testDebtViaPlastik.ts:15`, `scripts/verifyKasNameWrite.ts:16`, `services/memberService.ts:85` | — |
| P0 | `getDataSource()` uchinchi shox | **BAJARILGAN** | `packages/server/src/kas/index.ts:24-28` `else if (env.KAS_MODE === "birjoy") { cached = new BirJoySource({...}) }` | Unit testi yo'q (DoD #3) |
| P0 | **`BirJoySource` — 27 metod**, `KasLiveSource` naqshi bo'yicha (chokepoint + **navbat + pacing + keshlash**) | **QISMAN** | Chokepoint ✓ `birjoy.ts:49-74`. **Navbat/pacing/kesh/retry YO'Q** — solishtiring: `kas/client.ts:147` `private queueTail`, `:161` `enqueue`, `:165` start-to-start spacing, `:208,223` 429-retry, `:459` `cached(...)`, `:256` `recordKas` salomatlik telemetriyasi. `birjoy.ts` da bularning **birortasi ham yo'q** (`grep -n "queue\|cache\|429\|retry" birjoy.ts` → 0) | 🔴 27 dan 8 metod (§4 jadval). Ustiga rate-limit qalqoni, kesh va salomatlik signali yo'q |
| P1 | Shoxobchadan lug'at qatlamini ko'chirish (`packages/shared/src/dispatch.ts` + 20 test) | **YO'Q** | `ls packages/shared/src/dispatch.ts` → **No such file or directory**. `grep -rn "dispatchBookingId\|dispatchToBookingStatus\|parseFareInput\|dispatchFarePresets\|dispatchEtaMin\|canTransition" packages/*/src` → **faqat bitta IZOH**: `birjoy.ts:166` *"(dispatchToBookingStatus, salvaged per §4) is a follow-up"* | 🔴 Hujjat buni "F1 uchun BARIBIR KERAK" degan (id-fazo to'qnashuvi `CoinTxn` kalitlarini buzadi). Bajarilmagan |
| P1 | `scripts/testBirjoyParity.ts` — 27 metod uchun shakl testi | **YO'Q** | `find packages -iname "*birjoy*"` → `birjoy.ts`, `design/birjoy.tsx`, `migrateBirjoySeller.ts` — **hech biri test emas**. `grep -rn "testBirjoyParity" packages/` → **0**. `grep -rn "BirJoySource" packages/*/src` → faqat `birjoy.ts` va `index.ts` (test fayli yo'q) | 🔴 |
| P2 | Narx kalkulyatorini `GET /orders/estimate` ga ko'chirish | **YO'Q** | `grep -rn "orders/estimate" packages/` → 0. B'da route bor va guardsiz (`orders.controller.ts:138`), lekin A undan foydalanmaydi | — |

**A tomoni: 7 tiketdan 3 tasi BAJARILGAN + 1 QISMAN (~50%).**

### 3.4 §5.5 — «B g'olib, A shoxobchasi lug'at sifatida saqlanadi» qarori (7 element)

| Element | Va'da | Status | Isbot |
|---|---|---|---|
| `dispatchBookingId` id-fazosi (`900_000_000 + id`) | A shoxobchasidan ko'chiriladi | **YO'Q** | `grep -rn "dispatchBookingId\|900_000_000" packages/*/src` → **0** |
| `dispatchToBookingStatus` status-adapteri | ko'chiriladi | **YO'Q** | yuqoridagi qidiruv → 0 (faqat `birjoy.ts:166` izohi) |
| `canTransition` / `dispatchRiderCancellable` | ko'chiriladi | **YO'Q** | 0 natija |
| `dispatchFarePresets` / `parseFareInput` / `dispatchEtaMin` | ko'chiriladi | **YO'Q** | 0 natija |
| `DriverShift`/`DispatchRide`/`DispatchOffer` Prisma jadvallari | **TASHLANADI** | **YO'Q (tashlanmagan ham)** | Shoxobcha hali ham bor: `git rev-parse origin/claude/taxi-system-drivers-bsa05f` → `2ceb737d…`. CLAUDE.md qoidasi bo'yicha o'chirilishi kerak edi |
| `owndispatch` kill-switch B'ga ko'chadi | ko'chiriladi | **YO'Q** | A'da: `grep -rn "owndispatch" packages/*/src` → **0**. B'da: `owndispatch\|kill.?switch\|featureFlag\|DISPATCH_ENABLED` → **No matches found** |
| §7b xavfsizlik: B'ning `.git/config` da ochiq GitHub token | bekor qilinsin | **YO'Q** | `grep -c "ghp_" "1067-taxi/.git/config"` → **1** (hali ham diskda ochiq matnda) |

**§5.5: 7 elementdan 0 tasi (0%).**

---

## 4. `BirJoySource` — 27 METOD JADVALI (asosiy o'lchov)

**Isbot buyruqlari:**
```
grep -c 'this.notImpl(' packages/server/src/kas/birjoy.ts        → 19
grep -o 'this\.notImpl("[a-zA-Z]*")' packages/server/src/kas/birjoy.ts | sort   → 19 nom (quyida)
```
Interfeys manbai: `packages/server/src/kas/types.ts:210-276`. Implementatsiya: `packages/server/src/kas/birjoy.ts`.

### **8 IMPLEMENTATSIYA QILINGAN / 19 STUB**

| # | Metod | Holat | `birjoy.ts` qator | B endpointi (bor/yo'q) | Sifat izohi |
|---|---|---|---|---|---|
| 1 | `fetchMembers` | ⛔ **STUB** | `:156` | — | — |
| 2 | `fetchByPhone` | ⛔ **STUB** | `:157` | — | — |
| 3 | `checkClient` | ⛔ **STUB** | `:158` | `GET /operator/client/lookup` bor, lekin `AdminAuthGuard` ostida | 6 jonli chaqiruv yiqiladi |
| 4 | `searchAddresses` | ✅ **IMPL** | `:114-119` | ✅ `addresses.controller.ts:16` (guardsiz) | To'liq |
| 5 | `getAllAddresses` | ✅ **IMPL** | `:121-126` | ✅ `addresses.controller.ts:9` (guardsiz) | To'liq |
| 6 | `createBooking` | ✅ **IMPL** | `:135-153` | ✅ `orders.controller.ts:22` (`ServiceTokenGuard`) | ⚠️ **`additionalPayment` va `clientName` jimgina tashlanadi** (`types.ts:32,36`); `requirementIds` DTO'da yo'q |
| 7 | `getBookingAddons` | ✅ **IMPL** | `:128-133` | ✅ `order-requirements.controller.ts:13` (guardsiz) | To'liq |
| 8 | `cancelBooking` | ⛔ **STUB** | `:159` | `PATCH /orders/:id/cancel-admin` bor (`orders.controller.ts:172`) lekin `AdminAuthGuard` | Endpoint bor, ulanmagan |
| 9 | `getActiveBooking` | ✅ **IMPL** | `:160-185` | ✅ `orders.controller.ts:29` | ⚠️ `clientBonus: 0` qattiq (`:171`), `priceTier: "standard"` qattiq (`:172`), haydovchi `lat:0, lng:0` (`:181`), status B lug'atida (adapter yo'q — `:165-166` izohi) |
| 10 | `listActiveBookings` | ⛔ **STUB** | `:187` | `GET /orders/active` bor, `AdminAuthGuard` + `phoneNorm` yo'q | 🔴 `bookingNotifier` sweep'ining yuragi |
| 11 | `getRideHistory` | ✅ **IMPL** | `:189-202` | ✅ `orders.controller.ts:36` | ⚠️ `carNumber: ""`, `carModel: ""` (`:195` — B'da join yo'q), `cashback: 0` (`:198`) |
| 12 | `getRidesByCar` | ⛔ **STUB** | `:203` | Raqam bo'yicha route yo'q | — |
| 13 | `getDriverPins` | ⛔ **STUB** | `:204` | `GET /location/online/details` bor | Xarita pinlari — ulanmagan |
| 14 | `getDriverByCar` | ✅ **IMPL** | `:205-216` | ✅ `drivers.controller.ts:18` | ⚠️ `lat: 0, lng: 0` qattiq (`:214`) — B javobida joylashuv yo'q |
| 15 | `getReportsPage` | ⛔ **STUB** | `:217` | `GET /orders` bor, `AdminAuthGuard` | — |
| 16 | `listDriverRoster` | ⛔ **STUB** | `:218` | `GET /drivers/outreach/list` bor, 3 maydon yo'q | — |
| 17 | `setClientBonus` | ⛔ **STUB** | `:228` | ⛔ B'da tushuncha yo'q | 🔴 B1 |
| 18 | `addClientBonus` | ⛔ **STUB** | `:229` | ⛔ B'da tushuncha yo'q | 🔴 B1 |
| 19 | `setClientName` | ⛔ **STUB** | `:219` | `PATCH /clients/:id` bor, `AdminAuthGuard` | ✅ Xavfsiz: `memberService.ts:85` `if (ds.name === "live")` — birjoy rejimida chaqirilmaydi |
| 20 | `addDriverPayment` | ⛔ **STUB** | `:220` | `POST /topup` bor | 🔴 Pul yozadi — eng xavfli stub |
| 21 | `getDriverAccount` | ⛔ **STUB** | `:221` | Qisman (3 chaqiruvdan yig'iladi) | — |
| 22 | `getTariff` | ⛔ **STUB** | `:222` | `vehicle_classes` bor, model mos kelmaydi | — |
| 23 | `getBonusRules` | ⛔ **STUB** | `:230` | ⛔ B'da tushuncha yo'q | 🔴 B1 |
| 24 | `getCarModels` | ✅ **IMPL** | `:83-94` | ✅ `car-models.controller.ts:12` (guardsiz) | To'liq (5a chokepoint isboti) |
| 25 | `getCompanyInfo` | ⛔ **STUB** | `:223` | `GET /settings` bor, **kalitlar yo'q** | — |
| 26 | `getServiceArea` | ⛔ **STUB** | `:224` | `GET /geofence/service-areas` bor | Endpoint bor, ulanmagan |
| 27 | `getMainReport` | ⛔ **STUB** | `:225` | `GET /admin/dashboard` bor, `completedYesterday` javobda yo'q | — |

### **19 STUB METOD NOMI (aynan):**
`addClientBonus` · `addDriverPayment` · `cancelBooking` · `checkClient` · `fetchByPhone` · `fetchMembers` · `getBonusRules` · `getCompanyInfo` · `getDriverAccount` · `getDriverPins` · `getMainReport` · `getReportsPage` · `getRidesByCar` · `getServiceArea` · `getTariff` · `listActiveBookings` · `listDriverRoster` · `setClientBonus` · `setClientName`

### **PORTLASH RADIUSI — `KAS_MODE=birjoy` bugun qo'yilsa nima yiqiladi**

```
PAT='\.(fetchMembers|fetchByPhone|checkClient|cancelBooking|listActiveBookings|getRidesByCar|
getDriverPins|getReportsPage|listDriverRoster|setClientBonus|addClientBonus|setClientName|
addDriverPayment|getDriverAccount|getTariff|getBonusRules|getCompanyInfo|getServiceArea|getMainReport)\('
grep -rnE "$PAT" --include=*.ts packages/*/src | grep -v 'src/kas/' | grep -v '/scripts/' | wc -l   → 49
… | wc -l (fayllar)                                                                                  → 20
```
**49 jonli chaqiruv joyi, 20 faylda** — har biri `Promise.reject(new Error("… not implemented yet"))` oladi (`birjoy.ts:78-80`). Jumladan: `bookingNotifier.ts` (sweep — `listActiveBookings`, `getMainReport`), `coinService.ts` (**pul** — `addDriverPayment`, `addClientBonus`, `setClientBonus`), `adminOps.ts` (5 ta), `driverDebtService.ts` (**qarz**), `clientInfoService.ts` (3 ta), `sync/sync.ts` (a'zo sinxronizatsiyasi).

### TAXI_BIRJOYSOURCE_DOD — 8 qabul mezoni

| # | Mezon | Status | Isbot |
|---|---|---|---|
| 1 | `KAS_MODE` `"birjoy"` qabul qiladi; default `"mock"` | **BAJARILGAN** | `env.ts:29`; `.env:10` `KAS_MODE=live`; `.env.example:12` `KAS_MODE=mock`, `:15-17` birjoy izohi + `KAS_BIRJOY_URL`/`KAS_SERVICE_TOKEN` |
| 2 | `KasDataSource.name` = 3 lik birlashma | **BAJARILGAN** | `types.ts:211` |
| 3 | `KAS_MODE=birjoy` → `BirJoySource`; unit test bilan | **QISMAN** | Kod ✓ `index.ts:24-28`. **Test YO'Q** — `grep -rn "getDataSource" packages/server/src/scripts/*.ts` da `birjoy` shoxini sinaydigan test topilmadi; `birjoy.spec.ts` mavjud emas (`ls packages/server/src/kas/*.spec.ts` → *No such file*) |
| 4 | **27/27 implementatsiya, birortasi «not implemented» EMAS** | ⛔ **YIQILGAN** | `grep -c 'this.notImpl(' birjoy.ts` → **19**; `birjoy.ts:79` matni aynan `"not implemented yet"` |
| 5 | Har metod uchun parity testi (`KasMockSource` shakliga solishtirish) | ⛔ **YIQILGAN** | `grep -rn "testBirjoyParity" packages/` → **0**; hech qanday test fayli `BirJoySource` ni import qilmaydi |
| 6 | Tanga metodlari A ichida hal bo'ladi; ≤350 clamp + idempotent; **yangi poller yo'q** | **QISMAN** | «Yangi poller yo'q» ✅ — `grep -n "setInterval\|setTimeout\|cron" birjoy.ts` → **0 natija**. «Tanga metodlari A ichida» ⛔ — uchchovi ham stub (`:228,229,230`) |
| 7 | `KAS_MODE=live` regressiya — bayt-bir xil | **QISMAN** | Konstruksiya bo'yicha ✓: `.env:10` `KAS_MODE=live` → `index.ts:16` `live` shoxi → `BirJoySource` **hech qachon quriladigan emas** (uxlab yotgan sinf). **LEKIN** CI'da kas regressiya testi yo'q: `.github/workflows/ci.yml:39-51` = typecheck + vitest + `simEconomy`/`simLoyalty`/`simGuards` — kas testi yo'q |
| 8 | Hech qanday global flag yoqilmagan; `.env` da `KAS_MODE` o'zgarmagan | **BAJARILGAN** | `.env:10` `KAS_MODE=live` (o'zgarmagan) |

**3 to'liq · 3 qisman · 2 yiqilgan.** Yuk ko'taruvchi mezon (#4) yiqilgan → DoD **«READY FOR VERIFICATION» emas**.

---

## 5. KAS PARITET TABLOSI — kas1067'ni o'chirish uchun

**O'qish:** «Bizda bormi?» = A→B ko'prigi orqali ishlaydimi (kod + endpoint + guard, uchalasi). «Cutoverni bloklaydimi?» = kas1067 o'chirilsa shu funksiya yo'qoladimi.

| # | kas1067 funksiyasi | Bizda bormi? | Isbot | Cutoverni bloklaydimi? |
|---|---|---|---|---|
| 1 | A'zolarni ommaviy tortish (`fetchMembers`) | ⛔ YO'Q | `birjoy.ts:156` stub; B'da `points` (so'mdagi cashback) tushunchasi yo'q | 🔴 **HA** — `sync/sync.ts:25` |
| 2 | Telefon bo'yicha qidirish (`fetchByPhone`) | ⛔ YO'Q | `birjoy.ts:157` stub | 🔴 **HA** — 5 jonli chaqiruv |
| 3 | Mijoz tekshiruvi + manzillar + faol buyurtma (`checkClient`) | ⛔ YO'Q | `birjoy.ts:158` stub; B route'i `AdminAuthGuard` ostida | 🔴 **HA** — 6 chaqiruv, butun buyurtma oqimi |
| 4 | Manzil qidiruvi | ✅ HA | `birjoy.ts:114`; `addresses.controller.ts:16` | Yo'q |
| 5 | To'liq manzil katalogi | ✅ HA | `birjoy.ts:121`; `addresses.controller.ts:9` | Yo'q |
| 6 | Buyurtma yaratish | 🟡 QISMAN | `birjoy.ts:135`; `orders.controller.ts:22` + DTO `orders.dto.ts:45` | 🟡 **QISMAN** — qo'shimcha to'lov va `requirementIds` tashlanadi |
| 7 | Qo'shimcha xizmatlar katalogi | ✅ HA | `birjoy.ts:128`; `order-requirements.controller.ts:13` | Yo'q |
| 8 | Buyurtmani bekor qilish | ⛔ YO'Q | `birjoy.ts:159` stub (B route'i bor, guard mos emas) | 🔴 **HA** |
| 9 | Faol buyurtmani telefon bo'yicha o'qish | 🟡 QISMAN | `birjoy.ts:160`; `orders.controller.ts:29` | 🟡 `clientBonus`, `priceTier`, status-lug'ati, haydovchi joylashuvi yo'q |
| 10 | Hamma faol buyurtmalar (sweep manbai) | ⛔ YO'Q | `birjoy.ts:187` stub; B javobida `phoneNorm` yo'q (0 natija) | 🔴 **HA** — `bookingNotifier.ts:192` |
| 11 | Safar tarixi | 🟡 QISMAN | `birjoy.ts:189`; `orders.controller.ts:36` | 🟡 `cashback`, `carNumber`, `carModel` yo'q |
| 12 | Mashina raqami bo'yicha safarlar | ⛔ YO'Q | `birjoy.ts:203` stub; B'da route yo'q | 🔴 **HA** — haydovchi missiyasi/hisoboti (4 chaqiruv) |
| 13 | Haydovchi xaritadagi pinlari | ⛔ YO'Q | `birjoy.ts:204` stub | 🟡 Kosmetik (xarita) |
| 14 | Raqam bo'yicha haydovchi | 🟡 QISMAN | `birjoy.ts:205`; `drivers.controller.ts:18` | 🟡 Jonli joylashuv, taximetr, qarz yo'q |
| 15 | Hisobot sahifasi (analitika) | ⛔ YO'Q | `birjoy.ts:217` stub | 🟡 Analitika |
| 16 | Haydovchi ro'yxati (obzvon CRM) | ⛔ YO'Q | `birjoy.ts:218` stub; B'da 3 ustun yo'q | 🟡 |
| 17 | Mijoz bonusini o'rnatish (**pul**) | ⛔ YO'Q | `birjoy.ts:228` stub; B'da `bonus_uzs` yo'q (0 natija) | 🔴 **HA — B1** |
| 18 | Mijoz bonusiga qo'shish (**pul**) | ⛔ YO'Q | `birjoy.ts:229` stub | 🔴 **HA — B1** (`coinService.ts:306`) |
| 19 | Mijoz ismini yozish | ⛔ YO'Q | `birjoy.ts:219` stub | Yo'q — `memberService.ts:85` `ds.name === "live"` bilan himoyalangan |
| 20 | Haydovchi balansini to'ldirish (**pul**) | ⛔ YO'Q | `birjoy.ts:220` stub; B'da `POST /topup` bor lekin ulanmagan | 🔴 **HA** — `coinService.ts:305`, `driverDebtService.ts:118` |
| 21 | Haydovchi hisob-varag'i (balans + qarz) | ⛔ YO'Q | `birjoy.ts:221` stub; B'da `debt` ustuni yo'q | 🔴 **HA** — qarz moduli |
| 22 | Tarif | ⛔ YO'Q | `birjoy.ts:222` stub; tarif modellari bir-biriga aylanmaydi (KAS_PARITET §3.5) | 🟡 |
| 23 | Bonus qoidalari | ⛔ YO'Q | `birjoy.ts:230` stub | 🔴 **HA — B1** |
| 24 | Mashina modellari | ✅ HA | `birjoy.ts:83`; `car-models.controller.ts:12` | Yo'q |
| 25 | Kompaniya ma'lumoti | ⛔ YO'Q | `birjoy.ts:223` stub; `settings.service.ts:7-17` da kalitlar yo'q | 🟡 5 chaqiruv |
| 26 | Xizmat hududi poligoni | ⛔ YO'Q | `birjoy.ts:224` stub (B endpointi bor) | 🟡 |
| 27 | Bosh hisobot (revenue byudjeti) | ⛔ YO'Q | `birjoy.ts:225` stub; `admin.service.ts:89-108` javobida `completedYesterday` yo'q | 🔴 **HA** — withdraw byudjeti shunga bog'liq |

**Tablo: ✅ 5 to'liq · 🟡 4 qisman · ⛔ 18 yo'q.**

### 🚧 CUTOVER UCHUN QOLGAN TO'SIQLAR (eng qisqa halol ro'yxat)

**Kod-darajadagi to'siqlar (bularsiz kas1067 o'chirilmaydi):**

1. **B1 — mijozning so'mdagi cashback hamyoni.** B'da `bonus_uzs`/`bonus_logs`/`cashback` **umuman yo'q** (`grep -rni "cashback\|bonus_uzs" 1067-taxi` → 0). 4 metodni (#17,#18,#23 + `RideHistoryItem.cashback`) va A'ning butun tanga↔so'm ko'prigini bloklaydi (`coinService.ts:305-306,372-374`). `TAXI_BIRJOYSOURCE_DOD.md:28` "5c" yechim tanlagan (A ichida hal qilish) — **lekin 5c yozilmagan**.
2. **19 ta stub metod** — jumladan `listActiveBookings` (sweep yuragi), `checkClient` (buyurtma oqimi), `addDriverPayment` (pul yozadi). 49 jonli chaqiruv joyi yiqiladi.
3. **`phoneNorm` yo'q** — A telefonlarni normallashtiradi, B aniq mos kelishni talab qiladi (`orders.service.ts:647`). Bu B4 to'sig'i, hech qanday yechim yozilmagan.
4. **`orders.cashback_uzs` ustuni yo'q** — 5 metodning shakli to'liq bo'lmaydi.
5. **Paritet testi yo'q** — 27 metodning birortasining javob-shakli sinovdan o'tmagan. Cutover tekshirilmagan holda bo'ladi.
6. **Status-lug'ati adapteri yo'q** — `dispatchToBookingStatus` ko'chirilmagan (`packages/shared/src/dispatch.ts` mavjud emas), A ning bot UI'si B statuslarini tushunmaydi.
7. **id-fazo to'qnashuvi yechilmagan** — `dispatchBookingId` (`900_000_000 + id`) ko'chirilmagan. B ning kichik serial `orders.id` lari kas id'lari bilan to'qnashadi → **`CoinTxn` idempotent kalitlari buziladi** (CLAUDE.md buzilmas qoidasi).

**Operatsion to'siqlar:**

8. **B'ning 24 commit'i push qilinmagan** — `git log --oneline origin/main..HEAD` (B repo) → 24. Butun F1-bridge ishi faqat lokal diskda. Disk yo'qolsa — ish yo'qoladi.
9. **B'ning o'z Telegram boti kodda tirik** (`telegram.service.ts` 1 212 qator, `:1161` buyurtma yaratadi). Faqat bo'sh `TELEGRAM_BOT_TOKEN` uni to'xtatadi (`:131-133`) — bu kod-daraja emas, env-daraja himoya.
10. **B'da dispatch kill-switch yo'q** — `owndispatch\|kill.?switch\|DISPATCH_ENABLED` → *No matches found*. CLAUDE.md "har mexanika kill-switch flag bilan" qoidasi buziladi.
11. **B'ning `.git/config` da ochiq GitHub token** (`grep -c "ghp_"` → 1) — 2026-09-08 da xabar qilingan, tuzatilmagan.
12. **B'da 16 servis hech qanday controller tomonidan inject qilinmaydi** (KAS_PARITET §4) — `RoutingService` butunlay o'lik → `orders.osrm*` ustunlari hech qachon to'ldirilmaydi; `CancellationService` route'siz → bekor qilish jarimasi hech qachon yozilmaydi. Bular kas'da bor edi.
13. **`modules/sla/` va `modules/surge/` hali ham nol faylli** (`ls` → faqat `.` va `..`).

**Bloklamaydigan, lekin sifat pasayishi:** haydovchi jonli joylashuvi `getDriverByCar` da yo'q · tarif modeli aylanmaydi · uch bo'lakli qo'shimcha to'lov bitta raqamga siqiladi (ega §8 savol 5 ga javob bermagan) · taximetr o'qish route'i yo'q.

---

## 6. JIMGINA TASHLAB KETILGAN

Bu bo'limda **va'da qilingan, hech qachon qurilmagan va hech qachon eslatilmagan** narsalar. Har biri o'z hujjatida aniq yozilgan, keyin izsiz g'oyib bo'lgan.

### 6.1 GARAJ_PLAN — hech qachon qurilmaganlar (o'chirish emas, umuman yozilmagan)

| Va'da | Bo'lim | Isbot (o'chirishdan OLDIN ham yo'q) |
|---|---|---|
| **Drop-jadvalining 8/9 turi** — `PART_COMMON`, `PART_RARE`, `CUSTOMER_VISIT`, `GUEST_CAR`, `PARTS_CRATE`, `BARN_FIND_HINT`, `MECHANIC_TIP`, `LEGENDARY_PART` | §4.7 | `git grep -c "PART_COMMON\|PART_RARE\|GUEST_CAR\|CUSTOMER_VISIT\|BARN_FIND\|LEGENDARY_PART" d1c84ed1^ -- garajGame.ts garajService.ts garaj.tsx` → **har biri 0**. Faqat `TOWED` 5 hit. **Butun "safar→garaj sehri"ning 89%i** |
| **Ko'zacha do'koni** (7 mahsulot: `KOZACHA_FLIP_BOOST_5PCT`, `PART_TURBO_ENGINE`, `PART_OEM_FILTER`, `SPEEDUP_*`, `COSMETIC_BODY_COAT`) | §4.4 | 0 hit. Ko'zacha ishlab topilardi, **sarflanadigan joy yo'q edi** — reja o'zi bu holatni "surplus +845K/oy" deb ogohlantirgan |
| **`grantKozacha` CI lint qalqoni** (`.husky/pre-push` grep-gate) | §4.4 G1 | `.husky/` da bunday hook hech qachon bo'lmagan. Anti-inflatsiya kafolati G1 **qog'ozda qolgan** |
| **`computeDemandMultiplier` sigmoid formulasi** | §4.5 | `git grep -c computeDemandMultiplier d1c84ed1^` → **0**. Boshqa "demand" mexanikasi qurilgan, reja formulasi emas |
| **`GarajRideStats` jadvali** (Red-Team MAJOR-4 tuzatishi — CoinTxn skanini almashtirish) | §4.5, §6 | `d1c84ed1^:schema.prisma` da model yo'q |
| **`GarajRepairJob` / `GarajRepairTask` / `GarajRepairResult`** | §6 | Uchchovi ham hech qachon sxemada bo'lmagan → **§7.8 XP-farming himoyasi (`@@unique([jobId, taskCode])`) hech qachon mavjud bo'lmagan** |
| **Audit tuzatishi M2** — `carsOwnedCount` + `sumCarLevels` denormalizatsiya | §0 audit jadvali | `git grep "carsOwnedCount" d1c84ed1^` → **faqat `GARAJ_PLAN.md:764-765`**. Ya'ni auditning MAJOR tuzatishi rejadan kodga hech qachon o'tmagan |
| **Ikki tomonlama referral** (ikkovi ham OEM qism oladi) — reja uni *"primary social hook"* deb atagan | §4.8 | `git grep "GarajPartDrop\|referral_bonus" d1c84ed1^` → 0 |
| **`GarajCounterOffer` / Haggling Window** | §4.5, §6 | 0 hit |
| **`GarajPriceAlert`** | §4.5, §6 | 0 hit |
| **Battle Pass "Usta Obunasi"** (`UstaSubscription`, 4 000t/oy) | §4.12 | 0 hit |
| **Butun audio quvuri** — 6 ta `.ogg` fayl (`part-click`, `coin-clink`, `engine-rev`, `sale-chord`, `whoosh`, `wrench`), ≤41KB gz | §4.10 | `git ls-tree -r --name-only d1c84ed1^ \| grep -i "\.ogg\|\.mp3"` → **0 fayl**. O'rniga sintezlangan tovush (`a4c0f2f8`) |
| **`GarajOrder` — NPC Buyurtma taxtasi jadvali** | §6 | `git grep -c "GarajOrder\|OrderBoard" d1c84ed1^` → 0 (funksiya boshqa nom bilan qurilgan, reja jadvali emas) |
| **3 mavsumiy event** — Ramadan, Mustaqillik, Hamjamiyat | §4.9 | `Navruz` 2 hit, `seasonal` 17 hit; qolgan uchtasi 0 |
| **Prisma modellari: 16/28 hech qachon qurilmagan** | §6 | `GarajRepairJob/Task/Result`, `GarajRideStats`, `GarajOrder`, `GarajCraft`(→`GarajCraftJob` bo'ldi), `GarajCounterOffer`, `GarajDemandEvent`, `GarajTraderRep`, `GarajNpc`, `GarajSeasonProgress`, `GarajMuseum`, `GarajCalendar`, `GarajPriceAlert`, `MemberCosmetic`, `MemberReputation`, `UstaSubscription` |

### 6.2 GARAJ — jarayon darajasidagi tashlab ketish

| Nima | Isbot |
|---|---|
| **DoD #20 (ega QABUL real telefonda) ATAYLAB o'tkazib yuborilgan** | `PROGRESS.md:1797`: *"owner global ochishni AVTORIZATSIYA qildi (**R6 QABUL-first qadamini ataylab o'tkazib** — greenfield, hech kim o'ynamagan, to'liq isbotlangan)"*. 14 kundan keyin o'yin butunlay o'chirildi |
| **Refund va'da qilingan, berilmagan** | `PROGRESS.md:2016-2017`: *"Refund siyosati (ega): avtomatik refund YO'Q; shikoyat kelsa qo'lda to'lanadi. **55 egada 68 faol GarajCar bor**"*. Keyinroq `PROGRESS.md:2249`: *"GarajCar'da **84 qator, 57 xil a'zoda**"*. Bu odamlar tanga sarflagan, o'yin yo'qolgan, avtomatik qaytarish bo'lmagan |
| **Bazadagi jadvallar hali ham DROP qilinmagan** | commit `8acef3f6` xabari: *"⚠️ JADVALLAR BAZADAN O'CHIRILMADI — bu ataylab. Tartib: … keyin ALOHIDA ongli qadamda VPS'da yangi `pg_dump` + `DROP TABLE` (Blok B/2, past-trafik oynada)"*. **Blok B/2 bajarilganiga dalil topilmadi** — jonli bazada 20+ o'lik jadval turgan bo'lishi mumkin (VPS tekshirilmadi) |
| **`garage` flagi fail-OPEN holatda qolgan** | `featureFlags.ts:8` da `"garage"` hali `FeatureName`, lekin **`DEFAULT_OFF` da ham (`:182`), `EXPECTED_ON` da ham (`:215-285`) YO'Q**. `featureOn()` mantiqi (`:193-194`): `DEFAULT_OFF` da bo'lmagan flag → `cache.map[name] !== false` → **DB satri yo'qolsa AVTOMATIK ON bo'ladi** va `EXPECTED_ON` da bo'lmagani uchun **hech qanday alert bermaydi**. Bugun zararsiz (`grep 'featureOn("garage")'` → **0 chaqiruvchi**), lekin bu naqsh xavfli |

### 6.3 KAS_PARITET / BIRJOYSOURCE — jimgina tashlab ketilganlar

| Nima | Isbot |
|---|---|
| **`packages/shared/src/dispatch.ts` lug'at qatlami** — KAS_PARITET §5.5 uni "F1 uchun BARIBIR KERAK" deb belgilagan (id-fazo + status adapteri + narx presetlari + 20 test) | `ls packages/shared/src/dispatch.ts` → *No such file or directory*. `birjoy.ts:166` da faqat izoh: *"salvaged per §4 — is a follow-up"* |
| **`origin/claude/taxi-system-drivers-bsa05f` shoxobchasi o'chirilmagan** — §5.5 uni "keyin o'chiriladi (bitta shoxobcha — `main`)" degan; CLAUDE.md ham bitta shoxobcha qoidasini talab qiladi | `git rev-parse origin/claude/taxi-system-drivers-bsa05f` → `2ceb737d45b1afa208f8f608bd401b4d831e1338` (hali bor) |
| **`birjoy.spec.ts` — DoD «Fayllar» ro'yxatida YANGI deb yozilgan** | `TAXI_BIRJOYSOURCE_DOD.md:17` — *"`packages/server/src/kas/birjoy.spec.ts` — YANGI: shakl/parity testlari"*. `ls packages/server/src/kas/*.spec.ts` → **No such file or directory** |
| **`scripts/testBirjoyParity.ts`** — KAS_PARITET §6 F1.2 P1 | `grep -rn "testBirjoyParity" packages/` → **0** |
| **`owndispatch` kill-switch B'ga ko'chishi** | A'da 0, B'da `owndispatch\|kill.?switch\|featureFlag\|DISPATCH_ENABLED` → *No matches found* |
| **§5.5 dagi "B'ga ko'chadigan 3 g'oya"** (to'lqinli taklif · `reject≠timeout` · kill-switch) | Uchchovi ham B repoda topilmadi |
| **§7b xavfsizlik ogohlantirishi** (B `.git/config` da ochiq `ghp_` token) | `grep -c "ghp_" 1067-taxi/.git/config` → **1** — 2 kun o'tib ham joyida |
| **§8 dagi 9 ochiq savol** — hujjat "ega javob berishi kerak" degan, keyin kod yozila boshlangan | Javoblar hech qayerda hujjatlashtirilmagan; savol 5 (uch bo'lakli to'lov) va savol 6 (kim kimni chaqiradi / sweep saqlanadimi) hali ham ochiq. Savol 9 ("8 push qilinmagan commit") — javob bermasdan, endi **24 ta** bo'lgan |
| **Uchala hujjatning o'zi ham commit qilinmagan** | `git status --short` → `?? KAS_PARITET.md`, `?? TAXI_BIRJOYSOURCE_DOD.md`, `?? BIRJOY_TAXI_MASTER.md`, `?? 1067-taxi/`. Ya'ni bu rejalar git tarixida yo'q — faqat diskda |
| **`PROGRESS.md` yangilanmagan** | `grep -ni "birjoysource\|F1-bridge\|KAS_MODE=birjoy\|paritet" PROGRESS.md` → **F1-bridge ishi haqida birorta satr yo'q**. CLAUDE.md R7 ("PROGRESS.md = LITERAL haqiqat") va DoD F1.3 #6 buzilgan |
| **`BirJoySource` da rate-limit qalqoni yo'q** — F1.2 P0 aynan *"`KasLiveSource` (1 216 qator) naqshi bo'yicha: bitta HTTP chokepoint, **navbat, pacing, keshlash**"* degan | `client.ts:147,161,165` (navbat+pacing), `:208,223` (429-retry), `:459` (kesh), `:256` (`recordKas` salomatlik). `birjoy.ts` da bularning hech biri yo'q — `grep -n "queue\|cache\|429\|retry\|recordKas" birjoy.ts` → **0** |

### 6.4 GARAJ dan qolgan o'lik qoldiqlar (tozalanmagan)

| Joy | Nima | Xavf |
|---|---|---|
| `packages/server/prisma/schema.prisma:1004-1006` | Yetim GARAJ v2 izoh-sarlavhasi (ostida model yo'q); o'chirilgan `garajx` flagiga va o'chirilgan `MemberCar` modeliga ishora qiladi | Chalkashlik |
| `packages/server/src/services/featureFlags.ts:8` | `"garage"` flag kaliti — **0 chaqiruvchi**, `DEFAULT_OFF` da ham `EXPECTED_ON` da ham yo'q | Fail-open naqsh (§6.2) |
| `packages/admin/src/App.tsx:751` | `garage: { risk: "cosmetic", desc: "Eski garaj v1 (olib tashlangan)" }` | Kosmetik |
| `packages/server/src/services/missionService.ts:16` | `daily_garage: "mDailyGarage"` — missiya katalogdan o'chirilgan, xarita satri qolgan | O'lik kod |
| `packages/server/prisma/schema.prisma:204` | `NotifyLog.kind` izohida `garage_service` push turi — endi hech qachon jo'natilmaydi | O'lik hujjat |
| `packages/miniapp/src/design/birjoy.tsx:211` | `GarajCarArt naqshi` izohi — bunday simvol yo'q | Kosmetik |
| `packages/server/src/scripts/testEngagement.ts:45` | `"missions catalog (4 daily incl. garage, 2 weekly)"` — eski tavsif | Yolg'on test-matni |

---

## 7. QAMRAB OLINMAGAN (halollik uchun)

- **Jonli VPS tekshirilmadi.** Hamma narsa lokal koddan o'qildi. `feature:garage` AppState satri jonli bazada bormi, o'chirilgan GARAJ jadvallari hali ham turibdimi (Blok B/2 bajarilganmi) — **o'lchanmagan**.
- **Testlar yugurtirilmadi.** `pnpm typecheck`, `vitest`, `simEconomy` bu sessiyada ishga tushirilmadi (faqat CI konfiguratsiyasi o'qildi: `.github/workflows/ci.yml:39-51`).
- **B jonli holatda ishlayotgani tekshirilmadi.** B ning VPS staging'iga ulanilmadi; `TELEGRAM_BOT_TOKEN` haqiqatan bo'shmi — `birjoy-otp.notifier.ts:6-10` izohining o'z da'vosi, mustaqil isbot emas.
- **A'ning 21 `scripts/` fayli** `KAS_MODE=birjoy` da nima bo'lishi alohida sanalmadi (portlash radiusi faqat jonli kodni sanaydi).
- **`apps/client` va `apps/driver-android`** (B) bu auditda ko'rilmadi.
- **Ma'lumot migratsiyasi** (A `Member` ↔ B `clients`/`drivers`) qamralmagan.

---

**Bu hujjatdagi har da'vo `fayl:qator` yoki natijasiz qaytgan qidiruv buyrug'i bilan berilgan. Kod yozilmadi, commit/push qilinmadi, VPS/bazaga ulanilmadi. Faqat shu bitta fayl yaratildi.**
