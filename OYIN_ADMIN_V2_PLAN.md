# 🎮 O'YIN KONSOLI — TO'LIQ QAYTA QURISH REJASI

> **Prototip (bosiladigan, telefonda ochiladi):** https://claude.ai/code/artifact/cf202f60-2293-48e7-81de-183ac172bba5
> Fayl: `OYIN_KONSOL_PROTOTIP.html` · ranglar/o'lchamlar loyihaning O'Z `design/tokens.css` faylidan —
> ya'ni real mahsulotda AYNAN shunday chiqadi.

> **Ega talablari:**
> · 2026-08-10 №1: «o'yin tabini butunlay yangi va zamonaviy qil, ma'lumot boshqarish va yuklashni osonlashtir»
> · 2026-08-10 №2: «kengroq kirib boradigan, nazorat qiladigan bo'lsin»
> · 2026-08-10 №3: «bular men xohlagan narsalarning yarmi, dizayn ham zamonaviy va qulay emas — **4x oshir**»
>
> **Ega qarorlari:** qurilish joyi — **v1 (`App.tsx`)**; boshlanish — **👥 Odamlar (nazorat)**.
>
> Holat: **REJA — TASDIQ KUTILMOQDA.** Kod yozilmagan. DoD (§9) tasdiqdan OLDIN yozilgan (R2).

---

## 1. NIMA O'ZGARADI — bir qarashda

| | Hozir | Yangi konsol |
|---|---|---|
| **Shakl** | 8 ta ichki tab, har biri alohida orol | **Konsol**: doimiy vital-panel + 6 modul + o'ng drawer. Ro'yxatdagi joyingizni hech qachon yo'qotmaysiz |
| **Vaziyatni bilish** | Har raqam uchun tab almashtirasiz | **Vital bar** hech qachon aylanmaydi: mavsum · xalqdagi ball · sig'im · byudjet · kartalar · shubhalilar |
| **Ish boshlash** | Menyudan qidirasiz | **⌘K**: «Dilshodga ball», «iPhone narxi», «mavsumni muzlat» — yozib bajarasiz |
| **Odamlar** | Ball bo'yicha ro'yxat **umuman yo'q** | Reyting + **xavf balli** + 6 ta tayyor shubha-kesimi + **Odam 360 drawer** |
| **Mukofot qo'shish** | Qatorma-qator, matn `nom \| narx` | **Excel sehrgari**: ustun-xaritasi → farq jadvali → bitta atomik yozuv → **qaytarish** |
| **Rasm** | Tashqi URL, qo'lda qidirib | **50 tani birdan tashlang** — nomi bo'yicha o'zi biriktiradi, Telegram'da abadiy saqlanadi |
| **Xato bo'lsa** | Qo'lda qidirib tuzatasiz | **Katalog tarixi** — bitta bosishda orqaga |
| **Qaror qabul qilish** | Bosgandan keyin bilasiz | **🔮 Simulyator** — bosishdan OLDIN mavsum oxirigacha nima bo'lishini ko'rasiz |
| **Kim nima qildi** | Hech qayerda qolmaydi | **🧾 Audit jurnali** — kim · qachon · eski → yangi |
| **Ma'lumot chiqarish** | Ba'zi joyda CSV | Har jadvalda saralash · filtr · qidiruv · CSV |
| **Telefon** | Deyarli ishlamaydi | Telefonda to'liq ishlaydi (siz QABULni telefonda berasiz) |

---

## 2. HOZIRGI HOLAT — nima uchun noqulay (isbot bilan)

`packages/admin/src/App.tsx:5396-7900` — 8186 qatorli faylning ichida ~2500 qator.

| # | Muammo | Isbot |
|---|---|---|
| 1 | **Dizayn tizimi ishlatilmagan** — hamma rang/o'lcham inline `style={{}}`. DIZAYN_QOIDALARI 1-qoidasi buziladi | `App.tsx:5596`, `5853`, `5908`, `6244` |
| 2 | **Brauzer `confirm()`/`alert()`** — pul-xavfli 6 ta qo'riq shu bilan | `App.tsx:5684`,`5714`,`5721`,`5732`,`5780`,`6594` |
| 3 | **Saralash/sahifalash yo'q** — «Yana 300 ta» tugmasi | `App.tsx:6150` |
| 4 | **Ikkita QARAMA-QARSHI narx matematikasi** — bitta mukofotga ikki xil «to'g'ri narx». Kodning O'ZI xavf deb yozgan | `App.tsx:6173-6179` |
| 5 | **Rasm faqat tashqi URL** — server har safar tashqi saytdan yuklaydi, sayt o'chsa vitrina bo'shaydi | `App.tsx:5935` · `server.ts:1757` |
| 6 | **Ommaviy yuklash — 100 mukofot = 100 so'rov**, oldindan ko'rish yo'q | `App.tsx:5785-5797` |
| 7 | **Ball reytingi YO'Q** — panel o'zi tan oladi | `App.tsx:6020-6027` |
| 8 | **Karta sanasi ko'rsatilmaydi** — ma'lumot bor, eksportga solinmagan | `App.tsx:6109` · `oyinService.ts:2020` |
| 9 | **Admin amallari jurnalga yozilmaydi** | `shared/src/oyin.ts:836-845` |
| 10 | **Simulyator paneldan ko'rinmaydi** — 1 499 qatorli raqamli egizak faqat terminalda | `packages/server/src/sim/` |

---

## 3. SERVER — 10 ta bo'shliq

| # | Route | Nega arzon / nima kerak |
|---|---|---|
| **S1** | `GET …/oyin/leaderboard` — ball · yig'ilgan · sarflangan · safar · karta · oxirgi faollik | `computeBallMap()` (`oyinService.ts:276`) hammani allaqachon hisoblaydi |
| **S2** | `POST …/oyin/prize/photo` + `…/photo/bulk` (nom bo'yicha biriktirish) | `tgUploadPhoto` naqshi 4 servisda tayyor (`shopService.ts:1195`) |
| **S3** | `POST …/oyin/catalog/bulk` — N ta mukofot BITTA atomik yozuvda | CAS (`oyinService.ts:1022`) bor, bir marta chaqiriladi |
| **S4** | `drawExport` javobiga `at` | `TicketRecord.ts` maydoni bor, tashlab ketilgan |
| **S5** | `oyin:audit:*` — kim · qachon · eski→yangi | AppState naqshi |
| **S6** | `GET …/oyin/risk` — **xavf balli**: safarsiz ball · shift urilishi · karta yig'ish · bir qurilmadan referal | Hisob mavjud ma'lumotdan (`rideReward`, `oyin:*` markerlar) |
| **S7** | `oyin:catalog:snap:*` + `POST …/oyin/catalog/restore` — **qaytarish** | Har yozuvdan oldin nusxa (≤30 ta, aylanma) |
| **S8** | `POST …/oyin/simulate` — `sim/predict.ts` ni admin'dan yurgizish (keshlangan, navbatli) | Egizak tayyor: `predict.ts`, `runArms.ts`, `real/market-1067-july2026.json` |
| **S9** | `GET …/oyin/vitals` — vital-panel uchun BITTA arzon so'rov (20s kesh) | Hozir 7 ta alohida so'rov ketadi |
| **S10** | `GET/POST …/oyin/season/plan` — **kelasi mavsum qoralamasi** (jonli mavsumga tegmaydi) | Yangi AppState kaliti |

> ✅ **Prisma sxemasi O'ZGARMAYDI** — o'yin AppState JSON'da (`oyinService.ts:570`, `976`).
> **VPS'da `db push` qadami YO'Q.** Deploy oddiy push.
>
> ⚠️ **S8 diqqat:** simulyator VPS'da ishlaydi (xotira/CPU). Navbat + kesh + `MAX_SIM_CONCURRENCY=1`
> majburiy, aks holda 1 000 ta yurgizish botni sekinlashtiradi. Zaxira: natija fon vazifasida
> hisoblanadi, panel «tayyor bo'lganda xabar beradi».

---

## 4. QOBIQ — «zamonaviy» so'zining aniq ma'nosi

Prototipda ko'rasiz, uch qatlam:

1. **Vital bar** (56px, hech qachon aylanmaydi) — 6 ta hayotiy raqam, har birida rangli chap-chiziq
   (yashil/sariq/qizil) va ostida izoh. Chetida **jonli puls** — 20 soniyada o'zi yangilanadi.
2. **Modul reyki** (236px) — 6 modul, har birida son; shubhalilar soni **qizil**.
3. **Kanvas + o'ng drawer** — tafsilot HAR DOIM drawer'da ochiladi, sahifa almashmaydi.
   Ro'yxatdagi joyingiz, saralashingiz, filtringiz saqlanadi.

**Zichlik:** qator 38px, radius 6/9/13 (14px emas — «iste'molchi ilovasi» hissi yo'qoladi),
raqamlar `tabular-nums` (ustunda tekis turadi), holat rang BILAN ham, shakl BILAN ham
(rozetka/chiziq/mini-diagramma) — daltonizmda ham o'qiladi.

**Rang qoidasi:** yashil = brend, **oltin = FAQAT ball/tanga**, qizil/sariq/yashil = holat.
Grafik palitrasi — loyihada allaqachon daltonizmga tekshirilgan 6 rang.

**Yorug'/qorong'i** — ikkalasi ham, bitta tugma (loyihaning o'z `[data-a2="light"]` qiymatlari).

---

## 5. OLTI MODUL — batafsil

### ◎ 1. NAZORAT
- **Vazifa satrlari** — panel o'zi aytadi, siz tahlil qilmaysiz. Har satrda amal tugmasi.
- **«Ball qayerda» voronkasi** — Berilgan → Xalq qo'lida → Sarflangan → Kartalar → O'ynalgan.
  Har qator **bosiladi** → orqasidagi ro'yxat. Ostida bitta jumlada xulosa
  («39% ball hali sarflanmagan — sig'im 3× bo'lmasa bu ball joy topmaydi»).
- **Ikki grafik** — kunlik ball emissiyasi va kunlik karta xaridi, oxirgi nuqta belgilangan.
- **6 ta stat plita** — ball egalari, o'rtacha ball, bugungi karta, to'lgan mukofot, byudjet, shubhalilar.

### ◍ 2. ODAMLAR — chuqur nazorat *(F2 — birinchi)*
- **Reyting jadvali:** ball · yig'ilgan · sarflangan · safar · karta · oxirgi faollik · **xavf**.
  Har ustun saralanadi, qidiruv, CSV.
- **Xavf balli (S6)** — 0..100, mini-diagramma bilan. Uch belgidan: safarsiz ball · kunlik shiftga
  urilish · bitta mukofotga karta yig'ish. **Avtomatik jazo YO'Q** — faqat ko'rsatadi.
- **6 ta tayyor kesim:** Hammasi · ⚠ Shubhali · 0 safar bilan ball · 5+ karta bir mukofotda ·
  Chetlanganlar · Gashtakda.
- **👤 Odam 360 drawer:**
  `4 plita (ball/yig'ilgan/sarflangan/safar)` · **«Nega shubhali»** aniq jumlalar bilan ·
  **ball qayerdan keldi** (5 manba, diagramma) · **kartalari** (sana bilan) ·
  **nima qildi** (voqealar tasmasi) · **bog'lanishlar** (gashtak · do'stlar · kas1067 ID) ·
  amallar: ball tuzatish · karta bekor · chetlatish — **har biri audit jurnaliga**.

### 🎁 3. MUKOFOTLAR
- Jadval: rasm · nom · real narx · ball · sotilgan (diagramma) · **qoplash ×** · qo'riq · holat.
- **Belgilash + ommaviy amal:** navbatga sur · vitrinaga chiqar · narxni qayta hisobla · yashir.
- **📥 Excel sehrgari (4 qadam):** Ma'lumot (fayl yoki nusxa) → **Ustun xaritasi** (bir marta,
  eslab qoladi) → **Farq jadvali** (`yangi` / `o'zgaradi eski→yangi` / `xato sababi bilan`) →
  Qo'llash. Bitta atomik so'rov. Xato satr **jimgina yo'qolmaydi**. Oxirida **«Butun importni qaytarish»**.
- **📤 Ommaviy rasm:** 50 tagacha tashlanadi, **nomi bo'yicha o'zi biriktiriladi**, kvadratga
  kesiladi va siqiladi, Telegram'da saqlanadi (tashqi saytga bog'liqlik tugaydi).
- **🧮 Narx maslahatchisi — BITTA manba:** «3 oyda / 6 oyda / 10 oyda yetsin» tugmalari.
  Ikki qarama-qarshi formula (4-muammo) `packages/shared` dagi bitta `oyinPlanPrice()` ga birlashadi.
- **↩ Katalog tarixi (S7):** oxirgi 30 o'zgarish, har biri bitta bosishda qaytadi.

### 💳 4. KARTALAR & TIRAJ
- **Karta reyestri** — **sana ustuni bilan (S4)**, mukofot/egasi/holat filtri, CSV.
  Qator bosilsa → o'sha odamning 360 drawer'i.
- **🎬 Tiraj studiyasi** — to'liq ekran taqdimot rejimi: katta raqamlar, kartalar ro'yxati,
  tortish animatsiyasi, g'olib kartochkasi, **hash-isbot ekranda**, bir bosishda qayd + topshirish
  rasmi. Bloger to'g'ridan-to'g'ri suratga oladi.
- Muzlatish · istisnolar (test/chetlangan/xodim) ochiq sanaladi — hozirgi mantiq saqlanadi.

### 🔮 5. SIMULYATOR — *yangi, eng kuchli*
- **«Nima bo'ladi?»** — safar bali / do'st bonusi / karta bahosi tugmalarini surasiz,
  mavsum oxirigacha natija chiqadi: berilgan ball · sotilgan karta · **sizga tushadigan xarajat** ·
  **qoplash ×**.
- **Ishonch oralig'i** — P10–P90 (1 000 ta yurgizish), «eng ehtimolli» belgisi bilan.
- **A/B solishtirish** — ikki yo'l yonma-yon, «B 1 000 tadan 780 tasida yutdi, zarar chiqqan holat yo'q».
- **📋 Panelga ko'chirish** — yoqqan sozlama «Sozlama» bo'limiga tushadi (avtomatik SAQLANMAYDI —
  ikkinchi ongli bosish kerak).
- Manba: sizdagi `sim/predict.ts` · `runArms.ts` · `calibrate.ts` · `real/market-1067-july2026.json`.

### ⚙ 6. SOZLAMA & AUDIT
- Mavsum sanalari (FINAL-48 ogohlantirishi bilan) · **kelasi mavsum qoralamasi (S10)**.
- Ball jadvali — har knob yonida **«🔮 avval simulyatorda sinash»** tugmasi.
- **🧾 Audit jurnali (S5)** — kim · qachon · nima → nima, CSV bilan.
- Kill-switch'lar — 💰 PUL toifasi ajratilgan, har o'zgarish xabar beradi (jim toggle taqiq).
- Homiy · hikoya moderatsiyasi · «🧪 Men» sinov asboblari.

### ⌘K — buyruq palitrasi (hamma modulda)
«Shubhali odamlarni ko'rsat» · «Excel'dan yuklash» · «Tirajni muzlatish» · «Dilshodga ball» —
yozib bajariladi, menyu qidirilmaydi. Xavfli buyruqlar yonida **«xavfli»** belgisi.

---

## 5-A. PARITY JADVALI — eski 18 blok qayerga ketdi

> Ega 2026-08-10 da haq savol berdi: «eski paneldagi hamma funksiyalar yo'qku — masalan story check».
> To'g'ri edi: prototipning 1-versiyasida **8 ta blok yo'q edi**. Quyida eski tabdagi HAR bloknning
> manzili. Manba: `sed -n '5396,7900p' App.tsx | grep '^function'` (18 ta) + `api.ts` dagi 37 ta
> `oyin*` metodi. **Bu jadval F8 da isbot bilan qayta to'ldiriladi (D18).**

| Eski blok (`App.tsx`) | Nima qiladi | Yangi manzil |
|---|---|---|
| `OyinTodayCard` | vazifa satrlari | ◎ Nazorat |
| `OyinPrizeBoard` | mukofot CRUD · qo'shish · ommaviy · karta bekor | 🎁 Mukofotlar → Katalog |
| `OyinPriceCalcBlock` | narxlash kalkulyatori | 🎁 Mukofotlar → mukofot drawer'i («3/6/10 oyda yetsin») |
| `OyinCardsBlock` | karta reyestri | 💳 Kartalar |
| `OyinDrawCard_` | tiraj · g'olib · topshirish · muzlatish | 💳 Kartalar → 🎬 Tiraj studiyasi |
| `OyinControlCard` | odam qidirish · ball · ban · karta bekor | ◍ Odamlar → Odam 360 drawer |
| `OyinSeasonSettingsCard` | mavsum sanalari · reset | ⚙ Sozlama → 📅 Mavsum |
| `OyinKnobsCard` | ball jadvali | ⚙ Sozlama → 📅 Mavsum & ball |
| **`StoryModerationCard`** | **hikoya-isbot tekshirish** | **📸 Hikoyalar — YANGI MODUL** |
| **`OyinGashtakBlock`** | gashtak: ro'yxat · tafsilot · chiqarish · tarqatish · sinov a'zo · sinov safar · navbat | **👑 Gashtak — YANGI MODUL** |
| **`OyinMeBlock`** | ega o'zi sinab ko'rishi | ⚙ Sozlama → 🧪 Men |
| **`OyinSponsorCard`** | homiy nomi/logotipi | ⚙ Sozlama → 🏅 Homiy |
| **`OyinBudgetCard`** | byudjet + sovrin rejalashtiruvchi | 🎁 Mukofotlar → 💰 Byudjet |
| **`OyinVelocityBoard`** | mukofot sotilish tezligi | 🎁 Mukofotlar → 📈 Tezlik |
| **`OyinSeasonMetricsCard`** | mavsum ko'rsatkichlari | ◎ Nazorat → 📊 Ko'rsatkichlar |
| **`OyinActivityView`** | faoliyat jurnali (filtr · sahifalash) | ◍ Odamlar → 📜 Faoliyat jurnali |
| `oyinCapacity` / `oyinOpenQueued` | sig'im · navbatdan ochish | ◎ Nazorat → 🎯 Sig'im (eski panelda ekrani YO'Q edi, faqat tugma) |
| `oyinFreeze` / `setOyinFreeze` | tiraj muzlatish | 💳 Kartalar |

**Muhim farq — ikkita jurnal, ikki xil narsa (chalkashtirilmaydi):**
· **📜 Faoliyat jurnali** = MIJOZ ball voqealari (safar, do'st, hikoya, karta xaridi). Mijoz
  «ballim qayerdan keldi?» deb qo'ng'iroq qilsa — javob shu yerda. *Eski panelda bor edi.*
· **🧾 Audit jurnali** = ADMIN amallari (narx o'zgardi, mukofot o'chdi, mavsum surildi, muzlatildi).
  *Eski panelda **umuman yo'q**.*

Natijada modul soni 6 dan **8 ga** chiqdi: ◎ Nazorat · ◍ Odamlar · 🎁 Mukofotlar ·
💳 Kartalar & Tiraj · 📸 Hikoyalar · 👑 Gashtak · 🔮 Simulyator · ⚙ Sozlama & Audit.

---

## 6. O'ZGARADIGAN FAYLLAR

**Server:**
- `services/oyinService.ts` — `adminLeaderboard` · `riskScores` · `adminBulkUpsertPrizes` ·
  `setPrizePhoto` · `catalogSnapshot`/`restore` · `drawExport`ga `at` · `writeAudit` · `vitals`
- `services/oyinSimBridge.ts` *(yangi)* — `sim/`ga navbatli, keshlangan, bitta-oqimli ko'prik
- `api/server.ts` — 10 ta route (§3), mavjud `requireAdmin`/`requireOwner` naqshi
- `shared/src/oyin.ts` — yangi tiplar + birlashtirilgan `oyinPlanPrice()`

**Admin (v1 ichida, yangi modul):**
- `design/oyin-tokens.css` *(yangi)* — `.oyinx` doirasidagi tokenlar
- `oyin/Konsol.tsx` — qobiq: vital bar · reyk · drawer · ⌘K · toast
- `oyin/{Nazorat,Odamlar,Mukofotlar,Kartalar,Simulyator,Sozlama}.tsx`
- `oyin/{ImportSehrgari,OdamDrawer,MukofotDrawer,TirajStudiya}.tsx`
- `api.ts` — 10 ta yangi metod
- `App.tsx` — `OyinTab` yangi modulga ulanadi; eski bloklar **bosqichma-bosqich** o'chadi

---

## 7. BO'YOQ TO'QNASHUVI — o'lchov bilan yopilgan

v1 ichida v2 dizayn tizimini ishlatish xavfi: `tokens.css` `:root` da yozadi va eski `styles.css`
bilan **5 ta o'zgaruvchi ustida to'qnashadi** (`--bg --line --ok --bad --text`) → butun eski panel
qayta bo'yalardi. `tokens.css:8-12` izohining o'zi ogohlantiradi.

| Qadam | Nima | Nega xavfsiz |
|---|---|---|
| 1 | Tokenlar `:root` emas, **`.oyinx`** selektorida | `:root` tegilmaydi |
| 2 | O'yin konsoli `<div class="oyinx">` ichida | Komponentlar tokenni ajdoddan oladi |
| 3 | `feat/kit.css` + `table.css` + `chart.css` ulanadi | ✅ Tekshirildi: faqat `.a2-*`, `.tb-*`, `.ch-*`. Eski panelning 130 sinfi bilan **0 ta to'qnashuv** |
| 4 | `tokens.css` va `base.css` **ulanmaydi** | `:root` va `html/body/*` aynan o'sha ikkisida |
| 5 | Vitest guard: ikki token fayli bir xil nomlarni e'lon qilishi | Ajralib ketsa CI yiqiladi |

---

## 8. BOSQICHLAR

| Bosqich | Nima | Natija |
|---|---|---|
| **F1** | Server: S1 reyting · S6 xavf · S5 audit · S9 vitals + vitest | Panelsiz tekshiriladi |
| **F2** | `.oyinx` qatlami + **konsol qobig'i** (vital bar · reyk · drawer · ⌘K · toast) + **◍ Odamlar** to'liq | 🎯 «Kengroq nazorat» qo'lingizda |
| **F3** | **🎁 Mukofotlar** — jadval · ommaviy amal · S2 rasm yuklash · S3+S7 import & qaytarish · narx birlashishi | Ma'lumot boshqaruvi va yuklash |
| **F4** | **◎ Nazorat** — voronka · grafiklar · vazifa satrlari | Kundalik ish oqimi |
| **F5** | **💳 Kartalar** (S4) + **🎬 Tiraj studiyasi** | Mukofot kuni |
| **F6** | **📸 Hikoyalar** + **👑 Gashtak** (7 amal) | Kundalik moderatsiya |
| **F7** | **🔮 Simulyator** (S8 ko'prik + A/B + ishonch oralig'i) | Bosishdan oldin bilish |
| **F8** | **⚙ Sozlama & Audit** + 🏅 Homiy + 🧪 Men + S10 mavsum qoralamasi | Parity |
| **F9** | §5-A parity jadvali isbot bilan → **ega QABULI** → eski bloklar o'chadi | Bitta konsol |

Har bosqichda: `pnpm typecheck` + `pnpm vitest run` + jonli isbot. Push har safar sizning
tasdig'ingiz bilan (xotira: «Confirm each push»).

---

## 9. DoD — QABUL MEZONLARI (kod yozishdan OLDIN, R2)

| # | Mezon | Tekshiruv |
|---|---|---|
| **D0** | **Eski panelning qolgan 33 tabi bo'yog'i O'ZGARMAGAN** | Import ro'yxatida `tokens.css`/`base.css` yo'q (grep) + 3 tab skrinshot solishtiruvi |
| D1 | Yangi fayllarda **inline `style={{}}` yo'q** (istisno: dinamik `--w`) | `grep -rn "style={{" packages/admin/src/oyin/` |
| **D2** | **Vital bar** 6 raqamni ko'rsatadi, 20s da o'zi yangilanadi, **1 ta** so'rov ketadi | Network tab: 20s da bitta `/vitals` |
| **D3** | **Ball reytingi** 6 ustun bo'yicha saralanadi, CSV chiqadi | `computeBallMap` bilan solishtirish (top-5 aynan mos) |
| **D4** | **Xavf balli** — har komponenti tushuntiriladi, 0 ta avtomatik jazo | 5 ta shubhali uchun qo'lda hisob bilan solishtirish |
| **D5** | **Odam 360 drawer** — 7 blok + 3 amal bitta oynada, ro'yxat joyi saqlanadi | Skrinshot + drawer yopilgach saralash/filtr saqlanganini ko'rsatish |
| D6 | **Rasm fayldan** yuklanadi (bittalab va 50 tasi birdan, nom bo'yicha biriktirish) | Yuklash → `/api/oyin/prizephoto` 200 → miniapp skrinshot |
| D7 | **Import sehrgari** — 4 qadam, farq jadvali, **1 ta** POST, xato satr sanaladi | Network: 1 POST · 3 buzuq satr → 3 sabab |
| D8 | **Qaytarish** ishlaydi — import va narx o'zgarishi orqaga qaytadi | Import → qaytarish → katalog bayt-ma-bayt avvalgi holat |
| D9 | **Karta sanasi** reyestrda bor va to'g'ri | `ts` bilan solishtirish |
| D10 | **Audit jurnali** — 6 xil amal yoziladi (narx · o'chirish · mavsum · muzlatish · ball · import) | 6 amal → 6 yozuv, eski→yangi bilan |
| **D11** | **Simulyator** paneldan yuriladi, natija terminal natijasi bilan **mos** | Bir xil urug' (seed) bilan panel va `tsx sim/run.ts` natijasi aynan teng |
| **D12** | Simulyator botni sekinlashtirmaydi | Yurgizish paytida `/health` javob vaqti < 300ms; `MAX_SIM_CONCURRENCY=1` isboti |
| D13 | **⌘K** ishlaydi, xavfli buyruqlar belgilangan | 11 buyruq qo'lda sinaladi |
| D14 | Narx matematikasi **bitta** | Vitest: 20 ta narx, ikki rejim, kutilgan qiymat |
| D15 | Pul-qo'riq dialoglari saqlangan (6 tasi) | Har biri chaqiriladi + matn diff |
| **D16** | **Telefonda to'liq ishlaydi** — 6 modul, drawer, import, ⌘K | Real telefonda skrinshot (ega qurilmasi) |
| D17 | Butun repo yashil | `pnpm typecheck` + `pnpm vitest run` — BARCHA `packages/*/src` (R3) |
| **D18** | Eski imkoniyatlardan **bittasi ham yo'qolmagan** — §5-A jadvalining **18 qatori ham** | Har qator uchun: eski `App.tsx` file:line → yangi ekran skrinshoti → amal jonli natijasi. `api.ts` dagi **37 ta** `oyin*` metodining har biri yangi panelda chaqirilishi grep bilan isbotlanadi |
| D18b | **📜 Faoliyat jurnali** va **🧾 Audit jurnali** ikkalasi ham bor va chalkashtirilmagan | Mijoz ball voqeasi faoliyatda, admin amali auditda — ikkalasi ko'rsatiladi |
| D19 | Mustaqil tekshiruv (R4) | Kod yozmagan tekshiruvchi D0–D18 ni qayta isbotlaydi |
| D20 | **Ega real qurilmada QABUL beradi** (R6) | F8 dan oldin eski bloklar o'chirilmaydi |

---

## 10. XAVFLAR

| Xavf | Qoplash |
|---|---|
| **Eski panel buzilishi** | §7 — 5 qadam, o'lchov bilan tekshirilgan |
| **Simulyator VPS'ni yuklashi** | Navbat + kesh + bitta-oqim; zaxira — fon vazifasi + «tayyor bo'lganda xabar» (D12) |
| **Pul semantikasi buzilishi** | 6 qo'riq dialogi matni bilan ko'chadi + vitest (D15) |
| **Import xatosi** | Har doim `queued` · farq jadvali majburiy · atomik yozuv · **qaytarish** (D8) |
| **Xavf balli noto'g'ri ayblashi** | Avtomatik jazo YO'Q; har komponent ochiq tushuntiriladi (D4) |
| **Rasm — BOT_TOKEN'ga bog'liqlik** | Do'kon naqshidagi zaxira: `data:` URL (`shopService.ts:1199`) |
| **Katalog poyga-holati** | Mavjud CAS ommaviy yozuvga ham |
| **Regressiya** | Eski bloklar F8 gacha o'chirilmaydi |

---

**Keyingi qadam:** prototipni telefoningizda oching, nima qo'shish/olib tashlash kerakligini ayting →
DoD tasdiqlanadi → **F1** boshlanadi.
