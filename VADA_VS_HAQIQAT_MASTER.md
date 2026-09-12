# VA'DA vs HAQIQAT — BIRJOY TAXI MASTER AUDITI

**Sana:** 2026-09-10 · **Tekshirilgan hujjatlar (va'dalar manbai):** `BIRJOY_TAXI_MASTER.md` (v2) ·
`TAXI_10X_PLAN.md` · `TAXI_QAROR.md` · `TAXI_BIRJOYSOURCE_DOD.md`
**Tekshirilgan kod:** B = `1067-taxi/` (`apps/api` · `apps/web` · `apps/client` ·
`apps/driver-android` · `packages/db/src/schema`) · A = `packages/{server,admin,miniapp}` +
`packages/server/prisma/schema.prisma`
**Usul:** faqat statik kod o'qish + `git` + `grep`. Hech narsa ishga tushirilmadi, VPS'ga
ulanilmadi, telefonda sinalmadi. Har satr `fayl:qator` yoki **natijasi BO'SH qidiruv** bilan
isbotlangan. Taxmin YO'Q.

**Status lug'ati:** `BAJARILGAN` = yozilgan VA chaqiriladi (ikkalasi isbotlangan) ·
`YOZILGAN, ULANMAGAN` = kod/ustun/jadval bor, hech kim chaqirmaydi (bo'sh qidiruv bilan isbot) ·
`QISMAN` = qaysi yarmi bajarilgani aniq aytilgan · `YO'Q` = yugurtirilgan qidiruvlar bilan isbot ·
`FLAG BILAN O'CHIQ` = bayroq nomi ko'rsatilgan.

**Bayroq dalili:** A'da bayroq = DB satri (`packages/server/src/services/featureFlags.ts`).
`DEFAULT_OFF` (`featureFlags.ts:182`) = satr bo'lmasa QORONG'I. `EXPECTED_ON`
(`featureFlags.ts:215-287`) = **ega qabul qilgan jonli to'plam** — men "jonli" deganda shu ro'yxatni
dalil qilaman. ⚠️ **`EXPECTED_ON` ham, `FEATURES` ham taxi/dispatch/birjoy nomli BIRORTA bayroq
tutmaydi** — ya'ni butun taxi dasturi A'da bayroq bilan boshqarilmaydi, faqat `KAS_MODE` env bilan.

---

## 0. HALOL XULOSA

**Bajarilgan ulush: ~35% (og'irlikli), qat'iy hisobda 23%.** Bu raqam 113 ta ANIQ va'da satridan
chiqdi (har biri quyidagi jadvallarda `fayl:qator` bilan): **26 BAJARILGAN · 23 QISMAN ·
8 YOZILGAN-ULANMAGAN · 56 YO'Q**. Og'irlik: BAJARILGAN 1.0 · QISMAN 0.5 · YOZILGAN-ULANMAGAN 0.25 ·
YO'Q 0 → 39.5 / 113 = **35.0%**. Faqat to'liq bajarilganlarni sanasak — **23.0%**.

Bu raqam ostidagi shakl juda aniq va u ega aytgan gapni tasdiqlaydi: **bitta blok mukammal
bajarilgan, qolgan hammasi to'xtagan.** `git log` buni bir qarashda ko'rsatadi — reja 2026-09-08 da
yozilgan, kod 2026-09-08 → 09-10 orasida yozilgan (26 commit), va u 26 commit deyarli faqat
**F1-core P0-1..P0-6** ni va shu haftaning admin/haydovchi tuzatishlarini qamragan. F1-core 6/6
haqiqatan yopilgan (tekshirdim, pastda isbot bor) — bu real yutuq. Undan keyin **sirt A ning 4/17,
sirt B ning signal mantig'i 1/5, sirt C ning avtomatikasi 0, sirt D ning 0/4, sirt G ning 1/8** va
**§5 TANGA birlashuvining 0%** holatida qolgan.

Uchta narsa alohida og'ir, chunki ular reja O'ZI "eng muhim" degan joylar:

1. **FCM yarmi qilingan.** Reja aniq yozgan: *"FCM (P0-7 TS + P0-8 KT) birinchi navbatda BIRGA"* —
   *"raqibdan yagona ustunlik quroli"*. Server yarmi bajarildi (`dispatch.service.ts:291`), ilova
   yarmi umuman qilinmadi (`google-services.json` yo'q, gms plagini yo'q). Natija: server har
   dispatch'da push yuboradi, `drivers.fcmToken` esa abadiy `null`, `notifications.service.ts:39`
   jimgina qaytadi. **Uchidan-uchiga 0%, va hech qayerda xato log qilinmaydi.**
2. **§5 TANGA birlashuvi umuman boshlanmagan** — kod ichida "Slice 5c" deb kechiktirilgan va o'sha
   5c hech qachon kelmagan (§ TANGA bo'limi).
3. **F0.5 zaxira bajarilmagan va xavf 4 barobar oshgan.** Reja "8 commit diskda yo'qolishi mumkin —
   `git bundle` qil" degan edi. Bundle yo'q (`find . -name "*.bundle"` → bo'sh), commitlar esa endi
   **34 ta** (`git log --oneline origin/main..HEAD | wc -l` → `34`). Oxirgi push qilingan commit —
   `7d130ec` **2026-05-01**. Ya'ni butun P0 ishi, butun F1-bridge, butun haydovchi-ilova ishi
   **bitta diskda** turibdi.

Yana bitta boshqaruv fakti, u alohida aytilishi kerak: **`PROGRESS.md` da butun taxi dasturi
haqida bitta ham yozuv yo'q.** `grep -n "Slice 5\|F1-bridge\|BirJoySource\|birjoy.ts" PROGRESS.md`
→ 2 ta natija, ikkalasi ham CSS dizayn-kiti `design/birjoy.tsx` haqida (`PROGRESS.md:2644`,
`PROGRESS.md:3953`), taxi bilan aloqasi yo'q. CLAUDE.md ning R7 qoidasi ("PROGRESS.md = LITERAL
haqiqat") shu dastur uchun umuman qo'llanmagan — shuning uchun "unutilgan" tuyg'usi to'g'ri: hech
kim hech qayerda nima qolganini yozib bormagan.

---

# I. VA'DA vs HAQIQAT — SIRTLAR BO'YICHA

## A. HAYDOVCHI ANDROID ILOVASI
*(BIRJOY_TAXI_MASTER §V.A · TAXI_10X_PLAN §6 · P0-7..P0-10)*

| # | Va'da (manba) | Status | Isbot | Gap |
|---|---|---|---|---|
| A1 | FCM ilova tomoni: `google-services.json` + gms plagini, token DB'ga tushadi (P0-8, K4b) | **QISMAN** | Servis klassi bor: `apps/driver-android/app/src/main/java/com/taxi1067/driver/service/TaxiFirebaseMessagingService.kt:41`, manifestda ro'yxatdan o'tgan `AndroidManifest.xml:75-81`, token yuklash `TaxiFirebaseMessagingService.kt:72` + `HomeViewModel.kt:454-465`. **LEKIN** `find . -iname "google-services*"` → 0; `grep -rn "google-services\|google.gms" --include=*.kts --include=*.toml` → exit 1, 0 natija | Firebase ishga tushmaydi → `onNewToken` hech qachon chaqirilmaydi → token doim `null`. Yozilgan kodning hammasi o'lik |
| A2 | FCM server tomoni: `dispatch.service` → `sendToDriver` data-payload (P0-7, K4a) | **BAJARILGAN** | `apps/api/src/modules/dispatch/dispatch.service.ts:291` real chaqiruv (`sendBookingOffer` dan keyin, `:269`); DI `dispatch.service.ts:49`, modul `dispatch.module.ts:9` | Kod to'g'ri, lekin A1 tufayli **uchidan-uchiga 0%**. `notifications.service.ts:39` har safar erta qaytadi. Xato LOG QILINMAYDI — jim halokat |
| A3 | Socket egaligini servisga/singleton sessiyaga ko'chirish (P0-9) — "process o'lsa qayta ulanadi" | **QISMAN** | `SocketManager` `@Singleton` (`service/SocketManager.kt:23-24`), lekin `.connect()` faqat 2 joydan: `ui/home/HomeViewModel.kt:348` va `:354`. `LocationForegroundService.kt:42,64` faqat lokatsiya uzatadi, ulanmaydi. `TaxiApp.kt:1-7` bo'sh | Obyekt singleton, LEKIN HAYOT SIKLI hali ham UI'da. Process o'lsa `HomeScreen` qayta tuzilmaguncha ulanmaydi — va'da bajarilmagan |
| A4 | Offline navbat tirillsin (accept/reject jimgina yo'qolmasin) | **YOZILGAN, ULANMAGAN** | `util/DataStore.kt:154` `savePendingOfferQueue`, `:157` `getPendingOfferQueue`, `:159` `clearPendingOfferQueue` — `grep -rn "savePendingOfferQueue" --include=*.kt app/src` → **faqat ta'rif qatori**. UI ham o'chiq: `ui/home/HomeScreen.kt:221` `queuedCount = 0`, `:225` `onSwapToNext = {}` | Uchala funksiya ham o'lik kod. `QueueBadge` (`ui/offer/OfferPopup.kt:224-230`) hech qachon chizilmaydi |
| A5 | BootReceiver (telefon yonganda haydovchi offline qolmasin) | **YO'Q** | Ruxsat bor: `AndroidManifest.xml:28` `RECEIVE_BOOT_COMPLETED`. Receiver klassi yo'q: `grep -rn "BroadcastReceiver\|BOOT_COMPLETED\|BootReceiver" --include=*.kt --include=*.xml app/src` → faqat o'sha ruxsat qatori + aloqasiz `SmsRetrieverEffect.kt:4,34`. Manifestda 0 ta `<receiver>` | Ruxsat so'raladi, hech narsa qilmaydi. Case 26 ochiq |
| A6 | OEM autostart yordamchisi (Xiaomi/Oppo/Vivo) | **YO'Q** | `grep -rniE "autostart\|auto_start\|miui\|xiaomi\|oppo\|vivo\|huawei\|coloros\|funtouch" --include=*.kt --include=*.xml app/src` → **0 natija**. Faqat AOSP: `ui/permissions/PermissionsScreen.kt:144` batareya-optimizatsiya intenti | Reja "AOSP whitelist yetarli emas" degan edi — aynan shu holat qoldi |
| A7 | `proguard-rules.pro` (K8) | **BAJARILGAN** | `apps/driver-android/app/proguard-rules.pro:1-50` (kotlinx-serialization / Hilt / Retrofit / OkHttp / socket.io keep qoidalari), ulangan `app/build.gradle.kts:78-79` | — |
| A8 | Release prod imzo bilan (K8) | **BAJARILGAN** | `app/build.gradle.kts:49-58` `signingConfigs`, tanlov `:82-85`; keystore diskda: `apps/driver-android/keystore/birjoy-driver-upload.jks` | ⚠️ Shartli: keystore bo'lmagan mashinada/CI'da `:85` **jimgina debug kalitga** tushadi. `keystore.properties:4,6` da parollar ochiq matnda |
| A9 | Cleartext o'chirilsin (K8) | **YO'Q** | `AndroidManifest.xml:41` `usesCleartextTraffic` HALI HAM true; `res/xml/network_security_config.xml:7` `cleartextTrafficPermitted="true"` global | Majburiy, chunki release base URL `http://169.58.55.249:4000` (A17) — TLS domeni yo'q |
| A10 | Taximetr diskka saqlansin (case 7 — "ilova o'lsa nolga tushadi") | **YO'Q** | Holat faqat xotirada: `ui/home/HomeViewModel.kt:64-67`. `DataStore.kt:25-44` kalit ro'yxatida taximetr kaliti YO'Q. Tiklash yo'li isbot: `HomeViewModel.kt:404-431` bepul-kutishni tiklaydi (`:428-431`) lekin taximetrga TEGMAYDI | Ilova o'lsa taximetr nolga tushadi — reja topgan bug aynan turibdi |
| A11 | Fon taklifi overlay + `setShowWhenLocked` (case 23, 25) | **YO'Q** | `grep -rniE "setShowWhenLocked\|setTurnScreenOn\|SYSTEM_ALERT_WINDOW\|TYPE_APPLICATION_OVERLAY\|setFullScreenIntent\|canDrawOverlays" --include=*.kt --include=*.xml app/src` → **exit 1, 0 natija**. FCM bildirishnomasi oddiy `PRIORITY_HIGH` (`TaxiFirebaseMessagingService.kt:107-116`), full-screen intent yo'q. `OfferPopup.kt:90` — Compose dialogi, faqat Activity oldinda bo'lsa | Taklif faqat Home tab ochiq bo'lsa ko'rinadi |
| A12 | 5 o'lik tugma tuzatilsin | **YO'Q** | Beshtasi ham hali no-op: `ui/balls/BallsScreen.kt:427` `{ /* placeholder */ }` · `ui/profile/ProfileScreen.kt:93` `onEdit = { /* placeholder */ }` · `ui/settings/SettingsScreen.kt:229` · `:236` · `comparePct` hardcoded `null` `ui/home/HomeViewModel.kt:524` | Oltinchisi ham topildi: `HomeScreen.kt:225` `onSwapToNext = {}` |
| A13 | minSdk 26 → 23 masalasi: "avval o'lchang" (`driver_sessions.deviceModel/appVersion`) | **YO'Q** | `app/build.gradle.kts:31` `minSdk = 26` o'zgarmagan. O'lchov qilinmagan — ilova qurilma ma'lumotini UMUMAN yubormaydi: `grep -rn "deviceId\|deviceModel\|Build.MODEL\|ANDROID_ID" apps/driver-android/app/src/main/java --include=*.kt` → **0 natija** | O'lchov bazasi bo'sh: `driver_sessions.device_id` har real sessiyada NULL. Ya'ni qaror qabul qilish uchun ma'lumot YIG'ILMAYAPTI |
| A14 | Bosh ekran blueprint: (a) katta daromad raqami · (b) katta ONLAYN · (c) issiqlik xaritasi · (d) maqsad qatori | **QISMAN 2/4** | (b) BOR — `ui/home/HomeBottomPanel.kt:127-143` (56.dp, full-width). (c) BOR va to'liq ulangan — `ui/home/DriverMapView.kt:261-292` + `ApiService.kt:84-85` `GET drivers/heatmap`. (a) YO'Q — `ui/home/HomeStatusBar.kt:93-97` `TaxiType.titleSm`, brend bilan avatar orasida, "ekran yarmi" emas. (d) YO'Q — `grep -rniE "yana .*safar\|goal\|maqsad\|streak"` bosh ekran fayllarida 0; o'rnidagi pill `priorityPosition = null` (`HomeViewModel.kt:80`) | Reja "ekranning yarmi bitta raqam" degan edi — kichkina qator bo'lib qolgan |
| A15 | Taklif kartasi: pickup nomi KATTA · masofa · **mijoz belgisi** · sanoq halqasi · **surish** bilan qabul | **QISMAN 3/5** | Masofa BOR `ui/offer/OfferPopup.kt:184,388-402` (server `dispatch.service.ts:279`). Halqa BOR `OfferPopup.kt:217-221,246-320`. Surish BOR `OfferPopup.kt:205-208,571,656`. **Pickup KATTA emas** — `OfferPopup.kt:445-450` `bodyLarge`, manzil qatori bilan bir xil o'lcham. **Mijoz belgisi YO'Q** — `grep -rniE "clientRating\|clientRides\|rideCount\|cancelRate\|reyting" --include=*.kt app/src` → exit 1, 0; `domain/model/Models.kt:46-70` da bunday maydon yo'q | "Eng muhim 15 soniya" kartasidan qaror uchun kerak 2 element yetishmaydi |
| A16 | WorkManager qorovul (P1) | **YO'Q** | `grep -rniE "workmanager\|androidx.work\|CoroutineWorker\|PeriodicWorkRequest" --include=*.kt --include=*.kts --include=*.toml app/ gradle/` → yagona natija Google Maven index kesh fayli (`app/build/intermediates/lint-cache/.../master-index.xml:161`), loyiha kodi emas | Chidamlilik faqat `START_STICKY` + wake-lock ustida (`LocationForegroundService.kt:82,113-123`) |
| A17 | Ilova base URL Render'dan VPS'ga (§6) | **QISMAN** | Release VPS'ga ko'chgan: `app/build.gradle.kts:93-96` `http://169.58.55.249:4000/api/v1`. LEKIN `defaultConfig` hali Render: `:40-41` `https://one067-taxi-api.onrender.com/api/v1` | Plain `http://` (TLS yo'q) → A9 cleartext'ni majburlaydi. `birjoy.online` tarmoq konfiguratsiyasida umuman yo'q |

**A jamlanma:** BAJARILGAN 3 · QISMAN 4 · YOZILGAN-ULANMAGAN 1 · YO'Q 9 (jami 17).

---

## B. DISPETCHER KONSOLI
*(BIRJOY_TAXI_MASTER §V.B + P1 backlog)*

| # | Va'da (manba) | Status | Isbot | Gap |
|---|---|---|---|---|
| B1 | `no_drivers` terminal holatdan chiqsin + qutqarish paneli (K1, P0-1) | **BAJARILGAN** | API: `apps/api/src/modules/orders/orders.service.ts:892-893` (`no_drivers` faol ro'yxatda), `dispatch.service.ts:653-654,658` (`cancelledAt` qo'yilmaydi). UI: `apps/web/src/app/dashboard/operator/page.tsx:98-100` (terminal emas), `:1404` `rescue`, banner `:1413-1417`, tepaga pin `:1399`, qo'lda tayinlash `:1476-1484` | — (ma'lum, tasdiqlandi) |
| B2 | Signal 🔴 **haydovchi topilmayapti** | **BAJARILGAN** | `operator/page.tsx:1404,1409-1417,1399`; rang `apps/web/src/lib/utils.ts:64` | — |
| B3 | Signal 🔴 **kechikyapti** | **YO'Q** | `grep -rni "kechikmoqda\|kechikdi\|isLate\|lateBy\|etaOverdue" apps/web/src` → **0**. `OperatorOrder` tipida `eta` maydoni yo'q (`operator/page.tsx:54-65`) | ETA vs o'tgan vaqt solishtiruvi umuman yo'q |
| B4 | Signal 🟠 **mijoz ikkinchi qo'ng'iroq** | **YO'Q** | `grep -rni "repeatCall\|secondCall\|callAgain\|takroriy\|callCount" apps/web/src` → **0**. Qo'ng'iroqlar yoziladi (`operator/page.tsx:562-574` → `operator.controller.ts:172`) lekin qayta o'qilmaydi; `GET /operator/calls/recent` (`operator.controller.ts:192`) ni **hech kim chaqirmaydi** (0 natija) | Ma'lumot bor, signal yo'q |
| B5 | Signal 🟠 **safar uzoq** | **YO'Q** | `grep -rni "longRide\|uzoqDavom" apps/web/src` → **0**. Faqat `timeSince(order.createdAt)` kulrang matn, chegara yo'q (`operator/page.tsx:91-96,1429-1431`) | — |
| B6 | Signal 🟡 **zonada mashina yo'q** | **YO'Q** | `grep -rni "noDriversInZone\|zoneEmpty" apps/web/src` → **0**. Eng yaqin narsa — global bo'sh-haydovchi soni, **200 km radius, bitta qat'iy nuqta**: `operator/page.tsx:608-610`. Zona darajasi faqat server Telegram alertida (`health-alerter.service.ts:124-135`), konsolda emas | — |
| B7 | "Ekranning yagona vazifasi — muammoni ko'rsatish; yaxshi buyurtmalar jim turadi" | **YO'Q** | `operator/page.tsx:235` barcha faol buyurtmalarni oladi, `:1398-1400` HAMMASINI chizadi. Render yo'lida bitta ham muammo-filtri yo'q. Yagona ustuvorlik — `no_drivers` ni tepaga suradigan 2 tomonlama sort (`:1399`). Terminal buyurtmalar shunchaki xiralashtiriladi (`:1411` `opacity-60`) | Oddiy ro'yxat + 1 ta pin. "600 buyurtma uchun quriladi" degan konsol hali "63 uchun ro'yxat" |
| B8 | Jonli xarita ekrani | **QISMAN** | Komponent real: `apps/web/src/components/map/LiveMap.tsx:48-73`, `dashboard/page.tsx:174` da o'rnatilgan. **Alohida `/dashboard/map` sahifasi yo'q** | Faqat dashboard ichida |
| B9 | Navbat ekrani | **YO'Q** | API moduli bor (`apps/api/src/modules/queue/queue-management.service.ts`, `app.module.ts:148`), UI yo'q: `grep -rn "'/queue\|/queue/" apps/web/src` → **0** | Server bor, ekran yo'q |
| B10 | Qo'lda tayinlash | **BAJARILGAN** | `operator/page.tsx:1498-1603` modal → `:690` `POST /operator/dispatch/manual`; qayta tayinlash `dashboard/orders/[id]/page.tsx:151-156` | — |
| B11 | Operator buyurtmasi | **BAJARILGAN** | `operator/page.tsx` (1609 qator, 17 ta `apiClient`): lookup `:346`, booking `:494`, call log `:565` | — |
| B12 | Haydovchi 360 | **BAJARILGAN** | `dashboard/drivers/[id]/page.tsx` (730 qator, 7 fetch) + ro'yxat `dashboard/drivers/page.tsx` | — |
| B13 | Mijoz 360 | **QISMAN** | `dashboard/clients/[id]/page.tsx` (153 qator, 3 xom `fetch` `:23-25`) | Ishlaydi, lekin juda yupqa |
| B14 | Moliya | **BAJARILGAN** | `dashboard/finance/page.tsx:60` + `dashboard/finance/topup/page.tsx` (269 qator) | — |
| B15 | KPI | **BAJARILGAN** | `dashboard/page.tsx:86-120` (6 plitka) + `dashboard/analytics/page.tsx:21,33-37` | Mazmuni zaif — §H ga qarang |
| B16 | Firibgarlik ekrani | **YO'Q** | `grep -rniE "fraud\|firibgar\|antifraud" apps/api/src apps/web/src packages/db/src` → **0 natija** | Sahifa ham, endpoint ham, jadval ham yo'q |
| B17 | Sozlama ekrani | **QISMAN** | Sahifa real: `dashboard/settings/page.tsx` (402 qator, 4 chaqiruv). **LEKIN dispatch sozlamalari yetib bormaydi**: `DispatchService` `DISPATCH_*` ni konstruktorda `ConfigService` dan bir marta o'qiydi (`dispatch.service.ts:51-56`); `SettingsService` esa DB'ga yozadi (`settings.service.ts:9-11`). Bog'lovchi yo'l yo'q | Dispatch uchun sozlama sahifasi **dekorativ** |
| B18 | Admin refresh endpoint (P1 — "operator har 15daq login") | **BAJARILGAN** | `apps/api/src/modules/auth/auth.controller.ts:49-52` → `auth.service.ts:378` | — (ma'lum, tasdiqlandi) |
| B19 | Socket CORS `*` yopilsin (P1) | **YO'Q** | `apps/api/src/modules/socket/socket.gateway.ts:26-27` `cors: { origin: '*' }` — shartsiz. REST esa yopilgan (`main.ts:100-107` `isProd ? [...] : '*'`) | Yumshatuvchi omil: admin xonasi token talab qiladi (`socket.gateway.ts:227-243`) |
| B20 | dev-OTP `NODE_ENV`ga bog'liqligi (P1) | **YO'Q** | `auth.service.ts:46-51` — hali ham `NODE_ENV !== 'production'` yoki `EXPOSE_OTP_TO_OPERATORS`. OTP ochiq matnda LOG ham qilinadi: `auth.service.ts:146`, `:329`. Prod'da Telegram'ga chiqish yo'li: `:158-170` | — |
| B21 | Refresh token DB'da ochiq matnda (P1) | **YO'Q** | Sxema xom `text`: `packages/db/src/schema/auth.ts:45` (driver), `:64` (admin). Xom yoziladi `auth.service.ts:359`, `:256-263`. Xom tenglik bilan qidiriladi `:383`, `:240` → hash YO'Q. `bcryptjs` faqat admin paroli uchun (`:279`) | Bazani o'qigan odam 7 kunlik tokenlarni to'g'ridan-to'g'ri qayta ishlatadi |

**B jamlanma:** BAJARILGAN 8 · QISMAN 3 · YO'Q 10 (jami 21).
Sahifalar soni: `find apps/web/src/app -name "page.tsx" | wc -l` → **26** (reja to'g'ri aytgan; shundan
24 tasi haqiqiy ekran, 1 tasi redirect stub `apps/web/src/app/page.tsx`).

---

## C. TELEFONIYA / CTI
*(BIRJOY_TAXI_MASTER §V.C — "jiringlaydi → raqam taniladi → **mijoz kartasi o'zi ochiladi** → tasdiq → avtomatik tayinlash. Maqsad: 20 soniya. Qaror: SIP")*

| # | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| C1 | 9 endpoint bor ("suyagi tayyor") | **BAJARILGAN** | Hammasi real: `operator.controller.ts:31` (`client/lookup`), `:39` (`client/quick`), `:48` (`orders`), `:71` (`orders/estimate`), `:84` (`drivers/available`), `:95` (`dispatch/manual`), `:107` (`orders/:id/reassign`), `:172` (`calls/log`); `operator-phones.controller.ts:111` (`ring`), `:157` (`answered`), `:172` (`ended`) | Reja to'g'ri o'lchagan |
| C2 | Qo'ng'iroq → ekranda popup | **BAJARILGAN** | Server emit `operator-phones.controller.ts:145`; klient `apps/web/src/hooks/useSocket.ts:144,152,169`; global render `dashboard/layout.tsx:39` → `components/IncomingCallPopup.tsx:20` | — |
| C3 | **Mijoz kartasi O'ZI ochiladi** (oqimning yuragi) | **YO'Q** | `IncomingCallPopup.tsx:32` `router.push('/dashboard/operator?phone=…&autoLookup=1&callId=…')`. Operator sahifasi bu parametrlarni **umuman o'qimaydi**: `grep -rn "autoLookup" apps/web/src` → **1 natija, u ham shu 32-qator (ishlab chiqaruvchi)**; `grep -rn "useSearchParams" apps/web/src` → **0 natija** | Deep-link o'lik. Amalda: qo'ng'iroq keladi → operator tugma bosadi → **bo'sh forma ochiladi va raqamni qayta yozadi** |
| C4 | 20 soniya maqsadi | **YO'Q** | C3 tufayli avtomatika buzilgan; o'lchov ham yo'q — `operator_daily_stats.avgBookingTime` (`packages/db/src/schema/operator.ts:92`) **hech qachon yozilmaydi** (§H6) | Maqsad na qo'yilgan, na o'lchanadigan |
| C5 | SIP (ega qarori) | **YO'Q** | `rg -i "asterisk\|freeswitch\|webrtc\|twilio\|jssip\|sip\.js\|pjsip\|\bSIP\b"` → `apps/api/src` **No matches**, `apps/web/src` **No matches**, `packages/server/src` **0** | Mavjud tizim — oddiy Android telefonlar ustidagi qo'ng'iroq-jurnali (`schema/operator.ts:19` `call_logs`, `:56` `operator_phone_devices`). ⚠️ `ring/answered/ended` uchtasi `X-Device-Token: odt_…` talab qiladi (`operator-phones.controller.ts:193-194`), lekin **bunday APK repoda yo'q**: `ls apps/` → `api, client, driver-android, web` |
| C6 | Case 35: ikki qo'ng'iroq → **qizil** | **YO'Q** | Popup rangi faqat qo'ng'iroq HOLATIga bog'liq: `IncomingCallPopup.tsx:38,43` (emerald/amber/zinc). Qizil holat yo'q | — |
| C7 | Case 36: qo'lda tayinlash → **audit** | **YO'Q** | `dispatch.service.ts:414-441` `manualAssign()` — oxirida faqat `:440` `this.logger.log(...)`. `auditLogs` insert yo'q. `AuditService` butun API'da 2 ta chaqiruv joyiga ega: `drivers.service.ts:137` va `orders.service.ts:456` | `adminId` funksiyaga yetib keladi va log qatoriga tashlab yuboriladi |
| C8 | Case 39: smena tugadi → o'tadi | **YO'Q** | `grep -rn "shiftEnd\|shift_end\|smena\|handover" apps/api/src apps/web/src` → **0**. Admin logout marshruti ham yo'q (`grep -n "logout" auth.controller.ts` → 0) | — |

**C jamlanma:** BAJARILGAN 2 · YO'Q 6 (jami 8).
**Bir jumlada:** endpointlar bor, popup bor, **oqimning o'zi ulanmagan**.

---

## D. RATSIYA (PTT)
*(BIRJOY_TAXI_MASTER §V.D — "konsol va ilova ichida, kanallar: hammaga/zonaga/bitta. Qaror: LiveKit")*

| # | Va'da | Status | Isbot |
|---|---|---|---|
| D1 | PTT konsol ichida | **YO'Q** | `rg -i "livekit\|\bptt\b\|push.to.talk\|walkie\|voice.?channel\|MediaRecorder\|getUserMedia\|opus"` → `apps/` bo'yicha **No matches found** |
| D2 | PTT haydovchi ilovasi ichida | **YO'Q** | `apps/driver-android/app/src/main`: `livekit 0 · push_to_talk 0 · walkie 0 · MediaRecorder 0 · AudioRecord 0 · RECORD_AUDIO 0`. `AndroidManifest.xml:5-30` da `RECORD_AUDIO` ham, `MODIFY_AUDIO_SETTINGS` ham yo'q |
| D3 | LiveKit integratsiyasi | **YO'Q** | `livekit` → butun repo bo'yicha **0** |
| D4 | Kanallar (hammaga / zonaga / bitta) | **YO'Q** | Socket'da kanal tushunchasi yo'q — faqat `ADMIN_ROOM`, `client:<id>`, haydovchi-scoped (`socket.gateway.ts:106,157,223,254,332`) |

**D jamlanma:** YO'Q 4/4. **Bitta qator ham yozilmagan.**
⚠️ Case 49 ("yashirin tinglash YO'Q") — **bekor**: tinglash uchun ovoz umuman yozilmaydi. Bu case'ni
"bajarildi" deb belgilash MUMKIN EMAS, u D qurilmaguncha sinab bo'lmaydi.
⚠️ Chalkashtirmang: `apps/web/src/components/operator/RingingDriverPanel.tsx` — bu **dispatch taklifi
sanog'i** paneli, ratsiya emas (ovoz yo'q).

---

## E. MIJOZ TOMONI (bot + tanga)
*(BIRJOY_TAXI_MASTER §V.E · §7 · P0-11 · TAXI_10X_PLAN §8.1)*

| # | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| E1 | `BirJoySource` 27/27 metod (P0-11 darvozasi: "birortasi `throw new Error("not implemented")` EMAS") | **QISMAN — 8/27** | Interfeys 27 ta metod (`packages/server/src/kas/types.ts:213-275`). `birjoy.ts` da REAL: `getCarModels:83` · `searchAddresses:114` · `getAllAddresses:121` · `getBookingAddons:128` · `createBooking:135` · `getActiveBooking:160` · `getRideHistory:189` · `getDriverByCar:205`. Qolgan **19 tasi** `notImpl` reject (`birjoy.ts:78-80` yordamchisi; `:156-159, 187, 203-204, 217-225, 228-230`) | TypeScript `implements` shartini qanoatlantiradi → **typecheck darvozasi bu farqni ko'rmaydi**. 8 tasining 3 tasi maydonlarni to'qib qaytaradi: `clientBonus: 0` (`:171`), `cashback: 0` (`:198`), `carNumber: ""`/`carModel: ""` (`:195-196`), `lat/lng: 0` (`:181, :214`) |
| E2 | Paritet testi (DoD 5-mezon: "har metod uchun `KasMockSource` shakliga solishtirish") | **YO'Q** | DoD `TAXI_BIRJOYSOURCE_DOD.md:18` `birjoy.spec.ts` ni va'da qilgan — **fayl mavjud emas** (`ls packages/server/src/kas/` → `birjoy.ts client.ts index.ts mock.ts types.ts`). `grep -rln "BirJoySource" packages --include=*.ts` → **atigi 2 fayl**: `kas/birjoy.ts`, `kas/index.ts`. `packages/server/src/scripts/` da 93 ta `test*` skript bor, birortasi ko'prikka tegmaydi | Butun ko'prikda **0 ta test**. Yagona haqiqiy ko'prik testi — `service-token.guard.spec.ts` (5 case), u auth'ni tekshiradi, ma'lumotni emas |
| E3 | Tanga birlashuvi (§5) | **YO'Q** | Pastdagi TANGA bo'limiga qarang | Reja "eng muhim" degan qism |
| E4 | "1067-taxi Mini App **rivojlantirilmaydi**" (§IX, §V.E) | **YO'Q — teskarisi** | `apps/client/src` tirik: 13 ta `.tsx`, ichida ikkinchi to'liq loyalty tizimi — `components/BallChip.tsx` · `tabs/MissionsTab.tsx` · `tabs/ReferralsTab.tsx` · `tabs/ShopTab.tsx` · `tabs/SpinTab.tsx` · `components/TierBadge.tsx`. `vercel.json` (repo ildizi) hali ham uni deploy qiladi: `"buildCommand": "pnpm --filter @1067/client build"` | Ikkita mijoz ilovasi boqilmaydi degan qaror buzilgan |
| E5 | `@koson1067bot` mijoz oqimi o'chirilsin (§7, B3 qarori) | **YO'Q** | Modul shartsiz ro'yxatdan o'tgan: `apps/api/src/app.module.ts:49,139`. Mijoz oqimi to'liq tirik: `telegram.service.ts:1121` `placeOrder`, buyurtma `:1161`, tasdiq xabari `:1173`, bekor qilish `:707-709`, baholash `:675-687`, tarix `:740-745`, qayta buyurtma `:979`. Bayroq YO'Q — yagona gate bot-tokenning borligi (`:130-133`), u esa hammasini birdan o'chiradi. Prod token o'rnatilgan: `1067-taxi/.env:17` | Ikkita mijoz identifikatori, ikkita buyurtma yo'li parallel ishlaydi |
| E6 | Manzil katalogi: "150 joyning har biri bittalab, avtomatik test bilan" (§8.1) | **YO'Q** | Yagona manzil testi — `addresses.service.spec.ts`, **1 ta case** va u sof mock (`[{id:1,name:'5-Maktab'},{id:2,name:'Bozor'}]`), bazaga tegmaydi, `addresses.json` ni yuklamaydi. Real katalog 99 ta (`1067-taxi/scripts/kas1067/data/addresses.json`), seed `packages/db/src/seed/index.ts:80-103` | ⚠️ Qo'shimcha xavf: seed JSON topilmasa **jimgina 7 ta stub manzilga** tushadi (`seed/index.ts:36-37,44,105`) — faqat `console.warn`. ⚠️ `birjoy.ts:122-124` `GET /addresses` ni `limit`siz chaqiradi, controller default 500 (`addresses.controller.ts:11`) — katalog o'ssa jimgina kesiladi |

**E jamlanma:** QISMAN 1 · YO'Q 5 (jami 6).

**Ko'prikning ikkita jim to'sig'i (ikkalasi ham "hech qachon ishlamagan" degani):**
- A tomonda `KAS_SERVICE_TOKEN` default `""` (`packages/server/src/env.ts:31`), jonli `.env` da yo'q.
- B tomonda `SERVICE_TOKEN` **birorta env faylida yo'q**; guard fail-closed (`service-token.guard.ts:20-22`
  `if (!expected || expected.length < 32) throw new UnauthorizedException`). Ya'ni 4 ta himoyalangan
  ko'prik marshruti bugun **401** qaytaradi. Ko'prik uchidan-uchiga **hech qachon bitta so'rov ham
  o'tkazmagan**.
- ⚠️ Aksincha, 4 ta ko'prik marshruti **umuman himoyasiz**: `GET /addresses`, `/addresses/search`,
  `/car-models`, `/order-requirements` (`addresses.controller.ts:4`, `car-models.controller.ts:8`,
  `order-requirements.controller.ts:9` — guard yo'q). To'liq manzil katalogi ochiq o'qiladi.
- ⚠️ Telefon formati moslashtirilmagan: B `eq(clients.phone, phone)` qat'iy tenglik
  (`orders.service.ts:646-648`), A xom kas-formatini uzatadi (`birjoy.ts:145,161,190`). Format farq
  qilsa `getActiveBooking`/`getRideHistory` **jimgina bo'sh** qaytaradi, `createBooking` esa **yangi
  mijoz yaratadi**. Test yo'q.

---

## F. DISPETCHERLIK YADROSI
*(BIRJOY_TAXI_MASTER §V.F + P0/P1 backlog)*

| # | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| F1 | Radius kengaysin (5 km qat'iy edi) | **BAJARILGAN** | `dispatch.service.ts:455-459` `radiusForAttempt()` — ladder `[0.6, 1.0, 1.6, 2.4]` × `DISPATCH_SEARCH_RADIUS_KM` (5) = **3 / 5 / 8 / 12 km**; chaqiruv `:153-159` | ⚠️ `maxAttempts = 5` (`:51`) lekin ladder 4 pog'onali → **4- va 5-urinish ikkalasi ham 12 km**. 5-urinish radius jihatdan hech narsa bermaydi |
| F2 | To'lqinli taklif (4×20s) — ketma-ket 15s×5=75s o'rniga | **YO'Q** | Har urinishda BITTA haydovchi: `dispatch.service.ts:225` `selectedDriver = scored[0]`; bitta socket taklifi `:269`; bitta pending kalit `:541-546`; bitta timeout ishi `:305-309`. `timeoutSeconds = 15` (`:52`), `maxAttempts = 5` (`:51`). `grep -rniE "wave\|to'lqin\|parallelOffer\|broadcastOffer\|fanout" apps/api/src` → dispatch bilan bog'liq 0 | Bugun ham **75 soniya ketma-ket**. Reja aynan buni o'zgartirmoqchi edi |
| F3 | `reject` ≠ `timeout` ajratmasi | **YOZILGAN, ULANMAGAN** | Ustun qabul qiladi: `packages/db/src/schema/driver-performance.ts:61` (`'accepted','rejected','timeout','cancelled'`). LEKIN ikkala yo'l bitta metodga tushadi: `dispatch.service.ts:393` `driverRejectedOrTimeout(orderId, driverId)` — aniq rad (`socket.gateway.ts:205-217`) ham, timeout (`dispatch.processor.ts:19`) ham. Natija hardcoded: `dispatch.service.ts:401` `'timeout'` | **O'lik analitika:** `driver-performance.service.ts:62` va `admin.service.ts:289` dagi `filter (where outcome='rejected')` **abadiy 0** qaytaradi. `'rejected'` ni hech kim yozmaydi |
| F4 | `owndispatch` kill-switch (CLAUDE.md "har mexanika kill-switch") | **YO'Q** | `grep -rni "owndispatch" apps/ packages/` → exit 1, **0**; `DISPATCH_ENABLED` → 0; `kill.?switch` → 0; `feature.?flag` → 0. `startDispatch` (`dispatch.service.ts:104`) da hech qanday guard yo'q | ⚠️ Aldamchi: `dispatch.types.ts:8` `mode: 'auto'\|'nearest'\|'round_robin'\|'manual'` deb e'lon qiladi, lekin `dispatch.service.ts:198` faqat `'nearest'` ni ajratadi — `'manual'` jimgina `'auto'` kabi ishlaydi. Kimdir uni kill-switch deb o'ylashi mumkin, u emas |
| F5 | `zoneAffinity` o'lik og'irlik (P1) | **YOZILGAN, ULANMAGAN** | Og'irlik nolga teng emas (`dispatch.types.ts:30` `0.10`) va yig'indida qatnashadi (`driver-scorer.service.ts:137`). LEKIN `pickupTumanId` yagona chaqiruv joyida **hardcoded `null`**: `dispatch.service.ts:219` `null, // TODO: determine pickup tuman ID from geofence` → `driver-scorer.service.ts:116-120` har nomzodga bir xil `0.5` beradi | Har haydovchiga bir xil `0.05` qo'shiladi — hech qachon tanlov o'zgartirmaydi. `tumansToDrivers` join (`driver-scorer.service.ts:58-61`) behuda o'qiladi |
| F6 | `TZ=Asia/Tashkent` (P1 — `getHours()` server vaqti xatosi) | **YO'Q** | Bug joyida turibdi: `pricing.service.ts:343` `now.getHours()` (vaqt-koeffitsiyenti) va `:395` `date.getHours()` (**yakuniy narxdagi tungi koeffitsiyent**, `:218` orqali). `TZ` hech qayerda o'rnatilmagan: `grep -rn "TZ" docker-compose.yml docker-compose.prod.yml Dockerfile render.yaml vercel.json .env .env.example` → **0** | UTC konteynerda tungi narx **5 soat siljigan** ishlaydi. Qiziq: monitoring TZ ni to'g'ri qiladi (`health-alerter.service.ts:126`) va cron'da `// 03:00 UTC = 08:00 Tashkent` (`:172`) — ya'ni runtime UTC ekani BILINADI, lekin narxga qo'llanmagan |
| F7 | Zanjirli buyurtma (safar oxirida keyingisini oldindan taklif) | **YO'Q** | `zanjir · chainedOrder · nextOrderOffer · preDispatch · backToBack · queueNextOrder · nearRideEnd` — **hammasi 0 natija** (`apps/api/src`, `apps/web/src`, `packages/db/src`). Yakunlashda haydovchi shunchaki bo'shatiladi: `orders.service.ts:254` | — |
| F8 | O'lik buyurtma sweep'i (K2, P0-2) | **BAJARILGAN** | `dispatch.service.ts:73-79` `@Cron(EVERY_MINUTE) sweepStuckOrders()` — `['pending','dispatching']` + `updatedAt < cutoff` (`DISPATCH_STUCK_SECONDS`, 180) → `:87` `startDispatch` | — (ma'lum, tasdiqlandi) |
| F9 | Arvoh haydovchi GEO tozalash (K3, P0-3) | **BAJARILGAN** | `socket.gateway.ts:66-75` `handleDisconnect` → `:74` `removeDriverFromGeo`; heartbeat sweep `location.service.ts:89-103` `@Cron(EVERY_MINUTE)` → `:102` `zrem`; o'qishda filtr `:154` | — (ma'lum, tasdiqlandi) |
| F10 | Yakuniy narx surge/vehicle-class (K5, P0-4) | **BAJARILGAN** | `orders.service.ts:210-222` — `getVehicleClass()` + `calculateFinalFare(..., { surgeMultiplier, vehicleClass })`; surge booking paytida qulflanadi `:63,77` | — (ma'lum, tasdiqlandi) |
| F11 | Komissiya atomik + idempotent + balans (K6, P0-5) | **BAJARILGAN** | `db.transaction`: `orders.service.ts:953` (guard `:957-963`, atomik `sql` `:971-974`). `unique(orderId)`: `packages/db/src/schema/commissions.ts:38`. Balans filtri: `dispatch.service.ts:183` `gte(drivers.balanceUzs, minDispatchBalance)` | — (ma'lum, tasdiqlandi) |
| F12 | Re-dispatch byudjet to'qnashuvi 5 vs 3 (P1, case 3) | **YO'Q — hali ham zid** | `dispatch.service.ts:51` `maxAttempts = 5` → gate `:139`. `orders.service.ts:474` `MAX_REDISPATCH = 3` → gate `:476`. **Ikkalasi bitta ustunni** o'qiydi/yozadi: `orders.dispatch_attempt` (`schema/orders.ts:57`), yozuvlar `dispatch.service.ts:258-260` va `orders.service.ts:486`. Qabuldan keyin **nolga tushirilmaydi** | Real oqibat: 3+ taklifdan keyin qabul qilingan buyurtmada haydovchi-bekor byudjeti allaqachon tugagan → `< 3` sharti darhol yiqiladi va buyurtma to'g'ridan-to'g'ri qutqaruvga tushadi (`orders.service.ts:513-520`), va'da qilingan "3 marta qayta tarqatish" hech qachon bo'lmaydi |
| F13 | Bepul kutish → kutish tarifi → bekor (case 4) | **YOZILGAN, ULANMAGAN** | Kalitlar bor va tahrirlanadi: `pricing-admin.controller.ts:42-43` (`pricing.wait_free_minutes`, `pricing.wait_per_minute_uzs`), default `:61-62`, UI `apps/web/src/app/dashboard/pricing/page.tsx:109-110`. **Hech kim o'qimaydi**: `grep -rn "wait_free_minutes\|wait_per_minute_uzs" apps/ packages/` → aynan shu 4 qator, boshqa hech narsa. Narx faqat butun safar davomiyligini oladi (`pricing.service.ts:217`) | `driverArrivedAt` yoziladi (`orders.service.ts:138`) lekin faqat bekor-jarimasi uchun ishlatiladi (`cancellation.service.ts:124`) — narxga hech qachon tegmaydi. Taymer/avto-bekor ham yo'q |
| F14 | `order_stops` ko'p to'xtash (case 14 — "bor" deb yozilgan) | **YOZILGAN, ULANMAGAN** | Jadval bor: `packages/db/src/schema/safety.ts:148-163`, eksport `schema/index.ts:37`. `grep -rn "order_stops\|orderStops" --include=*.ts apps/ packages/` → **aynan bitta natija: sxema ta'rifining o'zi** | Buyurtma yaratish, narx, routing — hech biri bilmaydi |
| F15 | Rejalashtirilgan buyurtma 15 daq oldin (case 12) | **BAJARILGAN** | `scheduled-rides.service.ts:44` `scheduledAt - 15*60*1000`; bron cheklovi `:25-26`; zaxira cron `:99-108` `@Cron(EVERY_MINUTE)` | 15 raqami 3 joyda sehrli son, konfig kaliti yo'q (`SCHEDULED_LEAD` → 0) |
| F16 | Shahar tashqarisi alohida tarif (case 13) | **QISMAN** | Modul bor: `schema/safety.ts:165+` `intercityRoutes` (sinf bo'yicha qat'iy narx), `intercity.service.ts:56-60`, marshrutlar `intercity.controller.ts:9,14,19,26,31`, ro'yxatda `app.module.ts:149` | **Dispatch'ga ulanmagan**: `intercity.service.ts:53-77` `status:'pending'` bilan yozadi va `startDispatch` ni **chaqirmaydi** — faqat stuck-sweep uni ko'taradi. `vehicleClass` string, hamma joydagi `vehicleClassId` FK emas. UI yo'q: `grep -rn "intercity" apps/web/src` → **0** |
| F17 | "8 soatda o'tkazib yuborilgan buyurtma = 0" o'lchovi (§4 jadval, case 11) | **QISMAN** | Hisoblagich bor: `dispatch.service.ts:657` `dispatchOffers.inc({outcome:'no_drivers'})`, Prometheus `metrics.service.ts:92-98`. Alert bor lekin **10 daqiqalik NISBAT**: `health-alerter.service.ts:52-72` (`failureRate >= 0.5 && failures >= 5`) | 8 soatlik mutlaq-nol SLO yo'q; chegaradan past oqim **jim**. Kunlik digest'da bu raqam umuman yo'q (`:198-205`, ikkita literal `0` TODO bilan). ⚠️ `sla_violations` sxemada bor (`schema/sla-violations.ts:8`) lekin `apps/api/src/modules/sla/` **BO'SH katalog**, `grep -rn "slaViolations" apps/api/src` → **0** |

**F jamlanma:** BAJARILGAN 6 · QISMAN 2 · YOZILGAN-ULANMAGAN 4 · YO'Q 5 (jami 17).
**Bu — dasturning eng kuchli sirti**: 6 ta P0 haqiqatan yopilgan. Lekin F2/F4/F6/F12 hali ochiq.

---

## G. FIRIBGARLIK QALQONI
*(BIRJOY_TAXI_MASTER §V.G)*

**Sarlavha fakt:** `grep -rn "fraud" apps/api/src --include=*.ts` → **0 natija**. Butun API'da bu
so'z bir marta ham uchramaydi.

| # | Va'da | Status | Isbot | Gap |
|---|---|---|---|---|
| G1 | Soxta GPS — `isFromMockProvider` | **YO'Q** | Ilova: `grep -rn "isFromMockProvider\|isMock\|mockProvider" app/src/main` → **0**. `LocationForegroundService.kt:57,64` lat/lng/bearing/speed ni tekshirmasdan uzatadi. Server: sim formatida bunday bayroq yo'q — `socket.gateway.ts:136` `{lat, lng, bearing, speedKmh}`, `:141` to'g'ridan-to'g'ri saqlanadi | Rad etadigan narsa yo'q |
| G2 | Teleport aniqlash | **QISMAN — noto'g'ri yarmi** | Yagona sakrash-tekshiruvi taximetr ichida, **narxni himoya qilish uchun**: `pricing/taximeter.service.ts:57` (izoh: "Real drivers don't teleport"), `:70-71` `MAX_SEGMENT_KM = 5`, `:88` sakrashni **jimgina tashlab yuboradi** | `safety_events` satri yo'q, alert yo'q, haydovchi belgilanmaydi. Faqat `in_progress` buyurtmada ishlaydi (`socket.gateway.ts:147-155`) → safarda BO'LMAGAN spoofer umuman ko'rilmaydi. `location.service.ts:57-69` `speedKmh` ni tekshirmasdan saqlaydi |
| G3 | Soxta safar (takror juftlik) | **YO'Q** | `grep -rniE "fakeRide\|repeatedPair\|samePair\|collusion\|suspiciousPair"` → **0**. Yagona juftlik jadvali — QO'LDA to'ldiriladigan `client_driver_blacklist` (`schema/operator.ts:72`) | Bu detektor emas, operator xohishi ro'yxati |
| G4 | Ko'p akkaunt (qurilma ID / SIM) | **YOZILGAN, ULANMAGAN** | Sxema bor: `schema/auth.ts:46-48` `deviceId`/`deviceModel`/`appVersion`. Server qabul qiladi: `auth.dto.ts:18,22,26`, `auth.controller.ts:32-34`, yozadi `auth.service.ts:261-267`. **Ilova hech qachon yubormaydi**: `grep -rn "deviceId\|Build.MODEL\|ANDROID_ID" apps/driver-android/.../--include=*.kt` → **0**. Dublikat tekshiruvi ham yo'q: `driverSessions` API'da faqat refresh-token uchun ishlatiladi (`auth.service.ts:238-248,261`). IMEI/SIM: `grep -n "imei\|simSerial" packages/db/src/schema/*.ts` → **0** | Har real sessiyada `device_id` NULL. Bu bir vaqtning o'zida A13 (minSdk o'lchovi) ni ham o'ldiradi |
| G5 | Balans manipulyatsiyasi | **BAJARILGAN** | `drivers.service.ts:109-116` `ADMIN_EDITABLE_DRIVER_FIELDS` allowlist — `balanceUzs`/`totalEarnedUzs` chiqarib tashlangan, regressiya izohda tushuntirilgan `:104-107`; audit `:137` | ⚠️ Umumiy balans-daftari hali yo'q: `grep -n "balanceLedger\|driver_transactions" packages/db/src/schema/*.ts` → **0**; faqat topup jurnali (`schema/topup.ts:25,42`) |
| G6 | Sun'iy bekor qilish | **QISMAN** | Rate hisoblanadi: `driver-performance.service.ts:100`, saqlanadi `:146` → `schema/driver-performance.ts:22`, cron `:30`. **Faqat reyting jazosi sifatida ishlatiladi**: `driver-scorer.service.ts:94,122` | Chegara yo'q, alert yo'q, avto-blok yo'q (`grep -rn "highCancel\|autoBlock" apps/api/src` → 0) |
| G7 | Case 46: akkaunt o'g'irlandi → qurilma bog'lash | **YO'Q** | Refresh token faqat qiymat + muddat bo'yicha tekshiriladi (`auth.service.ts:238-242`); shu satrdagi `deviceId` **solishtirilmaydi**. G4 bilan birga: o'g'irlangan token istalgan telefonda ishlaydi | — |
| G8 | Case 50: hujjat muddati → ogohlantirish → bloklash | **QISMAN** | So'rov bor: `driver-documents.service.ts:215` `getExpiringDocuments(30)`, marshrut `driver-documents.controller.ts:104`. **UI iste'molchisi yo'q** (`grep -rn "driver-documents" apps/web/src` → faqat `DocumentReview.tsx` ko'rish/tasdiq). **Cron yo'q** (`grep -rn "Cron" .../driver-documents/*.ts` → 0). `'expired'` enum qiymati (`schema/driver-documents.ts:13`) hech qachon qo'yilmaydi | Ogohlantirish ham, bloklash ham yo'q |

**G jamlanma:** BAJARILGAN 1 · QISMAN 3 · YOZILGAN-ULANMAGAN 1 · YO'Q 3 (jami 8).
⚠️ Case 48 (GPS izi muddat bilan o'chadi) — **bo'sh o'rinda "bajarilgan"**: iz jadvali umuman
yo'q (`locationHistory · driver_locations · breadcrumb · order_track` → 0), pozitsiya faqat Redis'da
30 soniya TTL bilan (`location.service.ts:14,63-69`). Ya'ni va'da "bajarilgan" ko'rinadi, lekin u
nazarda tutgan qobiliyat (safar yo'lini qayta ko'rish) **mavjud emas**.

---

## H. ANALITIKA
*(BIRJOY_TAXI_MASTER §V.H — "o'lchamaydigan narsani yaxshilab bo'lmaydi")*

| # | O'lchov (va'da) | Status | Isbot | Gap |
|---|---|---|---|---|
| H1 | Tayinlash vaqti **median / p95** | **QISMAN** | Faqat o'rtacha va noto'g'ri boshlanish nuqtasi: `admin.service.ts:310` `AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)))` — bu **yaratilish→qabul**, `dispatch-boshlanishi→qabul` emas. `grep -rniE "p95\|percentile_cont\|PERCENTILE"` → **1 natija, u ham izoh**: `metrics.service.ts:63`. Yagona Histogram — HTTP kechikishi (`:170-176`) | ⚠️ **Xom ma'lumot BOR va tashlab qo'yilgan**: `dispatch_offer_logs.response_time_sec` (`schema/driver-performance.ts:62`) har taklifda yoziladi (`dispatch.service.ts:502-506`) — median/p95 uchun hammasi tayyor, hech kim agregat qilmaydi |
| H2 | Rad javobi **sababi** | **YO'Q** | Faqat 20-belgilik outcome (`schema/driver-performance.ts:61`), sabab matni yo'q. Rad socket xabari sabab olib yurmaydi: `socket.gateway.ts:208` `{ orderId: number }`. `grep -rniE "rejectReason\|refusalReason\|declineReason"` → **0** | F3 bilan qo'shilib: rad ham `'timeout'` deb yoziladi, ya'ni **na sabab, na tur** ma'lum |
| H3 | Onlayn mashina-soati | **YOZILGAN, ULANMAGAN** | Ustunlar bor: `schema/drivers.ts:64` `onlineHoursToday`, `schema/driver-performance.ts:32` `avgDailyOnlineHours`. `grep -rn "onlineHoursToday\|avgDailyOnlineHours" apps/api/src` → **0** — yozilmaydi ham, o'qilmaydi ham | Reyting formulasi o'rniga qatta son qo'ygan: `driver-performance.service.ts:126` `50 * 0.10 // online consistency placeholder` |
| H4 | Onlayn ulush (16.5 → 158 ning asosiy o'lchovi) | **QISMAN** | `admin.service.ts:86` `getOnlineDriverCount()` va `:47` `totalDrivers` yonma-yon qaytariladi (`:92-93`) lekin **hech qachon bo'linmaydi**. Prometheus gauge `metrics.service.ts:142-146`, `@Cron('*/5')` `health-alerter.service.ts:94` | Gauge — bir lahzalik. Postgres'da vaqt-og'irlikli ulush saqlanmaydi → F4 fazasining asosiy KPI'si o'lchanmaydi |
| H5 | Taklif qabul foizi | **BAJARILGAN** | `schema/driver-performance.ts:16` `acceptanceRate`, hisob `driver-performance.service.ts:146`, cron `:30`. Geografik kesim ham bor: `admin.service.ts:268 getProblemAreas()`, SQL `:283-299`, marshrut `admin.controller.ts:65` | ⚠️ `problem-areas` marshruti **UI'ga ulanmagan** (`grep -rn "problem-areas" apps/web/src` → 0) |
| H6 | Operator vaqti (< 20s maqsadi) | **YOZILGAN, ULANMAGAN** | Sxema aynan shu o'lchovni ta'riflaydi: `schema/operator.ts:84` `operator_daily_stats`, `:92` `avgBookingTime`. `grep -rn "operatorDailyStats" apps/api/src` → **4 natija, hammasi bitta SELECT**: `operator.service.ts:7,340-342`. **0 ta INSERT/UPDATE**, 0 ta cron | `GET /operator/stats/my` abadiy `[]` qaytaradi — va uni `apps/web` da hech kim chaqirmaydi ham. Xom ma'lumot bor (`call_logs.duration`, `schema/operator.ts:30`, klient `operator/page.tsx:195-196,220-225` o'lchaydi), agregat yo'q |
| H7 | **Buyurtma o'lim sababi** (reja qalin qilib yozgan) | **YO'Q** | `grep -rniE "deathReason\|whyDied\|lostReason\|noDriversReason"` → **0**. Faqat terminal STATUSlar (`schema/orders.ts:11-24`). `cancelReason` (`schema/orders.ts:100`) yagona joydan yoziladi — `orders.service.ts:538`, ya'ni faqat ODAM bekor qilganda; `no_drivers`/`expired` bilan o'lgan buyurtmada NULL. Agregatsiya status-sanog'ida to'xtaydi: `admin.service.ts:320-330` | "Nechtasi o'ldi" ga javob bor, **"nega o'ldi" ga yo'q** |

**H jamlanma:** BAJARILGAN 1 · QISMAN 2 · YOZILGAN-ULANMAGAN 2 · YO'Q 2 (jami 7).
KPI sahifasi bor (`apps/web/src/app/dashboard/analytics/page.tsx`, 6 ta so'rov `:21,33-37`), lekin
unda **na tayinlash-vaqti paneli, na o'lim-sababi paneli** yo'q.

---

## TANGA — YAGONA MUKOFOT VALYUTASI (§5)
*(Eng muhim savol. Har bandni alohida javob berdim.)*

### Qisqa javob

**§5 ning YANGI qismi 0% bajarilgan.** Bajarilgan deb ko'rinadigan hamma narsa — A'ning
**avvaldan mavjud** tanga infratuzilmasi (clamp, `CoinTxn`, korp-ledger), u bu rejadan OLDIN
qurilgan va reja unga hech narsa qo'shmagan. Taxi safaridan tangaga olib boradigan yo'lning
**birorta bo'g'ini yozilmagan**. Kodning o'zi buni tan oladi: `birjoy.ts:38-39` — *"the 27 methods
are filled in 5b (HTTP mappers) and **5c** (tanga methods resolve inside A)"* — va **5c hech qachon
kelmagan**.

### Invariantlar (§5.7) — bittalab

| # | Invariant | Kodda majburlanadimi? | Isbot |
|---|---|---|---|
| I1 | **≤350 tanga/safar emissiya** — `cashbackService` clamp orqali; taxi mukofoti ham shundan o'tadi | **QISMAN** — clamp REAL, lekin taxi unga yetib bormaydi | Clamp haqiqiy: `packages/shared/src/economy.ts:82` `RIDE_EMISSION_CAP = 350`; majburlash `packages/server/src/services/coinService.ts:86-114` (`grantRideCoins`, `withMemberLock` bilan seriyalashtirilgan, `:104-108` shu safar bo'yicha to'langanni yig'ib, ortiqchasini kesadi). **Lekin** taxi safari bu funksiyani chaqiradigan yo'lga ega emas (I8) |
| I2 | Har tanga operatsiyasi **`CoinTxn` + idempotent kalit (= `dispatchBookingId`)** | **QISMAN → kalit YO'Q** | `CoinTxn` + idempotentlik REAL: `coinService.ts:53-56` (oldindan tekshiruv), `:63-67` (bitta tranzaksiyada unique-kalitli insert BIRINCHI), P2002 → toza duplicate-skip `:72-74`. **`dispatchBookingId` esa umuman mavjud emas**: `grep -rn "dispatchBookingId\|900_000_000\|900000000" packages/ --include=*.ts` → **0 natija** (chiqqan 4 ta natija — aloqasiz test telefon raqamlari). U faqat tashlab yuborilgan shoxobcha commit'ida: `git log --all -S "dispatchBookingId"` → **1 natija: `acaa40cc` (`claude/taxi-system-drivers-bsa05f`)**. §4 "A shoxobchasidan `main`ga kesib olinadi" degan edi — **kesib olinmagan** |
| I3 | **Korp-ledger alohida** | **BAJARILGAN** (avvaldan) | `packages/server/prisma/schema.prisma:896-899` `model CorpAccount { balance Float }` — `Member.coins` dan butunlay ajratilgan; atomik guard `corpService.ts:29` | Rejadan oldin bor edi, reja unga tegmagan |
| I4 | **Pul-to'lab-omad TAQIQ** | **BAJARILGAN A'da · B'da yangi faucet ochilgan** | A: safarni tanga bilan to'lash mexanikasi umuman yo'q (`grep -rn "safartanga\|ridepay\|payWithCoins\|tangaToFare" packages/server/src` → **0**). B: `SpinTab` g'ildiragi **bepul** (24 soat cooldown, `loyalty.service.ts:57,459-495`) → pul-to'lab-omad emas. **LEKIN** B har yakunlangan safarda ikkinchi valyuta chiqaradi (I7) — clampsiz, CoinTxn'siz | Taqiq buzilmagan, lekin yonidan ikkinchi faucet ochilgan |
| I5 | **Har mexanika kill-switch flag ortida** (earn · withdraw · safar-to'lov) | **YO'Q** | A'da taxi/dispatch/birjoy nomli bayroq **umuman yo'q** — `featureFlags.ts:7-...` `FEATURES` ro'yxatida ham, `DEFAULT_OFF` (`:182`) da ham, `EXPECTED_ON` (`:215-287`) da ham. B'da dispatch bayroqsiz (F4). B'ning loyalty/spin/telegram-mijoz oqimi ham bayroqsiz (E5) | Yagona "o'chirgich" — `KAS_MODE` env qatori. CLAUDE.md qoidasi ("har mexanika kill-switch flag bilan") shu dastur uchun bajarilmagan |
| I6 | UI'da **"coin" so'zi yo'q** — hamma joyda "tanga"; B'ning "balls" nomi mijoz UI'dan olib tashlanadi | **QISMAN** | A tomon toza: miniapp'da foydalanuvchiga ko'rinadigan "coin" matni topilmadi (qidiruv 0 natija). **B tomon teskarisi**: `apps/client/src` da `balls` 20 ta joyda — `lib/api.ts:60,116,145` · `store/auth.ts:17,38,41` · `components/tabs/HomeTab.tsx:46,75,98` · `ShopTab.tsx:45,64` · `SpinTab.tsx:20-25,79,165`; `components/BallChip.tsx` | Mijoz B ilovasida "ball" ko'radi, A botida "tanga" — ikkita valyuta nomi |
| I7 | **Cross-DB: tanga faqat A'da yoziladi; B hech qachon tanga yozmaydi** | **QISMAN — harfan to'g'ri, mohiyatan buzilgan** | B haqiqatan `CoinTxn` yozmaydi (`grep -rniE "\btanga\b\|coinTxn" apps/api/src` → faqat izohlar/BirJoy-OTP nomlari). **LEKIN B O'Z valyutasini chiqaradi:** `orders.service.ts:264` har yakunlangan safarda `runLoyaltyHooks` → `:317` `ballsPerRide` (default **5**, `:43`); haydovchiga `gamification.service.ts:36,103` `BALLS_PER_RIDE = 10`; yozuv `clients.service.ts:130-134` `set({ balls: sql\`balls + ${delta}\` })` | Split-brain oldi olinmagan — shunchaki **ikkita alohida daftar** yaratilgan |

**Natija: 7 invariantdan 2 tasi to'liq majburlanadi (I3, I4-A'da), 4 tasi qisman, 1 tasi umuman yo'q.
Va ikkala "to'liq" ham rejadan oldin mavjud edi.**

### §5 ning qolgan bandlari

| Band | Va'da | Status | Isbot |
|---|---|---|---|
| §5.3 | Safar B'da tugaydi → **A'ning `bookingNotifier` sweep'i kengaytiriladi** → `cashbackService` tanga beradi | **YO'Q — va teskari to'siq bor** | Sweep kengaytirilmagan (`bookingNotifier.ts` da B/birjoy-ga oid bitta ham qator yo'q). Undan yomoni: **sweep `KAS_MODE === "live"` bilan qulflangan** — `packages/server/src/index.ts:584` `if (env.KAS_MODE === "live") bookingTimer = setTimeout(() => void tickBooking(), 15_000);`. Ya'ni `KAS_MODE=birjoy` yoqilsa **sweep umuman ishga tushmaydi** → safar-tugash aniqlanmaydi → tanga hech qachon berilmaydi. Xuddi shu narsa `refreshLinkedMembers` uchun ham (`index.ts:360`) |
| §5.3 | Idempotent kalit = `dispatchBookingId` (900M + orderId) | **YO'Q** | I2 ga qarang. ⚠️ **Aktiv xavf:** bugungi kalit `:memberId:bookingId` (`coinService.ts:98,111`) va `RideReward` unique `[memberId, bookingId]` (`cashbackService.ts:85-90`) xom booking id ustida ishlaydi. B'ning order id'lari kichik butun sonlar (1, 2, 3…) — ular tarixiy kas booking id'lari bilan **to'qnashadi**. §4 aynan shuning uchun 900M ofsetini talab qilgan edi |
| §5.3 | Tezlik `getBonusRules` orqali | **YO'Q** | `birjoy.ts:230` `getBonusRules(): return this.notImpl("getBonusRules")` |
| §5.4 | Do'kon / o'yin o'zgarmaydi | **BAJARILGAN** | Tegilmagan (A'ning `shop`/`oyin` yo'llari o'zgarmagan) |
| §5.4 | Withdraw faqat real safar qilganlarga, kunlik byudjet ichida | **QISMAN** | Qoida real: `coinService.ts:251` `if (member.type === "client" && (member.trips ?? 0) < MIN_RIDES_FOR_PAID) return fail("no_ride")`. **Lekin `trips` kas'dan sinxronlanadi** (izoh `:248`) va `fetchByPhone` birjoy rejimida stub (`birjoy.ts:157`) → `KAS_MODE=birjoy` da darvoza yemiriladi |
| §5.4 | Safarni tanga bilan to'lash — flag ortida, pilotda **O'CHIQ** | **QISMAN (bo'sh o'rinda)** | Mexanika ham, bayroq ham umuman yo'q (`grep -rn "safartanga\|payWithCoins\|tangaToFare" packages/server/src` → **0**). "Pilotda o'chiq" sharti yo'qlik hisobiga bajarilgan |
| §5.5 | 3 ta "YO'Q" metod A ichida yopiladi: `setClientBonus` · `addClientBonus` · `getBonusRules` | **YO'Q — uchalasi ham stub** | `birjoy.ts:228` · `:229` · `:230` — uchalasi ham `notImpl` |
| §5.5 | `RideHistoryItem.cashback` = o'sha safarda berilgan tanga | **YO'Q** | `birjoy.ts:198` `cashback: 0,  // tanga — A adds the per-ride award in 5c (§5.5)`. Xuddi shunday `getActiveBooking` da: `:171` `clientBonus: 0` |
| §5.6 | **B'ning parallel valyutasi tugatiladi** (`clients.balls` + `schema/loyalty.ts`) | **YO'Q — to'liq tirik** | `packages/db/src/schema/clients.ts:20` `balls`, `:21` `totalBalls`. `schema/loyalty.ts` da 6 jadval hali joyida: `ballLogs:21` · `referrals:41` · `shopItems:52` · `shopRedemptions:65` · `missions:77` · `missionProgress:90`. Jonli marshrutlar: `loyalty.controller.ts:26` — `GET shop` `:32` (**himoyasiz**), `GET missions` `:37` (**himoyasiz**), `POST shop/:id/redeem` `:82`, `POST missions/:id/claim` `:71`, `POST spin` `:107`. API'da `balls` — 9 faylda 57 marta |
| §5.8 | F0.5: B'da real mijoz `balls` bormi — tekshirilsin, kerak bo'lsa `CoinTxn` opening-balance bilan ko'chirilsin | **YO'Q** | Migratsiya skripti yo'q (`ls packages/server/src/scripts/ \| grep -iE "migrat\|balance"` → faqat aloqasiz `migrateBirjoySeller.ts`, `testAdminMoveBalance.ts`). Tekshiruv natijasi hech qayerda yozilmagan |
| §5.9 | Ega raqamlari N1 (safar tanga tezligi) · N2 (withdraw tezligi) · N3 (safar-to'lov) | **YO'Q** | Hech biri hech qayerda o'rnatilmagan; §5.9 jadvali "tavsiya" holicha qolgan |

### TANGA — bir jumlada

**Tanga daftarining o'zi mustahkam va tayyor (≤350 clamp, `CoinTxn`, idempotentlik, korp-ajratma —
hammasi ishlaydi va isbotlangan). Unga taxi safaridan olib boradigan yo'lning esa bitta ham
bo'g'ini qurilmagan: earn yo'li yo'q, idempotent kalit yo'q, 3 ta metod stub, B'ning raqib
valyutasi har safarda 5+10 ball chiqarib turibdi, va `KAS_MODE=birjoy` yoqilsa sweep umuman ishga
tushmaydi.** §5 — hujjatda eng batafsil yozilgan bo'lim va kodda eng kam bajarilgan bo'lim.

---

# II. FAZALAR F0–F6

| Faza | Qabul darvozasi (reja) | Status | Isbot | Nima yetishmaydi |
|---|---|---|---|---|
| **F0** — Audit | 3 hujjat, "80%" da'vosi tekshirilgan | **BAJARILGAN** | `TAXI_YADRO_AUDIT.md` · `KAS_PARITET.md` · `DRIVER_APK_AUDIT.md` · `TAXI_QAROR.md` diskda | — |
| **F0.5** — Zaxira + token + B-balls | `git bundle` · PAT revoke · `clients.balls` real/seed aniqlandi | **YO'Q (3/3 ochiq)** | Bundle yo'q: `find . -maxdepth 2 -name "*.bundle"` → **bo'sh**. PAT hali joyida: `1067-taxi/.git/config:13` da HTTPS remote ichida credential bor (qiymat chop etilmadi); ota-repo toza (`https://github.com/SarvarkhonH/1067-taxi-bot.git`). B-balls tekshiruvi hech qayerda yozilmagan | ⚠️ Xavf 4× oshgan: reja 8 commit degan edi, hozir **34** (`git log --oneline origin/main..HEAD \| wc -l` → 34). Oxirgi push `7d130ec` — **2026-05-01** |
| **F1-core** — P0-1..P0-6 | 6 P0 yopilgan, har biri isbot bilan | **BAJARILGAN 6/6** | P0-1 `dispatch.service.ts:653-658` + `operator/page.tsx:98-100,1404` · P0-2 `dispatch.service.ts:73-79` · P0-3 `socket.gateway.ts:66-75` + `location.service.ts:89-103` · P0-4 `orders.service.ts:210-222` · P0-5 `orders.service.ts:953-974` + `commissions.ts:38` + `dispatch.service.ts:183` · P0-6 `auth.service.ts:105,299,406` (`randomInt(100000, 1000000)` = 6 xona) + urinish-cheklovi `:86` (`MAX_ATTEMPTS`), sanoq `:94` | **Dasturning yagona to'liq yopilgan darvozasi** |
| **F1-bridge** — `BirJoySource` + tanga | 27/27 metod · `live`da bayt-bir xil · flag yoqilmagan · §5.7 invariantlar | **QISMAN — 1/4 mezon** | 27/27 → **8/27** (E1). Parity/regressiya testi → **0** (E2). Flag yoqilmagan → ✅ (`.env:10` `KAS_MODE=live`, default `mock` `env.ts:29`). §5.7 → yuqoridagi TANGA bo'limi | Ko'prik uchidan-uchiga bitta so'rov ham o'tkazmagan (`SERVICE_TOKEN` ikkala tomonda ham yo'q) |
| **F2** — Soya rejimi | 7 kun · 500+ buyurtma · >95% moslik · narx farqi <3% · 0 halokat | **YO'Q — bitta qator yozilmagan** | `grep -rniE "shadow\|soya\|dual.?write\|parallel.?compare\|mirrorBooking" packages/server/src --include=*.ts` → mos keladigan **0 natija** (chiqqanlar — `box-shadow`, "soya donasi" mahsulot nomi, aloqasiz izohlar) | Solishtiruv jurnali ham, ikki tomonlama yozuv ham, darvoza o'lchovi ham yo'q |
| **F3** — Ilova hardening + dala sinovi | K8 yopilgan · FCM tirik · 15 real safar · pul 3 joyda to'g'ri · batareya ≤25% · 4/5 "yaxshi" | **QISMAN — hardening 2/3, qolgan 0** | K8: proguard ✅ (`proguard-rules.pro:1-50`), imzo ✅ (`build.gradle.kts:49-58,82-85`), cleartext ❌ (`AndroidManifest.xml:41`). FCM ❌ (A1). Dala sinovi — hech qanday iz yo'q | Reja "F3 eng erta" degan edi (xavflar jadvali), lekin u faza boshlanmagan |
| **F4** — Onlayn-ulush hujumi + to'lqin | onlayn 16.5→40+ · rad <12% · `simEconomy` yashil | **YO'Q** | To'lqinli taklif yo'q (F2-satri). Onlayn-ulush **o'lchanmaydi** (H3, H4). Haydovchi motivatsiya ishi qilinmagan | Reja "asosiy 10x richagi" degan faza — boshlanmagan, va uni o'lchaydigan asbob ham yo'q |
| **F5** — Konsol + CTI + ratsiya | operator <20s · ilova ulush 10.6%→30% | **QISMAN — konsol qisman, CTI oqimi buzilgan, ratsiya 0** | Konsol: B jadvali (8/21). CTI: C jadvali — endpointlar bor, avtomatik karta **o'lik deep-link** (C3). Ratsiya: **0/4** (D jadvali). Operator vaqti o'lchanmaydi (H6). Mijozni ko'chirish xabari yo'q (`grep` → 0) | — |
| **F6** — Firibgarlik qalqoni | 5 xavfning har biri aniqlash + test | **YO'Q — 1/5** | `grep -rn "fraud" apps/api/src` → **0**. Faqat balans-manipulyatsiyasi yopilgan (G5). Qolgan 4 xavf: soxta GPS ❌ · soxta safar ❌ · ko'p akkaunt ❌ (ustunlar bor, ulanmagan) · sun'iy bekor ⚠️ (rate bor, alert/blok yo'q) | Test ham, ekran ham, jadval ham yo'q |

**Reja qoidasi:** *"oldingi darvoza yashil bo'lmaguncha keyingisi boshlanmaydi."* Amalda: F0.5
o'tkazib yuborilgan, F1-bridge tugamasdan (8/27) F2 ga o'tilmagan lekin F3 ning bir qismi
(hardening) qilingan, F5 ning bir qismi (konsol tuzatishlari) qilingan. Ya'ni **tartib ham
saqlanmagan** — ish "eng ko'zga tashlanadigan bug" bo'yicha ketgan, faza bo'yicha emas.

---

# III. JIMGINA TASHLAB KETILGAN

Bu bo'limdagi va'dalar **hech qachon boshlanmagan va hech qayerda qayta tilga olinmagan** —
`PROGRESS.md` da yo'q, commit xabarlarida yo'q, DoD hujjatlarida yo'q. Ular shunchaki yo'qolgan.

| # | Va'da (manba) | Isbot yo'qligiga | Nega muhim |
|---|---|---|---|
| 1 | **§5 TANGA birlashuvining butun 5c bosqichi** (`TAXI_BIRJOYSOURCE_DOD.md:31`) | `birjoy.ts:228-230` uchala metod ham `notImpl`; `birjoy.spec.ts` mavjud emas; DoD'da 5c hech qachon "done" belgilanmagan | Reja §5 ni "ipidan-ignasigacha" deb yozgan — u **butun boshli mahsulot qarori** edi |
| 2 | **`dispatchBookingId` id-fazo adapterini `main`ga kesib olish** (§4 jadvali, "tanga uchun HAYOTIY") | `grep -rn "dispatchBookingId" packages/` → **0**; faqat `acaa40cc` (tashlangan shoxobcha) | Usiz B order id'lari kas id'lari bilan to'qnashadi → ikki marta tanga yoki tanga berilmasligi |
| 3 | **`dispatchToBookingStatus` status lug'ati adapteri** (§4 — "20 test bilan qoplangan") | Faqat izoh sifatida mavjud: `birjoy.ts:165-166` *"A status-vocab adapter (dispatchToBookingStatus, salvaged per §4) is a follow-up"*. Kod yo'q | `getActiveBooking` xom B holatini (`pending`/`dispatching`) A'ning UI'siga uzatadi — mijoz notanish so'zlarni ko'radi |
| 4 | **F2 soya rejimi** (reja "eng qimmatli g'oyasi" degan) | `shadow\|dual.?write\|mirrorBooking` → **0** | Bu — jonliga chiqishdan oldingi yagona xavfsizlik darvozasi. U bo'lmasa F9 (kas'dan uzilish) ochilmaydi |
| 5 | **Ratsiya (PTT / LiveKit)** — ega qarori bergan | `livekit\|ptt\|walkie\|RECORD_AUDIO` → butun repo bo'yicha **0** | "Bu bozorda dispetcher va haydovchi gaplashadi (madaniy fakt)" deb yozilgan edi |
| 6 | **SIP telefoniya** — ega qarori bergan | `asterisk\|freeswitch\|sip\|twilio\|jssip` → `apps/api`, `apps/web`, `packages/server` — **hammasida 0** | Qo'ng'iroq 89.4% — bu asosiy kanal |
| 7 | **CTI avtomatik mijoz kartasi** — 20 soniya oqimining yuragi | `useSearchParams` → `apps/web/src` bo'yicha **0**; `autoLookup` → faqat ishlab chiqaruvchi qatori | Qurilgan, ulanmagan, va hech kim sezmagan. Popup "ishlaydi" ko'rinadi |
| 8 | **`git bundle` zaxirasi** (F0.5, "Qaytarib bo'lmaydi" xavfi) | `find . -name "*.bundle"` → bo'sh; unpushed **34** | Reja push qilishni ataylab taqiqlagan (`deploy.yml` main-push'da prod deploy qiladi) va bundle'ni yagona yo'l deb bergan. Ikkalasi ham qilinmagan |
| 9 | **GitHub PAT revoke** ("BUGUNOQ, qarorsiz") | `1067-taxi/.git/config:13` — credential hali URL ichida | `TAXI_QAROR.md §5` va `BIRJOY_TAXI_MASTER §X.1` da eng yuqori shoshilinch band edi |
| 10 | **§6 Contabo VPS'ga birlashtirish** (CI + DB) | `.github/workflows/deploy.yml:83-97` → **Render**; `:109-137` va `:143-176` → **Vercel**. `grep -rn "contabo\|vps\|rsync\|ssh-action\|169.58.55.249" .github/` → **0**. `render.yaml` hali `1067-taxi-api` + boshqariladigan Postgres e'lon qiladi; `vercel.json` hali `apps/client` ni deploy qiladi | Faqat APK base URL ko'chirilgan. Ya'ni `main`ga push qilinsa — **hech kim ishlatmaydigan hostlar yangilanadi**, va agar Render blueprint hali ulangan bo'lsa, **ikkinchi baza ustida ikkinchi API tirik** |
| 11 | **Reja qilingan "3 g'oya B'ga ko'chadi"** (§4 oxiri): to'lqinli taklif · `reject`≠`timeout` · `owndispatch` kill-switch | F2 · F3 · F4 satrlari — uchalasi ham 0 | Uchalasi bitta jumlada va'da qilingan, uchalasi ham unutilgan |
| 12 | **`@koson1067bot` mijoz oqimini o'chirish** (§7, ega qaroriga chiqarilgan savol #4) | `app.module.ts:49,139` shartsiz; `telegram.service.ts:1121-1183` to'liq tirik; bayroq yo'q | Ikkita bot bitta bozorda, ikkita mijoz identifikatori — reja aynan bundan ogohlantirgan |
| 13 | **Zanjirli buyurtma** (§V.F, "mashina qo'shmasdan samaraliroq") | `chainedOrder\|nextOrderOffer\|backToBack\|nearRideEnd` → **0** | Ta'minot cheklovini kod bilan yumshatadigan yagona g'oya edi |
| 14 | **Manzil katalogining bittalab testi** (§8.1, "fuzzy TAQIQ", "Halokatli" xavf) | `addresses.service.spec.ts` — 1 ta sof mock case; 99 ta real manzilning birortasi sinalmaydi | Reja buni "birinchi darajali xavf" deb belgilagan |
| 15 | **minSdk o'lchovi** (`driver_sessions.deviceModel/appVersion` dan taqsimot) | Ilova qurilma ma'lumotini umuman yubormaydi (`deviceId\|Build.MODEL` → **0**) → ustunlar NULL | O'lchov bazasi bo'sh bo'lgani uchun qaror **hech qachon qabul qilinmaydi** |

---

# IV. 50 CASE — QAYSILARI QOPQONDA

Reja: *"Har biri test bo'ladi."* Bugungi holat: **50 case'dan birortasi ham avtomatik test bilan
qoplanmagan.** Quyida vakillik namunasi (28 case) kodga qarshi tekshirildi.

**QOPQON = case "bajarilgan" ko'rinadi (jadval, ustun, endpoint yoki UI bor), lekin ish
yo'lining bir bo'g'ini uzilgan.** Bular eng xavflisi.

## V1 — Buyurtma hayot sikli

| # | Case | Status | Isbot / qopqon |
|---|---|---|---|
| 1 | Liniyada haydovchi yo'q → rost, navbatda qoladi, operator ko'radi | **BAJARILGAN** | `dispatch.service.ts:653-658` + `operator/page.tsx:1404-1417` |
| 2 | Hech kim qabul qilmadi → doira kengaysin, o'lmasin | **BAJARILGAN** | Radius ladder `dispatch.service.ts:455-459` + sweep `:73-79` + rescue |
| 3 | Qabul→bekor → darhol qayta tarqatiladi | **🪤 QOPQON** | Qayta tarqatish kodi bor (`orders.service.ts:474-486`), lekin `MAX_REDISPATCH=3` va `maxAttempts=5` **bitta ustunni** baham ko'radi (F12). 3+ taklifdan keyin qabul qilingan buyurtmada byudjet allaqachon tugagan → qayta tarqatish **hech qachon ishlamaydi** |
| 4 | Yetib keldi, chiqmadi → bepul kutish → kutish tarifi → bekor | **🪤 QOPQON** | Admin sozlama ekranida `wait_free_minutes` / `wait_per_minute_uzs` ko'rinadi va tahrirlanadi (`pricing/page.tsx:109-110`), lekin **hech kim o'qimaydi** (F13). Operator "sozladim" deb o'ylaydi, narx o'zgarmaydi |
| 5 | Mijoz ketdi → bekor + kompensatsiya | **QISMAN** | Bekor jarimasi real: `safety/cancellation.service.ts:35`, qoidalar `schema/safety.ts:93`. Mijozga kompensatsiya qoidasi yo'q |
| 6 | GPS yo'qoldi → oxirgi nuqtadan davom, taximetr to'xtamaydi | **YO'Q** | `grep -rniE "gpsLost\|lastKnown\|staleLocation" apps/driver-android/.../--include=*.kt` → **0** |
| 7 | Ilova o'ldi → tiklanadi, taximetr saqlanadi | **YO'Q** | A10: `HomeViewModel.kt:404-431` bepul-kutishni tiklaydi, taximetrga tegmaydi → nolga tushadi |
| 8 | Pul bermadi → haydovchi belgilaydi, operator ko'radi | **YO'Q** | `grep -rniE "notPaid\|unpaid\|payment_failed\|paymentStatus" apps/api/src/modules/orders` → **0** |
| 9 | Dublikat buyurtma (2 daqiqa oynasi) | **🪤 QOPQON** | Reja "K6 — idempotent kalit" deb belgilagan, lekin K6 **komissiya** idempotentligi (`orders.service.ts:954`), buyurtma emas. Buyurtma yaratishda dublikat qorovuli **yo'q** — `duplicate\|recentOrder\|alreadyHasActive` → 0. Case "bajarilgan" deb belgilanishi mumkin edi, aslida boshqa narsa qilingan |
| 11 | Osilib qoldi → sweep. "8 soat = 0" | **QISMAN** | Sweep BAJARILGAN (`dispatch.service.ts:73-79`), "8 soat = 0" o'lchovi YO'Q (H/F17). ⚠️ `sla_violations` jadvali bor, `modules/sla/` **bo'sh katalog** |
| 12 | Rejalashtirilgan → 15 daq oldin | **BAJARILGAN** | `scheduled-rides.service.ts:44,99-108` |
| 13 | Shahar tashqarisi → alohida tarif | **🪤 QOPQON** | Modul, jadval, narx, endpointlar bor — lekin `createIntercityOrder` **dispatch'ni chaqirmaydi** (`intercity.service.ts:53-77`) va UI yo'q. Buyurtma yaratiladi va o'tirib qoladi |
| 14 | Ko'p to'xtash — "`order_stops` bor" | **🪤 QOPQON** | Jadval rostdan bor (`schema/safety.ts:148-163`) — reja "bor" deb belgilagan. Lekin **butun kodda boshqa hech qayerda ishlatilmaydi** (grep → 1 natija, ta'rifning o'zi) |

## V2 — Haydovchi ilovasi

| # | Case | Status | Isbot / qopqon |
|---|---|---|---|
| 15 | OEM o'ldirdi → FCM uyg'otadi | **🪤 QOPQON** | Ikkala tomonda ham kod ko'rinadi (server `dispatch.service.ts:291`, ilova `TaxiFirebaseMessagingService.kt:41`) — lekin `google-services.json` yo'qligi butun zanjirni jimgina uzadi (A1/A2). **Bu — auditning eng xavfli qopqoni** |
| 16 | Internet uzildi → offline navbat | **🪤 QOPQON** | Uchala funksiya yozilgan (`DataStore.kt:154,157,159`), chaqiruvchi **0**; UI ham `queuedCount = 0` bilan qotirilgan |
| 17 | GPS o'chiq → onlayn bloklanadi | **YO'Q** | `gpsEnabled\|isLocationEnabled\|requireLocation` → **0** |
| 18 | Batareya tejash → ogohlantirish + OEM yo'riqnoma | **QISMAN** | AOSP batareya so'rovi bor (`PermissionsScreen.kt:144,278-284`), OEM yo'riqnomasi yo'q (A6) |
| 19 | Eski telefon (Android 5-7) | **YO'Q** | `minSdk = 26` (`build.gradle.kts:31`); o'lchov ma'lumoti yig'ilmaydi (A13/G4) |
| 21 | Ikki telefon → oxirgi kirish g'olib | **🪤 QOPQON** | `deviceId` ustuni bor (`schema/auth.ts:46`) va server DTO qabul qiladi — lekin ilova yubormaydi va eski sessiya bekor qilinmaydi. "Qurilma bog'lash bor" degan taassurot yolg'on |
| 22 | Soxta GPS → aniqlash + bloklash | **YO'Q** | G1/G2 |
| 23 | Fonda taklif → overlay | **YO'Q** | A11 |
| 25 | Ovoz o'chiq → tebranish + ekran yonadi | **QISMAN** | Tebranish sozlamasi bor (`DataStore.kt:25-44`), `setShowWhenLocked` **yo'q** (A11) |
| 26 | Qayta yoqildi → BootReceiver | **🪤 QOPQON** | Ruxsat manifestda bor (`AndroidManifest.xml:28`) — ya'ni "qilingan" ko'rinadi. Receiver klassi yo'q (A5) |

## V3 — Pul (tanga)

| # | Case | Status | Isbot / qopqon |
|---|---|---|---|
| 27 | Balans yetmaydi | **BAJARILGAN** | `dispatch.service.ts:183` `gte(drivers.balanceUzs, minDispatchBalance)` |
| 28 | Qarz oshdi → **onlayn bloklanadi** | **QISMAN** | Xuddi shu filtr **dispatch'ni** to'sadi, "onlayn"ni emas — haydovchi onlayn turaveradi, taklif olmaydi. Boshqacha his |
| 29 | Ikki marta yozildi | **BAJARILGAN** | `commissions.ts:38` `uniqueIndex(orderId, type)` + `orders.service.ts:953-974` tranzaksiya |
| 30 | Bekor komissiyasi — kim bekor qildi | **BAJARILGAN** | `cancellation.service.ts:37` `cancelledBy`, qoida `:74`, yozuv `:108` |
| 31 | Mijoz tanga bilan to'laydi (≤350, `CoinTxn`, korp-ledger) | **YO'Q** | Mexanika umuman yo'q (§5.4) |
| 32 | To'lov tasdiqlanmadi → kutish holati | **YO'Q** | Case 8 bilan bir xil — to'lov holati modeli yo'q |
| 33 | Migratsiyada balans farq → **o'tish to'xtaydi** | **YO'Q** | Migratsiya skripti ham, tiyingacha solishtiruv ham yo'q (§5.8) |

## V4–V6 — Operator, tizim, xavfsizlik

| # | Case | Status | Isbot / qopqon |
|---|---|---|---|
| 34 | Raqam tanilmadi → yangi karta | **🪤 QOPQON** | Server yarmi ishlaydi (`operator-phones.controller.ts:124-129`, `client/quick` `:39`), lekin raqam operator sahifasiga **yetib bormaydi** (C3) — operator qayta yozadi |
| 35 | Ikki qo'ng'iroq → qizil | **YO'Q** | C6 — qizil holat mavjud emas |
| 36 | Qo'lda tayinlash → audit | **🪤 QOPQON** | `AuditService` mavjud va 2 joyda ishlatiladi — ya'ni "audit bor". Lekin `manualAssign` faqat `logger.log` qiladi (`dispatch.service.ts:440`), `adminId` tashlab yuboriladi |
| 39 | Smena tugadi → o'tadi | **YO'Q** | C8 |
| 40 | Server yiqildi → alert + restart | **BAJARILGAN** | `main.ts:131-156` (ntfy + Telegram), `health-alerter.service.ts:52,77,143,172`, Sentry `main.ts:5-21`, `restart: unless-stopped` `docker-compose.prod.yml` |
| 41 | Baza sekin → navbat | **QISMAN** | BullMQ bor (`dispatch.module.ts:16`), lekin sekin-so'rov detektori yo'q — `checkDatabase()` faqat `SELECT 1` ikkilik javob (`health-alerter.service.ts:151-158`) |
| 43 | Deploy → graceful | **YO'Q** | `grep -rn "enableShutdownHooks\|SIGTERM\|onApplicationShutdown" apps/api/src packages` → **1 natija, u ham dev-yordamchi** `dev-server.ts:73`. `main.ts` `bootstrap()` `:69-129` da `enableShutdownHooks` yo'q. Dockerfile'da `STOPSIGNAL`/`tini` yo'q | SIGTERM uchayotgan so'rovlarni, socketlarni va BullMQ ishlarini drain'siz o'ldiradi |
| 42/44/45 | Soyada kas javob yo'q / rozlashmadi / katalog ko'chmadi | **YO'Q (bekor)** | F2 umuman yo'q — soya rejimi bo'lmagani uchun bu 3 case sinab bo'lmaydi |
| 46 | Akkaunt o'g'ri → qurilma bog'lash | **YO'Q** | G7 |
| 48 | GPS iz muddat bilan o'chadi | **🪤 QOPQON (bo'sh o'rinda "bajarilgan")** | Iz jadvali umuman yo'q; Redis 30s TTL (`location.service.ts:14,63-69`). Va'da "bajarilgan" ko'rinadi, ammo forenzika qobiliyati mavjud emas |
| 49 | Ovoz → yashirin tinglash YO'Q | **BEKOR** | D yo'q → ovoz yozilmaydi. Bu case'ni "done" deb belgilash MUMKIN EMAS |
| 50 | Hujjat muddati → ogohlantirish → bloklash | **🪤 QOPQON** | `getExpiringDocuments` + `GET /expiring` bor (`driver-documents.service.ts:215`, `.controller.ts:104`) — "bor" ko'rinadi. UI iste'molchisi **0**, cron **0**, `'expired'` hech qachon qo'yilmaydi |
| ⚠️K7 | OTP 6 xona + throttle | **BAJARILGAN** | `auth.service.ts:105,299,406` `randomInt(100000, 1000000)`; urinish cheklovi `:86` `if (otp.attempts >= MAX_ATTEMPTS)`, sanoq `:94`. ⚠️ Lekin yonida dev-OTP hali operatorlarga emit qilinadi va ochiq matnda log qilinadi (`auth.service.ts:46-51,146,329`) |

**Qopqonlar jamlanmasi (bu namunada 13 ta):** 3 · 4 · 9 · 13 · 14 · 15 · 16 · 21 · 26 · 34 · 36 ·
48 · 50. **Umumiy naqsh:** jadval/ustun/endpoint/ruxsat mavjud, **iste'molchisi yo'q**. Har biri
"bajarilgan" deb belgilanishi mumkin bo'lgan turdagi va'da — CLAUDE.md ning R3 qoidasi (tor grep
"o'tdi" degan bug) aynan shu naqshdan chiqqan edi.

---

# V. DA'VO vs HAQIQAT — YOPILISH JADVALI (CLAUDE.md R5)

| Element | Kodda? | Jonli? | Bayroq ortida? | Nima bilan isbot | Gap |
|---|---|---|---|---|---|
| F1-core 6 P0 | ✅ | ⚠️ push qilinmagan | yo'q | `dispatch.service.ts:73-79,183,455-459,653-658` · `orders.service.ts:210-222,953-974` | 34 commit `origin/main` da yo'q → jonli VPS'da bu kod **yo'q** |
| FCM server yarmi | ✅ | ⚠️ push qilinmagan | yo'q | `dispatch.service.ts:291` | Ilova yarmi yo'q → amalda 0 |
| `BirJoySource` | qisman (8/27) | ❌ | `KAS_MODE` env (flag emas) | `birjoy.ts:83-230` · `.env:10` `KAS_MODE=live` | Testsiz; `SERVICE_TOKEN` ikkala tomonda yo'q |
| Tanga birlashuvi | ❌ | ❌ | — | `birjoy.ts:171,198,228-230` | 5c hech qachon boshlanmagan |
| B'ning `balls` valyutasi | ✅ | ✅ **JONLI** | bayroq yo'q | `orders.service.ts:264,317` · `clients.service.ts:130-134` · `gamification.service.ts:36,103` | §5.6 uni tugatishni buyurgan edi |
| B'ning mijoz bot oqimi | ✅ | ✅ **JONLI** | bayroq yo'q | `app.module.ts:49,139` · `telegram.service.ts:1121-1183` · `1067-taxi/.env:17` | §7 uni o'chirishni buyurgan edi |
| Soya rejimi (F2) | ❌ | ❌ | — | qidiruv 0 natija | — |
| Ratsiya (D) | ❌ | ❌ | — | qidiruv 0 natija | — |
| Firibgarlik (G) | ❌ | ❌ | — | `grep "fraud" apps/api/src` → 0 | — |
| CI deploy VPS'ga (§6) | ❌ | Render/Vercel | — | `.github/workflows/deploy.yml:92,132,169` | APK esa VPS'ga qaraydi → nomuvofiqlik |
| PAT revoke | ❌ | — | — | `1067-taxi/.git/config:13` | "BUGUNOQ" bandi 2 kun ochiq |
| PROGRESS.md yozuvi | ❌ | — | — | `grep "F1-bridge\|BirJoySource" PROGRESS.md` → 0 tegishli natija | R7 buzilgan |

---

# VI. AGAR BITTA NARSA QILINSA

Bu audit tavsiya bermaydi, lekin bitta fakt boshqa hammasidan ustun turadi va uni yozmaslik
noto'g'ri bo'lardi: **34 commit — butun F1-core, butun ko'prik, butun ilova ishi — bitta diskda,
zaxirasiz.** `git bundle` 2 daqiqa oladi, yon ta'siri nol, va `deploy.yml` ni tetiklamaydi. Reja
buni 2026-09-08 da "bugunoq" deb yozgan edi; 2026-09-10 da hali bajarilmagan, xavf esa 8 dan 34
commit'ga o'sgan.

---

*Har da'vo `fayl:qator` yoki natijasi bo'sh qidiruv bilan isbotlangan. Yugurtirilmagan narsa:
build, test, typecheck, emulator, VPS, jonli baza — hech biriga tegilmadi (statik audit). Ya'ni
"jonli holat" haqidagi yagona dalilim — `EXPECTED_ON` ro'yxati, `.env` qiymatlari va git holati.*
