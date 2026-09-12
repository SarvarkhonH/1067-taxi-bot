# HAYDOVCHI ILOVASI — AUDIT V2

**Sana:** 2026-09-10 · **Qamrov:** `1067-taxi/apps/driver-android` (51 Kotlin fayl / 12 815 qator) +
u murojaat qiladigan backend `1067-taxi/apps/api` (NestJS/Fastify) · **Metod:** faqat fayl o'qish.
Gradle build qilinmadi, emulator ochilmadi, tarmoq so'rovi yuborilmadi, kod tegilmadi.

**Oldingi hujjatlar o'qildi:** `DRIVER_APK_AUDIT.md` (2026-09-08), `BIRJOY_TAXI_MASTER.md` §A.
Har topilma **[YANGI]** yoki **[MA'LUM]** deb belgilangan.

**Tasdiqlangan tuzatishlar (qayta hisobga olinmadi):** 6 xonali OTP (`AuthScreen.kt:495,509`,
`SmsRetrieverEffect.kt:41`) ✅ · `app/proguard-rules.pro` mavjud va to'g'ri yozilgan ✅ ·
`SocketManager` oxirgi status+lokatsiyani keshlab reconnect'da qayta yuboradi
(`SocketManager.kt:39-40, 98-101, 165`) ✅ · GPS servisi `HomeScreen` ON_RESUME'dan ishga tushadi
(`HomeScreen.kt:104-110`, `HomeViewModel.kt:763-768`) ✅ · server FCM'ni dispatch'dan chaqiradi
(`dispatch.service.ts:292-297`) ✅ — lekin ilova tomonida hali ham o'lik (BLOKER-6).

---

## 1. BIR ABZATSDA — HAQIQIY TAYYORLIK

**~45%.** Bu raqam quyidagi ajratmadan chiqadi: **ekran/UI qatlami ~85% tayyor** (18 ekran, hech biri
qobiq emas, real MVI, real dizayn tokenlari, 229×2 tarjima satri, swipe-to-accept, TTS, haptika —
bu qism haqiqatan yaxshi ishlangan); **backend bilan shartnoma ~60%** (ikkita endpoint ish vaqtida
**har doim 400 qaytaradi** — bekor qilish va SOS; uchta muhim voqea driver'ga umuman yuborilmaydi);
**ishonchlilik qatlami ~20%** (socket tokeni 15 daqiqada tugaydi va hech qachon yangilanmaydi →
birinchi tarmoq uzilishidan keyin haydovchi butun smena davomida buyurtmasiz qoladi; offline navbat
yo'q; FCM o'lik; BootReceiver yo'q); **pul-to'g'riligi ~40%** (ilovadagi taximetr km narxi 2000,
backend'da 3000 + daqiqa narxi + tungi koeffitsient — ya'ni haydovchi ko'rgan raqam yakuniy narxdan
tizimli ravishda **30–60% past**); **release konfiguratsiyasi ~30%** (prod build shifrlanmagan
`http://169.58.55.249:4000` ga uriladi). Ilova **hali bironta real smenani o'tkaza olmaydi**: 15
daqiqadan keyin buyurtma kelmay qoladi, bekor qilish tugmasi ishlamaydi, SOS server'ga yetmaydi va
taximetr noto'g'ri raqam ko'rsatadi. Kod sifati yuqori — muammo kodning **yo'qligida emas, uchini
uchiga ulanmaganligida**.

---

## 2. TOPILMALAR JADVALI (og'irlik bo'yicha)

### 🔴 BLOKER — real smenani buzadi yoki pul/xavfsizlikka tegadi

| # | Nima buzilgan | fayl:qator | Nega haydovchiga og'riq | Hajm |
|---|---|---|---|---|
| **B1** | **Bekor qilish HAR DOIM 400 qaytaradi.** Ilova `{"cancelledBy":"driver","reason":"…"}` yuboradi; controller `UpdateOrderStatusDto` kutadi — unda faqat `status` (majburiy) va `note` bor; global `ValidationPipe` da `forbidNonWhitelisted: true`. Ya'ni `cancelledBy`/`reason` — «property should not exist» + `status` yo'q → 400. | `HomeViewModel.kt:646-649` · `orders.controller.ts:71-80` · `orders.dto.ts:73-80` · `main.ts:115-117` | Haydovchi mashinasi buzildi / mijoz chiqmadi / manzil noto'g'ri — **bekor qila olmaydi**. Butun `CancelReasonSheet` (190 qator) + «Mijoz chiqmadi» oqimi o'lik. Ekranda «Bekor qilib bo'lmadi: …» chiqadi va safar abadiy osilib qoladi. | **S** |
| **B2** | **Socket tokeni 15 daqiqada tugaydi va hech qachon yangilanmaydi.** `expiresIn: 900` (15 min). Socket faqat `HomeViewModel.loadProfile()` da bir marta ulanadi; `SocketManager.connect` bir xil token bilan qayta chaqirilsa darrov `return` qiladi; REST-avtorefresh yangi tokenni **socketga uzatmaydi**. Reconnect'da `driver:join` **o'sha eskirgan token** bilan ketadi → server `client.disconnect(true)` qiladi → socket.io qayta ulanadi → yana disconnect → **cheksiz sikl**. | `auth.service.ts:430-433` · `HomeViewModel.kt:310-318` · `SocketManager.kt:50-52, 81-89` · `socket.gateway.ts:111-117` · `AppModule.kt:59-86` | Smenaning 15-daqiqasidan keyin **birinchi tunnel/lift/operator almashuvi** haydovchini abadiy uzadi. Telefonda «Onlayn» yozuvi turadi, GPS oqadi (keshga), dispetcher uni ko'rmaydi, buyurtma kelmaydi. Haydovchi 8 soat bekorga yuradi. **Eng jiddiy yagona xato.** | **M** |
| **B3** | **Taximetr narxi backend bilan mos emas.** Ilova: base 5000 + **2000/km**, min 8000, 500 gacha **pastga** yaxlitlash. Backend: base 5000 + **3000/km** + **300/daqiqa** + tungi ×1.5 (22:00–06:00) + surge + vehicle-class. | `HomeViewModel.kt:102-105, 190-195` · `pricing.constants.ts:2-12` · `pricing.service.ts:269-278` | 10 km / 20 daq kunduzi: ilova **25 000** ko'rsatadi, tizim **41 000** hisoblaydi. Tunda farq yanada katta. Haydovchi mijozga ilovadagi raqamni aytadi → kelishmovchilik; yoki o'zini aldangan his qiladi. **Pul-nizoning bevosita manbai.** | **S** |
| **B4** | **«Qabul qildim» tasdiqlanmaydi.** `socket.acceptOffer()` — `socket?.emit`, javob kutilmaydi. Server muvaffaqiyatsizlikda `client.emit('error', …)` yuboradi — **ilovada `'error'` tinglovchisi umuman yo'q**. UI esa serverdan oldin `HEADING_TO_PICKUP` ga o'tadi. | `SocketManager.kt:104-140` (listener ro'yxati) `:177-180` · `HomeViewModel.kt:524-541` · `socket.gateway.ts:199-202` | Ikki haydovchi bir buyurtmani bosdi, biri yutqazdi — **yutqazgani buni bilmaydi** va mijoz oldiga boradi. Yoki socket uzilgan holatda emit yo'qoladi → haydovchi mavjud bo'lmagan safarga ketadi. | **M** |
| **B5** | **Mijoz/dispetcher bekor qilsa, haydovchiga hech narsa bormaydi.** `emitOrderUpdated` faqat `ADMIN_ROOM` va `client:{id}` ga yuboradi — `driver:{id}` ga **hech qachon**. Ilovada ham `order:updated` / `order:cancelled` tinglovchisi yo'q. | `socket.gateway.ts:290-315` · `SocketManager.kt:104-131` | Mijoz bekor qildi — haydovchi 10 daqiqa manzilga borib, «Yetib keldim» bosadi, 400 oladi. Yonilg'i va vaqt behuda. | **M** |
| **B6** | **FCM ilova tomonida hali ham o'lik.** `google-services.json` **repoda yo'q** (`find` = 0 natija), `com.google.gms.google-services` plagini **qo'llanmagan** (`build.gradle.kts:1-8`) → `FirebaseApp` initsializatsiya bo'lmaydi → token olinmaydi → `drivers.fcmToken` doim `null` → `sendToDriver` jimgina `return` qiladi. Qo'shimcha: server **`notification`+`data`** payload yuboradi — bunday xabar o'ldirilgan ilovada `onMessageReceived` ni **chaqirmaydi** (tizim treyi ko'rsatadi), ya'ni ilova uyg'onib socket'ga ulana olmaydi. Push'da `setFullScreenIntent` ham yo'q. | `build.gradle.kts:1-8, 158-160` · `notifications.service.ts:37-39, 42-47` · `TaxiFirebaseMessagingService.kt:100-117` | Va'da qilingan «3-kanal» — **nol**. Ilova fonga o'tib process o'lsa buyurtma yo'qoladi. Bu aynan raqibning zaifligi edi. | **M** |
| **B7** | **Release build shifrlanmagan HTTP ga uriladi.** `RELEASE_API_BASE` default = `http://169.58.55.249:4000/api/v1`; `usesCleartextTraffic="true"`; `network_security_config.xml` global cleartext. | `build.gradle.kts:89-94` · `AndroidManifest.xml:41` · `network_security_config.xml:7` | JWT, telefon raqamlar, GPS izlar va chat ochiq matnda uzatiladi. Har qanday Wi-Fi MITM haydovchi hisobini o'g'irlaydi. **Play review'ni ham to'xtatadi** (§6). | **S** |
| **B8** | **SOS server'ga yetmaydi, lekin ilova «yuborildi» deydi.** `TriggerSosDto` da **bironta class-validator dekoratori yo'q**; `forbidNonWhitelisted: true` bilan dekoratorsiz maydonlar rad etiladi → `POST /safety/sos/driver` 400. Ilova esa xatoni yutadi va dialogni baribir ochadi. | `safety.controller.ts:14-18, 54-62` · `main.ts:115-117` · `HomeViewModel.kt:682-691` | Haydovchi «SOS yuborildi» yozuvini ko'radi — **ofisda hech kim bilmaydi**. Yolg'on xavfsizlik hissi eng yomon xavfsizlik xatosi. | **S** |
| **B9** | **Offline navbat yo'q — amallar jimgina yo'qoladi.** `setStatus`, `acceptOffer`, `rejectOffer` — `socket?.emit`, ulanish tekshirilmaydi, xato ko'rsatilmaydi. `DataStore.kt:153-161` dagi `savePendingOfferQueue`/`getPendingOfferQueue`/`clearPendingOfferQueue` — **hech qayerdan chaqirilmaydi, o'lik kod**. | `SocketManager.kt:169-185` · `DataStore.kt:153-161` | Tunnelda «Qabul» surildi → hech narsa jo'namadi → ekran «safar boshlandi» deydi, server bilmaydi. Haydovchi 15 soniya sanoq tugaganini ham ko'rmaydi. | **L** |
| **B10** | **Ruxsat ekrani o'tib bo'lmaydigan devor bo'lishi mumkin.** `bg_location` `required = true`. Android 11+ da `ACCESS_BACKGROUND_LOCATION` ni `requestPermission` bilan so'rash tizim dialogini ko'rsatmaydi; avto-rad bo'lgach `shouldShowRequestPermissionRationale` = false → holat `NotAsked` bo'lib qoladi → karta yana «Ruxsat berish» ko'rsatadi, bosish **hech narsa qilmaydi**. «Davom etish» tugmasi `enabled = canContinue` — o'chiq. Orqaga yo'l ham yo'q. | `PermissionsScreen.kt:53-58, 130-134, 164-170, 264-270` | Yangi haydovchi ilovaga **hech qachon kira olmaydi**. Sozlamalarga olib boruvchi tugma faqat `DeniedPermanent` holatida chiqadi — bu holat bu yerda hech qachon hisoblanmaydi. | **S** |

### 🟠 KATTA — kunlik ishni sezilarli buzadi

| # | Nima buzilgan | fayl:qator | Nega og'riq | Hajm |
|---|---|---|---|---|
| **K1** | **«Nega menga buyurtma kelmayapti?» — javob yo'q.** Backend dispatch faqat `verifyStatus = 'approved'` VA `balanceUzs >= -50 000` haydovchilarni tanlaydi. Ilova `verifyStatus` ni **umuman o'qimaydi** (`Models.kt:20` da bor, hech qayerda ishlatilmaydi), balansga ham qaramaydi, «Onlayn» tugmasini bloklamaydi. **[YANGI]** | `dispatch.service.ts:178-183` · `Models.kt:20, 40` · `HomeViewModel.kt:429-458` | Hujjati tasdiqlanmagan yoki qarzi 50 mingdan oshgan haydovchi «Onlayn» bo'lib, «Buyurtma kutilmoqda» yozuvi ostida soatlab bekor o'tiradi. Sabab hech qayerda aytilmaydi. Ilovada **balansni to'ldirish yo'li ham yo'q** (`topup` — faqat admin). | **M** |
| **K2** | **BootReceiver YO'Q, lekin ruxsat e'lon qilingan.** `RECEIVE_BOOT_COMPLETED` bor, manifestda bironta `<receiver>` yo'q (`grep -c receiver` = **0**). **[MA'LUM]** | `AndroidManifest.xml:28, 32-83` | Telefon o'chib-yonsa (batareya tugadi / reboot) haydovchi jimgina offline qoladi. | **S** |
| **K3** | **Taximetr masofasi diskka yozilmaydi va tab almashtirilsa nolga tushadi.** `taxiDistanceKm` faqat `HomeUiState` da. Tab almashtirilsa `HomeViewModel` yo'q qilinadi (Navigation back-stack entry ViewModel'ni tozalaydi) → yangi VM 0.0 dan boshlaydi. **[MA'LUM + YANGI sabab]** | `HomeViewModel.kt:64, 588-606` · `MainActivity.kt:193-231` | Safar o'rtasida ilova o'lsa yoki haydovchi «Daromad» ga qarab qaytsa — hisoblagich 0 km / minimal narxga qaytadi. (Pul backendda xavfsiz, lekin haydovchi ishonchi yo'qoladi.) | **M** |
| **K4** | **Taklif boshqa tabda yo'qoladi.** `OfferPopup` butun repoda faqat `HomeScreen.kt:214` da chiziladi. Undan tashqari: `socket.bookingOffer` — `replay=0` `SharedFlow`; HomeViewModel yo'q bo'lganda `tryEmit` **abonentsiz** ketadi va yo'qoladi. **[MA'LUM + YANGI sabab]** | `HomeScreen.kt:213-224` · `SocketManager.kt:42, 108` | Haydovchi Ballar/Profil tabida — telefon jiringlaydi va manzilni aytadi, lekin qabul qilish oynasi **hech qachon chiqmaydi**. Vaqt tugaydi, rad hisoblanadi. | **M** |
| **K5** | **SOS faqat faol safar paytida ko'rinadi.** `if (state.activeOrderId != null && …) SosFab(...)`. | `HomeScreen.kt:198-207` | Bo'sh turganda, mijozni tushirgandan keyin yoki kutish joyida hujum bo'lsa — **SOS tugmasi umuman yo'q**. | **S** |
| **K6** | **Daromad ekrani xatoni yutadi va «0 so'm» ko'rsatadi.** `EarningsUiState.error` to'ldiriladi, lekin `EarningsScreen` da **hech qayerda chizilmaydi** (`grep state.error` = 0 natija). | `EarningsViewModel.kt:114-116` · `EarningsScreen.kt:116-150` | Tarmoq yiqilganda haydovchi balansini **0 so'm** deb ko'radi va vahima qiladi. Xuddi shu `ProfileViewModel.kt:92-94, 105-107` da ham (bo'sh profil, nol raqamlar). | **S** |
| **K7** | **Logout GPS'ni ham socket'ni ham to'xtatmaydi.** `logout()` faqat tokenlarni va online bayrog'ini tozalaydi. Foreground servis va socket tirik qoladi. | `ProfileViewModel.kt:167-175` | Chiqib ketgan haydovchining joylashuvi kuzatilishda davom etadi, bildirishnoma turaveradi. **Maxfiylik buzilishi + Play siyosati xavfi.** | **S** |
| **K8** | **Batareya: cheksiz wake lock + 3–5 s HIGH_ACCURACY GPS + doim ochiq xarita.** `acquire()` timeout'siz; `LocationRequest` 5000/3000 ms `PRIORITY_HIGH_ACCURACY`, tezlik/harakatga qarab moslashmaydi; xarita kamerasi **har GPS tik'da** 400–600 ms animatsiya qiladi; `isTrafficEnabled` faol safarda yoqiladi (qo'shimcha trafik). | `LocationForegroundService.kt:16-17, 97-100, 113-123` · `DriverMapView.kt:163-187, 211` | 8 soatlik smenada telefon shu ilovadan **eng katta iste'molchi** bo'ladi. Maqsad «≤25%/8 soat» — bu konfiguratsiyada erishib bo'lmaydi. Bekor turganda ham interval o'zgarmaydi. | **M** |
| **K9** | **Release'da crash-hisoboti YO'Q.** `Thread.setDefaultUncaughtExceptionHandler` faqat `if (BuildConfig.DEBUG)` ichida. Crashlytics/Sentry yo'q. | `MainActivity.kt:86-95` | Haydovchi telefonida ilova yiqilsa — **hech kim bilmaydi**. Nosozlikni faqat haydovchining qo'ng'irog'idan bilib olasiz. | **S** |
| **K10** | **`/orders/my` mijoz telefonini qaytarmaydi → «Qo'ng'iroq» tugmasi o'lik.** `orders` jadvalida `clientPhone`/`clientName` **ustunlari yo'q**; `getDriverOrders` shunchaki `select().from(orders)`. Tiklashda `clientPhone = ""`; tugma `if (phone.isNotBlank())` bilan **jimgina hech narsa qilmaydi**. | `orders.ts:30-100` · `orders.service.ts:910-915` · `HomeViewModel.kt:369-370` · `ActiveRideSheet.kt:240-249` | Safar o'rtasida ilova qayta yuklangan bo'lsa haydovchi mijozga qo'ng'iroq qila olmaydi va nima uchunligini bilmaydi. `ClientRow` da telefon bo'sh chiqadi. | **M** |
| **K11** | **`completeRide` javobi yo'qolsa — arvoh safar.** Server buyurtmani yopib, komissiyani yechib bo'ldi, javob esa tarmoqda yo'qoldi → ilova xato ko'rsatadi, safar ekranda qoladi. Qayta bosish `assertOrderDriver(..., ['in_progress'])` da 400 beradi. Tiklash faqat ilovani qayta ochganda ishlaydi va u ham `if (activeOrderId != null) return` bilan bloklanadi. | `HomeViewModel.kt:608-627, 350-351` · `orders.service.ts:926-934` | Safar tugadi, pul yechildi — ekranda hali ham «Yakunlash» turadi va haydovchi keyingi buyurtmani ololmaydi. Chiqish yo'li: ilovani o'chirib qayta ochish. | **M** |
| **K12** | **Hujjat yuklash mobil internetda tugamaydi.** OkHttp'da `connectTimeout`/`readTimeout` 30 s ga o'rnatilgan, **`writeTimeout` esa default 10 s** da qolgan. 5 MB fayl base64'da ~6.7 MB JSON. | `AppModule.kt:43-45` · `ProfileViewModel.kt:141-147, 178` | 3G/sekin 4G'da har yuklash 10 soniyada uziladi. Haydovchi hujjatini topshira olmaydi → tasdiqlanmaydi → buyurtma olmaydi (K1). | **S** |
| **K13** | **Ekranda soxta raqamlar.** `acceptanceRate = 100` va `tier = "bronze"`, `rating = "—"`, `carYear = ""` qattiq yozilgan; bosh ekranda «Smena soatlari» **doim `"0 h"`**; `priorityPosition` **doim null** (backend bermaydi) → navbat pilli hech qachon chiqmaydi; `comparePct = null` → smena solishtiruvi hech qachon ko'rinmaydi. | `ProfileViewModel.kt:69-76` · `HomeBottomPanel.kt:150-154` · `HomeViewModel.kt:79, 486` | «Qabul darajasi 100%» — o'ylab topilgan raqam. `DIZAYN_QOIDALARI` ning «prototip elementi ma'lumotsiz jo'natilmaydi» qoidasini buzadi. | **S** |
| **K14** | **Komissiya ilovada ko'rinmaydi.** `todayCommissions` DTO'da olinadi, `EarningsUiState.todayCommission` ga yoziladi, **hech qayerda chizilmaydi**. Komissiya faqat `RideCompletedScreen` da, u ham **12 soniyada o'z-o'zidan yopiladi**. | `EarningsViewModel.kt:53, 98` (chizilmagan) · `RideCompletedScreen.kt:70-74, 179-183` | Haydovchi platformaga qancha to'laganini hech qachon ko'ra olmaydi. Nizo chiqsa dalili yo'q. Ilovada balansni to'ldirish ham yo'q. | **M** |
| **K15** | **Eng muhim ekran — taklif oynasi — umuman tarjima qilinmagan.** `OfferPopup.kt` da **0 ta `stringResource`**; barcha yozuvlar o'zbekcha literal: «Qabul qilish», «Rad etish», «Taxminiy narx», «Naqd», «Manzilsiz (Taxometr)», «km uzoqlikda». `HomeScreen.kt` — 13 ta qattiq yozilgan matn, `ActiveRideSheet.kt:762-764` faza sarlavhalari ham. | `OfferPopup.kt` (butun fayl) · `HomeScreen.kt:335-353, 410-420` · `ActiveRideSheet.kt:761-766` | 229 satr ruscha tarjima bekorga yozilgan — ruszabon haydovchi 15 soniyalik qaror ekranini o'zbekcha o'qiydi. | **M** |

### 🟡 O'RTA

| # | Nima | fayl:qator | Izoh | Hajm |
|---|---|---|---|---|
| **M1** | Til almashtirish Android 13 dan pastda ishlamasligi ehtimoli katta | `MainActivity.kt:57` (`: ComponentActivity`) · `themes.xml:3` (`android:Theme.Material.NoActionBar`) · `LocaleManager.kt:21-37` | `AppCompatDelegate.setApplicationLocales` API<33 da faqat **AppCompatActivity** delegatlariga tegadi va manifestda `autoStoreLocales` meta-data yo'q. Android 8–12 da til tanlash hech narsa qilmasligi kutiladi. **Real qurilmada tekshirilishi shart.** | S |
| **M2** | `startForeground` try/catch'siz | `LocationForegroundService.kt:77-83` · `HomeViewModel.kt:770-773` | Android 14 da `location` tipidagi FGS uchun ruxsat o'sha lahzada bo'lmasa `SecurityException` → **crash**. Haydovchi sozlamalardan ruxsatni olib tashlab «Onlayn» bossa ilova yiqiladi. | S |
| **M3** | 4 ta o'lik tugma + Shartlar/Maxfiylik havolasi ishlamaydi | `BallsScreen.kt:427` · `ProfileScreen.kt:93` · `SettingsScreen.kt:229, 236` | «Maxfiylik siyosati» ni bosish hech narsa qilmaydi — Play uchun alohida xavf (§6). | S |
| **M4** | To'lov usuli chipi doim «Naqd» | `OfferPopup.kt:200-203` · `dispatch.service.ts:268-285` | Server `paymentMethod`/`vehicleClass` ni **umuman yubormaydi**; ilova `?: "cash"` fallback qiladi. Karta bilan to'lanadigan safarda haydovchi naqd kutadi. | S |
| **M5** | ~250 qator o'lik UI kodi | `HomeScreen.kt:287-304` (`RidePhaseButton`), `:306-381` (`IncomingBookingDialog`), `:398-548` (`ActiveRideCard`) | Hech qayerdan chaqirilmaydi (`grep` tasdiqladi), hammasi inline hardcoded ranglar bilan — dizayn qoidasini buzadi va kelajakda chalkashtiradi. | S |
| **M6** | Vaqt tugashi «rad etish» sifatida yuboriladi | `HomeViewModel.kt:743-753` | `driverRejectedOrTimeout` chaqiriladi; haydovchi taklifni ko'rmagan bo'lsa ham (K4) qabul reytingi tushadi. | S |
| **M7** | Sanoqlar `delay(1000)` siklida | `HomeViewModel.kt:568-579, 743-753` | Doze/process suspend paytida taymer sekinlashadi; kutish taymeri epoch'dan qayta hisoblansa ham, taklif sanog'i emas. | S |
| **M8** | Yakunlash ekrani 12 soniyada avto-yopiladi | `RideCompletedScreen.kt:70-74` | Haydovchi mashina haydayotgan bo'lsa yakuniy narx va komissiyani ko'rmay qoladi — qaytib ko'rish joyi yo'q (K14). | S |
| **M9** | **Bitta ham test yo'q.** `app/src/` da faqat `main` papkasi bor; `test`/`androidTest` mavjud emas, lekin dependency'lar e'lon qilingan | `app/build.gradle.kts:167-170` · `ls app/src/` = `main` | Avtomatik qamrov **0%**. B1/B3/B8 kabi shartnoma xatolarini bitta oddiy test tutgan bo'lardi. | L |
| **M10** | Sirlar repo ichida | `keystore.properties:4-6` (ochiq parollar) · `gradle.properties:11` (haqiqiy Maps API kaliti) | `.gitignore` `keystore.properties` ni qamrab olgan, lekin `gradle.properties` **qamramagan** — Maps kaliti `AIzaSyBAq…` git'ga tushgan. Cheklanmagan bo'lsa — kvota o'g'irlanadi. | S |
| **M11** | Unix `gradlew` yo'q — faqat `gradlew.bat` | `apps/driver-android/` ro'yxati | Linux CI yoki Mac'dagi ishlab chiquvchi build qila olmaydi (wrapper qayta generatsiya qilinishi kerak). CI'da APK yig'ish qo'shilsa darrov yiqiladi. | S |
| **M12** | Bekor qilish sababi backend'da e'tiborga olinmaydi; `client_no_show` qayta tarqatishga tushadi | `orders.service.ts:451-492` | (B1 tuzatilgandan keyin ham) `cancelledBy === 'driver'` bo'lsa buyurtma 3 martagacha **qayta tarqatiladi** — «mijoz chiqmadi» bo'lsa ham. Sabab satri hech qayerda o'qilmaydi. | M |
| **M13** | Chat xabariga ovoz/tebranish yo'q | `HomeViewModel.kt:724-740` | Faqat badge raqami oshadi. Haydovchi haydab ketayotganda mijoz xabarini **umuman sezmaydi**. | S |
| **M14** | Haydash paytidagi teginish maydonlari kichik | `ActiveRideSheet.kt:632-648` (48 dp), `:548-564` (bitta qatorda 4 ta boshqaruv) · `HomeScreen.kt:200-205` (SOS 48 dp, ekran burchagida) | 48 dp — Android minimumi, haydash uchun emas. «Bekor qilish» eng keng tugma sifatida qo'ng'iroq/navigatsiya yonida turadi. | S |
| **M15** | GPS xizmati o'chirilganligi tekshirilmaydi | `PermissionsScreen.kt:255-287` (faqat `checkSelfPermission`) | Ruxsat bor, lekin telefonda «Joylashuv» tizim darajasida o'chiq bo'lsa — hech qanday fix kelmaydi va ilova buni aytmaydi. | S |

### 🟢 KICHIK

| # | Nima | fayl:qator |
|---|---|---|
| S1 | `OfferTones.gen` — statik `ToneGenerator`, `shutdown()` hech qayerdan chaqirilmaydi | `OfferTones.kt:11, 37-42` |
| S2 | Token regex bilan ajratiladi (mo'rt) va `runBlocking` OkHttp interceptor ichida | `AppModule.kt:48, 62-79` |
| S3 | `catch (e: Exception) {}` — mutlaqo bo'sh | `HomeViewModel.kt:539` |
| S4 | O'lik API metodlari: `refreshToken`, `getNearestAddresses`, `getPopularAddresses` — hech qayerdan chaqirilmaydi | `ApiService.kt:17-18, 50-57` |
| S5 | `stopForeground(...)` hech qachon chaqirilmaydi; `onDestroy` faqat updates'ni olib tashlaydi | `LocationForegroundService.kt:85-90` |
| S6 | `SosFab` da o'lik `if (showHint)` bloki (bo'sh tana, ikki marta takrorlangan) | `SosFab.kt:141-147` |
| S7 | `heatmapOverlayRef` — fayl darajasidagi statik `var` (izohda tan olingan) | `DriverMapView.kt:387` |
| S8 | `@Get(':id')` `@Get('heatmap')` dan **oldin** e'lon qilingan. Fastify'da static route ustun turadi, shuning uchun hozir ishlaydi; Express'ga o'tilsa **darhol buziladi** | `drivers.controller.ts:57-60 vs 88-91` · `main.ts:75-77` |
| S9 | OTP tekshiruvi 4 xonali kodni ham serverga yuboradi (`code.length < 4`) — UI 6 xonali | `AuthViewModel.kt:100` |
| S10 | Narx 500 ga **pastga** yaxlitlanadi (`(withMin / 500) * 500`), izohda «eng yaqiniga» deyilgan | `HomeViewModel.kt:193-194` |
| S11 | Login'da `deviceModel`/`appVersion` yuborilmaydi → minSdk qarori uchun jonli o'lchov yo'q | `AuthViewModel.kt:106-109` |
| S12 | `NavigationLauncher` fallback `startActivity` try/catch'dan tashqarida — u ham otilishi mumkin | `NavigationLauncher.kt:55-59` |

---

## 3. ENG KATTA 10 KAMCHILIK (ustuvorlik tartibida)

1. **Socket tokeni 15 daqiqada tugaydi va yangilanmaydi** — birinchi tarmoq uzilishidan keyin haydovchi butun smena davomida ko'rinmas bo'lib qoladi (`SocketManager.kt:50-52` · `auth.service.ts:432`).
2. **Bekor qilish endpoint'i har doim 400** — `cancelledBy`/`reason` vs `status`/`note` (`HomeViewModel.kt:646-649` · `orders.dto.ts:73-80`).
3. **Taximetr backend narxidan 30–60% past** — 2000/km vs 3000/km + daqiqa + tun (`HomeViewModel.kt:103` · `pricing.constants.ts:3-5`).
4. **Qabul tasdiqlanmaydi, xato tinglanmaydi** — haydovchi olmagan safarga ketadi (`SocketManager.kt:177-180` · `socket.gateway.ts:201`).
5. **Mijoz bekor qilganini haydovchi bilmaydi** — server `driver:{id}` xonasiga hech narsa yubormaydi (`socket.gateway.ts:290-315`).
6. **SOS server'ga yetmaydi, lekin «yuborildi» deb ko'rsatiladi** (`safety.controller.ts:14-18` · `HomeViewModel.kt:688-690`).
7. **Prod build ochiq HTTP** — tokenlar va GPS shifrsiz; Play review'ni ham to'xtatadi (`build.gradle.kts:89-92`).
8. **FCM ilova tomonida o'lik + payload turi noto'g'ri** — o'ldirilgan ilova hech qachon uyg'onmaydi (`build.gradle.kts:1-8` · `notifications.service.ts:42-47`).
9. **Offline navbat yo'q** — accept/reject/status jimgina yo'qoladi, o'lik navbat kodi yozilgan lekin ulanmagan (`SocketManager.kt:169-185` · `DataStore.kt:153-161`).
10. **«Nega buyurtma yo'q?» sababi ko'rsatilmaydi** — `verifyStatus` va balans filtri ilovada mavjud emas (`dispatch.service.ts:178-183`).

---

## 4. NIMA HAQIQATAN YAXSHI ISHLANGAN (halol tomon)

Bu ilova **prototip emas** — 12 815 qator ishlaydigan kod, va bir nechta joyda sifat bozor
darajasidan yuqori:

- **Taklif oynasi dizayni** — 785 qator: swipe-to-accept `Animatable` bilan (`OfferPopup.kt:571-705`),
  sanoq halqasi rang o'zgarishi bilan (`:246-336`), 5 s da haptika + beep, 3 s da shoshilinch beep
  (`:108-121`), tap-fallback (`:646-660`). Bu qism **raqibda umuman yo'q**.
- **Ovoz va TTS** — `USAGE_ALARM` bilan looping ringtone (jim rejimda ham eshitiladi), 6 s dan keyin
  10 qadamli fade-out, o'zbekcha TTS `ru` fallback bilan, manzil va masofani aytadi
  (`OfferSoundService.kt:100-182`). Haqiqiy haydash sharoiti o'ylangan.
- **Autentifikatsiya xatolarining tarjimasi** — `IOException` / 400 / 401 / 404 / 429 / 5xx uchun
  alohida o'zbekcha, harakat qilinadigan xabar, NestJS xato tanasidan `message` ni ajratib olish
  bilan (`AuthViewModel.kt:123-149`). Kam uchraydigan sifat.
- **Socket reconnect'da holat qayta yuborish** — `lastStatus`/`lastLoc` keshi va `EVENT_CONNECT` da
  darhol qayta emit qilish (`SocketManager.kt:39-40, 91-101, 162-167`), sababi izohda aniq yozilgan.
  To'g'ri va o'ylangan yechim.
- **Android 11+ FGS qoidasi to'g'ri hal qilingan** — servis `init` dan emas, ON_RESUME dan ishga
  tushiriladi, izohda sabab batafsil (`HomeViewModel.kt:755-768` · `HomeScreen.kt:98-110`).
- **Sxema mustahkamligi** — `coerceInputValues = true`, `@SerialName("break")` reserved-word uchun,
  har DTO maydonida sabab izohi (`AppModule.kt:28-37` · `Models.kt:15-37`). Bu xatolardan o'rganilgan.
- **Heatmap NaN himoyasi** — `isFinite()` filtri `HeatmapTileProvider` ga bermasdan oldin, sababi
  izohda (`DriverMapView.kt:269-279`). Aynan shu xato butun xaritani yiqitardi.
- **Play Services yo'q qurilmada fallback** — xarita o'rniga tushuntirish, ilova ishlashda davom
  etadi (`DriverMapView.kt:103-130`).
- **Idempotent komissiya (backend)** — `db.transaction` + `unique(orderId,type)` tekshiruvi
  (`orders.service.ts:936-948`).
- **ProGuard qoidalari** — kotlinx-serialization `$serializer` keep, Hilt, Retrofit, socket.io —
  to'liq va to'g'ri (`proguard-rules.pro:8-50`). Bu oldingi auditning bloklovchisi edi, hal qilingan.
- **Bekor qilish sababi varag'i, kutish taymeri, chat dedupe, hujjat yuklash, gamifikatsiya ekrani** —
  hammasi real API bilan ulangan, qobiq emas.

Ya'ni: **ekran yozish ishi qilingan. Qolgani — uchini uchiga ulash va tekshirish ishi.**

---

## 5. EKRANMA-EKRAN HOLAT

| # | Ekran | Fayl | Holat | Nima yetishmaydi |
|---|---|---|---|---|
| 1 | Onboarding | `ui/onboarding/OnboardingScreen.kt` | ✅ To'liq | — |
| 2 | Auth (telefon + OTP) | `ui/auth/AuthScreen.kt` (613) | ✅ To'liq | 6 xonali kod tasdiqlandi (`:495,509`). `deviceModel` yuborilmaydi (S11) |
| 3 | SMS Retriever | `ui/auth/SmsRetrieverEffect.kt` | ✅ To'liq | — |
| 4 | Ruxsatlar | `ui/permissions/PermissionsScreen.kt` | 🔴 **Bloklovchi** | Android 11+ da fon-lokatsiya devori (B10); GPS xizmati tekshirilmaydi (M15) |
| 5 | Home (xarita+chrome) | `ui/home/HomeScreen.kt` (550) | 🟠 Yarim | ~250 qator o'lik kod (M5); 13 ta tarjimasiz matn; xatolar faqat snackbar'da, `error` state hech qachon tozalanmaydi (`:89-91`) |
| 6 | Xarita | `ui/home/DriverMapView.kt` | 🟠 Yarim | Har GPS tik'da kamera animatsiyasi (K8); xaritani o'chirish imkoni yo'q |
| 7 | Taklif oynasi | `ui/offer/OfferPopup.kt` (785) | 🟠 Yarim | Dizayni a'lo, **lekin faqat Home tabida** (K4); 0 ta tarjima (K15); `queuedCount=0`, `isOffline=false`, `onSwapToNext={}` — uchtasi ham `HomeScreen.kt:217-222` da qattiq yozilgan → navbat badge'i va offline banner **hech qachon chiqmaydi** |
| 8 | Faol safar varag'i | `ui/ride/ActiveRideSheet.kt` (778) | 🟠 Yarim | Bekor qilish 400 (B1); qo'ng'iroq tugmasi tiklashdan keyin o'lik (K10); teginish maydonlari kichik (M14) |
| 9 | Bekor sababi | `ui/ride/CancelReasonSheet.kt` | 🔴 **Amalda o'lik** | Yig'ilgan sabab 400 bilan qaytadi (B1); tuzatilsa ham backend uni o'qimaydi (M12) |
| 10 | Chat | `ui/home/ChatSheet.kt` | 🟠 Yarim | Ovoz/tebranish yo'q (M13); tiklashdan keyin telefon bo'sh; haydash paytida yozish talab qilinadi, tayyor javoblar yo'q |
| 11 | Safar yakunlandi | `ui/home/RideCompletedScreen.kt` | 🟠 Yarim | 12 s avto-yopilish (M8); komissiyani qayta ko'rish joyi yo'q (K14) |
| 12 | Smenadan keyin | `ui/earnings/AfterShiftSummary.kt` | 🟠 Yarim | `comparePct = null` — solishtirish bloki hech qachon chiqmaydi (`HomeViewModel.kt:486`) |
| 13 | Daromad | `ui/earnings/EarningsScreen.kt` (757) | 🟠 Yarim | Xato ko'rsatilmaydi → «0 so'm» (K6); komissiya ko'rsatilmaydi (K14); `hoursOnline` doim null |
| 14 | Ballar | `ui/balls/BallsScreen.kt` (842) | 🟠 Yarim | «Hammasini ko'rish» o'lik (`:427`) |
| 15 | Profil | `ui/profile/ProfileScreen.kt` (645) | 🟠 Yarim | «Avtomobilni tahrirlash» o'lik (`:93`); soxta `acceptanceRate=100`/`tier=bronze` (K13); xato yutiladi; logout GPS'ni to'xtatmaydi (K7) |
| 16 | Hujjatlar | `ui/documents/DocumentsScreen.kt` | 🟠 Yarim | Mobil internetda write-timeout (K12) |
| 17 | Sozlamalar | `ui/settings/SettingsScreen.kt` | 🟠 Yarim | «Shartlar» va «Maxfiylik» o'lik (`:229,236`) — Play xavfi |
| 18 | SOS | `ui/safety/SosFab.kt` | 🔴 **Yolg'on ijobiy** | Server'ga yetmaydi (B8); faqat safar paytida ko'rinadi (K5) |

**Erishib bo'lmaydigan ekran yo'q. Ammo 3 ta ekran (Ruxsatlar, Bekor sababi, SOS) amalda o'z vazifasini bajarmaydi.**

---

## 6. GOOGLE PLAY TEKSHIRUVINI TO'XTATADIGAN YOKI KECHIKTIRADIGAN NARSALAR

| Xavf | Isbot | Nima bo'ladi |
|---|---|---|
| **1. Fon-lokatsiya deklaratsiyasi** — `ACCESS_BACKGROUND_LOCATION` so'raladi | `AndroidManifest.xml:14` · `PermissionsScreen.kt:55` | Play Console'da alohida **Permissions Declaration Form** + **demo video** (fon-lokatsiya nima uchun kerakligini ko'rsatuvchi) talab qilinadi. Bu **odatda 1–3 hafta** ko'rib chiqish. Hozir ilovada foydalanuvchiga ko'rsatiladigan «nega kerak» ekrani bor (`perms_bg_location_body`) — bu yaxshi, lekin forma va video **hali topshirilmagan** (repoda hech qanday iz yo'q). |
| **2. Ochiq HTTP (cleartext)** — prod build shifrsiz IP'ga uriladi | `build.gradle.kts:89-92` · `AndroidManifest.xml:41` · `network_security_config.xml:7` | Play avtomatik skanerlash **«Insecure network communication»** ogohlantirishini beradi; foydalanuvchi ma'lumoti (JWT + GPS) shifrsiz uzatilgani **Data Safety** deklaratsiyasiga zid bo'lsa — rad etish. **HTTPS domen shart.** |
| **3. Maxfiylik siyosati havolasi o'lik** | `SettingsScreen.kt:236` (`/* placeholder */`) | Play joylashuv ma'lumotini yig'adigan har ilovadan **ishlaydigan maxfiylik siyosati URL'i** talab qiladi — ham Console'da, ham ilova ichida. Bosilganda hech narsa qilmaydigan tugma = rad etish sababi. Xuddi shu «Shartlar» (`:229`). |
| **4. Data Safety formasi** | Ilova yig'adi: aniq joylashuv (uzluksiz), telefon raqam, chat matni, hujjat rasmlari (`ApiService.kt:92`), FCM tokeni | Bu formani to'ldirish **majburiy** va yig'ilayotgan har toifa aniq e'lon qilinishi kerak. Repoda tayyorlanmagan. |
| **5. Chiqishdan keyin ham kuzatuv davom etadi** | `ProfileViewModel.kt:167-175` (servis va socket to'xtatilmaydi) | «Foydalanuvchi rozilikni bekor qilgandan keyin ma'lumot yig'ish to'xtashi kerak» — bu siyosat buzilishi. Tekshiruvchi buni sinab ko'rishi ehtimoli past, lekin shikoyat bo'lsa — akkaunt xavfi. |
| **6. `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** | `AndroidManifest.xml:30` · `PermissionsScreen.kt:142-149` | Play bu ruxsatni **cheklangan** deb hisoblaydi; faqat tor ro'yxatdagi holatlar uchun ruxsat berilgan. GPS-kuzatuvli haydovchi ilovasi odatda o'tadi, lekin **asoslash so'raladi** — tayyor javob bo'lishi kerak. |
| **7. `foregroundServiceType="location"` asoslash** | `AndroidManifest.xml:70` | targetSdk 34+ dan boshlab har FGS turi uchun Play Console'da **alohida deklaratsiya** kerak. To'ldirilmagan bo'lsa yuklash bosqichida to'xtaydi. |
| **8. Release debug kalit bilan imzolanishi mumkin** | `build.gradle.kts:17-19, 78-81` | `keystore.properties` va `keystore/` **`.gitignore` da** — CI mashinasida yo'q bo'lsa build **jimgina debug kalitga tushadi** va Play bunday APK'ni **qabul qilmaydi** («Debug certificate»). Fallback ogohlantirish bermaydi — CI'da `hasReleaseKeystore == false` bo'lsa build **yiqilishi** kerak. |
| **9. Maps API kaliti git'da** | `gradle.properties:11` (`.gitignore` uni qamramaydi) | Play xavfi emas, lekin kalit cheklanmagan bo'lsa hisobingizdan pul ketadi. |

**Xulosa:** Play'ga topshirishdan oldin **majburiy**: HTTPS domen (2), ishlaydigan maxfiylik
siyosati (3), fon-lokatsiya formasi + video (1), Data Safety (4), FGS deklaratsiyasi (7), imzo
kafolati (8). Bu **kod ishi emas, hujjat ishi** — lekin usiz ilova do'konga chiqmaydi.

---

## 7. NIMANI TEKSHIRMADIM (halollik uchun)

1. **Hech narsa ishga tushirilmadi** — Gradle build, lint, emulator, real qurilma, tarmoq so'rovi.
   Barcha xulosa statik o'qishdan. B1/B8 (ValidationPipe 400) mantiqiy zanjirdan chiqarilgan —
   bitta `curl` bilan 30 soniyada tasdiqlanadi va shundan boshlash kerak.
2. **M1 (til almashtirish API<33 da)** — real Android 8–12 qurilmada sinalishi shart.
3. **APK ichi ochilmadi**, R8 chiqishi tekshirilmadi.
4. **Backend to'liq audit qilinmadi** — faqat ilova tegadigan yo'llar (`socket`, `orders`, `drivers`,
   `dispatch`, `pricing`, `safety`, `chat`, `driver-documents`, `notifications`, `auth`).
5. **Dizayn auditi** (`DIZAYN_QOIDALARI.md` 17 qoidasi) ekranma-ekran qilinmadi — faqat yo'l-yo'lakay
   uchragan buzilishlar (o'lik tugmalar, soxta raqamlar, jim yo'qolishlar) qayd etildi.
6. **Batareya/data raqamlari o'lchanmadi** — K8 konfiguratsiya tahlilidan, o'lchovdan emas.

---

## 8. TAVSIYA ETILGAN TARTIB

1. **Bir kun: shartnoma xatolari** — B1 (cancel DTO), B8 (SOS DTO). Ikkalasi ham backend'da bir necha
   qatorlik o'zgarish + ilovada body moslashtirish. Bularsiz ilova yolg'on gapiradi.
2. **Ikki kun: B2 (socket token)** — token yangilanganda socketni qayta ulash + `'error'` tinglovchisi
   + reconnect'da yangi tokenni DataStore'dan o'qish. Eng katta yagona yutuq.
3. **Yarim kun: B3 (taximetr narxi)** — narx konstantalarini backend'dan `/drivers/me` bilan olib
   kelish (kodda allaqachon `TODO` sifatida yozilgan, `HomeViewModel.kt:99-101`).
4. **Bir kun: B4 + B5** — `driver:offer_accepted` / `order:cancelled` voqealarini `driver:{id}`
   xonasiga qo'shish + ilovada tinglovchi.
5. **Bir kun: B7 + Play hujjatlari** — HTTPS domen, maxfiylik siyosati, deklaratsiyalar.
6. **Keyin:** B6 (FCM data-payload + `google-services.json`), B9 (offline navbat), B10 (ruxsat devori),
   K1 (sabab ko'rsatish), K8 (batareya).

---

**READY FOR VERIFICATION** — har da'vo `fayl:qator` bilan yuqorida. Mustaqil tekshiruvchi uchun eng
tez 6 ta tekshiruv:

```bash
cd "1067-taxi/apps/driver-android"
grep -n "cancelledBy" app/src/main/java/com/taxi1067/driver/ui/home/HomeViewModel.kt   # → :647
grep -n "note?" ../api/src/modules/orders/dto/orders.dto.ts                            # → :79 (mos emas)
grep -n "forbidNonWhitelisted" ../api/src/main.ts                                      # → :117 true
grep -rn "PER_KM" app/src/main/java/ ; grep -n "PER_KM_RATE" ../api/src/modules/pricing/pricing.constants.ts  # → 2000 vs 3000
grep -n "expiresIn: 900" ../api/src/modules/auth/auth.service.ts                        # → :251,:270 (15 daq)
find . -name "google-services.json" -not -path "*/build/*"                             # → bo'sh
```
