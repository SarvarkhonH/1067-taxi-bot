# 🏟 STADION + 🏢 BIRJOY BIZNES — REJA v2

> Ega tavsifi (2026-08-18): «BirJoy ichida stadionlar bo'limini ochamiz — Ravellaning oldiga
> bo'ladi, admin panelda stadion qo'shiladi, shu yerdan stadion booking qilinadi. Va endi
> bizneslar add qilsa bo'ladi, ularning cashback tizimlari biz orqali o'tadi.»
>
> **Ega tuzatishi (v1 rejaga javob, 2026-08-18):** «Stadion ALOHIDA biznes. Cashbackni HAMMA
> beradi boshiga. Biznes turini tanlaydi, mijoz "savdo qildim" deydi, egasi tasdiqlaydi —
> shuncha cashback O'SHA BO'LIMDAGI cashback hamyoniga tushadi. Keyingi safar 100 ming oladi:
> 70 ming naqd, 30 ming cashback orqali to'laydi.»
>
> **Holat: REJA v2 — kod yozilmagan, egadan TASDIQ kutilmoqda.**

---

## §0. Ega tuzatishi nimani o'zgartirdi (v1 → v2)

v1 rejada cashback **global tanga** sifatida tasavvur qilingandi — biznes hisobidan tanga
chiqadi, mijoz uni istagan joyda ishlatadi yoki naqdga yechadi. **Ega boshqa narsani aytdi va
uniki ancha kuchli:**

| | v1 (mening xatoyim) | **v2 (ega modeli)** |
|---|---|---|
| Cashback nima | global tanga | **o'sha biznesning O'Z hamyoni** (so'mda) |
| Qayerda ishlatiladi | hamma joyda / naqdga | **faqat o'sha bizneste** |
| Kim to'laydi | biznes oldindan so'm quyadi | **biznes o'z tovari bilan** — oldindan to'lov SHART EMAS |
| BirJoy majburiyati | REAL (tanga → naqd eshigi) | **NOL** |
| Emissiya xavfi | bor (yangi manba) | **YO'Q** — `CoinTxn` umuman ochilmaydi |

Ya'ni bu **yopiq halqa** (Kaspi emas, Starbucks modeli): mijoz «Chempion Kafe»da 45 000 so'mlik
xarid qiladi → 2 250 so'm **shu kafening hamyoniga** tushadi → keyingi safar 100 ming so'mlik
xaridning 30 mingini shu hamyondan to'laydi, 70 mingini naqd. Kafe bu chegirmani **o'z tovaridan**
beradi, BirJoy bir tiyin ham to'lamaydi va hech qanday tanga chiqmaydi.

**Buning uchta katta oqibati bor va uchalasi ham bizning foydamizga:**
1. **≤350 tanga/safar clamp'iga, withdraw eshigiga, `CoinTxn` ga UMUMAN tegilmaydi.** B0 —
   pul-xavfi eng past modul, taksi iqtisodiga nol ta'sir.
2. **Biznes uchun kirish to'siqi nol** — oldindan pul o'tkazish talab qilinmaydi, shuning uchun
   «hamma boshiga cashback beradi» real bo'ladi.
3. **Mijoz o'sha biznesga QAYTADI** — pul faqat o'sha yerda ishlaydi. Aynan shu «mijozlar
   oqimini oshirish» va'dasi.

Va yana bitta tuzatish: **stadion — alohida biznes.** U cashback dasturiga qo'shiladigan biznes
bo'lishi mumkin, lekin uning mahsuloti boshqa (vaqt-slot broni), shuning uchun alohida modul
sifatida quriladi va o'z ekraniga ega bo'ladi.

---

## §1. Ega tanlagan qarorlar (tasdiqlangan)

| Savol | Ega tanlovi |
|---|---|
| Cashback pulini kim to'laydi | **Biznes** (v2'da: o'z tovari bilan, yopiq halqa) |
| Stadion broni | **Egasi tasdiqlaydi** (so'rov → javob) |
| Bizneslar qayerda ko'rinadi | **Mavjud «Xizmatlar» ichida** cashback belgisi bilan |
| Savdoni kim boshlaydi | **Mijoz** «savdo qildim» deydi → **biznes egasi tasdiqlaydi** |

Bitta naqsh butun mahsulotni bog'laydi: **mijoz so'raydi → egasi tasdiqlaydi.** Stadion bronida
ham, savdo-cashbackda ham, cashback bilan to'lashda ham AYNAN shu. Bitta o'rgangan odat — uchta
joyda ishlaydi.

---

## §2. 🏟 STADION — bron (S1)

### §2.1 Mijoz oqimi

| # | Ekran | Nima ko'radi | Nima bosadi |
|---|---|---|---|
| 1 | Uy | Panjarada `🏟 Stadion` — **Ravelladan OLDIN** | tugma |
| 2 | Ro'yxat | Rasm · nom · mahalla · «1 soat 80 000 so'mdan» · «Bugun 19:00 bo'sh» | karta |
| 3 | Stadion | Rasm-karusel · «Borish» · bugun+7 kun lentasi · **soat panjarasi** (bo'sh / band / o'tgan) · kechki narx ajratilgan | slot |
| 4 | So'rov varag'i | `Shanba 19:00–20:00 · Chempion · 100 000 so'm` · telefon (avto) · izoh | «So'rov yuborish» |
| 5 | Kutish | ⏳ «So'rov yuborildi — stadion egasi tasdiqlaydi. Slot siz uchun ushlab turibdi (30 daqiqa)» | — |
| 6 | Javob | ✅ «Bron tasdiqlandi! Shanba 19:00. Naqd joyida to'laysiz» → «Do'stlarni chaqirish» · yoki ❌ «Band ekan — boshqa vaqt tanlaymizmi?» (bo'sh slotlar darhol ko'rsatiladi) | — |
| 7 | 2 soat oldin | Bot: «Bugun 19:00 — Chempion. Kelolmasangiz bekor qiling, boshqa jamoa o'ynaydi» | — |

**Stadion egasi tomoni (bot):** `⚽ Yangi so'rov — shanba 19:00–20:00, Bahodir, +998…` →
[✅ Tasdiqlash] [❌ Band] . Slot tugagach: [⚽ O'ynadi] [🚫 Kelmadi].

### §2.2 «Egasi tasdiqlaydi» ni halol qilish (kutish — mahsulotning eng zaif joyi)

Kutish oqimini tanlash — javob bermaslik xavfini sotib olish demakdir. Shuning uchun uchta
mexanizm boshidanoq quriladi:

- **Slot so'rov paytida ham BAND.** So'rov `activeKey` ni egallaydi — ikkinchi odam o'sha slotni
  so'ray olmaydi. Ya'ni «ikkalasiga ham ha dedik» holati bo'lishi mumkin emas.
- **30 daqiqada javob bo'lmasa — avto-expire.** Slot bo'shaydi, mijozga halol xabar: «Stadion
  javob bermadi. Boshqa vaqt yoki boshqa stadion» + bo'sh slotlar ro'yxati (**tugmasiz o'lik xabar
  YO'Q** — DIZAYN_QOIDALARI: yozuv harakat va'da qilsa tugma shart).
- **5 daqiqadan keyin egaga eslatma, 15 daqiqadan keyin BirJoy egasiga alert** (restoran
  `slaAlertedAt` naqshi) — javob bermaydigan stadion jimgina mijoz yo'qotmaydi, biz bilamiz.

Stadion doim tez javob bersa, keyinchalik unga «avto-tasdiq» yoqiladi (maydon tayyor) — lekin
bu **ega qaroridan keyin**, hozir rejada yo'q.

### §2.3 Ma'lumot modeli (3 model)

```prisma
model Stadium {
  id, name, phone, address?, geoLat?, geoLng?, mahallaId?
  fieldCount   Int  @default(1)     // «Maydon 1 / Maydon 2»
  openMin      Int  @default(480)   // 08:00 (yarim tundan daqiqa)
  closeMin     Int  @default(1380)  // 23:00
  slotMin      Int  @default(60)
  priceSom     Int                  // kunduzgi 1 slot
  peakPriceSom Int  @default(0)     // 0 = kechki narx yo'q
  peakFromMin  Int  @default(1080)  // 18:00
  peakToMin    Int  @default(1380)
  holdMinutes  Int  @default(30)    // so'rov ushlab turish muddati
  ownerChatId  String?              // tasdiq-kartochkalari shu yerga (null → BirJoy egasi)
  cancelHours  Int  @default(3)
  listingId    Int?                 // 🔗 shu stadionning Xizmatlar-e'loni (cashback dasturi uchun)
  photoFileId?, photoUrl?, active(false), paused, sortOrder
  avgRating, reviewCount, bookingCount, createdAt, updatedAt
}

model StadiumBooking {
  id, stadiumId, fieldNo Int @default(1)
  kind      String  @default("client")   // "client" | "block" (egasi oflayn bandlikni yopadi)
  memberId  Int?                         // block'da null
  dateKey   String                       // "2026-08-20" (Toshkent kuni)
  startMin  Int                          // 1140 = 19:00
  endMin    Int
  priceSom  Int                          // SNAPSHOT
  status    String  @default("requested") // requested|booked|played|noshow|cancelled|rejected|expired
  activeKey String? @unique              // "<stadiumId>:<fieldNo>:<dateKey>:<startMin>" · o'lik holatda NULL
  groupKey  String?                      // 2 soatlik bron = 2 qator, bitta guruh
  holdUntil DateTime?                    // requested holatda avto-expire vaqti
  slaAlertedAt?, contact, note, remindedAt?, decidedAt?, createdAt, updatedAt
  @@index([stadiumId, dateKey, startMin])
  @@index([memberId, id])
  @@index([status, holdUntil])
}

model StadiumPhoto { id, stadiumId, fileId?, url?, sortOrder }   // RavellaItemPhoto naqshi
```

### §2.4 Ikki marta bron — **STRUKTURAVIY** imkonsiz (eng muhim qator)

`activeKey` — **nullable unique**. So'rov yoki bron tirik ekan qiymati
`"<stadiumId>:<fieldNo>:<dateKey>:<startMin>"`; rad etilsa / bekor qilinsa / expire bo'lsa `NULL`
(Postgres'da NULL'lar unique indeksda to'qnashmaydi). Ikki mijoz ayni soniyada bir slotni bossa —
**bazaning o'zi** ikkinchisini rad etadi, kod mantig'i emas. Egasining oflayn bandligi ham AYNAN
shu jadvalda (`kind="block"`), ya'ni telefon broni bilan ilova broni **hech qachon** bir slotga
tusha olmaydi.

Isbot: `testStadion.ts` — 20 ta parallel so'rov bitta slotga → aynan 1 ta o'tadi, 19 tasi
`slot_taken`. Skript **alohida test bazasida** yuriladi (CLAUDE.md SWEEP qoidasi).

### §2.5 Qolgan qarorlar

- **To'lov — naqd, joyida.** Onlayn to'lov butun kodbazada yo'q; bitta modul uchun ochilmaydi.
- **Kelmaslik.** Slot tugagach egasiga `⚽ O'ynadi` / `🚫 Kelmadi`. 60 kunda 2 marta kelmagan
  odamga → 1 ta aktiv bron (soft-limit, ban emas).
- **Bekor qilish.** `cancelHours` (default 3) ichida bepul; keyin `noshow`. Slot ikkala holatda
  ham DARHOL bo'shaydi — maqsad jazolash emas, maydonni qaytarish.
- **Aktiv bron chegarasi:** bir odamda ≤3.
- **Cashback S1'da YO'Q** — stadion cashbacki B0 relslariga ulanadi (S2), chunki u ham biznes.
- **Ball (O'yin) YO'Q** — ball sovrin-byudjetiga bog'langan (`OYIN_SOM_PER_BALL=20`), byudjetsiz
  yangi manba ochilmaydi.

---

## §3. 🏢 BIRJOY BIZNES — yopiq halqa cashback (B0)

### §3.1 Biznes = mavjud `ServiceListing` + cashback qatlami (yangi katalog OCHILMAYDI)

Ega tanlovi: bizneslar **Xizmatlar ichida** ko'rinadi. Bu bitta yangi jadvalni ham tejaydi:
`ServiceListing` da self-submit + ega moderatsiyasi (`status: pending → active`), rasm, telefon,
manzil, ish vaqti, baho — **hammasi allaqachon bor va ishlaydi**. Qo'shiladigani — cashback
qatlami:

```prisma
// ServiceListing ga qo'shiladigan maydonlar (mavjud maydonlarga TEGILMAYDI):
cashbackPct   Float   @default(0)   // biznes o'zi belgilaydi, ruxsat etilgan oraliqda
redeemMaxPct  Int     @default(30)  // bitta xaridda cashback bilan to'lanadigan ULUSH (ega misoli: 30%)
bizActive     Boolean @default(false) // cashback dasturi yoqilganmi (DARK yaratiladi, ega yoqadi)
bizChatId     String?               // tasdiq-kartochkalari shu chatga
```

```prisma
model BizWallet {            // MIJOZ × BIZNES — yopiq halqa qoldig'i (SO'MDA)
  id, listingId, memberId, balanceSom Int @default(0), earnedSom, spentSom, updatedAt
  @@unique([listingId, memberId])
  @@index([memberId, balanceSom])
}

model BizSale {              // bitta xarid: "savdo qildim" → egasi tasdiqlaydi
  id, listingId, memberId
  amountSom Int              // umumiy chek (mijoz kiritadi, egasi tasdiqlaydi)
  redeemSom Int @default(0)  // cashback hamyonidan to'landi
  cashSom   Int              // naqd to'landi
  earnSom   Int @default(0)  // shu xariddan hamyonga tushdi
  status    String @default("pending")  // pending|confirmed|rejected|expired
  expiresAt, confirmedAt?, rejectReason?, slaAlertedAt?, createdAt
  @@index([listingId, status, createdAt])
  @@index([memberId, createdAt])
}

model BizWalletTxn {         // o'zgarmas jurnal — har harakat bitta qator
  id, listingId, memberId, amountSom Int,  // + yig'ildi, − sarflandi
  saleId Int?, balanceAfter Int, note?, createdAt
  @@index([listingId, memberId, createdAt])
}
```

### §3.2 Ikki oqim, bitta odat

**A. Cashback YIG'ISH**
```
Mijoz (ilova):  Xizmatlar → «Chempion Kafe» → [💰 Savdo qildim]  →  45 000 so'm
Egasi (bot):    🧾 «Bahodir — 45 000 so'm. To'g'rimi?»   [✅ Ha]  [❌ Yo'q]
✅ bosilgach:   Mijozga: «Chempion Kafe hamyoningizga +2 250 so'm tushdi»
```

**B. Cashback SARFLASH (ega misoli: 100 ming = 70 naqd + 30 cashback)**
```
Mijoz (ilova):  «Chempion Kafe» → [💳 Hamyondan to'lash] → chek 100 000 → hamyonda 30 000
                Ilova: «30 000 hamyondan · 70 000 naqd»   [Yuborish]
Egasi (bot):    🧾 «Bahodir — 100 000. 30 000 hamyondan, 70 000 naqd olasiz»  [✅]  [❌]
✅ bosilgach:   hamyondan −30 000 · qolganidan (70 000) yangi cashback +3 500
```

Nega mijoz boshlaydi, egasi tasdiqlaydi: mijozda motivatsiya bor (u summani kiritishga tayyor),
kassirda esa vaqt yo'q — unga faqat bitta ✅ tegadi. Va yolg'on summa imkonsiz: pul beruvchi
tomon — egasi — ko'rib tasdiqlaydi.

### §3.3 Qat'iy invariantlar

**INV-1 — `CoinTxn` UMUMAN ochilmaydi.** Biznes cashbacki tanga emas, so'mda va faqat o'sha
biznesning hamyonida. ≤350/safar clamp, withdraw eshigi, `PlatformLedger` — hech biriga tegilmaydi.
**INV-2 — hamyon hech qachon manfiy emas.** Sarflash shartli update:
`updateMany({ where: { id, balanceSom: { gte: redeemSom } } })` + `count === 1` — parallel ikki
xarid bir qoldiqni ikki marta sarflay olmaydi (Do'kon `deliverPurchase` naqshi).
**INV-3 — bir savdo bir marta.** `status: pending → confirmed` shartli flip, `count === 1`.
**INV-4 — sarflash ulushi cheklangan:** `redeemSom ≤ amountSom × redeemMaxPct / 100` (default 30%)
— biznes hech qachon 100% bepul savdo qilib qolmaydi.
**INV-5 — yangi cashback FAQAT naqd qismidan** (`cashSom`) hisoblanadi. Aks holda hamyon o'zini
o'zi boqadigan cheksiz halqa bo'lardi (cashbackdan cashback).
**INV-6 — egasi tasdiqlamasa hech narsa bo'lmaydi.** `pending` so'rov 60 daqiqada `expired`;
hamyondan pul faqat ✅ lahzasida yechiladi (so'rov paytida ushlab turilmaydi — chunki bu real
xarid, mijoz kassa oldida turibdi).
**INV-7 — BirJoy majburiyati NOL.** Biz cashbackni to'lamaymiz, kafolatlamaymiz va naqdga
almashtirmaymiz. Ilovada bu ANIQ yozilib turadi: «Bu — Chempion Kafening chegirmasi, faqat shu
yerda ishlaydi».

### §3.4 Biznes o'zini qanday qo'shadi

`/sotuvchi` wizardi (`bot.ts:1583` `registerMarket`) — ishlaydigan naqsh. Undan nusxa:
**`/biznes`** → **tur** (mavjud `ServiceCategory` ro'yxatidan) · nom · telefon · manzil · rasm ·
**cashback foizi** → `status="pending"`, `bizActive=false` (DARK) → ega admin panelda ✅ →
e'lon Xizmatlarda `💰 5% qaytadi` belgisi bilan ko'rinadi.

⚠️ **Blokerlik shart:** `xizmatlar` bayrog'i jonlida hozir OFF va katalog seed kutmoqda. B0
ishga tushishi uchun Xizmatlar YOQILISHI kerak. Yaxshi tomoni: cashback dasturi Xizmatlarni
**to'ldiradigan sabab** bo'ladi — biznes o'zi kelib yoziladi, chunki mijoz oqimini xohlaydi.

### §3.5 Mijoz nimani ko'radi

- **Xizmatlar ro'yxati** — cashback beradigan e'londa `💰 5%` belgisi + tepada filtr:
  «Cashback beradiganlar».
- **Biznes sahifasi** — mavjud profil + bitta yangi blok: `Sizning hamyoningiz: 30 000 so'm` +
  ikki tugma: `💰 Savdo qildim` / `💳 Hamyondan to'lash`.
- **Hamyon tabi** — «Biznes hamyonlari» ro'yxati: qayerda qancha pulingiz bor. Tanga bilan
  ARALASHTIRILMAYDI (alohida blok, boshqa rang, «faqat o'sha joyda ishlaydi» izohi bilan).

⚠️ **Nom to'qnashuvi:** «cashback» so'zi bugungi ilovada kas cashbacki (`Member.points`) ma'nosida
ishlatiladi. Chalkashmasligi uchun yangi narsa UI'da **«<Biznes nomi> hamyoni»** deb ataladi
(«cashback» so'zi faqat tushuntirish matnida).

---

## §4. Bosqichlar

| # | Nomi | Ichida nima | Hajm |
|---|---|---|---|
| **S1** | 🏟 Stadion — bron | 3 model · `stadionService` · ~8 route · mijoz ekrani · admin CRUD + kun-panjara · bot tasdiq-kartochkalari · hold-expire + eslatma (mavjud 15-daqiqalik tikda) | ~1600 satr |
| **B0** | 🏢 Biznes cashback | ServiceListing +4 maydon · 3 model · `bizService` · `/biznes` wizard · savdo + sarflash oqimi · admin: tasdiq/knob/jurnal | ~1300 satr |
| **S2** | 🏟 Stadion cashbacki | stadion → o'z `ServiceListing`i bilan bog'lanadi, bron tasdiqlangach hamyonga cashback · baho/sharh | ~400 satr |
| **B1** | 🎟 Shtamp karta | «5 ta olding — 6-si bepul» — hamyonning oddiy ukasi, pul yo'q | ~350 satr |
| **B2** | 🔔 Qaytish taklifi | «3 haftadan beri yo'qsiz — hamyoningizda 30 000 turibdi» (mavjud push-dvigateli, yangi poller YO'Q) | ~250 satr |

**Tartib sababi:** S1 pulga umuman tegmaydi → eng tez va xavfsiz yetkaziladi, stadion egalari
bilan suhbat bugundan boshlanadi. B0 — cashback halqasi, u ham `CoinTxn`ga tegmaydi, ya'ni
taksi iqtisodiga nol xavf. S2 ikkalasini ulaydi.

---

## §5. O'zgaradigan fayllar (S1 + B0)

**Server**
- `prisma/schema.prisma` — S1: `Stadium`, `StadiumBooking`, `StadiumPhoto` · B0: `BizWallet`,
  `BizSale`, `BizWalletTxn` + `ServiceListing` ga 4 maydon
  (⚠️ VPS'da `prisma db push` — kod push'idan OLDIN, CLAUDE.md qoidasi)
- YANGI: `services/stadionService.ts`, `services/bizService.ts`
- `api/server.ts` — `/api/stadion/*` (~8), `/api/biz/*` (~8)
- `services/featureFlags.ts` — `stadion`, `biz` (ikkalasi DEFAULT_OFF)
- `bot/bot.ts` — `/biznes` wizard · stadion ✅/❌ va ⚽/🚫 kartochkalari · savdo ✅/❌ kartochkalari
- `index.ts` (15-daqiqalik tik) — so'rov hold-expire · savdo expire · bron eslatmasi · SLA alert
  — **mavjud tikda** (yangi poller YO'Q — BUZILMAS qoida)
- `services/appStateUtil.ts` — `stdrem:` prefiksi EPHEMERAL ro'yxatiga

**Mini App**
- YANGI: `stadion.tsx`, `design/feat/stadion.css`
- `services.tsx` — cashback belgisi · filtr · biznes sahifasidagi hamyon bloki + 2 tugma
- `wallet.tsx` — «Biznes hamyonlari» bloki (tangadan ANIQ ajratilgan)
- `App.tsx` — lazy import · `Tab` turi · `GO_MAP` · flag-guard · render
- `uy.tsx` — panjarada `🏟 Stadion` **Ravelladan oldin** + `ServicesHub` qatori
- `api.ts` — ~16 metod

**Admin**
- YANGI: `stadion.tsx` (CRUD · kun-panjara · slot bloklash · so'rovlar)
- `xizmatlar` ko'rinishi — cashback ustunlari (foiz · limit · yoqish) + biznes jurnali
- `v2/nav.ts` — «Katalog» guruhiga `stadion`

**Shared**
- YANGI: `stadion.ts` (slot-panjara, narx, bekor oynasi), `biz.ts` (cashback + sarflash hisobi)
- `index.ts` eksport · `economy.ts` — biznes chegaralari (`bizMaxPct`, `bizRedeemMaxPct`, …)
- YANGI testlar: `__tests__/stadion.test.ts`, `__tests__/biz.test.ts` (CI'da yuradi, baza kerak emas)

**Skriptlar** — `testStadion.ts` (poyga · panjara · hold-expire · bekor), `testBiz.ts`
(INV-1..INV-7), `seedStadion.ts`.

---

## §6. Xavflar va yechimlar (taxmin emas, mexanizm)

| # | Xavf | Yechim | Isbot |
|---|---|---|---|
| 1 | Ikki mijoz bir slotda | `activeKey` nullable-unique (§2.4) | 20× parallel test → 1 ok, 19 rad |
| 2 | Oflayn bron bilan to'qnashuv | egasining bloki AYNAN shu jadvalda (`kind="block"`) | admin kun-panjarasi |
| 3 | Stadion javob bermaydi | 30 daq hold-expire + bo'sh slotli halol xabar + 15 daqda BirJoy alerti | `testStadion.ts` + bot logi |
| 4 | Kelmaslik → stadion ishonchi | 2 soat oldin eslatma · `🚫 Kelmadi` · 2-marta → 1 aktiv bron | jonli o'lchov |
| 5 | Hamyon ikki marta sarflanishi | INV-2 shartli update + `count===1` | `testBiz.ts` parallel sarflash |
| 6 | Cashbackdan cashback (cheksiz halqa) | INV-5: yangi cashback faqat `cashSom` dan | test qatori |
| 7 | 100% cashbackka to'lab ketish | INV-4: `redeemMaxPct` (default 30%) | test qatori |
| 8 | Mijoz soxta summa kiritishi | egasi ✅ bosmaguncha hech narsa bo'lmaydi (INV-6) | oqim dizayni |
| 9 | Mijoz «BirJoy pulim» deb o'ylashi | UI'da «faqat shu yerda ishlaydi» + tangadan alohida blok | ega ekranda ko'radi |
| 10 | `xizmatlar` bayrog'i OFF — biznes ko'rinmaydi | B0 yoqilishidan oldin Xizmatlar ONga chiqadi (ega qadami) | jonli flag |
| 11 | Sxema push'i unutilsa jonli yiqiladi | VPS'da `migrate diff` → o'qish → `db push`, KEYIN kod push'i | CLAUDE.md qadamlari |
| 12 | Yangi poller kirib qolishi | hammasi mavjud 15-daqiqalik tikda | `grep -c "setInterval" packages/server/src/index.ts` o'zgarmaydi |

---

## §7. DoD — S1 (kod yozishdan OLDIN tasdiqlanadi)

| # | Qabul mezoni | Tekshiruv |
|---|---|---|
| 1 | Bayroq OFF'da ilova AYNAN bugungidek | `#uy` skrinshot · `stadion` katagi yo'q |
| 2 | Panjarada Stadion Ravelladan OLDIN | jonli skrinshot (ega telefoni) |
| 3 | Admin panelda stadion qo'shiladi/tahrirlanadi/yoqiladi | jonli skrinshot + `/api/stadion/list` javobi |
| 4 | Band slot mijozga «band» ko'rinadi va bosilmaydi | ikki qurilma bilan jonli sinov |
| 5 | Ikki marta bron STRUKTURAVIY imkonsiz | `testStadion.ts` → «20 dan 1 ta o'tdi» |
| 6 | So'rov 30 daqiqada expire, slot bo'shaydi, mijozga TUGMALI xabar | test + bot skrinshot |
| 7 | Egasi ✅ bosgach mijozga tasdiq keladi | jonli sinov (ega o'zi stadion egasi rolida) |
| 8 | Egasi oflayn bandlikni yopa oladi | admin panjarasida blok → mijozda band |
| 9 | Eslatma 2 soat oldin BIR MARTA | `stdrem:` markeri + bot logi |
| 10 | Yangi poller YO'Q | `grep -c "setInterval" packages/server/src/index.ts` o'zgarmagan |
| 11 | Pul harakati NOL | `grep -rn "grantCoins\|CoinTxn" stadionService.ts` → 0 |
| 12 | Typecheck + testlar toza | `pnpm -r typecheck` · `pnpm --filter @t1067/shared test` |
| 13 | Sxema VPS'da push qilingan | `migrate diff` chiqishi + `\d "Stadium"` |

**B0 DoD** alohida yoziladi — INV-1..INV-7 ning har biri bitta test satri (`testBiz.ts`) bilan.

---

## §8. Ochiq qolgan 2 savol (S1 ni to'sib qo'ymaydi)

1. **BirJoy bu dasturdan qanday daromad qiladi?** V1'da nol (`feePct` knobi 0). Variantlar:
   oylik obuna · har tasdiqlangan savdodan komissiya · «TOP biznes» ko'rinish to'lovi. B0
   yetkazilgach real raqamlar bilan qaraladi — hozir qaror shart emas.
2. **Cashback foizi chegarasi.** Biznes o'zi belgilaydi, lekin BirJoy oralig'i kerak (masalan
   1–15%) — juda baland foiz mijozni aldash bo'lib chiqishi mumkin. Taklif: 1–15%, admin knobi.

---

## §9. Birinchi qadam (tasdiqdan keyin)

`S1` boshlanadi: sxema → `stadionService` → routelar → mijoz ekrani → admin → bot → testlar.
Har fayldan keyin typecheck; oxirida DoD 13 qatori birma-bir isbotlanadi va **«READY FOR
VERIFICATION»** deyiladi (CLAUDE.md R1 — «done» ega so'zi). Push egadan alohida ruxsat bilan.
