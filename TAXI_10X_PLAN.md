# TAXI 10X — BOSH REJA

**Maqsad:** BirJoy o'z taxi dispetcherligiga o'tsin. Kas1067 o'chirilsa hech narsa to'xtamasin.
Natija kas1067'dan o'lchanadigan darajada kuchli bo'lsin.

**Sana:** 2026-09-08 · **Holat:** ega tasdig'ini kutmoqda · **Muallif:** Claude (o'lchovlar bilan)

> Har raqamning yonida manbasi turadi: **[o'lchandi]** = shu kompyuterda buyruq bilan sanaldi ·
> **[ega]** = ega bergan real statistika · **[da'vo]** = hujjatda yozilgan, hali tekshirilmagan.

---

## 1. QISQA XULOSA

Bizda ikkita narsa bor va ular bir-birini bilmaydi:

- **Bot** (`Desktop\1067 bot`) — jonli, mijozlar ishlatadi, butun taxi ishini tashqi `kas1067` dan oladi.
- **Taxi yadrosi** (`Desktop\1067 bot\1067-taxi`) — alohida repo: 40 modullik API, 70 jadvallik baza,
  26 sahifalik admin, Kotlin haydovchi ilovasi. **[o'lchandi]**

Ularni ulash uchun butun kodni qayta yozish shart emas. Bot kas1067 bilan **bitta interfeys** orqali
gaplashadi: `KasDataSource` — 27 metod, 42 faylda 126 chaqiruv **[o'lchandi]**. Uchinchi
implementatsiya (`BirJoySource`) yozilsa, o'tish **bitta env qatori** bo'ladi va orqaga qaytish ham
shuncha oson.

Lekin bu rejaning asosiy g'oyasi ulash emas. Asosiy g'oya quyidagi hisobda:

### 10x aslida nimani talab qiladi

Ega maqsadi: kuniga **63 → 600 buyurtma** **[ega]**.

Hozir: kuniga o'rtacha **16.5 mashina onlayn**, har biri **3.8 buyurtma** oladi **[ega]**.

```
600 buyurtma/kun ÷ 3.8 buyurtma/mashina = 158 mashina onlayn bo'lishi kerak
Hozir: 16.5  →  kerak: 158  →  9.6 barobar
Bazada 550 haydovchi bor  →  ya'ni onlayn ulushi 3% dan 29% ga chiqishi kerak
```

**Bog'lovchi cheklov — mijoz emas, onlayn mashina.** Buyurtma allaqachon keladi va ularning
**21.5% i rad javob oladi** — oyiga 421 buyurtma yo'qoladi, chunki mashina topilmaydi **[ega]**.

Bu butun rejani belgilaydi: **haydovchi ilovasi go'zal interfeys loyihasi emas, u o'sishning asosiy
richagi.** Har ekran bitta savolga javob berishi kerak — "nega men hozir onlayn turishim kerak?"
Mijoz tomonini pompash (sovrinlar, aksiyalar) rad javobini **oshiradi**, kamaytirmaydi.

### Ish tartibi (xavf bo'yicha, qiziqish bo'yicha emas)

| Faza | Nima | Nega shu tartibda |
|---|---|---|
| **F0** | Audit — "80% tayyor" da'vosini isbotlash | Butun reja shu da'voga suyanadi. Yolg'on bo'lsa, tartib o'zgaradi |
| **F1** | `BirJoySource` ko'prigi + paritet | Kod tayyor bo'lsin, lekin hech narsa yoqilmasin |
| **F2** | Soya rejimi — ikkala tizim parallel | Real trafik bilan isbot, mijozga xavf nol |
| **F3** | Haydovchi ilovasi dala sinovi (5 haydovchi) | APK hech qachon telefonda ishlamagan **[da'vo]** |
| **F4** | Onlayn-ulush hujumi | Asosiy 10x richagi. F3 dan oldin ma'nosi yo'q |
| **F5** | Qo'ng'iroqdan ilovaga ko'chirish | Ta'minot tuzalmaguncha talabni ko'chirish xavfli |
| **F6** | Kas1067 ni o'chirish | Faqat F2–F5 yashil bo'lgandan keyin |

---

## 2. HOZIRGI HOLAT — o'lchangan faktlar

### 2.1 Bot tomoni

```
packages/server/src/kas/types.ts   → interface KasDataSource — 27 metod
packages/server/src/kas/client.ts  → KasLiveSource (kas1067 HTTP, 59 KB)
packages/server/src/kas/mock.ts    → KasMockSource (test)
packages/server/src/kas/index.ts   → getDataSource(), env.KAS_MODE bilan tanlaydi
```

42 faylda 126 chaqiruv. 27 metodning hammasi ishlatiladi **[o'lchandi]**. Eng ko'p ishlatilganlari —
ya'ni eng muhimlari:

| Metod | Chaqiruv | Nima uchun muhim |
|---|---|---|
| `getActiveBooking` | 12× | Mijoz "safarim qani?" deganda |
| `getAllAddresses` | 10× | ~150 nomli joy katalogi — butun buyurtma oqimi shunga tayanadi |
| `getDriverAccount` | 9× | Haydovchi balansi va qarzi |
| `fetchByPhone` | 8× | Telefon → kim ekanini aniqlash |
| `checkClient` | 7× | Buyurtmadan oldin mijoz tekshiruvi |

### 2.2 Taxi yadrosi tomoni **[o'lchandi]**

- **API**: 40 modul, 40 controller, **228 endpoint** — dispatch, pricing, surge, queue, geofence,
  routing, orders, drivers, clients, commissions, loyalty, gamification, operator, safety, sla,
  corporate, fleet, intercity, incentives, promos, topup, support, chat, scheduled-rides, audit,
  monitoring, telegram, payments.
- **Baza**: Postgres 16 + PostGIS, **70 jadval**.
- **Admin**: Next.js 15, **26 sahifa**.
- **Haydovchi ilovasi**: Kotlin + Compose + Hilt, **10 ekran**, 22 MB debug APK.
- **Ma'lumot**: 550 haydovchi, 8 tuman, ~98 Koson manzili, 3 avto sinf.

`docs/MASTER-PLAN.md` (2026-06-08) "pilotgacha ~80%" deydi **[da'vo]** — F0 shuni tekshiradi.

### 2.3 Bozor **[ega, 2026-iyul]**

| | Raqam |
|---|---|
| Buyurtma | 1956/oy (~63/kun) |
| Qo'ng'iroq orqali | 89.4% (1748/oy) |
| Ilova/bot orqali | **10.6%** (208/oy) |
| **Rad javobi** | **21.5%** (421/oy) — 183 kompaniya + 238 haydovchi |
| O'rtacha onlayn mashina | 16.5 |
| Buyurtma/mashina | 3.8 |
| Mijoz to'lovi | ~62 000 so'm |
| Ega sof foydasi | ~1 700 so'm/buyurtma |
| Kuchli/zaif kunlar | Ju-Sha 72-82 · Du-Se 46-58 |

Rad javobining narxi: 421 × 1700 = **oyiga ~716 000 so'm yo'qolgan sof foyda** — va bundan
muhimrog'i, har rad javob mijozni raqibga o'rgatadi.

### 2.4 Bozorning uchta o'ziga xosligi — reja shularga bo'ysunadi **[ega]**

Bu uchtasi Yandex mantiqini shu yerda ishlamaydigan qiladi:

1. **Manzil yo'q.** Kas taximetrda ishlaydi — faqat **olib ketish joyi** tanlanadi. "Qayerga
   borasiz?" degan maydon mavjud emas. Uni qo'shish — yo'q xususiyatni loyihalash.
2. **Yozish 98%.** Xarita ignasini surish va katalogni varaqlash "hech qachon" ishlatilmaydi.
   Ular jim zaxira bo'lib qoladi, asosiy yo'l — nomli joyni yozish.
3. **Mijozga masofa ko'rsatilmaydi.** "5-Maktab yaqinida 100 m" emas — shunchaki `5-Maktab`.
   Haydovchi baribir katalog joyiga boradi.

**Muhim oqibat:** oxirgi push qilinmagan commitlardagi **GPS taximetr** — bu bozor uchun aynan
to'g'ri mexanika, tasodifiy qo'shimcha emas. Aksincha, `@Get('estimate')`, zona-zona narxlash va
manzil maydonlari — mavjud bo'lmagan bozor uchun yozilgan qism.

---

## 3. STRATEGIYA — nega aynan shu yo'l

### Tanlangan yo'l: uchinchi implementatsiya

`BirJoySource implements KasDataSource` — 27 metodni bizning API'mizdan o'qiydi.
Ulash: `KAS_MODE=birjoy`. Orqaga qaytish: `KAS_MODE=live`.

### Rad etilgan muqobillar

| Muqobil | Nega yo'q |
|---|---|
| 126 chaqiruvni qo'lda yangi API'ga o'tkazish | 42 fayl tegiladi, orqaga qaytish yo'li yo'q, bitta unutilgan joy jonli buzilish |
| Botni tashlab, 1067-taxi Mini App'iga o'tish | Mijozlar bot ichida yashaydi; tanga, o'yin, do'kon, e'lonlar — hammasi botda. Bu ko'chish emas, boshqatdan boshlash |
| Kas1067 ni birdaniga o'chirib, yangisiga o'tish | Bitta xato = butun shahar taxisiz. Orqaga qaytish yo'li yo'q |
| Kas1067 kodini dekompilyatsiyadan ko'chirish | Boshqa kompaniyaning huquqi; obfuskatsiya qilingan kod noldan yozishdan qiyin |

Yagona interfeys yo'lining qiymati bitta jumlada: **istalgan daqiqada bitta qator bilan orqaga
qaytish mumkin.** Boshqa hech bir yondashuv buni bermaydi.

---

## 4. 10X O'LCHOVLARI — har faza qaysi raqamni suradi

| Ko'rsatkich | Hozir | Maqsad | Qaysi faza |
|---|---|---|---|
| Onlayn mashina (o'rtacha) | 16.5 | **158** | F4 |
| Rad javobi | 21.5% | **< 5%** | F2, F4 |
| Ilova orqali buyurtma | 10.6% | **> 60%** | F5 |
| Buyurtma/kun | 63 | **600** | F4 + F5 |
| Haydovchi tayinlanish vaqti | o'lchanmaydi | median < 45 s · p95 < 120 s | F2 |
| Operator bir buyurtmaga | qo'lda, o'lchanmagan | **< 20 s** | F5 |
| 8 soatda o'tkazib yuborilgan buyurtma | noma'lum | **0** | F2 |
| Haydovchining kunlik daromadi ko'rinishi | yo'q | real vaqt | F3 |

Birinchi qadam ba'zi joyda "o'lchanmaydi" degan so'zni yo'qotish: hozir tayinlanish vaqti va
o'tkazib yuborilgan buyurtmalar umuman sanalmaydi. **O'lchamaydigan narsani yaxshilab bo'lmaydi.**

---

## 5. FAZALAR

### F0 — Audit: da'voni haqiqatdan ajratish

**Nega:** butun reja "80% tayyor" degan tekshirilmagan gapga suyanadi. Yolg'on chiqsa, F1 dan
keyingi hamma narsa siljiydi. Arzon tekshiruv — qimmat kutilmaganning oldini oladi.

**Ish:** `TAXI_PROMPT_1.md` dagi to'rt hujjat — yadro auditi, 27 metodlik paritet jadvali,
kas1067 xususiyatlar ro'yxati, shu rejaning yangilangan varianti.

**Qabul darvozasi:**
- 27 metodning har biri uchun: qaysi endpoint qoplaydi, qaysi maydon yetishmaydi — `fayl:qator` bilan.
- `dispatch` algoritmi yozib chiqilgan: hech kim qabul qilmasa nima bo'ladi?
- Testlar soni va oxirgi yashil holati aytilgan.
- Kod yozilmaydi, push qilinmaydi.

**Allaqachon topilgan bitta gap:** `createOrder()` [orders.service.ts:45] mavjud, lekin butun
tizimda faqat bitta joydan chaqiriladi — [telegram.service.ts:1161]. **REST endpoint yo'q.**
Ya'ni botimiz buyurtma yarata olmaydi. Ish katta emas, lekin bu — auditsiz qurish o'rtasida
chiqadigan turdagi kutilmagan.

---

### F1 — Ko'prik: `BirJoySource`

**Nega:** kod tayyor bo'lsin, lekin hech narsa yoqilmasin. Yozish va yoqish — ikki alohida qaror.

**Ish:**
1. `packages/server/src/kas/birjoy.ts` — 27 metodni implementatsiya qilish.
2. Yetishmaydigan endpointlarni taxi API'siga qo'shish (`createBooking` birinchi navbatda).
3. `getDataSource()` ga uchinchi tarmoq: `KAS_MODE=birjoy`.
4. Har metod uchun test — `KasMockSource` bilan bir xil shakl qaytarishi shart.

**Qabul darvozasi:**
- 27/27 metod implementatsiya qilingan, birortasi `throw new Error("not implemented")` emas.
- Typecheck yashil, testlar yashil, iqtisod-simlar yashil.
- `KAS_MODE=live` da hech narsa o'zgarmagan — jonli xatti-harakat bir xil.
- **Hech qanday flag yoqilmagan.**

**Xavf:** ma'lumot shakli mos kelmasligi (masalan `RideHistoryItem` maydonlari). Shuning uchun
F0 dagi jadval — F1 ning ish rejasi.

---

### F2 — Soya rejimi: real trafik bilan isbot

**Nega:** bu rejaning eng qimmatli g'oyasi. Yangi tizim mijozga ta'sir qilmasdan turib real
buyurtmalarda sinaladi.

**Ish:** har real buyurtma kas1067 ga ketadi (mijoz shuni ko'radi), **ayni paytda** nusxasi
bizning yadroga ham yoziladi. Natijalar solishtiriladi va farqlar jurnaliga yoziladi:
kim haydovchi tanladi, qancha vaqtda, narx qanchaga farq qildi.

Yangi poller yozilmaydi — mavjud `bookingNotifier` sweep kengaytiriladi (CLAUDE.md qoidasi).

**Qabul darvozasi (7 kun ketma-ket):**
- 500+ real buyurtmada solishtiruv.
- Bizning yadro **> 95%** holatda kas1067 tanlagan haydovchini yoki undan yaqinrog'ini tanlagan.
- Narx farqi mediani **< 3%**.
- Bizning tayinlanish vaqti kas1067 nikidan yomon emas.
- **0 ta halokat** (crash), 0 ta yo'qolgan buyurtma.

Bu darvoza yopilmasa — F6 haqida gap ham yo'q. Soyada yiqilgan tizim jonliga chiqmaydi.

---

### F3 — Haydovchi ilovasi: dala sinovi

**Nega:** APK quriladi, lekin **hech qachon real telefonda ishlatilmagan** **[da'vo]**. 22 MB
fayl — bu hali ilova emas, bu hali fayl.

**Ish:**
1. 5 ta haydovchi tanlanadi — eng faol, ega shaxsan taniydigan.
2. APK o'rnatiladi, kirish, onlayn bo'lish, buyurtma qabul qilish, safarni yakunlash.
3. Har haydovchi bilan sinovdan keyin suhbat: nimasi noqulay, nimasi tushunarsiz.
4. SMS OTP (Eskiz) ishga tushiriladi — Telegrami bog'lanmagan haydovchi kira olmaydi.

**Qabul darvozasi:**
- 5 haydovchi × 3 kun × kamida 1 safar = 15 real safar, ilova orqali boshidan oxirigacha.
- Har safarda pul to'g'ri: taximetr, komissiya, balans — uchtasi ham to'g'ri.
- Batareya sarfi: 8 soat onlayn turganda ≤ 25%.
- GPS uzilib qolganda safar buzilmaydi.
- 5 haydovchidan kamida 4 tasi "kas ilovasidan yaxshi" deydi.

**Bu faza qog'ozda emas, dalada bajariladi.** Kod bilan hal bo'lmaydi.

---

### F4 — Onlayn-ulush hujumi (asosiy 10x richagi)

**Nega:** 16.5 → 158 mashina. Boshqa hamma narsa shunga xizmat qiladi.

Haydovchi nega onlayn turmaydi? Bu savolga hozir hech kimda javob yo'q — chunki hech kim
so'ramagan va hech narsa o'lchanmagan. F4 shu bilan boshlanadi: **20 haydovchi bilan suhbat.**

Gipoteza (tekshiriladi, ishonilmaydi):
- Onlayn turish behuda ko'rinadi — buyurtma kelishiga ishonch yo'q.
- Qaysi vaqt va qayer foydali ekani noma'lum.
- Kutish vaqti pul keltirmaydi.
- Kompaniyaga qancha qarz borligi noaniq — noaniqlik ishlashdan qaytaradi.

**Ish (gipoteza tasdiqlansa):**
- **Onlayn bo'lishga ball** — ayniqsa zaif kunlarda (Du-Se, 46-58 buyurtma) va zaif soatlarda.
- **Issiqlik xaritasi** — hozir qayerda buyurtma ko'p.
- **"Bugun shuncha topding"** — real vaqtda, tekshirib bo'ladigan.
- **Qarz va balans oyna kabi tiniq** — har tanga qayerdan kelib qayerga ketgani ko'rinadi.
- **Kunlik/haftalik maqsad** — "yana 3 safar → bonus".

**Qabul darvozasi:**
- O'rtacha onlayn mashina 16.5 → **40+** (birinchi bosqich, 158 emas).
- Rad javobi 21.5% → **< 12%**.
- Ball iqtisodi: har berilgan ball 1700 so'm foydadan kelib chiqadi, byudjet ichida. Simulyatsiya
  bilan isbot (`simEconomy`), his bilan emas.

⚠️ Bu faza pul mexanikasiga tegadi. Buzilmas qoida: **bir safar emissiyasi ≤ 350 tanga**, har
mexanika kill-switch flag ortida, har tanga operatsiyasi `CoinTxn` + idempotent kalit bilan.

---

### F5 — Qo'ng'iroqdan ilovaga ko'chirish

**Nega:** 1748 qo'ng'iroq/oy operator vaqtini yeydi va o'sishni cheklaydi. Lekin **ta'minot
tuzalmaguncha** talabni ko'chirish rad javobini oshiradi.

**Ikki tomonlama ish:**

**Operator tomoni** — qo'ng'iroq 20 soniyada buyurtmaga aylansin. Bunga kerak bo'lgan endpointlar
allaqachon bor **[o'lchandi]**: `operator/client/lookup`, `client/quick`, `orders`,
`drivers/available`, `dispatch/manual`, `orders/:id/reassign`, `calls/log`, `operator-phones/ring`.
Ya'ni suyagi tayyor, ekranni yig'ish qoldi.

**Mijoz tomoni** — qo'ng'iroq qilgan mijozga safar tugagach bitta xabar: "Keyingi safar bitta
tugma bilan chaqiring". Bosim yo'q, majburlash yo'q.

**Qabul darvozasi:**
- Operator o'rtacha vaqti < 20 s (o'lchanadi, taxmin qilinmaydi).
- Ilova ulushi 10.6% → **30%** (birinchi bosqich).
- Ko'chirilgan mijozlarda rad javobi oshmagan.

---

### F6 — Kas1067 ni o'chirish

**Faqat quyidagilarning hammasi bajarilgach:**
- F2 darvozasi 7 kun ketma-ket yashil.
- F3 dala sinovi qabul qilingan.
- Manzil katalogi ko'chirilgan va tekshirilgan (§7).
- Haydovchi balanslari va mijoz bonuslari ko'chirilgan, har biri tiyingacha solishtirilgan.
- Ega real telefonda o'zi buyurtma berib ko'rgan va qabul bergan.

**O'tish:** `KAS_MODE=birjoy`, keyin 72 soat kuchaytirilgan kuzatuv. Kas1067 obunasi darhol
bekor qilinmaydi — kamida 30 kun orqaga qaytish yo'li ochiq turadi.

---

## 6. HAYDOVCHI ILOVASI — dizayn blueprinti

**Bosh savol:** har ekran "nega men hozir onlayn turishim kerak?" degan savolga javob beradimi?

Yandex Go dan farqimiz mana shunda: Yandexda haydovchi ko'p, buyurtma kam — u yerda ilova
haydovchini **tartibga soladi**. Bizda teskari: buyurtma bor, haydovchi yo'q — bizning ilova
haydovchini **chaqirishi** kerak. Bu boshqa mahsulot.

### Bosh ekran

Ekranning yarmi — bitta raqam: **bugun topgan puling.** Kichkina emas, katta. Haydovchi ilovani
ochganda birinchi ko'radigan narsa — o'z pulining o'sgani.

Ostida: **ONLAYN** tugmasi. Ilovaning eng muhim boshqaruvi, eng katta nishon, ikkilanmaydigan holat.

Xaritada issiqlik: qayerda buyurtma ko'p. Manzil yo'q bozorda haydovchi qayerga borishni o'zi
hal qiladi — bizning ishimiz unga ma'lumot berish.

Pastda bitta qator: **"Yana 3 safar → 15 000 bonus"**. Maqsad ko'rinib tursa, ish davom etadi.

### Buyurtma taklifi

Bu — butun mahsulotning eng muhim 15 soniyasi. Rad javobining yarmi shu yerda tug'iladi.

Kartada faqat qaror uchun kerak narsa:
- **Olib ketish joyi nomi** — katalogdagi nom, katta harflar bilan.
- **Sizgacha masofa** — haydovchiga bu kerak (mijozga emas).
- **Mijoz belgisi** — necha marta safar qilgan, bekor qilish odati bormi.
- **Sanoq halqasi** — necha soniya qolgani ko'rinib turadi.

Kartada **manzil yo'q** — chunki bu bozorda manzil tushunchasi mavjud emas. Yo'q narsani
ko'rsatgan ilova birinchi kunda ishonchni yo'qotadi.

Qabul qilish — surish bilan, bosish bilan emas. Haydovchi rulda, tasodifiy bosish qimmatga tushadi.

Hech kim qabul qilmasa: buyurtma o'lmaydi — keyingi doiraga o'tadi, radius kengayadi, oxirida
operator ekranida qizil bo'lib chiqadi. **8 soatda o'tkazib yuborilgan buyurtma = 0** degani shu.

### Safar ekrani

Taximetr — katta raqam, doim ko'rinadi. Bekor qilish sabab bilan. Bepul kutish taymeri ko'rinadi —
haydovchi kutayotganda pul ishlayotganini bilishi kerak.

### Daromad ekrani

Real safarlar, real pul. Har safar ochilib ko'rsatiladi: qancha yo'l, qancha pul, qancha komissiya.
**Qarz alohida va tiniq.** Noaniq qarz — ishdan qaytaruvchi kuch.

### Buzilmas dizayn qoidalari (`DIZAYN_QOIDALARI.md` dan)

Har ekran 3 soniya testidan o'tadi: bu nima? menga nima? nima bosaman? · Har bosishda 100 ms
ichida vizual javob · Har async holatda skeleton, real layoutning nusxasi · NaN va bo'sh xrom
chiqmaydi · Ma'lumotsiz element ko'rsatilmaydi.

---

## 7. DISPETCHER KONSOLI — dizayn blueprinti

Operator kuniga ~58 qo'ng'iroq oladi **[ega hisobidan]**. Maqsad — 20 soniya.

**Oqim:** telefon jiringlaydi → CTI raqamni ilg'aydi → mijoz kartasi o'zi ochiladi (kim, necha
safar, oxirgi olib ketish joyi) → operator joyni tasdiqlaydi → tayinlash avtomatik ketadi.
Operator faqat tasdiqlaydi. Yozish — istisno, qoida emas.

Bunga kerak endpointlarning hammasi bor **[o'lchandi]**: `client/lookup`, `client/quick`, `orders`,
`orders/estimate`, `drivers/available`, `dispatch/manual`, `orders/:id/reassign`, `calls/log`,
`operator-phones/ring|answered|ended`.

**Ekranning yagona vazifasi — muammoni ko'rsatish.** Yaxshi ketayotgan buyurtmalar jim turadi.
Operator ko'zi faqat quyidagilarga tushadi: haydovchi topilmayapti · haydovchi kechikyapti ·
mijoz ikkinchi marta qo'ng'iroq qilyapti · buyurtma ikki doiradan o'tdi.

Chunki 63 buyurtma/kunda ro'yxatni varaqlash mumkin, 600 da mumkin emas. Konsol bugun uchun emas,
600 uchun quriladi.

---

## 8. MIGRATSIYA — eng nozik qism

### 8.1 Manzil katalogi — birinchi darajali xavf

Koson'da ~150 nomli joy bor va ular **kas1067 katalogidan keladi**, biz yozganimizdan emas
**[ega]**. `getAllAddresses` 10 marta chaqiriladi — butun buyurtma oqimining suyagi.

Kas1067 dan uzilsak, katalog ko'chirilmagan bo'lsa, mijoz "eski bozor" deb yozadi va hech narsa
topilmaydi. Bu chidab bo'lmaydigan buzilish.

**Qoida:** taxminiy moslashtirish (fuzzy matching) **taqiq**. Noto'g'ri taxmin real taksini
noto'g'ri manzilga yuboradi. Faqat ega tasdiqlagan aliaslar sheva nomini katalog nomiga bog'laydi
(`packages/server/src/services/addressAlias.ts` dagi qat'iy qoida).

**Tekshiruv:** ko'chirishdan keyin 150 joyning har biri qidiruvda topilishi va bir xil joyni
qaytarishi — bittalab, avtomatik test bilan.

### 8.2 Pul — ikkinchi darajali xavf, lekin eng og'ir oqibatli

Haydovchi qarzi va balansi, mijoz bonusi ko'chiriladi. **Bir marta noto'g'ri raqam chiqsa,
ishonch qaytmaydi** — haydovchi ilovani o'chiradi va boshqa o'rnatmaydi.

**Tekshiruv:** ko'chirishdan oldin va keyin har haydovchi balansi tiyingacha solishtiriladi.
Farq bo'lsa — o'tish to'xtaydi, davom etmaydi.

### 8.3 Mijoz shaxsi

Telefon raqami — yagona bog'lovchi kalit. Ikkala tizimda ham telefon asosiy identifikator, shuning
uchun ko'chish nisbatan xavfsiz. Lekin format farqi (+998 bilan/siz) alohida tekshiriladi.

---

## 9. XAVFLAR

| Xavf | Ehtimol | Zarar | Oldini olish | Aniqlash belgisi |
|---|---|---|---|---|
| Manzil katalogi ko'chmay qoladi | O'rta | **Halokatli** | §8.1 bittalab test | Qidiruvda bo'sh natija ko'payadi |
| Haydovchi balansi noto'g'ri ko'chadi | O'rta | **Halokatli** | Tiyingacha solishtiruv | Haydovchi shikoyati |
| 550 haydovchi ilovani o'rnatmaydi | **Yuqori** | Yuqori | F3 → F4, 5 tadan boshlab | O'rnatish soni o'smaydi |
| SMS yetkazilmaydi (Eskiz yo'q) | Yuqori | Yuqori | F3 da ishga tushiriladi | OTP kutish vaqti oshadi |
| Yadro soyada yiqiladi | O'rta | O'rta (mijozga yetmaydi) | F2 darvozasi | Solishtiruv jurnali |
| 8 commit diskda yo'qoladi | Past | **Qaytarib bo'lmaydi** | `git bundle` zaxirasi | — |
| Zaxira uchun push → tasodifiy deploy | **Yuqori** | Yuqori | `deploy.yml` `main` push'da ishlaydi — bundle ishlatiladi | — |
| Ega-preview aldovi (flag yoqilgan ko'rinadi, mijozga ko'rinmaydi) | O'rta | Yuqori | Har flagda "oddiy mijoz nima ko'radi?" | Ega ko'radi, mijoz ko'rmaydi |
| Talab ta'minotdan oldin o'sadi | O'rta | Yuqori | F5 F4 dan keyin | Rad javobi oshadi |

---

## 10. NIMA QILINMAYDI (ongli qarorlar)

- **"Qayerga borasiz?" maydoni** — bu bozorda manzil tushunchasi yo'q. Yo'q narsa loyihalanmaydi.
- **Xarita ignasi asosiy yo'l sifatida** — "hech qachon" ishlatilmaydi. Jim zaxira bo'lib qoladi.
- **Mijozga masofa ko'rsatish** — `5-Maktab`, "5-Maktab yaqinida 100 m" emas.
- **Sovrin-o'yin bilan yalang'och talabni pompash** — rad javobini oshiradi. Avval ta'minot.
- **Kas1067 kodini ko'chirish** — spetsifikatsiya o'qiladi, satr emas.
- **Yangi git shoxobcha** — ish `main` da, xavfli qism flag ortida DARK.
- **Yangi poller** — mavjud `bookingNotifier` sweep kengaytiriladi.
- **Katta bang o'tish** — soya rejimisiz almashish yo'q.
- **1067-taxi Mini App'ini rivojlantirish** — mijozlar botda yashaydi. Ikkita mijoz ilovasi
  boqilmaydi.

---

## 11. HOZIR QILINADIGAN UCHTA ISH

1. **Zaxira** — `git bundle` bilan 8 commit bitta faylga o'raladi. Push **emas**:
   `1067-taxi/.github/workflows/deploy.yml` `main` push'da prod deploy qiladi **[o'lchandi]**,
   ya'ni "zaxira" aslida sinalmagan kodning relizi bo'lardi. 2 daqiqa, yon ta'sir nol.
2. **Token** — `1067-taxi/.git/config` ichidagi GitHub tokeni ochiq matnda. Ega GitHub'da bekor
   qiladi, men remote URL'ni tokensiz holatga keltiraman.
3. **F0 auditi** — `TAXI_PROMPT_1.md` ishga tushadi. Shu tugagach bu reja aniq raqamlar bilan
   yangilanadi.

---

## 12. EGADAN KERAK QARORLAR

1. **Reja tasdiqlanadimi?** Fazalar tartibi to'g'rimi — ta'minot (F4) talabdan (F5) oldinmi?
2. **F3 uchun 5 haydovchi** — kimlar? Ega shaxsan taniydigan, eng faol beshtasi kerak.
3. **Eskiz** — SMS xizmatiga obuna kim va qachon ochadi? F3 shunga bog'liq.
4. **Kas1067 obunasi** — F6 dan keyin necha kun parallel to'lab turamiz? (Tavsiya: 30 kun.)
5. **Onlayn ball byudjeti** — F4 da haydovchiga onlayn turgani uchun ball beriladi. Bir kunda
   qancha so'mgacha? (1700 so'm/buyurtma foydadan kelib chiqadi.)

---

*Bu reja o'lchangan faktlarga suyanadi, lekin "80% tayyor" degan asosiy da'vo hali tekshirilmagan.
F0 tugagach reja qayta yoziladi — o'shanda har raqam isbotlangan bo'ladi.*
