# ADMIN PANEL — QO'SHIMCHALAR

**Sana:** 2026-09-08 · **Asos:** panel allaqachon qurilgan — **qayta qurilmaydi, kengaytiriladi**
**Manbalar:** ega talabi 2026-09-08 · `DISPATCH_PLAN.md` §9 · `DRIVER_APK_PLAN.md` §14
(shoxobcha `claude/taxi-system-drivers-bsa05f`) · `RAQIB_TAHLIL.md`

---

## 1. ENG MUHIM YANGILIK — RATSIYA ORQALI MANZIL BELGILASH

> Ega talabi: *«kam haydovchi bo'lganda mijoz bilan ketayotgan manzilini ratsiya orqali
> so'rab belgilash va keyin buyurtmani belgilash»*

### 1.1 Nega bu shunchaki qulaylik emas — bu tizimning yetishmayotgan bo'g'ini

Bu bozorda buyurtmada **manzil yo'q** — mijoz faqat olib ketish joyini aytadi, taximetr ishlaydi.
Oqibati: **tizim band mashinaning qayerda bo'shashini bilmaydi.**

16.5 mashina onlayn bo'lganda bu halokatli. Dispetcher yangi buyurtmani kimga berishni bilmaydi,
chunki hech kim qachon va qayerda bo'shashi noma'lum. Shuning uchun operator ratsiya orqali
so'raydi — va javobni **o'z boshida** saqlaydi.

Bitta bosish bilan uni tizimga yozsak, uchta narsa ochiladi:

1. **Zanjirli buyurtma ishlaydi.** Haydovchi bo'shashidan oldin unga keyingi buyurtma taklif
   qilinadi. Bo'sh vaqt yo'qoladi — ta'minot 30-40% samaraliroq **mashina qo'shmasdan**.
2. **Xarita rost bo'ladi.** Operator band mashinaning qayerga ketayotganini ko'radi, nuqta
   emas — yo'nalish.
3. **Yo'nalish xaritasi to'planadi.** Har belgilangan manzil — Koson bo'ylab "qayerdan qayerga"
   ma'lumoti. Bir necha oyda bizda **hech kimda yo'q ma'lumot** paydo bo'ladi: shahar
   harakatining haqiqiy modeli. Bu keyinchalik issiqlik xaritasi, prognoz va narxni quvvatlaydi.

Uchinchisi eng qimmatlisi va uni hozir boshlamasak, keyin orqaga qaytarib to'plab bo'lmaydi.

### 1.2 Operator oqimi — maqsad: uch soniya

```
Operator xaritada band mashinani ko'radi
      ↓
📻 bosib gapiradi: "Aziz aka, qayerga olib ketyapsiz?"
      ↓
Haydovchi javob beradi: "Ravot mahallaga"
      ↓
Operator o'ng panelda joy nomini yozadi (avtoto'ldirish bilan) — Enter
      ↓
Buyurtmaga manzil YOZILDI · xaritada yo'nalish chizig'i chiqadi
      ↓
Tizim: "shu yaqinda 2 ta kutayotgan buyurtma bor" → zanjir taklifi
```

Yozish uchun **katalog avtoto'ldirishi** ishlatiladi — ya'ni operator "ravot" deb yozganda
`Ravot mahalla` chiqadi. Erkin matn ham qabul qilinadi, lekin katalogga tushmagani alohida
belgilanadi (keyin ega ko'rib katalogga qo'shadi).

⚠️ **Taxminiy moslashtirish taqiq.** Noto'g'ri taxmin keyingi taksini noto'g'ri joyga yuboradi.
Faqat aniq moslik yoki ega tasdiqlagan alias.

### 1.3 Ekranda qayerda turadi

`DISPATCH_PLAN.md` §9.1 dagi uch panelli konsolning **o'ng panelida**, band haydovchi tanlanganda:

```
┌────────────────────────────┐
│  Aziz Karimov · 01A123BC   │
│  🟡 Safarda · 12 daqiqa    │
│                            │
│  Olib ketdi: Eski bozor    │
│  ┌──────────────────────┐  │
│  │ 📍 Qayerga? [Ravot…] │  │  ← ratsiyadan keyin shu yerga yoziladi
│  └──────────────────────┘  │
│                            │
│  📻 [bosib gapir]          │
│  ⏭ Yaqinda 2 buyurtma      │  ← manzil belgilangach paydo bo'ladi
└────────────────────────────┘
```

Manzil belgilanmagan bo'lsa maydon bo'sh turadi va **hech narsa taxmin qilinmaydi**.

### 1.4 Ma'lumot modeli

Buyurtmaga uchta maydon qo'shiladi (mavjud jadvalga qo'shimcha, hech narsa o'zgartirilmaydi):

| Maydon | Nima |
|---|---|
| `dropoffPlaceId` | Katalog joyi (bo'lsa) |
| `dropoffText` | Operator yozgani (katalogga tushmasa) |
| `dropoffSource` | `radio` / `driver_app` / `client` — kim aytdi |

`dropoffSource` muhim: ratsiyadan kelgan ma'lumot **eshitib yozilgan**, ya'ni xato bo'lishi
mumkin. Statistikada u haydovchi ilovasidan kelganidan pastroq ishonch bilan hisoblanadi.

### 1.5 Keyingi qadam — haydovchi o'zi belgilaydi

Ratsiya — birinchi bosqich, chunki u **bugun ishlaydi** va hech qanday ilova talab qilmaydi.

Ikkinchi bosqichda haydovchi ilovasida safar boshlanganda bitta ixtiyoriy maydon chiqadi:
«Qayerga?» — bitta bosish bilan katalogdan. Majburiy emas (majburiy qilsak haydovchi
tasodifiy bosadi va ma'lumot buziladi). Rag'bat: belgilagan haydovchi zanjirli buyurtmaga
birinchi navbatda tushadi — ya'ni **belgilash unga foyda keltiradi**.

### 1.6 Case'lar

| Case | Xatti-harakat |
|---|---|
| Haydovchi javob bermadi | Maydon bo'sh qoladi, hech narsa taxmin qilinmaydi |
| Joy katalogda yo'q | Erkin matn saqlanadi, "katalogsiz" belgisi bilan, ega ko'radi |
| Manzil yo'lda o'zgardi | Operator qayta yozadi, tarix saqlanadi |
| Zanjir taklif qilindi, haydovchi rad etdi | Buyurtma umumiy navbatga qaytadi, jarima yo'q |
| Joriy safar bekor bo'ldi | Zanjirdagi keyingi buyurtma darhol qayta tarqatiladi |
| Ikki operator bir vaqtda yozdi | Oxirgisi g'olib, ikkalasi ham audit jurnalida |

---

## 2. ESKI SESSIYA REJALARI — o'rganildi

Shoxobcha `claude/taxi-system-drivers-bsa05f`: 8 commit, 5 hujjat, va **kod ham bor** —
`packages/shared/src/dispatch.ts` (212 qator sof funksiya) + 20 ta test, Prisma'ga 3 jadval,
`owndispatch` bayrog'i **[o'lchandi]**. Jonli tizim tegilmagan.

Ish sifatli. Quyida har xususiyat bo'yicha bahom:

| # | Xususiyat | Manba | Bahom | Ustuvorlik |
|---|---|---|---|---|
| 1 | Yetti qatlamli fon himoyasi (FCM+soket+WorkManager+Boot+polling) | APK §4 | **To'g'ri va zarur.** Kas'da faqat 1 qatlam — bizning eng katta ustunligimiz | 🔴 1 |
| 2 | Zanjirli buyurtma | APK §14.5 | **To'g'ri.** §1 dagi manzil belgilashsiz to'liq ishlamaydi — ikkisi birga | 🔴 1 |
| 3 | Ratsiya (PTT) | DISPATCH §10 | **To'g'ri.** Madaniy jihatdan majburiy — bu bozorda gaplashadi | 🔴 1 |
| 4 | Aniq GPS kuzatuv + iz | APK §14.2 | To'g'ri, lekin faqat liniyada yozilsin | 🟡 2 |
| 5 | Nazorat signallari (2 daq haydovchisiz, 10 daq "yetib keldim" yo'q…) | DISPATCH §9.4 | **Juda to'g'ri.** Konsolning asosiy qiymati shu | 🔴 1 |
| 6 | Mijozga taxminiy narx | APK §14.6 | To'g'ri — **lekin diapazon bilan**, aniq raqam va'da emas | 🟡 2 |
| 7 | Avto-SMS haydovchi SIM'idan | APK §14.1 | **Ehtiyot bo'lish kerak** — §3 ga qarang | 🟡 2 |
| 8 | Ovozni yashirin tinglash | APK §14.3 | **Yo'q.** Faqat SOS + shaffof rozilik. Eski sessiya ham shunday deydi — roziman | ⛔ |
| 9 | Operator amallari jadvali (qo'lda tayinlash, almashtirish, narx tuzatish) | DISPATCH §9.3 | To'g'ri, audit bilan | 🔴 1 |
| 10 | Rollar: ega / operator (pul yopiq) | DISPATCH §9.6 | To'g'ri | 🔴 1 |

**Ziddiyat topildi:** `DRIVER_APK_PLAN.md` "mavjud native ilova v1.3.0, 26 fayl" deydi.
Men o'lchadim: `1067-taxi/apps/driver-android` — **v2.0.0, 51 Kotlin fayl**, asosiy repoda
Android loyihasi umuman yo'q **[o'lchandi]**. Qaysi ilova nazarda tutilgani F0 da aniqlanadi.

---

## 3. AVTO-SMS — chuqurroq qaraldi

**G'oya:** safar bosqichlarida haydovchining SIM'idan mijozga SMS, oxirida BirJoy havolasi.
550 haydovchi × kunlik safarlar = kuchli organik kanal. Bu **haqiqatan ham kuchli g'oya**.

Uchta jiddiy shart bor:

**Pul.** Har safar 2 ta xizmat-SMS bo'lsa, faol haydovchida kuniga ~7-8 SMS. SIM tarifiga qarab
bu kuniga 300-800 so'm. Katta pul emas, lekin **kutilmagan xarajat haydovchini g'azablantiradi** —
va bizga aynan shu haydovchi kerak. ⚠️ **Aniqlanmagan:** haydovchilarning tariflarida SMS paketi
bormi? F3 dagi 5 haydovchidan shuni so'rash kerak — javob butun g'oyani o'zgartirishi mumkin.

**Qonun.** Xizmat-SMS ("haydovchi yetib keldi") — bu axborot, muammosiz. Reklama qismi
(o'yin, cashback havolasi) — ommaviy SMS-marketing, rozilik talab qilishi mumkin.

**Ruxsat.** `SEND_SMS` — Play Store'da qat'iy cheklangan ruxsat. Sideload APK'da ishlaydi,
lekin Play Store'ga chiqish yo'lini yopadi.

**Tavsiyam** (eski sessiya bilan bir xil): **ajratish.**
- Xizmat-SMS → haydovchi SIM'idan, **qisqa, bitta SMS ichida**, reklamasiz
- Marketing → server gateway (Eskiz) yoki Telegram orqali, rozilik bilan

Shunda haydovchi pulini yeymiz, lekin ozgina va faqat foydali narsaga; marketing esa nazorat
ostida va qonuniy qoladi.

---

## 4. PANELGA QO'SHILADIGAN RO'YXAT — ustuvorlik bo'yicha

Panel qayta qurilmaydi. Mavjud `Jonli`, `Buyurtmalar`, `Operator` bo'limlari kengaytiriladi va
bitta yangi bo'lim qo'shiladi: **🎧 Dispetcher**.

### 🔴 Birinchi to'lqin

| # | Qo'shimcha | Qayerga |
|---|---|---|
| 1 | **Ratsiya orqali manzil belgilash** (§1) | Dispetcher → o'ng panel |
| 2 | **Nazorat signallari** — 5 holat, qizil chiziq + ovoz | Dispetcher → chap panel |
| 3 | **Uch panelli konsol** — navbat / xarita / tanlangan | Yangi bo'lim |
| 4 | **Ratsiya paneli** — bosib gapirish, kim gapiryapti | Konsol pastida |
| 5 | **Operator amallari** — qo'lda tayinlash, almashtirish, bekor + audit | O'ng panel |
| 6 | **Zanjir taklifi** — "yaqinda N buyurtma" | Manzil belgilangach |

### 🟡 Ikkinchi to'lqin

| # | Qo'shimcha |
|---|---|
| 7 | Haydovchi 360 kartasi — tarix, reyting, qarz, GPS izi, shikoyatlar |
| 8 | Yo'nalish xaritasi (O-D matritsa) — to'plangan manzillardan |
| 9 | KPI paneli — topish vaqti, yetib kelish vaqti, bekor foizi, kas ulushi |
| 10 | Firibgarlik signallari — soxta GPS, takrorlanuvchi juftlik, anomaliya |
| 11 | SMS jurnali va opt-out ro'yxati |

### 🟢 Uchinchi to'lqin

Smena rejalashtirish · haydovchi jalb qilish quvuri · korporativ mijoz kabineti ·
devor tablosi (ofis ekrani).

---

## 5. OCHIQ SAVOLLAR

1. **Qaysi panel?** BirJoy admin v2 (jonli, siz kuniga ishlatasiz) — shunga qo'shamizmi?
   `1067-taxi` ning o'z admini alohida qoladimi? *Tavsiyam: BirJoy admin v2 ustun.*
2. **Manzilni haydovchi ilovasi ham so'rasinmi**, yoki faqat operator ratsiya orqali belgilaydimi?
   *Tavsiyam: avval ratsiya (bugun ishlaydi), keyin ilovada ixtiyoriy.*
3. **SMS paketi** — haydovchilar tarifida SMS bormi? F3 da so'raladi.
4. **Ratsiya texnologiyasi** — LiveKit? *Tavsiyam: ha.*
5. **Zanjirda haydovchi ustuvorligi** — manzil belgilagan haydovchi birinchi navbatda
   zanjir olsinmi? *Tavsiyam: ha — bu belgilashni rag'batlantiradi.*
