# KOSONNI EGALLASH — 10 FUNKSIYA

**Maqsad:** Koson (Qashqadaryo) taksi bozorini shunday egallash-ki, Yandex/Maxim kelsa ham
ololmasin. Har funksiya **moat** (himoya devori) mantiqiga qurilgan: raqib pul bilan sotib
ololmaydigan narsa.

**O'lchangan haqiqat (shu asosda):**
- 1 956 buyurtma/oy · **21.5% rad** · **10.6% ilova** (qolgani 1067 ga qo'ng'iroq) · ~1 700 so'm/safar
- Radning **56.5% — haydovchi radi**, 43.5% mashina yo'qligi *(jahon tadqiqoti)*
- Roʻyxatda **553 haydovchi**, lekin **307 tasi hech qachon buyurtma olmagan**; 3 kunlik oynada
  atigi **147 tasi** haydagan *(drivers.json, o'lchandi)*
- Manzil katalogi: **99 nom** — MESIT CHORAXA, NARTCHUQUR DORQUDUQ, OBRON BALNITSA…
- Mijoz manzilni **yozadi (98%)**, xarita-ignasi o'lik, **borish manzili yo'q**

---

## Nega bu 10 ta — moat mantig'i

Raqib pul bilan uch narsani sotib oladi: haydovchi (subsidiya), mijoz (chegirma), texnologiya.
**Sotib ola olmaydigani uchtasi:** ① Kosonning o'z tili va joy nomlari ② odamlarning bir-birini
tanishi ③ 1067 raqamiga o'rganib qolgan odat. Shu uchtasiga qurilgan har funksiya — moat.

---

# 1. KOSON TILI — manzil miyasi

**Nima:** Odam nima desa tushunadigan manzil topuvchi. "banisa" → OBRON BALNITSA.
"nartchuqurga" → NARTCHUQUR. "mesit chorraxa" → MESIT CHORAXA.

**Bugungi holat — bu eng katta yo'qotilgan imkoniyat:**
- B'ning qidiruvi — **yalang'och `ILIKE '%q%'`**, faqat `name` ustuni bo'yicha
  (`addresses.service.ts:11-16`). Xato yozilsa **hech narsa topilmaydi**.
- A'da esa **butun boshli fuzzy tizim bor**: Levenshtein (`booking.ts:75-89`), o'zbek
  qo'shimchalarini yechish `-ga/-dan/-dagi/-ning…` (`booking.ts:104-110`),
  `sh↔s · ch↔c · q↔k · x↔h` moslashtirish va **unlisiz skelet** solishtiruv
  (`packages/shared/src/pickup.ts:41-61`), va **alias jadvali** (`addressAlias.ts`).
- ⚠️ `KAS_MODE=birjoy` qilinsa, A'ning qidiruvi B'ning ahmoq ILIKE'iga ulanadi — ya'ni
  **o'tish paytida aqlni yo'qotamiz**.
- ⚠️ `incrementUseCount` **hech qachon chaqirilmaydi** — katalog o'rganmaydi.

**Qilinadigan ish:**
1. A'dagi fuzzy + folding + suffiks-yechish B'ga ko'chiriladi (kod tayyor, ko'chirish).
2. **Alias jadvali operatorga ochiladi:** qo'ng'iroqda notanish nom aytilsa, operator bir bosishda
   "bu = OBRON BALNITSA" deb bog'laydi. **Har noto'g'ri eshitilgan so'z abadiy bilimga aylanadi.**
3. `useCount` tirilтiriladi — ko'p buyurtilgan joy yuqoriga chiqadi.
4. Har topilmagan qidiruv **yozib boriladi** → haftada bir marta ko'rib, katalogga qo'shiladi.

**Nega moat:** Bu katalog **sizning qo'ng'iroq tarixingizdan** o'sadi. Yandex Kosonga kirsa,
uning bazasida "NARTCHUQUR DORQUDUQ" yo'q va hech qachon bo'lmaydi. Bir yildan keyin sizda
500+ alias bo'ladi — bu **ko'chirib bo'lmaydigan aktив**.

**Raqam:** rad ↓ (topilmagan manzil = yo'qolgan buyurtma) · ilova ulushi ↑ (yozish 98%!)
**Narx:** M (kod A'da tayyor)

---

# 2. MAHALLA DISPATCH — o'z mahallasining haydovchisi

**Nima:** Har haydovchi 1-3 ta "o'z mahallasi"ni belgilaydi. Buyurtma **avval o'sha mahalla
haydovchisiga** boradi.

**Bugungi holat:** `tumans` jadvalida **poligon yo'q** — ya'ni lat/lng qaysi tumanda ekanini
aniqlaydigan funksiya **umuman mavjud emas**. Natijada `zoneAffinityScore` har dispatchda
**doimiy 0.5** (`dispatch.service.ts:214-222` — `null, // TODO`), ya'ni tuman **hech narsaga
ta'sir qilmaydi**. Butun zona apparati o'lik: `service_areas`, `surge_zones`, `pricing_zones`,
`queue_zones` — **hammasi bo'sh**, hech qachon urug'lantirilmagan.

**Qilinadigan ish:** Poligon shart emas — A'da **39 ta haqiqiy mahalla** markazlari bor
(`seedMahalla.ts`). Pickup → eng yaqin mahalla markazi → shu mahalla haydovchilariga ustuvorlik.

**Nega moat:** Kichik shaharda "bizning mahalla bolasi" — bu tezlik emas, **ishonch**. Onasi
qizini yuborganda tanish haydovchini xohlaydi. Global platforma buni modellay olmaydi.

**Raqam:** rad ↓ · podacha vaqti ↓ · haydovchi qabuli ↑
**Narx:** S (markazlar tayyor)

---

# 3. DOIMIY SAFAR — har kuni bir xil yo'l

**Nima:** Maktabga bola, ishga smena, dializga bemor — **haftalik jadval bo'yicha avtomatik
buyurtma**, doim **o'sha haydovchi**.

**Nega aynan Koson:** Kichik shaharda har kuni bir xil 30-50 odam bir xil yo'ldan yuradi.
Bu **eng barqaror daromad** va eng kuchli odat.

**Bugungi holat:** `scheduled_rides` bor, lekin ① takrorlanish yo'q ② POST/cancel **himoyasiz
edi** (bugun tuzatdim) ③ admin bekor qilish **buzuq edi** (bugun tuzatdim).

**Qilinadigan ish:** takrorlanish qoidasi (kunlar + vaqt) + doimiy haydovchi biriktirish +
kechqurun "ertaga 07:30 da, tasdiqlaysizmi?" xabari.

**Nega moat:** Bir marta jadvalga tushgan oila **hech qachon boshqa ilovaga o'tmaydi** — chunki
o'tish narxi (qayta sozlash, yangi haydovchiga o'rganish) foydadan katta.

**Raqam:** oylik buyurtma ↑↑ · churn ↓↓
**Narx:** M

---

# 4. MENING HAYDOVCHIM — birinchi taklif huquqi

**Nima:** Mijoz sevimli haydovchisini belgilaydi. Buyurtma **avval 20 soniya faqat unga**
boradi, keyin umumiy dispatchga.

**Nega aynan Koson:** Shaharda hamma bir-birini taniydi. "Aka, o'zingiz kelasizmi?" — bu allaqachon
telefonda bo'layotgan gap. Uni tizimga kiritamiz.

**Bugungi holat:** `clients` tomonida VIP/blacklist/preferred endpointlari **bor**
(`operator.controller.ts:132-160`), lekin dispatch ularni **ishlatmaydi**.

**Nega moat:** Bu ikki tomonlama qulf — mijoz ham, haydovchi ham bir-biriga bog'lanadi.
Haydovchi ketsa mijozini yo'qotadi; mijoz ketsa haydovchisini.

**Raqam:** qabul foizi ↑ · takroriy mijoz ↑
**Narx:** S

---

# 5. UYG'OTISH MASHINASI — 307 uxlab yotgan haydovchi

**Nima:** Ro'yxatda **553 haydovchi**, lekin **307 tasi hech qachon buyurtma olmagan**, va 3 kunda
atigi **147 tasi** haydagan. Bu — **sotib olinmaydigan ta'minot zaxirasi**. Ular allaqachon
sizning bazangizda, telefonlari bilan.

**Bugungi holat:** A'da **jonli broadcast dvigateli** bor va **aynan haydovchilarni** target qila
oladi (`notifyDriversRefresh.ts:20`), kunlik cheklov + tinch soatlar + blok-hisobi bilan
(`notifyService.ts:10-24`). Obzvon CRM ham jonli (`DriverCall`, status/callback/callCount).

**Qilinadigan ish:** segmentlangan uyg'otish — "hech qachon olmaganlar" · "30 kun yo'qolganlar" ·
"faqat ertalab ishlaydiganlar". Har to'lqin **o'lchanadi** (nechtasi onlayn bo'ldi, nechtasi safar
qildi). Birinchi safarga kafolat.

**Nega moat:** Raqib Kosonga kelsa, **nol haydovchi** bilan keladi. Sizda 553 ta telefon raqami va
ular bilan gaplashish tarixi bor.

**Raqam:** **onlayn mashina 16.5 → 25+** (asosiy bog'lovchi cheklov)
**Narx:** S (dvigatel tayyor)

---

# 6. KOSON ↔ QARSHI — o'rindiq savdosi

**Nima:** Shaharlararo yo'nalishда **o'rindiq bo'yicha** sotish: 4 o'rin, to'lgach jo'naydi,
narx belgilangan.

**Nega aynan Koson:** Viloyat markazi 40 km — bu shahar ichidagi 1 700 so'mlik safardan
**10-20 barobar qimmat** oqim. Va u bugun **umuman sizniki emas** — bekatdagi tanishlar oladi.

**Bugungi holat:** A'da **10 ta model tayyor** — `IntercityTrip`, `IntercityBooking`,
`IntercityCommissionDebt`, `IntercityDriverPenalty`, `IntercityRefund`, `IntercityWaitEntry`…
**Ega ataylab o'chirgan** (2026-07-23: "bu keyinchalik qilinadigan loyiha"). B'dagi versiya
79 qatorlik stub va **himoyasiz endpointlari bor**.

**Qilinadigan ish:** A'dagi to'liq modelni yoqish (flag), o'rindiq to'ldirish + kutish navbati.

**Nega moat:** Bir marta "Koson→Qarshi 08:00, 2 o'rin bor" ko'rinadigan joy bo'lsangiz — bekat
o'z-o'zidan sizga ko'chadi.

**Raqam:** o'rtacha chek ↑↑ (yangi daromad qatlami)
**Narx:** M (model tayyor, faqat yoqish+to'ldirish)
**⚠️ Ega qarori:** siz buni ataylab o'chirgansiz — qayta ochamizmi?

---

# 7. KOMISSIYA ZINAPOYASI — mukofot naqd emas, komissiya

**Nima:** Ko'p ishlagan haydovchining **komissiyasi tushadi** (masalan 2000 → 1500 → 1000 so'm).
Pul **chiqmaydi** — faqat olinmaydi.

**Nega bu eng arzon rag'bat:** 1 700 so'm/safar marjada naqd bonus berish — o'z-o'zini yeyish.
Komissiya chegirmasi esa haydovchi uchun **xuddi shunday his qilinadi**, lekin kassadan pul
chiqmaydi. DiDi/99/Yandex shu modelga kelgan.

**Bugungi holat — bu eng kam baholangan aktiv:** A'da **jonli, ishlab turgan pul yo'li bor** —
`payDebtWithCoins` (`driverDebtService.ts:71`) → `addDriverPayment` (`client.ts:507`) haydovchining
**haqiqiy kas balansiga yozadi**, idempotent kalit, xato bo'lsa aniq qaytarish, noma'lum xatoda
qo'lda tekshiruvga chiqarish bilan. Ya'ni **kanal allaqachon prodda ishlaydi**.
B tomonida esa `incentive_rules`/`incentive_progress` jadvallari bor, lekin HTTP qatlami
**butunlay o'lik** (`incentives` moduli — 7 endpoint, **0 chaqiruvchi**).

**Raqam:** onlayn soat ↑ · haydovchi ushlab qolish ↑ · **naqd xarajat 0**
**Narx:** M

---

# 8. BIR VAQTDA TAKLIF + ADOLAT

**Nima:** ① Bir buyurtma **3-5 haydovchiga bir vaqtda** (birinchi qabul qilgan yutadi)
② uzoq/foydasiz podachani **jazosiz o'tkazish** ③ kartada "+N qabul / −M skip" oqibatini ko'rsatish.

**Bugungi holat:** dispatch **bittalab, ketma-ket** — 5 urinish × 15s = **75 soniya**
(`dispatch.service.ts`, o'lchandi). Bugun radiusni bosqichli qildim (3→5→8→12 km), lekin
ketma-ketlik qoldi.

**Nega:** Radning **56.5% — haydovchi radi**. Ketma-ket so'rashda bitta odamning "yo'q"i butun
buyurtmani sekinlashtiradi. Adolatsiz jazo esa — haydovchini offline'ga haydaydigan **№1 sabab**.

**Raqam:** **rad 21.5% → ~12%** · tayinlash vaqti 75s → ~15s
**Narx:** M
**⚠️ Ega qarori:** broadcast'da qolgan haydovchilar "kech qoldingiz" ko'radi. Rozimisiz?

---

# 9. POCHTA — bir mashinada ikki daromad

**Nima:** Hujjat/paket tashish: Koson ichida va Koson↔Qarshi. **Xuddi o'sha haydovchi, xuddi o'sha
safar.**

**Nega aynan Koson:** Kichik shaharda hujjat yuborish — real va doimiy ehtiyoj (bank, notarius,
viloyat idorasi). Bugun buni tanish orqali qilishadi.

**Bugungi holat:** A'da buyurtma-kartasi mashinasi **to'liq tayyor va jonli**: holat mashinasi
`pending→accepted→delivering→delivered`, **SLA sweep**, **ETA va'dasi**, naqd/oldindan bo'linishi
(`MarketOrder`, `marketOrderService.ts:173`). ⚠️ **Yagona yetishmayotgani — "kim olib boradi"**:
hozir sotuvchi o'z qo'li bilan eltadi, dispatchga **hech qanday ulanish yo'q**. Ya'ni bizga
faqat **aktyorni ulash** qoldi.

**Nega moat:** Raqib faqat odam tashiydi. Siz bitta safardan ikki marta pul olasiz.

**Raqam:** haydovchi daromadi ↑ (→ onlayn qolish ↑) · yangi daromad qatlami
**Narx:** M

---

# 10. OPERATOR KO'ZI — qo'ng'iroqni 60s dan 15s ga

**Nima:** Qo'ng'iroq kelganda operator ekranida **darhol**: kim qo'ng'iroq qilyapti · oxirgi 3 ta
manzili · "yana o'sha yerdan" **bitta tugma**.

**Nega aynan bu:** Buyurtmalarning **89.4% — telefon orqali**. Bu sizning eng katta kanalingiz va
raqibning eng kuchsiz joyi (Yandex'da operator yo'q). Har qo'ng'iroqdan 30 soniya tejash =
oyiga **~15 soat** operator vaqti.

**Bugungi holat:** endpointlar bor (`operator/client/lookup`), lekin ① taxta ochilganda
**yuklanmasdi** (bugun tuzatdim) ② "haydovchi tayinlash" va "bekor qilish" tugmalari **404**
edi (bugun tuzatdim) ③ har 15 daqiqada **qayta login** so'rardi (bugun tuzatdim).
Qolgani: qo'ng'iroq → ekran, va bitta bosishli takror.

**Nega moat:** Telefon kanali — **odat**. 1067 ni terish Kosonda refleks. Uni tezroq va aqlliroq
qilsangiz, odat mustahkamlanadi; ilovaga ko'chirish esa **keyin**, o'z-o'zidan bo'ladi.

**Raqam:** operator vaqti ↓↓ · rad ↓ (tez javob) · sig'im ↑
**Narx:** S–M

---

# TARTIB — nima avval

| # | Funksiya | Narx | Nega shu tartibda |
|---|----------|------|-------------------|
| 0 | **O'lchov** | S | 6 asosiy raqam hozir umuman o'lchanmaydi. Busiz qolgani — taxmin |
| 1 | **KOSON TILI** | M | Moatning o'zagi, va kod A'da tayyor |
| 2 | **OPERATOR KO'ZI** | S–M | 89.4% kanal, eng tez qaytim |
| 3 | **UYG'OTISH** | S | Ta'minot — bog'lovchi cheklov. Dvigatel tayyor |
| 4 | **MAHALLA DISPATCH** | S | Arzon, o'lik apparatni tiriltiradi |
| 5 | **BROADCAST + ADOLAT** | M | Radning yarmiga uriladi *(ega qarori)* |
| 6 | **MENING HAYDOVCHIM** | S | Ikki tomonlama qulf |
| 7 | **KOMISSIYA ZINAPOYASI** | M | Naqdsiz rag'bat, rail jonli |
| 8 | **DOIMIY SAFAR** | M | Eng barqaror daromad |
| 9 | **KOSON↔QARSHI** | M | Yangi daromad qatlami *(ega qarori)* |
| 10 | **POCHTA** | M | Bir safardan ikki daromad |

---

# EGA HAL QILISHI KERAK

1. **Shaharlararo** (#6) — siz uni 2026-07-23 da ataylab o'chirgansiz. Qayta ochamizmi?
2. **Broadcast** (#8) — bir buyurtma bir necha haydovchiga. Haydovchilar "kech qoldingiz"
   ko'radi. Rozimisiz?
3. **Firebase** — #8 va uyg'otish push'i uchun kerak. Ochasizmi?
4. **Pochta** (#9) — bu yangi biznes yo'nalishi, faqat funksiya emas. Kirasizmi?

---

# NIMA QILMAYMIZ (ongli)

- **inDrive savdolashuvi** — manzil majburiy, bizda manzil yo'q → tuzilmaviy imkonsiz
- **Batching/pooling** — kuniga 63 buyurtmada partiya yig'ilmaydi
- **RL dispatch** — o'n millionlab qaror kerak, bizda 63
- **Xarita-ignasi asosiy yo'l** — Kosonda "hech qachon" ishlatiladi
- **Mijozga metrli ETA** — soxta aniqlik birinchi xatoda ishonchni o'ldiradi
