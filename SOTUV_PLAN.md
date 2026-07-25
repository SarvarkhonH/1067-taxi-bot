# SOTUV PLAN — Koson biznesini BirJoyga ko'chirish

**Versiya:** v1 · **Sana:** 2026-07-26 · **Ega tasdiqlagan**

Savol: *"hammani BirJoyga jalb qilish va yagona shahar platformasi qilish — buni qanday
mukammal va to'g'ri sotay?"*

Bu hujjat jonli DB raqamlari asosida yozilgan. Yangi pul-mexanika (offline cashback, QR-tasdiq,
GPS-geofence, "Chaqa" naqd-hisob-kitob) — hammasi **ataylab rad etildi**, sabablari §11'da.

---

## 1. Jonli raqamlar (DB, 2026-07-26)

| Nima | Raqam | O'qish |
|---|---|---|
| Bot foydalanuvchilari | **1 035** | shundan 749 tasi taksi-akkauntiga ulangan |
| kas1067 mijoz bazasi | ~10 940 | bu bot foydalanuvchisi **EMAS** — taksi mijozlari |
| Xizmatlar e'lonlari | **139 faol** | shundan **137 tasida foto yoki ish vaqti yo'q** |
| Xizmatlarga qo'ng'iroq | **45** jami, 297 ko'rish | faqat **10 ta** e'lon umuman qo'ng'iroq olgan |
| Do'konlar / mahsulotlar | 6 / 175 faol | |
| Do'kon xaridlari (30 kun) | **24** | |
| Restoranlar / buyurtmalar | 11 / **15** (30 kun) | |
| Topilmagan so'rovlar | 60 yozuv → **20 ta haqiqiy** | prefiks-shovqin tozalangandan keyin |

Bu raqamlarni istalgan vaqt qayta olish:
```bash
pnpm --filter @t1067/server exec dotenv -e ../../.env -- tsx src/scripts/salesLeads.ts
```

## 2. Asosiy xulosa — sotuvdan OLDIN o'qing

**"Do'kon yetishmayapti" degan taxmin — noto'g'ri.** 139 xizmat, 6 do'kon, 175 mahsulot,
11 restoran bor. Muammo boshqa joyda:

> **139 e'londan 129 tasi umrida bironta qo'ng'iroq olmagan. 137 tasida foto yoki ish vaqti yo'q.**

Katalog bor — ichi bo'sh. Mijoz ochadi, ko'radigan/bosadigan narsa yo'q. Bunday holatda yana
100 ta biznes qo'shsangiz — 100 ta yana bo'sh karta bo'ladi va siz bergan va'dani bajarolmaysiz
("mijoz keladi" dedingiz — kelmadi). Bir marta shunday bo'lsa, o'sha biznes boshqa ishonmaydi
**va butun bozorga aytadi.** Kichik shaharda obro' bir marta ketadi.

**Tartib qat'iy shunday:** avval borini ishlaydigan qil → natijani dalilga aylantir → keyin dalil
bilan sot. Teskarisi qilinsa — pul ham, obro' ham kuyadi.

## 3. Sizda ALLAQACHON tayyor sotuv quroli bor

| Biznes | BirJoy orqali qo'ng'iroq | Telefon |
|---|---|---|
| **Cambridge O'quv Markaz** | **20** | +998889247444 |
| **Abdiraxim — Rim ustunlari** | **10** | +998942951596 |
| **Divan usta** | **8** (61 ko'rish) | +998886404447 |
| Lesa prakat · Zill · Malyar · Uzimizniki Hotdog · Umid Ibragimov · To'y-marosim · Stol-stul | 1 tadan | `salesLeads.ts` da |

**Bu — butun sotuv materialingiz.** Abstrakt gap ("ilovamiz bor, mijoz ko'p") o'rniga aniq raqam:
*"Divan usta BirJoy orqali 8 ta qo'ng'iroq oldi. Cambridge — 20 ta. Bepul."*

**Birinchi qadam (2 kun ichida):** shu 3 biznesga borib:
1. Raqamni ko'rsating — **ular bilishmaydi**
2. Bitta jumla iqtibos so'rang: *"BirJoydan mijoz keladi, bepul"*
3. Nomi va iqtibosini ishlatishga ruxsat oling
4. Kartasini o'sha yerda to'ldirib bering (foto/soat/narx) — 10 daqiqa
5. QR stikerini sovg'a qiling (`genBizStickers.ts --proof`)

## 4. Halol-raqam qoidasi (buzilmas)

- ✅ **"1000 dan ortiq kosonlik ilovada"** — rost (1 035 bot foydalanuvchisi)
- ✅ **"10 000 dan ortiq kosonlik bizning taksi mijozimiz"** — rost (kas bazasi)
- ❌ **"10 000 odam ilovadan foydalanadi"** — **YOLG'ON. Aytmang.**

Kosonda hamma bir-birini biladi. Bitta biznes tekshirib yolg'onni topsa — barchasiga aytadi va
qayta tiklolmaysiz. Kam raqam bilan halol gapirish — kichik shaharda yagona ishlaydigan yo'l.

## 5. Bosqich 0 — 1-hafta: mavjudni ishlaydigan qil (SOTUV YO'Q)

Bu haftada bitta ham yangi biznes qidirmaysiz.

**Vazifa:** eng ko'p ko'rilgan **30 ta** e'lonni to'ldirish — foto + ish vaqti (narx ixtiyoriy).
Navbat `salesLeads.ts` 2-blokida tayyor turadi. Admin panelda (🔎 Xizmatlar) hammasi bor:
prompt-tahrir, 6 ta foto yuklash, soat, narx.

- Kuniga 6 ta × 5 kun = 30 ta
- Har biriga ~20 daqiqa: egasiga qo'ng'iroq → *"kartangizni bepul to'ldiraman, 2 ta foto yuboring"* → to'ldirasiz
- **Qo'shimcha foyda:** bu qo'ng'iroqning o'zi sotuv — biznes o'ziga g'amxo'rlik ko'radi

**Hafta oxiri mezoni:** 30 ta e'londa foto+soat bor · qo'ng'iroqlar soni 45 dan o'sgan.

## 6. Bosqich 1 — 2–3-hafta: dalil bilan sotish

### Kimga birinchi borish (tartib muhim)

**A-guruh — allaqachon ro'yxatda, lekin bo'sh (137 ta).** Eng oson, sovuq qo'ng'iroq emas:
*"Kartangiz bizda bor, lekin bo'sh turibdi — to'ldirib beraymi?"* Rad etish sababi yo'q.

**B-guruh — qidirilgan, topilmagan.** Haqiqiy so'rovlar (30 kun):
`o'g'il bolalar uchun kiyimlar (16×) · telefonlar (5×) · arzon buyumlar (4×) · sabzavot (4×) ·
koptok (4×) · koka kola (3×) · ichimlik · piyola · finjon`

Bularning deyarli barchasi — **kundalik oziq-ovqat va mayda tovar**, ya'ni **mahalla do'koni**
mahsulotlari. Bu tasodif emas: mijozlaringiz aynan shuni qidirmoqda va topmayapti. Yangi ishga
tushirilgan **mahalla-do'kon** funksiyasi shu ehtiyojga to'g'ri keladi — birinchi navbatda
**mahalla oziq-ovqat do'konlarini** jalb qiling.

**C-guruh — restoran/oshxona** (11 ta bor, 15 buyurtma). Ilova ichida buyurtma ishlaydi, cashback
haqiqiy. Ko'proq restoran = ko'proq tranzaksiya.

**D-guruh — sovuq yangi bizneslar.** Eng oxirida. A/B/C tugagunicha vaqt sarflamang.

### 60-soniyalik pitch

**A-guruh (bo'sh karta):**
> "Assalomu alaykum, BirJoy ilovasidanman — Kosonda 1000 dan ortiq odam ishlatadi. Biznesingiz
> bizda ro'yxatda bor, lekin karta bo'sh — foto ham, ish vaqti ham yo'q. Divan usta to'ldirgandan
> keyin 8 ta qo'ng'iroq oldi. Sizniki ham bepul to'ldirib beray, 2 ta foto yuborsangiz bo'ldi.
> Hech qanday to'lov yo'q."

**B-guruh (dalil bilan):**
> "Ilovamizda odamlar «[aniq so'z]» deb qidiryapti, Kosonda topolmayapti — bu oy 16 marta.
> Sizda bu bor. Bepul qo'shsam, o'sha odamlar to'g'ri sizga keladi. Cambridge o'quv markazi
> shunday 20 ta qo'ng'iroq oldi."

**Yakuniy savol (har doim bir xil, oson "ha"):**
> "Bir hafta sinab ko'ramizmi? Sizdan hech narsa talab qilinmaydi — 2 ta foto va ish vaqtingiz."

### Yopuvchi demo (eng kuchli qism)

1. Ilovani oching → Xizmatlar → ularning sohasini toping
2. To'ldirilgan raqobatchi kartasini ko'rsating (foto, soat, ⭐)
3. **Telefonni ularning qo'liga bering** — o'zi bossin. Qo'lga tekkan narsa sotiladi
4. Shu yerda foto oling va kartani to'ldiring — 5 daqiqa
5. QR stikerini qoldiring

> **Qoida:** hech qachon *"keyin qo'shamiz"* demang. **O'sha yerda, ular ko'z oldida qo'shing.**
> Chiqib ketguningizcha kartasi jonli bo'lsin.

## 7. E'tirozlarga tayyor javoblar

| E'tiroz | Javob |
|---|---|
| "Pulimi?" | "Bepul. Hozir to'lov yo'q, ro'yxatda turish keyin ham bepul qoladi." |
| "Vaqtim yo'q" | "5 daqiqa. Men o'zim to'ldiraman, sizdan faqat 2 ta foto." |
| "Menda mijoz yetarli" | "Unda ro'yxatda turish hech narsa yo'qotmaydi. Bepul, bir hafta sinang." |
| "Kim ishlatadi?" | Aniq raqam (1000+) · **telefonni ko'rsating** · dalil-mijoz nomini ayting |
| "Foydasi bo'lmasa?" | "Bir hafta qo'ng'iroq bo'lmasa — o'zim o'chiraman, hech narsa yo'qotmaysiz." |
| "Telegram kanalim bor" | "Kanal — obunachilaringiz uchun. BirJoy — sizni **bilmagan** odam uchun." |

## 8. Narvon — nima so'rash, qaysi tartibda (pul eng oxirida)

1. **Bepul e'lon** (foto + soat) ← **hozirgi bosqich, faqat shu**
2. Narx ro'yxati
3. E'lon/aksiya qatori ("bugun yangi keldi")
4. Hikoya (24 soatlik video)
5. Ilova ichida sotish → bazar do'koni, cashback avtomatik
6. **Pullik VIP/yuqori o'rin** ← faqat 100+ jonli biznes va isbotlangan natijadan keyin

## 9. Kunlik ritm (bir kishi)

| Vaqt | Ish |
|---|---|
| 09:00–10:00 | 5 ta qo'ng'iroq (A-guruh) |
| 10:00–13:00 | 3 ta yuzma-yuz uchrashuv (B/C-guruh) |
| 14:00–16:00 | Kelgan fotolarni joylash, kartalarni to'ldirish |
| 16:00–17:00 | Ertangi ro'yxat (`salesLeads.ts`) + bugungi natija |

**Haftalik maqsad: 15 ta jonli karta.** Ko'proq emas — 15 ta to'liq karta 100 ta bo'shdan qimmat.

## 10. Haftalik 4 nazorat raqami

`salesLeads.ts` oxirida avtomatik chiqadi:

1. **Jami qo'ng'iroqlar** (hozir 45) — biznesga beradigan qiymatingiz
2. **Qo'ng'iroq olgan e'lonlar** (hozir 10/139) — qamrov kengaydimi
3. **To'liq e'lonlar (foto+soat)** — hozir 2/139 = 1%, **maqsad 50%+**
4. **Tranzaksiya** (do'kon 24 + restoran 15 / 30 kun)

## 11. Nima QILMASLIK kerak (bu ro'yxat rejaning yarmi)

- ❌ **Yangi pul-mexanika** (offline cashback, QR-tasdiq, GPS-geofence, "Chaqa" naqd hisob-kitob).
  Sababi: hammasi bitta hal qilib bo'lmaydigan muammoga urinardi — **POS-integratsiyasiz naqd
  xaridni tashqaridan tekshirish**. Yo murakkab (GPS/QR), yo xavfli (haftalik haydovchi-qarz:
  bir marta kechiksa butun ishonch quladi, kassa esa hozir taqchil).
- ❌ Bir vaqtda 100 ta biznesga yugurish
- ❌ Pul so'rash (VIP/reklama) — 100+ jonli biznes va dalilgacha yo'q
- ❌ "10 000 foydalanuvchi" deyish
- ❌ "Keyin qo'shamiz" — har doim o'sha yerda, o'sha zahoti

## 12. Vositalar (qurilgan, tayyor)

| Vosita | Buyruq | Nima qiladi |
|---|---|---|
| **Kunlik sotuv ro'yxati** | `tsx src/scripts/salesLeads.ts` | 3 blok: dalil-mijozlar · to'ldirish navbati · topilmagan so'rovlar + 4 nazorat raqami. **READ-ONLY** |
| **Biznes QR stiker** | `tsx src/scripts/genBizStickers.ts --proof` | Eshikka yopishtiriladigan QR → biznes kartasiga (`svc_<id>`). `--ids=25,69` bilan tanlab ham |
| **Demand-log tozaligi** | (avtomatik) | Har harf bosilganda yozuv yozilmaydi — 3+ belgi va bir soatlik zanjir bitta satrga yig'iladi |

## 13. Birinchi hafta (27-iyul – 2-avgust)

| Kun | Ish |
|---|---|
| **Dushanba** | `salesLeads.ts` yugurtirish, ro'yxatni chop etish, stikerlarni tayyorlash |
| **Seshanba** | Cambridge · Abdiraxim · Divan usta — raqam ko'rsatish, iqtibos + ruxsat, stiker sovg'a |
| **Chorshanba** | 6 ta eng ko'p ko'rilgan e'lonni to'ldirish |
| **Payshanba** | 6 ta e'lon + 3 ta mahalla oziq-ovqat do'koniga tashrif (B-skript) |
| **Juma** | 6 ta e'lon + 3 ta tashrif |
| **Shanba** | Stikerlarni eltib berish |
| **Yakshanba** | `salesLeads.ts` → 4 raqamni o'lchash, keyingi hafta ro'yxati |

**Hafta mezoni:** 3 ta ismli dalil-iqtibos · 18 ta to'ldirilgan karta · qo'ng'iroq raqami o'sgan.

---
*Har yakshanba yangilanadi.*
