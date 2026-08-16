# 🎟 KOSON O'YINI — KARTA TIZIMI REJASI

_2026-08-11 · 8 mustaqil agent · har raqam koddan yoki hisobdan_

---

## 0. AVVAL — IQTISOD. Bu ko'rinishda tizim ISHLAMAYDI

Hisobni ikki marta yurgizdim (agent + o'zim, mustaqil):

```
Sovg'a uchun kerak bo'ladigan JAMI ball = 3 × narx ÷ 20   (darajadan QAT'I NAZAR)
500 000 so'mlik sovg'a → 75 000 ball
```

| Mijoz | Bir oyda | Ball |
|---|---|---|
| Median (3,6 safar) | | **191** |
| Kuniga bitta (30 safar) | | **1 115** |
| Eng arzon karta (600 ball) uchun kerak | | **16 safar** |

**Real bozor (2026-iyul):** 1956 buyurtma/oy, ilova orqali **10,6%** ≈ 208.

### Xulosa
- Median mijoz **eng arzon kartani ham ololmaydi** — 191 ball, kerak 600.
- A'zolarning **~85%i** bir mavsum yurib, bir marta ham karta olmay, hamma ballini yo'qotadi.
- 500 000 so'mlik sovg'a butun shahar ballining **4 barobarini** talab qiladi → `minSellPct=100` da **hech qachon o'ynalmaydi**.
- Jonli SEED katalog bundan ham yomon: eng arzon karta **5 300 ball**, eng qimmati **450 000 ball** (≈12 800 safar). Ya'ni bugungi vitrina **100% o'lik zaxira**.

### Tuzatish — raqam bilan

| # | Nima | Hozir | Bo'lsin |
|---|---|---|---|
| 1 | Karta darajalari | 600 / 1200 / 2400 / 3600 | **200 / 400 / 700 / 1000** |
| 2 | Real ball shifti | 4 000 | **2 000** — va panel undan qimmatini **rad etsin** (hozir faqat ogohlantiradi) |
| 3 | Ochiq katalog qiymati | cheklanmagan | **≤ 250 000 so'm**, bitta sovg'a 30 000–60 000 so'm |
| 4 | SEED katalog | vitrinada | bayroq yoqilishidan **oldin navbatga** |
| 5 | Mavsum oxirida ball | 0 ga tushadi | qoldiqning **50%i keyingi mavsumga** (aks holda 85% umuman hech narsa ololmaydi) |

⚠️ **1–4 bajarilmasa qolgan hamma narsa qog'ozda qoladi.**

---

## 1. KARTA SHAXSI

**Format: `KO-421-308-7561`** — 10 xonali, faqat raqam.

- Ichkarida `gno` hisoblagichi **qoladi** (atomik, isbotlangan), lekin **ichki** bo'ladi.
- Ko'rinadigan raqam = `gno` ning **maxfiy kalitli Feistel almashtirishi** + **Luhn** nazorat raqami.
- To'qnashuv **0** (biyeksiya) · tartib **yashirin** · Luhn xatoning 100% ini **klientda** tutadi.
- **Nega harf yo'q:** karta jonli efirda **og'zaki o'qiladi**. «7-Q-4-M-8-3» Kosonda o'qilmaydi; raqam telefon kabi uchlik bo'lib o'qiladi.

**Qachon yaratiladi:** siz yuklaganda emas — **navbatdan ochilganda**. Sabab: 100+ sovg'a oylab yopiq turadi, o'chirilgani yetim raqam qoldiradi.
**Yutuq:** butun ro'yxat sotuvdan **oldin** mavjud → tiraj hash'ini **oldindan** e'lon qilish mumkin (hozirgi «oxirida muzlatish» dan kuchliroq isbot).

**Egaga bog'lash:** langar — `memberId`. Zarb lahzasidagi ism/rasm **nusxa** bo'lib muzlatiladi.
Mijozning o'z ekranida — jonli avatar. Bayonnomada va tirajda — **nusxa**. Sabab: muzlatilgan ro'yxatda bugun «Aziz», ertaga «Bekzod» bo'lsa butun ochiq-isbot modeli qulaydi.

**Ochiq tekshiruv sahifasi:** `birjoy.online/karta/<kod>`, parolsiz. Karta · sovg'a · egasi (qisqartirilgan ism + avatar) · holat. Telefon va familiya **hech qachon**. Sabab: yagona real soxtalashtirish yo'li — skrinshot.

**⚠️ Hajm qoidasi:** per-karta ma'lumot `oyin:catalog` ichiga **hech qachon** tushmaydi. 100 000 karta u yerda = bitta qatorda 3 MB, `JSON.parse` 25–40 ms, ilovaning **har ochilishida**. Shift: bitta AppState qatorida ~200 KB.
**Yangi Prisma jadvali v1 uchun kerak emas.** Chegara: ≥50 000 karta yoki tiraj ro'yxati >300 ms.

**Migratsiya:** `gno` yozuvda qoladi, `code = FPE(gno)` determinstik, tekshiruv sahifasi eski `№729481` ni ham qabul qiladi.

---

## 2. QAYTARISH SIYOSATI

**Bugungi holat:** karta **abadiy emas** — `cancelOwnTicket` bor va `minSellPct=100` bo'lgani uchun sovg'a to'lguncha bekor qilish ochiq. Bu to'lish-qulfini sindiryapti: yangi sovg'a ochilsa kartalar eskisidan ko'chib ketadi → ommabop bo'lmagan sovg'a **hech qachon to'lmaydi**.

**Tavsiya:**
1. **60 daqiqalik sovuqlik oynasi** — faqat barmoq xatosi uchun. Arbitraj oynasi ochmaydi (yangi sovg'a kunlar keyin ochiladi).
2. **Keyin abadiy.** Karta yagona omon qoladigan narsa — demak eng qat'iy narsa bo'lishi kerak.
3. **Klapan egada:** sovg'ani siz o'chirsangiz/navbatga qaytarsangiz — o'sha sovg'aning hamma kartasi avtomatik qaytadi.

**Teselli ball — RAD** (yutmaganga qisman qaytarish): sizning «yutmagan karta butunlay yonadi» qoidangizga zid va 3× kafolatni 42% ga ko'taradi.

> **Bitta jumla bilan: ball — sarflanadigan, karta — sarflangan.**

---

## 3. SOVG'A → KARTALAR EKRANI

```
┌ 🖼 Konditsioner · 400 ball ────────────────┐
│ 63/100 olindi · 37 bo'sh   ▰▰▰▰▰▰▱▱▱▱     │
├────────────────────────────────────────────┤
│  ⬜1  🅐2  ⬜3  🅜4  ⬜5  🅐6              │
│  🟪SIZ ⬜8  🅢9  ⬜10 ⬜11 🅐12             │
├────────────────────────────────────────────┤
│ Tanlandi: №8   [ 🎟 №8 ni olish ]          │
│                [ 🎲 Menga farqi yo'q ]     │
└────────────────────────────────────────────┘
```

- Bo'sh katak — oq + qalin raqam. Band — egasining rangli harf-doirasi, tagida «Aziz K.».
- Telefon, to'liq familiya, `memberId` **hech qachon**.
- To'lgan sovg'a varag'i **baribir ochiladi** (ega talabi) — eng kuchli ijtimoiy isbot.

**Karusel RAD ETILDI:** kontentning 80% i yashirin, gorizontal imo vertikal aylanish bilan urishadi, to'lish holatini butun to'plam bo'ylab ko'rsata olmaydi. Ustiga ochiq sovg'a ≤10.

**O'rniga — yopishqoq chiplar:** `[⚡ Ball yetadi] [🎯 Bir kartali] [🔥 Tez to'ladi] [✅ To'lganlar]`
Standart tartib — **«ball yetadi» tepada**. Mijozning yagona savoli: «men nimani ola olaman?»

**Tanlov bor, majburiy emas** — «🎲 Menga farqi yo'q» tasodifiy bo'sh raqamni oladi.

### 🔴 Aniq raqam tanlash yangi qo'riq talab qiladi
`reserveSoldSlot` — sanagich. Bekor qilingandan keyin sanagich pasayadi va **keyingi xaridor o'sha raqamni qayta oladi** (hozir ham mavjud, ko'rinmaydi). Yechim: har o'rin uchun alohida qator, `ON CONFLICT DO NOTHING`.
Rad javobi: «№8 ni sizdan bir soniya oldin oldilar. **Ballingiz tegilmadi** — mana bo'sh: №11».

---

## 4. ⚠️ BIR DONA KARTALI SOVG'A — model teskari

```
kartalar soni = ⌈ 3 × narx ÷ (20 × karta_balli) ⌉  = 1  ⟹  narx ≤ 20×Y/3
```

Yangi darajalar (200/400/700/1000) bilan: **narx ≤ 1 300 … 6 700 so'm**.

**Bog'liqlik teskari:** kartasi **ko'p** = sovg'a **qimmat**; kartasi **kam** = sovg'a **arzon**.
3 mln so'mlik telefon bitta kartada = 450 000 ball = real shiftdan **225 barobar** yuqori.

**Demak bir kartali sovg'a — kafolatlangan KICHIK sovg'a.** Omad umuman yo'q → qimordan eng uzoq shakl.

**Ikki qalqon:**
1. Sovg'a **BirJoy xizmati** bo'lsin — «10 ta bepul safar». So'mda emas, **donada**; bizga xarajati kam, safar oqimi o'sadi.
2. Alohida `oyinSingleCardMultiplier` knobi (m=2 → ship 2×, m=1.5 → 2.7×). Xarajat ulushi 33% dan 67% gacha ko'tariladi — **ega qarori**.

**Poyga adolatsizligi — tuzatilishi shart:** `autoOpenPrizes` hozir `buyTicket` ICHIDA chaqiriladi → navbatni ochgan xaridor yangi sovg'ani **birinchi bo'lib biladi**. Bu poyga emas, insayder. Ochish xarid yo'lidan chiqarilib sweep'ga o'tkaziladi + **24 soatlik ko'rish oynasi**.

---

## 5. QULF — bahona emas, arifmetika

200 000 so'mlik sovg'a = 30 000 ball to'lishi uchun. Xalq qo'lida ~18 000 sarflanadigan ball bor.

| Ochiq sovg'a | Natija |
|---|---|
| **1000 ta** | har biriga ~18 ball → to'lgan **0 ta** → tiraj yo'q, g'olib yo'q |
| **4–6 ta** | ball to'planadi → **haqiqiy g'olib** |

**Muhandislik topilmasi:** hozirgi sig'im qoidasini **ekranga chiqarib bo'lmaydi** — odam karta olganda hisoblagich **orqaga ketadi**.

**Ko'rinadigan qoida boshqa:** «ochiq sovg'alardan biri to'lsa — keyingisi ochiladi». Monoton, sanaladi, mijoz **o'zi siljita oladi**.

```
🔒 Ochilishi uchun ochiq sovg'alardan biri to'lishi kerak
   eng yaqini: «Konditsioner» — 38/50 karta        [bosiladi → o'sha sovg'aga]
```

⛔ Taqiq: «Tez orada» · «Kutib turing» · «Sizga ball yetmadi» (yolg'on — sabab tizimli, shaxsiy emas) · sana yo'q taymer.

**Ko'rinish uch qatlam:** ochiqlar (to'liq karta) · keyingi 3 tasi (qulfli, rasmi **ko'rinadi**) · qolgani faqat son («📋 Navbatda yana 993 ta»).

---

## 6. TIRAJ VA G'OLIB

**Online tiraj: kanal + matematika, ikkalasi birga.** Ilova ichidagi animatsiya **yolg'iz taqiqlanadi** — «dastur tanladi» = «ega tanladi».

**1. VA'DA** (to'lgan zahoti) — kanalga: to'liq karta ro'yxati + SHA-256 muhri. `hashCards` allaqachon bor.
**2. OCHILISH** (tiraj vaqti) — oldindan e'lon qilingan **Bitcoin blok hash'i**:
```
g'olib = ro'yxat[ int(blockHash, 16) mod ro'yxat_uzunligi ]
```
Bloger efirda hash'ni ochadi, kalkulyatorda hisoblaydi, raqamni o'qiydi.

**Tiraj vaqti:** to'lgandan keyingi birinchi **yakshanba 20:00**. Oraliq ≥48 soat.

**G'olibga:** «🏆 SIZ YUTDINGIZ! «{sovg'a}» — karta №{kod}. {N} ta karta ichidan sizniki chiqdi. Isbot: `{hash}`. Ega 24 soat ichida qo'ng'iroq qiladi.»

**Yutmaganga** (eng nozik lahza — «Omadingiz kelmadi» **taqiq**):
«🎬 Tiraj bo'ldi. G'olib: №{kod}, Aziz K. Sizning №{kod} kartangiz o'ynadi — bu safar chiqmadi. {N} ta karta edi, siz halol qatnashdingiz. [tekshirish] 🎁 Yangi sovg'a ochildi.»

**Nizolar:** g'olib 72 soat javob bermasa → ochiq e'lon → yana 72 soat → **qayta o'ynaladi** (o'sha muzlatilgan ro'yxatdan, yangi blok hash'i bilan). Bu qoida **oldindan** yozilgan bo'lishi shart.

### 🔴 O12 — tiraj muzlatishi GLOBAL
`FREEZE_KEY = "oyin:freeze"` bitta kalit; `buyTicket` uni sovg'adan qat'i nazar tekshiradi → bitta tiraj **butun o'yin xaridini** to'xtatadi. Minglab sovg'ada do'kon doim yopiq bo'ladi. **Per-prize freeze shart.**

### Eng arzon, eng katta ta'sir
1. **`result` ni `myTickets` javobiga qo'shish** — ma'lumot **bazada bor**, uzatilmaydi.
2. **G'olibga push** — hozir faqat adminlarga alert.

Bu ikkisisiz butun tiraj mijoz uchun **ko'rinmas**.

---

## 7. MAVSUM YAKUNI

**Karta olish T-48 soatda yopiladi** — butun jadval shundan chiqadi.

| Vaqt | Kimga | Nima |
|---|---|---|
| T-7 kun | balli bor hammaga | «{ball} ball — mavsum bilan yonadi. {sovg'a} uchun yana {N} kerak.» |
| T-3 kun | kartaga yetadiganlarga | «Karta olish 24 soatdan keyin yopiladi.» |
| T-49 soat | kartaga yetadiganlarga | «Oxirgi soat.» |
| T-24 soat | ⛔ ball haqida hech narsa | faqat kartasi borlarga: «Kartalaringiz qo'yildi.» |

**T-24 va T-1 da «ballingiz yonadi» yubormaymiz** — odam hech narsa qila olmaydi. Sof tashvish.

**Yakun ketma-ketligi:** `sale` → **`snap`** → `draw` → `carry` → `burn` → `notify`.
Har qadam `create` markeri bilan (upsert emas) → tik ikki marta yursa ikkinchisi no-op.
**`snap` eng muhimi** — usiz orqaga yo'l yo'q.

**Ball yonishi ko'rinadigan HODISA bo'lishi shart:**
«🏁 Mavsum yakunlandi · Sizda 2 400 ball bor edi — mavsum bilan yondi · **3 ta kartangiz saqlandi**.»
Balli 0 bo'lganga yuborilmaydi.

**«Mavsumlar orasi» holati kerak** — siz yangi mavsum ochmasangiz ball abadiy muzlaydi va ekranda yolg'on raqam turadi.

### 🔴 Push tezlik nazorati YO'Q
`pushSend` **429 ni jim yutadi**. Minglab pushni bitta tikda yuborish = xabar yo'qoladi, hech kim bilmaydi.
**Navbat kerak:** har 15 daqiqada ≤300 ta. 3 000 a'zo ≈ 2,5 soat → ogohlantirish oynasi ±4 soat.

---

## 8. O'RGATISH

**Tanlangan matn** («kuyadi/yonadi/yo'qoladi» so'zlari taqiqlandi — jazo ohangi):

> **Ball mavsum ichida yashaydi.**
> Mavsum tugaganda ball hisobi **hammada barobar** noldan boshlanadi — lekin kartaga aylantirgan ballingiz kartada saqlanib qoladi.
> Ya'ni ball yo'qolmaydi: u **yo kartaga aylanadi, yo mavsum bilan yopiladi. Tanlov sizda.**

**Uch savolga bir jumla:**
- Ball — taksi chaqirganingiz uchun beriladigan yig'im.
- Karta — ball evaziga oladigan sovg'a talonchasi; mukofot kunida o'ynaydigan joyingiz.
- Ball shu mavsum ichida yashaydi.

**Kartaning ichida (doim ko'rinadi):**
```
🎟  Bu karta nima beradi — mukofot kunida «{sovg'a}» uchun o'ynaydigan bitta joy.
📺  Qachon o'ynaladi — {sana}, Telegram jonli efirida.
🤝  Chiqmasa — karta yopiladi, ball qaytmaydi. Ammo {minSell} ta karta yig'ilmasa
    sovg'a umuman o'ynalmaydi — o'shanda kartani bekor qilib ballni qaytarasiz.
```

**Birinchi kirish — 5 karta** (`taxiStory.tsx` naqshi, CSS animatsiya, bundle 0 KB):
① Har safar ball olib keladi ② Ball kartaga aylanadi ③ Sovg'a jonli efirda ④ **Ball mavsum ichida yashaydi** ⑤ Birinchi safar → **[Taksi chaqirish]**

**Ekrandan OLIB TASHLANADI:**
- **«Imkoniyat %»** — kun sayin **tushadi**, odam aldangandek bo'ladi. O'rniga «Sizda 3 ta karta».
- Bitta kartada narx uch marta · «24 oy tarix» bandi · «STIR»/«minSell» atamalari kartochkada.

**Ball jurnali:** sarlavha «🧾 Ball hisobingiz — {mavsum}», tepasida **yig'ilgan / sarflangan / balans**; balans raqamining o'zi shu varaqni ochsin.

---

## 9. SUIISTE'MOL — eng xavfli 4 tasi

| Hujum | Oson? | To'siq |
|---|---|---|
| **`adminAdjustBall` shiftsiz** — bitta bosish bilan +75 000 ball | admin uchun 1 bosish | har tuzatishga shift (≤2× realistik) + mavsum jami + `drawExport`da bayroq |
| **autoOpen snayperi** — oxirgi kartani olib navbatni o'zi ochadi | oson | ochish `buyTicket`dan chiqarilsin → sweep + 24 soat ko'rish oynasi |
| **Bekor qilish tsikli** — `sold<minSell` da ball doim qaytadi | juda oson, cheksiz | 60 daq sovutish + mavsumda N marta + jurnal |
| **Hikoya-fermasi** — 300 ball, **safarsiz** | oson | safarsiz a'zo `circulatingBall` dan chiqarilsin |

---

## 10. EGA QARORLARI (bularsiz boshlanmaydi)

| # | Savol | Tavsiya |
|---|---|---|
| ① | Karta darajalari 600/1200/2400/3600 → **200/400/700/1000** ga tushsinmi? | **Ha** — busiz 85% mijoz hech qachon karta ololmaydi |
| ② | Ochiq katalog ≤250 000 so'm bilan cheklansinmi? | **Ha** — son emas, so'm cheklanadi |
| ③ | Qaytarish: **60 daqiqa**, keyin abadiy? | **Ha** |
| ④ | Mavsum oxirida ball qoldig'ining **50%i** keyingi mavsumga o'tsinmi? | **Ha** — aks holda birinchi yakun kechasi ommaviy ranjish |
| ⑤ | Bir kartali sovg'a: **xizmat** (bepul safar) shaklidami? Ko'paytirgich? | Xizmat shaklida, m=3 saqlansin |
| ⑥ | Tiraj: **yakshanba 20:00**, kanalda jonli, Bitcoin blok hash'i bilan? | **Ha** |
| ⑦ | Birinchi to'lqinda nima? | O1 (yolg'on matn) → O11 → O12 → iqtisod raqamlari |

---

## 11. ISH TARTIBI

**0-to'lqin — bularsiz qolgani zarar keltiradi**
1. **O1** — ilovadagi 6 ta yolg'on matn (server ballni kesadi, ilova «muddatsiz» deydi)
2. **O11** — eski karta bekor qilinsa ball qaytmaydi, sanoq kamayadi
3. **O12** — global freeze → per-prize
4. **Iqtisod raqamlari** — darajalar, shift, katalog chegarasi, SEED navbatga

**1-to'lqin — tiraj mijozga ko'rinadigan bo'ladi**
5. `result` → `myTickets` · 6. G'olibga push · 7. Ochiq g'oliblar + tekshiruv sahifasi

**2-to'lqin — karta shaxsi**
8. `code` maydoni + Feistel+Luhn · 9. `oyin:cards:<key>` oldindan zarb · 10. per-slot band qilish · 11. tekshiruv sahifasi

**3-to'lqin — ekran va o'rgatish**
12. Kartalar panjarasi + chiplar · 13. 5 kartali story · 14. Karta ichidagi matnlar · 15. Qulf matni + uch qatlam

**4-to'lqin — mavsum yakuni**
16. `seasonTick` (ogohlantirishlar + qadamlar + snapshot) · 17. Push navbati · 18. «Mavsumlar orasi» · 19. Ega paneli

---

# 12. KARTA = XOTIRA — ega materialidan ajratilgan ish ro'yxati

_Manba: ega yozuvi (karta konsepsiyasi, 3 qatlam, kolleksiya, xotiralar, komentariya)._

## 12.1 QURILISHI KERAK — yangi

| # | Nima | Nimani talab qiladi | Xavf |
|---|---|---|---|
| **K1** | **Karta sahifasi — ochiladi.** Raqam · sovg'a (nom+rasm) · egasi · olingan sana · holat · egasining qaydi. Uch joydan ochiladi: «Kartalarim», sovg'a panjarasi, tashqi havola. | Yangi ekran + `GET /api/oyin/card/:code` | — |
| **K2** | **Egasining o'z qaydi («xotira»).** Erkin matn: «BirJoydagi birinchi kartam ❤️». | Matn maydoni (≤140 belgi) · tahrirlash · o'chirish · **moderatsiya** | 🟠 moderatsiya yuki |
| **K3** | **Qayd maxfiyligi.** `🔒 Faqat men` / `🌐 Hamma ko'radi`. **Standart — faqat men.** | Bitta bayroq | — |
| **K4** | **Avatar ko'rinishi — roziligi bilan.** Standart: faqat ism (qisqartirilgan). Avatar — mijoz yoqadi. | Bitta bayroq + `getUserProfilePhotos` (naqsh `driverPhotoService.ts:23` da bor) | 🟠 kichik shahar |
| **K5** | **Karta tirajdan keyin ham QOLADI.** Yutgan: `🏆 Yutuqli karta`. Yutmagan: kolleksiyada holati bilan qoladi. | `result` maydoni (**bazada allaqachon bor**, uzatilmaydi — O5) | — |
| **K6** | **«Mening kartalarim» → kolleksiya.** «7 ta karta» · panjara · mavsum bo'yicha guruh. | Mavjud tabni qayta chizish | — |
| **K7** | **«Xotiralar» eslatmasi.** «8 oy oldin birinchi kartangizni olgansiz.» | `seasonTick` ichida · push byudjetiga bo'ysunadi | 🟠 spam chegarasi |
| **K8** | **Sovg'alar tabida komentariya.** | Yangi jadval · moderatsiya · tezlik chegarasi · shikoyat · bloklash | 🔴 eng og'ir |
| **K9** | **«Abadiy» so'zini huquqiy yumshatish.** «Bu karta akkauntingizga biriktirilgan. Egasi o'zgartirilmaydi va karta qayta berilmaydi. Akkaunt o'chirilsa karta arxivlangan holatda qoladi.» | Faqat matn | — |

## 12.2 QURILMAYDI — sabab bilan

| Nima | Nega yo'q |
|---|---|
| **Qo'lda chizilgan imzo** | Imzo — shaxsni tasdiqlovchi artefakt. Uni ilovada saqlash va (hatto ixtiyoriy) ommaviy qilish real xavf, marketing qiymati esa kichik. Ega materialining o'zi ham «ehtiyot bo'lardim» deydi. |
| **Avatar standart ommaviy** | Kichik shaharda «kim nima yutdi» ni hamma ko'rishi hasad va bosim yaratadi. Ruxsat bilan — ha; standart — yo'q. |
| **Telefon, to'liq familiya, `memberId`** | Hech qachon. |

## 12.3 ⚠️ Tartib — bu qatlam halqadan KEYIN

Gamification tahlili aniq ko'rsatdi: karta «noyob mulk» bo'lishi motivatsiyani egalikka ko'chiradi, **lekin agar kartaning yagona vazifasi tirajda o'ynash bo'lsa — bu niqoblash bo'ladi.** 3 oydan keyin odamda «4 ta chiroyli raqam bor, ular hech nima qilmaydi» qoladi.

Shuning uchun K1–K9 dan **oldin** halqa yopilishi shart:
1. `result` → `myTickets` + g'olibga push (**~20 satr**) — busiz tiraj mijoz uchun umuman sodir bo'lmaydi
2. Karta darajasi 600 → 200 — birinchi karta 17 safar o'rniga **6 safar**
3. «Imkoniyat %» olib tashlansin, o'rniga **«yana 3 safar»** (foiz kuniga 0,7% siljiydi — bu sezish chegarasidan past va harakatsizlikni o'lchab beradigan asbobga aylanadi)

Va kartaga **tirajdan mustaqil qiymat** berilsa — u haqiqiy mulkka aylanadi. Masalan: kartani ko'rsatgan mijozga bepul yetkazib berish, yoki ko'rinadigan maqom. Aks holda u faqat tuyg'u.

---

# 13. K8 — Sovg'alar tabida komentariya: REJA + DoD

_2026-08-16 · kodlashdan OLDIN yozilgan, TASDIQ kutmoqda (CLAUDE.md protokoli)._

K8 ro'yxatdagi yagona qurilmagan band (K1–K7, K9 — tayyor, deploy qilingan). Plan o'zi buni
🔴 **"eng og'ir"** deb belgilagan — sabab yangi jadval + moderatsiya + tezlik chegarasi + shikoyat +
bloklash BIRGALIKDA. Quyida — mavjud kodda ALLAQACHON ishlayotgan xuddi shu besh narsaning
naqshini (`ClassifiedAd`/`AdReaction`/`ProductReview`) qayta ishlatib qurilgan reja.

## 13.1 Qayta ishlatiladigan naqshlar (yangidan o'ylab topilmaydi)

| Ehtiyoj | Qayerda ALLAQACHON bor | Naqsh |
|---|---|---|
| Moderatsiya holati | `ClassifiedAd.status` (`classifiedService.ts:499-525`) | `pending → active → rejected`, admin `approve`/`reject`, status-guard = qo'sh-bosishdan himoya |
| Shikoyat (yangi jadvalsiz) | `ClassifiedAd.reports` + `reportAd()` (`classifiedService.ts:530-544`) | 1 shikoyat/user = AppState marker (`elonrep:<id>:<tgId>`), N=3 da avto-yashirish + moderatsiya navbatiga qaytarish |
| 1 sharh/kishi, qayta yuborish = tahrir | `ProductReview` (`schema.prisma:550-564`, `@@unique([productId, memberId])`) | Yangi qator EMAS, upsert |
| Tezlik chegarasi | `rateLimit(maxPerMin)` (`server.ts:213`, `/api/link/contact`da `rateLimit(6)` kabi 30+ marta ishlatilgan) | Middleware, yangi mexanizm shart emas |
| Admin navbati sahifasi | `Nazorat.tsx`/`Mukofotlar.tsx` (`packages/admin/src/oyin/`, `Konsol.tsx:30` dagi `OyinView` ro'yxati) | Yangi `OyinView` a'zosi + yangi fayl, mavjud konsolga qo'shiladi |

**Xulosa:** yangi jadval — ha (matn saqlanadigan joy shart), lekin moderatsiya/shikoyat/tezlik
uchun yangi MEXANIZM YO'Q — barchasi yuqoridagi to'rttasining qayta chaqiruvi.

## 13.2 ⚠️ Ega tasdig'i kerak bo'lgan qarorlar (kod yozishdan OLDIN)

Plandagi K8 qatori bitta jumla — quyidagilar mahsulot qarori, muhandislik emas, shu sabab
taxmin qilinmaydi:

1. **Kim komentariya qoldira oladi?** _Tavsiya: faqat shu sovrin uchun kamida bitta karta OLGAN
   (yoki olgan bo'lgan) a'zo_ — spam yuzasini butun mijozlar bazasidan haqiqiy ishtirokchilarga
   toraytiradi (plan o'zi belgilagan 🟠 spam xavfini kamaytiradi), tekshirish bepul
   (`allTicketRows()` allaqachon bor). Muqobil: hamma yoza oladi (kengroq, lekin spam xavfi yuqori).
2. **Moderatsiya: OLDINDAN (pending→admin ko'radi→active) yoki KEYIN (darhol active,
   shikoyat/N=3 yashiradi)?** _Tavsiya: KEYIN — `reportAd` naqshi._ Sabab: oldindan moderatsiya
   ega uchun doimiy navbat-yuki (yana bitta 24/7 ish), sekin (komentariya darhol ko'rinmaydi =
   engagement o'ladi). Xavfi: yomon so'z bir necha daqiqa jonli turishi mumkin — bu tavakkalni
   ega qabul qiladimi, aniq TASDIQ kerak (bu yuridik/obro' savoli, muhandislik emas).
3. **Komentariya uzunligi.** _Tavsiya: 140 belgi_ — K2 (egasining qaydi) bilan bir xil chegara,
   izchillik uchun.
4. **"Bloklash" qanday ko'rinishda?** _Tavsiya: faqat KOMENTariya huquqidan mahrum qilish_
   (`Member.banned` GLOBAL — botdan, safardan, o'yindan butunlay chiqarib yuboradi, bu yerga OShIQCHA
   qattiq), yangi ustun YO'Q — `oyin:commentban:<memberId>` AppState bayrog'i (K1-K7dagi avatar/
   qayd bayroqlari bilan bir xil naqsh).

**Bu uchtasi ("kim yoza oladi" / "oldin-keyin moderatsiya" / "bloklash og'irligi") TASDIQSIZ
kod yozilmaydi — CLAUDE.md DoD-protokoli qoidasi #2.**

**✅ EGA TASDIG'I (2026-08-16):**
1. **Kim yoza oladi — HAMMA** (karta egaligi sharti YO'Q). Demak spam himoyasi butunlay
   rate-limit + 1-komentariya/kishi/sovrin + shikoyat-hisoblagichga tayanadi (13.6 D2 shunga mos yangilandi).
2. **Moderatsiya — KEYIN + 3-shikoyat avto-yashirish** (tavsiya qilingan variant, qarshilik bildirilmadi — aniq inkor bo'lmagani uchun shu holicha qurildi; keyinroq "oldin" ga o'zgartirish mumkin, arxitektura buni to'sqinlik qilmaydi).
3. **Bloklash — HA, kerak.** `oyin:commentban:<memberId>` AppState bayrog'i (global `Member.banned` EMAS) — admin panelida yoqiladi/o'chiriladi.

## 13.3 Ma'lumotlar modeli — yangi jadval (1 ta, minimal)

```prisma
model OyinComment {
  id         Int      @id @default(autoincrement())
  prizeKey   String                                  // qaysi sovrin ostida
  memberId   Int
  authorName String                                  // yozilgan paytdagi ism-sharh (snapshot)
  text       String                                  // ≤140 belgi (server tekshiradi)
  reports    Int      @default(0)
  status     String   @default("active")             // active | hidden (shikoyat N=3) | removed (admin)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([prizeKey, memberId])                      // 1 komentariya/kishi/sovrin — qayta yuborish = tahrir
  @@index([prizeKey, status, createdAt])
}
```
Shikoyat uchun ALOHIDA jadval YO'Q — `oyin:commentrep:<commentId>:<memberId>` AppState marker
(`elonrep:` bilan bir xil naqsh). Migratsiya — CLAUDE.md qoidasi: **VPS'da, kod push'idan OLDIN**,
qo'lda (`prisma migrate diff` → o'qish → `prisma db push`).

## 13.4 Fayllar ro'yxati

| Fayl | Nima |
|---|---|
| `packages/server/prisma/schema.prisma` | `OyinComment` modeli (yangi) |
| `packages/server/src/services/oyinCommentService.ts` | **YANGI FAYL** — `oyinService.ts` allaqachon 4000+ qator, yana bitta subtizim uni yanada og'irlashtirmaydi. `postComment`/`myComment`/`listComments`/`deleteOwnComment`/`reportComment`/adminlar |
| `packages/server/src/api/server.ts` | `GET/POST /api/oyin/prize/:key/comments`, `DELETE /api/oyin/comments/:id`, `POST /api/oyin/comments/:id/report` (hammasi `requireUser`+`rateLimit`) + admin marshrutlar |
| `packages/shared/src/oyin.ts` | `OyinComment`, `OyinCommentListResponse`, `OyinPostCommentInput/Result`, admin turlari |
| `packages/miniapp/src/oyin.tsx` | Mukofotlar tabidagi sovrin kartasiga «💬 N ta fikr» kirish nuqtasi + yangi `sheet === "comments"` varag'i (mavjud `.oyk-note-edit` vizual tilidan) |
| `packages/miniapp/src/api.ts` | Yangi so'rov o'ramlari |
| `packages/miniapp/src/design/feat/oyk.css` | `.oyk-comment-*` — **yangi rang YO'Q**, mavjud `--oyk-*` tokenlar |
| `packages/miniapp/src/design/oyinDemo.tsx` | Demo mock handlerlar (backendsiz vizual QA) |
| `packages/admin/src/oyin/Komentariyalar.tsx` | **YANGI FAYL** — moderatsiya navbati (shikoyat qilinganlar) + bloklash tugmasi, `Mukofotlar.tsx`/`Odamlar.tsx` bilan bir uslub |
| `packages/admin/src/oyin/Konsol.tsx` | `OyinView` ro'yxatiga `"komentariya"` qo'shiladi |
| `packages/admin/src/oyin/Nazorat.tsx` | "🔔 Bugun nima qilish kerak" ro'yxatiga «N ta shikoyat qilingan komentariya» qatori (mavjud `Task{go:OyinView}` naqshi) |

## 13.5 Xavflar

| Xavf | Yumshatish |
|---|---|
| 🟠 Spam/troll toshqini | 13.2-band-1 (faqat karta egalari yozadi) + `rateLimit` + 1/kishi/sovrin unique-cheklov |
| 🟠 Haqoratli matn jonli ko'rinishi (KEYIN-moderatsiya tanlansa) | N=3 shikoyat = avto-yashirish (daqiqalar ichida, `reportAd` bilan bir xil tezlik) + admin istalgan payt `removed` qila oladi (shikoyat kutmasdan) |
| 🟡 Admin yuki | Faqat shikoyat qilinganlar navbatga tushadi (hammasi emas) — `elonlarSlaTick` kabi alohida SLA-eslatma **kerak emas** (hajm kichik boshlanadi, kerak bo'lsa keyin qo'shiladi) |
| 🟡 `oyinService.ts` yana kattalashishi | Alohida `oyinCommentService.ts` fayli — mavjud faylga QO'SHILMAYDI |

## 13.6 DoD — har band buyruq+natija bilan isbotlanadi

| # | Qabul mezoni | Tekshiruv buyrug'i |
|---|---|---|
| D1 | `OyinComment` jadvali VPS'da bor, app boshqa hech narsani buzmagan | VPS: `prisma migrate diff --from-schema-datasource ... --script` (diff o'qiladi) → `prisma db push` → `/health` 200 |
| D2 | Istalgan bog'langan a'zo (karta shart emas) komentariya yoza oladi | `POST /api/oyin/prize/:key/comments` kartasiz a'zo tokeni bilan → 200/ok |
| D3 | 1 kishi 1 sovringa faqat 1 komentariya — qayta yuborish TAHRIR qiladi, yangi qator ochmaydi | Ketma-ket ikki `POST` bir xil `(prizeKey, memberId)` bilan → DB'da bitta qator, `updatedAt` yangilangan |
| D4 | 140 belgidan uzun matn rad etiladi | `POST` 141 belgili matn bilan → 400 |
| D5 | Tezlik chegarasi ishlaydi | Bitta a'zo N+1 marta ketma-ket `POST` (limitdan tez) → oxirgisi 429 |
| D6 | 3-shikoyat avto-yashiradi | 3 xil a'zo bitta komentariyani `report` qiladi → `status` `hidden`ga o'tadi, ommaviy `GET`da endi ko'rinmaydi |
| D7 | Bitta a'zo bir komentariyani 2 marta shikoyat qila olmaydi | Ketma-ket ikki `report` bir xil (`commentId`,`memberId`) → `reports` faqat 1 marta oshadi |
| D8 | Admin `hidden`ni qayta faollashtira oladi (`approve`) | Admin panel: shikoyat navbatida "✅ Qaytarish" → `status` `active`, ommaviy `GET`da qayta ko'rinadi |
| D9 | Admin istalgan komentariyani shikoyatsiz ham o'chira oladi (`removed`) | Admin: "🗑 O'chirish" → `status` `removed`, hech qachon qayta ko'rinmaydi (approve tugmasi bo'lmaydi) |
| D10 | Bloklangan a'zo yangi komentariya yoza olmaydi (eskilari qoladi) | Admin bloklaydi → o'sha a'zo `POST` → 403; eski komentariyalari `GET`da hali ko'rinadi |
| D11 | UI: "no new colors" | `grep -n "#[0-9a-fA-F]\{3,6\}" packages/miniapp/src/design/feat/oyk.css` — yangi qo'shilgan `.oyk-comment-*` bloklarida 0 ta natija (faqat `var(--oyk-*)`) |
| D12 | Typecheck butun repo bo'ylab toza | `pnpm -r typecheck` — server/shared/miniapp/admin 4tasi ham 0 xato (K8ga oid) |
| D13 | Mavjud testlar buzilmagan | `pnpm --filter @t1067/shared test` — 187/187 (yoki yangi comment-mantiq shared'ga tushsa, +N) |
| D14 | Live tekshiruv | VPS deploydan keyin: real Telegram orqali 1 ta komentariya yozish → admin panelda ko'rinishi → shikoyat qilish → yashirilishi (ega o'zi sinaydi, QABUL) |

## 13.7 Qurilish tartibi

1. 13.2 dagi 3 ta qarorga ega TASDIG'I.
2. Schema + VPS migratsiya (D1) — **kod push'idan oldin, alohida qadam** (CLAUDE.md).
3. `oyinCommentService.ts` (post/list/report/admin) + shared turlar — D2–D10 shu bosqichda isbotlanadi (avval skript bilan, keyin API orqali).
4. `server.ts` marshrutlari.
5. Miniapp UI (sheet + kirish nuqtasi) + demo mock — D11.
6. Admin `Komentariyalar.tsx` + `Nazorat.tsx` qatori.
7. D12–D13 (typecheck + test), commit + push (owner tasdig'i bilan, odatdagidek).
8. D14 — ega QABULI, shundan keyingina "K8 — done".

## 13.8 Holat (2026-08-16) — to'liq tekshirildi

**Birinchi push'dan keyin topilgan va tuzatilgan haqiqiy xato:** `postComment`/`reportComment`
`featureOn("oyin")`ni TEKSHIRMAS edi — `buyTicket`/`setGoalPrize`/`reportAd` kabi barcha birodar
yozuv-funksiyalari bu tekshiruvni qiladi (`preview=isAdmin` bilan aylanib o'tiladi), K8 esa
yo'q edi. Amalda: flag hozir jonli o'chiq, lekin marshrut shaklini bilgan har kim to'g'ridan-
to'g'ri so'rov yuborib yoza olar edi — "dark feature" kafolati buzilgan edi. Tuzatildi
(`8ec647a4`), `listComments`/`deleteOwnComment` esa ATAYLAB gate'siz qoldirildi
(`getCardDetail`/`cancelOwnTicket` bilan bir xil: o'qish/o'z-o'chirish xavfsiz).

**Isbotlangan, jonli tizimda (2026-08-16):**
- D1 — VPS'da `prisma migrate diff` o'qildi (faqat `CREATE TABLE OyinComment` + 2 indeks) →
  `db push` → o'qish so'rovi bilan tasdiqlandi.
- Deploy: CI shield yashil, jonli commit `git log` bilan solishtirildi, `/health` `{"ok":true}`,
  jonli `GET /api/admin/oyin/comments` (admin token bilan haqiqiy HTTPS so'rov) → `{"rows":[]}`,
  `commentsPending` vitals javobida to'g'ri (0). Jonli miniapp bandle (`assets/oyin-*.js`,
  lazy-chunk — asosiy `index-*.js` EMAS) "Fikrlar" matnini o'z ichiga oladi — UI ham deploy
  qilingan.
- **⚠️ Bitta CI "deploy" ishi (`8ec647a4` uchun) `failure` deb belgilandi**, lekin to'g'ridan-
  to'g'ri tekshiruv shuni ko'rsatdiki VPS'dagi holat TO'LIQ TO'G'RI edi (to'g'ri commit, jonli
  bandle, sog'lom health, xatosiz jurnal) — sabab, ehtimol, `deploy.sh`ning bitta urinishli
  (retry'siz) health-tekshiruvi o'sha payt MEN QO'LDA VPS'da og'ir Prisma buyruqlarini (`db push`
  boshqa bazaga) parallel yurgizganim bilan mos kelib qolgani. Bu O'ZIM YARATGAN sharoit — endi
  bilaman: CI push'idan keyin darhol o'sha VPS'ga og'ir buyruq yuborilmaydi, birinchi CI tugashi
  kutiladi. Mahsulotga zarar YO'Q, faqat bitta yolg'on-qizil CI belgisi.
- **Yozish/moderatsiya to'liq yashab-o'lchovi** — `testK8Comments.ts` (endi repo'da doimiy,
  `testElonlar.ts` naqshi): TEST_DATABASE_URL (`birjoy_test`, VPS'da ALLAQACHON bor edi —
  ilgarigi "TEST_DATABASE_URL yo'q" eslatmasi ESKIRGAN, memory tuzatildi) ga qarshi 32 tekshiruv,
  2× ketma-ket yashil. App DB (`birjoy`) tekshiruv OLDIN va KEYIN 0 qatorligi bilan tasdiqlandi —
  ishlab chiqarish ma'lumotiga HECH QACHON tegilmagan. Qamrab olingan: yozish/tahrir/`@@unique`,
  140-belgi chegarasi, **flag ON/OFF + admin-preview aylanib o'tish** (yangi tuzatish shu yerda
  isbotlandi), 3-shikoyat→hidden, bitta kishi ikki marta shikoyat qilolmasligi, admin
  approve (reports reset)/remove (abadiy, qayta yozib bo'lmaydi), bloklash (yozish yopiladi, eski
  matn qoladi, blokdan chiqarish), o'z-o'chirish (begonaniki himoyalangan).

**Hali isbotlanmagan:** D14 — ega QABULI (jonli Telegram orqali, flag yoqilgach). Bu — mahsulot
qarori (qachon flag yoqiladi), muhandislik emas.

**Xulosa: K8 — READY FOR VERIFICATION, ega QABULidan tashqari hammasi isbotlangan.**

---

# 14. TOPILGAN KAMCHILIKLAR — TUZATISH TIKETLARI

_2026-08-16 · 6-agentli audit (gashtak/ball/kartalar/admin panel), har topilma mustaqil ikkinchi
agent tomonidan qayta tekshirilgan (kodni o'zi qayta o'qib, jonli buyruqni o'zi qayta yurgizib) —
hammasi CONFIRMED. Holat: **rejalashtirilmoqda** — ega qo'shimcha kamchiliklarni qo'shgach,
birgalikda aniq reja tuziladi, keyin tuzatiladi. Hali kod O'ZGARTIRILMAGAN._

## B1 🔴 — Gashtakda sinov-a'zo real navbatchi bo'lib qolishi (ustuvor — jonli xavf bor)

**Nima buzuq:** `applySetTurn` (`oyinService.ts:3117`) navbatchi qilib belgilanayotgan a'zoning
haqiqiy (musbat ID) yoki admin qo'shgan sinov (manfiy ID) a'zo ekanini tekshirmaydi. Bundan
tashqari `adminAddTestMember` (`:3036`) sinov-a'zoni guruhga qo'shganda uni AVTOMATIK navbat
aylanishiga ham qo'shib qo'yadi (`assignTurn`, izoh: "virtual a'zo ham navbat oladi").

**Nega xavfli:** o'sha oy uchun `creditGashtakLedger` haqiqiy safar ballini sinov-a'zoning
`GashtakReward` yozuviga yozadi — bu ball hech kimga qaytarib bo'lmaydi.

**Jonli holat (2026-08-16 tekshirildi):** guruh `JHJ7DR`da sinov-a'zolarga 2026-oktabr, noyabr,
dekabr va 2027-fevral, mart, aprel oylari uchun navbat ALLAQACHON band qilingan. Joriy oy (avgust)
to'g'ri — real a'zo #6da. Lekin yuqoridagi oylar kelganida, HECH KIM qo'lda tuzatmasa, xato
avtomatik ishga tushadi.

**Tuzatish yo'nalishi (muhokama uchun, hali qaror emas):** `applySetTurn` + `assignTurn` +
`navbatchiOf` uch joyda ham "faqat musbat (haqiqiy) ID" qo'riqni qo'shish; ikkala pikker (mijoz va
admin) sinov-a'zolarni tanlov ro'yxatidan olib tashlashi kerakmi yoki faqat ko'rinib-tanlanmasin
qilinsinmi — muhokama kerak. **Zudlik bilan:** hozirgi band qilingan kelajak oylarni qo'lda
tekshirib/tozalash (bu KOD tuzatishidan oldin ham qilinishi mumkin, chunki bu — DATA fix, kod fix
emas).

## B2 🔴 — Karta bekor qilishda poyga-holati — cheklamdan ortiq sotilish mumkin

**Nima buzuq:** `cancelOwnTicket` (`:1435`), `adminCancelTicket` (`:3721`),
`adminCancelPrizeTickets` (`:2176`) — uchalasi ham `buyTicket`ning `withMemberLock` qulfisiz
(`:1661`) bir xil `oyin:tickets:<memberId>` qatorini o'qib-yozadi.

**Isbot:** izolyatsiyalangan test-bazada (app DB'ga tegilmagan) qayta hosil qilindi — bitta
biletni ikki marta bir vaqtda (`Promise.all`) bekor qilish `sold` sonini 6dan 4ga tushirdi (5
bo'lishi kerak edi) — ya'ni sovrin o'rni IKKI MARTA bo'shadi. Amalda: mijoz "bekor qilish"ni ikki
marta bossa (yoki ilova avtomatik qayta urinsa), admin qo'ygan limitdan bir o'rin ortiq sotilishi
mumkin.

**Tuzatish yo'nalishi:** uchala funksiyani ham `withMemberLock`ga o'rash — `buyTicket` bilan bir
xil naqsh, qo'shimcha infratuzilma kerak emas.

## B3 🟠 — Admin panel v2: narx-tavsiya vositasi "Ball jadvali" knoblarini sezmaydi

**Nima buzuq:** `Mukofotlar.tsx`dagi `oyinCardPlan`/`oyinSuggestTier` chaqiruvlari (4 joyda: 214,
299, 408, 686-qatorlar) `oyinRideBall`/`oyinPrizeMultiplier` qiymatlarini uzatmaydi — qattiq
kodlangan standart (35, 3×) ishlatiladi. Eski (v1, `App.tsx`) panel esa `adminApi.bonusEconomy()`
orqali jonli qiymatni to'g'ri uzatadi — bu v2 qayta qurishda tushib qolgan regressiya.

**Nega muhim:** `Sozlama.tsx`da bu ikkala knobni o'zgartirsangiz, v2 narx-tavsiya vositasi buni
SEZMAYDI — narx tavsiyasi eski iqtisodga asoslanib chiqadi. Hozircha "jim" (knoblar hali standart
qiymatda), lekin birortasini o'zgartirgan zahoti simptom chiqadi.

**Tuzatish yo'nalishi:** `Mukofotlar.tsx`ga `adminApi.bonusEconomy()` chaqiruvini qo'shish, 4 ta
chaqiruv joyiga uzatish — v1 panelning aynan qilgan ishi.

## R1 🟡 — `adminAdjustBall` chegarasiz — bitta bosish bilan cheksiz ball

**Holat:** bu xavf `OYIN_KARTA_PLAN.md §9`da OLDINDAN yozilgan edi ("shiftsiz — bitta bosish bilan
+75 000 ball"), taklif qilingan tuzatish (≤2× realistik shift + mavsum jami chegarasi +
`drawExport`da bayroq) hali qilinmagan. Jonli misol: a'zo #26ning mavsum ballining 82% qo'lda
kiritilgan (`adjustHeavy` xavf-bayrog'i bilan belgilangan), lekin `drawExport` (tirajga
tayyorlanayotgan ro'yxat) bu xavf-bahosini UMUMAN o'qimaydi — demak og'ir tuzatilgan a'zo
tirajdan chiqarib tashlanmaydi/bayroqlanmaydi.

**Tuzatish yo'nalishi:** plan §9dagi taklif — shift chegarasi + mavsum-jami chegarasi +
`drawExport`ga xavf-bayrog'i qo'shish.

## R2 🟡 — Jonli katalog o'z byudjetidan ~255× oshib ketgan, kod hech narsani to'xtatmaydi

**Holat:** `adminBudget` byudjet/katalog nisbatini TO'G'RI hisoblaydi va `overBudget:true`
qaytaradi, lekin `buyTicket`/`adminUpsertPrize`/`adminSetPrizeActive` — hech biri bu qiymatni
o'qimaydi. Bu — kod xatosi emas (raqam halol hisoblanadi va ko'rsatiladi), balki jonli-ma'lumot
tayyorgarlik masalasi: flag bugun yoqilsa, real safar daromadi ko'tara olmaydigan miqdorda sovrin
va'da qilingan bo'ladi.

**Muhokama kerak:** bu kod-tuzatish emas, balki KATALOG-TOZALASH (qimmat/ortiqcha sovrinlarni
kamaytirish yoki navbatga qo'yish) — mahsulot qarori.

---

# 15. EGA FIKR-MULOHAZASI (2026-08-16, ikkinchi to'lqin) — F-tiketlar

_Kod hali o'zgarmagan. Har biri tez tekshirilib (grep/o'qish), aniq bo'lgani "tasdiqlangan",
qaror kerakligi "MUHOKAMA" deb belgilangan._

## F1 — «Keyingi navbatdagilar» (Dastur) bosilmaydi

Dastur tabidagi "keyingi navbatdagilar" oldindan ko'rish qatori (bu sessiyada qo'shilgan) hozir
faqat KO'RSATADI, bosilganda hech narsa qilmaydi. Kerak: bosilsa Mukofotlar tabiga o'tsin (kerak
bo'lsa o'sha sovringa scroll qilib).

## F2 — Mukofotlar tabida sovrin rasmi noto'g'ri kesiladi → QAROR: `contain`

**Sabab:** `.oyk-vcard-photo` (Mukofotlar karta, `oyk.css:379-380`) 200px baland, KENG banner —
`object-fit: cover`. `.oyk-goalc-img` (maqsad-doira) 124×124 KVADRAT — bir xil `cover`. Bir xil
manba-rasm kvadratga kesilganda markazi to'g'ri chiqadi, keng-past bannerga kesilganda esa Uzum
rasmining tepasi/pasti kesilib ketadi (mahsulot rasmning markazida emas).

**Qaror:** `object-fit: contain` (rasm HECH QACHON kesilmaydi, butun mahsulot ko'rinadi) + orqa
fon `var(--oyk-surface)` (mavjud token, `.oyk-goalc-img` xuddi shunday qiladi — `oyk.css:213`).
Sabab: DIZAYN_QOIDALARI #10 "jismoniy narsa = real rasm" — mahsulotning yarmi kesilib ketishi bu
qoidani buzadi, atrofida bo'sh joy qolishi kichikroq muammo. 30 ta turli Uzum-rasm orasida
qaysi biri markazlashgan, qaysi emasligini oldindan bilib bo'lmaydi — `contain` HAMMASI uchun
xavfsiz, `cover` esa har birida tasodifiy natija beradi.

## F3 — «N kishi maqsad qilgan» belgisi sovrin kartasida yo'q

Yangi funksiya: har sovrin kartasida kichik dumaloq belgi — "shu sovrinni necha kishi maqsad
qilib belgilagan" (`setGoalPrize`/`oyin:goal:<memberId>` ma'lumotidan hisoblanadi — yangi jadval
kerak emas, mavjud AppState skanidan agregatsiya). Ijtimoiy isbot ("N kishi shuni xohlaydi")
— xarid qarorini kuchaytiradi.

## F4 — Safar-yakun xabarida o'yin-progress qatori → QAROR

**Tekshirildi: bu qator HOZIR UMUMAN YO'Q** — `bookingNotifier.ts`ning safar-yakun xabarida
(`ride_finish`, ~819-827 qator) yo'l haqi/tasodifiy cashback/kutish-kompensatsiya/ETA-taxmin/
streak/quest-eslatma bor, lekin O'YIN BALL haqida BIR HARF ham yo'q. Bu — matn-tozalash emas,
HAQIQIY YETISHMOVCHILIK.

**Qaror — "iPhone 17 Pro Max" QATTIQ KODLANMAYDI.** Katalogda bunday sovrin yo'q
(`shared/oyin.ts` seedida faqat `uzum-iphone-12-4` bor) va narx/limit/rasmni O'ZIM
o'ylab topib qo'yishim — real pulga bog'liq mahsulot qarori, kod qarori emas (ayniqsa R2
allaqachon katalog byudjetdan 255× oshib ketganini ko'rsatgan holda — yana bitta qimmat
telefon qo'shish buni battarroq qiladi). Buning o'rniga: standart-maqsad MEXANIZMI qurilib,
mavjud "arzon/eng issiq sovrin" mantig'idan (`cheapestOpenPrize`, Dastur tabida allaqachon
ishlatiladi) foydalanadi — a'zo o'z maqsadini tanlagan bo'lsa o'shani, tanlamagan bo'lsa
shu standart mantiqni ko'rsatadi. **Siz "iPhone 17 Pro Max"ni admin panel orqali (allaqachon
to'liq ishlaydi — audit tasdiqladi) katalogga real narx bilan qo'shsangiz, mexanizm avtomatik
o'shani ko'rsata boshlaydi** — kod o'zgarishi shart emas.

**Qaror — hech qanday mavjud qator OLIB TASHLANMAYDI.** Har bir qator (yo'l haqi, cashback,
kutish-kompensatsiya, ETA-yutuq, streak, quest) — REAL pul/ballni bildiruvchi xabar. Buni olib
tashlash "mijozdan mukofotni yashirish" bo'lib qolishi mumkin — DIZAYN_QOIDALARI'ning "bo'sh
va'da bermaslik"/shaffoflik ruhiga zid. **O'rniga:** yangi 🎮 qator ENG TEPAGA (salomlashuvdan
keyin, birinchi) qo'shiladi — xabarning eng ko'rinadigan joyi shu bilan bandi, qolgan qatorlar
o'z joyida qoladi. Agar tajribada haqiqatan uzun/ko'p ko'rinsa, keyinroq alohida qaror bilan
qisqartiramiz — hozir taxmin bilan pul-xabarini o'chirib qo'ymayman.

**Texnik izoh:** ball-progress hisoblash safar-YAKUN paytida (allaqachon boshqa bir martalik
hisob-kitoblar — roll/waitComp shu yerda qilinadi, yangi og'irlik qo'shmaydi), HAR TIKDA emas.

## F5 — «1067ga telefon qilib chaqirish ham bir xil ball beradi» — TASDIQLANDI: bu FAQAT matn masalasi, funksiya buzuq EMAS

**Tekshirildi:** ball-berish mexanizmi (`bookingNotifier.ts`ning sweep'i) kas'ning FAOL
buyurtmalar ro'yxatini TELEFON RAQAMI bo'yicha a'zoga bog'laydi — buyurtma botdan yoki operatorga
qo'ng'iroq qilib yaratilganidan QAT'IY NAZAR, agar telefon raqami mos kelsa, ball xuddi shunday
beriladi (kas — ikkala kanal uchun ham YAGONA dispetcher manbai). **Demak funksiyada muammo yo'q
— faqat bu HECH QAYERDA aytilmagan.** Kerakli joylar: onboarding story, "Ball yig'ish" varag'i,
Dastur qoidalari — "1067ga qo'ng'iroq qilib chaqirsangiz ham xuddi shunday ball olasiz" qatori
qo'shiladi.

## F6 — Karta ochilganda sovrin rasmi ko'rinmaydi — TASDIQLANDI: haqiqiy kamchilik

**Tekshirildi:** server `OyinCardDetail.photoUrl` maydonini YUBORADI (sovrinning rasmi), lekin
`oyin.tsx`dagi karta-tafsilot varag'i (`.oyk-cert-stub`) buni HECH QACHON chizmaydi — faqat
matn (belgi, raqam, sovrin nomi+emoji, holat). Ma'lumot bor, faqat ko'rsatilmagan. Tuzatish:
`.oyk-cert-stub`ga `cardData.photoUrl` bo'lsa fon-rasm/tepa-rasm sifatida qo'shish (K1
tekshiruv-sahifasidagi kabi — `CardVerifyView.tsx`da HAM xuddi shu maydon bor va HAM
ishlatilmagan, ikkalasi birga tuzatilishi kerak).

## F7 — Gashtak bo'limi → QAROR: aniq, kichik qo'shimcha (kodni qayta o'qidim, "dabdala" joyni topa olmadim)

**Tekshirildi to'liq:** Jamoam tabi (a'zolar ro'yxati) VA "⚙️ Boshqarish" varag'i — ikkalasi ham
2026-08-14'da ALLAQACHON `.oyk-cert-teach`, rangli avatarlar (`avatarClass`), `.oyk-jamoa-tag*`,
`.oyk-gashtak-danger-row/note` bilan yangilangan (kodda sana bilan izohlangan). Men bu ikkitasida
yana "eski uslub" element topa olmadim — ehtimol jonli ilovada boshqacha ko'rinayotgandir yoki
men tushunmagan aniq joy bor.

**Shuning uchun taxminiy "qayta dizayn" QILMAYMAN** (buni noto'g'ri joyga sarflash xavfi bor) —
o'rniga aniq, asosli KAMCHILIK topdim: **gashtak sahifasida sovrin bilan bog'liqlik umuman
YO'Q** — a'zo Jamoam tabida turib "biz nimaga ball yig'yapmiz" savolining javobini (sovrin rasmi/
nomi) ko'rmaydi, buni bilish uchun Mukofotlar tabiga o'tishi kerak. **Qaror:** navbatchi
a'zoning `goalPrizeKey`i bo'lsa, Jamoam tabi tepasida kichik sovrin-rasmli chip qo'shiladi
("🎯 [Rasm] [Sovrin nomi]ga yig'ilmoqda") — F3'dagi rasm-ko'rsatish naqshi qayta ishlatiladi,
yangi uslub o'ylab topilmaydi. Bu — aniq, kodlashga tayyor.

**Agar hali ham biror joy "dabdala" ko'rinsa** — skrinshot bilan ko'rsating, men uni ALOHIDA,
aniq tiket qilib qo'shaman (taxmin qilib umumiy "qayta dizayn" qilishdan ko'ra shu ancha to'g'ri).

## F8 — Do'stga taklif matni + rasm → QAROR

**Tekshirildi:** hozirgi matn (`oyin.tsx:948-950`, `inviteFriend`) — umumiy, uchinchi shaxsda
("BirJoy sodiqlik dasturi — bosh mukofot: X!"), eng qimmat sovringa ("topPrize") bog'langan, HAR
DOIM bir xil — a'zoning o'z maqsadiga (`goalPrizeKey`) bog'lanmagan.

**Qaror — matn:** birinchi shaxsga o'tkaziladi, a'zoning O'Z `goalPrizeKey`iga bog'lanadi
(tanlamagan bo'lsa — hozirgi `topPrize` orqaga qaytish sifatida qoladi): *"Men [sovrin]ni yutish
uchun ball yig'moqdaman — 1067dan foydalaning va yutishimga hissangizni qo'shing! 🤝"*

**Qaror — rasm:** "yangi rasm" ikki darajada mumkin:
1. **Hozir qurish mumkin (yangi asset kerak emas):** `/j/` OG-taklif-sahifasi hozir STATIK
   ("Sodiqlik kartasi" umumiy poster, `telegram.ts:493-500`, v5). Buni `?prize=<key>` parametri
   bilan kengaytirib, sahifa o'sha SOVRINNING O'Z RASMINI (`photoUrl`, katalogda allaqachon bor)
   `og:image` qilib ko'rsatishini qurish mumkin — do'st havolani ochganda ANIQ o'sha telefon/
   noutbuk rasmini ko'radi, umumiy poster emas. Bu — mavjud ma'lumotdan, yangi dizayn-fayl
   kerak emas.
2. **Alohida, kattaroq ish:** professional bezatilgan poster (matn+brend ustiga qo'yilgan) —
   bu haqiqiy dizayn-asset, men ishonchli avtomatik yasay olmayman. Agar buni xohlasangiz,
   alohida so'rov sifatida ko'rib chiqamiz (Canva-uslubidagi vosita bilan yoki tashqi dizaynerdan).

**Bajaraman:** matn + variant-1 (dinamik sovrin-rasmli OG karta). Variant-2 — agar alohida
xohlasangiz keyinroq.

---

# 16. TO'LIQ IJRO REJASI — tartib va DoD

_Barcha 13 tiket (B1-B3, R1-R2, F1-F8) endi ANIQ qaror bilan. Kod hali yozilmagan. Quyidagi
tartibda: avval pul/sig'im-integriteti (B/R), keyin mustaqil kichik qo'shimchalar (F), oxirida
o'zaro bog'liq kattaroq ishlar._

| # | Tiket | Nima qilinadi | Xavf darajasi | Tekshiruv |
|---|---|---|---|---|
| 1 | B2 | `cancelOwnTicket`/`adminCancelTicket`/`adminCancelPrizeTickets` → `withMemberLock`ga o'raladi | 🔴 sig'im-integriteti | Izolyatsiyalangan test-bazada bekor-poyga qayta hosil qilingan holat endi YUZ BERMASLIGINI isbotlash (avvalgi skript qayta ishlatiladi) |
| 2 | B1 | `applySetTurn`/`assignTurn`/`navbatchiOf` — faqat musbat (haqiqiy) a'zo navbatchi bo'la oladi qo'rig'i + JHJ7DR guruhidagi band qilingan kelajak-oy sinov-yozuvlarini tozalash (data-fix) | 🔴 jonli xavf | Kod: sinov-a'zoni navbatchi qilishga urinish rad etilishini test-bazada isbotlash. Data: jonli guruhda kelajak oylar endi faqat haqiqiy a'zolarga ishora qilishini tekshirish |
| 3 | R1 | `adminAdjustBall`ga shift-chegara (≤2× realistik) + mavsum-jami chegara qo'shiladi; `drawExport`ga xavf-bayrog'i (`oyinRiskScore`) qo'shiladi | 🟡 | Chegaradan oshgan urinish rad etilishi; xavf-bayrog'i bor a'zo `drawExport` chiqishida ko'rinishi |
| 4 | B3 | `Mukofotlar.tsx`ning 4 ta `oyinCardPlan`/`oyinSuggestTier` chaqiruviga `adminApi.bonusEconomy()`dan `rideBall`/`multiplier` uzatiladi | 🟡 admin tooling | Sozlama.tsx'da knobni o'zgartirib, narx-tavsiya o'zgarishini ko'rish |
| 5 | F6 | `.oyk-cert-stub` + `CardVerifyView.tsx` — `photoUrl`/`prizePhotoUrl` bo'lsa rasm qo'shiladi | ⚪ | Brauzerda (`#oyindemo`) karta ochib rasm ko'rinishini tekshirish |
| 6 | F1 | «Keyingi navbatdagilar» qatori bosilganda `setTab("vitrina")` | ⚪ | Brauzerda bosib tekshirish |
| 7 | F3 | Sovrin kartasida "N kishi maqsad qilgan" kichik belgi (`oyin:goal:` skanidan agregatsiya, kesh bilan — har karta-ro'yxat so'rovida qayta hisoblanmasin) | ⚪ | Live: bir nechta a'zo turli sovrinni maqsad qilib, son to'g'ri chiqishini tekshirish |
| 8 | F5 | "1067ga qo'ng'iroq qilib ham ball olasiz" matni — onboarding story, Ball-yig'ish varag'i, Dastur qoidalari §5ga qo'shiladi | ⚪ | Brauzerda uch joyda ham matn borligini tekshirish |
| 9 | F2 | `.oyk-vcard-photo img` → `object-fit: contain` + `background: var(--oyk-surface)` | ⚪ | Brauzerda turli o'lchamdagi rasmlar bilan tekshirish (kesilish yo'qligi) |
| 10 | F7 | Jamoam tabiga navbatchining `goalPrizeKey` rasmli chipi qo'shiladi | ⚪ | Live/demo: maqsad belgilangan a'zo bilan tekshirish |
| 11 | F4 | Safar-yakun xabariga 🎮 ball-progress qatori (standart-maqsad mantig'i bilan) | 🟡 push-matn, ehtiyot kerak | Demo: turli holatlar (maqsad bor/yo'q, ball yetarli/yetarsiz) uchun matnni ko'rish; jonli — flag yoqilgach ega o'zi safar qilib tekshiradi |
| 12 | F8 | `inviteFriend` matni shaxsiylashtiriladi; `/j/` OG-sahifasi `?prize=`ni qo'llab-quvvatlaydi | ⚪ | Havolani ochib, Telegram preview-kartasida to'g'ri sovrin-rasmi chiqishini tekshirish |
| — | R2 | Kod-tuzatish EMAS — sizga alohida "katalog 255× byudjetdan oshgan, qaysi sovrinlarni kamaytiramiz/navbatga qo'yamiz" muhokamasi taklif qilaman, flag yoqilishidan OLDIN | — | — |

**Umumiy DoD har band uchun:** `pnpm -r typecheck` toza + `pnpm --filter @t1067/shared test`
187/187 (yoki band shared-testga tegsa +N) + brauzer/demo tekshiruvi (skrinshot) + (pul/sig'im-
ga tegadigan banlar uchun, ya'ni B1/B2/R1) izolyatsiyalangan test-baza skripti + jonli deploy
tasdig'i (commit+CI+VPS holat solishtiruvi, bu sessiyada K7/K8'da ishlatilgan naqsh).

**Ketma-ketlik sababi:** 1-4 — pul/sig'im/admin-tooling integriteti (eng yuqori xavf, eng tez
tuzatiladi). 5-9 — mustaqil, kichik, xavfsiz UI qo'shimchalar (parallel qilinishi mumkin). 10-12
— bir-biriga bog'liq (F7 F3'ning rasm-naqshini, F4 standart-maqsad mantig'ini qayta ishlatadi,
F8'ning matni ham xuddi shu `goalPrizeKey` tushunchasiga tayanadi) — shuning uchun oxirida,
avvalgilar tugagach.

## 16.1 Holat (2026-08-16, kechqurun) — 9/13 tayyor va deploy qilingan

✅ **1-9 band TO'LIQ:** B2, B1, R1, B3, F6, F1, F3, F5, F2 — hammasi kod yozilgan, typecheck
toza (4/4 paket), `pnpm --filter @t1067/shared test` 187/187, pul/sig'im-ga tegadigan banlar
(B1/B2/R1) izolyatsiyalangan test-bazada isbotlangan (2x ketma-ket yashil), UI-banlar
(F1/F2/F3/F5/F6) brauzerda DOM-darajasida tekshirilgan, HAMMASI commit+push+jonli deploy
tasdiqlangan (VPS git HEAD + `/health` solishtirilgan har band uchun).

⏳ **Qolgan 3 kod-band (10-12: F7, F4, F8)** — bog'liq, kattaroq ishlar, hali boshlanmagan.

**R2** — kod-tuzatish emasligi sababli alohida turadi, "keyingi qadam" emas — bu SIZGA
taklif: katalog joriy holda byudjetdan ~255× oshgan, flag yoqilishidan oldin qaysi
sovrinlarni kamaytirish/navbatga qo'yish kerakligini muhokama qilish kerak.

**Tasdiq so'ramayman — TO'G'RIDAN-TO'G'RI shu tartibda boshlayman**, agar qarshi bo'lmasangiz.
Har band tugagach qisqa xabar beraman (nima qilindi + isbot), keyingisiga o'taman.
