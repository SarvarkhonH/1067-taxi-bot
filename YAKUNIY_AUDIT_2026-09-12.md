> **Bu hisobot qanday chiqdi:** 46 ta agent, 10 ta o'lchov bo'yicha mustaqil kod auditi → har biri
> uchun dunyo platformalari bilan solishtirish → 24 ta eng yirik da'voni **rad etishga urinish**
> (natija: 1 rad etildi, 19 qisman, 4 tasdiqlandi) → to'liqlik tanqidchisi → sintez.
> **156 ta da'vo tekshirilmadi** (chegara 24 edi) — ular quyida "tekshirilmagan" deb belgilanmagan
> bo'lsa, ularga da'vo sifatida qarang, fakt sifatida emas.
>
> **Quyidagi 8 ta topilmani men o'zim, agentlardan keyin, buyruq bilan qayta tekshirdim:**
>
> | Topilma | Tekshiruv | Natija |
> |---|---|---|
> | Jonli bot tokeni kuzatilayotgan hujjatda | `docs/DEPLOYMENT-GUIDE.md:207` sha256 ⟷ VPS `/opt/app/.env` sha256 | ⛔ **BIR XIL** (`68f57266…`) — jonli token repoda |
> | GitHub PAT ochiq | `git remote -v` | ⛔ **TASDIQLANDI** — `.git/config` da `ghp_…` ochiq matnda |
> | Push qilinmagan commit | `git log origin/main..HEAD` | ⛔ **103 ta** |
> | Narxda zona va vaqt ko'paytirgichi o'lik | `pricing.service.ts:225-226` | ⛔ `timeOfDayMultiplier: 1.0, zoneMultiplier: 1.0` qotib qolgan |
> | Telefon `order:updated` ni tashlaydi | `HomeViewModel.kt:882` | ⛔ `if (!status.startsWith("cancelled")) return@collect` |
> | Inson ishlatadigan ilovalarda test yo'q | `find` | ⛔ web **0**, Kotlin **0**, API 17 spec |
> | `apps/client` yetim | `grep -c client deploy.sh ship.sh` | ⛔ **0 / 0** (23 ta fayl saqlanadi, chiqarilmaydi) |
> | `taxi_db` zaxirasi yo'q | `/opt/app/deploy/backup-cron.sh:32,44` | ⛔ faqat repo A `DATABASE_URL` dump qilinadi |
>
> Tuzatish: brifingda `/api/v1/health` 404 deb yozilgan edi — **xato manzil**; haqiqiy yo'l
> `/api/health` va u `{"status":"ok","db":"connected"}` qaytaradi (`health.module.ts:6`).

---

# BIRJOY TAXI — YAKUNIY AUDIT HISOBOTI

**Sana:** 2026-09-12 · **Qamrov:** repo B (`1067-taxi`) + repo A ko'prigi · **Manba:** 10 ta o'lchov auditi + 24 ta eng yirik da'voning qarama-qarshi tekshiruvi + to'liqlik tanqidchisi
**Rejim:** faqat o'qish. Jonli serverga ulanilmadi, baza o'qilmadi, hech narsa deploy qilinmadi.

---

## 1. BIR JUMLADA

**Yo'q — bugungi holatda bu tizim raqobatni yuta olmaydi, lekin sabab kod sifati emas:** yadro (buyurtma → skor → taklif → qabul → taksometr → komissiya) haqiqatan ishlaydi va ba'zi joylarda dunyodan ham oldinda, ammo taklif haydovchining telefoniga yetib bormaydi (FCM o'lik, overlay yo'q), operatorning qo'lda biriktirishi telefonda ko'rinmaydi, tizim bironta ham real yo'lovchi tashimagan, va eng katta uchta xavf — 1067 raqami kimniki, qaysi yuridik shaxs, ma'lumot qayerda turadi — umuman kod masalasi emas va bitta ham muhandis-kun talab qilmaydi.

---

## 2. NIMA BO'LDI — haqiqatan mavjud bo'lgan narsa

Holat enum'i qat'iy qo'llanildi: **live-proven** (jonli isbotlangan) · **coded-tested** (kod + yashil test, jonli trafik yo'q) · **coded-untested** · **coded-unreachable** (kod bor, hech kim chaqirmaydi) · **stub** (yolg'on ma'lumot qaytaradi) · **missing**.

### 2.1 Live-proven — jonli serverda isbotlangan (lekin barchasi sun'iy e2e, real odam emas)

| Narsa | Isbot |
|---|---|
| API `:4000`, panel `:3010`, `bot1067` — uchalasi ishlayapti, deploy `70c1f0a1` | brifing o'lchovi 2026-09-12 |
| Operator konsolidan real buyurtma yaratish | PROGRESS.md — buyurtma **#22**, 2026-09-11 18:27, **real odam** yaratgan |
| Xato yozilgan manzilni topish (`postgayi` → POST-GAI) | `smoke.sh` 47/47 jonli API'ga qarshi |
| Server-avtoritet taksometr, ekrandagi narx = yakuniy narx | `driver-e2e` 17/17 (8000 = 8000) |
| Deploy zanjiri BUILD_ID bilan tekshiriladi; `ship.sh` ff-only + landed-commit assert | `deploy.sh:75-79`, `ship.sh:42-48,62-71` |
| Production'ga o'tish: OTP loglanmaydi, dev-bypass yopildi (200→401), `/metrics` faqat loopback, 5 ta himoyasiz route yopildi | `prod-flip-check.sh` 8/8, tekshiruvchi #3/#4 |
| 750/750 haydovchi tasdiqlangan | `audit_logs: bulk_approve by admin#1` — **ega o'zi bosgan** |

⚠️ Bularning hech biri real haydovchi yoki real yo'lovchi bilan sinalmagan. `Redis ZCARD drivers:geo = 0`, umrida **9 ta buyurtma** (7 tasi dispetcher bekor qilgan, 1 tugagan, 1 `no_drivers`).

### 2.2 Coded-tested — kod + yashil test, jonli trafik yo'q

**Dispatch yadrosi**
- Skorlash (7 omil) → bitta haydovchiga taklif → Redis lock bilan qabul → taksometr → yakunlash — `driver-e2e` 17/17
- **Radius narvoni 3/5/8/12 km — MAVJUD va DEPLOY QILINGAN** (`dispatch.service.ts:488-492`, `:171`; `70c1f0a1` ichida). *Audit buni "yo'q" degan edi — tekshiruv RAD ETDI.*
- O'lik buyurtma sweep'i (`@Cron` har daqiqa, >180s) — `dispatch.service.spec.ts:350-388`
- Arvoh haydovchi gigiyenasi **uch qatlamda** (disconnect → GEO, daqiqalik cron, o'qish paytida filtr)
- `no_drivers` — **terminal emas**, operator taxtasida qizil halqa bilan tepaga chiqadi (`operator/page.tsx:1434-1453`)
- Haydovchi bekor qilsa chegaralangan qayta qidiruv (`MAX_REDISPATCH=3`, sinalgan haydovchilar ro'yxati saqlanadi)
- `booking:offer_cancelled` — **server + Kotlin, ikkala tomonda to'liq** (`socket.gateway.ts:482`, `HomeViewModel.kt:838-845`). *Audit "yo'q" degan edi — RAD ETILDI.*
- Qabul qilingan safar bekor qilinsa haydovchiga aytiladi (`HomeViewModel.kt:880-903`)
- Dispatch KPI paneli: **rad etdi / javob bermadi / umuman taklif qilinmadi** ajratilgan, p50/p95, eng ko'p rad etuvchilar ismi bilan (`admin.service.ts:355-487` → `DispatchKpi.tsx:49`)

**Haydovchi ilovasi** (`apps/driver-android` — 14 771 satr Kotlin)
- **Oflayn navbat** (`RideActionQueue.kt:69-230`) — diskda saqlanadi, tartibli qayta yuboriladi, 4xx'da tashlanadi. JAHON auditi Bolt/Grab/Careem/Ola/99/DiDi/Gett/FreeNow/Cabify/Lyft'ni qidirib **hech qaysisida hujjatlashtirilgan analogini topmagan.** MASTER.md:270 buni "o'lik kod" deydi — **bu noto'g'ri.**
- Sovuq startda faol safarni tiklash (`recoverActiveRideFromRest`, `HomeViewModel.kt:409-457`)
- **Halqali qo'ng'iroq ohangi** (`USAGE_ALARM`, `isLooping=true`, 6s → 2s so'nish), vibratsiya to'lqini, **o'zbekcha TTS** manzil + masofani aytadi (`OfferSoundService.kt:100-196`). *Audit "yo'q" degan edi — RAD ETILDI.*
- **Sanoq halqasi** rang o'zgarishi + 5s/3s da tezlashuvchi puls va ovozli tik (`OfferPopup.kt:245-334`)
- Taklif kartasi Bolt darajasida: mijoz, manzil, masofa, narx yoki halol `"Taxometr bo'yicha"`, to'lov turi, sinf
- Mock-GPS fix'i **dispatch'ga yetib bormasdan tashlanadi** (TaxiCaller'dan qattiqroq)
- Hujjat yuklash + amal muddati sanog'i (30 kunlik ogohlantirish)
- Ratsiya (PTT) **ilova ichida** — kas1067 buni alohida APK qilib beradi
- `break` (band) holati **serverda to'liq mavjud** (`drivers.ts:13`, `socket.gateway.ts:229-244`, APK'da `Models.kt:36`) — faqat tugmasi yo'q
- **i18n: uz + ru, 237 tadan 237 ta satr paritetda**, `LocaleManager` to'g'ri, 257 ta `stringResource` va atigi 26 ta qotib qolgan matn. *Hech bir audit buni hisobga olmagan.*

**Pul, xavfsizlik, analitika**
- Komissiya yechimi atomik + idempotent, bitta tranzaksiya ichida (`orders.service.ts:1265-1301`); `driver-e2e:204-205` — butun tizimdagi yagona jonli pul assert'i
- Kassa to'ldirish: operator-per-parol (bcrypt), rol bilan yopilgan, 10 mln cheklov, audit satri
- 7 ta firibgarlik signali real chaqiruv joylari bilan — `fraud-e2e` 24/24, `fraud2-e2e` 32/32
- SMS shlyuz v3 — `sms-e2e` 63/63, **kill-switch jonli O'CHIQ**
- Zanjir Z1 soya o'lchovi **alohida jadvalda** (o'lchov o'lchanayotgan narsani buzmasligi uchun ko'chirilgan) — `chain-e2e` 15/15
- Mijoz blacklist'i dispatch'ga uzatilgan (`dispatch.service.ts:167-180`) — uchidan uchiga ishlaydigan yagona yo'lovchi himoyasi

### 2.3 Coded-unreachable — kod yozilgan, hech kim chaqirmaydi

Bu eng muhim toifa, chunki PROGRESS.md ham, auditlar ham bularni ba'zan "bor" deb hisoblagan.

| Modul | Holat |
|---|---|
| **EskizService** (`auth/eskiz.service.ts`) | Nest provider ham emas, hech qayerga inject qilinmagan. **4 ta audit uni top-3 must-have deb sanagan — ya'ni egasi yo'q.** |
| Zona FIFO navbati | Dvigatel to'liq (`queue-management.service.ts`), 2 ta admin GET route va cron bor; **hech kim navbatga qo'ymaydi, dispatch o'qimaydi, zona yaratish route'i yo'q**; ilovadagi «#3 navbatda» pilligi qurilgan, lekin `priorityPosition` qotib qolgan `null` |
| Operator telefon CTI | Server route'lari + popup + qurilma reyestri tayyor; **ring hodisasini yuboradigan ishlab chiqaruvchi umuman yo'q** (panelning o'zi tan oladi: `phones/page.tsx:142`) |
| `notifyNoDrivers` | Matn bor, wrapper bor, chaqiruvchi yo'q — **ataylab** (`dispatch.service.ts:695`: mijoz xabari A'ning ishi) |
| Public tracking link | `GET /safety/track/:token` ishlaydi, hech kim token yaratmaydi, hech qanday sahifa render qilmaydi |
| `driver_en_route` | **Hech kim yozmaydi**; panel ko'rsatishga tayyor (`utils.ts:24,39,67`) |
| CancellationService | `safety.module.ts`dan tashqarida bironta inject yo'q — bekor qilish jarimasi hech qachon ishlamaydi |
| Routing/OSRM (166 satr) | `app.module.ts:131` da ro'yxatdan o'tgan, hech kimga inject qilinmagan |
| Route-deviation cron (30s) | `osrmRouteGeometry` bo'yicha filtr — bu ustunga hech narsa yozmaydi |
| FatigueMonitor | `driverWentOnline()` chaqiruvchisi yo'q → cron abadiy bo'sh to'plamni skanlaydi |
| promo · korporativ · fleet komissiya · intercity · to'lovlar (Payme/Click/hamyon) | Barchasi to'liq route to'plami, **uchala UI'da ham bironta chaqiruv yo'q** |
| SLA moduli | `apps/api/src/modules/sla/` — **bo'sh papka** + ishlatilmaydigan jadval |
| `vehicle_classes`, `pricing_zones`, `cancellation_rules`, `queue_zones` | Hech qachon seed qilinmagan → endpoint `[]` qaytaradi, surge inert |
| Ikkinchi incentive dvigateli, ikkinchi surge implementatsiyasi, tier chegirmali ikkinchi komissiya | Uchalasi ham ishlayotganiga o'xshaydi, ishlamaydi |

### 2.4 Stub / yolg'on aytadigan UI — mavjud emasligidan yomonroq

- **Sozlamalar ekrani plasebo:** `SettingsService`ni hech bir modul inject qilmaydi; 28 tugmadan 22 tasi (`SURGE_*`, `SAFETY_*`, `NOTIF_*`, `BRAND_*`) butun API'da o'qilmaydi. Ega narxni o'zgartiradi, «Saqlandi!» chiqadi, **keyingi safar eski narx olinadi.**
- **Surge sukut bo'yicha QUROLLANGAN:** `pricing_zones.surgeEnabled` default `TRUE`, `maxSurge 3.00`; ega ko'radigan 4 ta surge kalitini kod o'qimaydi; zona PATCH allowlist'i esa haqiqiy kalitlarni chiqarmaydi. Birinchi chizilgan zona = 3× ko'paytirgich, o'chirgichi rasm.
- **Kutish narxi** maydonlari narx sahifasida ko'rinadi, o'quvchisi yo'q.
- **Qo'ng'iroq natijasi hech qachon yozilmaydi:** UI `'call_ended'` yuboradi, enum'da bunday qiymat yo'q → Postgres rad etadi → bo'sh `catch{}` yutib yuboradi. `call_logs` faqat muvaffaqiyatli buyurtmalarni saqlaydi, ya'ni **qo'ng'iroq→buyurtma konversiyasi strukturaviy 100%** ko'rinadi.
- **08:00 Telegram hisoboti:** `today` hisoblanadi va **hech bir so'rovda ishlatilmaydi** (umrbod jami), `totalRevenueUzs: 0 // TODO`, `avgRating: 0 // TODO`, `successRate` esa `no_drivers`ni ikkala tomondan chiqarib tashlaydi — ya'ni 183 ta yo'qotishni **yashiradi**.
- `/api/health` baza o'lgan holda ham `200 ok, db: degraded` qaytaradi; `deploy.sh` faqat status kodga qaraydi.
- Broadcast sahifasida `target` tanlagich hech qachon yuborilmaydi — «telegram» tanlasang haydovchilarga ketadi.
- Ilovada 8 ta o'lik boshqaruv: «Yechib olish», tarix, mashinani o'zgartirish, «Hammasi», Shartlar, Maxfiylik, safarni ulashish, vibratsiya tugmasi (yoziladi, o'qilmaydi).

### 2.5 Kutilmagan topilmalar (auditlar o'tkazib yuborgan)

1. **Manba tekshiruvi kod da'volarining 14 tasini yumshatdi:** 24 ta eng yirik "yo'q" da'vosidan **1 tasi butunlay rad etildi** (qabul qilingan safarni qayta biriktirish — 3 joyda bor), **17 tasi qisman** chiqdi. Ya'ni auditlar tizimni **haqiqatdan ham qashshoqroq** ko'rsatgan.
2. **Lekin real xavf toifasi o'zgardi:** tekshiruvchi 24 ta da'vodan faqat **2 tasini `high`** deb belgiladi — ikkalasi ham **bitta narsa**: operator qo'lda biriktirsa, server `order:updated` ni haydovchi xonasiga yuboradi, **Kotlin uni tashlab yuboradi** (`HomeViewModel.kt:881-883`: aktiv buyurtma bo'lmasa va status `cancelled` bilan boshlanmasa — `return`). Server to'g'ri, telefon kar. Tuzatish serverda emas, **3 satr Kotlin**.
3. **`in_progress` — o'lik ko'cha:** qayta biriktirib ham, bekor qilib ham bo'lmaydi, admin override route'i yo'q. Haydovchi telefoni o'lsa, buyurtma abadiy shu holatda qoladi.
4. **Qo'lda zanjir allaqachon ochiq va himoyasiz:** `getAvailableDrivers` Redis GEO'dan oladi va **status filtri yo'q**, `manualAssign` ham status tekshirmaydi → dispetcher bugun safardagi mashinaga ikkinchi buyurtma bera oladi. Bu xususiyat emas, **bug**.
5. **`driver_sessions.deviceModel` hech qachon to'ldirilmaydi** — ilova login'da faqat `phone` + `code` yuboradi (`AuthViewModel.kt:106-109`). Ikki audit «minSdk qarorini shu ustundan o'lchang» degan — **bu o'lchov bajarilmaydi.**
6. **15% dispatch skori o'lik og'irlik:** `rating: 0.15` (`dispatch.types.ts:28`), lekin `driverRatings`ni faqat autentifikatsiyalangan mijoz yoza oladi, mijozlarning 89.4% telefon orqali keladi va mijoz ilovasi deploy qilinmaydi → reyting ustuni abadiy bo'sh, skor doimiy 5.0.
7. **`apps/client` — yetim:** `deploy.sh` va `ship.sh` da «client» so'zi **0 marta** uchraydi (o'zim tekshirdim). ~2185 satr UI saqlanadi, ko'rib chiqiladi va «kod bor» deb sanaladi — **chiqarib bo'lmaydi.**
8. **Ikki inson ishlatadigan ilovada 0 ta test** (o'zim tekshirdim): `apps/web` → **0**, `apps/driver-android` → **0**, `apps/api` → **17 spec**. «240/240 yashil» — mahsulotning uchdan biri.

---

## 3. NIMA QOLDI

### (a) BIRINCHI REAL SAFARNI TO'SADIGAN

Texnik jihatdan bugun nazorat ostidagi bitta haydovchi bilan safar **bo'lishi mumkin** (login operator ekranidagi kod orqali ishlaydi, konsol buyurtma yaratadi, ilova ochiq turganda taklif keladi). Lekin quyidagilar haqiqiy to'siq:

| # | To'siq | Kun | Nega |
|---|---|---|---|
| 1 | **Ruxsat oqimi Android 11+ da o'lik ko'cha** — `ACCESS_BACKGROUND_LOCATION` to'g'ridan-to'g'ri so'raladi (`PermissionsScreen.kt:130-134`), targetSdk 35 da **dialog ko'rsatmasdan denied** qaytaradi; «Davom etish» tugmasi abadiy o'chiq (`:164-170`) | 2 | **Yangi haydovchi ro'yxatdan o'ta olmaydi.** Butun ta'minot voronkasining tepasi |
| 2 | **Bironta Kotlin satri real telefonda ishlamagan.** Release R8-minified, crash reporting faqat DEBUG'da (`MainActivity.kt:86-95`) | 2 | Bitta Hilt/serialization keep-rule xatosi butun APK'ni o'ldiradi, birinchi xabar ratsiya orqali keladi |
| 3 | **`taxi_db` zaxirasi yo'q.** `deploy/backup-cron.sh` faqat repo A bazasini oladi; repo B'da `pg_dump` umuman yo'q; 77 jadvaldan 57 tasida migratsiya yo'q | 1 | VPS o'lsa — 750 tasdiqlangan haydovchi **qaytarib bo'lmaydi** |
| 4 | minSdk 26 — 5 haydovchi Android 8+ bo'lishi shart | 0 | Tanlash masalasi; yoki 0.5 kunlik desugaring bilan 23 ga tushirish |
| 5 | **Huquqiy**: yo'lovchini pulga tashish huquqi bor yuridik shaxs bormi | 0 muhandis-kun | Faqat ega qo'ng'iroq qiladi |

**Jami: ~5 muhandis-kun + 3 ta ega qo'ng'irog'i.**

### (b) PILOTNI (F3: 5 haydovchi, 15 real safar, 4/5 «yaxshi») TO'SADIGAN

| Ish | Kun | Tegadigan raqam |
|---|---|---|
| Qo'lda biriktirish uchidan uchiga: Kotlin handler + status predikati + eski haydovchini `online`ga qaytarish + `logDispatchOutcome` | 3 | 183/oy mashina yo'q |
| FCM konfiguratsiyasi (Firebase loyiha + `google-services.json` + gms plagini + server kalitlari) — **kod allaqachon yozilgan, token yuborish ham** | 2-3 | 238/oy rad |
| Taklif natijasini haydovchiga aytish (yutqazgan qabul, uch jim `return`) + ilova serverdan oldin fazani o'zgartirmasin | 1 | Haydovchi ishonchi |
| «Band» tugmasi (enum ikkala tomonda bor) | 2 | 16.5 onlayn |
| Boot receiver (ruxsat `AndroidManifest.xml:45` da so'ralgan, receiver yo'q) | 2 | 16.5 onlayn |
| Uch chiroq: socket ulangan · GPS yoshi · oxirgi taklif vaqti | 2 | «Nega buyurtma yo'q?» qo'ng'iroqlari |
| TLS + `taxi.birjoy.online` (egadan 1 ta DNS yozuvi) | 1 | SMS taklifi, APK havolasi |
| Versiya darvozasi (server min versionCode + bloklovchi ekran) | 2-3 | 622 telefonda muzlab qolgan APK xavfi |
| Onlayn vaqtni serverda o'lchash (`driverWentOnline` chaqiriladi) | 2 | **16.5 ni umuman o'lchab bo'lmaydi** |
| Ertalabki hisobotni to'g'rilash (bugungi raqamlar, revenue, `no_drivers`) | 1 | Ega ko'radigan yagona hisobot |
| `TZ=Asia/Tashkent` + tungi ko'paytirgichni bitta qiymatga keltirish (kod 1.5, panel 1.3) | 0.5 | Maktab vaqtida ×1.5 olinmasin |
| Tariflarni jonli tahrirlash (hozir konstruktorda konstanta) | 2 | Pilot davomida sozlab bo'lmaydi |
| 8 ta o'lik tugmani olib tashlash | 1 | DIZAYN_QOIDALARI |
| Crash reporting (release'da) | 2 | Dala xatosi diagnostikasi |

**Jami: ~24 muhandis-kun** (TS va KT parallel ketsa ~2.5 hafta).

### (c) SHAHARNI YUTISHNI TO'SADIGAN

| Ish | Kun | Tegadigan raqam |
|---|---|---|
| Overlay taklif + ekranni uyg'otish + full-screen intent (kas1067 da bor, bizda yo'q) | 4 | 238 rad |
| Bo'sh doiradan keyin radiusni kengaytirish (narvon bor, faqat bo'sh natijada oldinga surilmaydi) | 0.5-1 | 183 mashina yo'q |
| Ta'minot paydo bo'lganda `no_drivers` navbatini qayta urinish | 2 | 183 |
| Qabuldan keyin qotgan buyurtma sweep'i + `in_progress` o'lik ko'chasi | 2 | Ta'minot sizishi |
| To'lqinli taklif (10-15s eksklyuziv → 3-5 ga parallel) | 5 | 238 rad, 75s → 1 raund |
| Yo'lovchiga SMS (mashina, raqam, kuzatuv havolasi) | 3-4 | 89.4% telefon kanali |
| Qo'ng'iroq natijasi enum'ini tuzatish | 1 | 21.5% ni **qo'ng'iroq darajasida** o'lchash |
| CTI: yordamchi APK **emas**, bulutli PBX webhook | 4 | 1748 qo'ng'iroq/oy |
| Operatorga «so'nggi safarlar» ni bir bosishda to'ldirish (25 satr yuqorida saqlangan manzillar uchun allaqachon bor) | 0.5 | Operator sekundlari |
| Komissiya pog'onasi jonli yechim yo'liga (DiDi/Yandex/Bolt namunasi) | 4 | 16.5 onlayn, pul chiqmaydi |
| Mijoz cashback hamyoni (som), app vs qo'ng'iroq stavkasi — **kas'da bor, bizda yo'q** | 9 | 10.6% app ulushi |
| Kutish narxi (N daqiqa bepul → daqiqaliq) | 4 | 238 rad |
| kas tarif shakli: pog'onali km + shahar/qishloq | 3 | Cutover blokeri |
| Zona FIFO ni ulash (dvigatel bor) | 6 | 16.5 onlayn |
| Haydovchi referal (20 safardan keyin) | 4 | 16.5 onlayn |
| Yoqilg'i shoxobchasi chegirmasi | 2 | Marja tegmaydi |
| Ruxsat oqimi + OEM autostart (Xiaomi/MIUI) | 4 | 16.5 onlayn |
| `values-uz-rCyrl` (lotin satrlari allaqachon ajratilgan) | 1 | 45+ yoshli haydovchilar |
| Mavsumiylik/kalendar signali (Hayit, juma, bozor kuni, birinchi yomg'ir, metan navbati) | 3 | Raqib nusxa ololmaydigan narsa |

**Jami: ~60 muhandis-kun.**

### (d) DUNYO DARAJASINI TO'SADIGAN

Bu ro'yxatning deyarli hammasi **ataylab qurilmasligi kerak** (§8 ga qarang): batched/Hungarian/RL dispatch, ETA o'rganish, A/B platforma, pooling, manzil filtri, selfie/liveness, safar ichida audio yozish, SLA quyi tizimi, ovozli AI operator, 290 parametrli hisobot to'plami. **Oylar · Koson uchun qiymati ~0.**

Haqiqatan dunyo darajasiga olib chiqadigan yagona narsa — **oflayn bardoshlilik** (bizda bor) va **destinatsiyasiz halol taksometr** (bizda bor). Ular allaqachon dunyodan oldinda.

---

## 4. REJA BAJARILDIMI — F0–F9 darvozalari

> Qoida (CLAUDE.md R1/R7): «done» faqat ega qabul qilgandan keyin. Quyida hech qayerda «done» yozilmagan.

| Faza | Qabul darvozasi | Holat | Nima yetishmaydi |
|---|---|---|---|
| **F0** Audit | 3 audit | **bajarilgan** | Reja o'zi hali «ega qarorini kutmoqda» (MASTER.md:3) |
| **F0.5** Zaxira + token + B-balls | `git bundle` · PAT revoke · `clients.balls` aniqlangan | **qisman / noma'lum** | **103 commit `origin`ga push qilinmagan** · PAT hali `.git/config`da ochiq (PROGRESS) · bundle bor-yo'qligini **men tekshirmadim** · B `clients.balls` tekshiruvi **men tekshirmadim** |
| **F1-core** P0-1..6 | 6 P0 yopilgan, har biri isbot bilan | **3 / 6 tekshiruvga tayyor, 3 tasi qisman** | quyidagi jadvalga qarang |
| **F1-bridge** BirJoySource 27/27 | 27 metod · `live`da bayt-bir xil | **qisman (~8/27)** | **19 ta `notImpl`** · `getTariff`, `cancelBooking`, `getDriverAccount`, `addDriverPayment` yo'q · `kas/index.ts:35` `KAS_MODE=birjoy` ni **ataylab rad etadi** |
| **F2** Soya rejimi | 7 kun · 500+ buyurtma · >95% moslik | **boshlanmagan** | PROGRESS.md o'zi shunday deydi |
| **F3** Ilova hardening + 5 haydovchi | K8 yopilgan · FCM tirik · 15 real safar | **boshlanmagan** | FCM ikkala tomonda o'lik · cleartext hali yoqilgan (`AndroidManifest.xml:57-58`) · **0 real safar** · prod imzo holati **men tekshirmadim** |
| **F4** Onlayn-ulush + to'lqin | onlayn 16.5→40+ · rad <12% | **boshlanmagan** | To'lqin yo'q; onlayn 0; `simEconomy` bu repoda yo'q |
| **F5** Konsol + CTI + ratsiya | operator <20s · app 10.6%→30% | **qisman** | Ratsiya tekshiruvga tayyor (telefonda bosilmagan) · CTI ishlab chiqaruvchisi yo'q · «operator <20s» **o'lchab bo'lmaydi** (qo'ng'iroq logi yozilmaydi) |
| **F6** Firibgarlik qalqoni | 5 xavf: aniqlash + test | **tekshiruvga tayyor (kuzatuv)** | 7 signal bor, lekin **bloklash yo'q** (mock-GPS smenani to'xtatmaydi) · `meter_overspeed` faqat jest · jonli `fraud_signals=0` |
| **F7** Motivatsiya + safar-tanga | onlayn 40→158 · rad <5% | **boshlanmagan** | Missiya dvigateli `online_hours`/`acceptance` turlarini **jimgina e'tiborsiz qoldiradi** · tier ladder buzuq (hammasi «diamond») |
| **F8** Mijozni ko'chirish | app ulushi →60% | **boshlanmagan** | Kanal ulushini **o'lchaydigan bironta so'rov yo'q** (ustun to'ldiriladi, hech kim guruhlamaydi) |
| **F9** Kas'dan uzilish | hamma darvoza yashil | **boshlanmagan va bugun ZARARLI** | Bugun o'tilsa: narx kartasi yo'qoladi, mijozning bekor qilish tugmasi o'ladi, `payDebtWithCoins` ishlamaydi |

**F1-core detali (eng muhim darvoza):**

| P0 | Qabul satri | Holat | Isbot / kamchilik |
|---|---|---|---|
| P0-1 `no_drivers` qutqarish | panelda ko'rinadi + qo'lda tayinlanadi + e2e | **qisman** | Ko'rinadi ✅ · **Tayinlash telefonga yetmaydi** ✅tekshirilgan · `manualAssign` uchun **bironta test yo'q** |
| P0-2 O'lik buyurtma sweep | `*/1` cron | **tekshiruvga tayyor** | `dispatch.service.spec.ts:350-388`; kamchilik: faqat `pending`/`dispatching` |
| P0-3 Arvoh haydovchi | disconnect→GEO + sweep | **tekshiruvga tayyor** | Uch qatlam |
| P0-4 Yakuniy narx | **quoted = charged; surge × class × zona × vaqt** | **qisman (2/4)** | `pricing.service.ts:225-226` — **men o'zim ko'rdim**: `timeOfDayMultiplier: 1.0`, `zoneMultiplier: 1.0` qotib qo'yilgan. surge ✅ class ✅ **zona ❌ vaqt ❌** · aniq-qiymatli regressiya testi yo'q |
| P0-5 Komissiya atomik+idempotent | `db.transaction` + `unique(orderId)` | **qisman** | Tranzaksiya ✅ · ilova darajasidagi idempotentlik ✅ · **`commissions_order_type_uq` faqat schema'da, ikkala migratsiyada ham yo'q** (o'zim tekshirdim: `0000`, `0001`) → jonli bazada bor-yo'qligini **tekshirib bo'lmaydi** (read-only) |
| P0-6 OTP 6 xona + throttle | 5/15daq | **tekshiruvga tayyor** | O'zim ko'rdim: `randomInt(100000, 1000000)`, `@Throttle({limit:5, ttl:900_000})` |

### Umumiy foiz — uchta HAR XIL raqam

| O'lchov | Foiz | Bu nimaning foizi |
|---|---|---|
| **Kod kengligi** | **~70%** | Rejalashtirilgan sirtning qancha qismiga kod yozilgan. 77 jadval, ~44 modul, 14 771 satr Kotlin, 240 test. **Ega ilgari shu raqamni eshitgan.** |
| **Darvoza progressi** | **~15%** | 10 ta darvozadan 1 tasi bajarilgan (F0 — auditning o'zi), 2 tasi jiddiy qisman, 7 tasi boshlanmagan |
| **Real shaharni ko'tarishga tayyorlik** | **~10%** | 0 real safar · 0 onlayn haydovchi · inson ishlatadigan ikki ilovada 0 test · zaxira yo'q · TLS yo'q · push yo'q |

v2 rejasi 2026-09-08 da v1 ning «~80% pilotga tayyor» da'vosini **rad etib**, «~50% haqiqat» degan edi. To'rt kundan keyin, chuqurroq tekshiruv bilan: **kod kengligi undan yuqori (~70%), tayyorlik esa ancha past (~10%)** — chunki qurilganning katta qismi *chaqirilmaydi*.

---

## 5. DUNYO DARAJASIMI — ikkita jadval

### 5.1 Uber / Bolt / Yandex Go ga qarshi (100 = ular)

| O'lchov | Audit bahosi | Tekshiruvdan keyin | Hukm |
|---|---|---|---|
| Dispatch yadrosi | 25 | **28** | ortda — radius narvoni, qutqaruv navbati, `offer_cancelled` haqiqatan bor |
| Haydovchi Android ilovasi | 30 | **33** | ortda — ohang, sanoq, TTS, oflayn navbat, tiklash haqiqatan bor |
| Yo'lovchi tomoni | 20 | 20 | ortda |
| Operator konsoli / CTI / ratsiya | 25 | 25 | ortda |
| Narx / tarif / surge / taksometr | 20 | 20 | ortda |
| Pul / komissiya / to'lov / tanga | 20 | 20 | ortda |
| Xavfsizlik / ishonch / compliance | 20 | **17** | ortda — pasport skanlari shifrsiz, chet el serverida |
| Platforma / ishonchlilik / deploy | 24 | **22** | ortda — repo A bilan bitta VPS, 103 commit push qilinmagan |
| Ta'minot o'sishi / motivatsiya | 15 | 15 | ortda — dimensiyalar ichida eng pasti |
| Ma'lumot modeli / analitika | 20 | 20 | ortda |
| **O'rtacha** | **21.9** | **22.0** | **Ortda** |

Muhim izoh: bu 22 raqamining katta qismi **yopilmasligi kerak bo'lgan masofa** — pooling, batched matching, ETA ML, manzil filtri Koson'da strukturaviy imkonsiz (buyurtmalarning ~98% da manzil yo'q).

### 5.2 kas1067 / TaxiCloud ga qarshi (50 = paritet)

| O'lchov | Audit | Tekshiruvdan keyin | Biz oldinda | Biz ortda |
|---|---|---|---|---|
| Dispatch yadrosi | 42 | **45** | skorlash, lock, offer log, KPI, Z1, arvoh gigiyenasi | biriktirish telefonga yetmaydi |
| Haydovchi ilovasi | 55 | **57** | xarita, TTS, oflayn navbat, ratsiya ichkarida, mock-GPS | **overlay yo'q · minSdk 26 vs 21 · hech qachon telefonda ishlamagan** |
| Yo'lovchi tomoni | 55 | 55 | repo A boti (jonli), manzil qidiruvi | **CTI screen-pop · cashback (app vs call stavkasi)** |
| Operator / CTI / ratsiya | 45 | 45 | intake tezligi, manzil qamrovi, KPI, ratsiya joyi | **АОН ishlab chiqaruvchisi yo'q · biriktirish ishlamaydi** |
| Narx / taksometr | 38 | 38 | taksometr halolligi, jump/overspeed | **tarif shakli (pog'onali km, shahar/qishloq) · operator tarifni o'zgartira olmaydi · kutish narxi** |
| Pul / tanga | 45 | 45 | atomik komissiya, ledger, kassa | **mijoz cashback hamyoni yo'q** |
| Xavfsizlik / firibgarlik | 55 | 55 | 7 signal, mock-GPS bloklash, TLS-dan tashqari hamma narsa | **licenseTerm ko'rinmaydi · rol ajratmasi yo'q** |
| Platforma / deploy | 45 | 45 | daqiqalarda deploy, BUILD_ID tekshiruvi | **zaxira yo'q (ularda vendor qiladi) · qo'ng'iroq qiladigan odam yo'q** |
| Ta'minot o'sishi | 45 | 45 | earnings ekrani, missiyalar, outreach CRM | **hech qanday kanal bilan yopiq ilovaga yeta olmaymiz** |
| Analitika | 58 | 58 | rad/javobsiz ajratish, p50/p95, firibgarlik | **onlayn vaqt · qo'ng'iroq telemetriyasi (ularning telephony APK'sida Firebase bor)** |
| **O'rtacha** | **48.3** | **48.8** | | |

**Xulosa: kas1067 ga nisbatan biz ~49/100 — ya'ni paritetdan bir oz pastda.** Sabab xususiyat soni emas: ular 1956 buyurtma/oy tashiyapti, biz 0. Va aynan ular bizdan ustun bo'lgan uchta narsa — overlay taklif, ishlaydigan qo'lda biriktirish (ratsiya + tayinlash), Android 5 da o'rnatilishi — shaharning haqiqiy ish mexanikasi.

---

## 6. RAQOBATDA YUTA OLAMIZMI

### Bu jangni nima hal qiladi (xususiyat soni emas)

1. **Taklif telefonga fizik yetadimi.** kas'da overlay bor (push yo'q), bizda ikkalasi ham yo'q. 238 rad/oyning qancha qismi «bosmadi» emas, «ko'rmadi» ekanini biz allaqachon **o'lchay olamiz** (KPI paneli rad/javobsiz ajratadi) — buni real trafikda 7 kun ko'rish **butun yo'l xaritasidagi har qanday xususiyatdan qimmatroq.**
2. **Dispetcher mashinaga buyurtma bera oladimi.** kas: ratsiya + ishlaydigan tayinlash. Biz: tayinlash bor, telefon uni tashlaydi.
3. **Ilova o'rnatiladimi.** minSdk 26 vs 21.
4. **1067 raqami jiringlashda davom etadimi.** Bu bizda **javobsiz savol**.
5. **Mijozga nimadir aytiladimi.** kas: cashback (qo'ng'iroq va ilova uchun **alohida stavka** — ya'ni vendor kanal muammosini bizdan oldin tushungan). Biz: hech narsa.

### Haqiqiy qurollarimiz (raqib oson nusxa ko'chira olmaydi)

| Qurol | Holat | Nega qurol |
|---|---|---|
| **BirJoy tanga + `payDebtWithCoins`** | **jonli** (repo A, kas backend ustida) | Marketpleysda ishlagan tanga bilan haydovchi qarzini yopib, yana onlayn chiqadi. Uber Koson'da buni qura olmaydi, kas ham qura olmaydi (super-app kerak) |
| **Xato yozilgan o'zbek manzilini topish** | live-proven | Dunyoda bu muammo yo'q, shuning uchun yechimi ham yo'q |
| **Oflayn safar-navbati** | coded-tested | 10 ta global vendorda hujjatlashtirilgan analogi topilmadi |
| **Ratsiya ilova ichida** | coded-tested | kas ikkinchi APK qiladi — bizniki yaxshiroq shaklda |
| **Rad/javobsiz ajratuvchi KPI** | coded-tested + panel | 21.5% ning sababini aniqlaydigan yagona asbob |
| **Destinatsiyasiz server taksometri** + jump/overspeed qalqoni | live-proven (API) | Bozorning haqiqiy narx mexanikasi; Uber/Bolt strukturaviy qila olmaydi |
| **Buyurtma kartasida manzil yozib olish** | coded-tested | Dunyo katalogidagi hech kimda bunday shaklda yo'q |

### Bezak (qiymat bermaydi, lekin saqlash pul turadi)

Xarita + heatmap (89.4% telefon bo'lgan bozorda) · 7-omilli skorerning 2 ta o'lik oyog'i · promo · korporativ · fleet · intercity · to'lovlar · SLA · OSRM · route-deviation · fatigue · `apps/client` · ikkinchi incentive dvigateli · ikkinchi surge · haftalik settlement.

### Raqib nimani nusxa ko'chira oladi

Hammasini — **haftalar ichida**. `RAQIB_TAHLIL.md:169-170` isbotlaydi: 446 ta `uz.taxisoft.*` havolasi, 0 ta `com.onde` — bu **mahalliy o'zbek jamoasi**, chet el SaaS emas. Bizning APK esa `apps/web/public/1067-taxi-driver.apk` da **http orqali har kimga ochiq** (`deploy.sh:58`). Ular bizning har bir xususiyatimizni o'qiy oladi, va ularda onlayn haydovchi bor.

**Nusxa ko'chira olmaydigan narsa** — tanga ekotizimi va ega shaxsiy munosabatlari. Qolgan hammasi vaqt masalasi.

### Halol javob

**Ha, yuta olamiz — lekin xususiyat orqali emas.** Yutish yo'li: (1) uchta yetkazish mexanikasini tuzatish (FCM + overlay + ishlaydigan biriktirish), (2) tanga ko'prigini saqlab qolish, (3) telefon kanalini birinchi darajali fuqaro qilish. Bu ~6-8 muhandis-hafta.

**Va yutqazishning eng ehtimolli yo'li — kod emas:** bugun kas'dan uzilish **jonli imkoniyatlarni yo'qotadi** (narx kartasi, mijoz bekor qilishi, tanga bilan qarz to'lash), yoki 1067 raqami bizniki bo'lmay chiqadi, yoki ma'lumot joylashuvi bo'yicha xizmat to'xtatiladi.

---

## 7. ENG QISQA G'ALABA YO'LI

Ranjirlash: **kun boshiga bozor raqamiga ta'sir.** Nol-kunlik ishlar (ega qo'ng'iroqlari) birinchi, chunki ular butun backlog'ni bekor qilishi mumkin.

### 0-daraja — 0 muhandis-kun, shu hafta

| # | Ish | Kim | Nega birinchi |
|---|---|---|---|
| 0.1 | **1067 raqami/SIM/operator shartnomasi kimniki?** | Ega | Agar bizniki bo'lmasa — **1748 qo'ng'iroq/oy cutover kuni yo'qoladi** va hech qanday kod yordam bermaydi |
| 0.2 | **Yuridik shaxs + fiskal chek majburiyati** | Ega + buxgalter | Kod nol; F9 ni bloklaydi |
| 0.3 | **DNS: `taxi` A-yozuv → 169.58.55.249** | Ega, 10 daqiqa | **Bitta yozuv 4 ta ishni ochadi**: TLS, SMS taklifi, APK havolasi, keyinchalik push |
| 0.4 | **Eskiz shartnomasi + alpha-name arizasi** | Ega | **Regulyativ kutish 1-2 oy — bu haqiqiy kritik yo'l**, forma, kod emas |
| 0.5 | **5 pilot haydovchi: ism, telefon, Android versiyasi** | Ega | `deviceModel` o'lchovi **ishlamaydi**, faqat qo'ng'iroq bilan bilinadi |

### 1-daraja — eng yuqori ta'sir/kun

| # | Ish | Kun | Raqam | Kutilgan ta'sir |
|---|---|---|---|---|
| 1 | Operator konsolida «so'nggi safarlar» ni bir bosishda to'ldirish (25 satr yuqorida bu allaqachon bor) | **0.5** | 1748 qo'ng'iroq | Har takroriy qo'ng'iroqdan sekundlar; noto'g'ri manzil kamayadi |
| 2 | Bo'sh doirada radiusni oldinga surish (narvon bor, faqat trigger yo'q) | **0.5-1** | 183 mashina yo'q | Bugungi real xizmat zonasi 3 km → 12 km |
| 3 | Qo'ng'iroq natijasi enum'ini tuzatish | **1** | 21.5% | 21.5% ni **birinchi marta qo'ng'iroq darajasida** ko'rish |
| 4 | Ertalabki hisobot + `TZ=Asia/Tashkent` | **1.5** | hammasi | Ega ko'radigan yagona raqam hozir **yolg'on** |
| 5 | Onlayn vaqtni serverda yozish | **2** | 16.5 | Bu raqamni **umuman o'lchab bo'lmaydi** hozir |
| 6 | «Band» tugmasi | **2** | 16.5 + 238 | Ko'cha buyurtmasini olgan haydovchi butunlay oflayn chiqmasin |
| 7 | Ruxsat oqimi (Android 11+ o'lik ko'chasi) | **2** | 16.5 | **Yangi haydovchi hozir ro'yxatdan o'ta olmaydi** |
| 8 | Zaxira (`pg_dump` → Telegram, repo A namunasi) | **1** | — | 750 haydovchini yo'qotmaslik |
| 9 | Qo'lda biriktirish uchidan uchiga (3 satr Kotlin + status predikati + eski haydovchini bo'shatish) | **3** | 183 | Dispetcherning yagona qurolini ishga tushirish |
| 10 | FCM konfiguratsiyasi (kod tayyor) | **2-3** | 238 | Ikkinchi kanal |
| 11 | Overlay + ekranni uyg'otish | **4** | 238 | Raqib bilan paritet; FCM'siz ma'nosiz |
| 12 | Taklif natijasi ack + optimistik fazani to'xtatish | **1** | Ishonch | Bitta bekor yurish 10 ta yaxshi safardan qimmat |
| 13 | TLS + domen (0.3 dan keyin) | **1** | Voronka | IP havola = firibgarlik SMS ko'rinishi |
| 14 | Crash reporting + 5 telefonda dala sinovi | **4** | — | Boshqa hamma narsa fantastika bo'lib qolmasligi uchun |
| 15 | Boot receiver | **2** | 16.5 | Qayta yuklangan telefon dispatch uchun ko'rinmas |
| 16 | Uch chiroq (socket · GPS · oxirgi taklif) | **2** | Qo'ng'iroqlar | «Nega buyurtma yo'q?» ga javob |
| 17 | Yo'lovchiga SMS + kuzatuv sahifasi (backend 80% tayyor) | **3-4** | 89.4% + 10.6% | Ikkinchi «taksim qayerda» qo'ng'irog'ini yo'q qiladi |
| 18 | Komissiya pog'onasi jonli yo'lga | **4** | 16.5 | **Pul chiqmaydi** — marja faqat kechiriladi |

**1-10 punkt = ~16 muhandis-kun → birinchi real safar + o'lchanadigan pilot.**
**1-18 punkt = ~33 muhandis-kun → 16.5 ni qimirlatadigan tizim.**

---

## 8. QURILMASIN — aniq va qat'iy

Ega doimo qamrov qo'shadi. Quyidagilar **qurilmasin, tugatilmasin, hatto tuzatilmasin ham** — ba'zilari o'chirilsin.

**O'chirilsin (saqlash zarar keltiradi):**
1. **`apps/client`** — ~2185 satr, `deploy.sh`/`ship.sh` da 0 marta uchraydi, booking tab'i yo'q, Vercel o'chgan. O'chiring yoki muzlating; «tugatish» — xato.
2. **Ikkinchi surge implementatsiyasi** (`surge_zones` + `geofence.getSurgeMultiplier`) — `SurgeService` uni inject qiladi va ishlatmaydi, shuning uchun tirikdek ko'rinadi. Birinchi ko'targan odam ko'paytirgichni noto'g'ri panelda oshiradi.
3. **Ikkinchi incentive dvigateli** (`/incentives`) — missiya dvigateli bilan bir xil jadvallarga yozadi; ulash = **ikki marta to'lash**.
4. **Haftalik settlement cron'i** — naqd bozorda to'lanadigan hech narsa yo'q; har satrga ishora xatosi yozilyapti.
5. **SLA moduli + `sla_violations` jadvali** — bo'sh papka; bazadagi bo'sh jadval keyingi odam uchun «ishlayapti» degani.
6. **Route-deviation cron'i** — hech kim yozmaydigan ustunni filtrlaydi.
7. **Fatigue enforcement** — bog'lovchi cheklovga (16.5) qarshi ishlaydi. Faqat sessiya yozuvchisini oling.
8. **OSRM/routing qatlami** (166 satr) — bir necha km'lik shaharda to'g'ri chiziq xatosi bir daqiqadan kam. Haqiqiy bug — ETA ni haydovchining **oniy GPS tezligiga** bo'lish; bu bitta konstanta.
9. **Promo/kupon dvigateli** — talab cheklov emas. Har 5 buyurtmadan 1 tasi mashina yo'qligidan o'ladi; chegirma buni **rad'ga aylantiradi**. Ayni paytda `GET /promos/validate` himoyasiz.

**Qurilmasin:**
10. **Payme/Click/karta to'lovlari safar uchun** — naqd bozor. (Lekin himoyasiz `POST /payments/create` yopilsin.)
11. **Haydovchi payout rellari** — naqd modelda haydovchida pul, bizda qarz. «Yechib olish» tugmasi **olib tashlansin**, orqasiga tizim qurilmasin.
12. **Korporativ invoys dvigateli, fleet komissiyasi, intercity** — imzolangan mijoz/park yo'q.
13. **Selfie / liveness** — 750 tanish haydovchi bor shaharda anonimlik muammosi yo'q; ustiga biometrika chet el serverida **yangi huquqiy muammo yaratadi**.
14. **Safar ichida audio yozish, raqam maskalash, ichki chat** — ular telefonlashadi; kas 1956 buyurtma/oy shusiz tashiydi.
15. **Yo'lovchiga metrik ETA/masofa** — pikap katalog nuqtasi, birinchi noto'g'ri raqam ishonchni o'ldiradi.
16. **Surge asosiy ta'minot richagi sifatida** — 1700 som marjani yeydi. Navbat, zanjir, bepul skip, komissiya chegirmasi — arzonroq.
17. **Kafolatlangan daromad** — 40 haydovchiga bir haftalik kafolat butun oylik sof foydadan (3.3 mln som) oshadi.
18. **Ommaviy haydovchi reytingi / qabul foizi jazolari** — o'yinlashtiriladi va janjal chiqaradi. Onde namunasi (skip qilgan navbat oxiriga tushadi, ochiq raqam yo'q) bir xil natija beradi.
19. **Batched/Hungarian/RL dispatch, pooling, manzil filtri, ETA ML, A/B platforma** — 63 buyurtma/kun'da batch tug'ilmaydi, manzil maydoni umuman yo'q.
20. **Prometheus + Grafana, Kubernetes, SOC2/ISO/pentest** — bitta VPS, bitta operator, 9 buyurtma. Tashqaridan `curl /health` + Telegram xabari — to'g'ri o'lcham.
21. **Certificate pinning** — hozir zararli: majburiy yangilanish yo'lisiz sertifikat almashsa 622 telefon o'ladi.
22. **Ovozli AI / LLM operator** — Qashqadaryo shevasi uchun model yo'q; noto'g'ri eshitilgan mahalla = real mashina noto'g'ri manzilda. Avval DTMF IVR.
23. **Ikkinchi PTT ilovasi, ikkinchi «lite» APK, iOS ilovasi** — har biri yangi o'rnatish to'sig'i.
24. **minSdk o'lchov mexanizmini qurish** — `deviceModel` hech qachon to'lmaydi. Repo o'z bahosi 0.5-2 kun; **o'lchamasdan desugaring qiling**, o'lchov qurmang.
25. **`deploy.sh`/`ship.sh` ni qayta yozish** — ikkala repodagi eng yaxshi asoslangan kod. Kengaytiring (rollback, DDL drift, halol health gate), tegmang.
26. **OFD/fiskal integratsiya javobsiz qurilmasin** — avval bir xatboshi buxgalter javobi.
27. **VPS ni taxmin bilan O'zbekistonga ko'chirish** — zaxira yo'q tizimni ko'chirish uchun eng yomon payt.

---

## 9. XAVFLAR — tartiblangan

| # | Xavf | Ehtimol | Zarar | Manba |
|---|---|---|---|---|
| 1 | **1067 raqami/SIM/operator shartnomasi kimniki — noma'lum.** Vendor yoki boshqa yuridik shaxsniki bo'lsa, cutover kuni 89.4% talab (1748 qo'ng'iroq/oy) yo'qoladi | Noma'lum | **Kompaniyani o'ldiradi** | Tanqidchi #3 |
| 2 | **Huquqiy: shaxsiy ma'lumot joylashuvi.** Barcha ma'lumot Contabo **Germaniya**da (`DEPLOYMENT-GUIDE.md:79`); **haydovchi guvohnoma/pasport skanlari shifrlanmagan holda lokal diskda** (`driver-documents.service.ts:34`). **Ikki auditimiz bir-biriga zid**: xavfsizlik auditi 27.03.2026 yumshatishlarini keltiradi (biometrika baribir faqat ichkarida), tanqidchi qat'iy talab deydi. **Yurist javobi yo'q** | O'rta | Xizmat to'xtatilishi | Tanqidchi #1 vs xavfsizlik auditi |
| 3 | **Yuridik shaxs + fiskal chek javobsiz.** Repoda `ofd|fiscal|soliq|chek` bo'yicha **0 hit** | Yuqori | F9 ni bloklaydi | Tanqidchi #2, narx auditi |
| 4 | **`taxi_db` zaxirasi yo'q va 77 jadvaldan 57 tasida migratsiya yo'q.** VPS o'lsa — 750 tasdiqlangan haydovchi **qaytarilmaydi** (kas'da buni vendor qiladi — bu yagona o'q bo'ylab biz **raqibdan yomonroq**) | Past | **Qaytarib bo'lmaydi** | Platforma auditi |
| 5 | **103 commit faqat bitta noutbukda + prod quti.** Birinchi push `deploy.yml` ni ishga tushiradi → o'lik Render/Vercel'ga deploy | O'rta | Yuqori | Platforma auditi + tanqidchi |
| 6 | **Sirlar git'da:** jonli Telegram bot token'i **kuzatilayotgan hujjatda** (`DEPLOYMENT-GUIDE.md:207`) — bu admin OTP'ning 1-darajali kanali, ya'ni **repo = admin panel parolsiz**; seed super_admin `+998901234567/admin1067`; Maps kaliti; PAT `.git/config`da | O'rta | Yuqori | Platforma auditi |
| 7 | **Baza portlari internetga ochiq:** Postgres `:5600` (parol `.env.example`da chop etilgan), Redis `:6379` parolsiz; refresh token'lar **ochiq JWT, 30 kun, revoke yo'q** | O'rta | Yuqori | Platforma auditi |
| 8 | **Surge sukut bo'yicha qurollangan** (`surgeEnabled` default TRUE, `maxSurge 3.00`), o'chirgichi rasm. Operator qo'shniga telefon orqali 3× narx aytadi | O'rta | Ishonchni o'ldiradi | Pul auditi |
| 9 | **Himoyasiz pul yo'li:** `payments.controller.ts:109-116` — faqat `AdminAuthGuard`, rol yo'q, audit satri yo'q → istalgan dispetcher balans yozadi. 183 staff route'da rol tekshiruvi yo'q; 4 ta export route butun mijoz/haydovchi/moliya ro'yxatini beradi | Yuqori (ikkinchi dispetcher yollangan kun) | Yuqori | Xavfsizlik + platforma auditlari |
| 10 | **Inson ishlatadigan ikki ilovada 0 test** (0 web, 0 Kotlin, 17 API). Har tuzatish jimgina regressiya qiladi | **Aniq** | Yuqori | Tanqidchi #4, o'zim tasdiqladim |
| 11 | **Cutover regressiyasi:** `KAS_MODE=birjoy` bugun narx kartasini jimgina yo'qotadi, mijozning bekor qilish tugmasini o'ldiradi, `payDebtWithCoins` ni ishlamas qiladi. **19 ta `notImpl`** | Yuqori | Yuqori | Pul + yo'lovchi auditlari |
| 12 | **Ledger ishorasi 6 yozuvchidan 3 tasida teskari;** har `bonus` hisoboti qo'lda va avtomatik bonuslarni **nolga keltiradi** | Yuqori | O'rta | Pul auditi |
| 13 | **Balans yozuvchilari read-modify-write** → yo'qolgan yangilanish → haydovchi jimgina −50 000 dan pastga tushadi → buyurtma olmaydi → **hech kim aytmaydi** → kas'ga qaytadi | O'rta | Yuqori (16.5 ga) | Pul auditi |
| 14 | **Majburiy yangilanish yo'li yo'q.** 622 haydovchiga APK yuborilsa, o'sha build 622 telefonda abadiy muzlaydi; ma'lum nosoz APK `9ff71ae8` allaqachon tarqalgan | Yuqori | Yuqori | Ilova + platforma auditlari |
| 15 | **Bironta Kotlin satri real telefonda ishlamagan**, release R8-minified, crash reporting faqat DEBUG'da | Yuqori | Yuqori | Ilova auditi, PROGRESS |
| 16 | **Umumiy portlash radiusi:** daromad keltirayotgan repo A (`bot1067`) va repo B bitta VPS'da; `uploads/driver-docs` diskni to'ldirsa — ikkalasi ham o'ladi | O'rta | Yuqori | Tanqidchi #9 |
| 17 | **21.5% qo'ng'iroq darajasida o'lchab bo'lmaydi** (enum xatosi), **16.5 umuman o'lchab bo'lmaydi** (onlayn vaqt yozilmaydi) — ya'ni butun 9.6× dasturi **ko'r** | Aniq | Yuqori | Analitika + o'sish auditlari |
| 18 | **Dispatch skorining 15% — doimiy konstanta** (reyting yig'ib bo'lmaydi) | Aniq | O'rta | Tanqidchi #5 |
| 19 | **Eskiz alpha-name 1-2 oy regulyativ kutish** — bu haqiqiy kritik yo'l va hech kim arizani bermagan | Yuqori | Yuqori (grafikka) | Tanqidchi #10 |
| 20 | **Repo gigiyenasi:** 2 ta **qulflangan** worktree eski `7d130ec` da + 3 ta tashlandiq shoxobcha. Tanqidchining birinchi grep'i **aynan o'lik nusxaga urilgan** — kelgusi audit o'lik snapshotdan fakt oladi | Yuqori | O'rta | Tanqidchi #9; CLAUDE.md buni taqiqlaydi |
| 21 | **Dispetcher shtati modellashtirilmagan:** 600 buyurtma/kun × 89.4% ≈ **daqiqada bitta qo'ng'iroq, 16 soat** — rejalarda oylik/smena raqami yo'q | Yuqori | O'rta | Tanqidchi #9 |
| 22 | **Raqib mahalliy o'zbek jamoasi** (446 ta `uz.taxisoft.*` havolasi) va bizning APK http orqali ochiq — har xususiyatimizni haftalarda ko'chiradi | Yuqori | O'rta | RAQIB_TAHLIL + tanqidchi |

---

## 10. EGA QARORI KUTILAYOTGANLAR

Faqat ega hal qila oladigan, va deyarli hammasi **kodsiz**:

1. **1067 raqami, SIM va operator shartnomasi kimning nomida?** (Bu javobsiz F9 ni rejalashtirish ma'nosiz.)
2. **BirJoy taksi qaysi yuridik shaxs orqali ishlaydi va bu kas1067 ijarasini to'layotgan shaxs bilan bir xilmi?**
3. **Fiskal chek (OFD) majburiyati bizdami yoki haydovchidami?** — bir xatboshi buxgalter javobi. Platforma yo'lovchi pulini olmaydi (naqd haydovchiga), shuning uchun ehtimol haydovchida — lekin taxmin qilib qurmaymiz.
4. **Ma'lumot joylashuvi:** Contabo Germaniya + shifrlanmagan pasport/guvohnoma skanlari — yurist bir xatboshi bersin. **VPS taxmin bilan ko'chirilmaydi** (zaxira yo'q).
5. **DNS:** Spaceship → birjoy.online → A-yozuv, host `taxi`, qiymat `169.58.55.249`. **10 daqiqa, 4 ta ishni ochadi.** (DNSSEC'ga tegilmaydi — 2026-08-16 hodisasi.)
6. **Eskiz shartnomasi + alpha-name arizasi** — bugun boshlanmasa, SMS kanali 1-2 oyga kechikadi.
7. **5 pilot haydovchi:** ism, telefon, **Android versiyasi** (`deviceModel` o'lchovi ishlamaydi — qo'ng'iroq bilan so'raladi).
8. **Zona poligonlari:** bozor, avtovokzal, boshqa to'xtash joylari — FIFO navbatsiz dvigatel o'lik turadi.
9. **Tarif raqamlari:** kutish narxi (bepul daqiqalar + daqiqaliq), bekor qilish jarimasi bo'ladimi, pog'onali km, qishloq koeffitsienti — kas'ning 9 maydonli tarifiga paritet uchun.
10. **Surge:** umuman yoqilsinmi? Yoqilsa `maxSurge` qancha? (Hozir sukut bo'yicha 3.00 va o'chirgich ishlamaydi.)
11. **Mijoz cashback:** ilova buyurtmasi va qo'ng'iroq buyurtmasi uchun **alohida stavka** (kas shuni qiladi) — bu 10.6% → 60% ga yagona to'g'ridan-to'g'ri richag. Tanga klampi (≤350) bilan qanday birlashadi?
12. **Komissiya modeli:** tekis 2000 som qolsinmi, yoki qabul foiziga bog'langan pog'onali chegirma (DiDi/Yandex namunasi — **pul chiqmaydi**, faqat marja kechiriladi)?
13. **Rollar:** `ROLLAR_TAKLIF.md` dagi 6 savol. **135 route rol tekshiruvsiz (65 tasi holat o'zgartiradi)** — ikkinchi dispetcher hisobi ochilishidan **OLDIN** yopilishi shart.
14. **Darhol xavfsizlik:** super-admin parolini almashtirish (git tarixida) · bot token'ini BotFather'da qayta chiqarish · `TELEGRAM_INITDATA_DEV_BYPASS=1` ni `.env`dan olib tashlash · domen tayyor bo'lgach 3010/4000 portlarini yopish.
15. **`apps/client`:** o'chiriladimi yoki muzlatiladimi? (Uchinchi variant — `deploy.sh` ga qo'shish — tavsiya qilinmaydi.)
16. **Yoqilg'i shoxobchasi bilan chegirma shartnomasi** — kod emas, shartnoma; muhandis-kun boshiga eng katta mukofot.
17. **Dispetcher shtati:** 600 buyurtma/kun uchun necha kishi, necha smena, oylik qancha.
18. **`values-uz-rCyrl`** kerakmi — 45+ yoshli haydovchilar kirill o'qiydimi? (Lotin satrlari allaqachon ajratilgan, 1 kunlik ish.)
19. **Kas obunasi:** F9'dan keyin 30 kun orqaga qaytish oynasi tasdiqlanadimi.

---

## NIMA TEKSHIRILMADI (halol qamrov bayonoti)

Quyidagilar **bu hisobotda tekshirilmagan** — «bor» yoki «yo'q» deb o'qilmasin:

- **Jonli baza va VPS** — brifing shartiga ko'ra qayta o'lchanmadi. Barcha jonli raqamlar 2026-09-12 brifingidan.
- **`commissions_order_type_uq` jonli bazada bormi** — schema'da bor, ikkala migratsiyada yo'q; `read-only` bo'lgani uchun jonli tekshirib bo'lmadi.
- **kas1067 APK qayta dekompilyatsiya qilinmadi** — raqib haqidagi har bir da'vo `RAQIB_TAHLIL.md` va `DRIVER_APK_AUDIT.md` ga suyanadi.
- **Huquqiy xulosa yo'q.** Ma'lumot joylashuvi bo'yicha **ikki auditimiz bir-biriga zid** — bu hisobot ularni murosaga keltirmaydi, yuristga yuboradi.
- **F0.5**: `git bundle` bor-yo'qligi va B `clients.balls` real/seed ekanligi tekshirilmadi.
- **P0-10 prod imzo** (release keystore) holati tekshirilmadi.
- **Operator auditining «javob shakli mos kelmasligi qo'lda biriktirishni 3 UI yo'lida buzadi»** da'vosi qarama-qarshi tekshiruvdan **o'tmagan** — u alohida tasdiqlanishi kerak.
- **Batareya, OEM xulqi, R8 release APK** — hech qachon ishlamagan, shuning uchun hech narsa deyilmaydi.

---

**Oxirgi jumla.** Bu hisobotda 90 dan ortiq «kerak» sanalgan, lekin ulardan **beshtasi bitta muhandis-kun ham talab qilmaydi** (1067 raqami, yuridik shaxs, fiskal, ma'lumot joylashuvi, DNS) va **ularning har biri qolgan 85 tasini bekor qilishi mumkin.** Shu beshtasi javob topmaguncha, skorlash og'irliklariga yana bir kun sarflash — noto'g'ri tartib.