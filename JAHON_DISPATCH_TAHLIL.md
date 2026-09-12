# JAHON DISPATCH TAHLILI — funksiya katalogi va bizga mos qaror

**Sana:** 2026-09-10 · **Usul:** ochiq manbalar (vendor hujjatlari, help-center'lar, muhandislik
bloglari, ilmiy maqolalar) + o'z kodimizni o'qish · **Til:** o'zbek, mahsulot va texnik atamalar
inglizcha/ruscha asl holida.

**Oldingi hujjatlar bilan bog'lanish.** Bu hujjat `RAQIB_TAHLIL.md` (kas1067/TaxiCloud APK
razborkasi), `TAXI_10X_PLAN.md` §2.3–2.4 (bozor raqamlari va uchta qonun) va
`BIRJOY_TAXI_MASTER.md` V qism (yetti sirt talablari) ni **takrorlamaydi** — ular ustiga quriladi.
Kas1067 tahlili u yerda; bu yerda **dunyo**.

---

## 0. ISHONCH DARAJASI — nimaga ishonish mumkin

| Belgi | Ma'nosi |
|---|---|
| **[hujjat]** | Vendorning o'z texnik hujjati / help-center'i — sozlama nomi ko'chirilgan |
| **[blog]** | Kompaniyaning rasmiy muhandislik yoki mahsulot blogi / matbuot xabari |
| **[ilmiy]** | Retsenziyalangan yoki arxiv maqola |
| **[ikkilamchi]** | Soha matbuoti / haydovchi bloglari — ishonarli, lekin birlamchi emas |
| **[marketing]** | Faqat sotuv sahifasi — mexanizm tekshirilmagan |
| **[o'lchandi]** | Shu kompyuterda kodimizdan o'qildi, `fayl:qator` bilan |
| **[xulosa]** | Mening xulosam, manba emas — ochiq aytilgan |

**Qamralmagan (halol ro'yxat §7 da to'liq):** iCabbi ochiq help-center chiqarmaydi — undagi
sozlama nomlari vendor da'vosi. HALE, Limo Anywhere, Cab Startup, Piiaf — foydali narsa chiqmadi.
Namba Taxi (Bishkek) haydovchi mexanikasi umuman e'lon qilinmagan. inDrive bid radiusi va bid
chegaralari oshkor emas.

---

## 0A. BOZOR RAQAMLARI — har tavsiya shulardan o'tadi

`TAXI_10X_PLAN.md` §2.3 dan **[ega]**:

```
1 956 buyurtma/oy (~63/kun)   ·   16.5 mashina onlayn (o'rtacha)   ·   3.8 buyurtma/mashina
Qo'ng'iroq 89.4%  ·  Ilova 10.6%  ·  Rad javobi 21.5% (421/oy)
Rad javobining tarkibi:  183 kompaniya (mashina yo'q)  +  238 haydovchi (rad etdi)
Mijoz to'lovi ~62 000 so'm  ·  Ega sof foydasi ~1 700 so'm/buyurtma  ·  Bazada 550 haydovchi
```

### ⚠️ Eng muhim yangi o'qish — rad javobining YARMIDAN KO'PI haydovchi radi

421 rad javobning **238 tasi (56.5%) haydovchi rad etgani**, atigi **183 tasi (43.5%) mashina
yo'qligi**. Bu butun ustuvorlikni o'zgartiradi:

- «Mashina kam» muammosi rad javobining **yarmidan kamini** tushuntiradi.
- Qolgan yarmi — **taklif sifati va taklif mexanikasi** muammosi: haydovchi onlayn edi, va
  **yo'q dedi** (yoki javob bermadi va taymer tugadi).
- Ya'ni 21.5% ni tushirishning eng arzon yo'li mashina qo'shish emas — **taklifni bir vaqtda bir
  nechta haydovchiga berish**, **rad etishning narxini ko'rsatish**, va **adolatsiz rad etishni
  jazolamaslik**.

**Ochiq savol (ega hal qiladi):** «238 haydovchi radi» — bu *bosib rad etish* mi, yoki *javobsiz
taymer tugashi* ham shu yerdami? Ikkalasi butunlay boshqa muammo:
- Bosib rad etish → taklif sifati (narx, masofa, mijoz) muammosi.
- Javobsiz taymer → **yetkazish** muammosi (push o'lik, ilova o'ldirilgan, overlay yo'q).
Bu ajratilmaguncha TOP-10 tartibi taxminga suyanadi. **[xulosa]**

### Bizning hozirgi dispatch — o'lchandi

`1067-taxi/apps/api/src/modules/dispatch/dispatch.service.ts:51-53` **[o'lchandi]**:

```
DISPATCH_MAX_ATTEMPTS     = 5
DISPATCH_TIMEOUT_SECONDS  = 15
DISPATCH_SEARCH_RADIUS_KM = 5   (kengaymaydi)
```

Ya'ni **ketma-ket, bittalab (exclusive) taklif**, har biri 15 s → eng yomon holatda
**5 × 15 = 75 soniya**, undan keyingina operator qutqaruv navbati (`dispatch.service.ts:636-643`).

**Bizda BOR:** ko'p omilli skoring (`driver-scorer.service.ts:27-33` — proximity, acceptanceRate,
rating, vehicle, zoneAffinity, cancellationPenalty, headingPenalty), zona FIFO navbati moduli,
`incentives` qoidalar dvigateli (rules / progress / leaderboard), gamification, surge, loyalty,
corporate, scheduled-rides modullari, `no_drivers` **terminal emas** (rescue queue).

**Bizda YO'Q (o'lchandi):**
- **Broadcast / parallel taklif** — hech qayerda bir buyurtma bir nechta haydovchiga bir vaqtda
  yuborilmaydi.
- **Zona navbati dispatch'ga ulanmagan** — `getNextInQueue()` butun `apps/api/src` bo'ylab
  dispatch'dan **hech qachon chaqirilmaydi** **[o'lchandi]**. Modul yozilgan, o'lik.
- **Bo'sh turgan vaqt (idle time)** skoringda yo'q — adolat/daromad tenglashtirish omili yo'q.
- **Band haydovchiga oldindan taklif (zanjir)** — yo'q.
- Radius kengaymaydi (5 km qat'iy).
- `minSdk 26` (`apps/driver-android/app/build.gradle.kts:31` **[o'lchandi]**) — kas1067 da 21.

---

# 1. KATTA FUNKSIYA KATALOGI

## 1.1 BUYURTMA QABUL QILISH (order intake)

Bizda 89.4% qo'ng'iroq. **Toshkentda qo'ng'iroq ulushi bugun atigi ~1–1.5%** **[hujjat:
[gazeta.uz](https://www.gazeta.uz/ru/2025/10/27/ride-hailing/)]** — ya'ni ko'chish **mumkin**,
faqat u avtomatik sodir bo'lmaydi.

| # | Funksiya | Kim eng yaxshi qiladi | Muammo | Manba |
|---|---|---|---|---|
| I-1 | **IVR bilan avtomatlashtirilgan buyurtma** — «70% qo'ng'iroqni odamsiz» | Autocab **Phantom** | Operator soni o'sishga to'siq bo'lmaydi | [autocab.com/phantom](https://www.autocab.com/phantom/) **[hujjat]** |
| I-2 | **ABOP — Automatic Back On Phone**: raqamni taniydi, ETA'ni o'zi aytadi | Autocab Phantom | «Taksim qani?» qo'ng'irog'i operatorga umuman yetmaydi | [Phantom](https://www.autocab.com/phantom/) **[hujjat]** |
| I-3 | **IVR menyusi: `0` = bekor · `1` = haydovchiga ulanish · `2` = operator** | **Такси-Мастер CallCenter**; Таксомёт (`1` = haydovchi, `2` = bekor) | Ikki eng ko'p qo'ng'iroq sababini operatorsiz yopadi | [TaxiMaster CallCenter](https://help.taximaster.ru/index.php/Такси-Мастер_CallCenter:_функционал_доступный_по_умолчанию), [Taxomet](https://taxomet.ru/functions/) **[hujjat]** |
| I-4 | **Автоинформатор** — mijozga mashina **rusumi, rangi, raqami va taxminiy vaqti** avtomatik aytiladi | Такси-Мастер | Kutish davridagi qo'ng'iroqlar yo'qoladi | [TaxiMaster CallCenter](https://help.taximaster.ru/index.php/Такси-Мастер_CallCenter:_функционал_доступный_по_умолчанию) **[hujjat]** |
| I-5 | **CallBack — dispetcher hisobidan** («qo'ng'iroq tushiriladi, keyin biz qaytaramiz»); SoftTaxi'da mijoz uchun aloqa xarajati **~30% gacha kamayadi** | Такси-Мастер, SoftTaxi | Naqd bozorda mijoz puli tejaladi, navbat yo'qoladi | [SoftTaxi callback](https://soft.taxi/features/callback), [TaxiMaster](https://help.taximaster.ru/index.php/Такси-Мастер_CallCenter:_функционал_доступный_по_умолчанию) **[hujjat]** |
| I-6 | **АОН / CTI screen-pop** — qo'ng'iroqda **telefon, ism, safar tarixi, bonus balli va oldin ishlatilgan manzillar** ochiladi | **SoftTaxi**, Такси-Мастер, Infinity, Onde | Operator yozmaydi — tasdiqlaydi | [SoftTaxi clients](https://soft.taxi/features/clients), [Infinity](https://taxi-infinity.ru/) **[hujjat]** |
| I-7 | **Manzil tarixidan taklif** — «takror murojaatda tizim oldingi manzillardan tanlashni taklif qiladi» | SoftTaxi | **Yozish 98% bo'lgan bozorda eng katta tezlik yutug'i** | [SoftTaxi](https://soft.taxi/features/clients) **[hujjat]** |
| I-8 | **Mijozni kod-so'z / diskont karta / telefon bo'yicha aniqlash** | SoftTaxi | Boshqa telefondan qo'ng'iroq qilgan doimiy mijoz | [SoftTaxi](https://soft.taxi/features/clients) **[hujjat]** |
| I-9 | **Saqlangan joydan IVR buyurtmasi (Book stored location)** | TaxiCaller | Manzil aytilmaydi, tugma bosiladi | [TaxiCaller IVR Actions](https://www.taxicaller.com/manuals/admin-panel/3/en/topic/ivr-actions) **[hujjat]** |
| I-10 | **Fixed Location Automated Bookings** — muassasa telefonidan faqat ism so'raladi | iCabbi BookVoice | Mehmonxona/do'kon qo'ng'irog'i 10 s ga tushadi | [iCabbi BookVoice](https://icabbi.com/platform/bookvoice/) **[marketing]** |
| I-11 | **Голосовой робот** — dialog: shahar → **olib ketish manzili** → (ixtiyoriy) manzil → **подъезд** → narx → tasdiq. **Stop-so'z, tanilmagan podъезд yoki ikki xil manzil mosligida odamga o'tkazadi.** **Faqat tunda** ishlatish mumkin | Такси-Мастер | Operator ish haqini tunda nolga tushiradi | [Голосовой робот](https://help.taximaster.ru/index.php/Настройки_Голосового_робота) **[hujjat]** |
| I-12 | **Voice AI (LLM operator)** — aksentlar, hisob autentifikatsiyasi, tarix, qaytish safari; **kunduzi odam, tunda AI** | iCabbi Voice AI; Autocab Virtual Operator | Tungi navbat | [iCabbi Voice AI](https://icabbi.com/platform/voice-ai/) **[marketing]** |
| I-13 | **Ride Validation Check** — AI buyurtmani olishdan **oldin** parkda quvvat borligini tekshiradi | iCabbi Voice AI | **Yolg'on va'da berilmaydi** | [iCabbi Voice AI](https://icabbi.com/platform/voice-ai/) **[marketing]** |
| I-14 | **Navbat raqamini aytish + queue callback** | Такси-Мастер, Таксомёт, iCabbi | Tashlab ketilgan qo'ng'iroq = yo'qolgan buyurtma | [Taxomet](https://taxomet.ru/functions/) **[hujjat]** |
| I-15 | **Missed call text** — javobsiz qo'ng'iroqqa avtomatik SMS | iCabbi BookVoice | Band vaqtdagi yo'qotishni qaytaradi | [iCabbi BookVoice](https://icabbi.com/platform/bookvoice/) **[marketing]** |
| I-16 | **Callback Mode (ringback)** — 5 rejim: Off / All / Dispatched Only / 2 ta On-Demand | Autocab | Kanal tanlab xabar berish | [Autocab Dispatch Config](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| I-17 | **Kanal bo'yicha prioritet 0–9** (`IVR Bookings Priority`, `Mobile App Bookings Priority`, `Account Bookings Priority`) | Autocab | **Ilova buyurtmasini qo'ng'iroqdan ustun qilish — kanal ko'chirishning to'g'ridan-to'g'ri richagi** | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| I-18 | **Buyurtma prioriteti mijoz guruhi va tarif bo'yicha** | Такси-Мастер | VIP/korporativ birinchi | [TaxiMaster автораздача](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| I-19 | **Ride Booker — dispetcher konsoli tashqi mijoz uchun**: agent **ism + telefon + manzil**larni kiritadi, **yo'lovchi ilovasiz SMS orqali jonli kuzatuv havolasini oladi**; ilovasi bo'lsa safar o'zi paydo bo'ladi | **Bolt for Business** | **Bizning telefon-buyurtma reallikning aynan analogi** | [Bolt Ride Booker](https://bolt.eu/en/support/articles/40343/) **[hujjat]** |
| I-20 | **Telefonsiz buyurtma: «Call to Ride»** — operator akkauntni ham ochadi, mijozga SMS | Uber (1-833-USE-UBER) | Smartfonsiz mijoz | [uber.com/ride/call-to-ride](https://www.uber.com/us/en/ride/call-to-ride) **[blog]** |
| I-21 | **Hotline orqali buyurtma (ilovasiz)** | Grab (Vetnam) | Ilova o'rnatmaydigan segment | mytour.vn sharhi **[ikkilamchi]** |
| I-22 | **USSD buyurtma (`*826#`)** — internetsiz, tugmali telefonda | Little Cab / Safaricom (Keniya) | Internetsiz segment | [Safaricom](https://www.safaricom.co.ke/media-center-landing/press-releases/taxi-hailing-app-little-now-available-via-ussd) **[blog]** |
| I-23 | **WhatsApp'ga joylashuv yuborib buyurtma** | Little Cab (KE/UG/ZM) | Ilovasiz kanal | weetracker **[ikkilamchi]** |
| I-24 | **Telegram bot orqali buyurtma, dispetcherga ulangan** | Такси-Мастер Telegram-bot | **Bizda allaqachon shu kanal jonli** | [TaxiMaster Telegram bot](https://www.taximaster.ru/capabilities/rukovoditelju/telegram-bot/) **[hujjat]** |
| I-25 | **Web App — o'rnatishsiz, data-lite, telefon + OTP, faqat naqd** | **Bolt Web App** (Afrika) | Xotirasi to'lgan/eski telefon, qimmat internet | [Tribune Online](https://tribuneonlineng.com/bolt-introduces-web-app-alternative-to-reach-more-riders/) **[blog]** |
| I-26 | **Apparat tugma (venue button)** — mehmonxona/kafe stolida bir tugma | Taxi Butler ONE / PLUS / KIOSK | **Manzilsiz, qo'ng'iroqsiz buyurtma** | [taxibutler.com](https://taxibutler.com/) **[marketing]** |
| I-27 | **Overbooking protection** — 15 daqiqalik slotlarda quvvat; tugasa qabul qilinmaydi yoki hamkorga uzatiladi | Autocab, iCabbi | Bajarolmaydigan va'da yo'q | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| I-28 | **Auto Cancel Timer + Auto Cancel Zones** | Autocab | Mijoz umidsiz kutmaydi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| I-29 | **Pre-emptive IVR** — oldindan bronga eslatma qo'ng'iroq | iCabbi | No-show kamayadi | [iCabbi Dispatch](https://icabbi.com/platform/dispatch/) **[marketing]** |
| I-30 | **Buyurtma uchun boshqa odam nomidan («Ride for a Friend»)** | Bolt | Oila a'zosi uchun chaqirish | boboyeoyindamola sharhi **[ikkilamchi]** |

## 1.2 DISPATCH (tarqatish algoritmi) — eng katta bo'lim

| # | Funksiya | Kim eng yaxshi qiladi | Muammo | Manba |
|---|---|---|---|---|
| D-1 | **Exclusive dispatch (ED)** — bittalab | Klassik; **bizda hozir shu** **[o'lchandi]** | Sodda, sekin | — |
| D-2 | **Non-exclusive / broadcast (NED)** — bir buyurtma bir vaqtda N haydovchiga | **Lyft** (ilmiy nashr), TaxiCaller, Tookan `Send to All` | **Qabul vaqti keskin qisqaradi → mijoz ketmaydi, o'tkazuvchanlik oshadi** | [arXiv 2603.21531](https://arxiv.org/abs/2603.21531) **[ilmiy]** |
| D-3 | **First-Accept vs Best-Accept** — broadcast'da g'olib | Lyft tadqiqoti | Tezlik ↔ sifat almashinuvini ongli tanlash. Ogohlantirish: **haddan tashqari keng broadcast yaxshi haydovchini «qulflaydi»** | [arXiv 2603.21531](https://arxiv.org/abs/2603.21531) **[ilmiy]** |
| D-4 | **Green card / yellow card gibridi** — 1-haydovchiga **10 s** eksklyuziv; rad qilsa «yellow» bo'ladi; keyingi bosqichda **bir nechta yellow bir vaqtda taklif oladi, g'olib — eng qisqa ETA aytgan** | **Onde** | ED va NED ning eng yaxshisi | [Onde Job distribution](https://support.onde.app/en/articles/1047505-job-distribution) **[hujjat]** |
| D-5 | **Буферный / балковый режим** — yuqori talabda buyurtmalar buferga yig'iladi va **Vengriya (Hungarian) algoritmi** bilan **butun graf bo'yicha** yechiladi: «umumiy podacha vaqtini minimallashtirib, bajarilgan buyurtmalar sonini maksimallashtirish» | **Yandex** (muhandislik maqolasi) | Ochko'z (greedy) «eng yaqin mashina» dan yaxshiroq — **ayniqsa mashina kam bo'lganda** | [Habr / Yandex](https://habr.com/ru/companies/yandex/articles/439182/) **[blog]** |
| D-6 | **Batched matching** — bir necha soniya ushlab, guruh bo'lib | Uber | O'rtacha kutish kamayadi | [Uber marketplace](https://www.uber.com/us/en/marketplace/matching/) **[blog]** |
| D-7 | **Zanjirli buyurtma / forward dispatch** — safar tugashiga **~5 daqiqa** (Maxim) yoki 2–3 daqiqa (Uber) qolganda keyingi buyurtma | **Uber**, **Maxim**, Bolt (**back-to-back sukut bo'yicha YOQIQ**), Grab (Auto Accept zanjirni ham oladi), Такси-Мастер | **Mashina qo'shmasdan ta'minotni oshiradi** | [Uber forward dispatch](https://www.uber.com/en-LK/newsroom/forwarddispatch) **[blog]**, [Bolt back-to-back](https://bolt.eu/en/support/articles/115004213034/) **[hujjat]** |
| D-8 | **Bandlarga navbatga qo'yish** — «bo'shash vaqti podacha vaqtidan X daqiqadan ko'p oshmasa navbatga qo'y» | **Такси-Мастер** | Xuddi shu, sozlanadigan | [TaxiMaster автораздача](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| D-9 | **Soon To Clear (STC)** — qo'lda / avtomatik (yetib borish zonasiga kirganda) / ikkalasi | Autocab | Tugatayotgan mashina uzoqdagi bo'shdan ustun | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-10 | **Rejim tanlash (switchable modes)** | **Autocab** eng boy: `Fastest Finger First` · `Nearest Vehicle` · `Bid Zones` · `Longest Waiting` · `Nearest Zone`; alohida `Route Based`: `Nearest` / `Soonest` | Vaqt/zona bo'yicha boshqa mantiq | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-11 | **5 ta автораздача rejimi**: `По правилам стоянок` · `Ближайший в пределах стоянки → по стоянке → остальные` · `Ближайший по карте → по стоянке` · `По километражу` · `Скриптовый` | **Такси-Мастер** | MDH lug'ati; bizga eng tanish model | [TaxiMaster](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| D-12 | **6 ta rejim**: `One by One` · `Send to All` · `Batch Wise` · `Round Robin` · `Nearest Available` · `FIFO` | JungleWorks Tookan | Rejimlar lug'ati | [Tookan](https://help.jungleworks.com/knowledge-base/task-assignment-on-tookan/) **[hujjat]** |
| D-13 | **⭐ Приоритет = virtual metr** — «ma'lum prioritetli haydovchilar podacha nuqtasiga **berilgan metr miqdorida yaqinroq** hisoblanadi» | **Такси-Мастер** | **«Eng yaqin mashina» va «yaxshi haydovchi» ni BITTA raqamga birlashtiradi.** Qayta yozish shart emas | [Система приоритетов](https://help.taximaster.ru/index.php/Система_приоритетов_и_примеры_ее_использования) **[hujjat]** |
| D-14 | **Statik vs dinamik prioritet** — statik (tajriba, avariyasiz, bolalar o'rindig'i, brending; misolda **+50**), dinamik (muddatli; muddat 0 = smena oxirigacha) | Такси-Мастер | Xulq va sifatni bir tizimga solish | [TaxiMaster](https://help.taximaster.ru/index.php/Система_приоритетов_и_примеры_ее_использования) **[hujjat]** |
| D-15 | **Foydasiz buyurtma uchun prioritet OSHADI** (`Динамический приоритет за невыгодные заказы`) | Такси-Мастер | Uzoq/noqulay buyurtmani oluvchini mukofotlash — **kompensatsiya richagi** | [TaxiMaster](https://help.taximaster.ru/index.php/Система_приоритетов_и_примеры_ее_использования) **[hujjat]** |
| D-16 | **Prioritetni sotib olish** (`Правила продажи приоритетов`) — qiymat, muddat, narx, kimga | Такси-Мастер; Yandex «покупка смены»; Maxim «soatlik dostup» | Naqd bozorda haydovchi o'zi tanlaydigan to'lov shakli | [TaxiMaster](https://help.taximaster.ru/index.php/Система_приоритетов_и_примеры_ее_использования) **[ikkilamchi]** |
| D-17 | **Приоритет (Yandex modeli)** — **maksimum +30** «o'tkazmasdan bajarish» dan, **+20** Ekspert darajasidan, **reyting** dan −10…+8; **umumiy 0 ga tushsa — buyurtmalar vaqtincha yo'q** | **Yandex Pro** (O'zbekistonda ham) | Xulqni bitta o'qqa yig'adi; O'zbek haydovchilari buni **allaqachon biladi** | [Приоритет](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/income-diff/priority), [Andijon](https://pro.yandex.com/uz-ru/andizhan/knowledge-base/taxi/app/priority-instead-of-activity) **[hujjat]** |
| D-18 | **⭐ Uzoq podacha — jazosiz skip**: «Пропускать заказы с дальней подачей можно без потери баллов приоритета в любом режиме» | **Yandex Pro** | **Haydovchini offline'ga haydab yuboradigan #1 sabab — adolatsiz jazo. Bu uni yopadi** | [Приоритет](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/income-diff/priority) **[hujjat]** |
| D-19 | **⭐ «Optional order» belgisi** — radiusdan tashqaridagi buyurtma bannerli keladi: «rad qilish yoki e'tiborsiz qoldirish **acceptance rate, driver score va bonusga ta'sir qilmaydi**» | **Bolt** | Yupqa ta'minotda o'lchovni adolatli saqlashning eng toza UI naqshi | [Bolt optional orders](https://bolt.eu/en/support/articles/360010717420/) **[hujjat]** |
| D-20 | **⭐ «Занят» bepul, sukut jazolanadi** — ochiq «ishlamayman» prioritetga tegmaydi; **jim taymer tugatish jazolanadi** | Yandex Pro | Halol haydovchini jazolamaydi | [Приоритет](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/income-diff/priority) **[hujjat]** |
| D-21 | **⭐ Kartada oqibatni ko'rsatish** — bosishdan **oldin** «qabul qilsang +N, o'tkazsang −M» | Yandex Активность (eski, MDH'da hali jonli) | Xulqni bir qator matn bilan o'zgartiradi | **[ikkilamchi]** — rasmiy sahifada tasvirlangan, aniq raqamlar yo'q |
| D-22 | **Nearest ↔ Longest-waiting aralashtirish knoblari**: `Nearest VS Longest In Zone Tune Distance (m)`, `Nearest Vehicle VS Longest Waiting Minutes` | **Autocab** | Ikki butun son bilan adolat qo'shiladi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-23 | **Daromad tenglashtirish** — `Booking Offering Order` = `Trips Value bands`: taklif tartibi haydovchi shu smenada **qancha topgani** bo'yicha; `Shortest Waiting Backup Zone Price Threshold` (qimmat ish uchun adolat qoidasi yoqiladi) | Autocab | Kuchsiz haydovchi ham pul topadi → qoladi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-24 | **Zona FIFO navbati (стоянка / plot / rank)** — Autocab'da **7 zona turi**: `Normal` · `Start` · **`Rejected`** (rad etganlar jazo zonasi) · `Long Break` · **`As Directed`** · `NAK` · `No GPS` | Autocab, TaxiCaller, Такси-Мастер, Infinity | Bozor/avtovokzalda tartib | [Autocab Zone List](https://support.autocab.com/portal/en/kb/articles/zone-list-365-management) **[hujjat]** |
| D-25 | **⭐ Navbat o'rnini «X/Y» ko'rinishida ko'rsatish** | Такси-Мастер TMDriver | **Xaritasiz adolat — kichik shahar haydovchisi ishonadigan yagona mexanika** | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| D-26 | **Sticky zones** — zonadan chiqqach navbat o'rnini **zonada turgan vaqtning %i** qadar saqlash | **TaxiCaller** | Ko'chadan yo'lovchi olgan navbatini yo'qotmaydi | [TaxiCaller Zone Queues](https://www.taxicaller.com/manuals/admin-panel/2/en/topic/advanced-zone-queues) **[hujjat]** |
| D-27 | **Aeroport navbati (to'liq spetsifikatsiya)** — kutish zonasi **ko'k = bo'sh joy bor**; **bepul turish 90 daqiqa**; tayinlangach **20 daqiqa** ichida yo'lovchini olish; tarif bo'yicha alohida navbat va «shtorka» dan o'z o'rningni ko'rish; **zonadan chiqish, qabul qilib rad etish, GPS uzoq yo'qolishi navbatni kuydiradi** | **Yandex Pro** | Tayyor, jangda sinalgan navbat qoidalari to'plami | [Домодедово](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/rides/domodedovo-orders), [yangi navbat](https://pro.yandex.ru/ru-ru/sankt-peterburg/knowledge-base/taxi/app/airports-rides-how-to-new) **[hujjat]** |
| D-28 | **Aeroport FIFO + geofence** — zonada bo'lmagan navbatga kirmaydi; navbat bo'sh bo'lsagina tashqaridagilarga tushadi | Uber | Adolat + fizik tartib | [Uber queue access](https://help.uber.com/en/driving-and-delivering/article/queue-access?nodeId=1275528f-2ba7-4ca4-982f-6aca4e3fad99) **[hujjat]** |
| D-29 | **Aeroport navbati uzunligi va kutish vaqtini KO'RSATISH** | Grab | Haydovchi «borish arziydimi» ni o'zi hisoblaydi | [Grab driver tools](https://www.grab.com/inside-grab/stories/driver-earnings-productivity-efficiency-tech-tools/) **[blog]** |
| D-30 | **Radius bosqichli kengayishi** — Autocab: har qadamda **ikki barobar**; Tookan: `Start Radius`/`Radius Increment`/`Maximum Radius`; Onde: 2-doira = **2× ish radiusi** | Autocab, Tookan, Onde | Yaqinda yo'q bo'lsa buyurtma o'lmaydi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management), [Onde](https://support.onde.app/en/articles/1047505-job-distribution) **[hujjat]** |
| D-31 | **`Maximum Nearest Dispatch Distance (m)`** — qattiq shift | Autocab | **«Wild goose chase»** ning oldini oladi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-32 | **Wild goose chase nazariyasi** — ta'minot kam bo'lganda uzoqqa yuborish **samarali ta'minotni yana kamaytiradi** (halokatli teskari aloqa) | Castillo–Knoepfle–Weyl (Uber ma'lumotida) | Nega radius **cheklanishi** kerakligini isbotlaydi | [NBER PDF](https://conference.nber.org/confer/2017/MDf17/Castillo_Knoepfle_Weyl.pdf) **[ilmiy]** |
| D-33 | **Qo'shni stoyankadan qidirish** | Такси-Мастер | Zona bo'sh bo'lsa qo'shnisidan | [TaxiMaster](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| D-34 | **ETA chegarasi bilan nomzod filtri** — «podachaga **15 daqiqadan ko'p** sarflamaydi» | Yandex | Nomzodlar to'plamini rost qiladi | [Система поездок](https://pro.yandex.ru/ru-ru/ufa/knowledge-base/service-taxi/income-diff/ride-system) **[hujjat]** |
| D-35 | **Buyurtma birjasi / «эфир»** — haydovchi ro'yxatdan o'zi tanlaydi, filtr bilan; **yoki avto-tayinlash rejimini yoqadi** | **Maxim/Taxsee**, Uklon, Infinity, Такси-Мастер | Push-taymerlar yo'qoladi; haydovchi nazorat his qiladi | [Maxim FAQ](https://taximaxim.com/pe/en/driver/faq/) **[hujjat]** |
| D-36 | **⭐ Birjada 15 daqiqalik da'vo muddati** — o'zi olgan buyurtmani 15 daqiqada boshlamasa, buyurtma qaytarib olinadi | Maxim | Birja modelining majburiy qo'riqchisi (buyurtma yig'ib qo'yishga qarshi) | [taksirussian](https://taksirussian.ru/driver) **[ikkilamchi]** |
| D-37 | **Buyurtma filtri (narx, masofa, tuman)** + uch holatli indikator (yashil/qizil/sariq) | Такси-Мастер TMDriver | Haydovchi o'z shartini qo'yadi | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| D-38 | **Autobid** — haydovchi `Radius` / `Zones` / `Both` qo'yadi, ilova o'zi bid qiladi | Autocab | Rulda telefon bosish kamayadi | [Autocab Settings Groups](https://support.autocab.com/hc/en-gb/articles/4419139025169-Overview-of-Settings-Groups-365-Management) **[hujjat]** |
| D-39 | **Auksion rejimi** — `Booking Bid Expiry Time` vs `Vehicle Bid Expiry Time`, `Maximum Bidding Distance`, `Allow Bidding While Busy` | Autocab; iCabbi Bid Maps; TaxiCaller broadcast-bid; Такси-Мастер (min/max chegarasi + sanoq) | Haydovchi o'zi tanlaydi | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| D-40 | **⭐ Auksion faqat ZAXIRA qatlami sifatida** — «аукцион не заменяет, а дополняет привычную систему фиксированных цен»: mashina topilmasa taklif qilinadi | **Maxim** | **Bizga aynan mos gibrid: sukut bo'yicha qat'iy narx, topilmasa mijoz ustama qo'shadi** | [vc.ru](https://vc.ru/transport/94001-) **[ikkilamchi]** |
| D-41 | **Hard-assign (qabul tugmasisiz)** | TaxiCaller | Smena modelida rad javobi tuzilmaviy imkonsiz | [TaxiCaller](https://www.taxicaller.com/manuals/admin-panel/2/en/topic/assignment-settings) **[hujjat]** |
| D-42 | **Karma + kutish vaqti + masofa medianasi**; **rad qilgan/e'tiborsiz qoldirganning kutish vaqti 0 ga tushadi** | **Onde** | «Acceptance %» e'lon qilmasdan jazolash | [Onde queue](https://support.onde.app/en/articles/1047491-intelligent-queue-algorithm) **[hujjat]** |
| D-43 | **Takroriy автораздача** — «N daqiqadan keyin qayta tarqat», ixtiyoriy takroriy rad jazosi bilan | Такси-Мастер | Buyurtma o'lmaydi | [TaxiMaster](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| D-44 | **Parallel ishlovchilar soni** — sukut **1**, maksimum **10** | Такси-Мастер | Dispatch o'tkazuvchanligi sozlamasi | [TaxiMaster](https://help.taximaster.ru/index.php/Автоматическая_раздача_заказов) **[hujjat]** |
| D-45 | **Yo'nalish rejimlari (aniq chegaralar bilan)** — `Мой район` (kuniga **≤2 soat**, sessiya 30 daq–2 soat, radius **3–7 km**, **bonuslar ishlamaydi**) · `Домой` (**kuniga ≤2 marta**, bonuslar **ishlaydi**) · `По делам` (**kuniga 1 marta**, skip jazosi **2 barobar past**) | **Yandex Pro** | Smena oxirida haydovchi onlayn qoladi; har rejimning narxi aniq | [По пути](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/delivery-auto/execution/po-puti) **[hujjat]** |
| D-46 | **Destination filter kvotasi daraja mukofoti sifatida** — Lyft **2 → 3 → 4 → 6** kunlik; 99 **3 → 5** | Lyft, 99 | Bepul, lekin haydovchi uchun juda qadrli mukofot | [Lyft location filters](https://help.lyft.com/hc/en-us/all/articles/115013081128-Using-location-filters) **[hujjat]** |
| D-47 | **Buyurtma almashish markazi (ЦОЗ / order exchange)** — bajarolmagan buyurtmani boshqa xizmatga sotish; **buyurtma yashash muddati** (masalan podacha vaqtidan 10 daqiqa keyin eskiradi va qaytariladi); **3 xil komissiya siyosati** (ijrochidan / ijrochidan + komissiya / **obuna**) | **Такси-Мастер TMMarket**; Autocab **iGo**; Infinity; Таксомёт | **«Mashina yo'q» radini daromadga aylantiradi** | [Схема ЦОЗ](https://help.taximaster.ru/index.php/Схема_работы_центра_обмена_заказами) **[hujjat]** |
| D-48 | **Tashqi agregatorga uzatish (API bilan)** — `GET taxi-routeinfo.taxi.yandex.net/taxi_info` (`clid` + `apikey`) narx, masofa, ETA va sinf ro'yxatini qaytaradi | **Yandex Go Distribution** | **183 «mashina yo'q» radini Yandex mashinasiga uzatish texnik jihatdan mumkin** | [Yandex Go Distribution API](https://yandex.com/support/taxi-distr/en/api/trip-info) **[hujjat]** |
| D-49 | **RL / deep RL dispatch (semi-MDP + Kuhn–Munkres)** | DiDi | Ulkan miqyosda bir necha % | [DiDi, *Interfaces*](https://dl.acm.org/doi/abs/10.1287/inte.2020.1047) **[ilmiy]** |
| D-50 | **`no_drivers_available` terminal holati** | Uber Guest Rides API | **Bizda ataylab teskari (rescue queue) — bu bizning ustunligimiz** | [Uber dev docs](https://developer.uber.com/docs/guest-rides/guest-ride-api-build-guide/dispatch-and-cancellation) **[hujjat]** |
| D-51 | **Bekordan keyin qayta qidiruv chegarasi** — instant **2-**, oldindan bron **5-**bekorda o'ladi | Onde | Cheksiz aylanish yo'q | [Onde re-search](https://support.onde.app/en/articles/4358698-new-driver-search-for-cancelled-orders) **[hujjat]** |
| D-52 | **`As Directed` zona turi** — «yo'lovchi aniq manzil qo'ymaganda» haydovchi kiradigan zona | **Autocab** | **Manzilsiz buyurtma birinchi darajali dispatch holati sifatida modellashtirilgan** | [Autocab Zone List](https://support.autocab.com/portal/en/kb/articles/zone-list-365-management) **[hujjat]** |
| D-53 | **Встречные заказы** (qarama-qarshi yo'nalishdagi buyurtmalarni juftlash) | Таксомёт | Bo'sh yurishni kamaytirish | [Taxomet](https://taxomet.ru/functions/) **[hujjat]** |
| D-54 | **Smena oxiri qo'riqchisi** — smena tugashidan oshadigan ish tayinlanmaydi | TaxiCaller | Yarim yo'lda tashlash yo'q | [TaxiCaller](https://www.taxicaller.com/manuals/admin-panel/2/en/topic/assignment-settings) **[hujjat]** |
| D-55 | **`There in Time`** — oldindan bronga ulgurmaydigan taklif ko'rsatilmaydi | iCabbi | Prebooking buzilmaydi | [iCabbi Drive](https://icabbi.com/platform/drive/) **[marketing]** |

## 1.3 NARX (pricing)

| # | Funksiya | Kim | Muammo | Manba |
|---|---|---|---|---|
| N-1 | **Taximetr rejimlari**: `Time + mileage`, `Time or mileage` (`Speed threshold` dan past — daqiqasiga, yuqori — kilometriga), flag-down, minimal narx | **Onde** | **Manzilsiz narxlash — bizning bozorning aynan mexanikasi** | [Onde meter modes](https://support.onde.app/en/articles/1047503-service-configuration-4-fee-settings-meter-modes-and-rates) **[hujjat]** |
| N-2 | **Zone Tariffs** — narx safar bo'lgan zonaga qarab; ikki zonali safar **qimmatrog'i** bo'yicha | TaxiCaller | Manzilsiz narx | [Zone Tariffs](https://www.taxicaller.com/manuals/admin-panel/3/en/topic/zone-tariffs) **[hujjat]** |
| N-3 | **Flat Tariffs** — ikki zona orasida qat'iy narx, ixtiyoriy `return` | TaxiCaller | Bashoratlilik | [Flat Tariffs](https://www.taxicaller.com/manuals/admin-panel/2/en/topic/flat-tariffs) **[hujjat]** |
| N-4 | **Surge / dinamik narx**; Yandex koeffitsiyenti kirishlari: **A va B nuqtalari, atrofdagi ijrochilar soni, tarif, A dan ketmoqchilar soni** | Uber, Bolt, Yandex | Talab cho'qqisida ta'minot chaqiriladi | [Yandex dev blog](https://dev.go.yandex/blog/dynamic-pricing-platform-2024-06-15) **[blog]** |
| N-5 | **Surge haqiqatan haydovchi chiqaradimi?** — ha, lekin asosan **yarim kunlik**larni; to'liq kunlikning kunlik daromadi tushishi mumkin | Miao et al. 2023 | Surge byudjetini ongli qo'yish | [J. of Operations Management](https://onlinelibrary.wiley.com/doi/abs/10.1002/joom.1223) **[ilmiy]** |
| N-6 | **⭐ Surge'da komissiya chegirmasi** — bazaviy tarifdan **2 barobardan ortiq** qismga komissiya olinmaydi. Misol: 100 → 250 ₽ da komissiya faqat **200 ₽** dan. Kartada binafsha yozuv: «Очень высокий спрос. Комиссия снижена» | **Yandex Pro** | **Surge'ni haydovchiga ko'proq berish — bizning marjamiz uchun arzonroq yo'l** | [Комиссия](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/income-diff/fee-hidem) **[hujjat]** |
| N-7 | **Driver-side surge (mijoz narxi o'zgarmaydi)** | Uber Driver Surge | Mijozni qo'rqitmasdan ta'minot | [Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2021.4058) **[ilmiy]** |
| N-8 | **Bonus zonalar (qat'iy summa, foiz emas)** — zonaga kirib **ochiladi**, keyingi safarga qo'llanadi; **Yandex**: «ko'k zona ichida **qabul qilish** kifoya, A va B tashqarida bo'lishi mumkin» | Lyft Bonus Zones, Yandex «Бонусы по городу» | Tushunarli, byudjeti nazoratda | [Lyft](https://help.lyft.com/hc/en-us/driver/articles/6198177189-driver-bonus-zones), [Yandex Бонусы](https://pro.yandex.com/kz-ru/taraz/knowledge-base/taxi/income-diff/bonuses) **[hujjat]** |
| N-9 | **Reverse bidding** — mijoz narx taklif qiladi, haydovchilar qarshi taklif beradi; **tavsiya etilgan minimal narx** bor va undan ancha past tushirilmaydi; **skip uchun jazo yo'q**; komissiya ~9.5% | **inDrive** | Narx muzokarasi madaniyati | [inDrive: как рассчитывается](https://indrive.com/ru-kz/help/passengers/how-fares-are-calculated) **[hujjat]** — ⚠️ **manzil MAJBURIY** |
| N-10 | **Upfront fare haydovchiga taklifda** — ko'p bozorda **qabul foizi ≥ 85%** shart | Uber | Ongli qaror | [Uber upfront fares](https://help.uber.com/en/driving-and-delivering/article/upfront-fares?nodeId=bc83ed7e-6725-41de-afcb-72d263e5589f) **[hujjat]** |
| N-11 | **Bekor to'lovi + bepul kutish** — Uber: 2 daq → kutish to'lovi, 5 daq → haydovchi bekor qiladi; Bolt: **2 daq** (UK 4 daq, London 2 daq), haydovchi tomonda **5 daq** (UK 4 daq); Grab SG: **birinchi 3 daqiqa bepul**, 3–5 daqiqada bekor → haydovchiga **S$4** | Uber, Bolt, Grab | Haydovchi bekor kutmaydi | [Bolt](https://bolt.eu/en/support/articles/360009458314/), [Grab SG](https://www.grab.com/sg/cancellationpolicy/) **[hujjat]** |
| N-12 | **Haydovchi aybi bo'lsa to'lov YO'Q** — Grab: yo'lovchi ETA'dan **5 daqiqadan ko'p** kutgan bo'lsa bekor to'lovi olinmaydi; Bolt: haydovchining yo'l vaqti va'da qilingandan oshsa to'lov yo'q | Grab, Bolt | Adolat — mijoz qaytadi | [Grab](https://www.grab.com/sg/cancellationpolicy/), [Bolt LV](https://bolt.eu/en-lv/driver/guide/driver-info-guidelines/) **[hujjat]** |
| N-13 | **Bekor to'lovi taqsimoti** — `Do not share cancellation fee with driver`; naqdda ulush yo'q; haydovchi bekor to'lovi **balansdan** | Onde; Bolt (Latviya: **faqat karta safarlarida**) | Pul mantiqi aniq | [Onde](https://support.onde.app/en/articles/1047477-service-configuration-5-fee-settings-cancellation-policy) **[hujjat]** |
| N-14 | **Bekor jarimasi qarshi tomonga to'lanadi** — haydovchi bekor qilsa tarifning 10%i (maks ₹100) **yo'lovchiga**; aeroport/vokzal/kasalxonada **5 barobar**; yo'lovchi sababsiz bekor qilsa 5% **haydovchiga** | Hindiston, Maharashtra qonunchiligi | Jarima platformaga emas, jabrlanuvchiga | [Business Today](https://www.businesstoday.in/india/story/maharashtra-cracks-down-on-ride-cancellations-with-5-fold-penalty-for-ola-uber-drivers-546669-2026-08-01) **[blog]** |
| N-15 | **Платная подача** — uzoq podacha A zonasining km/daqiqa tarifi bilan to'lanadi; **mijoz bekor qilsa ham haydovchi podacha pulini oladi**; bunday buyurtmada **manzil darhol ko'rinadi** | Yandex | Uzoq podachani foydali qiladi | **[ikkilamchi]** |
| N-16 | **Моментальная компенсация** — mijoz kartasi yechilmasa haydovchiga **30 daqiqada** kompensatsiya (komissiya ushlab); mijoz keyin to'lasa qaytariladi | Yandex Pro | Haydovchi tizimga ishonadi | [Мгновенная компенсация](https://pro.yandex.ru/ru-ru/ufa/knowledge-base/taxi/income-diff/instant-compensation) **[hujjat]** |
| N-17 | **Routing engine narxni belgilaydi** — `Straight Line` / o'z dvigateli / Google, **Pricing, ETA va Dispatch uchun alohida** | Autocab | Xarita xarajatini nazorat qilish | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| N-18 | **Zona ustamasi, bayram tariflari** | iCabbi | Mahalliy qoidalar | [iCabbi](https://icabbi.com/platform/dispatch/) **[marketing]** |

## 1.4 HAYDOVCHI TA'MINOTI — bizning bog'lovchi cheklovimiz

### 1.4.1 Rag'bat modellari — mukofot sifatida KOMISSIYA

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| H-1 | **⭐ Komissiya darajalari (mukofot = komissiya)** | **DiDi Advance** (Avstraliya) | Silver **19%** → Gold **12%** (haftada 5 safar, AR 70%, CR 65%) → Platinum **5%** (30 safar, AR 90%) → **Diamond 0%** (80 safar, AR 95%, CR 85%). **Haftalik** hisoblanadi | [rideshareaunz](https://www.rideshareaunz.com/didi-advance-rewards-program-guide-in-australia/) **[ikkilamchi]** |
| H-2 | **⭐ Komissiyasiz obuna** — **₹2 010/oy (~₹67/kun)**, haydovchi tarifning 100%ini oladi | **Ola** (Hindiston) | Naqd bozorda eng tushunarli model | [Outlook Business](https://www.outlookbusiness.com/start-up/news/ola-drivers-can-now-keep-100-fare-under-zero-commission-model-bhavish-aggarwal) **[blog]** |
| H-3 | **Komissiya shaklini haydovchi tanlaydi** — **% har buyurtmadan** yoki **soatlik dostup paketi**; bazaviy komissiya **10% dan**; **brending komissiyani tushiradi va tarqatish prioritetini oshiradi**; balans **ofis va terminallarda naqd to'ldiriladi** | **Maxim** | **Kartasiz naqd iqtisodga aynan mos** | [Maxim FAQ](https://taximaxim.com/pe/en/driver/faq/) **[hujjat]** |
| H-4 | **Smena sotib olish (komissiyasiz)** | Yandex parklari; Такси-Мастер «prioritet sotish» | Bashoratlilik | **[ikkilamchi]** — narxlar manbalarda 10 barobar farq qiladi, **ishonmang** |
| H-5 | **Komissiya kickback** — kunda **5 safar** bajarsang, **6-safardan** komissiyaning **15%i** qaytadi; shart **AR ≥ 40%, CR ≥ 55%** (odatdagi ~60% dan ataylab tushirilgan — «haydovchini ushlab qolish qiyinlashgani uchun») | **Bolt** (Nigeriya) | Past marjada arzon rag'bat | [Technext](https://technext.africa/news/bolt-drivers-eligible-commission-bonus/) **[blog]** |
| H-6 | **Ustuvor komissiya chegirmasi daraja mukofoti sifatida** — Chempion **−4 p.p.**, Legenda **−10 p.p.** (Ekonom 22% → 18%) | Yandex Pro | Pul chiqmaydi, komissiya kamayadi | [Loyalty bonuses](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/privilege-program/loyalty-bonuses) **[hujjat]** |

### 1.4.2 Ball/daraja tizimlari

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| H-7 | **⭐ «Rota 99» — o'yin darajalari** | **99** (Braziliya) | 4 faza: 300 → 2 200 → 5 300 → 9 100 ball. **Ball = kilometr**; **surge safarida km ga 2 ball**. Har oy 1-sanada nolga tushadi. Har fazada: yakunlash foizi (70→80%), reyting 4.85, **destination filter 3→5/kun**, **yoqilg'i chegirmasi 10→17%** | [Educando Seu Bolso](https://educandoseubolso.blog.br/financas-pessoais/ferramentas-e-servicos/rota-99) **[blog]** |
| H-8 | **Ball = kilometr, PODACHA yo'li ham hisoblanadi** | Yandex Pro sodiqlik | «Баллы начисляются за км пробега — **к точке подачи** и на заказах». Anti-farming: **prioritet 10 dan past bo'lsa ball berilmaydi** | [Loyalty](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/privilege-program/loyalty) **[hujjat]** |
| H-9 | **Yandex sodiqlik: 5 daraja** | Yandex Pro | Мастер 1 500 · Профи 6 500 · Эксперт 10 000 · Чемпион 10 000 × **12 oy** · Легенда 10 000 × **36 oy**. **Yiliga bir marta darajani tiklash mumkin** (streak-sug'urta) | [Loyalty](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/privilege-program/loyalty) **[hujjat]** |
| H-10 | **Grab Emerald Circle** | Grab (Singapur) | XP: **Grab olgan har S$1 komissiya = 7 XP**. Emerald 0 · Ruby 8 500 · Sapphire 25 000 · **Diamond 32 000 — faqat taklif bilan, Sapphire'ning eng yaxshi 10%i**, reyting ≥4.7, AR ≥90%. Diamond: **buyurtma tarqatishda ustunlik** | [Firstlane](https://www.firstlane.com.sg/grab-emerald-circle/) **[ikkilamchi]** |
| H-11 | **GrabAllStars** | Grab (Malayziya) | **60 safar + AR ≥50% + CR ≤10% + reyting ≥4.50** → Silver. **Oyiga qayta hisoblanadi, tushib ketish mumkin.** Mukofot: yoqilg'i va motor moyi vaucherlari | graballstars.com **[ikkilamchi]** |
| H-12 | **GSBonus — hajm rebate** | Grab (Singapur) | Oyiga **≥300 avto-qabul qilingan** safar; L1 300–599, L2 600–799, L3 800+; **rebate faqat 300-safardan boshlab sanaladi**; oyning 10-sanasida to'lanadi | [GSBonus](https://www.grab.com/sg/driver/transport/gsbonus/) **[hujjat]** |
| H-13 | **Uber Pro: Blue → Gold → Platinum → Diamond** | Uber | Har safar 1 ball; **yuqori talab soatlarida 3 (ba'zi bozorda 5)**; Gold+ uchun reyting ≥4.85, bekor ≤3%; imtiyoz **+5% tarif**, `Priority Rides` | [Uber Pro](https://www.uber.com/us/en/drive/uber-pro/) **[hujjat]** |
| H-14 | **Lyft Rewards** | Lyft | **$1 daromad = 1 ball; yuqori qabul foizida 1.5–2 ball**. Imtiyoz: destination filter **2/3/4/6**, yoqilg'i keshbek **2/3/7/10–12%**, balans himoyasi $50–200 | [Lyft driver rewards](https://www.lyft.com/driver/rewards) **[hujjat]** |
| H-15 | **⭐ FreeNow: mukofot = DISPATCH USTUNLIGI** | FreeNow (UK) | Bronze/Silver/Gold. Bronze: «standart haydovchilardan ko'proq taklif». Gold: **prebook ishlariga ustuvor kirish, ular standartdan 45% gacha ko'p to'laydi**. **Bekor qilishlar darajaga ta'sir qilmaydi** | [FreeNow loyalty](https://www.free-now.com/uk/drive/taxi/freenow-loyalty/) **[hujjat]** |
| H-16 | **Cabify Stars** | Cabify | 4 daraja, **oylik nolga tushadi**. Silver+: **past talab soatlarida ko'proq taklif** va **rezervatsiya panelini oldinroq ko'rish** | [Cabify Stars](https://cabify.com/es/conductores/cabify-stars) **[hujjat]** |
| H-17 | **Bolt Rewards** | Bolt | **Cho'qqi soatlarda ko'proq ball**; **har oy 1-sanada nolga tushadi**; daraja keyingi oy oxirigacha amal qiladi | [Bolt rewards](https://bolt.eu/en/support/articles/34657/) **[hujjat]** |
| H-18 | **Ola Stars** | Ola | Mukofot: sog'liq sug'urtasi, yoqilg'i chegirmasi, kreditlar, **haydovchi bolalariga stipendiya** | almonds.ai **[ikkilamchi]** |

### 1.4.3 Maqsad, kafolat, referal

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| H-19 | **Yandex uch xil bonus shakli** | Yandex Pro (Qozog'iston sahifasi, ₸) | ① **«Бонусы по городу»** — ko'k zona ichida **qabul qilish** kifoya, komissiya olinadi · ② **«Гарантия»** — «2 buyurtmaga kamida 1 000 ₸», faqat kamomad to'ldiriladi · ③ **«Цели»** — «sutkada 30 safar → 500 ₸», **bonusdan komissiya OLINMAYDI**, ertasi kuni to'lanadi | [Бонусы](https://pro.yandex.com/kz-ru/taraz/knowledge-base/taxi/income-diff/bonuses) **[hujjat]** |
| H-20 | **Uber Quest** | Uber | Safarlar **ketma-ket bo'lishi shart emas**; rad qilsa ham buzilmaydi; **oldindan opt-in shart** | [How Quest works](https://www.uber.com/us/en/blog/how-quest-works/) **[blog]** |
| H-21 | **Consecutive Trips / streak** | Uber, Lyft | Ketma-ket 3 safar; **rad, bekor yoki offline uzadi**; **mijoz bekor qilsa uzilmaydi** | [Uber Help](https://help.uber.com/driving-and-delivering/article/how-does-the-consecutive-trips-promotion-work?nodeId=de983305-076a-40cf-aaf4-7b23f50a0007) **[hujjat]** |
| H-22 | **Ride Challenges** | Lyft | «Du 5:00 – Ju 5:00 orasida 20 safar → $100»; **3 tagacha bosqich**, shaxsiylashtirilgan, **har hafta emas**, **tanlashga 24 soat**, bonus **1 soat ichida** tushadi | [Lyft Ride Challenges](https://help.lyft.com/hc/en-us/all/articles/360001943867-Ride-Challenges) **[hujjat]** |
| H-23 | **Minimal daromad kafolati (MBG)** | Ola Prime Plus (Bengaluru) | Kuniga 6 safar → ₹1 815; 11 → ₹3 300; 18 → ₹4 900; 28 → ₹7 700. **Ola faqat farqni to'laydi** | [Inc42](https://inc42.com/features/ola-prime-plus-deeper-crisis-india-ride-hailing-market/) **[blog]** |
| H-24 | **Kafolatlangan soatlik daromad** | Uber, Lyft, DiDi | DiDi: «Ju 17:00–23:00, 4 soat onlayn + 4 safar → **kafolat $90**» | [rideshareaunz](https://www.rideshareaunz.com/didi-driver-rewards-bonuses-promotions-australia/) **[ikkilamchi]** |
| H-25 | **Haydovchi referali (tasdiqlangan safarlardan keyin)** | Grab SG: **referee 1-haftada 120 safar → $260**, 175 safar → $820. Bolt LV: **60+ safar → €100**, **ayol haydovchi uchun +€50**, referee 60 safargacha park almashtirsa bekor. Gett: **7 kunda ≥8 safar** | Bo'sh ro'yxatdan o'tishga pul to'lanmaydi | [Grab referral](https://www.grab.com/sg/driver-referral/), [Bolt LV](https://bolt.eu/en-lv/driver/guide/driver-info-guidelines/) **[hujjat]** |
| H-26 | **Ayol haydovchilarni jalb qilish** | FreeNow (London): **£500 bonus + 6 hafta komissiyasiz** | Yangi ta'minot segmenti | [Taxi-Point](https://www.taxi-point.co.uk/post/freenow-by-lyft-launches-500-bonus-to-attract-more-female-black-cab-taxi-drivers-in-london) **[blog]** |
| H-27 | **Pul emas, narsa mukofoti** — televizor, muzlatgich, konditsioner | Bolt (Nigeriya) | Naqd byudjetsiz status mukofoti | [BusinessDay](https://businessday.ng/technology/article/bolt-rewards-top-drivers-nationwide-deepens-support-beyond-earnings/) **[blog]** |

### 1.4.4 Haydovchi xarajatiga to'lash (eng arzon rag'bat)

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| H-28 | **⭐ Yoqilg'i chegirmasi darajaga bog'liq** | 99: **10 → 14 → 15 → 17%**, oyiga **R$1 000 gacha**; Bolt NG: haftada **50 safar → ₦10 000**; Grab: benzin vaucherlari; Uklon **DriverUP**: yoqilg'i 10%, sug'urta va texko'rik 20%, ovqat 40% | **Past marjali bozorda pul bermasdan qadr berish** | [99Abastece](https://www.em.com.br/colunistas/educando-seu-bolso/2025/10/7276825-rota-99-como-funciona-o-programa-de-economia-para-motoristas-de-app.html), [Technext](https://techpoint.africa/2023/12/14/bolt-nigeria-fuel-subsidy-bonus/) **[blog]** |
| H-29 | **Xizmat chegirmalari** — moyka, shina, texko'rik keshbek 3% | Yandex Pro | Xarajat bazasiga to'lash | **[ikkilamchi]** |
| H-30 | **Kunlik to'lov, ushlab turish davri yo'q** | Gett | Naqd oqim | [Gett drivers](https://www.gett.com/uk/drivers) **[marketing]** |
| H-31 | **Manfiy balansda avtomatik offline** | Onde | Qarz nazorati (bizda `minDispatchBalance` bor **[o'lchandi]**) | [Onde billing](https://support.onde.app/en/articles/1047523-driver-balance-and-automated-driver-billing-logic) **[hujjat]** |
| H-32 | **Haydovchi charchashi — eslatma va majburiy tanaffus** | iCabbi `Driver Fatigue` | Xavfsizlik + uzoq muddatli ushlab qolish | [iCabbi Drive](https://icabbi.com/platform/drive/) **[marketing]** |

### 1.4.5 Talabni ko'rsatish (demand visibility)

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| H-33 | **⭐⭐ OFFLINE haydovchiga shaxsiy talab signali** — «Personalised Alerts»: **offline** haydovchiga **u odatda yuradigan hotspot**larda talab ko'tarilganda bildirishnoma | **Grab** (SG, TH; PH, MY ga chiqmoqda) | **Ro'yxatdagi yagona mexanika «onlayn mashina kam» ga TO'G'RIDAN-TO'G'RI uriladi** | [Grab driver tools](https://www.grab.com/inside-grab/stories/driver-earnings-productivity-efficiency-tech-tools/) **[blog]** |
| H-34 | **AI ride guidance** — drop-off dan keyin **haydovchi tasdiqlamasdan** eng yaqin hotspot'ga yo'naltiradi | Grab (14 shahar, 80 000+ haydovchi) | **Beta'da onlayn soatiga daromad +21%** | [GrabRideGuide](https://www.grab.com/inside-grab/stories/grabrideguide-our-new-ai-tool-that-predicts-high-demand-areas/) **[blog]** |
| H-35 | **⭐ «Проводник»** — issiqlik xaritasi emas, **bitta tuman aytiladi**: barcha ishlayotgan haydovchilar harakati + trafik + buyurtmalar tahlil qilinadi, **sizning yo'l vaqtingiz hisobga olinadi**, uzoq tumanlar taklif qilinmaydi; **yetib borsangiz prioritet olasiz**; taklif **muddatli** | **Yandex Pro** | **Arzon telefon va shaharni biladigan haydovchi uchun issiqlik xaritasidan yaxshiroq: rangli xarita emas, bitta ko'rsatma** | [Проводник](https://pro.yandex.ru/ru-ru/prokhladnyy/knowledge-base/taxi/app/provodnik) **[hujjat]** |
| H-36 | **Issiqlik xaritasi** — Grab **5 daqiqada** yangilanadi; Onde «hot zone» = buyurtma soni radiusi qamragan haydovchilardan ko'p, **15 daqiqada**; Yandex «Карта спроса» binafsha, chaqmoq tugmasi ostida | Grab, Onde, Yandex, 99 | Qayerga borishni bilish | [Grab MY](https://www.grab.com/my/blog/driver/improved-heat-map/), [Onde](https://support.onde.app/en/articles/2389100-heat-map-in-operator-and-driver-apps) **[blog/hujjat]** |
| H-37 | **Offline heatmap** — **onlayn bo'lmaganda ham** zona bandligini ko'rsatish, 10 daqiqada yangilanadi | Uber (pilot, 23 shahar) | Onlayn bo'lish qaroriga ta'sir | [Uber offline heatmap](https://www.uber.com/us/en/blog/offline-delivery-heatmap/) **[blog]** |
| H-38 | **Heatmap + navigatsiya** — hotspot'ga bosib yo'l olish | Grab | Ma'lumot → harakat | [Grab hotspot navigation](https://www.grab.com/inside-grab/stories/new-hotspot-navigation-feature-shows-drivers-where-they-need-to-be/) **[blog]** |
| H-39 | **Zona ko'rinishi ro'yxati** — har zonada nechta ish bor | Autocab `Zone Visibility`; Uklon | Xaritasiz talab ko'rsatish | [Autocab Driver Companion](https://www.autocab.com/solution/driver-companion) **[marketing]** |
| H-40 | **Haydovchilarga ommaviy xabar — ilova yopiq bo'lsa ham** | Таксомёт | Smena chaqirig'i | [Taxomet](https://taxomet.ru/functions/) **[hujjat]** |

### 1.4.6 Qabul/bekor foizi majburlash

| Operator | O'lchov ta'rifi | Chegara | Jazo | Manba |
|---|---|---|---|---|
| **Bolt** | AR = oxirgi **100 so'rov**dan qabul foizi; **faqat o'z radiusi ichidagi** rad hisoblanadi | «80% dan yuqori yaxshi, 60% dan past yomon» | akkaunt bloklanishi mumkin | [Bolt AR](https://bolt.eu/en/support/articles/10387653657874/) **[hujjat]** |
| **Bolt Driver Score** | Oxirgi **100 qabul qilingan safar**, **har 3 yakunlangan safarda** yangilanadi. Tushiradi: yetib bormay bekor qilish, «yetdim» ni erta/uzoqdan bosish, yo'lovchi o'tirmasdan safarni boshlash, 1–2★ | e'lon qilinmagan | majburiy **«guidance session»** (tugatmaguncha bloklangan); takrorlansa to'xtatish; apellyatsiya **30 kun** ichida | [Bolt driver score](https://bolt.eu/en-lv/driver/guide/ratings/) **[hujjat]** |
| **Bolt (Shveytsariya)** | AR **faqat ma'lumot uchun** — safarga, statusga, akkauntga ta'sir qilmaydi | — | yo'q | [Bolt CH](https://bolt.eu/en/support/articles/37898/) **[hujjat]** |
| **Grab** | Bekor foizi | **≥10%/hafta** → sanksiya; **≥60%** → avtomatik to'xtatish | ogohlantirish → to'xtatish → ban; **xizmat haqi 40% gacha oshiriladi** | [Firstlane](https://www.firstlane.com.sg/grab-tightens-cancellation-policy/) **[ikkilamchi]** |
| **Grab (ID)** | Rag'bat darvozasi | AR ≥60%, CR ≤10%, reyting ≥4.3 | rag'bat to'lanmaydi | tipkerja **[ikkilamchi]** |
| **DiDi** | Haftalik AR + CR | 70 / 90 / 95% | komissiya 19% da qoladi, 0% ga tushmaydi | rideshareaunz **[ikkilamchi]** |
| **Lyft** | AR = oxirgi 100 so'rovdan **qabul qilingan VA yakunlangan**; yo'lovchi bekori hisobga olinmaydi | **Nyu-York: ≥85%** — aks holda upfront tafsilot ko'rinmaydi | funksiya va ball ko'paytuvchisi yo'qoladi | [Lyft AR](https://help.lyft.com/hc/en-us/all/articles/115013077708-Acceptance-rate) **[hujjat]** |
| **inDrive** | — | — | **Rad etish uchun jazo umuman yo'q** | [inDrive driver](https://indrive.com/ru-kz/driver) **[hujjat]** |
| **Autocab** | `Booking Reject Limit`, `Reject Penalty Times` (Account/Cash/App uchun alohida), **`Incremental Penalty Times`**, `Move To Reject Zone` | sozlanadi | oshib boruvchi jazo + jazo zonasi | [Autocab Acceptance Screen](https://support.autocab.com/hc/en-gb/articles/4419138370321-Overview-of-Acceptance-Screen-365-Management) **[hujjat]** |

**Naqsh:** eng kuchli dasturlar rad etishni **jazolamaydi — narxlaydi**. DiDi, 99, Lyft va FreeNow
qabul xulqini **komissiya %i, yoqilg'i chegirmasi %i, destination-filter soni va dispatch
ustunligi** ga aylantiradi. Bolt'ning «optional order» istisnosi — yupqa ta'minot bazasida
o'lchovni adolatli saqlashning eng toza usuli.

## 1.5 OPERATOR KONSOLI

| # | Funksiya | Kim | Muammo | Manba |
|---|---|---|---|---|
| O-1 | **Navbat ustunlari: `Callsign` / `Zone` / `Time Clear`** («mashina qancha vaqtdan beri bo'sh») | Autocab | Bir qarashda kimga berishni ko'rish | [Autocab Dispatch Screen](https://support.autocab.com/hc/en-gb/articles/4418515554193-Using-the-Dispatch-Screen-365-B-D) **[hujjat]** |
| O-2 | **Zona to'ri** — har zonada nechta mashina, holati, navbat tartibi | Autocab | Ta'minot bo'shliqlari | [Autocab](https://support.autocab.com/hc/en-gb/articles/4418515554193-Using-the-Dispatch-Screen-365-B-D) **[hujjat]** |
| O-3 | **Cheksiz operator, mashina soniga to'lov** | TaxiCaller, Такси-Мастер («полный безлимит по водителям») | Kichik park narx modeli | [TaxiCaller](https://www.taxicaller.com/en/features/dispatch-system) **[hujjat]** |
| O-4 | **Mijoz kartasida izohlar (haydovchi uchun va dispetcher uchun alohida)** | SoftTaxi, Onde | Kontekst yo'qolmaydi | [SoftTaxi](https://soft.taxi/features/clients) **[hujjat]** |
| O-5 | **Bitta haydovchi ikkita buyurtmani bir vaqtda bajarishi** (marshrut optimizatsiyasi) | SoftTaxi | Yupqa ta'minotda quvvat | [SoftTaxi](https://soft.taxi/features/orders) **[hujjat]** |
| O-6 | **Avtomatik tayinlash ~20 soniyada; dispetcher harakati ~8 soniyagacha** | SoftTaxi (o'z ko'rsatkichi) | Real benchmark | [SoftTaxi](https://soft.taxi/features/orders) **[hujjat]** |
| O-7 | **Barcha suhbatlar sukut bo'yicha yozib olinadi (MP3)** | Такси-Мастер CallCenter | Nizolarni faktga asoslash | [TaxiMaster CallCenter](https://help.taximaster.ru/index.php/Такси-Мастер_CallCenter:_функционал_доступный_по_умолчанию) **[hujjat]** |
| O-8 | **`Passenger Records & Traffic Light`** — muammoli/ustuvor mijoz belgisi navbatga ta'sir qiladi | iCabbi | Yomon mijozni tizim biladi | [iCabbi](https://icabbi.com/platform/dispatch/) **[marketing]** |
| O-9 | **Map Click Dispatch** (Off / On / On No Confirmation) | Autocab | Bir bosishda qo'lda tayinlash | [Autocab](https://support.autocab.com/portal/en/kb/articles/dispatch-configuration-365-management) **[hujjat]** |
| O-10 | **Wallboard / jonli KPI ekrani** | Autocab Phantom, iCabbi | Smena boshqaruvi | [Phantom](https://www.autocab.com/phantom/) **[hujjat]** |
| O-11 | **Hooks — hodisaga bog'langan avtomatika** (safar tugagach rahmat-SMS) | iCabbi | Marketing avtomatlashadi | [iCabbi](https://icabbi.com/platform/dispatch/) **[marketing]** |
| O-12 | **Ish atributlari**: avto turi, yo'lovchi soni, yuk, **nogironlar aravachasi**, umumiy va haydovchiga maxsus izoh | TaxiCaller | Noto'g'ri mashina yuborilmaydi | [TaxiCaller](https://www.taxicaller.com/en/features/dispatch-system) **[hujjat]** |
| O-13 | **Система событий** (hodisalar jurnali) + **100 dan ortiq standart hisobot** | Такси-Мастер | Nima bo'lganini isbotlash | [TaxiMaster](https://www.taximaster.ru/automatizationservice/) **[marketing]** |
| O-14 | **Ratsiya (PTT) bilan ishlash** — buyurtmani efirga aytish, haydovchi radio orqali tarifni qaytarish | Такси-Мастер (eski rejim), Такси Диспетчер (**SMS, PTT, Java-telefon, GPS-terminal**) | **Eng past texnikali haydovchini ham tizimga ulash** | [Такси Диспетчер](https://taxi-office.ru/) **[hujjat]** |

## 1.6 HAYDOVCHI ILOVASI

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| A-1 | **Yengil ilova (Lite)** — **< 5 MB** yuklab olish, **< 25 MB** o'rnatilgan, **ekranlar orasi < 300 ms**, 2G uchun **ekraniga bitta tarmoq so'rovi**, bitta TCP ulanish | **Uber Lite** (Ola Lite ~1 MB) | Arzon telefon, yomon internet | [Engineering Uber Lite](https://www.uber.com/us/en/blog/engineering-uber-lite/) **[blog]** |
| A-2 | **Xarita ixtiyoriy + joylar keshi offline** — «shaharning eng ko'p joylari keshlanadi, tarmoqsiz ham chiqadi»; ilova ko'p boriladigan joylarni **o'rganadi** | Uber Lite; Autocab `Initial job view = Show Address` | **Bizning bozorda xarita majburiy emas** | [Uber Lite](https://www.uber.com/us/en/blog/engineering-uber-lite/) **[blog]** |
| A-3 | **Text-to-Speech** — buyurtma tafsiloti **va zona nomi** ovoz bilan | Autocab | Rulda ekranga qaramaslik | [Driver Companion](https://support.autocab.com/hc/en-gb/articles/4418113414673-Configuring-Your-Driver-Companion-Settings) **[hujjat]** |
| A-4 | **Taklif oynasi** — Uber **15 s** (ilgari 10), Grab **10 s**, Onde **10 s** (bronda 2 s) | Uber, Grab, Onde | Tezlik ↔ o'ylash | [Uber Help](https://help.uber.com/driving-and-delivering/article/getting-a-trip-request?nodeId=e7228ac8-7c7f-4ad6-b120-086d39f2c94c), [Grab Auto Accept](https://www.grab.com/my/blog/driver/car/auto-accept-for-an-easier-drive-with-grab/) **[hujjat]** |
| A-5 | **Auto Accept** — 10 soniyalik taymerni umuman yo'q qiladi; **zanjirli ishni ham avtomatik oladi**; **GSBonus faqat avto-qabul qilingan safarlarni sanaydi** (ya'ni yoqib qo'ygani uchun pul to'lanadi) | **Grab** | Rulda telefon bosish yo'qoladi | [Grab Auto Accept](https://www.grab.com/my/blog/driver/car/auto-accept-for-an-easier-drive-with-grab/) **[hujjat]** |
| A-6 | **Taklif kartasida ko'rsatiladigan narsalar** — Bolt: joy, vaqt, masofa, kategoriya, to'lov turi, tarif. Maxim: **podacha manzili, taxminiy marshrut, yo'lovchi izohi, qo'shimcha shartlar** | Bolt, Maxim | Ongli qabul | [Bolt offers](https://bolt.eu/en-ua/driver/guide/offers/) **[hujjat]** |
| A-7 | **Mijoz reytingi va ismini taklifda ko'rsatish** (sozlama) | Onde | Ongli qabul | [Onde driver settings](https://support.onde.app/en/articles/3468054-driver-settings) **[hujjat]** |
| A-8 | **⭐ Manzil ko'rinishi — sotiladigan/mukofotlanadigan resurs** — DiDi: **Gold+ dan** ko'rinadi; Lyft NYC: **AR ≥85%** da; Yandex: **«Гибкий» rejimi pullik** (komissiyaga qo'shimcha %), **«Эффективный»** da faqat uzoq safarlarda ko'rinadi va **bonuslar ishlaydi** | DiDi, Lyft, Yandex | **Taqiqlash o'rniga monetizatsiya qilish** | [Yandex режимы дохода](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/income-diff/income-mode) **[hujjat]** |
| A-9 | **Zona ko'rinishi / navbat o'rni «X/Y»** | Такси-Мастер TMDriver | Xaritasiz adolat | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| A-10 | **Uch doimiy indikator: server ulanishi · GPS · автораздача filtri** | Такси-Мастер TMDriver | «Nega buyurtma kelmayapti?» savolini o'ldiradi | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| A-11 | **Holat tugmalari: Free / Busy (ko'cha ishi) / Away / Street job** | TaxiCaller; Yandex «На линии/Занят» | Ko'cha ishi tizimga ko'rinadi | [TaxiCaller driver guide](https://www.taxicaller.com/files/Quick%20Guide%20-%20Driver%20App.pdf) **[hujjat]** |
| A-12 | **«Hand» tugmasi — joriy safardan keyin offline** (keskin uzilish emas) | Bolt | Chiroyli chiqish | [Bolt](https://bolt.eu/en/support/articles/115004213034/) **[hujjat]** |
| A-13 | **Daromad paneli + «o'tkazib yuborilgan imkoniyat»** | iCabbi | Motivatsiya | [iCabbi Drive](https://icabbi.com/platform/drive/) **[marketing]** |
| A-14 | **Achievements / Dostijeniya** + KPI dashboard + **smenaga chiqishni onlayn sotib olish** | Такси-Мастер TMDriver | Gamifikatsiya + naqd oqim | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| A-15 | **Offline: ilova serversiz ochiladi, lekin buyurtma qabul qila olmaydi** | Такси-Мастер TMDriver | **Halol cheklov — global vendorlarda hujjatlashtirilgan haydovchi-offline rejimi UMUMAN topilmadi** | [TMDriver](https://help.taximaster.ru/index.php/Мобильное_приложение_TMDriver) **[hujjat]** |
| A-16 | **Offline Sync** | JungleWorks Tookan | Internet uzilganda ish yo'qolmaydi | [Tookan](https://jungleworks.com/tookan/features/) **[marketing]** |
| A-17 | **QR bilan to'lov, karta bog'lamasdan** | Такси-Мастер, Careem | Naqd bozor | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| A-18 | **Фотоосмотр (avtomobil holati fotosuratlari)** | Такси-Мастер, Yandex | Sifat nazorati | [TMDriver](https://help.taximaster.ru/index.php/TMDriver_(New)_для_Android) **[hujjat]** |
| A-19 | **Hujjat muddati + avtobloklash** | iCabbi `Driver Docs` | Qonuniy risk | [iCabbi Driver Docs](https://icabbi.com/platform/driverdocs/) **[marketing]** |
| A-20 | **SOS / Panic** | iCabbi, Uklon, hammasi | Xavfsizlik | [iCabbi Drive](https://icabbi.com/platform/drive/) **[marketing]** |
| A-21 | **minSdk pastligi** — kas1067 `minSdk 21`, bizniki **26** **[o'lchandi]** | kas1067 | Eski telefonli haydovchi bizni o'rnata olmaydi | `RAQIB_TAHLIL.md` §2.6 |

## 1.7 FIRIBGARLIK QALQONI

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| F-1 | **Mock-location blokirovkasi** — soxta GPS ilovasi faol bo'lsa **smena boshlanmaydi** | TaxiCaller (`Block fake GPS`) | Eng arzon va eng samarali qadam | [TaxiCaller KB](https://www.taxicaller.com/en/help/kb/7kM1YfvqG0Xd8vBo) **[hujjat]** |
| F-2 | **⭐ No-show ikki shartli testi** — ETA'dan **> 3 daqiqa** kechikish **VA** olib ketish nuqtasidan **> 200 m** uzoqlik | **Onde** | Boshqa joyda turib «mijoz chiqmadi» deyishni bitta shart bilan o'ldiradi | [Onde cancellation](https://support.onde.app/en/articles/1047477-service-configuration-5-fee-settings-cancellation-policy) **[hujjat]** |
| F-3 | **⭐ Yandex bekor qoidalari** — prioritet ball yo'qotasiz agar: **10 daqiqa kutmasdan** «mijoz chiqmadi» desangiz; **podacha nuqtasidan 300 metrdan uzoqda** turib bekor qilsangiz; «На месте» ni umuman bosmasangiz | **Yandex Pro** | Ob'ektiv, tekshiriladigan, odam hakamligisiz | [Отмена заказа](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/app/cancel) **[hujjat]** |
| F-4 | **Kutish rejimi avtomatikasi** — «На месте» → «Ждать»; **tezlik 5–7 km/soatdan oshsa kutish o'zi o'chadi** | Yandex Pro | Soxta kutish to'lovi yo'q | [Ожидание](https://pro.yandex.com/by-ru/minsk/knowledge-base/taxi/app/waiting) **[hujjat]** |
| F-5 | **⭐ Selfi autentifikatsiyasi (to'liq spetsifikatsiya)** — uchta trigger: **① «Onlayn» bosilganda tasodifiy · ② har yangi qurilmada · ③ safar tugagach tasodifiy**; **safardan keyingi selfi 15 daqiqa ichida** bo'lishi shart, oshsa to'xtatish; birinchi muvaffaqiyatsizlik → **majburiy GrabAcademy trening + test**, ikkinchisi → **shaxsan markazda tekshiruv** | **Grab** (Malayziya) | Akkaunt ijaraga berish/almashishga qarshi | [Grab selfie auth](https://www.grab.com/my/driver-selfie-authentication-feature/) **[hujjat]** |
| F-6 | **⭐ Yuzni DAVLAT bazasiga solishtirish** — **Denatran** (yo'l harakati vazirligi) bazasidagi surat bilan; ikki qatlam: **liveness** + **similarity**; kunning istalgan vaqtida tasodifiy qayta tekshiruv | **99** (Braziliya) | O'zi yuklagan suratga emas, davlat yozuviga solishtirish | [TI Inside](https://tiinside.com.br/13/05/2019/99-lanca-reconhecimento-facial-para-100-dos-motoristas/) **[blog]** |
| F-7 | **Проверка селфи** — oval ichiga surat, oldingi selfilar bilan solishtiriladi | Yandex Pro | Bir xil maqsad | [Идентификация](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/safety/identification) **[hujjat]** |
| F-8 | **⭐ Ilovadan tashqari safar (off-app leakage) bilan kurash** — algoritmik jazo (to'xtatish yoki daromad kamaytirish); mijoz tomonida **«ilovadan tashqari safar taklifini xabar qilish»** tugmasi; **Pickup PIN** (mijoz raqam aytadi, safar shundan keyin boshlanadi). **Natija: ilovadan tashqari safarlar 6 oyda 42% kamaydi** | **Bolt** (Nigeriya) | **Kichik shaharda haydovchi va mijoz bir-birini biladi — bu oqma bizda dunyodagidan kattaroq bo'lishi mumkin** | [TechCabal](https://techcabal.com/2025/07/10/bolt-cuts-offline-trips/) **[blog]** |
| F-9 | **GPS-spoof aniqlash ko'p signal bilan** — telemetriya + qurilma sensorlari + uyali minora signallari **tarixiy xulq bilan** solishtiriladi; **Device Intelligence** barmoq izi; **graph networks** guruhlarni ochadi | Grab **GrabDefence** | E'lon qilingan firibgarlik darajasi **0.2%** | [GrabDefence](https://www.grab.com/inside-grab/stories/grabdefence-anti-fraud-technology-for-southeast-asias-digital-age/) **[blog]** |
| F-10 | **Hujum tavsifi** — root qilingan telefon + soxta-GPS ilovasi bilan safar simulyatsiyasi; **soxta podacha masofa/tarifni 20–40% shishiradi** | Singapur, Grab hodisasi | Nima izlash kerakligini aytadi | [Malay Mail](https://www.malaymail.com/news/world/2019/05/18/in-singapore-drivers-use-gps-spoofing-fake-apps-to-defraud-grab-says-ride-s/1754139) **[blog]** |
| F-11 | **Interactive No Fare** — tizim yo'lovchiga qo'ng'iroq qiladi, u tugma bosib tasdiqlaydi; **`Original Queue Position`** (rost no-show bo'lsa navbat saqlanadi) | Autocab | Yolg'on «kelmadi» arzon emas | [Autocab](https://support.autocab.com/hc/en-gb/articles/4419138370321-Overview-of-Acceptance-Screen-365-Management) **[hujjat]** |
| F-12 | **1:N yuz dedublikatsiyasi referal zanjirida** + qurilma barmoq izi | Sanoat amaliyoti | O'z-o'ziga referal halqasini o'ldiradi | [Fingerprint.com](https://fingerprint.com/blog/ride-sharing-fraud/) **[marketing]** |
| F-13 | **Видеоконтроль, тайные покупатели, tezlik va haydash uslubi monitoringi** | Yandex Pro | Sifat qatlami | [Yandex KB](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi) **[hujjat]** |

## 1.8 ANALITIKA VA SIFAT

| # | Funksiya | Kim | Muammo | Manba |
|---|---|---|---|---|
| An-1 | **ETA post-processing (DeepETA)** — routing engine ETA'si + ML **qoldiq** modeli; dvigatelni qayta yozmasdan aniqlik | Uber | ETA aniqligi = ishonch | [DeepETA](https://www.uber.com/us/en/blog/deepeta-how-uber-predicts-arrival-times/) **[blog]** |
| An-2 | **⭐ Reyting sovuq start yechimi** — yangi haydovchiga **100 ta avtomatik besh yulduz** beriladi; reyting **oxirgi 150 baho**dan, yaqin bahoga ko'proq vazn; **4.5 dan past → kirish yopilishi mumkin**; reyting → prioritet: **>4.95 → +8 · >4.9 → +4 · 4.6–4.9 → 0 · 4.5–4.6 → −6 · <4.5 → −10** | **Yandex Pro** | Yangi haydovchi birinchi yomon bahodan o'lmaydi | [Рейтинг](https://pro.yandex.ru/ru-ru/moskva/knowledge-base/taxi/rides/raiting) **[hujjat]** |
| An-3 | **Reyting sozlamalari** — «oxirgi X kun baholari», «oxirgi X baho», **«baholar X dan kam bo'lsa sukut reytingi Y»** | Такси-Мастер | Sovuq start + oyna | [Рейтинг водителя](https://help.taximaster.ru/index.php/Рейтинг_водителя) **[hujjat]** |
| An-4 | **11 omilli haydovchi reytingi, dispatch shuni hisobga oladi** | Таксомёт | Ko'p omilli sifat | [Taxomet](https://taxomet.ru/functions/) **[hujjat]** |
| An-5 | **Maxim reyting mexanikasi** — **har kuni** qayta hisoblanadi, maksimum **0.99**, oyna **30–100 buyurtma**. Oshiradi: layk, AVTO buyurtmani qabul qilish, **yulduzli buyurtma**, oldindan bron, **cho'qqi soatlar (6–9 va 16–20)**, operatorga kam murojaat. Tushiradi: dizlayk, AVTO rad, bronni **20 daqiqa qolganda** bekor qilish | Maxim | Nima muhimligini haydovchiga aniq aytadi | [taximaxim blog](https://shchuche.taximaxim.ru/blog/useful/2219-kak-podnat-svoj-rejting-v-taksi/) **[ikkilamchi]** |
| An-6 | **Qo'ng'iroq analitikasi + wallboard** | Autocab Phantom | Operator quvvatini o'lchash | [Phantom](https://www.autocab.com/phantom/) **[hujjat]** |
| An-7 | **Standart taxi KPI'lari** — utilization, acceptance rate, cancellations, on-time pickup %, o'rtacha kutish, **No Car Available (NCA)** | Sanoat | Bizning 21.5% aynan NCA | [Modeliks](https://www.modeliks.com/industries/transportation/taxi-kpis-dashboard) **[marketing]** |
| An-8 | **Safarni qayta o'ynash (route/time/price/feedback)** | Onde | Nizoni faktga asoslash | [Onde operator app](https://onde.app/operator-app) **[marketing]** |

## 1.9 MIJOZ SODIQLIGI

| # | Funksiya | Kim | Aniq mexanizm | Manba |
|---|---|---|---|---|
| M-1 | **Kupon dasturlari** — `Personal`/`Shared code`, `Fixed`/`Dynamic` (% + limit), `Orders per coupon`, `Coupon lifetime`; **chegirma summasi safar tugagach haydovchi balansiga alohida tranzaksiya bo'lib tushadi** | **Onde** | **Aksiya haydovchini jazolamaydi — bizning tanga tizimi uchun to'g'ridan-to'g'ri naqsh** | [Onde coupons](https://support.onde.app/en/articles/2951821-coupon-programs) **[hujjat]** |
| M-2 | **Obuna (Uber One / Bolt Plus)** — chegirma, ustuvor olib ketish, bepul bekor qilish | Uber, Bolt | Takroriylik | [Bolt Plus](https://bolt.eu/en/plus/) **[hujjat]** |
| M-3 | **Mijoz darajalari** — oyiga 15 safar → Gold, +50% ball | Careem | Oylik chastota | pointcheckout **[ikkilamchi]** |
| M-4 | **Korporativ hisoblar** — bo'lim bo'yicha hisob, oylik invoys, tasdiqlash oqimi | iCabbi BookBusiness, TaxiCaller Online Office, Такси-Мастер korporativ kabinet | **Kichik shaharda barqaror bazaviy talab** | [TaxiCaller Online Office](https://www.taxicaller.com/en/features/online-office) **[marketing]** |
| M-5 | **Saqlangan joylar + ko'p to'xtash + ilova ikonkasidan tez buyurtma** | Grab, Bolt | Takroriy buyurtma tezligi | [Grab tips](https://www.grab.com/inside-grab/stories/book-grab-rides-product-feature-tips/) **[blog]** |
| M-6 | **Belgilangan olib ketish nuqtalari** | Uber | Noto'g'ri joyda kutish → bekor kamayadi | [Uber pickup spots](https://www.uber.com/us/en/ride/how-it-works/pickup-spots/) **[hujjat]** |
| M-7 | **Совместные поездки, bonus va referal tizimi, karta to'lovi** | Такси-Мастер moduli | Tayyor MDH to'plami | [TaxiMaster](https://www.taximaster.ru/automatizationservice/) **[marketing]** |

## 1.10 O'ZBEKISTON BOZORI — kontekst va ⚠️ ogohlantirishlar

| Fakt | Raqam | Manba |
|---|---|---|
| Agregatorlar orqali safar (2025) | 479 mln safar, $799.6 mln (aylanma +63%, safar +50%) | [Kursiv](https://uz.kursiv.media/en/2026-08-03/more-than-pricing-uzbekistans-ride-hailing-market-gets-crowded/) **[blog]** |
| Yetakchi ulushi | ~85–86% (Yandex Go); **Uklon o'zini 8–10% va ikkinchi o'rin deb ataydi** | [gazeta.uz](https://www.gazeta.uz/ru/2025/10/27/ride-hailing/) **[blog]** |
| Yandex Go O'zbekiston | **179 000 haydovchi va 49 000 kuryer** (2025-iyun); H1 2025 da ~$340 mln topilgan (+50% y/y) | [gazeta.uz](https://www.gazeta.uz/oz/2025/07/03/yandex-go/) **[blog]** |
| Yandex Go park komissiyasi | **13% → 14.6%** (2023-dekabr, YHXK sababli). Parklar javoban o'z komissiyasini 4.5%→4%, 3–5%→1–4% ga tushirgan | [gazeta.uz](https://www.gazeta.uz/oz/2023/12/07/yandex-go/) **[blog]** |
| Haydovchi bazasi | **>95% shaxsiy avtomobil** — «avtoparklar ulushi kichik» | [gazeta.uz](https://www.gazeta.uz/ru/2025/10/27/ride-hailing/) **[blog]** |
| Ish rejimi | To'liq kunlik **25–30 safar/kun**, yarim kunlik **3–4**; to'liq kunlik daromadi 8–10 mln so'm/oy | gazeta.uz **[blog]** |
| Litsenziya | **300 000 so'm/yil** davlat boji; 2025-iyuldan agregatorlar 100 mln so'mdan ortiq topganlar uchun **soliq agenti** | gazeta.uz **[blog]** |
| **⚠️ Toshkentda telefon buyurtmasi — atigi ~1–1.5%** | Bizda 89.4% | gazeta.uz **[blog]** |
| **MyTaxi.uz boshlang'ich tariflari** | **Ekonom 24 000 · Komfort 26 000 · Premium 45 000 so'm** | [drivers.mytaxi.uz/plans](https://drivers.mytaxi.uz/plans) **[hujjat]** |
| Uklon O'zbekiston | 2023-iyunda ishga tushdi; **2025 da Toshkentda >15 mln safar**; **2026 da Farg'ona vodiysining 5 shahriga chiqmoqda** | [spot.uz](https://www.spot.uz/ru/2023/06/22/taksi-uklon/), [gazeta.uz](https://www.gazeta.uz/ru/2026/08/05/uklon/) **[blog]** |
| **⚠️ Такси-Мастер O'zbekistonda** | **«O'zbekistonda 50+ taxi xizmati Такси-Мастер'da ishlaydi»**; dastur **to'liq o'zbek tiliga tarjima qilingan**; **O'zbekiston OFD'siga integratsiya ishga tushirilgan** | [taximaster.uz](https://taximaster.uz/) **[marketing]** |

### ⚠️ Uchta ogohlantirish

1. **Fiskal chek (OFD) — huquqiy talab.** Такси-Мастер O'zbekiston OFD integratsiyasini alohida
   sotuv nuqtasi qilib ko'rsatadi. **Bizning yadroda bu bormi — tekshirilmagan.** Bu bo'lmasa
   kas1067 dan uzilish huquqiy muammo tug'dirishi mumkin. **Ega hal qilishi kerak.** **[xulosa]**
2. **Raqib texnologiyasi arzon va mahalliylashtirilgan.** Такси-Мастер o'zbek tilida, OFD bilan,
   50+ xizmatda ishlaydi. Bu «bizdan boshqa hech kim qila olmaydi» degan taxminni buzadi.
   Bizning ustunligimiz texnologiya emas — **mijoz bazasi (bot, tanga, o'yin) va tezlik** bo'lishi
   kerak. **[xulosa]**
3. **Uklon Farg'ona vodiysiga chiqmoqda.** Viloyat shaharlariga agregator kirishi boshlangan.
   Qarshi/Koson bo'yicha aniq ma'lumot topilmadi — **ega mahalliy tekshirishi kerak.**
   Vaqt oynasi cheklangan. **[xulosa]**

### ⚠️ Raqam nomuvofiqligi

Milliy o'rtacha safar $1.67 ≈ 21 000 so'm; MyTaxi Ekonom **boshlang'ich** 24 000 so'm; bizda
mijoz to'lovi **~62 000 so'm**. Farq katta. Ehtimol bizdagi 62 000 shaharlararo yoki ko'p
yo'lovchili safarlarni o'z ichiga oladi. **Narx va rag'bat byudjeti qarorlari shunga bog'liq —
tekshirilishi shart.** **[xulosa]**

---

# 2. TOP-30 ENG FOYDALI — bizning uch raqamimizga qarab

**Uch raqam:** ① onlayn mashina (16.5) · ② rad javobi (21.5%) · ③ ilova ulushi (10.6%).
**Narx:** S = ≤ 3 kun · M = 4–10 kun · L = > 10 kun (bitta muhandis).
**Cheklov testi:** «yozish 98% · manzil yo'q · kichik shahar · arzon telefon» sharoitida omon qoladimi?

| # | Funksiya | ① Onlayn | ② Rad | ③ Ilova | Narx | Cheklov | Izoh |
|---|---|---|---|---|---|---|---|
| 1 | **FCM push jonlantirish (ikki kanal)** | ↑↑↑ | ↓↓↓ | — | **M** | ✅ | Audit K4: ikki tomonda o'lik. Yetmagan taklif = rad. Qolgan hamma narsa shunga suyanadi |
| 2 | **Broadcast (NED) — bir buyurtma 3–5 haydovchiga** (D-2, D-4) | ↑ | **↓↓↓** | ↑ | **M** | ✅ | 238 «haydovchi radi» ga to'g'ridan-to'g'ri uriladi. 75 s → ~15 s. Lyft ilmiy isboti |
| 3 | **Offline haydovchiga shaxsiy talab signali** (H-33) | **↑↑↑** | ↓↓ | — | **M** | ✅ | Ro'yxatdagi yagona mexanika «onlayn mashina kam» ga to'g'ridan-to'g'ri uriladi (Grab) |
| 4 | **Приоритет = virtual metr** (D-13) | ↑↑ | ↓↓ | — | **S** | ✅ | Skoringga bitta hisob. «Eng yaqin» va «yaxshi» ni bitta raqamga birlashtiradi |
| 5 | **Uzoq podacha — jazosiz skip + «optional order» belgisi** (D-18, D-19) | **↑↑** | ↓ | — | **S** | ✅ | Adolatsiz jazo — haydovchini offline'ga haydaydigan #1 sabab. Bu uni yopadi |
| 6 | **Kartada oqibatni ko'rsatish: «+N qabul / −M skip»** (D-21) | ↑↑ | ↓↓ | — | **S** | ✅ | Bir qator matn, katta xulq o'zgarishi |
| 7 | **Zanjirli buyurtma / forward dispatch** (D-7, D-8) | **↑↑** | ↓↓ | — | **M** | ✅ | Mashina qo'shmasdan ta'minot. «Hamma band» radini yeydi |
| 8 | **Zona FIFO navbatini dispatch'ga ulash + «X/Y» ko'rsatish** (D-24, D-25) | ↑↑ | ↓ | — | **S** | ✅ | **Modul yozilgan, ulanmagan [o'lchandi]** — eng arzon katta yutuq |
| 9 | **IVR: «1 = o'sha joydan yana», «2 = taksim qani»** (I-3, I-2, I-9) | — | ↓ | **↑↑↑** | **M** | ✅ | 1 748 qo'ng'iroq/oy. Manzil kerak emas — oxirgi joy |
| 10 | **CTI screen-pop + manzil tarixidan taklif** (I-6, I-7) | — | ↓ | ↑↑ | **S–M** | ✅ | Operator 20 s maqsadiga shu bilan yetadi. Endpointlar bizda bor |
| 11 | **Mock-GPS blokirovkasi** (F-1) | — | — | — | **S** | ✅ | Pul mexanikasi yoqilishidan **oldin** shart |
| 12 | **No-show/bekor qoidalari: 10 daqiqa + 300 metr + 200 m testi** (F-2, F-3) | ↑ | ↓ | — | **S** | ✅ | Ob'ektiv, tekshiriladigan, odam hakamligisiz |
| 13 | **Overlay taklif + ekran yonadi + TTS** (A-3) | ↑ | **↓↓** | — | **M** | ✅ | Kas'da bor, bizda faqat Home tab'da. Ko'rilmagan taklif = rad |
| 14 | **Idle-time / daromad tenglashtirish skoringda** (D-23) | **↑↑** | ↓ | — | **S** | ✅ | Kuchsiz haydovchi ham pul topadi → qoladi |
| 15 | **Komissiya darajalari (mukofot = komissiya)** (H-1, H-6) | **↑↑** | ↓ | — | **M** | ✅ | Pul chiqmaydi. 1 700 so'm/safar marjada eng arzon rag'bat |
| 16 | **Yoqilg'i/texko'rik chegirma hamkorligi** (H-28) | ↑↑ | — | — | **S** (shartnoma) | ✅ | Kod emas, kelishuv. Har dastur shunga keladi |
| 17 | **Kunlik maqsad (Цели) — bonusdan komissiya olinmaydi** (H-19, H-20) | **↑↑** | — | — | **M** | ✅ | `incentives` moduli bor **[o'lchandi]**. Opt-in, ketma-ketlik shart emas |
| 18 | **Haydovchi referali (tasdiqlangan N safardan keyin)** (H-25) | **↑↑** | ↓ | — | **S** | ✅ | 550 bazadan onlaynga ko'chirish |
| 19 | **«Проводник» — bitta tuman aytiladi (heatmap emas)** (H-35) | **↑↑** | ↓ | — | **M** | ✅ | Arzon telefon + shaharni biladigan haydovchi uchun heatmap'dan **yaxshiroq** |
| 20 | **Buyurtma birjasi + avto-qabul + 15 daqiqalik da'vo muddati** (D-35, D-36, A-5) | ↑↑ | ↓↓ | — | **M** | ✅ | Maxim shu model bilan MDH kichik shaharlarini oldi |
| 21 | **Auksion faqat ZAXIRA qatlami** (D-40) | ↑ | **↓↓** | — | **M** | ⚠️ Qisman | Taximetrda «mijoz ustama qo'shadi» shaklida. Manzil talab qilmaydi |
| 22 | **Radius bosqichli + qattiq shift** (D-30, D-31) | — | ↓↓ | — | **S** | ✅ | 5 km qat'iy → 3/5/8, `Max Dispatch Distance` bilan |
| 23 | **Manzil qidiruvida xato-chidamli topish** | — | ↓ | **↑↑** | **M** | ⚠️ | **Yozish 98%** — qidiruv sifati = ilova ulushi. Fuzzy **tanlash** taqiq; faqat **ko'rsatish** |
| 24 | **«Oxirgi safarni takrorlash» bir bosishda** (I-7, M-5) | — | — | **↑↑** | **S** | ✅ | Uber Lite «ko'p boradigan joylarni o'rganadi» naqshi |
| 25 | **Ilovasiz SMS kuzatuv havolasi (Ride Booker naqshi)** (I-19) | — | ↓ | ↑ | **S** | ✅ | Telefon buyurtmachisiga ham «kuzatish» beradi. Ko'chishning yumshoq ko'prigi |
| 26 | **Yengil ilova rejimi: xaritasiz, keshli, < 300 ms** (A-1, A-2) | ↑↑ | ↓ | ↑↑ | **M** | ✅ | Arzon telefon + yomon internet aynan bizniki |
| 27 | **minSdk 26 → 23** (A-21) | ↑↑ | — | ↑ | **S** | ⚠️ | **Avval o'lchash** — `driver_sessions.deviceModel` da jonli taqsimot bor |
| 28 | **Off-app leakage: Pickup PIN + xabar tugmasi** (F-8) | — | — | ↑↑ | **M** | ✅ | Kichik shaharda bu oqma dunyodagidan **kattaroq**. Bolt: −42% |
| 29 | **Reyting sovuq start (100 ta 5★) + reyting→prioritet jadvali** (An-2) | ↑ | ↓ | — | **S** | ✅ | Yangi haydovchi birinchi yomon bahodan o'lmaydi |
| 30 | **Buyurtma almashish / tashqi agregatorga uzatish** (D-47, D-48) | — | **↓↓↓** | — | **L** (siyosiy) | ✅ Texnik | 183 «mashina yo'q» radini daromadga aylantiradi. **Ega qarori** |

## 2A. MASHHUR, LEKIN BIZGA MOS EMAS — va nega

| Funksiya | Kim | Nega bu bozorda ishlamaydi |
|---|---|---|
| **inDrive reverse bidding (to'liq shaklda)** | inDrive | **Manzil MAJBURIY** — butun muzokara narxlangan marshrut ustida boradi. Taximetrda oldindan narx kelishuvi tuzilmaviy imkonsiz. Faqat «mijoz ustama qo'shadi» qismi (D-40) ko'chiriladi |
| **Batched matching** | Uber | 63 buyurtma/kunda batch to'planmaydi. Kutish qo'shadi, foyda bermaydi. ⚠️ Istisno: Yandex'ning bufer/Vengriya rejimi **cho'qqi 15 daqiqada** mantiqli bo'lishi mumkin |
| **RL / deep learning dispatch** | DiDi | Kuniga o'n millionlab qaror uchun. Bizda 63. O'qitish ma'lumoti yo'q |
| **Ride pooling** | Uber Pool, Grab | Manzilsiz safarlarni birlashtirib bo'lmaydi |
| **Xarita ignasini asosiy yo'l qilish** | Barcha global ilovalar | «Hech qachon» ishlatiladi (`TAXI_10X_PLAN` §2.4) |
| **Mijozga metrli masofa/ETA** | Uber | Katalog joyiga boriladi; soxta aniqlik birinchi xatoda ishonchni o'ldiradi |
| **Destination filter (mijoz manziliga qarab)** | Uber, Lyft, 99 | Manzil yo'q — filtrlash uchun maydon yo'q. **Faqat zona bo'yicha** varianti ishlaydi (`Мой район` naqshi) |
| **Manzil ko'rinishini pullik qilish («Гибкий»)** | Yandex | Bizda ko'rsatadigan manzil yo'q. Sotadigan narsa yo'q |
| **Aeroport FIFO (aeroport uchun)** | Uber, Yandex | Qarshida aeroport oqimi kichik. **Ayni mexanizm bozor va avtovokzalga yo'naltirilsin** |
| **Uber One tipidagi obuna** | Uber, Bolt | Tanga tizimi shu vazifani bajaradi; ikkinchi valyuta chalkashtiradi (CLAUDE.md §5) |
| **USSD kanali** | Little Cab | Telegram bizning «ilovasiz» kanalimiz. USSD — operator shartnomasi, past qaytim |
| **Voice AI (LLM operator) — hozir** | iCabbi, Autocab | Qarshi shevasi uchun model yo'q; xato manzil = noto'g'ri joyga taksi. **DTMF IVR (raqam bosish) avval**; Такси-Мастер robotining «tanilmasa odamga o'tkaz» qoidasi majburiy |
| **Hard-assign (rad etish imkoniyatisiz)** | TaxiCaller | Haydovchilar mustaqil (O'zbekistonda >95% shaxsiy avtomobil); majburlash = ommaviy chiqish |
| **Alohida ratsiya ilovasi** | kas1067/TaxiCloud | Ikkinchi ilova = ikkinchi o'rnatish to'sig'i. PTT konsol va ilova **ichida** |
| **Onde/iCabbi/Autocab sotib olish** | — | $4 500 + $99/oy + tushum ulushi = bugungi butun sof foyda (`RAQIB_TAHLIL` §5B). ⚠️ **Lekin Такси-Мастер arzonroq va o'zbekcha — ega baholab ko'rishi kerak** |

---

# 3. BIZGA MOS TOP-10 (DARHOL) — tartib bilan

Tartib **xavf va bog'liqlik** bo'yicha. Har birida **bitta raqam** bor — u qimirlamasa, ish tugamagan.

### 0. (Sprintdan oldin) O'LCHOV — chunki 6 ta asosiy raqam hozir umuman o'lchanmaydi
Hodisalar: `order.created` → `dispatch.offer_sent` (haydovchi, urinish, doira) →
`dispatch.offer_response` (**accept / reject / timeout — ajratilgan**, javob vaqti bilan) →
`order.assigned` → `order.no_drivers` (**sabab bilan**) → `order.completed` / `order.cancelled`
(**kim va sabab**).
**Qabul mezoni:** 7 kun ma'lumot yig'ilgach panel ko'rsatadi: tayinlash vaqti median/p95,
**«238 haydovchi radi» ning necha foizi bosilgan rad, necha foizi jim taymer**.
Bu raqam kelmaguncha 2-band va 13-band orasidagi ustuvorlik taxmin.

### 1. FCM push jonlantiriladi (push + socket, ikki kanal)
Audit K4: server `sendToDriver` chaqirmaydi, ilovada `google-services.json` yo'q.
**Qabul mezoni:** ilova **majburan o'ldirilgandan keyin** yuborilgan 20 ta test taklifining
**≥ 19 tasi ≤ 5 soniyada** telefonda ko'rinadi (server log timestamp ↔ ilova log).

### 2. Broadcast dispatch (Onde green/yellow naqshi)
1-doira: eng yaxshi haydovchiga **10 s** eksklyuziv. 2-doira: qolgan 3 taga **bir vaqtda 15 s**,
g'olib — birinchi bosgan (first-accept). Radius 3 → 5 → 8 km, qattiq shift 8 km.
**Qabul mezoni:** buyurtmadan tayinlashgacha **median < 20 s, p95 < 45 s**, 7 kun ketma-ket,
≥ 300 buyurtmada. Hozirgi nazariy eng yomon — 75 s.

### 3. Adolat paketi: uzoq podacha jazosiz + «Занят» bepul + kartada oqibat
Uchtasi birga chiqadi, chunki alohida chiqsa ma'nosi yo'q:
- Uzoq podacha (masalan > 4 km) skip'i **prioritetga tegmaydi**, kartada «bu buyurtmani o'tkazish
  bepul» deb yoziladi (Bolt «optional order» naqshi).
- Ochiq «Bandman» **bepul**; **jim taymer tugatish** jazolanadi.
- Kartada bosishdan oldin: **«qabul +N · o'tkazish −M»**.
**Qabul mezoni:** taklifga **javob berish foizi ≥ 85%** (ya'ni jim taymer < 15%) — va **onlayn
mashina kamaymaydi** (14 kun kuzatuv).

### 4. Prioritet = virtual metr (Такси-Мастер naqshi) + reyting sovuq starti
`driver-scorer` ga: prioritet balli **metrga aylantiriladi** va masofadan ayiriladi. Yangi
haydovchiga **100 ta avtomatik 5★** (Yandex naqshi). Reyting → prioritet jadvali.
**Qabul mezoni:** yaxshi xulqli haydovchilar (yuqori qabul foizi) **statistik ravishda ko'proq
taklif oladi** (A/B yoki oldin/keyin taqqoslash bilan isbot) — va **taklif qabul foizi oshadi**.
**⚠️ Kill-switch flag ortida, DARK chiqariladi.**

### 5. Zona FIFO navbatini dispatch'ga ulash + «X/Y» ko'rsatish
`getNextInQueue()` hozir **hech qachon chaqirilmaydi** **[o'lchandi]**. Ilovada navbat o'rni
«3/11» ko'rinishida. Sticky zone: ko'chadan yo'lovchi olsa o'rin saqlanadi.
**Qabul mezoni:** eng band 2 zonada (bozor, avtovokzal) navbat ishlaydi va o'sha zonalarda
**o'rtacha onlayn mashina soni ≥ 30% oshadi** (14 kunlik o'rtacha, oldingi 14 kunga nisbatan).

### 6. Offline haydovchiga talab signali + «bugun shuncha topding» + Проводник
Uchta qatlam, eng arzonidan: ① **offline** haydovchiga «bozor atrofida hozir talab yuqori» push
(Grab Personalised Alerts naqshi) · ② bosh ekranda bugungi daromad · ③ **bitta tuman aytadigan
Проводник** (rangli xarita emas).
**Qabul mezoni:** o'rtacha onlayn mashina **16.5 → 25** (30 kunlik o'rtacha, birinchi bosqich).

### 7. Zanjirli buyurtma (safar tugashiga ~3–5 daqiqa qolganda)
Такси-Мастер qoidasi bilan: «bo'shash vaqti podacha vaqtidan X daqiqadan ko'p oshmasa navbatga qo'y».
**Qabul mezoni:** buyurtma/mashina **3.8 → 4.5**; zanjirli takliflar qabul foizi ≥ 60%.

### 8. IVR + CTI paketi
IVR: **`1` = o'sha joydan yana · `2` = taksim qani (ABOP) · `3` = operator**. CTI: qo'ng'iroqda
**telefon, ism, safar tarixi, oldingi manzillar** ochiladi; operator **tasdiqlaydi**, yozmaydi.
Автоинформатор mashina rusumi/rangi/raqami va vaqtini aytadi.
**Qabul mezoni:** qo'ng'iroqlarning **≥ 30%i operatorsiz yakunlanadi**; operatorning bir
buyurtmaga vaqti **< 20 s** (o'lchanadi).

### 9. Qalqon: mock-GPS + bekor/no-show qoidalari
Mock-GPS faol bo'lsa smena boshlanmaydi. Bekor qoidalari: **10 daqiqa kutmasdan «chiqmadi»
yo'q**, **300 metrdan uzoqda bekor qilish jazolanadi**, no-show testi **>3 daqiqa VA >200 metr**.
**Qabul mezoni:** soxta-GPS bilan smena boshlash **0/10** (test qurilmasida); «no-show»
da'volarining **100%i** ikki shartdan o'tadi (log bilan isbot).

### 10. Rag'bat: kunlik maqsad + komissiya darajalari + yoqilg'i chegirmasi
- **Цели**: «bugun 8 safar → X» — **bonusdan komissiya olinmaydi** (Yandex naqshi), opt-in.
- **Darajalar**: mukofot **naqd pul emas, komissiya chegirmasi** (DiDi/Yandex naqshi).
- **Yoqilg'i**: mahalliy shoxobcha bilan shartnoma, daraja bo'yicha chegirma (99/Bolt naqshi).
**Qabul mezoni:** onlayn mashina **25 → 40**; va `simEconomy` bilan isbot: har berilgan rag'bat
1 700 so'm/safar foydasi ichida, **bir safar emissiyasi ≤ 350 tanga** (CLAUDE.md buzilmas qoidasi).

---

# 4. TEZLIK VA SIFAT REJASI

## 4.1 TEZLIK

| O'lchov | Hozir | Maqsad | Qanday |
|---|---|---|---|
| **Tayinlash vaqti (median)** | o'lchanmaydi; nazariy eng yomon **75 s** **[o'lchandi]** | **< 20 s** | Broadcast: 10 s eksklyuziv + 15 s parallel |
| **Tayinlash vaqti (p95)** | — | **< 45 s** | Radius 3→5→8 km; 2-doirada birja rejimi |
| **Operator: qo'ng'iroqdan buyurtmagacha** | qo'lda, o'lchanmagan | **< 20 s** | CTI screen-pop + manzil tarixi + tasdiq tugmasi (SoftTaxi'ning dispetcher harakati ~8 s ko'rsatkichi orientir) |
| **IVR bilan yakunlangan qo'ng'iroq** | 0% | **≥ 30%** (1-bosqich), **≥ 60%** (2-bosqich) | Autocab Phantom «70%» ni da'vo qiladi — bizga 30% ham katta |
| **Ilova javobi (ekran ↔ ekran)** | o'lchanmagan | **< 300 ms** | Uber Lite naqshi: ekraniga bitta so'rov, keshlangan katalog |
| **Push yetib borish (ilova o'ldirilgan)** | ~0% (K4) | **≥ 95% ≤ 5 s** | FCM high-priority + socket + foreground service |
| **APK hajmi (haydovchi)** | 22 MB (debug) **[da'vo]** | **release < 12 MB** | Kas 12.1 MB. Katta APK = o'rnatmaslik sababi |
| **8 soatda o'tkazib yuborilgan buyurtma** | noma'lum | **0** | `no_drivers` terminal emas (bizda shunday **[o'lchandi]**) + o'lik buyurtma sweep'i |

**Tezlikning yashirin qoidasi:** tezlikni radiusni cheksiz kengaytirib olib bo'lmaydi. Ta'minot
kam bo'lganda uzoqqa yuborish **samarali ta'minotni kamaytiradi** (wild goose chase, D-32).
`Maximum Nearest Dispatch Distance` **qattiq** bo'lishi kerak; undan narisi **operator qarori**,
avtomatik emas.

## 4.2 SIFAT

| O'lchov | Hozir | Maqsad | Qanday |
|---|---|---|---|
| **Rad javobi (umumiy)** | 21.5% | **1-bosqich < 12%**, 2-bosqich **< 5%** | Broadcast + adolat paketi + zanjir + navbat |
| **— haydovchi radi qismi (238/oy)** | — | **< 100/oy** | Push (T-1), broadcast (T-2), adolat (T-3), overlay+TTS |
| **— mashina yo'q qismi (183/oy)** | — | **< 90/oy** | Zanjir, offline signal, navbat, (keyin) buyurtma almashish |
| **ETA aniqligi** | o'lchanmaydi | **median |xato| < 2 daqiqa** | Routing ETA + **tarixiy tuzatish** (DeepETA naqshining arzon varianti): joy-juftlik × soat bo'yicha o'rtacha qoldiq. ML shart emas |
| **Taklifga javob foizi** | o'lchanmaydi | **≥ 85%** | Push + overlay + TTS + sanoq halqasi |
| **Haydovchi ushlab qolish (30 kunlik faol)** | o'lchanmaydi | bazani o'lchash → **+20%** | Darajalar, yoqilg'i, tiniq qarz, adolat paketi |
| **Mijoz takroriyligi (30 kunda 2+ safar)** | o'lchanmaydi | bazani o'lchash → **+15%** | «Yana o'sha joydan», tanga, rost ETA, SMS kuzatuv havolasi |
| **Ilovadan tashqari safar (leakage)** | o'lchanmaydi | bazani o'lchash → **−40%** | Pickup PIN + xabar tugmasi (Bolt: −42%) |
| **Batareya (8 soat onlayn)** | noma'lum | **≤ 25%** | Foreground service, holatga qarab GPS chastotasi |

## 4.3 Bosqichli tartib (bog'liqliklar bilan)

```
0-hafta    O'lchov hodisalari + panel                       ← boshqa hammasi shunga suyanadi
1–2-hafta  FCM push (T-1)                                   ← taklif yetmasa qolgani ma'nosiz
3-hafta    Broadcast (T-2) + radius bosqichi + qattiq shift ← eng katta rad-javob yutug'i
4-hafta    Adolat paketi (T-3): jazosiz skip · «Занят» · oqibat matni
5-hafta    Prioritet = metr + reyting sovuq start (T-4)     ← DARK flag ortida
6-hafta    Zona navbati + «X/Y» (T-5)                       ← modul bor, ulash arzon
7-hafta    Qalqon: mock-GPS + bekor qoidalari (T-9)         ← puldan OLDIN
8–9-hafta  Overlay + TTS + taklif kartasi
10-hafta   Zanjirli buyurtma (T-7)
11-hafta   IVR + CTI (T-8)
12-hafta   Offline signal + daromad ekrani + Проводник (T-6)
13-hafta   Rag'bat: Цели + darajalar + yoqilg'i (T-10)      ← simEconomy isboti bilan
```

**Har bosqich darvozasi:** o'sha bandning qabul mezoni raqami qimirlamaguncha keyingisi
boshlanmaydi (CLAUDE.md DoD R8: qisman = qisman).

---

# 5. NIMANI QILMASLIK KERAK

| Qilmaslik | Kim mashhur qilgan | Nega bu bozorda pul yeydi |
|---|---|---|
| **Manzil maydoni qo'shish** | Uber, Bolt, Yandex, inDrive | Bu bozorda manzil tushunchasi **mavjud emas** (`TAXI_10X_PLAN` §2.4). Yo'q narsani loyihalash |
| **inDrive modelini to'liq ko'chirish** | inDrive | **Manzil majburiy** — butun muzokara narxlangan marshrut ustida. Faqat «mijoz ustama qo'shadi» qismi olinadi |
| **Batched matching** | Uber | 63 buyurtma/kunda batch to'planmaydi |
| **RL / deep learning dispatch** | DiDi | Kuniga o'n millionlab qaror uchun. Bizda 63 |
| **Ride pooling** | Uber Pool, Grab | Manzilsiz safarlarni birlashtirib bo'lmaydi |
| **Xarita ignasini asosiy yo'l qilish** | Global ilovalar | «Hech qachon» ishlatiladi |
| **Mijozga metrli masofa/ETA** | Uber | Katalog joyiga boriladi; soxta aniqlik ishonchni o'ldiradi |
| **Manzil ko'rinishini pullik xizmat qilish** | Yandex «Гибкий» | Bizda ko'rsatadigan manzil yo'q |
| **Acceptance-rate ni ochiq foiz sifatida e'lon qilish va jazolash** | Uber, Bolt, Grab | O'yinlashtiriladi va norozilik keltiradi. **Onde naqshi yaxshiroq: rad qilganning kutish vaqti nolga tushadi** — ko'rsatkichsiz, natijasi bir xil |
| **Barcha rad etishni jazolash** | Ko'p platforma | **Adolatsiz jazo — haydovchini offline'ga haydaydigan #1 sabab.** Uzoq podacha va radiusdan tashqari buyurtma **bepul** o'tkazilishi shart (Yandex + Bolt) |
| **Voice AI (LLM operator) — hozir** | iCabbi, Autocab | O'zbek/Qarshi shevasi uchun model yo'q; xato manzil = noto'g'ri joyga taksi. **DTMF IVR avval** |
| **Hard-assign** | TaxiCaller sozlamasi | O'zbekistonda haydovchilarning **>95%i shaxsiy avtomobilda** — majburlash = ommaviy chiqish |
| **Alohida ratsiya ilovasi** | kas1067/TaxiCloud | Ikkinchi o'rnatish to'sig'i. PTT konsol va ilova ichida |
| **Ikkinchi mijoz ilovasi (1067-taxi Mini App)** | — | Mijozlar botda yashaydi |
| **Aeroport FIFO'ni aeroport uchun qurish** | Uber, Yandex | Qarshida aeroport oqimi kichik. Mexanizm bozor va avtovokzalga |
| **Uber One tipidagi obuna** | Uber, Bolt | Tanga tizimi shu vazifani bajaradi (CLAUDE.md §5: tanga **yagona** valyuta) |
| **USSD kanali** | Little Cab | Telegram bizning ilovasiz kanalimiz |
| **Surge'ni asosiy ta'minot richagi qilish** | Uber, Bolt | Surge ta'minot chaqiradi, lekin asosan **yarim kunlik**larni va marjani yeydi (Miao 2023). **Avval bepul richaglar: navbat, signal, zanjir, adolat.** Surge kerak bo'lsa — Yandex naqshi: **2× dan yuqori qismdan komissiya olinmaydi** (bizga arzonroq) |
| **Mijoz tomonini sovrin/aksiya bilan pompash** | Har bir agregator | **Rad javobini oshiradi.** Ta'minot tuzalmaguncha talabni ko'chirish — mijozni raqibga o'rgatish |
| **minSdk ni o'lchamasdan tushirish** | — | 2 kunlik ish 1–2% qurilma uchun bo'lishi mumkin. **Avval `driver_sessions.deviceModel` taqsimoti** |
| **Fuzzy manzil moslashtirish (avtomatik tanlash)** | Ko'p ilova | Noto'g'ri taxmin **real taksini noto'g'ri joyga** yuboradi (`TAXI_10X_PLAN` §8.1 — taqiq). Xato-chidamli **ko'rsatish** mumkin, **tanlash** — yo'q |
| **Xorijiy platforma sotib olish** | Onde, iCabbi, Autocab | $4 500 + $99/oy + ulush = bugungi butun sof foyda. ⚠️ Lekin **Такси-Мастер** arzonroq, o'zbekcha va OFD bilan — **rad etishdan oldin baholansin** |

---

# 6. UCHTA ENG NOZIK QAROR — ega hal qiladi

1. **Fiskal chek (OFD).** Такси-Мастер buni sotuv nuqtasi qiladi. Bizning yadroda bormi?
   Bo'lmasa — kas1067 dan uzilish huquqiy muammo. **Tekshirilishi shart.**
2. **Buyurtma almashish / tashqi uzatish.** 183 «mashina yo'q» radini boshqa dispetcherga yoki
   Yandex Go Distribution API'siga uzatish texnik jihatdan mumkin. Bu — **mijozni yo'qotmaslik**
   yoki **raqibni oziqlantirish**? Faqat ega hal qiladi.
3. **Tезlik oynasi.** Uklon 2026 da Farg'ona vodiysining 5 shahriga chiqmoqda; Yandex Go 179 000
   haydovchi bilan ishlaydi. Qarshi/Koson qachon qamraladi — noma'lum. **Qancha vaqtimiz bor
   degan savol texnik emas, strategik.**

---

# 7. NIMA QAMRALMAGAN — halol ro'yxat

1. **Qarshi/Koson'da Yandex Go yoki Uklon bormi** — manbalar zid, aniqlanmadi.
2. **Bizning yadroda OFD/fiskal chek bormi** — tekshirilmagan.
3. **«238 haydovchi radi»** — bosilgan rad mi yoki jim taymer mi, ajratilmagan. **TOP-10
   tartibiga ta'sir qiladi.**
4. **62 000 so'm vs milliy $1.67 / MyTaxi 24 000 so'm** nomuvofiqligi — tekshirilmagan.
5. **iCabbi sozlama nomlari** — ochiq hujjat yo'q, hammasi vendor da'vosi.
6. **Autocab iGo komissiyasi** va qabul/rad oqimi — oshkor emas.
7. **inDrive** bid radiusi, nechta haydovchiga yetishi, bid chegaralari — oshkor emas.
8. **Yandex «Гибкий» aniq %i** va **smena narxlari** — manbalar 10 barobar farq qiladi.
9. **Namba Taxi (Bishkek)** — haydovchi mexanikasi umuman e'lon qilinmagan.
10. **«Лидер Такси», «ТаксофонЪ», «Диспетчер 24»** — CRM mahsulot sifatida mavjudligi
    tasdiqlanmadi.
11. **Global vendorlarda hujjatlashtirilgan HAYDOVCHI offline rejimi topilmadi** — Bolt, Grab,
    Careem, Ola, 99, DiDi, Gett, FreeNow, Cabify, Lyft ning hech birida. Bu **haqiqiy bo'shliq**,
    qidiruv xatosi emas. Bizning offline navbatimiz — **haqiqiy differensiator bo'lishi mumkin**.
12. **HALE, Limo Anywhere, Cab Startup, Piiaf, JungleWorks Yelo** — foydali narsa chiqmadi.

---

*Bu hujjat ochiq manbalarga va o'z kodimizni o'qishga suyanadi. Hech bir raqib kodi ko'chirilmagan
— faqat xatti-harakat va spetsifikatsiya. Har funksiya o'z kodimiz bilan qayta quriladi.*
