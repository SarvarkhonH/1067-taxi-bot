# O‘YIN — LIVE TIKETLARI

_2026-08-18 · 8 yo‘nalish tadqiqoti (109 tiket) · har topilma skeptik-agent tomonidan rad etishga urinilgan_

> **Manba:** 43 agentlik workflow — 6 quyi-tizim + 2 admin yo‘nalishi tadqiq qilindi, kritik/yuqori topilmalar alohida skeptik-agentlar tomonidan qayta tekshirildi. 8 ta da‘vo rad etilib ro‘yxatdan chiqarildi. Bunga qo‘shimcha: izolyatsiyalangan Docker-Postgres‘da 29 stsenariyli to‘liq o‘yin-o‘tishi (o‘yinchi-agent).

---

## 1. Qisqa javob (ega savollari)

| Savol | Javob |
|---|---|
| Ulashish ishlaydimi? | Texnik zanjir **ishlaydi**, lekin uchta yolg‘on va‘da bilan: poster mavjud bo‘lmagan ilovani ko‘rsatadi, `/j/` sahifa DARK o‘yinni va‘da qiladi, tugma «+0 ball qo‘shildi» deydi. |
| Hikoya ishlaydimi? | **Kodda to‘liq, amalda yo‘q** — 24 soatlik SLA‘ning ijrochisi yo‘q, rasm serverda saqlanmaydi, tasdiqlashni faqat ega bosa oladi. |
| Ball to‘g‘ri beriladimi? | **15 manbadan 12 tasi to‘g‘ri.** Uchtasi buzuq: taklif-sybil ball yo‘lini qamramaydi, telefon-ball mavsum tashqarisida yo‘qoladi, `spent` oynasi asimmetrik. |
| Karta to‘g‘ri ishlaydimi? | **Yadro toza** (gno atomik/takrorlanmas, Feistel 200 000 raqamda 0 to‘qnashuv, maxfiylik yopiq). Uch teshik: 30 soniya ochilmaslik, KO-kod tirajda yo‘q, tekshiruv sahifasiga kirish yo‘li yo‘q. |
| O‘yin umuman yaxshi ishlaydimi? | **Hali yo‘q.** Skelet mustahkam, lekin 11 ta bayroqdan-oldingi va 17 ta tirajgacha bo‘lgan bloker bor. |

---

## 2. Bugun kechga yoqish mumkinmi?

**HA, LEKIN 11 TA TUZATISHDAN KEYIN** — va tirajgacha (25-sentabr) yana 17 ta majburiy.

Muhim ajratma: har bir nuqson bir xil paytda tishlamaydi.

- **A-guruh (11 ta)** — bayroq yoqilgan **birinchi daqiqadan** mijozga ko‘rinadi yoki pul oqizadi. Bularsiz yoqib bo‘lmaydi.
- **B-guruh (17 ta)** — faqat **tiraj/mavsum yakunida** tishlaydi (25-sen). Bugun yoqishga to‘sqinlik qilmaydi, lekin 25-sentabrgacha shart. Eng og‘iri shu guruhda: g‘olibga xabar yetmasligi mumkin.
- **S-guruh (4 ta)** — admin panelidagi xavfsizlik teshiklari. O‘yinga bog‘liq EMAS, **hozir jonli**. Bayroqdan oldin ham, keyin ham — shoshilinch.
- **C (23 ta)** — ulgursa yaxshi. **D (54 ta)** — keyin.

### A-guruh: ish hajmi bahosi

| ID | Ish | Hajm |
|---|---|---|
| OY-05 | Fayldan yuklangan sovrin rasmi MIJOZGA hech qachon ko'rinmaydi (photoFileId vitrinaga chiqmaydi) | — |
| OY-06 | Panelda sovrin rasmlari umuman ochilmaydi — nisbiy URL boshqa domenga uriladi | — |
| OY-07 | «🔄 Yangi mavsum (toza boshlash)» standart qiymatlar bilan JIM yiqiladi — arxiv bajariladi, mavsum yozilmaydi | — |
| OY-08 | Taklif sybil-qo'rig'i (bir xil telefon) FAQAT tanga yo'lini himoyalaydi — ball yo'li qo'riqsiz | — |
| OY-09 | Endigina olingan karta 30 soniyagacha «aloqa uzildi» deb ochilmaydi — allTicketRows keshi xaridda tozalanmaydi | — |
| OY-10 | Huquqiy rekvizitlar (tashkilotchi / topshirish joyi / bog'lanish) HALI BO'SH — qoidalar varag'i mijozga «______ (ega to'ldiradi)» ko'rsatadi | — |
| OY-11 | Jim-soat (21:00–08:00) HURMAT QILINMAYDI — o'yin push'lari kechasi ham ketadi; kod izohi teskarisini da'vo qiladi | — |
| OY-12 | Har ulashishda chiqadigan YAGONA rasm — mavjud bo'lmagan ilovaning maketi (prototip ma'lumotsiz jo'natilmoqda) | — |
| OY-13 | /j/ landing va OG-matn hozir DARK bo'lgan o'yinni va'da qiladi — mijozga jonli ko'rinadi | — |
| OY-14 | O'yindagi «Ulashish» mijozga «+0 ball qo'shildi» deydi va vazifalar ro'yxatida «+0» ko'rsatadi | — |
| OY-15 | `/api/oyin/state` bayroq qo'rig'isiz kunlik-topshiriq belgisini yozadi (DARK bo'lsa ham) | — |

> Hajm ustuni qasddan bo‘sh: har birini ochib ko‘rmaguncha soat berish taxmin bo‘ladi. Ega tasdiqlagach birinchi navbatda shu ustun to‘ldiriladi.

### Agar hammasi ulgurmasa — eng kam xavfli muqobil

Bayroqni **yoqmasdan** turib, quyidagilarni bugun tuzatish va ertaga yoqish. Sabab: `oyin` DARK bo‘lgani uchun hech kim zarar ko‘rmayapti — shoshilinchlik sun‘iy. Bir kechada yarim tuzatilgan o‘yinni yoqish esa **qaytarib bo‘lmaydigan** zarar beradi: birinchi taassurot bir marta bo‘ladi, va hozir birinchi taassurot — mavjud bo‘lmagan ilovaning posteri + «+0 ball» toasti + rasmsiz vitrina.

Ikkinchi muqobil: bayroqni yoqib, lekin `oyinShareBall`, hikoya va sprint yo‘llarini knob bilan 0/o‘chirilgan holda qoldirish — shunda A-guruhdan 4 tasi mavzudan chiqadi.

---

## 3. Tiket jadvali

| ID | Triaj | Og‘irlik | Yo‘nalish | Sarlavha | Fayl |
|---|---|---|---|---|---|
| **OY-01** | S | 🔴 critical | Admin (umumiy) | `operator` roli umuman darvozasiz — UI to'liq ega-panelini ko'rsatadi, server yo'l-cheklovi YO'Q | `server.ts:262, server.ts:294, App.ts` |
| **OY-02** | S | 🟠 high | Admin (umumiy) | Ega paroli URL'ga yoziladi va server uni oddiy `===` bilan solishtiradi (timing-leak qaytib kelgan) | `api.ts:267, App.ts, server.ts:3573` |
| **OY-03** | S | 🟠 high | Admin (umumiy) | Admin parolini cheksiz taxmin qilish mumkin — hech qanday rate-limit, blok yoki jurnal yo'q | `server.ts:3771, App.ts, server.ts:216` |
| **OY-04** | S | 🟠 high | Admin (umumiy) | `/api/admin/announce` — barcha foydalanuvchiga xabar, lekin `requireOwner` YO'Q | `server.ts:4020` |
| **OY-05** | A | 🔴 critical | Admin (o‘yin) | Fayldan yuklangan sovrin rasmi MIJOZGA hech qachon ko'rinmaydi (photoFileId vitrinaga chiqmaydi) | `oyinService.ts:4657, oyinService.ts:1041, oyin.ts` |
| **OY-06** | A | 🔴 critical | Admin (o‘yin) | Panelda sovrin rasmlari umuman ochilmaydi — nisbiy URL boshqa domenga uriladi | `Mukofotlar.ts, api.ts:401, api.ts:457` |
| **OY-07** | A | 🔴 critical | Admin (o‘yin) | «🔄 Yangi mavsum (toza boshlash)» standart qiymatlar bilan JIM yiqiladi — arxiv bajariladi, mavsum yozilmaydi | `oyinService.ts:3971, oyinSeason.ts:141, oyinSeason.ts:129` |
| **OY-08** | A | 🟠 high | Ball | Taklif sybil-qo'rig'i (bir xil telefon) FAQAT tanga yo'lini himoyalaydi — ball yo'li qo'riqsiz | `referralService.ts:183, bookingNotifier.ts:696, bookingNotifier.ts:707` |
| **OY-09** | A | 🟠 high | Karta | Endigina olingan karta 30 soniyagacha «aloqa uzildi» deb ochilmaydi — allTicketRows keshi xaridda tozalanmaydi | `oyinService.ts:4717` |
| **OY-10** | A | 🟠 high | Miniapp UI | Huquqiy rekvizitlar (tashkilotchi / topshirish joyi / bog'lanish) HALI BO'SH — qoidalar varag'i mijozga «______ (ega to'ldiradi)» ko'rsatadi | `oyin.ts` |
| **OY-11** | A | 🟠 high | Push/bot | Jim-soat (21:00–08:00) HURMAT QILINMAYDI — o'yin push'lari kechasi ham ketadi; kod izohi teskarisini da'vo qiladi | `notifyService.ts:67, notifyService.ts:91, driverEngageService.ts:67` |
| **OY-12** | A | 🟠 high | Ulashish | Har ulashishda chiqadigan YAGONA rasm — mavjud bo'lmagan ilovaning maketi (prototip ma'lumotsiz jo'natilmoqda) | `invite-poster.jpg, App.ts, telegram.ts:591` |
| **OY-13** | A | 🟠 high | Ulashish | /j/ landing va OG-matn hozir DARK bo'lgan o'yinni va'da qiladi — mijozga jonli ko'rinadi | `index.html:11, oyin.ts:22, featureFlags.ts:182` |
| **OY-14** | A | 🟠 high | Ulashish | O'yindagi «Ulashish» mijozga «+0 ball qo'shildi» deydi va vazifalar ro'yxatida «+0» ko'rsatadi | `oyin.ts, oyinService.ts:950, economy.ts:307` |
| **OY-15** | A | 🟡 medium | Ball | `/api/oyin/state` bayroq qo'rig'isiz kunlik-topshiriq belgisini yozadi (DARK bo'lsa ham) | `server.ts:1504, oyinService.ts:736` |
| **OY-16** | B | 🔴 critical | Push/bot | notifyOnce yetkazilmagan xabarda ham `true` qaytaradi — durable marker qo'yiladi, xabar ABADIY yo'qoladi (g'olib ham shunga kiradi) | `notifyService.ts:84, pushSend.ts:70, oyinService.ts:3502` |
| **OY-17** | B | 🔴 critical | Tiraj | Ega yoki xodim karta olsa — o'sha sovrin ABADIY o'ynalmaydi (sotuv 'to'lgan', tiraj 'not_ready') | `oyinService.ts:3318` |
| **OY-18** | B | 🟠 high | Admin (o‘yin) | Tiraj «tayyor» ko'rinadi, lekin g'olib yozilmaydi — panel sababni ingliz kodi bilan aytadi | `Kartalar.ts, oyinService.ts:1221, oyinService.ts:3318` |
| **OY-19** | B | 🟠 high | Admin (o‘yin) | Chiqarilgan (xodim/sinov/chetlatilgan) kartalar QAYSI a'zoda ekanini ko'rsatadigan ekran yo'q — tiqilinchni yechib bo'lmaydi | `Kartalar.ts, oyinService.ts:2193, oyinService.ts:2132` |
| **OY-20** | B | 🟠 high | Ball | Telefon-ball mavsum tashqarisida BIR MARTA belgilanadi va ABADIY yo'qoladi | `oyinService.ts:1821, oyinService.ts:500` |
| **OY-21** | B | 🟠 high | Karta | Mijoz ko'radigan KO-kod tiraj ro'yxatining hech bir joyida yo'q — g'olib o'z raqamini tanib bo'lmaydi | `oyin.ts, Kartalar.ts, App.ts` |
| **OY-22** | B | 🟠 high | Miniapp UI | Mavsum «upcoming/unset» bo'lganda tab-qatori umuman chizilmaydi — mijoz sotib olgan KARTALARIGA kira olmaydi | `oyin.ts` |
| **OY-23** | B | 🟠 high | Push/bot | T-3 va T-49 soat ogohlantirishlari FINAL-48 qulfidan KEYIN ham yuboriladi — bajarib bo'lmaydigan chaqiriq | `oyinService.ts:3578, oyinService.ts:1686, oyin.ts:498` |
| **OY-24** | B | 🟠 high | Push/bot | Uchala ogohlantirish matnida vaqt QATTIQ KODDA — «7 kun / 24 soat / 1 soat» aslida boshqa vaqtda yetadi | `oyinService.ts:3566` |
| **OY-25** | B | 🟠 high | Push/bot | Sprint (haftalik natija) — g'olibga HECH QANDAY xabar yo'q, natija jimgina tashlab yuboriladi | `index.ts:421, oyinService.ts:2049, oyinService.ts` |
| **OY-26** | B | 🟠 high | Tiraj | adminSetBan bilan xuddi shu abadiy tiqilinch yuzaga keladi | `oyinService.ts:3318` |
| **OY-27** | B | 🟠 high | Tiraj | «Muzlatilgan» ro'yxat aslida muzlamaydi — hash har chaqiruvda o'zgaradi | `oyinService.ts:3888` |
| **OY-28** | B | 🟡 medium | Admin (o‘yin) | Tiraj ro'yxatining KARTA RAQAMLARI panelda ko'rsatilmaydi va eksporti yo'q; g'oliblar bayonnomasida CSV yo'q | `Kartalar.ts` |
| **OY-29** | B | 🟡 medium | Karta | Bekor qilingandan keyin sovrin-ichi raqam (`no`) QAYTA beriladi — bir sovrinda ikkita bir xil №, biri panjaradan yo'qoladi | `oyinService.ts:1625, testCancelRace.ts:53, oyinService.ts:4769` |
| **OY-30** | B | 🟡 medium | Miniapp UI | TIRAJ natijasi o'yin ichida deyarli ko'rinmaydi: g'oliblar ekrani yo'q, `lastWinner` o'yin ekranida ishlatilmaydi, «Telegram kanalimizda» va'dasi havolasiz | `oyin.ts, oyin.ts:952, uy.ts` |
| **OY-31** | B | 🟡 medium | Push/bot | seasonDrawNotify `oyin:tickets:<id>` ni QULFSIZ read-modify-write qiladi (buyTicket qulf oladi) — karta yo'qolishi mumkin | `oyinService.ts:3664` |
| **OY-32** | B | ⚪ low | Karta | Tirajdan chiqarilgan kartalarga (chetlatilgan · xodim · sinov) natija HECH QACHON yozilmaydi — ular abadiy «⏳ O'yinda» bo'lib qoladi | `—` |
| **OY-33** | C | 🟠 high | Admin (o‘yin) | Hikoya tasdiqlash/rad etish server «ok:false» desa ham «✅ Tasdiqlandi» deb yolg'on aytadi | `Hikoyalar.ts, oyinStory.ts:206, res.json` |
| **OY-34** | C | 🟠 high | Admin (o‘yin) | Server aytgan aniq xato sababi API qatlamida tashlab yuboriladi — ekran hech qachon ROSTINI aytmaydi | `api.ts:113, server.ts:2542, oyinSeason.ts:112` |
| **OY-35** | C | 🟠 high | Admin (o‘yin) | To'rtta amalda .catch UMUMAN yo'q — 403/500 bo'lsa ekran mutlaqo jim qoladi | `Kartalar.ts, Sozlama.ts, oyinService.ts:3426` |
| **OY-36** | C | 🟠 high | Admin (o‘yin) | EGA BUGUN KECHQURUN PANEL BILAN QILA OLMAYDIGAN ISHLAR — yig'ma ro'yxat | `Mukofotlar.ts, oyinService.ts:1041, Kartalar.ts` |
| **OY-37** | C | 🟠 high | Admin (umumiy) | Xato = bo'sh ro'yxat: 51 joyda so'rov yiqilsa ekranda "0 ta" chiqadi | `App.ts` |
| **OY-38** | C | 🟠 high | Gashtak | Gashtak boshlig'i har oy o'zini navbatchi qilib tayinlay oladi | `oyinService.ts:3236` |
| **OY-39** | C | 🟠 high | Hikoya | 24-soatlik SLA ijrochisiz — `overdueStoryCount` hech qayerdan chaqirilmaydi (o'z izohi yolg'on) | `oyinStory.ts:230, index.ts, oyin.ts` |
| **OY-40** | C | 🟠 high | Hikoya | Mavsum oynasidan TASHQARIDAGI arizani tasdiqlash — mijozga «ball qo'shildi» deyiladi, ball esa 0 | `oyinStory.ts:181, oyinService.ts:522` |
| **OY-41** | C | 🟠 high | Hikoya | Moderatsiyani EGADAN boshqa hech kim qila olmaydi — nav.ts izohi teskarisini da'vo qiladi | `server.ts:2488, server.ts:327, server.ts:270` |
| **OY-42** | C | 🟠 high | Hikoya | Serverda RASM YO'Q — moderatsiya 24 soatda o'chadigan/login-devor ortidagi havolaga to'liq tayanadi | `api.ts:311, oyinStory.ts:154, oyin.ts:1020` |
| **OY-43** | C | 🟠 high | Miniapp UI | Qo'ng'iroq (ball tarixi) tarmoq xatosini «Hali voqea yo'q» degan BO'SH holatga aylantiradi | `oyin.ts` |
| **OY-44** | C | 🟠 high | Ulashish | Hikoya-posterlarida (posters/*.jpg) hech qanday havola/QR/@username yo'q — hikoyani ko'rgan odam qo'shila olmaydi | `01.jpg, 15.jpg, oyinStory.ts:60` |
| **OY-45** | C | 🟡 medium | Admin (o‘yin) | `oyin` bayrog'ini yoqishning IKKI yo'li bor va bittasida hech qanday ogohlantirish yo'q | `Sozlama.ts, App.ts, server.ts:2132` |
| **OY-46** | C | 🟡 medium | Admin (o‘yin) | v2 panelda O'YIN BO'LIMI UMUMAN YO'Q — `admin_ui=v2` yoqilgan brauzerda konsolga kirib bo'lmaydi | `nav.ts:22, AdminV2.ts, main.ts` |
| **OY-47** | C | 🟡 medium | Ball | UI 0-ballik vazifalarni va'da qiladi: «Ilovaga kirish +0», «Do'stga ulashish +0» | `oyin.ts, economy.ts:306, economy.ts:307` |
| **OY-48** | C | 🟡 medium | Hikoya | Tanlangan poster serverga UMUMAN yuborilmaydi — 30 rasmli panjara bezak, mukofot qoidasiga ta'sir qilmaydi | `oyin.ts` |
| **OY-49** | C | 🟡 medium | Hikoya | Bir xil POSTERNI qayta joylab ball olish mumkin — dedup faqat URL bo'yicha | `oyinStory.ts:141` |
| **OY-50** | C | 🟡 medium | Miniapp UI | «Bugungi vazifalar» ro'yxati 0 ball beradigan vazifalarni «+0» deb ko'rsatadi va progressni shishiradi; ulashish toasti «+0 ball qo'shildi» deydi | `oyin.ts, oyinService.ts:949, economy.ts:306` |
| **OY-51** | C | 🟡 medium | Push/bot | Yakka kartali yutqazish xabarida ma'nosiz raqam: «1 ta karta orasidan boshqa raqam chiqdi» | `oyinService.ts:3678` |
| **OY-52** | C | 🟡 medium | Push/bot | 6 ta xabardan 5 tasi harakat va'da qiladi, lekin TUGMASIZ ketadi | `oyinService.ts:3723, webAppUrl.ts:40` |
| **OY-53** | C | 🟡 medium | Ulashish | Ball ulashish OYNASI ochilgani uchun beriladi, HAQIQIY ulashish uchun emas | `oyin.ts, telegram.ts:611, telegram.ts:626` |
| **OY-54** | C | 🟡 medium | Ulashish | Haydovchi ulashish yo'llari OG-landingdan chetlab o'tadi — poster CHIQMAYDI | `bot.ts:80, recruitService.ts:200, bot.ts:1312` |
| **OY-55** | C | 🟡 medium | Ulashish | Taklif qilingan do'st botda o'yin haqida hech narsa ko'rmaydi — halqa oxirida uzilish | `bot.ts:315, oyin.ts:22, featureFlags.ts:182` |
| **OY-56** | D | 🟡 medium | Admin (o‘yin) | «🧹 Kartalarimni tozalash» hech narsa bekor qilinmasa ham yashil ✅ beradi va 30 tadan keyin jim to'xtaydi | `Sozlama.ts, server.ts:2854, server.ts:227` |
| **OY-57** | D | 🟡 medium | Admin (o‘yin) | «🧪 Men» ekrani 404'da o'lik tugunga aylanadi — na xato, na qaytish tugmasi | `Sozlama.ts, server.ts:2834, oyinService.ts:319` |
| **OY-58** | D | 🟡 medium | Admin (o‘yin) | Ball jadvali knoblari tasdiqsiz va DARHOL saqlanadi; server qiymatni kessa ham panel siz yozgan raqamni «✓» deb ko'rsatadi | `Sozlama.ts, bonusConfig.ts:29` |
| **OY-59** | D | 🟡 medium | Admin (o‘yin) | Komentariyani «abadiy o'chirish» va yozuvchini bloklash tasdiqsiz — bir bosishda bajariladi | `Komentariyalar.ts, Kartalar.ts, Odamlar.ts` |
| **OY-60** | D | 🟡 medium | Admin (umumiy) | Yozuv amallari jimgina yiqiladi — 67 ta `.catch(() => undefined)` va butunlay catch'siz `await`lar | `App.ts, api.ts:112` |
| **OY-61** | D | 🟡 medium | Admin (umumiy) | Qaytarib bo'lmaydigan amallar tasdiqsiz — token bekor qilish, pul to'lash, tanga berish | `App.ts, jamoa.ts, adminOps.ts:189` |
| **OY-62** | D | 🟡 medium | Admin (umumiy) | Token muddatsiz, `?key=` URL'dan localStorage'ga jimgina ko'chiriladi, rotatsiya yo'li yo'q | `api.ts:58, server.ts:3646, App.ts` |
| **OY-63** | D | 🟡 medium | Admin (umumiy) | UI/server rol nomuvofiqligi: v2 nav «ownerOnly» deydi, server esa oddiy admin'ga ruxsat beradi | `nav.ts:96, server.ts:916, nav.ts:97` |
| **OY-64** | D | 🟡 medium | Admin (umumiy) | v2 panelning 26 manzilidan 22 tasi — bo'sh "ko'chirilmagan" plashkasi | `AdminV2.ts, Bugun.ts, Hikoyalar.ts` |
| **OY-65** | D | 🟡 medium | Admin (umumiy) | CSV eksport: yagona-manba `lib/csv.ts` yozilgan, lekin JONLI panel undan foydalanmaydi — BOM'siz va qochirishsiz fayllar | `csv.ts:19, DataTable.ts, App.ts` |
| **OY-66** | D | 🟡 medium | Admin (umumiy) | `req()` da timeout yo'q, `deletePeakHour` esa `req()`dan butunlay chetlab o'tadi | `api.ts:111, res.json, api.ts:524` |
| **OY-67** | D | 🟡 medium | Ball | Jurnal ≠ balans: «phone» qatori linkedAt dan, ball esa oyin:phoneball: belgisidan o'qiladi | `oyinService.ts:4165, oyinService.ts:495` |
| **OY-68** | D | 🟡 medium | Ball | Gashtak (jamoa) balli faoliyat-jadvalidan tushib qoladi — mavsum oyning 1-sanasidan boshlanmasa | `oyinService.ts:4259` |
| **OY-69** | D | 🟡 medium | Ball | Mavsum oynasidan tashqarida tasdiqlangan hikoya: push «ball qo'shildi» deydi, ball 0 | `oyinStory.ts:196, oyinService.ts:522` |
| **OY-70** | D | 🟡 medium | Hikoya | Posterni saqlash uchun TUGMA yo'q — «bosib turing → Rasmni saqlash» Telegram WebView'da ishonchsiz | `oyin.ts, telegram.ts` |
| **OY-71** | D | 🟡 medium | Karta | Ochiq tekshiruv sahifasiga (`?karta=`) ilovada birorta kirish yo'li yo'q — funksiya jonli, lekin o'lik | `main.ts, server.ts:1558, oyin.ts` |
| **OY-72** | D | 🟡 medium | Karta | gno'siz ESKI kartalar bir xil KO-kod olishi mumkin (turli sovrinlarda bir xil `no`) | `oyinService.ts:129` |
| **OY-73** | D | 🟡 medium | Miniapp UI | «Boshlanmagan mavsum» ekranida toast elementi umuman yo'q — xatolar JIM yutiladi | `oyin.ts` |
| **OY-74** | D | 🟡 medium | Miniapp UI | Gashtak yuklanishida XATO holati yo'q va qayta urinish yo'q — abadiy «Yuklanmoqda…» | `oyin.ts` |
| **OY-75** | D | 🟡 medium | Push/bot | T-49 soat oynasida warn3 va warn49h BITTA tikda ket-ket yuboriladi — bir-biriga zid ikki xabar | `oyinService.ts:3578, notifyService.ts:10` |
| **OY-76** | D | 🟡 medium | Push/bot | Bloklagan / bildirishnomani o'chirgan a'zolar markerlanmaydi — 300 lik batch boshini abadiy egallaydi | `oyinService.ts:3527, notifyService.ts:69, oyinService.ts:3504` |
| **OY-77** | D | 🟡 medium | Push/bot | DAILY_PUSH_CAP=2 umumiy, o'yin bloki esa tikda ENG OXIRIDA — vaqt-tanqis mavsum ogohlantirishi engagement push'lar ortida qoladi | `notifyService.ts:10, index.ts` |
| **OY-78** | D | 🟡 medium | Push/bot | F4 safar-yakun ball qatori 60 soniyalik eskirgan keshdan o'qiydi — endigina yig'ilgan ball ko'rinmaydi | `bookingNotifier.ts:797, oyinService.ts:712, cashbackService.ts:85` |
| **OY-79** | D | 🟡 medium | Push/bot | Telegram 429 uchun qayta-urinish YO'Q; SEASON_PUSH_BATCH izohidagi tezlik hisobi noto'g'ri | `oyinService.ts:3504, package.json` |
| **OY-80** | D | 🟡 medium | Tiraj | To'lmagan sovrin mavsumlar orasida muzlab qoladi | `oyinService.ts:1681` |
| **OY-81** | D | 🟡 medium | Ulashish | Hikoyaga (Story) ulashilganda havola Premium bo'lmaganlarda bosiladigan bo'lmaydi — faqat matn ichida qoladi | `telegram.ts:611, oyin.ts` |
| **OY-82** | D | 🟡 medium | Ulashish | Taklif matni «+N so'm» va'da qiladi — jonli N ni tekshira olmadim, 0 bo'lish xavfi bor | `telegram.ts:495, referralService.ts:84, uy.ts` |
| **OY-83** | D | ⚪ low | Admin (o‘yin) | «Kassaga tushgan» — real pul emas, ball×20 hisobi, lekin daromad kabi ko'rsatiladi | `Mukofotlar.ts, oyin.ts:42, oyinService.ts:1742` |
| **OY-84** | D | ⚪ low | Admin (umumiy) | Admin domenida xavfsizlik sarlavhalari yo'q, ustiga uchinchi-tomon skripti token yonida turadi | `package.json, server.ts:351, index.html:6` |
| **OY-85** | D | ⚪ low | Admin (umumiy) | `#kit` dizayn galereyasi autentifikatsiyadan OLDIN render bo'ladi | `main.ts, AdminV2.ts, App.ts` |
| **OY-86** | D | ⚪ low | Admin (umumiy) | Yuklanish holatlari: v1 panelda skeleton amalda yo'q (27 ta spinner/matn, 1 ta skeleton) | `App.ts, kit.ts, Bugun.ts` |
| **OY-87** | D | ⚪ low | Admin (umumiy) | Mobil: asosiy layout to'g'ri, lekin telefonda tizim-salomatligi ko'rsatkichi umuman ko'rinmaydi | `styles.css:250, styles.css:88, styles.css:233` |
| **OY-88** | D | ⚪ low | Ball | `adminCancelTicket` da o'tgan-mavsum qo'rig'i yo'q — izoh «ball o'zi qaytadi» deydi, qaytmaydi | `oyinService.ts:3847, oyinService.ts:1495, target.ts` |
| **OY-89** | D | ⚪ low | Ball | `spent` oynasi asimmetrik: yuqori chegara (`<= toMs`) yo'q | `oyinService.ts:449` |
| **OY-90** | D | ⚪ low | Ball | Buzuq `ts` li chipta HAR KEYINGI mavsumda ham `spent` ga qo'shiladi — yashirin abadiy qarz | `oyinService.ts:449, t.ts` |
| **OY-91** | D | ⚪ low | Ball | Gashtak oylik shifti 200 000 ball — bezak: haqiqiy chegara guruh safarlari, ya'ni manba amalda cheksiz | `economy.ts:354, oyinService.ts:2439, economy.ts:352` |
| **OY-92** | D | ⚪ low | Hikoya | `normalizeStoryUrl` yo'lni kichik harfga tushiradi — halol mijoz «duplicate» deb rad etilishi mumkin (va dedupni chetlab o'tish oson) | `oyinStory.ts:20` |
| **OY-93** | D | ⚪ low | Hikoya | AppState qatori atomik emas — bir vaqtda kelgan yuborish va moderatsiya bir-birini o'chiradi | `oyinStory.ts:126` |
| **OY-94** | D | ⚪ low | Hikoya | ALLOWED_HOSTS'da Facebook bor, UI esa faqat Instagram/Telegram deydi | `oyinStory.ts:38, oyin.ts` |
| **OY-95** | D | ⚪ low | Karta | `oyin:tickets:<id>` ni qulfsiz o'qib-yozadigan ikkita yo'l qoldi (setCardNote, adminRecordWinner) — yo'qolgan yozuv xavfi | `—` |
| **OY-96** | D | ⚪ low | Karta | «Kartalarim»da o'ynab bo'lgan karta ham joriy mavsum sanasini «Mukofot: …» deb ko'rsatadi | `oyin.ts` |
| **OY-97** | D | ⚪ low | Karta | Kod izohlari va admin ekrani kod bilan zid uchta joyda | `oyinService.ts:139, oyin.ts, Kartalar.ts` |
| **OY-98** | D | ⚪ low | Karta | cardCode.ts izohi «ikkita almashtirilgan raqamni 100% ushlaydi» deb yozadi — o'lchov 2.1% o'tib ketishini ko'rsatdi | `cardCode.ts:9` |
| **OY-99** | D | ⚪ low | Miniapp UI | Uchta async varaqda skeleton o'rniga quruq «Yuklanmoqda…» matni | `oyin.ts, CardVerifyView.ts` |
| **OY-100** | D | ⚪ low | Miniapp UI | To'rt joyda rasm `onError` fallbacksiz — buzuq URL brauzerning «singan rasm» belgisini chizadi | `oyin.ts, CardVerifyView.ts` |
| **OY-101** | D | ⚪ low | Miniapp UI | O'nga yaqin bosiladigan element `:active` javobisiz (<100ms qoidasi) | `oyk.css, styles.css` |
| **OY-102** | D | ⚪ low | Miniapp UI | «Do'st chaqirish +N ball» tugmasi shartli ballni shartsiz va'da qiladi | `oyin.ts` |
| **OY-103** | D | ⚪ low | Miniapp UI | Chiptada «Mukofot:» yorlig'i qiymatsiz qolishi mumkin (osilgan yorliq) | `oyin.ts, oyinService.ts:1467` |
| **OY-104** | D | ⚪ low | Push/bot | Marker yozuvi yiqilsa ERTASIGA xabar TAKRORLANADI (dayKey almashadi) | `oyinService.ts:3538, notifyService.ts:68` |
| **OY-105** | D | ⚪ low | Push/bot | bookingNotifier do'st-safar push'i kuniga 1 marta, lekin matn har doim bitta safarlik ball aytadi | `bookingNotifier.ts:736, oyinService.ts:417, bookingNotifier.ts:722` |
| **OY-106** | D | ⚪ low | Push/bot | `referrerOf` findFirst ishlatadi — bir a'zoga ikki taklif qatori bo'lsa push NOTO'G'RI taklifchiga ketishi mumkin | `oyinService.ts:2036` |
| **OY-107** | D | ⚪ low | Tiraj | oyin:seasonclosed:<id> arxivlanmaydi | `oyinService.ts:3802` |
| **OY-108** | D | ⚪ low | Ulashish | Posterlarda ichki raqam fayl nomiga mos kelmaydi va shior ikki xil — brend nomuvofiqligi | `01.jpg, 15.jpg, oyinStory.ts:58` |
| **OY-109** | D | ⚪ low | Ulashish | `.oyk-qr` bloki QR emas, va /api/oyin/qr o'lik endpoint | `oyin.ts, oyk.css:618, server.ts:1749` |

_Triaj: **A** = bugun bloker · **B** = tirajgacha bloker · **C** = kechga · **D** = keyin_

---

## 4. Batafsil tiketlar


## ▶ undefined

### OY-01 · `operator` roli umuman darvozasiz — UI to'liq ega-panelini ko'rsatadi, server yo'l-cheklovi YO'Q

**Triaj:** S · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/server/src/api/server.ts:262-272 — allowlist FAQAT ikki rol uchun yozilgan: `function pathAllowedForShopSeller(path)` va `function pathAllowedForChatOps(path)`. server.ts:294 `const role = sellerMatch ? "shopseller" : chatopsMatch ? "chatops" : raw;` → `raw` = "operator", va 295-303 dagi ikkala `if (role === …)` tekshiruvi o'tmaydi → `next()`. Ya'ni `operator` tokeni BARCHA /api/admin/* yo'llariga kiradi (faqat `requireOwner` bor route'lar 403). Mijoz tomonda: packages/admin/src/App.tsx:174-190 — rol tekshiruvi faqat `if (role === "chatops")` va `if (role === "shopseller")`; `NAV_GROUPS` (App.tsx:64-147) statik, rol bo'yicha filtrlanmaydi → `operator` 33 tabning HAMMASINI ko'radi. Bunday token bir bosishda yaratiladi: App.tsx:956 `onClick={async () => { const r = await adminApi.optoken("operator"); … }}`, server.ts:3652 `const role = req.body?.role === "shopseller" ? "shopseller" : "operator";`

**Oqibat**

Bitta "Operator-token yaratish" tugmasi bilan berilgan token butun biznesni O'QIY oladi: /api/admin/finance, /economy, /transactions, /members, /member360, /driver360, /withdrawals, /banned, /integrity, /analytics/* — hammasi `requireAdmin` (server.ts:3775, 3841, 4125, 3729, 3495, 3915, 4077, 3804). Ustiga yozuv ham: /announce (barcha foydalanuvchiga xabar), /chat/reply, /opr/act (tanga berish/ban), /peak-hours (haydovchilarga TG xabar), /home-featured (mijoz bosh sahifasi), /ravella/*, /calls/*, /sync. Ega "operatorga cheklangan huquq berdim" deb o'ylaydi — aslida deyarli ega huquqi bergan.

**Takrorlash / kuzatish**

Boshqaruv → «🔑 Operator-token yaratish» → chiqqan tokenni `X-Admin-Token` sifatida yubor: `curl -H "X-Admin-Token: <token>" https://api.birjoy.online/api/admin/finance` → 200 (403 emas). Kodda: server.ts:274-325 requireAdmin ni oxirigacha kuzat — "operator" uchun hech qanday `pathAllowedFor…` chaqiruvi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-02 · Ega paroli URL'ga yoziladi va server uni oddiy `===` bilan solishtiradi (timing-leak qaytib kelgan)

**Triaj:** S · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/api.ts:267 `driverStickerUrl: (driverId, token) => `${API_BASE}/api/admin/driver-sticker/${driverId}?token=${encodeURIComponent(token)}``; packages/admin/src/App.tsx:655 `onClick={() => window.open(adminApi.driverStickerUrl(dr.driver!.id, localStorage.getItem("admin_token") ?? ""), "_blank")}`. Server: packages/server/src/api/server.ts:3573 `if (env.ADMIN_PANEL_TOKEN && qToken === env.ADMIN_PANEL_TOKEN) { … res.locals.adminRole = "owner"; return next(); }` — oddiy `===`. Shu faylning o'zida server.ts:250-252 izohi: «a plain === leaks match-length via response timing, letting an attacker recover the admin token byte-by-byte» va shuning uchun `tokenEquals()` yozilgan (server.ts:253-258) — 3573-qatorda u ISHLATILMAGAN.

**Oqibat**

1) To'liq ega tokeni brauzer tarixiga, yangi tab manziliga va Caddy access-logiga (Caddyfile'da `admin.birjoy.online { log … }` va `api.birjoy.online { log … }`) tushadi — ekran surati/skrinshare/log-eksport orqali oqadi va muddati yo'q. 2) `===` tufayli `?token=` yo'li orqali tokenni javob-vaqti bo'yicha bayt-bayt tiklash mumkin — aynan `tokenEquals` yopgan teshik.

**Takrorlash / kuzatish**

Haydovchilar → biror haydovchi → «🖨 QR Stiker» tugmasi. Ochilgan tabning manzil satrida to'liq token ko'rinadi; brauzer tarixida qoladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-03 · Admin parolini cheksiz taxmin qilish mumkin — hech qanday rate-limit, blok yoki jurnal yo'q

**Triaj:** S · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/server/src/api/server.ts:3771 `app.get("/api/admin/health", requireAdmin, async (_req, res) => {…})` — `rateLimit()` YO'Q. Login ekrani aynan shuni uradi: packages/admin/src/App.tsx:4258 `await adminApi.health(); // verifies the credential against the backend`. `rateLimit` esa server.ts:216 `const who = (res.locals.telegramId as string) || \`ip:${req.ip ?? "?"}\`` — `res.locals.telegramId` FAQAT muvaffaqiyatli autentifikatsiyadan keyin qo'yiladi (server.ts:279, 306, 322), ya'ni MUVAFFAQIYATSIZ urinish hech qachon hisoblanmaydi. `packages/server/package.json` da `helmet` ham, `express-rate-limit` ham yo'q. Global middleware faqat: server.ts:351-356 `cors()`, `compression()`, `express.json()`.

**Oqibat**

admin.birjoy.online ochiq internetda (Caddyfile: IP-cheklov, basic-auth, VPN yo'q). Parol bitta umumiy `ADMIN_PANEL_TOKEN` (env.ts:21 `z.string().optional().default("")` — minimal uzunlik talabi ham yo'q). Hujumchi soatiga million urinish qila oladi, ega esa buni BILMAYDI: muvaffaqiyatsiz kirish uchun log ham, Telegram-alert ham yozilmagan. Har noto'g'ri urinish yana `prisma.appState.findUnique` (server.ts:284) chaqiradi → bazaga autentifikatsiyasiz yuk.

**Takrorlash / kuzatish**

`for i in $(seq 1 1000); do curl -s -o /dev/null -w "%{http_code} " -H "X-Admin-Token: guess$i" https://api.birjoy.online/api/admin/health; done` → 1000 ta 403, 429 yo'q, hech qayerda iz qolmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-04 · `/api/admin/announce` — barcha foydalanuvchiga xabar, lekin `requireOwner` YO'Q

**Triaj:** S · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/server/src/api/server.ts:4020 `app.post("/api/admin/announce", requireAdmin, rateLimit(3), async (req, res) => {` — yonidagi qarindosh route'lar `requireOwner` bilan: 4047 `app.post("/api/admin/grant-segment", requireAdmin, requireOwner, rateLimit(3), …)`, 4054 `app.post("/api/admin/wake-up", requireAdmin, requireOwner, rateLimit(3), …)`. Ya'ni pul-berish egaga yopilgan, ommaviy XABAR esa ochiq qolgan. Segment default: 4028 `const seg = b.segment === "linked" || b.segment === "dormant" ? b.segment : "all";`

**Oqibat**

Yuqoridagi #1 bilan birga: har qanday `operator` tokeni butun bot bazasiga (segment=all) matn yubora oladi. `rateLimit(3)` ham himoya qilmaydi — u `res.locals.telegramId`ga bog'lanadi, u esa BARCHA operator tokenlari uchun bir xil `"panel-operator"` (server.ts:306), ya'ni bir batch = mingdan ortiq foydalanuvchi.

**Takrorlash / kuzatish**

`curl -X POST -H "X-Admin-Token: <operator-token>" -H 'Content-Type: application/json' -d '{"text":"test","segment":"all"}' https://api.birjoy.online/api/admin/announce` → 403 emas, yuboriladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---


## ▶ BLOKER — BUGUN (bayroqdan oldin)

### OY-05 · Fayldan yuklangan sovrin rasmi MIJOZGA hech qachon ko'rinmaydi (photoFileId vitrinaga chiqmaydi)

**Triaj:** A · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/server/src/services/oyinService.ts:4657 «p.photoFileId = fileId; if (!fileId) p.photoUrl = dataUrl;» — Telegram muvaffaqiyatli bo'lsa photoUrl TEGILMAYDI (yangi mukofotda u null). Mijoz vitrinasi esa faqat photoUrl yuboradi: oyinService.ts:1041 «photoUrl: p.photoUrl,» — butun repoda photoFileId ni mijoz uchun URL'ga aylantiradigan joy YO'Q (grep 'photoFileId' bo'yicha faqat admin/ravella/shop yo'llari chiqadi). Miniapp: packages/miniapp/src/oyin.tsx:1742 «const showPhoto = !!p.photoUrl && !badPhoto.has(p.key);» → rasm o'rniga emoji. Ishga-tushirish darvozasi esa uni «bor» deb sanaydi: packages/admin/src/oyin/Sozlama.tsx:426 «const withPhoto = open.filter((p) => p.photoFileId || p.photoUrl).length;» va 449-451 «Hammasida rasm bor.»

**Oqibat**

Ega «📤 Rasm yuklandi» toastini, katalogda «📤 yuklangan rasm» yozuvini va ishga-tushirish ro'yxatida «✓ Har mukofotda rasm bor» ni ko'radi — mijoz esa vitrinada faqat 🎁 emojini ko'radi. DIZAYN_QOIDALARI «jismoniy narsa = real rasm» qoidasi jonli efirda buziladi va buni ega chiqishdan oldin panelda seza olmaydi.

**Takrorlash / kuzatish**

Mukofotlar → mukofotni ochish → «Rasm yuklash» (fayl tashlash) → saqlangach katalog qatorida «📤 yuklangan rasm» chiqadi. Endi shu mukofotning miniapp vitrinasidagi ko'rinishini tekshiring: getVitrina javobida photoUrl=null. Faqat «🔗 tashqi havola» deb belgilangan qatorlar mijozga rasm bilan boradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-06 · Panelda sovrin rasmlari umuman ochilmaydi — nisbiy URL boshqa domenga uriladi

**Triaj:** A · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Mukofotlar.tsx:155 va :324 «<img src={`/api/oyin/prizephoto?key=${encodeURIComponent(p.key)}`} …>» — API_BASE'siz. Paneldagi BOSHQA hamma rasm absolyut: packages/admin/src/api.ts:401 «shopCatIconUrl: (id) => `${API_BASE}/api/shop/cat-icon/${id}`», api.ts:457 «ravellaItemPhotoUrl: (id) => `${API_BASE}/api/ravella/photo/${id}`». Panel admin.birjoy.online'dan statik beriladi (deploy/Caddyfile: «admin.birjoy.online { root * /var/www/admin … try_files {path} {path}/index.html /index.html }» — u yerda /api YO'Q), API esa api.birjoy.online (.github/workflows/ci.yml:57 «VITE_API_URL: https://api.birjoy.online»).

**Oqibat**

Jonli panelda har sovrin qatorida rasm o'rniga buzuq-rasm belgisi (aslida index.html HTML'i qaytadi). Ega yuklagan rasm to'g'rimi-yo'qmi — panel orqali KO'RA OLMAYDI, ya'ni katalogni ko'z bilan tekshirish imkoniyati yo'q.

**Takrorlash / kuzatish**

admin.birjoy.online → O'yin mavsumi → 🎁 Mukofotlar. Har qator uchun brauzer https://admin.birjoy.online/api/oyin/prizephoto?key=… ni so'raydi → Caddy SPA-fallback → 200 text/html → <img> buziladi. Lokal dev'da (Vite proksi bir xil origin) bu KO'RINMAYDI — shuning uchun sinovdan o'tib ketgan.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-07 · «🔄 Yangi mavsum (toza boshlash)» standart qiymatlar bilan JIM yiqiladi — arxiv bajariladi, mavsum yozilmaydi

**Triaj:** A · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> Validatsiya ikki marta, ikki xil shart bilan: packages/server/src/services/oyinService.ts:3971 «const v = validateSeasonInput(input);» (prevEnd BERILMAGAN) → keyin 3979-3999 arxivlash+O'CHIRISH bajariladi → keyin 4001 «const next = await setSeason({ ...input, seasonNo: cur.seasonNo + 1 });» va setSeason ichida packages/server/src/services/oyinSeason.ts:141-143 «const prevEnd = input.seasonNo != null && … ? cur.endMs : null; const v = validateSeasonInput(input, prevEnd); if (!v.ok) throw new Error(v.error);» — oyinSeason.ts:129-131 «if (prevEndMs != null && … startMs < prevEndMs) return { ok:false, error:'Yangi mavsum oldingisi tugagandan keyin boshlanishi kerak…' }». Throw → asyncGuard → 500. Panelda .catch YO'Q: packages/admin/src/oyin/Sozlama.tsx:102-104 «void adminApi.resetOyinSeason(start, end, …).then((r) => { toast(…) }).finally(() => setBusy(false));». Forma esa JORIY mavsum sanalari bilan to'ldirilgan (Sozlama.tsx:58-60), ya'ni start < prevEnd — standart holat.

**Oqibat**

Ega tugmani bosadi, tasdiqlaydi — EKRANDA HECH NARSA CHIQMAYDI (na ✓, na ⛔). Bu orada oyin:goal: (mijozlarning tanlagan maqsad-sovrini), oyin:weeksnap:/sprintdone:/thanks:/gashtakcooldown:, oyin:freeze, oyin:sprintweek, oyin:seasonclosed ALLAQACHON arxivga ko'chirilib jonlidan o'chirilgan (oyinService.ts:3778-3802), mavsum esa eskiligicha qolgan. Ega «ishlamadi shekilli» deb qayta bosadi — natija bir xil. Yarim bajarilgan holat + nol xabar.

**Takrorlash / kuzatish**

⚙ Sozlama → 📅 Mavsum → sanalarni O'ZGARTIRMASDAN (yoki boshlanishni bugunga qo'yib, joriy mavsum tugashi 25-sen bo'lganda) «🔄 Yangi mavsum» → tasdiq → 500, toast yo'q, mavsum raqami o'zgarmaydi. To'g'ri ishlashi uchun boshlanish sanasi joriy mavsum TUGASHIDAN keyin bo'lishi kerak — buni panel hech qayerda aytmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-08 · Taklif sybil-qo'rig'i (bir xil telefon) FAQAT tanga yo'lini himoyalaydi — ball yo'li qo'riqsiz

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ball

**Dalil**

> referralService.ts:183 `dup = priorMembers.some((p) => p.phone && norm9(p.phone) === norm9(refereeMember.phone!));` → dup faqat `rewardReferrer = dup ? 0 : ...` ga ta'sir qiladi. bookingNotifier.ts:696 `if (refTg?.memberId && ref.rewardReferrer > 0)` — tanga SHU YERDA to'sildi, LEKIN bookingNotifier.ts:707 `await prisma.referral.update({ where: { id: ref.id }, data: { referrerPaidAt: new Date() } });` shartdan TASHQARIDA. oyinService.ts:373 `if (paidMs !== null && paidMs >= fromMs && paidMs <= toMs) cur.milestone += 1;` + :576 `const referFirstBall = refer.milestone * (econ.oyinReferFirstRideBall ?? 0);`

**Oqibat**

Dublikat-telefonli taklif uchun tanga BERILMAYDI (qo'riq ishlaydi), lekin BALL to'liq beriladi: 175 (do'st 1-safari) + 10 × do'stning har safari, cheklovsiz. Ya'ni soxta-do'st fabrikasiga qarshi yagona anti-sybil to'siq o'yin iqtisodida ochiq qolgan. `oyinReferJoinBall=0` faqat 'safarsiz to'lov'ni yopadi, safar qilgan dublikat akkauntni emas.

**Takrorlash / kuzatish**

Bir xil raqamli (yoki qayta ro'yxatdan o'tgan) ikkinchi Member bitta taklifchining kodi bilan ulanadi → Referral qatori YARATILADI (dup faqat rewardReferrer=0 qiladi) → do'st 1 safar qiladi → referrerPaidAt yoziladi (707-qator, shartsiz) → computeBallMap taklifchiga +175 ball beradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-09 · Endigina olingan karta 30 soniyagacha «aloqa uzildi» deb ochilmaydi — allTicketRows keshi xaridda tozalanmaydi

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Karta

**Dalil**

> packages/server/src/services/oyinService.ts:4717 `const PRIZE_CARDS_TTL_MS = 30_000;` va 4721 `if (prizeCardsCache && Date.now() - prizeCardsCache.at < PRIZE_CARDS_TTL_MS) return prizeCardsCache.rows;`. getCardDetail (4794) va getPublicCardVerify (4834) AYNAN shu keshdan o'qiydi: `const r = rows.find((x) => x.gno === gno) ?? ...`. buyTicket esa (1781) faqat `invalidateBallCache();` chaqiradi — `prizeCardsCache = null` YO'Q. Muallif naqshni bilgan: setCardNote (4864) va setAvatarOptIn (4894) da `prizeCardsCache = null; // darhol ko'rinsin — 30s TTL kutilmaydi` bor; cancelOwnTicket, adminCancelTicket, adminRecordWinner, adminCancelPrizeTickets da ham YO'Q.

**Oqibat**

Mijoz kartani sotib oladi (ball yechilgan), bayram oynasi kodini ko'rsatadi, «Kartalarim»ga o'tadi — u yerda karta BOR (myTickets keshsiz, oyinService.ts:1429 to'g'ridan-to'g'ri findUnique), kartaga bosadi — server 404 qaytaradi va ekranda «Kartani yuklab bo'lmadi — aloqa uzildi» chiqadi (packages/miniapp/src/oyin.tsx:2539). Ya'ni xaridning eng hayajonli 30 soniyasida mijozga «pulingiz ketdi, kartangiz yo'q, internetingiz yomon» deyiladi. Shu oynada panjara ham yolg'on: `sold` JONLI o'qiladi (getSoldMap, 1176-1180, keshsiz), kataklar esa keshdan — «N olindi» yozuvi bilan to'lgan kataklar soni mos kelmaydi.

**Takrorlash / kuzatish**

Bir foydalanuvchi istalgan sovrinning kartalar panjarasini ochadi (kesh isiydi) → ikkinchi foydalanuvchi shu sovrindan karta oladi → 30 soniya ichida «Kartalarim» → kartaga bosish → GET /api/oyin/card/<gno> 404. Kesh jarayon-global, shuning uchun jonli trafikda deyarli har doim isiq.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-10 · Huquqiy rekvizitlar (tashkilotchi / topshirish joyi / bog'lanish) HALI BO'SH — qoidalar varag'i mijozga «______ (ega to'ldiradi)» ko'rsatadi

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:315-317 — `const RULES_ORGANIZER: string = ""; // YaTT/MChJ TO'LIQ nomi + STIR` · `const RULES_HANDOVER: string = "";` · `const RULES_CONTACT: string = "";`. Chizilishi: :373 `Tashkilotchi: <RuleFill value={RULES_ORGANIZER} />`, :466 `Topshirish joyi va muddati: <RuleFill value={RULES_HANDOVER} />`, :489 `Murojaat uchun: <RuleFill value={RULES_CONTACT} />`. `RuleFill` (:320-324): `if (v) return <>{v}</>; return <span className="oyk-rules-fill">______ <i>(ega to'ldiradi)</i></span>`

**Oqibat**

Faylning o'z izohi (:295-300) shu UCHTA narsani qonun talabi deb sanaydi: tashkilotchi aniq, topshirish tartibi/joyi, murojaat kanali. Uchalasi ham bo'sh — ya'ni «huquqiy qalqon» hozircha qalqon emas. Mijoz rasmiy qoidalarni ochsa yarim tayyor hujjat ko'radi: kim tashkilotchi, sovg'ani qayerdan olaman, shikoyatni kimga yozaman — javob yo'q. Bayroq yoqilishidan OLDIN to'ldirilishi shart.

**Takrorlash / kuzatish**

Har qanday fazada «📋 Dastur qoidalari» (Mukofotlar tabida :1885, boshlanmagan mavsum ekranida :1414) → 2-, 10-, 13-bandlar.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-11 · Jim-soat (21:00–08:00) HURMAT QILINMAYDI — o'yin push'lari kechasi ham ketadi; kod izohi teskarisini da'vo qiladi

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/notifyService.ts:67-85 — `trySend` funksiyasining TO'LIQ tanasida `quietHours()` chaqiruvi YO'Q (faqat isNotifyOff, isBlocked, DAILY_PUSH_CAP, NotifyLog). `quietHours()` faqat 3 joyda chaqiriladi: notifyService.ts:91 (pushEngineTick), driverEngageService.ts:67, ai/needsEngine.ts:103. Shunga qaramay oyinService.ts:3502 izohi: «u kunlik cap/jim-soat/blok/opt-out qo'riqlarini beradi». Tik esa sutka bo'yi yuradi: index.ts:335 `const intervalMs = Math.max(1, env.SYNC_INTERVAL_MINUTES) * 60_000;` (env.ts:54 default 15).

**Oqibat**

«🔒 Oxirgi soat», «🏁 Mavsum yakunlandi», «🏆 SIZ YUTDINGIZ», «🗓 Xotira» xabarlari soat 02:00–05:00 da ham yuborilishi mumkin. Kechasi kelgan marketing-push blok (403) sababi №1 — ya'ni bu bevosita `blockedAt` o'sishiga olib keladi. Ayniqsa `cardMemoryTick` (sof nostalgiya, shoshilinch emas) kechasi ketishi asossiz.

**Takrorlash / kuzatish**

notifyService.ts:67-85 ni to'liq o'qing — `quietHours` yo'q. Mavsum tugashi 04:00 ga to'g'ri kelsa, seasonCloseNotify o'sha tikda ishlaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-12 · Har ulashishda chiqadigan YAGONA rasm — mavjud bo'lmagan ilovaning maketi (prototip ma'lumotsiz jo'natilmoqda)

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/public/invite-poster.jpg (1024×1536, jonli 200 image/jpeg 234564 bayt) — rasmda: «Jami ball 480 · Jami chipta 14 · Keyingi sovg'a Mikroto'lqinli pech 38%» va pastki menyu «Asosiy · Buyurtma · Sodiqlik · Do'stlar · Profil». Haqiqiy ilova tablari: packages/miniapp/src/App.tsx:105-113 `const BASE_TABS = [{ id: "uy", … label: "Uy" }, …]` (Uy · Hamyon · Do'kon · Xizmatlar · Reyting) — rasmdagi 5 tabdan BIRORTASI ham yo'q, «Sodiqlik» degan tab umuman mavjud emas. Rasm manbasi: packages/miniapp/src/telegram.ts:591 `return new URL("/invite-poster.jpg?v=5", location.origin).href;` va packages/miniapp/public/j/index.html:13 `<meta property="og:image" content="https://app.birjoy.online/invite-poster.jpg?v=5" />`

**Oqibat**

Bu rasm HAR ulashish yo'lida chiqadi (chat-preview, hikoya, bot tugmasi). Mijoz rasmni ko'rib ilovani ochadi va butunlay boshqa ekran topadi — birinchi taassurot yolg'on. Sonlar (480 ball, 14 chipta, 38%) ham hech kimning real holati emas; DIZAYN_QOIDALARI «prototip elementi ma'lumotsiz jo'natilmaydi» qoidasi buzilgan.

**Takrorlash / kuzatish**

packages/miniapp/public/invite-poster.jpg ni ochib pastki menyu yozuvlarini App.tsx:105-113 dagi BASE_TABS bilan solishtiring; jonli nusxa: curl -o- https://app.birjoy.online/invite-poster.jpg?v=5 (200, 234564 bayt = repodagi fayl bilan bir xil)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-13 · /j/ landing va OG-matn hozir DARK bo'lgan o'yinni va'da qiladi — mijozga jonli ko'rinadi

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/public/j/index.html:11-12 `og:title "🎁 BirJoyda sizni sovg'alar kutmoqda!"` / `og:description "…ball yig'ing, chiptaga aylantiring, sovrinlarni yutib oling…"`; :72-73 `<div class="bonus">🎮 <small>Ball + sovg'a</small></div>` va `Ball yig'ing, chiptaga aylantiring, sovrinlarni yuting`. Sahifa TOZA STATIK, bayroqni bilmaydi (deploy/Caddyfile: `app.birjoy.online { root * /var/www/miniapp … file_server }` — hech qanday reverse_proxy yo'q). Botga kirgach o'yin kartochkasi esa bayroq ortida: packages/server/src/bot/oyin.ts:22-23 `if (!(await featureOn("oyin"))) return;`, `oyin` DEFAULT_OFF ro'yxatida (packages/server/src/services/featureFlags.ts:182) va jonli qatori yo'q. Landing jonli: curl https://app.birjoy.online/j/?r=TEST&v=5 → 200 text/html, og-teglar repodagi bilan aynan bir xil.

**Oqibat**

Bugun har bir referal ulashish (uy.tsx, wallet, shop, bot /invite — hech biri bayroq bilan yopilmagan) do'stga «ball · chipta · sovrin» va'da qiladi, do'st botga kiradi va o'yin haqida BIR OG'IZ ham gap eshitmaydi. Eng katta yolg'on-va'da nuqtasi: va'da statik faylda, bajarilishi esa bayroq ortida.

**Takrorlash / kuzatish**

curl -sS 'https://app.birjoy.online/j/?r=TEST&v=5' | grep og: → o'yin matni chiqadi; packages/server/src/bot/oyin.ts:22 ga qarang — kartochka `featureOn("oyin")` false bo'lsa jim qaytadi

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-14 · O'yindagi «Ulashish» mijozga «+0 ball qo'shildi» deydi va vazifalar ro'yxatida «+0» ko'rsatadi

**Triaj:** A · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/src/oyin.tsx:1301 `if (b.ok) { loadHome(true); showToast(`📤 Rahmat! +${state?.hints.shareBall ?? 0} ball qo'shildi`); }` — `hints.shareBall` = `econ.oyinShareBall ?? 0` (packages/server/src/services/oyinService.ts:950), jonli knob 0 (packages/shared/src/economy.ts:307 `{ key: "oyinShareBall", … def: 0 }`). Server baribir `ok:true` qaytaradi, chunki markShare ballga qaramaydi: packages/server/src/services/oyinService.ts:1850-1853 `return { ok: await markDay("oyin:share:", memberId) };`. Vazifa qatori ham filtrsiz: oyin.tsx:2752 `{ key: "share", label: "Do'stga ulashish", … gain: state.hints.shareBall, … }` → oyin.tsx:2781 `<span className="oyk-task-g">{t.done ? `✓ +${t.gain}` : `+${t.gain}`}</span>`. Xuddi shu holat «Ilovaga kirish» qatorida (oyin.tsx:2750, `loginBall` = oyinDailyLoginBall = 0, economy.ts:306).

**Oqibat**

«Bugungi vazifalar» ro'yxatida ikkita bajarib bo'lmaydigan «+0» qatori turadi va ulashgandan keyin mijoz «+0 ball qo'shildi» degan bema'ni xabarni oladi. Ishonch yo'qoladi va progress «0/3» hech qachon to'lmaydi. Diqqat: `.oyk-qr` tugmasining YOZUVI to'g'ri hal qilingan (oyin.tsx:2298-2300 `state.hints.shareBall <= 0 ? "👥 Do'stimga yubor" : …`) — lekin handler baribir `doShareBonus()` ni chaqiradi (oyin.tsx:2296), ya'ni halol yozuv + yolg'on toast.

**Takrorlash / kuzatish**

O'yin → Jamoam → «👥 Do'stimga yubor» bosing (ega-preview, mavsum faol) → Telegram oynasi ochiladi → toast «📤 Rahmat! +0 ball qo'shildi». Kod yo'li: oyin.tsx:2296 → 1283-1301 → api.oyinShare → server.ts:1733 → oyinService.ts:1850

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-15 · `/api/oyin/state` bayroq qo'rig'isiz kunlik-topshiriq belgisini yozadi (DARK bo'lsa ham)

**Triaj:** A · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ball

**Dalil**

> api/server.ts:1504-1510 `app.get("/api/oyin/state", requireUser, ...)` — route'da featureOn YO'Q. getOyinState (oyinService.ts:736-...) ichida ham featureOn chaqiruvi YO'Q (grep bilan tekshirildi). :869 `if (done && (await markDay("oyin:quest:", memberId).catch(() => false)))` → markDay (:1799) faqat `getSeason().phase !== "active"` ni tekshiradi, bayroqni EMAS. Qiyoslash: markLogin :1833 `if (!preview && !(await featureOn("oyin"))) return;`, markShare :1851, markHomeScreen :1844 — uchalasida bayroq qo'rig'i BOR.

**Oqibat**

O'yin DARK, lekin mavsum ACTIVE (bugungi holat: 10-avg → 25-sen). Bayroqni chetlab route'ga to'g'ridan-to'g'ri murojaat qilgan har qanday ulangan foydalanuvchi kuniga `oyin:quest:` kun-markerini yozdiradi va 20 ball to'playdi — bayroq yoqilganda ball ALLAQACHON hisobda bo'ladi. Miniapp UI qo'rig'i (App.tsx:349 `if (t === "oyin" && !me.flags?.oyin) t = "uy"`) faqat KLIENT tomonda, server-avtoritet emas.

**Takrorlash / kuzatish**

Ulangan foydalanuvchi initData bilan `GET /api/oyin/state` ni chaqiradi (bayroq off, mavsum active) va o'sha kuni ≥2 safar qilgan bo'lsa → `oyin:quest:<memberId>` qatoriga bugungi kun yoziladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---


## ▶ BLOKER — TIRAJGACHA (25-sen)

### OY-16 · notifyOnce yetkazilmagan xabarda ham `true` qaytaradi — durable marker qo'yiladi, xabar ABADIY yo'qoladi (g'olib ham shunga kiradi)

**Triaj:** B · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/notifyService.ts:84 — `return (await pushMessage(bot, chatId, kind, html, { memberId, prechecked: true, extra })) !== "skipped";` va o'sha yerdagi izoh 81-83: «Qaytish qiymati AVVALGIDEK: "slot band qilindi" (yuborishga urinildi), "yetkazildi" EMAS». packages/server/src/services/pushSend.ts:70-78 — `prechecked:true` bilan "skipped" hech qachon qaytmaydi; 403 → `return "blocked"`, 429/tarmoq → `return "failed"` — IKKALASI ham `!== "skipped"` ya'ni `true`. Buning ustiga oyinService.ts:3502-3503 izohi TESKARISINI da'vo qiladi: «marker esa FAQAT muvaffaqiyatli yuborilgandan keyin qo'yiladi». Chaqiruv joylari: oyinService.ts:3568-3569, 3582-3583, 3597-3598, 3625-3626 (`markPushed(...)`), 3652-3655 (`w.notifiedAt = new Date().toISOString()`), 3680-3683 (`t.notifiedLoss = true`), 3723-3725.

**Oqibat**

429 (rate-limit), tarmoq uzilishi yoki 403 holatida xabar Telegram'ga YETIB BORMAYDI, lekin `oyin:warn7:s1:<id>` / `notifiedAt` / `notifiedLoss` markeri YOZILADI — keyingi tik uni QAYTA URINMAYDI. Eng og'iri: sovrin YUTGAN odam 3652-3655 yo'lida bitta 429 tufayli «SIZ YUTDINGIZ» xabarini HECH QACHON olmaydi, bayonnomada esa `notifiedAt` to'ldirilgan bo'ladi — ya'ni tizim ham, ega ham «xabar berildi» deb o'ylaydi. Bu tiraj adolatiga to'g'ridan-to'g'ri ta'sir qiladi.

**Takrorlash / kuzatish**

Kod yo'li: notifyOnce → trySend → pushMessage → pushSend; `bot.api.sendMessage` istalgan non-403 xato tashlasa `"failed"` qaytadi, `"failed" !== "skipped"` = true → chaqiruvchi `if (ok)` shoxiga kiradi va markerni yozadi. Isbot uchun: pushSend.ts:74-79 catch bloki.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-17 · Ega yoki xodim karta olsa — o'sha sovrin ABADIY o'ynalmaydi (sotuv 'to'lgan', tiraj 'not_ready')

**Triaj:** B · **Og‘irlik:** 🔴 critical · **Yo‘nalish:** Tiraj

**Dalil**

> oyinService.ts:3318 va :3331 — sotuv sanog'i (oyin_sold) xodim/sinov kartasini SANAYDI, tiraj ro'yxati (getDrawList) esa uni CHIQARIB TASHLAYDI. Sim o'lchovi: sold=3/3 · drawList cards=2 · ready=false · bayonnoma=not_ready · yangi xarid=sold_out. oyinMinSellPct=100 bo'lgani uchun hovuz hech qachon limitga yetmaydi.

**Oqibat**

Sovrin sotuvda 'tugagan' ko'rinadi (yangi karta sotib bo'lmaydi), lekin tiraj ham o'tkazib bo'lmaydi. Chiqish yo'li yo'q: karta sotish yopiq, tiraj yopiq. Kodning O'Z izohi ega bayroqni yoqishdan oldin o'z kartalarini qo'lda tozalashi kerakligini aytadi — panelda bunday tugma YO'Q.

**Takrorlash / kuzatish**

Sim: bir sovringa 3 chipta (1 tasi xodim), so'ng getDrawList + adminRecordWinner.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-18 · Tiraj «tayyor» ko'rinadi, lekin g'olib yozilmaydi — panel sababni ingliz kodi bilan aytadi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> Panel katalogning willDraw'iga ishonadi: packages/admin/src/oyin/Kartalar.tsx:43 «const ready = catalog.filter((p) => p.active && p.queued !== true && p.willDraw && !winnerByPrize.has(p.key));», u esa xodim/sinov/chetlatilgan kartalarni HAM sanaydi: packages/server/src/services/oyinService.ts:1221 «return { …p, sold, minSell, willDraw: sold >= minSell, … }». Haqiqiy tiraj esa ularni chiqarib tashlaydi va HAQIQIY hovuzni talab qiladi: oyinService.ts:3318 «if (t.test || banned.has(memberId) || staffMembers.has(memberId)) { excluded++; continue; }» va 3331 «ready: sold >= minSell && cards.length >= minSell && cards.length > 0». Jonli knob oyinMinSellPct=100 → minSell = limit (oyinService.ts:990-994). Xato ko'rsatish: Kartalar.tsx:188 «else toast(r.reason === 'not_in_list' ? '⛔ Bu raqam ro'yxatda YO'Q…' : `⛔ ${r.reason ?? 'bajarilmadi'}`)» — ya'ni ekranda «⛔ not_ready», «⛔ not_frozen», «⛔ already», «⛔ write_failed» chiqadi.

**Oqibat**

oyinMinSellPct=100 bo'lgani uchun sovrinda BITTA xodim/sinov kartasi bo'lsa — u sovrin ABADIY tirajga tushmaydi (o'rin tugagan, yangi karta sotib bo'lmaydi, hovuz esa limitdan kam). Panel «📦 to'lgan — tiraj kutmoqda» deb turadi, «🏆 G'olibni qayd etish» tugmasi faol, bosilganda esa tushunarsiz «⛔ not_ready». Jonli efirda blogers bilan turib bu xabarni ko'rish — eng yomon vaqt.

**Takrorlash / kuzatish**

💳 Kartalar & Tiraj → «Mukofot kuni» ro'yxatidan sovrinni tanlang → «Ro'yxatni ochish» (bu yerda cards.length limitdan kam ekani ko'rinadi) → «🏆 G'olibni qayd etish» → «⛔ not_ready». Muzlatilmagan holda esa «⛔ not_frozen».

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-19 · Chiqarilgan (xodim/sinov/chetlatilgan) kartalar QAYSI a'zoda ekanini ko'rsatadigan ekran yo'q — tiqilinchni yechib bo'lmaydi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Kartalar.tsx:155-158 faqat SON beradi: «{exp.excludedTest} ta sinov kartasi · {exp.excludedBanned} ta chetlatilgan a'zo kartasi · {exp.excludedStaff} ta xodim kartasi». Reyestrning o'zi ularni qatordan chiqarib tashlaydi (packages/server/src/services/oyinService.ts:2193-2201) va chegaraga yetmagan sovrin kartalarini ham (2204). Xodim ta'rifi oyinService.ts:2132 «return isAdmin(tu.id) || tu.isAdmin === true;». Sinov-rejimi olib tashlangani uchun ega xaridi test:true belgisi ham OLMAYDI — kod buni ochiq yozgan: oyinService.ts:1731-1732 «Ega bayroqni yoqishdan OLDIN o'z kartalarini qo'lda (`adminCancelTicket`, bitta-bitta) tozalashi SHART.»

**Oqibat**

Ega «3 ta xodim kartasi bor» ni ko'radi, LEKIN kimda ekanini panel aytmaydi va bitta bosishda tozalaydigan tugma yo'q. Yechish yo'li: ◍ Odamlar reytingidan har a'zoni ochib, kartalarini qo'lda topib bekor qilish — kimni ochish kerakligini taxmin qilib. Yuqoridagi «not_ready» tiqilinchini shu bilan yechish kerak bo'ladi.

**Takrorlash / kuzatish**

💳 Kartalar → pastdagi izohda «N ta xodim kartasi» chiqadi → shu N ta kartani topadigan hech qanday filtr/ro'yxat/tugma yo'q (butun packages/admin/src ichida excludedStaff faqat shu bitta matnda ishlatiladi).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-20 · Telefon-ball mavsum tashqarisida BIR MARTA belgilanadi va ABADIY yo'qoladi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ball

**Dalil**

> oyinService.ts:1821-1831 `async function markPhoneVerified(...)` — mavsum fazasi TEKSHIRILMAYDI (markDay dan farqli: :1802 `if ((await getSeason()).phase !== "active") return false;`), qiymat `new Date().toISOString()`. computeBallMap oyinService.ts:500 `if (Number.isFinite(at) && at >= fromMs && at <= toMs) phoneBallGranted.add(memberId);`. Belgi qayta yozilmaydi: :1826 `if (already) return;`

**Oqibat**

Mavsumlar ORASIDA (yoki `upcoming` fazada) ilovani birinchi marta ochgan mijozning `oyin:phoneball:` belgisi oynadan TASHQARIDA muhrlanadi. Belgi umrbod bitta bo'lgani uchun u ball HECH QACHON olmaydi — hech qaysi mavsumda. UI esa oyin.tsx:206 da «📱 Telefon tasdiqlash — bir marta» deb va'da qiladi (bajarilmaydigan va'da).

**Takrorlash / kuzatish**

Mavsum 25-sentabrda tugaydi, keyingisi 1-oktabrda boshlanadi. 27-sentabrda raqam ulagan yangi mijoz miniapp'ni ochadi → markLogin → markPhoneVerified `2026-09-27` yozadi → oktabr mavsumida fromMs=1-okt > 27-sen → phoneBall=0, abadiy.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-21 · Mijoz ko'radigan KO-kod tiraj ro'yxatining hech bir joyida yo'q — g'olib o'z raqamini tanib bo'lmaydi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Karta

**Dalil**

> Mijoz FAQAT kodni ko'radi: oyin.tsx:2122 `<div className="oyk-tkt-no">{t.code}</div>`, 2558 `{cardData.code}`, 3077 `{celebrate.code}`; xom `gno` state'da bor-u (`celebrate.ticketNo`) hech qayerda chizilmaydi. Tiraj tomonida esa hamma joyda xom raqam: getDrawList 3319 `cards.push({ gno: t.gno ?? t.no, ... })`, hash 3277 `hashCards(gnos)`, drawExport 2205 `ticketNo: t.gno ?? t.no`, g'olib pushi 3651 «`«${w.prizeName}» — karta №${w.gno}`», admin panel packages/admin/src/oyin/Kartalar.tsx:112 `№{w.gno}` va CSV ustuni `t.ticketNo`, packages/admin/src/App.tsx:6903 `№${c.gno} — ${c.name}`.

**Oqibat**

Jonli efirda bloger «729478» deb o'qiydi, mijozning telefonida esa «KO-421-308-7480» turadi — ikkalasi orasida mijoz uchun HECH QANDAY bog'lanish yo'q (kod Feistel bilan aralashtirilgan, qo'lda hisoblab bo'lmaydi). Ochiq ro'yxat va SHA-256 hash — butun ishonch mexanikasi — mijoz uchun tekshirib bo'lmaydigan bo'lib qoladi. G'olibga ketadigan push ham unga notanish raqamni aytadi.

**Takrorlash / kuzatish**

Kod o'qish: myTickets (1453) mijozga `code` beradi, `gno` ni ham beradi lekin UI uni chizmaydi; getDrawList/drawExport/adminRecordWinner javoblarida `code` maydoni UMUMAN yo'q (shared/src/oyin.ts OyinDrawCard/OyinDrawExport tiplarida `code` yo'q).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-22 · Mavsum «upcoming/unset» bo'lganda tab-qatori umuman chizilmaydi — mijoz sotib olgan KARTALARIGA kira olmaydi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:1345 `if (phase === "unset" || phase === "upcoming") {` → :1349-1424 erta `return` ichida faqat `oyk-scroll` (sanoq, sovrin-rail, «Do'stni chaqir» CTA, qoidalar havolasi); `<div className="oyk-tabs">` esa faqat asosiy return'da — :2427. Aynan shu bug `ended` uchun tuzatilgan va izohda yozib qo'yilgan (:1426-1430): «MAVSUM YAKUNI uchun avval bu yerda ERTA RETURN turardi... 600 ball to'lab chipta olgan odam AYNAN TIRAJ KUNI chiptasini ocha olmasdi» — lekin tuzatish `upcoming`/`unset` ga qo'llanmagan.

**Oqibat**

Qoidalar §6/§14 (:411, :502-505) «mavsum tugashi kartaga ta'sir qilmaydi», «karta saqlanadi» deb VA'DA beradi. Mavsumlar orasida (eski tugadi, yangisi hali boshlanmagan = `unset`/`upcoming`) mijozning ball to'lab olgan kartalari ekrandan butunlay yo'qoladi — Kartalarim, Mukofotlar, Jamoam tablarining hech biriga yo'l yo'q. O'yindagi eng qimmat obyekt eng nozik paytda ko'rinmaydi.

**Takrorlash / kuzatish**

Mavsum sozlanmagan yoki `startIso` kelajakda bo'lgan holatda o'yin ekranini ochish (jonli hozir active, lekin 25-sen'dan keyin yangi mavsum e'lon qilinmaguncha AYNAN shu holat bo'ladi).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-23 · T-3 va T-49 soat ogohlantirishlari FINAL-48 qulfidan KEYIN ham yuboriladi — bajarib bo'lmaydigan chaqiriq

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/oyinService.ts:3578 `if (msLeft <= 3 * 86_400_000 && cheapest) {` va 3593 `if (msLeft <= 49 * 3_600_000 && cheapest) {` — pastki chegara YO'Q, yagona shart 3551 `if (msLeft <= 0) return empty;`. Nomzodlar HAR tikda qayta hisoblanadi: 3579 `.filter(([, r]) => r.breakdown.ball >= cheapest.price)`. Ayni paytda xarid serverda 48 soat oldin yopiladi: oyinService.ts:1686 `if (season.endMs != null && season.endMs - Date.now() <= OYIN_FINAL_LOCK_MS) return { ok: false, reason: "final_lock" };`, packages/shared/src/oyin.ts:498 `export const OYIN_FINAL_LOCK_MS = 48 * 3600_000;`. Ball esa qulfdan keyin ham o'sishda davom etadi (computeBallMap: oyinService.ts:354 `const toMs = season.endMs != null ? Math.min(nowMs, season.endMs) : nowMs;`).

**Oqibat**

Mavsumning oxirgi 48 soatida yangi safar qilib chipta narxiga yetgan HAR mijoz «⏳ Karta olish 24 soatdan keyin yopiladi» va «🔒 Oxirgi soat … hozir sarflasangiz kartaga aylanadi» xabarlarini oladi, ilovaga kiradi va server `final_lock` bilan rad etadi. Bu ikki marta zarar: (a) yolg'on va'da, (b) mijoz «ball yondi, hech narsa qila olmadim» degan xulosa bilan qoladi — ishonch buzilishining eng qimmat turi.

**Takrorlash / kuzatish**

Mavsum tugashiga 30 soat qolgan holat: a'zo safar qiladi → ball ≥ eng arzon chipta narxi → keyingi 15-daq tikda 3578 va 3593 shartlari IKKALASI ham TRUE → ikkita push ketadi; ilovada `buyTicket` → `final_lock`.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-24 · Uchala ogohlantirish matnida vaqt QATTIQ KODDA — «7 kun / 24 soat / 1 soat» aslida boshqa vaqtda yetadi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3566 `🎁 <b>Mavsumga 7 kun qoldi</b>`; :3581 `⏳ <b>Karta olish 24 soatdan keyin yopiladi</b>`; :3596 `🔒 <b>Oxirgi soat</b>\n\nBir soatdan keyin karta olish yopiladi.` — uchalasi ham `msLeft` dan hisoblanmagan STATIK satr, shart esa `msLeft <= …` (3563, 3578, 3593) ya'ni yuqori chegarasiz oyna. Nomzodlar ro'yxati har tikda qayta quriladi (3564, 3579, 3594), ya'ni oynaning ISTALGAN nuqtasida yangi odam qo'shiladi.

**Oqibat**

Mavsum tugashiga 1 kun qolganda birinchi safarini qilgan odam «Mavsumga 7 kun qoldi» xabarini oladi — u 7 kun rejalashtiradi va ballini yo'qotadi. Xuddi shu mantiq 24 soat / 1 soat matnlarida. Ega bir marta yozilgan matnni «to'g'ri» deb o'ylaydi, mijoz esa muntazam noto'g'ri muddat eshitadi.

**Takrorlash / kuzatish**

Mavsum: 10-avg → 25-sen. 24-sentabrda birinchi safar qilgan a'zo `breakdown.ball > 0` bo'ladi → 3564 filtri uni oladi → 3566 matni «7 kun qoldi» deydi, aslida ~1 kun.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-25 · Sprint (haftalik natija) — g'olibga HECH QANDAY xabar yo'q, natija jimgina tashlab yuboriladi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/index.ts:421 `await sprintCheck().catch((e) => console.error("[oyin] sprintCheck failed:", e));` — qaytgan `OyinSprintResult` (g'oliblar ro'yxati) HECH QAYERGA berilmaydi. `sprintCheck` ichida (oyinService.ts:2049-2123) birorta `notifyOnce`/`pushMessage`/`alertAdmins` chaqiruvi YO'Q — bu oyinService.ts dagi barcha yuborish chaqiruvlari ro'yxati bilan tasdiqlanadi (1998, 2009, 2894, 2896, 3554, 3618, 3640, 3702 — hech biri sprint yo'lida emas). `packages/miniapp/src` bo'ylab «sprint» so'zi umuman uchramaydi.

**Oqibat**

Top-3 haftalik g'olib `oyinSprintBonusBall` (def 70, packages/shared/src/economy.ts:319) oladi, lekin buni na push bilan, na ilovada biladi — ball shunchaki «o'z-o'zidan» ko'payadi. Butun sprint mexanikasi mijozga KO'RINMAYDI, ya'ni u hech qanday xulq-atvorni rag'batlantirmaydi va sarflangan ball bekorga ketadi (DIZAYN_QOIDALARI: «yozuv harakat va'da qilsa tugma shart» — bu yerda hatto yozuv ham yo'q).

**Takrorlash / kuzatish**

index.ts:421 ni o'qing — natija o'zgaruvchiga ham olinmagan; `grep -rn "sprint" packages/miniapp/src` → 0 natija.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-26 · adminSetBan bilan xuddi shu abadiy tiqilinch yuzaga keladi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Tiraj

**Dalil**

> oyinService.ts:3318/:3331 — chetlatilgan (ban) karta ham sotuv sanog'ida qoladi, tiraj ro'yxatidan chiqadi.

**Oqibat**

Firibgarni chetlatish sovrinni butunlay o'ynab bo'lmaydigan qilib qo'yadi — ya'ni qo'riqning o'zi zarar yetkazadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-27 · «Muzlatilgan» ro'yxat aslida muzlamaydi — hash har chaqiruvda o'zgaradi

**Triaj:** B · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Tiraj

**Dalil**

> adminSetFreeze (oyinService.ts:3888) faqat {at, ticketCount} yozadi, RO'YXATNING O'ZINI emas; getDrawList (:3283) har chaqiruvda qayta hisoblaydi; adminCancelTicket (:3852) da freeze tekshiruvi YO'Q. Sim o'lchovi: muzlatilgandan keyin hash 713b4638 -> 8cdd50a1 -> 25cafd0d, kartalar 3 -> 2 -> 1.

**Oqibat**

Tirajning butun ishonch mexanikasi — 'ro'yxat muzlatildi, mana hash' — yolg'on. Muzlatgandan keyin ham ro'yxat o'zgaradi. Ega taklifi (muzlatish tugmasini olib tashlash) shu sababdan to'g'ri: tugma buzuq narsani himoya qilyapti.

**Takrorlash / kuzatish**

Sim: freeze -> hash o'qish -> chipta bekor qilish -> hash qayta o'qish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-28 · Tiraj ro'yxatining KARTA RAQAMLARI panelda ko'rsatilmaydi va eksporti yo'q; g'oliblar bayonnomasida CSV yo'q

**Triaj:** B · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Kartalar.tsx:196-203 — DrawRow faqat yig'indi ko'rsatadi: «Ro'yxat: {list.cards.length} ta karta · {list.excluded} tasi chiqarilgan · hash {list.hash.slice(0,16)}… {list.frozenAt ? ' · 🔒 muzlatilgan' : ' · 🔓 hali muzlatilmagan'}» — `list.cards` (gno + ism + memberId) massivi RENDER QILINMAYDI. «🏆 G'oliblar» kartochkasida ham eksport tugmasi yo'q (Kartalar.tsx:106-129 — downloadCsv chaqiruvi yo'q; CSV faqat umumiy reyestrda, Kartalar.tsx:137).

**Oqibat**

Jonli efirda o'qiladigan «muzlatilgan ro'yxat» ni ega ekrandan ko'rsata olmaydi va chop eta olmaydi — faqat umumiy karta reyestrini sovrin bo'yicha filtrlab CSV qilish yo'li qoladi (unda hash yo'q). Bayonnoma (hash+guvoh+g'olib) ni fayl qilib chiqarish yo'li ham yo'q.

**Takrorlash / kuzatish**

💳 Kartalar → «Mukofot kuni» → «Ro'yxatni ochish»: faqat son va hash chiqadi, raqamlar ro'yxati yo'q; g'oliblar jadvalida ⬇ CSV tugmasi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-29 · Bekor qilingandan keyin sovrin-ichi raqam (`no`) QAYTA beriladi — bir sovrinda ikkita bir xil №, biri panjaradan yo'qoladi

**Triaj:** B · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Karta

**Dalil**

> reserveSoldSlot (oyinService.ts:1625-1645) `oyin_sold:<prize>` ni +1 qilib O'SHA qiymatni `no` sifatida qaytaradi; releaseSoldSlot (1648-1653) uni −1 qiladi. Ya'ni sold=6 da no=1 bekor qilinsa sold=5 bo'ladi va keyingi xarid yana no=6 oladi — no=6 esa boshqa mijozda ALLAQACHON bor. Shu ketma-ketlik loyihaning o'z testida qayd etilgan: packages/server/src/scripts/testCancelRace.ts:53 `ok(Number(soldAfter?.value) === 5, "1b. sold 6→5 ...")`. Panjara esa `no` ni kalit qiladi: oyinService.ts:4769 `const byNo = new Map(mine.map((r) => [r.no, r]));` — oxirgisi g'olib chiqadi.

**Oqibat**

Ikki mijozda bir xil «№6» karta bo'ladi; sovrin panjarasida biri butunlay ko'rinmay qoladi (uning katagi boshqa odamning ismi bilan chiqadi), bo'shatilgan katak esa «Hali bo'sh» bo'lib turadi, sarlavhada esa `{sold} olindi` (oyin.tsx:2481) — kataklar soni bilan mos kelmaydi. Tirajga (gno bo'yicha) ta'sir qilmaydi, lekin «har karta — bitta ko'rinadigan joy» va'dasi buziladi.

**Takrorlash / kuzatish**

minSellPct=100 (jonli knob) da willDraw sovrin to'lgunicha false, ya'ni bekor qilish 1 soatlik oyna (OYIN_CANCEL_WINDOW_MS, shared/src/oyin.ts:505) ichida ochiq. A no=1 oladi → B no=2 oladi → A 1 soat ichida bekor qiladi (sold 2→1) → C oladi → C ham no=2. getPrizeCards: 1-katak bo'sh, 2-katakda faqat bittasi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-30 · TIRAJ natijasi o'yin ichida deyarli ko'rinmaydi: g'oliblar ekrani yo'q, `lastWinner` o'yin ekranida ishlatilmaydi, «Telegram kanalimizda» va'dasi havolasiz

**Triaj:** B · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Miniapp UI

**Dalil**

> Mijoz natijani faqat O'Z kartasida ko'radi: packages/miniapp/src/oyin.tsx:2145 `{t.result === "won" ? "🏆 Yutdi" : t.result === "lost" ? "O'ynadi" : ended ? "TUGADI" : "KUCHDA"}` va karta varag'ida :2559. Umumiy g'olib ma'lumoti serverdan KELADI (packages/shared/src/oyin.ts:952-957 `lastWinner: { name, mahalla, prizeName, drawnAt, no } | null`), lekin `grep lastWinner packages/miniapp/src` — faqat uy.tsx:346 va design/oyinDemo.tsx; oyin.tsx'da BIRORTA ishlatish yo'q. Yakun matni oyin.tsx:2170 «Mukofot egalari Telegram kanalimizda e'lon qilinadi.» — havola/tugma yo'q. Qoidalar §9 (:456-462) «jonli efirda» deydi — efirga ham yo'l yo'q.

**Oqibat**

O'yinning eng kuchli ijtimoiy-isboti (real g'olib) o'yin ekranida yo'q — u faqat UY sahifasida. «Kanalimizda e'lon qilinadi» yozuvi harakat va'da qiladi, bosiladigan joy yo'q — DIZAYN_QOIDALARI #14 aynan shundan chiqqan. Push bor (oyinService.ts:3638 `seasonDrawNotify`), lekin ilovada natija sahifasi yo'q.

**Takrorlash / kuzatish**

Kartalarim tabi, mavsum tugagan holat; va bosh «Dastur» tabini har qanday holatda ochish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-31 · seasonDrawNotify `oyin:tickets:<id>` ni QULFSIZ read-modify-write qiladi (buyTicket qulf oladi) — karta yo'qolishi mumkin

**Triaj:** B · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3664-3684 — `const ticketRows = await prisma.appState.findMany(...)` → 3670 `const tickets = parseTickets(row.value);` → 3680 `await notifyOnce(...)` (TARMOQ kutish!) → 3682-3683 `for (const t of tickets) if (t.result === "lost") t.notifiedLoss = true; await prisma.appState.update({ where: { key: row.key }, data: { value: JSON.stringify(tickets) } })` — butun massiv eskirgan nusxadan qayta yoziladi. Boshqa yozuvchilar qulf oladi: :1708 `return withMemberLock(memberId, async () => {` (buyTicket), :1485 (cancelOwnTicket). `adminRecordWinner` ham qulfsiz: :3399-3412. Qo'shimcha xavf: `parseTickets` — oq ro'yxat (:161-197), ro'yxatda yo'q maydon yozib qaytarilganda TASHLANADI.

**Oqibat**

Push yuborilayotgan (~100-500 ms) oynada o'sha a'zo chipta sotib olsa yoki bekor qilsa, seasonDrawNotify ning yozuvi uni USTIDAN yozadi — mijoz ballni to'lagan, kartasi yo'q. Ehtimol past (tiraj paytida odatda `freeze` yoki final_lock yoqiq), lekin seasonDrawNotify da mavsum-fazasi darvozasi UMUMAN yo'q (:3639 faqat `featureOn("oyin")`), ya'ni faol mavsumda ham yugurishi mumkin.

**Takrorlash / kuzatish**

3670 (o'qish) va 3683 (yozish) orasida 3680 dagi `await notifyOnce` turadi — bu oyna ichida buyTicket (1708, qulf ichida) yangi chipta qo'shsa, 3683 uni o'chiradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-32 · Tirajdan chiqarilgan kartalarga (chetlatilgan · xodim · sinov) natija HECH QACHON yozilmaydi — ular abadiy «⏳ O'yinda» bo'lib qoladi

**Triaj:** B · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Karta

**Dalil**

> getDrawList:3318 `if (t.test || banned.has(memberId) || staffMembers.has(memberId)) { excluded++; continue; }` — bu kartalar `list.cards` ga tushmaydi. adminRecordWinner esa faqat shu ro'yxat bo'yicha yuradi: 3396-3416 `for (const c of list.cards) { ... }` va `if (!gnos.includes(g)) continue;`.

**Oqibat**

Chetlatilgan a'zo (yoki eganing o'z sinov kartasi) «Kartalarim»da mangu «KUCHDA» / karta sahifasida «⏳ O'yinda» ko'radi — sovrin allaqachon o'ynalgan bo'lsa ham. Ekran yolg'on holat ko'rsatadi.

**Takrorlash / kuzatish**

Karta egasini adminSetBan bilan chetlatib, keyin o'sha sovrinda adminRecordWinner yurgizilsa, uning `oyin:tickets:` qatorida `result` maydoni paydo bo'lmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---


## ▶ KECHGA

### OY-33 · Hikoya tasdiqlash/rad etish server «ok:false» desa ham «✅ Tasdiqlandi» deb yolg'on aytadi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Hikoyalar.tsx:28-29 «await adminApi.reviewOyinStory(row.memberId, row.id, approve, why); toast(approve ? '✅ Tasdiqlandi — ball darhol tushdi, mijozga xabar ketdi' : '❌ Rad etildi — sabab yuborildi', …)» — javobdagi `ok` UMUMAN o'qilmaydi. Server 200 bilan ok:false qaytaradi: packages/server/src/services/oyinStory.ts:206 «if (!item || item.status !== 'pending') return { ok: false };» va route res.json(r) (packages/server/src/api/server.ts:2509).

**Oqibat**

Ikki marta bosilsa, boshqa admin allaqachon ko'rgan bo'lsa yoki ariza yo'qolgan bo'lsa — ega «ball tushdi, mijozga xabar ketdi» deb ishonadi, aslida hech narsa bo'lmagan. Moderatsiya navbatida ishonchni buzadigan jim nosozlik; audit yozuvi ham tushmaydi (server.ts:2496 `if (r.ok)`).

**Takrorlash / kuzatish**

📸 Hikoyalar → bitta arizada «✅ Tasdiqlash» ni tez ikki marta bosing: ikkalasida ham yashil «✅ Tasdiqlandi…» chiqadi, ikkinchisi server tomonda ok:false.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-34 · Server aytgan aniq xato sababi API qatlamida tashlab yuboriladi — ekran hech qachon ROSTINI aytmaydi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/api.ts:113-115 «if (res.status === 403) throw new Error('forbidden'); if (!res.ok) throw new Error(`${path} -> ${res.status}`); » — javob tanasi (JSON `error`) O'QILMAYDI. Server esa aniq matn yuboradi: packages/server/src/api/server.ts:2542 «res.status(400).json({ error: e instanceof Error ? e.message : "Sana noto'g'ri" })», matnlar packages/server/src/services/oyinSeason.ts:112-131 («Tugash sanasi boshlanishdan keyin bo'lishi kerak», «Mavsum 48 soatdan uzun bo'lishi kerak…», «Mavsum 1 yildan uzun bo'lolmaydi», «O'tgan sanaga mavsum belgilab bo'lmaydi»). Panel esa bitta qattiq-kodlangan taxmin ko'rsatadi: packages/admin/src/oyin/Sozlama.tsx:78 «.catch(() => toast("⛔ Saqlanmadi — sanani tekshiring (tugash sanasi kelajakda bo'lsin)", 'bad'))». Yuklash xatolarida esa ErrBox texnik satr chiqaradi: ui.tsx:270-276 «<b>Yuklanmadi:</b> {err}» → «forbidden» yoki «/api/admin/oyin/catalog -> 500».

**Oqibat**

Ega noto'g'ri sana kiritsa — nima uchun rad etilganini BILMAYDI (48 soat sharti? 1 yil shipi? oldingi mavsum bilan kesishuv?) va faqat «tugash sanasi kelajakda bo'lsin» degan, ko'pincha noto'g'ri, taxminni o'qiydi. 403 (operator token bilan kirilganda) «forbidden» deb chiqadi — ega buni «ruxsat yo'q» deb tushunmaydi.

**Takrorlash / kuzatish**

⚙ Sozlama → 📅 Mavsum → boshlanish 10:00, tugash 11:00 (48 soatdan kam) → Saqlash → server «Mavsum 48 soatdan uzun bo'lishi kerak…» deydi, ekranda «⛔ Saqlanmadi — sanani tekshiring (tugash sanasi kelajakda bo'lsin)» chiqadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-35 · To'rtta amalda .catch UMUMAN yo'q — 403/500 bo'lsa ekran mutlaqo jim qoladi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Kartalar.tsx:92-95 (muzlatish/ochish) «void adminApi.setOyinFreeze(next).then(() => {…}).finally(() => setBusy(false));»; Kartalar.tsx:123 (topshirish) «void adminApi.oyinMarkHandover(w.prizeKey, url.trim() || null).then(() => { toast('✓ Topshirildi deb belgilandi','ok'); d.reload(); });»; packages/admin/src/oyin/Sozlama.tsx:102-104 (yangi mavsum); Sozlama.tsx:115 va :119 (kelasi mavsum qoralamasi onBlur). Bundan tashqari handover natijasi ham tekshirilmaydi — server ok:false qaytarishi mumkin: packages/server/src/services/oyinService.ts:3426 «if (!row) return { ok: false };».

**Oqibat**

Tiraj ro'yxatini muzlatish — mukofot kunining eng muhim qadami — yiqilsa ega HECH QANDAY xabar ko'rmaydi va ro'yxat muzlatilgan deb o'ylab tirajni boshlaydi. «Topshirildi» esa server rad etsa ham yashil ✓ beradi.

**Takrorlash / kuzatish**

Tarmoqni uzib (yoki operator-token bilan kirib) 💳 Kartalar → «🔒 Ro'yxatni muzlatish» → tasdiq → tugma yana faol bo'ladi, hech qanday toast chiqmaydi, holat o'zgarmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-36 · EGA BUGUN KECHQURUN PANEL BILAN QILA OLMAYDIGAN ISHLAR — yig'ma ro'yxat

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> 1) Yuklangan sovrin rasmini panelda KO'RA olmaydi (Mukofotlar.tsx:155/324 nisbiy URL) va o'sha rasm mijozga bormaydi (oyinService.ts:1041 + 4657). 2) Chiqarilgan xodim/sinov kartalari QAYSI a'zoda ekanini topa olmaydi (Kartalar.tsx:155-158 faqat son). 3) Yangi mavsumni standart sanalar bilan boshlay olmaydi va nega bo'lmaganini bilmaydi (Sozlama.tsx:102-104 + oyinSeason.ts:129-131). 4) Tiraj ro'yxatining raqamlarini ekranda ko'rsata/eksport qila olmaydi (Kartalar.tsx:196-203). 5) Sana rad etilsa server sababini o'qiy olmaydi (api.ts:113-115). 6) Muzlatish/topshirish yiqilsa buni bila olmaydi (Kartalar.tsx:92-95, :123). 7) O'z kartalarini tozalash to'liq bajarilganini tasdiqlay olmaydi (Sozlama.tsx:377-386). 8) v2 panelda o'yinni umuman ocholmaydi (v2/nav.ts).

**Oqibat**

Bu sakkiztadan 1, 2 va 3 — jonli chiqishni to'xtatuvchi darajadagi to'siqlar: rasmsiz vitrina (dizayn qoidasi buzilishi), yechib bo'lmaydigan tiraj tiqilinchi va yarim bajarilgan mavsum almashuvi. Qolganlari efir kuni ishonchni yo'qotadigan darajada.

**Takrorlash / kuzatish**

Har biri yuqoridagi alohida topilmalarda qadamma-qadam yozilgan.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-37 · Xato = bo'sh ro'yxat: 51 joyda so'rov yiqilsa ekranda "0 ta" chiqadi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/App.tsx da 51 ta `.catch(() => set…([]))` / `set…(null)` namunasi. Misollar: 4308 `const load = () => adminApi.withdrawalsTab(200).then(setRows).catch(() => setRows([]));` · 4862 `adminApi.rides(150).then(setRows).catch(() => setRows([]))` · 4910 `adminApi.driverDebts().then(setRows).catch(() => setRows([]))` · 7425 `adminApi.banned().then(setRows).catch(() => setRows([]))` · 4731 `adminApi.oprDashboard().then((r) => setRows(r.rows)).catch(() => setRows([]))`. Keyin UI shu bo'sh massivni normal holat sifatida chizadi (masalan App.tsx:4319 `const total = rows.reduce((s, r) => s + r.amount, 0);` → 0).

**Oqibat**

500/timeout/403 hammasi "ma'lumot yo'q" bo'lib ko'rinadi. Ega telefondan "Yechishlar 0 ta, jami 0 so'm" yoki "Hozir faol buyurtma yo'q" ko'radi va tinchlanadi — aslida API yiqilgan. Bu DIZAYN_QOIDALARI'dagi "bo'sh ≠ xato" qoidasining tizimli buzilishi va operativ qaror uchun eng xavfli xato turi (yolg'on tinchlik).

**Takrorlash / kuzatish**

Backendni to'xtatib panelni oching (yoki DevTools → Network → Offline): har jadval "bo'sh" ko'rinadi, birorta ham xato xabari chiqmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-38 · Gashtak boshlig'i har oy o'zini navbatchi qilib tayinlay oladi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Gashtak

**Dalil**

> applySetTurn (oyinService.ts:3236, :3256) — tayinlanuvchi boshliqning O'ZI bo'lishiga hech qanday to'siq yo'q. Sim: 3 oy ket-ket o'zini tayinladi, uchalasi ham ok.

**Oqibat**

Gashtak bonusi guruh ichida bir odamga to'planib qoladi — mexanikaning maqsadi (navbat bilan bo'lishish) buziladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-39 · 24-soatlik SLA ijrochisiz — `overdueStoryCount` hech qayerdan chaqirilmaydi (o'z izohi yolg'on)

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:230-233 — «/** 24 soat SLA — javobsiz qolgan arizalar soni (index.ts tickidan tekshiriladi). */ export async function overdueStoryCount()». Butun-repo grep (packages/**/*.ts,*.tsx) FAQAT shu ta'rif satrini qaytardi — chaqiruvchi 0 ta. Mijozga esa va'da beriladi: packages/miniapp/src/oyin.tsx:1250 «✅ Yuborildi — 24 soat ichida tekshiramiz».

**Oqibat**

Ariza yuborgan mijozga javob KAFOLATLANMAGAN. Ega panelni ochmasa, ariza cheksiz osilib qoladi: ball tushmaydi, rad sababi kelmaydi, mijoz «yubordim — hech narsa bo'lmadi» holatida qoladi. Bu DIZAYN_QOIDALARI #5 buzilishi (va'da qilingan narsa berilishi shart). Bundan tashqari `submitStory` yangi ariza kelganda EGAGA hech qanday push/alert yubormaydi — signal faqat panel ichida (admin/src/oyin/Nazorat.tsx:111, Konsol.tsx:50).

**Takrorlash / kuzatish**

grep -rn "overdueStoryCount" packages/ --include=*.ts --include=*.tsx → faqat oyinStory.ts:231. index.ts tickida ham yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-40 · Mavsum oynasidan TASHQARIDAGI arizani tasdiqlash — mijozga «ball qo'shildi» deyiladi, ball esa 0

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:181-182 — pending ro'yxati `scoped` EMAS, butun `items` ustidan yuradi: «for (const i of items) { if (status === "pending" && i.status !== "pending") continue;». Tasdiqlangach 220-satr shartsiz yozadi: «📸 <b>Hikoyangiz tasdiqlandi!</b>\n\nBall hisobingizga qo'shildi». Ball esa packages/server/src/services/oyinService.ts:522-529 da `at`ni mavsum oynasiga qattiq filtrlaydi («if (Number.isFinite(t) && t >= fromMs && t <= toMs) n++»), oyna esa 352/354: «fromMs = season.startMs», «toMs = min(nowMs, season.endMs)».

**Oqibat**

Mavsum boshlanishidan OLDIN yuborilgan (masalan owner-preview davridagi) pending ariza admin panelida ko'rinadi, ega uni tasdiqlaydi, mijoz «ball qo'shildi» xabarini oladi — balansi esa 0 ga o'zgarmaydi. Adminda bu qatorni ajratadigan HECH QANDAY belgi yo'q (`OyinStoryAdminRow` da mavsum-ichi/tashqari maydoni yo'q).

**Takrorlash / kuzatish**

`oyin:story:<id>` ichida `at` < season.startMs bo'lgan `status:"pending"` element bo'lsa: GET /api/admin/oyin/stories uni qaytaradi → tasdiqlansa xabar ketadi, computeBallMap esa uni sanamaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-41 · Moderatsiyani EGADAN boshqa hech kim qila olmaydi — nav.ts izohi teskarisini da'vo qiladi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/api/server.ts:2488 — «app.post("/api/admin/oyin/stories/review", requireAdmin, requireOwner, …)»; requireOwner (server.ts:327-333) «if (res.locals.adminRole !== "owner") res.status(403).json({error:"owner_only"})». Buning ustiga chatops roli GET'ga ham kirolmaydi: server.ts:270-272 «pathAllowedForChatOps» faqat /api/admin/chat/, /api/admin/opr/, /whoami, /health ga ruxsat beradi → 403 chatops_only. Lekin packages/admin/src/v2/nav.ts:68-70 da yozilgan: «⚠️ ownerOnly YO'Q — backend `/api/admin/oyin/stories*` faqat `requireAdmin` (operator ham ko'ra/tekshira oladi…)».

**Oqibat**

«Hikoyalar» ekrani operator-tokenli xodimga menyuda KO'RINADI, «✅ Tasdiqlash» bosilganda 403 keladi va v2 ekran umumiy «Bajarilmadi — qayta urinib ko'ring» deydi (packages/admin/src/v2/views/Hikoyalar.tsx:38-40) — sabab aytilmaydi. Ya'ni navbatni faqat EGA tozalay oladi; bu yuqoridagi SLA muammosini kuchaytiradi (ega band bo'lsa navbat qotadi va uni hech kimga topshirib bo'lmaydi).

**Takrorlash / kuzatish**

Operator (`oprtoken:<t>` qiymati "operator") bilan POST /api/admin/oyin/stories/review → 403 {"error":"owner_only"}. chatops token bilan GET /api/admin/oyin/stories → 403 {"error":"chatops_only"}.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-42 · Serverda RASM YO'Q — moderatsiya 24 soatda o'chadigan/login-devor ortidagi havolaga to'liq tayanadi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Hikoya

**Dalil**

> Yuklash yo'li umuman yo'q: packages/miniapp/src/api.ts:311 «oyinStory: (url: string) => post("/api/oyin/story", { url })» — faqat URL. packages/server/src/services/oyinStory.ts:154 saqlanadigan yagona narsa: «{ id, url, at, status, reviewedAt, reason }» (url 400 belgiga kesilgan, satr 117). `OyinStoryAdminRow` (packages/shared/src/oyin.ts:1020-1025) da rasm/skrinshot maydoni YO'Q. Mijoz UI'da esa aynan Instagram STORY havolasi so'raladi: packages/miniapp/src/oyin.tsx:2390 placeholder «instagram.com/stories/…». Rad sabablari ro'yxatining o'zi muammoni tan oladi: packages/admin/src/oyin/Hikoyalar.tsx:15 «["Hikoya topilmadi", "Havola ochilmadi", "Poster ko'rinmayapti", "Hikoya o'chirilgan"]».

**Oqibat**

Instagram hikoyasi ~24 soatda o'chadi va begona sessiyada login-devor ortida qoladi; SLA ham 24 soat. Ya'ni HALOL mijozning arizasi ega qaraganda ko'pincha ochilmaydi → «Havola ochilmadi» deb rad etiladi. Isbot hech qayerda muzlatilmagani uchun keyin nizoni hal qilishning ham iloji yo'q. Bu mexanikaning eng zaif bo'g'ini.

**Takrorlash / kuzatish**

Kod bo'yicha: hech qanday `file_id`, `sendPhoto`, disk yozuvi yoki proksi yo'q — grep bo'yicha story oqimida rasm bilan bog'liq bitta ham chaqiruv topilmadi. (Instagram havolasining o'chishi — tashqi platforma xulqi, koddan isbotlab bo'lmaydi.)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-43 · Qo'ng'iroq (ball tarixi) tarmoq xatosini «Hali voqea yo'q» degan BO'SH holatga aylantiradi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:956 `}).catch(() => setBell({ rows: [], total: 0, page: 1, pageSize: 30 }));` → :2850 `<div className="oyk-note-violet">Hali voqea yo'q. Birinchi safaringizdan keyin shu yerda ko'rinadi 🚕</div>`. Shu faylning o'zi bu naqshni chipta va do'st ro'yxatlarida ATAYLAB tuzatgan: :2059-2065 `ticketsErr` («bu ro'yxat yo'q degani EMAS, shunchaki aloqa uzildi») va :2185-2190 `jamoamErr`.

**Oqibat**

Ballari bor mijozga «hali voqea yo'q» deyiladi — ilova aloqa uzilganini mijozning bo'shligi deb TARJIMA qiladi. Ball tarixi — «ballim qayerdan keldi» degan ishonch savoliga yagona javob; xato holati bosh holatdan ajratilmagan.

**Takrorlash / kuzatish**

«Ball yig'ish» → «Ballingiz qayerdan keldi» ni tarmoqsiz bosish (`api.oyinBell()` reject).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-44 · Hikoya-posterlarida (posters/*.jpg) hech qanday havola/QR/@username yo'q — hikoyani ko'rgan odam qo'shila olmaydi

**Triaj:** C · **Og‘irlik:** 🟠 high · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/public/posters/01.jpg (941×1672): «11 TA CHIPTA TAYYOR! · Davom etamiz! · BirJoy — Bir shahar. Ko'plab xizmatlar.»; posters/15.jpg: «BIRGA YIG'AMIZ! · Bir-birimizga kuch beramiz! · BirJoy — Bir shahar. Ko'plab imkoniyatlar.» Ikkalasida ham na havola, na QR, na @koson1067bot. Rasmlar shunday-as-is beriladi: packages/server/src/services/oyinStory.ts:60-62 `return Array.from({ length: STORY_POSTER_COUNT }, (_, i) => `/posters/${String(i + 1).padStart(2, "0")}.jpg`);` va miniapp ularni faqat ko'rsatadi: oyin.tsx:2367-2374 `<img src={url} … />`. Server tomonda QR generator BOR, lekin hech kim chaqirmaydi: packages/server/src/api/server.ts:1749 `app.get("/api/oyin/qr", …)` — butun repo bo'ylab mijoz-chaqiruvi 0 ta (grep "oyin/qr" → faqat shu satr).

**Oqibat**

Hikoya-poster yo'li 100 ball turadi (oyinStoryProofBall def 100) va butun maqsadi — yangi odam olib kelish. Lekin poster hech qayerga yo'naltirmaydi: ko'rgan odam «BirJoy» so'zini eslab, o'zi qidirib topishi kerak. Konversiya deyarli nol; biz ball to'laymiz, halqa yopilmaydi. Bundan tashqari «11 TA CHIPTA TAYYOR» — qotirilgan da'vo, ulashayotgan odamning haqiqiy chipta soniga aloqasi yo'q.

**Takrorlash / kuzatish**

packages/miniapp/public/posters/01.jpg va 15.jpg ni oching — CTA/QR/username qidiring; jonli: https://app.birjoy.online/posters/01.jpg → 200 image/jpeg 167693 (repodagi fayl bilan bir xil)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-45 · `oyin` bayrog'ini yoqishning IKKI yo'li bor va bittasida hech qanday ogohlantirish yo'q

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> To'g'ri yo'l — packages/admin/src/oyin/Sozlama.tsx:477-488 «const warn = next ? `O'YIN MIJOZLARGA OCHILSINMI?…${blocked.length} ta to'siq…` : …; if (!window.confirm(warn)) return; … adminApi.setFeature('oyin', next)». Ikkinchi yo'l — eski panelning kill-switch bo'limi: packages/admin/src/App.tsx:930 «<button className={f.on ? 'btn sm' : 'btn sm danger'} onClick={() => toggle(f.name, !f.on)}>» va App.tsx:863-872 «const toggle = async (name, on) => { try { const r = await adminApi.setFeature(name, on); setFlags(r.features); } catch { alert(…) } }» — tasdiq oynasi YO'Q, to'siqlar ro'yxati yo'q. Ikkalasi ham bitta route'ga boradi va u adminlarga alert yuboradi: packages/server/src/api/server.ts:2132 «await alertAdmins(`⚙️ <b>Flag o'zgardi (admin-panel):</b> <code>${b.name}</code> → …`)».

**Oqibat**

«O'yin mijozlarga ochilsinmi?» qarori bitta tasodifiy bosish bilan, ishga-tushirish ro'yxatini ko'rmasdan bajarilishi mumkin. Ikki xil joyda bir xil ish — ega qaysi biri «rasmiy» ekanini bilmaydi (Q9 drift). Yaxshi tomoni: bayroq o'zgarishi HAR DOIM Telegram alert beradi, jim toggle yo'q.

**Takrorlash / kuzatish**

Eski panel → BOSHQARUV → ⚡ Amallar (kill-switch kartasi) → 💰 pul guruhida `oyin` qatoridagi tugmani bosing: darhol yoqiladi/o'chadi, tasdiq yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-46 · v2 panelda O'YIN BO'LIMI UMUMAN YO'Q — `admin_ui=v2` yoqilgan brauzerda konsolga kirib bo'lmaydi

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/v2/nav.ts:22-83 NAV ro'yxatida `oyin` id'si yo'q (bor: bugun, jonli, buyurtmalar, operator, obzvon, odamlar, moliya…, hikoyalar, flaglar, jurnal, tokenlar). packages/admin/src/v2/AdminV2.tsx:58-64 «function Router({ view }) { if (view === 'bugun') … return <Todo view={view} />; }» — ko'chirilgan atigi 4 ekran. Tanlov localStorage'da yopishib qoladi: packages/admin/src/main.tsx:39 «const isV2 = !isKit && localStorage.getItem(UI_KEY) === 'v2';». O'yin konsoli faqat eski panelda: packages/admin/src/App.tsx:123 «{ id: 'oyin', icon: '🎮', label: "O'yin mavsumi" }» → App.tsx:5068-5071 «const OYIN_KONSOL = true; function OyinTab() { if (OYIN_KONSOL) return <Konsol />; … }».

**Oqibat**

Agar ega (yoki uning brauzeri) bir marta `#v2` ni ochgan bo'lsa — bugun kechqurun o'yin konsolini TOPA OLMAYDI: v2 menyusida bunday punkt yo'q, faqat `#v1` hash'ini bilgan odam qaytadi. chatops roli uchun v2 majburiy (AdminV2.tsx:2-4 izohi) — ya'ni operator o'yin ekranlariga umuman kira olmaydi.

**Takrorlash / kuzatish**

Panelni bir marta admin.birjoy.online/#v2 bilan oching → keyin oddiy manzil bilan qayting: chap menyuda «O'yin mavsumi» yo'q. Qaytish: admin.birjoy.online/#v1.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-47 · UI 0-ballik vazifalarni va'da qiladi: «Ilovaga kirish +0», «Do'stga ulashish +0»

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ball

**Dalil**

> miniapp/src/oyin.tsx:2750 `{ key: "login", ..., gain: state.hints.loginBall, tap: null, counts: true }` va :2752 `{ key: "share", ..., gain: state.hints.shareBall, ... }` — ball>0 sharti YO'Q, holbuki qo'shni qatorlarda bor: :2755 `if (state.quest && state.quest.ball > 0)`, :2758 `if (state.story.ballEach > 0 ...)`, :2761 `if (... && state.homeTask.ball > 0)`. Jonli knob oyinDailyLoginBall=0 (economy.ts:306 def 0), oyinShareBall def 0 (economy.ts:307). Yana: oyin.tsx:1301 `showToast(`📤 Rahmat! +${state?.hints.shareBall ?? 0} ball qo'shildi`)` va :2311 «Ulashish boni kuniga bir marta beriladi».

**Oqibat**

«🎯 Ball yig'ish» varag'i mijozga ikkita 0-ballik vazifani ko'rsatadi va ularni «N/M bajarildi» progressiga QO'SHADI (counts:true). Ulashgan mijoz «+0 ball qo'shildi» toastini oladi. DIZAYN_QOIDALARI #5 (yozuv harakat va'da qilsa — harakat bajarilishi shart) buzilishi. To'liq ro'yxat varag'i (`ballRows`, :210 `.filter(([, , ball]) => ball > 0)`) buni TO'G'RI qiladi — ya'ni naqsh mavjud, shu ikki qatorga qo'llanmagan.

**Takrorlash / kuzatish**

Bayroq yoqilgach har qanday mijoz «→ Ball yig'ish» ni ochadi → ro'yxatda «Ilovaga kirish ✓ +0» va «Do'stga ulashish +0» turadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-48 · Tanlangan poster serverga UMUMAN yuborilmaydi — 30 rasmli panjara bezak, mukofot qoidasiga ta'sir qilmaydi

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Hikoya

**Dalil**

> packages/miniapp/src/oyin.tsx:639 «const [selectedPoster, setSelectedPoster] = useState<string | null>(null)» va 1222 «const pickPoster = useCallback((url) => { haptic(); setSelectedPoster(url); }, [])» — `selectedPoster` faqat 2369/2378 da render uchun o'qiladi, hech qanday so'rovga qo'shilmaydi. Yuborish esa 1249: «const r = await api.oyinStory(url.trim())».

**Oqibat**

Server «qaysi poster ishlatildi» yoki «umuman poster ishlatildimi» ni BILMAYDI. Mijoz posterni tanlamasdan ham istalgan instagram/t.me havolasini yuborishi mumkin — tekshiruv butunlay adminning ko'ziga qoladi. Ekran «poster tanlang» deb turadi, lekin bu qadam texnik jihatdan majburiy emas (DIZAYN_QOIDALARI: prototip elementi ma'lumotsiz jo'natilmaydi).

**Takrorlash / kuzatish**

POST /api/oyin/story {"url":"https://t.me/durov"} → poster tanlanmagan bo'lsa ham `{ok:true}` (submitStory faqat ALLOWED_HOSTS ni tekshiradi, oyinStory.ts:124).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-49 · Bir xil POSTERNI qayta joylab ball olish mumkin — dedup faqat URL bo'yicha

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:141-152 — dedup normalizatsiyalangan URL bo'yicha, butun populyatsiya bo'ylab: «if (it.status !== "rejected" && normalizeStoryUrl(it.url) === norm) return { ok:false, reason:"duplicate" }». Rasm hech qayerda saqlanmagani uchun (yuqoridagi topilma) tasvir-darajasidagi dedup PRINSIPIAL jihatdan imkonsiz.

**Oqibat**

Mijoz xuddi SHU posterni qayta-qayta hikoyaga qo'ysa — har safar YANGI URL, ya'ni dedup o'tib ketadi. Cheklov faqat 72 soatlik tanaffus (STORY_COOLDOWN_HOURS=42-satr) + mavsumda 3 ta (OYIN_STORY_SEASON_LIMIT). Ijobiy tomoni tasdiqlangan: URL-xotira mavsumlar oralab SAQLANADI — `oyin:story:` ARCHIVED_PREFIXES ro'yxatiga ATAYLAB kiritilmagan (oyinService.ts:3792-3793), ya'ni eski URL keyingi mavsumda qayta ishlatilmaydi.

**Takrorlash / kuzatish**

submitStory(m, "https://instagram.com/stories/u/111") → ok. 72 soatdan keyin submitStory(m, "https://instagram.com/stories/u/222") (xuddi shu poster, yangi post) → ok. Mavsumda 3 marta.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-50 · «Bugungi vazifalar» ro'yxati 0 ball beradigan vazifalarni «+0» deb ko'rsatadi va progressni shishiradi; ulashish toasti «+0 ball qo'shildi» deydi

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:2750 `{ key: "login", label: "Ilovaga kirish", done: state.today.login, gain: state.hints.loginBall, tap: null, counts: true }` · :2752 `{ key: "share", ... gain: state.hints.shareBall, ... counts: true }` — `gain > 0` filtri YO'Q, holbuki shu faylning to'liq jadvali buni ataylab qiladi: :210 `.filter(([, , ball]) => ball > 0)`. Chizilishi :2779 `{t.done ? `✓ +${t.gain}` : `+${t.gain}`}`. Manba: packages/server/src/services/oyinService.ts:949-950 `loginBall: econ.oyinDailyLoginBall ?? 0, shareBall: econ.oyinShareBall ?? 0`; packages/shared/src/economy.ts:306-307 ikkalasining `def: 0` (login jonli ham 0 — brifing). Ulashish toasti: oyin.tsx:1301 `showToast(`📤 Rahmat! +${state?.hints.shareBall ?? 0} ball qo'shildi`)`, server esa knob 0 bo'lsa ham ok qaytaradi — oyinService.ts:1850-1853 `markShare` faqat kunni belgilaydi.

**Oqibat**

Mijoz ekranda «Ilovaga kirish ✓ +0» va «Do'stga ulashish +0» ni ko'radi; «N/M bajarildi» hisobi hech qachon ball bermaydigan qatorlar bilan to'ldiriladi (login har doim ✓ — `/state` so'rovining o'zi markLogin qiladi). Ulashgandan keyin literal «+0 ball qo'shildi» chiqadi. DIZAYN_QOIDALARI #7 va #9 buzilishi.

**Takrorlash / kuzatish**

Bosh ekran → «Ball yig'ish» varag'i; jonli knoblarda oyinDailyLoginBall=0.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-51 · Yakka kartali yutqazish xabarida ma'nosiz raqam: «1 ta karta orasidan boshqa raqam chiqdi»

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3678 — `? \`🎬 <b>Tiraj bo'ldi</b>\n\nKartangiz o'ynadi — bu safar chiqmadi. ${fresh.length} ta karta orasidan boshqa raqam chiqdi.…\`` — bu shox aynan `fresh.length === 1` holatida tanlanadi (3677 `fresh.length === 1 ? … : …`), ya'ni matn har doim «1 ta karta orasidan…» deb chiqadi. Haqiqiy tiraj hajmi boshqa maydonda bor va G'OLIB xabarida ishlatilgan: 3651 `${w.poolSize} ta karta ichidan sizniki chiqdi`.

**Oqibat**

Eng KO'P uchraydigan holat (jonli holat: 1 chipta egasi) aynan shu — mijoz «1 ta karta orasidan boshqa raqam chiqdi» degan mantiqsiz jumlani oladi. Bu bitta tiraj natijasidan qoladigan yagona taassurot va u tizimni bekor, hatto firibgar ko'rsatadi.

**Takrorlash / kuzatish**

Bitta yutqazgan kartasi bor a'zo uchun seasonDrawNotify → 3677 sharti true → 3678 matni: «Kartangiz o'ynadi — bu safar chiqmadi. 1 ta karta orasidan boshqa raqam chiqdi.»

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-52 · 6 ta xabardan 5 tasi harakat va'da qiladi, lekin TUGMASIZ ketadi

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> `notifyOnce` ning 5-argumenti (`extra`) berilgan yagona joy — cardMemoryTick: oyinService.ts:3723 `notifyOnce(bot, chatId, memberId, "oyin_cardmem", html, appBtn("🎴 Kartalarim", "oyin"))`. Qolganlari tugmasiz: 3568 (warn7), 3582 (warn3), 3597 (warn49h), 3625 (seasonCloseNotify), 3652 (g'olib), 3680 (yutqazgan). Matnlar esa aniq harakat so'raydi: 3566 «Saqlashning yagona yo'li: kartaga aylantirish», 3596 «hozir sarflasangiz kartaga aylanadi», 3679 «🎁 Yangi sovg'alarni ko'ring». `appBtn` mavjud va ishlaydi (packages/server/src/bot/webAppUrl.ts:40).

**Oqibat**

CLAUDE.md/DIZAYN_QOIDALARI ning «yozuv harakat va'da qilsa tugma shart» qoidasi buzilgan. Eng shoshilinch xabar («Oxirgi soat») da mijoz ilovani o'zi qidirishi kerak — bir necha bosish, aynan vaqt tanqis paytda. Konversiya sezilarli yo'qoladi.

**Takrorlash / kuzatish**

3568/3582/3597/3625/3652/3680 chaqiruvlarini 3723 bilan solishtiring — birortasida 5-argument yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-53 · Ball ulashish OYNASI ochilgani uchun beriladi, HAQIQIY ulashish uchun emas

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/src/oyin.tsx:1296-1301 `if (!shareStory(text, link)) shareLink(link, text);` darhol keyin `const b = await api.oyinShare();` — ikkala funksiya ham foydalanuvchi ulashganini BILMAYDI: telegram.ts:611 `shareStory` faqat `tg.shareToStory` chaqirilgani uchun `true` qaytaradi, telegram.ts:626-629 `shareLink` esa `openTelegramLink(share)` — callback yo'q. Server ham hech narsa tekshirmaydi: oyinService.ts:1850-1853 markShare → markDay (faqat kun belgilaydi).

**Oqibat**

Hozir zarari yo'q (oyinShareBall=0), lekin ega bu knobni ko'tarsa — mijoz oynani ochib, «Bekor» bosib, har kuni bepul ball oladi. Bu aynan «bepul yo'l» xavfi bo'lib, oyinDailyLoginBall/oyinStreakBall ataylab 0 qilingan sabab bilan bir xil.

**Takrorlash / kuzatish**

oyin.tsx:1296-1301 kod yo'li: ulashish oynasi ochilishi bilan `api.oyinShare()` ketadi; foydalanuvchi Telegram oynasini yopsa ham `markDay` allaqachon yozilgan

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-54 · Haydovchi ulashish yo'llari OG-landingdan chetlab o'tadi — poster CHIQMAYDI

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ulashish

**Dalil**

> packages/server/src/bot/bot.ts:80-86 `function inviteLandingUrl(botLink: string): string { const m = botLink.match(/(?:start|startapp)=ref_?([a-zA-Z0-9_-]+)/); … return m && m[1] ? `${INVITE_LANDING}?r=…` : botLink; }` — regex faqat `ref_` ni tanadi. Haydovchi havolalari boshqa prefiks bilan: packages/server/src/services/recruitService.ts:200-202 `return `https://t.me/${user}?start=drv_${driverMemberId}`;` va :207-209 `…?start=drvdrv_${driverMemberId}`. Ular baribir `inviteLandingUrl` ga uzatiladi: bot.ts:1312 va bot.ts:1022 `https://t.me/share/url?url=${encodeURIComponent(inviteLandingUrl(link))}`.

**Oqibat**

Haydovchi «📤 Havolani ulashish» bosganda Telegram OG-poster o'rniga botning quruq profil-preview'ini chizadi — mijoz-taklif va haydovchi-taklif kanallari vizual jihatdan ikkinchi darajali ko'rinadi, garchi kod ularni ham landing bilan ulashmoqchi bo'lgan (funksiya nomi shuni aytadi).

**Takrorlash / kuzatish**

bot.ts:80 regexni `drv_123` bilan sinang — mos kelmaydi, funksiya xom `t.me/koson1067bot?start=drv_123` ni qaytaradi

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-55 · Taklif qilingan do'st botda o'yin haqida hech narsa ko'rmaydi — halqa oxirida uzilish

**Triaj:** C · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ulashish

**Dalil**

> packages/server/src/bot/bot.ts:315 `if (r.attached) await sendOyinJoinCard(bot, id, inviterName);` → packages/server/src/bot/oyin.ts:22-23 `const { featureOn } = await import("../services/featureFlags"); if (!(await featureOn("oyin"))) return;` — `oyin` DEFAULT_OFF (featureFlags.ts:182). Faqat bayroqsiz jumla qoladi: bot.ts:309-312 `🤝 Sizni <b>${esc(inviterName)}</b> taklif qildi — xush kelibsiz!`

**Oqibat**

Ulashish zanjirining oxirgi bo'g'ini bo'sh: mijoz «sovg'a/ball» posterini ko'rib bosadi, botga kiradi va faqat «xush kelibsiz» oladi. Poster + landing + bot kartochkasi UCHTA joyda uchta xil holat — vizual va'da eng baland, bajarilishi eng past.

**Takrorlash / kuzatish**

bot/oyin.ts:22 — bayroq off bo'lsa funksiya darhol return qiladi; jonli bazada feature:oyin qatori yo'q (berilgan kontekst)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---


## ▶ KEYIN

### OY-56 · «🧹 Kartalarimni tozalash» hech narsa bekor qilinmasa ham yashil ✅ beradi va 30 tadan keyin jim to'xtaydi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Sozlama.tsx:377-386: «for (const t of me.data!.tickets) { const r = await adminApi.oyinCancelTicket(meId, t.gno).catch(() => null); if (r?.ok) done += 1; } toast(`✅ ${done} ta karta bekor qilindi`, 'ok');» — tone HAR DOIM 'ok', muvaffaqiyatsizlar sanalmaydi va sababi aytilmaydi. Server tomonda daqiqasiga 30 ta chegara: packages/server/src/api/server.ts:2854 «app.post('/api/admin/oyin/ticket/cancel', requireAdmin, requireOwner, rateLimit(30), …)» va rateLimit 429 qaytaradi (server.ts:227-229).

**Oqibat**

Bu — 1-MAJBURIY savolning yagona bir-bosishli javobi (ega o'z sinov kartalarini tozalash tugmasi). U qisman bajarilib «✅ 0 ta karta bekor qilindi» yoki «✅ 12 ta…» (aslida 40 ta bor edi) deb yashil chiqadi. Ega tozalandi deb o'ylab bayroqni yoqadi, kartalar esa sovrin o'rinlarini egallab turaveradi va tirajni bloklaydi.

**Takrorlash / kuzatish**

⚙ Sozlama → 🧪 Men → o'zingizni toping → «🧹 Kartalarimni tozalash (N)». N>30 bo'lsa 31-chisidan 429 keladi, .catch(() => null) uni yutadi, toast baribir ✅ bo'ladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-57 · «🧪 Men» ekrani 404'da o'lik tugunga aylanadi — na xato, na qaytish tugmasi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Sozlama.tsx:305 «const me = useLoad(async () => (meId ? adminApi.oyinMember(meId) : null), [meId]);» — `me.err` HECH QAYERDA render qilinmaydi. Qidiruv qutisi faqat meId yo'qligida: Sozlama.tsx:342 «{!meId && (…)}», qaytish tugmasi esa `me.data` shartining ICHIDA: Sozlama.tsx:362 «{meId && me.data && (» … :388 «<Btn variant='ghost' onClick={() => { localStorage.removeItem(ME_KEY); … }}>✕ Bu men emasman</Btn>». Server ball-xaritada satr bo'lmasa 404 beradi: packages/server/src/api/server.ts:2834 «if (!d) { res.status(404).json({ error: 'not_found' }); return; }», satr esa faqat MAVSUM oynasidagi faoliyatdan tug'iladi (oyinService.ts:319-354).

**Oqibat**

meId localStorage'da saqlanadi (ME_KEY='oyin_admin_me'). Yangi mavsum boshlangach yoki ega hali mavsumda safar qilmagan bo'lsa — ekranda faqat sariq ogohlantirish qoladi: qidiruv ham, «✕ Bu men emasman» ham yo'q. Ega o'zini sinab ko'ra olmaydi va sababini bilmaydi; yagona chiqish — localStorage'ni qo'lda tozalash.

**Takrorlash / kuzatish**

⚙ Sozlama → 🧪 Men → o'zingizni toping (meId yoziladi) → mavsumni qayta boshlang (yoki ball-faoliyati yo'q a'zoni tanlang) → shu tabga qayting: bo'sh ekran, boshqaruv elementi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-58 · Ball jadvali knoblari tasdiqsiz va DARHOL saqlanadi; server qiymatni kessa ham panel siz yozgan raqamni «✓» deb ko'rsatadi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Sozlama.tsx:154-161 «onBlur={(ev) => { const val = Number(ev.target.value); … void adminApi.setBonusEconomy(k.key, val).then(() => { toast(`✓ ${k.label} = ${val}`, 'ok'); e.reload(); })…}» — toast SERVER qaytargan qiymatni emas, kiritilgan `val` ni aytadi. Server esa kesadi: packages/server/src/services/bonusConfig.ts:29 «if (key in cur) cur[key] = clampBonusEcon(key, value);». Input `defaultValue` bilan boshqarilmagan (Sozlama.tsx:153) — `e.reload()` dan keyin React uni QAYTA YOZMAYDI, ya'ni ekranda rad etilgan raqam turaveradi. Kartochka sarlavhasi ham «o'zgarish DARHOL kuchga kiradi» (Sozlama.tsx:142).

**Oqibat**

Bu knoblar jonli iqtisod: oyinRideBall (35), oyinFirstRideBall (100), oyinMinSellPct (100). Bitta noto'g'ri raqam tasdiqsiz, bir marta fokusdan chiqishda hammaga ta'sir qiladi — va panel keyin ham noto'g'ri qiymatni ko'rsatib turadi, ya'ni ega jonli holatni panelga qarab BILA OLMAYDI.

**Takrorlash / kuzatish**

⚙ Sozlama → 🎚 Ball jadvali → oyinRideBall ga chegaradan katta son yozing → boshqa joyga bosing → «✓ … = <siz yozgan son>» chiqadi, katakda ham o'sha son qoladi; server esa min/max ga kesib saqlagan.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-59 · Komentariyani «abadiy o'chirish» va yozuvchini bloklash tasdiqsiz — bir bosishda bajariladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Komentariyalar.tsx:172 «<Btn sm variant='dgr' … onClick={() => void act(c, () => adminApi.oyinCommentRemove(c.id), '🗑 Olib tashlandi')}>🗑 O'chirish</Btn>» va :174 bloklash — ikkalasida ham window.confirm YO'Q, holbuki shu ekranning o'z izohi qaytarib bo'lmasligini yozadi: Komentariyalar.tsx:184 «"🗑 O'chirish" <b>abadiy</b> — qayta yozib ham qaytmaydi.». Solishtirish uchun karta bekor qilish, muzlatish, katalog tiklash — hammasida confirm bor (Kartalar.tsx:88, Odamlar.tsx:270, Mukofotlar.tsx:668).

**Oqibat**

Moderatsiya navbatida sichqoncha sirg'alsa mijozning yozuvi qaytarib bo'lmaydigan darajada o'chadi yoki mijoz bloklanadi. Panelning qolgan qismidagi standartga zid.

**Takrorlash / kuzatish**

💬 Komentariyalar → istalgan qatorda «🗑 O'chirish» → darhol bajariladi, tasdiq oynasi chiqmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-60 · Yozuv amallari jimgina yiqiladi — 67 ta `.catch(() => undefined)` va butunlay catch'siz `await`lar

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/App.tsx:2067 `onClick={async () => { await adminApi.homeFeaturedDelete(it.id); load(); }}` — catch YO'Q: 403/500 bo'lsa unhandled rejection, `load()` hech qachon chaqirilmaydi, ekran o'zgarmaydi, xabar yo'q. Shu naqsh: 2066 (homeFeaturedActive), 984 (optokenRevoke). Boshqa 67 joyda esa xato yutiladi: 2392 `await adminApi.shopToggle(p.id, !p.active).catch(() => undefined); load();` · 1702 `await adminApi.toggleCampaign(id, active).catch(() => undefined); load();` · 2234 `await adminApi.shopDelete(p.id).catch(() => undefined);`. api.ts:112-116 `req()` esa serverning haqiqiy xabarini (`{error:"kind + title required"}`) tashlab yuboradi: `throw new Error(\`${path} -> ${res.status}\`)`.

**Oqibat**

Ega tugmani bosadi — hech narsa bo'lmaydi. Sabab (403 rol, 400 validatsiya, 429 limit) hech qachon ko'rsatilmaydi. Ega qayta-qayta bosadi yoki "ishladi" deb o'ylab ketadi. #1 bilan birga: `operator` roli requireOwner-li tugmalarni bosganda AYNAN shu jim yiqilishni ko'radi.

**Takrorlash / kuzatish**

Rolni `operator` qilib (yoki DevTools'da tarmoqni bloklab) «Bosh sahifa» tabidagi 🗑 tugmasini bosing: qator o'chmaydi, xato ham chiqmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-61 · Qaytarib bo'lmaydigan amallar tasdiqsiz — token bekor qilish, pul to'lash, tanga berish

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/App.tsx:984 `<button className="btn sm danger" onClick={async () => { await adminApi.optokenRevoke(t.token); load(); }}>🗑 Bekor</button>` — confirm YO'Q (yonidagi matn o'zi aytadi: «bekor qilsangiz egasi darhol kira olmaydi»). · packages/admin/src/jamoa.tsx:524-533 `const doPay = async () => { … const r = await adminApi.staffPay({ employeeId: empId, kind: pay.kind, amount, … })` — REAL pul to'lovi, confirm YO'Q. · App.tsx:4677 `onClick={() => act("coins", { amount: coinAmt, reason: coinReason.trim() })}` — operator tanga beradi, confirm YO'Q (server tomonda faqat sutkalik umumiy cheklov: adminOps.ts:189 `const ADMIN_GRANT_DAILY_CAP = 500_000;` va adminOps.ts:274 `Math.abs(amt) > 1_000_000`). · App.tsx:1192-1207 `doGrant` (ega tanga/cashback beradi) — confirm YO'Q. · App.tsx:2067 home-featured o'chirish — confirm YO'Q.

**Oqibat**

Bitta noto'g'ri bosish yoki nol qo'shib yuborilgan summa darhol kuchga kiradi: xodimga ortiqcha to'lov yoziladi, 50 000 o'rniga 500 000 tanga chiqariladi (sutkalik limitning hammasi), yoki ishlayotgan sotuvchi/operator tokeni o'ladi. Taqqoslash uchun o'yin qismi to'g'ri qilingan — App.tsx:6602-6607 (flag), 6405 (mavsum reset), 6037 (disband), 6985 (chipta bekor) hammasi batafsil `confirm` bilan; umumiy panelda shu intizom yo'q.

**Takrorlash / kuzatish**

Boshqaruv → Faol operator-tokenlar → «🗑 Bekor» — bitta bosish, dialog yo'q, token o'chdi. Jamoa → xodim → to'lov summasi → «Yozildi» darhol chiqadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-62 · Token muddatsiz, `?key=` URL'dan localStorage'ga jimgina ko'chiriladi, rotatsiya yo'li yo'q

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/api.ts:58 `const TOKEN_KEY = "admin_token";` va 62-70: `function adminToken() { const fromUrl = new URLSearchParams(location.search).get("key"); if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl); return fromUrl || localStorage.getItem(TOKEN_KEY) || ""; }` — bu GETTER har so'rovda chaqiriladi va yon-ta'sir sifatida YOZADI. Muddat (expiry/TTL) hech qayerda yo'q; `oprtoken:<token>` satrlari ham AppState'da muddatsiz (server.ts:3646, 3655). Chiqish tugmasi bor: App.tsx:179 `function logout() { clearAdminToken(); setHealth(null); setAuthed(false); }` (sidebar 195/244, operator-shell 4786).

**Oqibat**

Token bir marta oqsa — abadiy. Ega `ADMIN_PANEL_TOKEN`ni almashtirish uchun VPS'da .env tahrirlab `systemctl restart bot1067` qilishi kerak (panelda "parolni o'zgartirish" yo'q). `?key=` esa tokenni sotuvchiga yuborilgan havoladan (App.tsx:972 `link: ${window.location.origin}/?key=${r.token}`) qabul qiluvchining brauzer tarixiga ham yozadi.

**Takrorlash / kuzatish**

api.ts:62-70 ni o'qing — hech qanday `expiresAt`/`issuedAt` yo'q. Panelda parol almashtirish ekrani grep bilan topilmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-63 · UI/server rol nomuvofiqligi: v2 nav «ownerOnly» deydi, server esa oddiy admin'ga ruxsat beradi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/v2/nav.ts:96 `{ id: "bosh", icon: "⌂", label: "Bosh sahifa", ownerOnly: true }` ↔ server.ts:916/922/927 `app.post("/api/admin/home-featured", requireAdmin, …)`, `app.post("/api/admin/home-featured/:id/active", requireAdmin, …)`, `app.delete("/api/admin/home-featured/:id", requireAdmin, …)` — `requireOwner` YO'Q. Xuddi shu: nav.ts:97 `{ id: "pik", … ownerOnly: true }` ↔ server.ts:4231/4239 `app.post("/api/admin/peak-hours", requireAdmin, rateLimit(20), …)` va `app.delete("/api/admin/peak-hours/:id", requireAdmin, rateLimit(20), …)`; nav.ts:94 `{ id: "ravella", … ownerOnly: true }` ↔ server.ts:3282-3336 `/api/admin/ravella/category|item|addon|orders` — hammasi `requireAdmin` (faqat DELETE'larda `requireOwner`). Teskari yo'nalishda esa v1 panelda umuman filtr yo'q: App.tsx:64-147 `NAV_GROUPS` statik.

**Oqibat**

Xavfsizlik menyuni yashirishga tayanadi, chokepoint'ga emas — bu #1 bilan birga ishlaydi: menyu yashirilgan bo'lsa ham API ochiq. Amaliy oqibat: `operator` tokeni mijoz BOSH SAHIFASINI o'zgartira oladi va haydovchilarga pik-bonus TG xabari yubora oladi (server.ts:4243 `upsertPeakHour({…}, sendTg)`).

**Takrorlash / kuzatish**

`curl -X DELETE -H "X-Admin-Token: <operator-token>" https://api.birjoy.online/api/admin/home-featured/1` → `{"ok":true}` (403 emas), holbuki nav.ts o'sha ekranni ega-only deb belgilagan.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-64 · v2 panelning 26 manzilidan 22 tasi — bo'sh "ko'chirilmagan" plashkasi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/v2/AdminV2.tsx:57-64 `function Router({ view }) { if (view === "bugun") return <Bugun />; if (view === "odamlar") return <Odamlar />; if (view === "jonli") return <Jonli />; if (view === "hikoyalar") return <Hikoyalar />; return <Todo view={view} />; }` — `packages/admin/src/v2/views/` ichida atigi 4 fayl (Bugun.tsx, Hikoyalar.tsx, Jonli.tsx, Odamlar.tsx). nav.ts:24-116 esa 26 ta manzil e'lon qiladi (moliya, yechishlar, tranzaksiya, qarzlar, buyurtmalar, flaglar, tokenlar, dokon, elonlar, …). Tanlov localStorage'da SAQLANADI: main.tsx:26-28 `if (hash === "v2") localStorage.setItem(UI_KEY, "v2");` va main.tsx:37 `const isV2 = !isKit && localStorage.getItem(UI_KEY) === "v2";`.

**Oqibat**

Agar ega bir marta `#v2` ni ochsa, telefonida shu holat YOPISHIB qoladi va kechqurun tirajni boshqarayotganda «Moliya», «Yechishlar», «Flaglar», «Buyurtmalar» o'rniga «Bu ekran hali v2'ga ko'chirilmagan» matnini ko'radi. Chiqish yo'li bor (AdminV2.tsx:42-47 «← Eski panelga qaytish»), lekin uni topish uchun avval ishlamaydigan ekranga tushish kerak. Menyu 26 ta yo'l va'da qiladi, 4 tasi bajaradi — bu «yozuv harakat va'da qilsa tugma shart» qoidasining aksi.

**Takrorlash / kuzatish**

admin.birjoy.online/#v2 → chap menyudan «Moliya» yoki «Flaglar» → plashka. Sahifani yangilang → yana v2 (localStorage saqlagan).

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-65 · CSV eksport: yagona-manba `lib/csv.ts` yozilgan, lekin JONLI panel undan foydalanmaydi — BOM'siz va qochirishsiz fayllar

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/lib/csv.ts:19-31 `downloadCsv()` — BOM majburiy («usiz Excel UTF-8 ni tanimaydi va o'zbekcha matn krakozyabraga aylanadi») + RFC4180 qochirish. Uni FAQAT design/DataTable.tsx:14 va oyin/*.tsx import qiladi — App.tsx da import YO'Q (grep: `lib/csv` topilmadi), o'rniga o'z lokal funksiyalari bor: App.tsx:1069, 5721. Eng yomon ikkisi: App.tsx:4325 `const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });` (yechishlar.csv) va App.tsx:4385 (baholar.csv) — BOM yo'q, `charset` yo'q, qochirish o'rniga faqat bitta ustunda `(r.kasMessage ?? "").replace(/,/g, ";")`.

**Oqibat**

«Yechishlar» va «Baholar» eksporti Excel'da o'zbekcha ismlarni buzadi, ism/izohdagi vergul yoki qo'shtirnoq ustunlarni surib yuboradi — ya'ni PUL hisobotidagi summa noto'g'ri ustunga tushishi mumkin. Muammo allaqachon hal qilingan (lib/csv.ts), shunchaki jonli panelga ulanmagan.

**Takrorlash / kuzatish**

Yechishlar tabi → «CSV» → faylni Excel'da oching: «Sarvarxon» kabi matn buziladi; ismida vergul bo'lgan qator ustunlarni suradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-66 · `req()` da timeout yo'q, `deletePeakHour` esa `req()`dan butunlay chetlab o'tadi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/api.ts:111-117 `async function req<T>(path, init) { const res = await fetch(...); if (res.status === 403) throw new Error("forbidden"); if (!res.ok) throw new Error(\`${path} -> ${res.status}\`); return (await res.json()) as T; }` — `AbortController`/`signal` butun faylda 0 marta uchraydi. Alohida chetlab o'tish: api.ts:524 `deletePeakHour: (id) => fetch(\`${API_BASE}/api/admin/peak-hours/${id}\`, { method: "DELETE", headers: authHeaders() }).then((r) => r.json() as Promise<{ ok: boolean }>)` — `res.ok` TEKSHIRILMAYDI; chaqiruvchi App.tsx:7546 `await adminApi.deletePeakHour(id); load();` — catch YO'Q.

**Oqibat**

Sekin/osilib qolgan so'rov (O'zbekistondan ~126ms RTT, mobil tarmoq) abadiy spinner qoldiradi — ekranda "Yuklanmoqda…" turadi, ega kutadi, hech qachon xato ko'rmaydi. `deletePeakHour` da 500 qaytsa (HTML javob) `r.json()` parse-xatosi bilan yiqiladi → unhandled rejection, ro'yxat yangilanmaydi, pik-vaqt o'chmagan holda "o'chdi" ko'rinadi.

**Takrorlash / kuzatish**

DevTools → Network → "Slow 3G"/offline, istalgan tabni oching: spinner qotadi. Pik Vaqtlar → 🗑 → tasdiqlang → server 500 bersa hech narsa o'zgarmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-67 · Jurnal ≠ balans: «phone» qatori linkedAt dan, ball esa oyin:phoneball: belgisidan o'qiladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ball

**Dalil**

> getActivity oyinService.ts:4165 `if (tu.memberId && tu.phone && tu.linkedAt) push(tu.linkedAt.toISOString(), tu.memberId, "phone", econ.oyinPhoneBall ?? 0, ...)` — MANBA `linkedAt`. computeBallMap oyinService.ts:495-500 esa `oyin:phoneball:<memberId>` belgisining SANASIDAN o'qiydi. Izohning o'zi (:396-398) `linkedAt` dan ataylab voz kechilganini aytadi.

**Oqibat**

«Ballingiz qayerdan keldi» (mijoz qo'ng'irog'i) va admin faoliyat-jadvali telefon-ball bo'yicha balans bilan TO'G'RI KELMAYDI ikki tomonlama: (a) mavsumdan oldin raqam ulagan, mavsumda ilovani ochgan mijoz — ball +20 bor, jadvalda qator YO'Q; (b) mavsumda raqam ulab, o'yinni ochmagan mijoz — jadvalda +20 qator bor, ball 0. Bu ega 2026-08-11 da o'zi topgan bug'ning aynan shakli, faqat `phone` manbasida qolib ketgan.

**Takrorlash / kuzatish**

Mavsum 10-avg boshlanadi. Iyulda raqam ulagan mijoz 15-avgustda o'yinni ochadi → phoneball belgisi 15-avg → ball +20; getActivity `linkedAt`=iyul → 4322-qator filtri (`t < fromMs`) uni tashlaydi → jadvalda hech narsa.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-68 · Gashtak (jamoa) balli faoliyat-jadvalidan tushib qoladi — mavsum oyning 1-sanasidan boshlanmasa

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ball

**Dalil**

> oyinService.ts:4259 `push(dayAt(`${r.monthKey}-01`), r.memberId, "jamoa", amount, ...)` — qator sanasi HAR DOIM oyning 1-kuni. dayAt (:4185-4191) faqat ±24 soatlik qirrani qisadi: `if (... fromMs - ms < 86400_000)`. Yakuniy filtr :4322 `if (Number.isFinite(t) && (t < fromMs || t > toMs)) return false;`

**Oqibat**

Jonli mavsum 10-avgustda boshlangan. Avgust oyidagi gashtak balli `2026-08-01` sanasi bilan yoziladi → fromMs (10-avg) dan 9 kun oldin → filtr tashlaydi. Balansda ball BOR, jurnalda YO'Q — navbatchi «6 ball × N safar qayerdan keldi?» deb so'rasa javob yo'q. Faqat oyning 1-sanasida boshlanadigan mavsumlarda to'g'ri ishlaydi.

**Takrorlash / kuzatish**

Mavsum startIso=2026-08-10. GashtakReward monthKey='2026-08'. getActivity({scope:'season'}) → jamoa qatori 2026-08-01T00:00Z → 4322-qator filtri drop qiladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-69 · Mavsum oynasidan tashqarida tasdiqlangan hikoya: push «ball qo'shildi» deydi, ball 0

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ball

**Dalil**

> oyinStory.ts:196-232 `adminReviewStory` — mavsum oynasi TEKSHIRILMAYDI, faqat `item.status !== "pending"` qaraladi; push matni :219 `"📸 <b>Hikoyangiz tasdiqlandi!</b>\n\nBall hisobingizga qo'shildi — rahmat! 🎉"`. computeBallMap oyinService.ts:522-525 esa `it.at` (YUBORISH sanasi) ni `t >= fromMs && t <= toMs` bilan kesadi.

**Oqibat**

Mavsum oxirida yuborilgan, keyingi mavsum boshlangach tasdiqlangan hikoya uchun mijozga «ball qo'shildi» xabari boradi, aslida 100 ball hech qayerda paydo bo'lmaydi (eski mavsum oynasida qoladi, u esa yonib ketgan). Admin 24 soatlik SLA'ni kechiktirsa — mavsum chegarasida har safar sodir bo'ladi.

**Takrorlash / kuzatish**

Mijoz 24-sentabrda hikoya yuboradi (mavsum 25-sen tugaydi). Admin 27-sentabrda tasdiqlaydi. `at`=24-sen → joriy (yangi) mavsum oynasida emas → storyBall=0; push allaqachon ketgan.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-70 · Posterni saqlash uchun TUGMA yo'q — «bosib turing → Rasmni saqlash» Telegram WebView'da ishonchsiz

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Hikoya

**Dalil**

> packages/miniapp/src/oyin.tsx:2379 «👆 Rasmni bosib turing → "Rasmni saqlash", so'ng hikoyangizga qo'ying» — yagona yo'l. grep «downloadFile|download|saveToGallery» packages/miniapp/src/oyin.tsx va packages/miniapp/src/telegram.ts bo'yicha 0 ta natija (Telegram WebApp.downloadFile ishlatilmagan). Poster faqat `<img src={selectedPoster}>` (2378).

**Oqibat**

Mijoz aynan birinchi qadamda (rasmni telefoniga olish) tiqilib qolishi mumkin — Telegram in-app WebView'da (ayniqsa Android) rasm uzun-bosish menyusi ko'pincha chiqmaydi. Yozuv harakat va'da qilyapti, tugma esa yo'q (DIZAYN_QOIDALARI #17).

**Takrorlash / kuzatish**

Kod-o'qish: oyin.tsx da poster oldida hech qanday <a download> yoki WebApp.downloadFile chaqiruvi yo'q. (Real qurilmada render qilinmadi.)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-71 · Ochiq tekshiruv sahifasiga (`?karta=`) ilovada birorta kirish yo'li yo'q — funksiya jonli, lekin o'lik

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Karta

**Dalil**

> Sahifa bor va ishlaydi: packages/miniapp/src/main.tsx:80 `new URLSearchParams(location.search).get("karta")`, marshrut packages/server/src/api/server.ts:1558 `app.get("/api/oyin/verify/:code", rateLimit(30), ...)` (auth'siz, to'g'ri). LEKIN butun repoda `?karta=` havolasini YASAYDIGAN kod yo'q — `grep -rn "karta="` faqat izohlarni va aloqasi yo'q skriptlarni topadi. Kodni nusxalash tugmasi ham yo'q: `copyText(` oyin.tsx da faqat ikki joyda — 1921 (gashtak kodi) va 2304 (taklif havolasi).

**Oqibat**

Ega «kartani boshqaga ko'rsatish/tekshirish» imkoniyatiga to'lagan ish mijozga yetib bormaydi: karta sahifasida kod ko'rinadi, lekin uni na nusxalash, na ulashish, na QR bilan berish mumkin. Odam kodni qo'lda ko'chirib, brauzerga `birjoy.online/?karta=...` deb yozishi kerak — real mijoz buni qilmaydi.

**Takrorlash / kuzatish**

grep -rn "karta=" --include=*.ts --include=*.tsx packages/*/src → natijada faqat izohlar; oyin.tsx karta varag'ida (2545-2630) «Ulashish»/«Nusxa» tugmasi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-72 · gno'siz ESKI kartalar bir xil KO-kod olishi mumkin (turli sovrinlarda bir xil `no`)

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Karta

**Dalil**

> myTickets:1450 `const gno = t.gno ?? t.no;` → 1453 `code: await encodeCardCode(gno)`. `no` — sovrin ICHIDAGI raqam (oyinService.ts:129 izohi), ya'ni «A sovrin no=1» va «B sovrin no=1» ikkalasi ham encodeCardCode(1) beradi — AYNI kod. Qidiruv ham noaniq: 4794 va 4834 `?? rows.find((x) => x.gno === null && x.no === gno)` — birinchi mos kelgani qaytadi, qaysi sovrin ekani ahamiyatsiz.

**Oqibat**

Agar bazada gno'siz eski chiptalar bo'lsa, ikki xil mijozning kartasi bir xil «noyob» kod bilan chiqadi va ochiq tekshiruv sahifasi ulardan faqat bittasini ko'rsatadi — ikkinchisi «kartam yo'q» holatiga tushadi.

**Takrorlash / kuzatish**

QAMRALMADI (jonli baza yopiq): gno'siz qatorlar soni tekshirilmadi. Kod yo'li esa aniq — parseTickets (oyinService.ts:171) `gno` faqat `Number.isFinite(gno) && gno > 0` bo'lsa saqlaydi, aks holda maydon umuman yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-73 · «Boshlanmagan mavsum» ekranida toast elementi umuman yo'q — xatolar JIM yutiladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:1349-1424 erta-return JSX'ida `{toast && <div className="oyk-toast">{toast}</div>}` YO'Q (u faqat :2444 da). Shu ekrandagi yagona harakat tugmasi :1409 `onClick={() => void inviteFriend()}`, `inviteFriend` esa xatoda :980 `showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring")` chaqiradi.

**Oqibat**

Tarmoq uzilsa mijoz «Do'stni chaqirib qo'y» ni bosadi — HECH NARSA bo'lmaydi: na ulashish oynasi, na xato xabari. DIZAYN_QOIDALARI #15 buziladi; odam tugmani buzuq deb o'ylaydi.

**Takrorlash / kuzatish**

upcoming fazada, `/api/referral` yiqilganda «👥 Do'stni chaqirib qo'y — start birga bo'lsin» tugmasini bosish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-74 · Gashtak yuklanishida XATO holati yo'q va qayta urinish yo'q — abadiy «Yuklanmoqda…»

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:784 `const loadJamoa = useCallback(() => { api.oyinJamoa().then(setJamoa).catch(() => undefined); }, []);` · :785 `useEffect(() => { loadJamoa(); }, [loadJamoa]);` (faqat mount'da; tab almashganda :640 dagi `loadJamoam` chaqiriladi, `loadJamoa` EMAS) · :1911 `{jamoa === null ? (<div className="oyk-jamoa-empty">Yuklanmoqda…</div>)`

**Oqibat**

Bitta tarmoq blipi butun sessiya davomida Gashtak segmentini o'lik «Yuklanmoqda…» matniga qamab qo'yadi: na xato aytiladi, na «qayta urinish» tugmasi, na tab almashtirib tiklash. `ticketsErr`/`jamoamErr` naqshi shu ekranda mavjud — bu yerga qo'llanmagan.

**Takrorlash / kuzatish**

`/api/oyin/jamoa` bir marta yiqilganda Jamoam → 🤝 Gashtak segmentiga kirish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-75 · T-49 soat oynasida warn3 va warn49h BITTA tikda ket-ket yuboriladi — bir-biriga zid ikki xabar

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3578 `if (msLeft <= 3 * 86_400_000 && cheapest)` va :3593 `if (msLeft <= 49 * 3_600_000 && cheapest)` — 49 soat 72 soatdan kichik, ya'ni msLeft ≤ 49h bo'lganda IKKALA blok ham bir tikda yuguradi. Marker prefikslari boshqa (`oyin:warn3` / `oyin:warn49h`, 3583 va 3598), NotifyLog `kind` lari ham boshqa (`oyin_warn3:` / `oyin_warn49h:`) — demak dedup ikkalasini to'smaydi; DAILY_PUSH_CAP=2 (notifyService.ts:10) ikkitasiga aynan yetadi.

**Oqibat**

warn3 ni hali olmagan (masalan o'sha oyna boshida cap tufayli o'tkazib yuborilgan yoki yangi yetgan) a'zo bir necha soniya ichida «Karta olish 24 soatdan keyin yopiladi» VA «Bir soatdan keyin karta olish yopiladi» xabarlarini oladi. Ikkala raqam ham noto'g'ri, ikkalasi bir-biriga zid — mijoz botni jiddiy qabul qilmay qo'yadi.

**Takrorlash / kuzatish**

msLeft = 40 soat, a'zoda warn3 markeri yo'q, ball ≥ cheapest.price → 3578 bloki push yuboradi va markPushed qiladi, keyin darhol 3593 bloki ikkinchi push yuboradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-76 · Bloklagan / bildirishnomani o'chirgan a'zolar markerlanmaydi — 300 lik batch boshini abadiy egallaydi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3527 `const pendingIds = memberIds.filter((id) => !sentSet.has(keyOf(id))).slice(0, SEASON_PUSH_BATCH);` — navbat FAQAT marker bo'yicha oldinga siljiydi. Marker esa faqat `if (ok)` da yoziladi (3568-3569 va h.k.). Blok/opt-out holatida notifyOnce `false` qaytaradi va marker YOZILMAYDI: notifyService.ts:69 `if (await isNotifyOff(memberId)) return false;`, :73 `if (await isBlocked(chatId)) return false;`. SEASON_PUSH_BATCH = 300 (oyinService.ts:3504).

**Oqibat**

Bloklagan/opt-out qilgan a'zolar HAR 15 daqiqada qayta skan qilinadi (har biriga 2 ta DB so'rovi) va 300 lik oynadan joy yeydi — abadiy. Agar bunday a'zolar soni 300 dan oshsa (859 lik bazada real ehtimol), ogohlantirish ro'yxatning qolgan qismiga HECH QACHON yetib bormaydi va bu hech qayerda ko'rinmaydi (log ham yo'q).

**Takrorlash / kuzatish**

Ro'yxat boshidagi 300 a'zoning hammasi `blockedAt` bo'lsa: har tikda pushCandidates o'sha 300 tani qaytaradi, hammasi false, marker yo'q → keyingi tik ham xuddi shu 300 tani oladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-77 · DAILY_PUSH_CAP=2 umumiy, o'yin bloki esa tikda ENG OXIRIDA — vaqt-tanqis mavsum ogohlantirishi engagement push'lar ortida qoladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/notifyService.ts:10 `const DAILY_PUSH_CAP = 2;` va :74-75 `const sentToday = await prisma.notifyLog.count({ where: { memberId, dayKey: dk } }); if (sentToday >= DAILY_PUSH_CAP) return false;` — hisob `kind` bo'yicha emas, UMUMIY. Tikdagi tartib (packages/server/src/index.ts): 401 pushEngineTick → 402 weeklyRecap → 405 campaignTick → 407 driverEngageTick → 408 driverQrWeeklyTick → 410 dispatchLinkReminders → 416 runTierLoyaltyDailyAll → va faqat keyin 425 seasonWarningTick / 426 seasonDrawNotify / 428 cardMemoryTick / 430 seasonCloseNotify.

**Oqibat**

Ertalab lucky_day + comeback push olgan a'zo o'sha kuni «🔒 Oxirgi soat» yoki «🏆 SIZ YUTDINGIZ» xabarini UMUMAN ola olmaydi (cap to'lgan). Yaxshi tomoni: cap holatida marker yozilmaydi, ya'ni ertaga qayta uriniladi — lekin «oxirgi soat» ertaga ma'nosiz, mavsum tugagan bo'ladi. Bundan tashqari `cardMemoryTick` (428) `seasonCloseNotify` (430) dan OLDIN yuradi va oxirgi slotni sof nostalgiya xabariga sarflashi mumkin.

**Takrorlash / kuzatish**

index.ts:401-430 tartibini notifyService.ts:74-75 cap tekshiruvi bilan birga o'qing.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-78 · F4 safar-yakun ball qatori 60 soniyalik eskirgan keshdan o'qiydi — endigina yig'ilgan ball ko'rinmaydi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/bookingNotifier.ts:797 `const oyinBallLine = await (await import("./oyinService")).rideFinishBallLine(m.id).catch(() => "");` → oyinService.ts:712 `const ball = await getBall(memberId);` → computeBallMap :321 `if (ballMapCache && ballMapCache.seasonId === season.seasonId && Date.now() - ballMapCache.at < 60_000) return ballMapCache.val;`. RideReward yozuvi esa keshni BEKOR QILMAYDI: packages/server/src/services/cashbackService.ts:85 `const row = await prisma.rideReward.create({...})` — o'sha faylda `invalidateBallCache` chaqiruvi umuman yo'q (grep: cashbackService.ts da faqat 92/95 qatorlarida `oyinService` importi, u ham `creditGashtakLedger` uchun).

**Oqibat**

Safar tugagan zahoti keladigan eng ko'rinadigan kartada «🎮 Sizda N ball» aynan shu safar bergan 35 (yoki birinchi safarda 100) ballsiz ko'rsatilishi mumkin, «yana N ball kerak» ham shunga mos ravishda ko'p chiqadi. Mijoz safar qildi-yu raqam qimirlamagandek ko'rinadi — ballning ishonchsizligi haqidagi eng yomon taassurot. Bundan tashqari kesh sovuq bo'lsa, safar-yakun yo'lida BUTUN populyatsiya bo'yicha ~14 ta og'ir so'rov yuguradi (computeBallMap :362-…), ya'ni karta kechikadi.

**Takrorlash / kuzatish**

Ixtiyoriy a'zo miniapp'da o'yin ekranini ochadi (kesh isiydi) → 30 soniya ichida safari yakunlanadi → cashbackService RideReward yozadi (kesh bekor qilinmaydi) → bookingNotifier:797 eskirgan keshdan o'qiydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-79 · Telegram 429 uchun qayta-urinish YO'Q; SEASON_PUSH_BATCH izohidagi tezlik hisobi noto'g'ri

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3504 `const SEASON_PUSH_BATCH = 300; // 15-daq/300 ≈ 0,33 xabar/soniya — Telegram 30/s limitidan 90× past.` — aslida yuborishlar tik BOSHIDA ketma-ket burst bo'lib ketadi (3567-3572 va h.k. `for … await`), 15 daqiqaga yoyilmaydi; haqiqiy tezlik faqat tarmoq/DB kechikishi bilan cheklanadi. Bir tikda 3 ta ogohlantirish bosqichi mustaqil 300 tadan yuborishi mumkin (3563, 3578, 3593) + seasonDrawNotify 300 (3667) + cardMemoryTick 300 → bitta tikda 1500 gacha. `@grammyjs/auto-retry` yoki `apiThrottler` o'rnatilmagan: packages/server/package.json da faqat `"grammy": "^1.30.0"`, kod bo'ylab `autoRetry|apiThrottler|api.config.use` — 0 natija.

**Oqibat**

859 a'zoda amaliy tezlik ~5-15 xabar/s (har a'zoga 5 DB so'rov + 1 TG chaqiruv) — 30/s limitidan past, ya'ni 859 odam O'ZI muammo emas. Asl xavf: shu burst tikdagi OLDINGI push-manbalari (pushEngineTick, campaignTick, driverEngage — index.ts:401-410) bilan ustma-ust tushsa 429 kelishi mumkin, 429 esa yuqoridagi #1 topilma tufayli xabarni ABADIY yo'qotadi. Izohning o'zi ega/agentni yolg'on xotirjamlikka olib keladi.

**Takrorlash / kuzatish**

`grep -rn "autoRetry|apiThrottler" packages/server/src` → 0; oyinService.ts:3567-3572 tsikli — hech qanday `sleep`/`throttle` yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-80 · To'lmagan sovrin mavsumlar orasida muzlab qoladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Tiraj

**Dalil**

> oyinService.ts:1681 — mavsum yakunlangach to'lmagan sovrinning kartalari na qaytariladi, na keyingi mavsumga o'tkaziladi.

**Oqibat**

Ball to'lab karta olgan mijoz na sovrin oladi, na ballini qaytaradi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-81 · Hikoyaga (Story) ulashilganda havola Premium bo'lmaganlarda bosiladigan bo'lmaydi — faqat matn ichida qoladi

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/src/telegram.ts:611-624 `export function shareStory(text: string, link: string): boolean { … const premium = isPremium(); tg.shareToStory(storyMediaUrl(), { text: premium ? text : `${text}\n${link}`, ...(premium ? { widget_link: { url: link, name: "BirJoy" } } : {}) }); …}` va :599-601 `function isPremium(): boolean { return !!tg?.initDataUnsafe?.user?.is_premium; }`. Bu yo'l o'yin ulashishida BIRINCHI sinaladi: oyin.tsx:1296 `if (!shareStory(text, link)) shareLink(link, text);`

**Oqibat**

O'zbekistonda Telegram Premium ulushi kichik — ya'ni ko'pchilik hikoyada bosib bo'lmaydigan `https://app.birjoy.online/j/?r=CODE&v=5` matnini ko'radi. Ko'rgan odam uni qo'lda ko'chirishi kerak, referal kodi bilan birga. Amalda hikoya-yo'li referalni deyarli olib kelmaydi.

**Takrorlash / kuzatish**

telegram.ts:611-624 ni o'qing; Premium bo'lmagan akkauntda O'yin → Ulashish bosilsa hikoya muharriri rasm + matn bilan ochiladi, `widget_link` yuborilmaydi. QAMRALMADI: Telegram hikoya-matnidagi URLni o'zi avto-havola qiladimi — real qurilmada sinalmadi

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-82 · Taklif matni «+N so'm» va'da qiladi — jonli N ni tekshira olmadim, 0 bo'lish xavfi bor

**Triaj:** D · **Og‘irlik:** 🟡 medium · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/src/telegram.ts:495-500 `export function inviteText(bonus: number): string { … return `🎮 BirJoy — senga sovg'a va ball kutmoqda (+${n} so'm). Bir tap bilan taxi. Qo'shil 👇`; }`; bonus manbasi packages/server/src/services/referralService.ts:84 `rewardReferee: econ.firstRide ?? REFEREE_REWARD`. Uy ekranidagi tugma ham pul va'da qiladi: packages/miniapp/src/uy.tsx:643 `<b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small>`.

**Oqibat**

Agar jonli econ raqamlari nolga tushirilgan bo'lsa (MEMORY: referral-bonuses-live-off, 2026-08-07), ulashilgan matn «+0 so'm» bo'lib ketadi va uy tugmasi «pul ishla» deb bo'lmaydigan narsani va'da qiladi. Bu ulashishning ASOSIY matni — bitta noto'g'ri raqam butun kanalni yolg'onga aylantiradi.

**Takrorlash / kuzatish**

QAMRALMADI (jonli tekshirilmadi): econ.firstRide / econ.referrer jonli qiymatlari VPS ichidagi bazada, lokaldan o'qib bo'lmaydi (Neon taqiq, localhost:5433 yopiq). Tekshirish: VPS'da admin iqtisod paneli yoki `getBonusEcon()` natijasi

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-83 · «Kassaga tushgan» — real pul emas, ball×20 hisobi, lekin daromad kabi ko'rsatiladi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Admin (o‘yin)

**Dalil**

> packages/admin/src/oyin/Mukofotlar.tsx:618 «const kassa = open.reduce((s, p) => s + p.sold * p.price * OYIN_SOM_PER_BALL, 0);» va :626 «<Stat k="Kassaga tushgan" v={short(Math.round(kassa))} s="sotilgan kartalardan" tone="coin" />». OYIN_SOM_PER_BALL = 20 (packages/shared/src/oyin.ts:42) — bu BAHOLASH konstantasi; karta xaridida so'm harakatlanmaydi (buyTicket faqat balldan yechadi, oyinService.ts:1742-1743).

**Oqibat**

Ega byudjet ekranida «kassaga N so'm tushdi» ni real tushum deb o'qishi mumkin. Qoplash modeli izohda tushuntirilgan (Mukofotlar.tsx:636-639), lekin sarlavha o'zi pulni va'da qiladi.

**Takrorlash / kuzatish**

🎁 Mukofotlar → 💰 Byudjet: to'rtinchi katak «Kassaga tushgan … sotilgan kartalardan».

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-84 · Admin domenida xavfsizlik sarlavhalari yo'q, ustiga uchinchi-tomon skripti token yonida turadi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> Caddyfile — `admin.birjoy.online { log; root * /var/www/admin; encode zstd gzip; … }` blokida faqat `Cache-Control` sarlavhalari bor: CSP, X-Frame-Options, Referrer-Policy, HSTS yo'q. `packages/server/package.json` da `helmet` yo'q, server.ts:351 `app.use(cors())` — wildcard. packages/admin/index.html:6 `<script src="https://telegram.org/js/telegram-web-app.js"></script>` — ega tokeni aynan shu origin'ning localStorage'ida (api.ts:58 `TOKEN_KEY = "admin_token"`), skript esa desktop panelga deyarli kerak emas (api.ts:104-106 da faqat token BO'LMAGANDA `Telegram.WebApp.initData` fallback sifatida ishlatiladi).

**Oqibat**

CSP yo'qligi tufayli har qanday tashqi skript (masalan telegram.org CDN buzilsa yoki DNS o'g'irlansa — 2026-08-16 DNSSEC hodisasi shuni ko'rsatgan) `localStorage.admin_token`ni bemalol o'qib yubora oladi. X-Frame-Options yo'qligi panelni iframe'ga solib clickjacking qilishga yo'l ochadi — yuqoridagi «tasdiqsiz xavfli tugmalar» bilan birga jiddiyroq.

**Takrorlash / kuzatish**

`curl -sI https://admin.birjoy.online/ | grep -i "content-security\|x-frame\|referrer"` → bo'sh.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-85 · `#kit` dizayn galereyasi autentifikatsiyadan OLDIN render bo'ladi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/main.tsx:36-44 — `const isKit = hash === "kit";` va `createRoot(...).render(… isKit ? <KitDemo /> : isV2 ? <AdminV2 /> : <App />)`. `AdminV2` va `App` ichida `hasAdminToken`/`LoginScreen` bor (AdminV2.tsx:71, 110; App.tsx:139, 177), `KitDemo` esa hech qanday tekshiruvsiz chiziladi. Ma'lumot oqmaydi: packages/admin/src/design/demo.tsx da `adminApi` ham, `fetch(` ham yo'q (grep: 0 ta).

**Oqibat**

Real ma'lumot chiqmaydi, lekin anonim tashrifchi ichki dizayn tizimini, komponent nomlarini va panel tuzilishini ko'radi — hujumchi uchun razvedka. Login ekrani mavjudligini bilib olish uchun ham qulay.

**Takrorlash / kuzatish**

Chiqing (localStorage tozalang) → https://admin.birjoy.online/#kit → galereya to'liq ochiladi, parol so'ralmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-86 · Yuklanish holatlari: v1 panelda skeleton amalda yo'q (27 ta spinner/matn, 1 ta skeleton)

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> packages/admin/src/App.tsx: `"Yuklanmoqda"` matni 27 marta, `className="spinner"` 15 marta, `skeleton` so'zi 1 marta. Tipik namuna App.tsx:4318 `if (!rows) return <div className="screen center"><div className="spinner" /></div>;`. Kutubxonada tayyor komponent BOR: packages/admin/src/design/kit.tsx:341 `export function Skeleton({ h = 14, w })` va 349 `export function SkeletonRows({ rows = 5, h = 34 })` — v2'da ishlatilgan (Bugun.tsx 6 marta, Odamlar.tsx 4 marta), lekin Jonli.tsx va Hikoyalar.tsx da 0 marta. CSV eksportlari mahalliy (allaqachon yuklangan qatorlardan) — progress kerak emas.

**Oqibat**

CLAUDE.md dizayn qoidasi «Har async holatda skeleton» jonli paneldа bajarilmagan: har o'tishda layout sakraydi (spinner → to'liq jadval), va bo'sh spinner ekran kutish uzayganda "osilib qoldi"mi yoki "yuklanyapti"mi — farqlab bo'lmaydi.

**Takrorlash / kuzatish**

Har qanday tabni ochib DevTools → Slow 3G: markazda yolg'iz spinner, real layout nusxasi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-87 · Mobil: asosiy layout to'g'ri, lekin telefonda tizim-salomatligi ko'rsatkichi umuman ko'rinmaydi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Admin (umumiy)

**Dalil**

> Layout ISHLAYDI: styles.css:250-266 `@media (max-width: 860px)` — sidebar `position: fixed; left: -100%`, `.sidebar.sidebar-open { left: 0 }`, `.hamburger { display: flex }`, `.sidebar-backdrop`; styles.css:88 `.content { flex: 1; min-width: 0; … }` va 159 `.table-wrap { overflow-x: auto; }` — keng jadvallar sahifani yormaydi; login ham moslashuvchan (styles.css:233 `.login-card { width: 100%; max-width: 380px; }`). Muammo: styles.css:263 `.content-header-right .hp { display: none; }` — sarlavhadagi HealthPill telefonda YASHIRILADI, ikkinchi nusxasi esa sidebar footer'ida (App.tsx:243 `<HealthPill h={health} />`), ya'ni gamburger ortida.

**Oqibat**

Ega kechqurun telefondan tirajni boshqarayotganda backend nosozligini ko'rsatadigan yagona indikator ekranda yo'q — buni ko'rish uchun menyuni ochib pastga tushish kerak. Yuqoridagi «xato = bo'sh ro'yxat» bilan birga: telefonda buzilgan tizim sog'lom va bo'sh ko'rinadi.

**Takrorlash / kuzatish**

Brauzerni 375px enga qisqartiring: sarlavhada faqat gamburger va tab nomi qoladi, salomatlik nuqtasi yo'q.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-88 · `adminCancelTicket` da o'tgan-mavsum qo'rig'i yo'q — izoh «ball o'zi qaytadi» deydi, qaytmaydi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ball

**Dalil**

> oyinService.ts:3847-3849 izoh: «ball esa o'zi qaytadi — `spent` chiptalardan JONLI hisoblanadi». Funksiyada (:3850-3865) mavsum tekshiruvi YO'Q. Taqqoslang: `cancelOwnTicket` oyinService.ts:1495-1497 `if (target.ts && Date.parse(target.ts) < (season.startMs ?? -Infinity)) { return { ok: false, reason: "past_season" }; }` — o'sha qo'riq VA uning sababi u yerda batafsil yozilgan.

**Oqibat**

Admin o'tgan mavsumda olingan kartani bekor qilsa: mijozga BIR TIYIN ham ball qaytmaydi (uning narxi joriy `spent` da yo'q, oyinService.ts:449), lekin `releaseSoldSlot` sovg'aning sotuv sanog'ini ORQAGA teparadi — keyingi mavsumga o'tgan, to'lib kelayotgan sovg'a kechikadi va mijoz kartasini bekorga yo'qotadi. Aynan shu zarar `cancelOwnTicket` da ataylab to'silgan.

**Takrorlash / kuzatish**

O'tgan mavsumda olingan gno ni admin panelidan bekor qilish → ok:true, ball o'zgarmaydi, `oyin_sold:<prizeKey>` kamayadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-89 · `spent` oynasi asimmetrik: yuqori chegara (`<= toMs`) yo'q

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ball

**Dalil**

> oyinService.ts:449 `if (!Number.isFinite(ms) || ms >= fromMs) sum += t.priceAtPurchase || 0;` — faqat pastki chegara. `earned` esa hamma manbada IKKI tomonlama kesiladi (:363 `createdAt: { gte: from, lte: to }`, :500 `at >= fromMs && at <= toMs`, :458 `d >= fromDay && d <= toDay`). Izoh (:342-345) «IKKALASI ham AYNAN shu fromMs/toMs oynasidan filtrlanadi» deydi — kod buni bajarmaydi.

**Oqibat**

Bugun zararsiz (buyTicket `phase !== active` da to'sadi, ya'ni toMs dan keyin xarid bo'lmaydi), lekin invariant kod bilan ta'minlanmagan — mavsum tugash sanasi qo'lda oldinga surilsa yoki xarid yo'liga yangi kirish nuqtasi qo'shilsa, `spent` `earned` dan tashqarida qoladi va balans siljiydi. `oyinSeasonBall.test.ts:86` qo'rig'i ham faqat `ms >= fromMs` ni tekshiradi, ya'ni regressiyani ushlamaydi.

**Takrorlash / kuzatish**

Kod o'qish: 449-qatorda `&& ms <= toMs` yo'q; 363/500/458-qatorlarda ikki tomonlama chegara bor.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-90 · Buzuq `ts` li chipta HAR KEYINGI mavsumda ham `spent` ga qo'shiladi — yashirin abadiy qarz

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ball

**Dalil**

> oyinService.ts:449 `if (!Number.isFinite(ms) || ms >= fromMs) sum += ...` — `Date.parse` NaN qaytarsa chipta HAR DOIM sanaladi. parseTickets :186-188 buzuq `ts` ni bo'sh satr qilib qoldiradi: `ts: typeof t.ts === "string" ? t.ts : ""`, va izoh (:184-185) buni ataylab deydi.

**Oqibat**

`ts` buzuq bitta karta o'z narxini (masalan 1200 ball) MAVSUMDAN MAVSUMGA olib o'tadi: har yangi mavsumda `earned` nolga tushadi, `spent` esa 1200 bo'lib qoladi → mijoz mavsum boshida 1200 ball qarz bilan turadi. Bu — S8 dagi «yashirin qarz» bug'ining aynan o'zi, faqat buzuq qatorlar bilan chegaralangan. `cancelOwnTicket` ham uni ololmaydi (:1495 `target.ts &&` — bo'sh `ts` da qo'riq o'tkazib yuboradi, lekin :1509 too_late qo'rig'i ham o'tib ketadi).

**Takrorlash / kuzatish**

`oyin:tickets:<id>` JSON ida bitta elementda `ts` ni o'chirib/buzib qo'yish → o'sha a'zoning balli har mavsumda `priceAtPurchase` qadar kam bo'ladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-91 · Gashtak oylik shifti 200 000 ball — bezak: haqiqiy chegara guruh safarlari, ya'ni manba amalda cheksiz

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ball

**Dalil**

> economy.ts:354 `{ key: "oyinJamoaMaxBall", ..., def: 200000, min: 0, max: 500000 }`; creditGashtakLedger oyinService.ts:2439-2447 `const maxBall = econ.oyinJamoaMaxBall ?? 3600; ... const amount = Math.min(perRide, maxBall - already);` — cap (memberId, jamoaId, monthKey) bo'yicha. Ball = `oyinJamoaBallPerRide` (economy.ts:352, def 6) × guruh safarlari. Struktura qo'rig'i BOR: navbatchiOf :2478 `return j.turns[monthKey] ?? null;` va assignTurn :2491 — har a'zoga UMRBOD BITTA navbat oyi; jamoaOf :2544 — a'zo BITTA guruhda.

**Oqibat**

200 000 ball = 4 000 000 so'm da'vo qiymati (OYIN_SOM_PER_BALL=20) va 3636 ta eng arzon chipta (55 ball) — ya'ni cap real cheklov EMAS, u hech qachon urilmaydi. Amaldagi emissiya = 6 × guruh oylik safarlari (10 kishi × 20 safar = 1 200 ball), bu safar-balliga +17% qo'shimcha. Xavf CHEKSIZLIKDA emas, LEKIN knob 0…500 000 oralig'ida va uni tortish uchun hech qanday sanoq/ogohlantirish yo'q — ega uchun 'bu qancha turadi' savoli knobdan javob olmaydi.

**Takrorlash / kuzatish**

economy.ts:354 def=200000 (jonli qiymat ham 200000 deb berilgan) vs jonli bozor: butun Kason 1067 oyiga ~1956 buyurtma → 200 000 ballga 33 333 safar kerak.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-92 · `normalizeStoryUrl` yo'lni kichik harfga tushiradi — halol mijoz «duplicate» deb rad etilishi mumkin (va dedupni chetlab o'tish oson)

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:20-27 — «const path = u.pathname.replace(/\/+$/, "").toLowerCase(); return `${host}${path}`;»

**Oqibat**

Instagram/Telegram post-kodlari REGISTRGA SEZGIR (`/p/DAbC` ≠ `/p/DABC`) — faqat harf registri bilan farq qiladigan ikki BOSHQA post server uchun bitta bo'lib qoladi va ikkinchisi noto'g'ri «Bu havola allaqachon yuborilgan» deb rad etiladi. Teskari tomoni: yo'lga keraksiz segment qo'shib (`/p/abc/x`) dedupni chetlab o'tish mumkin, chunki solishtiruv butun pathname bo'yicha.

**Takrorlash / kuzatish**

normalizeStoryUrl("https://instagram.com/p/DAbC") === normalizeStoryUrl("https://instagram.com/p/DABC") → true (ikkalasi ham "instagram.com/p/dabc").

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-93 · AppState qatori atomik emas — bir vaqtda kelgan yuborish va moderatsiya bir-birini o'chiradi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:126→154-155 (submitStory: `itemsOf` o'qish → `items.push` → `saveItems` butun massivni upsert) va 204→210 (adminReviewStory: xuddi shu o'qish-o'zgartirish-yozish). `saveItems` (76-79) `prisma.appState.upsert` bilan BUTUN JSON'ni almashtiradi; hech qanday tranzaksiya, versiya yoki optimistik qulf yo'q.

**Oqibat**

Ega arizani tasdiqlagan lahzada o'sha mijoz yangi ariza yuborsa (yoki teskarisi) — keyingi yozuv oldingisini ustidan yozadi: tasdiq jimgina «pending»ga qaytishi yoki yangi ariza yo'qolishi mumkin. Ehtimolligi past (bitta mijoz + bitta admin), lekin iz qoldirmaydi.

**Takrorlash / kuzatish**

Ikki parallel so'rov: POST /api/oyin/story (member M) va POST /api/admin/oyin/stories/review (member M) — ikkalasi `oyin:story:M` ni to'liq qayta yozadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-94 · ALLOWED_HOSTS'da Facebook bor, UI esa faqat Instagram/Telegram deydi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Hikoya

**Dalil**

> packages/server/src/services/oyinStory.ts:38 — «const ALLOWED_HOSTS = ["instagram.com", …, "facebook.com", "www.facebook.com", "fb.watch"]». Mijoz UI'da faqat ikkita maydon (oyin.tsx:2385-2412) va xato matni: oyin.tsx:1256 «Havola noto'g'ri — Instagram yoki Telegram havolasini yuboring».

**Oqibat**

Facebook havolasi jimgina qabul qilinadi, lekin uni yuborish uchun maydon yo'q va ega bu imkoniyat borligini bilmaydi — moderatsiya navbatiga kutilmagan manba tushishi mumkin. Aksincha, agar Facebook ataylab kerak bo'lsa — mijoz undan foydalana olmaydi.

**Takrorlash / kuzatish**

POST /api/oyin/story {"url":"https://fb.watch/xyz"} → ok:true, UI esa buni taklif qilmaydi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-95 · `oyin:tickets:<id>` ni qulfsiz o'qib-yozadigan ikkita yo'l qoldi (setCardNote, adminRecordWinner) — yo'qolgan yozuv xavfi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Karta

**Dalil**

> buyTicket (1698 `return withMemberLock(memberId, ...)`), cancelOwnTicket (1481) va adminCancelTicket (3854) qulf ichida. setCardNote (4854-4866) esa `findUnique → parseTickets → o'zgartirish → update` ni qulfSIZ qiladi; adminRecordWinner ham (3400-3416) shunday.

**Oqibat**

Mijoz qayd saqlagan lahzada karta olsa yoki bekor qilsa — ikki yozuvdan biri yo'qoladi: qayd yo'qolishi (zararsiz) yoki bekor qilingan karta QAYTA paydo bo'lishi/yangi karta yo'qolishi (ball bilan bog'liq) mumkin. Ehtimoli past (odam ikki amalni bir vaqtda bajarishi kerak), lekin naqsh loyihada allaqachon B2/O7 xatolarini bergan.

**Takrorlash / kuzatish**

Kod-yo'li tekshiruvi; jonli takrorlash qilinmadi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-96 · «Kartalarim»da o'ynab bo'lgan karta ham joriy mavsum sanasini «Mukofot: …» deb ko'rsatadi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Karta

**Dalil**

> myTickets:1466 `return { tickets, drawIso: season.endIso };` — HAR karta uchun bitta, JORIY mavsum sanasi. oyin.tsx:2139 `<div className="oyk-tkt-when">Mukofot: {uzDate(tickets.drawIso)}…</div>` shart-siz chiziladi, holbuki yonidagi belgi (2146-2147) `result` bo'yicha «🏆 Yutdi» / «O'ynadi» yozadi.

**Oqibat**

Bitta kartada ikki zid gap: «O'ynadi» + «Mukofot: 25-sentabr». Karta sahifasida bu to'g'ri qilingan (4801/oyin.tsx:2588 — sana faqat `result === null` bo'lsa chiziladi), Kartalarim ro'yxatida esa yo'q.

**Takrorlash / kuzatish**

result yozilgan kartani Kartalarim ro'yxatida ko'rish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-97 · Kod izohlari va admin ekrani kod bilan zid uchta joyda

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Karta

**Dalil**

> (1) oyinService.ts:139-142 «`result` … Faqat admin+Telegram kanal ko'radi — mijoz ilovasida (`OyinMyTicket`) HECH NARSA o'zgarmaydi» — 2026-08-12 dan beri YOLG'ON: 1461-1462 `...(t.result ? { result: t.result } : {})` va oyin.tsx:2146 uni chizadi. (2) drawExport:2183 «💰 Mavsum filtri MAJBURIY: bo'lmasa o'tgan mavsum egalari jonli tirajda qatnashadi» — 2191 da `const inSeason = parseTickets(row.value);` HECH QANDAY filtr yo'q (o'zgaruvchi nomi ham chalg'itadi). (3) packages/admin/src/oyin/Kartalar.tsx:159 «Ro'yxat FAQAT joriy mavsumni qamraydi» — noto'g'ri, shu sababdan.

**Oqibat**

Keyingi agent/ega izohga ishonib noto'g'ri qaror qabul qiladi. Ayniqsa (2)/(3): ega admin ekranida «faqat joriy mavsum» deb o'qiydi, aslida ro'yxatda o'tgan mavsum kartalari ham bor (bu «karta abadiy» qaroriga MOS, lekin ekran teskarisini yozadi).

**Takrorlash / kuzatish**

sed -n '139,142p;2183,2191p' packages/server/src/services/oyinService.ts

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-98 · cardCode.ts izohi «ikkita almashtirilgan raqamni 100% ushlaydi» deb yozadi — o'lchov 2.1% o'tib ketishini ko'rsatdi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Karta

**Dalil**

> packages/server/src/services/cardCode.ts:9-10 «Luhn — og'zaki o'qish/yozishdagi xatoni (bitta noto'g'ri raqam, ikkita almashtirilgan raqam) 100% ushlaydi». O'lchov (scratchpad skripti, haqiqiy `luhnCheckDigit`/`luhnValid` importi bilan): `adjacent transpositions tested=45051 missed=954` — hammasi 09↔90 juftligi (masalan `6601097675` → `6601907675` ikkalasi ham yaroqli).

**Oqibat**

Faqat hujjat da'vosi noto'g'ri; amaliy zarar minimal (noto'g'ri kod deyarli har doim «topilmadi» beradi, chunki mavjud kartalar soni 10^9 ga nisbatan juda kichik). Lekin ega «kod xatosi imkonsiz» deb ishonmasligi kerak.

**Takrorlash / kuzatish**

cd packages/server && node node_modules/tsx/dist/cli.mjs <scratchpad>/luhn_transpose.ts (DATABASE_URL soxta, DB'ga tegilmaydi) → «tested=45051 missed=954»

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-99 · Uchta async varaqda skeleton o'rniga quruq «Yuklanmoqda…» matni

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:2540 `{!cardErr && !cardData && <div className="oyk-cards-msg">Yuklanmoqda…</div>}` (karta sahifasi) · :2653 (fikrlar) · :1911 (gashtak). Shu faylda TO'G'RI naqsh bor: chipta skeletoni :2073-2088 (real kartaning nusxasi), do'st skeletoni :2196, kartalar panjarasi skeletoni :2477 `{Array.from({ length: 24 }).map(... "oyk-cell is-skel")}`. packages/miniapp/src/CardVerifyView.tsx:60 ham `{state === "loading" && <div className="oyk-cards-msg">Yuklanmoqda…</div>}`.

**Oqibat**

DIZAYN_QOIDALARI #11: skeleton real layoutning nusxasi bo'lishi va balandligi teng bo'lishi shart. Matn → kontent almashganda varaq sakraydi; bitta ekranda ikki xil yuklanish tili.

**Takrorlash / kuzatish**

Sekin tarmoqda: sovrin «⋯» → «Kartalarni ko'rish» → istalgan katak; «⋯» → «Fikrlar»; Jamoam → Gashtak.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-100 · To'rt joyda rasm `onError` fallbacksiz — buzuq URL brauzerning «singan rasm» belgisini chizadi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:2467 `{cardsPrize?.photoUrl ? <img src={cardsPrize.photoUrl} alt="" /> : <span>{cardsPrize?.icon ?? "🎟"}</span>}` (onError yo'q) · :2648 (fikrlar sarlavhasi, bir xil) · :2571 `{cardData.ownerPhotoUrl && <img className="oyk-cert-owner-av" src={cardData.ownerPhotoUrl} alt="" />}` · :2369-2373 poster thumb'lari. Qolgan HAMMA joyda `badPhoto`/`markBadPhoto` qo'riqlari bor (:1620, :1758, :2129, :3018…); CardVerifyView.tsx:24/:79 `photoErr` bilan to'g'ri ishlaydi.

**Oqibat**

DIZAYN_QOIDALARI #10 fallback qoidasi shu to'rt joyda ishlamaydi: emoji-fallback faqat `photoUrl === null` bo'lsa ishga tushadi, rasm YUKLANMASA emas. Admin URL'i buzilsa mijoz singan rasm ikonkasini ko'radi.

**Takrorlash / kuzatish**

Sovrinning photoUrl'ini yaroqsiz manzilga o'zgartirib «Kartalarni ko'rish»/«Fikrlar» varaqlarini ochish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-101 · O'nga yaqin bosiladigan element `:active` javobisiz (<100ms qoidasi)

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/design/feat/oyk.css'da 38 ta `:active` qoidasi bor, lekin quyidagilarda YO'Q: `.oyk-fchip` (:1232, filtr chiplari), `.oyk-next-card` (:309), `.oyk-arch-h` (:1240), `.oyk-arch-row` (:1245), `.oyk-comment-send` (:1357), `.oyk-note-save` (:1345), `.oyk-jamoa-leave` (:1212, «Gashtakdan chiqish»), `.oyk-buy-cancel` (:902, xarid «Bekor»), `.oyk-flink` (:1236), `.oyk-ob-skip` (:944). packages/miniapp/src/styles.css'da `.oyk` uchun global `button:active` qoidasi yo'q (faqat `.btn-primary`/`.btn-violet`, :51/:406).

**Oqibat**

DIZAYN_QOIDALARI #15. Ayniqsa `.oyk-note-save`/`.oyk-comment-send` (server javobini kutadi) va `.oyk-jamoa-leave` (qaytmas amal) — bosilgani bilinmaydi, mijoz ikki marta bosadi.

**Takrorlash / kuzatish**

Mukofotlar tabidagi filtr chiplari, arxiv qatorlari, karta-qayd «Saqlash», xarid varag'idagi «Bekor».

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-102 · «Do'st chaqirish +N ball» tugmasi shartli ballni shartsiz va'da qiladi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:2733-2736 `<b>Do'st chaqirish</b><small>+{state.hints.referFirstRideBall} ball</small>`. Ballning haqiqiy sharti to'liq jadvalda ochiq yozilgan: :201 `["🎉", "Do'stingiz BIRINCHI safarini qildi", h.referFirstRideBall, "har do'st uchun bir marta"]`.

**Oqibat**

Tugmani bosgan mijoz havola yuboradi va darhol +100 kutadi; ball esa do'st REAL safar qilgandagina tushadi. Qisqartirilgan yorliq va'dani kuchaytirib yuboradi (DIZAYN_QOIDALARI #9 ohangi). Tuzatish arzon: «do'st birinchi safarida +N».

**Takrorlash / kuzatish**

Bosh ekran → «Ball yig'ish» → «👥 Do'st chaqirish» kartasi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-103 · Chiptada «Mukofot:» yorlig'i qiymatsiz qolishi mumkin (osilgan yorliq)

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Miniapp UI

**Dalil**

> packages/miniapp/src/oyin.tsx:2139 `<div className="oyk-tkt-when">Mukofot: {uzDate(tickets.drawIso)}{drawTime ? `, ${drawTime}` : ""}</div>` — `uzDate` sana yo'q/buzuq bo'lsa BO'SH qaytaradi (:121-127), lekin «Mukofot: » prefiksi baribir chiziladi. Manba nullable: packages/server/src/services/oyinService.ts:1467 `return { tickets, drawIso: season.endIso };` (`endIso: string | null`).

**Oqibat**

Mavsum tugash sanasi bo'lmasa kartada bo'sh «Mukofot:» qolib ketadi. Shu faylning o'zi RulesSheet'da (:381-392) bu holatni to'g'ri qilgan — sana yo'q bo'lsa butun qator boshqa gap aytadi. Bir xil qoida ikki joyda ikki xil qo'llangan.

**Takrorlash / kuzatish**

Mavsum `configured: true`, `endIso: null` holatida Kartalarim tabini ochish.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-104 · Marker yozuvi yiqilsa ERTASIGA xabar TAKRORLANADI (dayKey almashadi)

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:3538-3540 `await prisma.appState.create({ data: { key: `${markerPrefix}:${seasonId}:${memberId}`, value: … } }).catch(() => undefined);` — xato JIMGINA yutiladi. G'olib yo'lida ham: :3656 `await prisma.appState.update({ where: { key: row.key }, data: { value: JSON.stringify(w) } }).catch(() => undefined);`. Ikkinchi qavat himoya faqat NotifyLog, u esa KUNLIK: schema.prisma:208 `@@unique([memberId, kind, dayKey])`, notifyService.ts:68 `const dk = dayKey();`.

**Oqibat**

Xabar muvaffaqiyatli ketgan, lekin marker yozuvi (DB transient) yiqilgan holatda: o'sha kuni NotifyLog to'sadi, ERTASIGA dayKey o'zgaradi → aynan o'sha «🏆 SIZ YUTDINGIZ» yoki «Mavsumga 7 kun qoldi» xabari IKKINCHI marta ketadi. Ehtimol past, lekin g'olib xabarining takrorlanishi chalkashlik keltiradi («yana yutdimmi?»).

**Takrorlash / kuzatish**

3538 dagi `create` P2002 dan boshqa xato bersa (masalan connection reset) — `.catch(() => undefined)` uni yutadi, natija yo'qoladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-105 · bookingNotifier do'st-safar push'i kuniga 1 marta, lekin matn har doim bitta safarlik ball aytadi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Push/bot

**Dalil**

> packages/server/src/services/bookingNotifier.ts:736 — `await notifyOnce(bot, referrer.telegramId, referrer.memberId, \`oyin_ref_ride:${m.id}\`, \`🤝 Do'stingiz safar qildi — sizga <b>+${gain} ball</b> qo'shildi! 🎮\`);` — `kind` do'st bo'yicha, NotifyLog esa kunlik (schema.prisma:208), ya'ni bitta do'st uchun kuniga 1 push. Hisobda esa har safar sanaladi: oyinService.ts:417 `if (r.refereeMemberId) cur.rides += seasonRideCountByMember.get(r.refereeMemberId) ?? 0;` × :577 `const referRideBall = refer.rides * (econ.oyinReferRideBall ?? 0);`. bookingNotifier.ts:722-723 izohi buni tan oladi («bir do'st = kuniga max 1 push»), lekin MATN tuzatilmagan.

**Oqibat**

Do'sti kuniga 3 marta yursa taklifchi 30 ball oladi, xabar esa «+10 ball qo'shildi» deydi. Mijoz ilovada boshqa raqam ko'radi — «bot yolg'on gapiryapti» taassuroti (kam zarar, lekin bepul tuzatiladi).

**Takrorlash / kuzatish**

Bir do'st bir kunda 2+ safar qilsa: birinchi safarda push ketadi, ikkinchisida NotifyLog unique to'sadi; ball esa 2× qo'shiladi.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-106 · `referrerOf` findFirst ishlatadi — bir a'zoga ikki taklif qatori bo'lsa push NOTO'G'RI taklifchiga ketishi mumkin

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Push/bot

**Dalil**

> oyinService.ts:2036 `const ref = await prisma.referral.findFirst({ where: { refereeMemberId }, select: { referrerId: true } });` — `orderBy` yo'q. Schema: packages/server/prisma/schema.prisma:142-143 — `refereeId String @unique` UNIQUE, lekin `refereeMemberId Int?` UNIQUE EMAS. Solishtirish uchun `pushCandidates` da bunday xavf YO'Q: TelegramUser.memberId unikal (schema.prisma:816 `memberId Int? @unique`), shuning uchun :3532 dagi `new Map(tus.map((t) => [t.memberId, t.id]))` hech qachon chalkashmaydi.

**Oqibat**

Bir odam Telegram akkauntini almashtirib qayta ulansa, bitta memberId uchun ikkita Referral qatori paydo bo'lishi mumkin. Bu holda computeBallMap IKKALA taklifchiga ham ball yozadi (:417 har qator bo'yicha), push esa faqat tasodifiy bittasiga ketadi. Ya'ni bir taklifchi ball oladi-yu, xabarni boshqa odam ko'radi. Ehtimol past.

**Takrorlash / kuzatish**

schema.prisma:143 da `refereeMemberId` uchun `@unique` yo'qligini tekshiring; oyinService.ts:2036 da `orderBy` yo'qligini tekshiring.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-107 · oyin:seasonclosed:<id> arxivlanmaydi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Tiraj

**Dalil**

> oyinService.ts:3802 (arxiv prefikslari) — oyin:seasonclosed: ro'yxatda yo'q, holbuki :3463 da yoziladi.

**Oqibat**

Eski mavsumning yopilish yozuvi jonli bazada abadiy qoladi; arxiv to'liq emas.

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-108 · Posterlarda ichki raqam fayl nomiga mos kelmaydi va shior ikki xil — brend nomuvofiqligi

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ulashish

**Dalil**

> posters/01.jpg burchagida yashil doirada «13», pastda «Bir shahar. Ko'plab xizmatlar.»; posters/15.jpg burchagida «16», pastda «Bir shahar. Ko'plab imkoniyatlar.» Fayl nomlari qattiq kodlangan: packages/server/src/services/oyinStory.ts:58-62 `export const STORY_POSTER_COUNT = 30; … `/posters/${String(i + 1).padStart(2, "0")}.jpg``

**Oqibat**

Mijoz «13-poster» deb ko'rsatgan narsa admin panelida 01 bo'lib chiqadi — admin tekshiruvida chalkashlik; ikki xil shior esa brend matnini yemiradi.

**Takrorlash / kuzatish**

packages/miniapp/public/posters/01.jpg va 15.jpg ni yonma-yon oching

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---

### OY-109 · `.oyk-qr` bloki QR emas, va /api/oyin/qr o'lik endpoint

**Triaj:** D · **Og‘irlik:** ⚪ low · **Yo‘nalish:** Ulashish

**Dalil**

> packages/miniapp/src/oyin.tsx:2287-2313 `.oyk-qr` bloki ichida faqat matn + 2 tugma; CSS'da ham rasm yo'q (packages/miniapp/src/design/feat/oyk.css:618-630 — `.oyk-qr`, `.oyk-qr-text`, `.oyk-qr-btn`, `.oyk-qr-note`, `<img>` uchun qoida yo'q). Server endpoint mavjud, mijoz chaqiruvi 0: packages/server/src/api/server.ts:1749 `app.get("/api/oyin/qr", …)`; grep "oyin/qr" butun repo bo'ylab faqat shu satrni topadi (miniapp/src/api.ts da faqat `driverQr` bor, :397).

**Oqibat**

Kod o'qiyotgan keyingi agent «QR bor» deb o'ylaydi; jonli offline-tarqatish (QR ko'rsatib chaqirish) o'yin uchun umuman yo'q, garchi bot tomonda mijoz-QR ishlayotgan bo'lsa ham (bot.ts:1412-1428 `ref:qr`).

**Takrorlash / kuzatish**

grep -rn "oyin/qr" packages → 1 ta natija (faqat server route)

**Qabul mezoni (DoD)** — _to‘ldiriladi: yechim tanlangach har satr sinaladigan buyruq bilan yoziladi._

---


## 5. Quyi-tizim xulosalari

**Ulashish** — QISMAN — texnik zanjir ishlaydi (havola → /j/ landing → OG-karta → bot; jonli 200 tasdiqlandi), lekin BITTA statik rasm ishlatiladi va u mavjud bo'lmagan ilova ekranini ko'rsatadi; matnlar esa hozir DARK bo'lgan o'yin/ballni va'da qiladi, o'yin ichidagi «Ulashish» esa «+0 ball qo'shildi» deydi.

**Hikoya** — QISMAN — zanjir uchidan-uchiga KODDA TO'LIQ va izchil ulangan (submit → moderatsiya → jonli ball → ikki tomonlama Telegram xabari, limit ikki qavat), lekin jonli holatda amalda ishlamaydi: (a) `oyin` DARK bo'lgani uchun oqim faqat adminlarga ochiq, (b) va'da qilingan «24 soat» SLA'sining HECH QANDAY ijrochisi yo'q (`overdueStoryCount` o'lik kod), (c) tasdiqlashni faqat EGA bosa oladi, (d) serverda rasm umuman saqlanmaydi — moderatsiya butunlay 24 soatda o'chadigan Instagram havolasiga tayanadi.

**Miniapp UI** — QISMAN — ekran to'liq qurilgan va ko'p anti-naqsh allaqachon tuzatilgan (xato≠bo'shlik, rasm-fallback, NaN qo'riqlari), lekin uchta bloklovchi teshik qoldi: huquqiy rekvizitlar hali BO'SH, «upcoming/unset» fazasida mijoz o'z KARTALARIGA umuman kira olmaydi (tab-qatori chizilmaydi), va qo'ng'iroq (ball tarixi) tarmoq xatosini «hech narsa yo'q» deb ko'rsatadi.

**Push/bot** — QISMAN — zanjir qurilgan va to'liq flag+mavsum darvozasi ostida (oyin DEFAULT_OFF, KAS_MODE=live, bot bor), lekin yetkazib berish semantikasi buzuq (yuborilmagan xabar "yuborildi" deb abadiy markerlanadi, g'olib ham shunga kiradi), uch ogohlantirish matni vaqtni QATTIQ KODDA yozadi va FINAL-48 qulfidan keyin ham «karta oling» deb chaqiradi, sprint g'olibiga esa umuman xabar YO'Q.

**Ball** — QISMAN — 15 manbadan 12 tasi mavsum oynasiga TO'G'RI kesiladi va idempotent (safar, do'st-safari, kunlik markerlar, hikoya, sprint, gashtak, tuzatish), LEKIN telefon-balli mavsum tashqarisida ABADIY yo'qoladi, taklif sybil-qo'rig'i ball yo'lini umuman qamramaydi, va 3 ta manbada «jurnal ≠ balans» ziddiyati bor (ega bir marta aynan shu kasallikni topgan edi).

**Karta** — QISMAN — yadro (gno atomik va takrorlanmas, Feistel+Luhn kodi matematik jihatdan to'g'ri, qayd/avatar maxfiyligi serverda to'g'ri hal qilingan, karta mavsumdan omon qoladi) ISHLAYDI, lekin karta oqimida uchta jonli teshik bor: yangi olingan karta 30 soniyagacha ochilmaydi (kesh), mijoz ko'radigan KO-kodi tiraj ro'yxatining HECH BIR joyida yo'q (jonli efirda o'qiladigan raqam bilan mos kelmaydi), va ochiq tekshiruv sahifasiga ilovada umuman kirish yo'li yo'q.

**Admin (umumiy)** — QISMAN — panel ishlaydi va jonli /var/www/admin ga to'g'ri yetadi, lekin `operator` roli hech qanday darvoza ostida emas (UI ham, server ham), xatolar 51 joyda "bo'sh ro'yxat" ko'rinishida jimgina yutiladi, va ega paroli URL'ga tushadi + cheksiz taxmin qilinadi.

**Admin (o‘yin)** — QISMAN — konsolning skeleti kuchli (9 modul, hammasi requireAdmin+requireOwner ostida, bayroq tugmasi va ishga-tushirish ro'yxati bor, tasdiq oynalari ko'p joyda bor), LEKIN bugun kechqurun jonli chiqish uchun to'rtta ish panel bilan oxirigacha bajarilmaydi: (1) fayldan yuklangan sovrin rasmi mijozga UMUMAN yetib bormaydi va panelning o'zida ham ko'rinmaydi, (2) tiraj «tayyor» ko'rinib turib «not_ready» bilan yiqilishi mumkin va chiqarilgan (xodim/sinov) kartalarni topadigan ekran yo'q, (3) «Yangi mavsum» tugmasi standart qiymatlar bilan JIM yiqiladi — arxiv bajarilib, mavsum yozilmay qoladi, (4) server aytgan aniq xato sababi API qatlamida tashlab yuboriladi.


## 6. QAMRALMADI

- **Ulashish:** Jonli iqtisod raqamlari (econ.firstRide, econ.referrer, oyinStoryProofBall) o'qilmadi — baza VPS ichida yopiq, Neon taqiqlangan. Shu sababli «+N so'm» matni jonlida 0 mi yoki 5000 mi — ISBOTLANMADI.
- **Ulashish:** Jonli feature-flag qatorlari o'qilmadi — `oyin`/`storyshare` OFF ekani berilgan kontekstdan olindi, kodda esa faqat DEFAULT_OFF ro'yxati tasdiqlandi (featureFlags.ts:182).
- **Ulashish:** Telegram'ning HAQIQIY renderi sinalmadi: (a) OG-kartani Telegram ?v=5 bilan yangi tortadimi yoki eski keshni ko'rsatadimi, (b) hikoya matnidagi URL Premium bo'lmaganda bosiladigan bo'ladimi. Test-ulashish YUBORILMADI (qoida: real mijozlarga test xabar yo'q).
- **Ulashish:** Poster preview'dagi «Rasmni bosib turing → Rasmni saqlash» ko'rsatmasi Telegram WebView ichida haqiqatan ishlaydimi — real qurilmada sinalmadi (kodda tekshirib bo'lmaydi).
- **Ulashish:** 30 ta posterning faqat 3 tasi (01, 15, 30 o'lchami; 01 va 15 mazmuni) ko'rildi — qolgan 27 tasida CTA/havola bor-yo'qligi TO'LIQ tekshirilmadi.
- **Ulashish:** Boshqa vertikallardagi ulashish (services.tsx:237, booking3.tsx:311, elonlar.tsx:232, ravella, bookingNotifier.ts:149 «🛡 Ulashish») ko'rib chiqilmadi — topshiriq o'yin/uy yo'nalishi bilan chegaralangan.
- **Hikoya:** JONLI BAZA QAMRALMADI (VPS/DB ga ruxsat yo'q): `oyinStoryProofBall` ning JONLI qiymatini (kod-default 100, packages/shared/src/economy.ts:308) tasdiqlay olmadim; jonli bazada `oyin:story:` qatorlari bor-yo'qligini, ya'ni navbatda kutayotgan real ariza bormi — bilmayman; `oprtoken:` operator tokenlari mavjudligini ham tekshirmadim (shuning uchun «operator tasdiqlay olmaydi» topilmasi KOD YO'LI bo'yicha isbotlangan, jonli rol mavjudligi bo'yicha emas).
- **Hikoya:** UI RENDER QAMRALMADI: miniapp ham, admin panel ham haqiqiy autentifikatsiyalangan sessiyada ochilmadi — barcha UI da'volari faqat kod-o'qishdan. «Poster uzun-bosib saqlanadimi» va «poster panjarasi jonli bundle'da ko'rinadimi» real qurilmada sinalmadi.
- **Hikoya:** TASHQI PLATFORMA XULQI: Instagram hikoya havolasining 24 soatda o'chishi va login-devori — koddan isbotlab bo'lmaydigan tashqi fakt. U topilmada FARAZ sifatida belgilandi (kod tomonidan isbotlangani: rasm saqlanmasligi, 24 soatlik SLA va rad sabablari ro'yxati).
- **Hikoya:** TEST QOPLAMASI YO'Q: submitStory / adminReviewStory / story-ball hisobi uchun BITTA ham unit yoki integratsion test topilmadi (grep --include=*.test.ts --include=*.spec.ts bo'yicha 0). Yagona qoplama — sof funksiya `storyCooldownHoursLeft` (packages/server/src/scripts/simGuards.ts:161-172). simGuards ni O'ZIM YUGURTIRMADIM.
- **Hikoya:** TYPECHECK: `pnpm -r typecheck` yugurtirildi — shared/miniapp/admin TOZA; server'da ATIGI 1 xato bor va u hikoyaga aloqasiz hamda CI qamrovidan tashqarida: `packages/server/src/sim/config/arms.ts:294` (TS2322), `.gitignore:40` bo'yicha butun `packages/server/src/sim/` git'dan chiqarilgan (`git ls-files … | wc -l` → 0). Ya'ni CI shield bu xatoni ko'rmaydi va hikoya kodida tip xatosi YO'Q.
- **Hikoya:** ADMIN PANEL VERSIYASI: uchta hikoya-ekran mavjud (legacy packages/admin/src/App.tsx:~775, packages/admin/src/oyin/Hikoyalar.tsx, packages/admin/src/v2/views/Hikoyalar.tsx) — uchalasi ham bitta API'ga uradi, lekin ega HOZIR qaysi biriga tushayotganini (localStorage `#v2`/`#v1`, packages/admin/src/main.tsx:24-39) tekshira olmadim.
- **Miniapp UI:** QAMRALMADI: hech bir React ekran RENDER qilinmadi — brauzer, build, skrinshot yo'q. Barcha xulosalar kod o'qishdan; vizual o'lchov (skeleton balandligi vs real karta) faqat CSS'dagi e'lon qilingan px qiymatlari bo'yicha.
- **Miniapp UI:** QAMRALMADI: jonli `oyinShareBall` knob qiymati — bazaga kirish yo'q (Neon taqiq, VPS'ga ulanmadim). Faqat packages/shared/src/economy.ts:307 dagi `def: 0` va brifingdagi loginBall=0 tasdiqlangan. Jonli shareBall > 0 bo'lsa «+0» topilmasi faqat login qatoriga tegishli bo'ladi.
- **Miniapp UI:** QAMRALMADI: `state.today.login` har doim `true` degan da'vo — packages/shared/src/oyin.ts:941 izohi va oyinService.ts:1832 `markLogin` mavjudligiga tayanadi; `/api/oyin/state` marshrutida markLogin chaqirilgan ANIQ qator kuzatilmadi.
- **Miniapp UI:** QAMRALMADI: oyinStory.tsx va design/feat/story.css animatsiyalarining `prefers-reduced-motion` xulqi to'liq audit qilinmadi — oyk.css'da 6 ta reduced-motion bloki topildi (:83, :264, :1390, :1398, :1418), story.css alohida tekshirilmadi.
- **Miniapp UI:** QAMRALMADI: o'qilish sifati (kontrast, 320px kenglikda matn kesilishi, tugmalarning 44px bosish maydoni) o'lchanmadi — faqat CSS'dagi `min-height`/`-webkit-line-clamp` e'lonlari ko'rildi.
- **Miniapp UI:** QAMRALMADI: o'yinga boshqa kirish nuqtalari (homeGames.tsx, uy.tsx hero, design/oyinTeaser.tsx mehmon ekrani) — topshiriq doirasidan tashqarida; faqat `lastWinner` bog'liqligi uchun uy.tsx:346 ga qaraldi.
- **Push/bot:** JONLI tizimga UMUMAN tegilmadi: VPS'ga SSH qilinmadi, bazadan bir satr o'qilmadi, `/health` yoki jonli bundle tekshirilmadi. Hamma xulosa faqat repodagi kod matnidan.
- **Push/bot:** Hech qanday buyruq yugurtirilmadi — typecheck ham, vitest ham, simulyator ham. Ya'ni topilmalar KOD O'QISH bilan isbotlangan (fayl:qator + iqtibos), ijro bilan emas.
- **Push/bot:** Telegram'ning haqiqiy 429 xulqi va amaldagi yuborish tezligi O'LCHANMADI. #13 dagi «~5-15 xabar/s» — DB so'rovlari soni × taxminiy kechikishdan chiqarilgan MODEL, o'lchov emas. 859 odamda haqiqatda 429 kelishi/kelmasligi noma'lum.
- **Push/bot:** Jonli `.env` qiymatlari ko'rilmadi: `KAS_MODE` haqiqatan `live` mi, `SYNC_INTERVAL_MINUTES` 15 mi — faqat env.ts dagi default'lar (KAS_MODE default "mock", SYNC default 15) tekshirildi. Agar jonlida KAS_MODE≠live bo'lsa, o'yin push'lari umuman yugurmaydi.
- **Push/bot:** Admin panel UI ochilmadi. `notifiedAt` ning admin ekranida ko'rsatilmasligi faqat grep bilan aniqlandi (packages/admin/src da `notifiedAt` — 0 natija); Kartalar.tsx/Nazorat.tsx ning haqiqiy renderi ko'rilmadi.
- **Push/bot:** Tikdagi BOSHQA push manbalari (pushEngineTick, campaignTick, driverEngageTick, weeklyRecap, dispatchLinkReminders) kunlik cap'ni amalda qanchalik yeyishi o'lchanmadi — #11 dagi «starvation» mexanizm sifatida isbotlangan, chastotasi emas.
- **Push/bot:** `getSponsor`, `getCatalog`, `getSoldMap` ichki mantiqi tekshirilmadi — `cheapestOpenPrize` (oyinService.ts:3510-3517) ning natijasi to'g'riligiga TAYANILDI, o'zi audit qilinmadi.
- **Push/bot:** Miniapp tomonidagi o'yin ekranlari (chipta olish oqimi, «Kartalarim») tekshirilmadi — topshiriq PUSH/bot xabarlariga cheklangan.
- **Ball:** JONLI BAZA QAMRALMADI: Neon muzlatilgan, app DB VPS ichida (localhost:5432) — hech bir knobning JONLI qiymati o'z ko'zim bilan tekshirilmadi. oyinRideBall=35, oyinFirstRideBall=100, oyinDailyLoginBall=0, oyinStreakBall=0, oyinJamoaMaxBall=200000, oyinMinSellPct=100 — topshiriqda BERILGAN deb qabul qilindi. Qolganlari (oyinShareBall, oyinPhoneBall, oyinDailyQuestBall, oyinStoryProofBall, oyinHomeScreenBall, oyinSprintBonusBall, oyinReferFirstRideBall=175, oyinReferRideBall=10, oyinJamoaBallPerRide=6, oyinAdjustMaxPerAction/PerSeason) FAQAT economy.ts def-qiymatlari bo'yicha — jonlida boshqacha bo'lishi mumkin.
- **Ball:** TESTLAR YURGIZILMADI: computeBallMap DB talab qiladi, TEST_DATABASE_URL yo'q (CLAUDE.md). shared/__tests__/oyinSeasonBall.test.ts o'qildi (sof-funksiya + manba-matn qo'riqlari) lekin ishga tushirilmadi. Ya'ni har bir manba uchun 'ball haqiqatan tushdi' JONLI isbot yo'q — xulosalar kod-yo'lini oxirigacha kuzatishga asoslangan.
- **Ball:** UI JONLI RENDER QILINMADI: bayroq DARK, real autentifikatsiyalangan ekran ko'rilmadi. oyin.tsx topilmalari FAQAT manba kodidan (DoD R6 ma'nosida 'isbot' emas).
- **Ball:** seasonClose (ball → tanga to'lovi) va uning ≤350 clamp bilan aloqasi TEKSHIRILMADI — topshiriq BALL EMISSIYASI bilan chegaralangan edi.
- **Ball:** Reyting/board, vitrina, drawExport va oyinAudit yo'llari ball-manbalari nuqtai nazaridan tekshirilmadi (faqat computeBallMap dan o'qishlari qayd etildi).
- **Ball:** sprintCheck ning haqiqiy g'olib-tanlash mantig'i (surat-delta) o'qildi, lekin 4-haftalik anti-abuz oynasi va `oyin:sprintdone:` qo'rig'ining poyga-holatlari CHUQUR tahlil qilinmadi.
- **Ball:** `oyin:tickets:` da bir a'zoda nechta karta borligi, `oyin_sold:` hisoblagichlari va reserveSoldSlot ning atomikligi tekshirilmadi (spent hisobiga kirmaydi, lekin chipta iqtisodi uchun muhim).
- **Karta:** JONLI BAZAGA TEGILMADI (ega qoidasi + Neon muzlatilgan, app DB faqat VPS ichida): gno'siz eski chiptalar soni, `oyin:cardcodesecret` qatorining haqiqatan borligi, `oyin_sold:` va `oyin:ticketno` ning hozirgi qiymatlari — hech biri o'lchanmadi. Shu sababli 'eski karta bir xil kod' topilmasi SHARTLI (kod yo'li isbotlangan, jonli mavjudligi emas).
- **Karta:** JONLI UI KO'RILMADI: miniapp real Telegram autentifikatsiyasi bilan render qilinmadi (o'yin bayrog'i DARK, ekranga kirish yo'q). Barcha UI da'volari JSX o'qishdan — piksel/skrinshot isboti yo'q.
- **Karta:** AVTOMATIK TEST YO'Q: cardCode.ts, reserveSoldSlot/releaseSoldSlot, getPrizeCards, getCardDetail, getPublicCardVerify uchun birorta *.test.ts yo'q (`find packages -name '*.test.ts'` → 9 fayl, hech biri karta yo'liga tegmaydi). Mavjud E2E skript packages/server/src/scripts/testCancelRace.ts YUGURMAYDI — TEST_DATABASE_URL 2026-07-27 da o'chirilgan (CLAUDE.md).
- **Karta:** 30 SONIYALIK KESH BUGI JONLIDA TAKRORLANMADI — faqat kod yo'li bo'yicha isbotlangan (kesh o'qish 4721, xaridda tozalash yo'qligi 1770-1789). Jonli isbot uchun VPS'da ketma-ket ikki so'rov kerak.
- **Karta:** cardCode round-trip va Luhn o'lchovlari IZOLYATSIYALANGAN skript orqali (soxta DATABASE_URL, DB'ga so'rov ketmagan) — `getSecret()` ning jonli AppState bilan xatti-harakati sinalmadi, faqat sof matematik funksiyalar.
- **Karta:** ADMIN PANEL jonli ochilmadi — admin da'volari (`№{w.gno}`, CSV ustunlari, «Ro'yxat FAQAT joriy mavsumni qamraydi» eslatmasi) faqat manba kodidan.
- **Admin (umumiy):** JONLI tizim tekshirilmadi — faqat lokal kod o'qildi. VPS'ga SSH, jonli baza va `/var/www/admin` ichidagi bundle tekshirilmadi ("Faqat O'QI" cheklovi + Neon taqiqi). Ya'ni `/api/admin/*` javob kodlari (403 vs 200) kodga qarab xulosa qilindi, jonli curl bilan EMAS.
- **Admin (umumiy):** Eng muhim ochiq savol: jonli `AppState` da `oprtoken:*` satrlari orasida QIYMATI oddiy `operator` bo'lganlari BORMI? Agar bor bo'lsa 1-topilma latent emas, jonli ochiq teshik. Tekshirish: VPS'da `SELECT key, value, "updatedAt" FROM "AppState" WHERE key LIKE 'oprtoken:%';` — men buni bajara olmadim.
- **Admin (umumiy):** `ADMIN_PANEL_TOKEN`ning jonli qiymati va uzunligi ko'rilmadi (VPS .env). env.ts:21 da minimal uzunlik talabi yo'q — agar qiymat qisqa/oson bo'lsa 3-topilma (rate-limit yo'q) darajasi critical'ga ko'tariladi.
- **Admin (umumiy):** Mobil xulosalar FAQAT CSS o'qishdan (styles.css media-query'lari, `.content{min-width:0}`, `.table-wrap{overflow-x:auto}`). Real telefonda yoki brauzer emulyatorida render qilinmadi — sensorli maqsad o'lchamlari (tugma balandligi), iOS Safari'da `prompt()` xatti-harakati va uzun jadvallarda skroll qulayligi o'lchanmadi.
- **Admin (umumiy):** `packages/admin/src/oyin/*` (Konsol, Kartalar, Mukofotlar, Gashtak, Reja, Sozlama, Nazorat, Odamlar, Komentariyalar, Hikoyalar) ataylab QAMRALMADI — topshiriq "o'yindan tashqari" degan edi. O'yin ekranlari boshqa modul sifatida alohida tekshirilishi kerak.
- **Admin (umumiy):** Chuqur o'qilmagan fayllar: `packages/admin/src/design/DataTable.tsx`, `charts.tsx`, `kit.tsx` ichki mantiqi va `v2/views/Bugun|Jonli|Odamlar|Hikoyalar.tsx` to'liq mazmuni (faqat Skeleton ishlatilishi sanaldi). `packages/admin/src/jamoa.tsx` (1348 qator) ham to'liq emas — faqat pul-oqimi (staffPay/reward/archive) va xato-ishlovi tekshirildi.
- **Admin (umumiy):** `operatorConsole.ts` dagi 17 ta `dispatchAction` amalidan faqat `coins`, `ban`, `unban`, `hardban`, `hardunban`, `cancel_bazar` o'qildi; `book`, `cancel_taxi`, `order_bazar`, `send_button`, `profile_edit`, `cancel_intercity` ning rol/limit xavfsizligi tekshirilmadi — chatops tokeni ularning HAMMASIGA yetadi (server.ts:270-272).
- **Admin (o‘yin):** JONLI BAZAGA UMUMAN TEGILMADI (CLAUDE.md qoidasi + faqat-o'qish topshirig'i). Shuning uchun: jonli 35 sovrinning rasmlari FAYLDAN yuklanganmi (photoFileId → mijozga bormaydi) yoki TASHQI HAVOLA bilanmi (photoUrl → boradi) — aniqlanmadi. Buni panelning o'zida tekshirish mumkin: katalog qatoridagi «📤 yuklangan rasm» = xavf, «🔗 tashqi havola» = joyida (Mukofotlar.tsx:159).
- **Admin (o‘yin):** BRAUZERDA RENDER QILIB KO'RILMADI — skrinshot yo'q. Rasm buzilishi (nisbiy URL) va v2 menyusidagi bo'shliq KOD va Caddyfile'dan chiqarildi, jonli sahifada ko'z bilan tasdiqlanmadi.
- **Admin (o‘yin):** Jonli bazadagi xodim (isAdmin=true) a'zolar soni va ularning qaysi sovrinlarda kartasi borligi tekshirilmadi — «tiraj abadiy bloklanadi» xavfining JONLI ko'lami noma'lum; kod yo'li esa aniq (oyinService.ts:3318/3331 + minSellOf 100%).
- **Admin (o‘yin):** Gashtak.tsx (198 qator) va Reja.tsx faqat ustki qatlamda o'qildi — ulardagi amallar (kick/disband/sinov a'zo/navbat) route va tasdiq darajasida ko'rildi, lekin har bir xato yo'li batafsil kuzatilmadi.
- **Admin (o‘yin):** Miniapp tomoni (mijoz ekrani) faqat rasm masalasida tekshirildi (oyin.tsx:1742, 1387) — o'yin ekranining qolgan qismi bu tekshiruv doirasida emas.
- **Admin (o‘yin):** Testlar yugurtirilmadi (typecheck/vitest) — topshiriq faqat-o'qish edi va lokal baza yo'q (CLAUDE.md: localhost:5433 → P1001).


## 7. Rad etilgan da‘volar (tiketga KIRMAYDI)

Skeptik-agentlar 8 ta topilmani rad etdi. Eng muhimlari:

1. **«Posterlarda havola/QR yo‘q»** — xato. 30 posterdan 9 tasida bot havolasi (`t.me/koson1067bot?start=…`) artworkka pishirib qo‘yilgan (05, 06, 10, 11, 18, 20, 25, 26, 27). Tadqiqotchi 2 tasini ko‘rib hammasiga umumlashtirgan. _Qolgan haqiqiy muammo (21 tasida havola yo‘q) OY-tiket sifatida saqlandi._
2. **«Taklif-posteri ilovaning 5 tabini noto‘g‘ri ko‘rsatadi»** — iqtibos soxta edi: `App.tsx:105` da `BASE_TABS` faqat **ikkita** (Uy, Reyting), qolgani bayroqqa qarab qo‘shiladi. _Poster mavjud bo‘lmagan ekranni ko‘rsatishi — baribir rost, tiket saqlandi._
3. **«Sprint miniappda umuman yo‘q»** — takrorlash qadami yolg‘on edi.
4. **«Story ulashishda havola yo‘qoladi»** — ongli platforma-cheklovi yechimi (Premium bo‘lmaganlarda havola matn ichiga qo‘shiladi).


## 8. Kechqurungi ish tartibi

1. **Kelishuv:** `packages/miniapp/src/oyin.tsx` hozir **boshqa sessiya qo‘lida** (commit qilinmagan o‘zgarish bor). Unga tegishdan oldin ega tasdig‘i kerak — aks holda ish yo‘qoladi (10-avgustda ikki marta bo‘lgan).
2. Server + shared tomonidagi A-tiketlar (miniapp‘ga bog‘liq emas).
3. Admin panel A-tiketlari.
4. Miniapp A-tiketlari — faqat 1-band hal bo‘lgach.
5. **Majburiy tekshiruv (har commitdan oldin):**
   - `git diff --cached --name-only` — begona fayl yo‘qligiga ishonch
   - `pnpm -r typecheck`
   - `pnpm --filter @t1067/server test` (vitest)
   - `simEconomy` / `simLoyalty` / `simGuards`
   - `pnpm -r build`
6. Push — **faqat ega tasdig‘i bilan** (doimiy qoida).
7. Deploy avtomatik (`ci.yml` shield → SSH → `deploy.sh`). Isbot: `/health` + jonli bundle grep.
8. **Bayroqni yoqish — eng oxirida**, alohida ongli qadam, ega huzurida, jonli tekshiruvdan keyin.

