# 🚕 O'Z DISPETCHER — haydovchilar uchun taksi tizimi (reja v1)

> **Ega so'zi (2026-09-07):** «taxi tizimi driverlar uchun qurish kerak, kas1067 muammo bo'lyapti».
>
> **Talqin (shu reja asosida qurildi):** bugungi mahsulot BUTUNLAY kas1067'ga bog'liq — buyurtma
> kas'ga yoziladi, haydovchini kas tayinlaydi, holat kas'dan o'qiladi (`ARCHITECTURE.md` §1).
> kas nosoz/qimmat/ishonchsiz bo'lsa bizda HECH NARSA ishlamaydi. Bu reja **o'z dispetcherlik
> yadrosini** quradi: mijoz buyurtmasi → BIZNING liniyadagi haydovchilarga (Telegram bot) →
> birinchi qabul qilgan oladi → holatlar (yetib keldim → safar → yakun) → mavjud idempotent
> pul-yo'llari. kas1067 zaxira (fallback) bo'lib qoladi — haydovchi topilmasa buyurtma kas'ga
> uzatiladi (knob bilan o'chiriladi). Hammasi `owndispatch` bayrog'i ortida **DARK**: OFF = bugungi
> xatti-harakat AYNAN (kod yo'li umuman ishga tushmaydi).
>
> **Holat: `in progress` — REJA egaga ko'rsatildi, §7 dagi 3 qaror (APK · admin-konsol · ratsiya) TASDIQ kutmoqda.**
> Yadro (§1–§6) qaror-mustaqil: har uch variantda ham kerak, shuning uchun u tasdiqdan keyin darhol davom etadi.

---

## §0. Nima allaqachon bor (noldan qurilmadi)

| Bor narsa | Qayerda | Qanday ishlatildi |
|---|---|---|
| Haydovchi = `Member.type="driver"` (raqam ulash orqali, kas'dan `carNumber` bilan) | `memberService.linkByPhone` | Haydovchi identiteti O'ZGARMADI — o'sha a'zo liniyaga chiqadi |
| «🚗 Haydovchi paneli» (bot) + «Daromad» tabi (miniapp) | `bot.ts:851`, `driver.tsx` | Panelga «🟢 Liniya» tugmalari, tabga «Liniya» kartasi qo'shildi |
| Mijoz buyurtma oqimi (bot wizard, 1-tap, miniapp xarita) | `bookingService.createBookingFor/callOneTapFor` | Yadro o'zgarmadi — bayroq ON bo'lsa shu funksiyalar ICHIDA o'z-dispetcherga buriladi |
| Mijoz jonli holat ko'rinishi (`ActiveBookingView`) | `booking3.tsx` 5s so'rov, `/api/booking/active` | O'z safar AYNAN shu shaklga map qilinadi → miniapp'da BIRORTA UI o'zgarish shart emas |
| Idempotent pul: `grantRideCoins` (≤350 clamp), `rollRideCashback`, missiya/tier/peak | `coinService`, `cashbackService`, sweep finish-shoxi | `settleRide` shu funksiyalarni O'SHA kalit-naqshlar bilan chaqiradi |
| Intercity (o'z DB'da haydovchi-reys-booking naqshi, atomik updateMany) | `intercityService.ts` | Atomik «birinchi qabul qilgan oladi» naqshi shundan olindi |
| Sweep (`pushBookingUpdates`) — yagona poller | `bookingNotifier.ts` | Yangi poller YO'Q: `sweepDispatch` sweep'ning BOSHIDA chaqiriladi (kas yiqilsa ham yuradi) |
| Chiptalar: `tip:<driverId>:<amt>`, `payfare:<driverId>:<fare>` | `bot.ts:1156` | Yakun kartasida AYNAN shu tugmalar — yangi pul-mantiq yo'q |

## §1. Ma'lumot modeli (Prisma, faqat QO'SHIMCHA — mavjud jadval tegilmadi)

- **`DriverShift`** (1 qator / haydovchi): `online`, `lat/lng/locAt` (oxirgi joylashuv), `onlineAt`,
  `offlineAt`, `currentRideId`. Loose FK → `Member.id` (DriverCall/ScheduledRide naqshi).
- **`DispatchRide`**: `riderId`, `driverId?`, `status` (`searching|accepted|arrived|started|finished|
  cancelled|expired`), `source` (bot|miniapp|fallback), `pickupName/Lat/Lng/AddrId`, `destName/Lat/Lng?`,
  `fareEstimate?`, `fareFinal?` (haydovchi yakunda tasdiqlaydi), `wave`, `offeredCount`,
  `riderCardMsgId`, `driverCardMsgId`, `cancelBy/Reason`, `kasFallbackAt`, vaqt-tamg'alari, `settledAt`.
- **`DispatchOffer`**: `rideId`, `driverId`, `wave`, `distanceKm?`, `msgId?`, `response`
  (`accept|reject|timeout|lost`), `@@unique([rideId, driverId])`.

**Id-fazo:** tanga/RideReward kalitlarida `bookingId = 900_000_000 + ride.id`
(`dispatchBookingId`, shared) — kas id'lari bilan TO'QNASHMAYDI (kas ~10⁵ diapazonda), `Int` ichida.

## §2. Oqimlar

1. **Haydovchi liniyaga chiqadi**: bot «🟢 Liniyaga chiqish» (yoki miniapp kartasi) → `DriverShift.online`.
   Joylashuv: Telegram **jonli lokatsiya** (`message:location` + `edited_message:location`) yoki
   miniapp GPS. Joylashuvsiz haydovchi ham taklif oladi — faqat navbatda joylashuvli
   (yaqin) haydovchilardan keyin turadi.
2. **Mijoz buyurtma beradi** (bot/1-tap/miniapp — o'zgarmagan): `createBookingFor` →
   `owndispatch` ON va **liniyada ≥1 haydovchi** bo'lsa → `createRide` → `searching`.
   Liniya bo'sh bo'lsa → `dispatchKasFallback=1` → hozirgi kas yo'li AYNAN (mijoz farqni sezmaydi).
3. **Taklif to'lqini**: yaqinlik bo'yicha saralangan `dispatchOfferBatch` (def 4) haydovchiga
   bir vaqtda «🚕 Yangi buyurtma» kartasi [✅ Qabul] [❌ O'tkazish]. `dispatchOfferSec` (def 20s)
   ichida javob yo'q → `timeout`, keyingi to'lqin (yangi haydovchilar). `dispatchSearchMaxSec`
   (def 120s) yoki `dispatchMaxWaves` tugasa → `expired` → mijozga halol xabar → fallback ON bo'lsa
   kas'ga uzatiladi («🔁 1067 dispetcheriga uzatildi»).
4. **Birinchi qabul qilgan oladi** — `updateMany WHERE status='searching' AND driverId IS NULL`
   (atomik; ikkinchi bosgan «boshqa haydovchi oldi» ko'radi). Boshqa takliflar `lost` → kartalari
   tahrirlanadi. Mijoz kartasi: haydovchi ismi · mashina · raqam · 📞 · ~ETA.
5. **Haydovchi holatlari**: [📍 Yetib keldim] → [🚗 Safar boshlandi] → [🏁 Yakunlash] → narx
   (taxminiy narx + yaxlit variantlar + «✏️ Boshqa summa»). Har o'tish mijozga darhol
   (event-driven, sweep kutilmaydi). [❌ Bekor] yetib kelguncha — buyurtma QAYTA qidiruvga
   tushadi (o'sha haydovchi chiqarib tashlanadi); yetib kelgach [🚫 Mijoz chiqmadi] — safar yopiladi.
6. **Yakun (`settleRide`, idempotent)**: mijozga `rollRideCashback` (→ `grantRideCoins`, ≤350),
   `daily_ride/weekly_rides` missiya, `markRideActive`, `trips+1`; haydovchiga tier-rebate
   (`driver_bonus:` kalit, kunlik cap), pik-bonus, `drv_*` missiyalar, recruit revshare/milestone
   (flaglar ichida). Mijoz yakun kartasi: narx · tanga natijasi · [🪙 Yo'l haqini to'la] [🙏 tip].
7. **Mijoz bekor**: `searching|accepted` da (kas qoidasi: haydovchi yetib kelgach bekor yo'q) —
   haydovchiga xabar, shift bo'shatiladi.
8. **Backstop (`sweepDispatch`)**: taymer restart'da yo'qolsa — kechikkan takliflar/muddati
   o'tgan qidiruvlar sweep'da yopiladi; 60 daq harakatsiz `accepted` safar → adminlarga bir marta
   alert; 4 soat harakatsiz liniya → avto-offline + haydovchiga xabar.

## §3. Knoblar (admin panel «Bonus iqtisod» → guruh «O'z dispetcher», avtomatik chiziladi)

| key | def | ma'nosi |
|---|---|---|
| `dispatchOfferSec` | 20 | bitta to'lqin javob kutish (s) |
| `dispatchOfferBatch` | 4 | bir to'lqinda nechta haydovchiga |
| `dispatchMaxWaves` | 4 | maksimal to'lqin soni |
| `dispatchSearchMaxSec` | 120 | umumiy qidiruv muddati (s) |
| `dispatchLocFreshMin` | 20 | joylashuv «yangi» hisoblanadigan muddat (daq) |
| `dispatchRadiusKm` | 8 | joylashuvli haydovchi uchun radius (km) |
| `dispatchKasFallback` | 1 | 1 = topilmasa/liniya bo'sh bo'lsa kas'ga uzat; 0 = uzatma |

## §4. Nima QILINMADI (ongli, v2 uchun)

- Haydovchi hisobi (komissiya/qarz) — o'z safarlar uchun **komissiya olinmaydi** (kas'dagi 2000
  so'm/safar analogi yo'q). Ega qaror qilsa v2: `DispatchRide.commissionSom` + Intercity naqshi.
- `DailyStat.completedRides` (jamoa maqsad-bonusi o'lchovi) kas'dan keladi — o'z safarlar unga
  QO'SHILMAYDI (alohida hisoblash kerak bo'lsa `rollupService` ga qator).
- `Member.trips` kas-a'zolarda har 15 daqiqada kas'dan qayta yoziladi — o'z safar +1 kas-mijozlarda
  keyingi sync'da yo'qoladi (faqat `tg_` o'z-ro'yxatdan-o'tganlarda saqlanadi). Withdraw-darvoza
  (`MIN_RIDES_FOR_PAID`) uchun v2'da `DispatchRide` soni ham hisobga olinishi kerak.
- Referal «birinchi safar» to'lovi (sweep'dagi OY-08 sybil-qo'riqli blok) o'z safarlarda
  chaqirilmaydi — referal flaglari hozir OFF (`EXPECTED_ON` izohi), shuning uchun va'da buzilmaydi.
- Taksometr yo'q: narxni haydovchi yakunda tasdiqlaydi (taxminiy narx + variantlar).
- Jonli xaritada haydovchi pin'i miniapp'da: o'z haydovchining `lat/lng` `driver` obyektida
  boradi (bor), lekin «bo'sh mashinalar» pin'lari (`/api/booking/nearby`) hamon kas'dan.

## §5. DoD — qabul mezonlari (har biri buyruq + natija bilan)

| # | Mezon | Tekshiruv |
|---|---|---|
| 1 | Bayroq OFF = bugungi xatti-harakat AYNAN (hech bir o'z-dispetcher yo'li ishga tushmaydi) | `grep -n "dispatchOn\|featureOn(\"owndispatch\")"` — har kirish nuqtasi bayroq bilan qo'riqlangan; `simDispatch` «flag OFF → createRide feature_off» |
| 2 | Sof-funksiyalar: holat-mashina, saralash, id-offset | `pnpm --filter @t1067/shared test` → dispatch.test.ts yashil |
| 3 | Birinchi qabul qilgan oladi (atomik) | `acceptOffer` → `updateMany WHERE status='searching' AND driverId IS NULL` (`dispatchService.ts`), simDispatch'da ikki ketma-ket qabul modeli |
| 4 | ≤350 tanga/safar buzilmaydi | `settleRide` FAQAT `rollRideCashback`→`grantRideCoins` orqali; `simEconomy` yashil |
| 5 | Idempotent yakun | `settledAt` + har grant o'z kaliti (`cashback:`, `driver_bonus:`, `peak_bonus:`, `qinc:`); ikkinchi chaqiruv 0 grant |
| 6 | Yangi poller yo'q | `sweepDispatch` faqat `pushBookingUpdates` ichidan chaqiriladi (`grep -rn sweepDispatch`) |
| 7 | Mijoz miniapp'i o'zgarishsiz ishlaydi | `getActiveBookingFor` o'z safarni `ActiveBookingView` shaklida qaytaradi (status map: searching→new, accepted, arrived, started) |
| 8 | Typecheck + build + CI qalqoni | `pnpm -r typecheck` 0 xato · `pnpm --filter @t1067/miniapp build` · `--filter @t1067/admin build` · `simDispatch.ts` yashil |
| 9 | Sxema faqat qo'shimcha | `prisma migrate diff --from-empty …` chiqishida mavjud jadvalga `ALTER/DROP` YO'Q — faqat 3 ta `CREATE TABLE` |
| 10 | Ega telefonda: haydovchi liniyaga chiqadi → mijoz chaqiradi → taklif → qabul → holatlar → yakun → tanga | **EGA QABUL'i** (jonli, VPS'da flag `on` dan keyin) |

## §6. Deploy tartibi (VPS — CLAUDE.md qoidasi: sxema ALOHIDA, kod push'idan OLDIN)

1. VPS: `cd /opt/app && git fetch && git checkout <shu commit>` (yoki main'ga merge'dan keyin pull)
2. `pnpm --filter @t1067/server exec dotenv -e ../../.env -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → **o'qi** (faqat 3 `CREATE TABLE` + indekslar bo'lishi kerak)
3. `… prisma db push`
4. Kod deploy (CI) → `/health`
5. Sinov: ega o'zi haydovchi sifatida (`type=driver` a'zo) → `/liniya` → boshqa telefondan buyurtma.
   Flag hali OFF — sinov uchun `setFlag.ts owndispatch on` (alert keladi), muammo bo'lsa `off` (30s).
6. QABUL → `EXPECTED_ON` ga qo'shish (alohida commit).

## §7. EGA QARORLARI (2026-09-07) — tanlangan variantlar

Ega uch savolga javob berdi va ustiga qo'shdi: **«yaxshiroq tizim kerak — juda kuchli
kontrolga ega admin panel va driverlar uchun juda tez, qulay APK»**.

| Savol | EGA TANLOVI | Nima demak |
|---|---|---|
| Haydovchi ilovasi | **native Kotlin APK — BIRINCHI navbatda** | Ega ikkinchi xabarida aniqlashtirdi: eski Android + kuchli fon rejimi. Capacitor tavsiyasi shu sabab bekor qilindi. Bot yo'li zaxira bo'lib qoladi. To'liq reja: `DRIVER_APK_PLAN.md` |
| Ratsiya | **Real-vaqt PTT (WebRTC)** | «Tugmani bosib gapir», jonli ovoz. Telegram-relay faqat **degradatsiya** yo'li bo'lib qoladi (§10.5) |
| Admin panel | **To'liq dispetcher konsoli** | Jonli xarita + navbat + qo'lda tayinlash + operator buyurtmasi + ratsiya + hisobot (§9) |
| Yadro (server+bot) | **Hozir davom etilsin** | §1–§6 o'zgarishsiz |

**Muhim ogohlantirish (o'qilishi shart):** kas1067 haydovchi-APK dekompilyatsiyasi
(`client-apk-decomp/`) `.gitignore`da va bu checkout'da **YO'Q**. Quyidagi ekran/oqimlar
umumiy dispetcher-ilovalar naqshiga (kas, Yandex Pro, Bolt Driver) qurilgan. Agar aynan
kas ekranlarini takrorlash kerak bo'lsa — papkani qayta yuklash yoki ekranlar ro'yxati kerak.

---

## §8. HAYDOVCHI APK → **`DRIVER_APK_PLAN.md`** ga ko'chirildi

⚠️ **Ega qarori 2026-09-07 (ikkinchi xabar): APK — BIRINCHI navbatda.** Talab aniqlashtirildi:
«to'liq funksional, kuchli, eski androidlarda kuchli ishlaydigan, fon rejimida kas1067 driver
ilovasidan 10x yaxshiroq, qulay va tez».

**Texnologiya tavsiyasi O'ZGARDI.** Bu hujjatning oldingi tahririda Capacitor (web-ilova
Android qobig'ida) tavsiya qilingan edi. Yangi talablar — eski Android va kuchli fon rejimi —
uni to'g'ri kelmaydigan qiladi: Capacitor WebView ustida ishlaydi, eski Androidda WebView
sekin va tizim uni fonda birinchi bo'lib o'ldiradi. **Yangi tavsiya: native Kotlin.**

To'liq spetsifikatsiya (o'lchanadigan «10x» jadvali, 9 ekran, fon rejimining 7 qatlami, OEM
o'ldirgichlari, tezlik byudjeti, server shartnomasi, sinov rejasi, bosqichlar):
**`DRIVER_APK_PLAN.md`**.

## §9. ADMIN — «juda kuchli kontrol» DISPETCHER KONSOLI

Yangi bo'lim: admin v2 → **🎧 Dispetcher**. Bu ekran operator kun bo'yi ochiq ushlaydi.

### 9.1 Tuzilish — bitta ekran, uch panel

```
┌─────────────┬───────────────────────────┬──────────────┐
│ NAVBAT      │        JONLI XARITA       │  TANLANGAN   │
│ (chap)      │        (markaz)           │  (o'ng)      │
│             │                           │              │
│ 🔴 3 kutmoqda│   🟢 bo'sh haydovchi      │  buyurtma yoki│
│ 🟡 5 yo'lda  │   🟡 safarda              │  haydovchi    │
│ 🟢 8 safarda │   ⚫ eskirgan joylashuv    │  kartasi +    │
│             │   📍 kutayotgan buyurtma  │  AMALLAR      │
│ [qidiruv]   │                           │              │
├─────────────┴───────────────────────────┴──────────────┤
│ 📻 RATSIYA: [bosib gapir]  ·  🔊 kim gapiryapti        │
└────────────────────────────────────────────────────────┘
```

### 9.2 Jonli xarita

- Mavjud SVG-xarita naqshi (`admin/src/App.tsx:526` LiveMap) kengaytiriladi — yangi
  kutubxona kerak emas, lekin **Leaflet**ga o'tish ham mumkin (miniapp'da allaqachon bor).
- Har 5–10 s yangilanadi (`/api/admin/dispatch/drivers` + `/rides`).
- Haydovchi belgisida: ism · raqam · «3 daq oldin» · bosilsa o'ng panel.
- Buyurtma pin'ida: kutish vaqti · nechta haydovchiga yuborilgani.
- Filtr: faqat bo'shlar / faqat safardagilar / faqat muammolilar.

### 9.3 Operator amallari (kuch shu yerda)

| Amal | Nima qiladi | Qo'riq |
|---|---|---|
| **Qo'lda tayinlash** | Buyurtmani ANIQ haydovchiga beradi, taklif kutilmaydi | Atomik `updateMany` (ikki marta tayinlanmaydi); haydovchi band bo'lsa rad etadi |
| **Operator buyurtma yaratadi** | Telefon qilgan mijoz uchun (bot'siz) | Raqam bo'yicha a'zo topiladi yoki `createLocalMember` bilan yaratiladi |
| **Haydovchini almashtirish** | Joriy haydovchini olib, qaytadan qidiruvga qo'yadi | Mijozga halol xabar |
| **Bekor qilish** | Buyurtmani yopadi | Ikkala tomonga xabar + sabab yoziladi |
| **Liniyadan chiqarish** | Haydovchini offline qiladi | Safardagi haydovchini chiqarib bo'lmaydi |
| **Narxni tuzatish** | Yakunlangan safar narxini o'zgartirish | ⚠️ FAQAT ega; audit yozuvi; tanga qayta hisoblanmaydi (v2) |
| **Ratsiyaga gapirish** | Hamma liniyadagiga ovoz | §10 |
| **Haydovchiga shaxsiy xabar** | Bitta haydovchiga matn | Mavjud push yo'li |

Har amal **`AdminAuditLog`** ga yoziladi: kim, qachon, qaysi buyurtma, sabab.

### 9.4 Nazorat signallari (operator ko'rmay qolmasin)

Ekranda qizil chiziq + ovoz beradigan holatlar:
- Buyurtma **2 daqiqadan beri** haydovchisiz.
- Haydovchi qabul qilgan, lekin **10 daqiqadan beri** «yetib keldim» bosmagan.
- Safar **90 daqiqadan** oshdi (yakunlash unutilgan?).
- Liniyada **0 bo'sh haydovchi**, lekin kutayotgan buyurtma bor.
- Haydovchi joylashuvi **20 daqiqadan beri** yangilanmagan (ilova o'lganmi?).

### 9.5 Hisobot va KPI (ega uchun — «tizim ishlayaptimi?»)

Kunlik/haftalik: safarlar soni · o'rtacha **topish vaqti** (buyurtmadan qabulgacha) ·
o'rtacha **yetib kelish vaqti** · bekor foizi (mijoz/haydovchi alohida) · haydovchi kesimida
safar/daromad/qabul foizi · **kas'ga uzatilgan** buyurtmalar ulushi (= o'z tizim qanchalik
qoplayapti). Hammasi mavjud `DataTable` + CSV eksport.

### 9.6 Rollar

- **Ega** — hamma narsa, jumladan narx tuzatish va bayroqlar.
- **Operator** — dispetcher konsoli to'liq (buyurtma/tayinlash/bekor/ratsiya), **pul yo'q**,
  moliya/a'zolar/bayroqlar YOPIQ (mavjud `pathAllowedForOperator` allowlist'iga
  `/api/admin/dispatch/*` qo'shiladi).

---

## §10. RATSIYA — real-vaqt PTT (ega tanlovi)

### 10.1 Stack

**LiveKit (o'z VPS'imizda, self-host)** — sabab: ochiq kodli, Android/Web SDK bor,
bitta Docker konteyner, VPS'da (`169.58.55.249`) ishlaydi, ovoz uchinchi tomon serveriga
chiqmaydi. Muqobil (Janus/mediasoup) — ko'proq sozlash, foyda yo'q.

### 10.2 Kanal modeli

- **Bitta umumiy kanal**: «BirJoy Liniya» — hamma liniyadagi haydovchi + dispetcher.
- Kanalga kirish **avtomatik**: liniyaga chiqqanda qo'shiladi, chiqqanda uziladi.
- **Faqat bosib turganda mikrofon ochiladi** (push-to-talk) — aks holda kabinadagi hamma
  gap efirga ketardi.
- **Bir vaqtda bitta gapiruvchi** (навbat): kimdir gapirayotganda boshqasiga «⏳ band» ko'rinadi.
  Dispetcher **ustuvor** — u bosganda haydovchining gapi to'xtatiladi.
- Ekranda: «🔊 Sardor gapiryapti» (kim gapirayotgani ismi bilan).

### 10.3 Xavfsizlik

- Server **qisqa muddatli token** beradi (LiveKit JWT, 10 daqiqa), faqat liniyadagi
  haydovchiga va admin-tokenli operatorga.
- Ovoz **yozib olinmaydi** (v1) — faqat jonli. Yozib olish kerak bo'lsa alohida ega qarori
  (maxfiylik + disk).
- Suiiste'mol: haydovchi ketma-ket **20 soniyadan** uzoq gapira olmaydi; ega istalgan
  haydovchining ratsiyasini o'chira oladi.

### 10.4 Degradatsiya (PTT ishlamasa — jimlik bo'lmasin)

| Holat | Nima bo'ladi |
|---|---|
| APK yo'q (bot'dagi haydovchi) | Ovozli xabar relay: botga ovoz → hammaga `sendVoice` (Telegram) |
| Tarmoq juda yomon (WebRTC ulanmadi) | Avtomatik ovozli-xabar rejimiga tushadi |
| LiveKit serveri o'lgan | Ekranда «📻 Ratsiya vaqtincha ishlamayapti» + relay rejimi |

Ya'ni Telegram-relay **o'chirilmaydi** — u zaxira qatlam.

### 10.5 Server resursi

LiveKit ~1 vCPU / 512 MB — hozirgi VPS ko'taradi (bot + Postgres bilan yonma-yon).
Portlar: 7880 (WS, Caddy orqali `ptt.birjoy.online`), 7881/UDP 50000-60000 (media).
⚠️ **UDP portlarni ochish kerak** — bu VPS'ning firewall o'zgarishi, ega ruxsati bilan.

---

## §11. BOSQICHLAR — nima qachon (ega tartibi: **APK birinchi**)

| # | Bosqich | Natija (ega ko'radigan) | Taxminiy hajm |
|---|---|---|---|
| **F1** | **Yadro** (§1–§6): server + bot, mijoz oqimi, yakun-mukofot | Haydovchi liniyaga chiqadi → mijoz chaqiradi → qabul → yakun → tanga. **APK shu serverga ulanadi** | 2–3 kun |
| **A1–A6** | **HAYDOVCHI APK** — `DRIVER_APK_PLAN.md` §10 | O'rnatiladigan native ilova: fon rejimi, taklif, safar, daromad | 3–4 hafta |
| **F2** | **Dispetcher konsoli** (§9) | Operator ekranda hammasini ko'radi va boshqaradi | 2–3 kun |
| **F5** | **Ratsiya PTT** (§10) | Bosib gapirish, jonli ovoz | 3–4 kun |
| **F6** | **Sayqal** | Signal-ogohlantirishlar, hisobot, KPI | 2 kun |

**F1 nega APK'dan oldin:** APK — bu ekran, uning orqasida server bo'lishi shart. F1siz ilova
ulanadigan joy yo'q. F1 kichik (2–3 kun) va APK ishi shu server ustiga quriladi.

Telegram bot yo'li (§2) **abadiy qoladi** — APK o'rnatmagan yoki iPhone'li haydovchi uchun.

Har bosqich alohida commit va alohida ega sinovi bilan, hammasi `owndispatch` bayrog'i ortida.

## §12. XAVFLAR va ular bilan nima qilinadi

| Xavf | Ta'sir | Chora |
|---|---|---|
| Liniyada haydovchi kam → mijoz kutadi | Mijoz yo'qotiladi | `dispatchKasFallback=1` — topilmasa kas'ga uzatiladi, mijoz farqni sezmaydi |
| Haydovchi ilovani yopib qo'yadi, taklif ketmaydi | Buyurtma osilib qoladi | 3 qatlamli signal (§8.5) + 4 soat harakatsizlikda avto-offline |
| Ikki haydovchi bir buyurtmani oladi | Janjal | Atomik `updateMany` — DB darajasida imkonsiz |
| Narxni haydovchi oshirib yozadi | Mijoz noroziligi | Taxminiy narx mijozga OLDINDAN ko'rsatiladi; keskin farq → operatorga signal (v2) |
| Fon-GPS batareyani yeydi | Haydovchi ilovani o'chiradi | Adaptiv chastota + o'lchov (§8.3) |
| VPS UDP portlari yopiq (ratsiya) | PTT ishlamaydi | Degradatsiya (§10.4) + ega bilan firewall qadami |
| Ikki sessiya bir vaqtda kod yozadi | Konflikt, buzilgan main | §13 |

---

## §13. SESSIYALAR MUVOFIQLASHTIRUVI (⚠️ MUHIM)

**Hozirgi holat (2026-09-07, shu sessiya):**

| Nima | Holat | Joyi |
|---|---|---|
| Reja (shu hujjat) | ✅ yozildi | `DISPATCH_PLAN.md` |
| Prisma: `DriverShift`, `DispatchRide`, `DispatchOffer` | ✅ commit qilindi (VPS'ga hali QO'LLANMAGAN) | `schema.prisma` |
| Bayroq `owndispatch` (DEFAULT_OFF) | ✅ commit qilindi | `featureFlags.ts` |
| Sof yordamchilar + 7 knob + 20 test | ✅ commit qilindi, testlar yashil | `shared/src/dispatch.ts` |
| Server servisi, bot handlerlari, API, UI | ❌ **YOZILMAGAN** (bu sessiyada yozilmaydi) | — |

Commit: `acaa40c`, shoxobcha `claude/taxi-system-drivers-bsa05f`. **Xatti-harakat o'zgarishi
NOL** — bayroq OFF va hech bir kod yo'li bu jadval/funksiyalarni chaqirmaydi.

**Boshqa sessiya uchun qoida (CLAUDE.md «bitta ish — bitta sessiya»):**
1. Ish boshlashdan oldin `git fetch` va shu shoxobchani ko'rish — sxema/bayroq/yordamchilar
   **allaqachon bor**, qaytadan yozilmasin (ikki xil `DispatchRide` = migratsiya halokati).
2. Agar boshqa sessiya BOSHQA nom bilan xuddi shu narsani qurgan bo'lsa — **bittasi tanlanadi**,
   ikkinchisi o'chiriladi. Ikki dispetcher yadrosi bir bazada yashay olmaydi.
3. `prisma db push` VPS'da **faqat bir marta**, kod push'idan OLDIN (CLAUDE.md).
