# 🔬 RESEARCH — dunyodagi eng kuchli taksi ilovalari nima qiladi (BirJoy uchun)

> Ega: «research qil, bular juda kam». Shu sabab dunyoning yetakchi taksi tizimlarini
> (Yandex Pro, Uber, Bolt, inDrive, DiDi) va professional fleet/dispetcher platformalarini
> (Yelowsoft, TaxiCaller, Navixy, Samsara, SHIELD) o'rgandim. Quyida har xususiyat:
> **nima qiladi · bizda bormi · muhimligi (Koson uchun) · manba**.
>
> Muhimlik: 🔴 majburiy (raqamga bevosita ta'sir) · 🟡 kuchli · 🟢 keyin.
> «Bizda» = BirJoy (`1067-taxi-bot`) yoki `1067-taxi` da mavjudmi.
> Faqat research — kod yo'q. Yakuniy tanlash egaники (§7).

---

## §1. HAYDOVCHI ILOVASI — yetakchilar nima beradi

| # | Xususiyat | Nima qiladi | Bizda | Muhim |
|---|---|---|---|---|
| 1 | **Talab issiqlik xaritasi** (heatmap) | Qayerda va qachon buyurtma ko'p — haydovchi o'sha yerga boradi. Yandex «binafsha zona», Uber «Rides Heatmap» | `1067-taxi`: `drivers/heatmap` endpoint BOR | 🔴 |
| 2 | **Manzilni oldindan ko'rish** | Haydovchi buyurtmani qabul qilishdan OLDIN qayerga borishni ko'radi (inDrive modeli) | Yo'q | 🔴 |
| 3 | **Fastest-finger dispatch** | Bitta buyurtma bir nechta yaqin haydovchiga, birinchi bosgan oladi (inDrive → Bolt 2025) | ✅ DISPATCH_PLAN.md yadrosi aynan shu | 🔴 |
| 4 | **Zanjirli buyurtma** (chain/queue) | Joriy safar tugamasdan keyingisini olish, bo'sh vaqt yo'q | Yo'q (§14.5 rejaga qo'shildi) | 🔴 |
| 5 | **Destination mode** | Haydovchi «uyga ketyapman» deydi → shu yo'nalishdagi buyurtma beriladi (Uber) | Yo'q | 🟡 |
| 6 | **Daromad tafsiloti** | Har safar, kunlik, haftalik, chойгул alohida; tips ko'rinadi (Uber) | `1067-taxi`: `drivers/earnings` BOR | 🟡 |
| 7 | **Integratsiyalangan navigatsiya** | Buyurtmadan avtomatik marshrut, qo'shimcha ilova shart emas (Yandex) | `1067-taxi`: `NavigationLauncher.kt` (tashqi ilovaga uzatadi) | 🟡 |
| 8 | **Reyting/qabul-foizi ko'rsatkichi** | Haydovchi o'z qabul %, bekor %, reytingini ko'radi (Uber Pro) | Qisman | 🟡 |
| 9 | **Kvest/streak rag'bat** | «10 safar qil → bonus», ketma-ket kunlar (Uber Quests) | BirJoy: tanga/missiya tizimi BOR — haydovchiga ulanadi | 🟡 |
| 10 | **Offline daromad** | Ilova yopiq bo'lsa ham qo'shimcha ish (Uber digital tasks) | — | 🟢 |

**Sintez:** #1, #2, #3, #4 — «21.5% haydovchisiz» va «10.6% ilova» muammosiga TO'G'RIDAN-TO'G'RI
ta'sir qiladi. #3 bizda tayyor, #1 endpoint bor, #2 va #4 kichik qo'shimcha.

---

## §2. DISPETCHER / ADMIN PANEL — professional platformalar nima beradi

| # | Xususiyat | Nima qiladi | Bizda | Muhim |
|---|---|---|---|---|
| 1 | **Jonli fleet xaritasi** | Har mashina real vaqtda, holat rangi bilan; eng yaqinni tayinlash | BirJoy: `livemap` · `1067-taxi`: `operator` sahifasi | 🔴 |
| 2 | **Ikki rejim: avto + qo'lda** | Ko'p buyurtma avto, murakkabi operator qo'lda tayinlaydi | Reja (DISPATCH_PLAN §9) | 🔴 |
| 3 | **Qo'lda tayinlash/qayta-tayinlash** | Operator buyurtmani aniq haydovchiga, ustuvorlik bilan | Reja | 🔴 |
| 4 | **Bitta navbat, ko'p kanal** | Ilova, telefon, WhatsApp, korporativ — bitta ro'yxatda | BirJoy: bot + miniapp; qo'ng'iroq (obzvon) BOR | 🟡 |
| 5 | **Zona boshqaruvi** | Zona chizish, zonaga narx/haydovchi-maqsad, aeroport navbati, zona-heatmap | `1067-taxi`: `geofence` (service_areas) BOR | 🟡 |
| 6 | **Qo'ng'iroq markazi (call center)** | Telefon qilgan mijozga operator buyurtma yaratadi | BirJoy: obzvon + operatorAssist · reja: operator buyurtmasi | 🟡 |
| 7 | **Haydovchi kartasi (360°)** | Bitta odam: safar, daromad, qarz, reyting, qabul%, joylashuv, telefon modeli, shikoyat | `1067-taxi`: `drivers/[id]` sahifasi BOR | 🔴 |
| 8 | **Devor tablosi (wallboard)** | Ofis devoriga: xarita + navbat + ogohlantirish, katta shrift | Yo'q | 🟢 |
| 9 | **Real-vaqt hisobot/KPI** | Buyurtma, haydovchi natijasi, masofa, daromad — jonli | BirJoy: puls · `1067-taxi`: analytics/reports BOR | 🟡 |

**Sintez:** ikkala repo qo'shilsa panel sirti allaqachon katta. Yetishmaydigani — **operator ish
oqimi** (qo'lda tayinlash, buyurtma yaratish) va **nazorat signallari** (§4).

---

## §3. FIRIBGARLIKKA QARSHI — «chuqur nazorat» ning ASL ma'nosi

> Bu eng muhim va bizda eng kam qism. «Chuqur nazorat» = haydovchini kuzatish emas,
> **soxta safar va aldovni to'sish**. Yetakchilar bunga million dollar sarflaydi.

| # | Xavf | Nima qiladi | Chora (research'dan) | Muhim |
|---|---|---|---|---|
| 1 | **GPS soxtalashtirish** (fake GPS) | Haydovchi qimirlamay «safar qildim» deb pul/bonus oladi. AQShda $40 mln sxema | `isMockLocation` bayrog'ini tekshirish, balandlik profili, «sakrash» aniqlash | 🔴 |
| 2 | **Soxta safar** | Haqiqiy mijozsiz safar yopiladi (bonus fermasi) | Mijoz tomon tasdig'i, real masofa/vaqt, marshrut mantiqiyligi | 🔴 |
| 3 | **Bir qurilma, ko'p akkaunt** | Emulyator/bitta telefonda ko'p haydovchi/mijoz | Qurilma-akkaunt bog'lanishi, emulyator aniqlash | 🟡 |
| 4 | **Bekor fermasi** | Ataylab qabul→bekor bilan ko'rsatkich to'ldirish | Bekor %-cap (BirJoy'da mijoz uchun BOR) | 🟡 |
| 5 | **Referal/bonus fermasi** | Soxta taklif bilan tanga o'g'irlash | BirJoy: sybil-qo'riq, telefon de-dup BOR | 🟡 |

**Sintez:** BirJoy pul tomonida kuchli (idempotent, ≤350 clamp, sybil-qo'riq), lekin
**GPS-soxta va soxta-safar** qo'riqlari YO'Q — o'z dispetcherlik boshlansa bu birinchi
navbatda kerak, chunki haydovchi endi narxni o'zi tasdiqlaydi (§DISPATCH_PLAN, taksometr yo'q).

---

## §4. NAZORAT SIGNALLARI — operator ko'rmay qolmasin

Research'dagi driver-behavior monitoring (Navixy, Samsara) BizJoy kontekstiga moslashtirildi
(bizda dashcam/OBD qurilma yo'q — faqat telefon):

| Signal | Nima aniqlaydi |
|---|---|
| Haydovchi liniyada, 20 daq joylashuv yo'q | Ilova o'lgan / telefon o'chgan / internet yo'q — ajratib ko'rsat |
| Buyurtma 2 daq haydovchisiz | Ta'minot yetishmaydi — operatorga signal |
| Qabul qildi, 10 daq «yetib keldim» yo'q | Haydovchi unutdi / muammo |
| Safar 90 daq oshdi | Yakunlash unutilgan yoki muammo |
| Tez-tez bekor qiladigan haydovchi | Xatti-harakat muammosi — kartaga bayroq |
| Narx taxmindan keskin farq | Haydovchi oshirib yozdi? — tekshirish |
| Tezlik chegarasidan oshish (telefon GPS'dan) | Xavfsizlik — yumshoq ogohlantirish (v2) |

---

## §5. XAVFSIZLIK — research qonuniy chegarani aniq ko'rsatdi

Uber/sanoat amaliyoti (manba §6): audio/video yozib olish **rozilik bilan**; ba'zi joyda qonun
mijoz roziligini MAJBURIY qiladi; maxfiylik va saqlash bo'yicha qonuniy masalalar bor.

| Xususiyat | Sanoat qanday qiladi | BirJoy uchun tavsiya |
|---|---|---|
| SOS tugma | Favqulodda → jonli joylashuv + ovoz/video, javob jamoasi | ✅ `1067-taxi` da `safety/sos/driver` BOR — kengaytirilsin |
| Safarni ulashish | Yaqinlarga jonli marshrut | ✅ BirJoy'da TrackView BOR |
| Audio yozib olish | Faqat **rozilik bilan**, ikkala tomon xabardor | §14.3 tavsiyam bilan bir xil: shaffof yoki faqat SOS |
| Haydovchi shaxsini tasdiqlash | Mijoz safardan oldin ism/rasm/raqam ko'radi | ✅ haydovchi rasmi BirJoy'da BOR |

**Sintez:** research mening §14.3 dagi maslahatimni tasdiqladi — yashirin tinglash sanoatda ham
YO'Q, hamma joyda rozilik. SOS + shaffof rozilik to'g'ri yo'l.

---

## §6. KOSON KONTEKSTI — research'ni moslashtirish

Yetakchilar boy davlat, tez internet, yangi telefon uchun quradi. Koson boshqacha —
research'ni shунга moslash SHART:

| Sanoat taxmini | Koson haqiqati | Moslashtiruv |
|---|---|---|
| Doimiy 4G/5G | 3G, tez-tez uziladi | Offline navbat, soket+polling zaxira (§4) |
| Yangi telefon | Redmi/Tecno, Android 6-10 | minSdk 21, yengil, native (DRIVER_APK_PLAN) |
| Google Play Services bor | Ba'zilarida yo'q/eski | LocationManager zaxira (§5.4) |
| App Store/Play do'kon | Sideload odati | To'g'ridan APK + botda havola |
| Karta bilan to'lov | Naqd asosiy | Naqd + tanga, narx haydovchi tasdig'i |
| Ingliz/rus til | O'zbek | Hamma matn o'zbekcha |

---

## §7. TAVSIYA — «juda kam» ga javob: prioritetlangan ro'yxat

Research'dan BirJoy uchun eng ta'sirli 12 xususiyat, muhimlik bo'yicha:

**🔴 Birinchi to'lqin (raqamga bevosita ta'sir):**
1. Fastest-finger dispatch (bor — yadro)
2. Manzilni oldindan ko'rish (haydovchi qabuldan oldin)
3. Zanjirli buyurtma (bo'sh vaqt yo'q)
4. Talab heatmap (haydovchi qayerga borishni biladi)
5. GPS-soxta + soxta-safar qo'riqi (pul-nazorat)
6. Operator konsoli: qo'lda tayinlash + buyurtma yaratish
7. Haydovchi 360° kartasi + nazorat signallari

**🟡 Ikkinchi to'lqin (kuchli):**
8. Destination mode
9. Kvest/streak rag'bat (haydovchiga)
10. Ratsiya (walkie-talkie) + SOS jonli ovoz
11. Mijozga taxminiy narx (diapazon)
12. Zona boshqaruvi + zona hisobot

**🟢 Uchinchi to'lqin:** devor tablosi · offline daromad · avto-SMS marketing (§14.1 rozilik hal bo'lgach)

**Muhim xulosa:** ega «bular kam» dedi — haqiqatan yetakchilarda 30+ xususiyat bor. Lekin
ularning yarmi (fastest-finger, heatmap, haydovchi kartasi, zona, hisobot, SOS, safar-ulashish)
BirJoy yoki `1067-taxi` da ALLAQACHON bor yoki qisman bor. Yangi qurish kerak bo'lgani —
**7 ta 🔴 xususiyat**, ular ham katta emas, chunki server seam (`KasDataSource`) va sxema tayyor.

---

## Manbalar (research)

- [Yandex Pro (Taximeter) — Google Play](https://play.google.com/store/apps/details?id=ru.yandex.taximeter)
- [inDrive — App Store](https://apps.apple.com/us/app/indrive-save-on-city-rides/id780125801)
- [Bolt adopts inDrive's 'fastest finger' dispatch — Technext (2025)](https://technext24.com/2025/08/30/bolt-send-trip-request-several-drivers/)
- [Only on Uber 2025 — driver features](https://www.uber.com/us/en/newsroom/onlyonuber25/)
- [Uber destination mode / earnings / heatmap — RideShareGuy](https://therideshareguy.com/only-on-uber-2025-driver-event-highlights/)
- [Taxi Dispatch Software features — Yelowsoft](https://www.yelowsoft.com/taxi-dispatch-software/)
- [Dispatcher panel features — TaxiCaller](https://www.taxicaller.com/dispatch-software)
- [Fleet telematics & driver monitoring — Navixy](https://www.navixy.com/en/fleet-management/taxi/)
- [Fleet driver monitoring guide — AUTOsist](https://autosist.com/blog/complete-guide-to-fleet-driver-monitoring/)
- [Rideshare fraud patterns — Radar](https://radar.com/blog/5-rideshare-patterns-costing-platforms)
- [$40M GPS-spoofing fraud scheme — Insurance Journal](https://www.insurancejournal.com/news/east/2024/08/30/790683.htm)
- [Ride-hailing fraud prevention — SHIELD](https://shield.com/industries/ride-hailing)
- [Uber gamification (quests/streaks) — StriveCloud](https://www.strivecloud.io/blog/gamification-app-examples-uber)
- [Uber audio recording (consent) — Uber Safety](https://www.uber.com/us/en/ride/safety/audio-recording/)
- [Taxi app safety features — Radicalstart](https://www.radicalstart.com/resources/ride-hailing-app-safety-features/)
