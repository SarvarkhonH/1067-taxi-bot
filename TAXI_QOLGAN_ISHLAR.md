# BIRJOY TAXI — QOLGAN ISHLARNING YAGONA REYESTRI

**Sana:** 2026-09-13 · **Manba:** `BIRJOY_TAXI_REJA_V3.md` (G0–G6) + `YAKUNIY_AUDIT_2026-09-12.md` (§3 a/b/c/d) +
`BIRJOY_TAXI_MASTER.md` (v2 F0–F9) + `docs/TESTING-PLAN.md` (C1–C7) + `ZANJIRLI_DISPATCH_DOD.md` +
`SMS_SHLYUZ_DOD.md` + `ROLLAR_TAKLIF.md`

> **Bu fayl nima uchun bor.** Rejalar sakkizta hujjatga tarqalgan va auditning bir qismi
> **eskirgan** — yozilganidan keyin bir kunda o'nlab band yopilgan. Ega «hammasini tugat» degach,
> birinchi ish — *nima qolganini* bitta joyda, **bugungi kodga qarshi qayta o'lchab** yozish edi.
>
> **Usul:** har band 2026-09-13 da to'rtta mustaqil tekshiruvchi agent tomonidan hozirgi kodga
> qarshi qayta o'lchandi (dispatch · pul · Android · panel), har biri `fayl:qator` isboti bilan.
> Auditdan ko'chirilgan, lekin qayta o'lchanmagan bironta satr yo'q.

---

## 0. Uch raqam — bugungi holat

| O'lchov | 09-12 audit | **09-13** | Nega o'zgardi |
|---|---|---|---|
| Kod kengligi | ~70% | **~72%** | Tarif jonli, qutqaruv navbati ishlaydi, o'lik tugmalar kamaydi |
| Darvoza progressi | ~15% | **~20%** | G1 amalda yopildi, G3 ning markaziy savoliga javob topildi |
| **Shaharni ko'tarishga tayyorlik** | ~10% | **~12%** | Hali **0 real to'lovli safar**, 1 telefonda 1 ilova |

Jonli o'lchov (`psql`, 15:00 UTC): 750 haydovchi (1 onlayn) · 13 buyurtma (4 tugallangan, hammasi sinov) ·
`fcm_token` 1/750 · real mijoz safari **0**.

---

## 1. BUGUN YOPILDI — `ready for verification` (8 commit, deploy qilinmagan)

| # | Ish | Isbot |
|---|---|---|
| 1 | **Ekrandagi tarif = olinadigan tarif.** 14 raqam hech kim o'qimaydigan jadvalga saqlanardi: panel tungi ×1.3 ko'rsatardi, tizim ×1.5 olardi | `rates.service.ts` (jadval → env → sukut); pricing 110/110 |
| 2 | Tarifni **paneldan** o'zgartirish — deploysiz, keyingi buyurtmadanoq | Chegara tekshiruvi + audit satri + har satrda «qayerdan olinyapti» |
| 3 | Bo'sh quti **nol emas** (`Number('')` = 0 → har kutish daqiqasi bepul bo'lardi) | `rates.service.spec.ts` |
| 4 | Kutish narxi bitta formula (jonlisi 5 daqiqa, chaqirilmaydigan nusxa 3 derdi) | `waitingFare()` yagona yo'l |
| 5 | **Mashina bo'shaganda** «mashina yo'q» buyurtmasi qayta uriniladi (~183/oy) | `supply-retry.spec.ts`, har qorovul yiqiluvchi tomondan |
| 6 | **To'lqinli taklif** — bir necha haydovchiga parallel · **DARK** (`DISPATCH_WAVE_ENABLED=0`) | `wave-offer.spec.ts`; default testda qulflangan |
| 7 | **Qabuldan keyin qotgan safar** sweep'i — avval faqat `pending`/`dispatching` ko'rilardi | `stalled-ride.spec.ts`; hech narsani o'zgartirmaydi, faqat aytadi |
| 8 | Dispetcher biriktirsa endi **push ham** ketadi (fon'dagi ilova hech nima olmasdi) | `manual-assign.spec.ts` |
| 9 | Taklif bekor sababi — **enum**, matn emas | Dispetcher ko'chirgan haydovchiga «kech qoldingiz» deyilardi |
| 10 | **Rad sabablari panelda ko'rinadi** (API kecha yozgan, hech kim ko'rsatmagan) | `CallOutcomes` — tarkib + `unexplained` bir xil ko'rinarli |
| 11 | **Kuzatuv havolasi** tugmasi operator kartasida | Sahifa va token yaratuvchi bor edi, chaqiruvchi yo'q edi |
| 12 | `intercity` ning ikki GET yo'li **internetga ochiq edi** → staff-only | `public-routes.spec` / `staff-routes.spec` |
| 13 | Mijozning **o'rtacha safar narxi** yozila boshladi (panelda abadiy «0 UZS») | `completeRide` da yugurish o'rtachasi |
| 14 | **Release build'da ochiq HTTP butunlay yopildi** | Manifest merge: release `false`, debug `true` |
| 15 | **Tanaffus holati saqlanadi** (ilova o'lsa haydovchi stolda taklif olardi) | DataStore + tiklash |
| 16 | **Crash hisoboti 3 marta uriniladi** (avval yuborishdan oldin o'chirilardi) | Hisob chaqiruvdan oldin oshadi — sikl imkonsiz |
| 17 | Ilovada 3 ta o'lik tugma | Shartlar/Maxfiylik olib tashlandi · «Hammasini ko'rish» ishlaydi · mashina «O'zgartirish» → matn |
| 18 | Broadcast «yuborildi» emas, «jo'natildi» deydi | `sent` = FCM qabul qildi |
| 19 | Kodni yolg'on tasvirlagan 3 joy | `notifyNoDrivers` izohi · `SurgeService` dagi o'lik inject · `driver_en_route` |

**Tekshiruv:** API **470/470** (47 suite; kun boshida 437/43) · Kotlin **8/8** · web `tsc` toza ·
Android debug+release assemble ✅. **Jonli sinov yo'q** — commitlar hali VPS'da emas.

---

## 2. QOLGAN — **kod ishi** (egadan hech narsa kerak emas)

| # | Ish | Kun | Tegadigan raqam | Hozirgi holat |
|---|---|---|---|---|
| K3 | **`in_progress` ni qayta biriktirish** (yo'lda buzilgan mashina) | 1 | Safar o'rtasidagi halokat | `operator.service.ts:300` — `activeStatuses` ichida yo'q |
| K4 | **Zona FIFO ni ulash** — dvigatel to'liq, bitta ham chaqiruvchi yo'q | 6 | 16.5 onlayn | Zona yaratadigan POST yo'q; ilovadagi «#N navbatda» `null`. **E1 (zona nuqtalari) bilan birga** |
| K8 | **Hujjat skanlari shifrsiz**, `uploads/` hech qanday volume'da emas; saqlangan `fileUrl` mavjud bo'lmagan route'ga ishora qiladi | 1 | Huquqiy + ma'lumot yo'qolishi | `driver-documents.service.ts:34,92,95` |
| K9 | **Tungi oyna ikki marta hisoblanishi mumkin** — 22-06 vaqt qoidasi tungi ×1.5 ustiga ko'payadi | 0.5 | Narx ishonchi | Panelda ogohlantirish kerak |
| K10 | **Versiya darvozasi env'dan** — chegarani ko'tarish uchun deploy kerak | 1 | 622 telefon | Tarif naqshini sozlamalar ekraniga ham qo'llash (ega qarori: matn qutisi dispatch raqamlarini qimirlatadi) |
| K12 | **Android 14 da full-screen ruxsati so'ralmaydi** — jimgina heads-up ga tushadi | 0.5 | 238 rad | `OfferAlert.kt:95` faqat logga yozadi |
| K14 | **Ilovada ~70 ta qattiq yozilgan matn** (`values-ru` to'liq, `values-uz-rCyrl` yo'q) | 2 | 45+ yoshli haydovchilar | `RadioManager`, `HomeViewModel`, `LocationForegroundService` |
| K15 | **Kotlin testlari 8 ta** — `RideActionQueue`, `VersionGate`, `BootReceiver`, tanaffus qoplanmagan | 3 | Jimgina regressiya | 2 fayl |
| K16 | **Web'da 0 ta test** — CI faqat `tsc --noEmit` | 3 | Operator ekrani | Test skripti ham yo'q |
| K17 | `HomeScreen.kt` da ~250 satr chaqirilmaydigan composable | 0.3 | Chalkashlik | `OfferPopup`/`ActiveRideSheet` bilan almashtirilgan |
| K23 | **Komissiya pog'onasi paneldan tahrirlanmaydi** | 1 | 16.5 onlayn | Tarif jadvali naqshini takrorlash |
| K24 | Migratsiyalar jonli sxemadan orqada (2 fayl, jonli 84 jadval) | 1 | Faqat DR hujjati | Jonli bazada `commissions_order_type_uq` **bor** (tekshirildi); tiklash `pg_restore` orqali |

**Jami: ~20 muhandis-kun** (kun boshida ~33 edi).

---
## 3. QOLGAN — **egadan kerak** (kod emas, javob)

| # | Savol | Nega to'sadi |
|---|---|---|
| E1 | **Taksi to'xtash nuqtalari** (bozor, avtovokzal, kasalxona…) | K4 (zona FIFO) shunga taqaladi — `queue_zones` **bo'sh** |
| E2 | **5 pilot haydovchi** — ism, telefon, Android versiyasi | G4 ning butun mezoni |
| E3 | **Ekranda push ko'rindimi** — telefoningizda bitta tasdiq | C4, hali hech kim ko'rmagan |
| E4 | **187 commit `origin`ga push qilinsinmi** | Kod bitta noutbukda |
| E5 | **Bekor qilish jarimasi bormi, qancha** | `cancellation_rules` bo'sh → har bekor qilish bepul |
| E6 | **Surge yoqilsinmi** (hozir qurolsiz, default o'chiq) | Mexanizm tayyor |
| E7 | **Bot tokenini almashtirish** (git tarixida qoladi) | «Oxirida» deb qoldirilgan |
| E8 | **Super-admin parolini almashtirish** (git tarixida) | Faqat 2 ta super_admin bor |
| E9 | **Ma'lumot joylashuvi** — Germaniya VPS, shifrsiz pasport skanlari | «Qabul qilingan xavf» deyilgan, K8 buni yumshatadi |
| E10 | **Haydovchi puli qanday chiqadi** — naqd modelda «Yechib olish» tugmasi nima qiladi | Hozir «tez orada» oynasi |

---

## 4. QOLGAN — **real telefon / real safar kerak** (men qila olmayman)

| # | Tekshiruv | Holat |
|---|---|---|
| C2 | Ruxsat oqimi Android 12 / 13 / 14 da | Kod 5 unit test bilan qoplangan, **qurilmada emas** |
| C3 | Bitta to'liq real safar: taklif → qabul → **yakunlash** | Taklif+qabul real telefonda ✅, yakunlash ❌ |
| C4 | **Ekran o'chiq holda** taklif keladimi | FCM zanjiri isbotlangan, ekranda ko'rilmagan |
| C5 | Qayta yuklangandan keyin smena davom etadimi | Manifest tekshirilgan, qurilmada emas |
| C6 | Yo'lovchiga SMS | Ega ruxsati kerak |
| C7 | Operator panelida bitta real qo'ng'iroq | Panel jonli render bilan hech qachon tekshirilmagan |

---

## 5. Reja «QURILMASIN» deydi — **27 band, ega ha/yo'q demagan**

`BIRJOY_TAXI_REJA_V3.md` §1.1 (o'chirish, 9 ta) va §1.2 (qurilmasin, 18 ta) — **hammasi tasdiq kutadi**,
shuning uchun bugun ham hech narsa o'chirilmadi, hech narsa qurilmadi.

**O'chirish taklifi (9):** `apps/client` (26 fayl — Vercel va CI hali quradi) · ikkinchi surge · ikkinchi
incentive dvigateli · haftalik settlement cron · `sla` (**bo'sh papka**) · `surge` (**bo'sh papka**) ·
route-deviation cron · OSRM qatlami · promo dvigateli.

**Qurilmasin taklifi (18):** Payme/Click/karta · haydovchi payout rellari · korporativ · fleet ·
intercity · kafolatlangan daromad · selfie/liveness · audio yozish · raqam maskalash · ichki chat ·
certificate pinning · batch/Hungarian/RL matching · pooling · ETA ML · Prometheus/Grafana · K8s ·
iOS · ovozli AI operator.

> Bularning hammasi **kodi bor, chaqiruvchisi yo'q** holatda turibdi (pul, promo, korporativ, fleet,
> intercity, incentives — hech bir UI chaqirmaydi). Ha/yo'q aytmaguningizcha shunday qoladi.

---

## 6. Darvozalar — G0…G6

| Darvoza | Holat | Qolgani |
|---|---|---|
| **G0** qon to'xtatish | 🟢 deyarli | E4 (push), E7/E8 (sirlar) |
| **G1** ko'z ochish | 🟢 **yopildi** | Rad sabablari · onlayn vaqt · hisobot · tarif — hammasi jonli |
| **G2** birinchi real safar | 🟡 | C2, C5, K10. Cleartext yopildi |
| **G3** yetkazish | 🟡 markaziy savol yopildi | C3 (yakunlash), C4 (ekran o'chiq), K12. To'lqin qurildi — DARK |
| **G4** pilot | ⬜ | E2 (5 haydovchi) — kodsiz to'siq |
| **G5** ta'minot hujumi | ⬜ | K4 (FIFO) + E1 (zona nuqtalari), K23. Qutqaruv navbati qurildi |
| **G6** kanal + uzilish | ⬜ | `BirJoySource` ~8/27 metod · mijoz cashback · soya rejimi |

---

*Har «0 / hammasi / hech kim» da'vosi buyruq+natija bilan o'lchangan (CLAUDE.md R3).
«Done» — faqat ega qabul qilgandan keyin (R1/R7).*
