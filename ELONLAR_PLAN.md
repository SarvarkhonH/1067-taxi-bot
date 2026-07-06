# E'LONLAR — OLX-uslub e'lonlar doskasi (REJA, hali boshlanmagan)

> Maqsad: Reyting tabbar'dan uy ekraniga ko'chadi, bo'shagan tab o'rniga **E'lonlar** keladi —
> Koson aholisi o'z e'lonlarini (oldi-sotdi, ish, yo'qolgan narsa...) o'zi joylashtiradi.
> Xizmatlar = BIZ yig'gan katalog. E'lonlar = XALQ o'zi yozadigan doska. Ikkalasi birga
> super-app'ni "shahar hayoti markazi"ga aylantiradi.

**Holat:** `E1-E4 owner-accepted (2026-07-06) — dark-deploy qilinmoqda` · Flag: `elonlar` (OFF) · Boost uchun alohida flag: `elontop` (OFF)
**Dizayn-konsept:** «Mahalla e'lon taxtasi» (§4.1) — 2026-07-06 Sonnet hamkorlik-brainstorm sintezi.

---

## 1. UI ko'chirish (T1 — kichik, birinchi shippenadi)

| Joy | Hozir | Bo'ladi |
|---|---|---|
| Uy ekrani tugma qatori ([home.tsx:146](packages/miniapp/src/home.tsx)) | 🎮 O'yin · 👥 Do'st taklif · 📜 Tarix · 💰 Hamyon | 🎮 O'yin · 👥 Do'st taklif · 📜 Tarix · **🏆 Reyting** |
| Tabbar ([App.tsx:72](packages/miniapp/src/App.tsx)) | Uy · Hamyon · Do'kon · Xizmatlar · Reyting | Uy · Hamyon · Do'kon · Xizmatlar · **📋 E'lonlar** |

- Hamyon allaqachon tabbar'da bor — uydagi dublikat tugma olib tashlanadi (0 funksiya yo'qotish).
- Reyting ekrani o'chmaydi — faqat kirish nuqtasi ko'chadi (O'yin precedenti: 60523a8).
- Flag `elonlar` OFF bo'lsa tabbar ESKIcha qoladi (Reyting joyida) — to'liq rollback = `setFlag elonlar off`.
- Deep-link `?screen=reyting` ishlashda davom etadi (App.tsx:88 alias xaritasi tegmaydi).

## 2. Kategoriyalar (launch = 5 ta, keyin kengayadi)

| # | Kategoriya | Subtype | Narx maydoni | Izoh |
|---|---|---|---|---|
| 1 | 🛒 Oldi-sotdi | Sotaman / Olaman | so'm (ixtiyoriy, "Kelishiladi") | asosiy trafik |
| 2 | 💼 Ish | Ish beraman / Ish izlayman | oylik (ixtiyoriy) | 2 tomonlama |
| 3 | 🔍 Yo'qoldi–Topildi | Yo'qoldi / Topildi | YO'Q, doim tekin | community-good, viral |
| 4 | 🏠 Uy-joy | Ijara / Sotuv | so'm | Kosonda talab katta |
| 5 | 🚜 Transport & chorva | Mashina / Mol-hol | so'm | qishloq konteksti — chorva bozori kuchli |

Keyingi bosqich g'oyalari: 🎁 Tekinga beraman, 📢 Marosim/to'y xizmati e'loni (→ Xizmatlar'ga ko'prik), 🧑‍🏫 Repetitor/kurs.
"Xizmat ko'rsataman" turidagi e'lon kelsa → post-wizard uni Xizmatlar self-submit oqimiga yo'naltiradi (dublikat katalog ochilmaydi).

**MUHIM:** hamma narx REAL SO'M (tanga EMAS) — intercity precedenti. Tanga faqat boost-sink sifatida (§6).

## 3. Ma'lumot modeli (Prisma — ServiceListing qolipidan)

```prisma
model ClassifiedAd {
  id        Int      @id @default(autoincrement())
  tgId      BigInt              // egasi (edit/delete huquqi + spam-cap)
  authorName String
  category  String              // oldi_sotdi | ish | yoqoldi | uyjoy | transport
  subtype   String              // sotaman|olaman / beraman|izlayman / yoqoldi|topildi ...
  title     String
  desc      String   @default("")
  priceSom  Int?                // null = "Kelishiladi"; yoqoldi'da doim null
  phone     String
  status    String   @default("pending") // pending | active | sold | rejected | archived | expired
  isTop     Boolean  @default(false)     // tanga-boost, 24 soat
  topUntil  DateTime?
  paidCoins Int      @default(0)         // joylash uchun to'langan tanga (0 = bepul davr)
  viewCount Int      @default(0)         // cache — haqiqiy manba AdView
  callCount Int      @default(0)         // cache — haqiqiy manba AdContact
  reports   Int      @default(0)         // 3 ta → auto-hide + moderatsiya navbati
  expiresAt DateTime                     // createdAt + 30 kun
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  photos    AdPhoto[]
  @@index([category, status, isTop, createdAt])
  @@index([tgId])
  @@index([status, expiresAt])
}

model AdPhoto { // ServicePhoto pattern: Telegram file_id (durable, tekin)
  id Int @id @default(autoincrement())
  ad ClassifiedAd @relation(fields: [adId], references: [id], onDelete: Cascade)
  adId Int
  fileId String?
  url String?
  sortOrder Int @default(0)
  @@index([adId, sortOrder])
}

// KIM ko'rdi — admin nazorat uchun (Mini App Telegram-auth = har viewer tgId ma'lum)
model AdView {
  id Int @id @default(autoincrement())
  adId Int
  tgId BigInt
  viewerName String @default("")
  at DateTime @default(now())
  @@unique([adId, tgId])   // 1 user = 1 view satri (qayta ochsa at yangilanadi)
  @@index([adId, at])
}

// KIM tel qildi / yozdi — "📞" yoki "✍️" bosilganda log
model AdContact {
  id Int @id @default(autoincrement())
  adId Int
  tgId BigInt
  viewerName String @default("")
  kind String // call | message
  at DateTime @default(now())
  @@index([adId, at])
}
```

## 4. Foydalanuvchi oqimi (Mini App)

**Browse (E'lonlar tab) — chip-birinchi, qidiruv ikkinchi qatlam:**
- Tepa: kategoriya chiplari (gorizontal scroll, har biri o'z rangi+emoji, §4.1) — bosilganda darhol filtr.
  Qidiruv maydoni bor, lekin kichikroq/pastroq — auditoriya yozishdan ko'ra bosishni afzal ko'radi.
- Kategoriya ichida **subtype segment-toggle** katta ko'rinadi (Sotaman ↔ Olaman / Beraman ↔ Izlayman).
- Narx tez-chiplari: "Arzon / O'rtacha / Qimmat" (3 belgilangan chegara — slider EMAS, past savodxonlikka oson).
- Default tartib: **eng yangi birinchi** (kichik shaharda yangi e'lon = eng qizig'i); saralash menyu shart emas.
- **"Yangi" nuqta** oxirgi tashrifdan keyin chiqqan e'lonlarda (localStorage lastSeenAt) — qaytgan user darhol ko'radi.
- 2 ustunli foto-birinchi grid (shop-grid pattern): faqat foto + title + narx — ko'z bilan tez skaner.
- Bo'sh natija = dead-end EMAS: "Bu yerda hali yo'q — 🚜 Transport'ni ko'ring" (1 tugma boshqa kategoriyaga).
- Detal sheet: foto galereya, desc, ega mini-profili (§4.2), **📞 Qo'ng'iroq** (tel:) + **✍️ Yozish** (t.me deep-link).
  Detal ochilishi → AdView upsert, tugma bosilishi → AdContact log — ikkalasi fire-and-forget (server-side, soxtalab bo'lmaydi).
- Skeleton har async holatda, faqat design/tokens (dizayn qoidalari).

**Post wizard ("+ E'lon berish" FAB) — amalda 3 TEGINISH:**
1. Kategoriya-chip → subtype (bitta ekran, 2 tap)
2. **Bitta ekran**: foto (0–4, foto-birinchi tartib — foto yuqorida, ProductPhoto/xizmatlar upload pipeline REUSE)
   + sarlavha + tavsif (ixtiyoriy) + narx (default **"Kelishiladi"** — eng ko'p tashlab ketiladigan qadam majburiy emas).
   Telefon ALOHIDA QADAM EMAS: member'dan avto, faqat "boshqa raqam" havolasi (deyarli hech kim ishlatmaydi).
3. **To'lov-tasdiq**: "E'lon joylash — 500 tanga" (bepul davrda: "🎉 Hozircha bepul!") → tanga yechiladi →
   "Moderatsiyada ⏳ — tez orada chiqadi. Rad etilsa tanga qaytadi." + d-stamp muvaffaqiyat animatsiyasi.

P2'ga qoldirildi: 🎤 ovozli tavsif (yozishni yoqtirmaydiganlar uchun — voice file_id, transkripsiyasiz; MVP'ni
og'irlashtirmaslik uchun keyinroq). Rad etilgan g'oya: Telegram-forward'dan e'lon yaratish (matn/narx ajratish ishonchsiz).

**Mening e'lonlarim:** ro'yxat + status badge + statistika ("45 kishi ko'rdi · 6 tel qildi") + edit/delete +
"🔄 Qayta faollashtirish" (muddati o'tganda 1 bosim) + "✅ Sotildi" tugmasi (§7 tozalash mexanikasi).

## 4.1 O'ziga xos dizayn — «MAHALLA E'LON TAXTASI»

Har zona o'z shaxsiga ega: Uy = qora+oltin taxi, Do'kon = yorug' yashil bozor, Xizmatlar = qora katalog.
E'lonlar = **iliq qog'oz + terrakota** — "odamlar yozgan devor e'loni" hissi, app'ning yagona iliq-neytral zonasi.

- **Mexanizm**: `.app.elonlar-light` root-klass — `.shop-light` bloki (tokens.css) qolipidan ko'chiriladi, faqat rang almashadi.
  Atigi **2 yangi token**: `--classified-bg-grad` (iliq qog'oz gradienti `#faf6ee→#f7f2e8`), `--classified-accent` (terrakota `#c2622f`).
- **Karta = qog'oz e'lon**: yuqori o'ng burchakda CSS clip-path "qog'oz buklami" (asset yo'q), narx-chip terrakota;
  narx null bo'lsa "Kelishiladi" — faqat kontur, yumshoq (qat'iy narxdan vizual farq).
- **TOP e'lon = 📌 qadalgan**: terrakota halqa (`box-shadow ring`) + 📌 burchak belgisi — "doska tepasiga qadalgan" metafora
  (Do'kondagi 🔥 bilan adashmaydi).
- **Yo'qoldi–Topildi maxsus teri**: shtrix-hoshiya (dashed border — "yirtilgan flayer") + tepada rangli tasma:
  qizil "Yo'qoldi" / yashil "Topildi"; narx qatori umuman yo'q. "✅ Topildi!" bosilganda mavjud `.d-stamp` muhr-animatsiyasi.
- **Kategoriya ranglari** — mavjud `--acc` per-card pattern (shop-card qolipidan, 0 yangi komponent):

| Kategoriya | Emoji | Aksent |
|---|---|---|
| Oldi-sotdi | 🛒 | terrakota `#c2622f` |
| Ish | 💼 | slate `#5b6b7a` |
| Yo'qoldi–Topildi | 🔍 | 2-holatli tasma (qizil/yashil) |
| Uy-joy | 🏠 | oxra `#b08a3e` |
| Transport & chorva | 🚜 | zaytun `#6f7d4a` |

- **Mikro-detallar (hammasi mavjud klass/keyframe REUSE — 0 yangi animatsiya kodi):**
  `.d-skel` shimmer skeleton · `.d-empty` bo'sh holat ("📌 Hali e'lon yo'q — birinchi bo'lib joylang" + CTA) ·
  `.d-chip:active` scale bosim · "Yangi" pulse-nuqta (<1 soat e'lonlarda) · ko'rishlar soni count-up
  (`.d-coin.rolling` keyframe) · 📞/✍️ bosilganda haptic · joylash muvaffaqiyatida `.d-stamp` muhr.
- Foto yo'q e'londa placeholder = KATEGORIYA emojisi (umumiy kamera ikonkasi emas) — doska hech qachon "bo'sh" ko'rinmaydi.

## 4.2 Ishonch badge'lari (xatti-harakat asosida, pul-mexanika YO'Q, hammasi MAVJUD ma'lumotdan)

| Badge | Shart | Manba |
|---|---|---|
| ✅ 1067 a'zosi | botda ro'yxatdan o'tgan | member |
| 🚗 N marta safar qilgan | rideCount > 0 | mavjud ride ma'lumoti — eng arzon "haqiqiy odam" signali |
| 🤝 N muvaffaqiyatli savdo | ega "Sotildi" bosgan VA ≥1 AdContact bo'lgan e'lonlar soni | ClassifiedAd + AdContact |
| 📅 N oydan beri 1067'da | member.createdAt | member |
| ⚠️ Yangi a'zo (yumshoq ogohlantirish) | a'zolik <7 kun VA 0 safar | shaffoflik — bloklamaydi, xaridorga qaror qoldiradi |

- Detal sheetda "egasi" bosilsa **mini-profil sheet**: ism + badge'lar + faol e'lonlari soni — 1 tap ishonch-tekshiruv.
- OLX'dan ustunlik: u yerda hamma anonim-notanish; bu yerda har sotuvchi shahar taxi-tarixiga bog'langan real odam.

## 5. Admin panel — TO'LIQ NAZORAT (hech narsa qabulsiz chiqmaydi)

**Qoida: har e'lon `pending` da tug'iladi, faqat admin ✅ bosgandan keyin xalqqa ko'rinadi. Istisno yo'q.**

**Moderatsiya navbati** (xizmatlar review-queue REUSE, 96d3265 enrichment panel oqimi):
- Yangi/tahrirlangan e'lon → navbat kartasi: foto, matn, kategoriya, narx, **egasi (ism + tg link + telefon)** + [✅ Chiqarish / ❌ Rad (sabab shabloni)].
- Ownerga Telegram'da ham [✅ / ❌] inline tugma (cashout-approval pattern) — telefondan tasdiqlaydi.
- Egaga avto-xabar: "✅ E'loningiz chiqdi" / "❌ Sabab: ...".
- **Moderatsiya SLA: <30 daqiqa maqsad.** Kechikish = user "e'lonim yo'qoldi" deb qaytmaydi (bitta yomon tajriba = ketish).
  2 soat javobsiz pending qolsa → ownerga eslatma-push: "⏳ 3 ta e'lon kutmoqda" (mavjud sweep'ga arzon tekshiruv).

**E'lonlar jadvali (asosiy nazorat ekrani):**

| Ustun | Manba |
|---|---|
| E'lon (foto+title+kategoriya+narx) | ClassifiedAd |
| **Egasi** — ism, tg-profil link, telefon, nechta aktiv e'loni bor | tgId → member join |
| Status + qancha to'lagan (tanga) | status, paidCoins |
| 👁 Kim ko'rdi — soni + bosilsa RO'YXAT (ism + tg + vaqt) | AdView |
| 📞 Kim tel qildi / ✍️ yozdi — soni + ro'yxat | AdContact |
| Amallar: arxivla / o'chir / TOP ber / muddat uzayt | — |

- Filtr: kategoriya, status, egasi bo'yicha qidiruv; saralash: eng ko'p ko'rilgan / eng yangi.
- Yuqorida jonli hisoblagichlar: pending N · aktiv N · bugungi ko'rishlar · bugungi tanga tushumi.
- Anti-spam: 1 user max **3 aktiv e'lon** (admin knob); taqiqlangan so'z filtri submit'da; 3 report → auto-hide + navbatga.
- Keyinroq: 5+ marta muammosiz o'tgan user → auto-approve (trusted) — lekin baribir jadvalda ko'rinadi.

**Ega o'z statistikasini ham ko'radi** ("Mening e'lonlarim"da): "45 kishi ko'rdi · 6 kishi tel qildi" —
bu TOP-boost upsell'ining eng tabiiy joyi ("ko'proq ko'rishsin → ⭐ TOP").

## 6. Tanga narxi — zinapoya (faqat SINK, iqtisodga foyda)

E'lon joylash **pullik (tanga)**, bitta admin-knob `elonPostPrice` bilan boshqariladi — cron kerak emas,
owner qo'lda ko'taradi:

| Bosqich | Narx | Qachon |
|---|---|---|
| Launch | **0 (bepul)** | birinchi 1 hafta — doska to'lsin, odat shakllansin |
| 2-bosqich | **500 tanga** | 1 haftadan keyin owner knobni ko'taradi |
| 3-bosqich | **1 000 tanga** | talab ko'tarilganda (ko'rishlar o'sganda) |

- To'lov submit paytida yechiladi (CoinTxn + idempotent kalit). **❌ rad etilsa — tanga AVTO-QAYTARILADI**
  (refund txn) — adolat, aks holda odamlar qo'rqadi.
- Tanga yetmasa — to'siq emas, imkoniyat: "Tanga yetmayapti — safar qiling yoki do'st taklif qiling" (deep-link).
  Bu e'lon → tanga talabi → ko'proq safar aylanasini yaratadi.
- Tavsiya: **Yo'qoldi–Topildi doim bepul** (community-good, viral) — alohida knob, owner xohlasa o'zgartiradi.
- **⭐ TOP e'lon**: 24 soat tepada + sariq ramka = alohida narx (knob, default ~2 000 tanga), flag `elontop`.
- Pul-to'lab-omad EMAS — bu ko'rinish xizmati, o'yin natijasi emas. Hamma yechim CoinTxn'da, kill-switch: `elonlar` OFF = to'lov ham to'xtaydi.

## 6.1 Tezlik & sifat standartlari (chaqmoq mezoni)

- **<100ms vizual javob** har bosishda (dizayn qoidasi): optimistik UI, haptic, skeleton har async holatda.
- Birinchi sahifa **keshdan ochiladi** (oxirgi feed localStorage'da) → tab ochilishi bir zumda, orqada yangilanadi.
- Ro'yxat sahifalab yuklanadi (20 tadan, infinite scroll); fotolar lazy-load + thumbnail avval.
- API p95 **< 300ms**: hamma so'rov indeks ustida (`@@index([category, status, isTop, createdAt])`), N+1 yo'q.
- View/contact log **fire-and-forget** (javobni kutmaydi) — UI hech qachon log tufayli sekinlashmaydi.
- Faqat design/tokens; animatsiya faqat transform/opacity; prefers-reduced-motion hurmat qilinadi.
- Har ekran 3-soniya testi: bu nima? menga nima? nima bosaman?

## 7. Muddat tugashi — YANGI POLLER YO'Q (invariant)

- `expiresAt` o'tgan e'lon: (a) o'qishda lazy-filter (`status=active AND expiresAt>now`), 
  (b) mavjud bookingNotifier sweep'iga arzon UPDATE qo'shiladi (`active→expired WHERE expiresAt<now`, batch).
- Muddati tugashidan 2 kun oldin egaga bot push: "E'loningiz tugayapti — uzaytirasizmi?" (retention).
- **"Chirigan doska" himoyasi** (OLX-uslub doskalar eng ko'p shu yerda o'ladi — xaridor tel qiladi, "allaqachon
  sotilgan" eshitadi, ishonch tugaydi): e'lon chiqqandan 3 kun keyin egaga 1-tap push:
  "Hali sotilmadimi? [✅ Faol qolsin / ❌ Sotildi — yopish]". "Sotildi" = status `sold` + 🤝 savdo-badge sanog'i (§4.2).

## 8. O'sish ilgaklari — Telegram-native ustunliklar (OLX buni QILA OLMAYDI)

Launch bilan birga (arzon, tayyor infra):
- 🔗 **Har e'longa deep-link** (`t.me/bot?start=ad_123`) — bosilsa to'g'ridan Mini App'da o'sha e'lon ochiladi.
- 📤 **Forward-share**: e'lon kartasini 1 tugma bilan guruhga/do'stga ulashish (native Telegram share) — organik tarqalish.
- 📣 Launch-push barcha userlarga bir marta: "Yangi: E'lonlar tabi — 1 hafta bepul!" (cold-start yechimining ikkinchi yarmi).

P2 (launch'dan keyin):
- 📢 **Kanal cross-post**: tasdiqlangan e'lon 1067 Telegram kanaliga avto-post + deep-link tugma —
  har e'lon = bepul reklama + yangi user kanali.
- 🔔 Saqlangan kategoriya: "Transport'da yangi e'lon chiqsa push" (mavjud push infra) — OLX email-push'idan ancha kuchli.
- 🎤 Ovozli tavsif (§4 P2).
- Yo'qoldi–Topildi topilganda "✅ Topildi!" muhri — feel-good moment, share tugma.
- 📍 Mahalla/tuman chip-filtri (profil manzili bo'lsa) — qishloq-tuman farqi kichik shaharda ham muhim.

## 9. Xavflar

| Xavf | Yechim |
|---|---|
| Moderatsiya yuki ownerga tushadi | Telegram 1-tap approve + keyinroq trusted auto-approve |
| Taqiqlangan kontent (qurol, dori...) | so'z-filtr + qoidalar sahifasi + reject sabab shabloni |
| Xizmatlar bilan chalkashlik | post-wizard'da "xizmat ko'rsataman" → Xizmatlar oqimiga redirect |
| Bo'sh doska (cold start) | owner 15–20 real e'lon seed + 1 hafta bepul + launch-push (§8) |
| Eskirgan e'lonlar → ishonch o'limi | 3-kunlik "sotildimi?" 1-tap push + 30-kun avto-expire (§7) |
| Moderatsiya kechikishi → user qaytmaydi | SLA <30 daq + 2-soatlik owner eslatma-push (§5) |
| Pullik bo'lgach oqim to'xtashi | narx knob — sekin ko'tariladi (0→500→1000), ko'rish-statistikasi qiymatni isbotlaydi ("45 kishi ko'rdi") |
| "Kim ko'rdi" maxfiylik shikoyati | ro'yxat FAQAT admin panelda; egaga faqat SON ko'rinadi (ism emas) |
| home.tsx vs uy.tsx dublikati | JONLI uy = home.tsx (skrinshot mos); uy.tsx'dagi tile qatori ham sinxronlanadi |

## 10. Tiketlar va DoD

| Tiket | Qamrov | DoD (har biri buyruq+isbot bilan) |
|---|---|---|
| **E1** UI ko'chirish | home.tsx tile swap + App.tsx tab (flag ortida) | typecheck 0; flag OFF=eski UI skrinshot; flag ON=yangi UI skrinshot; reyting deep-link ishlaydi |
| **E2** Model+API+UI | ClassifiedAd/AdPhoto/AdView/AdContact; CRUD; browse (chip-birinchi §4) + 3-teginish wizard + to'lov (knob, refund) + «Mahalla taxtasi» dizayni (§4.1: elonlar-light shell, 2 token, karta terisi) + ishonch-badge'lar (§4.2) | testElonlar.ts TEST DB'da yashil ×3 (jumladan: to'lov yechildi / rad→refund / knob=0 bepul / idempotent-takror); dizayn = skrinshot har karta turi (oddiy/TOP/yo'qoldi) |
| **E3** Admin nazorat | moderatsiya navbati + e'lonlar jadvali (egasi, kim ko'rdi, kim tel qildi) + owner TG approve + SLA eslatma-push + anti-spam cap | pending→approve→active jonli isbot; jadvalda AdView/AdContact ro'yxati skrinshot; 4-e'lon rad; 3 report auto-hide; 2-soat eslatma isboti |
| **E4** TOP boost + expiry + tozalash | tanga sink (elontop flag) + sweep kengaytmasi + tugash-push + 3-kunlik "sotildimi?" push + 🤝 savdo-badge | CoinTxn idempotent-takror testi; expired lazy+sweep isboti; sold→badge isboti; APP DB'da sweep-test TAQIQ (TEST_DATABASE_URL) |
| **E5 (P2)** Kanal cross-post + saved search | — | alohida reja |

Tartib: E1 → E2 → E3 → (QABUL, flag `elonlar` ON) → E4 → E5. Har tiket owner-accepted bo'lmaguncha keyingisi boshlanmaydi (DoD protokoli).

## 11. BUILDER-ESLATMA — butun loyiha SONNET bilan quriladi (ega qarori, 2026-07-06)

Bu reja ataylab batafsil yozilgan — quruvchi sessiya rejadan TASHQARIGA CHIQMAYDI. Qat'iy qoidalar:

1. **Pul-kod cheklovi**: tanga yechish/qaytarish FAQAT CoinTxn + idempotent kalit orqali
   (kalit format: `elon_post_<adId>` / `elon_refund_<adId>` / `elon_top_<adId>_<kun>`).
   Balansga to'g'ridan-to'g'ri UPDATE yozish TAQIQ. Shubha bo'lsa — shopService.ts dagi purchase-oqimdan nusxa ol.
2. **Refund invarianti**: rad etilgan e'lon uchun refund AVTOMATIK va bir marta (idempotent kalit himoya qiladi).
   Approve→reject holat-o'tishida refund yo'q (allaqachon chiqqan e'lon arxivlanadi, pul qaytmaydi).
3. **Narxlar hech qachon kodga yozilmaydi** — faqat admin knob (`elonPostPrice`, `elonTopPrice`); knob=0 = bepul.
4. **Flag-gating**: har API endpoint `elonlar` flag tekshiruvi bilan boshlanadi; UI tab flag OFF'da ko'rinmaydi.
5. **Test qoidasi**: testElonlar.ts FAQAT TEST_DATABASE_URL'da; APP DB'da sweep-test TAQIQ (CLAUDE.md saboqlari);
   TAG'li throwaway satrlar + to'liq cleanup; gate 3× ket-ket yashil.
6. **Dizayn**: §4.1 dan chetga chiqmaslik — faqat 2 yangi token, qolgan hamma klass mavjudidan REUSE;
   inline stil = xato; yangi animatsiya keyframe yozish TAQIQ.
7. **"READY FOR VERIFICATION"** — "done" demaslik; har DoD satri buyruq+natija isbot bilan (DoD protokoli, CLAUDE.md).
8. Reja bilan kod to'qnashsa — TO'XTA va egadan so'ra; rejani jimgina o'zgartirish TAQIQ.
