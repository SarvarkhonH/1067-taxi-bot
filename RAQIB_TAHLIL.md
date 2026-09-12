# RAQIB TAHLILI — kas1067 / TaxiCloud ilovalari

**Sana:** 2026-09-08 · **Manba:** ega bergan uchta APK · **Usul:** `aapt` manifest + DEX satr tahlili
**Huquqiy chegara:** ularning kodi ko'chirilmaydi. Bu hujjat — **xatti-harakat tavsifi**, kod emas.

---

## 0. ENG MUHIM XULOSA

Kas1067 haydovchi ilovasi biz o'ylagandan **ancha oddiy**. Butun ilova — **11 ta ekran, xaritasiz,
push-bildirishnomasiz, shifrlanmagan HTTP ustida.**

Biz "raqib bilan tenglashish" haqida o'ylayotgan edik. Aslida savol boshqa: **biz allaqachon
oldindamiz, endi ularning kuchli tomonlarini yo'qotmasdan qanday uzib ketamiz.**

---

## 1. NIMA QO'LIMIZDA BOR

| Fayl | Paket | Versiya | Hajm |
|---|---|---|---|
| `taxi_1067_driver_128.apk` | `uz.kas1067.driver` | 12.8 (kod 128) | 12.1 MB |
| `taxicloud_operator_ptt_35.apk` | `uz.taxiptt.operator` — «Рация оператора» | 3.5 (kod 35) | 4.6 MB |
| `taxicloud_telephony_20.apk` | `uz.telephony` — «Телефония» | 2.0 (kod 20) | 9.3 MB |

Ichki paket nomi **`uz.taxisoft`** — ya'ni ishlab chiquvchi **TaxiSoft**, mahsulot **TaxiCloud**,
kas1067 esa uning Koson uchun brendlangan nusxasi. Ya'ni raqibimiz mahalliy dispetcher emas,
**tayyor SaaS platforma**. Bu muhim: ular Koson uchun maxsus hech narsa qilmaydi.

---

## 2. HAYDOVCHI ILOVASI — to'liq razborka

### 2.1 Butun ilova — 11 komponent

```
SplashActivity · LoginActivity · SmsConfirmActivity · AgreementActivity
MainActivity · BookingActivity · TakeBookingActivity · ProvideBookingActivity
BookingHistoryActivity · PaymentHistoryActivity · MainService
```

Hammasi shu. Solishtirish uchun bizning `1067-taxi` haydovchi ilovasida 10 ta ekran bor, lekin
ular boshqa toifadagi: xarita + issiqlik xaritasi, daromad, ballar, hujjatlar, profil, sozlamalar,
onboarding, ruxsatlar.

**Kas'da yo'q:** xarita · daromad paneli · ballar/motivatsiya · profil · sozlamalar · hujjatlar ·
navigatsiya · chat · SOS · onboarding.

### 2.2 Xarita umuman yo'q — tasdiqlangan

APK ichida birorta xarita kutubxonasi yo'q. Google Play Services'dan faqat to'rttasi bor:
`base`, `basement`, `location`, `tasks`. **`play-services-maps` yo'q. Native kutubxona (`lib/`) yo'q.**

Ya'ni haydovchi joy **nomini** ko'radi va o'zi boradi. Bu shaharni biladigan mahalliy haydovchi
uchun aslida **yomon qaror emas** — va bizning bozorimizga mos (manzil tushunchasi yo'q, katalogdan
joy tanlanadi). Buni "kamchilik" deb hisoblab, ustiga og'ir xarita qo'yish — xato bo'lardi.

### 2.3 Push-bildirishnoma YO'Q — eng katta zaiflik

`FirebaseMessagingService` — **0 ta izi.** FCM umuman ishlatilmaydi.
O'rniga: `io.netty` + `okhttp3.WebSocket` — ya'ni ilova serverga doimiy soket ushlab turadi.

Oqibati og'ir: **Android ilovani o'ldirsa (batareya tejash, xotira, OEM "optimizatsiya"), haydovchi
buyurtmalarni umuman olmaydi va buni bilmaydi ham.** Telefon cho'ntakda, ilova "onlayn" ko'rinadi,
lekin soket uzilgan.

Bu 21.5% rad javobining va past onlayn ulushning eng ehtimoliy sababi. Va buni tuzatish uchun
bizga kas'ni nusxa qilish emas, **boshqa transport** kerak.

### 2.4 Shifrlanmagan HTTP

DEX ichidagi yagona jonli server manzili:

```
http://46.8.176.53/kas1067/
```

`https` emas, **`http`**. Domen ham yo'q, IP. Ya'ni haydovchining kirish ma'lumotlari, GPS izi,
buyurtma tafsilotlari — hammasi ochiq kanalda. Har qanday umumiy Wi-Fi'da o'qib bo'ladi.

Bu bizning "ishonchli tizim" da'vomiz uchun tayyor argument.

### 2.5 Ruxsatlar nima haqida gapiradi

| Ruxsat | Nimani anglatadi |
|---|---|
| `SYSTEM_ALERT_WINDOW` | Buyurtma taklifi boshqa ilovalar **ustida** chiqadi. Bu to'g'ri qaror — biz ham qilishimiz shart |
| `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION` | Uzluksiz GPS kuzatuv |
| `RECORD_AUDIO` | Haydovchi ilovasida ham ratsiya bor |
| `QUERY_ALL_PACKAGES` | O'rnatilgan ilovalarni sanaydi — soxta-GPS ilovasini yoki raqib ilovasini aniqlash uchun |
| `MANAGE_EXTERNAL_STORAGE` | Butun xotiraga kirish. Zamonaviy ilovaga keraksiz — dangasa qaror |
| `READ_PHONE_STATE` | Qurilma/SIM identifikatsiyasi |

Soxta-GPS bo'yicha: `isFromMockProvider` izlari bor, lekin ular standart Android Location API'dan
ham kelishi mumkin. **Ular soxta-GPS'ni faol bloklaydimi — bu hali isbotlanmagan.** `QUERY_ALL_PACKAGES`
buni taxmin qildiradi, xolos.

### 2.6 Eski telefonlarni qo'llab-quvvatlash — biz uchun jiddiy xavf

```
kas1067 driver:  minSdk 21  → Android 5.0 (2014)
BIZNING ilova:   minSdk 26  → Android 8.0 (2017)
```

**Bu haqiqiy bozor to'sig'i.** Android 5/6/7 telefonli haydovchi kas ilovasini o'rnata oladi,
bizникini **o'rnata olmaydi** — Play Store'da "qurilmangiz mos emas" deb yozadi va shu yerda tugaydi.

Qishloq taxi bozorida eski telefon ko'p. 550 haydovchining necha foizi Android 8 dan pastda —
buni bilmaymiz, va **bilmasdan chiqish** yo'qotish demak.

⚠️ Bu F3 dala sinovidan **oldin** aniqlanishi kerak: birinchi 50 haydovchining telefon versiyasi
so'raladi. Agar 20% dan ko'pi 8.0 dan past bo'lsa — `minSdk` ni 23 gacha tushirish rejaga kiradi.

---

## 3. OPERATOR RATSIYASI (`uz.taxiptt.operator`)

To'rt ekran: `Splash · Login · Main · Ptt`. Netty, `RECORD_AUDIO`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

Ya'ni **operator haydovchilarga ovoz orqali murojaat qiladi** — bosib gapiradigan ratsiya.
Alohida ilova sifatida, dispetcher panelining ichida emas.

Bu muhim madaniy fakt: bu bozorda dispetcher va haydovchi **gaplashadi**. Faqat matn va tugmalar
bilan qurilgan tizim — ular o'rgangan ish uslubini buzadi. Ratsiyani rejaga kiritish kerak, lekin
alohida ilova sifatida emas — konsolning va haydovchi ilovasining ichida.

---

## 4. TELEFONIYA (`uz.telephony`)

Ikki ekran, lekin ruxsatlari hammasini aytadi: `ANSWER_PHONE_CALLS`, `READ_CALL_LOG`,
`PROCESS_INCOMING_CALLS`, `SYSTEM_ALERT_WINDOW`.

Ya'ni: **qo'ng'iroq kelganda ekranda mijoz kartasi chiqadi.** Operator raqamni yozmaydi — tizim
o'zi taniydi. Firebase analytics ham shu ilovada (uchtasidan yagona).

Bizda bunga mos endpointlar allaqachon bor: `operator-phones/ring|answered|ended`,
`operator/client/lookup`, `client/quick`. Ya'ni suyagi tayyor.

---

## 5. XULOSA — ularning 5 zaifligi va 5 kuchli tomoni

### Zaifliklar (bizning imkoniyatimiz)

| # | Zaiflik | Bizning javob |
|---|---|---|
| 1 | **Push yo'q** — ilova o'ldirilsa haydovchi ko'rmaydi | FCM yuqori-prioritetli push **+** soket. Ikki kanal, biri yiqilsa ikkinchisi ishlaydi |
| 2 | **HTTP** — shifrlanmagan | HTTPS, sertifikat pinning |
| 3 | **Motivatsiya yo'q** — daromad, maqsad, ball ekrani yo'q | Onlayn-ulushni oshirishning asosiy richagi (F4) |
| 4 | **Talab ko'rinmaydi** — qayerda buyurtma ko'pligi noma'lum | Issiqlik xaritasi |
| 5 | **Uzilishga chidamsiz** — offline navbat yo'q ko'rinadi | Offline navbat, qayta ulanish, holat tiklash |

### Kuchli tomonlar (yo'qotmaslik kerak)

| # | Ular to'g'ri qilgan | Biz nima qilishimiz kerak |
|---|---|---|
| 1 | **minSdk 21** — eski telefonlar ishlaydi | Bizniki 26. Tushirish kerakmi — o'lchab aniqlash |
| 2 | **Xarita yo'q, sodda** | Xaritani majburiy qilmaslik. Ilova xaritasiz ham to'liq ishlashi kerak |
| 3 | **Taklif boshqa ilovalar ustida chiqadi** | Bizda ham overlay shart |
| 4 | **Ratsiya — ovozli aloqa** | Konsol va ilovaga qurib kiritish |
| 5 | **CTI — qo'ng'iroqda mijoz kartasi** | Bizda endpointlar bor, ekran qurilishi kerak |

---

## 5A. KAS ILOVASINI KIM YOZGAN — aniqlandi

**Onde emas.** DEX ichida `uz.taxisoft.*` sinflariga **446 ta murojaat**, `com.onde` ga —
**0 ta** **[o'lchandi]**. Ya'ni kas1067 ilovasini **TaxiSoft** degan mahalliy o'zbek jamoasi yozgan,
xorijiy platforma emas.

Sinf nomlaridan chiqqan qo'shimcha xususiyatlar:

| Sinf | Nimani ochadi |
|---|---|
| `uz.taxisoft.dto.parking.ParkingDto` | **Navbat zonalari** bor — haydovchilar joyda navbatga turadi (bozor, avtovokzal) |
| `uz.taxisoft.dto.ptt.PttMessageDto` · `PttPropertyDto` | **Ratsiya haydovchi ilovasining ICHIDA** — alohida ilova emas |
| `uz.taxisoft.netty.NettyClient` | Netty soket transporti — tasdiqlandi |
| `uz.taxisoft.dto.driverPaymentHistoryReport.*` | To'lov tarixi hisoboti |

**Eng qiziq topilma — sozlama maydonlari:**

```
increaseRatingOnDeliverAppBooking
increaseRatingOnDeliverCallBooking
```

Ya'ni kas'da **ilova orqali kelgan buyurtma va qo'ng'iroq buyurtmasi uchun haydovchi reytingi
alohida oshiriladi** — bu sozlanadigan knob. Demak ular kanal ko'chirish muammosini biladi va
unga qarshi richagi bor. Bizda ham shu richag bo'lishi kerak, faqat kuchliroq.

---

## 5B. ONDE — o'rganildi, lekin sotib olinmaydi

`onde.app` — oq-yorliqli (white-label) taksi platformasi sotuvchi kompaniya. Bozorlari:
Saudiya Arabistoni, Tayvan, Braziliya, Yaqin Sharq.

### Mahsulot tuzilishi — bizning xaritamizni tasdiqlaydi

Mijoz ilovasi · Haydovchi ilovasi · **Operator ilovasi** · **My Hub** (admin) · Veb-bron ·
Delivery/Super App · Onde.Light (bepul sinov). Ya'ni ular ham aynan bizning yetti sirtga kelgan.

### Ularning asosiy marketing da'vosi = bizning bog'lovchi cheklovimiz

> *"Smart order distribution reduces idle time — cover more orders with fewer drivers."*

Ya'ni **kamroq mashina bilan ko'proq buyurtma** — bizning zanjirli buyurtma strategiyamiz
aynan shu. Mustaqil ravishda bir xil xulosaga kelinishi — bu yo'l to'g'ri ekanining belgisi.

### Ulardan olinadigan xususiyat ro'yxati

Haydovchi navbati (queue management) · issiqlik xaritasi · haydovchi boshqaruv moduli
(ro'yxatdan o'tish, hujjatlar, obuna) · avtomatik hisob-kitob · mijoz reytingi ·
ilova ichida chat · geolokatsiya kuzatuvi · chegirma va referal dasturlari.

Bularning ko'pi bizda allaqachon bor yoki rejada. **Yangi g'oya: haydovchi navbati** —
kas'da ham bor (`ParkingDto`), bizda yo'q. Bozor va avtovokzal uchun kerak.

### ⛔ Nega sotib olinmaydi — hisob

| Onde tarifi | Boshlang'ich to'lov | Oylik |
|---|---|---|
| Starting Up | $4 500 | $99 + tushumdan ulush |
| Professional | $8 500 | $99 + ulush |
| Expert | $23 000 | $99 + ulush |

Bizning bugungi iqtisod **[ega]**:

```
Oylik yalpi safar qiymati:  1956 × 62 000  = 121 300 000 so'm
Oylik SOF FOYDA (ega):      1956 × 1 700   =   3 325 000 so'm
```

Kurs ~13 000 so'm/$ deb olsak:

- **$99/oy ≈ 1 290 000 so'm** = oylik sof foydaning **39%** — hali ulush hisoblanmadi
- **$4 500 boshlang'ich ≈ 58 500 000 so'm** = **17 oylik butun sof foyda**
- Tushumdan atigi **2% ulush** = 2 426 000 so'm/oy = sof foydaning **73%**

Ya'ni eng arzon tarif ham bugungi butun foydani yeb qo'yadi. Sabab oddiy: ular **safar
qiymatidan** ulush oladi (121 mln), biz esa undan atigi 2.7% ni sof foyda sifatida ko'ramiz.

10x o'sgandan keyin (kuniga 600 buyurtma) hisob yumshaydi — foyda ~30 mln so'm/oy bo'ladi va
$99+2% taxminan 25% ni oladi. Og'ir, lekin o'ldirmaydi. **Lekin o'shanda ham savol qoladi:
bizda allaqachon 40 modullik yadro bor. Bor narsa uchun abadiy ulush to'lash — noto'g'ri savdo.**

**Xulosa:** Onde — o'rganish uchun yaxshi manba va xususiyat ro'yxati. Sotib olish uchun emas.
Ularning bepul `Onde.Light` tarifini mahsulotni ichdan ko'rish uchun ishlatish mumkin.

---

## 6. NIMA HALI O'RGANILMAGAN

Bu hujjat faqat **kas1067/TaxiCloud** ni qamraydi. Ega yo'nalishi — "barcha agregatorlarni
o'rganib" — quyidagilarni ham talab qiladi:

- **Yandex Go (haydovchi)** — smenalar, tariflar, prioritet, "oltin" haydovchi tizimi
- **Bolt Driver** — bonus tizimi, onlayn turishga rag'bat
- **inDrive** — narx muzokarasi modeli (bizning bozorga mos bo'lishi mumkin)
- **Maxim** — MDH qishloq bozorlarida kuchli, kas'ga eng yaqin raqib
- **Uber Driver** — smena rejalashtirish, daromad prognozi

Har biridan bitta savol: **haydovchini onlayn ushlab turish uchun nima qiladi?**
Bizning bog'lovchi cheklovimiz shu — 16.5 dan 158 mashinaga chiqish.

---

## 7. HUQUQIY CHEGARA

Ularning kodi bizga ko'chirilmaydi. Dekompilyatsiya qilingan kod — TaxiSoft mualliflik huquqi,
ustiga obfuskatsiya qilingan va kontekstsiz.

Olinadigan narsa — **xatti-harakat va spetsifikatsiya**: qanday ekranlar bor, qanday oqim ishlaydi,
qanday ruxsatlar kerak. Har xususiyat o'z kodimiz bilan, o'z dizaynimiz bilan qayta quriladi.
