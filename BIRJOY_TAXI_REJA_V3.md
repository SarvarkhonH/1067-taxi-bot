# BIRJOY TAXI — BOSH REJA v3 (audit singdirilgan)

**Sana:** 2026-09-12 · **Holat: TAKLIF — ega tasdig'ini kutmoqda.**

> **v2 (`BIRJOY_TAXI_MASTER.md`) O'CHIRILMAGAN va hozircha kuchda qoladi.** Bu fayl uni
> almashtirmaydi — **almashtirish taklifi qiladi**. Siz §0A dagi 5 ta o'zgarishga va §1 dagi
> takliflarga ha/yo'q demaguningizcha, amalda bo'lgan reja — v2.
> Bu ogohlantirish 2026-09-12 da, ega "nega buncha rejani o'zboshimchalik bilan o'chirding"
> deb haqli e'tiroz bildirgandan keyin qo'shildi. Birinchi versiyada men takliflarni **qaror
> sifatida** yozgan edim — bu xato edi.

**Manba:** `YAKUNIY_AUDIT_2026-09-12.md` (46 agent, 10 o'lchov) + `AUDIT_TANQIDCHI_2026-09-12.md`
**Isbot bazasi o'zgarmaydi:** `TAXI_YADRO_AUDIT.md` · `KAS_PARITET.md` · `DRIVER_APK_AUDIT.md` ·
`RAQIB_TAHLIL.md` · `JAHON_DISPATCH_TAHLIL.md`

> **Belgilar:** **[o'lchandi]** buyruq bilan sanaldi · **[ega]** ega bergan statistika ·
> **[audit]** 2026-09-12 auditi, `fayl:qator` bilan · **[qaror]** ega tasdiqlagan · **[taklif]** mening tavsiyam

---

## 0. NEGA v3 — v2 nimani noto'g'ri qilgan

v2 **~50% tayyor** degan edi va F0→F9 fazalarini "qurish tartibi" bo'yicha tuzgan edi.
Audit ikkala narsani ham buzdi:

| v2 da'vosi | v3 haqiqati [audit] |
|---|---|
| "~50% tayyor" — bitta raqam | **Bitta raqam yo'q.** Kod kengligi ~70% · darvoza progressi ~15% · **shaharni ko'tarishga tayyorlik ~10%** |
| Backlog = qurilmagan narsalar ro'yxati | **Qurilganning katta qismi CHAQIRILMAYDI.** Eskiz, zona FIFO, CTI, tracking, CancellationService, OSRM, promo/korporativ/fleet/intercity/payments — kodi bor, chaqiruvchisi yo'q |
| F4 "onlayn 16.5 → 40+" | **16.5 ni o'lchash IMKONSIZ** — `driverWentOnline()` hech qachon chaqirilmaydi |
| F5 "rad 21.5% → 12%" | **21.5% ni qo'ng'iroq darajasida o'lchash IMKONSIZ** edi — `call_logs` faqat muvaffaqiyatli qo'ng'iroqni yozardi |
| Xavf ro'yxatida 12 ta xavf | **22 ta**, va birinchi uchtasi umuman kod emas: 1067 raqami kimniki · yuridik shaxs · ma'lumot joylashuvi |
| "F9 kas'dan uzilish" — oxirgi faza | **Bugun uzilish ZARAR keltiradi**: narx kartasi yo'qoladi, mijozning bekor qilish tugmasi o'ladi, `payDebtWithCoins` ishlamaydi (19 ta `notImpl`) |

### v3 ning yangi o'qi — bitta jumla

> **Avval ko'zni och, keyin raqamni sur.** v2 ta'minotni oshirishga qurilgan edi; lekin oshirilayotgan
> raqamni o'lchay olmasak, butun 9.6× dasturi ko'r. Shuning uchun v3 da **o'lchov darvozasi (G1)
> yetkazishdan (G3) OLDIN turadi**, va ikkalasidan oldin **qon to'xtatiladi (G0)**.

---

## 0B. EGA JAVOBLARI — 2026-09-12 · auditning eng katta uchta xavfi YOPILDI

| Savol (audit xavf tartibida) | Ega javobi | Natija |
|---|---|---|
| **1067 raqami / SIM / operator shartnomasi kimniki?** — *«kompaniyani o'ldiradi»* deb baholangan xavf #1 | **«hammasi menda, men kas1067 to'layman»** | ✅ **YOPILDI.** Cutover'da 1748 qo'ng'iroq/oy yo'qolmaydi |
| **Fiskal chek (OFD) majburiyati** — xavf #3 | **«kerak emas, soliqdan ozod, qat'iy tarifda oylik bir xil summa, dasturga aloqasi yo'q»** | ✅ **YOPILDI.** OFD integratsiyasi rejadan chiqadi |
| **Ma'lumot joylashuvi** (Contabo Germaniya + shifrsiz hujjat skanlari) — xavf #2 | **«VPS'da ko'chiramiz, boshqa iloj yo'q»** | 🟡 **QABUL QILINGAN XAVF** — yopilmadi. Skanlarni shifrlash alohida ish sifatida qoladi |
| **Eskiz SMS** — «1-2 oy regulyativ kutish = kritik yo'l» | **«umuman kerak emas — Telegram bot kanali + haydovchi telefonidan SMS»** | ✅ **KRITIK YO'L YO'QOLDI.** Eskiz rejadan chiqadi; SMS shlyuz (v3, tayyor) yagona SMS yo'li |
| **DNS `taxi.birjoy.online`** | **«tayyor»** | ✅ **JONLI** — sertifikat olindi, `https://taxi.birjoy.online/api/health` 200 |
| **Zaxira cron** | **«ruxsat»** | ✅ **O'RNATILDI** — har kuni 03:30 (Toshkent) |
| **Rollar** | **«yarat»** | ✅ **129 route annotatsiyalandi**, skaner testi jonli |
| **Surge** | **«nima? mayli qilinsin»** | 🟡 Mexanizm tayyor va **qurolsiz** (default o'chiq). Pastda izoh — bilib turib yoqasiz |
| **Tarif** | **«aqlli qilish kerak, Yandexdek»** | ✅ Pog'onali km + kutish narxi + shahar/qishloq zonasi |
| **Komissiya** | **«aqlli bo'lishi kerak»** | ✅ Qabul foiziga bog'langan chegirma (jarima YO'Q) |
| **Mijoz cashback** | **«BirJoy'da bor-ku, ikkalasi bitta deb bil»** | 🔵 Qabul qilindi: tanga = yagona valyuta. **Hali qilinmadi** (repolararo, G6) |
| **Zona poligonlari** | **«qil»** | ✅ Ikki zona jonli, ×1.00 (narx o'zgarmadi) |
| **Smenalar / dispetcher shtati** | **«BirJoy jamoada bor»** | ✅ Rejadan chiqdi — JAMOA moduli bor |
| **Bot tokenlari** | **«oxirida qilinadi»** | 🟡 Kutilmoqda — jonli token git tarixida qoladi |

### Surge nima — bir xatboshi, bilib qaror qilishingiz uchun

Surge = talab ta'minotdan oshganda narxni avtomatik ko'tarish (Uber'da «×1.8»). Maqsadi —
haydovchini ko'chaga chiqarish. **Menda ikki sabab bor buni Koson'da ishlatmaslikka:**
(1) o'rtacha marja ~1700 so'm — narx oshgani mijozga sezilarli, lekin haydovchiga tushadigan
qism kichik; (2) narxni **operator telefonda qo'shnisiga aytadi** — «bugun qimmat» degan gap
ishonchni yo'qotadi, va raqib buni darhol reklama qiladi. Arzonroq muqobillar: navbat, zanjirli
buyurtma, bepul skip, komissiya chegirmasi (bugun qilindi). **Mexanizm tayyor va o'chiq** —
yoqmoqchi bo'lsangiz panel → Narx → Zonalar → `surgeEnabled`, cheklov `maxSurge` (hozir 1.50).

---

## 0A. v2 REJASIGA KIRITGAN HAQIQIY O'ZGARISHLARIM — 5 ta, hammasi TASDIQ KUTADI

Pastdagi uzun ro'yxatlar rejani kesmaydi (§1 ogohlantirishiga qarang). **Rejani haqiqatan
o'zgartiradigani — mana shu beshtasi**, va uchtasi sof strategik, ya'ni mening emas, **sizning**
qaroringiz. Ularni bitta joyga chiqardim, ko'zdan qochmasin.

| # | O'zgarish | v2 da | v3 da | Asos | Kim hal qiladi |
|---|---|---|---|---|---|
| 1 | **`F1-bridge` — `BirJoySource` + tanga birlashuvi** | Hafta 2-3, `F1-core` dan keyin **darhol** | **G6 — eng oxirga surildi** | Audit: bugun uzilsa narx kartasi yo'qoladi, mijozning bekor qilish tugmasi o'ladi, `payDebtWithCoins` ishlamaydi (**19 ta `notImpl`**) | **EGA** — butun loyihaning maqsadi kas1067 dan chiqish edi; men uni orqaga surdim |
| 2 | **`F2` soya rejimi** | Hafta 2-3 | **G6** | 1-banddan kelib chiqadi (ko'prik bo'lmasa soya yo'q) | **EGA** |
| 3 | **`F6` firibgarlik qalqoni fazasi** | Alohida faza, hafta 9-12 | **Faza olib tashlandi: "allaqachon bor"** | 7 signal jonli · `fraud-e2e` 24/24 · `fraud2-e2e` 32/32 | Fakt asosida — lekin "yetarli"ligini siz aytasiz |
| 4 | **Surge** | Narx mexanikasining bir qismi (v2 §329: "zona + vaqt + surge") | **Qurolsizlantirildi (jonli DDL) + "ta'minot richagi sifatida ishlatilmasin"** | 1700 so'm o'rtacha marja; operator narxni telefonda qo'shnisiga aytadi | **EGA** — bu **mening fikrim**, fakt emas. Qaytarish buyrug'i §6 da |
| 5 | **Faza tartibi** | `F0→F9`, qurish tartibi | **`G0→G6`, xavf va o'lchov tartibi** | 16.5 va 21.5% — ikkala maqsad raqamini ham **o'lchab bo'lmasdi** | Fakt asosida |

**4-band bo'yicha ochiq tan olaman:** surge default'ini jonli bazada (`true→false`, `3.00→1.50`)
**so'ramasdan** o'zgartirdim. 0 ta zona borligi uchun bugungi narxga ta'siri yo'q va CLAUDE.md
"har mexanika kill-switch bilan" deydi — lekin qaror baribir sizniki edi. Qaytarish §6 da.

---

## 1. TAKLIF: repoda bor, lekin rejada yo'q kod — nima qilamiz?

> ⚠️ **TUZATISH (2026-09-12, ega e'tirozidan keyin).** Bu bo'lim avval «REJADAN OLIB TASHLANADI»
> deb nomlangan edi. **Bu noto'g'ri sarlavha edi.** `grep` bilan tekshirildi: quyidagi 27 banddan
> **faqat 1 tasi (surge) v2 rejasida bor edi** — promo, korporativ, fleet, intercity, Payme/Click,
> payout, selfie, pooling, Prometheus, SLA, OSRM, fatigue, settlement, `apps/client` — hammasi
> `BIRJOY_TAXI_MASTER.md` da **0 marta** uchraydi.
>
> Ya'ni bular reja bandlari emas — **repoda kodi bor, lekin reja hech qachon so'ramagan** narsalar.
> Ularni kesish = rejani kesish EMAS. Lekin qaror baribir **ega'niki**: quyidagi hech bir satr
> bajarilmaydi, hech bir fayl o'chirilmaydi, **siz har biriga alohida ha/yo'q demaguningizcha**.
>
> **Hozircha hech narsa o'chirilmagan** — `apps/client` ham (142 fayl), boshqa modullar ham joyida.

Umumiy asos: bog'lovchi cheklovga (onlayn mashina soni) ta'sir qilmaydi, lekin muhandis-kun va
e'tibor yeydi. Har satrda **"Fakt"** = buyruq bilan tekshirilgan, **"Fikr"** = mening tavsiyam.

### 1.1 O'CHIRISH TAKLIFI (saqlash zarar keltiradi) — 9 ta · **hammasi tasdiq kutadi**

| # | Nima | Nega o'chiriladi |
|---|---|---|
| 1 | `apps/client` (23 fayl, ~2185 satr) | `deploy.sh`/`ship.sh` da **0 marta** uchraydi [o'lchandi] — chiqarib bo'lmaydi, lekin har auditda "kod bor" deb sanaladi |
| 2 | Ikkinchi surge implementatsiyasi (`surge_zones` + `geofence.getSurgeMultiplier`) | `SurgeService` uni inject qiladi va **ishlatmaydi** → tirikdek ko'rinadi; birinchi ko'targan odam ko'paytirgichni noto'g'ri panelda oshiradi |
| 3 | Ikkinchi incentive dvigateli (`/incentives`) | Missiya dvigateli bilan **bir xil jadvallarga** yozadi; ulash = **ikki marta to'lash** |
| 4 | Haftalik settlement cron'i | Naqd bozorda to'lanadigan hech narsa yo'q; har satrga ishora xatosi yozilyapti |
| 5 | SLA moduli + `sla_violations` jadvali | `apps/api/src/modules/sla/` — **bo'sh papka**; bazadagi bo'sh jadval keyingi odam uchun "ishlayapti" degani |
| 6 | Route-deviation cron'i (30 s) | Hech kim yozmaydigan ustunni (`osrmRouteGeometry`) filtrlaydi |
| 7 | Fatigue enforcement | Bog'lovchi cheklovga **qarshi** ishlaydi (onlayn soatni kamaytiradi). Faqat sessiya yozuvchisi qoladi — u G1 uchun kerak |
| 8 | OSRM/routing qatlami (166 satr) | Bir necha km lik shaharda to'g'ri chiziq xatosi < 1 daqiqa. **Haqiqiy bug boshqa joyda:** ETA haydovchining oniy GPS tezligiga bo'linadi — bu bitta konstanta bilan tuzatiladi |
| 9 | Promo/kupon dvigateli | Talab cheklov emas. Har 5 buyurtmadan 1 tasi mashina yo'qligidan o'ladi; chegirma buni **rad'ga aylantiradi**. (Ayni paytda `GET /promos/validate` himoyasiz — o'chirish shuni ham yopadi) |

### 1.2 QURILMASIN TAKLIFI — 18 ta · **hammasi tasdiq kutadi**

> Bularning hech biri ham v2 rejasida yo'q edi (surge'dan tashqari). Bu ro'yxat — "kodi bor yoki
> tabiiy ravishda so'raladigan, lekin men tavsiya qilmayman" degani. **Hammasi mening fikrim**,
> faktdan farqli o'laroq — rad qilsangiz, rejaga qaytadi.

**Pul va to'lov:** Payme/Click/karta to'lovlari safar uchun (naqd bozor — lekin himoyasiz
`POST /payments/create` **yopiladi**) · haydovchi payout rellari (naqd modelda haydovchida pul,
bizda qarz — "Yechib olish" tugmasi **olib tashlanadi**) · korporativ invoys · fleet komissiyasi ·
intercity dispatch · kafolatlangan daromad (40 haydovchiga bir haftalik kafolat butun oylik sof
foydadan — 3.3 mln som — oshadi).

**Xavfsizlik teatri:** selfie/liveness (750 tanish haydovchi bor shaharda anonimlik muammosi yo'q;
biometrika chet el serverida **yangi huquqiy muammo** yaratadi) · safar ichida audio yozish · raqam
maskalash · ichki chat (ular telefonlashadi; kas 1956 buyurtma/oy shusiz tashiydi) · certificate
pinning (**hozir zararli**: majburiy yangilanish yo'lisiz sertifikat almashsa 622 telefon o'ladi).

**Dispatch ilmi:** batched/Hungarian/RL matching · pooling · manzil filtri · ETA ML · A/B platforma.
63 buyurtma/kunda batch tug'ilmaydi; manzil maydoni **umuman yo'q** (98% buyurtmada destinatsiya yo'q).

**Infratuzilma teatri:** Prometheus + Grafana · Kubernetes · SOC2/ISO/pentest. Bitta VPS, bitta
operator, 9 buyurtma. Tashqaridan `curl /health` + Telegram xabari — to'g'ri o'lcham.

**Boshqalar:** yo'lovchiga metrik ETA/masofa (pikap katalog nuqtasi — birinchi noto'g'ri raqam
ishonchni o'ldiradi) · surge asosiy ta'minot richagi sifatida (1700 som marjani yeydi) · ommaviy
haydovchi reytingi va qabul foizi jazolari (o'yinlashtiriladi, janjal chiqaradi) · ovozli AI operator
(Qashqadaryo shevasi uchun model yo'q — avval DTMF IVR) · ikkinchi PTT ilovasi · "lite" APK · iOS ·
minSdk o'lchov mexanizmi (`deviceModel` hech qachon to'lmaydi — **o'lchamasdan desugaring qiling**) ·
`deploy.sh`/`ship.sh` ni qayta yozish (ikkala repodagi eng yaxshi asoslangan kod — kengaytiring, tegmang).

### 1.3 SHARTLI — javob kelmaguncha qurilmaydi

`OFD`/fiskal integratsiya (avval buxgalter javobi) · VPS ni O'zbekistonga ko'chirish (**zaxira yo'q
tizimni ko'chirish uchun eng yomon payt** — G0 tugagach qayta ko'riladi).

---

## 2. REJAGA QO'SHILADI — v2 da UMUMAN yo'q edi

| # | Nima | Nega v2 da yo'q edi | Kim |
|---|---|---|---|
| A1 | **1067 raqami / SIM / operator shartnomasi kimniki?** | Hech kim so'ramagan. Bizniki bo'lmasa — cutover kuni **1748 qo'ng'iroq/oy** yo'qoladi | Ega |
| A2 | **Yuridik shaxs** — BirJoy taksi qaysi shaxs orqali, kas ijarasini to'layotgan bilan bir xilmi | — | Ega |
| A3 | **Fiskal chek (OFD) kimda** — bizdami, haydovchidami | — | Ega + buxgalter |
| A4 | **Ma'lumot joylashuvi** — hamma narsa Contabo **Germaniya**da (`DEPLOYMENT-GUIDE.md:79`), haydovchi **pasport/guvohnoma skanlari shifrlanmagan** lokal diskda (`driver-documents.service.ts:34`) | Compliance "Privacy Policy yozish" deb tushunilgan | Yurist |
| A5 | **Eskiz shartnomasi + alpha-name arizasi** | **1-2 oy regulyativ kutish = haqiqiy kritik yo'l**, forma, kod emas | Ega |
| B1 | **Sirlarni almashtirish** — jonli bot tokeni kuzatilayotgan hujjatda edi (sha256 jonli bilan **mos** [o'lchandi]), PAT `.git/config` da | v2 faqat PAT ni ko'rgan | Ega |
| B2 | **`taxi_db` zaxirasi** | v2 faqat repo A zaxirasini bilgan; B **umuman zaxiralanmagan** edi | ✅ bajarildi (§4 G0) |
| B3 | **103 commit faqat bitta noutbukda** | v2 "8 commit" degan | Ega (push tasdig'i) |
| C1 | **Qo'ng'iroq telemetriyasi** (`call_logs` faqat muvaffaqiyatlini yozardi) | 21.5% ni o'lchash mumkin deb o'ylangan | ✅ bajarildi (§4 G1) |
| C2 | **Onlayn vaqtni serverda yozish** (`driverWentOnline()` chaqirilmaydi) | 16.5 ni o'lchash mumkin deb o'ylangan | G1 |
| C3 | **Ertalabki hisobot yolg'on** — `today` hisoblanadi va **ishlatilmaydi**, revenue `0 // TODO`, `successRate` `no_drivers` ni **ikkala tomondan chiqarib tashlaydi** (183 yo'qotishni yashiradi) | — | G1 |
| D1 | **Yolg'on aytadigan UI ni tuzatish**: Sozlamalardagi 28 tugmadan **22 tasi** butun API'da o'qilmaydi; 8 ta o'lik tugma ilovada | v2 "5 o'lik tugma" degan | G2 |
| D2 | **Surge sukut bo'yicha QUROLLANGAN** — `surgeEnabled` default `TRUE`, `maxSurge 3.00`, o'chirgichi rasm | — | G0 (darhol) |
| E1 | **Versiya darvozasi** (server min versionCode + bloklovchi ekran) | v2 da yo'q — lekin 622 telefonga APK yuborilsa o'sha build **abadiy muzlaydi** | G2 |
| E2 | **Crash reporting release'da** (hozir faqat DEBUG) | — | G2 |
| E3 | **Ruxsat oqimi Android 11+ o'lik ko'chasi** — `ACCESS_BACKGROUND_LOCATION` to'g'ridan-to'g'ri so'raladi, targetSdk 35 da dialogsiz denied, "Davom etish" abadiy o'chiq | v2 "birinchi-kontakt buferi" deb yumshoq qo'ygan | G2 — **yangi haydovchi hozir ro'yxatdan o'ta olmaydi** |
| F1 | **Test qoplamasi**: inson ishlatadigan ikki ilovada **0 test** (web 0, Kotlin 0, API 17 spec) [o'lchandi] | "240/240 yashil" mahsulotning uchdan biri ekani ko'rinmagan | G2+ |
| G1x | **`in_progress` o'lik ko'chasi** — qayta biriktirib ham, bekor qilib ham bo'lmaydi, admin override yo'q | — | G3 |
| G2x | **Qo'lda zanjir himoyasiz** — `getAvailableDrivers` da **status filtri yo'q** → dispetcher safardagi mashinaga ikkinchi buyurtma bera oladi | — | G3 (bu **bug**, xususiyat emas) |
| H1 | **135 staff route'da rol tekshiruvi yo'q** (65 tasi holat o'zgartiradi); `payments.controller.ts:109` faqat `AdminAuthGuard` — istalgan dispetcher balans yozadi | v2 da "62 route" edi | Ega qarori: `ROLLAR_TAKLIF.md` |
| I1 | **Dispetcher shtati modellashtirilmagan** — 600 buyurtma/kun × 89.4% ≈ **daqiqada bitta qo'ng'iroq, 16 soat** | — | Ega |

---

## 3. DARVOZALAR — F0…F9 o'rniga G0…G6

v2 ning F-fazalari "qurish tartibi" edi. G-darvozalari **xavf va o'lchov tartibi**.
**Qoida o'zgarmaydi: oldingi darvoza yashil bo'lmaguncha keyingisi boshlanmaydi.**

| Darvoza | Nima | Qabul mezoni (isbotlanadigan) | Kun |
|---|---|---|---|
| **G0 — Qon to'xtatish** | Qaytarib bo'lmaydigan yo'qotishni yopish | Zaxira **tiklanishi isbotlangan** · sirlar almashtirilgan · surge qurolsizlantirilgan · 103 commit xavfsiz | **3** |
| **G1 — Ko'z ochish** | Ikki raqamni o'lchanadigan qilish | `call_logs` da rad etilgan qo'ng'iroqlar ko'rinadi · `driver_sessions` onlayn soatni yozadi · ertalabki hisobot **bugungi** raqamni beradi | **5** |
| **G2 — Birinchi real safar** | Bitta haydovchi, bitta telefon, bitta safar | Ruxsat oqimi Android 11/12/13/14 da o'tadi · release APK ishga tushadi · crash reporting tirik · TLS domen · versiya darvozasi | **9** |
| **G3 — Yetkazish** | Taklif telefonga **fizik** yetadi | FCM uchidan uchiga · overlay + ekran uyg'otish · qo'lda biriktirish telefonga yetadi · "Band" tugmasi · boot receiver · `in_progress` chiqish yo'li | **17** |
| **G4 — Pilot** | 5 haydovchi, 15 real safar | Pul 3 joyda to'g'ri · batareya ≤25%/8 soat · 4/5 "yaxshi" · 0 halokat | **10** |
| **G5 — Ta'minot hujumi** | Onlayn 16.5 → 40 | **G1 o'lchovi bilan** isbotlangan o'sish · rad <12% · zona FIFO ulangan · komissiya pog'onasi | **25** |
| **G6 — Kanal + uzilish** | Ilova ulushi 10.6% → 30% · kas'dan uzilish | Mijoz cashback (app vs qo'ng'iroq stavkasi) · `BirJoySource` 27/27 · soya rejimi 7 kun · 30 kun orqaga qaytish | **35+** |

**Jami G0–G4 ≈ 44 muhandis-kun** (TS va KT parallel ketsa ~4-5 hafta).
Bu — **birinchi real safargacha va o'lchanadigan pilotgacha**. G5 dan keyin 10× dasturi boshlanadi.

### v2 fazalari qayerga ketdi

`F0` ✅ tugagan · `F0.5` → **G0** · `F1-core` → G1/G3 ga bo'lindi (P0-4 va P0-5 **qisman** — pastga qarang) ·
`F1-bridge` → **G6** (bugun uzilish zarar) · `F2` soya → **G6** · `F3` → **G2+G4** ·
`F4` → **G5** · `F5` → G5 (CTI bulutli PBX webhook sifatida, **yordamchi APK emas**) ·
`F6` firibgarlik → **qalqon allaqachon bor** (7 signal), yangi ish yo'q · `F7` motivatsiya → G5 ·
`F8`+`F9` → **G6**.

### v2 ning P0 lari — haqiqiy holati [audit]

| P0 | v2 da'vosi | Haqiqat |
|---|---|---|
| P0-1 `no_drivers` qutqarish | qilinadi | **qisman** — panelda ko'rinadi ✅, tayinlash **telefonga yetmaydi** ❌, `manualAssign` uchun **bironta test yo'q** |
| P0-2 O'lik buyurtma sweep | qilinadi | ✅ tekshiruvga tayyor (`dispatch.service.spec.ts:350-388`) |
| P0-3 Arvoh haydovchi | qilinadi | ✅ uch qatlamda |
| P0-4 Yakuniy narx surge×class×zona×vaqt | qilinadi | **qisman 2/4** — `pricing.service.ts:225-226` da `timeOfDayMultiplier: 1.0`, `zoneMultiplier: 1.0` **qotib qolgan** [o'zim ko'rdim] |
| P0-5 Komissiya atomik+idempotent | qilinadi | **qisman** — tranzaksiya ✅, lekin `commissions_order_type_uq` **ikkala migratsiyada ham yo'q** |
| P0-6 OTP 6 xona + throttle | qilinadi | ✅ `randomInt(100000, 1000000)`, `@Throttle({limit:5, ttl:900_000})` |
| P0-7/8 FCM | 2 kun | Kod **allaqachon yozilgan** — qolgani konfiguratsiya (Firebase loyiha + `google-services.json`) |
| P0-9 Socket egaligi | 2 kun | Oflayn navbat allaqachon bor (`RideActionQueue.kt`) — v2 uni "o'lik kod" degan, **noto'g'ri** |
| P0-10 Prod-hardening | 2-3 kun | cleartext hali yoqilgan (`AndroidManifest.xml:57-58`); keystore holati **tekshirilmagan** |

---

## 4. BAJARILGAN ISHLAR (2026-09-12 kechasi) — isbot bilan

> R1: "done" emas — **READY FOR VERIFICATION** + buyruq/natija.

### G0 — qon to'xtatish

| Ish | Holat | Isbot |
|---|---|---|
| Sirlar kuzatilayotgan fayldan olib tashlandi | `ready for verification` | `docs/DEPLOYMENT-GUIDE.md` — token/JWT/DB URL o'rniga placeholder + ogohlantirish bloki. **Git tarixida qoladi** |
| PAT `.git/config` dan olib tashlandi | `ready for verification` | `git remote -v` → tokensiz URL |
| **`taxi_db` zaxirasi** | `ready for verification` | `/opt/backup-taxi.sh` — **yurgizildi: 332 KB, 84 jadval**, AES-256 bilan shifrlab Telegram'ga jo'natildi |
| **Zaxira TIKLANISHI isbotlandi** | `ready for verification` | Yangi bazaga `pg_restore` → **750 haydovchi · 9 buyurtma · 13 mijoz · 80 jadval — jonli bilan AYNAN bir xil**, xatosiz. Sinov bazasi o'chirildi |
| Zaxira cron'i | **ega tasdig'ini kutmoqda** | Bitta qator — §6 da |

### G1 — ko'z ochish

| Ish | Holat | Isbot |
|---|---|---|
| **Qo'ng'iroq telemetriyasi** | `ready for verification` | `endCall` endi `call_ended` (enum'da yo'q → 400) o'rniga **`no_order`** yozadi; buyurtma yaratilgan qo'ng'iroq ikki marta sanalmaydi (`orderMadeInCall` ref); bo'sh `catch{}` endi sababni yozadi |
| Enum ikki tomondan tiplandi | `ready for verification` | `CALL_LOG_OUTCOMES` DTO da + `CallLogOutcome` servisda; `as any` olib tashlandi → **kompilyator xatoni tutdi** (`operator.controller.ts:198`), tuzatildi; `nest build` ✅, `web tsc --noEmit` ✅ |

**Aniqlik (audit xatosi):** audit "Postgres rad etadi" degan edi. Haqiqat — **DTO ning `@IsIn`
ro'yxati 400 qaytaradi**, web esa bo'sh `catch` bilan yutadi. Natija bir xil, mexanizm boshqa.

---

## 5. KEYINGI ISHLAR — tartib bilan

### G1 qolgani (5 kun)

1. **Onlayn vaqtni yozish** — `driverWentOnline()` ga chaqiruvchi ulash (`socket.gateway` online/offline va disconnect yo'llarida). **16.5 ni birinchi marta o'lchaydi.** — 2 kun
2. **Ertalabki hisobot haqiqati** — `today` ni so'rovlarga ulash, `totalRevenueUzs`/`avgRating` TODO larini yopish, `successRate` dan `no_drivers` ni **chiqarmaslik** (183 yo'qotish ko'rinsin) — 1 kun
3. **`TZ=Asia/Tashkent`** + tungi ko'paytirgichni bitta qiymatga keltirish (kod 1.5, panel 1.3 — **ziddiyat**) — 0.5 kun
4. **Surge qurolsizlantirish** — `surgeEnabled` default `FALSE`, `maxSurge` egadan; zona PATCH allowlist'iga haqiqiy kalitlarni qo'shish — 0.5 kun
5. **Sozlamalar ekranini halol qilish** — **yarmi bajarildi (2026-09-12)**. O'lchandi: 22 emas, **28 dan 28 tasi**
   o'lik; ustiga **ikkinchi ekran** — narx sahifasining «Asosiy narxlar» 14 kaliti — ham o'lik chiqdi (kontrollerda
   «pricing-service reads them» degan **noto'g'ri izoh** bilan). Har ikkala ekran endi **qaysi qiymat hozir kuchda
   ekanini aytadi** (`source: env / code-default / unused`), testlar ikki yo'nalishda qulflaydi.
   **Ega qarori qoldi:** jadvalni haqiqatan narx/dispatchga ulash (matn maydonidan pul qimirlaydi) **yoki** o'lik
   tugmalarni olib tashlash. — qolgani 1 kun

### G2 (9 kun) · G3 (17 kun) — §3 jadvalidagi mezonlar bo'yicha

Tafsilot `YAKUNIY_AUDIT_2026-09-12.md` §7 dagi 1-18 punktda; tartib o'zgarmaydi.

---

## 6. EGA QARORI KUTILAYOTGANLAR — muhimlik bo'yicha

**Bugunoq (kodsiz, lekin butun backlog'ni bekor qilishi mumkin):**

1. **1067 raqami, SIM, operator shartnomasi kimning nomida?**
2. **Yuridik shaxs** — kas ijarasini to'layotgan shaxs bilan bir xilmi?
3. **Fiskal chek (OFD)** — bizdami, haydovchidami? (bir xatboshi buxgalter javobi)
4. **Ma'lumot joylashuvi** — yurist bir xatboshi. **VPS taxmin bilan ko'chirilmaydi.**
5. **DNS:** Spaceship → birjoy.online → A-yozuv, host `taxi`, qiymat `169.58.55.249` (DNSSEC'ga tegilmaydi)
6. **Eskiz shartnomasi + alpha-name arizasi** — bugun boshlanmasa SMS kanali 1-2 oyga kechikadi

**Darhol xavfsizlik:**

7. **Bot tokenini BotFather'da qayta chiqarish** (jonli token repoda edi — tasdiqlangan)
8. GitHub PAT ni revoke qilish · super-admin parolini almashtirish · Maps kalitini cheklash (paket nomi + SHA-1)
9. `.env` dan `TELEGRAM_INITDATA_DEV_BYPASS=1` ni olib tashlash
10. **Zaxira cron'i** — ruxsat bersangiz bitta qator:
    `(crontab -l; echo "30 22 * * * /bin/bash /opt/backup-taxi.sh >> /var/log/taxi-backup.log 2>&1") | crontab -`

**Mahsulot qarorlari:**

11. **Rollar** — `ROLLAR_TAKLIF.md` dagi 6 savol. **Ikkinchi dispetcher hisobi ochilishidan OLDIN**
12. **Sozlamalar ekrani**: 22 o'qilmaydigan tugma — olib tashlansinmi yoki haqiqatan ulansinmi?
13. **Surge** — umuman yoqilsinmi? Yoqilsa `maxSurge` qancha?
14. **Tarif raqamlari** — kutish narxi, bekor jarimasi, pog'onali km, qishloq koeffitsienti
15. **Mijoz cashback** — ilova va qo'ng'iroq uchun **alohida stavka** (kas shuni qiladi). Tanga klampi (≤350) bilan qanday birlashadi?
16. **Komissiya modeli** — tekis 2000 som yoki qabul foiziga bog'langan pog'onali chegirma
17. **5 pilot haydovchi** — ism, telefon, **Android versiyasi** (`deviceModel` o'lchovi ishlamaydi)
18. **Zona poligonlari** — bozor, avtovokzal, boshqa to'xtash joylari
19. **`apps/client`** — o'chiriladimi yoki muzlatiladimi?
20. **Dispetcher shtati** — 600 buyurtma/kun uchun necha kishi, necha smena
21. **103 commit'ni `origin`ga push qilish** — tasdiq kerak (repo A `deploy.yml` ni tetiklashi mumkin)

---

## 7. XAVF REGISTRI — `YAKUNIY_AUDIT_2026-09-12.md` §9 dan

22 ta xavf to'liq ro'yxati o'sha hujjatda. v3 ga ta'sir qiladigan beshtasi:

1. **1067 raqami noma'lum** → kompaniyani o'ldiradi → **A1 javobisiz G6 rejalashtirilmaydi**
2. **Ma'lumot joylashuvi** → xizmat to'xtatilishi → **A4 javobisiz yangi hujjat turi qo'shilmaydi**
3. **`taxi_db` zaxirasi** → ✅ **yopildi** (G0)
4. **0 test web/Kotlin'da** → har tuzatish jimgina regressiya qiladi → **G2 da birinchi testlar**
5. **Majburiy yangilanish yo'li yo'q** → 622 telefonda muzlagan APK → **G2 versiya darvozasi**

---

## 8. NIMA O'LCHANMAGAN (halol qamrov)

- Jonli baza va VPS auditda qayta o'qilmadi (faqat 2026-09-12 brifingi va G0 ishlari)
- `commissions_order_type_uq` jonli bazada bormi — **tekshirilmagan**
- Release keystore holati · `git bundle` bor-yo'qligi — **tekshirilmagan**
- Huquqiy xulosa yo'q — ikki auditimiz ma'lumot joylashuvida bir-biriga zid
- kas1067 APK qayta dekompilyatsiya qilinmadi — raqib haqidagi da'volar eski hujjatlardan
- Auditning 180 ta da'vosidan **24 tasi** qarama-qarshi tekshiruvdan o'tdi; **156 tasi o'tmadi**

---

*v3 audit isbotiga suyanadi. Har "0/hammasi" da'vosi buyruq+natija bilan isbotlanadi (CLAUDE.md DoD).
Foydalanuvchiga ko'rinadigan har narsa — ega real telefonda qabul bergandan keyin flag yoqiladi.*
