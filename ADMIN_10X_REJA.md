# ADMIN 10X + RATSIYA + SMS + JONLI KUZATUV — REJA

Bu hujjat `ADMIN_QOSHIMCHALAR.md` ni **almashtirmaydi** — undagi g'oyalarga **texnik qanday**
javobini beradi va o'zgargan shartlarni qayd etadi.

---

# 0. IKKI O'ZGARGAN SHART — rejani qayta hisoblaydi

### 0.1 ⭐ Play Store'dan voz kechildi → SMS to'sig'i YO'Q
`ADMIN_QOSHIMCHALAR.md §3` da avto-SMS'ning **eng katta to'sig'i** shunday yozilgan edi:

> «**Ruxsat.** `SEND_SMS` — Play Store'da qat'iy cheklangan ruxsat. Sideload APK'da ishlaydi,
> lekin Play Store'ga chiqish yo'lini yopadi.»

Siz Play Store'ni **rad etdingiz** (APK to'g'ridan-to'g'ri tarqatiladi). Demak bu to'siq
**butunlay yo'qoladi**. Qolgan ikki shart (pul, qonun) — hal qilinadigan.
**Xulosa: haydovchi SIM'idan xizmat-SMS endi to'liq mumkin.**

### 0.2 ⭐ Jonli xarita allaqachon qurilgan — u shunchaki bo'sh edi
Tekshirdim: `apps/web/src/components/map/LiveMap.tsx` (256 qator) **mavjud va ishlaydi**:
- **Leaflet + OpenStreetMap** ishlatadi → **Google kaliti ham, billing ham kerak emas** (tekin)
- Dashboard bosh sahifasida render qilinadi (`app/dashboard/page.tsx:174`)
- Socket orqali jonli yangilanadi (`useSocket.ts:110-116` — `admin:join` + `driver:location`)
- Backend feed tayyor: `location.service.ts:210 getOnlineDriverDetails()` — haydovchi + mashina +
  reyting + faol buyurtma birga

**Nega bo'sh edi:** haydovchilar GPS oqizmayotgan edi (P0-9 — bugun tuzatildi: token 15 daqiqada
o'lardi + servis fondan ishga tushib lokatsiya bloklanardi). **Endi to'lishi kerak.**

👉 Ya'ni «haydovchi qayerdaligini jonli ko'rish» — **yangi qurish emas, tekshirish** masalasi.

---

# 1. RATSIYA (PTT) — arxitektura qarori

## 1.1 Qaror: **klip asosidagi PTT**, WebRTC EMAS

| | WebRTC / LiveKit | **Klip PTT (tavsiya)** |
|---|---|---|
| Kechikish | ~200 ms | ~1-2 s |
| Infratuzilma | SFU + TURN server, doimiy oqim | **Yo'q** — mavjud socket + fayl saqlash |
| Yomon 3G'da | uziladi, sifat tushadi | 3 soniyalik klip ≈ **6 KB**, qayta yuboriladi |
| Arzon telefon | CPU yeydi, batareya | deyarli tekin |
| **Saqlanadimi?** | yo'q (oqim) | ✅ **har gap saqlanadi** |

**Nega klip yutadi:** ratsiya tabiatan **yarim dupleks** — bosasan, gapirasan, qo'yib yuborasan.
1-2 soniya kechikish operator uchun sezilmaydi. Buning evaziga: server yo'q, Koson tarmog'ida
ishlaydi, arzon telefonda ishlaydi, **va har gap yozib qolinadi** — bu «sinchkovlik» uchun
oltin (nizoda "kim nima degan edi" isbotlanadi).

## 1.2 Oqim
```
Operator 📻 bosadi → gapiradi → qo'yib yuboradi
   → Opus klip (1-10 s) HTTP bilan yuklanadi
   → server saqlaydi + socket bilan yuboradi (bitta haydovchiga yoki hammaga)
   → haydovchi ilovasida AVTOMATIK yangraydi (ekran o'chiq bo'lsa ham — FCM uyg'otadi)
   → haydovchi 📻 bosib javob qaytaradi
```

## 1.3 Kanallar
- **1:1** — operator ↔ bitta haydovchi (manzil so'rash uchun asosiysi)
- **Umumiy** — hamma onlayn haydovchiga ("Bozor tomonda buyurtma ko'p")
- **Mahalla** — bitta mahalla haydovchilariga

## 1.4 Nima kerak
| Qism | Holat |
|---|---|
| Socket kanali | ✅ bor (`socket.gateway.ts`, xona tizimi tayyor) |
| Fayl saqlash | ⚠️ yangi (VPS'da disk yetadi — 3s klip 6 KB) |
| Ilovada yozish/ijro | ⚠️ yangi (Android `MediaRecorder`, ruxsat: `RECORD_AUDIO`) |
| Ekran o'chiqda uyg'otish | ⚠️ **FCM kerak** (Firebase — sizdan) |
| Admin panelda 📻 tugma | ⚠️ yangi |

**Narx:** M (7-10 kun) · **Bog'liqlik:** FCM (ekran o'chiq holat uchun)

---

# 2. RATSIYA → MANZIL BELGILASH — tizimning yetishmayotgan bo'g'ini

Sizning `§1.1` dagi tahlilingiz **to'g'ri va eng qimmatli fikr**: buyurtmada manzil yo'q →
**tizim band mashina qachon/qayerda bo'shashini bilmaydi** → 16.5 mashinada bu halokatli.

## 2.1 Texnik jihatdan bu nima ochadi
1. **Zanjirli buyurtma** (30-funksiyadagi #10) — bo'shashdan oldin keyingisi biriktiriladi
2. **Xarita rost bo'ladi** — nuqta emas, **yo'nalish chizig'i**
3. **O-D matritsa** — Koson harakatining haqiqiy modeli. ⚠️ **Buni orqaga qaytarib to'plab
   bo'lmaydi** — bugun boshlamasak, yo'qotamiz

## 2.2 Ma'lumot modeli (minimal)
`orders` ga: `destAddressId` (katalog FK, nullable) · `destSetBy` (`operator|driver`) ·
`destSetAt` · `destSource` (`radio|app|catalog`) · `destRaw` (erkin matn, katalogga tushmagani)

⚠️ **Sizning qoidangiz saqlanadi:** taxminiy moslashtirish **taqiq**. Faqat aniq moslik yoki
ega tasdiqlagan alias. Erkin matn alohida belgilanadi va haftalik ko'rikda katalogga qo'shiladi
(30-funksiyadagi **#5 — topilmagan qidiruvlar jurnali** aynan shu).

**Narx:** S (model) + M (UI) · **Bog'liqlik:** #1 KOSON TILI (avtoto'ldirish uchun)

---

# 3. SMS — ikki alohida relsa

Play Store to'sig'i yo'qolgani uchun sizning `§3` tavsiyangiz **to'liq amalga oshadi**:

## 3.1 Xizmat-SMS — haydovchi SIM'idan

### ⭐ EGA QARORI (2026-09-10): rozilik — **ishga olish sharti**
> «haydovchi shaxsiy smsdan ketishga rozi bo'lsa uni haydovchi qilib ishga olamiz»

Bu **rozilik muammosini butunlay yechadi** — opt-in emas, shartnoma sharti. Ilovada baribir
**hisoblagich** ko'rinadi ("bu oy: 47 SMS") — kutilmagan xarajat bo'lmasligi uchun.

- **Faqat:** "Haydovchi yetib keldi · Nexia 70A123BB · 1067"
- **Bitta SMS**, reklama **yo'q**
- ⚠️ **Avval o'lchash:** 5 pilot haydovchidan **tarifida SMS paketi bormi**. Agar paket bo'lmasa
  kuniga 300-800 so'm chiqadi — **tavsiyam: buni komissiya chegirmasi bilan qoplang**
  (30-funksiyadagi #12). Shunda xarajat **rag'batga aylanadi**, norozilikka emas.

### ⚠️ JIDDIY XAVF — bu qarorni qabul qilishdan oldin o'ylang
Haydovchi SIM'idan SMS yuborilsa, **mijoz haydovchining shaxsiy raqamini oladi**.
Kichik shaharda oqibati aniq: keyingi safar mijoz **1067 ga emas, to'g'ridan-to'g'ri
haydovchiga** qo'ng'iroq qiladi.

Bu — jahon tadqiqotidagi **«off-app leakage»**. Bolt buni yopganda buyurtma **+42%** oshgan
(ya'ni oqma shu darajada katta edi). Va bizda **kichik shahar** — bu yerda oqma dunyodagidan
**kuchliroq**, chunki odamlar baribir bir-birini taniydi.

**Ya'ni:** organik kanal quramiz deb, **o'z kanalimizni buzishimiz mumkin**.

**Uch variant:**
| Variant | Organik kuch | Oqma xavfi | Narx |
|---|---|---|---|
| A. Haydovchi SIM'idan | kuchli | **yuqori** | haydovchi to'laydi |
| B. Server gateway, sender = **1067** | o'rtacha | **yo'q** | ~50-100 so'm/SMS |
| C. Aralash: xizmat-SMS gateway'dan (1067), **marketing** haydovchi SIM'idan | kuchli | past | aralash |

👉 **Tavsiyam: B yoki C.** Mijoz "1067" dan SMS olsa — brend mustahkamlanadi va raqam
sizniki bo'lib qoladi. Haydovchi raqami ko'rinsa — mijoz asta-sekin sizdan chiqib ketadi.
⚠️ Bu **sizning biznes qaroringiz** — men faqat xavfni ko'rsatyapman.

### Qonun — bitta aniqlik
Haydovchining roziligi **mijozning roziligi emas**. Xizmat-SMS ("mashina keldi") — axborot,
muammosiz. Reklama qismi uchun **mijozdan** rozilik kerak, haydovchidan emas.

## 3.2 Marketing / bildirishnoma — server gateway (Eskiz)
- Rozilik + **opt-out ro'yxati** majburiy
- Ilovasi yo'q mijozga **kuzatuv havolasi** (30-funksiyadagi #19) aynan shu relsdan

## 3.3 Admin tomonida
SMS jurnali · opt-out ro'yxati · haydovchi bo'yicha SMS hisobi · xarajat hisoboti
(sizning §4 ikkinchi to'lqin, #11)

**Narx:** S (ilova tomoni) + M (gateway + jurnal)

---

# 4. SINCHKOVLIK — nazorat qatlami

## 4.1 Nazorat signallari (sizning §4 #2) — 5 holat
| Signal | Shart | Reaksiya |
|---|---|---|
| Buyurtma osilib qoldi | `dispatching` > 90 s | qizil chiziq + ovoz |
| Haydovchi bormayapti | qabul qildi, 3 daq GPS qimirlamadi | qizil |
| Kutish cho'zildi | `driver_arrived` > 8 daq | sariq |
| Safar cho'zildi | `in_progress` > kutilgan × 2 | sariq |
| Haydovchi yo'qoldi | safar ichida GPS 2 daq yo'q | qizil |

## 4.2 Firibgarlik signallari
- **Mock-GPS** (30-funksiyadagi #21) — ⚠️ **pul-rag'batdan OLDIN majburiy**
- Imkonsiz tezlik (2 fix orasida 150 km/soat)
- Bir xil haydovchi↔mijoz juftligi takrorlanishi (o'zaro kelishuv)
- Safar ichida GPS uzilishlari
- Bekor qilish naqshi (qabul → 30 s → bekor)

## 4.3 KPI paneli — hozir **hech biri o'lchanmaydi**
tayinlash vaqti (median/p95) · yetib kelish vaqti · **rad tarkibi: bosilgan rad vs jim taymer**
· bekor foizi (kim bo'yicha) · mashina/soat · buyurtma/mashina

⚠️ **Eng muhimi — «bosilgan rad vs jim taymer» ajratimi.** Jahon tadqiqoti radning 56.5% i
haydovchi radi ekanini ko'rsatdi, lekin **qanchasi ataylab, qanchasi ilova ko'rmagani** noma'lum.
Bu farq butun ustuvorlikni o'zgartiradi. **7 kunlik ma'lumot yetarli.**

## 4.4 Haydovchi 360 kartasi
tarix · reyting · balans/qarz · **GPS izi** · shikoyatlar · qabul/rad statistikasi · hujjat muddati
· ratsiya yozuvlari

## 4.5 Audit izi — ✅ bugun boshlandi
Kim bekor qildi · kim haydovchini tasdiqladi/blokladi — endi yoziladi. Qolgani: narx
o'zgarishi, sozlama o'zgarishi, admin yaratish.

---

# 5. ADMIN 10X — yo'l xaritasi

## 5.1 ✅ Bugun bajarilgani (auditdan keyin)
8 o'lik sahifa tiriltirildi · operator "tayinlash"/"bekor" tugmalari (404 edi) · taxta ochilganda
yuklanadi · 15-daqiqalik qayta login yo'qoldi · rol tekshiruvi yoqildi · audit jurnali yozila
boshladi · TypeScript darvozasi yoqildi · 2 xavfsizlik teshigi yopildi

## 5.2 To'lqin 1 — Dispetcher konsoli (sizning §4 birinchi to'lqin)
Uch panel: **navbat | xarita | tanlangan** · o'ng panelda **ratsiya orqali manzil belgilash** ·
pastda **ratsiya paneli** · chapda **nazorat signallari** · **zanjir taklifi**

## 5.3 To'lqin 2 — Ko'rish va nazorat
Haydovchi 360 · **O-D yo'nalish xaritasi** (to'plangan manzillardan) · KPI paneli ·
firibgarlik signallari · SMS jurnali + opt-out

## 5.4 To'lqin 3 — Kengaytirish
Smena rejalashtirish *(JAMOA moduli — 9 model tayyor, o'chirilgan)* · haydovchi jalb quvuri
*(obzvon CRM A'da jonli)* · korporativ kabinet · devor tablosi

## 5.5 ⚠️ Avval tuzatilishi shart (funksiya emas, buzuqlik)
`GET /drivers/heatmap` **soyada** → ilovada heatmap hech qachon ishlamaydi ·
`GET /drivers/:id/orders` **yo'q** → admin panelda haydovchi safarlari bo'sh ·
`incentives`(7)/`queue`(2)/`fleet`(6) endpoint — **0 chaqiruvchi** ·
`POST /intercity/orders` **himoyasiz**

---

# 6. SIZNING OCHIQ SAVOLLARINGIZGA JAVOB (§5)

**1. Qaysi panel — BirJoy admin v2 mi, 1067-taxi admini mi?**
👉 **Tavsiyam: 1067-taxi admini** (siz v2 ni afzal ko'rgan edingiz — men buni o'zgartirishni
taklif qilaman, sababi bilan):
- Dispetcher konsoli **jonli socket, xarita, ratsiya** talab qiladi — bularning **hammasi B'da**
  (`socket.gateway`, `LiveMap`, `location.service`)
- BirJoy admin v2 A'da, va A **dispatch ma'lumotini ko'rmaydi** — har nuqta uchun ko'prik kerak
- Operator **boshqa odam** (siz emas) va **boshqa ish** qiladi — alohida panel to'g'ri
- ⚠️ Lekin bu **sizning qaroringiz** — v2 ni tanlasangiz, ko'prik rejasini yozaman

**2. Manzilni haydovchi ilovasi ham so'rasinmi?**
👉 **Ha, lekin keyin.** Avval operator (ratsiya) — chunki bugun **89.4% buyurtma telefonda** va
operator baribir gaplashyapti. Haydovchi ilovasidagi variant — ikkinchi bosqich, va u
**ixtiyoriy** bo'lishi kerak (majburiy qilsak, haydovchi yolg'on kiritadi).

---

# 7. NIMA SIZDAN KERAK

| # | Nima | Nimaga to'sqinlik qilyapti |
|---|------|---------------------------|
| 1 | **Firebase** | Ratsiya (ekran o'chiqda uyg'otish) · push · uyg'otish kampaniyasi |
| 2 | **5 pilot haydovchi: tarifda SMS paketi bormi?** | Butun SMS g'oyasining iqtisodi |
| 3 | **Eskiz (yoki boshqa SMS gateway) hisobi** | Marketing SMS + kuzatuv havolasi |
| 4 | **Panel qarori** (§6.1) | Dispetcher konsoli qayerda quriladi |
| 5 | **Ratsiya yozuvlari saqlanadimi va qancha?** | Huquqiy + disk (tavsiyam: 30 kun) |
