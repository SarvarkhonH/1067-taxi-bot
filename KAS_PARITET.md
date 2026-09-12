# KAS ↔ BIRJOY PARITET — 27 metod xaritasi va arxitektura qarori

**Sana:** 2026-09-08 · **Holat:** F0 audit natijasi, ega tasdig'ini kutmoqda
**Muallif roli:** integratsiya arxitektori (kod yozilmadi, commit/push qilinmadi, build/docker/VPS ishlatilmadi)

**Belgilar:** **[o'lchandi]** = shu kompyuterda buyruq bilan tekshirildi · **[xulosa]** = o'lchangan
faktlardan chiqarilgan · **[taklif]** = mening tavsiyam, qaror ega'niki

**Repozitoriylar:**
- **A** = `C:\Users\sarva\Desktop\1067 bot` — jonli BirJoy Telegram boti (TypeScript, Prisma, pnpm monorepo)
- **B** = `C:\Users\sarva\Desktop\1067 bot\1067-taxi` — alohida git repo, o'z taxi platformamiz (NestJS, Drizzle, PostGIS/Redis, Kotlin ilova)

> ⚠️ B ichida `1067-taxi/.claude/worktrees/**` papkasi bor — u eski agent worktree'lari.
> Bu hujjatdagi HAMMA iqtibos **haqiqiy daraxtdan**, worktree'lardan emas.

---

## 1. XULOSA

**Paritet raqamlari [o'lchandi]:**

| Holat | Soni | Metodlar |
|---|---|---|
| ✅ **TO'LIQ** | **7 / 27** | `searchAddresses` · `getBookingAddons` · `cancelBooking` · `getDriverPins` · `setClientName` · `getCarModels` · `getServiceArea` |
| 🟡 **QISMAN** | **17 / 27** | `fetchMembers` · `fetchByPhone` · `checkClient` · `getAllAddresses` · `createBooking` · `getActiveBooking` · `listActiveBookings` · `getRideHistory` · `getRidesByCar` · `getDriverByCar` · `getReportsPage` · `listDriverRoster` · `addDriverPayment` · `getDriverAccount` · `getTariff` · `getCompanyInfo` · `getMainReport` |
| ⛔ **UMUMAN YO'Q** | **3 / 27** | `setClientBonus` · `addClientBonus` · `getBonusRules` |

**Ulanish yuzasi [o'lchandi]:** 27 metod, **112 chaqiruv**, **44 fayl**; skriptlarsiz (jonli kod) —
**77 chaqiruv, 23 fayl**. Buyruq bo'lim 2 oxirida.

> Topshiriqdagi "126 chaqiruv / 42 fayl" raqami men o'lchagan 112/44 dan farq qiladi. Sabab —
> qamrov chegarasi (`packages/server/src/kas/` ning o'zi hisobga olinganmi). Men chiqargan raqam
> **`kas/` ni ISTISNO qiladi** (u implementatsiya, iste'molchi emas) va buyruq bilan takrorlanadi.

**Eng katta gap — pul semantikasi, integratsiya emas.** B texnik jihatdan A dan boy
(PostGIS/Redis GEO, BullMQ, Socket.IO, taximetr, 550 haydovchi). Lekin B'da **mijozning so'mdagi
cashback hamyoni umuman yo'q** — `clients.balls` (`1067-taxi/packages/db/src/schema/clients.ts:20`)
o'yin valyutasi, safar narxidan yechilmaydi. A esa aynan shu `points` maydonini tangaga ayirboshlaydi
(`packages/server/src/services/coinService.ts:305-306, 372-374`). 3 ta "YO'Q" metodning hammasi shu
bitta yetishmayotgan tushunchadan chiqadi.

**Arxitektura tavsiyasi bir jumlada [taklif]:** **(c) aralash, lekin og'irligi B tomonda** —
**dispatch runtime B'da qoladi** (chunki tayinlash haydovchi-ta'minot holati bilan BITTA
tranzaksiyada bo'lishi shart, ta'minot holati esa faqat B'da: Redis GEO + Kotlin ilova), A'dagi
shoxobcha esa **dispetcher sifatida tashlanadi**, ammo uning `packages/shared/src/dispatch.ts`
lug'ati (id-fazo, status-mashina, narx presetlari, ETA) **`BirJoySource` adapteri sifatida
saqlanadi** — u F1 uchun baribir kerak; qolgan 3 g'oyasi (to'lqinli taklif, reject≠timeout,
kill-switch bayrog'i) B'ga tiket bo'lib ko'chadi.

---

## 2. 27 METODLIK PARITET JADVALI

Interfeys manbai: `packages/server/src/kas/types.ts:210-276`.
A'dagi joylar — **skriptsiz** (jonli kod) chaqiruvlar; `/scripts/` alohida sanaladi.

| # | Metod | A qayerda ishlatadi (fayl:qator) | B'da qaysi endpoint/jadval qoplaydi | Gap | Qiyinlik |
|---|---|---|---|---|---|
| 1 | `fetchMembers()` | `sync/sync.ts:25` (1 joy) | `GET /clients` (`clients.controller.ts:11`) + `GET /drivers` (`drivers.controller.ts:40`), jadval `clients`/`drivers` | 🟡 **qisman** — satrlar bor, lekin `KasMember.points` (mijoz uchun = so'mdagi cashback) B'da YO'Q; `clients.balls` boshqa valyuta | O'rta |
| 2 | `fetchByPhone(phone, only?)` | `adminOps.ts:213,258` · `coinService.ts:372` · `memberService.ts:342` · `sync/sync.ts:103` (5) | mijoz: `GET /operator/client/lookup?phone` (`operator.controller.ts:31`) · haydovchi: telefon bo'yicha ANIQ route yo'q, faqat `GET /topup/driver/lookup` (`topup.controller.ts:42`, `topup.service.ts:80-107` — telefon YOKI raqam bo'yicha aniq qidiruv) | 🟡 **qisman** — 2 xil endpointdan yig'iladi; `points` yana yo'q | O'rta |
| 3 | `checkClient(phone)` | `bot/booking.ts:215,237,362` · `bot/bot.ts:1868` · `bookingService.ts:111,487` (6) | `GET /operator/client/lookup` → `operator.service.ts:35-77` qaytaradi: `client`, `savedAddresses`, `recentOrders(10)`, `blacklistedDriverIds`, `preferredDriver` | 🟡 **qisman** — `activeBooking` yo'q (alohida chaqiruv kerak); `savedAddresses` semantikasi boshqa (pastda §3.2) | O'rta |
| 4 | `searchAddresses(text)` | `bot/booking.ts:148` · `bookingService.ts:158` · `ai/intent.ts:125` (3) | `GET /addresses/search` (`addresses.controller.ts:8`, `addresses.service.ts:11-16`) → `addresses` jadvali to'liq satri | ✅ **to'liq bor** — `id,name,lat,lng,additionalPayment` hammasi bor (`schema/addresses.ts:9-27`) | Past |
| 5 | `getAllAddresses()` | `bot/booking.ts:149` · `bookingService.ts:166,185` (3) | `GET /addresses/popular` (`addresses.controller.ts:13`) — faqat `isPopular` va limit 20 | 🟡 **qisman** — TO'LIQ katalog route'i yo'q; jadvalda ~98 Koson manzili bor (`docs/MASTER-PLAN.md:114`), lekin `getAll` endpointi yozilmagan | Past |
| 6 | `createBooking(req)` | `bot/booking.ts:820` · `bookingService.ts:271,542` · `scheduledService.ts:67,122` (5) | `POST /operator/orders` (`operator.controller.ts:48`) → `operator.service.ts:115-197`. `OrdersService.createOrder` (`orders.service.ts:45`) route'siz — §4 ga qara | 🟡 **qisman** — (a) `AdminAuthGuard` ostida, (b) `clientId` talab qiladi, telefon emas, (c) **`pickupLat/pickupLng` MAJBURIY** (`operator/dto/operator.dto.ts:35-39`) — A'da esa yozilgan manzil 98% (`memory: taxi-pickup-reality`), (d) `addressId` tushunchasi yo'q | **Yuqori** |
| 7 | `getBookingAddons()` | `index.ts:111` · `bookingService.ts:115,249` (3) | `GET /order-requirements` (`order-requirements.controller.ts:13`) → `order_requirements` (`schema/order-requirements.ts:14-29`) | ✅ **to'liq bor** — `{id,name,priceUzs}` ≡ `KasAddon{id,name,price}`; `externalId` bilan kas'dan idempotent import | Past |
| 8 | `cancelBooking(bookingId)` | `bookingService.ts:301` (1) | `PATCH /orders/:id/cancel-admin` (`orders.controller.ts:147`) → `orders.service.ts:388` | ✅ **to'liq bor** | Past |
| 9 | `getActiveBooking(phone)` | `bot/booking.ts:344,536,546,559,573` · `bookingService.ts:116,294,309` (8) | `GET /orders/client/active` (`orders.controller.ts:82`, `orders.service.ts:562`) | 🟡 **qisman** — (a) `TelegramInitDataGuard` (server initData yasay olmaydi), (b) telefon emas, `clientId`, (c) **yo'q maydonlar:** `clientBonus`, `priceTier`, `notifiedCount`, `additionalPaymentAddress/Client/Company`, driver'da `meterPayment`/`meterDistance` | **Yuqori** |
| 10 | `listActiveBookings()` | `api/server.ts:3633` · `adminModules.ts:51` · `adminOps.ts:162` · `bookingNotifier.ts:192` · `driverEngageService.ts:82` (5) | `GET /orders/active` (`orders.controller.ts:135`, `orders.service.ts:764`) | 🟡 **qisman** — `ActiveBookingLite.phoneNorm` (A sweep'i shu bilan a'zoni topadi) va `clientBonus` javobda yo'q; `OrderSummary` proyeksiyasi (`orders.service.ts:766-785`) kengaytirilishi kerak | O'rta |
| 11 | `getRideHistory(phone,size,page)` | `bookingNotifier.ts:782,968` · `bookingService.ts:37` (3) | `GET /orders/client/history` (`orders.controller.ts:92`) yoki `GET /clients/:id/orders` (`clients.controller.ts:44`) | 🟡 **qisman** — **`cashback` maydoni B'da UMUMAN YO'Q** (`schema/orders.ts` da bunday ustun yo'q); `time` (daqiqa) ustuni yo'q, `rideStartedAt→completedAt` dan hisoblanadi (`orders.service.ts:151-153`) | **Yuqori** |
| 12 | `getRidesByCar(carNumber)` | `api/server.ts:1508` · `driverEngageService.ts:105` · `driverMissionService.ts:55` · `driverReportService.ts:40` (4) | Raqam bo'yicha route YO'Q. `GET /orders/my` (`orders.controller.ts:20`) — haydovchi JWT'si bilan; `GET /orders?` (`orders.controller.ts:129`, `getOrdersPaginated`) — admin filtri | 🟡 **qisman** — `carNumber → driverId` ni oldin `topup/driver/lookup` bilan yechish kerak; `cashback` yana yo'q | O'rta |
| 13 | `getDriverPins()` | `bookingPlus.ts:52` (1) | `GET /location/online/details` (`location.controller.ts:36`, `location.service.ts:167`) → Redis GEO `drivers:geo` | ✅ **to'liq bor** — `DriverLiveEntry{lat,lng,bearing,speedKmh,status}`; `busy` ← `status==='on_ride'` | Past |
| 14 | `getDriverByCar(carNumber)` | `bookingNotifier.ts:217` · `transferService.ts:130` (2) | Raqam→haydovchi: `GET /topup/driver/lookup` (`topup.service.ts:80-107`, ANIQ raqam bo'yicha). Joylashuv: `location.service.ts:84` (Redis, 30s TTL — `location.service.ts:13`) | 🟡 **qisman** — 2 chaqiruvni birlashtirish kerak; **`meterPayment`/`meterDistance` (jonli taximetr) endpointsiz** — `TaximeterService` route'siz (§4) | O'rta |
| 15 | `getReportsPage(page,size)` | `analyticsService.ts:36` (1) | `GET /orders` sahifalangan (`orders.controller.ts:129`, `orders.service.ts:802`) | 🟡 **qisman** — sahifalash bor, `cashback` yo'q (#11 bilan bir xil sabab) | Past |
| 16 | `listDriverRoster()` | `driverCallService.ts:102` (1) | `GET /drivers/outreach/list` (`drivers.controller.ts:91`, `drivers.service.ts:249`) — obzvon CRM ro'yxati | 🟡 **qisman** — **yo'q maydonlar:** `debt` (B'da qarz tushunchasi umuman yo'q), `cancels` (`driver_performance_stats.totalCancelled` da — `schema/driver-performance.ts:20`), `lastRideAt` (faqat `lastOnlineAt`), `licenseTerm` (`driver_documents.expiryDate`), `address` (B'da haydovchi manzili ustuni yo'q) | O'rta |
| 17 | `setClientBonus(phone,newBonus)` | `coinService.ts:374` (1) | **YO'Q** | ⛔ **umuman yo'q** — B'da mijozning so'mdagi bonus hamyoni yo'q. `LoyaltyService.awardBalls` (`loyalty.service.ts:67`) `clientId` oladi va `balls` (o'yin ballari) yozadi; **admin uchun ball berish endpointi ham yo'q** (hamma `loyalty.controller.ts` route'i `TelegramInitDataGuard`) | **Yuqori** |
| 18 | `addClientBonus(phone,delta)` | `adminOps.ts:233,336` · `coinService.ts:306` (3) | **YO'Q** | ⛔ **umuman yo'q** — #17 bilan bir xil. `ClientsService.updateBalls` (`clients.service.ts:130`) bor, lekin `clientId` bo'yicha, audit satrisiz va route'siz | **Yuqori** |
| 19 | `setClientName(phone,fullName)` | `memberService.ts:86` (1) | `GET /operator/client/lookup` (telefon→id) → `PATCH /clients/:id` (`clients.controller.ts:33`, `clients.service.ts:246` — `fullName` oq ro'yxatda) | ✅ **to'liq bor** — 2 chaqiruv, lekin funksionallik to'liq | Past |
| 20 | `addDriverPayment(id,car,amount,comment,debt)` | `adminOps.ts:335` · `coinService.ts:305` · `driverDebtService.ts:118` (3) | `POST /topup` (`topup.controller.ts:48`, `topup.service.ts:116-231`) — tranzaksiya ichida `drivers.balanceUzs` + `commissions` + `topup_logs`. Muqobil: `POST /commissions/driver/:id/deposit` | 🟡 **qisman** — pul yozish bor va A'nikidan yaxshiroq (atomik, audit); lekin **`debt=true` bayrog'i mos kelmaydi** — B'da qarz maydoni yo'q, manfiy balans = qarz | O'rta |
| 21 | `getDriverAccount(carNumber)` | `driverDebtService.ts:52,79` · `driverReportService.ts:79,139` (4) | `GET /topup/driver/lookup` (`balanceUzs`) + `GET /commissions/driver/:id` (`commissions.controller.ts:11`) + `GET /drivers/earnings` (`drivers.service.ts:141`) | 🟡 **qisman** — `balance` ✓, `rating` ✓, `takeCount` (`totalRides`) ✓, `active` ✓; **`debt` YO'Q**, **`cancelCount` `drivers` da yo'q** (`driver_performance_stats` da) | O'rta |
| 22 | `getTariff()` | `clientInfoService.ts:14` (1) | `vehicle_classes` (`schema/vehicle-classes.ts:6-21`) + `settings` KV (`settings.service.ts:7-17`) | 🟡 **qisman** — `minimalPayment`←`minFareUzs` ✓, `distancePaymentInCity`←`perKmUzs` ✓, `timePayment`←`perMinUzs` ✓; **YO'Q:** `minimalDistance`, `firstKilometerPaymentInCity`, `secondKilometerPaymentInCity` va butun `*InRegion` uchligi — B tarifi boshqa modelda (base+perKm+perMin+zona) | **Yuqori** |
| 23 | `getBonusRules()` | `clientInfoService.ts:15` (1) | **YO'Q** | ⛔ **umuman yo'q** — so'mdagi cashback qoidalari jadvali yo'q; ball tezligi env konstantasi (`orders.service.ts:39-40`: `BALLS_PER_RIDE`) | O'rta |
| 24 | `getCarModels()` | `clientInfoService.ts:16` (1) | `GET /car-models` (`car-models.controller.ts:12`) → `car_models` (`schema/car-models.ts:10-29`) | ✅ **to'liq bor** — `category` int→string konversiyasi; `rating` kas'da ham doim 0 (B buni `car-models.ts:19-20` da hujjatlashtirgan) | Past |
| 25 | `getCompanyInfo()` | `index.ts:109` · `adminOps.ts:24` · `bookingService.ts:113` · `clientInfoService.ts:17` · `driverReportService.ts:143` (5) | `GET /settings` (`settings.controller.ts:10`) — bo'sh KV jadval | 🟡 **qisman** — jadval bor, **kalitlar yo'q**: `companyName`, `dispatcherPhones[]`, markaz `lat/lng` B'da hech qayerda saqlanmaydi. Eng yaqin narsa `operator_phone_devices.ownPhone` (`schema/operator.ts:61`) | Past (seed) |
| 26 | `getServiceArea()` | `index.ts:110` · `bookingService.ts:112` (2) | `GET /geofence/service-areas` (`geofence.controller.ts:12`) → `service_areas.polygonGeo` GeoJSON (`schema/service-areas.ts:12`) | ✅ **to'liq bor** — GeoJSON halqasini `GeoPoint[]` ga yoyish kerak | Past |
| 27 | `getMainReport()` | `bookingNotifier.ts:208` · `bookingPlus.ts:57` · `economyService.ts:32` (3) | `GET /admin/dashboard` (`admin.controller.ts:10`, `admin.service.ts:15-110`) | 🟡 **qisman** — `completedYesterday` ichkarida hisoblanadi lekin QAYTARILMAYDI (`admin.service.ts:60`); `onlineDrivers` ✓ (`location.getOnlineDriverCount()`); `activeDrivers` semantikasi boshqa (`totalDrivers` = `isActive` bayrog'i, kas'da esa = safar olganlar); `bookingsYesterday` hosila; `serviceCost` ≈ `revenueToday` (komissiya yig'indisi) | O'rta |

### O'lchov buyrug'i (takrorlanadi)

```bash
cd "C:/Users/sarva/Desktop/1067 bot"
PAT='\.(fetchMembers|fetchByPhone|checkClient|searchAddresses|getAllAddresses|createBooking|getBookingAddons|cancelBooking|getActiveBooking|listActiveBookings|getRideHistory|getRidesByCar|getDriverPins|getDriverByCar|getReportsPage|listDriverRoster|setClientBonus|addClientBonus|setClientName|addDriverPayment|getDriverAccount|getTariff|getBonusRules|getCarModels|getCompanyInfo|getServiceArea|getMainReport)\('
grep -rnE "$PAT" --include=*.ts packages/*/src | grep -v 'packages/server/src/kas/' | wc -l   # → 112
grep -rlE "$PAT" --include=*.ts packages/*/src | grep -v 'packages/server/src/kas/' | wc -l   # → 44
```

**Natija: `7 TO'LIQ · 17 QISMAN · 3 YO'Q`**

---

## 3. SHAKL NOMUVOFIQLIKLARI (maydon darajasida)

### 3.1 `RideHistoryItem` (`kas/types.ts:109-125`) ↔ B `orders` (`schema/orders.ts:29-129`)

| A maydoni | B manbai | Holat |
|---|---|---|
| `id` | `orders.id:30` | ✅ |
| `addressName` | `orders.pickupAddress:46` | ✅ (lekin B'da katalogga FK yo'q — faqat erkin matn) |
| `status` | `orders.status:56` | 🟡 lug'at boshqa (§3.6) |
| `carNumber` | `drivers.carNumber:33` (join) | ✅ |
| `carModel` | `drivers.carModel:31` / `carModelId:32` | ✅ |
| `payment` | `orders.finalFareUzs:67` | ✅ |
| **`cashback`** | **YO'Q** | ⛔ B'da safar-cashback ustuni yo'q. Eng yaqin — `ball_logs.relatedOrderId` (`schema/loyalty.ts:28`), lekin u ball, so'm emas |
| `distance` (km) | `orders.distanceKm:68` | ✅ |
| **`time`** (daqiqa) | **ustun YO'Q** | 🟡 hosila: `rideStartedAt:97 → completedAt:98` (`orders.service.ts:151-153` da hisoblanadi, saqlanmaydi) |
| `at` | `orders.createdAt:121` | ✅ |
| **`additionalPaymentAddress`** | **YO'Q** | ⛔ B'da faqat BITTA yig'indi: `additionalPaymentUzs:75` |
| **`additionalPaymentClient`** | **YO'Q** | ⛔ ayni sabab |
| **`additionalPaymentCompany`** | ≈ `orders.commissionUzs:86` | 🟡 semantik yaqin, lekin kas'ning uch bo'lakli taqsimoti emas |

**Oqibat:** A'ning "halol taqsimot" ekranlari (`bookingNotifier.ts`, `driverReportService.ts`) uchta
qo'shimcha to'lovni alohida ko'rsatadi. B'da bu bitta raqam — yo B'ga 2 ta ustun qo'shiladi, yo
A o'sha ekranlarni soddalashtiradi. **Bu ega qarori.**

### 3.2 `SavedAddress` / `ClientBookingInfo.addresses` (`kas/types.ts:16-29`)

| A tushunchasi | B'da |
|---|---|
| Mijozning kas'dagi ma'lum joylari ro'yxati (cheksiz, katalog satrlari) | **IKKI xil jadval:** `addresses` — global katalog, `externalId` + `additionalPayment` bilan (`schema/addresses.ts:25,27`) ✅ ; `saved_addresses` — mijoz uchun **faqat `home`/`work`/`custom`** yorliqlari, `(clientId,label)` unique (`schema/saved-addresses.ts:12,19`), **surcharge maydoni yo'q** |

**Oqibat:** `checkClient().addresses` uchun B'ning `savedAddresses` i EMAS, balki mijozning
buyurtma tarixidan chiqarilgan manzillar ishlatilishi kerak. `SavedAddress.surcharge` faqat
global `addresses` jadvalidan keladi. Diqqat: `addresses.additional_payment_uzs` hozir **narx
hisobida umuman o'qilmaydi** (`pricing.service.ts:92-168` `addresses` ga tegmaydi) — bu B'dagi
mustaqil xato.

### 3.3 `ActiveBooking` / `ActiveBookingLite` (`kas/types.ts:67-99`)

Yo'q maydonlar: `clientBonus` (⛔ manba yo'q), `priceTier` (🟡 `vehicleClassId` ga aylantiriladi),
`notifiedCount` (🟡 hosila: `dispatch_offer_logs` dan `COUNT(*)` — `schema/driver-performance.ts:48-70`),
`phoneNorm` (🟡 hosila: `clients.phone` ning oxirgi 9 raqami), uchta `additionalPayment*` (§3.1).
`BookingDriver.meterPayment`/`meterDistance` — `TaximeterService` mavjud, **lekin route'siz** (§4).

### 3.4 `KasMember` (`kas/types.ts:4-13`)

`points` — A uchun **mijozda so'mdagi cashback, haydovchida kas balansi**. B'da:
haydovchi ← `drivers.balanceUzs:71` ✅ ; mijoz ← **mos keluvchi yo'q**; `clients.balls:20` boshqa
valyuta (o'yin ballari, do'kondan mahsulot olinadi — `schema/loyalty.ts:52-62`).
Bu **jadvaldagi 3 ta "YO'Q" ning yagona sababi**.

### 3.5 `ClientTariff` (`kas/types.ts:128-138`) ↔ `vehicle_classes`

| A | B | Holat |
|---|---|---|
| `minimalPayment` | `minFareUzs:14` | ✅ |
| `distancePaymentInCity` | `perKmUzs:11` | ✅ |
| `timePayment` | `perMinUzs:12` | ✅ |
| `minimalDistance` (metr) | — | ⛔ butun sxemada "minimal masofa" tushunchasi yo'q |
| `firstKilometerPaymentInCity`, `secondKilometerPaymentInCity` | — | ⛔ B'da pog'onali km narxi yo'q, tekis `perKmUzs` |
| `firstKilometerPaymentInRegion`, `secondKilometerPaymentInRegion`, `distancePaymentInRegion` | — | ⛔ "shahar/viloyat" ajratmasi yo'q; o'rniga `zone_pricing_rules` (`schema/pricing-zones.ts:37-57`) |
| — | `baseFareUzs:10` (B'da qo'shimcha) | A'da mos keluvchi yo'q |

**Xulosa:** ikkala tarif modeli ham to'g'ri, lekin **bir-biriga aylanmaydi**. A'ning narx
kalkulyatori (`bookingService`) B'ning `GET /orders/estimate` (`orders.controller.ts:113`,
yagona ochiq route) ga o'tishi kerak — tarif maydonlarini ko'chirish emas.

### 3.6 Status lug'ati

| A (kas, `bookingNotifier.ts:24-29`) | B (`schema/orders.ts:11-24`) |
|---|---|
| `new` | `pending` / `dispatching` |
| `called` / `take` | `accepted` |
| `arrived` | `driver_arrived` |
| `in_place` → `started` | `in_progress` |
| `delivered` | `completed` |
| `cancel_by_operator/server/driver/client`, `take_back`, `cancel` | `cancelled_client` / `cancelled_driver` / `cancelled_dispatcher` / `no_drivers` / `expired` |
| — | `driver_en_route` (B'da qo'shimcha) |

B lug'ati **boyroq va aniqroq**. Aylantirish adapteri kerak — va u shoxobchada allaqachon yozilgan:
`dispatchToBookingStatus` (`packages/shared/src/dispatch.ts:33`). §5 ga qara.

---

## 4. "SERVIS BOR, ROUTE YO'Q" RO'YXATI

**Asosiy topilma tasdiqlandi [o'lchandi]:**
`OrdersService.createOrder` — `1067-taxi/apps/api/src/modules/orders/orders.service.ts:45`.
`orders.controller.ts` (156 qator) da **hech qanday `@Post()` yo'q** — 14 ta route'ning
hech biri buyurtma yaratmaydi. Butun repoda YAGONA chaqiruvchi:
`apps/api/src/modules/telegram/telegram.service.ts:1161`.

```bash
cd "C:/Users/sarva/Desktop/1067 bot/1067-taxi"
grep -rn "createOrder" --include=*.ts apps/ packages/ | grep -v node_modules | grep -v ".claude/worktrees"
# → orders.service.ts:45 (ta'rif) · telegram.service.ts:1161 (yagona chaqiruv) · intercity.controller.ts:32 (boshqa metod)
```

**Buyurtma satri kiritiladigan 4 joy:** `orders.service.ts:56` (faqat Telegram bot) ·
`operator.service.ts:148` (HTTP ✅) · `intercity.service.ts:62` · `scheduled-rides.processor.ts:41`.
Ya'ni **HTTP orqali buyurtma yaratishning yagona yo'li — `POST /operator/orders`**, u ham
`AdminAuthGuard` ostida va `clientId` + `pickupLat/Lng` majburiy.

### Shunga o'xshash boshqa holatlar

| Servis | Ochiq metodlar | Route holati |
|---|---|---|
| `routing/routing.service.ts` | `getRoute:34`, `getEta:63`, `getDistanceMatrix:88`, `isOsrmAvailable:128` | ⛔ **butunlay o'lik** — controller ham yo'q, hech kim inject ham qilmaydi. Shu sababli `orders.osrmDistanceM/osrmDurationS/osrmRouteGeometry` (`schema/orders.ts:78-80`) **hech qachon to'ldirilmaydi**, narx esa haversine×roadFactor bilan hisoblanadi (`pricing.service.ts:99-100`) |
| `dispatch/dispatch.service.ts` | `startDispatch:63`, `tryNextDriver:93`, `driverAccepted:274`, `driverRejectedOrTimeout:339`, `manualAssign:360`, `resendPendingOfferToDriver:500` | 🟡 controller yo'q; faqat `manualAssign` HTTP'ga chiqadi (`POST /operator/dispatch/manual`, `PATCH /operator/orders/:id/reassign`). Qolgani in-process + Socket.IO |
| `dispatch/driver-scorer.service.ts` | `scoreDrivers:35` | 🟡 faqat dispatch va `operator.service.ts:229` orqali |
| `pricing/taximeter.service.ts` | `start:38`, `addPoint:59`, `getTotalKm:106`, `stopAndDrop:115` | 🟡 socket + `OrdersService`; **`getTotalKm:106` ning chaqiruvchisi yo'q** → jonli taximetr o'qishi (`meterPayment`/`meterDistance`) tashqaridan olinmaydi |
| `pricing/surge.service.ts` | `getSurgeMultiplier:30`, `recalculateSurge:48`, `findZoneForPoint:140`, `getAllZonesWithSurge:156` | 🟡 `getAllZonesWithSurge:156` — **chaqiruvchisi yo'q** (`pricing-admin.controller.ts:71` xom DB inject qiladi) |
| `safety/cancellation.service.ts` | `calculateCancellationFee:35`, `applyCancellationFee:105` | ⛔ **route yo'q** → `orders.cancellation_fee_uzs` bekor qilish route'i tomonidan hech qachon yozilmaydi (`orders.service.ts:449-454` faqat status/vaqt/sabab yozadi) |
| `queue/queue-management.service.ts` | 7 ta metod | 🟡 controller faqat `getAllQueues` ni bog'lagan (`queue.controller.ts:12`); yozuv metodlari (`updateDriverQueuePosition`, `markServed`, `leaveAllQueues`) route'siz |
| `drivers/driver-performance.service.ts` | `recalculateAllStats:31`, `recalculateDriverStats:54`, `processIncentives:192` | 🟡 faqat cron |
| `safety/fatigue-monitor.service.ts`, `safety/route-monitor.service.ts` | cron metodlari | 🟡 faqat cron/socket |

**Bo'sh modul papkalari [o'lchandi]:** `apps/api/src/modules/sla/` va `apps/api/src/modules/surge/`
— **ikkalasi ham nol faylli**. (`sla_violations` jadvali bor, servis yo'q; surge esa
`pricing/surge.service.ts` da.)

**Hech qaysi controller inject qilmaydigan servislar (16 ta):** `DispatchService`,
`DriverScorerService`, `RoutingService`, `SurgeService`, `TaximeterService`, `CancellationService`,
`FatigueMonitorService`, `RouteMonitorService`, `DriverPerformanceService`, `ClickService`,
`PaymeService`, `TripNotificationsService`, `HealthAlerterService`, `TelegramAlertsService`,
`EskizService`, `TelegramGatewayService`.

### Yo'l-yo'lakay topilgan 3 ta xato (F1 emas, alohida tiket)

1. **Sign konvensiyasi ziddiyati** — `WalletService.topUp` depozitni **manfiy** yozadi
   (`payments/wallet.service.ts:60`), `TopupService.performTopup` esa **musbat**
   (`topup/topup.service.ts:198`). Sxema izohi ("positive = debit") `WalletService` tomonida
   (`schema/commissions.ts:23`). Ikkita mustaqil komissiya-yechish implementatsiyasi ham bor
   (`orders.service.ts:847` — ishlatiladi; `wallet.service.ts:72` — hech qachon chaqirilmaydi).
2. **`getAvailableDrivers` N+1/to'liq-skan** — `operator.service.ts:251-252` boyitish so'rovi
   `driverIds` ro'yxatini e'tiborsiz qoldirib, HAMMA aktiv haydovchini yuklaydi.
3. **`zoneAffinity` o'lik og'irlik** — `dispatch.service.ts:176` da `pickupTumanId` qattiq
   `null` (`// TODO`), shuning uchun 0.10 og'irlik hamma haydovchi uchun doimiy 0.5 beradi.

---

## 5. ARXITEKTURA QARORI — ikkita dispatch

### 5.1 Ikki implementatsiya, faktlar bilan

| O'lchov | **B: `1067-taxi/apps/api/src/modules/dispatch/`** | **A shoxobchasi: `origin/claude/taxi-system-drivers-bsa05f`** |
|---|---|---|
| Hajm | **1 302 qator** TS (7 fayl) | **396 qator** TS (`packages/shared/src/dispatch.ts` 212 + test 184) + 78 qator Prisma |
| Diff tarkibi | — | 2 003 qo'shilgan qatorning **1 508 tasi (75%) Markdown reja** |
| Nomzod tanlash | **Redis GEO `GEOSEARCH`** 5 km, top 50 (`dispatch.service.ts:112-117` → `location.service.ts:104-130`) | Chaqiruvchi bergan massiv; chaqiruvchi **mavjud emas** |
| Reyting | **7 omilli og'irlikli** (`dispatch.types.ts:25-33`): yaqinlik .30 · qabul darajasi .20 · reyting .15 · sinf mosligi .15 · zona .10 · bekor jarimasi −.05 · yo'nalish jarimasi −.05 | **Faqat masofa** — 3 chelakli bo'lish + haversine sort (`dispatch.ts:100-123`). Og'irlik yo'q |
| Taklif modeli | **Ketma-ket 1 haydovchi**, 15 s, 5 urinish (`dispatch.service.ts:46-49`) | **To'lqinda 4 haydovchi**, 20 s, 4 to'lqin, 120 s limit (`packages/shared/src/economy.ts:383-391`) — **faqat knob, kod yo'q** |
| Poyga xavfsizligi | Redis `SET NX EX 5` + shartli UPDATE + qayta o'qish (`dispatch.service.ts:276-307`) | Rejada atomik `updateMany` (`DISPATCH_PLAN.md:104`), **yozilmagan** |
| Taymer | BullMQ kechiktirilgan job + worker (`dispatch.processor.ts:7-21`) | Yo'q |
| Haydovchiga yetkazish | **Socket.IO `booking:offer`** + reconnect qayta yuborish (`dispatch.service.ts:225-242, 500-561`) | Yo'q (rejada Telegram inline tugma) |
| Taklif jurnali | `dispatch_offer_logs` 12 ustun, **har taklifda yoziladi** (`schema/driver-performance.ts:48-70`) | `DispatchOffer` 11 ustun, **hech qachon yozilmaydi** |
| Haydovchi mavjudligi | `drivers.status` + Redis GEO + bearing/speed | `DriverShift` modeli bor, **hech qachon to'ldirilmaydi** |
| Kill-switch bayrog'i | ⛔ **YO'Q — doim yoqiq** | `owndispatch` (`featureFlags.ts:176-188`), lekin **`featureOn("owndispatch")` chaqiruvi 0 ta** |
| Testlar | 6 ta servis testi (hamma bog'liqlik mock); **scorer'ning testi UMUMAN yo'q** | 20 ta sof-funksiya testi, yashil, integratsiya nol |
| HTTP'ga ulangan | ✅ `POST /operator/orders`, `PATCH /orders/:id/cancel`, Telegram webhook, WS accept/reject, cron→BullMQ | ⛔ Yo'q |
| `main` ga qo'shilgan | (o'zi main) | ⛔ **Yo'q** — `git cat-file -e origin/main:packages/shared/src/dispatch.ts` → *path does not exist* |

**Shoxobchaning o'z bahosi** (`DISPATCH_PLAN.md:311-320`): *"Server servisi, bot handlerlari, API,
UI — ❌ YOZILMAGAN"*, *"Xatti-harakat o'zgarishi NOL"*.

### 5.2 Hal qiluvchi cheklov — A dispetcherlik qila OLMAYDI

`origin/main:packages/server/prisma/schema.prisma` da **haydovchi koordinatasi ham, onlayn holati
ham YO'Q** [o'lchandi]:

- `Member` (`schema.prisma:15-119`) — `lastPickupLat/Lng:73-74` **yo'lovchining** olib ketish joyi;
  haydovchi joylashuvi emas. `liveLocMsgId:45` — bu **xabar id'si**, koordinata emas.
- `DriverSession` (`:1040-1053`) — kas'ning driverApp maxfiy kaliti. Autentifikatsiya **kas'ga**,
  bizga emas. Joylashuv yo'q.
- `DriverCall` (`:1353-1382`) — sovuq qo'ng'iroq CRM ro'yxati. Real vaqt signali nol.
- `TelegramUser` (`:813-834`) — chat id'lar **bor** ✅ (yagona "mavjudlik"ka yaqin signal), lekin
  `lastSeenAt` = ilova tirikligi, smenada ekanligi emas.

Ya'ni A **kimni reyting qilishni ham, kimga taklif yuborishni ham bilmaydi**. Shoxobchaning
`DriverShift` modeli aynan shu bo'shliqni to'ldirish uchun yozilgan — va u sxemaga qo'shilgan,
**lekin VPS'ga qo'llanmagan, hech qachon yozilmagan, hech qachon o'qilmagan**.

### 5.3 Uch variant

#### (a) B ning dispatch moduli ustun, A dagi shoxobcha ishi tashlanadi

| | |
|---|---|
| **Yutamiz** | Ishlab turgan 1 302 qatorli dvigatel · Redis GEO + BullMQ + Socket.IO · 7 omilli reyting · reconnect tiklash · `dispatch_offer_logs` analitikasi · Kotlin ilovadagi swipe-to-accept · tayinlash haydovchi holati bilan BITTA bazada |
| **Yo'qotamiz** | To'lqinli taklif modeli · `reject≠timeout` ajratmasi · `owndispatch` kill-switch · narx presetlari + `parseFareInput` (manzilsiz bozor uchun) · id-fazo hiylasi (`900_000_000`) · status-mashina va kas-lug'ati adapteri · 20 ta sof-funksiya testi |
| **Ish hajmi** | Dispatch uchun **0** (allaqachon bor). F1 = faqat `BirJoySource` |
| **Xavf** | Kill-switch'siz dispatch CLAUDE.md ning "har mexanika kill-switch flag bilan" qoidasini **buzadi**. Scorer testsiz. Ketma-ket 15s×5 = 75 s eng yomon holat — 21.5% rad etish darajasidagi bozorda uzoq |

#### (b) A dagi yangi yadro ustun, B ning dispatch'i ishlatilmaydi

| | |
|---|---|
| **Yutamiz** | Bitta repo, bitta ORM, tanga iqtisodiyoti bilan yonma-yon · flag ostida DARK chiqarish · to'lqinli model |
| **Yo'qotamiz** | Redis GEO, BullMQ, Socket.IO, taklif jurnali, reconnect, 7 omilli reyting — **hammasi qaytadan yoziladi** |
| **Ish hajmi** | **Juda katta.** Shoxobcha o'z rejasi bo'yicha ~15% (sxema + sof funksiyalar). Qolgani: servis, bot handlerlari, API, konsol, **VA haydovchi ilovasi** (`DRIVER_APK_PLAN.md` 585 qator, o'z bahosi **3-4 hafta**) |
| **Xavf** | ⛔ **Halokatli.** A'da haydovchi GPS/onlayn holati yo'q (§5.2). Ularni Prisma'ga qo'shish = B'dagi `drivers` + Redis GEO + Kotlin ilovaning **ikkinchi nusxasi**. Ikkita haqiqat manbai = `DISPATCH_PLAN.md:§13` ning o'zi ogohlantirgan "ikkita DispatchRide = migratsiya halokati" |

#### (c) Aralash

Ikki xil "aralash" bor va ular teng emas:

**(c1) Runtime bo'linadi** — dispatch A'da, haydovchilar B'da. ⛔ **RAD ETILADI.**
Sabab quyida (§5.4) — bu ORM/baza ajratmasi tufayli **pul yo'lida split-brain** yaratadi.

**(c2) Runtime B'da, lug'at A'dan.** ✅ **Tavsiya etiladi.**

---

### 5.4 ORM/baza ajratmasi bu tanlovga qanday ta'sir qiladi — hal qiluvchi dalil

A = **Prisma**, `localhost:5432/birjoy` (VPS ichida). B = **Drizzle**, alohida Postgres+PostGIS+Redis.
**Bitta tranzaksiya ikkala bazani qamrab ololmaydi.**

Dispatch'ning eng muhim amali — **tayinlash**: "buyurtma X haydovchi Y ga biriktirildi" va
"haydovchi Y endi band" **atomik** bo'lishi shart. B buni shunday bajaradi:
Redis `SET NX EX 5` qulf → `UPDATE orders ... WHERE status IN ('pending','dispatching')` →
qayta o'qib tasdiqlash → `UPDATE drivers SET status='on_ride'`
(`dispatch.service.ts:276-317`) — **hammasi bitta bazada**.

Agar dispatch A'da bo'lsa (variant b yoki c1):

1. A `DispatchRide.driverId` ni Prisma'da yozadi;
2. B `drivers.status='on_ride'` ni Drizzle'da yozadi;
3. **Ikkisi orasida tranzaksiya yo'q.**

Tarmoq uzilishi yoki qayta ishga tushirish o'rtada tushsa: buyurtma "tayinlangan", haydovchi esa
"bo'sh" — yoki teskarisi. Ikkita yo'lovchi bitta mashinaga. Bundan keyin komissiya
(`commissions`), tanga mukofoti (`CoinTxn`) va haydovchi balansi **bir-biriga zid** ikki bazada
hisoblanadi. CLAUDE.md ning "hamma tanga operatsiyasi CoinTxn + idempotent kalit" invarianti
buziladi, chunki idempotentlik faqat bitta baza ichida kafolatlanadi.

**Xulosa [xulosa]: tayinlash ta'minot holati bilan bir joyda bo'lishi SHART. Ta'minot holati
faqat B'da (Redis GEO + `drivers.status` + Kotlin ilova). Demak dispatch B'da.**

Teskari tomondan bu **hech narsani buzmaydi**: `KasDataSource` interfeysida **dispatch metodi
umuman yo'q** (`kas/types.ts:210-276` — 27 metodning birortasi ham haydovchi tayinlamaydi).
A hech qachon dispetcherlik qilmagan — ARCHITECTURE.md:9-10 buni ochiq yozgan:
*"We do NOT run dispatch — kas1067 does."* Shoxobchadagi ish A uchun **migratsiya emas, YANGI
mas'uliyat** — ya'ni ko'lam kengayishi.

---

### 5.5 ANIQ TAVSIYA [taklif]

> ### **(c2) — B ning dispatch moduli g'olib bo'ladi. A dagi shoxobcha DISPETCHER sifatida tashlanadi, LEKIN uning lug'at qatlami `BirJoySource` adapteri sifatida saqlanadi.**

**Nima qayerdan:**

| Element | Qayerdan | Sabab |
|---|---|---|
| Nomzod qidirish, reyting, taklif, taymer, qabul poygasi, taklif jurnali | **B** (`dispatch.service.ts`, `driver-scorer.service.ts`) | Ishlaydi, ta'minot holati bilan bitta bazada, ilovasi bor |
| Haydovchi mavjudligi (onlayn/GPS/bearing) | **B** (Redis GEO + `drivers.status`) | A'da umuman yo'q |
| `dispatchBookingId` = `900_000_000 + id` id-fazosi | **A shoxobchasi** (`packages/shared/src/dispatch.ts:19-30`) | **F1 uchun BARIBIR KERAK** — B'ning `orders.id` (kichik serial) A'ning kas id'lari bilan to'qnashadi; `CoinTxn` idempotent kalitlari buziladi |
| `dispatchToBookingStatus` status aylantirish | **A shoxobchasi** (`dispatch.ts:33`) | §3.6 dagi lug'at farqining tayyor yechimi |
| `canTransition` / `dispatchRiderCancellable` holat-mashinasi | **A shoxobchasi** (`dispatch.ts:72,76`) | A'ning bot UI'si uchun; 20 ta test bilan qoplangan |
| `dispatchFarePresets` / `parseFareInput` / `dispatchEtaMin` | **A shoxobchasi** (`dispatch.ts:125,136,148`) | Manzilsiz bozor haqiqati (`memory: taxi-pickup-reality`). B'ning `estimateFare` i **manzilni talab qiladi** (`pricing.service.ts:92`) |
| `DriverShift` / `DispatchRide` / `DispatchOffer` Prisma jadvallari | ⛔ **TASHLANADI** | Ikkinchi haqiqat manbai. VPS'ga qo'llanmagan — hozir tashlash bepul |
| `owndispatch` bayrog'i | 🔄 **B'ga ko'chadi** | B'ning dispatch'ida kill-switch YO'Q — bu CLAUDE.md qoidasini buzadi |

**B'ga ko'chadigan 3 ta g'oya (alohida tiket, F1 dan keyin):**
1. **To'lqinli taklif** (4 haydovchi × 20 s) — hozirgi ketma-ket 15 s × 5 = 75 s eng yomon holat.
   Real bozorda 21.5% rad etish (`memory: real-market-1067`) → to'lqin sezilarli tezroq to'ldiradi.
   Lekin bu **o'lchanadigan gipoteza**, F2 soya rejimida A/B sinaladi, ko'r-ko'rona emas.
2. **`reject` ≠ `timeout`** — B ikkalasini `'timeout'` deb yozadi (`dispatch.service.ts:347`),
   shu sababli "haydovchi RAD ETDI" va "javob bermadi" statistikasi ajratilmaydi.
   Shoxobchaning `DispatchOffer.response` buni ajratadi.
3. **`owndispatch` kill-switch** — B'ning dispatch'i bayroqsiz, doim yoqiq.

**Nega (a) emas:** (a) id-fazo va status adapterini ham tashlaydi — ular F1 da qaytadan yoziladi.
Bepul yutuqni behuda tashlash.
**Nega (b) emas:** §5.4 — ORM/baza ajratmasi tayinlashni atomik qilishga imkon bermaydi; ustiga
haydovchi ilovasi qaytadan quriladi (3-4 hafta o'z bahosi bo'yicha).

**Shoxobcha bilan nima qilinadi:** `packages/shared/src/dispatch.ts` + testlari `main` ga
**kesib olinadi** (dispetcher sifatida emas, adapter sifatida) — Prisma'dagi 3 jadval va
`DriverShift` ga tegishli hamma narsa OLIB TASHLANADI. `DISPATCH_PLAN.md` va `DRIVER_APK_PLAN.md`
tarix sifatida qoladi, lekin `BIRJOY_TAXI_MASTER.md` ustun ekani yoziladi.
CLAUDE.md qoidasi bo'yicha shoxobcha keyin **o'chiriladi** (bitta shoxobcha — `main`).

---

## 6. F1 ISH REJASI — `BirJoySource`

**Maqsad:** `KAS_MODE=birjoy` uchinchi implementatsiya. Qabul mezoni:
`KAS_MODE=live` da **hech narsa o'zgarmaydi**, bayroq yoqilmaydi, typecheck+testlar yashil.

### F1.0 — To'siqlar (kod yozishdan OLDIN, ega qarori kerak)

| # | To'siq | Nega bloklaydi |
|---|---|---|
| **B1** | ⛔ **Mijoz cashback hamyoni** — B'da so'mdagi bonus yo'q. 3 ta metod (`setClientBonus`, `addClientBonus`, `getBonusRules`) va `RideHistoryItem.cashback` shunga bog'liq. **Qaror:** B'ga `clients.bonus_uzs` + `bonus_logs` qo'shamizmi, yoki A tanga iqtisodini butunlay o'z bazasiga olib o'tadimi? | 3 YO'Q + 4 QISMAN metod |
| **B2** | ⛔ **Servis-servis autentifikatsiyasi** — B'da faqat 4 guard bor (`common/guards/`: admin-jwt, client-jwt, driver-jwt, telegram-initData). **Mashina uchun guard yo'q.** A initData yasay olmaydi; uzoq yashovchi admin JWT esa xavfli | Hamma yozuv metodlari |
| **B3** | ⛔ **Ikkita Telegram bot** — B'ning o'z boti `@koson1067bot` jonli, polling rejimida, 1 212 qatorli to'liq buyurtma oqimi bilan (`telegram/telegram.service.ts`), o'z `clients` jadvaliga yozadi. A ham bot. **Ikkalasi bir bazaga buyurtma yozsa — ikkita mijoz identifikatori, ikkita ride card** | Butun oqim |
| **B4** | 🟡 **Identifikatorlarni bog'lash** — A `Member.kasId`, B `clients.id`/`drivers.id` + `externalId`. Telefon yagona umumiy kalit. Kim ustun? | Hamma metod |
| **B5** | 🟡 **Manzil vs koordinata** — B'ning buyurtma yaratishida `pickupLat/Lng` MAJBURIY, A'da esa 98% yozilgan manzil | `createBooking` |

### F1.1 — B tomonda qo'shiladigan narsalar (endpoint/ustun)

Ustuvorlik bo'yicha. Har biri B repozitoriysida alohida tiket.

| P | Ish | Fayl | Qamraydigan metodlar |
|---|---|---|---|
| **P0** | Servis-servis guard (`ServiceTokenGuard`) + `SERVICE_TOKEN` env | `apps/api/src/common/guards/` (yangi) | hammasi |
| **P0** | `POST /orders` — mijoz buyurtmasi route'i. `OrdersService.createOrder` ni HTTP'ga chiqarish; DTO'ga `phone`, `addressId?`, `requirementIds?`, `vehicleClassId?` qo'shish; `pickupLat/Lng` ni **ixtiyoriy** qilish (`addressId` bo'lsa katalogdan olinadi) | `orders.controller.ts`, `orders/dto/orders.dto.ts:5` | #6 |
| **P0** | `clients.bonus_uzs` ustuni + `bonus_logs` jadvali + `POST /clients/bonus` (telefon bo'yicha, set va delta) — **B1 qaroridan keyin** | `schema/clients.ts`, `loyalty.service.ts` | #17, #18, #23, #1, #2 |
| **P0** | `orders.cashback_uzs` ustuni + javob proyeksiyalariga qo'shish | `schema/orders.ts`, `orders.service.ts:607-619` | #11, #12, #15, #9, #10 |
| **P1** | `GET /orders/by-phone/active` va `GET /orders/by-phone/history` (servis-token bilan, telefon bo'yicha) | `orders.controller.ts` | #9, #11 |
| **P1** | `GET /orders/active` javobiga `phoneNorm` + `clientBonus` + `notifiedCount` (`dispatch_offer_logs` dan COUNT) qo'shish | `orders.service.ts:766-785` | #10 |
| **P1** | `GET /addresses` — to'liq katalog (sahifalangan) | `addresses.controller.ts` | #5 |
| **P1** | `GET /drivers/by-car/:plate` — `topup.service.ts:80` mantiqini alohida route qilish + Redis joylashuvi bilan boyitish | `drivers.controller.ts` | #14, #21, #12 |
| **P2** | `settings` ga kompaniya kalitlarini seed qilish: `COMPANY_NAME`, `DISPATCHER_PHONES`, `CITY_CENTER_LAT/LNG` | `settings.service.ts:7-17` | #25 |
| **P2** | `GET /admin/dashboard` javobiga `completedYesterday` + `bookingsYesterday` qo'shish (allaqachon hisoblanadi, `admin.service.ts:60`) | `admin.service.ts:87-109` | #27 |
| **P2** | `GET /drivers/outreach/list` ga `lastRideAt`, `cancels`, `licenseTerm` join qilish | `drivers.service.ts:249` | #16 |
| **P3** | `orders` ga `additional_payment_address_uzs` / `_client_uzs` — **agar ega uch bo'lakli taqsimotni saqlamoqchi bo'lsa** | `schema/orders.ts:75` | #9, #11 shakli |
| **P3** | Taximetr o'qish endpointi (`GET /orders/:id/meter`) — `TaximeterService.getTotalKm:106` ni ochish | `pricing/taximeter.service.ts` | #14 shakli |

### F1.2 — A tomonda qilinadigan ishlar

| P | Ish | Fayl |
|---|---|---|
| **P0** | `env.KAS_MODE` ni `z.enum(["mock","live","birjoy"])` ga kengaytirish | `packages/server/src/env.ts:29` |
| **P0** | `KasDataSource.name` ni `"mock"\|"live"\|"birjoy"` ga kengaytirish. ⚠️ `ds.name !== "live"` tekshiruvlari bor: `scripts/reverseOurDebtBug.ts:14`, `scripts/testDebtViaPlastik.ts:15` | `kas/types.ts:211` |
| **P0** | `getDataSource()` ga uchinchi shox | `kas/index.ts:14` |
| **P0** | **`BirJoySource` — 27 metod**, `KasLiveSource` (1 216 qator) naqshi bo'yicha: bitta HTTP chokepoint, navbat, pacing, keshlash | `kas/birjoy.ts` (yangi) |
| **P1** | Shoxobchadan lug'at qatlamini ko'chirish: `dispatchBookingId`, `dispatchToBookingStatus`, `canTransition`, `dispatchFarePresets`, `parseFareInput`, `dispatchEtaMin` + 20 test | `packages/shared/src/dispatch.ts` |
| **P1** | `birjoy` rejimini `KasMockSource` ga qarshi solishtiruvchi paritet-testi (har 27 metod uchun shakl tekshiruvi) | `scripts/testBirjoyParity.ts` (yangi) |
| **P2** | Narx kalkulyatorini `GET /orders/estimate` ga ko'chirish (tarif maydonlarini ko'chirish EMAS) | `bookingService.ts` |

### F1.3 — Qabul mezonlari (DoD, kod yozishdan oldin ega tasdiqlaydi)

1. `KAS_MODE=live` bilan jonli tizim **bayt-darajasida bir xil** ishlaydi (regressiya testi).
2. 27/27 metod `BirJoySource` da implementatsiya qilingan; **hech biri `throw new Error("not implemented")` emas** — buyruq+natija bilan isbotlanadi.
3. `pnpm typecheck` + vitest + `simEconomy`/`simLoyalty`/`simGuards` yashil (CI `ci.yml:66-82`).
4. Paritet-testi: har metod uchun `mock` va `birjoy` javob **shakli** bir xil.
5. Hech qanday global bayroq yoqilmagan; `KAS_MODE` `.env` da `live` bo'lib qoladi.
6. `PROGRESS.md` literal haqiqat bilan yangilangan.

---

## 7. QAMRAB OLINMAGAN

- **B ning jonli holati tekshirilmadi** — VPS/baza ulanishi taqiqlangan edi. B'ning `docs/MASTER-PLAN.md:14` "~80% pilotga tayyor" **[da'vo]**; men faqat **kodni** o'lchadim, ishlab turgan tizimni emas.
- **Testlar yugurtirilmadi** (build/install taqiqi). B'ning 6 dispatch testi va A'ning 20 shoxobcha testi haqidagi hamma gap — **kod o'qishdan**, natijadan emas.
- **Redis/PostGIS xatti-harakati** faqat koddan o'qildi. Redis GEO ning 30 s TTL'i (`location.service.ts:13`) real yukda qanday ishlashi o'lchanmagan.
- **B'ning `apps/client` (Mini App) va `apps/driver-android`** ko'rib chiqilmadi — `BIRJOY_TAXI_MASTER.md:305` Mini App rivojlantirilmasligini aytadi.
- **A'ning 44 fayldan 21 tasi `scripts/`** — ular F1 da yiqilishi mumkin, alohida tekshirilmadi.
- **Ma'lumot migratsiyasi** (A'ning `Member` ↔ B'ning `clients`/`drivers`) qamralmagan — bu alohida F-bosqich.

## 7b. XAVFSIZLIK ESLATMASI (yo'l-yo'lakay topildi)

`1067-taxi/.git/config` da GitHub **shaxsiy access token'i ochiq matnda** saqlanmoqda
(`origin` URL'i ichida: `https://SarvarkhonH:ghp_...@github.com/...`). Bu commit qilinmagan, lekin
diskda ochiq. **Tavsiya:** token'ni GitHub'da bekor qilish va `git remote set-url` bilan
credential-helper'ga o'tish. **Bu men bajaradigan ish emas — ega qaroridan keyin.**

---

## 8. OCHIQ SAVOLLAR (ega javob berishi kerak)

1. **[B1 — eng muhim]** Mijozning so'mdagi cashback'i qayerda yashaydi? (i) B'ga `clients.bonus_uzs` qo'shamiz, (ii) A o'z Prisma bazasida to'liq egalik qiladi va B faqat safar faktini beradi, (iii) tanga bilan birlashtiriladi? **Bu 3 ta YO'Q metodning taqdirini hal qiladi.**
2. **[B3]** `@koson1067bot` bilan nima qilamiz? Taklif: **mijoz oqimi butunlay o'chiriladi**, faqat haydovchi OTP/xabarnomasi qoladi. Ikkita bot bitta bozorda boqilmaydi.
3. **[B4]** Identifikator ustunligi: telefon yagona kalitmi? A'ning `Member.kasId` si B migratsiyasidan keyin nimaga ishora qiladi?
4. **[B5]** Yozilgan manzil (koordinatasiz) buyurtmasi B'da qanday yaratiladi? Katalogdan `addressId` → koordinata, yoki `pickupLat/Lng` ni ixtiyoriy qilamiz?
5. **Uch bo'lakli qo'shimcha to'lov** (`address`/`client`/`company`) saqlanadimi, yoki bitta yig'indiga soddalashadimi?
6. **Kim kimni chaqiradi?** Taklif: A → B (HTTP, `BirJoySource`), B → A faqat webhook bilan (buyurtma holati o'zgarganda) — A'ning 90 s sweep'i o'rniga. Yoki sweep saqlanadimi?
7. **B qayerda ishlaydi?** `docs/MASTER-PLAN.md:106` Render+Vercel deydi; A esa Contabo VPS'da (`memory: contabo-full-migration`). Bitta VPS'ga birlashtiriladimi?
8. **To'lqinli taklif** F2 soya rejimida A/B sinaladimi, yoki hozirgi ketma-ket model bilan pilot boshlanadimi?
9. **B'ning 8 ta push qilinmagan commit'i** (`git log origin/main..HEAD` → 8) — ular push qilinadimi? Bu ishning boshlanish nuqtasini belgilaydi.

---

**READY FOR VERIFICATION**

Bu hujjatdagi har da'vo `fayl:qator` bilan berilgan. Kod yozilmadi, commit/push qilinmadi,
build/install/docker/port ishlatilmadi, VPS/bazaga ulanilmadi. Faqat shu bitta fayl yaratildi.
Keyingi qadam — **ega §8 dagi 9 savolga javob beradi**, keyin F1 DoD tasdiqlanadi.
