# 🚕 O'Z DISPETCHER — haydovchilar uchun taksi tizimi (reja v1)

> **Ega so'zi (2026-09-07):** «taxi tizimi driverlar uchun qurish kerak, kas1067 muammo bo'lyapti».
>
> **Talqin (shu reja asosida qurildi):** bugungi mahsulot BUTUNLAY kas1067'ga bog'liq — buyurtma
> kas'ga yoziladi, haydovchini kas tayinlaydi, holat kas'dan o'qiladi (`ARCHITECTURE.md` §1).
> kas nosoz/qimmat/ishonchsiz bo'lsa bizda HECH NARSA ishlamaydi. Bu reja **o'z dispetcherlik
> yadrosini** quradi: mijoz buyurtmasi → BIZNING liniyadagi haydovchilarga (Telegram bot) →
> birinchi qabul qilgan oladi → holatlar (yetib keldim → safar → yakun) → mavjud idempotent
> pul-yo'llari. kas1067 zaxira (fallback) bo'lib qoladi — haydovchi topilmasa buyurtma kas'ga
> uzatiladi (knob bilan o'chiriladi). Hammasi `owndispatch` bayrog'i ortida **DARK**: OFF = bugungi
> xatti-harakat AYNAN (kod yo'li umuman ishga tushmaydi).
>
> **Holat: `in progress` — REJA egaga ko'rsatildi, §7 dagi 3 qaror (APK · admin-konsol · ratsiya) TASDIQ kutmoqda.**
> Yadro (§1–§6) qaror-mustaqil: har uch variantda ham kerak, shuning uchun u tasdiqdan keyin darhol davom etadi.

---

## §0. Nima allaqachon bor (noldan qurilmadi)

| Bor narsa | Qayerda | Qanday ishlatildi |
|---|---|---|
| Haydovchi = `Member.type="driver"` (raqam ulash orqali, kas'dan `carNumber` bilan) | `memberService.linkByPhone` | Haydovchi identiteti O'ZGARMADI — o'sha a'zo liniyaga chiqadi |
| «🚗 Haydovchi paneli» (bot) + «Daromad» tabi (miniapp) | `bot.ts:851`, `driver.tsx` | Panelga «🟢 Liniya» tugmalari, tabga «Liniya» kartasi qo'shildi |
| Mijoz buyurtma oqimi (bot wizard, 1-tap, miniapp xarita) | `bookingService.createBookingFor/callOneTapFor` | Yadro o'zgarmadi — bayroq ON bo'lsa shu funksiyalar ICHIDA o'z-dispetcherga buriladi |
| Mijoz jonli holat ko'rinishi (`ActiveBookingView`) | `booking3.tsx` 5s so'rov, `/api/booking/active` | O'z safar AYNAN shu shaklga map qilinadi → miniapp'da BIRORTA UI o'zgarish shart emas |
| Idempotent pul: `grantRideCoins` (≤350 clamp), `rollRideCashback`, missiya/tier/peak | `coinService`, `cashbackService`, sweep finish-shoxi | `settleRide` shu funksiyalarni O'SHA kalit-naqshlar bilan chaqiradi |
| Intercity (o'z DB'da haydovchi-reys-booking naqshi, atomik updateMany) | `intercityService.ts` | Atomik «birinchi qabul qilgan oladi» naqshi shundan olindi |
| Sweep (`pushBookingUpdates`) — yagona poller | `bookingNotifier.ts` | Yangi poller YO'Q: `sweepDispatch` sweep'ning BOSHIDA chaqiriladi (kas yiqilsa ham yuradi) |
| Chiptalar: `tip:<driverId>:<amt>`, `payfare:<driverId>:<fare>` | `bot.ts:1156` | Yakun kartasida AYNAN shu tugmalar — yangi pul-mantiq yo'q |

## §1. Ma'lumot modeli (Prisma, faqat QO'SHIMCHA — mavjud jadval tegilmadi)

- **`DriverShift`** (1 qator / haydovchi): `online`, `lat/lng/locAt` (oxirgi joylashuv), `onlineAt`,
  `offlineAt`, `currentRideId`. Loose FK → `Member.id` (DriverCall/ScheduledRide naqshi).
- **`DispatchRide`**: `riderId`, `driverId?`, `status` (`searching|accepted|arrived|started|finished|
  cancelled|expired`), `source` (bot|miniapp|fallback), `pickupName/Lat/Lng/AddrId`, `destName/Lat/Lng?`,
  `fareEstimate?`, `fareFinal?` (haydovchi yakunda tasdiqlaydi), `wave`, `offeredCount`,
  `riderCardMsgId`, `driverCardMsgId`, `cancelBy/Reason`, `kasFallbackAt`, vaqt-tamg'alari, `settledAt`.
- **`DispatchOffer`**: `rideId`, `driverId`, `wave`, `distanceKm?`, `msgId?`, `response`
  (`accept|reject|timeout|lost`), `@@unique([rideId, driverId])`.

**Id-fazo:** tanga/RideReward kalitlarida `bookingId = 900_000_000 + ride.id`
(`dispatchBookingId`, shared) — kas id'lari bilan TO'QNASHMAYDI (kas ~10⁵ diapazonda), `Int` ichida.

## §2. Oqimlar

1. **Haydovchi liniyaga chiqadi**: bot «🟢 Liniyaga chiqish» (yoki miniapp kartasi) → `DriverShift.online`.
   Joylashuv: Telegram **jonli lokatsiya** (`message:location` + `edited_message:location`) yoki
   miniapp GPS. Joylashuvsiz haydovchi ham taklif oladi — faqat navbatda joylashuvli
   (yaqin) haydovchilardan keyin turadi.
2. **Mijoz buyurtma beradi** (bot/1-tap/miniapp — o'zgarmagan): `createBookingFor` →
   `owndispatch` ON va **liniyada ≥1 haydovchi** bo'lsa → `createRide` → `searching`.
   Liniya bo'sh bo'lsa → `dispatchKasFallback=1` → hozirgi kas yo'li AYNAN (mijoz farqni sezmaydi).
3. **Taklif to'lqini**: yaqinlik bo'yicha saralangan `dispatchOfferBatch` (def 4) haydovchiga
   bir vaqtda «🚕 Yangi buyurtma» kartasi [✅ Qabul] [❌ O'tkazish]. `dispatchOfferSec` (def 20s)
   ichida javob yo'q → `timeout`, keyingi to'lqin (yangi haydovchilar). `dispatchSearchMaxSec`
   (def 120s) yoki `dispatchMaxWaves` tugasa → `expired` → mijozga halol xabar → fallback ON bo'lsa
   kas'ga uzatiladi («🔁 1067 dispetcheriga uzatildi»).
4. **Birinchi qabul qilgan oladi** — `updateMany WHERE status='searching' AND driverId IS NULL`
   (atomik; ikkinchi bosgan «boshqa haydovchi oldi» ko'radi). Boshqa takliflar `lost` → kartalari
   tahrirlanadi. Mijoz kartasi: haydovchi ismi · mashina · raqam · 📞 · ~ETA.
5. **Haydovchi holatlari**: [📍 Yetib keldim] → [🚗 Safar boshlandi] → [🏁 Yakunlash] → narx
   (taxminiy narx + yaxlit variantlar + «✏️ Boshqa summa»). Har o'tish mijozga darhol
   (event-driven, sweep kutilmaydi). [❌ Bekor] yetib kelguncha — buyurtma QAYTA qidiruvga
   tushadi (o'sha haydovchi chiqarib tashlanadi); yetib kelgach [🚫 Mijoz chiqmadi] — safar yopiladi.
6. **Yakun (`settleRide`, idempotent)**: mijozga `rollRideCashback` (→ `grantRideCoins`, ≤350),
   `daily_ride/weekly_rides` missiya, `markRideActive`, `trips+1`; haydovchiga tier-rebate
   (`driver_bonus:` kalit, kunlik cap), pik-bonus, `drv_*` missiyalar, recruit revshare/milestone
   (flaglar ichida). Mijoz yakun kartasi: narx · tanga natijasi · [🪙 Yo'l haqini to'la] [🙏 tip].
7. **Mijoz bekor**: `searching|accepted` da (kas qoidasi: haydovchi yetib kelgach bekor yo'q) —
   haydovchiga xabar, shift bo'shatiladi.
8. **Backstop (`sweepDispatch`)**: taymer restart'da yo'qolsa — kechikkan takliflar/muddati
   o'tgan qidiruvlar sweep'da yopiladi; 60 daq harakatsiz `accepted` safar → adminlarga bir marta
   alert; 4 soat harakatsiz liniya → avto-offline + haydovchiga xabar.

## §3. Knoblar (admin panel «Bonus iqtisod» → guruh «O'z dispetcher», avtomatik chiziladi)

| key | def | ma'nosi |
|---|---|---|
| `dispatchOfferSec` | 20 | bitta to'lqin javob kutish (s) |
| `dispatchOfferBatch` | 4 | bir to'lqinda nechta haydovchiga |
| `dispatchMaxWaves` | 4 | maksimal to'lqin soni |
| `dispatchSearchMaxSec` | 120 | umumiy qidiruv muddati (s) |
| `dispatchLocFreshMin` | 20 | joylashuv «yangi» hisoblanadigan muddat (daq) |
| `dispatchRadiusKm` | 8 | joylashuvli haydovchi uchun radius (km) |
| `dispatchKasFallback` | 1 | 1 = topilmasa/liniya bo'sh bo'lsa kas'ga uzat; 0 = uzatma |

## §4. Nima QILINMADI (ongli, v2 uchun)

- Haydovchi hisobi (komissiya/qarz) — o'z safarlar uchun **komissiya olinmaydi** (kas'dagi 2000
  so'm/safar analogi yo'q). Ega qaror qilsa v2: `DispatchRide.commissionSom` + Intercity naqshi.
- `DailyStat.completedRides` (jamoa maqsad-bonusi o'lchovi) kas'dan keladi — o'z safarlar unga
  QO'SHILMAYDI (alohida hisoblash kerak bo'lsa `rollupService` ga qator).
- `Member.trips` kas-a'zolarda har 15 daqiqada kas'dan qayta yoziladi — o'z safar +1 kas-mijozlarda
  keyingi sync'da yo'qoladi (faqat `tg_` o'z-ro'yxatdan-o'tganlarda saqlanadi). Withdraw-darvoza
  (`MIN_RIDES_FOR_PAID`) uchun v2'da `DispatchRide` soni ham hisobga olinishi kerak.
- Referal «birinchi safar» to'lovi (sweep'dagi OY-08 sybil-qo'riqli blok) o'z safarlarda
  chaqirilmaydi — referal flaglari hozir OFF (`EXPECTED_ON` izohi), shuning uchun va'da buzilmaydi.
- Taksometr yo'q: narxni haydovchi yakunda tasdiqlaydi (taxminiy narx + variantlar).
- Jonli xaritada haydovchi pin'i miniapp'da: o'z haydovchining `lat/lng` `driver` obyektida
  boradi (bor), lekin «bo'sh mashinalar» pin'lari (`/api/booking/nearby`) hamon kas'dan.

## §5. DoD — qabul mezonlari (har biri buyruq + natija bilan)

| # | Mezon | Tekshiruv |
|---|---|---|
| 1 | Bayroq OFF = bugungi xatti-harakat AYNAN (hech bir o'z-dispetcher yo'li ishga tushmaydi) | `grep -n "dispatchOn\|featureOn(\"owndispatch\")"` — har kirish nuqtasi bayroq bilan qo'riqlangan; `simDispatch` «flag OFF → createRide feature_off» |
| 2 | Sof-funksiyalar: holat-mashina, saralash, id-offset | `pnpm --filter @t1067/shared test` → dispatch.test.ts yashil |
| 3 | Birinchi qabul qilgan oladi (atomik) | `acceptOffer` → `updateMany WHERE status='searching' AND driverId IS NULL` (`dispatchService.ts`), simDispatch'da ikki ketma-ket qabul modeli |
| 4 | ≤350 tanga/safar buzilmaydi | `settleRide` FAQAT `rollRideCashback`→`grantRideCoins` orqali; `simEconomy` yashil |
| 5 | Idempotent yakun | `settledAt` + har grant o'z kaliti (`cashback:`, `driver_bonus:`, `peak_bonus:`, `qinc:`); ikkinchi chaqiruv 0 grant |
| 6 | Yangi poller yo'q | `sweepDispatch` faqat `pushBookingUpdates` ichidan chaqiriladi (`grep -rn sweepDispatch`) |
| 7 | Mijoz miniapp'i o'zgarishsiz ishlaydi | `getActiveBookingFor` o'z safarni `ActiveBookingView` shaklida qaytaradi (status map: searching→new, accepted, arrived, started) |
| 8 | Typecheck + build + CI qalqoni | `pnpm -r typecheck` 0 xato · `pnpm --filter @t1067/miniapp build` · `--filter @t1067/admin build` · `simDispatch.ts` yashil |
| 9 | Sxema faqat qo'shimcha | `prisma migrate diff --from-empty …` chiqishida mavjud jadvalga `ALTER/DROP` YO'Q — faqat 3 ta `CREATE TABLE` |
| 10 | Ega telefonda: haydovchi liniyaga chiqadi → mijoz chaqiradi → taklif → qabul → holatlar → yakun → tanga | **EGA QABUL'i** (jonli, VPS'da flag `on` dan keyin) |

## §6. Deploy tartibi (VPS — CLAUDE.md qoidasi: sxema ALOHIDA, kod push'idan OLDIN)

1. VPS: `cd /opt/app && git fetch && git checkout <shu commit>` (yoki main'ga merge'dan keyin pull)
2. `pnpm --filter @t1067/server exec dotenv -e ../../.env -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → **o'qi** (faqat 3 `CREATE TABLE` + indekslar bo'lishi kerak)
3. `… prisma db push`
4. Kod deploy (CI) → `/health`
5. Sinov: ega o'zi haydovchi sifatida (`type=driver` a'zo) → `/liniya` → boshqa telefondan buyurtma.
   Flag hali OFF — sinov uchun `setFlag.ts owndispatch on` (alert keladi), muammo bo'lsa `off` (30s).
6. QABUL → `EXPECTED_ON` ga qo'shish (alohida commit).

## §7. Ega qo'shimchalari (2026-09-07 xabari): APK · admin panel · walkie-talkie

> Ega: «kas1067 senga apk bergan edim, driverlar uchun apk, admin panel, walkie-talkie kerak».
> ⚠️ kas1067 haydovchi-ilovasining dekompilyatsiyasi (`client-apk-decomp/`) `.gitignore`da — bu
> checkout'da YO'Q. Uning ekranlarini birma-bir takrorlash kerak bo'lsa, papkani qayta yuklash
> (yoki ekranlar ro'yxatini aytish) kerak. Quyidagi reja umumiy taksi-dispetcher ilovalari
> (kas, Yandex Pro, Bolt Driver) naqshiga qurilgan.

### 7.1 Haydovchi ilovasi — «APK»

| Variant | Nima | Muddat | Kamchilik |
|---|---|---|---|
| **A (tavsiya) — Telegram Mini App + o'rnatiladigan APK-qobiq (TWA/Capacitor)** | Haydovchi ekrani BIZNING miniapp'da (`driver.tsx` «Liniya» kartasi → to'liq ekran): liniya on/off, GPS fon-yangilash, taklif kartasi (ovoz + tebranish), safar tugmalari, kunlik daromad, ratsiya. Shu sahifa **Capacitor** bilan Android APK'ga o'raladi (bir kodbaza, `pnpm build` → `apk`), APK egadan haydovchilarga havola bilan tarqatiladi (Play Store shart emas). | Mini App: 2–3 kun · APK-qobiq: +1–2 kun (Android SDK egada yoki CI'da) | Fonda GPS: brauzer-qobiqda ekran o'chganda joylashuv to'xtashi mumkin → Capacitor `background-geolocation` plagini (APK'da hal bo'ladi, Telegram ichida hal bo'lmaydi) |
| B — Telegram bot (hozir qurilayotgan) | Tugmalar + jonli lokatsiya (Telegram o'zi fonda yuboradi — 8 soatgacha). APK YO'Q, o'rnatish shart emas. | 1–2 kun (yadro bilan birga) | «Ilova» hissi yo'q, ovozli signal Telegram bildirishnomasi |
| C — Sof native (Kotlin) | Alohida loyiha, alohida deploy-quvur, alohida sinov | 3–6 hafta | Eng qimmat; bitta jamoa ikki kodbaza |

**Tavsiya: B (bot) HOZIR — yadro sifatida, keyin A (Mini App ekrani + Capacitor APK).** Bot yo'li
har holda kerak (mijoz kartasi, ratsiya, zaxira), APK esa o'sha server API'ni ishlatadi.

### 7.2 Admin panel — «Dispetcher konsoli» (admin v2, yangi bo'lim `dispetcher`)

- **Jonli xarita**: liniyadagi haydovchilar (yashil = bo'sh, sariq = safarda, kulrang = joylashuv
  eskirgan), faol buyurtmalar (olib ketish pin'i), bosilsa — karta.
- **Buyurtmalar ro'yxati**: qidiruv/yo'lda/safarda/yakun · yoshi · «⚠ 2 daq javobsiz».
- **Qo'lda tayinlash**: operator buyurtmani ANIQ haydovchiga beradi (taklif kutmasdan) —
  `adminAssign(rideId, driverId)` (atomik, o'sha `updateMany` qo'riq).
- **Operator buyurtma yaratadi** (telefon-mijoz uchun): mavjud `createLocalMember` + `createRide`
  (`source="operator"`), mijozga SMS/Telegram shart emas.
- **Bekor / haydovchini almashtirish / liniyadan chiqarish**.
- **Ratsiya paneli**: matn yoki ovoz → hamma liniyadagi haydovchiga (7.3).
- **Hisobot**: kunlik safar/daromad haydovchi kesimida (mavjud `DataTable`+CSV).
- Rollar: `operator` roli allowlist'iga `/api/admin/dispatch/*` qo'shiladi (pul yo'q → xavfsiz).

### 7.3 Walkie-talkie — «📻 Ratsiya»

| Variant | Nima | Muddat |
|---|---|---|
| **A (tavsiya, v1) — Telegram ovozli relay** | Haydovchi botga OVOZLI xabar yuboradi (Telegram o'zi yozib oladi, 1 bosish) → server `file_id` ni **qayta yuklamasdan** hamma liniyadagi haydovchi + dispetcherga `sendVoice` qiladi (soniyalar). Dispetcher admin-paneldan yozsa (matn/ovoz) — hammaga. Kanal-tartib: «Ratsiya: faqat liniyadagilar», spam-cheklov (haydovchi daqiqada 3 ta), «🔕 ratsiyani o'chirish». Tarix admin panelda. | 1 kun |
| B — Real-vaqt PTT (WebRTC/LiveKit, «tugmani bosib gapir») | Alohida media-server, mobil fon-audio ruxsatlari, Telegram ichida ishlamaydi (faqat APK'da) | 1–2 hafta, +server |

**Tavsiya: A hozir** (kas'dagi ratsiya odati aynan «ovoz → hammaga»), B — APK chiqqach, ega
haqiqiy foydalanishni ko'rib qaror qilsa.

### 7.4 Tartib (tasdiqdan keyin)

1. Yadro §1–§6 (server + bot) → VPS sxema → ega sinovi (flag `on`, o'z telefonlari bilan).
2. Ratsiya 7.3-A (bot relay + admin paneldan yuborish).
3. Admin dispetcher-konsoli 7.2 (xarita + ro'yxat + qo'lda tayinlash + operator buyurtmasi).
4. Mini App haydovchi ekrani (to'liq) → Capacitor APK-qobiq (7.1-A).
