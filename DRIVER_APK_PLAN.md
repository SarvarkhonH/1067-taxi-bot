# 📲 BIRJOY HAYDOVCHI — Android ilova (APK) rejasi v1

> **Ega talabi (2026-09-07):** «birinchi navbatda bizga APK kerak. To'liq funksional, kuchli
> driver APK. Eski androidlarda kuchli ishlaydigan. Fon rejimida kas1067 driver ilovasidan
> **10x yaxshiroq**. Qulay va tez.»
>
> **Holat: REJA — kod yozilmagan, ega tasdig'i kutilmoqda.**
> Bog'liq hujjat: `DISPATCH_PLAN.md` (server tomoni, o'z dispetcherlik yadrosi).

---

## §0. «10x yaxshiroq» — nimani o'lchaymiz

«Yaxshiroq» degan gap emas, **raqam**. Quyidagi jadval ilovaning qabul mezoni. Chap ustun —
haydovchilar kas ilovasida shikoyat qiladigan holatlar; o'ng ustun — bizning majburiyatimiz.

| # | O'lcham | Odatiy dispetcher-ilovasi muammosi | BIZNING MAJBURIYAT |
|---|---|---|---|
| 1 | **Fonda buyurtma o'tkazib yuborish** | Telefon ilovani o'ldiradi, haydovchi buyurtmani ko'rmaydi | **8 soatlik smenada 0 ta o'tkazib yuborish** (§4) |
| 2 | Ekran o'chganda joylashuv to'xtashi | Xarita muzlaydi, dispetcher qayerdaligini bilmaydi | Ekran o'chiq — joylashuv **har 10–15 s** yangilanadi |
| 3 | Telefon o'chib-yonganda | Ilova o'zi ochilmaydi, haydovchi bilmay liniyadan tushib qoladi | **Avtomatik tiklanadi** (boot receiver), holat saqlanadi |
| 4 | Batareya | Smenada 60–80% yeydi | **8 soatda ≤ 25%** |
| 5 | Sovuq ochilish (eski telefon) | 3–6 soniya | **≤ 1.0 s** (Redmi 5A darajasidagi telefonda) |
| 6 | Taklif ko'rinishi | Bildirishnoma jimgina keladi | **To'liq ekran + signal ovozi + tebranish**, jimlik rejimida ham |
| 7 | Tarmoq uzilishi | «Xatolik», amal yo'qoladi | **Navbatga yoziladi**, tarmoq qaytganda o'zi yuboriladi |
| 8 | Ilova hajmi | 30–60 MB | **≤ 6 MB** |
| 9 | Ishlash (RAM 1 GB telefon) | Sekin, qotib qoladi | **60 fps**, RAM sarfi ≤ 120 MB |
| 10 | Play Services yo'q telefon | Push umuman kelmaydi | **Ishlaydi** (soket + LocationManager zaxira, §5.4) |

⚠️ **Halol eslatma:** 1-, 5- va 9-qatorlarni **haqiqiy eski telefonda** o'lchamaguncha
«bajarildi» deyilmaydi. Ega sinov uchun 2 ta eski telefon berishi kerak (§12).

---

## §1. Qurilma haqiqati — kimga quramiz

Reja quyidagi taxminlarga qurilgan. **Ega tasdiqlashi yoki tuzatishi kerak** (§12.1):

| Taxmin | Nega muhim |
|---|---|
| Ko'p haydovchida arzon Android: Redmi, Tecno, Infinix, Oppo, Samsung A-seriya | Bu brendlar **ilovani eng qattiq o'ldiradi** — 4-bo'lim shu haqda |
| Android 7–13 oralig'i, ba'zilarida 6 | `minSdk 21` (Android 5.0) olamiz — hammasi qamraladi |
| RAM 1–3 GB | Og'ir kutubxona YO'Q, WebView YO'Q |
| Ba'zi telefonlarda Google Play Services eski yoki yo'q | Push'ga **yolg'iz tayanib bo'lmaydi** |
| Internet 3G/4G, tez-tez uziladi | Offline navbat majburiy |
| Trafik qimmat | Kunlik trafik **≤ 5 MB** bo'lsin |

---

## §2. TEXNOLOGIYA QARORI — **native Kotlin**

### 2.1 Qaror va uning sababi

Oldingi hujjatda (`DISPATCH_PLAN.md` §8) men **Capacitor** (web-ilova Android qobig'ida)
tavsiya qilgan edim. **O'sha tavsiya bu talablar uchun to'g'ri kelmaydi va bekor qilinadi.**
Sabab oddiy: Capacitor ilovasi WebView ustida ishlaydi, eski Androidda WebView eski va sekin,
fon rejimida esa tizim uni birinchi bo'lib o'ldiradi. Ega aynan shu ikki narsani talab qildi.

| Mezon | Native Kotlin | Capacitor / WebView | Flutter |
|---|---|---|---|
| Eski Android (5–7) | ✅ To'liq nazorat, minSdk 21 | ❌ WebView versiyasiga bog'liq, polifil to'plami kerak | 🟡 Ishlaydi |
| Fon rejimi (asosiy talab) | ✅ Foreground service + WorkManager + boot receiver — **to'g'ridan-to'g'ri** | ❌ WebView jarayoni birinchi o'ldiriladi | 🟡 Plagin orqali |
| Sovuq ochilish | ✅ ~0.5 s | ❌ 2–4 s (WebView ko'tarilishi) | 🟡 ~1 s |
| Hajm | ✅ 3–5 MB | 🟡 8–15 MB | ❌ 15–20 MB |
| RAM | ✅ ~80 MB | ❌ 200+ MB | 🟡 ~150 MB |
| Play Services yo'q telefon | ✅ To'liq zaxira yozamiz | 🟡 | 🟡 |
| Ishlab chiqish tezligi | ❌ Sekinroq | ✅ Tez | 🟡 |
| Repo'ga yangi asbob | Android SDK | Yo'q (mavjud React) | Butun yangi tillar to'plami |

**Qaror: native Kotlin.** Ega talablarining 1, 3, 5, 9 va 10-qatorlarini faqat shu yo'l
beradi. To'lov — ishlab chiqish vaqti uzoqroq (§10).

### 2.2 Texnik to'plam (hammasi eski Androidda sinalgan, yengil)

| Qism | Tanlov | Nega |
|---|---|---|
| Til | Kotlin | Android standarti |
| UI | **XML layout + View** (Compose EMAS) | Eski telefonda yengilroq, oldindan aytiladigan ishlash |
| minSdk / targetSdk | **21 / 34** | Android 5.0+ hammasi; target yangi (ruxsatlar to'g'ri) |
| Tarmoq | **OkHttp** (+ WebSocket) | Yengil, API 21+, soketi bor |
| JSON | kotlinx.serialization | Kichik, reflection'siz |
| Lokal baza | **Room** | Offline navbat va sozlamalar |
| Fon | Foreground Service + **WorkManager** | Tizim o'ldirsa qayta ko'taradi |
| Joylashuv | FusedLocation **+ LocationManager zaxira** | Play Services yo'q telefonda ham ishlaydi |
| Xarita | **statik rasm / oddiy chizma** (v1) | Xarita SDK og'ir; navigatsiya tashqi ilovaga uzatiladi |
| Push | **FCM** (bor bo'lsa) + doimiy WebSocket (asosiy) | Ikki qatlam |
| Ovoz (ratsiya) | LiveKit Android SDK (v2, §10 F5) | Real vaqt PTT |

### 2.3 Repo'dagi joyi

Yangi papka: **`android-driver/`** (repo ildizida, pnpm workspace'dan TASHQARIDA).
Sabab: Gradle loyihasi Node ekotizimiga aralashmaydi, `pnpm -r typecheck` va CI qalqoni
o'zgarmaydi. Yig'ish alohida GitHub Actions ishida (§8).

---

## §3. EKRANLAR — «to'liq funksional»

Jami **9 ekran**. Haydovchi kun bo'yi 1-ekranda turadi, qolganlari kerak bo'lganda.

### 3.1 Asosiy ekran (kun bo'yi shu turadi)

```
┌────────────────────────────────┐
│ 🟢 LINIYADASIZ  ·  12:04 dan   │  holat + rang (yashil/kulrang/sariq)
│ 📍 hozirgina · 👥 7 haydovchi   │  joylashuv yoshi + liniyadagilar
├────────────────────────────────┤
│                                │
│    ┌──────────────────────┐    │
│    │   🔴 LINIYANI YOPISH  │    │  YAGONA katta tugma (≥96 dp)
│    └──────────────────────┘    │  holatga qarab o'zgaradi
│                                │
├────────────────────────────────┤
│ 📊 Bugun   7 safar · 84 000 so'm│  faqat 2 raqam
├────────────────────────────────┤
│ 💰 Balans 12 400 · Qarz 0      │  kas hisobidan (mavjud API)
├────────────────────────────────┤
│ [📻 RATSIYA — bosib gapiring]  │  v2 (F5)
└────────────────────────────────┘
```

### 3.2 Taklif ekrani (buyurtma kelganda — telefon qulflangan bo'lsa ham ochiladi)

```
┌────────────────────────────────┐
│        ⏱ 18                    │  katta taymer halqasi
│                                │
│  📍 SHABADA MAHALLASI          │  manzil — eng katta yozuv
│  📏 Sizdan 1.2 km · ~3 daq     │
│  💵 Taxminan 12 000 so'm       │
│  🏁 Borish: Bozor  (bo'lsa)    │
├────────────────────────────────┤
│  ┌──────────────────────────┐  │
│  │      ✅  Q A B U L        │  │  ekranning yarmi
│  └──────────────────────────┘  │
│  [ ❌ O'tkazib yuborish ]      │
└────────────────────────────────┘
```
Ovoz: signal (jimlik rejimida ham, `USAGE_ALARM`). Tebranish: uzun namuna. Ekran yonadi.

### 3.3 Qolgan ekranlar

| # | Ekran | Ichida nima |
|---|---|---|
| 3 | **Safar** | Manzil, mijoz ismi va raqami, 📞 tugma, 🗺 navigatsiya (Yandex/Google'ga uzatadi), katta holat tugmasi: Yetib keldim → Boshladim → Yakunlash |
| 4 | **Yakunlash** | Narx tugmalari (taxminiy narx atrofida yaxlit summalar) + qo'lda kiritish |
| 5 | **Safarlarim** | Kunlik ro'yxat, har biri: vaqt, manzil, summa. Hafta/oy filtri |
| 6 | **Daromad** | Bugun / hafta / oy: safar soni, summa, o'rtacha. Tanga balansi va qarz |
| 7 | **Ratsiya** (v2) | Kanal, kim gapiryapti, bosib gapirish tugmasi |
| 8 | **Sozlamalar** | Ovoz balandligi, bildirishnoma, **«Ilova fonda ishlashi uchun»** yordamchi (§4.3), til |
| 9 | **Kirish** | Telefon raqami → bot yuborgan 6 xonali kod → tayyor |

**Statistika** 6-ekranda: qabul foizi, bekor foizi, reyting. Haydovchi o'z natijasini ko'radi.

---

## §4. FON REJIMI — «10x» aynan shu yerda

Bu bo'lim ilovaning yuragi. Dispetcher-ilovalar aynan shu joyda yiqiladi.

### 4.1 Yetti qatlamli himoya

| # | Qatlam | Nima qiladi |
|---|---|---|
| 1 | **Foreground Service** (`foregroundServiceType="location"`) | Doimiy bildirishnoma: «🟢 Liniyadasiz». Tizim uni oxirgi bo'lib o'ldiradi |
| 2 | **START_STICKY** | Tizim o'ldirsa, o'zi qayta ishga tushadi |
| 3 | **WorkManager qorovul** (har 15 daq) | Servis tirikmi tekshiradi, o'lgan bo'lsa ko'taradi. Bu qatlam OEM o'ldirgichlariga qarshi asosiy qurol |
| 4 | **Boot Receiver** | Telefon o'chib-yongach, agar liniyada edi — servis qaytadi |
| 5 | **FCM yuqori-ustuvor push** | Doze rejimini ham teshadi (Play Services bor bo'lsa) |
| 6 | **Doimiy WebSocket** (heartbeat 25 s) | Asosiy kanal. Uzilsa — 1s, 2s, 4s… 30s gacha qayta ulanish |
| 7 | **So'nggi zaxira: polling** (30 s) | Soket ham, push ham ishlamasa — baribir buyurtma keladi |

### 4.2 Batareya — kelishuv emas, muhandislik

- **Adaptiv joylashuv**: harakatda (>5 km/soat) 10 s; turganda 60 s; liniyadan chiqqach **0**.
- Masofa filtri: 50 m dan kam siljishda yuborilmaydi.
- **Paketlash**: 3 ta nuqta yig'ilib bitta so'rovda ketadi (trafik ham, batareya ham tejaladi).
- Ekran yoniq bo'lganda soket, o'chganda soket + push (ikkalasi emas).
- Doze rejimida `setExactAndAllowWhileIdle` faqat **buyurtma bor** paytida.

### 4.3 OEM o'ldirgichlari — eng katta muammo, ochiq muomala

Xiaomi, Oppo, Vivo, Huawei, Tecno, Infinix telefonlari ilovalarni **agressiv o'ldiradi**.
Bu kodda hal bo'lmaydi, faqat sozlama bilan. Shuning uchun ilovaga **yordamchi** quriladi:

1. Birinchi ochilishda ilova telefon brendini aniqlaydi.
2. **Rasm bilan ko'rsatma**: «Xiaomi: Sozlamalar → Ilovalar → BirJoy → Avtoishga tushirish yoqilsin».
3. **To'g'ridan-to'g'ri tugma** — kerakli sozlama ekranini ochadi (`Intent` bilan, brendga qarab).
4. **Batareya optimizatsiyasidan ozod qilish** so'raladi (bir marta, tushuntirish bilan).
5. Sozlanmagan bo'lsa asosiy ekranda **sariq ogohlantirish**: «⚠️ Telefoningiz ilovani
   o'ldirishi mumkin — 1 daqiqada tuzating».
6. Server tomonda o'lchov: haydovchi liniyada, lekin 20 daqiqadan beri jim → dispetcherga signal.

⚠️ Bu qadam **majburiy**. Usiz eng yaxshi kod ham buyurtma o'tkazib yuboradi.

### 4.4 «0 ta o'tkazib yuborish» qanday isbotlanadi

Taklif yuborilganda server `DispatchOffer` yozadi. Ilova ko'rsatganda `seenAt` qaytaradi.
Admin panelda **«Yetkazilmagan takliflar»** hisoboti: kimga yuborildi, ko'rdimi, qancha vaqtda.
Bu raqam har kuni ko'rinadi, ya'ni da'vo emas — **o'lchov**.

---

## §5. ESKI ANDROID — aniq choralar

| Muammo | Chora |
|---|---|
| Eski ART sekin | XML layout, Compose yo'q, animatsiya faqat `translate/alpha` |
| Kam RAM (1 GB) | Bitta Activity, ro'yxatlar `RecyclerView`, rasm keshi yo'q |
| Eski WebView | **Umuman ishlatilmaydi** |
| Play Services yo'q/eski | `LocationManager` zaxira (§5.4), push o'rniga soket |
| TLS eski (Android 5–6) | OkHttp bilan zamonaviy TLS majburlanadi (`ConscryptProvider`) |
| Kichik ekran (720p) | O'lchamlar `dp`, matn `sp`, eng kichik matn 14sp |
| Sekin disk | Room'ga yozish fon oqimida, UI hech qachon kutmaydi |
| APK hajmi | R8 minify + resurs qisqartirish + `abiFilters` (armeabi-v7a, arm64) |

### 5.4 Play Services yo'q holat

Ko'p arzon telefonda Google xizmatlari eski yoki umuman yo'q. Bunda:
- Joylashuv: `LocationManager` (GPS + tarmoq provayderi) — to'g'ridan-to'g'ri Android API.
- Push: yo'q. O'rniga **WebSocket doimiy ochiq** + 30 s polling zaxira.
- Ilova buni **o'zi aniqlaydi** va sozlamalar ekranida holatni ko'rsatadi.

---

## §6. TEZLIK BYUDJETI — qabul mezoni

Barchasi **eng sekin sinov telefonida** o'lchanadi (§12.1), 5 marta o'rtacha:

| O'lcham | Chegara |
|---|---|
| Sovuq ochilish → tugma bosiladigan holat | ≤ 1.0 s |
| Issiq ochilish (fonda edi) | ≤ 300 ms |
| Har bosishda vizual javob | ≤ 100 ms (optimistik, server kutilmaydi) |
| Taklif serverdan → ekranda ko'rindi | ≤ 2.0 s |
| «Qabul» → server tasdiqladi (4G) | ≤ 1.0 s |
| Ekranlar orasida o'tish | ≤ 200 ms |
| APK hajmi | ≤ 6 MB |
| RAM (asosiy ekran) | ≤ 120 MB |
| Batareya (8 soat liniyada) | ≤ 25% |
| Kunlik mobil trafik | ≤ 5 MB |

---

## §7. SERVER SHARTNOMASI — APK yolg'iz ishlay olmaydi

⚠️ **Halol scoping:** APK — bu ekran. Uning orqasida server bo'lishi shart. Quyidagi
endpoint'larsiz ilova bo'sh qobiq. Shuning uchun **APK bilan birga** shu minimal server
qismi ham quriladi (`DISPATCH_PLAN.md` §1–§6 dan olinadi).

| Endpoint | Nima uchun | Holat |
|---|---|---|
| `POST /api/drv/auth/start` · `/auth/verify` | Telefon + bot kodi → qurilma tokeni | Yangi (mavjud `verifyCodeService` naqshi) |
| `GET /api/drv/state` | Liniya holati, joriy safar, kunlik raqamlar | Yangi |
| `POST /api/drv/online` · `/offline` | Liniyaga chiqish/chiqish | Yangi |
| `POST /api/drv/location` | Joylashuv (paketlangan) | Yangi |
| `WS /ws/drv` | Taklif, holat, ratsiya signali | Yangi |
| `POST /api/drv/offer/accept` · `/reject` | Taklifga javob (atomik) | Yangi |
| `POST /api/drv/ride/arrived` · `/started` · `/finished` | Safar holatlari | Yangi |
| `GET /api/drv/rides` · `/earnings` | Tarix va daromad | **Qisman bor** (`driverReportService`) |
| `GET /api/drv/account` | kas balans va qarz | **BOR** (`getDriverPanelExtras`) |
| `POST /api/drv/ptt/token` | Ratsiya tokeni | v2 (F5) |

**Auth eslatmasi:** bu YANGI qurilma-token yo'li. Mavjud Telegram `initData` yo'liga
tegilmaydi. Ikkalasi bir xil `memberId` ga olib keladi — pul mantiqi bitta bo'lib qoladi.

---

## §8. QURISH, IMZO, TARQATISH

- **Yig'ish:** GitHub Actions `apk.yml` — `android-driver/` o'zgarsa ishga tushadi, imzolangan
  APK'ni artefakt qiladi. Mavjud `ci.yml` qalqoniga **tegmaydi** (alohida ish).
- **Imzo kaliti:** bir marta yaratiladi, GitHub Secret'da saqlanadi. ⚠️ Kalit yo'qolsa
  yangilanish chiqarib bo'lmaydi — ega uni zaxirada saqlashi shart.
- **Tarqatish:** `app.birjoy.online/haydovchi.apk` (Caddy statik) + botda «📲 Ilovani o'rnatish».
  Play Store shart emas (sideload). Play Store kerak bo'lsa — alohida qadam, ~1 hafta kutish.
- **Avto-yangilanish:** ilova ochilganda `version.json` tekshiradi → yangi bo'lsa karta
  ko'rsatadi va APK'ni yuklab beradi. Majburiy yangilanish bayrog'i ham bor (jiddiy xato uchun).
- **Versiyalash:** `versionCode` — CI ish raqami, `versionName` — sana.

---

## §9. SINOV REJASI — laboratoriyada emas, mashinada

| # | Sinov | Qanday |
|---|---|---|
| 1 | **Tunda 8 soat** | Telefon liniyada, cho'ntakda, ekran o'chiq. Ertalab: nechta taklif kelgan, nechtasi ko'rilgan, batareya qancha |
| 2 | **O'ldirish sinovi** | Ilova fonda, «recent» dan surib tashlanadi → 15 daqiqada qayta ko'tarilishi shart |
| 3 | **Qayta yuklash** | Telefon o'chirilib yoqiladi → liniya holati qaytishi shart |
| 4 | **Tunnel sinovi** | Aviarejim 2 daqiqa → amal navbatda turadi, tarmoq qaytganda yuboriladi |
| 5 | **Eski telefon** | Eng sekin telefonda §6 byudjeti o'lchanadi |
| 6 | **OEM sinovi** | Xiaomi va Tecno telefonlarida avtoishga tushirish yordamchisi ishlashi |
| 7 | **Jonli smena** | Ega yoki ishonchli haydovchi 1 kun real ishlaydi, har muammo yoziladi |

Har sinov natijasi **raqam bilan** `PROGRESS.md` ga yoziladi. Sinovsiz «tayyor» yo'q.

---

## §10. BOSQICHLAR

| # | Bosqich | Natija | Hajm |
|---|---|---|---|
| **A1** | Loyiha, kirish, asosiy ekran, liniya on/off, joylashuv yuborish | Haydovchi liniyaga chiqa oladi, dispetcher uni xaritada ko'radi | 4–5 kun |
| **A2** | Fon rejimi to'liq (§4 ning 7 qatlami) + OEM yordamchisi | Tunda 8 soat sinovi o'tadi | 4–5 kun |
| **A3** | Taklif + safar oqimi + yakunlash | To'liq safar ilovadan boshdan-oxir | 3–4 kun |
| **A4** | Safarlarim, daromad, balans, sozlamalar, statistika | «To'liq funksional» | 3 kun |
| **A5** | Sayqal: tezlik byudjeti, eski telefon optimizatsiyasi, sinovlar | §6 va §9 raqamlari isbotlangan | 3 kun |
| **A6** | Chiqarish: imzo, CI, tarqatish, avto-yangilanish | Haydovchilar o'rnata boshlaydi | 2 kun |
| **F5** | Ratsiya (PTT) | Bosib gapirish | 3–4 kun |

**Jami taxminan 3–4 hafta** A1–A6 uchun. Server qismi (§7) A1 va A3 bilan parallel quriladi.

⚠️ Bu native ilova — Capacitor'dan sekinroq, lekin ega talab qilgan sifat aynan shundan keladi.

---

## §11. XAVFLAR

| Xavf | Ta'sir | Chora |
|---|---|---|
| OEM o'ldirgichi sozlanmagan | Buyurtma o'tkazib yuboriladi | §4.3 yordamchi + server signali + haydovchini o'qitish |
| Haydovchi APK o'rnatishdan qo'rqadi | Foydalanuvchi yo'q | Bot yo'li **abadiy qoladi** — APK majburiy emas |
| Imzo kaliti yo'qoladi | Yangilanish chiqmaydi | Ega zaxirada saqlaydi, GitHub Secret + offline nusxa |
| Play Store rad etadi | Rasmiy do'kon yo'q | Sideload asosiy yo'l, do'kon ixtiyoriy |
| Android SDK CI'da og'ir | Yig'ish sekin | Alohida workflow, `ci.yml` ga tegmaydi |
| Native ilova = ikkinchi kodbaza | Qo'llab-quvvatlash yuki | Server API bitta, biznes mantiq **faqat serverda** |
| Eski telefon topilmasa | Byudjet o'lchanmaydi | §12: ega sinov telefonlarini beradi |

---

## §12. EGADAN KERAK BO'LGAN NARSALAR

### 12.1 Zudlik bilan (busiz ish boshlanmaydi)

1. **2 ta sinov telefoni**: bittasi eng eski/sekin (haydovchilarda ko'p uchraydigan model),
   bittasi Xiaomi yoki Tecno (OEM o'ldirgichini sinash uchun).
2. **Haydovchilar telefonlari haqida ma'lumot**: qaysi brendlar ko'p, Android versiyalari.
   Taxminiy bo'lsa ham bo'ladi — §1 shunga moslanadi.
3. **kas1067 haydovchi APK dekompilyatsiyasi** (`client-apk-decomp/`) — bu checkout'da YO'Q.
   Bo'lsa: ularning ekranlari va API'sini aynan bilib, «10x» ni aniq nuqtalarda qilamiz.

### 12.2 Chiqarishdan oldin

4. **Imzo kaliti** yaratiladi va ega zaxirasida saqlanadi.
5. **Ilova nomi va belgisi** (ikonka) — «BirJoy Haydovchi» bo'ladimi?
6. **Sinov haydovchisi** — 1 kun real ishlaydigan ishonchli odam.

### 12.3 Qaror kutilayotgan savollar

7. **APK kas bilan ishlaydimi yoki faqat o'z tizim bilan?**
   - (a) Faqat o'z dispetcherlik (`DISPATCH_PLAN.md`) — toza, lekin liniyada haydovchi kam
     bo'lsa buyurtma kam.
   - (b) O'z tizim + kas buyurtmalari bitta ilovada — haydovchi uchun qulay, lekin kas API'ga
     bog'liqlik saqlanadi.
   - _Tavsiyam: (a) dan boshlash, (b) keyin qo'shilishi mumkin._
8. **iOS kerakmi?** v1 faqat Android. iPhone'li haydovchi bo'lsa — bot yo'li bilan ishlaydi.

---

## §13. ⚠️ MAVJUD ILOVA TOPILDI — reja qayta baholandi (2026-09-07)

`SarvarkhonH/1067-taxi` repo sessiyaga ulandi. **Native Kotlin haydovchi ilovasi allaqachon
mavjud**: `apps/driver-android`, versiya **1.3.0** (versionCode 5), 26 ta Kotlin fayli.
Ya'ni §2 dagi «native Kotlin» qarori to'g'ri chiqdi va **noldan yozish SHART EMAS**.

### 13.1 Nima allaqachon bor (isbot bilan)

| Element | Fayl | Holat |
|---|---|---|
| Foreground service, `foregroundServiceType="location"` | `service/LocationForegroundService.kt` + manifest | ✅ bor |
| `WAKE_LOCK` (soket ekran qulflanganda o'lmasin) | manifest, izohda «eski versiyada buyurtma o'tkazib yuborishning #1 sababi» | ✅ bor |
| WebSocket (Socket.IO) | `service/SocketManager.kt` | ✅ bor |
| FCM push | `service/TaxiFirebaseMessagingService.kt` | ✅ bor |
| Taklif ovozi | `service/OfferSoundService.kt` | ✅ bor |
| Navigatsiyaga uzatish | `util/NavigationLauncher.kt` | ✅ bor |
| Ekranlar: kirish, bosh (xarita, chat, safar yakuni), daromad, profil, ballar | `ui/**` (Compose) | ✅ bor |
| Retrofit API klienti | `data/remote/api/ApiService.kt` | ✅ bor |
| Hilt DI | `di/AppModule.kt` | ✅ bor |

Server tomoni ham katta: **40 kontroller, 228 endpoint, 70 jadval** (Drizzle, `packages/db`).
Uch raqam ham buyruq bilan sanaldi.

### 13.2 Ega talablariga qarshi GAP jadvali (o'lchangan)

| Ega talabi | Hozirgi holat | Gap |
|---|---|---|
| «Eski androidlarda kuchli ishlaydigan» | `minSdk = 26` → **Android 8.0+** | ❌ Android 5, 6, 7 UMUMAN qamralmagan |
| «Fon rejimida 10x yaxshiroq» | Foreground service + WAKE_LOCK bor | 🟡 Yetti qatlamdan **uchtasi yo'q**: `BootReceiver` klassi (ruxsat bor, qabul qiluvchi YO'Q), WorkManager qorovul, OEM avtoishga tushirish yordamchisi |
| Uzilishda amal yo'qolmasin | Room yo'q, navbat yo'q | ❌ tarmoq uzilsa amal yo'qoladi |
| «Qulay, tez» · APK ≤ 6 MB | Compose + Google Maps + Play Services | ❌ taxminan 15–25 MB |
| Play Services yo'q telefonlar | Maps, FusedLocation, FCM — uchalasi ham Play Services talab qiladi | ❌ ishlamaydi |
| Chiqarishga tayyorlik | `signingConfig = debug`, izohda `TODO: production signing` | ❌ imzolanmagan |
| Server manzili | `one067-taxi-api.onrender.com` | ❌ Render 2026-07-25 da tashlangan (Contabo cutover) |

### 13.3 Yangi baho — 3–4 hafta emas, **taxminan 1 hafta**

Noldan yozish o'rniga mavjud ilovani tuzatish:

| # | Ish | Hajm |
|---|---|---|
| B1 | `minSdk` 26 → 21, eski Androidda sinash va tuzatish | 1–2 kun |
| B2 | Fon rejimini to'ldirish: `BootReceiver` klassi, WorkManager qorovul, OEM yordamchisi | 2 kun |
| B3 | Room bilan offline navbat (amal yo'qolmasin) | 1 kun |
| B4 | Play Services yo'q holat: `LocationManager` zaxira, xaritani yengil variantga almashtirish | 1–2 kun |
| B5 | Hajm va tezlik: R8, resurs qisqartirish, §6 byudjetini o'lchash | 1 kun |
| B6 | Chiqarish: haqiqiy imzo, CI, server manzili, avto-yangilanish | 1 kun |

⚠️ **Avval qaror kerak:** ilova qaysi serverga ulanadi? `1067-taxi` API'siga (228 endpoint,
lekin Render'da o'lgan) yoki BirJoy serveriga (`DISPATCH_PLAN.md` §7 shartnomasi)? Bu ikki
tizimni birlashtirish savoli va u §12.3 dagi ochiq savol bilan bir xil.

### 13.4 Boshqa sessiya topgan kamchilik tasdiqlandi

`createBooking` uchun REST endpoint yo'q — kod `orders.service.ts` da bor, lekin uni faqat
`telegram.service.ts` chaqiradi. Ya'ni buyurtma faqat o'sha bot ichidan yaratiladi. Bizning
botimiz uchun marshrut ochish kerak.

### 13.5 ⚠️ ZAXIRA OGOHLANTIRISHI

GitHub'dagi `1067-taxi` ning oxirgi commit'i — **2026-05-01** (`7d130ec`). Boshqa sessiya
«8 ta commit» haqida yozgan edi. Agar o'sha commitlar sizning kompyuteringizda bo'lib,
push qilinmagan bo'lsa — ular **faqat o'sha kompyuterda**. Kompyuter buzilsa yo'qoladi.
**Birinchi ish: `git push` qiling.**
