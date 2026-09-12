# VA'DA vs HAQIQAT — telefon / CTI / admin panel

**Sana:** 2026-09-10 · **Rejim:** faqat-o'qish (kod o'qildi, git tarixi o'qildi; **jonli tizimga
ulanilmadi**, hech qanday fayl o'zgartirilmadi — faqat shu hisobot yozildi).

**Tekshirilgan hujjatlar (va'dalar manbasi):**
`TELEFON_PLAN.md` (2026-08-19) · `ADMIN_PANEL_JAVOB.md` (2026-08-19) · `ADMIN_QOSHIMCHALAR.md` (2026-09-08)

**Tekshirilgan kod:**
**A** = jonli BirJoy bot `C:\Users\sarva\Desktop\1067 bot` (`packages/server|admin|miniapp`, Prisma)
**B** = taksi yadrosi `C:\Users\sarva\Desktop\1067 bot\1067-taxi` (NestJS `apps/api`, Next admin `apps/web`,
`apps/driver-android`, Drizzle `packages/db/src/schema`)

**«Jonli» mezoni:** A'da bayroq `EXPECTED_ON` ro'yxatida bo'lsa (`packages/server/src/services/featureFlags.ts:215-287`)
— ya'ni ega QABUL bergan va boot'da solishtiriladigan holat. Shu qoida bo'yicha tekshirdim va har
safar aytdim.

---

## 1. HALOL XULOSA — bir xatboshi

Uch hujjatdagi **51 ta aniq va'dadan 11.5 tasi bajarilgan — ya'ni ~23%** (BAJARILGAN = 1 ball,
QISMAN = 0.5 ball, YO'Q/ULANMAGAN = 0; sanoq §2 dagi jadval satrlariga teng: TELEFON_PLAN 14 satr →
**0**, ADMIN_PANEL_JAVOB 12 satr → **4.5**, ADMIN_QOSHIMCHALAR 25 satr → **7**). Undan ham achchiqrog'i:
bu hujjatlar **sababli** yozilgan kodni git'da faqat **bitta** commit'da topdim — `7cdc0f34`, u
`ADMIN_PANEL_JAVOB.md` ning ikkita bandini bajargan (`excludedTickets` ro'yxati va `willDraw` tuzatishi;
kodda o'z izohi bilan: `oyinService.ts:1350`, `oyinService.ts:2417`, `packages/shared/src/oyin.ts:591`).
Qolgan «qisman» ballarning deyarli hammasi hujjatdan **oldin** yozilgan kod (masalan B'dagi CTI
2026-04-28 dagi `de9a001` commit'i, ADMIN_QOSHIMCHALAR'dan 4 oy oldin) — ya'ni ular «va'da bajarildi»
emas, «va'da yozilganda allaqachon bor edi». `TELEFON_PLAN.md` — **noldan nolgacha**: butun repo bo'ylab
`Kontakt|phoneBook|contactImport|importKontakt|telefonraw` qidiruvi **faqat hujjatning o'ziga** tegadi,
`PROGRESS.md` da 0 marta, `ARCHITECTURE.md` da 0 marta eslatilgan. Eganing yodida qolgan
«qo'ng'iroq qilgan raqam admin panelda o'zi chiqsin» va'dasi esa — **bu uch hujjatda YO'Q**;
u `TAXI_10X_PLAN.md:384` va `BIRJOY_TAXI_MASTER.md` §C da yozilgan, VA **kodda ham bor** (B'da,
`operator-phones.controller.ts:143` → `IncomingCallPopup.tsx`), lekin uni **hech kim ishga tushira
olmaydi**: qo'ng'iroqni sezib serverga yuboradigan tomon (operator-helper APK yoki SIP) umuman
yozilmagan, va popup'dan operator ekraniga o'tish ham uzilgan (§4).

---

## 2. VA'DA ↔ HAQIQAT JADVALI

Status faqat beshtadan biri: `BAJARILGAN` · `YOZILGAN, ULANMAGAN` · `QISMAN` · `YO'Q` · `FLAG BILAN O'CHIQ`.

---

### 2.1 `TELEFON_PLAN.md` — 14 va'da, **0 bajarilgan (0%)**

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| T1 | «bitta yangi jadval» `model Kontakt` (§1, :46-70) | **YO'Q** | `grep -n "^model" packages/server/prisma/schema.prisma` → `Kontakt` yo'q (ro'yxat `Member`…`StaffGoal`, `ServiceListing:1397`, `ServiceRequest:1492` bor). Repo-bo'ylab `Kontakt` qidiruvi → **faqat `TELEFON_PLAN.md`** | Butun modul uchun poydevor yo'q |
| T2 | `phone @unique` + `searchText` + `importBatch` (§1, :75-82) | **YO'Q** | Yuqoridagi bilan bir xil — jadval yo'q | Dedupe/rollback mexanizmi yo'q |
| T3 | `services/phoneBook.ts` — `searchPhones(q, {limit, includeRaw})` (§3, :107-111) | **YO'Q** | `ls packages/server/src/services/` da fayl yo'q; `grep -r "phoneBook"` → 0 (faqat hujjat) | Qidiruv yadrosi yozilmagan |
| T4 | AI qatlami: `expandTerms()` ni `/telefon` qidiruviga ulash (§3, :114-116) | **YO'Q** | `expandTerms` **bor** (`packages/server/src/services/ai/providers/catalogFactory.ts:28`), lekin uni chaqiradigan telefon-qidiruv yo'q | Mavjud AI yordamchisi ulanmagan |
| T5 | `services/contactImport.ts` — 2 JSON shakl, dedupe, avto-tasnif, upsert (§4, :132-157) | **YO'Q** | Fayl yo'q; `grep -r "contactImport"` → 0 | Import yadrosi yo'q |
| T6 | `scripts/importKontakt.ts` — CLI, default dry-run, `--commit` (§4, :170) | **YO'Q** | `ls packages/server/src/scripts/ \| grep -i "kontakt\|telefon"` → faqat `diagBookingPhone.ts` | Birinchi partiyani yuklash yo'li yo'q |
| T7 | Admin «📥 Import» paneli + «➕ Bitta raqam qo'shish» (§4, :172-174) | **YO'Q** | `grep -r "admin/kontakt" packages/` → 0 | SSH'siz import yo'q |
| T8 | Admin «📞 Ma'lumot» operator ekrani: avto-fokus qidiruv, ↑↓/Enter nusxalash (§5, :183-204) | **YO'Q** | `packages/admin/src/App.tsx` da `MalumotView` yo'q; «Ma'lumot» so'zi faqat begona kontekstda (`:1587`, `:2803`, `:4067`) | Operator ekrani yo'q |
| T9 | Operator amallari: `[📞 Berdim]` `[❌ Ishlamadi]` `[😔 Topolmadim]` `[⬆️ Katalogga chiqarish]` (§5, :205-211) | **YO'Q** | `callCount`/`lastUsedAt`/`promote` uchun jadval ham, route ham yo'q | `ServiceRequest:1492` va `adminListRequests` (`serviceDirectory.ts:863`) tayyor turibdi — ulanmagan |
| T10 | Bot `/telefon` oqimi + «➕ Raqamimni qo'shish» (§6, :217-242) | **YO'Q** | `ls packages/server/src/bot/` → `telefon.ts` yo'q (18 fayl: `booking.ts`…`xizmatlar.ts`) | `submitListing` (`serviceDirectory.ts:250`) tayyor — chaqiruvchi yo'q |
| T11 | Yangi bayroqlar `telefon` + `telefonraw`, ikkalasi DARK (§2 T-9, §7) | **YO'Q** | `featureFlags.ts:7` `FEATURES` ro'yxatida ikkalasi ham **yo'q**; `:182` `DEFAULT_OFF` da yo'q; `:215-287` `EXPECTED_ON` da yo'q | Bayroq nomi hatto e'lon ham qilinmagan |
| T12 | `api/server.ts` +7 route `/api/admin/kontakt/{search,used,bad,note,promote,one,import}` (§7) | **YO'Q** | `grep -rn "admin/kontakt" packages/server/src packages/admin/src` → 0 | — |
| T13 | `scripts/addIndexes.ts` + `pg_trgm` + GIN indeks (§7) | **YO'Q** | `grep -n "pg_trgm\|gin_trgm\|GIN" packages/server/src/scripts/addIndexes.ts` → 0 | — |
| T14 | `scripts/testPhoneBook.ts` + `.gitignore`ga `packages/server/data/` (§7) | **YO'Q** | Test fayli yo'q; `grep -n "data" .gitignore` → 0 satr | Xom JSON himoyasi ham yo'q |

**Kontekst (halol bo'lish uchun):** hujjatning o'zi «**Holat: REJA — kod yozilmagan, egadan TASDIQ
kutilmoqda**» (`:17`) deb boshlanadi va §10 da egadan ikki narsa so'raydi: JSON fayl + tasdiq.
Ikkalasi kelgani haqida hech qanday iz yo'q. Ya'ni bu «buzilgan va'da» emas, **boshlanmagan ish** —
lekin u haqida **hech qachon qayta gapirilmagan**: `PROGRESS.md` da `TELEFON_PLAN|Kontakt` → 0 marta,
`ARCHITECTURE.md` (175 qator, oxirgi o'zgarish 2026-07-27) da `telefon` → 0 marta.

**§0 dagi «allaqachon bor» jadvali esa rost** (tekshirdim): `normalizeUzPhone`
(`serviceDirectory.ts:19`), `submitListing` (`:250`), `adminListRequests` (`:863`), `expandTerms`
(`catalogFactory.ts:28`), `ServiceCategory/ServiceListing/ServiceRequest` (`schema.prisma:1388/1397/1492`).
Poydevor rost — ustiga hech narsa qurilmagan.

---

### 2.2 `ADMIN_PANEL_JAVOB.md` — 12 va'da, **4 bajarilgan + 1 qisman (37.5%)**

Bu hujjat auditdir; «va'da» deb §1.6 («Nima qilinishi kerak») va §3.4 («Tavsiya qilingan tartib»)
bandlarini oldim, ustiga hujjat aniq nomlagan va keyin tuzatilgan 2 nuqsonni qo'shdim.

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| J1 | §1.6: `OyinDrawExport`ga `excludedTickets` (kim·qaysi sovrin·nega) + Kartalar ekranida ikkinchi jadval; `tickets` va hash **o'zgarmasin** | **BAJARILGAN** | Tip: `packages/shared/src/oyin.ts:591,619,621` · server: `oyinService.ts:2417,2421-2452,2479` · UI: `packages/admin/src/oyin/Kartalar.tsx:73` (`exp.excludedTickets ?? []`), `:175-193` («🚫 Tirajga kirmagan kartalar» jadvali, sabab ustuni bilan). Hash va `tickets` mantiqi tegilmagan | — |
| J2 | §1.6: «Hali birorta karta chiqarilmagan» yolg'on matni haqiqatga keltirilsin | **BAJARILGAN** | `Kartalar.tsx:159-165`: chiqarilganlar bo'lsa «Tirajga kiruvchi karta yo'q — lekin N ta karta CHIQARILGAN…», aks holdagina eski matn | — |
| J3 | §1.6: `Nazorat.tsx:192` / `Konsol.tsx:53` dagi sarlavha **«Sotilgan karta»** deb qayta nomlansin | **YO'Q** | `Kartalar.tsx:78` `Stat k="Chiqarilgan karta"` (manba `exp.tickets.length`) **va** `Nazorat.tsx:124`, `Nazorat.tsx:192` `k="Chiqarilgan karta"` (manba `vitals.cardsIssued`) — bir xil sarlavha, ikki xil raqam **hali ham** | Panel o'zi bilan zid gapirishda davom etadi |
| J4 | §3.4-1: `Sozlama.tsx` da `useMemo` ni `if (a.err) return` dan **yuqoriga** ko'chirish + `<Konsol/>` atrofiga ErrorBoundary | **YO'Q** | `packages/admin/src/oyin/Sozlama.tsx:194` `if (a.err) return <ErrBox …>` **oldin**, `:196` `const used = useMemo(...)` **keyin** — hook tartibi buzuq holicha. `grep -rn "ErrorBoundary\|componentDidCatch\|getDerivedStateFromError" packages/admin/src` → **0 natija** | Server xato bersa audit-jurnal hali ham butun panelni oq ekranga olib boradi |
| J5 | §3.4-2: 7 ta YOLG'ON toast haqiqatga keltirilsin (`ok` tekshirilsin) | **YO'Q (0/7)** | Hammasi joyida turibdi: `App.tsx:1811` (do'kon pauza, `:1809` `.catch(() => undefined)`) · `App.tsx:3130` (rasmlar) · `App.tsx:3138` (e'lon o'chirish) · `App.tsx:3365` (haydovchi missiyasi) · `ravella.tsx:66` (kategoriya) · `oyin/Sozlama.tsx:383` (`done===0` da ham «✅ 0 ta karta bekor qilindi») · `oyin/Hikoyalar.tsx:29` (server `{ok:false}` qaytarsa ham «✅ Tasdiqlandi — ball darhol tushdi») | Hujjat ko'rsatgan qator raqamlari bilan **aynan mos** — 3 hafta ichida bitta ham tegilmagan |
| J6 | §3.4-3: `App.tsx:3718` Telegram-ulash (ma'lumot buzadigan xato) tuzatilsin | **YO'Q** | `App.tsx:3718` `const tgId = users?.find((u) => u.telegram)?.telegram?.id ?? null;` — hamon **birinchi** foydalanuvchining telegrami; tugma `App.tsx:3810` `onClick={() => relink(u.id)}` bosilgan qatordan qat'i nazar shu `tgId` ni ko'chiradi | Yagona ma'lumot-buzadigan xato tirik |
| J7 | §3.4-4: `willDraw` haqiqiy hovuzdan hisoblansin **+** 6 sabab tarjima qilinsin | **QISMAN** | ✅ `willDraw`: `oyinService.ts:1349-1362` — `adminListCatalog` endi `cachedDrawPools()` dan `pool.cards.length >= minSell` bilan hisoblaydi, kodda `// 🔴 ADMIN_PANEL_JAVOB §2.5 (tuzatildi 2026-08-19)` izohi bilan. ❌ Tarjima: `Kartalar.tsx:229` hamon faqat `not_in_list` ni o'zbekchalashtiradi, qolgani `⛔ ${r.reason}` xom holicha | 6 sababdan 5 tasi hamon xom (`not_ready`, `not_frozen`, `already`, `write_failed`, `unknown_prize`) |
| J8 | §3.4-5: `useAct()` helperi butun panelga tarqatilsin (~62 jim tugma) | **YO'Q** | `grep -rn "useAct" packages/admin/src` → **0 natija**. Namuna sifatida eng xavfli uchtasi hamon `.catch`siz: muzlatish `Kartalar.tsx:95-98`, g'olib qayd etish `Kartalar.tsx:227-230` (`.then().finally()`, catch yo'q), topshirish `Kartalar.tsx:123-127` | Jonli efirda 403/500 hamon jimlik |
| J9 | §3.4-6: ESLint + `react-hooks/rules-of-hooks` CI `shield` ishiga qo'shilsin | **YO'Q** | Repo ildizida `.eslintrc*` yo'q; `grep -rn '"lint"' package.json packages/*/package.json` → 0; `.github/workflows/ci.yml` qadamlari: typecheck → vitest → simEconomy/simLoyalty/simGuards → frontend build — **lint qadami yo'q** | J4 sinfidagi xatolar hamon topilmaydi |
| J10 | §3.4-7: v2 haqida ONGLI qaror (tugatish yoki tashlash) | **YO'Q** | `packages/admin/src/v2/nav.ts` da 26 ta manzil e'lon qilingan, `v2/AdminV2.tsx:58-63` `Router` faqat 4 tasini beradi (`bugun`, `odamlar`, `jonli`, `hikoyalar`), qolgani `Todo` plashkasi (`:33-56`). O'yin bo'limi hamon `nav.ts` da yo'q | Ikki xil haqiqat davom etmoqda (auditdan beri faqat `hikoyalar` qo'shilgan) |
| J11 | §2.4 da nomlangan nuqson: g'olib qayd etish **audit jurnaliga tushmaydi** | **BAJARILGAN** | `packages/server/src/api/server.ts:2819` route ichida `:2829` izohi bilan `writeAudit({...})` — «§2.4: the ONE irreversible action … was the only one leaving no audit row» | Kichik qarz: `action: "freeze.set"` sifatida yoziladi, alohida `draw.winner` yo'q (kodda TODO) |
| J12 | §2.3 da nomlangan nuqson: rad javoblari mashina-o'qiydigan `reason` bilan qaytsin | **BAJARILGAN (server), panelda ko'rinmaydi** | `server.ts:2821-2824`: 400 endi `{ ok:false, reason:"bad_request" }` qaytaradi | Panel tomoni J7 ning ikkinchi yarmi — tarjima yo'q |

---

### 2.3 `ADMIN_QOSHIMCHALAR.md` — 25 va'da, **1 bajarilgan + 12 qisman (28%)**

⚠️ Bu hujjat git'ga **hech qachon commit qilinmagan** (`git log -- ADMIN_QOSHIMCHALAR.md` → bo'sh;
`git status` da `?? ADMIN_QOSHIMCHALAR.md`). Ya'ni u rasman loyihaning bir qismi ham emas.

#### §1 — Ratsiya orqali manzil belgilash («eng muhim yangilik»)

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| Q1 | Buyurtmaga 3 maydon: `dropoffPlaceId` · `dropoffText` · `dropoffSource` (§1.4, :83-88) | **YO'Q** | B: `grep -rn "dropoffPlaceId\|dropoffText\|dropoffSource" apps packages` → 0. A: `packages/` bo'ylab ham 0. B'da faqat `packages/db/src/schema/orders.ts:47-49` `destLat/destLng/destAddress` bor — **manba (kim aytdi) yozilmaydi** | Ratsiyadan kelgan ma'lumotni ilova ma'lumotidan ajratib bo'lmaydi |
| Q2 | Operator band haydovchi tanlanganda o'ng panelda «📍 Qayerga?» yozadi (§1.2-1.3, :44-77) | **YO'Q** | Manzilni faqat **buyurtma yaratishda** yozish mumkin: `apps/web/src/app/dashboard/operator/page.tsx:1044-1046` («Borish manzili» inputi) → `:499` `POST /operator/orders`. Buyurtma yaratilgach manzilni yozadigan endpoint **yo'q**: `orders.controller.ts` dagi o'zgartiruvchi route'lar faqat `:51 arrived`, `:58 start`, `:65 complete`, `:72 cancel`, `:172 cancel-admin` | Hujjatning asosiy g'oyasi — safar **o'rtasida** manzil yozish — umuman yo'q |
| Q3 | Katalog avtoto'ldirishi («ravot» → `Ravot mahalla`), taxminiy moslashtirish taqiq (§1.2, :51-56) | **QISMAN** | Katalog va qidiruv endpointi **bor**: `apps/api/src/modules/addresses/*.controller.ts` `@Get('search')`, `@Get('popular')`, `@Get('nearest')`. Lekin ular hech qanday «qayerga» maydoniga ulanmagan; haydovchi ilovasida esa `ApiService.kt:50-57` da e'lon qilingan-u, `getNearestAddresses/getPopularAddresses` **hech qayerdan chaqirilmaydi** | Ma'lumot manbai bor, ekran yo'q |
| Q4 | Zanjir taklifi: «⏭ Yaqinda 2 buyurtma» manzil belgilangach chiqadi (§1.2, :48; §1.3, :73) | **YO'Q** | `grep -rn "chainOrder\|chain_order\|zanjir"` (B) → 0; A'da `chainOffer\|zanjirli\|nextOrderOffer` → 0. Tayinlash faqat `eq(drivers.status,'online')` bilan ishlaydi (`apps/api/src/modules/dispatch/dispatch.service.ts:179`), haydovchi `:371`/`:431` da `on_ride` ga o'tadi va nomzodlikdan chiqadi | Hujjatdagi «ta'minot 30-40% samaraliroq» va'dasining butun mexanizmi yo'q |
| Q5 | «Ikki operator bir vaqtda yozdi → oxirgisi g'olib, ikkalasi ham audit jurnalida» (§1.6, :110) | **YO'Q** | Yozadigan maydon yo'q (Q1/Q2), audit esa butun B'da atigi 2 joyda chaqiriladi: `orders.service.ts:456`, `drivers.service.ts:137` | — |
| Q6 | 2-bosqich: haydovchi ilovasida ixtiyoriy «Qayerga?» (§1.5, :92-99) | **YO'Q** | `HomeViewModel.kt:626-646` `startRide()` to'g'ridan-to'g'ri `RidePhase.IN_PROGRESS` ga o'tadi; faza enum'ida (`:31`) bunday holat yo'q; butun ride/home UI'da 2 ta matn maydoni bor — bekor qilish sababi (`CancelReasonSheet.kt:107`) va chat (`ChatSheet.kt:197`). Manzil faqat **o'qiladi**: `ActiveRideSheet.kt:255`, manzilsizda `OfferPopup.kt:458` «Manzilsiz (Taxometr)» | — |

#### §2 — Eski sessiya rejalariga berilgan baholar (ustuvorlik bilan)

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| Q7 | ①🔴 Yetti qatlamli fon himoyasi (FCM+soket+WorkManager+Boot+polling) (:124) | **QISMAN (≈4/7)** | ✅ FCM `service/TaxiFirebaseMessagingService.kt:41,80` (manifest `AndroidManifest.xml:75-81`) · ✅ Socket.IO `service/SocketManager.kt:105` (reconnect `:98-103`) · ✅ Foreground servis `service/LocationForegroundService.kt:78,81` (`START_STICKY`, `stopWithTask=false`) · ✅ Batareya-optimizatsiya so'rovi `ui/permissions/PermissionsScreen.kt:144`. ❌ WorkManager — `androidx.work` `app/build.gradle.kts` da yo'q · ❌ BOOT receiver — ruxsat `AndroidManifest.xml:28` bor, **`<receiver>` elementi yo'q** · ❌ Offer uchun polling — yagona davriy halqa `HomeViewModel.kt:547` **demand-heatmap** (60s), buyurtma emas | FCM `onMessageReceived` faqat bildirishnoma ko'rsatadi — servisni ham, soketni ham uyg'otmaydi. Reboot/process-kill'dan keyin haydovchi ilovani **qo'lda** ochmasa onlaynga qaytmaydi. Ishlab chiqaruvchi «autostart» oq ro'yxati (Xiaomi/Huawei/Oppo) umuman yo'q |
| Q8 | ②🔴 Zanjirli buyurtma (:125) | **YO'Q** | Q4 bilan bir xil isbot | — |
| Q9 | ③🔴 Ratsiya (PTT) (:126); §4 wave-1 №4 «Ratsiya paneli» | **YO'Q** | B: `rg -n "LiveKit\|livekit"`, `rg -n "WebRTC\|RTCPeerConnection\|getUserMedia"`, `rg -n "push.?to.?talk\|pushToTalk\|walkieTalkie"` → hammasi 0. A: `grep -rn "livekit\|LiveKit\|push-to-talk\|PTT" packages/*/src` → 0 | «Madaniy jihatdan majburiy» deb belgilangan funksiya — bitta qator kod yo'q |
| Q10 | ④🟡 Aniq GPS kuzatuv + **iz** (:127) | **QISMAN** | Jonli joylashuv bor, lekin **saqlanmaydi**: `apps/api/src/modules/location/location.service.ts:59-70` (Redis `geoadd`+`setex`, TTL bilan o'chadi), taximetr faqat yig'indi ushlaydi (`pricing/taximeter.service.ts:40-45`). Saqlanadigan yagona geometriya — **rejalashtirilgan** OSRM yo'li (`packages/db/src/schema/orders.ts:80 osrmRouteGeometry`). `rg -n "gpsTrack\|gps_track\|ride_track\|routePolyline\|trackPoints"` → 0 | Haqiqiy yurilgan iz hech qayerda yozilmaydi → nizoda ham, firibgarlikda ham dalil yo'q |
| Q11 | ⑤🔴 Nazorat signallari (2 daq haydovchisiz, 10 daq «yetib keldim» yo'q…) (:128) | **QISMAN** | Bor: `dispatch.service.ts:73` `sweepStuckOrders` (`DISPATCH_STUCK_SECONDS`, default **180s**, `:55`) · qizil qator `apps/web/src/app/dashboard/operator/page.tsx:1404-1416` (`no_drivers` → `border-red-500` + «Haydovchi topilmadi — qo'lda biriktiring») · Telegram ogohlantirishlari `monitoring/health-alerter.service.ts:52,66,133`. Yo'q: «2 daqiqa» va «10 daqiqa yetib kelmadi» signallari, **ovoz** (`rg "new Audio\|AudioContext\|navigator.vibrate" apps/web/src` → 0), konsol ichidagi signal-lentasi. `apps/api/src/modules/sla/` — **bo'sh papka**, `packages/db/src/schema/sla-violations.ts:8` jadvali hech qachon o'qilmaydi/yozilmaydi | Signal Telegramga ketadi, operator ekraniga emas — ya'ni «konsolning asosiy qiymati» hali yo'q |
| Q12 | ⑥🟡 Mijozga taxminiy narx — **diapazon bilan** (:129) | **QISMAN** | Diapazon hisoblanadi va ko'rsatiladi, lekin **operatorga**: `pricing/pricing.service.ts:154-155` (`×0.90`/`×1.15`) → `apps/web/.../operator/page.tsx:1172` `{fareRangeMin} - {fareRangeMax}`. Mijoz tomonida (A'ning miniapp/bot oqimi) manzil ham, diapazon ham yo'q | Va'da «mijozga» edi — mijoz ko'rmaydi |
| Q13 | ⑦🟡 Avto-SMS haydovchi SIM'idan (:130) | **YO'Q** | `AndroidManifest.xml:5-30` ruxsatlar ro'yxatida `SEND_SMS` yo'q; `rg "SmsManager\|sendTextMessage"` → 0. Ilova faqat **o'z** OTP'sini o'qiydi (Google SMS Retriever: `ui/auth/SmsRetrieverEffect.kt:36`) | — |
| Q14 | ⑧⛔ Ovozni yashirin tinglash — **QILINMAYDI** (:131) | **BAJARILGAN (taqiq hurmat qilingan)** | `rg "MediaRecorder\|RECORD_AUDIO\|AudioRecord\|startRecording" apps/driver-android/app/src` → **0 natija**, exit 1. SOS esa shaffof va faqat safar ichida: `ui/safety/SosFab.kt:65,80`, `HomeViewModel.kt:713,726` → `POST safety/sos/driver` | Yagona to'liq bajarilgan band — chunki u «qurma» degan band edi |
| Q15 | ⑨🔴 Operator amallari (qo'lda tayinlash, almashtirish, narx tuzatish) — **audit bilan** (:132) | **QISMAN** | Amallar bor va ekrandan yetib boradi: `operator/page.tsx:690` (`POST /operator/dispatch/manual`), `:1478` (reassign), `:719` (`PATCH /orders/:id/cancel-admin`). Audit esa **faqat bekor qilishda**: `orders.service.ts:456`. Qo'lda tayinlash `dispatch.service.ts:414-441` — `adminId` funksiyaga uzatiladi va **tashlab yuboriladi**, oxirida faqat `this.logger.log(...)`. Butun API'da audit atigi 2 joyda chaqiriladi | «Kim qaysi buyurtmani kimga berdi» — jurnalda yo'q |
| Q16 | ⑩🔴 Rollar: ega / operator (pul yopiq) (:133) | **QISMAN** | Backend: `common/guards/admin-auth.guard.ts:8-29` + `@Roles(...)` pul route'larida (`topup.controller.ts:39`, `commissions.controller.ts:17,28,39,50`, `pricing-admin.controller.ts:71`, `settings.controller.ts:18`, `admin-users.controller.ts:10`) — bugungi `017ffd5` commit'i bilan mahkamlangan. Frontend **teshik**: `apps/web/src/components/layout/Sidebar.tsx:39` `{ href:'/dashboard/finance', label:'Moliya' }` — `roles` kaliti **yo'q**, filtr esa (`Sidebar.tsx:80-82`) faqat `roles` e'lon qilganlarni yashiradi; `finance/page.tsx:40` da `const isSuperAdmin = …` yozilgan-u **ishlatilmaydi** | Dispetcher hisobida Moliya/Statistika/Hisobotlar menyusi ko'rinadi va ochiladi |

#### §3 — Avto-SMS bo'yicha chuqurroq qaror

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| Q17 | Xizmat-SMS haydovchi SIM'idan, qisqa, reklamasiz (:160) | **YO'Q** | Q13 bilan bir xil | — |
| Q18 | Marketing → server gateway (Eskiz) yoki Telegram, rozilik bilan (:161) | **QISMAN** | Eskiz **bor**, lekin faqat OTP uchun: `apps/api/src/modules/auth/eskiz.service.ts:29 sendSms`, chaqiruvchisi `auth.service.ts`. Marketing yo'li, rozilik bayrog'i yo'q | — |
| Q19 | SMS jurnali va opt-out ro'yxati (§4 wave-2 №11, :192) | **YO'Q** | `rg "sms_log\|smsLog\|sms_messages"`, `rg "sms_opt_out\|smsOptOut\|optOut"` → 0 | — |

#### §4 — Panelga qo'shiladigan ro'yxat (yuqorida takrorlanmaganlari)

| # | Va'da (hujjat satri) | Status | Isbot | Gap |
|---|---|---|---|---|
| Q20 | Uch panelli konsol — navbat / xarita / tanlangan (wave-1 №3, :179) | **QISMAN** | Konsol bor, lekin **to'rt ustunli va xaritasiz**: `operator/page.tsx:773` `grid grid-cols-4` → `:776` mijoz-CRM, `:1015` buyurtma berish, `:1267` bo'sh haydovchilar, `:1373` faol buyurtmalar. `LiveMap` faqat bosh sahifada (`dashboard/page.tsx:11,174`) va unda marker-tanlash ishlovchisi yo'q. Haydovchi bosilganda **modal** ochiladi (`:1315` → `:1498`), o'ng panel emas | Hujjatdagi maketning aynan o'zi (o'ng panel + xarita) yo'q |
| Q21 | Haydovchi 360 kartasi — tarix, reyting, qarz, GPS izi, shikoyatlar (wave-2 №7, :188) | **QISMAN** | `apps/web/src/app/dashboard/drivers/[id]/page.tsx:409-413` (reyting/qabul/safar/balans), `:445-478` (profil+samaradorlik), `:558-570` (to'ldirishlar), `:603-629` (buyurtma tarixi). Yo'q: GPS izi (Q10), shikoyatlar/tiketlar, SOS tarixi — `rg "shikoyat\|complaint\|SOS\|GPS"` shu fayl bo'yicha → 0. Qarz = manfiy balansning rangi, alohida daftar emas | — |
| Q22 | Yo'nalish xaritasi (O-D matritsa) (wave-2 №8, :189) | **YO'Q** (borig'i esa **YOZILGAN, ULANMAGAN**) | O-D umuman yo'q: `rg "originDestination\|od_pairs\|tripDirection"` → 0; `dest_lat/dest_lng` bo'yicha guruhlash hech qayerda yo'q. Faqat **pickup** issiqlik xaritasi bor: `admin/admin.service.ts:268 getProblemAreas` → `admin.controller.ts:50 @Get('analytics/heatmap')`, lekin `rg -rn "heatmap" apps/web/src` → **0 natija** — panelda ekrani yo'q | Q1/Q2 bo'lmasa O-D ma'lumoti to'planmaydi ham |
| Q23 | KPI paneli — topish vaqti, yetib kelish vaqti, bekor foizi (wave-2 №9, :190) | **QISMAN (1/3)** | Topish vaqti hisoblanadi: `admin.service.ts:310` `AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) as avg_wait_seconds`; web'da `analytics/page.tsx:56` da o'qiladi, lekin **KPI kartasi qilib chizilmaydi** (`:74-77` kartalari — faol/onlayn/tugagan/bekor sonlari). Yetib kelish vaqti umuman hisoblanmaydi (`driverArrivedAt` faqat `orders.service.ts:138` va `safety/cancellation.service.ts:124` da uchraydi). Bekor **foizi** yo'q — faqat xom son va pirog (`admin.controller.ts:71` → `analytics/page.tsx:66-71`) | — |
| Q24 | Firibgarlik signallari — soxta GPS, takrorlanuvchi juftlik, anomaliya (wave-2 №10, :191) | **YO'Q** | `rg "isFromMockProvider\|isMock\(\)"` → 0 (faqat testlarda `mockLocation` so'zi: `dispatch.service.spec.ts:60,173,333`); `rg "driverClientPair\|pairAnomaly\|repeatedPair\|collusion"` → 0. Yagona yaqin narsa — GPS sakrashini **filtrlash** (`taximeter.service.ts:73-74`) va qo'lda qora ro'yxat (`operator.service.ts:386`) | — |
| Q25 | Uchinchi to'lqin: smena rejalashtirish · haydovchi jalb quvuri · korporativ kabinet · devor tablosi (:194-197) | **QISMAN** | Haydovchi jalb quvuri **bor**: `apps/web/src/app/dashboard/outreach/` (+ `tel:` bilan bir-bosishda qo'ng'iroq `outreach/page.tsx:245`). Korporativ modul bor: `apps/api/src/modules/corporate/`. Smena rejalashtirish va devor tablosi — yo'q | Bu ikkisi hujjatdan **oldin** bor edi |

**§5 «Ochiq savollar» (5 ta) — VERDIKT YO'Q, chunki ular savol, va'da emas.** Faqat bitta faktni
qayd etaman: §5.1 «*Tavsiyam: BirJoy admin v2 ustun*» degan edi; amalda butun taksi ishi **B ning
o'z Next.js paneli**da davom etdi (25 ta `dashboard/*` sahifasi), BirJoy admin v2 esa hamon 4 ta
ekranda turibdi (J10). Ya'ni tavsiya ham, unga qarshi qaror ham hech qayerda yozilmagan — shunchaki
teskarisi qilingan.

---

## 3. JIMGINA TASHLAB KETILGAN

Quyidagilar **bir marta ham qayta eslatilmagan** — na `PROGRESS.md` da, na `ARCHITECTURE.md` da, na
keyingi commit xabarlarida:

1. **Butun `TELEFON_PLAN.md`** (14 deliverable). `grep -n -i "telefon_plan\|kontakt" PROGRESS.md` → 0;
   `grep -n -i "telefon" ARCHITECTURE.md` → 0. Hujjat `7cdc0f34` commit'ida repo'ga qo'shilgan va
   o'sha kundan beri unga birorta kod tegmagan.
2. **`telefon` va `telefonraw` bayroqlari** — `featureFlags.ts:7` dagi `FEATURES` ro'yxatiga hatto
   qo'shilmagan ham. Ya'ni «DARK chiqaramiz» degan va'daning eng arzon qismi ham bajarilmagan.
3. **`claude/taxi-system-drivers-bsa05f` shoxobchasidagi dispetcher kodi** —
   `ADMIN_QOSHIMCHALAR.md:116-118` uni «212 qator sof funksiya + 20 test + 3 jadval + `owndispatch`
   bayrog'i» deb maqtaydi. U **hech qachon `main`ga qo'shilmagan**: `git merge-base --is-ancestor
   acaa40cc main` → **NO**; `git branch -a --contains acaa40cc` → faqat o'sha remote shoxobcha;
   `git ls-tree -r main --name-only | grep dispatch` → bo'sh. CLAUDE.md ning «bitta shoxobcha»
   qoidasiga zid holda muzlab qolgan.
4. **`ADMIN_QOSHIMCHALAR.md` ning o'zi** — git'ga commit qilinmagan (`git log -- ADMIN_QOSHIMCHALAR.md`
   → bo'sh). Reja rasman mavjud emas.
5. **7 ta yolg'on tasdiq tugmasi** (J5) — audit ularni qator-raqami bilan ko'rsatgan, 3 hafta o'tib
   bittasi ham tuzatilmagan.
6. **Audit-jurnal oq ekrani + ErrorBoundary** (J4) — «1 qatorlik o'zgarish, butun panelni qutqaradi»
   deb yozilgan edi; `Sozlama.tsx:194` vs `:196` o'z holicha.
7. **Telegram-ulash ma'lumot buzadigan xatosi** (J6) — «yagona ma'lumot buzadigan xato» deb
   belgilangan, `App.tsx:3718` o'zgarmagan.
8. **ESLint / `rules-of-hooks`** (J9) — CI'da hamon yo'q.
9. **v2 panel qarori** (J10) — 22 ta bo'sh ekran hamon bo'sh, o'yin bo'limi hamon `nav.ts` da yo'q.
10. **«Sotilgan karta» qayta nomlash** (J3) — bitta panel hamon bir xil sarlavha ostida 6 va 0 ko'rsatadi.
11. **`apps/api/src/modules/sla/`** — **bo'sh papka**; `sla_violations` jadvali (`packages/db/src/schema/sla-violations.ts:8`)
    hech qachon yozilmaydi/o'qilmaydi. Yozilgan, ulanmagan.
12. **Admin issiqlik xaritasi endpointi** (`admin.controller.ts:50`) — web'da 0 chaqiruv.
13. **`GET /operator/calls/recent`** (`operator.controller.ts:192`) — butun repo bo'ylab **yagona
    uchrash** shu ta'rifning o'zi; hech kim chaqirmaydi.
14. **Operator-helper APK** — CTI zanjirining ishlab chiqaruvchi tomoni (§4).
15. **Savat (`MarketOrder`) buyurtmalari admin panelda** (`ADMIN_PANEL_JAVOB.md` §3.2) — `grep -rn
    "marketOrders\|market/orders" packages/admin/src/api.ts` → 0. Hamon ko'rinmaydi.
16. **Haydovchi ilovasidagi `addresses/nearest` va `addresses/popular`** (`ApiService.kt:50-57`) —
    e'lon qilingan, hech qachon chaqirilmagan.

---

## 4. CTI — NIMA YETISHMAYAPTI

### 4.0 Avval halol tuzatish

Eganing yodidagi va'da — «qo'ng'iroq qilgan raqam admin panelda o'zi chiqsin» — **`TELEFON_PLAN.md` da
YO'Q**. U hujjat boshqa narsa haqida: operator **xizmat ko'rsatuvchining** raqamini 5 soniyada topib
berishi (`TELEFON_PLAN.md:6`, `:180`). Kelayotgan qo'ng'iroq va'dasi `TAXI_10X_PLAN.md:384`
(«telefon jiringlaydi → CTI raqamni ilg'aydi → mijoz kartasi o'zi ochiladi») va
`BIRJOY_TAXI_MASTER.md` §C da. Shuning uchun quyidagi baho — **B kodiga** qarshi.

### 4.1 Bugun nima BOR (va u haqiqatan ulangan)

| Bo'g'in | Holat | Isbot |
|---|---|---|
| Telefon-qurilmalar reyestri (CRUD + `apiToken`) | **BAJARILGAN** | `apps/api/src/modules/operator/operator-phones.controller.ts:40-99`; ekrani: `apps/web/src/app/dashboard/settings/phones/page.tsx`, menyuda `Sidebar.tsx:35` |
| `POST /operator/phones/ring` — jiringlash hodisasi | **YOZILGAN, ULANMAGAN** | `operator-phones.controller.ts:111-153`: `call_logs` ga `ringing` qator yozadi, mijozni topadi, `emitToAdmins('operator:incoming-call', …)` (`:143`). **Chaqiruvchisi yo'q** — pastga qarang |
| Soket → admin xonasi | **BAJARILGAN** | `socket.gateway.ts:282` `emitToAdmins(event, payload)` → `ADMIN_ROOM`; admin `admin:join` bilan kiradi (`socket.gateway.ts:223`, `useSocket.ts:110-114`) |
| Ekranga chiqadigan popup | **BAJARILGAN (ulangan)** | `apps/web/src/components/IncomingCallPopup.tsx:20-96` — raqam, qurilma nomi, holat, tanish mijoz ismi+VIP. Har dashboard sahifasida turadi: `app/dashboard/layout.tsx:39`, tinglovchilar `layout.tsx:25 useAdminSocket()` → `useSocket.ts:144-175` |
| Qo'ng'iroqni jurnalga yozish (operator ekranidan) | **QISMAN** | `operator/page.tsx:562-566` `POST /operator/calls/log`, buyurtma yaratilganda (`:524`) va suhbat tugaganda (`:580`) |
| `call_logs` jadvali | **BAJARILGAN** | `packages/db/src/schema/operator.ts:19-50` (`callerPhone`, `status`, `deviceId`, `outcome`, `duration`, indekslar) |

### 4.2 Nima YETISHMAYAPTI — aniq ish ro'yxati

**1. Ishlab chiqaruvchi tomon umuman yo'q — bu asosiy to'siq.**
`/ring` ni chaqiradigan hech narsa mavjud emas. Haydovchi ilovasida telefoniya izi ham yo'q:
`grep -rn "READ_PHONE_STATE\|PhoneStateListener\|TelephonyManager\|CallScreeningService\|PHONE_STATE"
apps/driver-android/app/src` → **0 natija (exit 1)**; manifest ruxsatlari (`AndroidManifest.xml:5-30`)
ichida telefoniyaga oid bitta ham yo'q. Ikkinchi Android moduli ham yo'q:
`settings.gradle.kts:18-19` → `include(":app")` yolg'iz.
→ **Kerak (A varianti):** kichik «operator-helper» APK — `READ_PHONE_STATE` + `PHONE_STATE`
receiver (yoki `CallScreeningService`), raqamni olib `POST /operator/phones/ring`
(`X-Device-Token: odt_…`), ustiga foreground-servis + boot-receiver (aks holda u ham Q7 dagi
kasallikka uchraydi). Baho: 3-5 kun.
→ **Kerak (B varianti, ega qarori «SIP» — `BIRJOY_TAXI_MASTER.md` §C):** Asterisk/FreeSWITCH +
AMI/ARI hook → xuddi shu `/ring` endpointi. Bugun SIP'dan bitta qator ham yo'q:
`grep -rn "\bSIP\b\|asterisk\|freeswitch\|webrtc"` (B bo'ylab) → faqat `docs/LAUNCH-PLAN.md:145`
dagi reja jumlasi. Baho: 1-2 hafta + raqam-provayder shartnomasi.

**2. Popup → operator ekrani uzatmasi UZILGAN (eng arzon tuzatish).**
`IncomingCallPopup.tsx:32` operatorni `/dashboard/operator?phone=<9 xona>&autoLookup=1&callId=<id>`
ga olib boradi. Lekin operator sahifasi bu parametrlarni **umuman o'qimaydi**:
`grep -n "autoLookup\|useSearchParams\|searchParams\|callId" apps/web/src/app/dashboard/operator/page.tsx`
→ **No matches found**. Ya'ni haqiqiy qo'ng'iroq kelganda ham operator raqamni **qaytadan qo'lda
teradi** — va'daning butun ma'nosi shu yerda yo'qoladi.
→ **Kerak:** `useSearchParams()` bilan `phone` ni inputga qo'yish, `autoLookup=1` bo'lsa
`lookupClient` ni avtomatik yugurtirish, `callId` ni holatda saqlab keyin yaratilgan buyurtmani
`call_logs` qatoriga bog'lash. **Bitta fayl, ~20 qator.**

**3. Panel qo'ng'iroq holatini yangilay olmaydi.**
`answered` (`operator-phones.controller.ts:157-169`) va `ended` (`:172-188`) **`X-Device-Token`
talab qiladi** (`deviceFromToken`, `:192-205`) — admin JWT bilan chaqirib bo'lmaydi. Popup'da esa
javob berish tugmasi yo'q (`IncomingCallPopup.tsx:79-90` — faqat «📞 Operator ochish» va «Yopish»).
Natija: APK bo'lmasa `call_logs` qatorlari abadiy `ringing` bo'lib qoladi.
→ **Kerak:** `AdminAuthGuard` bilan himoyalangan `answered`/`ended` variantlari + popup'da «Javob
berdim» tugmasi.

**4. Qo'ng'iroqlar tarixi ekrani yo'q.**
`GET /operator/calls/recent` (`operator.controller.ts:192`) — repo bo'ylab **yagona uchrash** shu
ta'rifning o'zi (`grep -rn "calls/recent" 1067-taxi` → 1 natija). Kim qo'ng'iroq qildi, qachon,
natija nima, qaysi telefonda — hech qayerda ko'rinmaydi.
→ **Kerak:** «☎ Qo'ng'iroqlar» sahifasi (ro'yxat + filtr + buyurtmaga havola).

**5. Raqam normalizatsiyasi yo'q — tanish mijoz «notanish» chiqadi.**
`operator-phones.controller.ts:126-130` mijozni `eq(clients.phone, body.callerPhone)` bilan —
**aynan tenglik** bilan qidiradi. APK `+998901234567` yuborsa, bazada `901234567` bo'lsa, popup
mijozni topmaydi. (A'da tayyor yechim bor: `normalizeUzPhone`, `packages/server/src/services/serviceDirectory.ts:19`.)
→ **Kerak:** yozishda ham, qidirishda ham bitta kanonik shakl.

**6. Popup mazmuni yupqa.** Hozir: qurilma nomi, raqam, ism, VIP (`IncomingCallPopup.tsx:52-71`).
Operatorga kerak bo'ladigan kontekst — oxirgi buyurtma, doimiy manzil, qarz, qora ro'yxat —
serverda allaqachon bor (`operator.service.ts lookupClient`), popup'ga ulanmagan.

**7. Yo'q va bo'lmagan narsalar (aniqlik uchun):** qo'ng'iroq yozib olish va IVR — B bo'ylab
`grep -rn "recording\|Recording\|ivr\|IVR\|voicemail" apps/api/src apps/web/src packages/db/src`
→ **0 natija**. Bir-bosishda qo'ng'iroq (`tel:`) faqat haydovchi jalb qilish ro'yxatida
(`outreach/page.tsx:245`), operator ekranida yo'q.

**8. Eng muhim kontekst: bu kod ega har kuni ochadigan panelda EMAS.**
Butun CTI zanjiri **B** (`1067-taxi`) ichida; jonli BirJoy admin (A) da bitta ham qator yo'q:
`grep -rn "incoming-call\|incomingCall\|callerPhone\|operator/phones" packages/server/src
packages/admin/src packages/shared/src` → **0 natija**. B esa hozircha staging (VPS'da `nohup`
bilan, admin 3010-portda). Ya'ni «raqam admin panelda chiqadi» — **admin.birjoy.online da emas**.
Qaror kerak: CTI B panelida qoladimi (unda operator ikki panel bilan ishlaydi) yoki A'ga
ko'chiriladimi.

**Tavsiya qilingan tartib:** (2) → (3) → (5) → (4) — bularning to'rttasi bir kunlik ish va zanjirni
«APK ulansa bugun ishlaydi» holatiga olib keladi; keyin (1) — asl katta ish; (8) esa eganing
qarorini talab qiladi.

---

## 5. QAMRALMADI (halollik uchun)

| Nima | Nega |
|---|---|
| **Jonli tekshiruv** — VPS'ga SSH, jonli baza, brauzerda panel | Topshiriq faqat-o'qish edi; barcha «ekranda shunday» xulosalari **manba kodidan**. CLAUDE.md DoD R4 bo'yicha bu jonli isbot **emas** |
| **A'ning jonli bayroq qatorlari** (`AppState feature:*`) | Bazaga ulanilmadi; «jonli» baholari faqat `EXPECTED_ON` (`featureFlags.ts:215-287`) bo'yicha. Masalan `operatorAssist` `EXPECTED_ON` da **yo'q**, garchi `ADMIN_PANEL_JAVOB.md` §6 uni bazada `on` deb yozgan bo'lsa ham — ya'ni ro'yxat bilan haqiqat orasida farq bo'lishi mumkin |
| **B'ning staging bazasi** — `call_logs` / `operator_phone_devices` jadvallari haqiqatan yaratilganmi | B'da SQL migratsiya papkasi yo'q (`packages/db/` da faqat `drizzle.config.ts` + `src`), jadval `drizzle-kit push` bilan chiqadi — buni faqat bazada ko'rish mumkin |
| **`claude/taxi-system-drivers-bsa05f` shoxobchasidagi kod sifati** | Faqat `main`ga qo'shilmagani isbotlandi; ichidagi 212 qator o'qilmadi |
| **`ADMIN_PANEL_JAVOB.md` ning 485 `onClick` sanog'ini qayta sanash** | Faqat hujjat aniq nomlagan qatorlar qayta tekshirildi (J3-J10); umumiy statistika qayta hisoblanmadi |
| **Eganing yodidagi «avtomatik chiqsin» va'dasining og'zaki manbai** | Hujjatlarda topilmadi; `TAXI_10X_PLAN.md:384` va `BIRJOY_TAXI_MASTER.md` §C — eng yaqin yozma manba |
