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
