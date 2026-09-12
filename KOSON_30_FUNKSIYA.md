# KOSONNI EGALLASH — 30 FUNKSIYA

⭐ = asosiy 10 talik (`KOSON_10_FUNKSIYA.md`da batafsil).
**Narx:** S = ≤3 kun · M = 4–10 kun · L = >10 kun (bitta muhandis).
**Raqamlar:** ① onlayn mashina (16.5) · ② rad (21.5%) · ③ ilova ulushi (10.6%) · ④ daromad.

---

## A. MANZIL VA BUYURTMA QABUL — *89.4% buyurtma telefondan keladi*

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 1 ⭐ | **KOSON TILI** — "banisa"→OBRON BALNITSA. Fuzzy + alias + o'rganuvchi katalog | A'da to'liq fuzzy tayyor (`booking.ts:75-137`, `pickup.ts:41-61`); B'da **yalang'och ILIKE** | M | ②③ |
| 2 ⭐ | **OPERATOR KO'ZI** — qo'ng'iroqda kim + oxirgi 3 manzil + 1 bosish | `operator/client/lookup` bor | S–M | ②③ |
| 3 | **IVR** — "1 = o'sha joydan yana", "2 = taksim qani" | yo'q (yangi) | M | ③, operator vaqti |
| 4 | **Ovozli buyurtma** — Telegram'ga ovozli xabar → operator navbatiga. ASR shart emas | broadcast/bot bor | S | ③ |
| 5 | **Topilmagan qidiruvlar jurnali** — har hafta katalogga qo'shiladi | `useCount` **hech qachon yozilmaydi** (o'lik) | S | ② |

**Nega bu blok birinchi:** manzil topilmasa buyurtma tug'ilmaydi. Yozish 98% — qidiruv sifati bevosita ilova ulushiga aylanadi.

---

## B. DISPATCH VA TEZLIK — *radning 56.5% i haydovchi radi*

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 6 ⭐ | **BIR VAQTDA TAKLIF (broadcast) + ADOLAT** — 3-5 haydovchiga; uzoq podacha jazosiz skip | hozir **ketma-ket, 75s** | M | ②① |
| 7 ⭐ | **MAHALLA DISPATCH** — o'z mahallasi haydovchisi avval | tumanda **poligon yo'q** → zona bahosi doimiy 0.5; A'da 39 mahalla markazi | S | ②① |
| 8 | **Prioritet = virtual metr** — "yaqin" va "yaxshi" bitta raqamga | `driver-scorer.service.ts` bor, og'irliklar sozlanadi | S | ②① |
| 9 | **Zona FIFO navbati** — bozor/vokzalda "siz 3-chisiz" | **modul yozilgan, `getNextInQueue` hech qachon chaqirilmaydi** | S | ①② |
| 10 | **Zanjirli buyurtma** — safar tugamasdan keyingisi biriktiriladi | yo'q | M | ①② |

**Nega:** mashina qo'shmasdan ta'minotni oshiradigan yagona blok shu (#9, #10).

---

## C. HAYDOVCHI TA'MINOTI — *bog'lovchi cheklov*

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 11 ⭐ | **UYG'OTISH** — 307 haydovchi hech qachon buyurtma olmagan; 3 kunda 147 tasi haydagan | broadcast dvigateli **jonli**, haydovchi-target bor; obzvon CRM jonli | S | ①① |
| 12 ⭐ | **KOMISSIYA ZINAPOYASI** — mukofot = komissiya chegirmasi, naqd chiqmaydi | **rail prodda ishlaydi** (`payDebtWithCoins`→`addDriverPayment`); B'da `incentives` moduli **o'lik** | M | ① |
| 13 | **Kunlik maqsad** — "5 safar = bonus", bonusdan komissiya olinmaydi | `incentive_rules` jadval bor, HTTP qatlami o'lik | M | ① |
| 14 | **Haydovchi referali** — haydovchi haydovchi taklif qiladi, 10 safardan keyin mukofot | A'da **grafik tayyor** (`DriverRecruit`, `payDriverRecruitMilestone`) | S | ① |
| 15 | **Yoqilg'i / texko'rik chegirmasi** — kod emas, **shartnoma** | — | S (kelishuv) | ① |

**Nega:** 553 telefon raqami — raqib Kosonga **nol haydovchi** bilan keladi. Bu sizning eng kam ishlatilgan aktivingiz.

---

## D. MIJOZ SODIQLIGI VA ODAT

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 16 ⭐ | **MENING HAYDOVCHIM** — 20s birinchi taklif huquqi | VIP/preferred endpointlari bor, **dispatch ishlatmaydi** | S | ②③ |
| 17 ⭐ | **DOIMIY SAFAR** — maktab/ish/dializ, jadval + doimiy haydovchi | `scheduled_rides` bor (bugun himoyasi+bekor qilish tuzatildi), takrorlanish yo'q | M | ④③ |
| 18 | **Oxirgi safarni takrorlash** — bitta bosish | `lastPickup*` A'da keshlangan | S | ③ |
| 19 | **SMS kuzatuv havolasi** — ilovasiz mijozga ham "mashina keldi" | yo'q | S | ③② |
| 20 | **Mahalla referali** — qo'shni qo'shnisini taklif qiladi | tanga tizimi + referal mashinasi A'da bor | S | ③ |

**Nega:** kichik shaharda odat = moat. Bir marta jadvalga tushgan oila boshqa ilovaga o'tmaydi.

---

## E. PUL, XAVFSIZLIK, ISHONCH — *pul mexanikasidan OLDIN*

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 21 | **Mock-GPS bloki** — soxta lokatsiya aniqlanadi | yo'q ⚠️ | S | firibgarlik |
| 22 | **No-show qoidalari** — 10 daqiqa + 300 metr, ob'ektiv | kutish taymeri bor, qoida yo'q | S | ②, nizo |
| 23 | **Reyting sovuq start + reyting→prioritet** | `avgRating` bor; yangi haydovchi 1 yomon bahodan o'ladi | S | ①② |
| 24 | **Kunlik naqd hisob-kitob** — har kuni yopiladigan balans varaqasi | `driver_daily_summary` jadval bor, ishlatilmaydi | M | ishonch |
| 25 | **Hujjat muddati ogohlantirishi** — guvohnoma/sug'urta tugashi | `driver_documents.expiryDate` bor; `GET expiring` **0 chaqiruvchi** | S | huquqiy xavf |

⚠️ **#21 majburiy shart:** har qanday pul-rag'bat (12,13,14) yoqilishidan **oldin** mock-GPS yopilishi kerak, aks holda rag'bat firibgarlikni moliyalashtiradi.

---

## F. YANGI DAROMAD QATLAMLARI — *bir mashinadan ko'p daromad*

| # | Funksiya | Bizda nima bor | Narx | Raqam |
|---|----------|----------------|------|-------|
| 26 ⭐ | **KOSON↔QARSHI o'rindiq** — 4 o'rin, to'lgach jo'naydi | A'da **10 model tayyor**, ega 2026-07-23 da o'chirgan | M | ④ |
| 27 ⭐ | **POCHTA** — hujjat/paket, o'sha safar | buyurtma+SLA+ETA mashinasi **tayyor**; faqat "kim eltadi" ulanmagan | M | ④① |
| 28 | **Korporativ hisob** — oldindan to'langan, xodim safari yechiladi | jadval+API **bor**, lekin safar hech qachon balansdan **yechmaydi** | M | ④ |
| 29 | **Maktab / korxona shartnomasi** — kunlik guruh tashish | JAMOA smena moduli (9 model) mavjud, o'chirilgan | M | ④① |
| 30 | **To'y mavsumi rejimi** — oldindan N ta mashina band qilish | yo'q | M | ④ |

---

# TARTIB — 5 to'lqin

| To'lqin | Nima | Nega shu tartibda |
|---------|------|-------------------|
| **0** | **O'lchov** (offer_sent → accept/reject/**timeout ajratilgan**) | 6 asosiy raqam hozir **umuman o'lchanmaydi**. Busiz #6 va #13 orasidagi tartib — taxmin |
| **1** | 1, 2, 5, 9, 7 | Arzon + allaqachon yozilgan kodni tiriltiradi |
| **2** | 11, 21, 22, 23, 14 | Ta'minot + firibgarlik qalqoni (pul mexanikasidan oldin) |
| **3** | 6, 8, 16, 18, 3 | Rad javobiga asosiy zarba |
| **4** | 12, 13, 17, 10, 24 | Ushlab qolish va barqaror daromad |
| **5** | 26, 27, 28, 29, 30 | Yangi daromad qatlamlari |

---

# ⚠️ AVVAL TUZATILADIGAN BUZUQLIKLAR (funksiya emas, to'siq)

Bular yangi funksiya emas — **allaqachon yozilgan, lekin buzuq**:

| Nima | Isbot | Oqibat |
|------|-------|--------|
| `GET /drivers/heatmap` **soyada qolgan** — `@Get(':id')` undan oldin e'lon qilingan | `drivers.controller.ts:58` vs `:90` | Haydovchi ilovasidagi heatmap **hech qachon ishlamaydi** (xato jimgina yutiladi) |
| `GET /drivers/pending` ham soyada | `drivers.controller.ts:129` | Tasdiqlanmagan haydovchilar ro'yxati o'lik |
| `GET /drivers/:id/orders` **umuman mavjud emas** | `drivers/[id]/page.tsx:141` chaqiradi | Admin panelda haydovchining safarlari **abadiy bo'sh** |
| `incentives` (7 endpoint), `queue` (2), `fleet` (6), `sla` (modul yo'q) | 0 chaqiruvchi | Yozilgan, boot vaqtini yeydi, ishlamaydi |
| `POST /intercity/orders` **himoyasiz**, `clientId` body'dan | `intercity.controller.ts:31` | Har kim istalgan mijoz nomidan buyurtma yaratadi |

---

# EGA HAL QILISHI KERAK

1. **Shaharlararo (#26)** — siz 2026-07-23 da ataylab o'chirgansiz. Qayta ochamizmi?
2. **Broadcast (#6)** — qolgan haydovchilar "kech qoldingiz" ko'radi. Rozimisiz?
3. **Firebase** — #6, #11, #19 uchun push kerak.
4. **Pochta (#27) va maktab shartnomasi (#29)** — bu **yangi biznes yo'nalishlari**, faqat funksiya emas.
5. **Yoqilg'i chegirmasi (#15)** — kod emas, sizning shartnomangiz.

---

# NIMA QILMAYMIZ (ongli qaror)

inDrive savdolashuvi (manzil majburiy — bizda yo'q) · batching/pooling (63 buyurtma/kunda partiya yig'ilmaydi) · RL dispatch (o'n millionlab qaror kerak) · xarita-ignasi asosiy yo'l (Kosonda "hech qachon") · mijozga metrli ETA (soxta aniqlik ishonchni o'ldiradi) · alohida ratsiya ilovasi (ikkinchi o'rnatish to'sig'i) · Voice AI operator (Qarshi shevasiga model yo'q — avval DTMF IVR)
