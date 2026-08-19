# 🏢 XIZMATLAR → BIRJOY BIZNES — DIZAYN + REJA v1

> Ega so'zi (2026-08-18): «Xizmatlar bo'limini yaxshilash — biznes O'Z KATALOGINI qo'ya olsin,
> NARXLARNI moslasin, sahifasi KUCHLI UX dizayn bo'lsin, cashbacklarni FLEXIBLE sozlasin, HAMMA
> o'z hamyoniga ega bo'lsin. Stadion birinchi mijoz, keyin balki do'konlar, sotuvchilar,
> restoranlar ham biznesini gamification'ga ulaydi. Biz bizneslarni o'sishiga yordam beramiz —
> o'z cashback bera olish tizimimiz bilan.»
>
> **Holat: DIZAYN — kod yozilmagan, egadan TASDIQ kutilmoqda.**
> Manba: 4 ta parallel kod-audit (Xizmatlar moduli · sotuvchi self-serve naqshi · dizayn tizimi ·
> pul invariantlari), har da'vo `file:line` bilan tekshirilgan.

---

## §0. Audit nimani ochdi (bu butun rejaning sababi)

**Xizmatlar o'lik emas — u BO'SH.** Jonli o'lchov (PROGRESS.md:1489-1491): **139 faol xizmat,
lekin 137 tasida foto yoki ish vaqti YO'Q; 30 kunda jami 45 qo'ng'iroq va ular atigi 10 ta
e'longa tushgan.** Ya'ni to'siq — biznes yetishmasligi emas, **kartalarning bo'shligi**.

Sabab kodda ochiq turibdi: **biznes egasi o'z e'lonini tahrirlay olmaydi.** Bugun u faqat
uchta narsa qila oladi — e'lon yuborish (`submitListing`, serviceDirectory.ts:250), o'z e'loniga
rasm qo'shish (`uploadMyServicePhoto`, :724), telefon-mos «Bu meniki» da'vosi (`claimListing`,
:798). Nom, telefon, tavsif, manzil, ish vaqti, **narxlar** — hammasi `requireOwner` ostida
(server.ts:3366, :3400). Telefoni o'zgargan usta o'zi tuzata olmaydi — sizga yozishi kerak.

**Narx «katalog» emas.** `ServicePriceItem` (schema.prisma:1454) — «yorliq + so'm» satri, sxema
izohining o'zi aytadi: «Bu NARX KO'RSATISH xolos» (:1453). Rasm yo'q, bo'lim yo'q, tavsif yo'q,
mavjudlik yo'q. Admin uni bitta textarea'ga «nom; narx» ko'rinishida yozadi (App.tsx:2734).

**Va eshik yopiq.** ⚠️ **Oldingi xabarimda «`xizmatlar` bayrog'i OFF» degandim — noto'g'ri.**
Bayroq `EXPECTED_ON` ro'yxatida, «owner GO LIVE 2026-07-06» izohi bilan (featureFlags.ts:252) —
ya'ni jonlida YOQIQ. Lekin uy ekranida `FOCUS_MODE = true` (uy.tsx:387) uni **qulflab qo'ygan**:
Xizmat katagi bosilsa «🔒 Tez orada! Hozircha Do'kon, Restoran va Taxi'ga fokuslanyapmiz»
chiqadi (uy.tsx:446, :660). Ya'ni modul yoqiq, sahifasi bor, lekin **uyga chiqadigan eshigi
yopiq**. Buni ochish — birinchi to'lqinning bir qatorlik qismi va ega qaroriga bog'liq.

**Xulosa:** biznes platformasi uchun poydevor allaqachon bor (e'lon, egalik-identity, telefon
bilan da'vo, moderatsiya, foto-quvuri, reyting, bot-kartochkalari). Yetmayotgani aniq uchta
narsa: **(1) biznes yozadigan sirt, (2) haqiqiy katalog, (3) hamyon halqasi.**

---

## §1. Arxitektura yadrosi — bitta jadval butun kelajakni ochadi

Ega dedi: «keyin do'konlar, sotuvchilar, restoranlar ham ulanadi». Agar hamyonni
`ServiceListing.id` ga bog'lasak, do'kon (`MarketShop`) va stadion (`Stadium`) hech qachon
ulanolmaydi — ularning e'loni yo'q. Shuning uchun **biznes-identiteti alohida**:

```prisma
model Biz {                     // BITTA biznes = BITTA qator, qaysi bo'limda ekanidan qat'i nazar
  id            Int      @id @default(autoincrement())
  kind          String              // "xizmat" | "dokon" | "stadion"  (keyin: "restoran")
  refId         Int                 // ServiceListing.id | MarketShop.id | Stadium.id
  name          String              // ko'rsatish nusxasi — hamyon ro'yxati JOIN'siz chiziladi
  ownerTgId     BigInt?             // kim boshqaradi (claim orqali keladi)
  chatId        String?             // tasdiq-kartochkalari shu chatga
  cashbackPct   Float    @default(0)
  redeemMaxPct  Int      @default(30)
  minSaleSom    Int      @default(0)
  firstVisitPct Float    @default(0)   // birinchi tashrif qo'shimchasi
  quietFromMin  Int?                   // «jim soatlar» boshlanishi
  quietToMin    Int?
  quietPct      Float    @default(0)
  stampGoal     Int      @default(0)   // 0 = shtamp karta o'chiq
  stampReward   String?
  active        Boolean  @default(false)  // DARK yaratiladi, EGA yoqadi
  pausedAt      DateTime?
  createdAt, updatedAt
  @@unique([kind, refId])
  @@index([active])
}
```

Hamyon, savdo va jurnal **`Biz.id` ga qattiq FK** bilan bog'lanadi — polimorf «loose FK» YO'Q
(pul-audit aynan bundan ogohlantirdi). Natija: stadion, do'kon, xizmat — uchalasi ham bitta
hamyon tizimida, hech qanday qayta yozishsiz.

```prisma
model BizWallet {                    // MIJOZ × BIZNES qoldig'i, SO'MDA
  id, bizId, memberId, balanceSom Int @default(0), earnedSom, spentSom, lastSaleAt, updatedAt
  @@unique([bizId, memberId])
  @@index([memberId, balanceSom])
}

model BizSale {                      // bitta xarid: mijoz so'raydi → egasi tasdiqlaydi
  id, bizId, memberId
  amountSom Int                      // umumiy chek
  redeemSom Int @default(0)          // hamyondan to'landi
  cashSom   Int                      // naqd to'landi  (INV-5: cashback SHUNDAN hisoblanadi)
  earnSom   Int @default(0)          // hamyonga tushdi
  pctApplied Float @default(0)       // SNAPSHOT — keyin biznes foizni o'zgartirsa tarix buzilmaydi
  status String @default("pending")  // pending|confirmed|rejected|expired
  expiresAt, confirmedAt?, rejectReason?, slaAlertedAt?, createdAt
  @@index([bizId, status, createdAt])
  @@index([memberId, createdAt])
}

model BizWalletTxn {                 // o'zgarmas jurnal — har harakat bitta qator
  id, bizId, memberId, amountSom Int, saleId Int?, kind String, balanceAfter Int, createdAt
  @@unique([saleId, kind])           // idempotentlik: bir savdo bir marta
  @@index([bizId, memberId, createdAt])
}

model BizDaily {                     // kunlik cap — in-memory lock'siz, poyga-xavfsiz
  id, bizId, memberId, dayKey String, earnedSom Int @default(0)
  @@unique([bizId, memberId, dayKey])
}
```

**Katalog uchun YANGI jadval OCHILMAYDI.** Har bo'lim o'z katalogini saqlaydi (`ServicePriceItem`
· `Product` · `Stadium` slotlari), mijoz ekraniga esa BITTA **o'qish-modeli** proyeksiya qilinadi:
`BizCatalogItem { id, name, desc, priceSom, photoUrl, section, available }`. Ya'ni bitta UI, nol
migratsiya, jonli ma'lumotga nol xavf. `ServicePriceItem` esa haqiqiy katalogga aylanishi uchun
4 ta maydon oladi: `desc`, `section`, `photoFileId/photoUrl`, `available`.

---

## §2. Pul invariantlari (audit topgan, buzilmaydi)

| # | Invariant | Manba |
|---|---|---|
| INV-A | `CoinTxn` ga BITTA qator ham yozilmaydi — biznes hamyoni so'mda | schema.prisma:353 · reyting/`getWallet` ifloslanmaydi |
| INV-B | ≤350 tanga/safar clamp'ga tegilmaydi (`grantRideCoins` umuman chaqirilmaydi) | coinService.ts:86-114 |
| INV-C | Withdraw eshigiga ulanmaydi — so'm-qoldiq naqdga aylanmaydi | coinService.ts:233-349 |
| INV-D | `Member.points` / `coins` / `ballPoints` — tegilmaydi | schema.prisma:23-38 |
| INV-E | `withMemberLock` ga TAYANMAYDI — himoya DB shartli update'da | ARCHITECTURE.md:84 |
| INV-F | Yangi poller YO'Q — expire/SLA mavjud tiklarda | marketOrderService.ts:242 naqshi |
| INV-G | Har savdo idempotent: `BizSale` shartli flip + `BizWalletTxn` unique kaliti | shopService.ts:643-655 naqshi |
| INV-H | Hamyon manfiy bo'lmaydi: `where: { balanceSom: { gte: redeemSom } }` + `count===1` | corpService.ts:28-30 naqshi |
| INV-I | Cashbackdan cashback YO'Q — baza faqat `cashSom` | yangi qoida (cheksiz halqa oldi) |
| INV-J | Bir xaridda hamyondan to'lash ≤ `redeemMaxPct` | yangi qoida |
| INV-K | UI'da «<Biznes> hamyoni» — «cashback» so'zi kas-cashback uchun band | coinService.ts:215 |

**Qoida o'zgarishi o'tmishga ta'sir qilmaydi:** har savdo `pctApplied` ni muhrlaydi. Biznes
ertaga 5% dan 2% ga tushsa — kechagi hamyon tegilmaydi, faqat yangi savdolar 2% oladi.

---

## §3. MIJOZ TOMONI — dizayn

### §3.1 Biznes sahifasi (asosiy ekran, `gl-*` sifat darajasida)

Bugungi `DetailSheet` (services.tsx:169) ishlaydi, lekin `svc.css` atigi 222 satr: `:focus-visible`
yo'q, 48px teginish-nishoni yo'q, skeleton↔real balandlik tokeni yo'q. Namuna sifatida `uy.tsx` +
`gl-*` (tokens.css:2143-2724) olinadi — 17 dizayn qoidasi AYNI bitta ekranda isbotlangan yagona joy.

```
┌─────────────────────────────────────┐
│ ◀  [rasm karuseli · 5 ta · nuqtalar]│   ← ServicePhoto (bor), Lightbox (bor)
│                        🟢 Ochiq     │
├─────────────────────────────────────┤
│ Chempion Kafe            ✔ 🏅1067   │
│ ★4.6 · 23 baho · 📞 45 marta        │
│─────────────────────────────────────│
│ 💰 SIZDA 30 000 so'm                │   ← HAMYON LENTASI (balans > 0)
│    Keyingi xaridda ishlating        │      BjTangaRibbon naqshi (birjoy.tsx:78)
│                    [Hamyondan to'lash]│
├─────────────────────────────────────┤
│ MENYU                               │   ← KATALOG (yangi)
│ ┌────┐ Lag'mon          25 000 so'm │
│ │ 🍜 │ qo'y go'shti, uyda tayyor    │
│ └────┘                              │
│ ┌────┐ Somsa             8 000 so'm │
│ ...                                 │
├─────────────────────────────────────┤
│ [📞 Qo'ng'iroq]  [🧭 Borish]  [↗]   │   ← mavjud amallar (44px+)
│ [💰 Savdo qildim]                    │   ← YANGI: asosiy pastki amal
└─────────────────────────────────────┘
```

**Hamyon lentasi — uch holat, uchtasi ham HALOL** (qoida #7: ma'lumotsiz element chizilmaydi):
- balans > 0 → `💰 Sizda 30 000 so'm · keyingi xaridda ishlating` + tugma.
- balans = 0, cashback bor → `💰 Har xariddan 5% qaytadi — shu yerda ishlatasiz`.
- cashback yo'q → **lenta umuman chizilmaydi** (bo'sh xrom yo'q, qoida #2).

**Nega hamyon narxlar USTIDA:** u qaytishning yagona sababi. Lekin u **lenta**, panel emas —
balandligi 44px, katalogni pastga surib yubormaydi.

**Katalog bitta tuzilma bilan hamma turga yaraydi:** `section` (ixtiyoriy bo'lim: «Issiq taom» /
«Soch olish» / «Sement») + qator (rasm 56×56 · nom · tavsif 1 qator · narx). Rasm yo'q bo'lsa —
rangli gradient + kategoriya emojisi (`bj-pcard-imgph` naqshi, qoida #10: bo'sh kulrang kvadrat
TAQIQ). `prettyName()` (util.ts:83) qo'llanadi — sotuvchilar CAPS LOCK bilan yozadi.

### §3.2 «Savdo qildim» — 3 bosishda tugaydi

```
[💰 Savdo qildim]
   ↓
┌──────────────────────────┐
│ Qancha to'ladingiz?      │
│      45 000              │   ← katta raqam-klaviatura, tez tugmalar: 20/50/100 ming
│ ─────────────────────    │
│ Sizga 2 250 so'm qaytadi │   ← JONLI hisob, har raqamda yangilanadi
│ [Yuborish]               │
└──────────────────────────┘
   ↓
⏳ «Chempion Kafe tasdiqlashini kutyapmiz» + [Bekor qilish]
   ↓ (egasi ✅ bosdi — o'rtacha 30 soniya)
✅ «+2 250 so'm hamyoningizga tushdi» · haptic · balans sanab o'sadi
```

Kutish ekrani **jim turmaydi**: 60 daqiqada javob bo'lmasa `expired` bo'ladi va mijozga
«Tasdiqlanmadi — kassirdan so'rang» + [Qayta yuborish] chiqadi (qoida #14).

### §3.3 «Hamyondan to'lash» — ega misoli (100 = 70 + 30)

```
Chek summasi:  100 000
Hamyoningiz:    30 000
──────────────────────
Hamyondan:  [——●———] 30 000     ← slayder, tepasi = min(balans, chek×redeemMaxPct)
Naqd:                70 000
[Yuborish]
```
Egasi botda ko'radi: «Bahodir — 100 000. **30 000 hamyondan**, siz **70 000 naqd** olasiz» [✅][❌].
✅ bosilganda BITTA tranzaksiyada: `BizSale` flip → hamyondan shartli debet → yangi cashback
(`cashSom` dan) → jurnal ikki qatori.

### §3.4 Kashfiyot — Xizmatlar bosh ekrani

- Yangi filtr-chip: **`💰 Qaytaradi`** (mavjud chip qatoriga qo'shiladi, services.tsx:672).
- Kartada `BjTangaRibbon` naqshidagi kichik lenta: `💰 5%` (amber — `--bj-tanga`, chegirma
  qizilidan ATAYLAB farqli, tokens.css:1214).
- Yangi qator: **«Hamyoningiz bor joylar»** — balansi > 0 bo'lgan bizneslar gorizontal rail.
  Bu eng kuchli qaytish sababi va u BOSH ekranda turadi.
- Uy ekranida `FOCUS_MODE` Xizmatlar uchun ochiladi (ega qarori) — aks holda hech kim ko'rmaydi.
- Hamyon tabida alohida blok: **«Biznes hamyonlari»** — tanga bilan ARALASHTIRILMAYDI (boshqa
  rang, «faqat o'sha joyda ishlaydi» izohi bilan).

---

## §4. BIZNES EGASI TOMONI — «Mening biznesim»

**Qayerda yashaydi: Mini App ichida, bot emas, admin panel emas.** Sabab: (a) egasi allaqachon
mijoz sifatida ilovada; (b) `ownerTgId` + telefon-claim identity ALLAQACHON ishlaydi
(serviceDirectory.ts:798) — yangi token, yangi login, yangi panel kerak emas; (c) do'kon
sotuvchisi uchun qurilgan token-panel naqshi (`shopseller`, server.ts:257-345) 200 ta kichik
biznes uchun og'ir — har biriga token berish va bekor qilish operatsion yuk.
**Istisno — kundalik ✅ tasdiqlash BOTDA:** kassirning telefoni cho'ntagida, u ilova ochmaydi.

### 5 ta varaq

**1 · Bugun** — `🔔 2 ta tasdiq kutmoqda` (eng tepada, bosilsa darhol ✅/❌) · bugungi savdo soni
va summasi · **«BirJoy sizga bu oyda 34 mijoz keltirdi»** (uni ushlab turadigan YAGONA raqam;
`BizSale` dan hisoblanadi, `viewCount/callCount` naqshi).

**2 · Katalog** — pozitsiyalar ro'yxati, narx joyida tahrirlanadi (bosdi → raqam-klaviatura →
saqlandi). Ikki qo'shish yo'li:
- `➕ Bitta qo'shish` — nom · narx · (ixtiyoriy) tavsif · rasm.
- **`📋 Ro'yxatni matndan qo'shish`** — bitta katta maydon, har satr bitta pozitsiya:
  `Lag'mon 25000` / `Somsa 8000`. **30 pozitsiya 2 daqiqada kiritiladi.** Bu bo'sh-katalog
  kasalligining haqiqiy davosi va u allaqachon adminda ishlaydigan naqsh (`svcParsePriceText`,
  admin/App.tsx:2734) — u `shared` ga ko'chiriladi va ikkala tomon bitta parserdan foydalanadi.

**3 · Cashback** — ikki rejim:
```
ODDIY (default)                    KENGAYTIRILGAN (ixtiyoriy 3 kalit)
Har xariddan  [—●———] 5%           ☐ Birinchi tashrif  +5%
                                    ☐ Jim soatlar 14:00–17:00  +3%
Misol: 100 000 so'mlik xaridda      ☐ Minimal chek  20 000 so'mdan
mijoz 5 000 so'm oladi.             ☐ Shtamp karta: 5 ta → 6-si bepul
Hamyondan to'lash: 30% gacha
```
Har o'zgarish tepada **jonli misol** bilan ko'rsatiladi — foiz emas, SO'M ko'rinadi. Global
chegaralar ega knoblarida (`bizMaxPct` 15%, `bizRedeemMaxPct` 50%, `bizSaleExpiryMin` 60) va
server har yozuvda `Math.min` bilan qisadi — bu bugungi `clampBonusEcon` (economy.ts:390) naqshi.

**4 · Sahifam** — nom · telefon · manzil · ish vaqti · tavsif · ijtimoiy havolalar · rasmlar
(qo'shish/o'chirish/tartib). **Bu 137/139 bo'sh karta muammosining to'g'ridan-to'g'ri davosi.**
Moderatsiya: nom/telefon/kategoriya o'zgarsa — egaga bot-kartochkasi (mavjud
`bot/xizmatlar.ts` naqshi); rasm/tavsif/narx — darhol jonli (past xavf).

**5 · Mijozlar** — kimda qancha hamyon bor, oxirgi qachon kelgan; `🔔 Qaytishga taklif` tugmasi
(B2 to'lqinida — mavjud push dvigateli, kunlik 2 cap va tun-soatlari hurmat qilinadi).

---

## §5. To'lqinlar (har biri alohida yetkaziladi va alohida QABUL qilinadi)

| # | Nomi | Ichida nima | Pul tegadimi | Hajm |
|---|---|---|---|---|
| **W1** | 🏪 Biznes o'z sahifasini oladi | «Mening biznesim» (profil · katalog · rasm · matndan import) · `ServicePriceItem` +4 maydon · egaga moderatsiya-kartochkalari · `FOCUS_MODE` ochilishi | YO'Q | ~900 satr |
| **W2** | ✨ Biznes sahifasi qayta dizayni | mijoz tomoni `gl-*` darajasida: katalog · galereya · amallar · skeleton tokenlari · kashfiyot chiplari | YO'Q | ~700 |
| **W3** | 🏟 Stadion | STADION_BIZNES_PLAN.md S1 (bron · so'rov→tasdiq · kun-panjara) | YO'Q | ~1600 |
| **W4** | 💰 Hamyon halqasi | `Biz` · `BizWallet` · `BizSale` · `BizWalletTxn` · `BizDaily` · savdo/sarflash oqimi · bot tasdiqlari · hamyon bloklari. **Stadion = biznes №1** | HA (yopiq halqa) | ~1300 |
| **W5** | 🎛 Flexible qoidalar | birinchi tashrif · jim soatlar · minimal chek · shtamp karta | HA | ~450 |
| **W6** | 📈 O'sish | «N mijoz keltirdik» paneli · qaytish taklifi · «hamyoningiz bor joylar» raili | HA | ~350 |

**Nega W1 birinchi:** u pulga tegmaydi, lekin bugungi eng katta og'riqni (137/139 bo'sh karta,
oyiga 45 qo'ng'iroq) darhol davolaydi. Hamyonni bo'sh katalog ustiga qurish — ochilmagan
do'konga kassa qo'yish bilan barobar.

---

## §6. Xavflar va yechimlar

| # | Xavf | Yechim | Isbot |
|---|---|---|---|
| 1 | Bo'sh katalog → platforma o'lik tug'iladi | matndan import (30 pozitsiya 2 daqiqada) + birinchi 20 biznesga BizJoy o'zi kiritadi (rasmini yuboradi) | W1 dan keyingi o'lchov: foto+narxli e'lonlar ulushi |
| 2 | Egasi o'zgartirib spam/aldov qilishi | nom/telefon/kategoriya — moderatsiya kartochkasi; narx/rasm — darhol; hammasi `AdminAuditLog` ga | jurnal qatori |
| 3 | Hamyon ikki marta sarflanishi | INV-H shartli debet + `count===1`, BITTA tranzaksiya | `testBiz.ts` parallel sarflash |
| 4 | Cashbackdan cashback (cheksiz halqa) | INV-I: baza faqat `cashSom` | test qatori |
| 5 | 100% hamyonga to'lash | INV-J `redeemMaxPct` + global `bizRedeemMaxPct` qisqichi | test qatori |
| 6 | Soxta summa | egasi ✅ bosmaguncha hech narsa bo'lmaydi; 60 daqiqada expire | oqim dizayni |
| 7 | Kunlik farm (bir kunda 20 «savdo») | `BizDaily` shartli update (in-memory lock'siz — audit tavsiyasi) | test qatori |
| 8 | Mijoz «bu BirJoy puli» deb o'ylashi | nom «<Biznes> hamyoni» + «faqat shu yerda ishlaydi» + tangadan alohida blok | ega ekranda ko'radi |
| 9 | Biznes qoidani orqaga o'zgartirib hamyonni buzishi | `pctApplied` snapshot; qoida o'tmishga ta'sir qilmaydi | test qatori |
| 10 | Moderatsiya bitta odamga bog'langan | bugun `OWNER_TG` qattiq kodlangan (bot/xizmatlar.ts:8) → W1 da `env.adminIds` ga o'tkaziladi | kod diff |
| 11 | Yangi poller | expire/SLA mavjud 15-daqiqalik tikda | `grep -c setInterval` o'zgarmaydi |
| 12 | Sxema push'i unutilsa jonli yiqiladi | VPS'da `migrate diff` → o'qish → `db push`, KEYIN kod push'i | CLAUDE.md qadamlari |

---

## §7. DoD — W1 (kod yozishdan OLDIN tasdiqlanadi)

| # | Qabul mezoni | Tekshiruv |
|---|---|---|
| 1 | Biznes egasi nom/telefon/manzil/soat/tavsifni O'ZI tahrirlaydi | jonli: ega o'z e'lonini tahrirlaydi, skrinshot |
| 2 | Biznes egasi katalogga pozitsiya qo'shadi va narx o'zgartiradi | jonli skrinshot + `/api/biz/catalog` javobi |
| 3 | Matndan import: 20 satr → 20 pozitsiya, xato satr aniq aytiladi | `pnpm --filter @t1067/shared test` (parser testi) |
| 4 | Begona odam boshqa e'lonni tahrirlay OLMAYDI | `ownerTgId` mos kelmasa 403 — test + qo'lda urinish |
| 5 | Nom/telefon o'zgarishi egaga kartochka bo'lib boradi | bot skrinshot + `AdminAuditLog` qatori |
| 6 | Rasm qo'shish/o'chirish/tartiblash ishlaydi (≤6) | jonli skrinshot |
| 7 | Pul harakati NOL | `grep -rn "grantCoins\|CoinTxn\|BizWallet" bizService.ts` → 0 |
| 8 | Bayroq OFF'da ilova AYNAN bugungidek | `#xizmat` skrinshot |
| 9 | `FOCUS_MODE` qarori bajarilgan (ochilgan yoki ataylab yopiq) | uy.tsx diff + ega tasdig'i |
| 10 | Typecheck + testlar toza | `pnpm -r typecheck` · `pnpm --filter @t1067/shared test` |
| 11 | Sxema VPS'da push qilingan | `migrate diff` chiqishi + `\d "ServicePriceItem"` |

W2–W6 DoD har to'lqin boshida alohida yoziladi (W4 uchun INV-A…INV-K ning har biri bitta test satri).

---

## §8. Ega qaroriga qolgan 3 savol

1. **`FOCUS_MODE` Xizmatlar uchun ochilsinmi?** Tavsiya: **HA, W1 bilan birga** — aks holda
   yaxshilangan sahifani hech kim ko'rmaydi. (Do'kon/Restoran/Taksi fokusi buzilmaydi: Xizmat
   katagi allaqachon panjarada turibdi, faqat qulf olinadi.)
2. **Birinchi 20 biznesni kim to'ldiradi?** Tavsiya: **biz** — biznes menyusining rasmini
   yuboradi, operator matndan import bilan kiritadi (2 daqiqa/biznes). Bu Ravella/restoran
   «concierge V1» naqshi va u ishlagan.
3. **Hamyon qoldig'i muddati bo'ladimi?** Tavsiya: **YO'Q** (V1) — muddat ishonchni yeydi, biz
   esa ishonch sotayapmiz. Kerak bo'lsa keyin ≥6 oy va ochiq yozilgan holda.

---

## §9. Birinchi qadam (tasdiqdan keyin)

`W1` boshlanadi: `ServicePriceItem` +4 maydon → `bizService.ts` (egalik-scoped CRUD) →
`/api/biz/*` routelari → «Mening biznesim» ekrani → matn-parser `shared` ga → moderatsiya
kartochkalari → testlar. Har fayldan keyin typecheck; oxirida DoD 11 qatori birma-bir
isbotlanadi va **«READY FOR VERIFICATION»** deyiladi. Push alohida ruxsatingiz bilan.
