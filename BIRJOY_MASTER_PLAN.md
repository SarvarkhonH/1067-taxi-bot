# 🏗 BIRJOY — BOSH REJA (kas1067 o'rniga o'z taksi tizimi)

> Bu — YAGONA kirish hujjati. Hamma boshqa reja shu yerdan tarmoqlanadi. Yangi sessiya,
> ega yoki muhandis — avval SHUNI o'qiydi.
>
> **Sana:** 2026-09-07 · **Shoxobcha:** `claude/taxi-system-drivers-bsa05f` ·
> **Holat:** REJA (kod yozilmagan — sxema/bayroq/yordamchilardan tashqari, §8).

---

## 0. BIR JUMLADA

BirJoy bugun tashqi dispetcher kompaniya **kas1067**ga to'liq bog'liq. Maqsad — kas qiladigan
hamma ishni (buyurtma qabul qilish, haydovchi tayinlash, holat, narx, hisob) **BirJoy ichida**,
undan kuchliroq qilib qurish: o'z dispetcherlik yadrosi + kuchli haydovchi APK + keng qamrovli
admin panel. Hammasi `owndispatch` bayrog'i ortida — bosqichma-bosqich, orqaga qaytish bir
env qatori bilan.

---

## 1. NEGA — muammo raqamlar bilan

| O'lcham | Hozir | Manba |
|---|---|---|
| Oylik buyurtma | ~1 956 | `1067-taxi` real ma'lumot |
| Har 5-buyurtma haydovchisiz qoladi | **21.5%** rad | jonli o'lchov |
| Ilova orqali buyurtma | atigi **10.6%** | jonli o'lchov |
| kas'ga to'liq bog'liqlik | buyurtma·tayinlash·holat — hammasi kas'da | ARCHITECTURE.md §1 |
| Haydovchilar bazasi | ~550 | ega |

Muammo talabда emas — **ta'minotни ulashda va kanalda**. Bu ikkovi kas'da yo'q narsalar bilan
tuzatiladi: real-vaqt taklif + qayta-taklif, haydovchi ochiq tutadigan APK, tez operator ekrani.

---

## 2. ME'MORIY KALIT — nega bu qo'rqinchli emas

Butun kodbaza kas1067 bilan **bitta interfeys** orqali gaplashadi:
`packages/server/src/kas/types.ts → KasDataSource` (42 faylda 126 chaqiruv).

Uchinchi implementatsiya — `BirJoySource implements KasDataSource` — yozilsa, u BIZNING
jadvallardan o'qiydi va butun ilova (mijoz miniapp, bot, admin, sweep) HECH QANDAY o'zgarishsiz
o'z dispetcherligimizda ishlaydi. **Almashish bitta env qatori: `KAS_MODE=own`.** Orqaga qaytish
ham shuncha oson. Bu 126 joyni qo'lda o'zgartirishdan ming marta xavfsiz — eng katta yutuq shu.

---

## 3. UCH USTUN

### Ustun A — O'Z DISPETCHERLIK YADROSI  → to'liq: `DISPATCH_PLAN.md`
Mijoz buyurtmasi → liniyadagi haydovchilarga real-vaqt taklif to'lqini → birinchi qabul qilgan
oladi (atomik) → holatlar (yetib keldi → safar → yakun) → mavjud idempotent pul-yo'llari
(≤350 clamp buzilmaydi). Liniya bo'sh bo'lsa → kas'ga zaxira (knob bilan). kas yiqilsa ham
sweep ichida ishlayveradi.

### Ustun B — HAYDOVCHI APK  → to'liq: `DRIVER_APK_PLAN.md`
Native Kotlin ilova **allaqachon mavjud** (`1067-taxi/apps/driver-android`, v1.3.0, 26 fayl).
Foreground service, WAKE_LOCK, Socket.IO, FCM, taklif ovozi, 6 ekran — bor. Yetishmaydigani:
eski Android (minSdk 26→21), BootReceiver klassi, WorkManager qorovul, OEM avtoishga tushirish
yordamchisi, Room offline navbat, Play Services yo'q holat, hajm, imzo. Baho: **~2 hafta**
(noldan 3–4 hafta emas).

### Ustun C — ADMIN DISPETCHER KONSOLI  → to'liq: `DISPATCH_PLAN.md` §9
BirJoy admin (`packages/admin`) + `1067-taxi` web paneli — ikkovi bir-birini TO'LDIRADI (§6).
Yangi bo'lim: jonli xarita · navbat · qo'lda tayinlash · operator buyurtma yaratadi · haydovchi
360° kartasi · nazorat signallari · ratsiya · hisobot. Operator kas panelini umuman ochmaydi.

---

## 4. NIMA QURISH KERAK — research prioriteti  → to'liq: `BIRJOY_RESEARCH.md`

Dunyo yetakchilarida (Yandex Pro, Uber, Bolt, inDrive) 30+ xususiyat. Yarmi bizda ALLAQACHON
bor. Yangi kerak bo'lgani — 7 ta 🔴:

| # | Xususiyat | Ustun | Bizda holati |
|---|---|---|---|
| 1 | Fastest-finger dispatch (bir buyurtma → ko'p haydovchi, birinchi oladi) | A | ✅ yadro tayyor |
| 2 | Manzilni qabuldan oldin ko'rish | A+B | yangi, kichik |
| 3 | Zanjirli buyurtma (bo'sh vaqt yo'q) | A+B | yangi |
| 4 | Talab heatmap | B | endpoint bor (`drivers/heatmap`) |
| 5 | GPS-soxta + soxta-safar qo'riqi | A | **yangi — eng muhim gap** |
| 6 | Operator konsoli: qo'lda tayinlash + buyurtma yaratish | C | reja |
| 7 | Haydovchi 360° karta + nazorat signallari | C | `1067-taxi` da qisman |

🟡 Ikkinchi to'lqin: destination mode · kvest/streak rag'bat · ratsiya (walkie-talkie)+SOS jonli ·
taxminiy narx · zona boshqaruvi. 🟢 Uchinchi: devor tablosi · avto-SMS marketing (rozilik hal bo'lgach).

---

## 5. HAYDOVCHI NAZORATI — ega qo'shimchalari  → to'liq: `DRIVER_APK_PLAN.md` §14

| Talab | Holat | Eslatma |
|---|---|---|
| Aniq GPS kuzatuv + iz | 🟢 toza | faqat liniyada yoziladi (maxfiylik) |
| Keyingi buyurtmani ulash | 🔴 muhim | ta'minotni 30–40% samaraliroq ishlatadi |
| Mijozga taxminiy narx | 🟡 | diapazon bilan (aldov xavfi kam) |
| Walkie-talkie / ratsiya | 🟡 | ikki tomonlama, haydovchi biladi (LiveKit) |
| Avto-SMS (haydovchi SIM'idan) | ⚠️ qaror | xizmat-SMS haydovchidan, marketing serverdan; rozilik + pul savoli |
| Ovozni eshitish | ⚠️ qaror | **yashirin tinglash TAVSIYA QILINMAYDI** — sanoatda ham yo'q, hamma joyda rozilik. SOS + shaffof rozilik to'g'ri yo'l |

---

## 6. IKKI REPO — nega ikkalasi kerak

| | `1067-taxi-bot` (BirJoy) | `1067-taxi` |
|---|---|---|
| Nima | Jonli mahsulot: bot + miniapp + admin + tanga iqtisodi | To'liq taksi backend + native APK |
| Kuchli tomoni | Pul (idempotent, ≤350), bayroqlar, obzvon, do'kon/xizmat, KasDataSource seam | 228 endpoint, 70 jadval, **native haydovchi APK**, narx/zona/xavfsizlik moduli |
| Oxirgi commit | jonli | 2026-05-01 ⚠️ |

**Qaror kutadi:** ikkovini QANDAY birlashtirish?
- (a) BirJoy ustun, `1067-taxi` dan APK + kerakli modullarni olib kelish, VA
- (b) `1067-taxi` ustun, BirJoy pul/bot qatlamini ko'chirish.
- _Tavsiyam: (a). BirJoy jonli va pul-xavfsizligi kuchli; APK va narx modulini olib kelish
  oson, teskarisidan._

⚠️ **Zudlik:** `1067-taxi` GitHub'da oxirgi commit 2026-05-01. Kompyuterda push qilinmagan
ish bo'lsa — YO'QOLISH xavfi. Birinchi ish: `git push`.

---

## 7. BOSQICHLAR — bitta yo'l xaritasi

| # | Bosqich | Natija (ega ko'radi) | Baho |
|---|---|---|---|
| **F0** | Repo qaror (§6) + `1067-taxi` push + zaxira | Ikki repo strategiyasi aniq | 0.5 kun |
| **F1** | Server yadrosi (`DISPATCH_PLAN` §1–6) | Ega telefonidan: liniya→buyurtma→qabul→yakun→tanga | 2–3 kun |
| **F2** | `BirJoySource` (KAS_MODE=own) | Butun ilova o'z tizimida | 1–2 kun |
| **F3** | GPS-soxta + soxta-safar qo'riqi (🔴#5) | Pul-nazorat mustahkam | 1–2 kun |
| **B1–B6** | Haydovchi APK (`DRIVER_APK_PLAN` §10+§13) | O'rnatiladigan kuchli ilova | ~2 hafta |
| **F4** | Admin dispetcher konsoli (`DISPATCH_PLAN` §9) | Operator hammasini boshqaradi | 2–3 kun |
| **F5** | Ratsiya PTT + SOS jonli | Bosib gapirish | 3–4 kun |
| **F6** | Sayqal: heatmap, zanjir, taxminiy narx, hisobot, KPI | To'liq tizim | 3–4 kun |

Har bosqich: alohida commit, alohida ega sinovi, PROGRESS.md literal-haqiqat, hammasi bayroq
ortida. Oldingisi QABUL bo'lmaguncha keyingisi boshlanmaydi (CLAUDE.md DoD tartibi).

**Umumiy: ~4–5 hafta** to'liq tizim uchun (APK ~2 hafta shundan).

---

## 8. HOZIRGACHA QILINGAN (literal-haqiqat)

| Narsa | Holat | Joyi |
|---|---|---|
| Bosh reja (shu hujjat) | ✅ | `BIRJOY_MASTER_PLAN.md` |
| Dispetcherlik rejasi | ✅ | `DISPATCH_PLAN.md` (329 qator) |
| APK rejasi + mavjud ilova auditi | ✅ | `DRIVER_APK_PLAN.md` (585 qator) |
| Research (dunyo tajribasi) | ✅ | `BIRJOY_RESEARCH.md` (167 qator) |
| Yangi sessiya prompti | ✅ | `BIRJOY_PROMPT.md` (240 qator) |
| Prisma: DriverShift/DispatchRide/DispatchOffer | ✅ commit (VPS'ga QO'LLANMAGAN) | `schema.prisma` |
| Bayroq `owndispatch` (DEFAULT_OFF) | ✅ commit | `featureFlags.ts` |
| Sof yordamchilar + 7 knob + 20 test (yashil) | ✅ commit | `shared/src/dispatch.ts` |
| Server servisi, bot, API, UI, APK kodi | ❌ **YOZILMAGAN** | — |

**Xatti-harakat o'zgarishi NOL** — bayroq OFF, hech qanday kod yo'li bu jadval/funksiyalarni
chaqirmaydi. Jonli tizim o'zgarmagan.

---

## 9. EGA QARORI KUTAYOTGAN SAVOLLAR

1. **Repo strategiyasi** (§6): BirJoy ustunmi yoki `1067-taxi` ustunmi? _(Tavsiyam: BirJoy ustun.)_
2. **Boshlash nuqtasi:** F1 (server yadrosi) yoki to'g'ridan B1 (APK)? _(Tavsiyam: F0→F1, chunki
   APK ulanadigan server kerak.)_
3. **Avto-SMS pulini kim to'laydi** — haydovchi SIM'i yoki server-gateway? _(Tavsiyam: aralash.)_
4. **Ovoz tinglash** — shaffof/SOS yoki umuman yo'q? _(Tavsiyam: shaffof yoki faqat SOS.)_
5. **Taxminiy narx** — aniq raqam yoki diapazon? _(Tavsiyam: diapazon.)_
6. **`1067-taxi` push qilindimi?** (yo'qolish xavfi — §6)

---

## 10. HUJJATLAR XARITASI

| Hujjat | Nima | Qachon o'qiladi |
|---|---|---|
| **`BIRJOY_MASTER_PLAN.md`** (shu) | Yagona kirish, hamma narsa bir joyda | BIRINCHI |
| `DISPATCH_PLAN.md` | Server dispetcherlik yadrosi + admin konsoli spetsi | A/C ustun quriladiganda |
| `DRIVER_APK_PLAN.md` | Haydovchi APK to'liq spetsi + §14 chuqur nazorat | B ustun quriladiganda |
| `BIRJOY_RESEARCH.md` | Dunyo tajribasi, prioritet, manbalar | Xususiyat tanlanganda |
| `BIRJOY_PROMPT.md` | Yangi Claude sessiyasiga beriladigan topshiriq | Kod boshlanganda |
| `ARCHITECTURE.md` · `CLAUDE.md` | Mavjud kodbaza xaritasi + buzilmas qoidalar | Har doim |

---

**Keyingi harakat:** §9 dagi 6 savolga javob → tanlangan bosqichdan kod boshlanadi (alohida
sessiyada, `BIRJOY_PROMPT.md` bilan). Shu sessiyada faqat reja qildik — kod yo'q.
