# 🎀 RAVELLA — bayram/saxna bezaklari konstruktori (REJA v1)

> Ega tavsifi (2026-07-27): «Bosh ekranda kichik, umuman boshqa xizmat turi. Admin paneldan men
> nastroyka qilib rasm qo'shaman va narxlarini yozaman — masalan "Onajon" yozuvi 100 ming. Pastda
> kichik xizmatlar: masalan "salyut qo'shish" bosadi — u qo'shiladi, qo'shilgan rasmga o'tadi va
> narxi ham plus bo'ladi. Ayirishni bossa — ayriladi. Oxiri "hammasini tayyorlash"ni bosadi. Keyin
> "BirJoy chegirmasidan foydalanish" tugmasi 10% narxni olib tashlaydi. Buyurtma berishni bossa —
> "tez orada sizga telefon qilishadi" deyiladi. Ularda saxna bezaklari, bayramlar uchun yozuvlar
> bor — har biri uchun alohida.»
>
> Status: **REJA — egadan TASDIQ kutilmoqda.** Hech qanday kod yozilmagan.

---

## §0. Bir paragrafda

Ravella — BirJoy ichidagi **birinchi hamkor-brend xizmati**: bosh ekrandagi kichik tugma → bezak
konstruktori. Mijoz asosiy bezakni tanlaydi (rasm + narx), pastdan qo'shimchalarni `+`/`−` bilan
qo'shadi (har qo'shimchaning O'Z RASMI bor — qo'shilganda katta rasm shu variantga o'tadi, narx
jonli o'sadi), «Tayyor» → «🎁 BirJoy chegirmasi −10%» tugmasi narxni kamaytiradi → «Buyurtma berish»
→ ekranda «Tez orada siz bilan bog'lanamiz», Zoyir To'ychiyevga botda buyurtma-kartasi tushadi
(✅ Qabul / ☎️ Bog'landim / ✔ Bajarildi / ❌ Rad). Ish bajarilgach mijozga **1% tanga cashback**.
To'lov ONLAYN EMAS — naqd/kelishuv (restoran V1 CONCIERGE naqshi). Bu mexanika hech qanday mavjud
oqimga tegmaydi: taxi, do'kon, restoran o'z holicha qoladi.

**Nega yangi modul, mavjud «Do'kon»ga qo'shilmaydi:** Do'kon/Product'da (a) qo'shimcha-band
(add-on) tushunchasi yo'q, (b) tanlovga qarab almashadigan rasm yo'q, (c) savat bir do'konga
bog'langan oddiy qty-ro'yxat — konstruktor emas. Ega ham «umuman boshqa xizmat turi» dedi.

---

## §1. Mijoz oqimi (6 qadam, 3-soniya testidan o'tadi)

| # | Ekran | Mijoz nima ko'radi | Nima bosadi |
|---|---|---|---|
| 1 | 🏠 Bosh ekran | Rail'da kichik `🎀 Ravella` tugmasi | tugma |
| 2 | Ravella bosh | Hamkor-hero (logo/banner) + bo'limlar: «🎭 Saxna bezaklari», «✍️ Bayram yozuvlari» — har bo'lim ichida kartochka-grid (rasm + nom + «100 000 so'mdan») | bezak kartasi |
| 3 | Konstruktor | KATTA rasm (tanlovga qarab almashadi) + asosiy narx + pastda «Qo'shimchalar» ro'yxati: `🎆 Salyut +150 000  [−] 1 [+]` | `+` / `−` |
| 4 | Yakun paneli (sticky) | `Jami: 250 000 so'm` + «✅ Hammasi tayyor» | Tayyor |
| 5 | Chegirma + checkout | Yig'ma ro'yxat, so'ng KATTA tugma «🎁 BirJoy chegirmasi — 10% olib tashlash». Bosilganda: eski narx chiziladi, yangi narx sanab tushadi, «+2 500 tanga qaytadi» satri chiqadi. Telefon (avto-to'ldirilgan), sana, manzil, izoh | «Buyurtma berish» |
| 6 | Tasdiq | ✅ «Buyurtmangiz qabul qilindi (#123). Tez orada Ravella siz bilan bog'lanadi ☎️» + «Buyurtmalarim» | — |

Holat o'zgarsa mijozga bot-push: «✅ Ravella buyurtmangizni qabul qildi» / «☎️ Hozir qo'ng'iroq
qilishadi» / «✔ Bajarildi — hisobingizga N tanga qaytdi».

---

## §2. Ma'lumot modeli (4 ta yangi Prisma modeli, hech biri mavjudiga tegmaydi)

```prisma
model RavellaCategory {   // «Saxna bezaklari» | «Bayram yozuvlari» | …
  id, name, emoji, sortOrder, active, createdAt
}

model RavellaItem {       // asosiy bezak — «Onajon yozuvi», 100 000 so'm
  id, categoryId, name, desc?, basePriceSom,
  photoFileId?, photoUrl?,          // Telegram file_id pipeline (driver-photo/shop naqshi)
  active(false-da yaratiladi), sortOrder, orderCount, createdAt, updatedAt
}

model RavellaAddon {      // qo'shimcha — «Salyut +150 000», O'Z rasmi bilan
  id, itemId?,            // null = shu KATEGORIYAdagi hamma bezakka mos umumiy qo'shimcha
  categoryId?, name, priceSom, maxQty(def 5),
  photoFileId?, photoUrl?,          // ⭐ tanlanganda katta rasm SHUNGA o'tadi
  active, sortOrder
}

model RavellaOrder {
  id, memberId,
  itemId, itemName,                  // snapshot
  addonsJson,                        // [{addonId,name,qty,priceSom}] — snapshot
  subtotalSom, discountPct, discountSom, totalSom,
  contact, address, eventDate?, note,
  status,                            // pending|accepted|called|done|rejected|cancelled_by_user
  rejectReason?, cashbackSom?,       // yakunda berilgan tanga (audit uchun)
  slaAlertedAt?, acceptedAt?, doneAt?, createdAt, updatedAt
}
```

Sxema o'zgarishi ALOHIDA ONGLI qadam (CLAUDE.md): avval `prisma migrate diff`, keyin lokaldan
`pnpm db:push`, KEYIN kod push. Prod start buyrug'ida `db push` YO'Q.

---

## §3. Server (`packages/server/src/`)

**Yangi:** `services/ravellaService.ts` (~350 qator) — restoran/marketOrder naqshlarining birlashmasi:
- `listRavellaCatalog(preview)` → kategoriyalar + itemlar (flag DARK, `preview` = ega-ko'rinishi)
- `getRavellaItem(id, preview)` → item + unga tegishli addonlar
- `createRavellaOrder(memberId, itemId, addons[], contact, address, eventDate, note, useDiscount)`
  — **narx SERVERDA qayta hisoblanadi** (mijoz yuborgan narxga ISHONILMAYDI, §7), qo'shimcha
  `maxQty` tekshiriladi, `pending` limiti 3, natijada `notice` (Zoyir aka kartasi uchun)
- `myRavellaOrders`, `cancelRavellaOrder` (faqat `pending`)
- `acceptRavellaOrder` / `markCalled` / `finishRavellaOrder` / `rejectRavellaOrder` — hammasi
  **shartli `updateMany` status-guard** bilan (ikki marta bosish = bitta o'tish)
- `grantRavellaCashback(orderId)` — FAQAT `done`-flip muvaffaqiyatli bo'lgach (§7)
- `checkRavellaSlaAndAlert(alertAdmins)` — mavjud sweep'ga ulanadi, **YANGI POLLER YO'Q**
- admin CRUD: kategoriya/item/addon create/edit/delete/toggle + `uploadRavellaPhoto` (mavjud
  `tgUploadPhoto` pipeline)

**`api/server.ts`** (+~14 route, hammasi mavjud middleware bilan):
`GET /api/ravella/catalog` · `GET /api/ravella/item/:id` · `POST /api/ravella/order` ·
`GET /api/ravella/orders` · `POST /api/ravella/orders/:id/cancel` · `GET /api/ravella/photo/:id` ·
`GET /api/ravella/addon-photo/:id` · `/api/admin/ravella/*` (CRUD + orders, `requireAdmin`).
`/me` javobiga `flags.ravella` qo'shiladi (owner-preview bilan — ega QABUL qilgunча faqat u ko'radi).

**`featureFlags.ts`:** `"ravella"` (DEFAULT_OFF) — bitta kill-switch butun xizmatni o'chiradi.
**`shared/economy.ts`** knoblari (admin panel avtomatik chizadi):
`ravellaDiscountPct` (def 10) · `ravellaCashbackPct` (def 1) · `ravellaCashbackPerOrder` (def 20 000)
· `ravellaCashbackDaily` (def 20 000) · `ravellaSlaMinutes` (def 15).

---

## §4. Bot — Zoyir To'ychiyev tomoni (`bot/ravella.ts`, market.ts naqshi)

- Hamkor chat-id **admin panelda** kiritiladi (AppState `ravella:chat`) — Zoyir aka botga `/start`
  bosgach, ega uning ID'sini panelga qo'yadi. Sozlanmagan bo'lsa kartalar EGAga tushadi (xавfsiz
  fallback).
- Yangi buyurtma → **hamkorga + egaga CC** karta:
  ```
  🎀 Yangi buyurtma #123
  🎭 «Onajon» yozuvi
  ➕ Salyut ×1, Shar-arka ×2
  💰 Jami: 250 000 so'm  (BirJoy −10% qo'llangan: 225 000)
  👤 Aziz · ☎️ +998 90 123-45-67
  📍 Koson, Navoiy ko'chasi 12 · 📅 5-avgust
  [✅ Qabul qilaman] [☎️ Bog'landim]
  [✔ Bajarildi]      [❌ Rad etish]
  ```
- Har tugma → status-o'tish + **mijozga push** (mavjud `notifyService`). `❌` — sabab so'raydi.
- `/ravella` buyrug'i (faqat hamkor + ega): bugungi buyurtmalar + narx-panel havolasi.
- **Narxlarni o'zgartirish:** shop'dagi isbotlangan naqsh — `getOrCreateSellerToken` uslubidagi
  token bilan admin-panel havolasi botga yuboriladi («🔑 Narxlarni o'zgartirish»). Zoyir aka
  bosadi → faqat Ravella bo'limi ochiladi (boshqa hech nima ko'rinmaydi), rasm/narx qo'yadi.

---

## §5. Admin panel (`packages/admin/src/App.tsx` — yangi `🎀 Ravella` tab)

3 blok: **(a) Konstruktor** — kategoriya qo'shish; item qo'shish (nom, narx, rasm yuklash, tavsif);
har item ostida qo'shimchalar (nom, +narx, RASM, maxQty); drag'siz `sortOrder` maydoni; `active`
toggle. **(b) Buyurtmalar navbati** — restoran R3 ekranining aynan nusxasi (SLA rangi, tugmalar).
**(c) Sozlamalar** — hamkor chat-id, chegirma %, cashback knoblari, flag holati.

---

## §6. Mini App (`packages/miniapp/src/ravella.tsx` + `design/ravella.css`)

- **Kirish — IKKI nuqta (ega qarori 2026-07-27):**
  1. `uy.tsx` rail'ida kichik band — `{ on: !!f.ravella, lb: "Ravella", nav: "ravella" }`
     (uy.tsx:133-140), ikonka o'rnida **Ravella belgisi** (sariq kvadrat-R), emoji emas.
  2. **Bosh ekrandagi e'lon/banner joyi** (`nh-promo`, «🔥 Bugungi tavsiya» — uy.tsx:184-192):
     Ravella banneri shu yerga qo'yiladi. Yangi mexanizm YOZILMAYDI — mavjud `HomeFeatured`
     (kind=`banner`, `target=ravella`) admin-kuratsiyasi ishlatiladi (homeFeedService.ts:92-110),
     ya'ni ega bannerni istagan payt almashtira/olib tashlay oladi.
  `App.tsx`: `Tab` tipiga `"ravella"`, `GO_MAP`ga `ravella`, topbar sarlavhasi, render satri —
  restoran bilan bir xil 4 nuqta. Deep-link: `t.me/<bot>/app?startapp=ravella`.
- **Brend (logotipdan olingan):** qora fon `#000`, amber-sariq aksent `#F9BE3E`, so'z-belgi
  «**Ra**vella» (oq + sariq). Ravella ekrani BirJoy'ning umumiy qorong'i qatlamida shu aksent
  bilan ishlaydi — qolgan ilova rangi o'zgarmaydi.
  Kerak bo'lgan fayl: `packages/miniapp/public/ravella/logo.png` (siz yuborgan belgi) — rail
  ikonkasi va hero uchun. Banner rasmi esa admin paneldan yuklanadi (mavjud rasm-quvuri), shunda
  siz uni istagan payt almashtira olasiz.
- **Dizayn:** «do'kondek» — `bj-`/`rst-` sinflari bilan bir oilada, lekin **o'z aksenti**.
  Faqat `design/tokens.css` o'zgaruvchilari, inline stil yo'q.
- **Eskisi o'chiriladi:** `service.tsx` (inline-stilli, binafsha, qo'ng'iroq-only Ravella sahifasi,
  hech qayerdan chaqirilmaydi) + `public/ravella/index.html` (2026-06-28'dagi mustaqil landing,
  eski binafsha brend + eski to'y-narxlari — yangi brendga ziddi).
- **Konstruktor animatsiyasi:** rasm almashuvi 200ms crossfade (`opacity`), narx `count-up` 300ms —
  ikkalasi ham faqat `transform/opacity`, `prefers-reduced-motion` hurmat qilinadi.
- **Chegirma tugmasi:** bir marta bosiladi, qaytarilmaydi (bosgach «✅ 10% chegirma qo'llandi»),
  eski narx `<s>` bilan chiziladi + haptic success.
- Har async holatda skeleton; «Buyurtmalarim» ro'yxati 8s poll (restoran naqshi).
- `service.tsx` (eski qo'ng'iroq-only Ravella sahifasi) — **o'chiriladi**, o'rniga shu keladi
  (u hech qayerdan chaqirilmaydi, ARCHITECTURE.md:71 «unrouted»).

---

## §7. PUL QOIDALARI (buzilmas)

1. **Narx serverda hisoblanadi.** Client faqat `itemId` + `[{addonId, qty}]` yuboradi. Jami, 10%
   chegirma va cashback — hammasi serverda, jonli DB narxlaridan. Client narx yuborsa — E'TIBORSIZ.
2. **Buyurtmada CoinTxn YO'Q.** To'lov naqd/kelishuv (restoran V1 D1 qarori). Demak refund logikasi
   ham kerak emas — bekor qilish pul harakatlantirmaydi.
3. **1% cashback FAQAT `done`-ga o'tganda**, shartli flip muvaffaqiyatli bo'lgach. Idempotent kalit
   `rvlcb:<orderId>`, `pendingCreate/pendingResolve` bardoshlilik naqshi bilan (crash bo'lsa
   mavjud `retryPendingMoney` tick'i qayta uradi — yangi poller yo'q).
4. **Safar ≤350 clamp'iga TEGMAYDI:** `grantCoins` `bookingId`siz chaqiriladi (shopcashback bilan
   bir xil isbotlangan yo'l) — clamp indeksi bu grantlarni umuman ko'rmaydi.
5. **Cheklovlar:** har buyurtmaga max `ravellaCashbackPerOrder` (def 20 000 tanga), a'zoga kunlik
   `ravellaCashbackDaily`, `withMemberLock` ichida o'qish+grant serializatsiya qilinadi.
6. **10% chegirma — RAVELLA hisobidan; 1% cashback — BIZNING hisobimizdan** (ega qaro[ri
   2026-07-27, QULFLANGAN). Ya'ni: mijoz ko'radigan 10% arzonlik BirJoy'ga 0 so'm turadi (hamkor
   kelishuvi, buyurtmada `discountSom` audit uchun yoziladi); 1% esa BIZNING yangi emissiya-manbamiz
   — shuning uchun uning cheklovlari (5-band) qattiq: 100 000 so'mlik buyurtma = 1 000 tanga,
   2 000 000 so'mlik = cap tufayli 20 000 tanga EMAS, `ravellaCashbackPerOrder` gacha. Cashback
   `CoinTxn.kind="ravella_cashback"` bilan alohida yuritiladi — oylik emissiya-hisobotda ko'rinadi.
7. Flag `ravella` OFF → katalog bo'sh, `POST /order` → `{ok:false, reason:"off"}`, cashback 0.

---

## §8. Ommaviy e'lon (rasm + havola)

Hozirgi `/elon` faqat MATN yuboradi (bot/broadcast.ts). Qo'shiladi: **`/elonrasm`** — ega rasm
yuboradi → izoh matnini yozadi → preview → tasdiq → hammaga `sendPhoto` + inline tugma
«🎀 Ravella'ni ochish» (mini app deep-link). Mavjud 22 msg/s pacing, fon-yuborish, blok-hisobi
o'zgarmaydi. Rasmni ega beradi (siz aytgandek) — men joylab, preview'ni ko'rsataman.

---

## §9. Fazalar + har fazaning DoD'i (isbotsiz «tayyor» yo'q)

| Faza | Nima | Holat (2026-07-27) | Qabul mezoni (isbot buyrug'i bilan) |
|---|---|---|---|
| **R0** | Sxema (4 model) + flag `ravella` + 5 knob | ✅ kod yozildi | `migrate diff` = 4 CreateTable + 6 index, DROP/ALTER yo'q; typecheck 4/4 yashil. **Jonli bazaga hali PUSH QILINMAGAN** |
| **R1** | Admin CRUD + rasm yuklash | ✅ kod yozildi | ⏳ isbot kutmoqda: ega panelda 1 kategoriya + 1 bezak + 2 qo'shimcha yaratadi, rasmlar ko'rinadi |
| **R2** | Mini App konstruktor + bosh ekran tugmasi (DARK) | ✅ kod yozildi | ⏳ ega telefonida: tugma → grid → konstruktor; `+` bosilganda rasm almashadi va narx o'sadi |
| **R3** | Buyurtma + hamkor bot-kartasi + push'lar + SLA | ✅ kod yozildi | ⏳ test buyurtma → karta hamkor chatiga tushadi → `✅` → mijozga push. ⚠️ Test FAQAT ega/test-akkaunt bilan, real mijozga xabar YO'Q |
| **R4** | 10% chegirma + 1% cashback pul-yo'li | ✅ kod yozildi, ⏳ test yozilmagan | `testRavella.ts` (ALOHIDA `TEST_DATABASE_URL`, TAG'li satrlar, to'liq cleanup): 2× `done` → CoinTxn AYNAN 1 ta; cap ishlaydi; `bookingId=null` |
| **R5** | `/elonrasm` + Ravella rasmi bilan e'lon | ⬜ boshlanmagan | Ega o'ziga test-yuborish → rasm + tugma to'g'ri ochiladi |
| **R6** | **Ega QABUL** → `setFlag.ts ravella on` | ⬜ | Ega real telefonida to'liq oqimni o'tadi va «QABUL» deydi. Faqat SHUNDAN keyin global ON + e'lon |

Har faza: mustaqil tekshiruv (kod yozmagan agent) → «READY FOR VERIFICATION» → ega qaroridan
keyingina «done». PROGRESS.md har fazada literal-haqiqat bilan yangilanadi.

---

## §10. Xavflar va ularning qarshi-choralari

| Xavf | Qarshi-chora |
|---|---|
| Mijoz konstruktorda narxni buzib yuboradi (client-side hisob) | Narx SERVERDA qayta hisoblanadi (§7.1) |
| Katta buyurtmada 1% = katta emissiya (2 mln → 20 000 tanga) | `ravellaCashbackPerOrder` cap + kunlik cap + faqat `done` |
| Soxta buyurtma fermasi (buyurtma → cashback) | Cashback faqat hamkor `✔ Bajarildi` bosgach; hamkor odam |
| Zoyir aka javob bermaydi, mijoz kutadi | SLA 15 daq → egaga BIR martalik alert (mavjud sweep) + mijozga «bekor qilish» tugmasi |
| Rasm og'irligi mini app'ni sekinlashtiradi | Telegram thumb (~320px) grid uchun, to'liq rasm faqat konstruktorda; `loading="lazy"` |
| E'lon 3000+ kishiga ketadi, xizmat tayyor emas | E'lon FAQAT R6 (ega QABUL) dan keyin; flag OFF → tugma ko'rinmaydi |

---

## §11. QARORLAR

**Ega tasdiqladi (2026-07-27) — QULFLANGAN:**
- ✅ 10% chegirma **Ravella hisobidan**, 1% cashback **BirJoy hisobidan** (§7.6).
- ✅ Ravella belgisi (sariq kvadrat-R) — rail ikonkasi + bosh ekrandagi **e'lon/banner joyi** (§6).

**Rejadagi tavsiya (ega «yo'q» demasa shunday quriladi):**
- 1% cashback FAQAT `✔ Bajarildi` bosilganda (darhol berish = soxta-buyurtma teshigi).

**Hali kerak (kod boshlanishiga TO'SQINLIK QILMAYDI — R1/R2'da kerak bo'ladi):**
1. **Zoyir akaning Telegram ID'si** — u botga `/start` bossa men ID'ni topaman (R3 uchun).
2. **Kategoriyalar** — hozircha 2 ta olindi: «🎭 Saxna bezaklari», «✍️ Bayram yozuvlari». Yana bormi?
3. **Rasmlar** — har bezakka 1 ta + har qo'shimchaga «qo'shilgan holat» rasmi. Kamida BITTA bezak
   to'liq komplekt (asosiy rasm + 2 qo'shimcha rasmi) bo'lsa, R2'ni to'liq isbotlay olaman.
4. **`logo.png`** — siz yuborgan belgi `packages/miniapp/public/ravella/logo.png` ga tushishi kerak.
