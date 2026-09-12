# TAXI YADRO AUDIT — `1067-taxi`

**Auditor:** mustaqil tekshiruv agenti (kod YOZMAGAN)
**Sana:** 2026-09-08
**Tekshirilgan commit:** `f291de091a3e79fdb31bebae536298063ddfb7d9` (2026-06-09 19:00 +0500) — `main`, ishchi daraxt
**Tekshirilgan da'vo:** `1067-taxi/docs/MASTER-PLAN.md:12` — *"State: ~80% to a real pilot."*
**Usul:** faqat statik o'qish + git. Build YO'Q, `pnpm install` YO'Q, docker YO'Q, SSH YO'Q, DB YO'Q (topshiriq qoidasi).

---

## 1. BIR JUMLADA XULOSA

**"~80% pilotga tayyor" da'vosi RAD ETILADI.** Kod *hajmi* bo'yicha ~75-80% yozilgan — bu to'g'ri; lekin *pilotga tayyorlik* bo'yicha bahom **45-55%**, chunki buyurtmaning eng muhim uchta yo'li — **(1)** haydovchini uyg'otish (FCM push server tomonda **hech qachon yuborilmaydi**, ilovada Firebase **ishga tushmaydi**), **(2)** hech kim olmagan buyurtmani operator qutqarishi (`no_drivers` buyurtma operator ekranidan **soniyalar ichida yo'qoladi**), **(3)** osilib qolgan buyurtmani tozalash (**hech qanday sweep/cron yo'q**) — kodda umuman mavjud emas, va MASTER-PLAN bu uchtasini gap ro'yxatiga ham **kiritmagan**.

**Nima uchun ikki xil raqam:** MASTER-PLAN "80%" ni *modul bor / build o'tadi / lokal API chaqiruvi javob berdi* mezoni bilan o'lchagan. Bu mezon bo'yicha u haqiqatan ham ~80%. Lekin "pilot" = 20-50 ta real haydovchi, real pul, telefonlar cho'ntakda — bu mezon bo'yicha yuqoridagi 3 ta tuynuk **har bitta buyurtmani** yo'qotishi mumkin.

---

## 2. DA'VO vs HAQIQAT JADVALI

### 2.1 MASTER-PLAN §1 "Verified local stack (2026-06-08)" — 8 ta ✅ da'vo

| # | Da'vo (MASTER-PLAN:26-35) | Kodda bormi | Isbot | Bahom |
|---|---|---|---|---|
| 1 | DB: 550 haydovchi, 3 vehicle class, 8 tuman | **TEKSHIRIB BO'LMAYDI** | Sxema bor: `packages/db/src/schema/` (30+ jadval). Ma'lumot faqat lokal Docker `:5600` da — men DB'ga ulanmadim (qoida #4) | **Isbotsiz.** Faqat o'sha kompyuterda o'sha kunda ko'rilgan. |
| 2 | Backend: 40+ modul mapped, `health: ok`, 0 xato | **QISMAN** | `apps/api/src/modules/` da **41 papka**, lekin `modules/sla/` va `modules/surge/` — **BUTUNLAY BO'SH** (`find surge sla -type f` → 0 fayl). Haqiqiy modul = **39**, hammasi `app.module.ts:113-157` da ro'yxatdan o'tgan | **"40+" — bo'sh papkalarni sanagan.** 39 real, hammasi ulangan. |
| 3 | Admin panel: 550 haydovchi render bo'ldi, hamma API 200 | **TEKSHIRIB BO'LMAYDI** | 26 ta `page.tsx` mavjud (`apps/web/src/app/**`) — "20+ pages" da'vosi TO'G'RI | Sahifalar bor; render isboti yo'q. |
| 4 | Driver-app backend: OTP→login→profile→earnings | **KODDA BOR** | `auth.service.ts:62-192`, `drivers.service.ts:148-193` | Ishonarli — lekin faqat API darajasida. |
| 5 | End-to-end ride (backend): book→assign→arrive→start→complete | **KODDA BOR** | `orders.service.ts:85-200` (`driverArrived`/`startRide`/`completeRide`), `deductCommission` :845-865 | Yo'l bor. **LEKIN:** yakuniy narx vehicle class va surge'ni E'TIBORSIZ qoldiradi — §B.3 ga qara. |
| 6 | GPS taximetr 3.8 km → 16.5k | **KODDA BOR** | `pricing/taximeter.service.ts` (140 qator), `socket.gateway.ts:137-144`, `orders.service.ts:137-155` | Mexanika to'g'ri yozilgan. |
| 7 | Driver APK: `gradlew assembleDebug` → 22 MB, **telefonda ishlamagan** | **DA'VO O'ZI TAN OLADI** | Repodagi APK: `apps/web/public/1067-taxi-driver.apk` = **19 993 716 bayt, 2026-04-10** sanasi | **Repoda turgan APK — 2 oy ESKI (aprel), V2 kodi emas.** Iyun'dagi 22 MB build repoda yo'q. |
| 8 | Bot `@koson1067bot` — `getMe` bilan tirik | **ISHONARLI** | `telegram.service.ts` 1212 qator, polling rejimi | Faqat "bot javob beradi" degani. |

### 2.2 MASTER-PLAN §3 "What's DONE" — jiddiy noaniqliklar

| Da'vo | Haqiqat | Isbot |
|---|---|---|
| "Dispatch (multi-factor scoring, **re-dispatch with tried-list**, reconnect-offer resend)" | Rost, lekin **radius kengaymaydi**, **ketma-ket bitta-bitta** taklif, **operatorga chiqmaydi** | `dispatch.service.ts:112-117, 180-205, 581-591` |
| "Pricing (... surge, GPS taximeter ...)" | Estimate'da surge bor, **yakuniy narxda YO'Q** | `orders.service.ts:163-167` — `calculateFinalFare(dist, start, now)`, `options` uzatilmagan |
| "Payments (Payme + Click **code**)" | "code" so'zi to'g'ri — faqat kod, jonli emas | `payments/payme.service.ts`, `click.service.ts` |
| "Passenger Mini App ... 🟡 order placement (mostly via bot)" | **"mostly" emas — 0%.** Mini App'da buyurtma yaratish endpoint'i umuman chaqirilmaydi | `apps/client/src/lib/api.ts:232-238` — faqat `GET /orders/client/active`, `history`, `:id`, `POST .../rate`. Buyurtma yaratish YO'Q. `RidesTab.tsx:225`: *"Birinchi safaringizni **bot orqali** buyurtma qiling"* |
| "SMS / Push: Eskiz.uz (not live yet), Firebase FCM" | Eskiz — **o'lik kod** (hech qaysi modulda ro'yxatdan o'tmagan). FCM — **uchidan-uchiga 0%** | §D.4 va §C.3 |

### 2.3 MASTER-PLAN §8 "Current git state"

| Da'vo | Haqiqat | Isbot |
|---|---|---|
| "main now holds all the work — merged locally, **NOT pushed**" | **TASDIQLANDI va YOMONLASHDI** — 3 oy o'tdi, hali ham push qilinmagan | `git log --oneline origin/main..HEAD` → **8 commit** push kutmoqda; oxirgi commit 2026-06-09 |
| — | Repoda **4 ta ortiqcha shoxobcha + 2 ta worktree** qolib ketgan | `git branch -a`: `claude/practical-kapitsa-ad0457`, `claude/quirky-johnson-335654`, `feat/v2-taximeter-driver-qc`, `+worktree-agent-af05f9de...`, `+worktree-agent-af3894c6...` |
| — | ⚠️ **GitHub Personal Access Token OCHIQ MATNDA** `.git/config` remote URL ichida | `git remote -v` → `https://SarvarkhonH:ghp_WQc9…UuIY@github.com/...` — **DARHOL BEKOR QILINSIN** (§D.6) |

---

## 3. A — DISPATCH MODULI

Fayllar: `apps/api/src/modules/dispatch/` — 1302 qator (service 610, scorer 246, types 74, spec 323, module 26, processor 22, constants 1).

### A.1 Haydovchi tanlash algoritmi — ANIQ

Og'irliklar `dispatch.types.ts:25-33`:

```
proximity 0.30 | acceptanceRate 0.20 | rating 0.15 | vehicleMatch 0.15
| zoneAffinity 0.10 | −cancellationPenalty 0.05 | −headingPenalty 0.05
```

Hisob `driver-scorer.service.ts:85-167`:
- **proximity** (`:99-104`): `speedKmh = speed>5 ? speed : 30`; `eta = dist/speed*3600`; `score = max(0, 1 − eta/900)`. 15 daqiqadan uzoq → 0.
- **acceptance** (`:106`): `acceptRate/100`.
- **rating** (`:108`): `(avgRating−1)/4`.
- **vehicleMatch** (`:110-114`): mos = 1.0, mos emas = 0.3, so'ralmagan = 1.0.
- **zoneAffinity** (`:116-120`): qamragan = 1.0, qamramagan = 0.2, ma'lumot yo'q = 0.5.
- **headingPenalty** (`:180-193`): `angleDiff/180`, faqat speed > 5 km/h bo'lsa.

**🔴 GAP A.1** — `zoneAffinity` amalda O'LIK: `dispatch.service.ts:174` da `pickupTumanId` **doim `null`** uzatiladi:
```ts
order.vehicleClassId,
null, // TODO: determine pickup tuman ID from geofence
```
→ har bir haydovchi 0.10 × 0.5 = 0.05 oladi, tuman-afinitet **hech qachon ishlamaydi**. 0.10 og'irlik behuda.

**🟡 GAP A.2** — `scoreDrivers` ichida `:77-82` da har bir nomzod uchun `await this.location.getDriverLocation(id)` **ketma-ket sikl**da chaqiriladi (50 nomzod = 50 ta ketma-ket Redis borish-kelishi), garchi `getDriverBearings` yuqorida allaqachon pipeline bilan aynan shu ma'lumotni olgan bo'lsa ham.

### A.2 Qayta-tarqatish — BOR, lekin bitta-bitta

- **Necha doira:** `DISPATCH_MAX_ATTEMPTS = 5` (`dispatch.service.ts:46`, `.env:46`), `DISPATCH_TIMEOUT_SECONDS = 15` (`:47`).
- **Bir vaqtda nechta haydovchi:** **BITTA.** `:181` — `selectedDriver = scored[0]`. Uber/Yandex uslubidagi bir vaqtda N ta haydovchiga broadcast **YO'Q**.
- **Eng yomon holat:** 5 × 15 s = **75 soniya** mijoz kutadi, keyin "haydovchi topilmadi".
- **Radius:** `DISPATCH_SEARCH_RADIUS_KM = 5`, `:112-117` — **HECH QACHON KENGAYMAYDI.** 5 km da hech kim bo'lmasa 6 km ga chiqilmaydi.
- **tried-list:** `dispatch:tried:{orderId}` Redis SET, TTL 300 s (`:464-469`). Re-dispatch'da saqlanadi (`:69-77`).
- **Haydovchi bekor qilsa:** `orders.service.ts:404-437` — `MAX_REDISPATCH = 3`, **AYNI `dispatchAttempt` hisoblagichini** ishlatadi.

**🔴 GAP A.3 — hisoblagich to'qnashuvi.** Dispatch 4 urinishda haydovchi topsa, `dispatchAttempt = 4`. O'sha haydovchi keyin bekor qilsa: `orders.service.ts:405-407` → `4 < 3` **noto'g'ri** → darhol `permanent cancel`, qayta-tarqatish **umuman bo'lmaydi**. Ikki xil byudjet (5 va 3) bitta hisoblagichni baham ko'radi.

### A.3 🔴 Hech kim qabul qilmasa — BUYURTMA O'LADI, OPERATORGA CHIQMAYDI

`dispatch.service.ts:581-591`:
```ts
private async noDriversFound(orderId: number): Promise<void> {
  ...
  await this.db.update(orders).set({ status: 'no_drivers', cancelledAt: new Date() })...
  await this.socket.emitOrderUpdated(orderId);
  this.tripNotifications.notifyNoDrivers(orderId);
}
```

Keyin `socket.gateway.ts:293-302`:
```ts
const TERMINAL = new Set(['completed','cancelled_client','cancelled_driver',
                          'cancelled_dispatcher','no_drivers']);
if (TERMINAL.has(order.status)) {
  this.server.to(ADMIN_ROOM).emit('order:removed', { orderId, status: ... });
}
```

Va admin tomonda `apps/web/src/app/dashboard/operator/page.tsx:610-612`:
```tsx
onOrderRemoved: ({ orderId }) => {
  setActiveOrders(prev => prev.filter(o => o.id !== orderId));
},
```

**Natija:** `no_drivers` bo'lgan buyurtma operator ekranidan **millisekundlarda o'chib ketadi**.

Achinarlisi — qutqarish tugmasi **kodda bor, lekin yetib bo'lmaydi**:
- `operator/page.tsx:98` — `isTerminalStatus` ro'yxatida `no_drivers` **YO'Q** (ya'ni tugma ko'rinishi kerak),
- `operator/page.tsx:1447` — `{(order.status === 'pending' || 'dispatching' || 'no_drivers') && <button>Haydovchi biriktirish</button>}`,
- lekin buyurtma ro'yxatdan allaqachon o'chirilgan → tugma **hech qachon render bo'lmaydi**.

Bu — kas1067 dan uzilishning eng katta xavfi: kas1067 da operator qo'lda qutqaradi; bu yerda mijoz faqat Telegram'da "haydovchi topilmadi" xabarini oladi va yo'qoladi. *(Xotira eslatmasi: real 1067 bozorida rad etish darajasi ~21.5%.)*

### A.4 🔴 O'lik buyurtma tozalash — CRON UMUMAN YO'Q

Butun repo bo'ylab `@Cron` — **10 ta**, hech biri buyurtma tozalamaydi:

| Fayl:qator | Jadval | Vazifa |
|---|---|---|
| `drivers/driver-performance.service.ts:30, 191` | `*/5`, soatlik | haydovchi statistikasi |
| `monitoring/health-alerter.service.ts:52,77,94,143,172` | 10/5/5/2 daq, kunlik | ogohlantirish, gauge |
| `payments/wallet.service.ts:138` | haftalik | hamyon |
| `pricing/surge.service.ts:47` | daqiqalik | surge |
| `queue/queue-management.service.ts:192` | `*/5` | **navbat** yozuvlari (buyurtma emas) |
| `safety/fatigue-monitor.service.ts:82` | `*/5` | charchoq |
| `safety/route-monitor.service.ts:32` | `*/30 s` | yo'ldan chetlash |
| `scheduled-rides/scheduled-rides.service.ts:90` | daqiqalik | rejalashtirilgan safar |

**Xavf:** butun re-dispatch zanjiri BullMQ `dispatch:timeout` ishiga bog'langan (`dispatch.service.ts:251-255`). Agar Redis qayta ishga tushsa yoki ish yo'qolsa — buyurtma **`dispatching` holatida abadiy osilib qoladi**: mijoz kutadi, operator qutqara olmaydi, hech kim ko'rmaydi. `orders` uchun `expired` holati sxemada bor, lekin uni **hech kim yozmaydi** (grep: faqat o'qish joylarida).

### A.5 🟠 "Arvoh haydovchilar" — Redis GEO tozalanmaydi

- `location.service.ts:61` — `GEOADD drivers:geo` — **TTL YO'Q**.
- `driver:{id}:loc` — TTL 30 s (`:65-69`), lekin GEO a'zoligiga ta'sir qilmaydi.
- GEO'dan chiqarish faqat 2 joyda: `socket.gateway.ts:166-168` (ochiq `driver:set_status offline/break`) va `drivers.service.ts:134-138` (REST `goOffline`).
- `socket.gateway.ts:66-68` — `handleDisconnect` **faqat log yozadi**, GEO'dan chiqarmaydi, DB statusini o'zgartirmaydi.
- `fatigue-monitor.service.ts:145-155` — DB'da `offline` qiladi, lekin `removeDriverFromGeo` **chaqirmaydi**.

**Natija:** haydovchi ilovani majburan yopsa yoki tarmoq uzilsa — Redis GEO'da **abadiy** qoladi VA DB'da `online` qoladi → `tryNextDriver` uni tanlaydi (`:132-140` filtri `status='online'` ni o'tkazadi) → 15 s behuda kutish. 5 ta arvoh = **75 s** yo'qotilgan vaqt va buyurtma o'ladi.

### A.6 ✅ `dispatch_offer_logs` — TO'LDIRILADI

- Sxema: `packages/db/src/schema/driver-performance.ts:48-72` (3 ta indeks bilan).
- Yozish: `dispatch.service.ts:402-422` (`logDispatchOffer`, outcome `'pending'`), `:248` da chaqiriladi.
- Yangilash: `:424-443` (`logDispatchOutcome`) — `accepted` (`:320`), `timeout` (`:347`).
- **Kichik gap:** `manualAssign` (`:360-387`) log yozmaydi/yangilamaydi; `rejected` va `timeout` ajratilmaydi (ikkalasi `'timeout'`).

---

## 4. B — NARX VA TAXIMETR

### B.1 GPS taximetr — BOR va yaxshi yozilgan

- `pricing/taximeter.service.ts` — Redis hash `taximeter:{orderId}`, TTL 24 s.
- To'plash: `socket.gateway.ts:132-144` — har GPS fix'da `in_progress` buyurtma qidiriladi, `addPoint` chaqiriladi.
- Filtrlar (`taximeter.service.ts:72-92`): `MIN_SEGMENT_KM = 0.008` (svetofor jitteri), `MAX_SEGMENT_KM = 5` (GPS sakrash). Jitter bo'lsa anchor **saqlanadi** — sekin yurish yo'qolmaydi. Bu o'ylangan kod.
- Boshlash `orders.service.ts:109-118`, tugatish `:137-155`.
- **Manzilsiz safar** aynan shu bilan o'lchanadi — MASTER-PLAN da'vosi shu joyda TO'G'RI.

**🟠 GAP B.1** — `socket.gateway.ts:137-141`: har bir GPS fix'da (har haydovchi 3-5 s da bir) `orders` jadvaliga SELECT. 550 haydovchi × 0.25 Hz ≈ **135 so'rov/s** faqat shu uchun. Pilot uchun emas, lekin miqyoslashda muammo.

### B.2 Zona / vaqt / surge — ULANGAN, lekin faqat ESTIMATE'da

`pricing.service.ts:92-168` (`estimateFare`) hammasini qo'shadi:
- zona-zona qat'iy narx: `:305-328` (`zonePricingRules.fixedFareUzs`),
- vaqt bo'yicha: `:335-366` (`timePricingRules`, wrap-around 22→6 to'g'ri ishlangan),
- zona baza koeffitsienti: `:330-333`,
- surge: `surge.service.ts:30-41` + daqiqalik cron `:47-135` (talab/taklif nisbati, cooldown, `surgeHistory` tarixi),
- tunki: `:120`, `NIGHT_START_HOUR=22`, `NIGHT_END_HOUR=6` (`pricing.constants.ts:11-12`).

### B.3 🔴 GAP — YAKUNIY NARX estimate'dan BOSHQACHA hisoblanadi

`orders.service.ts:163-167`:
```ts
const fare = this.pricing.calculateFinalFare(
  distanceKm ?? 0,
  order.rideStartedAt ...,
  now,
);   // ← 4-argument (options) UZATILMAGAN
```

`pricing.service.ts:207-228` da `options` bo'lmasa:
```ts
surgeMultiplier: options?.surgeMultiplier ?? 1.0,
vehicleClass:    options?.vehicleClass ?? null,
timeOfDayMultiplier: 1.0,
zoneMultiplier:      1.0,
```

**Natija:** mijozga surge × vehicle-class × zona × vaqt koeffitsientlari bilan narx aytiladi, lekin **yakunda default tarif bo'yicha hisoblanadi**. Comfort sinf mijozi Econom narxini to'laydi; 1.8× surge paytida platforma surge pulini **yo'qotadi**. Bu — pul xatosi, va u MASTER-PLAN "verified end-to-end" da'vosi ichida sezilmagan (chunki lokal testda surge = 1.0 va vehicle class ta'siri ko'rinmagan).

### B.4 🟠 GAP — vaqt zonasi

`pricing.service.ts:389-392` va `:338`: `new Date().getHours()` — **server lokal vaqti**. Render/VPS UTC bo'lsa, "tun 22:00-06:00" amalda Toshkent vaqti bilan **03:00-11:00** bo'ladi: ertalabki pik soatlarda tunki 1.5× qo'llanadi, haqiqiy tunda qo'llanmaydi. `TZ` env `.env` da yo'q, `render.yaml` da yo'q. `health-alerter.service.ts:125-129` esa aniq `timeZone: 'Asia/Tashkent'` yozadi — ya'ni loyihada ikki xil yondashuv.

### B.5 Yozilgan-lekin-ishlatilmaydigan

| Element | Holat | Isbot |
|---|---|---|
| `zoneAffinity` dispatch og'irligi | **o'lik** | `dispatch.service.ts:174` — `null` |
| `estimateAllClasses().etaMinutes` | **doim null** | `pricing.service.ts:196` — `// TODO` |
| `promoDiscount` | **doim 0** | `pricing.service.ts:290` |
| `RoutingService` | **o'lik modul** | `RoutingModule` `app.module.ts:129` da ro'yxatda, lekin `RoutingService` `modules/routing/` dan tashqarida hech qayerda inject qilinmagan (repo bo'ylab grep — 0 natija) |
| `modules/sla/`, `modules/surge/` | **bo'sh papkalar** | `find sla surge -type f` → 0 fayl |

---

## 5. C — REAL VAQT OQIMI

### C.1 Socket.IO + Redis adapter — SHARTLI

`socket.gateway.ts:26-30`: namespace `/ws`, `cors: {origin:'*'}` (prod'da ham!), transports `['websocket','polling']`.

Redis adapter `:47-60`:
```ts
if (typeof (server as any).adapter === 'function') {
  ... createAdapter(pubClient, subClient) ...
} else {
  this.logger.warn('Socket.IO: Redis adapter not set (Fastify/dev mode — using in-process adapter)');
}
```

`main.ts:89` — `app.useWebSocketAdapter(new IoAdapter(app))` → haqiqiy socket.io `Server`, ya'ni `.adapter` funksiya bo'ladi va Redis adapter **o'rnatilishi kerak**. Lekin bu **ishga tushmasdan tasdiqlanmaydi** — kodda "jim o'tkazib yuborish" (`catch → warn`) bor, ya'ni adapter o'rnatilmasa ham server ishlaydi va **bir nechta instansiya bo'lsa taklif noto'g'ri instansiyaga boradi**. Bir instansiyada muammo yo'q; Render/VPS'da 2+ ishchi bo'lsa — jimgina buziladi.

### C.2 Uzilish va qayta ulanish — YAXSHI qism

Bu loyihaning **eng puxta ishlangan** joyi:
- **Server:** `dispatch.service.ts:500-561` — `resendPendingOfferToDriver`. Haydovchi qayta ulanganda `dispatching` buyurtmalar orasidan uniki qidiriladi va **qolgan vaqt bilan** (`:530-535`, `max(3, timeout − elapsed)`) taklif qayta yuboriladi.
- Chaqiriladi: `socket.gateway.ts:117-119` (`driver:join` da).
- **Ilova:** `SocketManager.kt:37-51` — bir xil token bilan ulangan bo'lsa no-op; aks holda **eski socketni to'liq yiqitib** yangisini quradi (izohda aytilishicha, bu ilgari duplicate `driver:join` va "onlayn ko'rinib, aslida uzilgan" bug'ini keltirgan).
- **Ilova:** `LocationForegroundService.kt` — `PARTIAL_WAKE_LOCK` (`:113-123`) + `START_STICKY` (`:82`) → ekran o'chganda ham socket keepalive tirik.
- Socket.IO reconnection: `SocketManager.kt:63-64` — `setReconnection(true)`, delay 1000 ms.

### C.3 🔴 FCM push — UCHIDAN-UCHIGA 0%

Ikkita mustaqil uzilish:

**(a) Server hech qachon buyurtma push yubormaydi.**
`notifications.service.ts:37` da `sendToDriver(...)` mavjud. Butun repo bo'ylab grep:
```
./modules/notifications/notifications.controller.ts:12: broadcastToAllDrivers(...)
./modules/notifications/notifications.service.ts:37:   async sendToDriver(...)   ← ta'rif
```
→ **`sendToDriver` hech qayerdan chaqirilmaydi.** `dispatch.service.ts` `NotificationsService` ni **import ham qilmaydi**. Taklif faqat `socket.sendBookingOffer` (`:225`) orqali ketadi.

**(b) Ilovada Firebase ishga tusha olmaydi.**
- Bog'liqlik bor: `app/build.gradle.kts:119-121` (`firebase-bom` 33.7.0, `firebase-messaging-ktx`), manifestda servis ro'yxatdan o'tgan (`AndroidManifest.xml:74-81`).
- **LEKIN** `com.google.gms.google-services` gradle plagini **hech qayerda qo'llanmagan** — na `apps/driver-android/build.gradle.kts` (6 ta plagin, ichida yo'q), na `app/build.gradle.kts:1-8`.
- **VA** `google-services.json` fayli repoda **YO'Q** (`find … -name google-services.json` → 0), `.gitignore` da ham yozilmagan (ya'ni yashirilmagan — chinakam yo'q).
- → `FirebaseApp` avtomatik ishga tushmaydi, `onNewToken` **hech qachon fire bo'lmaydi**, `drivers.fcmToken` doim `null` qoladi.

**Natija:** haydovchi ilovani yopsa/telefon Doze rejimiga tushsa — **taklif hech qanday yo'l bilan yetib bormaydi**. Foreground service uni qisman yopadi, lekin OEM (Xiaomi/Oppo/Vivo — O'zbekistonda ustun) batareya optimizatsiyasi foreground servisni o'ldiradi va zaxira yo'l yo'q.

MASTER-PLAN §6 da bu "FCM data-only order pushes dropped — **deferred, not blocking**" deb yozilgan. Bu baholash **noto'g'ri**: bloklovchi.

### C.4 🟠 Admin oqimi

- `admin:join` token TALAB qiladi (`socket.gateway.ts:220-232`) — to'g'ri qilingan.
- Rollar: `admin`, `super_admin`, `operator`, `dispatcher` (`:81`).
- `driver:location` → `ADMIN_ROOM` broadcast (`:146-153`) — har fix, filtrsiz. 550 haydovchi × 0.25 Hz = **~135 event/s har bir ochiq admin oynasiga**. Brauzer bunga chidaydi, lekin trafik katta.

---

## 6. D — AUTH VA XAVFSIZLIK

### D.1 🔴 OTP — 4 XONALI, TASDIQLASH throttle'i YO'Q

**MASTER-PLAN da'vosi TASDIQLANDI** — 3 joyda bir xil:
- `auth.service.ts:63` — `const code = String(randomInt(1000, 9999));` (driver)
- `auth.service.ts:258` — admin
- `auth.service.ts:342` — client

Yon effekt: `randomInt(1000, 9999)` yuqori chegarani **qo'shmaydi** → `9999` hech qachon chiqmaydi (8999 variant).

**Undan ham jiddiyroq — MASTER-PLAN bunga umuman tegmagan:**

1. **`verify` endpoint'ida throttle YO'Q.** `auth.controller.ts:27-36` (`driver/otp/verify`), `:65-69` (`admin/otp/verify`), `:82-86` (`client/otp/verify`) — birortasida `@Throttle` yo'q. Faqat global limit: prod'da **100 so'rov/daqiqa** (`app.module.ts:86-90`).
2. **Urinishlar sanalmaydi.** `verifyDriverOtp` (`:139-192`) noto'g'ri kodni faqat rad etadi — hisoblagich yo'q, kod bloklanmaydi.
3. **Bir vaqtda ko'p kod amal qiladi.** Har `send` yangi qator qo'shadi (`:66`) va **eskilarini bekor qilmaydi**. `send` limiti driver uchun 30/15daq (`:21`). Ya'ni hujumchi 30 ta amaldagi kod hosil qilib, keyin 100/daq bilan urishi mumkin — 5 daqiqalik oynada ~500 urinish × 30 kod / 8999 ≈ **muvaffaqiyat ehtimoli juda yuqori**.
4. `admin/otp/verify` ham himoyasiz → **admin panelga kirish** shu yo'l bilan.

### D.2 Token muddati va refresh

| Rol | Access | Refresh | Refresh endpoint |
|---|---|---|---|
| driver | 15 m (`auth.service.ts:413`, `.env:8`) | 30 kun (`:218`) | ✅ `POST /auth/driver/token/refresh` |
| admin | 15 m | 7 kun (`:327`, `adminSessions` ga yoziladi) | ❌ **YO'Q** |
| client | 15 m | 30 d (imzolanadi) | ❌ **YO'Q**, sessiya jadvalga ham yozilmaydi (`:397-405`) |

**🟠 GAP D.2** — admin uchun `adminSessions` qatori yaratiladi, lekin uni ishlatadigan endpoint yo'q → **operator har 15 daqiqada qayta login qilishi kerak**. Kol-markazda smena davomida bu qabul qilib bo'lmaydi.

**🟠 GAP D.3** — refresh token'lar `driverSessions.refreshToken` ga **xesh qilinmasdan, ochiq matnda** saqlanadi (`:220-227`). DB o'qilsa — hamma haydovchi sessiyasi qo'lga o'tadi. Revoke bor (`isRevoked`), lekin rotatsiya yo'q: `refreshDriverToken` (`:194-211`) yangi refresh bermaydi, eskisi 30 kun amal qiladi.

### D.4 Dev/debug endpointlar — GATED, lekin ehtiyot shart

| Element | Gate | Fayl:qator | Baho |
|---|---|---|---|
| `TELEGRAM_INITDATA_DEV_BYPASS` | `=== '1'` | `telegram-initdata.guard.ts:56-66` | ✅ gated. ⚠️ Lokal `.env:54` da **`=1`** turibdi — prod env'ga nusxa ko'chirilmasin. |
| dev-OTP panel (`dev:otp_generated`) | `EXPOSE_OTP_TO_OPERATORS=1` **YOKI** `NODE_ENV !== 'production'` | `auth.service.ts:43-58` | 🟠 Ikkinchi shart xavfli: `NODE_ENV` prod'da o'rnatilmasa/xato yozilsa — **har bir OTP admin socket xonasiga uzatiladi**. `render.yaml:20-21` uni o'rnatadi, VPS uchun kafolat yo'q. |
| `AUTO_APPROVE_NEW_DRIVERS=1` | flag | `auth.service.ts:167-185` | 🟠 Yoqilgan bo'lsa — **istalgan telefon raqami OTP olib, avtomatik "approved" haydovchi** bo'ladi va dispatch oladi. Pilot uchun ataylab, lekin o'chirish esdan chiqishi mumkin. |
| `OTP_FALLBACK_TO_MONITORING=1` | flag | `auth.service.ts:102-131` | 🟡 Prod'da OTP egaga Telegram'ga yuboriladi — vaqtinchalik yechim. |
| `dev-server.ts` | alohida entry | `apps/api/src/dev-server.ts` | ✅ `main.ts` emas, prod'da ishga tushmaydi. |

### D.5 🔴 Eskiz SMS — O'LIK KOD

`auth/eskiz.service.ts` (54 qator) to'liq yozilgan. Lekin:
```
grep -rn "EskizService" apps/ →
  apps/api/src/modules/auth/eskiz.service.ts:8   ← ta'rif
  apps/api/dist/.../eskiz.service.d.ts:2         ← build artefakti
```
`auth.module.ts:31` `providers` ro'yxatida **YO'Q**, hech qayerga inject qilinmagan. Ya'ni SMS **shunchaki mavjud emas** — MASTER-PLAN "not live yet" deydi, aslida "ulanmagan ham".

**Ta'siri:** Telegram'i bog'lanmagan haydovchi **umuman tizimga kira olmaydi**. MEMORY'dagi BirJoy tajribasi (289 dan 286 tasi telefon tugmasini bosmagan) shuni ko'rsatadiki, bu real to'siq.

### D.6 🔴🔴 GitHub token ochiq matnda

`git remote -v`:
```
origin  https://SarvarkhonH:ghp_WQc9…UuIY@github.com/SarvarkhonH/1067-taxi.git
```
Bu `.git/config` da (repo ichida commit qilinmagan, lekin diskda ochiq matnda va har bir agent/skript ko'radi). **Bu token darhol GitHub'da revoke qilinishi va SSH kalit yoki credential-manager bilan almashtirilishi shart.**

### D.7 Boshqa xavfsizlik kuzatuvlari

| Element | Holat | Isbot |
|---|---|---|
| Helmet | ✅ | `main.ts:81-84` (CSP faqat prod'da) |
| CORS | ✅ prod'da whitelist | `main.ts:99-108` |
| Socket CORS | 🟠 `origin: '*'` **har doim** | `socket.gateway.ts:27` |
| ValidationPipe (whitelist + forbidNonWhitelisted) | ✅ | `main.ts:114-121` |
| Env validatsiya (zaif secret prod'da) | ✅ | `main.ts:50-67` |
| Sentry | ✅ ixtiyoriy | `main.ts:6-21` |
| RolesGuard | ✅ bor | `common/guards/admin-auth.guard.ts:13-29` |
| Rol ierarxiyasi | 🟡 socket'da qattiq yozilgan | `socket.gateway.ts:81` |
| `verifyClientOtp` DTO | 🟠 **DTO klass emas**, inline tip | `auth.controller.ts:84` — `@Body() dto: { phone, code }` → ValidationPipe tekshirmaydi |

---

## 7. E — O'LIK KOD / MODUL INVENTARI

Metod: har `modules/*/` papkasi uchun controller sanoq + `*.module.ts` klass nomi + `app.module.ts` da ro'yxatdan o'tganini tekshirish.

**Natija: 41 papka → 39 real modul → 39 tasi (100%) `app.module.ts` da ro'yxatda.**

**Bo'sh papkalar (2):**
- `modules/sla/` — 0 fayl
- `modules/surge/` — 0 fayl (haqiqiy surge `modules/pricing/surge.service.ts` da)

**Controller'siz modullar (4) — sababi bilan:**

| Modul | Controller | Baho |
|---|---|---|
| `dispatch` | yo'q | ✅ To'g'ri — ichki servis, `orders`/`operator`/`socket` chaqiradi |
| `socket` | yo'q | ✅ To'g'ri — gateway |
| `location` | **bor** (1) | ✅ |
| `routing` | yo'q | 🔴 **O'LIK** — `RoutingService` `modules/routing/` dan tashqarida **hech qayerda inject qilinmagan** (repo bo'ylab grep — 0). Modul yuklanadi, hech narsa qilmaydi. |

**Qolgan 35 modul:** hammasida kamida 1 controller bor va `app.module.ts` da ro'yxatda.

**Ichki o'lik kod (modul emas, funksiya darajasida):**

| Element | Isbot |
|---|---|
| `EskizService` | `auth.module.ts:31` providers'da yo'q |
| `NotificationsService.sendToDriver` | hech qayerdan chaqirilmaydi (§C.3a) |
| `ERROR_CODES.INSUFFICIENT_BALANCE` | `error-codes.ts:24` — faqat ta'rif, **hech qachon tashlanmaydi** |
| `zoneAffinity` og'irligi | `dispatch.service.ts:174` — `null` (§A.1) |
| `promoDiscount` | `pricing.service.ts:290` — doim 0 |
| `etaMinutes` (vehicle class) | `pricing.service.ts:196` — doim `null` |
| operator'ning `no_drivers` qutqarish tugmasi | `operator/page.tsx:1447` — yetib bo'lmaydi (§A.3) |

---

## 8. F — TESTLAR

**Testlarni ishga tushirmadim (topshiriq qoidasi #3).** Faqat fayllarni sanadim va mazmunini o'qidim.

### F.1 Miqdor

| Fayl | `it()` bloklari |
|---|---|
| `modules/auth/auth.service.spec.ts` (268 q.) | **9** |
| `modules/dispatch/dispatch.service.spec.ts` (323 q.) | **7** |
| `modules/pricing/pricing.service.spec.ts` (166 q.) | **13** |
| **Jami** | **3 fayl / 29 test** |

Butun repo bo'ylab boshqa test yo'q: Kotlin testlari **0**, `apps/web` testlari **0**, `apps/client` testlari **0**, e2e **0**, integratsion **0**.

### F.2 Qamrov — loyihaning O'ZI tan oladi

`apps/api/jest.config.js:12-21`:
```js
// Thresholds reflect current coverage (3 spec files out of ~25 modules).
coverageThreshold: { global: { branches: 2, functions: 4, lines: 8, statements: 8 } },
passWithNoTests: true,
```
**Qator qamrovi chegarasi — 8%.** `passWithNoTests: true` — testlar yo'qolsa ham CI yashil bo'ladi.

### F.3 Sifat — mock'lar haqiqatni tekshirmaydi

`dispatch.service.spec.ts:36-49`:
```js
const makeDb = () => {
  const whereChain = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([pendingOrder]),   // ← HAR QANDAY select shu javobni beradi
    ...
```
→ "nomzodlar onlayn/approved ekanini tekshirish" so'rovi (`dispatch.service.ts:132-140`) ham `[pendingOrder]` qaytaradi, ya'ni `availableIds = [1]` (buyurtma id!), haydovchi 7 emas. Test o'sha yo'lni **umuman tekshirmaydi**.

`:294-306` — "marks order as `no_drivers`":
```js
expect(db.update).toHaveBeenCalled();
expect(mockTripNotifications.notifyNoDrivers).toHaveBeenCalledWith(1);
```
→ `status: 'no_drivers'` qiymati **tekshirilmaydi**; faqat "biror update bo'ldi".

### F.4 Nima QAMRALMAGAN

| Soha | Test bormi |
|---|---|
| Haydovchi ballari (`driver-scorer.service.ts`, 246 qator) | ❌ **0** |
| Komissiya / haydovchi balansi (`deductCommission`, `commissions.service.ts`, `wallet.service.ts`) | ❌ **0** |
| Taximetr (`taximeter.service.ts`) | ❌ **0** |
| Surge (`surge.service.ts`) | ❌ **0** |
| To'lovlar (Payme / Click) | ❌ **0** |
| Buyurtma hayot sikli (`orders.service.ts`, 900+ qator) | ❌ **0** |
| Socket gateway | ❌ **0** |
| Auth guard'lari (initData HMAC) | ❌ **0** |
| Sadoqat/gamifikatsiya | ❌ **0** |

**Ya'ni: PUL bilan bog'liq birorta yo'l test bilan qoplanmagan.**

### F.5 CI

`.github/workflows/ci.yml` — lint / build / test / security-audit / typecheck (4 ta app uchun `tsc --noEmit`). Postgres+PostGIS va Redis servislari ko'tariladi (garchi testlar ularni ishlatmasa ham — hammasi mock).
`.github/workflows/deploy.yml` — `main`ga push → gate (lint+test+build) → **Render deploy hook** + **Vercel × 2**. Ya'ni deploy hali ham Render/Vercel'ga bog'langan (BirJoy Contabo'ga ko'chgan bo'lsa ham).

---

## 9. TOPILGAN GAP'LAR — USTUVORLIK BO'YICHA

Ish hajmi = bitta muhandis-kun (taxminiy, testsiz).

### 🔴 P0 — pilotni BLOKLAYDI (MASTER-PLAN'da yo'q yoki noto'g'ri baholangan)

| # | Gap | Isbot | Hajm |
|---|---|---|---|
| P0-1 | **`no_drivers` buyurtma operatordan yo'qoladi** — hech kim qutqara olmaydi | `socket.gateway.ts:293-302` + `operator/page.tsx:610-612` | **2-3 kun** (backend: `no_drivers` ni terminal'dan chiqarish + "rescue queue"; frontend: alohida panel) |
| P0-2 | **FCM push uchidan-uchiga 0%** — yopiq ilova taklif olmaydi | server: `sendToDriver` chaqirilmaydi; ilova: `google-services` plagini + `google-services.json` yo'q | **3-4 kun** (Firebase loyihasi, plagin, data-only push, dispatch'ga ulash, telefonda sinov) |
| P0-3 | **O'lik buyurtma sweep'i yo'q** — Redis/BullMQ uzilsa buyurtma abadiy `dispatching` | 10 ta `@Cron` dan birortasi buyurtma tozalamaydi | **1-2 kun** (`*/1` cron: `dispatching` + `createdAt < now-3min` → `tryNextDriver` yoki operator navbatiga) |
| P0-4 | **Arvoh haydovchilar** GEO'da abadiy qoladi → 15 s×N behuda | `location.service.ts:61` TTL yo'q; `socket.gateway.ts:66-68` faqat log | **1 kun** (`handleDisconnect` → GEO'dan chiqarish + DB offline; + `*/1` heartbeat sweep) |
| P0-5 | **Yakuniy narx surge/vehicle-class'ni tashlab yuboradi** — quoted ≠ charged | `orders.service.ts:163-167` | **0.5 kun** + regressiya testi |
| P0-6 | **Haydovchi balansi hech qayerda tekshirilmaydi** — minus balansdagi haydovchi cheksiz buyurtma oladi | `dispatch.service.ts:132-140` filtri: faqat status/isActive/verifyStatus. `INSUFFICIENT_BALANCE` hech qachon tashlanmaydi | **1-2 kun** (dispatch filtriga `balanceUzs > -X` + haydovchi ilovasida ogohlantirish) |
| P0-7 | **Komissiya yechish tranzaksiyasiz va idempotentsiz** — read-modify-write poygasi | `orders.service.ts:845-865` — `db.transaction` YO'Q (butun repoda 1 marta: `topup.service.ts:190`) | **1 kun** (`sql\`balance_uzs - ${amt}\`` atomik + unique(orderId) `commissions` da) |
| P0-8 | **OTP 4 xonali + verify throttle'i yo'q + bir necha kod amal qiladi** → admin panelga brute-force | `auth.service.ts:63,258,342`; `auth.controller.ts:27,65,82` da `@Throttle` yo'q | **1 kun** (6 xona + verify'ga 5/15daq + eski kodlarni bekor qilish + 5 xato urinishdan keyin bloklash) |
| P0-9 | **GitHub PAT ochiq matnda** `.git/config` da | `git remote -v` → `ghp_WQc9…` | **15 daqiqa** (revoke + SSH) |
| P0-10 | **SMS yo'li umuman yo'q** — Telegram'siz haydovchi kira olmaydi | `EskizService` hech qaysi modulda ro'yxatdan o'tmagan | **1 kun** (Eskiz akkaunti + `auth.module` providers + Tier-3) |

**P0 jami: ~12-17 muhandis-kun** (sinovsiz).

### 🟠 P1 — pilot davomida og'riq keltiradi

| # | Gap | Isbot | Hajm |
|---|---|---|---|
| P1-1 | Admin refresh endpoint yo'q → operator har 15 daq qayta login | `auth.controller.ts` da faqat driver refresh | 0.5 kun |
| P1-2 | Vaqt zonasi: `getHours()` server vaqti; tunki tarif noto'g'ri soatda | `pricing.service.ts:389-392` | 0.5 kun |
| P1-3 | Re-dispatch byudjeti to'qnashuvi (5 vs 3, bitta hisoblagich) | `dispatch.service.ts:98` + `orders.service.ts:405` | 0.5 kun |
| P1-4 | Radius kengaymaydi (5 km qat'iy) | `dispatch.service.ts:48,112` | 1 kun |
| P1-5 | Ketma-ket bitta-bitta taklif (75 s eng yomon holat) — broadcast yo'q | `dispatch.service.ts:181` | 2-3 kun |
| P1-6 | `zoneAffinity` o'lik (0.10 og'irlik behuda) | `dispatch.service.ts:174` `// TODO` | 1 kun (geofence bilan tuman aniqlash) |
| P1-7 | Mini App'da buyurtma berish YO'Q (faqat bot) | `apps/client/src/lib/api.ts:232-238` | 3-5 kun |
| P1-8 | Refresh tokenlar DB'da ochiq matnda, rotatsiya yo'q | `auth.service.ts:220-227` | 1 kun |
| P1-9 | Repodagi APK aprel'dan (V2 emas); release **debug kalit** bilan imzolanadi | `apps/web/public/*.apk` (2026-04-10); `build.gradle.kts:53` `// TODO: production signing` | 0.5 kun |
| P1-10 | APK API URL'i **build vaqtida** Render'ga qotirilgan | `build.gradle.kts:25-26` | 0.5 kun |
| P1-11 | Socket CORS `origin:'*'` prod'da ham | `socket.gateway.ts:27` | 0.25 kun |
| P1-12 | dev-OTP paneli `NODE_ENV`ga bog'liq (env xatosi = OTP sizadi) | `auth.service.ts:43-47` | 0.25 kun |
| P1-13 | Deploy hali Render+Vercel'ga qaratilgan (BirJoy VPS'da) | `.github/workflows/deploy.yml` | 1 kun |

### 🟡 P2 — texnik qarz

- Har GPS fix'da `orders` SELECT (`socket.gateway.ts:137-141`) — 550 haydovchida ~135 QPS.
- `scoreDrivers` ichida ketma-ket Redis sikli (`driver-scorer.service.ts:77-82`).
- Admin xonasiga har GPS fix broadcast (`socket.gateway.ts:146`) — throttling yo'q.
- `RoutingModule` o'lik; `modules/sla/`, `modules/surge/` bo'sh papkalar.
- `promoDiscount`, `etaMinutes` doim 0/null.
- 8 commit 3 oydan beri push qilinmagan; 4 ta ortiqcha shoxobcha + 2 worktree.
- `verifyClientOtp` DTO'siz (`auth.controller.ts:84`).
- Testlar: 29 ta, hammasi mock, pul yo'llari 0% qamrovda.

---

## 10. QAMRAB OLINMAGAN (nimani TEKSHIRMADIM va NEGA)

**Qoida bo'yicha qilmadim:**
1. **Hech narsa ishga tushirmadim** — `pnpm install`, `pnpm build`, `pnpm test`, `tsc --noEmit`, docker, port. → "build yashil", "typecheck o'tadi", "40 modul mapped", "0 xato under load" da'volarini **tasdiqlay ham, rad eta ham olmayman**.
2. **DB'ga ulanmadim** — "550 haydovchi", "3 vehicle class", "8 tuman", "98 manzil", "prod'da vehicle class 0" — hammasi **tekshirilmagan**.
3. **VPS/Render'ga SSH qilmadim** — jonli tizim holati, env o'zgaruvchilari (`NODE_ENV`, `AUTO_APPROVE_NEW_DRIVERS`, `EXPOSE_OTP_TO_OPERATORS`, `TELEGRAM_INITDATA_DEV_BYPASS`) jonli qiymati **noma'lum**. Men faqat lokal `.env` va `.env.example` ni ko'rdim.
4. **APK'ni telefonda ishlatmadim** — MASTER-PLAN ham buni tan oladi.

**Vaqt/hajm sababli sayoz ko'rdim (batafsil audit kerak):**
5. **`orders.service.ts` to'liq** — 900+ qator; men `createOrder`, `driverArrived`, `startRide`, `completeRide`, `cancelOrder`, `deductCommission` ni o'qidim. Reyting, chat, `getClientOrders`, `logStatus` — sayoz.
6. **To'lov modullari** — `payme.service.ts`, `click.service.ts`, `wallet.service.ts`, `topup.service.ts` **ochilmagan**. Pul kirish yo'li auditdan tashqarida.
7. **Sadoqat / gamifikatsiya / incentives / promos** — ochilmagan. BirJoy tajribasidan ma'lumki (`MEMORY: oyin-unwinnable-as-seeded`), aynan shu joyda pul sizishi bo'ladi.
8. **Kotlin ilovasi to'liq** — 51 `.kt` fayl; men `SocketManager`, `LocationForegroundService`, `TaxiFirebaseMessagingService`, `build.gradle.kts`, `AndroidManifest.xml` va `HomeViewModel` ning taklif qismini o'qidim. Xarita, ActiveRideSheet, OfferPopup, Earnings, Balls — **ko'rilmagan**.
9. **Admin panelning 26 sahifasidan** faqat `operator/page.tsx` (1580 q.), `orders/page.tsx`, `hooks/useSocket.ts`, `lib/utils.ts` batafsil ko'rilgan. Qolgan 22 sahifa — sanaldi, o'qilmadi.
10. **`packages/db` sxemasi to'liq** — men `dispatchOfferLogs`, `orders` status enum'ini ko'rdim; 30+ jadval, indekslar, migratsiyalar, `drizzle` snapshot holati **tekshirilmagan**. MASTER-PLAN §6 da "drizzle-kit push occasionally drops new columns" deb yozilgan — bu **alohida tekshirilishi shart**.
11. **`docs/` dagi 12 boshqa hujjat** — faqat MASTER-PLAN o'qilgan (topshiriq shunday). `SOFTWARE-STANDARDS-AUDIT.md`, `TESTING-PLAN.md`, `DEPLOYMENT-GUIDE.md` da qarama-qarshi da'volar bo'lishi mumkin.
12. **`.env` sirlari** — men faqat flag NOMLARINI grep qildim, qiymatlarni ochmadim (bot token, DB parol va h.k.). U yerda boshqa sizib chiqqan sirlar bo'lishi mumkin — **alohida secret-scan kerak**.

---

## 11. OCHIQ SAVOLLAR

**Egaga:**
1. **`no_drivers` buyurtma bilan nima bo'lishi kerak?** kas1067 da operator qo'lda qutqaradimi? Agar ha — bu P0-1 ning talab spetsifikatsiyasi (avtomatik operator navbati? qo'ng'iroq? SMS?).
2. **OTP: 4 yoki 6 xona?** (MASTER-PLAN §7.1 hali ham javobsiz — 3 oy.) Mening tavsiyam: 6 xona + verify throttle, chunki hozirgi holat admin panelini brute-force'ga ochiq qoldiradi.
3. **Haydovchi balansi minusga tushsa nima qilinadi?** Buyurtma berilmasinmi? Qaysi chegaradan? Bu — biznes-modelning o'zagi va kodda **umuman yo'q**.
4. **Yakuniy narx surge bilan hisoblansinmi?** (Hozir yo'q — P0-5.) Agar ha, mijozga qanday tushuntiriladi?
5. **Deploy qayerga?** `deploy.yml` hali Render+Vercel'ga qaratilgan; BirJoy Contabo VPS'da. 1067-taxi qayerda yashaydi?
6. **8 ta push qilinmagan commit** — push qilinsinmi yoki avval P0 gaplar yopilsinmi?

**Keyingi tekshiruvdan (men qamramagan):**
7. **To'lov modullarining mustaqil auditi** (Payme/Click/wallet/topup) — pul kirish yo'li.
8. **Sxema-drift tekshiruvi:** `drizzle` sxemasi vs haqiqiy DB (MASTER-PLAN §6 "push drops columns" deb ogohlantiradi).
9. **Jonli env auditi:** VPS/Render'da `NODE_ENV`, `AUTO_APPROVE_NEW_DRIVERS`, `EXPOSE_OTP_TO_OPERATORS`, `TELEGRAM_INITDATA_DEV_BYPASS` **haqiqatda** qanday o'rnatilgan.
10. **`.env` va git tarixi bo'ylab to'liq secret-scan** (P0-9 dan tashqari yana sir bormi).
11. **Yuklama sinovi:** 50 online haydovchi + 20 parallel buyurtmada dispatch, socket va DB nima qiladi.

---

## 12. YAKUNIY BAHO

| O'lchov | Baho | Asos |
|---|---|---|
| Kod hajmi / kenglik | **~75-80%** | 39 ta ulangan modul, 26 admin sahifa, ishlaydigan Kotlin ilova skeleti, puxta taximetr, o'ylangan reconnect mantiqi |
| Ichki sifat (arxitektura, izohlar) | **yaxshi** | Izohlar sabab-natijani tushuntiradi ("bu bug'dan chiqqan"), forwardRef sikllari to'g'ri, Redis lock bor |
| Test / isbot bazasi | **~8%** | 3 fayl, 29 mock-test, pul yo'llari 0% |
| **Pilotga tayyorlik** | **45-55%** | 3 ta yo'q oqim (push / operator-qutqarish / sweep) + 2 ta pul xatosi (surge, balans) + brute-force'ga ochiq OTP |

**"~80% pilotga tayyor" — RAD ETILADI.** To'g'ri formulirovka: *"Kodning ~80% i yozilgan. Pilotga chiqish uchun yana ~12-17 muhandis-kun P0 ish + telefonda maydon sinovi + bitta real safar kerak."*

**Eng muhim gap MASTER-PLAN'da umuman yo'q:** MASTER-PLAN §4 da "launch-critical" ro'yxatida 6 ta band bor (APK sinovi, merge+deploy, Eskiz, e2e, vehicle classes, OTP uzunligi). Men topgan 10 ta P0 dan **faqat 2 tasi** (Eskiz, OTP) o'sha ro'yxatda. Qolgan 8 tasi — jumladan buyurtmani yo'qotadigan uchtasi — **hujjatda yo'q**. Ya'ni "80%" raqami noto'g'ri emas, balki **noto'g'ri narsani o'lchagan**.

---

**READY FOR VERIFICATION.**
*Bu hujjatdagi har bir da'vo `fayl:qator` yoki buyruq natijasi bilan qo'llab-quvvatlangan. Ishga tushirish talab qiladigan hech narsa tasdiqlanmagan — §10 ga qara.*
