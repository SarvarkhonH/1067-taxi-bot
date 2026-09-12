# KICHIK SHAHAR STRATEGIYASI — 1067, Koson (Qashqadaryo)

**Sana:** 2026-09-10 · **Usul:** ochiq manbalar bo'yicha veb-tadqiqot + egadan olingan real o'lchovlar
**Savol:** katta platforma (Yandex Go / inDrive / Bolt / Maxim) Kosonga kelgunga qadar 1067 ning
mavqeyini **olib bo'lmaydigan** holga qanday keltirish mumkin.

> **Belgilar.** `[MANBA]` — havolasi bor tashqi dalil. `[O'LCHOV]` — eganing o'z raqami.
> `[XULOSA]` — mening mulohazam, to'g'ridan-to'g'ri dalil emas. `[ZAIF MANBA]` — sanoat blogi yoki
> ikkilamchi manba, birlamchi hujjat emas; raqamiga tayanib qaror qilinmasin.

---

## 0. QAROR QILUVCHI CHEGARALAR (har bir tavsiya shulardan o'tdi)

Quyidagi sakkiz raqam butun hujjatning filtri. G'oya bularning birortasini buzsa — u yerda
qolmadi.

| # | Chegara | Qiymat | Nimani o'ldiradi |
|---|---|---|---|
| 1 | Oylik buyurtma | **1956/oy ≈ 63/kun** `[O'LCHOV]` | Surge, batching, ML-prognoz — statistika yetmaydi |
| 2 | Rad etilgan (mashina yo'q) | **21.5%** (421/oy) | Talabni pompalaydigan har qanday aksiya |
| 3 | Ilova ulushi | **10.6%** — qolgani 1067 ga qo'ng'iroq | "Faqat ilovada" deb qurilgan har narsa |
| 4 | Bir buyurtmadan egaga | **~1700 so'm** `[O'LCHOV]` (yalpi safar ~62 000) | Har qanday obuna/SaaS/ulush to'lovi |
| 5 | O'rtacha onlayn mashina | **16.5** | Zonalash, "eng yaqin 5 ta haydovchi" mantiqlari |
| 6 | Manzil kiritish | **~98% yozadi**, xarita-pin o'lik | Xaritaga tayangan har qanday ekran |
| 7 | Boradigan joy (destination) | **umuman yo'q** — taksometr | Marshrut/narx prognozi, pooling algoritmlari |
| 8 | Haydovchi telefoni | arzon Android, uzuq-yuluq internet | Og'ir ilova, doimiy soket, minSdk 26 |

**Eng muhim nomutanosiblik:** to'siq **talab emas, ta'minot**. Har besh buyurtmadan bittasi mashina
topolmay o'ladi. Ya'ni Kosonda "ko'proq mijoz" — bu emas, "ko'proq **onlayn** mashina va uni
uyg'otadigan kanal" — bu. `[O'LCHOV]`

Ichki auditda topilgan bitta texnik fakt shu strategiyaning markazida turadi: hozirgi haydovchi
ilovasida **push-bildirishnoma yo'q** — ilova faqat doimiy soketga tayanadi, Android uni o'ldirsa
haydovchi buyurtmani ko'rmaydi va ko'rmaganini ham bilmaydi
(`RAQIB_TAHLIL.md` §2.3, `TAXI_QAROR.md` §6). 21.5% rad javobining eng ehtimoliy sababi shu.
Ya'ni **eng katta strategik g'alaba — marketing emas, bildirishnoma.** `[XULOSA]`

---

## 1. KEYS-STADILAR — kim kichik shaharni oldi, kim yo'qotdi, nima hal qildi

### 1.1 Maxim (Shadrinsk, ~75 ming aholi) — eng aniq analog

Bu bizning holatimizning to'liq nusxasi, faqat 20 yil oldin boshlangan.

- 2003-yilning 11-avgustida Maxim Belonogov **Shadrinskda** (Qo'rg'on viloyati, kichik shahar)
  taksi buyurtma xizmatini ochdi. Uning oldingi biznesi **peyjer kompaniyasi** edi — haydovchilarni
  aynan o'sha peyjer mijozlari orasidan yig'di, e'lon berib shaxsiy mashinali haydovchilarni chaqirdi.
  Boshida hammasi qo'lda: telefon operatori qabul qiladi, dispetcher haydovchiga uzatadi. `[MANBA]`
  ([Wikipedia: Taxi Maxim](https://en.wikipedia.org/wiki/Taxi_Maxim))
- 2004-yil fevralda 150 000 rubl bank krediti bilan avtomatik telefon stansiyasi olindi. `[MANBA]`
- Bugun: **1000+ shahar, 18 mamlakat** (2022 holatiga), Indoneziyada 400+ shahar,
  Malayziyada 70+, Braziliyada 50+. `[MANBA]`
- **Maqsadli o'lcham:** Maxim — 10–300 ming aholili shaharlarga yo'naltirilgan yagona federal
  agregator; Yandex millionerlarga qaraydi va Maximga yuzlab aholi punktlarini raqobatsiz qoldiradi.
  `[MANBA]` ([topfranchise](https://topfranchise.ru/products/franshiza-servis-zakaza-taksi-maksim/),
  [ex.ru](https://ex.ru/f/taksi-maksim))
- **Franchayzing qoidasi: «1 shahar = 1 franchayzi»** — hududda boshqa hech kim Maxim nomi bilan
  ochilmaydi. 500+ shahar, 300+ franchayzi, 250+ hamkor, ularning 60% da biznes tajribasi
  bo'lmagan. Boshlang'ich investitsiya 150 000 rubldan, qoplanishi 6 oydan.
  Royalti boshida 0%. `[MANBA]`
- **Komissiya:** Maximda baza **10% dan**; mashinaga brending yopishtirilsa komissiya **kamayadi
  va buyurtma taqsimotida prioritet oshadi**. Yandexda esa xizmat komissiyasi 20–25% ustiga
  taksopark 5–15% — jami 35–40% gacha. `[MANBA]`
  ([chita.ru](https://www.chita.ru/text/transport/2023/08/24/72631352/),
  [taxiflow.ru](https://taxiflow.ru/kak-rasschityvayetsya-komissiya-s-zakaza/) — `[ZAIF MANBA]` ikkinchisi)
- Maxim haydovchiga **o'z narxini taklif qilish** huquqini berdi — mashina tezroq ketadi degan
  mantiq bilan. `[MANBA]` ([vc.ru](https://vc.ru/transport/94001-taksi-servis-maksim-razreshil-voditelyam-samim-naznachat-cenu-poezdki))

**Nima hal qildi:** (a) katta platformalar kirmaydigan o'lchamni tanlash; (b) haydovchi uchun
komissiya farqi 2–3 barobar; (c) telefon kanalini tashlamaslik — Maxim hanuz markazlashgan
qo'ng'iroq markazi bilan ishlaydi; (d) hududiy eksklyuzivlik — bitta shaharda bitta egasi.

**Bizga o'tadi:** hammasi. Ega allaqachon Maximning 2003-yildagi pozitsiyasida turibdi — **telefon
raqami + mahalliy haydovchilar + qo'lda dispetcherlik.** Farq shundaki, Maxim o'sha davrda
raqibsiz edi; ega esa poyga soati ostida.

### 1.2 Uklon (Ukraina) — mahalliy o'yinchi Uber va Boltni uyida yengdi

- 2010-yilda tashkil etilgan, Ukrainaning **28 shahrida** ishlaydi. `[MANBA]`
  ([Wikipedia: Uklon](https://en.wikipedia.org/wiki/Uklon))
- Uber va Bolt bozorda bo'lishiga qaramay Uklon **yetakchi**: 125.5 mln to'lov, Bolt 101 mln,
  Uber 30.9 mln. `[ZAIF MANBA]` (ikkilamchi jamlanma)
- **Tashqi investitsiyasiz** (bootstrapped) o'sdi — Bolt $1.98 mlrd, Uber $13.2 mlrd yig'ganida.
  `[ZAIF MANBA]`
- 2025-yilda Kyivstar tomonidan **$155 mln** ga sotib olindi. `[MANBA]`
- Uklon 2025-yildan **Toshkentda** ham ishlaydi va O'zbekistonda "kuchli ikkinchi" deb baholanadi,
  20 000+ faol haydovchi bilan. `[MANBA]`
  ([kursiv.media](https://uz.kursiv.media/en/2026-08-03/more-than-pricing-uzbekistans-ride-hailing-market-gets-crowded/))

**Nima hal qildi:** erta kirish + mahalliy sharoitga moslashish + venchur bosimi yo'qligi (ya'ni
"o'sish har qanday narxda" majburiyati yo'q). Bu — kichik operatorning eng kam gapiriladigan
ustunligi: **u foyda bilan yashashi mumkin, platforma esa o'sish bilan yashashi kerak.** `[XULOSA]`

### 1.3 Blue Bird (Indoneziya) — yo'qotib, keyin **qo'shilib** qaytarib oldi

- 2010-yillar o'rtalarigacha taksi bozorining ~50% i. Uber/Grab/Gojek kelgach **bozor qiymatining
  ~80% i, ya'ni $1.7 mlrd yo'qoldi**, daromad 3 yilda 23% tushdi. `[ZAIF MANBA]` (SCMP asosidagi jamlanmalar)
- Javob: **jang emas, ittifoq.** 2016–2017 da Gojek bilan birlashdi — Blue Bird taksilari Gojek
  ilovasida chaqiriladigan bo'ldi; 2019 da Gojek ~$30 mln ga 4.3–5% ulush oldi ($600 mln baho).
  `[MANBA]` ([TechCrunch](https://techcrunch.com/2020/02/17/gojek-reportedly-buys-4-3-stake-in-indonesian-taxi-company-blue-bird/))
- O'z ilovasi 2011 dan (Jakartadagi birinchi taksi ilovasi), 15 000+ mashina (2023),
  2021→2022 daromad +62%, 2021→2023 taksi daromadi +72%. `[ZAIF MANBA]`
  ([backscoop](https://www.backscoop.com/newsletter-posts/blue-bird-group-the-indonesian-family-business-that-competes-with-grab-and-gojek))

**Nima hal qildi:** ishonchli brend + korporativ/aeroport/mehmonxona kanallari + platformaga
**mijoz emas, ta'minotchi** bo'lib kirish. Blue Bird platformani raqib emas, **qo'shimcha talab
kanali** ga aylantirdi va o'z haydovchisini o'zida ushlab qoldi.

**Bizga o'tadi (ehtiyot bilan):** platforma Kosonga kelsa — unga qarshi turishning bir yo'li uning
buyurtmasini **1067 parki orqali** bajarish. Lekin bu faqat **haydovchi shartnomasi 1067 bilan
qolganda** ishlaydi; aks holda bu shunchaki haydovchini raqibga topshirish. `[XULOSA]`

### 1.4 Vinasun / Mai Linh (Vetnam) — sudda yutib, bozorda yutqazdi

- Vinasun 2017-yil yanvardan avgustgacha aksiyasi **44% tushdi** (32 700 → 18 100 VND).
  2700 taksisi bo'sh turdi. `[MANBA]`
  ([VIR](https://vir.com.vn/grab-and-uber-fined-mai-linh-and-vinasun-losing-value-51865.html))
- Grabga qarshi da'vo qo'zg'atdi; sud Grabni **4.8 mlrd VND (~$207 ming)** to'lashga majbur qildi
  va apellyatsiyada ham shu qoldi. `[MANBA]`
  ([kr-asia](https://kr-asia.com/grab-loses-appeal-in-vietnam-lawsuit-against-traditional-taxi-firm-vinasun))

**Nima hal qildi:** hech nima. **$207 ming — 2700 bo'sh taksining javobi emas.** Huquqiy va
ma'muriy himoya — vaqt sotib oladi, bozorni qaytarmaydi. Bu hujjatdagi eng muhim salbiy saboq.

### 1.5 Riga / Daugavpils / Jelgava (Latviya) — norozilik namoyishi ham javob emas

Yuzlab taksi haydovchilari Boltga qarshi ish tashladi ("Biz qul emasmiz", "Sizsiz bo'lmaydi").
`[MANBA]` ([caliber.az](https://caliber.az/en/post/riga-taxi-drivers-protest-bolt-policies-causing-traffic-disruption))
Natija — platforma iqtisodiyoti o'zgarmadi. **Xulosa: norozilik = e'tibor, himoya emas.**

### 1.6 Kichik shaharlarda platforma **kelmaydi** yoki **ketadi**

- Allegan (Michigan) — Uber/Lyft umuman kirmagan shahar; mahalliy odam taksi xizmatini ochib
  bo'shliqni to'ldirdi. `[ZAIF MANBA]` ([wzzm13](https://www.wzzm13.com/article/news/local/taxi-service-town-no-uber/69-8eb9c8fe-5045-4e89-9aa7-e46605dd5796))
- Unity Taxi (Evansville) — Uber kirgandan keyin biznesi **20% o'sdi**, chunki Uber xizmat
  qilmaydigan segmentlarni (nogironlar aravachasi uchun mikroavtobuslar) ushlab qoldi.
  `[ZAIF MANBA]` (yangilik lidi; birlamchi hujjat ochilmadi)
- Uber 2020-yilda 8 mamlakatdan chiqdi (Chexiya, Misr, Ruminiya, Saudiya, Urugvay, Ukraina...);
  2025–2026 da Kot-d'Ivuar, Tanzaniya, Nigeriya, Ugandadan chiqdi — ikki yildan kamroq vaqtda
  Afrika bozorlarining yarmidan. `[MANBA]`
  ([Semafor](https://www.semafor.com/article/09/04/2026/ubers-nigeria-exit-furstshers-retreat-from-africa),
  [TheStreet](https://www.thestreet.com/markets/uber-exits-nigeria-africa-biggest-market))

**Nima hal qildi:** birlik iqtisodiyoti. Platforma shaharni **bosib olishi** mumkin, lekin uni
**ushlab turishi** faqat zichlik pul qaytarsa. 63 buyurtma/kunlik shaharda subsidiyalangan kirish
hech qachon qaytmaydi — **agar incumbent narxni past va xizmatni ishonchli ushlab tursa.** `[XULOSA]`

### 1.7 Milliy manzara — nimaga qarshi turibmiz

| Bozor | Holat | Manba |
|---|---|---|
| O'zbekiston 2024 | Yandex Go: fiskal chek bo'yicha **85%** (271.3/319.1 mln), aylanma bo'yicha **~88%** | [kursiv](https://uz.kursiv.media/en/2026-08-03/more-than-pricing-uzbekistans-ride-hailing-market-gets-crowded/) |
| O'zbekiston 2025 | 479 mln safar, $799.6 mln; agregatorlar 155 → 224 ta | shu yerda |
| O'zbekiston 2026 (yanv–avg) | 329 mln safar, 7.2 trln so'm; **o'rtacha safar 21 785 so'm**; naqd **63.1%**; 481 100 o'zini o'zi band qilgan haydovchi; Toshkent safarlarning **45.3%** i | [gazeta.uz](https://www.gazeta.uz/ru/2026/09/04/taxi/) |
| Yandex Go qamrovi | O'zbekistonning **barcha viloyatlari**, 19 shahar va atrofi | [kursiv](https://uz.kursiv.media/en/2026-08-03/more-than-pricing-uzbekistans-ride-hailing-market-gets-crowded/) |
| Qozog'iston | Yandex Go **~90%**; komissiya 16% + park 4% = 20%; regulator O'zbekistonning pastroq komissiya modelini o'rganmoqda | [orda.kz](https://en.orda.kz/kazakhstan-monitoring-taxi-market-yandex-go-controls-90-share-5517/) |

**Diqqat qiluvchi ikki raqam.** Birinchisi: milliy o'rtacha safar **21 785 so'm**, Kosondagi yalpi
safar esa ~**62 000 so'm** `[O'LCHOV]` — ya'ni bizning safarimiz uch barobar qimmat (masofa
uzunligi va shaharlararo ulush sababli `[XULOSA]`). Bu **platforma uchun Kosonni jozibali qiladi**:
bitta safardan olinadigan komissiya milliy o'rtachadan yuqori. Ikkinchisi: Yandex allaqachon
barcha viloyatlarda. Ya'ni "ular kichik shaharga kirmaydi" degan taskin **noto'g'ri**; savol
"kiradimi" emas, **"kirganda nima ushlab qoladi"**.

---
<!-- BO'LIM-2-BOSHLANISHI -->
