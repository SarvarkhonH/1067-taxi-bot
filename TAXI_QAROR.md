# TAXI YADRO — YAKUNIY QAROR (3 audit sintezi)

**Sana:** 2026-09-08 · **Manba:** uchta mustaqil agent auditi
([TAXI_YADRO_AUDIT.md](TAXI_YADRO_AUDIT.md) · [KAS_PARITET.md](KAS_PARITET.md) · [DRIVER_APK_AUDIT.md](DRIVER_APK_AUDIT.md))
**Holat:** yig'ma xulosa, ega qarorini kutmoqda
**Ogohlantirish:** uchala audit ham **faqat statik kod o'qishdan** — hech narsa ishga tushirilmadi,
VPS/bazaga ulanilmadi, telefonda sinalmadi. Jonli tizim holati (§«Qamralmagan») noma'lum.

---

## 0. BIR JUMLADA

**kas1067'dan uzilib `1067-taxi` yadrosiga o'tish — TO'G'RI STRATEGIYA, LEKIN "80% pilotga tayyor"
degani XATO. Uchala agent bir-biridan mustaqil aynan bir raqamga keldi: ~50% (45–55%).** Yadro
kodning kengligi rostdan ~75–80% yozilgan, lekin buyurtmani boshdan-oxir yetkazadigan uch oqim —
**haydovchini uyg'otish (FCM push), qutqarish (operator), va tozalash (sweep)** — kodda yo'q yoki
noto'g'ri baholangan. Pilotga chiqishdan oldin ega **5 ta qaror** berishi va **~1.5 oy P0 ish +
telefon-maydon sinovi** kerak. **BUGUNOQ bitta narsa:** GitHub tokeni ochiq matnda — bekor qilinsin.

---

## 1. UCHTA AUDIT BIR JOYGA KELDI (konvergensiya)

Uchala agent alohida ishladi, lekin bir xil xulosaga keldi — bu ishonchni oshiradi:

| O'lchov | Agent 1 (yadro) | Agent 2 (paritet) | Agent 3 (haydovchi ilova) |
|---|---|---|---|
| **"80% tayyor" da'vosi** | ❌ RAD ETILDI → 45–55% | ❌ faqat kod o'lchandi, tayyorlik emas | ❌ RAD ETILDI → ~55% |
| **Kod kengligi** | ~75–80% (39 modul) | B texnik jihatdan A'dan boy | UI ~85% (18 ekran real) |
| **Ishonchlilik/tayyorlik** | ~45–55% | 5 to'siq hal qilinmagan | fon-rejim ~30%, hardening ~20% |
| **Asosiy sabab** | noto'g'ri narsa o'lchangan | pul semantikasi (integratsiya emas) | fon rejimi "yozilgandek ko'rinadi" |

**"80%" xato emas — noto'g'ri narsani o'lchagan.** U "modul bor / build o'tadi / lokal API javob
berdi" ni sanagan. "Pilot" esa = real haydovchi, real pul, telefon cho'ntakda. Shu mezon bilan
uchta tuynuk **har bitta buyurtmani** yo'qotishi mumkin.

---

## 2. QAROR JADVALI — o'lcham bo'yicha go/no-go

| Yo'nalish | Baho | Qaror | Nega |
|---|---|---|---|
| **Strategiya (kas'dan uzilish)** | Kuchli | ✅ **DAVOM ET** | KasDataSource 27 metod = toza almashish o'qi; bozor va raqib tahlili puxta |
| **Arxitektura (2 ta dispatch)** | Hal bo'ldi | ✅ **B g'olib (c2)** | §3 — pastda |
| **Yadro (dispatch/narx/auth)** | 45–55% | 🟠 **P0 ish shart** | 10 ta P0, ~12–17 muhandis-kun; 3 tasi buyurtma yo'qotadi |
| **Haydovchi ilova** | ~55% | 🟠 **eng uzun yo'l** | fon rejimi yozilmagan; 22–26 kun (1 hafta emas) |
| **Paritet / F1 reja** | Tayyor, bloklangan | ⛔ **5 qaror kutadi** | §4 — pul hamyoni, auth, 2 bot, id, manzil |
| **Xavfsizlik** | Ochiq token | ⛔ **BUGUN** | §5 |
| **Deploy hosti** | Noaniq | ⛔ **aniqlash shart** | ilova va CI hali Render/Vercel'da; BirJoy Contabo'da |

---

## 3. ARXITEKTURA ZIDDIYATI — HAL QILINDI

Ikkita dispatch implementatsiyasi bor edi. **Qaror: variant (c2) — B'ning dispatch moduli g'olib,
A'dagi shoxobcha dispetcher sifatida tashlanadi, lekin lug'at qatlami (`dispatch.ts`) `BirJoySource`
adapteri sifatida saqlanadi.**

**Hal qiluvchi dalil (KAS_PARITET §5.4):** A = Prisma / `birjoy` bazasi, B = Drizzle / alohida
Postgres. **Bitta tranzaksiya ikkala bazani qamramaydi.** Dispatch'ning yuragi — "buyurtma X →
haydovchi Y band" **atomik** bo'lishi shart. Ta'minot holati (Redis GEO + haydovchi statusi + Kotlin
ilova) faqat B'da. Agar dispatch A'da bo'lsa → ikki baza orasida tranzaksiya yo'q → tarmoq uzilsa
**ikkita yo'lovchi bitta mashinaga**, komissiya/tanga zid hisoblanadi → CLAUDE.md ning "hamma tanga
operatsiyasi CoinTxn + idempotent kalit" invarianti buziladi.

**Bepul saqlanadigan narsa:** shoxobchadagi `dispatchBookingId` (id-fazo), `dispatchToBookingStatus`
(status lug'ati), `parseFareInput`/`dispatchFarePresets` (manzilsiz bozor uchun) — bularning hammasi
F1'da baribir kerak, 20 test bilan qoplangan. Prisma'dagi 3 jadval (`DriverShift`/`DispatchRide`/
`DispatchOffer`) **tashlanadi** (VPS'ga qo'llanmagan — hozir tashlash tekin).

---

## 4. ⛔ EGA JAVOB BERMAGUNCHA F1 KODI BOSHLANMAYDI (5 qaror)

Bular kod yozishdan OLDINGI biznes qarorlari — javobsiz F1 qurilmaydi:

| # | Qaror | Nega bloklaydi | Tavsiya |
|---|---|---|---|
| **B1** | **Mijoz cashback hamyoni qayerda?** B'da so'mdagi bonus yo'q; `clients.balls` = o'yin valyutasi | 3 ta metod (`setClientBonus`, `addClientBonus`, `getBonusRules`) + safar `cashback` maydoni shunga bog'liq. **Butun paritetning o'zagi** | B'ga `clients.bonus_uzs` + `bonus_logs` qo'shish (eng kam surtish) |
| **B2** | **Servis-servis auth** — B'da mashina uchun guard yo'q, faqat user JWT/initData | Hamma yozuv metodi (buyurtma yaratish, bonus) | Yangi `ServiceTokenGuard` + `SERVICE_TOKEN` env |
| **B3** | **Ikki Telegram bot** — `@koson1067bot` jonli, o'z buyurtma oqimi bilan; A ham bot | Ikkalasi bir bazaga yozsa: ikki mijoz identifikatori, ikki ride card | B'ning mijoz oqimini o'chirish, faqat haydovchi OTP/xabar qolsin |
| **B4/B5** | **Id bog'lash + manzil vs koordinata** | Telefon yagona umumiy kalit; B `pickupLat/Lng` majburiy, A'da 98% yozilgan manzil | Telefon = kalit; `POST /orders`'da `addressId` → koordinata, `lat/lng` ixtiyoriy |
| **Host** | **1067-taxi qayerda yashaydi?** | Ilova (`build.gradle.kts:25`) va CI (`deploy.yml`) hali Render/Vercel'ga qotirilgan; BirJoy uchun Render **o'lik** | Bitta Contabo VPS'ga birlashtirish |

---

## 5. 🔴 BUGUNOQ — qarorsiz ham bajariladi

**GitHub Personal Access Token ochiq matnda** ikkala repoda ham `.git/config` remote URL'ida
(`https://SarvarkhonH:ghp_…@github.com/...`). Agent 1 (§D.6) va Agent 2 (§7b) mustaqil topdi.

1. GitHub'da bu tokenni **darhol revoke** qilish.
2. `git remote set-url` bilan SSH kalitga yoki credential-manager'ga o'tish.

Bu hech qanday strategik qarorni kutmaydi — kechiktirilsa xavf ochiq turaveradi.

---

## 6. ENG MUHIM TEXNIK GAP — 2 auditda ham chiqdi

**FCM push uchidan-uchiga 0% — ham serverda, ham ilovada.** Agent 1 (§C.3) va Agent 3 (§3 #5)
alohida topdi:

- **Server:** `notifications.service.ts` da `sendToDriver()` bor, lekin `dispatch.service.ts`
  uni **hech qachon chaqirmaydi** — taklif faqat Socket.IO orqali ketadi.
- **Ilova:** `com.google.gms.google-services` plagini qo'llanmagan + `google-services.json` repoda
  **yo'q** → Firebase ishga tushmaydi → token doim `null`.

**Nega bu #1:** ilova fonga o'tib process o'lsa — haydovchi "Online" bildirishnomasini ko'rib turib
buyurtma **olmaydi**. Bu **aynan raqibning zaifligi** edi — biz undan shu bilan ustun bo'lishimiz
kerak edi, hozir esa **ikkalamiz ham nol**. FCM = raqibdan ustunlikning yagona haqiqiy quroli.

---

## 7. PUL TO'G'RILIGI — CLAUDE.md invariantlarini buzadi

| Gap | Isbot | Ta'sir |
|---|---|---|
| Yakuniy narx surge/vehicle-class'ni tashlaydi | `orders.service.ts:163-167` — options uzatilmagan | aytilgan narx ≠ olingan narx; surge puli yo'qoladi |
| Haydovchi balansi tekshirilmaydi | `dispatch.service.ts:132-140` — filtr balansni ko'rmaydi | minus balansli haydovchi cheksiz buyurtma oladi |
| Komissiya tranzaksiyasiz/idempotentsiz | `orders.service.ts:845-865` — `db.transaction` yo'q | read-modify-write poygasi, ikki marta hisob |

Uchtasi ham "hamma tanga operatsiyasi CoinTxn + idempotent kalit" va "atomik" qoidalariga zid.

---

## 8. REAL TAYMLAYN (halol, yaxlitlanmagan)

| Blok | Kim | Kun |
|---|---|---|
| Yadro P0 (10 ta: push-ulash, operator qutqarish, sweep, arvoh, narx, balans, komissiya, OTP, SMS) | backend TS | 12–17 |
| Haydovchi ilova: fon rejimi + overlay + offline navbat + hardening + birinchi-kontakt buferi | Android Kotlin | 22–26 |
| F1 `BirJoySource` (27 metod) — **B1–B5 qaroridan keyin** | backend TS | ~alohida F-bosqich |

Yadro va ilova **turli skill** (TS vs Kotlin) — parallel ketishi mumkin. Lekin **FCM ikkalasiga
tegadi** (server chaqiruvi + ilova konfiguratsiyasi), shuning uchun u birinchi navbatda birga
qilinadi. "1 hafta" bahosi (ilova uchun) **4–5 barobar optimistik** edi.

**Eng tez qiymat tartibi (ilova):** hardening (imzo+proguard+cleartext, 2–3 kun) → telefonga o'rnatib
1 kun haydash → socket'ni servisga ko'chirish (2 kun) → FCM (2 kun).

---

## 9. QAMRALMAGAN (halollik uchun — nima TEKSHIRILMADI)

- **Hech narsa ishga tushirilmadi:** build, test, typecheck, docker, emulator — hammasi statik o'qish.
  "Build yashil / typecheck o'tadi / 40 modul" da'volari **tasdiqlanmagan ham, rad etilmagan ham**.
- **VPS/bazaga ulanilmadi:** jonli env (`NODE_ENV`, `AUTO_APPROVE_NEW_DRIVERS`, `EXPOSE_OTP…`) haqiqiy
  qiymati, "550 haydovchi / 8 tuman" ma'lumoti noma'lum.
- **To'lov modullari (Payme/Click/wallet/topup)** ochilmadi — pul KIRISH yo'li auditdan tashqarida.
- **Ilova telefonda ishlatilmadi**, testlar yo'q (ilovada 0% qamrov), APK ichi razborka qilinmadi.
- **Ma'lumot migratsiyasi** (A `Member` ↔ B `clients`/`drivers`) — alohida F-bosqich.

---

## 10. TAVSIYA ETILGAN KEYINGI QADAM

1. **Bugun:** GitHub tokenni revoke qil (§5).
2. **Ega 5 qarorga javob bersin** (§4) — F1 shundan boshlanadi. Eng muhimi **B1** (cashback hamyoni).
3. **Deploy hostini aniqla** — 1067-taxi Contabo VPS'ga birlashadimi?
4. Qarorlar bo'lgach: **FCM'ni ikki tomondan birga** yop (raqibdan ustunlik quroli), keyin qolgan P0.
5. Yadro (TS) va ilova (Kotlin) parallel jamoalar bilan; har biri **flag ostida DARK**, global
   yoqilishdan oldin ega real telefonda QABUL beradi (CLAUDE.md DoD R6).

**Ega uchun bitta savol hozir:** §4 dagi **B1** — mijozning so'mdagi cashback'i (a) B'ga qo'shiladimi,
(b) A o'z bazasida to'liq egalik qiladimi, (c) tanga bilan birlashadimi? Bu bitta javob 3 ta "YO'Q"
metod va butun F1 shaklini hal qiladi.
