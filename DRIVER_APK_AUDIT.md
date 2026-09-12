# DRIVER APK AUDIT — `apps/driver-android`

**Auditor:** Android auditor sub-agent · **Sana:** 2026-09-08
**Qamrov:** `1067-taxi/apps/driver-android` — 51 Kotlin fayl / 12 745 qator, `AndroidManifest.xml`,
`app/build.gradle.kts`, `gradle/libs.versions.toml`, `gradle.properties`, `network_security_config.xml`,
plus backend tekshiruvi (`1067-taxi/apps/api/src/modules/{socket,dispatch,notifications}`).
**Metod:** faqat fayl o'qish. Gradle build qilinmadi, emulator ochilmadi, kod tegilmadi.

---

## 1. BIR JUMLADA

Ilova **ekran darajasida haqiqatan yozilgan va sifatli** (prototip emas — 51 fayl, real Retrofit/Socket.IO/
Hilt, real MVI, 229 ta tarjima satri ×2 til), lekin **butun buyurtma-qabul mexanikasi UI qatlamiga bog'langan**:
socket faqat `HomeViewModel.kt:316` dan ulanadi, taklif oynasi faqat `HomeScreen.kt:196` da chiziladi, FCM
esa mijoz tomonda ham server tomonda ham **umuman ishlamaydi** — ya'ni ilova fonga o'tib process o'lsa,
haydovchi "Online" bildirishnomasini ko'rib turib buyurtma olmaydi, bu esa aynan raqibning zaifligi.
Real telefonda ishonchli ishlaydigan holatgacha — **~22–26 ish kuni** (1 muhandis), boshqa sessiyaning
"~1 hafta" bahosidan **4–5 barobar** ko'p.

**Tayyorlik:** funksional/UI qatlami ~85% · fon-ishonchlilik qatlami ~30% · prod-hardening ~20% →
**umumiy ~55%**.

> ⚠️ Eng muhim yagona fakt: `grep -rn "socket\.connect"` butun `app/src` bo'ylab **bitta** natija beradi —
> `ui/home/HomeViewModel.kt:316`. `LocationForegroundService` socketni **hech qachon ulamaydi**
> (`service/LocationForegroundService.kt:42` da faqat `@Inject` qiladi va `updateLocation` chaqiradi).

---

## 2. EKRANLAR JADVALI

Har satr: `fayl:qator` isboti bilan. "To'liq" = real API/socket ga ulangan, holat boshqariladi,
xato holati bor.

| # | Ekran / komponent | Fayl | Qator | Holat | Isbot |
|---|---|---|---|---|---|
| 1 | **Onboarding** (3 slayd) | `ui/onboarding/OnboardingScreen.kt` | 144 | ✅ To'liq | 3 ta real vektor illustratsiya (`res/drawable/illust_onboarding_*.xml`), `MainActivity.kt:163-172` da `setOnboarded(true)` yozadi |
| 2 | **Auth (telefon + OTP)** | `ui/auth/AuthScreen.kt` + `AuthViewModel.kt` | 613 + 150 | ✅ To'liq | `AuthViewModel.kt:82` `sendOtp`, `:106` `verifyOtp`, `:110` token saqlash; `:123-139` — IOException/400/401/404/429/5xx uchun **alohida o'zbekcha xabar** (kam uchraydigan sifat) |
| 3 | **SMS Retriever (avto-OTP)** | `ui/auth/SmsRetrieverEffect.kt` | 59 | ✅ To'liq | `BroadcastReceiver` `:34`, API 33 guard `:48` |
| 4 | **Permissions** | `ui/permissions/PermissionsScreen.kt` | 287 | ✅ To'liq | FINE/COARSE `:126-127`, BACKGROUND_LOCATION `:132`, POST_NOTIFICATIONS `:137`, **batareya optimizatsiyasi** `:144`; SDK guard'lar `:265,:272` |
| 5 | **Home (xarita + chrome)** | `ui/home/HomeScreen.kt` | 532 | ✅ To'liq | Xarita `:101`, status bar, bottom panel, SOS `:187`, offer `:195`, ride sheet `:170`, chat `:227` |
| 6 | **Xarita** | `ui/home/DriverMapView.kt` | 444 | ✅ To'liq | `GoogleMap` `:204`, Play Services fallback tekshiruvi `:103-106`, heatmap, bearing marker |
| 7 | **Offer popup** | `ui/offer/OfferPopup.kt` | 785 | ⚠️ To'liq-lekin-noto'g'ri-joyda | Swipe-to-accept `:571`, countdown ring `:246`, 5s ogohlantirish `:108-121`. **Lekin faqat `HomeScreen.kt:196` ichida** — 3-bo'limga qarang |
| 8 | **Active ride sheet** | `ui/ride/ActiveRideSheet.kt` | 778 | ✅ To'liq | `onArrived:228`, `onStart:232`, `onComplete:236`, `onCallClient:244` (real `ACTION_DIAL`), `onNavigate:250`, `onChat:261`, `onCancel:262` |
| 9 | **Cancel reason sheet** | `ui/ride/CancelReasonSheet.kt` | 190 | ✅ To'liq | Radio + erkin matn, `HomeIntent.CancelOrder(reason)` `ActiveRideSheet.kt:274` |
| 10 | **Chat (mijoz bilan)** | `ui/home/ChatSheet.kt` | 354 | ✅ To'liq | `api.getChatMessages` + `sendChatMessage` (`HomeViewModel.kt:257,:274`), socket echo dedupe `:277` |
| 11 | **Ride completed** | `ui/home/RideCompletedScreen.kt` | 311 | ✅ To'liq | `RideCompletionSummary` real DTO (`ApiService.kt:153-165`) |
| 12 | **After-shift summary** | `ui/earnings/AfterShiftSummary.kt` | 267 | ⚠️ Yarim | Ishlaydi, lekin `comparePct = null` qattiq yozilgan — "kechagi bilan solishtirish" bloki hech qachon chiqmaydi (`HomeViewModel.kt:481`, izohda tan olingan) |
| 13 | **Earnings** | `ui/earnings/EarningsScreen.kt` + VM | 757 + 204 | ✅ To'liq | Kun/hafta/oy bucket'lash `EarningsViewModel.kt:123-195`, real grafik |
| 14 | **Ballar (gamifikatsiya)** | `ui/balls/BallsScreen.kt` + VM | 842 + 58 | ⚠️ Yarim | `api.getGamificationSummary()` real (`BallsViewModel.kt:51`), lekin "hammasini ko'rish" tugmasi o'lik — `BallsScreen.kt:427` `onClick = { /* placeholder */ }` |
| 15 | **Profile** | `ui/profile/ProfileScreen.kt` + VM | 645 + 181 | ⚠️ Yarim | Real profil/hujjat yuklash, lekin **"Avtomobilni tahrirlash" o'lik** — `ProfileScreen.kt:93` `onEdit = { /* placeholder */ }` |
| 16 | **Documents (upload)** | `ui/documents/DocumentsScreen.kt` | 262 | ✅ To'liq | Real fayl tanlash `:44-50` (`GetContent`), base64 upload `ProfileViewModel` → `ApiService.kt:92` |
| 17 | **Settings** | `ui/settings/SettingsScreen.kt` | 445 | ⚠️ Yarim | Til/mavzu/ovoz real; **"Shartlar" va "Maxfiylik" o'lik** — `:229` va `:236` ikkalasi `/* placeholder */` |
| 18 | **SOS** | `ui/safety/SosFab.kt` | 216 | ✅ To'liq | 2s bosib ushlash, `api.triggerSOS` `HomeViewModel.kt:678`, backend yiqilsa ham dialog ochiladi `:686` (to'g'ri qaror) |

**Xulosa:** **qobiq/stub ekran YO'Q.** Barcha 18 ekran real ma'lumot bilan ishlaydi. Faqat **5 ta o'lik
tugma** bor (Ballar "hammasi", Profil "avto tahrir", Settings ×2, `AfterShiftSummary` comparePct) —
bu `DIZAYN_QOIDALARI.md` ning "yozuv harakat va'da qilsa tugma shart" qoidasini buzadi, lekin arxitektura
muammosi emas.

### Tarmoq qatlami
- **Retrofit** `di/AppModule.kt:96-102`, kotlinx-serialization converter, **23 ta endpoint** (`ApiService.kt:11-95`).
- **Base URL** `build.gradle.kts:25-26` (release) → `https://one067-taxi-api.onrender.com/api/v1`;
  debug `:39-41` → `http://$DEV_API_HOST:4000` (`gradle.properties:15` = `192.168.100.4`).
- **Bearer interceptor** `AppModule.kt:47-55`; **401 avto-refresh** `:59-86` — to'g'ri yozilgan
  (alohida `OkHttpClient()` bilan cheksiz sikl oldi olingan `:71`).
  ⚠️ Lekin token'ni **regex bilan** ajratadi (`:75`) — mo'rt, va `runBlocking` interceptor ichida (`:48`).
- **Socket** `service/SocketManager.kt` — `io.socket:socket.io-client:2.1.0`, `/ws` namespace `:67`,
  auth token bilan `:61`. Server bilan **to'liq mos**: `apps/api/src/modules/socket/socket.gateway.ts:95`
  (`driver:join`), `:122`, `:156`, `:177`, `:194`, `:263` (`booking:offer`), `:276`.
- **Holat boshqaruvi:** MVI. `HomeUiState` (`HomeViewModel.kt:33-92`) — safar holati **faqat shu yerda**,
  ya'ni `ViewModel` xotirasida. Diskda faqat: `is_online`, `pending_offer_json`, `free_wait_started_at`
  (`util/DataStore.kt:29,33,44`).

---

## 3. FON REJIMI — 10 QATOR

| # | Xususiyat | Holat | Fayl:qator | Izoh |
|---|---|---|---|---|
| 1 | **Foreground Service** `type="location"` | ✅ **BOR** | `AndroidManifest.xml:68-72`; `service/LocationForegroundService.kt:40` | `stopWithTask="false"` `:71` — Recents'dan surib tashlansa ham servis qoladi. `PARTIAL_WAKE_LOCK` `:116`. Bu qism **yaxshi yozilgan**. |
| 2 | **START_STICKY** | ⚠️ **BOR, LEKIN BEHUDA** | `LocationForegroundService.kt:82` | Kod bor. Lekin restart'da process yangi → `SocketManager` (`@Singleton`, `:19-20`) qayta tug'iladi, `socket = null`. `onStartCommand` GPS'ni yoqadi, `updateLocation` chaqiradi → `SocketManager.kt:129` `if (socket?.connected() != true) return` → **jimgina tashlab yuboriladi**. Haydovchi "Online" bildirishnomasini ko'radi, dispetcher uni ko'rmaydi. |
| 3 | **WorkManager qorovul** | ❌ **YO'Q** | — | `build.gradle.kts:72-132` da WorkManager dependency yo'q; `grep -rn "WorkManager" app/src/main` = **0 natija**. |
| 4 | **BootReceiver** | ❌ **YO'Q** | `AndroidManifest.xml:28` | `RECEIVE_BOOT_COMPLETED` **ruxsati e'lon qilingan, lekin `<receiver>` yo'q** — manifestda faqat 1 activity + 2 service (`:53-81`). Release manifest-merger hisoboti tasdiqlaydi: faqat kutubxona receiver'lari (Firebase, profileinstaller, datatransport). **Bu "o'lik ruxsat" — tayyordek ko'rinadi, aslida yo'q.** Telefon qayta yoqilsa haydovchi offline qoladi. |
| 5 | **FCM push (yuqori-ustuvor)** | ❌ **KOD BOR — IKKALA TOMONDA HAM O'LIK** | quyida | **Eng jiddiy topilma.** 3 ta mustaqil uzilish: |
| | | | `service/TaxiFirebaseMessagingService.kt:41` | (a) Servis yozilgan va manifestda ro'yxatdan o'tgan (`:75-81`), dependency bor (`build.gradle.kts:120-121`) |
| | | | `app/build.gradle.kts:1-8` | (b) **`com.google.gms.google-services` plagini QO'LLANMAGAN** va `google-services.json` **repoda umuman yo'q** (`find . -name "google-services.json"` = bo'sh). Natija: release resurslarida `google_app_id` yo'q (merged `values.xml` tekshirildi) → `FirebaseApp` **hech qachon initsializatsiya bo'lmaydi** → token olinmaydi, xabar kelmaydi. |
| | | | `apps/api/.../notifications.service.ts:36` | (c) **Server ham yubormaydi.** `sendToDriver()` mavjud va `firebase-admin` o'rnatilgan (`package.json:38`), lekin butun `src/` bo'ylab uni **faqat `notifications.controller.ts` chaqiradi** — `dispatch.service.ts` va `orders.service.ts` faqat `TripNotificationsService` (Telegram) ishlatadi. Ya'ni buyurtma tarqatilganda **FCM push hech qachon jo'natilmaydi**. |
| 6 | **WebSocket + heartbeat + backoff** | ⚠️ **YARIM** | `SocketManager.kt:60-65` | Kutubxona darajasida bor: engine.io o'zining ping/pong heartbeat'i + `setReconnection(true)` `:63`, `setReconnectionDelay(1000)` `:64` (socket.io default `reconnectionDelayMax=5000` + randomizatsiya). **Lekin:** `reconnectionDelayMax` sozlanmagan; ilova darajasida "tirikmi?" tekshiruvi yo'q; va eng muhimi — **`connect()` faqat `HomeViewModel.kt:316` dan chaqiriladi**. Process o'lsa, qayta ulanuvchi hech kim yo'q. |
| 7 | **Polling zaxirasi** | ❌ **YO'Q** | — | Yagona davriy so'rov — heatmap 60 s (`HomeViewModel.kt:501-512`). Buyurtma uchun poll yo'q. REST orqali tiklanish faqat **ilova ochilganda bir marta** (`recoverActiveRideFromRest`, `:345`). |
| 8 | **Offline navbat** | ❌ **YO'Q** | `SocketManager.kt:129,140-153` | `updateLocation` uzilganda jimgina tashlaydi (`:129`). **Undan battari:** `setStatus` `:140`, `acceptOffer` `:145`, `rejectOffer` `:150` — **umuman ulanish tekshirmaydi**. Socket `null` bo'lsa (restart'dan keyin) `socket?.emit` jimgina yo'qoladi → **haydovchi "Qabul qildim" deb suradi, hech narsa jo'namaydi, xato ham ko'rsatilmaydi.** ⚠️ `DataStore.kt:154-161` da `savePendingOfferQueue`/`getPendingOfferQueue`/`clearPendingOfferQueue` yozilgan — **hech qayerdan chaqirilmaydi, o'lik kod**. |
| 9 | **Safar holatini tiklash** | ⚠️ **YARIM — taximetr NOLGA TUSHADI** | `HomeViewModel.kt:345-390` | Yaxshi qism: `/orders/my` dan faza tiklanadi (`:354-358`), kutish taymeri epoch'dan tiklanadi (`:385-388`, `:563-574`), yangi taklif ham (`:392-409`). **Lekin:** `taxiDistanceKm` faqat `HomeUiState` da (`:64`), **hech qachon diskka yozilmaydi**. Tiklanishda `IN_PROGRESS` bo'ladi-yu masofa `0.0` dan boshlanadi → ko'rsatilayotgan haq minimal 8000 ga qaytadi. **Egaga javob: YO'Q, taximetr davom etmaydi.** (Pul xavfsiz — asosiy hisob backendda, `orders.service.ts:109`; muammo haydovchi ishonchida.) |
| 10 | **OEM batareya yordamchisi** | ⚠️ **YARIM** | `ui/permissions/PermissionsScreen.kt:144,:282` | AOSP qismi **bor**: `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` so'raladi `:144`, holati tekshiriladi `:282`, ruxsat e'lon qilingan (`Manifest:30`). **Lekin OEM autostart yo'q** — `grep -rn "MIUI\|Xiaomi\|oppo\|vivo\|huawei\|autostart"` butun `app/src` bo'ylab **0 natija**. O'zbekistonda haydovchilarning ko'pi Xiaomi/Redmi/Oppo/Vivo ishlatadi; ularda AOSP whitelist **yetarli emas**, alohida "Autostart" ekraniga olib borish kerak. |

### Yig'indi: **2 to'liq · 3 yarim · 5 yo'q**

### Fon rejimining haqiqiy uzilish zanjiri (eng muhim xulosa)

```
Haydovchi ilovani Recents'dan suradi (yoki Android xotira uchun o'ldiradi)
   ↓
MainActivity yo'q qilinadi → HomeViewModel.onCleared() (HomeViewModel.kt:768)
   ↓
observeSocketEvents() kollektorlari o'ladi (:689-736)
   ↓
LocationForegroundService TIRIK qoladi (stopWithTask=false, Manifest:71)
   → "1067 Taxi — Online" bildirishnomasi ko'rinib turadi (:146)
   → GPS oqadi (agar process hali tirik bo'lsa socket ham tirik)
   ↓
Process o'lsa: START_STICKY servisni tiklaydi, LEKIN socket.connect() ni
hech kim chaqirmaydi (yagona chaqiruv: HomeViewModel.kt:316)
   ↓
booking:offer keladi → kollektor yo'q → JIMGINA YO'QOLADI
FCM zaxirasi yo'q (5-qator) · polling zaxirasi yo'q (7-qator)
   ↓
NATIJA: haydovchi telefonida "Online" yozuvi turadi, buyurtma kelmaydi.
```

Bu **aynan raqibning zaifligi** (`push yo'q → ilova o'ldirilsa buyurtma yo'q`) — hozircha biz ham
**xuddi shu holatdamiz**, faqat boshqa sabab bilan.

---

## 4. RAQIB BILAN SOLISHTIRISH

Sizning `uz.kas1067.driver` v12.8 razborkangizga qarshi.

| O'lcham | Kas1067 v12.8 | Bizniki v2.0.0 | Kim oldinda |
|---|---|---|---|
| Komponentlar soni | 11 ta activity/service | 18 ekran + 4 servis, 12 745 qator | **Biz** (funksional kenglik) |
| **Push (FCM)** | ❌ Yo'q (`FirebaseMessagingService` nol moslik) | ❌ Kod bor, **ishlamaydi** (§3 #5) | **Durang — ikkalasi ham nol** |
| Transport | `io.netty` + okhttp WebSocket | socket.io-client 2.1.0 | Durang (ikkalasi ham WS) |
| **Overlay taklif** | ✅ `SYSTEM_ALERT_WINDOW` bor | ❌ Ruxsat ham yo'q (§5) | **Raqib** |
| **Fon barqarorligi** | Overlay + `ACCESS_BACKGROUND_LOCATION` + `QUERY_ALL_PACKAGES` | FGS + wake lock, lekin socket restart'da tiklanmaydi | **Raqib** (amalda) |
| Xarita | ❌ Yo'q (faqat base/location/tasks) | ✅ Google Maps + heatmap | Biz (lekin §6 — kerakmi?) |
| minSdk | **21** (Android 5.0) | **26** (Android 8.0) | **Raqib** (qamrov kengroq) |
| Server xavfsizligi | `http://46.8.176.53/` — **shifrlanmagan** | `https://…onrender.com` — TLS | **Biz** |
| Cleartext | Ochiq (HTTP) | ⚠️ `usesCleartextTraffic="true"` (`Manifest:41`) + global cleartext (`network_security_config.xml:7`) — **biz ham ochiq qoldirganmiz** | Durang |
| PTT / ovozli aloqa | ✅ `RECORD_AUDIO` | ❌ Yo'q (o'rniga matnli chat) | Raqib (agar haydovchilar ishlatsa) |
| Buyurtma e'loni | Overlay | 🔊 Ringtone + **TTS o'zbekcha manzil aytadi** (`OfferSoundService.kt:171`) + vibratsiya | **Biz** (agar ilova oldinda bo'lsa) |
| UX sifati | Eski Android View | Compose + design tokens + haptics + skeleton | **Biz** |

**Qisqasi:** biz **funksiya va sifatda ancha oldinda**, lekin egaga va'da qilingan yagona narsada —
**"fon rejimida 10× ishonchli"** — hozircha **ortdamiz**, chunki raqibda hech bo'lmasa overlay bor
va minSdk 21 ko'proq telefonni qamraydi. Bizning ustunlikka aylanadigan yagona qurol — **FCM** —
hozir ikkala tomonda ham o'chiq.

---

## 5. OVERLAY VA TAKLIF OQIMI

| Savol | Javob | Isbot |
|---|---|---|
| Taklif kelganda nima bo'ladi? | `SocketManager` `booking:offer` ni oladi (`:79`) → `HomeViewModel` kollektori (`:691`) → `state.incomingOffer` → **`HomeScreen` ichidagi `OfferPopup`** | `HomeScreen.kt:195-196` |
| To'liq ekran chiqadimi? | Compose `Popup` — **ilova oynasi ichida**, to'liq ekran scrim bilan | `OfferPopup.kt:123-133` |
| **Boshqa tabda tursa-chi?** | ❌ **Popup CHIQMAYDI.** `OfferPopup` butun repoda **faqat bitta joyda** ishlatilgan — `HomeScreen.kt:196`. Haydovchi Daromad/Ballar/Profil tabida bo'lsa, telefon **jiringlaydi va manzilni aytadi**, lekin qabul qilish oynasi yo'q — vaqt tugab avto-rad bo'ladi | `grep -rn "OfferPopup"` = 3 natija (import, chaqiruv, ta'rif) |
| **Telefon qulflangan bo'lsa-chi?** | ❌ **Hech narsa ko'rinmaydi.** `MainActivity` da `setShowWhenLocked` / `setTurnScreenOn` / `FLAG_KEEP_SCREEN_ON` **yo'q** (`MainActivity.kt:65-123` to'liq o'qildi). Faqat ovoz+TTS eshitiladi | `MainActivity.kt` |
| `SYSTEM_ALERT_WINDOW` ishlatiladimi? | ❌ **Ruxsat manifestda umuman yo'q** (`Manifest:5-30` — 11 ta ruxsat, overlay yo'q). `canDrawOverlays` / `TYPE_APPLICATION_OVERLAY` = 0 natija | `AndroidManifest.xml:5-30` |
| FCM bildirishnomasi taklifni ko'rsatadimi? | ❌ Yo'q. `showNotification` — oddiy banner, **`setFullScreenIntent` yo'q, action tugmalari yo'q**; bosilsa shunchaki `MainActivity` ochiladi | `TaxiFirebaseMessagingService.kt:100-117` |
| Ovoz bormi? | ✅ **Ha, yaxshi.** `USAGE_ALARM` bilan looping ringtone (`:106-117`) → jim rejimda ham eshitiladi; 6 s dan keyin 2 s fade-out (`:120,:126-137`) | `OfferSoundService.kt` |
| Tebranish bormi? | ✅ Ha — `createWaveform`, 2 sikl (`:151-153`); `muted` bo'lsa ham tebranish ishlaydi (`:68`) | `OfferSoundService.kt:139-157` |
| TTS bormi? | ✅ Ha — o'zbekcha, `ru` fallback bilan (`:48-51`): *"Yangi buyurtma! {manzil}, {N} kilometr"* (`:171`) | `OfferSoundService.kt` |
| Qabul: surish yoki bosish? | ✅ **Surish** — `SwipeToAccept` `detectDragGestures` bilan (`:571`, `:663-700`); rad etish esa **bosish** (`RejectButton` `:708`) | `OfferPopup.kt` |
| Countdown | ✅ Halqa animatsiyasi (`:246`), 5 s da haptik + beep, 3 s da shoshilinch beep (`:108-121`) | `OfferPopup.kt` |

**Xulosa:** taklif oynasining **o'zi juda yaxshi qilingan** (785 qator, swipe, countdown, TTS) — lekin
u **noto'g'ri qatlamda yashaydi**. Uni ko'rsatish uchun (a) ilova oldinda, (b) aynan Home tabida
bo'lishi shart. Ikkalasi ham fon rejimida bajarilmaydi.

---

## 6. minSdk TAHLILI — 26 → 23

Compose'ning o'zi minSdk 21 dan ishlaydi, ya'ni **Compose to'siq emas**. Haqiqiy to'siqlar:

| # | To'siq | Fayl:qator | Talab qiladigan API | Yechim | Og'irlik |
|---|---|---|---|---|---|
| 1 | **`java.time` (desugaring YO'Q)** | `ui/earnings/EarningsViewModel.kt:12-20` (9 ta import), `ui/earnings/EarningsScreen.kt:45-49` (5 ta import) | **API 26** | `compileOptions { isCoreLibraryDesugaringEnabled = true }` + `coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.x")`. **Hozir yoqilmagan** — `build.gradle.kts:59-62` da yo'q, `grep -rn "desugar"` = bo'sh | 🟢 Kichik (2 qator) |
| 2 | **`NotificationChannel`** ×2 | `service/LocationForegroundService.kt:133`, `service/TaxiFirebaseMessagingService.kt:91` | **API 26** | `if (SDK_INT >= 26)` guard | 🟢 Kichik |
| 3 | **`startForegroundService()`** | `ui/home/HomeViewModel.kt:752` | **API 26** | `if (SDK_INT >= 26) startForegroundService else startService` | 🟢 Kichik |
| 4 | **`VibrationEffect.createWaveform`** | `service/OfferSoundService.kt:153` | **API 26** | `else vibrator.vibrate(pattern, -1)` (deprecated yo'l) | 🟢 Kichik |
| 5 | Adaptive icon | `res/mipmap-anydpi-v26/` | — | **To'siq emas** — resurs kvalifikatori, eski qurilma `mipmap-*dpi` ni oladi | ⚪ Yo'q |
| 6 | Kutubxonalar | `libs.versions.toml` | — | Compose BOM 2024.12, Hilt 2.54, Retrofit 2.11, socket.io 2.1, play-services-location 21.3, maps-compose 6.4 — **hammasi minSdk 21 qo'llab-quvvatlaydi**. **To'siq emas** | ⚪ Yo'q |

**Texnik xulosa:** 23 ga tushirish **texnik jihatdan oson** — 1 ta gradle sozlamasi + 4 ta guard,
~2–4 soatlik ish. **Asosiy xarajat kodda emas, testda:** Android 6.0/7.x da runtime-permission
modeli, `ACCESS_BACKGROUND_LOCATION` semantikasi (API 29 dan oldin mavjud emas — avtomatik beriladi),
doze rejimi (API 23 da kirgan) boshqacha ishlaydi. Real Android 6/7 qurilmada sinash kerak → **~2 kun**.

> ⚠️ **ROI ogohlantirishi:** 2026-yilda Android 6.0/7.x jonli bazaning **~2–3%** ini tashkil qiladi.
> Ish boshlashdan **oldin** jonli haydovchi bazasining haqiqiy qurilma taqsimotini o'lchash kerak
> (backend `driver_sessions.deviceModel` / `appVersion` ni saqlaydi — `auth.service.ts:142`).
> Agar 26 dan past qurilma 1–2 tadan oshmasa, bu 2 kunni fon rejimiga sarflagan ma'quldir.

---

## 7. ISH HAJMI BAHOSI

Baho **kodda ko'rilgan aniq holatga** asoslangan, taxminga emas. 1 muhandis, 1 ish kuni = 6 samarali soat.
Backend o'zgarishlari alohida belgilangan.

### A. Fon rejimini to'liq qilish — **10–11 kun**

| Ish | Nega shuncha | Kun |
|---|---|---|
| Socket egaligini `HomeViewModel` dan olib, servisga/singleton sessiya-menejeriga ko'chirish | Bu **arxitektura o'zgarishi**, patch emas: `HomeViewModel.kt:316,328,443,447,531,542` — 6 ta chaqiruv joyi; servis `onStartCommand` da DataStore'dan token o'qib o'zi ulanishi kerak; ViewModel endi sessiyani **kuzatadi**, boshqarmaydi | 2 |
| Taklifni UI'dan ajratish (headless offer controller) | Hozir taklif `HomeUiState.incomingOffer` da (`:36`) va faqat `HomeScreen.kt:196` chizadi. Taklif oqimi Activity'dan mustaqil bo'lishi shart | 2 |
| **FCM'ni uchdan-uchgacha tiklash** | Firebase loyihasi + `google-services.json` + plagin (klient ~0.5) · **server: `dispatch.service.ts` dan `NotificationsService.sendToDriver` chaqirish + data-payload** (~1) · doze/kill sinovlari (~0.5) | 2 |
| BootReceiver + online holatni tiklash | `<receiver>` + `saveOnlineState` (`DataStore.kt:125`) o'qib servisni yoqish. Android 8+ da boot'dan keyin FGS cheklovlari bor | 0.5 |
| WorkManager qorovul (15 daq davriy: servis tirikmi + socket ulanganmi) | Yangi dependency + worker + Hilt integratsiya | 1 |
| Polling zaxirasi (socket N soniya uzilsa REST'dan taklif so'rash) | Klient tomoni ~1; **backend'da yangi endpoint kerak** (`GET /drivers/me/pending-offer`) ~0.5 | 1.5 |
| **Real qurilmada doze/kill/OEM sinovi** (Xiaomi + Oppo/Vivo + toza Android) | Hech kim byudjetga qo'ymaydigan, lekin butun ishning ma'nosi shu qism. Har OEM'da alohida xulq | 2 |

### B. Overlay taklif — **3 kun**

`SYSTEM_ALERT_WINDOW` **shart emas** va tavsiya etilmaydi (Play Store cheklovi, ruxsat so'rash og'ir).
To'g'ri yo'l: alohida `OfferActivity` + `setShowWhenLocked(true)` + `setTurnScreenOn(true)` +
**full-screen intent** notification (Android 14 da `USE_FULL_SCREEN_INTENT` ruxsati kerak).
Mavjud `OfferPopup.kt` (785 qator) **to'liq qayta ishlatiladi** — shuning uchun 3 kun, 6 emas.

| Ish | Kun |
|---|---|
| `OfferActivity` + showWhenLocked/turnScreenOn + full-screen intent notification (accept/reject action'lari bilan) | 2 |
| Qulflangan ekran + OEM sinovi (Xiaomi'da full-screen intent alohida ruxsat talab qiladi) | 1 |

### C. Offline navbat + holat tiklash — **4 kun**

| Ish | Nega | Kun |
|---|---|---|
| Doimiy amal-navbati (accept/reject/arrived/start/complete/cancel) idempotent kalit bilan | Hozir **umuman yo'q**; `SocketManager.kt:140-153` jimgina yo'qotadi. `DataStore.kt:154-161` dagi o'lik navbat kodi asos bo'ladi | 2 |
| **Backend idempotentlik** (bir xil kalit ikki marta kelsa ikkilanmasin) | Pulga tegadi — qayta yuborish ikki marta hisoblamasligi shart | 1 |
| Taximetr holatini diskda saqlash (`taxiDistanceKm` har GPS tickda yoki har 10 s) | `HomeViewModel.kt:64` — hozir faqat xotirada, tiklanishda nolga tushadi | 0.5 |
| "Yuborilmadi" ni UI'da ko'rsatish (jim yo'qolish o'rniga) | `DIZAYN_QOIDALARI` — bosishga vizual javob shart | 0.5 |

### D. minSdk 26 → 23 — **2 kun** (ixtiyoriy, avval o'lchang)

Kod: ~0.5 kun (desugaring + 4 guard). Android 6/7 real qurilma sinovi: ~1.5 kun. §6 dagi ROI ogohlantirishi.

### E. Prod-hardening — **2–3 kun** (so'ralmagan, lekin real telefonga chiqish uchun BLOKLOVCHI)

| Muammo | Fayl:qator | Nega bloklovchi | Kun |
|---|---|---|---|
| **Release DEBUG kalit bilan imzolangan** | `build.gradle.kts:54` `signingConfig = signingConfigs.getByName("debug")` + `// TODO: production signing` | Debug kalit bilan chiqarilgan APK'ni keyin prod kalitga **almashtirib bo'lmaydi** — haydovchilar ilovani o'chirib qayta o'rnatishi kerak bo'ladi. Birinchi tarqatishdan **oldin** hal qilinishi shart | 0.5 |
| **`proguard-rules.pro` FAYLI YO'Q, `isMinifyEnabled = true`** | `build.gradle.kts:52-53` — fayl `app/` da mavjud emas (`ls` tasdiqladi) | R8 faqat default qoidalar bilan ishlagan. **kotlinx-serialization, Hilt, Retrofit, socket.io keep-qoidalarisiz** release build runtime'da yiqilishi juda ehtimol. Release APK (3.2 MB, 2-may) **hech qachon ishga tushirilmagan** | 1 |
| **Global cleartext** | `AndroidManifest.xml:41` `usesCleartextTraffic="true"` + `network_security_config.xml:7` `base-config cleartextTrafficPermitted="true"` | Prod APK har qanday HTTP'ni qabul qiladi — MITM. Debug uchun kerak, lekin release'da o'chirilishi shart | 0.5 |
| **Maps API kaliti — placeholder** | `gradle.properties:11` `AIza-placeholder-get-real-key-from-cloud-console` | Xarita "For development purposes only" suv belgisi bilan chiqadi | 0.5 |
| Base URL Render'da | `build.gradle.kts:25-26` | Bu host tirikmi — tasdiqlanmagan (§9 ochiq savol) | — |

### F. "Birinchi kontakt" bufer — **3 kun**

`MASTER-PLAN.md` bo'yicha ilova **hech qachon real telefonda ishlatilmagan**. 12 745 qator kod
birinchi marta ishga tushganda **albatta** kutilmagan xatolar chiqadi (Hilt graf, Compose rekompozitsiya,
socket handshake, TTS o'zbek tili mavjudligi, `runBlocking` interceptor ANR'i). Buni byudjetga
qo'ymaslik — asosiy baho xatosi.

### 🔢 UMUMIY

| Blok | Kun |
|---|---|
| A. Fon rejimi | 10–11 |
| B. Overlay taklif | 3 |
| C. Offline navbat + holat | 4 |
| E. Prod-hardening (bloklovchi) | 2–3 |
| F. Birinchi-kontakt buferi | 3 |
| **Real telefonda ishonchli ishlaydigan holatgacha** | **22–26 kun** (~4.5–5 hafta) |
| D. minSdk 23 (ixtiyoriy) | +2 |

**Boshqa sessiyaning "~1 hafta" bahosi 4–5 barobar optimistik.** U ehtimol faqat "kod bor, kompilyatsiya
bo'ladi" ni o'lchagan. Kod haqiqatan bor va sifatli — lekin fon rejimi **yozilmagan, faqat yozilgandek
ko'rinadi** (BootReceiver ruxsati receiver'siz, FCM servisi Firebase konfiguratsiyasisiz, START_STICKY
qayta-ulanishsiz, navbat kodi chaqiruvsiz).

### Tavsiya etilgan tartib (birinchi qiymat tez chiqsin)

1. **E-blok** (2–3 kun) — imzo + proguard + cleartext. Busiz hech narsani telefonga qo'yib bo'lmaydi.
2. **Telefonga o'rnatib, bor holicha 1 kun haydash** — F-buferning bir qismi, haqiqiy nuqsonlar ro'yxati.
3. **A-blok socket ko'chirish** (2 kun) — eng katta yagona yutuq: START_STICKY nihoyat ma'noga ega bo'ladi.
4. **A-blok FCM** (2 kun) — raqibdan ustunlikning yagona haqiqiy quroli.
5. Qolganlari.

---

## 8. QAMRAB OLINMAGAN

Halollik uchun — nimani **tekshirmadim**:

1. **Hech narsa ishga tushirilmadi.** Gradle build, `./gradlew assembleRelease`, lint, emulator, real
   qurilma — hech biri (topshiriq taqiqlagan). Barcha xulosa **statik o'qishdan**.
2. **APK ichi ochilmadi.** `app-release.apk` (3.2 MB) va `app-debug.apk` (21.8 MB) faqat hajmi bo'yicha
   o'lchandi; ichidagi DEX/resurs tarkibi razborka qilinmadi.
3. **Backend faqat qisman.** `apps/api` da faqat socket gateway, dispatch, notifications modullari
   grep qilindi. Endpoint'larning haqiqiy javob shakli klient DTO'lariga mos kelishi **tekshirilmadi**
   (masalan `Order.pickupLat` `String?` deb kutiladi — `Models.kt:83` — Drizzle decimal'i haqiqatan
   string qaytarayotgani tasdiqlanmagan).
4. **`one067-taxi-api.onrender.com` tirikligi tekshirilmadi** (tarmoq so'rovi qilinmadi).
5. **Testlar yo'qligi.** `app/src/test` va `app/src/androidTest` papkalari umuman mavjud emas —
   dependency'lar e'lon qilingan (`build.gradle.kts:129-131`) lekin **bitta ham test fayl yo'q**.
   Ya'ni butun ilovada avtomatik qamrov = **0%**.
6. **Dizayn auditi qilinmadi** — `DIZAYN_QOIDALARI.md` ning 17 qoidasi bo'yicha ekranma-ekran tekshiruv
   topshiriqqa kirmagan (faqat 5 ta o'lik tugma qayd etildi).
7. **`local.properties`, ProGuard mapping, baseline profillar** ko'rib chiqilmadi.

---

## 9. OCHIQ SAVOLLAR (egaga)

1. **Xarita kerakmi?** (§ma'lumot: raqib xaritasiz ishlaydi.) Google Maps hozir 3 ta dependency
   (`build.gradle.kts:112-114`), API kaliti kerak (hozir placeholder), pul turadi va **Play Services'siz
   telefonda ishlamaydi** (kod buni tan oladi — `DriverMapView.kt:103-106` da fallback bor). Navigatsiya
   allaqachon tashqi ilovaga topshirilgan (`NavigationLauncher.kt` — `geo:` URI, izohda "biz ataylab
   xarita SDK'sini qo'shmaymiz" deyilgan — bu izoh **kodga zid**, chunki `maps-compose` qo'shilgan).
   **Xaritani olib tashlasak: release APK 3.2 MB dan ~2.3 MB ga tushadi, API kaliti va Play Services
   bog'liqligi yo'qoladi.** Qaror kerak.
2. **APK hajmi — "22 MB" da'vosi noto'g'ri.** Haqiqat: **debug** = 21.8 MB (minify yo'q),
   **release** = **3.2 MB** (R8 bilan). `MASTER-PLAN.md` debug raqamini keltirgan.
   Kamaytirish mumkin, lekin 3.2 MB allaqachon yaxshi — **bu muammo emas**.
3. **minSdk 23 ga tushirish haqiqatan kerakmi?** Avval jonli haydovchi qurilmalarining Android
   versiyalarini o'lchang (`driver_sessions` jadvalida `deviceModel`/`appVersion` bor).
4. **Prod API qayerda?** `build.gradle.kts:25` Render'ni ko'rsatadi. BirJoy uchun Render o'lgan
   (xotira: *Render/Vercel suspended, VPS is real*). 1067-taxi alohida loyiha — uning prod hosti
   tasdiqlanishi kerak, aks holda barcha ish noto'g'ri manzilga qaratiladi.
5. **PTT (ovozli aloqa) kerakmi?** Raqibda `RECORD_AUDIO` bor. Bizda matnli chat bor
   (`ChatSheet.kt`, 354 qator). Haydovchilar amalda qaysinisini ishlatadi?
6. **Firebase loyihasi ochilganmi?** Server `FIREBASE_PROJECT_ID` / `CLIENT_EMAIL` / `PRIVATE_KEY`
   env'larini kutadi (`notifications.service.ts:19-21`) va yo'q bo'lsa **jimgina o'chadi**
   (`:32` — "Firebase not configured — push notifications disabled"). Bu env'lar VPS'da bormi?

---

**READY FOR VERIFICATION**

Har da'vo `fayl:qator` bilan yuqorida keltirilgan. Mustaqil tekshiruvchi uchun eng tez 4 ta tekshiruv:

```bash
cd "1067-taxi/apps/driver-android"
grep -rn "socket\.connect" app/src/main/                    # → faqat HomeViewModel.kt:316
find . -name "google-services.json" -not -path "*/build/*"  # → bo'sh
grep -n "receiver" app/src/main/AndroidManifest.xml         # → bo'sh (BootReceiver yo'q)
grep -rn "OfferPopup" app/src/main/                         # → faqat HomeScreen.kt:196 chizadi
```
