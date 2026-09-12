# BIRJOY TAXI — YAGONA BOSH HUJJAT (v2)

**Sana:** 2026-09-08 · **Holat:** F0 audit tugadi → reja qayta yozildi · ega qarorini kutmoqda
**Bu v2 ustun turadi va quyidagilarni yutadi:** `TAXI_10X_PLAN.md` · `BIRJOY_TAXI_MASTER.md` (v1) ·
`RAQIB_TAHLIL.md` · `1067-taxi/docs/MASTER-PLAN.md`.
**Isbot bazasi (o'zgarmaydi, dalil sifatida qoladi):** [TAXI_YADRO_AUDIT.md](TAXI_YADRO_AUDIT.md) ·
[KAS_PARITET.md](KAS_PARITET.md) · [DRIVER_APK_AUDIT.md](DRIVER_APK_AUDIT.md) · [TAXI_QAROR.md](TAXI_QAROR.md)

> **Manba belgilari:** **[o'lchandi]** = buyruq bilan sanaldi · **[ega]** = ega bergan statistika ·
> **[audit]** = 3 auditning `fayl:qator` isboti · **[qaror]** = ega tasdiqlagan qaror ·
> **[taklif]** = mening tavsiyam, raqam ega'niki.

---

## 0. v1 DAN NIMA O'ZGARDI

v1 bitta tekshirilmagan da'voga suyanardi: *"~80% pilotga tayyor"*. F0 audit uni **RAD ETDI**.
Uchala agent alohida ishlab, bir xil raqamga keldi: **~50%**. Kod kengligi ~75-80% rost, lekin
buyurtmani yetkazadigan asosiy oqimlar kodda yo'q. v2 shu haqiqatni va rejada **umuman yo'q bo'lgan
8 kamchilikni** singdiradi, ikkita ochiq arxitektura savolini yopadi (dispatch qaysi tizimda ·
cashback qayerda) va real kun baholarini beradi.

| Da'vo (v1) | Haqiqat (v2, [audit]) |
|---|---|
| ~80% pilotga tayyor | Yadro 45-55% · ilova ~55% · pul semantikasi bloklangan |
| "Buyurtma o'lmaydi" (F1 tamoyili) | Kodda TESKARI: `no_drivers` operatordan yo'qoladi, sweep yo'q, arvoh haydovchi |
| FCM push "kod bor" | Uchidan-uchiga **0%** — server yubormaydi, ilovada Firebase ishga tushmaydi |
| Ilova "~1 hafta" | **22-26 kun** (fon rejimi yozilmagan, faqat yozilgandek ko'rinadi) |
| Dispatch: 2 implementatsiya, qaysi biri? | **Hal qilindi: B (1067-taxi) g'olib** (§4) |
| Cashback qayerda? | **Hal qilindi: tanga = yagona mukofot valyutasi, A daftarida** (§5) |

---

# I QISM — HAQIQAT (F0 audit natijasi)

## 1. Bir jumlada

Koson uchun to'liq taxi platformasi quramiz — haydovchi ilovasi, aqlli konsol, telefoniya, ratsiya,
mijoz tomoni va dispetcherlik yadrosi. Yadro (`1067-taxi`) **texnik jihatdan boy va yozilgan**, lekin
**pilotga tayyor emas**: buyurtmani boshdan-oxir yetkazadigan uch oqim (haydovchini uyg'otish,
qutqarish, tozalash) kodda yo'q. Vazifa — noldan qurish emas, **audit topgan tuynuklarni yopish** va
kas1067'dan `KAS_MODE=birjoy` bitta qatori bilan uzilish.

## 2. Uch auditning yagona xulosasi

| O'lchov | Yadro (Agent 1) | Paritet (Agent 2) | Ilova (Agent 3) |
|---|---|---|---|
| "80%" da'vosi | ❌ 45-55% | ❌ faqat kod o'lchandi | ❌ ~55% |
| Kod kengligi | ~75-80% (39 modul) | B, A'dan boy | UI ~85% (18 ekran real) |
| Tayyorlik | dispatch/pul/auth tuynuk | 5 to'siq | fon ~30% · hardening ~20% |
| Asosiy sabab | noto'g'ri narsa o'lchangan | pul semantikasi | fon rejimi yozilmagan |

**"80%" xato emas — noto'g'ri narsani o'lchagan** ("modul bor / build o'tadi"). "Pilot" = real
haydovchi + real pul + telefon cho'ntakda.

## 3. REJADA YO'Q BO'LGAN 8 KAMCHILIK (audit topgan)

Har biri `fayl:qator` bilan isbotlangan, endi aniq fazaga biriktirilgan.

| # | Kamchilik | Isbot [audit] | Qaysi faza |
|---|---|---|---|
| K1 | **`no_drivers` buyurtma operatordan yo'qoladi** — qutqarib bo'lmaydi | `socket.gateway.ts:293-302` + `operator/page.tsx:610-612` | F1-core (P0) |
| K2 | **O'lik buyurtma sweep'i yo'q** — Redis/BullMQ uzilsa buyurtma abadiy `dispatching` | 10 `@Cron`, birortasi buyurtma tozalamaydi | F1-core (P0) |
| K3 | **Arvoh haydovchilar** — Redis GEO'da abadiy, 15s×N behuda kutish | `location.service.ts:61` TTL yo'q · `socket.gateway.ts:66-68` faqat log | F1-core (P0) |
| K4 | **FCM push 0%** — ikkala tomonda o'lik | server `sendToDriver` chaqirilmaydi · ilova `google-services.json` yo'q | F3/F4 (P0) |
| K5 | **Yakuniy narx surge/vehicle-class'ni tashlaydi** — aytilgan ≠ olingan | `orders.service.ts:163-167` | F1-core (P0) |
| K6 | **Komissiya tranzaksiyasiz/idempotentsiz + balans tekshirilmaydi** | `orders.service.ts:845-865` · `dispatch.service.ts:132-140` | F1-core (P0) |
| K7 | **OTP 4 xonali + verify throttle yo'q** → admin panelga brute-force | `auth.service.ts:63,258,342` · `auth.controller.ts:27,65,82` | F1-core (P0) |
| K8 | **Prod-hardening bloklovchi** — release debug kalit bilan, proguard yo'q, cleartext ochiq | `build.gradle.kts:54,52-53` · `AndroidManifest.xml:41` | F3 (P0) |

**Bundan tashqari — bugunoq (qarorsiz):** GitHub PAT ochiq matnda ikkala repoda `.git/config` da
(`ghp_…`). Revoke qilinsin (§10).

---

# II QISM — NEGA (strategiya — o'zgarmadi, verifikatsiyalangan)

## 4-bo'lim... (aslida strategiya) Bog'lovchi cheklov — butun rejaning o'qi

Ega maqsadi: kuniga **63 → 600 buyurtma** [ega].

```
Hozir:  16.5 mashina onlayn × 3.8 buyurtma = 63/kun
Kerak:  600 ÷ 3.8 = 158 mashina onlayn  →  16.5 → 158 = 9.6×
        Bazada 550 haydovchi → onlayn ulush 3% → 29%
```

Talab yetarli: har beshinchi buyurtma rad javob oladi — **21.5%**, oyiga 421 ta, ~716 000 so'm
yo'qolgan sof foyda [ega]. **Demak haydovchi ilovasi interfeys loyihasi emas — o'sishning asosiy
richagi.** Har ekran bitta savolga javob beradi: *nega men hozir onlayn turishim kerak?* Teskarisi
ham to'g'ri: **mijoz tomonini ta'minotdan oldin pompash zarar** — rad javobi oshadi.

## Raqib va bozorning uchta qonuni

Kas1067 = tayyor SaaS (`uz.taxisoft` / TaxiCloud), Koson uchun maxsus hech narsa yo'q. Beshta
zaifligi = beshta imkoniyatimiz: push yo'q · HTTP shifrlanmagan · motivatsiya yo'q · talab
ko'rinmaydi · uzilishga chidamsiz. ⚠️ **FCM bo'yicha hozir ikkalamiz ham nol** [audit] — bu bizning
yagona ustunlik qurolimiz edi, hali o'chiq.

Bozorning uch qonuni (Yandex mantiqini buzadi) [ega]: **(1)** manzil tushunchasi yo'q — faqat olib
ketish joyi + taximetr; **(2)** yozish 98% — xarita ignasi/katalog "hech qachon"; **(3)** mijozga
masofa ko'rsatilmaydi. GPS taximetr shu bozor uchun to'g'ri mexanika; `estimate`/zona-narx/manzil
maydonlari — mavjud bo'lmagan bozor uchun yozilgan.

---

# III QISM — ARXITEKTURA QARORLARI (hal qilindi)

## 4. Dispatch: B (1067-taxi) g'olib — variant (c2) [qaror]

Ikkita dispatch implementatsiyasi bor edi. **Qaror: B'ning dispatch moduli g'olib. A'dagi shoxobcha
(`claude/taxi-system-drivers-bsa05f`) DISPETCHER sifatida tashlanadi, lekin lug'at qatlami adapter
bo'lib qoladi.**

**Hal qiluvchi dalil** (KAS_PARITET §5.4): A = Prisma / `birjoy` bazasi, B = Drizzle / alohida
Postgres+PostGIS+Redis. **Bitta tranzaksiya ikkala bazani qamramaydi.** Tayinlash — "buyurtma X →
haydovchi Y band" — atomik bo'lishi shart, ta'minot holati (Redis GEO + `drivers.status` + Kotlin
ilova) esa faqat B'da. Dispatch A'da bo'lsa → split-brain → ikki yo'lovchi bitta mashinaga.

| Element | Qayerdan | Sabab |
|---|---|---|
| Nomzod qidirish · reyting · taklif · taymer · qabul poygasi · jurnal | **B** | Ishlaydi, ta'minot bilan bitta bazada |
| Haydovchi mavjudligi (online/GPS/bearing) | **B** (Redis GEO) | A'da umuman yo'q |
| `dispatchBookingId = 900_000_000 + id` id-fazosi | **A shoxobchasi** → `main`ga kesib olinadi | `CoinTxn` idempotent kaliti B id'lari kas id'lari bilan to'qnashmasin — tanga uchun HAYOTIY (§5.3) |
| `dispatchToBookingStatus` · `canTransition` · `parseFareInput` · `dispatchFarePresets` | **A shoxobchasi** → adapter (20 test bilan) | Status lug'ati + manzilsiz bozor |
| `DriverShift`/`DispatchRide`/`DispatchOffer` Prisma jadvallari | ⛔ **TASHLANADI** | Ikkinchi haqiqat manbai; VPS'ga qo'llanmagan |

**B'ga ko'chadigan 3 g'oya (alohida tiket, F4):** to'lqinli taklif (4×20s, hozir ketma-ket 15s×5=75s) ·
`reject`≠`timeout` ajratmasi · `owndispatch` kill-switch (B'ning dispatch'i bayroqsiz — CLAUDE.md
"har mexanika kill-switch" qoidasini buzadi).

## 5. TANGA — YAGONA MUKOFOT VALYUTASI (ipidan-ignasigacha) [qaror]

### 5.1 Qaror

Yangi tizimning mijoz-mukofoti = **tanga**. Alohida "so'mdagi cashback hamyoni" **yo'q**. Tanga
**A'ning (BirJoy bot) mavjud `CoinTxn` daftarida** yashaydi — o'sha daftar ≤350 clamp, idempotent
kalit, korp-ledger ajratmasi va kill-switch'lar bilan allaqachon qurilgan.

### 5.2 Nega A'da (B'ga yangi `bonus_uzs` qo'shilmaydi)

BirJoy **hozir ham** kas cashback'ini tangaga aylantiradi (`coinService.ts:305-306,372-374`). Ya'ni
tanga iqtisodi allaqachon data-source'dan oziqlanadi. `KAS_MODE=birjoy`da manba kas'dan B'ga
almashadi — **pul kodi o'zgarmaydi**. B'ga `bonus_uzs` qo'shish esa parallel ikkinchi daftar yaratib,
≤350 clamp'ni chetlab o'tish xavfini tug'diradi. Shuning uchun A'da qolishi — eng kam surtish VA eng
xavfsiz.

### 5.3 KIRIM (earn) — har safarda tanga

- Safar B'da yakunlanadi → **A'ning `bookingNotifier` sweep'i** (kengaytiriladi, yangi poller YO'Q —
  CLAUDE.md qoidasi) yakunlangan safarni `BirJoySource` orqali o'qiydi → `cashbackService` tanga
  beradi.
- **Idempotent kalit = `dispatchBookingId` (900M + orderId)** — shu sabab §4 dagi id-fazo adapteri
  saqlanadi. Bir safar ikki marta hisoblanmaydi.
- **≤350 tanga/safar** — `cashbackService` yakuniy CLAMP o'zgarmaydi; taxi mukofoti shu clamp'dan
  o'tadi.
- Tezlik (`getBonusRules`): hozirgi kas→tanga tezligi saqlanadi [taklif]; raqam §5.9.

### 5.4 CHIQIM (burn)

- **Do'kon / o'yin** — mavjud tanga do'koni va o'yini o'zgarmaydi (bir xil daftar).
- **Withdraw** — faqat real safar qilganlarga, kunlik revenue-byudjet ichida (mavjud invariant).
  Tanga→so'm tezligi §5.9.
- **Safarni tanga bilan (qisman) to'lash** — retention richagi, lekin narx yo'liga tegadi. **Flag
  ortida, pilotда default O'CHIQ** [taklif]; F7'da yoqiladi.

### 5.5 3 ta "YO'Q" metod endi qanday yopiladi

B1 qarori bu 3 metodni **B'ga hech narsa qo'shmasdan** yopadi — ular A ichida hal bo'ladi:

| Metod | BirJoySource'da | Manba |
|---|---|---|
| `setClientBonus` / `addClientBonus` | A'ning `CoinTxn` daftariga yozadi (lokal, B'ga bormaydi) | `coinService` |
| `getBonusRules` | A'ning tanga earn qoidalarini qaytaradi | A config |
| `RideHistoryItem.cashback` | O'sha safarda berilgan tangani ko'rsatadi (order id bo'yicha) | A `ball_logs`/`CoinTxn` |

B faqat safar FAKTINI beradi (yakunlandi, narx, masofa) — bu allaqachon bor metodlar orqali
(`getRideHistory`, `listActiveBookings`, `getActiveBooking`).

### 5.6 B'ning parallel valyutasi tugatiladi

B'ning `clients.balls` + o'z loyalty/do'koni (`schema/loyalty.ts`) — **ikkinchi valyuta, tugatiladi**
(mijoz-tomon UI'da tanga = A daftari). ⚠️ **Diqqat — chalkashtirmaslik:** bu **mijoz** tangasi.
Haydovchi ilovasidagi "Ballar" ekrani (`BallsScreen.kt`) — **haydovchi motivatsiya ballari**, boshqa
tushuncha, B'da qoladi (F4). Ikkalasi birlashtirilmaydi.

### 5.7 Invariantlar (thread-to-needle nazorat ro'yxati)

- [ ] ≤350 tanga/safar emissiya — `cashbackService` clamp orqali (taxi mukofoti ham shundan o'tadi)
- [ ] Har tanga operatsiyasi `CoinTxn` + idempotent kalit (= `dispatchBookingId`)
- [ ] Korp-ledger alohida — withdraw/kompaniya puli mijoz daftaridan ajratilgan
- [ ] Pul-to'lab-omad TAQIQ — tanga bilan omad/ustunlik sotib olinmaydi
- [ ] Har mexanika kill-switch flag ortida (earn · withdraw · safar-to'lov)
- [ ] UI'da "coin" so'zi yo'q — hamma joyda "tanga"; B'ning "balls" nomi mijoz UI'dan olib tashlanadi
- [ ] Cross-DB: tanga faqat A'da yoziladi; B hech qachon tanga yozmaydi (split-brain oldi olinadi)

### 5.8 Balans migratsiyasi

Jonli mijoz tangasi allaqachon A'da (kas orqali). B'ning `clients.balls` — ehtimol seed/pre-cutover
ma'lumot (MEMORY: neon-frozen). **F0.5 tekshiruvi:** B'da real mijoz balls qiymati bormi? Bo'lsa —
`CoinTxn` opening-balance bilan A'ga ko'chiriladi (idempotent), aks holda tashlanadi.

### 5.9 Ega raqam qo'yadigan joylar (yagona ochiq biznes-raqamlar)

| # | Raqam | Tavsiya [taklif] |
|---|---|---|
| N1 | Har safar tanga tezligi | Hozirgi kas→tanga tezligini saqlash (≤350 clamp'da) |
| N2 | Tanga→so'm withdraw tezligi + kunlik byudjet | Mavjud qoida saqlanadi (revenue-byudjet ichida) |
| N3 | Safarni tanga bilan to'lash | Pilotда O'CHIQ; F7'da flag bilan A/B sinaladi |

## 6. Deploy hosti: bitta Contabo VPS'dan boshlanadi [qaror]

Ilova (`build.gradle.kts:25`) va CI (`1067-taxi/.github/workflows/deploy.yml`) hali **Render+Vercel**'ga
qotirilgan. BirJoy uchun Render/Vercel **o'lik** (MEMORY: render-vercel-suspended). **Qaror: 1067-taxi
bitta Contabo VPS'ga (169.58.55.249) birlashtiriladi** — ilova base URL, CI deploy, DB — hammasi VPS'da.
B alohida `systemd` servis + o'z Postgres+PostGIS + Redis bilan A yonida yashaydi; tanga faqat A
bazasida (§5). **F2 yuk sinovi ehtiyoj ko'rsatsa** taxi alohida VPS'ga ajratiladi — hozir emas.

## 7. Ikki Telegram bot [taklif→qaror kutadi]

B'ning o'z boti `@koson1067bot` jonli, o'z buyurtma oqimi bilan. A ham bot. **B'ning mijoz oqimi
o'chiriladi**, faqat haydovchi OTP/xabarnomasi qoladi. Ikkita bot bitta bozorda boqilmaydi, ikkita
mijoz identifikatori yaratilmaydi.

---

# IV QISM — TIZIM XARITASI

```
                        ┌──────────────────────────┐
                        │   DISPETCHERLIK YADROSI  │  ← F: dispatch(B)+narx+pul(tanga A'da)
                        └───────────┬──────────────┘
        ┌───────────┬───────────────┼───────────────┬───────────┐
   A. HAYDOVCHI  B. KONSOL     C. TELEFONIYA   D. RATSIYA   E. MIJOZ
      Android      (admin)         (CTI)          (PTT)      bot + tanga
                                                                  │
                                                          G. FIRIBGARLIK QALQONI
```

| Sirt | Holat [audit] | Asosiy kamchilik | Ish |
|---|---|---|---|
| **A. Haydovchi Android** | UI ~85%, fon ~30% | FCM o'lik · socket UI'ga bog'langan · offline navbat yo'q · hardening | **Katta (22-26 kun)** |
| **B. Dispetcher konsoli** | 26 sahifa bor | `no_drivers` qutqarish paneli yetib bo'lmaydi (K1) | O'rta |
| **C. Telefoniya / CTI** | Server endpoint bor, ekran yo'q | — | O'rta |
| **D. Ratsiya (PTT)** | Yo'q | — | O'rta |
| **E. Mijoz (bot + tanga)** | Bot jonli | `BirJoySource` + tanga birlashuvi | Kichik-O'rta |
| **F. Yadro** | 39 modul ulangan | K1-K7 (dispatch/narx/pul/auth) | **O'rta-Katta** |
| **G. Firibgarlik qalqoni** | Yo'q | — | Katta |

---

# V QISM — HAR SIRT UCHUN TALABLAR (audit kamchiliklari qo'shilgan)

## A. HAYDOVCHI ANDROID ILOVASI

**Tamoyil:** bizning ilova haydovchini **chaqiradi** (Yandex tartibga soladi — teskari). Bosh ekran
yarmi bitta raqam: *bugungi daromad* + katta ONLAYN tugmasi + issiqlik xaritasi + maqsad qatori.

**Taklif kartasi (eng muhim 15 soniya):** olib ketish joyi nomi (katta) · sizgacha masofa · mijoz
belgisi · sanoq halqasi. **Manzil YO'Q.** Qabul = surish.

**Transport — 3 kanal (raqibni uzadi):** FCM push (o'ldirilgan ilovani uyg'otadi) · WebSocket ·
foreground service + polling. Kas'da faqat 2-kanal.

**⚠️ Audit topgan haqiqat (v1'da yo'q edi):**
- **K4 — FCM ikkala tomonda o'lik.** Server `dispatch.service.ts` dan `sendToDriver` chaqirmaydi;
  ilovada `google-services.json` va gms plagini yo'q → Firebase ishga tushmaydi. **Bu #1 P0.**
- **Socket faqat `HomeViewModel.kt:316` dan ulanadi** — ilova process o'lsa qayta ulanmaydi;
  `START_STICKY` behuda. Socket egaligi servisga/singleton sessiyaga ko'chiriladi.
- **Offline navbat o'lik kod** (`DataStore.kt:154-161` chaqirilmaydi) — accept/reject jimgina yo'qoladi.
- **BootReceiver ruxsati bor, receiver YO'Q** — telefon yonganda haydovchi offline qoladi.
- **OEM autostart yo'q** (Xiaomi/Oppo/Vivo) — AOSP batareya whitelist yetarli emas.
- **5 o'lik tugma** (Ballar "hammasi" · Profil "avto tahrir" · Settings ×2 · comparePct).
- **Prod-hardening bloklovchi (K8):** release **debug kalit** bilan imzolanadi · `proguard-rules.pro`
  yo'q lekin minify yoqilgan → release runtime'da yiqilishi mumkin · cleartext ochiq.

**minSdk 26 → 23:** texnik oson (desugaring + 4 guard, ~0.5 kun), lekin **avval o'lchang** —
`driver_sessions.deviceModel/appVersion` da jonli qurilma taqsimoti bor. <26 qurilma 1-2% bo'lsa,
2 kunni fon rejimiga sarflagan afzal.

**Chidamlilik:** offline navbat · holat tiklash (taximetr diskka saqlanadi — hozir tiklanishda nolga
tushadi) · BootReceiver · WorkManager qorovul · OEM yordamchisi · batareya ≤25%/8soat.

## B. DISPETCHER KONSOLI

**Ekranning yagona vazifasi — muammoni ko'rsatish.** Yaxshi ketayotgan buyurtmalar jim turadi.
Signal: 🔴 haydovchi topilmayapti · 🔴 kechikyapti · 🟠 mijoz ikkinchi qo'ng'iroq · 🟠 safar uzoq ·
🟡 zonada mashina yo'q.

**⚠️ K1 (v1'da yo'q edi):** `no_drivers` buyurtma operator ekranidan millisekundlarda o'chadi
(`socket.gateway.ts:293-302`), qutqarish tugmasi kodda bor lekin **yetib bo'lmaydi**. **F1-core P0:**
`no_drivers` ni terminal holatdan chiqarish + alohida "rescue queue" paneli.

Ekranlar: jonli xarita · navbat · qo'lda tayinlash · operator buyurtmasi · haydovchi/mijoz 360 ·
moliya · KPI · firibgarlik · sozlama. 26 sahifa bor — qayta tartib + signal mantiqi.

## C. TELEFONIYA / CTI

Qo'ng'iroq 89.4% (1748/oy) [ega]. Oqim: jiringlaydi → raqam taniladi → mijoz kartasi o'zi ochiladi →
tasdiq → avtomatik tayinlash. **Maqsad: 20 soniya.** Server endpointlari bor. **Qaror [ega]: SIP**
(kompyuterda, telefonga bog'liq emas).

## D. RATSIYA (PTT)

Bu bozorda dispetcher va haydovchi gaplashadi (madaniy fakt). Alohida ilova emas — konsol va ilova
ichida. Kanallar: hammaga / zonaga / bitta. **Qaror [ega]: LiveKit.**

## E. MIJOZ TOMONI

Bot jonli. Ish: `BirJoySource` ulangach hamma narsa avvalgidek + tanga birlashuvi (§5). Mijoz
tangada yashaydi. **1067-taxi Mini App rivojlantirilmaydi.** F5: qo'ng'iroqdan ilovaga bitta yumshoq
xabar bilan ko'chirish.

## F. DISPETCHERLIK YADROSI

**Tayinlash:** 1-doira eng yaqin N, 15s → yo'q → radius kengayadi → yo'q → **operator signali,
buyurtma O'LMAYDI.** ⚠️ Audit: hozir kod TESKARI (K1/K2/K3).

**⚠️ Audit topgan yadro kamchiliklari (F1-core P0):**
- **K2** — o'lik buyurtma sweep'i yo'q → `dispatching`da abadiy osiladi. `*/1` cron qo'shiladi.
- **K3** — arvoh haydovchi Redis GEO'da abadiy → `handleDisconnect`da tozalash + heartbeat sweep.
- **K5** — yakuniy narx surge/vehicle-class'ni tashlaydi (`orders.service.ts:163-167`) → options
  uzatiladi + regressiya testi.
- **K6** — komissiya `db.transaction`siz, idempotentsiz + haydovchi balansi tekshirilmaydi →
  atomik `sql` + `unique(orderId)` + dispatch filtriga balans sharti.
- **Radius kengaymaydi** (5km qat'iy), **ketma-ket bitta-bitta taklif** (75s eng yomon) → to'lqinli
  model (F4).

**Narx:** GPS taximetr (asosiy, to'g'ri mexanika) + zona + vaqt + surge. ⚠️ Vaqt zonasi xatosi
(`getHours()` server vaqti — `TZ=Asia/Tashkent` o'rnatilsin).

**Zanjirli buyurtma** [taklif]: safar tugashiga yaqin keyingi buyurtma oldindan taklif — bo'sh
vaqtni qisqartiradi, ta'minotni **mashina qo'shmasdan** samaraliroq qiladi.

## G. FIRIBGARLIK QALQONI

Pul bor joyda firibgarlik bor. Soxta GPS (`isFromMockProvider`, teleport) · soxta safar (takror
juftlik) · ko'p akkaunt (qurilma ID/SIM) · balans manipulyatsiyasi (`CoinTxn` idempotent) · sun'iy
bekor qilish. **Buzilmas:** §5.7 invariantlar.

## H. ANALITIKA

O'lchanishi shart: tayinlash vaqti (median/p95) · rad javobi sababi · onlayn mashina-soati · onlayn
ulush · taklif qabul foizi · operator vaqti · **buyurtma o'lim sababi**. O'lchamaydigan narsani
yaxshilab bo'lmaydi — o'lchov F1'da quriladi.

---

# VI QISM — HAMMA CASE'LAR (50 + audit belgilari)

Har biri test bo'ladi. ⚠️ = audit KODDA teskari yoki yo'q ekanini topdi (endi P0).

## V1. Buyurtma hayot sikli
| # | Case | Kutilgan xatti-harakat |
|---|---|---|
| 1 | Liniyada haydovchi yo'q | Mijozga rost, navbatda qoladi, operator ko'radi |
| 2 | Hech kim qabul qilmadi | ⚠️ **K1** — hozir operatordan yo'qoladi; doira kengaysin, o'lmasin |
| 3 | Qabul→bekor | Darhol qayta tarqatiladi (⚠️ hisoblagich to'qnashuvi — `dispatchAttempt` 5 vs 3) |
| 4 | Yetib keldi, chiqmadi | Bepul kutish → kutish tarifi → bekor |
| 5 | Mijoz ketdi | Bekor + kompensatsiya qoidasi [ega] |
| 6 | GPS yo'qoldi | Oxirgi nuqtadan davom, taximetr to'xtamaydi |
| 7 | Ilova o'ldi | ⚠️ Tiklanadi, LEKIN taximetr nolga tushadi (`HomeViewModel.kt:64`) → diskka saqlansin |
| 8 | Pul bermadi | Haydovchi belgilaydi, operator ko'radi |
| 9 | Dublikat | ⚠️ **K6** — idempotent kalit (2 daqiqa oynasi) |
| 10 | Ikki kanaldan | Birlashtiriladi |
| 11 | Osilib qoldi | ⚠️ **K2** — sweep yo'q; qo'shilsin. 8 soat = 0 |
| 12 | Rejalashtirilgan | 15 daq oldin tarqatiladi |
| 13 | Shahar tashqarisi | Alohida tarif |
| 14 | Ko'p to'xtash | `order_stops` bor |

## V2. Haydovchi ilovasi
| # | Case | Xatti-harakat |
|---|---|---|
| 15 | OEM o'ldirdi | ⚠️ **K4** — FCM push uyg'otadi (hozir o'lik) |
| 16 | Internet uzildi | ⚠️ Offline navbat (hozir o'lik kod) |
| 17 | GPS o'chiq | Onlayn bloklanadi |
| 18 | Batareya tejash | Ogohlantirish + OEM yo'riqnoma |
| 19 | Eski telefon 5-7 | minSdk o'lchovi |
| 20 | SIM almashdi | Qayta kirish |
| 21 | Ikki telefon | Oxirgi kirish g'olib |
| 22 | Soxta GPS | Aniqlash + bloklash |
| 23 | Fonda taklif | ⚠️ Overlay (hozir faqat Home tab'da ko'rinadi) |
| 24 | Qo'ng'iroqda taklif | Overlay + ovoz pasayadi |
| 25 | Ovoz o'chiq | Tebranish + ekran yonadi (⚠️ `setShowWhenLocked` yo'q) |
| 26 | Qayta yoqildi | ⚠️ BootReceiver (hozir yo'q) |

## V3. Pul (tanga)
| # | Case | Xatti-harakat |
|---|---|---|
| 27 | Balans yetmaydi | ⚠️ **K6** — hozir tekshirilmaydi; qarz limitigacha ishlaydi |
| 28 | Qarz oshdi | Onlayn bloklanadi |
| 29 | Ikki marta yozildi | ⚠️ **K6** — idempotent kalit (= `dispatchBookingId`) |
| 30 | Bekor komissiyasi | Qoida [ega]: kim bekor qildi |
| 31 | Mijoz tanga bilan to'ladi | §5 — ≤350, `CoinTxn`, korp-ledger alohida |
| 32 | To'lov tasdiqlanmadi | Kutish holati |
| 33 | Migratsiyada balans farq | O'tish to'xtaydi (tiyingacha mos) |

## V4. Operator
34 raqam tanilmadi → yangi karta · 35 ikki qo'ng'iroq → qizil · 36 qo'lda tayinlash → audit ·
37 javob bermayapti → ratsiya→qayta · 38 shikoyat → tiket · 39 smena tugadi → o'tadi.

## V5. Tizim
40 server yiqildi → alert+restart · 41 baza sekin → navbat · 42 soyada kas javob yo'q → mijoz
ta'sirlanmaydi · 43 deploy → graceful · 44 rozlashmadi → kas ustun (soya) · 45 katalog ko'chmadi →
**o'tish bloklanadi**.

## V6. Xavfsizlik
46 akkaunt o'g'ri → qurilma bog'lash · 47 ma'lumot so'rovi → ko'rish/o'chirish · 48 GPS iz →
muddat bilan o'chadi · 49 ovoz → yashirin tinglash YO'Q · 50 hujjat muddati → ogohlantirish→bloklash ·
⚠️ **K7** — OTP brute-force (6 xona + verify throttle + eski kod bekor).

---

# VII QISM — FAZALAR VA BACKLOG (gap-yopish rejasi)

## Fazalar va darvozalar

| Faza | Nima | Qabul darvozasi |
|---|---|---|
| **F0** | Audit | ✅ **BAJARILDI** — 3 audit, ~50% haqiqat |
| **F0.5** | Zaxira + token + B-balls tekshiruvi | `git bundle` (push emas) · PAT revoke · B `clients.balls` real/seed aniqlandi |
| **F1-core** | Yadro P0 (K1,K2,K3,K5,K6,K7) | 6 P0 yopilgan, har biri buyruq+natija bilan isbot; typecheck+test yashil |
| **F1-bridge** | `BirJoySource` + tanga birlashuvi (§5) | 27/27 metod · `KAS_MODE=live`da bayt-bir xil · flag yoqilmagan · tanga invariantlari (§5.7) |
| **F2** | Soya rejimi | 7 kun · 500+ buyurtma · >95% moslik · narx farqi <3% · 0 halokat |
| **F3** | Ilova hardening + dala sinovi (5 haydovchi) | K8 yopilgan · FCM tirik · 15 real safar · pul 3 joyda to'g'ri · batareya ≤25%/8soat · 4/5 "yaxshi" |
| **F4** | Onlayn-ulush hujumi + dispatch to'lqin | onlayn 16.5→40+ · rad <12% · `simEconomy` yashil |
| **F5** | Konsol + CTI + ratsiya | operator <20s · ilova ulush 10.6%→30% |
| **F6** | Firibgarlik qalqoni | 5 xavfning har biri aniqlash+test |
| **F7** | Motivatsiya + safar-tanga (flag) | onlayn 40→158 yo'nalishi · rad <5% |
| **F8** | Mijozni ko'chirish | ilova ulush →60% · rad oshmagan |
| **F9** | Kas'dan uzilish | hamma darvoza yashil · katalog+balans ko'chgan · ega telefonда qabul · 30 kun orqaga qaytish ochiq |

**Qoida:** oldingi darvoza yashil bo'lmaguncha keyingisi boshlanmaydi.

## P0 BACKLOG (audit'dan — ustuvorlik bo'yicha)

Jamoa: **TS** = backend/bot muhandisi · **KT** = Android muhandisi. Kun = 1 muhandis-kun.

| # | Ish | Sirt | Faza | Jamoa | Kun | DoD (isbot) |
|---|---|---|---|---|---|---|
| P0-1 | `no_drivers` qutqarish (K1) | B+F | F1-core | TS | 2-3 | `no_drivers` operator panelda ko'rinadi + qo'lda tayinlanadi; e2e test |
| P0-2 | O'lik buyurtma sweep (K2) | F | F1-core | TS | 1-2 | `*/1` cron `dispatching`+eski → qayta/operator; test bilan |
| P0-3 | Arvoh haydovchi tozalash (K3) | F | F1-core | TS | 1 | `handleDisconnect`→GEO chiqarish+DB offline; heartbeat sweep |
| P0-4 | Yakuniy narx surge/class (K5) | F | F1-core | TS | 0.5 | quoted=charged; surge×class×zona×vaqt regressiya testi |
| P0-5 | Komissiya atomik+idempotent+balans (K6) | F | F1-core | TS | 1-2 | `db.transaction`+`unique(orderId)`; minus balans buyurtma olmaydi |
| P0-6 | OTP 6 xona + throttle (K7) | F | F1-core | TS | 1 | verify 5/15daq + eski kod bekor + 5 xatoda bloklash |
| P0-7 | FCM server tomoni (K4a) | F | F3 | TS | 1 | `dispatch.service`→`sendToDriver` data-payload; log bilan |
| P0-8 | FCM ilova tomoni (K4b) | A | F3 | KT | 1 | `google-services.json`+gms plagini; token DB'ga tushadi |
| P0-9 | Socket egaligini servisga ko'chirish | A | F3 | KT | 2 | process o'lsa qayta ulanadi; taklif yo'qolmaydi |
| P0-10 | Prod-hardening (K8) | A | F3 | KT | 2-3 | prod imzo + `proguard-rules.pro` + cleartext o'chiq; release APK ishga tushadi |
| P0-11 | `BirJoySource` 27 metod + tanga (§5) | E+F | F1-bridge | TS | ~ (F-bosqich) | 27/27 · paritet-testi · `live`da bir xil · invariantlar (§5.7) |

**F1-core (P0-1..6) ≈ 6.5-9.5 kun (TS).**
**Ilova P0 (P0-7..10) + qolgan bloklar (offline navbat, boot, overlay, holat, birinchi-kontakt) ≈ 22-26 kun (KT).**

## P1 BACKLOG (pilot davomida og'riq)

Admin refresh endpoint (operator har 15daq login) · `TZ=Asia/Tashkent` · re-dispatch byudjet
to'qnashuvi (5 vs 3) · radius kengayishi · to'lqinli taklif · `zoneAffinity` o'lik og'irlik · Mini App
buyurtma (kerak emas — bot) · refresh token DB'da ochiq · APK URL build'ga qotirilgan · Socket CORS
`*` · dev-OTP `NODE_ENV`ga bog'liq · deploy Render→VPS (§6) · 5 o'lik tugma · BootReceiver ·
WorkManager · OEM autostart · offline navbat.

## Ketma-ketlik va parallellik

- **TS jamoa** (F1-core P0-1..6) va **KT jamoa** (ilova P0-7..10 + bloklar) **parallel** ketadi —
  turli skill.
- **FCM (P0-7 TS + P0-8 KT) birinchi navbatda BIRGA** — raqibdan yagona ustunlik quroli, ikki tomonlama.
- F1-bridge (`BirJoySource`) F1-core yashil bo'lgach boshlanadi (yadro barqaror bo'lmasa ko'prik qurilmaydi).

## Realistik kalendar (yangilangan)

| Davr | Nima |
|---|---|
| Hafta 0 | F0.5 (bundle+token+B-balls), F1-core boshlanadi |
| Hafta 1-2 | F1-core (TS) + ilova hardening/FCM (KT) parallel |
| Hafta 2-3 | F1-bridge (`BirJoySource`+tanga), F2 soya boshlanadi |
| Hafta 3-4 | F3 dala sinovi (5 haydovchi) — **birinchi real safar** |
| Hafta 5-8 | F4 (onlayn-ulush+to'lqin), F5 (konsol/CTI/ratsiya) |
| Hafta 9-12 | F6 (firibgarlik), F7 (motivatsiya+safar-tanga), 50 haydovchigacha |
| Hafta 13+ | F8 (mijozni ko'chirish) → F9 (kas'dan uzilish) |

Bu — F0 haqiqatiga qurilgan taxmin. Kod tezligi to'siq emas; to'siq — dala sinovi va ega qarorlari.

---

# VIII QISM — XAVFLAR

| Xavf | Ehtimol | Zarar | Oldini olish |
|---|---|---|---|
| APK real telefonda ishlamaydi | **Yuqori** | Yuqori | F3 eng erta, 5 haydovchi + birinchi-kontakt buferi |
| minSdk 26 → eski telefon chetda | Yuqori | Yuqori | F0.5 o'lchash, kerak bo'lsa 23 |
| Manzil katalogi ko'chmaydi | O'rta | **Halokatli** | Bittalab test, fuzzy TAQIQ |
| Haydovchi balansi noto'g'ri ko'chadi | O'rta | **Halokatli** | Tiyingacha solishtiruv, mos kelmasa to'xtash |
| **Cross-DB tanga (yangi)** — B safar, A tanga | O'rta | Yuqori | Faqat A yozadi · idempotent = `dispatchBookingId` · sweep, poller emas (§5.7) |
| **Clamp chetlab o'tilishi (yangi)** | Past | **Halokatli** | Yagona daftar (A), parallel `bonus_uzs` YO'Q; taxi mukofoti clamp'dan o'tadi |
| FCM ikki tomonda o'lik qoladi | O'rta | Yuqori | P0-7+P0-8 birga, F3 darvozasida telefonда sinov |
| 550 haydovchi o'rnatmaydi | Yuqori | Yuqori | 5→50→550, har bosqichda sabab |
| 8 commit diskda yo'qoladi | Past | **Qaytarib bo'lmaydi** | `git bundle` (F0.5) — push emas (deploy tetiklaydi) |
| Ega-preview aldovi | O'rta | Yuqori | Har flagda "oddiy mijoz nima ko'radi?" |
| Talab ta'minotdan oldin o'sadi | O'rta | Yuqori | F8, F7'dan keyin |

---

# IX QISM — NIMA QILINMAYDI

"Qayerga borasiz?" maydoni · xarita ignasi asosiy yo'l · mijozga masofa · sovrin bilan yalang'och
talabni pompash · kas kodini ko'chirish (spetsifikatsiya o'qiladi) · yashirin ovoz tinglash · alohida
ratsiya ilovasi · 1067-taxi Mini App · **yangi git shoxobcha** · **yangi poller** (sweep kengayadi) ·
**B'ga parallel `bonus_uzs` daftari** · katta-bang o'tish (soyasiz).

---

# X QISM — BUGUNGI ISH + EGA QARORLARI

## Bugunoq (qarorsiz)
1. **GitHub PAT revoke** — ikkala repo `.git/config` da ochiq. Ega revoke qiladi, men remote'ni
   tokensiz holga keltiraman.
2. **`git bundle`** — 1067-taxi 8 commit bitta faylga (push EMAS — deploy tetiklaydi).

## Ega qaror beradigan (qolgan)
| # | Savol | Tavsiyam |
|---|---|---|
| 1 | Reja (v2) tasdiqlanadimi? Fazalar tartibi to'g'rimi? | Ha |
| 2 | Tanga raqamlari N1/N2/N3 (§5.9) | Mavjud tezlik saqlanadi; safar-tanga F7'gacha O'CHIQ |
| 3 | ~~Deploy host?~~ ✅ **QAROR: bitta Contabo VPS'dan boshlanadi** (F2'dan keyin qayta ko'riladi) | — |
| 4 | `@koson1067bot` mijoz oqimi o'chiriladimi? (§7) | Ha, faqat haydovchi qoladi |
| 5 | F3 uchun 5 haydovchi — kimlar? | Eng faol, ega shaxsan taniydigan |
| 6 | Eskiz SMS — kim, qachon? | F3'dan oldin, ega ochadi |
| 7 | Telefoniya SIP · ratsiya LiveKit? | Ha, ikkalasi |
| 8 | Bekor komissiyasi qoidasi? | Kim bekor qildi — shunga qarab |
| 9 | Kas obunasi F9'dan keyin necha kun? | 30 kun, orqaga qaytish ochiq |

---

*v2 o'lchangan faktlar + F0 audit isbotiga suyanadi. Har "0/hammasi" da'vosi buyruq+natija bilan
isbotlanadi (CLAUDE.md DoD). Foydalanuvchiga ko'rinadigan har narsa — ega real telefonda qabul
bergandan keyin flag yoqiladi.*
