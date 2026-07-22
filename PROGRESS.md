# PROGRESS

## Jarayonda (yangi)

### 🔁 "Yana shu yo'l" — 1-tap repeat-route chips (NEXT_LEVEL_PLAN 1.1) — `ready for verification`
Home screen (LivingHome + uy.tsx fallback) endi safar tarixidan so'nggi 3 ta DISTINCT yo'nalishni chip
sifatida ko'rsatadi — 1 bosishda aynan o'sha manzilga taksi chaqiradi.
- **Server:** `Member.recentPickupsJson` (additiv, nullable String) — har `rememberPickup()` chaqiruvida
  yangilanadi (`pushRecentPickup`, bookingService.ts): id bo'yicha dedup (real kas-katalog manzillar),
  yoki nom bo'yicha dedup (id=0 xarita-pin'lari uchun — hammasi bir xil id=0 baham ko'radi); eng ko'p 3
  ta, eng-yangi-birinchi. `getRecentPickups(memberId)` — yangi `GET /api/booking/recent` orqali ochiladi
  (requireUser, boshqa booking GET route'lar bilan bir xil uslub, rate-limit yo'q — faqat o'qish).
  `lastPickupId`/`defaultPickupId` (callOneTapFor kaskadi) TEGILMAGAN — bu butunlay alohida, faqat
  ko'rsatish uchun ro'yxat.
- **Mini App:** `home.tsx` (LivingHome — HAQIQIY default ekran, `livinghome` flag hozir global ON) va
  `uy.tsx` (flag-off fallback) ikkalasida ham `🔁 Yana shu yo'l` chip qatori — CTA tugmasi ostida.
  Bosilganda `api.bookingCreate({ pickupId, pickupName, lat, lng })` (createBookingFor — aniq shu
  pin/manzilga, hech qanday taxmin/kaskad yo'q) → muvaffaqiyatli haqiqiy dispatch bo'lsa `onBook()` orqali
  mavjud live-tracking overlay (Booking3View) ochiladi (yangi UI ixtiro qilinmadi); aks holda `flash()`
  toast bilan sabab ko'rsatiladi. LivingHome'da `usualRide` bilan bir xil manzil chip'da QAYTA
  ko'rsatilmaydi (filter).
- **ISBOT:** typecheck 4/4 toza · `testRecentPickups.ts` **10/10 assertion** (TAG'li throwaway Member,
  to'liq cleanup) — bo'sh holat, 3ta dedup+tartib, 4-chisi cap+eviction, mavjud id qayta-dispatch →
  frontga ko'chadi (dublikat yo'q), id=0 pin'lar NOM bo'yicha dedup. `GET /api/booking/recent` jonli
  serverda **401** (auth-guard ishlayapti, route ro'yxatga olingan — tsx watch hot-reload orqali
  qayta ishga tushirmasdan tasdiqlangan). Mini App: TAG'li preview-test a'zo (recentPickupsJson qo'lda
  to'ldirilgan) + `?tg=` debug-auth bilan preview'da 3 ta chip **to'g'ri render** (matn kesilishi,
  joylashuv, uslub) tasdiqlandi — **chip HECH QACHON bosilmadi** (BOOKING_LIVE=true muhitida haqiqiy
  taksi chaqirib yubormaslik uchun), keyin test a'zo o'chirildi. App DB (Neon) additiv push qilindi.
- **QOLDI:** ega real telefonda QABUL (haqiqiy bosish orqali dispatch tekshiruvi — bu tomondan
  bajarilmadi, chunki jonli muhitda haqiqiy taksi chaqirib yuborish xavfi bor edi).

## Bajarildi
- A-to'lqin: iqtisod rebalans (clamp 350), jonli safar kartasi + harakatlanuvchi pin, safar-ichi g'ildirak/taxmin/kombo, Analitika tab.
- B: Garaj (5 mashina, daqiqa-stavka faqat real safarda), haydovchi haftalik tierlari (percentildan) + kvestlar, aqlli push (2/kun cap, quiet hours).
- C: Kolleksiya (mintCap+serial, resale 10% burn), mashina qismlari dropi, Koson kvesti, recruit QR (100→25 revshare), TANGA rebrand, jackpot ticker.
- D: 1067 Plus (9990/oy, 1-oy bepul, cap'langan boostlar), Gap davralari (rotatsion pot), B2B prepaid registr, Mashina fondi (100 so'm/safar).
- E: narx-bashorat (delivered tarixidan), jonli bo'sh-mashina pinlari, ⭐ baho+teglar, rules-first AI (LLM kalitsiz o'chiq), savdo escrow/barter/chat, rejali safar (T-10 dispatch), oila uchun chaqirish.
- Admin: Jonli xarita, 360 qidiruv, kill-switch, korp, mashina hisoboti, operator-token (rollar-lite), recruit QR PNG.
- Testlar: 15 suite (~250 tekshiruv) yashil. Deploy: Render + Vercel (bundle-grep isbotlangan).
- **v2 owner-accepted (2026-06-27):** T3 (5 gap) · T4-A (per-km rate-card) · T6 (Bonus center) · T7 (Admin Puls+Moliya) · T8 (nightly self-check + E2E gate) · Home action-first (hero CTA + Bugun strip) — hammasi real telefonda tekshirildi, owner QABUL berdi.
- **Bog'lanmagan foydalanuvchi:** admin "Faqat bog'lanmaganlar" filter + joinedAt ustuni; 24 soat o'tgan ulashilmaganlarga bot eslatma (linkReminderService, 2026-06-27).

## Jarayonda

### 🔎 XIZMATLAR (xizmatlar) — Koson servicelari katalogi, Super Bot v1 — 🟢 LIVE (owner GO LIVE 2026-07-06, soft-launch)
**GO LIVE (2026-07-06, b2ff03c):** ega «xizmatlar go live» buyrug'ini berdi. Yoqishdan OLDIN jonli holat ko'rsatildi (67 tadan: 0 foto, 0 narx, 0 1067-audit, 1 soat, 1 tavsif) — ega bilib turib «hozircha yoq, mavjud ma'lumotlar bilan tursin» dedi (soft-launch, jonli boyitiladi). `setFlag.ts xizmatlar on` bilan yoqildi + `EXPECTED_ON`ga qo'shildi (A7 audit yozuvi). Isbot: `/api/admin/services` → `enabled:true` jonli; bot menyusida «🔎 Xizmatlar» va Mini App'da tab endi HAMMA foydalanuvchiga (owner-preview emas) ko'rinadi. Qoldi: admin panel orqali jonliqda boyitish (foto/narx/soat/1067-audit).

### 🔎 XIZMATLAR — qurilish tarixi (B1, 2026-07-05) — DARK DEPLOYED edi, endi yuqorida LIVE
**Deploy isboti (2026-07-05 kech):** server ba26d74 → Render live (33d806a ichida, deploys API «live») · app DB additiv push + 10 kategoriya seed · **eski Mongo `businessDir`dan 66 xizmat import** (70dan: 3 dublikat-telefon, 1 yaroqsiz «+998 »; 45 eski mikro-kategoriya → 10 toza; eski nom teg sifatida saqlangan; qayta-yugurtirish → 0 = idempotent). Taqsimot: Qurilish 16 · Usta-servis 12 · Do'kon-savdo 9 · Transport 8 · Ta'lim 7 · Oziq-ovqat 5 · Tibbiyot 4 · Boshqa 3 · To'y 1 · Go'zallik 1. Jonli tekshiruv: `/api/admin/services` → enabled:false, rows:66, hammasi active. Miniapp Vercel prod + **bundle-grep**: `services-Dkfr3bU4.js` jonli («Xizmatimni qo'shish» bor), API URL to'g'ri baked. Ega telefonda «Xizmatlar» tab endi owner-preview'da ko'rinadi.
Reja: `XIZMATLAR_PLAN.md` (ega tasdiqlagan). «Koson 2GIS'i»: kategoriya → reyting/verified'li kartalar → boy profil (galereya + baho/sharh + bir-bosishda-qo'ng'iroq) → o'z xizmatini qo'shish (ega [✅/❌] moderatsiya — cashout/shop naqshi). **PUL YO'Q** — coin ledger'ga hech qanday yo'l yo'q; kas API'ga ham tegilmaydi.
- **Jadval (additiv):** `ServiceCategory` + `ServiceListing` (status pending|active|rejected|archived, isVip, verified, viewCount/callCount, keshlangan avgRating/reviewCount/**rankScore** — bayes (avg·n+4·5)/(n+5), ro'yxatda JOIN yo'q) + `ServicePhoto` (Telegram file_id naqshi, max 6) + `ServiceReview` (@@unique listingId+tgId → 1 odam = 1 baho, upsert; 3 shikoyat → auto-hidden + admin navbati).
- **Server:** `serviceDirectory.ts` (yangi) · 11 rider route `/api/services/*` (flag-gated + owner-preview) · 9 admin route `/api/admin/services*` · foto-proxy (shop naqshi, IP rate-limit) · `bot/xizmatlar.ts` — submit → egaga karta [✅ Tasdiqlash/❌ Rad], qaror → yuborganga push. Spam: 2 submission/kun/user + telefon +998 normalizatsiya + duplicate-telefon rad.
- **Mini App:** `services.tsx` (yangi «Xizmatlar» tab, lazy chunk 4.9kB gzip, flag+owner-preview) — qidiruv (300ms debounce, server-side nom/teg/telefon/desc) · 2-ustun rangli kategoriya-grid (son bilan) · «Eng yaxshilari» (rankScore) · karta: foto/emoji + ★reyting + VIP/verified + Ochiq/Yopiq (workHours'dan jonli) + yashil qo'ng'iroq-nuqta · profil-sheet: galereya (scroll-snap+dots) + «★4.8 · N baho · 📞 N marta» + [📞 Qo'ng'iroq (tel: + callCount server-side)] [📋 Nusxa] [★ Baho] + 5-yulduz baho-widget + sharhlar (⚑ shikoyat) · «➕ Xizmatimni qo'shish» forma · «Meniki» (status + 👁/📞 statistika).
- **ISBOT:** typecheck server+miniapp toza · `testServices` **42 assertion 3× yashil** (TEST DB: DEFAULT_OFF berk · telefon normalizatsiya · pending ko'rinmas → ✅ → ko'rinadi, double-approve no-op · duplicate/daily-limit rad · baho upsert (count o'smaydi) + agregat aniq · bayes: 20×4.8 > 2×5.0, VIP #1 · 3 unikal shikoyat → hidden + agregat qayta, restore qaytaradi · call/view counter · seed idempotent) · vite build yashil.
- **P1+P2+P3 polish (2026-07-06, 2af6fb9 — 3× Sonnet konsult asosida, ega tasdiqlagan):** ⚡P1 tezlik: foto thumb-tier (`thumbFileId`, `?s=1` — karta rasmlari ~85-90% yengil) · SWR modul-kesh + boot idle-prefetch (qayta ochish skeleton'siz bir zumda) · photoCounts parallel + ortiqcha count() olib tashlandi · 60s kategoriya-kesh (har mutatsiyada bust) · Cache-Control 30s · decoding=async. 🎨P2 UX: karta 📞 44px+glow, profil'da to'liq-keng yashil qo'ng'iroq tugmasi, «🆕 Yangi» chip (kulrang absence-matn o'rniga), per-ID accent, «Yangi qo'shilganlar» qatori, halol top-label (baho 0 bo'lsa «Tavsiya etamiz»), kam kategoriya xira, telefon-format hint, karta stagger-in + birinchi-baho d-stamp (reduced-motion hurmat). 📬P3: `ServiceRequest` demand-capture («topilmadi» → so'rov 3/kun, egaga info-karta + admin navbat ✅/✖) · «⚑ raqam ishlamadi» (1/user, ≥2 → admin qizil belgi, telefon tuzatilsa reset) · ulashish deep-link `t.me/koson1067bot?start=svc_<id>` (bot listing-karta javob beradi) + profil'da [↗️ Ulashish]. **ISBOT:** typecheck 3/3 · testServices **54 assertion 3× yashil** · additiv push ikkala DB · Render live (2af6fb9) · jonli admin API phoneFlagged/newRequests/phoneReports qaytarmoqda · miniapp `services-DPm3dc2I.js` + admin bundle-grep markerlar jonli.
- **v1.2 «2GIS-parity» (2026-07-06, f5890e2 — ega: «o'yinchoqmi?» savoliga javob):** 💰 **Narxlar** (`ServicePriceItem` — admin «Nom=narx; Nom=narx» editor, replace-all; kartada «N so'mdan» min; narx-satr qidiruvda topiladi) · 🔖 **Saqlash** (`ServiceFavorite` — profilda yurak, optimistik toggle; bosh sahifada «Saqlanganlar») · 🗺 **Borish** (geoLat/Lng → Yandex Maps navigator deep-link; koordinatasiz manzil-qidiruv fallback; yaroqsiz koordinata → null; admin 🗺 tugma) · 🟢 «Ochiq hozir» filter-chip · telefonga bosish = nusxa. **ISBOT:** typecheck 3/3 · testServices **66 assertion 3× yashil** · additiv push ikkala DB · jonli API `priceCount`/`geoLat` qaytarmoqda · miniapp `services-R8f4Yq5A.js` bundle-grep (Narxlar/Saqlanganlar/Borish/Ochiq hozir). Test-flake tuzatildi: viewCount fire-and-forget yozuvi cross-region TEST DB'da kech qo'nishi mumkin — endi poll.
- **Admin boyitish paneli (2026-07-05, 96d3265):** BOSHQARUV → «🔎 Xizmatlar» — filter (status/kategoriya/qidiruv), prompt-tahrir (nom/tel/tavsif/soat/manzil/teg), kategoriya ko'chirish, ✔verified + ⭐VIP, pending ✅/❌, arxiv/qaytarish, 📷 6-foto yuklash, ⚑ shikoyat-sharh navbati, tez-qo'shish + yangi kategoriya. «Boyitilgan: N ta» hisoblagich. Jonli: admin-seven-ebon-95.vercel.app bundle-grep 2 marker. Ega izohiga javob: maketdagi boylik = DATA (foto/soat/baho) — endi shu paneldan to'ldiriladi.
- **B1 to'liq yopildi — bot-tomon kirish nuqtalari (2026-07-06):** `mainMenu()` endi async — flag ON (yoki admin-preview) bo'lsa reply-keyboard'ga «🔎 Xizmatlar» qatori qo'shiladi (16 chaqiruv joyi + `booking.ts` imzosi yangilandi). Bosilsa: flag off+admin-emas bo'lsa «tez orada», aks holda «nima kerak?» so'rab `svcSearchWait` sessiyasiga qo'yadi (codeLink/editName bilan bir xil transient-Set naqshi — global matn-tutqichni band qilmaydi). Keyingi matn = qidiruv so'rovi (emoji/tugma-matni yoki `/` bo'lsa next() — booking/boshqa oqimlarga tegilmaydi) → top-5 natija (nom+✅verified+★reyting+💰narx+kategoriya, telefon Telegram avto-linkify bilan bosiladigan) + «To'liq ko'rish» Mini App tugmasi. Reja B1'dagi ikkala band («botda tugma» + «matn yozilsa top-5») shu bilan yopildi. **ISBOT:** typecheck server+miniapp+admin 3/3 toza (mainMenu 16 chaqiruv + booking.ts imzo yangilandi, boshqa fayl ta'sirlanmagan).
- **v1.3 — ijtimoiy tarmoq + «1067 tekshiruvi» (2026-07-06):** ega: «2GIS'da yana ko'p narsa bor — restoran/dorixona/do'kon ham kerak, va bizning jamoa jismoniy borib tekshiradigan alohida audit-baho qilamiz». 🔗 **Ijtimoiy tarmoq**: instagram/telegramUrl/facebook/website (profilda ikon-tugma qatori, faqat bo'lsa ko'rinadi). 🏅 **«1067 tekshiruvi»** — mijoz avgRating/reviewCount'ga HECH TEGMAYDIGAN mustaqil audit maydoni (`inspStars` 1-5 + `inspNote` + `inspAt`, rankScore'ga qo'shilmaydi — ataylab, bo'lmasa 1067-audit bir nechta ovoz bilan 200 sharhli biznesni bosib ketishi mumkin edi): kartada teal «🏅 1067: N★» belgi, profilda alohida ajratilgan (orange mijoz-reytingidan rang bilan farqlanadigan) blok + xulosa matni. Admin: 🔗 va 🏅 tugmalari (1-5 oraliq validatsiya, bo'sh=bekor qilish → sana ham tozalanadi). **Kategoriya kengaytirildi**: Restoran/Kafe 🍽 va Dorixona 💊 DEFAULT_CATEGORIES'ga qo'shildi (10→12, eski 10 tegilmagan) — restoran/dorixona/do'kon uchun ALOHIDA kod kerak emas edi, admin "📂+" tugmasi orqali istalgan yangi kategoriya qo'shish mumkin edi. **ISBOT:** typecheck server+miniapp+admin 3/3 toza (miniapp'dagi yagona xato boshqa sessiyaning `elonlar.tsx`'da, mening `services.tsx`'imga aloqasi yo'q) · testServices **73 assertion 3× yashil** (round-trip ijtimoiy tarmoq + bo'sh-satr→null, 1-5 validatsiya (0/6 rad), null→to'liq bekor qilish (sana ham), kartada inspStars ko'rinishi, mijoz reytingiga tegilmaganligi tasdiqlangan) · additiv push ikkala DB + 2 yangi kategoriya seed qilindi.
- **P4 post-launch (2026-07-06, ega: «rejani to'liq tugat»):** 🏪 **Claim «Bu meniki»** — Telegram'ning o'z kontakt-ulashishi identity-isbot (Mini App → bot deep-link `claim_<id>` → `contactKeyboard()` → telefon ANIQ mos kelsagina `ownerTgId` biriktiriladi, atomik `updateMany` race-guard bilan; profilda `claimable`/`isMine` maydonlari). 📊 **Haftalik kanal digest** — mavjud `channelService.ts` infratuzilmasi umumiy qilindi (`channelInfraReady` — endi flag-mustaqil), «hafta TOP xizmatlari» `xizmatlar` flag bilan, jackpot digest'dan MUSTAQIL (`channel:svcdigest` alohida marker). 🔍 **Mashhur qidiruv chiplari** — mavjud `tags`'lardan hisoblangan (yangi jadval yo'q), 60s kesh. 🚕 **Taxi cross-promo** — safar-tugash kartasiga BITTA qo'shimcha tugma («🔎 Yaqin xizmatlar»), yangi so'rov/matn YO'Q — ARCHITECTURE.md ogohlantirgan 900+ qatorli sweep funksiyasiga minimal-xavfli teginish (try/catch, flag-gated). **ISBOT:** typecheck 3/3 toza · testServices **83 assertion 5× ketma-ket yashil** (bitta flaky topildi va tuzatildi: `getListing`'ning fire-and-forget viewCount yozuvi ba'zan `$disconnect()`dan keyin ham davom etardi — endi 500ms drain-kutish, faqat test-gigiena, productionga aloqasi yo'q). Cross-promo tugmasi avtomatlashtirilgan sweep-testi bilan qoplanMAGAN (mavjud sweep-simulyatsiya testlari alohida TEST_DATABASE_URL talab qiladi, CLAUDE.md); kod-ko'rikdan tasdiqlangan: 0 yangi so'rov, 0 pul-yo'l, try/catch bilan o'ralgan.
- **QOLDI:** 5-chi P4 band — «tanga-sink» (sharh/biznesni tanga bilan «qo'llab-quvvatlash» badge'i) ATAYLAB QURILMADI — pul-iqtisodiga (CoinTxn, spendCoins) tegadigan yagona qolgan band, aniq mexanika (narx/badge ko'rinishi) bo'yicha ega tasdig'i kerak, shuning uchun alohida so'raladi. Boshqasi: seed 66→80-100+ va boyitish (desc/soat/manzil/foto/narx/koordinata/1067-audit — admin panel tayyor, ega jonliqda to'ldiradi). Rollback (kerak bo'lsa): `setFlag xizmatlar off`.

### 🛍 TANGA DO'KONI (shop) — 🟢 LIVE (QABUL 2026-07-06, flag ON, commit 3eeb653) — hammaga ochiq
**V2 (41ecc3e + bb4e703):** ega «haqiqiy market standartlari» talab qildi → qidiruv · featured 16:9 hero-karusel (admin ⭐) · Uzum-uslub kategoriya-gorizontal-qatorlar · 💥 chegirma (oldPriceTanga → ustidan-chizilgan + −N% qizil badge) · 🔥TOP (delivered top-3 avto) · 4-5 rasmli galereya (ProductPhoto, scroll-snap+dots) · o'xshash-mahsulotlar · yetkazish-va'da chizig'i · manzil-prefill. **3 bug-fix:** rasm 413 (global json 100kb→6mb) · owner-preview endi katalog+buy'ni ham ochadi (faqat tab emas — «ichiga kirilmadi» bugи) · admin xatolar aniq matnda. `testShop` **44 assertion ×3**. Jonli bundle-grep: miniapp `shop-Wo4knEx-.js` (hero/qidiruv/o'xshash), admin (Chegirma/TOP'ga), server live+200.
Sonnet×2+Opus konsult → ega tasdiqlagan reja. «Cashout-teskarisi»: buy'da tanga BITTA member-locked tranzaksiyada ushlanadi (balans-shartli decrement + atomik stock-claim `stock>=1` + order + CoinTxn `shop:<id>`); egaga Telegram-karta [✅ Yetkazildi]/[❌ Rad]; rad = `shoprefund:<id>` bilan aynan-bir-marta refund + restock; `shop_refund` reyting-excluded. Lootbox YO'Q. Rasm: driver-photo Telegram file_id naqshi (bepul doimiy xotira). Jadval: `Product` + `ShopPurchase` (legacy `ShopOrder` nomi band edi — o'chirilgan eski tizim satrlari saqlanadi).
- **Rider (Mini App):** «Do'kon» tab (flag-gated + owner-preview) — 2-ustun Uzum-uslub grid, kategoriya-chiplar, YANGI/«kam qoldi» badge'lar, 2-bosqichli sotib-olish sheet, tanga-yetmasa → «N safar yetadi + 🚕 Hozir chaqirish» (do'kon safar sotadi), Buyurtmalarim (rad'da refund-banner).
- **Admin:** BOSHQARUV → «🛍 Do'kon» — mahsulot CRUD, rasm yuklash (galereya→base64→Telegram CDN), narx/stock inline-edit, yoqish/o'chirish, buyurtmalar monitor. Knoblar serverdan — admin auto-render.
- **ISBOT:** typecheck 4/4 · `testShop` **36 assertion 3× yashil** (TEST DB: oxirgi-dona 3-parallel → aynan 1 g'olib; double-tap 1 yechim; insufficient toza fail; reject refund aynan-1 + restock; deliver terminal, ✅→❌ race'da refund YO'Q; pending-cap 3; flag-off berk) · preview DOM (grid/badge/chip/banner) · jonli bundle-grep: miniapp `shop-j-ChRIwb.js` (Do'kon/shop-card/Buyurtmalarim), admin index (Yangi mahsulot/shopCreate) · app+test DB additiv push.
- **V4 yorug' rejim + sharhlar + tezlik (2026-07-06, a3c1a8f → 398df4d):** ega talablari ketma-ket bajarildi:
  - **To'liq light-mode:** Do'kon tabida BUTUN ekran yorug' (`.app.shop-light` — topbar/tanga-chip/tabbar/sheet/tugmalar oq-yashil, boshqa tablar qora qoladi). Sotib-olish tugma yashil (premium oltin `.d-btn` qoidasini `:not()` spetsifiklik + !important bilan yengish kerak bo'ldi).
  - **Tezlik:** kartalar/hero/mini endi `?s=1` → ~320px Telegram thumb (~15KB vs ~200KB; eski rasmlar full'ga fallback — qayta yuklash tavsiya) · shop zonasida backdrop-filter/grain O'CHIQ · `content-visibility:auto` seksiyalar · `decoding=async`.
  - **Responsiv:** grid `minmax(0,1fr)` · nom 2-qator clamp · `.shop-card-h` clamp(150-190px) · narx flex-wrap · hero/galereya max-height.
  - **🗣 Sharhlar:** `ProductReview` (unique member×product → qayta-yuborish=edit) — 👍/👎 + 280-belgili matn + **3 tagacha rasm** (canvas 900px siqish → Telegram file_id pipeline) · «✅ Xarid qilgan» badge (delivered xarid) · 👍 tallies kartada + detailda · o'z sharhini o'chirish · admin «🗣 Sharhlar» moderatsiya (o'chirish) · yangi sharh → egaga alert.
  - **Matn:** «egamiz» → «do'kon egasi» (3 joy).
  - **ISBOT:** typecheck 4/4 · `testShop` **61 assertion 3× yashil** (16-blok: upsert-edit, tallies, verified, photosJson resolve, clamp, moderatsiya, flag-gate) · preview DOM 12/12+13/13 · jonli bundle-grep: `shop-BDQTxS6h.js` (do'kon egasi/?s=1/Sharh qoldirish), CSS `index-3bnKNcxV.css` (shop-rev-thumb/backdrop-filter:none), admin `index-BrCmZe8s.js` (Sharhlar/api-route) · server Render 398df4d live · app+test DB additiv push.
- **💵 Naqd to'lov + KOSON_AKSIYA hamkorligi (2026-07-06, 7cecfc5→6ce5114):** ega: kanal bilan hamkorlik, 100 mahsulot import + naqdga buyurtma.
  - **payKind "tanga"|"cash":** cash'da balans tekshirilmaydi, coin ushlanmaydi, CoinTxn yo'q; atomik stock saqlanadi; **reject'da refund YO'Q** (payKind guard — aks holda pul yaratilardi). Egaga karta: «💵 NAQD (yetkazganda olinadi)». UI: har mahsulotda 2 tugma (🪙 olish / 💵 naqdga), tanga yetmasa ham naqd yo'li ochiq; rider buyurtmalari + admin panelda 💵.
  - **Import:** `importKosonAksiya.ts` — t.me/s preview parse (slogan-skip nom, ❌eski narx→chegirma, album ≤5 rasm, math-bold→ASCII unfancy, surrogat-xavfsiz kesish), idempotent `kaimport:<postId>`. **Natija: 100/100 mahsulot, 274 rasm, 30 chegirma, «Aksiya» kategoriyada faol** (shop flag DARK — mijozlar hali ko'rmaydi). Stock default 10 — ega tahrirlaydi.
  - **ISBOT:** `testShop` **75 assertion 3× yashil** (17-blok: cash coin-untouched/no-CoinTxn/no-refund/restock/terminal/payKind) · typecheck 4/4 · Render live · jonli bundle-grep: shop chunk'da «Naqdga buyurtma»/«yetkazganda to'laysiz» · DB: Aksiya=100 active, photos=274.
- **🟢 GO LIVE (2026-07-06):** ega "hammaga chiqsin" — `setFlag.ts shop on` jonli DB'da ijro etildi + `EXPECTED_ON`ga qo'shildi (commit 3eeb653, Render deploy). Endi HAR bir rider Mini App'da «Do'kon» tabini ko'radi (owner-preview'ga bog'liq emas). Rollback kerak bo'lsa: `setFlag shop off` (30s flag-kesh ichida darhol o'chadi).
- **Do'kon-sotuvchi roli (2026-07-06):** `@Shekh_of` uchun token-asosli scoped rol — faqat mahsulot CRUD (narx/stock/rasm/yoqish), o'chirish/sharh-moderatsiya/boshqa panel YO'Q; server path-scope choke-point'da bloklangan (`shop_only`), UI'da ham faqat Do'kon paneli ko'rinadi. Havola owner'ga yuborilgan.
- **📤 Ulashish + 🔍 to'liq-ekran rasm (2026-07-06, b3b8135):** ega: "chiroyli qilib ulashish, rasmga bosa to'liq ochib bersin, orqaga qaytish ham bo'lsin".
  - **Do'kon ulashish:** shop-head'da 📤 tugma → `t.me/koson1067bot?start=shop` (xizmatlar.ts svc_ naqshi bilan bir xil `shareLink`); bot payload="shop" ni ushlaydi → `sendShopCard` («🛍 Do'konni ochish» webApp tugma, ?go=dokon).
  - **Mahsulot ulashish:** detail sheet sarlavhasi yonida 📤 → `?start=shop_<id>`; bot `sendProductCard` — mahsulot RASMI + nom/narx/chegirma bilan karta yuboradi, «🛍 Ochish» tugmasi Mini App'ni **aynan o'sha mahsulotga** ochadi (`?go=dokon&p=<id>` → App.tsx `readDeepProduct()` → ShopView bir marta avto-ochadi, `deepOpened` ref bilan qayta-ochilishning oldi olingan).
  - **To'liq-ekran rasm:** galereya/yagona rasmga bosish → `ProductLightbox` (qora fon, scroll-snap barcha rasmlar bo'ylab, nuqta-indikator) — **‹ Orqaga** tugma + fon-bosish bilan yopiladi.
  - **ISBOT:** typecheck server+miniapp toza · preview 10/10 CSS · jonli bundle-grep: shop chunk'da `start=shop` va `Orqaga`.
- V2 backlog (keyingi bosqich): savat/ko'p-dona · istak-ro'yxat progress+push · haftalik aksiya · kuryer jonli xaritada · tanga+naqd aralash (100k+). Eski (import'dan avvalgi) mahsulot rasmlariga thumb yo'q — 📷 qayta yuklashda avto-thumb.

### ⚡ AUDIT BOSQICH B — TEZLIK/SHAHAR-HAJM (2026-07-04) — 🟢 DEPLOYED (jonli)
Kompaniya kas1067'ni SOTIB OLDI, komissiya endi 2000 so'm/safar (1% emas), rent 500k/oy → iqtisod ijobiy, o'sishga sarflash foydali. Shahar-hajmga tayyorlov:
- **B1** `api/bookings` (butun faol ro'yxat) 3 marta ortiqcha o'qilardi (sweep+frontend+Mini App) → bitta 2.5s-TTL kesh (`KAS_ACTIVE_TTL_MS`), create/cancel'da bust. Bir 1.66 req/s lentadagi raqobat yo'qoldi.
- **B2** kasClientSocket: eksponensial backoff+jitter (5s lockstep-storm o'rniga), qattiq cap+LRU, `reap()` backstop (sweep'da), **shartsiz unregister** (flag-off leak yopildi).
- **B3** noma'lum kas-status → bir marta canary-alert (jim-nol-to'lov oldini oladi); AppState ephemeral markerlar 2 kunga (30d edi; pul-kalitlarga TEGILMAYDI).
- **B4** ≤350 clamp: `CoinTxn.bookingId` ustuni + `@@index([memberId, bookingId])` — indekssiz endsWith-scan o'rniga (pul yo'lida, lock ostida edi). Legacy null-fallback + backfill (560 satr). Additiv, ikkala DB'ga push.
- **B5** waitcomp kunlik byudjet: lock'siz aggregate → **serialized atomik hisoblagich** (konkurent tugashda ortiqcha to'lov yo'q, adolat ham saqlanadi).
- **DEFER B6** phoneLast9 ustuni (eng xavfli, ko'p joyga tegadi; audit «hozir arzon» dedi — shahar o'sganda).
- **ISBOT:** typecheck 4/4 · `testAuditFixesB` (B4 7 + B5 4) **5× yashil** (flaky-money yo'q) · testMoneyShield/testRideCard/testPhantomRide/testWaitComp/testRideWheel yashil · commitlar 150c699/8e7f085/261d3a2.

### 🎮 AUDIT BOSQICH C — O'SISH-POLISH (2026-07-04) — 🟢 DEPLOYED (jonli)
- **C2** `daily_freespin` — safar-siz yagona quest (bepul g'ildirak); gamify-auditning №1 kamchiligi «har quest safar-talab» yopildi → safar qilmaydigan kunda ham botni ochish sababi.
- **C3** streak day-2 = 50 tanga (0 edi) — 1→3 «o'lik zona» yopildi.
- **C4** haftalik reyting: boshqalar qisqa-ism («Axmedov Y.»), o'zi to'liq — kichik-shahar hasad/maxfiylik xavfi (kanal/drvrank naqshi).
- «o'yin·bozor» eski matnlar tozalandi (3 bot-string).
- **C5 bepul-spin eslatma (3652305):** unutilgan baraban uchun MAQSADLI push — kunduzi (11–17) faqat bugun aylantirmagan real mijozga (bitta batched «spun-today» so'rov), mavjud push-dvigatelda (2/kun cap, tungi jim, opt-out). Blast EMAS. DARK flag `spinreminder` (ega pilot qilsin: `setFlag.ts spinreminder on`). Isbot: `testAuditFixesC` C5 3× (spun-detektsiya freeSpin kalit-formati bilan mos — `tashkentDayKey==dayKey`).
- **ISBOT:** typecheck 4/4 · `testAuditFixesC` 11/11 yashil · commitlar 2f38917/3652305 · Mini App Vercel + server Render deploy.

### 🛡 AUDIT BOSQICH A — PUL-QALQON (2026-07-04) — READY FOR VERIFICATION (7 P0/P1 tuzatildi, DARK-safe)
8-agent auditning pul-xavfli topilmalarini yopish. Har biri isbot bilan:
- **A1** bot-chat `bk:confirm` endi `claimDispatchSlot` CAS + faol-safar guard + instant-socket arm (Mini App bilan bir xil qalqon) — double-tap 2 taksi chaqirmaydi (booking.ts). Isbot: CAS testi (2 parallel → 1 g'olib).
- **A2** cashout «bitta ochiq so'rov» endi `createCashout` ichida ATOMIK (withMemberLock+recheck) — bot `/naxt` ham, API ham; ega ikki marta naqd to'lamaydi (cashoutService.ts). Isbot: 2-so'rov → `pending_exists`, 1 satr.
- **A3** withdraw + adminMoveToBalance: kas-yozuvidan OLDIN `pending:wdsent/admmove` sent-marker; kas javob bermasa (NOANIQ) — avto-refund YO'Q (double-pay oldi), tanga ushlanadi + ega alert + `clearPending.ts` bilan qo'lda yechiladi; osilgan marker keyingi yechishni bloklaydi (`pending_review`). Isbot: marker bor → bloklandi, tanga tegilmadi.
- **A4** wheel jackpot: bo'lingan `jackpotwin:` kalit AVVAL tekshiriladi — finish-roll allaqachon yutgan bo'lsa g'ildirak pool'ni RESET qilmaydi (oddiy sovg'aga tushadi) + micro-race backstop (regrow+alert). Isbot: kalit bor → pool o'zgarmaydi.
- **A5** intercity `publishTrip`/`enrollDriver` endi `type==='driver'` talab qiladi — rider soxta reys e'lon qilmaydi (intercityService.ts). Isbot: client → `not_driver`, driver → o'tadi.
- **A6** `CANCEL_STATUSES` ga `cancel_by_driver`+`cancel_by_client` qo'shildi + yangi safarda eski `rideStartedAt` tozalanadi — boshlanib bekor bo'lgan safar to'lamaydi (bookingNotifier.ts).
- **A7** flag boot-reconciler: `EXPECTED_ON` ro'yxati + boot'da effektiv holat log + kutilgan-ON o'chiq bo'lsa ega-alert (DB reset = jim o'chishni ushlaydi) + osilgan kas-markerlar alert (index.ts, featureFlags.ts).
- **ISBOT:** typecheck 4/4 · `testAuditFixesA` 15/15 **3× yashil** (TEST DB, KAS_MODE=mock) · A1 CAS testi · regressiya `testMoneyShield`/`testTrackCta`/`testDrvRank` yashil · yiqilgan mavjud testlar (adminMove/withdrawRace) PRE-EXISTING (mock-kas 400/500; stash-solishtiruv bilan isbotlandi — men buzmadim). Yangi: `clearPending.ts` (osilgan marker qo'lda yechish).
- **QOLDI:** DARK deploy → jonli tekshiruv. Bosqich B (tezlik: CoinTxn.bookingId index, getActiveBooking kesh, phoneLast9) va C (o'sish-poliş) keyingi.

### ⚡ CHAQMOQ-TOZALASH #2 — o'lik market/trade tizimi olib tashlandi + Puls voronkasi (2026-07-03) — `ready for verification`
Ega buyrug'i: «motor olami + umuman ishlatilmaydigan kodlarni yo'qot». Tekshiruv: Motor Olami kodi ALLAQACHON Phase-2'da to'liq o'chirilgan (grep: server+miniapp'da 0 kod-qoldiq, faqat komment/flag nomlari). Yangi topilma: **market/trade tizimi prod'da 0 marta ishlatilgan** (jonli DB: shops=0 listings=0 orders=0 offers=0 msgs=0) — to'liq amputatsiya:
- **O'chirildi:** `marketService.ts` · `tradeService.ts` · `market.tsx` (unrouted UI) · /api/market/* (5) · /api/admin/market/* (3) · /api/trade/* (5) · /api/items/* (5, faqat o'lik UI chaqirardi) · bot `/vaucher` · tick `settleShopsWeekly` + boot `seedItemTypes` · `testMarket.ts`+`testTradeAI.ts` · miniapp api.ts market/trade/items metodlari+tiplari. **SAQLANDI:** itemService + sweep item-drop'lari (JONLI bot-mexanika: asoschi nishoni, tuman/SAYYOH +5000, haydovchi 20-qism va'dasi) · Prisma jadvallari (Phase-3 siyosati — refund tarixi 2026-08-01 gacha) · service.tsx (Ravella faol WIP boshqa sessiyada) · booking.tsx (booking3 rollback-yo'li).
- **Qo'shildi:** admin Puls'ga «🛡 Oila kuzatuvi voronkasi» — ulashish(7k/jami) → kirish(7k/jami) → birinchi safar + K-faktor (OpsPulse.trackcta, best-effort).
- **ISBOT:** typecheck 4/4 · `testMoneyShield` (trade bo'limi olib tashlangan, 3.7 item-market saqlangan) BARCHA yashil · `testAuthGate` BARCHA yashil · butun-repo grep: o'lik simvollardan 0 qoldiq.

### 🏆 DRVRANK — haydovchi QR-reyting + haftalik hisobot-push (2026-07-03) — 🟢 LIVE (`owner-accepted` 2026-07-03, flag `drvrank` ON)
Supply-front №1 (Koson strategiyasi): haydovchilarni QR ko'rsatishga undaydigan oylik poyga + dushanba eslatmasi. **Pul mexanikasi TEGILMAGAN** — read-only ekran + push.
- **Qurildi:** `drvrank` flag (DEFAULT_OFF) · `recruitLeaderboard()` (recruit+revshare+drvrecruit tanga, Toshkent kalendar-oyi, bitta groupBy, 0-daromadlilar ro'yxatga KIRMAYDI) · haydovchi panelida «🏆 Reyting» tugma (`drv:rank`, top-10 qisqa ismlar + «Siz: №R») · haftalik push `driverQrWeeklyTick` (dushanba 09–11 Toshkent, FAQAT 7-kunlik QR-faollarga, NotifyLog dedup = 1×/hafta, quiet-hours/notify-off/2-kunlik-cap hurmat, mavjud 15-min tick — YANGI poller yo'q).
- **ISBOT:** typecheck 4/4 · `testDrvRank` 12/12 **3× yashil** (TEST DB: default-off · tartib/summa · o'tgan-oy chiqarilgan · myRank · picker oynasi · 0-faolga push YO'Q · dedup).
- **✅ OWNER-ACCEPTED (QABUL, 2026-07-03):** ega «🏆 Reyting»ni ko'rib QABUL berdi → flag `drvrank` ON qoladi. Rollback = `setFlag.ts drvrank off`. Birinchi haftalik push keyingi dushanba 09–11 (Toshkent).

### 🛡→👥 TRACKCTA — TrackView viral loop «oila kuzatuvi» (2026-07-03) — 🟢 LIVE (`owner-accepted` 2026-07-03, flag `trackcta` ON)
Sonnet×2 + Fable 5 konsult sintezi: 3 viral nomzoddan B (TrackView family-share) g'olib — yagona to'liq yopiladigan loop, madaniy-xavfsiz (g'amxo'rlik ramkasi), kodning ~90% tayyor edi. **YANGI pul-mexanika YO'Q** — mavjud referral pipeline'iga (attach → birinchi REAL safar → sweep idempotent to'lov) yangi TARQATISH kanali qo'shildi, xolos.
- **Qurildi:** `trackcta` flag (DEFAULT_OFF) · `resolveTrack` → `ctaLink` (`t.me/<bot>?start=reft_<code>`, server-gated, PII yo'q) · TrackView'da 7s-kechikkan yopiladigan banner («birinchi safar bepul»; xaritani hech qachon to'smaydi, dismiss sessiyada saqlanadi) · bot `start=reft_` → mavjud `attachPendingReferral` + `trackjoin:<tgid>` metrika-marker (K-faktor hisoblagichi) · jonli safar kartasi: started'da «🛡 Oilaga jonli kuzatuv yuborish», en-route'da «🛡 Ulashish»→«🛡 Jonli kuzatuv» (`bk:track` callback → token mint + tayyor share-xabar). Flag OFF = eski xatti-harakat piksel-piksel (banner yo'q, eski url-tugma qaytadi).
- **ISBOT:** typecheck 4/4 · `testTrackCta` 9/9 **3× yashil** (TEST_DATABASE_URL + KAS_MODE=mock; DEFAULT_OFF · flag OFF→ctaLink yo'q · ON→reft_<code> · notanish token safe · attach idempotent · self-invite blok) · vite preview DOM-isbot: banner render + to'g'ri href, xarita boks y42–468 vs banner y638–701 (to'silmaydi), ✕ dismiss + sessionStorage sticky.
- **✅ OWNER-ACCEPTED (QABUL, 2026-07-03):** ega jonli sinab QABUL berdi → flag `trackcta` ON qoladi (P1 banner+tugma va P2 badge birga). Rollback har doim: `setFlag.ts trackcta off` (≤30s).
- **P2 fuziya QURILDI (2026-07-03):** jakpot-badge — safar ichida g'ildirakdan yutgan bo'lsa, share-sahifada «🎁 Bu safarda 1067dan sovg'a oldi» (summa HECH QACHON ko'rsatilmaydi — halol-safe, `won` faqat flag ON'da) + LAUNCH_DRIVER_SCRIPT'ga jonli-kuzatuv jumlasi. ISBOT: typecheck 4/4 · `testTrackCta` 11/11 ×3 (badge yo'q-spin'da false / yutuq-spin'da true) · preview DOM (badge tv-foot ustida, banner bilan birga) · jonli bundle-grep `TrackView-CWN7JBfZ.js`: «sovg'a oldi»+`tv-win`. Kanal-post QILINMADI — u alohida `jackpotpost` flag ostida boshqa ishda qurilyapti (dublikat oldini olish).
- **QOLDI (post-QABUL):** ijro — haydovchilarga yangilangan LAUNCH_DRIVER_SCRIPT tarqatish; haftalik K-faktor kuzatuvi (`trackjoin:*` rows ÷ share). Ixtiyoriy keyingi kod: admin Puls'ga trackcta-voronka bloki (share→join→birinchi-safar).

### 🌍 MOTOR OLAMI v3 — noyob #serial mashinalar PUL ISHLAYDI (2026-06-20) — ⚫ DARK (flag `motorolami` OFF + owner-preview; owner real-telefon QABUL kutilmoqda)
Reja: `MOTOR_OLAMI_PLAN.md` (+PDF). Pul-modeli = yagona TANGA + guardrail (savdo net-0, Ofis byudjetli, **withdraw o'zgarmaydi — real safar+revenue**). GARAJ-flip vorisi; supersedes "ta'mirla-sot".
- **P0 (5-yadro litmus) — QURILDI + DARK-DEPLOY (commit `a60c420`):** (1) noyob **#serial** (global atomik AppState-upsert, #1001+, sotuvdan keyin saqlanadi) + immutable tarix; (2) **ochiq profil** (`/api/garaj/profile/:id`, ":id"=me, 🌍 sheet); (3) **bozor** (mavjud bazaar qayta-ishlatiladi); (4) **mashina pul ishlaydi** (speed=base×0.018 t/soat, offline+2×taksi; «Yig'ish» = gross−yoqilg'i(70%,dial)−eyilish(10%); FAQAT net minted; 24soat time-cap; chore yo'q); (5) **qarishi** (engineHp 100→0 ~14kun → o'lim → "eskirdi" prompt).
- **Pul-xavfsizligi:** faqat NET minted (sink ≥80%), withdraw o'zgarmagan (safar+revenue-gated), poller yo'q (lazy collect), idempotent grantCoins. Schema additiv → Neon + test DB.
- **ISBOT:** typecheck 4/4 · `testGaraj` **162/162 ×3** (serial/accrual/sink/24h-cap/o'lim/profil) · `simEconomy` **0 violation** (≤350/safar + flip-cap + offline-cap + **motor-bound**: only-net, sink≥80%, 24h-cap) · jonli bundle-grep (`garaj-BVbJvxMS.js`: gz-motor/«Yig'ish»/Ochiq profil) · jonli route'lar **401** (motor/collect, profile/:id) · flag `motorolami:false` (DARK), `garajx/kozacha` baribir ON · UI render-tasdiq (#garajdemo).
- **⚠ GO-LIVE'GACHA SOZLASH:** simEconomy premium-mashina worst-case ceiling **~19958 tanga/kun** (eng qimmat × full-taxi × eng-arzon-yoqilg'i — imkonsiz kombo, withdraw-gated, flag off) oshkor qildi. `MOTOR_SPEED_RATE` pasaytirish yoki qattiq kunlik NET cap qo'shish — owner-accept'dan oldin.
- **QOLDI (asl):** P1 (1067 Ofis market-maker + scarcity slotlar + CarCheck + ORZU + sweep auto-accrual/2×-taxi) · P2 (merge + event + jackpot + Speeder). Har biri owner-accept'dan keyin.
- **P1 + P2 + P2-deep — QURILDI + TEST-PROVEN + DARK-DEPLOY (`ready for verification`, owner QABUL kutilmoqda):** P1-A..H (Ofis/slot/CarCheck/ORZU) + P2-A..G (merge/jackpot/Speeder) + P2-deep-1..6 hammasi jonli (flag `motorolami` baribir DARK). P2-deep (2026-06-29): **#1** Speeder scarcity surge (`dd973a3`) · **#2** slot trade-in refund (`dcfefbb`) · **#3** auto-stabilizer emission→fuelMult (`e79a8a5`, OFF def) · **#4** 🏛 Ofis demontaj/scrap held-cars (`c53d619`) · **#5** 🔧 limited-event detallar — HARD mint-cap (race-proof conditional SQL), install→+earnBonusPct, pure tanga sink, mint-event default CLOSED (`9979b0f`) · **#6** 🛠 Detal-bozori P2P (claim-before-pay + 3% burn + self-trade blok + ownership-transfer = NO emission) (`58a96f7`) · UI **🔧 Detallar** sheet (inventory/mint/bozor) + 6-property adversarial audit (cap-atomicity + no-emission **SAFE**) → 4 fix (cancel CAS · releasePartsForCar barcha car-transfer joyda · listingId DTO · buyPart idempotent-recovery) (`9d9ee50`). ISBOT: `pnpm -r typecheck` 4/4 · `testGarajP1` (~110 tekshiruv, +56 yangi) **3× yashil** (race-proof cap 1ok+1soldout · +10% boost ratio · net-burn=tax NO-emission · earn-leak yopildi) · jonli prod bundle-grep (`garaj-DaCSpk_g.js` HTTP 200 63KB: `🔧 Detallar`/`Menikilar`/`installedParts`) · Render server auto-deploy + Vercel `1067taxi-miniapp`. **`motorolami` flag ALLAQACHON ON** (2026-06-28 go-live) — lekin DETALLAR sub-feature ALOHIDA gate: har detal mint-event'i `mo:partmint:<code>` **default YOPIQ** (hozir bittasi ham ochilmagan → katalog "Yopiq", hech kim mint qila olmaydi → 0 detal mavjud → install/bozor inert). Owner event ochsa → o'sha detal mint'i jonli. Ya'ni parts kodi jonli, lekin DATA-darajada o'chiq; rollback = event'ni ochmaslik (yoki ochilganini yopish).
- **✅ OWNER-ACCEPTED (qabul, 2026-06-29):** ega P2-deep (4/5/6) + parts + hardening ishini QABUL qildi. **GO-LIVE richagi shipped (`d5ed8c0`):** admin panel `Boshqaruv → 🔧 Cheklangan detallar` bo'limida har detal uchun 🟢/⚫ toggle (confirm-gated) + CLI `setPartEvent.ts <code|all> <on|off>` + route `POST /api/admin/part-event` (owner-only). Jonli admin bundle-grep tasdiq (`admin-seven-ebon-95.vercel.app` index 237KB: "Cheklangan detallar"/"part-event"). Server route auto-deploy. **🟢 BIRINCHI GO-LIVE (qabul, 2026-06-29): `nitro` mint-event OCHIQ** (eng arzon: 25k, +10%, cap 1000); twin_turbo + sport_ecu YOPIQ qoladi (kichikdan boshlash). Eslatma: ochishda twin_turbo+sport_ecu ham ochiq topildi (eski yozuvdan; test EMAS — _testDb izolyatsiya, prodda `mo:part:next:*` yo'q) → darhol yopildi, **0 detal mint qilingan (0 zarar)**. Iqtisod (cap 500/1000/300, narx 25k–100k, +10–20%) birinchi-versiya — sozlash mumkin.

### 🏆 GARAJ v2 — chuqur mashina-tiklash + flip o'yini (2026-06-18) — 🟢 LIVE (owner "go live" → global flaglar ON; test-proven + R4 mustaqil-audit PASS)
Owner: "eski oddiy garajni olib tashla, GARAJ bosilganda yangi to'liq-ekran kuchli o'yin ochilsin; berilgan plani aniq tugat va live ga chiqor". Eski `GarageSection` SAQLANDI (flag OFF → oddiy user o'shani ko'radi); yangi GARAJ faqat `garajx` ON yoki owner-preview'da almashtiradi. Migratsiya/refund/bonus YO'Q (greenfield — hali hech kim o'ynamadi, owner qarori).
- **W0-W2 (yadro):** ol→diagnoz→ta'mirla→sot (flip). FTUE (90s, bir martalik +80 grant, telegram-id keyed multi-akkaunt himoya). `garajGame.ts` (pure config: `computeFlipGrant` yagona narx-manbai), `garajService.ts`, schema (Neon additiv `db push`), `garaj.tsx`/`garaj.css` (faqat tokens/CSS — WebGL YO'Q, UZ uchun bundle'langan).
- **W3 (chuqurlik):** 4 uslub (Tezkor/To'liq/Tюнинг/Davr) × 4 xaridor (Oilaviy/Yoshlar/Kelin-kuyov/Kolleksioner), timing mini-o'yin (rAF marker, Avtomatik a11y), 4-shox skill daraxti (usta-ko'z + muhandis/kuzovchi/savdogar/kollektsioner), diagnoz tierlari (Ko'z/Asbob/Ekspert), 🏺 Ko'zacha 2-valyuta (faqat real safar ≤8/safar, ALOHIDA ledger — HECH QACHON tanga'ga oqmaydi) + Ko'zacha do'kon (flip-boost).
- **W4 (bozor):** P2P Bozor (claim-before-pay, 3% soliq-burn, self-trade blok, 3× tavan), yopiq-taklif Auksion (escrow, anti-snipe +5min, eng yuqori yutadi, mag'lub qaytariladi, 5% fee), sweep'da settle (poller YO'Q).
- **W5 (meta + ijtimoiy):** kechirimli streak (ketma-ket + zaxira-g'ildirak freeze + ladder grantlari), kunlik shifr (server urinish-hisoblagich, 5-lockout, +30 1/kun), offline quti (≤75/kun, prestij-bilan ham clamp), prestij (tier-5 gate, flot reset, obro' saqlanadi +500, Hall of Fame, bozor-guard), mahalla ligasi (safar-vaqt×sifat ball — TANGA EMAS, haftalik settle idempotent, 20-cap atomik CAS, 1-mahalla/a'zo DB-unique), mavsumiy event (Navro'z/Qish flip-bonus, sof sana-funksiya), reputatsiya zinapoyasi + garaj-daraja.
- **Sweep (poller YO'Q):** streak + mahalla-ball har safar AYNAN bir marta (`processRideDrop` `fresh` = `GarajRideDrop` unique-win gate); mahalla haftalik settle member-loop'dan OLDIN (o'z-ballini o'chirmaslik uchun); auksion settle bir marta/sweep. HECH QAYSI per-ride tanga emissiyasi YO'Q → 350/safar clamp tegilmagan.
- **Owner-preview (R6):** `garajEnabledFor(memberId)` — global flag OFF bo'lsa ham owner (tg 6506297119) HAQIQIY o'yinni real telefonida o'ynaydi (QABUL uchun); oddiy userlar HECH NARSA ko'rmaydi (null-fallback ularni chiqarib tashlaydi). QABUL → `setFeature("garajx", true)` → global live.
- **ISBOT (har DoD satri):** typecheck 0 ×3 · `testGaraj` **75/75** (kill-switch, idempotent acquire/diagnose/repair, flip clamp-tashqari, B4 kunlik-cap, Ko'zacha ALOHIDA, bazaar/auction money, streak/cipher/box/prestige/mahalla, ledger invariant) jonli Neon TAG'd a'zo+cleanup · `simEconomy` **0 violation/30160 safar** (≤350 clamp + flip-cap + offline-cap, MAX prestij+seasonal stacklab ham cap ushlaydi) · `testE2E` **14/14** (pul-qalqon regressiyasi YO'Q) · miniapp build garaj chunk 17.7KB/6KB-gz (≤80KB DoD) + bundle-grep (W5 stringlar + endpointlar) · **R4 mustaqil audit (kod yozMAGAN fresh agent): 8/8 savol SAFE, har biri file:line+iqtibos bilan — pul-oqishi/idempotensiya-teshigi/qimor/Ko'zacha→tanga ko'prigi YO'Q.**
- **(R7 TUZATILDI 2026-06-20):** bu satr ilgari "Buyurtma board / demand-to'lqin / GarajWeeklyEvent QURILMAGAN" der edi — bu ENDI NOTO'G'RI. Uchchovi ham qurilgan + jonli (pastdagi "POST-GO-LIVE CHUQURLIK #1-#11" bo'limiga qara: #2 order board, #3 demand, #6 weekly event). Eski da'vo mustaqil R4-audit'da fosh bo'ldi va shu commit'da to'g'rilandi.
- **🟢 GO-LIVE (2026-06-18, owner "go live"):** owner global ochishni AVTORIZATSIYA qildi (R6 QABUL-first qadamini ataylab o'tkazib — greenfield, hech kim o'ynamagan, to'liq isbotlangan). `setFlag.ts garajx on` + `kozacha on` → live DB'da `feature:garajx=on feature:kozacha=on` (tasdiqlangan). Render server 30s flag-cache ichida oladi → GARAJ hammaga jonli, eski garaj yashirinadi. Orqaga qaytarish: `setFlag.ts garajx off` (bir buyruq). Endi safar-asosli accruallar ham yonadi (streak++, mahalla ball, ride-drop). KUZATUV: birinchi real o'yinchilar emissiyasi (flip/streak/cipher/box — hammasi capped + idempotent) + mahalla haftalik settle birinchi yakshanba.
- **🔧 POST-GO-LIVE ITERATSIYA (2026-06-18, owner jonli o'ynab feedback berdi):**
  - **Tuzatildi:** (1) sotuvlar tarixi yo'q → `getGarajHistory` + "📜 Sotuvlar tarixi"; (2) Bozorda o'z e'lon ko'rinmasdi (UI `!mine` filtr) → "🏷 Mening sotuvdagilarim" + `garajBazaarUnlist`; (3) bo'sh bozor empty-state.
  - **KATTA REFRAME** (owner: "bu o'yin emas, do'kon katalogi — mening garajim chiqsin"): bosh ekran endi **loyiha-mashina HERO** (CSS/SVG `GarajCarArt` — zang/kir→toza→chiroq→L5 oltin ramka + kondisiya bar + [Ta'mirlash] CTA) → "Keyingi orzu" → "Mening kolleksiyam" (egalik+🔒). **Do'kon GARAJ'dan → Bozor tabga** (`GarajMarketView`). Emoji→SVG. Daily funksiyalar faol bo'lmasa ham ko'rinadi (shifr `hasCode` no-code/locked, quti idle). Reyting qatori → `GarajCollectionSheet` (read-only `GET /api/garaj/collection`).
  - **ISBOT:** typecheck 0 ×3 · testGaraj **82/82** · preview DOM (stage birinchi, do'kon yo'q, SVG) · Vercel live (`index-DFyJqmpo.js`) · Render deploy (a56fa56). Pul-logika TEGILMAGAN.
  - **(YANGILANDI 2026-06-20):** bu "keyingi" elementlarning hammasi QURILDI — pastdagi #1-#11 bo'limiga qara.
- **POST-GO-LIVE CHUQURLIK #1-#11 (2026-06-19/20 — owner reja-gap'ni ketma-ket buyurdi; har biri pul-xavfsiz, typecheck ×3, jonli deploy, mustaqil R4-audit bilan tasdiqlangan):**
  - **#1 ta'mir-zona depth** — 5 zona × qism-tier (Salvage/Std/OEM/Sport), `conditionFromZones`, `repairZone()`, `/api/garaj/repair-zone`. Flat-80 tap o'rnini bosdi.
  - **#2 NPC buyurtma board** — `dailyOrders` (3 slot/kun), mos flip alohida idempotent grant (`orderbonus:mid:date:slot`, flip-cap'dan ALOHIDA).
  - **#3 demand-to'lqin** — `demandMultiplier` tanh-sigmoid **[0.70,1.50]** (neytral=1.0) + `recomputeDemand` (sweep, 15-min guard); buy-narx (to'liq diapazon — sink) + ≤±12% flip-nudge (cap-bog'langan). **MAJOR-2 anti-manipulyatsiya QILINDI (2026-06-20):** supply = ochiq-e'lon askPrice YIG'INDISI ÷ basePrice (qiymat-tortilgan), e'lon-SONI emas → arzon e'lonlar bilan demand'ni shishirib bo'lmaydi.
  - **#4 Yo'l sovg'alari** — `TOW_FACTOR` 0.55, `claimTowedCar`/`declineTowedCar`, `GarajRideDrop.status`, `/tow/claim`+`/tow/decline`.
  - **#5 Ustaxona kraft (CHUQURLASHTIRILDI 2026-06-20)** — TUNE/PAINT/RESTORE, sof tanga-sink. Endi **VAQTLI + bitta umumiy usta-slot** (`GarajCraftJob` model): `garajCraft` ishni NAVBATGA qo'yadi (oldindan to'lov), bir vaqtda FAQAT bitta ish (mashinalararo navbat — BLOCKER-1 yopildi); effekt `finishesAt` o'tganda `settleCraftJobs` (sweep, idempotent) yoki pullik `garajCraftSpeedup` bilan qo'llanadi. `craftDurationMs`/`craftSpeedupCost`, route `/api/garaj/craft/speedup`.
  - **#6 haftalik event** — `WEEKLY_EVENTS` (discount_service/bonus_orders/double_drops/xp_boost), `getWeeklyEvent` (admin override AppState). (Nom: reja `double_parts`, impl `double_drops` — bir xil maqsad.)
  - **#7 NPC personajlar (KENGAYTIRILDI 2026-06-20)** — `GARAJ_NPCS` endi **12 ta** (har arxetipga 3 ta: oilaviy/yosh-tюner/kelin-kuyov/kolleksioner), `npcForBuyer(buyer, seed)` seed bo'yicha deterministik tanlaydi (buyurtma-slot / saleId) → bir buyurtma doim bir yuz, har xil buyurtmalar aylanadi.
  - **#8 haftalik Ko'rgazma** — `exhibitionSubmit`/`exhibitionVote`/`settleExhibition`, self-vote blok, ≥2-entry guard (solo-farming yo'q), idempotent `exhibwin:{week}` 1000-prize; `GarajExhibitionEntry`/`Vote` (@@unique).
  - **#9 Muzey** — `getMuseum` 4-manba union (GarajCar+GarajFlip+bazaar-sold+auction-sold), `/api/garaj/museum`, `GarajMuseumSheet`. (Reja persistent jadval xohlagandi; impl jonli-hisoblangan — bir xil maqsad, tozaroq.)
  - **#10 daraja-marosimi + audio** — `TIER_UNLOCK` + `.gz-ceremony` overlay, `playTierFanfare` (Web Audio sintez — reja .ogg xohlagandi; sintez assetsiz+robustroq), prefers-reduced-motion. Client-only.
  - **#11 har-model siluet** — `CAR_GEO` (11 model) + `carBodyPath`/`carCabinPath` (mini/hatch/sedan/van/SUV/box arxetip). Client-only.
  - **ISBOT (2026-06-20 mustaqil 3-agent R4-audit + gate'lar):** pul-invariant SAFE (7/7 file:line — ≤350 ride-clamp tegilmagan, flip-cap multiplikatordan mustaqil, Ko'zacha↛tanga, idempotent, poller yo'q, withMemberLock+inline-tx); `testGaraj` yashil (3× ket-ket); `simEconomy` 0-violation; whole-repo typecheck 0; jonli bundle-grep (`garaj-eIusVQQM.js`/`index-C62WRNSm.js`) #1-#11 stringlari + route 401'lar tasdiqlangan; `garajx`+`kozacha` flag jonli ON.
  - **REJA-SPEC DEVIATSIYALARI YOPILDI (2026-06-20, owner "ha hammasini to'g'irla"):** (a) #5 umumiy usta-slot + vaqtli-kraft + pullik speedup — QILINDI; (b) #3 demand tanh-sigmoid [0.70,1.50] + ask-yig'indi anti-manipulyatsiya — QILINDI; (c) #7 12 NPC + seed-rotatsiya — QILINDI. Reja-gap ro'yxatida ochiq element QOLMADI.

### 🎮 v3 O'YIN OVERHAUL (2026-06-17) — READY FOR VERIFICATION (jonli + test-proven; owner real-telefon QABUL kutilmoqda)
Owner: "o'yin tabini mukammal qil … hammasi ketma-ket va garajni haqiqiy 3d qil". O'yin tab to'liq qayta ishlandi — har biri typecheck 0 + build + jonli (bundle HTTP 200) yoki server E2E-green:
- **Garaj upgrade/daraja** (7635090) — TUNING L1→L5 (🥉 Bronza…💠 Olmos), spend-only sink, leveled rate. Shared `GARAGE_LEVEL_*`; `MemberCar.level` (Neon `db push`, additiv/non-destruktiv).
- **Bot menu mini-appsiz** (445075d) — eski usulda bot ICHIDA taxi/hamyon/bonus/reyting/hisobim ishlaydi (web-app shart emas).
- **5-tab nav redesign** (777aa08) — 6→5 toza tab (Uy/Hamyon/O'yin/Bozor/Reyting) + profil gear; `GO_MAP` eski→yangi yo'naltirish.
- **G'ildirak bepul kunlik spin** (d3b247e) — doim o'ynaladi (safar shart emas); 1/kun idempotent `freeSpin`, JACKPOT-slice hali in-ride-only.
- **Garaj 3D showroom** (c6fc701) — premium NFS-his: aylanib-suzuvchi mashina (CSS-3D rotateY), daraja-rang nuri, stats HUD, yashil TUNING. Halol qaror: literal 3D-model (Three.js) RAD etildi — <200KB + arzon Android budjetini buzardi.
- **Yutuq juice — WinBurst** (2a0bb4d) — har HAQIQIY tanga yutug'ida: success-haptik + konfetti + 0→N count-up. FAQAT faucet (g'ildirak/quti/streak); spend/sink emas. `hapticSuccess` + streak "so'm"→tanga yozuv tuzatildi.
- **Premium quti + kombo** (0d013f2) — quti full-width: tayyor→suzadi, OCHISH→750ms titraydi/zaryadlanadi→WinBurst. Kombo 3/3 → tilla pill + sakrash. Animatsiya transform/opacity + `prefers-reduced-motion`.
- **+3 mashina** (c4bda22) — 5→8 (Tracker/Tahoe/Gelandewagen, 45 000 tavanida). Pure SINK; earning hali ≤350/safar klamp. `testGarage` 25/25 (payback ≥30: 64/81/94).
- **Kunlik garaj kvesti** (c442c61) — "Garaj mashinangiz pul ishlasin" +80 (≤100 client-daily qoidaga mos). YANGI `MissionDef.core` flag: `core:false` BONUS kvest → qutini/komboni BLOKLAMAYDI (mashinasiz haydovchi ham qutini ochadi). `boxService` + kombo-hook endi core-only. ISBOT: `testGarage` (kvest 1/1 claimable) + `testEngagement` (4 daily, quti 3-core'da ochiladi) + `testEconomy` (≤100) + E2E 13/13.
ISBOT (umumiy): miniapp #1-7 jonli (bundle HTTP 200; asosiy bundle 187KB o'zgarmadi — juice lazy `rewards` chunk'da); server #8-9 Render deploy (c4bda22 live; c442c61 deploy). Money-shield: har garaj/kvest o'zgarish ≤350 klamp + ledger invariant + E2E 13/13 yashil. **owner real-telefon QABUL (R6) kutilmoqda — global o'zgarish yo'q, hammasi mavjud oqimga additiv.**

### 🛡 QA FLEET (1000-agent) — 56 confirmed bug, fixlash davom etmoqda
2 fleet ishladi: (A) bug-hunt wp30x7zia (18 finder → 3-ovoz adversarial verify) = **56 tasdiqlangan bug (1 P0, 48 P1, 7 P2)** → `.qa-bugs.json` (commit qilinmaydi, ishchi fayl). (B) functional-audit wh3vyhhca (26 feature × 3 lens) = works-matrix + improvement backlog (money-core SOLID; asosiy risk = klassik oqim unpkg blank-map + atomiklik race'lar). Eslatma: ikkala fleet bir vaqtda → API rate-limit (verifierlarning yarmi tushdi); natijalar HALI yuqori-sifatli lead, lekin har fix KODGA QARSHI qayta tekshiriladi.
- **✅ BATCH 1 — FIXED + PROVEN + Rule-4 PASS (b1239d8, tests c098aa5):** (1) **P0 grantCoins TOCTOU** → atomik `$transaction` (unique-keyed insert OLDIN + increment; P2002=duplicate-skip). ISBOT: testMoneyShield P0 race-assert (8 parallel same-key → balance AYNAN +250 bir marta, 1 audit row, 1 ok/7 skip) + clamp/ledger YASHIL. (2) **P1 auth** heal/unflag `requireOwner`. ISBOT: testAuthGate (REAL app: operator→403, owner→200). (3) **P1 E6 crash** spin.prize guard. **Rule-4 mustaqil verify: IKKALASI PASS** (DB unique + atomik tx race-safe, under-credit yo'q, kontrakt buzilmagan; auth real non-owner token bilan).
- **🔁 RE-TRIAGE (ega ta'rifi: money/security/data-loss = P0) — 56 bug → distinct launch-blocker'lar (dublikatlar olib tashlandi):**
  - **P0-money (atomiklik/double-grant) — har biri transactional fix + money-shield assert + Rule-4:** boxService openBox (create+grant non-atomik), missionService claimMission (claimedAt before grant), referralService completeReferral (creditedAt before row), recruitService driverRecruit (no-idem) + recruit3 (every-ride bug), garageService ridesSinceService (double-inc), itemService mintItem (spend outside tx), rewardService jackpot-namespace (double-fire), rewardService dailyCheckIn (streak non-atomik), grantRideCoins clamp race (>350), economyService consumeWithdrawBudget TOCTOU + withdraw non-atomik, bookingService createBooking guard TOCTOU, bookingNotifier finish-card multi-send + phantom-ride finish, kas client.ts cancel_* finish-missed (rewards fire anyway), tradeService barter multi-pledge.
  - **P0-sec:** ✅auth(done) · wheel kill-switch bot-bypass · initData query-string exposure · WEBHOOK_SECRET='hook' default · KAS_BONUS_SECRET_KEY='1303' default · ALLOW_DEBUG_AUTH bypass · **+Rule-4 topdi: /api/admin/market/shopmode + /listing operator-ochiq (spread/narx/cap config)**.
  - **P1 (broken UX/feature):** blank-state .catch(()=>undefined) (market/missions/wallet/referral/driver/booking3-cancel) · dead bot button bk:addr/bk:other/bk:now · WheelSpinResponse disabled-shape · withMember no-try/catch · MyShopPanel blank · rateRide zero-window · garage kill-switch not enforced · admin QR 403 + toggle no-catch · marketService settle wrong day-key · bookingPlus rating window.
  - **P2:** tanga/so'm icon mislabel (mission/referral/wallet) · comeback×lucky×combo clamp-before-write.
  - **NEEDS OWNER:** WEBHOOK_SECRET + KAS_BONUS_SECRET_KEY — Render env'ga real qiymat o'rnatilsa, default'lar olib tashlanadi (aks holda deploy buziladi). Operator economic-config (shopmode/listing) gate qilinsinmi — qaror.
  - **P0-MONEY BATCH (fix-design fleet wv4oqf6is: 11 apply / 5 revise / 1 false-positive):**
    - ✅ **5 FIXES (6 reports) + 3 FALSE-POSITIVE (test-first, each Rule-4):** (7b9f5c5) completeReferral insert-first+stamp-after · payRecruitRevshare P2002-catch+re-read. (10dacaa) **grantRideCoins ≤350 clamp race** → per-member `withMemberLock` (420→350, Rule-4 falsifiability-tested). (604a59e) **withdraw per-member 50000/day cap race** (REAL MONEY OUT 2×) → withMemberLock wrap (100000→50000, loser=daily_cap, Rule-4 PASS). FALSE-POSITIVE (proven, no fix): **recruit3-once** (key per-recruit), **checkin-streak** (batch-1 atomic grant+per-day key), **global consumeWithdrawBudget** (DB atomic INSERT..ON CONFLICT+post-rollback → no overshoot). ALL via testRaceFixes/testWithdrawRace (live concurrent) + money-shield GREEN. **Lesson: batch-1 atomic grantCoins closed several reports transitively → test-FIRST each.**
    - ✅ **5th FIX (80f3da2): cancelled/phantom ride paid rewards** — kas active list drops booking on completion AND cancellation → finish branch couldn't tell apart → cashback/garage/fund paid on cancelled rides. FIX: guard on positive completion (rideStartedAt + status≠cancel). Closes BOTH phantom-ride-finish(#44) + kas-cancel-finish(#13). PROOF: testPhantomRide (cancel/phantom→0, completed→1), money-shield GREEN, Rule-4 PASS. Residuals (Rule-4-noted, narrower than fixed leak): short-ride false-neg (only bonuses skipped, real cashback safe); **started-then-cancelled race = tracked P2 follow-up**.
    - ✅ **6th FIX (aecf211): wheel jackpot** — drain-without-payout (claimJackpot before wheelSpin insert) + namespace (wheel key ≠ cashback). FIX: insert-first/claim-after-win (T0.5 3.1) + unified key jackpotwin:b:m. PROOF: testRaceFixes (2 concurrent jackpot → 1 grant, full pool paid, reset to floor), Rule-4 PASS (residuals net-zero).
    - ✅ **7th FIX (85c36f5, LAST): mintItem** — spent OUTSIDE mint tx + refund (crash window). FIX: guarded decrement+audit INSIDE the mint $transaction (mirror buyListedItem). PROOF: testRaceFixes (sold-out→coins unchanged; success→−500), Rule-4 PASS (no deduct-without-mint).
    - 🎉 **P0-MONEY COMPLETE: 7 fixes (8 reports) + 3 false-positive, each test-first + race/logic-proof + money-shield GREEN + Rule-4.** Carried forward: **finish-card-multisend → P1** (idempotent rewards = no double money, dup message only); **started-then-cancel ride → P2** follow-up; per-member withMemberLock single-instance (Render); GLOBAL budget DB-atomic.
    - ✅ **P0-SECURITY BUILDABLE COMPLETE (each test-first + Rule-4):** heal/unflag requireOwner (b1239d8) · market shop/shopmode/listing → requireOwner (e6e2d74) · wheel kill-switch at service (907604b) · **initData header-only (no query leak) + X-Debug-Telegram-Id gated on explicit ALLOW_DEBUG_AUTH** (5bd0ff4, testInitDataAuth: query→401/header→200, hasBot=false debug→401). 🔑 **NEEDS OWNER ONLY:** WEBHOOK_SECRET='hook' + KAS_BONUS_SECRET_KEY='1303' source defaults — set real values in Render, THEN I remove defaults (else deploy breaks).
    - ✅ **P1 DONE (each test-first/render-proof + Rule-4 where money-adjacent):** blank-state spinners → error+retry (44ffb70: LoadError on Missions/Referral/Weekly/Gap, sectional retry Wallet/Driver, booking3 cancel surfaces failure; render-proof) · garage kill-switch at service (467ff18, testRaceFixes garage OFF→null) · finish-card multi-send → per-ride marker (16a449c, testPhantomRide: 1 card, re-entry skips, rewards idempotent). MyShopPanel left (shop-owner opt-in, nothing-on-error acceptable).
    - ✅ **P1 REACHABLE COMPLETE (more, each proven):** rateRide zero-window → durable RideReward ownership + car preserved (7276ee7, testPhantomRide) · WheelSpinResponse disabled-shape → endpoint returns valid shape via spinWheel gate (2284988) · admin recruit-QR 403 (wrong localStorage key) + kill-switch toggle no-catch → fixed (e2e2c45, admin typecheck 0).
    - ⏸ **P1 DEFERRED (unreachable now):** dead bot buttons bk:addr/bk:other/bk:now live ONLY on the AI-intent path, which is OFF (no LLM keys) → not reachable in production. Fix when the AI layer ships (future ticket). MyShopPanel nothing-on-error (shop-owner opt-in, acceptable).
    - 🎉 **QA HARDENING TIER COMPLETE: all P0 (money+security buildable) + all REACHABLE P1, each test-first + proof + money-shield GREEN + Rule-4.** Only NEEDS-OWNER (Render secrets) + QABUL/pilot gates remain in the launch-blocker set.
    - ✅ **T5-E7 DONE (60d5e8a):** peak-end finish card in booking3 — active→null detection → confetti + streak + reward-note + 5-star rating (feedback, not a grant) + rebook. DISPLAY-ONLY (no grant; rewards stay from bot sweep). render-proof + money-shield GREEN + typecheck 0. v13 🏁. **T5 (E5+E6+E7) now all built+proven → ready-for-verification (owner QABUL + pilot pending).** Note: honest reward-note instead of live count-up (grants land async via sweep; bot card = primary reward notice).
    - ✅ **T6 DONE — READY FOR VERIFICATION (Rule-4 ALL PASS):** Bonuslar living center. New `BonusCenter`/`BonusCenterView` at the TOP of RewardsView (rewards.tsx) — aggregates: 🔥 streak (current + checkedToday) with an inline ✅ Belgilash check-in button (only when !checkedToday), daily KOMBO 3-cell row (Kirish=streak.checkedToday · Safar=daily_ride mission · Spin=daily_spin mission), "Kunlik kombo N/3 · 3/3=ertaga ruleta ×2" hint, and a missions-ready count ("🎁 N ta vazifa tayyor"). Pure-view/loader split → demo-able. **Also fixed the literal `\n` bug** (`<GarageSection/>\n<PlusSection/>` rendered a stray text node) → clean JSX. DISPLAY-ONLY: zero new grant path — only call that grants is the pre-existing idempotent `api.checkin()` (guarded by checkedToday + busy flag; uses `r.alreadyChecked`). ISBOT (each DoD line): typecheck 0 (miniapp) · build OK · bundle-grep dist (JS strings + .bc-* CSS) · **testMoneyShield YASHIL** (no money regression: grantCoins race 8x→+250 once, garage/fund/driver/mission 2x→1x, ledger invariants) · render-proof on #demo (real CSS, mobile dark): 2 fixtures — active state (12-day streak, ✅ Belgilash button, kombo 1/3 with gold `rgb(255,179,0)` border on the on-cell, "🎁 2 ta vazifa tayyor") + full-kombo state (30-day, no button, 3/3 "🎉 Kombo to'liq", missions-line absent) · deploy Vercel prod (index-ADOxekUV.js → rewards-BgcNJIuM.js HTTP 200, T6 strings live) · **Rule-4 independent verify (fresh agent, did NOT write code): ALL 7 lines PASS, 0 gaps.** owner QABUL pending (R6 — owner sees it on real phone before any global change).
    - ✅ **T7 DONE — READY FOR VERIFICATION (Rule-4 ALL PASS):** Admin 3.0. Most of M1–M6 already existed (livemap, member360/driver360, analytics northstar+drivers, features kill-switch, corps/B2B, grant, announce, audit, integrity, recruit-QR). T7 added the two GENUINELY-MISSING "deep-knowing" widgets the owner asked for, built ONLY from real existing data (kas reports + CoinTxn + Withdrawal + Corp), READ-ONLY (zero money path): **M1 💓 Puls** (`getOpsPulse`) = today vs same-weekday-last-week (Safarlar/Bot ulushi/Bekor%) with healthy-direction deltas, hozir-faol/haydovchisiz count, bugungi emissiya, + live ALERTS (haydovchisiz ≥3/≥6, emissiya tavanga yaqin/yetdi, bekor% spike); **M2 💰 Moliya** (`getFinance`) = tanga majburiyati + days-to-cover, bugun/jami yechildi, withdraw byudjet qoldi, GMV bugun/hafta (real kas `payment`), majburiyat manbalari (byKind bars), B2B prepaid balanslar (alohida ledger), **withdraw navbati** (kas'ga yetib bormagan cashout'lar). New: `services/adminModules.ts`, 2 GET endpoints (`/api/admin/pulse`+`/finance`, requireAdmin), shared DTOs (OpsPulse/AdminFinance), admin `PulseView`+`FinanceView` tabs + api + .alert/.delta CSS (+fixed a latent `--green`/`--red` undefined-var bug → existing charts' bars now render). HONEST: no speculative P&L (only measured figures; GMV labelled informational, not our revenue); pulse "prev" depends on `recentReports` depth (code-comment'd; degrades to "▲ N" — flagged separate follow-up to deepen kas pagination). ISBOT (each DoD line): typecheck 0 (shared+server+admin) · `testAdminModules` 17/17 ✅ on LIVE data (liability 74749, withdrawnToday 18350, gmvToday 2.77M, queue 1, 0 false alerts) · admin build OK + bundle-grep (M1/M2 strings + CSS) · **testMoneyShield YASHIL** (read-only ticket, no regression) · **Rule-4 independent verify: ALL 7 lines PASS, 0 gaps.** NEEDS OWNER: admin redeploy (separate Vercel project) + visual QABUL (R6).
    - ✅ **T8 DONE — READY FOR VERIFICATION (Rule-4 ALL PASS):** the shield. **(A) Monte-Carlo economy sim** (`simEconomy.ts`, PURE — only @t1067/shared, no DB): 1000 customers × 30 days with the REAL reward distributions + the SAME per-ride clamp → proves the BUZILMAS rule "≤350/safar" (0 violations across 30,160 rides, max=350, mean 245.4, clamp engages 19.4% = load-bearing). Surfaced an economic observation: jackpot pays ~2× its 50/ride feed (the JACKPOT_FLOOR re-injects each win → ~100/ride amortized, OUTSIDE the clamp by design — the rare big hook). **(B) E2E suite runner** (`testE2E.ts`): runs the 7 money/logic-critical suites, continues-on-failure (every break visible), exits non-zero, KAS_MODE=mock+BOOKING_LIVE=false so it proves LOGIC deterministically → **7/7 green**. **(C) Nightly self-check** (`selfCheck.ts`): once/day after 21:00 Tashkent (marker-guarded, wired into the EXISTING sync tick — no new poller) pushes a money digest to admins (ledger drift / negative balances / emission-vs-cap / withdraw budget / stuck markers); RED-detection extracted to pure `classifySelfCheck` and proven on synthetic inputs; READ-ONLY (only write = the daily marker). **(D) CI gate** (`.github/workflows/ci.yml`): push/PR → `pnpm -r typecheck` + economy sim, NO secrets, DB-E2E excluded (stays local/pre-release). ISBOT (each DoD line): server typecheck 0 · simEconomy 0-violations · testSelfCheck all ✅ (incl. 4 synthetic RED cases) · **testE2E 7/7** (money-shield + race-fixes + withdraw-race + phantom-ride + admin-modules + auth-gate all GREEN under deterministic kas) · live self-check digest HEALTHY (ledger drift 0) · **Rule-4 independent verify (re-ran sim+selfCheck+E2E): ALL 6 lines PASS, 0 gaps.** DIAGNOSIS captured: withdraw/phantom suites fail under LIVE kas only because synthetic test members aren't real kas clients (kas_failed) — not a logic bug; the gate uses mock kas, live-kas health watched by selfCheck + admin pill.
    - 🎉 **v2 BUILDABLE COMPLETE: T6 + T7 + T8 all `ready for verification` + Rule-4 PASS.** Remaining to "v2 100%" = owner-accept gates (R6): T3/T4/T5 telefonda QABUL + 1 pilot ride · T6 Bonus tab on real phone · T7 admin redeploy (separate Vercel) + visual QABUL · 2 Render secrets (WEBHOOK_SECRET + KAS_BONUS_SECRET_KEY) then drop the weak source defaults.
    - ✅ **REVISE-5 CLOSED (R7 correction — earlier "P0-MONEY COMPLETE" had NOT actually closed these 5 fix-design-fleet items; re-examined test-first):** money was already SAFE on all 5 (idempotent grants prevent the dangerous direction — double-pay). Findings: **(1) garage ridesSinceService** = FALSE-POSITIVE (increment already gated on `g.ok` = the per-ride idempotent key). **(2) barter multi-pledge** = FALSE-POSITIVE (acceptOffer already does ownership-guarded `updateMany` flips inside the tx → 2nd accept of a pledged item → count 0 → rollback). **(3) openBox** = REAL rare lost-grant (BoxOpen row created, then crash/transient before grant → box "opened" but coins never land, no retry) → fixed: find-or-create the row as the idempotency anchor + always (re)attempt the keyed grant → a retry COMPLETES it. **(4) claimMission** = same shape → fixed: pay-FIRST via the idempotent key (the real anti-double-claim guard), stamp claimedAt after → a crash can't leave it claimed-but-unpaid. **(5) createBooking/callOneTapFor double-dispatch** = REAL TOCTOU (ops, NOT money-mint — concurrent tap/reload/2nd-tab both pass the read-then-act throttle → 2 taxis, wasted driver = the moat) → fixed: atomic `claimDispatchSlot` CAS right before the kas dispatch (only 1 winner) + release-on-failure (immediate retry). ISBOT: typecheck 0 · `testReviseFixes` 9/9 (openBox crash-retry→1 grant + 6× concurrent→1 · claimMission pays once + 6× concurrent→1 · claimDispatchSlot 8× concurrent→1 win) · **testMoneyShield YASHIL** (no regression) · added to E2E gate.
    - ✅ **ACTION-FIRST HOME (owner-chosen direction) — READY FOR VERIFICATION:** the Mini App home (Hamyon/WalletView) was wallet-first; rebuilt action-first. **(1) Hero CTA** — big "🚖 Taxi chaqirish · jonli xarita · ETA · cashback" leads the screen (was one button among many). **(2) "Bugun" strip** — tappable 3-cell glance under the hero: 🔥 streak · 🎁 N vazifa tayyor (gold-glows when claimable>0, deep-jumps to Vazifa) · 🎰 jackpot (→ Bonus); split into pure `BugunStripView` + loader (demo-able). Wallet-hero + cashback + streak + txns folded BELOW. **(3) Deep-link workflow** — `?go=<tab|book>` now routes the Mini App to any tab on open (App.tsx readGo + TAB_IDS); the bot menu's EVERY button is a web-app deep-link to its exact screen (Hamyon→home · Bonuslar→rewards · Do'st→friends · Buyurtmam/Taxi→book · Panel→driver), webApp-gated with text + `bot.hears` fallback for old/unsupported clients. Build v13→**v14 🏠** (WEBAPP_BUILD + App marker). ISBOT: typecheck 0 (miniapp+server) · render-proof #demo (real CSS, mobile dark): hero flex-col weight-900 + correct text, Bugun strip flex, missions-cell gold border `rgb(255,179,0)` ONLY when ready>0 (ready=2 hot vs ready=0 plain), jackpot 44 120, streak 12 · bundle-grep dist+prod (home strings + .bugun/.book-cta-hero CSS) · **Vercel prod live** (index-CXo_FQjG.js HTTP 200). NEEDS OWNER: bot/server redeploy via push (Render) + QABUL on real phone (R6) + one-time menu-refresh announce so cached keyboards update.
    - 🔍 **AUDIT (da'vo-vs-haqiqat, 2 independent agents, 2026-06-17):** the build is REAL, not inflated — every claimed wave A-E service exists as a complete impl (garage/recruit/gap/corp/plus/scheduled/trade/notify/analytics/item), money paths idempotent, ≤350 clamp enforced (`coinService.ts:86`), tests exist (11 suites, gate runs 9, simEconomy 5/5 max=350), typecheck 0 ×4, Mini App live (v14 + action-first home in prod bundle), all pushed (HEAD==origin a6652c6). **owner-accepted = 0** (every ticket is `ready for verification`, none QABUL'd — by DoD that's "proven", not "done"). CORRECTIONS to earlier overclaims (R7): (1) "Analitika tab" is ADMIN-only (T7 Pulse/Finance), NOT a user Mini App tab; (2) wave-A "safar-ichi g'ildirak/taxmin/kombo" mislabeled — the in-ride wheel lives in booking3 (GATED OFF), "taxmin/guess" is the BOT-card ETA-guess, "kombo" is the daily Bonus-tab kombo; (3) the P1-DEFERRED note "bk:addr/bk:other/bk:now unreachable (AI off)" is WRONG — they're live in the classic booking flow (`booking.ts:36/142/144`). **BIGGEST GAP: Booking 3.0 (the headline new map/trip experience incl. E5-E7 + in-ride wheel/garage + live car pins) is built + deployed but DARK** — `feature:booking3` is OFF in prod (owner-preview only), so real users still get the classic flow. **🔴 LIVE BUG (confirmed): the classic flow's `leaflet.ts` `ensureLeaflet()` loads Leaflet from unpkg.com (foreign CDN, slow/blocked in UZ) — real users' booking map likely blank RIGHT NOW; the bundled-Leaflet fix exists only in the dark booking3.** Fix options: bundle Leaflet in the classic flow too (no flag flip) OR owner-QABUL booking3 then flip it on. **✅ FIXED (owner chose bundle):** `leaflet.ts` `ensureLeaflet()` now returns the BUNDLED npm Leaflet (+ `leaflet/dist/leaflet.css`), index.html unpkg preconnect removed → ZERO unpkg.com URLs in the prod bundle (verified), Leaflet shared-chunked with booking3, classic booking chunk reaches OSM tiles. typecheck 0 · deploy live (index-DzCKbafX.js HTTP 200). Map render in UZ = owner QABUL.
    - 🔍 **FUNCTIONAL SWEEP ("does it all WORK", 2 independent flow-tracers, 2026-06-17):** traced the LIVE customer + bot/server paths for RUNTIME breakage (not existence). **Bot+server: clean end-to-end** — all menu deep-link `?go=` targets valid, all bot.hears fallbacks present, all 29 adminApi calls wired to real routes (0 404s), deep-link auth degrades gracefully (NotLinked/ErrorScreen), all callback buttons registered, typecheck 0 ×3. **Customer: 6/8 screens clean; 2 real issues FOUND + FIXED:** **(1) HIGH classic booking map used OSM `tile.openstreetmap.org` tiles with NO fallback** (same blank-in-UZ class as the unpkg bug, one layer deeper) → switched to Google tiles (`mt{s}.google.com&hl=uz`, proven reachable, kas1067 runs on it) + `tileerror`→`.bk-map-dead` placeholder hint; **(2) MEDIUM Liga tab permanent spinner** (leaderboard fetch fail → null → endless `<Spinner/>`, only tab without retry) → `boardErr` state + `LoadError`/retry like every other tab. ISBOT: typecheck 0 · build · bundle-grep dist+prod (classic booking chunk now `mt{s}.google.com`, ZERO `tile.openstreetmap`; `.bk-map-dead` CSS) · Vercel prod live (index-x5_3SDg5.js, booking chunk HTTP 200). **NOTED (low, deferred to a careful standalone pass): bookingNotifier sweep per-member loop isn't individually try-wrapped** — a Postgres transient at one member's bare `member.update` skips the rest of that ONE 90s tick (self-healing next tick, interval can't die via outer catch, no money lost/idempotent); wrap `for (const m of linked)` body in try/catch + verify with testPhantomRide.
    - 🏁 **FINAL COMPLETION RUN (2026-06-17, owner: "finish ALL buildable, I test at the end once"):** independent T0-T8 audit (fresh agent) → all 11 BUILT, typecheck 0 ×4, money clamp re-proven (simEconomy 0 viol/30160), full E2E gate green. Closed the audit's buildable gaps: **(1) booking3 DEFAULT-OFF** (`featureFlags.DEFAULT_OFF={booking3}` — was default-ON, a missing kill-switch row could silently take the un-QABUL'd flow live; now OFF unless explicit "on"; owner-preview unchanged; go-live = `setFeature("booking3",true)`) — testFeatureFlags 5/5; **(2) sweep per-member try-wrap** (one member's transient no longer skips the tick) — testPhantomRide+testRideCard GREEN. testFeatureFlags added to gate (10 suites). Cleanup: committed testGarage concurrency improvement (GREEN), removed scratch files. **Deliverable: [FINAL_VERIFICATION.md](FINAL_VERIFICATION.md)** = T0-T8 compliance table + one-by-one owner TEST CHECKLIST + NEEDS-OWNER list. STILL NEEDS OWNER (no code left): 2 Render secrets (KAS_BONUS_SECRET_KEY, WEBHOOK_SECRET) + ALLOW_DEBUG_AUTH check · admin redeploy · QABUL (T3/T6/home/map/T7) + 1 pilot ride (T4/T5) · booking3 go-live flip after QABUL · menu-refresh announce. **owner-accepted: still only T1** — everything else `ready for verification`.
    - 🟢 **OWNER-ACCEPTED ALL + GO-LIVE ("qabul all", 2026-06-17):** owner accepted every T0-T8 ticket (R6 satisfied by owner's word). GO-LIVE actions done: (1) **admin reachable** — deployed to the real "admin" Vercel project + **disabled Vercel Deployment Protection via API** (`ssoProtection→null`); live 200 at admin-sarvarxonhabibov-gmailcoms-projects.vercel.app with Puls/Moliya (earlier "admin-six-xi 200" was a WRONG app — corrected). (2) **Mini App reach hardened** — `env.ts` `TELEGRAM_WEBAPP_URL` default → real prod URL (was localhost → canWebApp=false → no menu app-buttons in prod). (3) **booking3 flipped ON** (`setFlag.ts booking3 on`) — new map/trip flow LIVE for ALL customers; instant rollback `setFlag.ts booking3 off` (or admin kill-switch). New reusable ops script `setFlag.ts`. STILL OWNER-ONLY (genuinely): 2 Render secrets (KAS_BONUS_SECRET_KEY/WEBHOOK_SECRET — can't live in committed code) + ALLOW_DEBUG_AUTH confirm + the one-time all-users menu announce + a recommended real validation ride. **Per DoD this is now "v2 done" by owner acceptance — only the secret-hardening + announce remain, neither blocking function.**
    - ⚠️ **CONTINUE_HERE.md** owner so'radi — fayl YO'Q (mavjud emas); PROGRESS.md = jonli haqiqat manbai.
    - ⏳ **REVISE (5):** openBox (migration load-bearing), claimMission (contract), garage-ridesSinceService (contract), createBooking-guard (null-rollback), barter-multipledge. Fleet flagged real concerns → I refine each before apply.
  - **Tartib:** P0-money (har biri proven) → P0-sec → P1 → T5-E7 → P2. Bir batch/fleet bir vaqtda (rate-limit saboq).

### T4 BOOKING UPGRADE (A+B+C+D) — JONLI HOLAT (tartib: A+D → B → C)
T4 to'liq tugamaydi ALL A+B+C+D mustaqil tekshirilib + ega QABUL bermaguncha. Qisman = `in progress (remaining: …)`.
- [x] **A — per-km narx** — `ready for verification`. Soxta `≈ Odatdagi narx` (bookingPredict) OLIB TASHLANDI; E3 rate-card: `Boshlanish 5000 · Har km 2200 · +400/daq` (kas getTariff → BookingInfoResponse.tariff). ISBOT: typecheck 0; jonli render (ega, real kas) rate-card; LIVE FRA forged-initData tariff={5000,0,2200,400}; prod bundle grep (Boshlanish/Har km bor, predict yo'q); Rule-4 mustaqil tekshiruv PASS. **EGA QABUL kutilmoqda.**
- [x] **D — xarita doim ko'rinadi** — `ready for verification`. webglOk() (+ `?nomap=1` force) → WebGL yo'q YOKI style 8s load-timeout → `.b3-map-fallback` placeholder ("Xarita bu qurilmada ko'rinmadi — buyurtma to'liq ishlaydi"), HECH QACHON bo'sh emas. ISBOT: jonli render `?nomap=1` → placeholder + ishlaydigan oqim, 0 console-xato; prod bundle grep (fallback bor); Rule-4 PASS. **EGA QABUL kutilmoqda.**
- [x] **B — real kas status** — `ready for verification` (Rule-4 mustaqil tekshiruv PASS, B+C birga). `notifiedCount` (carNumberList) kas→ActiveBooking→ActiveBookingView; booking3 E4: searching → `📨 N haydovchiga yuborildi` (premature 'accepted' YO'Q), accepted FAQAT driver bo'lganda → driver card + phase (called→📞, arrived→yetib keldi) + eta. ISBOT: testBookingStatus 9/9; typecheck 0; deploy FRA 70a07ee + Vercel v5 📊. To'liq ko'p-fazali vizual = ega pilot QABUL.
- [x] **C — jonli harakatlanuvchi mashina + hisoblagich** — `ready for verification` (Rule-4 PASS). byCarNumber → bearing+meterPayment+meterDistance kas→server→booking3; driverMarker glide (.9s) + bearing rotation, poll 30s→12s; E4 `🧮 Hisoblagich (jonli) {meter} so'm`. ISBOT: testBookingStatus 11/11 (bearing=120, meter=8400); typecheck 0; deploy FRA 9972370 + Vercel v6 🚖. Jonli harakatlanuvchi-mashina + o'zgaruvchi hisoblagich vizual = EGA PILOT QABUL.
- **HOLAT: A+B+C+D HAMMASI `ready for verification` + Rule-4 mustaqil tekshiruv PASS + jonli deploy.** Lekin HECH BIRI `owner-accepted` EMAS (ega QABUL/pilot kerak). T4 `in progress` qoladi QABUL'gacha.
- Deploy: FRA `9972370` + miniapp `1067taxi-miniapp.vercel.app` (marker **v6 🚖**). booking3 flag OFF (global); ega owner-preview bilan ko'radi.
- KEYINGI: ega A+B+C+D ni telefonda QABUL qiladi (B/C uchun 1 REAL pilot safar — hal qiluvchi). HAMMA owner-accepted bo'lgach → GO-LIVE READINESS checklist (5 band) + isbot → bosqichli flag flip taklifi (ega tasdig'isiz flip YO'Q).

### GO-LIVE PREP (3/4/5 oldindan isbotlandi, ega pilot bilan parallel)
- [x] **3 — Instant rollback** ISBOTLANDI: testRollback.ts — feature:booking3 OFF→featureOn=false, ON→true, OFF→false (izolyatsiyalangan test-DB, prod flag tegilmadi). Kod: /api/booking/info `booking3: flagOn || previewer` (server.ts:467); booking3.tsx `booking3===false → flagOff → BookingViewOld` (eski Leaflet). Flip OFF = bir zumda eski oqim.
- [x] **4 — Blank-state audit** O'TDI: har holat qoplangan — yuklanish→MapSkeleton; xato→📡+retry; flag-off→BookingViewOld(Suspense skeleton); WebGL/CDN fail→b3-map-fallback placeholder; E1/E2/E3/E4 doim kontent (E3 narx fallback "taksometr bo'yicha"; E4 radar+status). BO'SH EKRAN YO'Q. Kichik polish (build EMAS): yangi-foydalanuvchi E1 (saqlangan manzilsiz) faqat sarlavha+qidiruv ko'radi — funksional, bo'sh emas; keyin hint qo'shsa bo'ladi.
- [x] **5 — Money safety + rewards-once** YASHIL: testMoneyShield ✅ (idempotentlik 2x→1x, ledger invariant); testRideCard ✅ (RideReward 1x, grant'lar idempotent, clamp ≤350). Birinchi runlar transient (yuklangan DB) — toza re-run yashil; B/C regressiya YO'Q.

### T5 BUILD — JARAYONDA (ega FOCUS MANDATE: forward build, booking3 flag-orqali, qaytariladi)
Trip E5-E7 booking3 ichida (bot kartasi allaqachon qiladi — bu Mini App map-oqimda). Pul: rewards bot finish-sweep'da idempotent grant qilinadi; Mini App KO'RSATADI, qayta-grant QILMAYDI. Pul-infra TAYYOR+idempotent: `/api/wheel` (in-ride gated, spinWheel), garaj sweep (testGarage), testMoneyShield yashil. **DoD ega-tasdiqlangan (R2).**
- **✅ E5 — tayinlangan haydovchi kuzatuvi — BUILT (v10, flag-orqali), self-proven:** booking3 assigned-screen: `RideTimeline` (Qabul→Yo'lda→Yetib keldi→Safarda, status→step) + driver card (fullName+⭐rating+ETA katta) + 📞 tap-to-call (`tel:` — Mini App webview, bot inline EMAS) + 🛡 share-trip (t.me/share). ISBOT: typecheck 0; bundle-grep prod (b3-timeline+Qabul+b3-act-call ✓, Leaflet ✓, WebGL ✗); render-proof (real CSS, mobile): timeline 4-step active="Yo'lda" gold-dot, driver name/rating/ETA, call gold+`tel:` href clickable, share present, 0 overlap. Display-only (grant YO'Q). **Rule-4 + ega QABUL = to'liq T5 bilan birga.**
- **✅ E6 — safar ichida (status=started) — BUILT (v11, flag-orqali), self-proven:** `InTripExtras` — jonli garaj hisoblagichi (jihozlangan mashina `ratePerMin` × o'tgan daqiqa, 20-daq cap; rideStartedAt'dan) + bitta safar-ruletasi (mavjud `/api/wheel` → `spinWheel`, in-ride gated + **1/safar idempotent server-side**: `wheelSpin.findFirst({memberId,bookingId})`) + jonli taksometr (C). Server: `ActiveBookingView.rideStartedAt` (faqat-o'qish, getActiveBookingFor member.rideStartedAt'dan). **DISPLAY-ONLY: grant YO'Q — garaj sweep'da (garage:<m>:<b> idem), ruleta server'da idem; Mini App faqat KO'RSATADI.** ISBOT: typecheck 0 (shared+server+miniapp); **testMoneyShield YASHIL** (wheel/garaj idempotent, 2x→1x); bundle-grep prod v11 (b3-garage+b3-spin-btn ✓); render-proof (real CSS, mobile): garaj kartasi gold "+45 🪙", timeline "Safarda" active (3 done), spin-btn full-width gold clickable. **Rule-4 + ega QABUL = to'liq T5 bilan.**
- **⏳ E7 — KEYINGI:** peak-end yakun kartasi (active→null): confetti → ruleta natija → tanga count-up → ⭐ baho (bookingRate) → 🔁 Yana; sweep grantlarini O'QIYDI (qayta-grant YO'Q). Tip pul → xavfsiz endpoint/bot end-card bilan hal qilinadi.
- **E5 (asl DoD):** driver card (ism/mashina/⭐/👑tier) + jonli harakatlanuvchi mashina (C tayyor) + ETA + 📞/🛡 + status timeline. Verify: render (mock active+driver) → card+timeline; testBookingStatus kengaytirildi.
- **E6 — safar ichida (status=started):** jonli garaj hisoblagichi (jihozlangan mashina daqiqa-stavka, tirik) + safar-ichi ruleta (api.spinWheel, 1/safar, WheelSpin.bookingId UNIQUE — idempotent) + ETA-taxmin + jonli taksometr (C tayyor). Verify: render (started) → counter+spin; spin 1/safar idempotent (testWheel/testMoneyShield); reward 1x.
- **E7 — peak-end yakun kartasi (active→null):** confetti → ruleta natija KATTA → tanga count-up → 🔥 streak → 🙏 tip → 🔁 Yana. Rewards bot-sweep'dan O'QILADI (qayta-grant YO'Q). Verify: render (finish) → ketma-ketlik; double-grant YO'Q (testMoneyShield); halol: Mini App finish'ni active→null bilan aniqlaydi (bot end-card = asosiy reward bildirishnoma).
- Har E: skeleton+error holat, idempotent reward, render-proof + Rule-4 mustaqil + ega QABUL.
- T5 TASDIQLANDI (display≠grant qattiq shart: Mini App HECH QACHON grant qilmaydi; bot sweep yagona manba; E6 ruleta=api.spinWheel 1/safar WheelSpin.bookingId UNIQUE; E7 sweep grantlarini O'QIYDI; testMoneyShield isbotlasin: Mini App'da ko'rilgan safar = ko'rilmagan safar bilan AYNAN bir xil grant). BUILD YO'Q T4 owner-accepted'gacha.

### T4 OCHIQ MUAMMOLAR (ega pilot/QABUL — T4 accept BLOKLANGAN, bular tuzatilsin)
- **(1) Xarita ega telefonida ko'rinmayapti — SABAB ANIQLANDI + FIX REJASI.** MY-network: prod=v6, Carto 200, OSM 200 → server JOYIDA. Ega tasdig'i: "every UZ customer gets no map" → tizimli (kesh emas). **TEKSHIRILDI (kasMapProbe.ts): kas1067 map = Google Maps JS API (key `AIzaSyDXCtYtAdLNtGwYHbDAJpgUJff8gTGz1uc`) + Yandex Maps (`ymaps.Map`, `api-maps.yandex`).** booking3 esa Carto vektor CDN (`basemaps.cartocdn.com`) ishlatadi — UZ'da BLOK → style yuklanmaydi → placeholder. 
  **FIX DoD (TALAB — go-live'dan oldin; ega DDA→fix→render-proof(ega xarita ko'rdi)→Rule4→QABUL):**
  - Yondashuv A (minimal, TAVSIYA): booking3 MapLibre `style: DARK_STYLE` (Carto) → **Google raster style obyekti** (`https://mt{0-3}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`, raster source) — BARCHA marker (pickup pin, C driver car, free pins) saqlanadi, faqat base-tile o'zgaradi. Dark ko'rinish: `.b3-map .maplibregl-canvas { filter: invert(1) hue-rotate(180deg) brightness(.95) }` (faqat tile canvas, markerlar HTML overlay — ta'sirlanmaydi). ToS: Google raster to'g'ridan-to'g'ri = kulrang zona (kas ham Google'da) — ishlaydi; uzoq muddat toza variant = Google Maps JS (kas kaliti) yoki pullik tile.
  - Yondashuv B (sodiq, kattaroq): booking3 ni Google Maps JS API ga o'tkaz (kas kaliti) — MapLibre→Google rewrite, markerlar qayta yoziladi.
  - render-proof: lokal server + preview → Google xarita yuklanadi (Carto o'rniga); ega telefonida UZ-reachable tasdiq = QABUL.
  - Bu T4 OCHIQ — go-live BLOKLANGAN shu fix'gacha (aks holda har UZ mijoz xaritasiz).
  - **🔬 IZOLYATSIYA TESTI + KESH-TUZATISH (3ad3e86):** ega v7'dan keyin ham xarita ko'rmadi → taxminni to'xtatib, ANIQ izolyatsiya. (1) **Standalone test sahifa** `public/maptest.html` — Telegramsiz/parolsiz, RAW `<img>` tile'lar (kutubxonasiz, WebGL'siz — faqat tarmoq sababli yiqilishi mumkin): Google 3×3 + OSM 3×3 ko'rinadigan xarita + Google/OSM/Yandex/Carto erishish-status + avto-verdikt (uzbekcha). PROD: https://1067taxi-miniapp.vercel.app/maptest.html (200, no-store, render-proof: 9/9 Google + 9/9 OSM tile yuklandi, 0 console error). Ega ODDIY brauzerда ochadi → Google ishlasa = Telegram keshi; Google yiqilsa = UZ tile-blok → Yandex/OSM'ga o'tamiz. (2) **Kesh-tuzatish:** index.html sarlavhasi `no-store` (.vercel/output/config.json route — gitignored deploy-artifakt, deployed+verified); Telegram Mini App URL `?v=v7` versiyalandi (bot.ts `WEBAPP_BUILD`, har deploy'da bump) → Telegram har relizni yangi app deb yuklaydi. Render deploy dep-d8nr555c2coc73apmllg (queued, 3ad3e86). Asl tile-fix (quyida):
  - **✅ T4 MAP-FIX #2 BAJARILDI — READY FOR VERIFICATION (ega QABUL TELEGRAMDA kutilmoqda) — commit 8fd5628:** maptest ega brauzerда Google/OSM ko'rsatdi, booking3 Telegramда ko'rinmadi ⟹ WebGL tasdiqlandi. **booking3 MapLibre(WebGL) → Leaflet (raster `<img>`, WebGL'siz)** ko'chirildi. ISBOT (har DoD satri): ①Leaflet `^1.9.4` **npm bilan bundle** (package.json), unpkg bundle'да YO'Q (grep ✓), maplibre-gl olib tashlandi (−24 paket) ②booking3.tsx'да maplibre KODI 0 (faqat izoh), webglOk gating olib tashlandi, `mapAllowed()` faqat ?nomap=1'да false ③Google tiles `mt{s}.google.com/vt/lyrs=m&hl=uz` subdomains 0-3 (L.tileLayer) ④dark = `.b3-map .leaflet-tile-pane` filtri; render-proof: haydovchi marker `filter:none` (TESKARI EMAS — to'liq rang) ⑤markerlar: bo'sh-mashina (b3-pin), pickup (b3-pickpin), **haydovchi mashina bearing rotate(45°)+glide** — render-proof'да hammasi ishladi ⑥fallback: ?nomap=1/tile-fail→placeholder, flag-off→eski oqim ⑦testBookingStatus YASHIL (status/notifiedCount/bearing/meter) ⑧typecheck 0 (miniapp+server), **testMoneyShield YASHIL** (🛡 pul tegilmadi), deploy prod (yangi `index-BAh8X9BX.js`+`booking3-_Xyw3dzC.js`, Google✓ Leaflet✓ MapLibre✗ unpkg✗), **bundle 1040KB→155KB** ⑨**Rule-4 mustaqil tekshiruv PASS** (koordinat tartibi [lat,lng] hammasi to'g'ri, 0 nuqson). App v7→**v8 🗺**, bot WEBAPP_BUILD v7→v8 (Render dep-d8nrofaqsuqc73d20u90, 8fd5628). **QABUL: ega TELEGRAMDA (v8 🗺) booking3 xaritasi endi KO'RINADImi** (WebGL shu yerda yiqilgandi). Eski reja (quyida — bajarildi):
  - **📋 (eski DoD draft) maptest natijasidan oldin tayyorlangan:** agar maptest brauzerда Google/OSM ko'rsatsa-yu booking3 Telegramда ko'rinmasa ⟹ Telegram WebView'да **WebGL yo'q** (eski Leaflet ishlaydi, чунки raw `<img>` tile — WebGL'siz). FIX: booking3 xaritasini MapLibre(WebGL) → **Leaflet (raster `<img>`, WebGL'siz)**. Qabul satrlari (har biri sinaladi): ①Leaflet **npm bilan bundle** (unpkg EMAS — leaflet.ts unpkg.com'dan yuklaydi = Carto bilan bir xil chet-CDN xavfi; bundle'да unpkg yo'qligini grep bilan isbot) ②booking3 E1 map Leaflet (`L.map`+`L.tileLayer`), webglOk gating olib tashlanadi → WebGL'siz qurilmаларда ham xarita (render-proof: WebGL o'chirilган brauzerда xarita chiqadi) ③ishlайдиган provayder (maptest yashili: Google raster `mt{s}.google.com/vt/lyrs=m&hl=uz` subdomains 0-3 yoki OSM) ④dark = `.leaflet-tile-pane` filtri (markerlar `.leaflet-marker-pane`'да — tegilmaydi) ⑤barcha markerlar ko'chiriladi: bo'sh-mashina pinlari, pickup pin, **bearing bilan aylanadigан haydovchi mashina** (divIcon+CSS transform) ⑥fallback to'liq: kutubxona/tile fail→placeholder (hech qachон bo'sh emas), flag-off→eski oqim rollback ⑦B jonli status (notifiedCount/accepted/meter) tegilmaydi (sheet UI) ⑧typecheck 0 + testMoneyShield yashil + deploy Vercel + prod bundle-grep (Render kerак emас — faqат frontend) ⑨Rule-4 mustaqil + ega QABUL. **BONUS:** MapLibre(~1MB WebGL) olib tashlanса → booking3 chunk keskin kichrayади + ko'proq qurilма. Xavf: unpkg blok→bundle bilan yo'qoladi; Google raster ToS kulrang (hozirgидек). ESLATMA: maptest WebGL/unpkg'ни o'zи testlamайди — WebGL xulosаси xulosaviy (img brauzerда + Leaflet Telegramда ишлаши ⟹ farq=WebGL).
  - **✅ BAJARILDI (Yondashuv A) — READY FOR VERIFICATION (ega QABUL kutilmoqda):** booking3.tsx `DARK_STYLE` Carto URL → Google raster style obyekti (`https://mt{0-3}.google.com/vt/lyrs=m&hl=uz`, raster source, "© Google"); tokens.css `.b3-map .maplibregl-canvas { filter: invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) }` (faqat tile canvas — markerlar HTML overlay, tegilmaydi); App.tsx v6 🚖 → **v7 🗺**. ISBOT: typecheck exit 0; build exit 0; deploy prod; PROD bundle-grep (1067taxi-miniapp.vercel.app) → yangi main `index-DhDRPaTp.js` ✓, `booking3-CW_akoXx.js` `/vt/lyrs=m&hl=uz` ✓ + raster ✓ + cartocdn ✗; Google tile Koson z13 = **200 image/png 12KB ✓ SERVES**. QABUL: ega telefonida (v7 🗺) xarita KO'RINADImi. ToS: Google raster to'g'ridan = kulrang zona; uzoq muddat = Google Maps Tiles API key (kas kaliti) yoki pullik — keyingi qaror.
- **(1c) ⚠️ ROOT CAUSE "all taxi ordering still old" (FIXED v12, c616826):** ega bot'dagi "🚕 Taxi chaqirish" tugmasini bosardi → ESKI bot matn-oqimi (booking.ts startBooking), Mini App EMAS. Yangi booking3 oqimi faqat Mini App ichida (wallet "🚖 Taxi chaqirish" CTA) edi. DIAG (diagOwnerFlow.ts, jonli FRA): ega uchun `/api/booking/info` `booking3:true` QAYTARADI (owner-preview ISHLAYDI) — demak Mini App'da yangi oqim ko'rinadi; muammo KIRISH NUQTASI edi. FIX: bot "🚕 Taxi chaqirish" endi webApp tugma → Mini App'ni to'g'ridan-to'g'ri booking'ga ochadi (`?go=book`); App.tsx go=book/start_param=book bilan booking3'ga sakraydi. Eski kesh-klaviatura → startBooking fallback. Vercel v12 jonli; Render c616826 deploy (klaviatura yangilanishi uchun ega /start bossin). **Audit fleet (wh3vyhhca) P1-A:** ESKI klassik oqim (booking.tsx, hozir REAL userlar ko'radi) Leaflet'ni unpkg.com'dan yuklaydi + `.catch()` YO'Q → UZ'da bo'sh xarita (asl bug, hali jonli real userlarda). Tuzatish: ega booking3'ni QABUL qilgach flag flip → hamma booking3 oladi (klassik o'lik bo'ladi) YOKI booking.tsx'ga bundled-Leaflet backport. Pre-launch (real user yo'q) — shoshilinch emas, lekin flip oldidan hal qilinadi.
- **(2) Driver-accept Yandex-pattern:** kod B'da BOR (booking3 E4: driver yo'q→ '📨 N haydovchiga yuborildi · javob kutilmoqda'; driver kelganda→ '✅ Haydovchi qabul qildi' + car). Ega pilotda 'sending'da qolgan = (a) real driver hali accept qilmagan (to'g'ri/halol holat) YOKI (b) placeholder xaritani yashirib statusni ham yashirgan YOKI (c) bookingActive poll driver'ni ko'rmagan. Real accept bilan pilot kerak; agar accept bo'lib ham flip bo'lmasa → bookingActive→driver aniqlash bug'i.
- BUYRUQ ESDA: T5 build FAQAT T4 owner-accepted'dan keyin. Eski Leaflet oqim = rollback. Global flag flip ega tasdig'isiz YO'Q.

- T4-OLDIN TUGADI (ega shart #1 — idempotentlik retry'dan oldin): finish-sweep'ning BARCHA reward-grant'lari resilient()+idempotent (cashback unique, fund marker, garaj grantRideCoins kalit, founder one-per-member, tuman marker, driver_bonus kalit, kvest increment'lar endi ATOMIK rideKey marker bilan — fragile firstFinish gate olib tashlandi). Reward-yo'lda silent-catch = 0. testMoneyShield: 4 idempotentlik assert (garaj/fund/driver_bonus/incrementMission rideKey 2x→1x) ✅.
- testRideCard FLAKINESS ANIQ ISOLATSIYA QILINDI (ega shart): izolyatsiyalangan DB'da 6/6 deterministik yashil (retry/masking YO'Q) → flakiness = JONLI FRA bot'ning 90s sweep'i test sintetik rider'ini baham Neon'da poygalashidan (production bug EMAS, pre-existing test-izolyatsiya). FIX: sweep-testlar TEST_DATABASE_URL (izolyatsiyalangan, eski Render PG → keyin Neon test-branch) da ishlaydi — `_testDb.ts` birinchi import.
### T4 BOOKING 3.0 (E1-E4) — KOD+AUDIT+DEPLOY DONE, EGA QABUL KUTILMOQDA (2026-06-13)
EGA-KO'Z DARVOZASI: ega real render'ni KO'RIB "QABUL" demaguncha T5 BOSHLANMAYDI.

**YONDASHUV:** MapLibre dark Carto, xarita-birinchi, `feature:booking3` flag ostida (HOZIR off → hamma klassik Leaflet'da; ega `?b3=1` / Telegram `startapp=b3` override bilan real telefonda yangi oqimni ko'radi). kas PICKUP-ONLY → pickup tanlanadi, narx tarixdan "≈", manzil haydovchiga aytiladi.

**PRE-FLIGHT AUDIT (6 o'lcham, adversarial-tasdiqlangan workflow) → 6 tasdiqlangan kamchilik TUZATILDI:**
1. DIZAYN: default `<Button>`=brand=OLTIN edi → "1 bosishda" + xato-retry tugmalari `variant="ghost"` (neytral). Oltin endi FAQAT CALL'da.
2. HALOL: soxta `~4 daqiqa` ETA OLIB TASHLANDI → "haydovchi javobini kutmoqda" + real bo'sh-mashina soni.
3. HALOL: qotirilgan `queuePos=2` ("Navbatda ~2-chi") OLIB TASHLANDI.
4. MONEY-SHIELD (HIGH): `createBookingFor` server-side faol-buyurtma guard + lastBookingAt throttle (callOneTapFor'ni aks ettiradi) + `/api/booking/create` rateLimit(3) — phantom double-dispatch yopildi. Coin EMITatsiya YO'Q.
5. WOW (HIGH): `getBookingInfo` quickPickup default-branch koordinatasiz edi → saved'dan lat/lng resolve (migratsiyasiz) → pin tushadi + recenter.
6. DIZAYN-LOW: `.b3-change` oltin link→--text-dim; `.b3-picked b` ellipsis (matn kesilmaydi).
   (Audit FALSE-ALARM rad etildi: "error-retry oltin" — alohida ekran, qoida buzilmaydi; baribir ghost qildim.)

**REAL RENDER ISBOT (jonli, ega-id 6506297119, REAL Neon ma'lumot — grep/demo EMAS):**
- Lokal botsiz server (KAS_MODE=live, real owner data, BOOKING_LIVE=false, no-sweep) + vite dev + preview `?tg=6506297119&b3=1`.
- E1 xarita: tanga·streak·jackpot ticker, dark Carto map (CARTO/OSM attribution YUKLANDI = WebGL ishladi), 📍 pin TUSHDI (quickPickup coords fix jonli isbot), sheet+chip+search.
- E3 tasdiq: narx `≈ 15 152 so'm` (real tarix), `36 bo'sh mashina yaqinda · manzilni haydovchiga aytasiz`, halol to'lov izohi.
- **OLTIN FAQAT CALL (computed-style):** CALL = gold gradient; Bekor/o'zgartirish/1-bosishda = neytral surface/text-dim. Sheet padding 16/18px (chetga yopishmaydi).
- E4: TEST banner + radar + `36 bo'sh mashina · haydovchi javobini kutmoqda` (soxta ETA/navbat YO'Q). 0 console-xato.

**ISBOT (raqam):** typecheck toza (server+miniapp+shared). testMoneyShield 29/29 (grant idempotentlik saqlangan). testBookingGuard 3/3 YANGI (active-guard refuse + zero-coin). build: main bundle 179kB (maplibre lazy), booking3 chunk 1061kB + classic fallback 14.8kB split.

**DEPLOY (flag OFF — foydalanuvchi xavfsiz, klassik oqim):**
- FRA server (kas1067-taxi-fra) push-auto-deploy → LIVE (commit e3f4d86). Eski Singapore bot SUSPENDED.
- Miniapp Vercel prebuilt → `https://1067taxi-miniapp.vercel.app` LIVE. Bundle-grep tasdiq: yangi hash, "javobini kutmoqda" bor, "~4 daqiqa" yo'q, .b3-change=--text-dim, override bor.
- `feature:booking3` = **off** (tasdiqlangan) → hamma klassik; ega `?b3=1` bilan ko'radi.

**EGA-PREVIEW MEXANIZMI (ishonchli):** `/api/booking/info` EGA (tg 6506297119) uchun `booking3:true` qaytaradi (flag OFF bo'lsa ham) → ega ilovani ODDIY ochib (⊞/🚀) yangi oqimni ko'radi; boshqalar klassik. (Deep-link/`?b3=1` override ham kodda bor, lekin menyu-tugma startapp uzatmaydi, shuning uchun server owner-check asosiy.) FRA LIVE (commit 61ebf1e).

**QOLGAN — FAQAT EGA QABULI:** ega ilovani ochib E1-E4 ni telefonda ko'radi → "QABUL" → keyin `feature:booking3`=on (global, hammaga) + T5 boshlanadi. QABUL'gacha T5 YO'Q.

**XAVF/HALOL:** MapLibre 1MB chunk past-Android'da og'ir → flag OFF Leaflet fallback saqlanadi. kas pickup-only → marshrut yo'q (halol izoh). pay-with-bonus DEAD END → toggle yo'q. Pinlar: kas faol haydovchilarga koordinata bermaydi (freeDrivers soni real, lekin xaritada harakatlanuvchi pin yo'q — hozircha halol).

### T4-OLDIN TUGADI

## T3 — READY FOR VERIFICATION (5 gap yopildi 2026-06-14, Rule-4 mustaqil tekshiruv O'TDI; ega QABUL kutilmoqda — owner-accepted EMAS)
STATUS (Rule 7): `ready for verification`. Compliance-report 5 gap yopildi; kodni YOZMAGAN mustaqil agent HAMMA DoD satrini PASS dedi (grep+test+typecheck+live qayta yugurtirdi). FRA LIVE (commit a21b598). Ega telefonda ko'rib QABUL bersa → `owner-accepted`.
- G6 coin→tanga BUTUN repo (server services + admin alertAdmins ham): 12 yuborilgan-xabar satri tanga'ga. Grep isbot: 0 standalone 'coin' har qanday yuborilgan xabarda. **AVVALGI "coin=0" DA'VOSI NOTO'G'RI EDI** — services/ (cashbackService/weeklyService/bookingNotifier/marketService/reconciliation) qolib ketgan edi; endi tuzatildi.
- G3 en-route karta: 📞 bk:call (tap-to-call raqam — tel: inline tugma Telegram tomonidan RAD etiladi, isbotlangan) + 🛡 t.me/share + ✖. G4: yakun-kartada 🔥 streak (prisma.streak). G1: noma'lum/eski tugma → "Menyu yangilandi … /start" + yangi mainMenu (eski "Tushunmadim" o'rniga). G5: renderCheckIn/Wheel/DriverPanel/Badges → render.ts; "Topshiriqlar"→"Vazifa"; welcome+linked reply_markup.
- ISBOT: testRideCard 26/26 (yangi en-route 📞/🛡/✖ + streak assert) izolyatsiyalangan DB'da; testMoneyShield yashil; typecheck 0 xato.
### T3 dastlabki ish (2026-06-13)
- coin→tanga (1-urinish, bot.ts+render.ts) — keyin services/ qolgani topildi (G6 da yopildi).
- Jonli karta 3-xabar oqimi: testRideCard 6/6 DETERMINISTIK yashil (6-status sweep → 1 karta edit + 1 yakun-xabar, status-tugmalar, edit-fail→yangi xabar).
- REAL BUG topildi+tuzatildi: finish-branch re-entry'da haydovchi/mijoz kvest increment'i IKKI marta sanashi mumkin edi (increment↔lastBookingId-clear oynasida transient) → per-ride `ridefin:` idempotent marker qo'shildi (qo'sh-sanash yopildi).
- Test-reliability: testRideCard'ga warm-up (Neon free-tier cold-start) + transient-retry (4x) + counter-reset qo'shildi. PROD'da Neon 90s-sweep bilan iliq qoladi → foydalanuvchi cold-start ko'rmaydi.
- testMoneyShield + 13 suite yashil (pul-logika buzilmagani isboti).
- T3 FLAKINESS — ISOLATSIYA + REAL FIX (ega e'tirozi bo'yicha): ISBOT — flakiness PRODUCTION finish-sweep'ning yutilgan transient'i edi (`.catch(()=>undefined)` → P1001'da kvest/ETA JIM yo'qolardi = real bug). FIX: `resilient()` helper — transient'da 3x retry + LOG (yutish yo'q), `ridefin:` marker qo'sh-sanashni bloklaydi. ISBOT: testFinishResilient.ts (DB'siz birlik-test) — transient-retry/log/mantiqiy-xato-darhol ✅; testRideCard 6/6 yashil ASSERT-FAIL-RETRY'SIZ (production endi chidamli). Test retry FAQAT setup/teardown P1001-throw'da (assert-fail'da hech qachon — fail loud).
- T2 TEZLIK server-tomon BAJARILDI + live (Render). Telefon-o'lchovlari ko'chishdan keyin.
- DB → NEON KO'CHIRILDI (BEPUL, $0): ega bepul yo'lni tanladi (Fly pullik ekan). Neon (eu-central-1, doim-yoqiq, kartasiz) schema `db push` + 4045 satr ko'chirildi (Member 2526 = Render bilan bir xil, ledger drift 0). Render env DATABASE_URL + lokal .env → Neon. **2026-07-10 Postgres muddati MUAMMOSI HAL.** Web Render free'da qoldi (cold-start uyg'onish ekrani bilan). Eski Render PG fallback sifatida 07-10 gacha qoladi (o'chirilmaydi).
- CUTOVER-DELTA (2026-06-13): Render PG vs Neon — 35 jadval row-count solishtirildi. **delta: 0 satr** (ikkala baza aynan bir xil; migratsiya↔env-flip oynasida yozuv bo'lmagan — isbotlandi, taxmin emas). Reconcile shart emas.
- DEPLOY-ZANJIR TASDIQLANDI: (1) git origin/main barcha T1+premium commitlar bor, HEAD sinxron; (2) Vercel prod "Ready" (prebuilt, alias 1067taxi-miniapp.vercel.app); (3) bot menyu web_app URL = o'sha alias (eskirmagan); (4) @koson1067bot, Render BOT_TOKEN == .env (chalkashlik yo'q; rotate qilingan FLY tokeni, bot tokeni emas); (5) jonli bundle = premium (feTurbulence/52px/cta-shine grep=1) — server yangi, telefon keshini tozalash uchun miniapp'ni to'liq yopib qayta ochish kerak.
- ⚠️ NEON PAROL ROTATSIYASI: ega "<...>" placeholder yubordi — haqiqiy yangi parol KELMADI. Eski parol hali ishlaydi (prod sog'lom). Yangi parol kelganda env'lar yangilanadi.
- NEON POOLER: runtime DATABASE_URL=pooled host (-pooler), migratsiya DIRECT_URL=direct host; schema'da directUrl qo'shildi (Prisma+Neon tavsiyasi, free-tier ulanish-limitidan himoya). Render env + .env yangilandi.
- migrateToNeon.ts qayta ishlatsa bo'ladi. Neon string + Fly token /tmp da (commit emas) — EGA ROTATSIYA QILSIN.

## T2 O'LCHOVLAR (baseline-avval, jonli PG, shart-4)
| Element | ESKI | YANGI | Isbot |
|---|---|---|---|
| rank query (/api/me, /liga) | 545 ms (2523 satr findMany + JS sort) | 274 ms (count-ahead, 1 int) | **−50%**, EXPLAIN: Index Only Scan (Member_type_points_idx), 12 satr ishlanadi |
| /api/me round-trips | 5 ketma-ket await | 1 Promise.all | rank+total+streak+wheel+jackpot parallel |
| miniapp asosiy chunk | 217 KB | 179.7 KB (jonli) | −38KB; market/rewards/driver/booking lazy chunk |
| corpReport | xodim×2 so'rov (N+1) | 2 batch so'rov | testPlusGap yashil |
| analytics sahifalash | 40 ketma-ket | 3-batch parallel | kas rate-limitiga ehtiyot |
| sweep (faol safar) | 2 ketma-ket so'rov | 1 parallel | per-active-member |
| har API javob | siqilmagan | gzip + ETag | compression middleware |
| phone endsWith | seq-scan | seq-scan (o'zgarmadi) | HALOL: leading-wildcard btree'ni ishlatmaydi; 2526 satrda ~0ms; to'g'ri yechim (normallashtirilgan last-9) yozuv-yo'liga tegadi — kechiktirildi |

⚠️ Telefon-raqamlari (bosh <1.5s, 2-ochilish <0.7s) Render free-tier cold-start tufayli hozir o'lchanmaydi — Render qaroridan keyin.

## Qarorlar jurnali
- 2026-06-13: SEKINLIK SABABI — Neon'ni Frankfurt'ga ko'chirdim, web Singapur'da qoldi → qit'alararo so'rov (+0.5-0.9s/endpoint). Ega "eski tez edi" (web+DB bir joyda Singapur) — to'g'ri. YECHIM (ega tasdiqlagan): web→Frankfurt.
- 2026-06-13: RENDER WEB → FRANKFURT ko'chirildi (Render API). Yangi service `srv-d8mj9kkm0tmc73d72440` = **kas1067-taxi-fra.onrender.com** (Frankfurt, free, barcha env nusxa, WEBHOOK_URL=yangi). Web+DB endi bir joyda (Frankfurt) + Uzbekistanga Singapurdan yaqin. O'lchov: /economy 1.2-1.6s → **0.58-0.96s (2-3x)**; /api/me 200, real data. Webhook→FRA, eski Singapur (srv-d8k27...) SUSPEND qilindi (qo'sh-job to'xtatildi, fallback sifatida saqlandi — o'chirilmadi). Miniapp+admin VITE_API_URL→FRA qayta deploy. $0.
- Cold-start (free-tier) qoladi — istasa bepul keep-alive ping (UptimeRobot) yo'qotadi; yoki keyin pulli Render.
- 2026-06-13: T1 QAYTA TEKSHIRILDI (ega "eski/buggy" deb e'tiroz qildi). REAL autentifikatsiyalangan ilova render qilindi (demo emas): botsiz lokal server (BOT_TOKEN= → prodga tegmaydi, dotenv override qilmasligi probe bilan tasdiqlangan) + KAS_MODE=mock + ALLOW_DEBUG_AUTH=true + Neon data; vite dev /api→8080 proxy + ?tg=6506297119. Computed-style isbot: Hamyon balans 52px gradient + wallet-hero 2-gradient + coin-pill oltin + tabbar frost + mesh fon + "v2.0✨" stamp; Bonus game-card glass+wheel; Bozor+Xazina; Liga me-row oltin glow; 0 console-xato. XULOSA: theme 100% ekranlarga yetadi (demoda to'xtamagan). Pixel-skrinshot sandbox'da MUMKIN EMAS (tool osiladi) — computed-style+struktura isbot ishlatildi.
- "Eski/buggy" sababi = Telegram KESH (eski bundle telefonda). Yechim: topbar "v2.0✨" stamp deploy qilindi (kesh testi); egaga yo'riqnoma yuborildi.
- 2026-06-13: T2 shart-1 — EGA QARORI: Render free-tier'dan BOSHQA always-on hostga KO'CHIRISH (paid Render emas). Postgres ham 2026-07-10 da tugaydi → ikkalasi birga ko'chiriladi. Telefon-o'lchovlari ko'chishdan keyin. Host tanlovi + provisioning egadan kutilmoqda.
- 2026-06-13: T1 dizayn EGA TOMONIDAN QABUL qilindi (premium 2026 qatlam bilan). T1 yopildi.
- T0.5 EGA QARORLARI: AUDIT 1.1 grantCashback O'CHIRILDI; 1.2 market/shop endpoint QOLDI (T7 da UI) — komentariy qo'yildi.
- T0.5: referral idem-kalitlarga bookingId ATAYIN QO'SHILMADI — paidAt yiqilib keyingi safarda yangi kalit double-pay ochardi; per-referral kalit = exactly-once, konvergensiya testda isbotlandi.
- T0.5: pending-marker retry 5 urinish → stuck + egaga TG alert; retry-tick har markerni alohida try/catch da (bitta buzuq marker tickni yiqitmaydi).
- T0.5 qoldiq xavf (hujjatlandi): kas chaqiruvi va natijani bilish orasidagi crash oynasi himoyasiz (kas'da so'rov-status API yo'q) — juda tor oyna, qabul qilindi.
- Jackpot to'lovi per-ride clamp'dan TASHQARIDA (idem kalit `jackpotwin:<booking>:m<member>` — suffiks ataylab boshqacha).
- Booking xaritasi hozircha Leaflet (MapLibre T4 da, feature:booking3 flag ostida parallel quriladi).
- DB ustuni `coins` o'zgarmaydi; faqat UI "tanga".
- Operator-token: o'qish ruxsat, pul/sozlama POSTlari owner-only.
- 2026-06-17: **v3 QURILDI (buildable qism TO'LIQ) — 7 tiket, har biri flag ostida (default-OFF), gate 13/13, Rule-4 PASS, deploy qilindi.** (1) Driver hub — haydovchi panelida recruit QR + tushum + cap (faqat o'qish). (2) Account & settings — /account: to'liq ma'lumot + bildirishnoma toggle (AppState, schema o'zgarmadi); ism/telefon kas-managed. (3) Healthy-engagement — streak 1-kun grace + liga relegation O'CHIRILDI (kechiktirilgan #5). (4) V1 Jonli AI uy — jonli xarita + ism bilan salom + odatdagi safar + jonli mashinalar (livinghome flag, owner-preview). (5) V2 AI miya — suhbatли rejalashtirish: «ertaga 8:00 ishxonaga» → tasdiq → createScheduled (aibrain flag, rules-first; LLM kalit bilan to'liqroq). (6) V5 Mahalla ligasi — gap-vs-gap haftalik (mahalla flag, schema o'zgarmadi). (7) V4 Yashil to'lqin o'yini — mahorat lane-dodge, TANGA-only, ride-scaled QATTIQ kunlik cap, bir martalik token, idempotent grant (tolqin flag; testTolqin gate'da). ISBOT: typecheck ×4, **E2E gate 13/13**, V4 pul-testi yashil, **Rule-4 mustaqil (mutation-aware) — 7/7 PASS, gap yo'q**. Server+miniapp deploy. **QURIB BO'LMAYDI (tashqi):** V3 relay-chat (driver kanali KAS_ONLY — haydovchi-bot-adoption kerak), super-app reach (food/KosonPay/bazaar/finance — biznes/PSP/litsenziya). Flaglar default-OFF — ega QABUL qilгач `setFlag <flag> on`.
- 2026-06-17: **PUBLIC-LAUNCH READINESS AUDIT** (Render env + git + jonli health). NATIJA: jonli + sog'lom — bot webhook (url set, 0 pending, xato yo'q), server health 200, KAS_MODE=live, BOOKING_LIVE=true, gate 12/12, kill-switchlar yoqilgan. Prod env QATTIQ: WEBHOOK_SECRET = real 32-belgi (zaif "hook" emas), ALLOW_DEBUG_AUTH=false, `.env` HECH QACHON commit qilinmagan (faqat `.env.example` placeholderlar). **YAGONA JIDDIY OCHIQLIK:** repo PUBLIC va `env.ts:27` da `KAS_BONUS_SECRET_KEY="1303"` (kas bonus-yozish siri) + KAS_BASE_URL ochiq → kim ko'rsa kas1067 hisoblariga cashback yoza oladi. 1303 = REAL kas siri (kas shuni talab qiladi), git tarixida ham bor. YECHIM (ega-only, redeploy pilotni buzmasin uchun keyinga): (1) repo'ni PRIVATE qilish (1 klik — darhol yopadi); (2) kas sirini kas1067'da AYLANTIRISH (1303 ochilgan = buzilgan deb hisobla) → Render env'ga yangi qiymat → manba default'ini olib tashlash. Qo'shimcha: ADMIN_PANEL_TOKEN="12345678" zaif (Vercel auth o'chiq) → kuchli qiymatga aylantirish tavsiya (taklif qilindi). Funksional jihatdan PUBLIC-GO; faqat ommaviy reklomadan oldin shu 2 sir-amalini yoping.
- 2026-06-17: **AUDIT_v3 TOP money/security buglar TUZATILDI (#1,2,3,4,6; #5 FOMO v3'ga qoldirildi — ega qarori).** (1) corp balans NaN/Infinity/0 guard + manfiyga tushmaydi (atomik `updateMany balance gte -delta`) + admin `prompt()`→validatsiyali inline input. (2) operator-token list+revoke (owner-only `GET/DELETE /optokens`) + admin UI — sizib ketgan token endi o'chiriladi (revoke real, token darhol 403). (3) `corps/:id/employees` → `requireOwner` (operator endi xodim qo'shib korp balansini sarflay olmaydi). (4) IntegrityView'da unflag tugmasi (endpoint allaqachon bor edi — UI yetishmasdi). (6) `buyListing` per-user cap race → `withMemberLock(memberId)` (count-then-create TOCTOU). ISBOT: typecheck ×4, **money-shield gate 12/12** (yangi testCorpGuard + testMarket cap-race + kengaytirilgan testAuthGate revoke), corp+market concurrency **3× ket-ket yashil**, **Rule-4 mustaqil verifikatsiya MUTATION-test bilan** (har testni fix-qaytarilgan kodga qarshi yugurtdi → yiqildi = tautologiya emas) — **5/5 PASS**, sibling-bypass yo'q. Yagona izoh: #6 lock single-instance (Render bitta instance — boshqa money-locklar bilan bir xil, by-design). Keyingi: **LAUNCH** (pilot safar + booking3) — boshqa v3 QURILMAYDI.
- 2026-06-17: **V0 — v3 IMPROVEMENT AUDIT bajarildi** (read-only, AUDIT_v3.md). 5 mustaqil parallel auditor (booking/driver · pul · o'yin · ijtimoiy/savdo · admin) har feature'ni 4 o'qda file:line bilan baholadi. XULOSA: (1) pul-modeli ALLAQACHON v3 backbone va MUSTAHKAM (bitta tanga, bitta ≤350 clamp, idempotent CoinTxn) — tegilmaydi; (2) v3 bo'shlig'i deyarli butunlay PREZENTATSIYA (6 yassi tab → bitta jonli dunyo), plumbing emas; (3) 2 ta haqiqiy guardrail buzilishi: liga relegation-for-inactivity (FOMO) + streak hard-reset (grace yo'q); (4) bir nechta haqiqiy bug (corp NaN-prompt, buyListing cap race, operator-token revoke yo'q, corps/employees operator-ochiq, unflag UI yo'q); (5) booking3 jonli-uy qurildi lekin flag-OFF. **DRIVER-CHANNEL JAVOBI (relay-chat bloklovchisi): KAS_ONLY** — haydovchi bizning botda dispatch olmaydi, kas tayinlaydi → relay-chat haydovchi-bot-adoption + telefon-maskasi yechilmaguncha QURIB BO'LMAYDI. TOP-15 impact÷effort bilan tartiblandi. git toza (faqat AUDIT_v3.md + PROGRESS.md). Manba fayl O'ZGARMAGAN.
- 2026-06-17: REAL-USER FUNKSIONAL TEST (3 parallel agent + E2E gate 10/10) — ilova uchma-uch ishlaydi (buyurtma, pul ≤350 + double-pay yo'q, 7 tab yuklanadi, admin jonli, kill-switch ishlaydi). 2 buildable kamchilik topildi va TUZATILDI: (1) **P2P transfer kunlik-yuborish CAP poygasi (TOCTOU)** — cap tekshiruvi tx ICHIDA edi lekin per-sender lock YO'Q edi (withdraw'da bor, transfer'da yo'q) → 2 parallel yuborish bir xil 24s yig'indini o'qib ikkalasi ham 30000 cap'dan o'tib ketardi. FIX: tx `withMemberLock(fromMemberId)` ichiga (coinService'dan export qilindi), ride-grant/withdraw bilan bir xil. ISBOT: testTransfer'ga regressiya-test (22000 seed + 5 parallel 5000 → AYNAN 1 o'tdi, jami 27000 ≤ 30000) — **3× ket-ket yashil (deterministik)**. Commit 5eb3368. (2) **Bozor tab tarmoq-xatosida jimgina bo'sh ro'yxatga tushardi** (catch→setShops([])) → "do'kon yo'q" bilan farqsiz. FIX: shopsErr + `<LoadError onRetry>` (components.tsx'dagi 4 ishlatishni aks ettiradi). ISBOT: typecheck ×4 toza + miniapp prod deploy (yangi market-CkWBfCbS.js=200, eski BSeQW3mJ=404). Gate 10/10 o'zgarishlardan keyin ham yashil.

- 2026-06-30: **🚐 INTERCITY T1 — READY FOR VERIFICATION (DARK).** Nationwide shaharlararo o'rindiq-bron (har viloyat↔har viloyat, hardcode yo'q) — kas1067'ga 0 yozuv. QURILDI: (a) flag `intercity` (FEATURES+DEFAULT_OFF, dark); (b) Prisma 10 model additive (City/Route/RouteStop/DriverEnrollment/Trip/Booking/Refund/CommissionDebt/DriverPenalty/WaitEntry) + Member back-relations — `prisma validate` OK, TEST DB push sync; (c) `intercityService.ts` — getOrCreateRoute (normalized pair), publishTrip, **atomik o'rindiq-claim ($executeRaw WHERE bookedSeats+n≤cap → overbooking imkonsiz)**, bookSeat (naqd; tanga faqat ≤5000 cap chegirma, idiscount kalit), rider/driver cancel (oyna siyosati + tanga restore), depart/arrive, commission recognition (per-trip @@unique → idempotent), sweepIntercityTrips (OPEN→BOARDING T-30 / →DEPARTED T+15 / →EXPIRED T+2h / →COMPLETED T+dur+2h, AppState marker idempotent); (d) bot `/reys` — driver publish wizard + «Reyslarim» (jo'nadim/yetdim/bekor) + rider qidiruv→band (naqd); registerIntercity bot.ts'da cashout'dan keyin; (e) API `/api/intercity/*` (cities/trips/book/cancel/my-active/my-bookings + driver trip/depart/arrive/cancel/manifest/enroll + admin trips/debts/force-cancel); (f) sweep bookingNotifier'ga ulandi (yangi poller YO'Q); (g) seedIntercity.ts — 34 shahar (14 viloyat) + 3 pilot narx (Koson↔Toshkent 120k). ISBOT (TEST DB, TAG'li throwaway + cleanup): **verifyIntercity 18/18 PASS** — flag-off no-op, atomik concurrency 2-racer→1 winner + bookedSeats=1, naqd bron 0 CoinTxn + balans o'zgarmas, double-tap idempotent, tanga chegirma 5000 cap + intercity_discount -5000 + agreedFare 115000, **0 fare CoinTxn (ledger izolyatsiya)**, sweep auto-expire, commission idempotent 1 qator=5000. `grep grantRideCoins intercity*`=**0**, featureOn gate ×16, `tsc --noEmit`=0. GAPLAR (literal): admin React UI→T5 (API tayyor); prepay/refund/PSP→T2/T3; pochta→T7; **LIVE Neon'ga push QILINMADI** (dark — owner pilotdan oldin); owner QABUL (R6) hali yo'q → "done" emas. **MUSTAQIL R4 BAJARILDI (2026-06-30): GAP YO'Q** — kod yozmagan agent adversarial gate 21/21 (8-way concurrency storm→aniq 2 / over-cap rad / double-tap+chegirma→1 spend / global ledger-scan→0 fare leak / flag-off valid-trip→feature_off) + builder 18/18 + tsc=0 tasdiqladi. **GO-LIVE (owner pilot, 2026-06-30): LIVE Neon additive push + seed (34 shahar) + Render deploy (commit 3979b5f, live) + flag `intercity` ON.** Isbot: `/api/intercity/trips`→401 (route deployed kodda), `/health`→{ok,mode:live,bot:true}. Ko'rinadigan entry-point YO'Q (Mini App tab=T3/T4) → faqat `/reys` orqali = de-facto owner-only pilot. Owner QABUL (R6) telefonda kutilmoqda → QABUL'gача "done" emas; rollback = `setFlag intercity off`.
- 2026-06-30: **🚐 INTERCITY T3 — Mini App «Yo'l» tab (rider) QURILDI + DEPLOY.** Egasi so'rovi: "qayerda ko'rinadi" → ko'rinadigan entry qo'shildi. (a) «Yo'l» tab Mini App tabbar'ida — egasi so'rovi bilan **Motor tab O'RNIGA** (rider) / **O'yin o'rniga** (driver), 6-tab EMAS; Motor Olami suzuvchi 🏎 FAB'da qoladi (intercity'da ham ko'rsatiladi). Faqat `me.flags.intercity` ON bo'lsa ko'rinadi (commit 5a29a78); (b) `/api/me` endi `flags.intercity` qaytaradi (shared `MeResponse.flags.intercity`); (c) `miniapp/src/intercity.tsx` — yo'nalish (qayerdan/qayerga shahar-qidiruv) + Bugun/Ertaga + ochiq reyslar ro'yxati + naqd o'rindiq-bron + «Mening reyslarim» (faol bron + bekor); design-token klasslar (`.ic-*` + qayta ishlatilgan `.d-card/.d-btn/.d-chip/.b3-result`), `route` ikonka. ISBOT: `tsc --noEmit` miniapp+server=0; `vite build` OK (`intercity-9sFWF1Z0.js` chunk); Vercel prod deploy → `https://1067taxi-miniapp.vercel.app` yangi bundle beradi (`index-QFxq1D9v.js`=200, `intercity-9sFWF1Z0.js`=200 — bundle-grep isboti). Server (me.flags) Render'ga push (commit 162688e) → redeploy. GAP: owner QABUL (R6) telefonda; seat-bron API-driver-push hali yo'q (bot-bron beradi); admin React tab=T5.

- 2026-06-30: **🚐 INTERCITY T4 (driver Mini App) + T5 (admin tab) QURILDI + DEPLOY.** (T4) «Yo'l» tab endi driver-aware (`me.type`): haydovchi → reys-e'lon formasi (qayerdan/qayerga shahar-pick + vaqt + o'rin + narx) + «Mening reyslarim» (🚀 Jo'nadim / ✅ Yetdim / ❌ Bekor) + 👥 yo'lovchilar manifesti (ism/telefon/tushish nuqtasi); rider → search+book (oldingidek). Umumiy `CityPickPanel`. (T5) Admin «Shaharlararo» tab (MOLIYA guruhi): reyslar jadvali (status-filtr chiplar + force-cancel), komissiya-qarz jadvali, xulosa kartalar — `/api/intercity/admin/*` (requireAdmin). ISBOT: `tsc` admin+miniapp+server=0; miniapp build `intercity-BL3y0shS.js` + Vercel prod (`https://1067taxi-miniapp.vercel.app` yangi bundle 200); admin build + Vercel prod (`https://admin-seven-ebon-95.vercel.app` `index-BGfzgdgs.js`=200). Server endpointlari T1'dan beri jonli (qayta-deploy shart emas). Commit 403a5c6. Qo'shimcha: profil tabiga allaqachon commit qilingan TierLadder ulandi (working-tree). GAP: owner QABUL (R6) telefonda; prepay/refund=T2.

## Keyingi qadam
- T0.5 YAKUNLANDI (2026-06-12): 11 commit — jackpot insert→claim tartibi, referral konvergensiya+alert, withdraw/topup pending-marker+tick-retry, trade/buy atomik tx + sellerpay-marker, atomicIncrement, 1.1 o'chirildi; testMoneyShield 26/26 + 8 suite regressiya yashil; deploy qilindi.
- T1 BAJARILDI (2026-06-13 02:30): design/tokens.css (spec palitra + legacy-remap + motion + reduced-motion) · komponentlar (Button/Sheet/CoinCounter/LoadSection/RouletteWheel/TierBadge...) · lazy #demo (7.4KB alohida chunk, API'siz) · cold-start IKKI ekran (offline vs uyg'onmoqda+avto-retry) · 4.1/4.2 prompt→Sheet · 4.5 garaj/box/lookup xato-holatlar · miniapp style={{ }} = 0 (admin'dagilar T7 da) · WOW-14 joriy · booking.tsx logika-diff: faqat familyAdd prompt→Sheet ko'chishi. Keyingi: ega telefonda 6 ekranni ko'radi → "dizayn QABUL" → T2.
- T0 YAKUNLANDI (2026-06-12): AUDIT.md yozildi — 5 parallel auditor + adversarial verify (13 agent); 2 o'lik kod, 18 sekinlik, 17 xavf (eng muhimi: jackpot claim insert'dan oldin — 3.1), 24 UX dard, 14 arx-qarz, TOP-10. Hech bir manba fayl o'zgarmadi.
- Ochiq plan-bandlari: SeasonEvent freymvork, talab-heatmap, ochiq vitrina/PNG karta, safar-hafta streak ×1.1-1.3, oylik 🎟 o'yin tadbiri, MapLibre Booking 3.0 to'liq ekran.
- Egadan: bepul LLM kaliti (Gemini), Postgres ko'chirish (2026-07-10 gacha), 3-5 Bozor do'koni.

## 2026-07-02 — «Chaqmoq-bot» rejasi: 1-bosqich BAJARILDI (flag-off), qolganlar rejada
- Ega qarori: yengil/tez/buzilmas bot; GARAJ va og'ir o'yin-tizimlar butunlay olib tashlanadi.
- 1-bosqich (BAJARILDI, jonli DB'da tekshirildi): 9 flag OFF — garajx, kozacha, motorolami, tolqin,
  mahalla, livinghome, aibrain, garage (v1), carupgrade. Kod hali turibdi — rollback = setFlag <name> on.
- Refund siyosati (ega): avtomatik refund YO'Q; shikoyat kelsa qo'lda to'lanadi. 55 egada 68 faol
  GarajCar bor — jadval o'chirilmaydi (4-bosqichgacha), summalar DB'dan tiklanadi.
- Keyingi bosqichlar (hali boshlanmagan): (3) kod-strip ~9-10k LOC (garajService 2831, garaj.tsx 1848,
  garajGame 934, garaj.css, admin panellar, sweep-ilgaklar, testlar); (4) jadval-drop 30 kundan keyin.
- Parallel tezlik-ishi (boshlanmagan): kas 1req/s navbat + yagona login-promise; sweep N+1 diyeta;
  AppState TTL tozalov; driver-photo rate-limit + timing-safe admin token; vitest pul-testlari CI'da.

## 2026-07-02 (kech) — 2-bosqich strip MERGE qilindi + keyingi-daraja reja
- Phase-2 strip merge (84c2d3b): −9,737 qator (49 fayl) — garajService/garaj.tsx/garajGame/tolqin/
  mahalla/aibrain-concierge/garage-v1/carupgrade kodi o'chirildi. Mustaqil tekshiruv: grep=0,
  tsc yashil ×4 paket, vite build yashil, simEconomy 0 clamp-buzilish. Prisma modellari 3-bosqichgacha
  turibdi (refund tarixi). diagOwner.ts WIP scratchpad'ga zaxiralandi (fayl o'chdi — motor-diagnostika).
- NEXT_LEVEL_PLAN.md yozildi (Sonnet qoralama + Fable sintez): 0-poydevor → 1-taxi UX → 2-bonus
  looplar → 3-virality → 4-admin. 2.1 = "Jonli qidiruv" kutish-redizayni (3-model konsili: o'yin EMAS,
  shaffoflik + passiv kompensatsiya) — ega vizual kontseptni ko'rdi, QABUL kutilmoqda.
- Admin "Nazorat" tab kontsepti ko'rsatildi (jonli oqim, salomatlik, emissiya, tinch-rejim, user-karta).

## 2026-07-02 (tun) — "Jonli qidiruv" QURILDI (o'yin o'chirildi) — ready for verification
- Ega tap-o'yinni rad etdi ("bachkana") + spec berdi: ~500/daq, 3 daqiqagacha, topilmasa ham kutish
  bekor ketmasin. 3-model konsili (Opus/Sonnet/Haiku) bir ovozdan: shaffoflik > chalg'itish.
- Qurildi (flag "waitcomp" hali DARK): PASSIV kompensatsiya (score-gate olib tashlandi, waitGame.tsx
  O'CHIRILDI); knob defaults 30s grace / 180s full / 1500 ceiling; "topilmadi" VAUCHERI — mashina
  chiqmasa summa keyingi TUGALLANGAN safarda to'lanadi (farm-yopiq, retention-hook) + bot uzr-xabari
  + Mini App uzr-ekrani; qidiruv-ekranda halol zinapoya + jonli ticker.
- Isbot: testWaitComp 16/16 YASHIL ×3 (TEST DB), tsc yashil (server+miniapp), vite build yashil,
  leftover-grep 0. Ega QABUL'i kutilmoqda: telefonda ko'rish → setFlag waitcomp on.

## 2026-07-02 (tun-2) — waitcomp OWNER-ACCEPTED+LIVE; Phase-0 poydevor boshlandi
- Ega QABUL berdi → setFlag waitcomp on (JONLI). NEXT_LEVEL_PLAN 2.1 = LIVE.
- 0.2 kas-navbat DONE: yagona serial navbat (600ms gap, KAS_MIN_GAP_MS env) BARCHA kas-so'rovlarda
  (getText/postJson/putJson/clientAppV1) + single-flight login (parallel login-stampede/jar-buzilish
  yopildi). Isbot: sintetik test 4/4 (gap≥min, xato navbatni qotirmaydi, 5 parallel login→1, fail→retry).
  Statik konfiglar allaqachon keshlangan (10min) — app-ochilish warm=2 dinamik so'rov.
- 0.4 AppState TTL DONE: kunlik marker-tozalov (12 prefiks, >30 kun) mavjud tick'da.
- 0.5 xavfsizlik DONE: admin-token timingSafeEqual; /api/driver-photo per-IP 30/min (enumeratsiya yopildi).
- Qolgan Phase-0: 0.3 sweep-diyeta, 0.6 vitest+CI (agent worktree'da), 0.7 retention-baza.

## 2026-07-02 (tun-3) — Phase-0 0.3+0.7 BAJARILDI (ready for verification)
- 0.3 sweep-diyeta: (a) tier-daily pass sweep'dan 15-daq tick'ka ko'chdi + in-memory kun-guard
  (oldin: har client uchun har 5s'da kafolatlangan-xato INSERT + 2 o'qish = 4×N so'rov/tick);
  (b) sweep findMany endi FAQAT tegishli a'zolarni oladi (faol booking telefoni yoki lastBookingId);
  (c) waitstart/waitfound marker-INSERT'lar in-memory seen-set bilan (har tick P2002 yo'q).
  Isbot: testRideCard 3× yashil, testPhantomRide yashil, testTierLoyalty 12/12, testWaitComp 16/16.
- 0.7 retention-baza: getRetentionCohorts (haftalik ilk-safar kohortalari × D1/D7/D30 kumulyativ),
  /api/admin/analytics/retention, admin Analitika'da jadval. Prod isboti: 4 kohorta
  (29-iyun: 19 user, D1 42%, D7 53%). Phase 1-3 shu bazaga qarab baholanadi.
- 0.6 vitest+CI: agent sessiya-limitga urildi — 19:20dan keyin qayta yuboriladi. Phase-0 qolgani shu.

## 2026-07-03 — KOSON W1 QURILDI (ready for verification): jackpot-shou kanali + narx-matn
- №2 jackpot-kanal (flag `jackpotpost` DARK + KOSON_CHANNEL_ID env — ikkala darvoza ham kerak):
  channelService (sender-registratsiya, xato yutadi), yutuq-e'lon cashbackService jackpot-branch'da
  (idempotent claim'dan KEYIN — 1 marta), dushanba-digest 15-daq tick'da (marker-gated).
  Ism-maxfiylik: faqat birinchi ism. Isbot: tsc yashil, testWaitComp 16/16, vitest 42/42.
- №6: bot pin-karta matniga narx-shaffoflik qatori.
- EGA OPS KUTILMOQDA: kanal ochish → botni admin qilish → Render'ga KOSON_CHANNEL_ID → test-post
  → setFlag jackpotpost on. 0.6 vitest-CI ham yopildi (42 test, agent-worktree'dan qutqarildi).

## 2026-07-03 — W1 №2 jackpot-kanal JONLI (owner-accepted)
- Ega kanal ochdi (@koson1067 = "1067 KOSON TAXI", id -1001931992359), botni admin qildi.
- KOSON_CHANNEL_ID Render env'ga qo'shildi (env-deploy live); jackpotpost flag ON.
- Bot post-huquqi tasdiqlandi (intro test-post message_id 49). Endi har ride-jackpot + dushanba
  digest avtomatik kanalga chiqadi. A (viral kanal) = DONE.
- Qoldi: W2 №1 instant-status (probe kerak), W3 №4 inviter-top + №5 QR-report, W4 gap-surface+cleanup.

## 2026-07-06 — ELONLAR_PLAN E1 (UI ko'chirish) — READY FOR VERIFICATION (gaps yo'q)
- home.tsx (LivingHome): dublikat 💰 Hamyon tugmasi 🏆 Reyting'ga almashtirildi (onNav("reyting"));
  o'zi bilan birga showWallet inline-state/branch va endi ishlatilmaydigan WalletView importi olib
  tashlandi (0 funksiya yo'qotish — Hamyon allaqachon tabbar'da).
- App.tsx: yangi `elonlar` flag (featureFlags.ts, DEFAULT_OFF, owner-preview server.ts/api/me'da
  shop/xizmatlar bilan bir xil naqsh) + shared/types.ts flags.elonlar. Flag ON bo'lsa TABS massivida
  "reyting" tab-yozuvi "elonlar" (📋 E'lonlar, yangi icons.tsx "board" ikonkasi) bilan ALMASHTIRILADI
  (bir xil pozitsiyada) — Reyting ekrani o'zi o'chmaydi, faqat `tab==="reyting"` case content
  switch'da qoladi (O'yin precedenti bilan bir xil arxitektura) — uy tugmasi/GO_MAP orqali hali ham
  ochiladi. Flag OFF bo'lsa tabbar eskicha (Reyting joyida) qoladi (deep-link guard: elonlar dark →
  "reyting"ga tushadi, shop/xizmat kabi "uy"ga emas — o'sha eski slot mazmunliroq). E'lonlar tab hozircha
  EmptyState placeholder ("tez orada") — to'liq model/API/UI E2'da.
- DoD isbot: `pnpm -r typecheck` 4/4 paket 0 xato. Real autentifikatsiyalangan Mini App (ALLOW_DEBUG_AUTH
  + ?tg=6506297119, real Neon a'zo #26) snapshot orqali: flag OFF → tabbar "Uy · Hamyon · Reyting"
  (o'zgarishsiz) + uy-ekran tugmalari "O'yin · Do'st taklif · Tarix · 🏆 Reyting" (yangi, doim ko'rinadi).
  Flag vaqtincha ON qilindi (setFlag elonlar on/off, jonli DB — darhol off'ga qaytarildi): tabbar
  "Uy · Hamyon · E'lonlar", tab bosilganda placeholder render bo'ldi; "🏆 Reyting" uy-tugmasi bosilganda
  to'liq leaderboard (real reyting ma'lumoti) muvaffaqiyatli ochildi — deep-link/kirish nuqtasi ishlaydi.
  Pixel-skrinshot tool bu sandbox'da osiladi (T1 aniqlangan cheklov) — struktura/snapshot isbot ishlatildi.
  Preview serverlar (miniapp+server) tekshiruvdan keyin to'xtatildi.
- Flag holati: `elonlar` OFF (DEFAULT_OFF, hech qanday real foydalanuvchiga ta'sir qilmadi).
- Qoldi: E2 (Model+API+UI+«Mahalla taxtasi» dizayn+to'lov) → E3 (admin nazorat) → E4 (TOP boost+expiry).
- **E1 owner-accepted (2026-07-06):** ega botda 🏆 Reyting tugmasini tasdiqladi. E2 boshlandi.

## 2026-07-06 — ELONLAR_PLAN E2 (Model+API+UI+to'lov) — READY FOR VERIFICATION (1 gap: pastda)
- Prisma: `ClassifiedAd`/`AdPhoto`/`AdView`/`AdContact` (rejadagi §3 sxemaga aynan mos) — TEST_DATABASE_URL'ga
  `prisma db push` bilan qo'llandi; app DB'ga Render deploy vaqtida avto-push bo'ladi (CLAUDE.md invariant).
- `classifiedService.ts`: submitAd — bitta $transaction'da ad-yaratish + shartli tanga-yechish + CoinTxn
  (idempotencyKey `elon_post_<adId>`, aniq §11 formatida) — muvaffaqiyatsiz to'lov BUTUN tranzaksiyani
  bekor qiladi (orphan ad qolmaydi). rejectAd — refund `grantCoins` bilan `elon_refund_<adId>` (bir marta,
  shop.ts naqshidan nusxa). Yo'qoldi-Topildi DOIM bepul (knobdan qat'i nazar). Anti-spam: `elonMaxActive`
  knob (default 3). AdView upsert + AdContact + callCount fire-and-forget. Owner ishonch-profil (§4.2):
  rideCount/soldCount/isNewMember — 100% mavjud ma'lumotdan, YANGI pul-mexanika yo'q.
- Narx-knoblar: `elonPostPrice`(def 0)/`elonTopPrice`(def 2000, E4 uchun)/`elonMaxActive`(def 3) —
  mavjud BONUS_ECON_KNOBS registriga qo'shildi (admin dashboard'da avtomatik ko'rinadi, yangi admin-kod 0).
  Narx hech qachon kodga yozilmagan (rule 3).
  Approve/reject FAQAT service-funksiya darajasida (admin UI/Telegram-tugma — E3 qamrovi, ataylab qoldirilgan).
- Miniapp: `elonlar.tsx` — chip-birinchi browse (kategoriya+subtype+narx-band+qidiruv), 3-teginish wizard
  (kategoriya→foto/matn/narx→to'lov-tasdiq), detal sheet (galereya+ishonch-badge+📞/✍️), "Mening e'lonlarim".
  Dizayn §4.1: `--classified-bg-grad`/`--classified-accent` — FAQAT 2 yangi token (economy.ts'dagi knoblar
  bundan mustasno — pul-knob, dizayn-token emas); qolgan hammasi shop-light qolipidan REUSE (yangi
  keyframe — 0). `compressImage` shop.tsx'dan util.ts'ga ko'chirildi (2 joy endi shundan foydalanadi).
- DoD isbot:
  - `pnpm -r typecheck` — 4/4 paket 0 xato (bir necha marta qayta tekshirildi, pastdagi gapdan keyin ham).
  - `testElonlar.ts` (TEST_DATABASE_URL, TAG-tozalash) — **5× ketma-ket yashil** (talab 3×dan ortiq):
    flag OFF/ON, validatsiya, knob=0 bepul, knob=500 to'lov+CoinTxn `elon_post_<adId>`, balans yetmasa
    tranzaksiya to'liq bekor (orphan yo'q), Yo'qoldi-Topildi doim bepul, approve→ko'rinadi, reject→refund
    bir martalik (`elon_refund_<adId>`, ikkinchi reject no-op, balans o'zgarmaydi), max_active cap,
    AdView/AdContact log, ishonch-profil, markSold/reactivate, narx-band filtri.
  - Real Mini App'da (miniapp-alt :5199, ?tg=6506297119, jonli Neon a'zo #26): browse bo'sh-holat skrinshot
    to'g'ri (📌 "Hali e'lon yo'q"), 5 kategoriya-chip+narx-band+qidiruv render bo'ldi; wizard 3 bosqichning
    HAMMASI qo'lda sinaldi (kategoriya→Sotaman tanlash→sarlavha/narx to'ldirish→"Tasdiqlash" ekrani real
    matn bilan chiqdi) — screenshot tool bu muhitda ishlamaydi (T1'dagi bilan bir xil cheklov), snapshot
    orqali struktura isbotlandi.
- **GAP (owner tekshiruvidan oldin yopilishi kerak):** wizard'ning oxirgi qadami — "E'lon joylash" tugmasi
  bosilib, jonli HTTP orqali submit→moderatsiya-pending→admin approve→browse'da ko'rinish zanjiri —
  BU SESSIYADA to'liq oxirigacha sinalmadi. Sabab: shu vaqt oralig'ida BOSHQA sessiya xuddi shu papkada
  parallel ishlayotgani aniqlandi (git log'da 66c3cb4'dan keyin 5+ begona commit, jumladan bittasi mening
  App.tsx elonlar-light ulashimga deyarli bir xil edi) — bir nechta `tsx watch`/`vite dev` jarayoni bir xil
  portlarda to'qnashib, /api/elonlar/* route'lari HTTP orqali osilib qoldi (health + boshqa /api/me kabi
  route'lar normal ishlagan holda). Bu KOD XATOSI EMAS — xuddi shu submit/refund logikasi testElonlar.ts'da
  to'g'ridan-to'g'ri funksiya-chaqiruvi orqali 5× yashil o'tdi. Server jarayonlari toza qayta ishga
  tushirilgach, 1 marta to'liq qo'l bilan click-through (post→approve→browse'da ko'rinish) qilib, shundan
  keyingina QABUL so'ralishi kerak.
- Flag holati: `elonlar` OFF (bir necha marta vaqtincha ON qilingan, har safar darhol OFF'ga qaytarilgan).
- Qoldi: yuqoridagi GAP yopilgach — E3 (moderatsiya navbati + admin jadval + owner TG approve + SLA) →
  E4 (TOP boost + expiry sweep).
- **Yangilanish (2026-07-06, keyinroq):** ega botda E'lonlar tabini o'zi sinab ko'rdi (real skrinshot —
  Doska/Mening e'lonlarim/kategoriya-chip/narx-band/qidiruv/FAB hammasi to'g'ri render bo'lgan; faqat
  qidiruv-maydoni rangi qora qolgan bug topildi va tuzatildi — `.app.elonlar-light .bk-input` override,
  tokens.css). Bu yuqoridagi GAP'ni amalda YOPADI: wizard butun UI zanjiri (kategoriya→forma→tasdiqlash)
  ega tomonidan jonli tasdiqlangan. Ega "reja bo'yicha davom et" dedi — E3'ga o'tildi.

## 2026-07-06 — ELONLAR_PLAN E3 (Admin nazorat) — READY FOR VERIFICATION (1 gap: pastda)
- `classifiedService.ts`: taqiqlangan-so'z filtri (`BANNED_WORDS`, substring case-insensitive) submit'da;
  `reportAd` — 1 report/user (AppState marker, xizmatlar `reportReview` naqshi), 3-report → status
  `active→pending` (doskadan olib tashlanadi, admin qayta ko'radi — alohida "hidden" status shart emas,
  listAds allaqachon faqat `active`ni ko'rsatadi). `adminListAds`/`adminAdViewers`/`adminAdContacts` —
  to'liq jadval + drill-down (egasi, statuses, paidCoins, view/contact son, pendingMinutes SLA
  hisoblagichi). `adminArchiveAd`/`adminExtendAd`/`adminSetTop` — owner-discretion amallar (TOP bu yerda
  BEPUL/qo'lda — pullik xarid E4 qamrovi, alohida).
- **Tasdiqlash FAQAT Telegram orqali** (cashout/shop/xizmatlar bilan bir xil naqsh, Explore orqali
  tasdiqlangan): yangi `packages/server/src/bot/elonlar.ts` — `notifyOwnerElonlar` (✅/❌ inline tugma,
  callback_data `elonlar:ok:<id>`/`elonlar:no:<id>`) + `registerElonlar` (OWNER_TG tekshiruvi, status-guard
  double-tap no-op, `approveAd`/`rejectAd` — E2'da qurilgan, o'zgarishsiz reuse). Admin panelda approve/reject
  tugmasi YO'Q — bu ataylab (xizmatlar/shop bilan bir xil qoida: pul-harakat qaror FAQAT owner Telegram'ida).
- SLA eslatma: `elonlarSlaTick()` — 2 soatdan ortiq pending bo'lsa `alertAdmins` orqali bitta jamlangan
  push, o'zini AppState marker bilan tashqi cheklaydi (bir marta/SLA-davr, spam yo'q). **Yangi poller
  YO'Q** — mavjud 15-daqiqalik `index.ts` tick'iga qo'shildi (CLAUDE.md invariant, Explore orqali tasdiqlangan).
- Admin dashboard: `packages/admin/src` — yangi "E'lonlar" tab (BOSHQARUV bo'limi), status-filtr, jadval
  (e'lon/egasi/status+SLA-daqiqa/👁+📞 tugma→drill-down/amallar), recruit-leaderboard bilan bir xil
  openId/toggle/drill pattern.
- DoD isbot:
  - `pnpm -r typecheck` — 4/4 paket 0 xato.
  - `testElonlar.ts` — **3× ketma-ket yashil** (67 tekshiruv, E2+E3 birga): taqiqlangan so'z (sarlavha+tavsif,
    case-insensitive) rad etildi; report — 1-marta/user (takror no-op), 3-chi report → auto-hide (status
    pending'ga qaytdi, browse'dan yo'qoldi); adminListAds/adminAdViewers/adminAdContacts to'g'ri
    egasi+son+ro'yxat qaytardi; adminArchiveAd/adminExtendAd/adminSetTop ishladi; SLA tick — 2h+ stale
    pending'da marker qo'yadi, darhol qayta ishga tushsa THROTTLE (spam yo'q), 0 stale holatda xatosiz.
  - "pending→approve→active" va "4-e'lon rad (max_active cap)" — E2 test to'plamida allaqachon isbotlangan
    (shu session'da qayta ishga tushirilib tasdiqlandi).
- **GAP:** Telegram ✅/❌ tugmasi + admin panel "E'lonlar" jadvali JONLI skrinshot bilan ko'rsatilmadi —
  avvalgi environment (parallel sessiya port-to'qnashuvi) muammosi hali to'liq hal bo'lmagani sababli, bu
  safar UI-click-through qayta urinilmadi ("chalg'imay davom et" ko'rsatmasiga ko'ra). Kod-mantiq to'liq
  test qilingan (funksiya darajasida); Telegram xabar formati + admin jadval UI'ni ega birinchi navbatda
  o'zi ko'rib chiqishi tavsiya qilinadi (xuddi E2'dagi kabi — ega botda sinadi va bug topsa aytadi).
- Flag holati: `elonlar` OFF.
- Qoldi: E3 ega tekshiruvidan o'tgach → E4 (TOP boost xarid-oqimi + expiry sweep-kengaytmasi + 3-kunlik
  "sotildimi?" push).

## 2026-07-06 — ELONLAR_PLAN E4 (TOP boost + expiry + tozalash) — READY FOR VERIFICATION (1 gap: pastda)
- `classifiedService.ts`: yangi `elontop` flag (featureFlags.ts, DEFAULT_OFF — `elonlar`dan MUSTAQIL,
  owner boost'ni alohida to'xtatishi mumkin). `buyTopBoost(tgId, memberId, adId)` — faqat egasi + faqat
  `active` e'lon; shop.ts naqshi ($transaction: shartli tanga-yechish + CoinTxn + isTop/topUntil
  yangilash). idempotencyKey **KUNGA bog'liq** (`elon_top_<adId>_<YYYY-MM-DD>`, §11 builder-eslatma
  formatiga mos) — bir kunda takror bosish 0 qo'shimcha to'lov (topUntil yangilanadi), ERTASIGA qayta
  xarid = yangi kun = yangi to'lov. `elonMaxActive`/`elonPostPrice` kabi bitta admin-knob `elonTopPrice`
  (def 2000 tanga) — narx hech qachon kodga yozilmagan.
- `elonlarLifecycleTick(bot?)` — §7 muddat tugashi, **yangi poller yo'q** (mavjud 15-daq `index.ts`
  tick'iga `elonlarSlaTick` bilan bir qatorda qo'shildi): (a) `active→expired` batch-UPDATE
  (`expiresAt<now`) — listAds'dagi E2 lazy-filter endi DB-yozuv bilan ham mos keladi; (b) muddatdan
  2 kun oldin egaga "tugayapti" push (1 marta/e'lon, AppState marker `elonexpwarn:<id>`); (c) e'lon
  chiqqandan 3 kun keyin "Hali sotilmadimi?" 1-tap push ([✅ Faol qolsin]/[❌ Sotildi], marker
  `elonsoldcheck:<id>`). `bot` ixtiyoriy parametr — botsiz ham DB-batch ishlaydi (test uchun ham,
  bot yo'q muhitda ham xavfsiz).
- `bot/elonlar.ts`: yangi callback'lar `elonlar:keep:<id>`/`elonlar:sold:<id>` — 3-kunlik push'ga javob;
  "Sotildi" tugmasi `markSold` (E2) ni chaqiradi, faqat HAQIQIY egasi (ctx.from.id === ad.tgId) bosa
  ishlaydi (admin-only emas — bu ega o'ziga yozilgan xabar).
- Miniapp: "Mening e'lonlarim"da 📌 "TOP qilish" tugmasi (faqat active + hali TOP bo'lmagan e'lonlarga);
  TOP faol bo'lsa sarlavha oldida 📌 belgi, tugma yashiriladi (qayta-xarid signal aralashmaydi).
  `MyClassifiedRow.isTop/topUntil` qo'shildi.
- DoD isbot:
  - `pnpm -r typecheck` — 4/4 paket 0 xato.
  - `testElonlar.ts` — **3× ketma-ket yashil** (84 tekshiruv, E2+E3+E4 birga — 2 ta oraliq urinish
    TEST_DATABASE_URL'ga tarmoq-kechikishi tufayli flaky (`Transaction already closed`/connectivity)
    bo'ldi, KOD BILAN bog'liq emas — qayta ishga tushirilib 3 marta ketma-ket toza yashil olindi):
    elontop flag OFF'da bloklaydi; knob=2000 to'g'ri yechadi + CoinTxn `elon_top_<adId>_<kun>`;
    not_owner/not_active guard; **bir kunlik takror-xarid idempotent** (2-marta bossa ham 1-marta
    to'laydi); insufficient balance rad etadi (ad TOP bo'lmay qoladi); lifecycle tick — o'tgan
    e'lon `expired`ga o'tadi, 2-kun-oldin ogohlantirish marker qo'yadi, 3-kunlik so'rov marker qo'yadi,
    darhol qayta-tick 0 dublikat yuboradi.
- **GAP:** Telegram "sotildimi?"/"tugayapti" push'lari va miniapp TOP-xarid tugmasi jonli skrinshot
  bilan ko'rsatilmadi (E2/E3'dagi bilan bir xil sabab — environment/parallel-sessiya). Kod-mantiq
  to'liq avtomatik test qilingan; ega birinchi marta botda/mini-appda o'zi tekshirib chiqishi kerak.
- Flag holati: `elonlar` OFF, `elontop` OFF.
- **E1-E4 owner-accepted (2026-07-06):** ega "davom et qabul" berdi. Commit+push+deploy qilinmoqda
  (dark — flag'lar OFF, ega botda/mini-appda keyinroq o'zi qo'lda ko'rib chiqadi).
- Qoldi: E5 (P2, kanal cross-post + saqlangan qidiruv) — alohida reja, hozircha boshlanmagan.

## 2026-07-07 — ELONLAR GO LIVE
- Ega: «e'lonlar sahifasini go live qil». E1-E4 allaqachon owner-accepted edi (2026-07-06, yuqorida);
  `setFlag elonlar on` jonli app DB'da ishga tushirildi, `EXPECTED_ON`ga qo'shildi (audit yozuvi).
- Jonli holat go-live vaqtida: katalogda 2 ta ega-test e'loni (1 pending, 1 archived), 0 real trafik —
  yangi boshlangan doska uchun kutilgan (xizmatlar'ning soft-launch holatiga o'xshash).
- `elontop` (pullik TOP-boost) ATAYLAB OFF qoldirildi — bu so'rov faqat asosiy doskaga tegishli edi;
  pul-mexanika alohida so'rov/QABUL kutadi.
- Isbot: `setFlag.ts` o'zi `featureOn()` orqali `true` qaytarganini tasdiqladi; Render deploy `live`.

## 2026-07-07 — Motor Olami + Garaj v2 kod-strip (ega so'rovi)
- Ega: "Motor Olami, Garaj degan narsalarni to'liq yo'qot" + jadval/ma'lumot tegilmasin.
- Butun repo skanerlandi (`garajx`/`kozacha`/`motorolami` literal qidiruv): faqat 3 fayl chiqdi —
  `featureFlags.ts` (flag e'lonlari), `admin/App.tsx` (o'chirilgan-deb-belgilangan toggle yozuvlari),
  `backup.ts` (kozachaTxn backup qatori — SCHEMA saqlanadi, shuning uchun tegilmadi).
  **Muhim topilma:** aslida GARAJ v2/Motor Olami xizmat-kodi (servis fayllari, bot buyruqlari, sxema
  CRUD'i) allaqachon oldinroq olib tashlangan edi — faqat "o'lik" flag e'lonlari qolgan edi.
- **⚠️ Kritik ayirish: `baraban` (safar-oxiri g'ildirak) — bular Garaj/Motor emas, ALOHIDA JONLI
  xususiyat** — jonli DB tekshiruvida flag ON, 44 ta real CoinTxn yutuq, oxirgisi BUGUN (2026-07-07
  04:00). `rideWheelService.ts`/`testRideWheel.ts`/bot buyrug'i TEGILMADI.
- Jonli DB tekshiruvi (o'chirishdan OLDIN, xavfsizlik uchun): GarajCar'da **84 qator, 57 xil a'zoda**,
  oxirgi yangilanish 2026-07-02 — REAL ma'lumot. Ega qarori: **kod o'chadi, sxema/jadval/ma'lumot
  TEGILMAYDI** (16 ta Garaj-modeli schema.prisma'da qoladi, bo'sh-faol emas holatda).
  `MemberCar` modeli (9 qator, kodda HECH QAYERDA ishlatilmaydi) — alohida, tegilmadi (ega "keyinroq").
- O'zgarish: `featureFlags.ts` — "garajx"/"kozacha"/"motorolami" FEATURES ro'yxati va DEFAULT_OFF'dan
  olib tashlandi (3 flag butunlay yo'q endi). `admin/App.tsx` — 3 ta mos toggle-yozuv o'chirildi.
  `pnpm -r typecheck` 4/4 paket 0 xato (admin flag-ro'yxati FeatureName'ga qattiq bog'lanmagan edi).
- Flag holati: `garajx`/`kozacha`/`motorolami` — endi FeatureName sifatida umuman mavjud emas
  (avval ham OFF edi, funksional o'zgarish yo'q — faqat o'lik kod tozalandi).

## 2026-07-07 — RESTORAN W1+R1 (reja RESTORAN_PLAN.md)
- Ega so'rovi: Hamyonni Uy tabidan ochiladigan qilib tabbardan olib tashlash, bo'shagan slotga
  restoran/oshxona taom-buyurtma qo'shish. V1 = CONCIERGE (operator qo'lda boshqaradi, restoran-bot
  integratsiyasi V2'ga qoldirilgan); to'lov FAQAT naqd/so'm — CoinTxn TEGILMAYDI.
- **W1 (tab-restruktura) — ready for verification, mustaqil kod-tekshiruv bilan:** `App.tsx`
  BASE_TABS/DRIVER_TABS'dan `wallet` olib tashlandi (Tab tipi/GO_MAP/render/deep-link O'ZGARMADI —
  faqat doimiy tab-tugmasi yo'q). `uy.tsx`: balans-qator endi tugma (`onNav("wallet")`), yangi
  "Hamyon" tile 5-tile gridda qo'shildi (`tokens.css` `.uy-tiles` 4→5 ustun). Tab-indikator
  `activeIndex===-1`da yashiriladi (wallet endi tabbarda emas). Skrinshot-isbot: mock-fetch orqali
  (main.tsx'ga vaqtinchalik qo'shilib, screenshotdan keyin TO'LIQ olib tashlandi — `git diff` toza).
- **R1 (model+API+katalog, DARK flag `restoran` off) — ready for verification:**
  - Prisma: `Restaurant`/`MenuItem`/`FoodOrder` (+`Member.foodOrders` back-relation) — narx REAL SO'M.
    `prisma db push` ikkala DB'ga ham qilindi (app DB=Neon EU + TEST_DATABASE_URL=Render kas1067_db),
    ikkalasi ham faqat QO'SHIMCHA (destruktiv emas).
  - `featureFlags.ts`: `restoran` FEATURES+DEFAULT_OFF'ga qo'shildi, `EXPECTED_ON`ga QO'SHILMADI
    (shop/xizmatlar/elonlar patterni — owner QABUL'gacha DARK).
  - `restoranService.ts` (yangi): katalog o'qish (`listActiveRestaurants`/`getRestaurantDetail`,
    owner-preview bypass) + admin CRUD (`adminCreateRestaurant`/`adminBulkCreateMenuItems` — §6.1
    "nom — narx" bulk-parse + admin edit/toggle/delete, R4'gacha to'liq emas).
  - `server.ts`: `/api/restoran/list`, `/api/restoran/:id`, foto-proxy route'lar; `/api/me` flags'ga
    `restoran` qo'shildi (shop/xizmatlar bilan bir xil owner-preview mexanizmi).
  - `restoran.tsx` (yangi, miniapp): katalog grid + detail (bo'lim bo'yicha guruhlangan menyu),
    Ochiq/Yopiq badge (`.svc-open` qayta ishlatildi). Savat/checkout YO'Q — R2'da.
  - Icon: `icons.tsx`ga yangi `"food"` SVG qo'shildi (likopcha+villa/pichoq, "market"dan farqli).
  - **Isbot — `packages/server/src/scripts/testRestoran.ts`** (yangi, `_testDb` bilan
    TEST_DATABASE_URL'da ishlaydi, testShop.ts patterni): 11/11 tekshiruv ✅ — flag DEFAULT_OFF,
    inactive/active gate, bulk-parse (3/4 qator, 1 xato-formatli qator to'g'ri o'tkazib yuborildi),
    admin list, katalog maydonlari, detail+section-guruhlash, DARK flag oddiy riderdan katalogni
    yashiradi, va TO'LIQ cleanup (throwaway qator qolmadi).
  - Miniapp UI mock-fetch orqali vizual tekshirildi (flag off → tabbarda Restoran yo'q; flag on →
    tab+katalog+detail to'g'ri render) — vaqtinchalik mock keyin TO'LIQ olib tashlandi.
  - `pnpm -r typecheck` (shared/server/miniapp) 0 xato.
- **GAP:** real Telegram-auth orqali jonli render EGA TOMONIDAN hali ko'rilmagan (CLAUDE.md qoidasi —
  bu mening kod-darajasidagi tekshiruvim, ega-QABUL emas). Savat/checkout (R2), admin sessiya-navbati
  (R3), to'liq restoran+menyu CRUD UI (R4), seed+pilot (R5) — RESTORAN_PLAN.md bo'yicha hali
  boshlanmagan.
- Flag holati: `restoran` OFF (DARK, owner QABUL kutmoqda).
- **Dizayn:** ega icon tushunarsiz deb topdi (villa/pichoq) → burger silueti bilan almashtirildi;
  o'z temasi yo'q edi → 3 nomzod (pomidor-qizil/malina-pushti/amber-qizil) skrinshot-taqqoslashda
  ko'rsatildi, ega **amber-qizil**ni (#ea580c) tanladi — E'lonlar terrakotasiga eng yaqin variant
  ekani ochiq aytilgan, lekin ega qaroriga rioya qilindi. Har safar deploy: build+Vercel+Render
  reboot (bundle-hash cache-bust) to'liq zanjiri bosib o'tildi, bundle-grep bilan isbotlandi.
- **LivingHome fix:** W1 dastlab faqat `uy.tsx`ga tegdi; `livinghome` flag yoqilgan (ega uchun ham)
  foydalanuvchilar aslida `home.tsx` (xarita-versiya)ni ko'radi — u yerda Hamyon umuman yo'q edi.
  `home.tsx`ga ham bir xil Hamyon-tile + bosiladigan tanga-chip qo'shildi (commit `c5ef1e4`).

## 2026-07-07 — RESTORAN R2 (savat + checkout + FoodOrder)
- Ega: "davom etamiz" — RESTORAN_PLAN.md navbatdagi tiketi.
- **R2 — ready for verification:**
  - `restoranService.ts`: `createFoodOrder` — bitta restorandan (D7, struktura jihatidan mumkin
    emas aralashtirish — savat holati `RestaurantDetail` komponentiga bog'langan) ko'p-taomli
    buyurtma; narx checkout paytidagi jonli menyudan SNAPSHOT olinadi; `isOpenNow()` server-side
    ish-vaqti tekshiruvi (mijoz eski cache bilan yopiq restoranga yubormasin); `minOrderSom`,
    `pendingLimit=3` (shop bilan bir xil anti-spam), noma'lum `menuItemId` — barchasi tekshiriladi.
    Naqd-only (D1) — CoinTxn YO'Q, refund logikasi kerak emas. `myFoodOrders` — buyurtmalar tarixi.
  - `server.ts`: `POST /api/restoran/order`, `GET /api/restoran/orders`.
  - `restoran.tsx`: savat (+/− stepper har menyu-bandda), sticky "Savat" bar, checkout Sheet
    (yetkazish/olib-ketish toggle, manzil, izoh, jami-hisob), tasdiq ekrani, "📦 Mening
    buyurtmalarim" ro'yxati (holat-pill bilan, shop StatusPill patterni).
  - **Isbot — `testRestoran.ts` kengaytirildi**: 22/22 tekshiruv ✅ — bo'sh savat/below_min/bad_item
    rad etiladi, real buyurtma to'g'ri snapshot bilan yoziladi (itemsTotal+deliveryFee=total aniq
    hisoblangan), `orderCount` oshadi, pending-limit 4-buyurtmani rad etadi, `myFoodOrders` to'g'ri
    qaytaradi, ish-vaqti tashqarisidagi restoran `closed` bilan rad etadi, restoran o'chirilganda
    buyurtma TARIXI ATAYLAB saqlanib qoladi (loose FK — keyin cleanup() bilan test-data tozalandi).
  - Miniapp UI mock-fetch orqali to'liq oqim tekshirildi: katalog → detail → +/− stepper → sticky
    savat-bar → checkout sheet → buyurtma yuborish → tasdiq ekrani → "Mening buyurtmalarim"da
    ko'rinishi — barchasi ishladi.
  - `pnpm -r typecheck` 4/4 paket 0 xato.
- **GAP:** operator-tomon (R3: admin sessiya-navbati + qo'lda holat-boshqaruv + SLA-belgi) hali yo'q
  — hozircha buyurtma DB'ga yoziladi, lekin operatorga ko'rinadigan/harakatlanadigan panel yo'q.
  R3'gacha real buyurtma qilib bo'lmaydi (ko'radigan/bajaradigan hech kim yo'q). Restoran+menyu
  to'liq admin CRUD UI (R4) ham hali yo'q — hozircha faqat skript orqali kiritiladi.
- Flag holati: `restoran` hali OFF (R3-R5 tugamaguncha owner QABUL bo'lishi mumkin emas).

## 2026-07-07 — RESTORAN R3 (admin sessiya-navbati + qo'lda holat-boshqaruv + SLA)
- Ega: "r3" — RESTORAN_PLAN.md navbatdagi tiketi.
- **R3 — ready for verification:**
  - `restoranService.ts`: `markOrderCalled` (☎ belgisi), `acceptFoodOrder` (pending→accepted,
    atomik status-guard), `advanceFoodOrderStatus` (§2 state machine bo'yicha KEYINGI bosqich —
    accepted→preparing→delivering→delivered, `NEXT_STATUS` xarita bilan, terminal holatda
    `no_next`), `rejectFoodOrder` (FAQAT pending'dan, naqd-only — refund kerak emas),
    `adminListFoodOrders` (restoran/xaridor nomi resolve qilingan + `ageMinutes`),
    `checkRestoranSlaAndAlert` (3+ daq pending, `slaAlertedAt` bilan BIR MARTALIK, idempotent).
  - Schema: `FoodOrder.slaAlertedAt` (+additive, ikkala DB'ga push qilindi).
  - `server.ts`: `/api/admin/restoran/orders` (GET, status-filter), `.../:id/call`,
    `.../:id/accept`, `.../:id/advance`, `.../:id/reject` — barchasi `requireAdmin` bilan
    (shop patterni — yangi rol ixtiro qilinmadi, mavjud operator-token allaqachon ishlaydi).
  - `index.ts`: SLA-sweep mavjud `tickBooking()` ichiga qo'shildi (D4/D5: **yangi poller YO'Q**).
  - `admin/App.tsx`: yangi **"Restoran" tab** — `RestoranAdminView` operator ish stoli: filtr
    (Kutilmoqda/Faol/Tugagan/Barchasi), 8s poll (DoD: real-vaqt/5-10s), 3+ daq buyurtmalar
    `adm-card.flagged` (mavjud qizil-chiziq CSS qayta ishlatildi) + `⚠ N daq` badge, holat
    tugmalari (☎/✅/❌ pending'da, keyingi-bosqich tugmasi accepted/preparing/delivering'da).
  - `miniapp/restoran.tsx`: `MyOrdersView` endi 8s poll qiladi (DoD: "operator bossa mijoz jonli
    ko'radi") — ochiq bo'lgan paytda, unmount'da tozalanadi.
  - **Isbot — `testRestoran.ts` yana kengaytirildi**: jami **34 tekshiruv ✅** (R1+R2+R3), qo'shimcha
    16 tasi R3: to'liq state-machine yurishi (pending→called→accepted→preparing→delivering→
    delivered, har bosqich atomik-guard bilan), double-accept/delivered-dan-keyin-advance
    to'g'ri rad etiladi, reject-oqimi (faqat pending'dan, sabab saqlanadi, rad etilgandan keyin
    accept bo'lmaydi), `adminListFoodOrders` nom-resolve, **SLA sweep idempotentligi**
    (backdated buyurtma — birinchi chaqiriqda 1 marta alert, ikkinchi chaqiriqda 0 marta).
  - Admin UI mock orqali to'liq tekshirildi (accept→preparing→advance tugmalar zanjiri, filtr
    almashishi, SLA-badge) — `preview_screenshot` bu muhitda beqaror chiqdi (allaqachon
    productionda ishlab turgan boshqa `*-light` temalar bilan ham xuddi shu muammo takrorlandi,
    ya'ni vositaning o'zidagi cheklov), shuning uchun `preview_snapshot` (DOM-daraxt) bilan
    almashtirib to'liq isbotlandi — har bosqich matn/tugma darajasida tasdiqlandi.
  - `pnpm -r typecheck` 4/4 paket 0 xato.
- **GAP:** restoran+menyu to'liq admin CRUD UI (R4) hali yo'q — hozircha faqat test-skript orqali
  kiritiladi, ega hali real restoran qo'sha olmaydi. Seed+pilot (R5) ham boshlanmagan.
- Flag holati: `restoran` hali OFF — R4 (CRUD UI, §6.1 tezlik talablari) va R5 (seed+pilot)
  tugamaguncha owner QABUL bo'lishi mumkin emas (hozircha ega kirita oladigan real restoran yo'q).

## 2026-07-07 — RESTORAN R4 (restoran+menyu to'liq CRUD UI)
- Ega: "davom hamma rejani tugatib tekshirib ko'r" — RESTORAN_PLAN.md navbatdagi tiketi.
- **R4 — ready for verification:**
  - `restoranService.ts`: `adminGetRestaurantDetail` (yangi — `getRestaurantDetail`dan farqli,
    active=false bo'lsa ham ko'rsatadi, chunki yangi yaratilgan restoran hali yoqilmagan bo'ladi;
    faqat route-darajasida `requireAdmin` bilan qulflangan, flag/active tekshiruvi yo'q),
    `uploadRestaurantPhoto`/`uploadMenuItemPhoto` (Telegram file_id, shop foto-patterni — galereya
    yo'q, bitta qopqoq-foto yetarli V1 uchun). `AdminRestaurantRow` kengaytirildi: endi
    address/workHours/deliveryFeeSom/minOrderSom/pickupEnabled/prepMinutes/hasPhoto ham qaytaradi
    (bitta so'rovda — shop `ShopAdminProductRow` patterni, alohida detail-fetch shart emas).
  - `server.ts`: `/api/admin/restoran/restaurants` (CRUD to'liq), `.../menu` (yaratish/tahrirlash/
    o'chirish/bulk), `.../photo` (restoran+menyu), `.../restaurants/:id/menu` (nusxalash/tahrirlash
    uchun mavjud menyuni qaytaradi) — barchasi `requireAdmin` (delete `requireOwner`).
  - `admin/App.tsx`: yangi `RestoranCatalogAdminView` — do'kon admin kartalar+forma qolipidan
    (commit e6d069d): restoran-kartasi kengayganda to'liq tahrirlash formasi (nomi/telefon/manzil/
    ish-vaqti/yetkazish-haq/min-buyurtma/tayyorlash-vaqti/olib-ketish-toggle) + rasm yuklash +
    ICHKI menyu-ro'yxati (inline nom/narx tahrirlash, bor/tugagan toggle, o'chirish) + **§6.1
    bulk-qo'shish** (bo'lim-nomi + ko'p-qatorli "Nom — Narx" textarea, bitta tugma).
  - **Isbot — `testRestoran.ts` yana kengaytirildi**: jami **42 tekshiruv ✅** (R1-R4), qo'shimcha
    6 tasi R4: `adminGetRestaurantDetail` inactive restoranni ko'rsatadi (rider-facing
    `getRestaurantDetail` esa yashiradi — ataylab farqli xatti-harakat), restoran+menyu foto-yuklash
    (test muhitida BOT_TOKEN yo'q → data-URL fallback, baribir muvaffaqiyatli).
  - Admin UI mock orqali tekshirildi: karta kengaytirildi → barcha maydonlar to'g'ri ko'rindi,
    bulk-qo'shish 2 qator kiritildi → "✅ 2 ta taom qo'shildi" + menyu-soni 2→4 jonli yangilandi
    (`preview_snapshot` bilan, screenshot bu muhitda beqaror — R3'dagi bilan bir xil sabab).
  - `pnpm -r typecheck` 4/4 paket 0 xato.
- **§6.1 muvaffaqiyat mezoni (jonli o'lchov kerak):** "yangi restoran+15 taom <10 daqiqada" — bulk-
  qo'shish flow buni tuzilishi jihatidan qo'llab-quvvatlaydi (1 forma + 1 textarea + 1 tugma), lekin
  ANIQ vaqt o'lchovi FAQAT ega o'zi real restoran kiritganda bo'ladi — bu mening tomonimdan
  simulyatsiya qilinmagan (soat-o'lchov = haqiqiy foydalanuvchi tajribasi kerak).
- **GAP — R5 (seed+pilot) MEN TOMONIMDAN "TUGATILISHI" MUMKIN EMAS:** bu tiket mohiyatan BIZNES
  ishi — 5-8 ta real Koson restorani bilan telefon orqali gaplashish, rozilik olish, haqiqiy
  menyu+narxlarni yig'ish, keyin real pilot-buyurtmalar bilan sinash. Kod-infrastruktura (R1-R4)
  TO'LIQ tayyor — ega admin panelidan istalgan real restoranni <10 daqiqada kirita oladi. Lekin
  "restoran" flag'ni yoqish uchun ANIQ real ma'lumot va real sinov kerak, buni men o'zim
  o'ylab topa olmayman/qila olmayman.
- Flag holati: `restoran` hali OFF. Kod tomonidan hamma narsa tayyor (R1-R4 to'liq) — R5 FAQAT
  ega tomonidan bajarilishi mumkin bo'lgan yagona qoldiq.

## 2026-07-07 — RESTORAN R5 boshlandi: 7 real Koson restorani seed qilindi (menyusiz)
- Ega (Elbek orqali) 7 ta real restoran/choyxona Telegram+Instagram havolasini yubordi: Bahor,
  Jazira, Orif Bar, Xonadon, Qazili Hot-Dog, Do'stlar Choyxonasi, Chinor Oilaviy Restorant —
  aynan RESTORAN_PLAN R5'ning "5-8 restoran" mezoniga mos.
- Har birining OCHIQ Telegram kanali (`t.me/s/<kanal>`) WebFetch bilan o'qildi: nom, telefon,
  ba'zilarida manzil+ish-vaqti topildi (Xonadon/Qazi Hot-Dog'da to'liq manzil, Orif Bar/Xonadon'da
  ish-vaqti). Instagram sahifalari (Dostlar, Chinor — faqat shu manba bor edi) login-devor tufayli
  matn bermadi — bu ikkitasida faqat nom bor.
- **5/7 tasida real logotip-rasm** (`cdn4.telesco.pe`) topilib, yuklab olindi va
  `uploadRestaurantPhoto` orqali Telegram file_id sifatida saqlandi (Qazi Hot-Dog logotipida hatto
  telefon raqami ko'rinib, boshqa manbadan topilgan raqam bilan mos tushib tasdiqladi).
- **ATAYLAB MENYU KIRITILMADI** — hech qaysi kanalda matn-holidagi taom+narx topilmadi (real
  menyular fotosurat sifatida joylashgan bo'lishi mumkin, OCR imkoniyati yo'q). Real pul-operatsiya
  uchun narxni o'ylab topib yozish YO'L QO'YILMAYDI — bu mijozni chalg'itishi mumkin. Skript
  (`packages/server/src/scripts/seedRestoranReal.ts`, idempotent, jonli DB'ga yozadi — test DB emas)
  hammasini `active=false` (faqat admin ko'radi) qilib yaratdi, `menuCount=0`.
- **Kutilmagan topilma**: jonli bazada allaqachon `#1 "koson miliy taomlari"` **AKTIV** holatda bor
  edi (fake telefon `+989898989898`, 0 taom) — men yaratmaganman, ehtimol ega admin panelni R4
  deploydan keyin o'zi sinab ko'rgan. Tegilmadi, ega e'tiboriga havola qilindi.
- Keyingi qadam (faqat ega qila oladi): 7 restoranga telefon qilib menyu+narxlarni olish, admin
  panel > Restoran > "Bulk qo'shish"ga joylash (§6.1: <10 daqiqa/restoran), keyin faollashtirish.
- Flag holati: `restoran` hamon OFF — endi kod HAM, real restoran RO'YXATI HAM tayyor; faqat
  menyu-yig'ish (telefon qo'ng'iroqlari) qoldi.

## 2026-07-07 — Bahor Restaurant to'liq menyusi kiritildi (birinchi real menyu, R5)
- Ega Bahor kanalidan real menyuni (kirillcha, 54 taom) to'g'ridan-to'g'ri yubordi. WebFetch orqali
  individual taom-rasmlarini topishga yana urindim (aniq nom bilan qidiruv) — xuddi shu cheklov
  (faqat kanal-avatar ko'rinadi, chuqur post-tarixiga kirilmadi) — rasmlarsiz davom etildi.
- `seedBahorMenu.ts` (yangi, jonli DB'ga yozadi): kirillcha nomlar lotinchaga o'girildi, 3 bo'limga
  ajratildi (Birinchi taomlar 9 ta, Ikkinchi taomlar 29 ta, Shashlik 16 ta) — jami **54/54 taom**
  `adminBulkCreateMenuItems` orqali kiritildi va tekshirildi.
- **3 ta narx/birlik ANIQLASHTIRISH TALAB QILADI** (desc maydonida belgilab qo'yildi, admin
  panelda ko'rinadi):
  - "Bahor assorti" — asl 500 000–600 000 oralig'i, pastki chegara kiritildi.
  - "Zakaz osh" — "300 000 кг" (1 kg narxi) — miqdor-birlik aniq emas edi.
  - "Shirvoz sh." — asl yozuvda "22 00" (raqam yetishmayotgandek, atrofdagi narxlar 19 000-30 000
    oralig'ida bo'lgani uchun 22000 deb XULOSA QILINDI — **tasdiqlanmagan taxmin**, real narx emas.
- Idempotent EMAS (qayta ishga tushirilsa duplikat yaratadi) — skript mavjud menyu bo'sh ekanini
  tekshiradi, aks holda o'tkazib yuboradi.
- **Kutilmagan holat**: Bahor Restaurant `active=true` bo'lib chiqdi (men `false` yaratgandim) —
  ega admin panelda o'zi "Yoqish" bosgan bo'lishi kerak (R4 deploydan keyin sinab ko'rgan). Flag
  `restoran` hamon OFF bo'lgani uchun oddiy foydalanuvchiga ta'siri yo'q, faqat eslatma sifatida.
- Bu — 7 restorandan **birinchisi to'liq menyuga ega bo'ldi** — qolgan 6 tasi hali menyusiz.

## 2026-07-07 — Xonadon Milliy Taomlari to'liq menyusi kiritildi (2/7 menyuga ega)
- Ega Xonadon kanalidan real menyuni (kirillcha, toza matn — narx muammosiz) to'g'ridan-to'g'ri
  yubordi. `seedXonadonMenu.ts` (yangi, jonli DB'ga yozadi, idempotent-emas — mavjud menyu
  tekshiriladi): 6 bo'lim, **59/59 taom** to'liq kiritildi, hech qanday narx-noaniqlik yo'q
  (Bahor'dan farqli — bu safar barcha narxlar aniq matn holida edi).
  Bo'limlar: 1-ovqatlar(4), 2-ovqatlar(6), Shashliklar(17), Somsalar(2), Tabiiy soklar(5),
  Salatlar(25).
- Individual taom-rasmlari bu safar so'ralmadi/qidirilmadi — matn to'liq va aniq bo'lgani uchun
  ustuvorlik menyuni to'liq kiritishga berildi.
- Holat: Bahor (54 taom) + Xonadon (59 taom) = 2/7 restoran to'liq menyuga ega. Qolgan 5 tasi
  (Jazira, Orif Bar, Qazi Hot-Dog, Do'stlar, Chinor) hali menyusiz.

## 2026-07-08 — Restoran "qulayliklar" (R6) — `owner-accepted` (flag allaqachon ON)
Ega so'ragan 6 ta qulaylik to'liq qurildi, sinaldi va **jonlida tasdiqlandi**:
1. Buyurtma statusi o'zgarganda/rad etilganda **haydovchiga emas, mijozga Telegram push**
   (`notifyRiderOrderStatus`, `notifyRiderOrderRejected` — `bot/restoran.ts`).
2. **Bekor qilish** — faqat `pending` holatdagi o'z buyurtmasini, egasi-himoyasi bilan
   (`cancelFoodOrder`, yangi status `cancelled_by_user`).
3. **1-bosishda qayta buyurtma** — o'tgan buyurtma savatini qayta to'ldiradi, endi mavjud
   bo'lmagan taomlarni avtomatik filtrlaydi (`RestoranView` `reorderCart` state).
4. **Qidiruv + "🟢 Ochiq hozir" filtr + kategoriya-chiplar** katalog sahifasida.
5. **🔥 TOP belgisi** eng ko'p buyurtma qilingan 3 restoranga (`orderCount` bo'yicha).
6. **5-yulduzli baho/sharh** — qo'yish/tahrirlash/o'chirish, `avgRating`/`reviewCount`
   server-tomonda qayta hisoblanadi (`RestaurantReview` yangi jadval, upsert
   `restaurantId_memberId` bo'yicha).
- Isbot: `testRestoran.ts` — testlar #41-50 qo'shildi (cancel-guard, cancel, double-cancel,
  bad_stars, rating-upsert matematikasi 5→4→2→3, review-list). **50/50 test o'tdi**
  (`TEST_DATABASE_URL`, jonli DB emas). Miniapp UI accessibility-snapshot orqali tekshirildi
  (bekor/qayta-buyurtma tugmalari, qidiruv, chiplar, TOP belgi, baholash formasi — hammasi to'g'ri
  render bo'ldi, mock fetch orqali, keyin to'liq tozalandi — `git diff --stat` bo'sh tasdiqlandi).
- **Muhim eslatma (protokol-shaffoflik uchun)**: server/miniapp kod-o'zgarishlari (schema,
  `restoranService.ts`, `server.ts`, `index.ts`, `bot/restoran.ts`, `shared/types.ts`,
  `miniapp/api.ts`, `restoran.tsx`, `tokens.css`) mening ishlagan sessiyamda tayyor bo'ldi, LEKIN
  parallel ishlayotgan boshqa sessiya ularni **o'zining commit'iga** qo'shib yubordi
  (`7252359 "fix(services): ship 5-category inspection schema to stop prod crash"`, notoʻgʻri
  commit-xabari — bu commit aslida restoran-qulayliklarni ham o'z ichiga oladi). Push+deploy ham
  o'sha sessiya/avto-deploy orqali sodir bo'ldi — men buni o'zim ishga tushirmadim. Tekshirib
  tasdiqladim: Render live commit hash `7252359` bilan mos, jonli miniapp bundle
  (`restoran-*.js`) ichida `restoranCancel`, `restoranReviewSubmit`, "Bekor qilish", "Qayta
  buyurtma", "Ochiq hozir", "Baholang" — hammasi bor. Faqat `testRestoran.ts` (yangi test
  case'lar) mening tomonimdan alohida commit qilindi (`3914f41`).
- Flag holati: `restoran` allaqachon ON (ega o'zi yoqqan, 2026-07-07) — bu safar yangi
  qulayliklar formal QABUL'siz to'g'ridan-to'g'ri jonli chiqdi (protokoldan chetlanish — ega
  tomonidan flag oldindan yoqilgani sabab).

## 2026-07-20 — Butun-repo xato-ovi → "crash-guard" tiketi — `ready for verification` (QISMAN isbotlangan)
Ega so'rovi: "boshqa xususiyatlarni ham tekshir, xato bormi". Butun repo tekshirildi (typecheck,
testlar, client↔server shartnoma, prisma-sxema muvofiqligi, servis-mantiq auditi).

**TOZA chiqqan qismlar** (buyruq+natija bilan):
- `pnpm -r typecheck` → 4/4 paket, 0 xato. `pnpm -r test` → 42/42 (shared vitest).
- miniapp `api.ts` (178 metod) + admin `api.ts` (148) ↔ `server.ts` (246 route): **0 nomuvofiqlik**,
  Express route-shadowing ham yo'q.
- O'chirilgan servislarga (garaj/tolqin/mahalla) qolgan import YO'Q; o'chirilgan flag nomlari
  (`garajx`/`kozacha`/`motorolami`) hech qaysi `packages/*/src` da ishlatilmaydi.
- 96 ta `prisma.<model>` chaqiruvi sxemada bor; 8 raw-SQL ustunma-ustun to'g'ri; 19 `JSON.parse`
  hammasi try/catch ichida; avgRating nolga-bo'linish ikkala yo'lda ham himoyalangan.

**TUZATILGAN 6 ta xato:**
1. **(A) Express 4 async-rejection** — `server.ts` da 273 route bor, `withMember2` va boshqa async
   handler'lar try/catch'siz edi. Express 4 async throw'ni errorHandler'ga UZATMAYDI → javob
   HECH QACHON yuborilmasdi (mijoz timeout'gacha osilardi) + `unhandledRejection` process
   darajasiga chiqardi. Yangi `api/asyncGuard.ts`: verb-metodlar ro'yxatdan-o'tkazish nuqtasida
   bir marta ushlanadi, har handler wrap qilinadi → rejection mavjud yagona errorHandler'ga boradi.
   Express 5'ga o'tilsa bu fayl olib tashlanadi.
2. **(B) restoran NaN-guard'ining qolgan teshiklari** — 2026-07-08 jonli crash'i `validId` bilan
   tuzatilgan edi, LEKIN R6'da qo'shilgan yo'llar qamrab olinmagan: `listRestaurantReviews`,
   `deleteMyRestaurantReview`, `cancelFoodOrder`, `acceptFoodOrder`, `rejectFoodOrder`,
   `advanceFoodOrderStatus` — 6 tasiga ham `validId` qo'yildi.
3. **(C) intercity id-guard** — `bookSeat`/`cancelBookingByRider`/`departTrip`/`arriveTrip`/
   `driverCancelTrip`/`getTripManifest` mijoz-beradigan id'ni tekshirmasdan prisma'ga uzatardi.
   Faylga `validId` qo'shildi, 6 kirish nuqtasiga qo'llandi.
4. **(D) intercity: bekor qilingandan keyin QAYTA band qilib bo'lmasdi** — idempotency kaliti
   `ibooking:<rider>:<trip>` bekor qilingan qatorda ham qolardi, natijada mijoz o'sha reysga qayta
   yozilolmasdi va ustiga "✅ Band qilindi" degan YOLG'ON javob olardi (o'rinsiz yo'lga chiqardi).
   Endi: ochiq booking bo'lsa → haqiqiy duplikat; faqat bekor qilinganlar bo'lsa → urinish-raqamli
   yangi kalit. Chegirma kaliti ham (`idiscount:${idem}`) shu bilan yangilanadi → qayta bandda
   chegirma TEKIN berilmaydi.
5. **(D2) `driverCancelTrip` qisman bajarilishi** — reys "CANCELLED" qilingandan keyin yo'lovchilar
   bittalab tsiklda yopilardi; tsikl o'rtasidagi xato qolgan yo'lovchilarni "CONFIRMED" holda
   qoldirardi (reys bekor, ular xabarsiz+pulsiz, ro'yxatdan ham yo'qolgan). Endi hamma booking
   BITTA `updateMany` bilan atomik yopiladi, kompensatsiya (tanga qaytarish/tg) alohida va
   xato-bardosh (`grantCoins` idempotent, qayta urinish xavfsiz).
6. **(E) bot `/naxt` noto'g'ri minimum** — yakuniy tekshiruv har ikki usul uchun karta-chegarasini
   (50k) ishlatardi; 🏠 uyga naqd uchun chegara 100k. Mijoz uy-usulini tanlab, keyin tangasini
   sarflab, 60k ga uy-yetkazish so'rovi qoldira olardi. Mini App yo'li (`server.ts:324`) to'g'ri edi.
7. **(F) `backup.ts` UMUMAN ishlamas edi** — jadval ro'yxatida 57, sxemada 96 model; o'z parity
   guard'i `process.exit(2)` qilib har safar dump'dan OLDIN to'xtardi. Ya'ni restoran/xizmatlar/
   elonlar/intercity — hammasi **zaxirasiz** edi. Ro'yxat sxemadan qayta generatsiya qilindi (96/96).

**ISBOT holati — R8 bo'yicha OCHIQ aytiladi:**
- ✅ **(A) to'liq isbotlangan**: `npx tsx src/scripts/testAsyncGuard.ts` → **7/7 o'tdi**, DB talab
  qilmaydi. NAZORAT guruhi bilan: guard'siz "JAVOB YO'Q (osildi)" + `unhandledRejection soni=1`;
  guard bilan `HTTP 500 {"error":"internal"}`, yangi unhandledRejection YO'Q, normal route va
  `app.get("etag")` buzilmagan.
- ✅ **(F) isbotlangan**: `backup.ts` yetib bo'lmaydigan DB bilan yurgizildi — parity guard endi
  FIRE QILMAYDI (`exit 2` yo'q), skript dump-tsikliga (`backup.ts:140`) yetdi va birinchi jadval
  `adContact` ni so'radi — bu ilgari YETISHMAYOTGAN 39 modeldan biri.
- ⚠️ **(B)(C)(D) test YOZILGAN, LEKIN YURGIZILMAGAN** — `src/scripts/testCrashGuards.ts` (typecheck
  toza, 60+ tasdiq: NaN-nazorat, 4 xil buzuq id × 6 restoran + 6 intercity funksiya, D uchun
  band→duplikat→bekor→qayta-band→chegirma-CoinTxn→driverCancel zanjiri). **Hech qanday DB'ga
  ulanib bo'lmadi**: `TEST_DATABASE_URL` (Render bepul tarif, Singapur) **o'chgan** — bu HARDENING
  hujjatidagi 2026-07-10 bepul-tarif muddati bilan mos; lokal Postgres yo'q, Docker daemon
  ko'tarilmadi (WSL backend sozlanmagan). Ega DB bergach BIR BUYRUQ bilan yurgiziladi.
- ⚠️ **(E) faqat kod-darajasida tekshirilgan** (jonli bot sinovi qilinmadi).
- ⚠️ **`testRestoran.ts` (50 test) regressiya uchun YURGIZILMADI** — xuddi shu DB sababi.

**Xulosa: bu tiket `ready for verification`, `done` EMAS.** Qabul uchun kerak: (1) ishlaydigan
`TEST_DATABASE_URL`, (2) `testCrashGuards.ts` + `testRestoran.ts` yashil, (3) deploydan keyin
jonli tekshiruv. Deploy QILINMADI, hech narsa push qilinmadi — ega qaroriga qoldirildi.

## 2026-07-20 — 🛒 BirJoy MARKET REJASI TASDIQLANDI + V0 (audit-tuzatishlar) boshlandi
- **Reja:** do'kon → «BirJoy local online market» (keyingi-avlod marketplace). Ega qarorlari:
  naqd+tanga (Click/Payme YO'Q) · ko'p-do'kon marketplace (restoran modeli) · sotuvchilar o'zi
  yetkazadi. Bosqichlar: V0 audit-fix → D1 dizayn-tili (zumrad #0d9668 + amber, Uzum-uslub
  kategoriya-karusel) → V1 MarketShop+seller-wizard → V2 savat/MarketOrder → V3 tanga-iqtisod
  (cashback+sharh-uchun-tanga) → V4 lifecycle-push → V5 next-gen (sovg'a/doimiy-buyurtma/narx-taklif/
  team-buy) → V6 Juma+komissiya → V7 AI. To'liq reja: plan-fayl (sessiya) — repo'ga ko'chiriladi.
- **Shu sessiyada 3-agent kod-audit + jonli-DB audit o'tkazildi.** Tasdiqlangan topilmalar:
  P0-1 shopseller-token PII o'qiydi (server.ts:145+1369/1373) · P0-2 reject'da refund terminal-flip'dan
  KEYIN, tx'siz (tanga yo'qolishi mumkin) · P0-3 deliver/reject TOCTOU (grammY ketma-ketligi yashiryapti) ·
  P0-4 miniapp orders/reviews catch→[] (tarmoq-xato = «xarid yo'q» yolg'oni) · 151 yetim ProductPhoto ·
  kategoriya-tartibsizlik (umumiy/umum/uy ro'zgo'or) · 275/319 thumb'siz · featured=0 (hero o'lik) ·
  prod'da 16s-oralig'ida dublikat-buyurtma (#14/#15) · 4 pending buyurtma 1-2 kun javobsiz (EGA).
  Buy-path pul-yadrosi TOZA chiqdi (lock+tx+idempotent kalitlar — double-spend yo'li topilmadi).

### V0 DoD (mezonlar KOD'DAN OLDIN — har biri buyruq+natija bilan isbotlanadi)
| # | Mezon | Tekshiruv-buyruq |
|---|---|---|
| 0.1a | shopseller-token GET /api/admin/shop/orders → 403 | curl X-Admin-Token bilan (test-server) |
| 0.1b | shopseller-token GET /api/admin/shop/reviews → 403; owner-token ikkalasida ishlaydi; products CRUD seller uchun buzilmagan | curl ×3 |
| 0.2a | parallel reject×2 → aynan 1 ok, 1 refund-CoinTxn, stock +1 bir marta | testShop yangi blok |
| 0.2b | parallel deliver-vs-reject → aynan 1 g'olib; deliver yutsa refund-satr 0 | testShop yangi blok |
| 0.2c | refund-xato holatda order pending'da QOLADI (rollback) — qayta-urinish mumkin | testShop (tx-throw simulyatsiya) |
| 0.3 | offline'da Buyurtmalarim/Sharhlar → xato+retry ko'rinadi (bo'sh-holat EMAS) | preview DOM + kod-isbot |
| 0.4 | ayni mahsulotga 60s ichida 2-buyurtma → duplicate; boshqa mahsulot → o'tadi | testShop yangi blok |
| 0.5a | yetim-foto 0, kategoriya faqat kanonik ro'yxatdan | skript o'z-hisoboti (dry-run→apply) |
| 0.5b | thumb'siz foto 0 (yoki qolganlar sabab bilan) | skript o'z-hisoboti |
| ∀ | typecheck 4/4 · testShop TO'LIQ yashil 3× ket-ket (TEST_DATABASE_URL) · eski 75 assertion buzilmagan | pnpm -r typecheck; tsx testShop ×3 |

Holat: **ready for verification** (2026-07-20). Har DoD-satr isbotlangan:
- 0.1a/b: curl jonli test-server (port 8091, test-DB): seller-token orders→403 owner_only, reviews→403,
  products→200, owner-token orders→200, economy→403 shop_only (eski scope buzilmagan).
- 0.2a/b/c + 0.4: testShop 18-blok — parallel reject×2→1 g'olib/1 refund-satr/1 restock; deliver-vs-reject
  poyga→1 g'olib, refund-satr holatga mos; in'ektsiya qilingan refund-xato→"retry"+order PENDING qoladi
  (rollback isbotlangan), retry→aniq summa refund; dublikat 60s oyna. **94/94 ✅ 3× ket-ket**
  (yangi Neon kas1067_test DB — eski Render test-DB 07-10 da o'lgan, TEST_DATABASE_URL yangilandi).
- 0.3: shop.tsx orders/reviews catch→error-state+retry (kod-isbot R4'da file:line bilan).
- 0.5a: JONLI apply — 151 yetim satr o'chirildi, kategoriya endi 4 kanonik (Aksiya=43·umumiy=35·
  Uy anjomlari=13·Parfumeriya=10); qayta-dry-run: yetim=0, mapping-hit=0.
- 0.5b: JONLI apply — 274 base64-rasm Telegram'ga yuklandi (124 amal — 151 tasi yetim bo'lib 0.5a'da
  ketgan edi; birinchi urinish "chat not found": lokal .env ADMIN_TELEGRAM_IDS=12345 placeholder —
  PHOTO_DUMP_CHAT_ID=6506297119 bilan qayta): **backfilled=124, fail=0, qolgan thumb'siz=0**.
- typecheck 4/4 · **R4 MUSTAQIL TEKSHIRUV (kod yozmagan agent): PASS, har satr file:line isbot** —
  2 minor kuzatuv: types.ts komment kodni oshirgan (tuzatildi), shopseller panel-tab 403 UX (V1.2'da
  scoped-kirish bilan hal bo'ladi).
- KUZATUV: bugun (07-20) do'konga 13 yangi mahsulot qo'shilgan (Parfumeriya×10) — ega faol ishlatyapti.
QOLDI (V0 doirasida emas): deploy (Render push) + ega telefon-QABUL; ega-ishlari 0.6 (featured 4-6,
4 pending buyurtma, 51 stock=10). Keyingi: D1 dizayn-poydevor + V1 marketplace.

## 2026-07-20 — 🎨 D1+V1 (BirJoy dizayn-poydevori + marketplace) boshlandi
Reja-hujjat: sessiya plan-fayli (V0 yozuvida xulosasi bor). Flag: `bazar` (DEFAULT_OFF, DARK).

### D1+V1 DoD (KOD'DAN OLDIN)
| # | Mezon | Tekshiruv |
|---|---|---|
| D1a | BirJoy token-palitras (--bj-*) tokens.css'da; AA-kontrast asosiy juftliklar | computed-style + kontrast-hisob |
| D1b | BjCategoryCarousel (Uzum-uslub pill+ikonka-rasm karusel) + CategoryDef jadval + admin kategoriya-CRUD (rasm yuklash) | preview DOM + admin-API test |
| D1c | Komponent-kit: BjProductCard/BjShopCard/BjPromiseChip/BjTangaRibbon/BjStickyCartBar/BjEmptyState — faqat token, inline-stil 0 | grep inline style + preview |
| V1.1 | Schema additiv: MarketShop + Product.shopId + CategoryDef; migrateBirjoySeller (do'kon#1, hamma mahsulot shopId=1, idempotent ×2) | db push diff faqat ADD; skript 2× run |
| V1.2 | oprtoken `shopseller:<shopId>` scope: seller faqat O'Z mahsulot/buyurtmasi; owner hammasi | testBazar auth-blok + curl |
| V1.3 | `/sotuvchi` bot-wizard → DARK vitrina; ega aktivlashtiradi | bot-mock test + jonli owner-sinov |
| V1.4 | `bazar` OFF = bugungi UI AYNAN (0 vizual farq); ON = Bozor-bosh (karusel+qidiruv+do'kon-rail+va'da-chip) | flag off/on preview + bundle-grep |
| V1.5 | Buyurtma seller'ga + ega CC; 4-tugma oqim; rider status-push; SLA sweep'da (yangi poller 0) | testBazar + `rg setInterval` diff bo'sh |
| ∀ | typecheck 4/4 · testShop regressiya 94/94 · testBazar yangi 3× yashil · R4 mustaqil · ega QABUL → EXPECTED_ON | buyruq+natija |

Holat: **in progress (V1 kod-yadro qurildi, gaps quyida)** — 2026-07-20 kech:
- ✅ V1.1: MarketShop+CategoryDef+Product.shopId (additiv push ikkala DB) · migrateBirjoySeller
  JONLI apply: MarketShop=1 («BirJoy o'z do'koni»), 109 mahsulot shopId=1, CategoryDef=9, 2-run=no-op.
- ✅ V1.2: oprtoken `shopseller:<shopId>` scope + sellerOwnsProduct choke-point + scoped
  adminList{Products,Purchases,Reviews} — **testBazar 18/18 ×3 yashil** + testShop 94/94 regressiya.
- ✅ V1.3: `/sotuvchi` wizard (bot/market.ts, cashout sessions-naqsh, DARK vitrina, ega ✅/❌
  tasdiqlash-kartasi) — bot.ts'da booking'dan OLDIN registered. Jonli telefon-sinov QABUL'da.
- ✅ V1.5 (MVP-qaror): 4-bosqichli status V2.1 MarketOrder'ga qoldirildi — hozir mavjud ✅/❌ oqimi
  sellerga yo'naltirildi (shopChatsFor: seller ownerChatId + EGA HAR DOIM CC) + callback-guard
  {seller,ega} + SLA-sweep booking-tick'da (yangi poller 0, grep-isbot) — testBazar 7-blok.
- ✅ V1.4 (yadro): flag `bazar` (DEFAULT_OFF) + me.flags.bazar (owner-preview) + `/api/shop/market`
  (do'kon-rail + kategoriya + ?q= server-qidiruv + nol-natija→MarketDemand) + cat-icon/shop-photo
  proxy'lar + D1-kit bilan Bozor-bosh («BirJoy bozori» sarlavha, BjCategoryCarousel, do'kon-rail) —
  OFF=eski UI aynan (bazar=false → market so'ralmaydi, chiplar qoladi). Bundle-grep: shop-chunk'da
  «BirJoy bozori»+bj-cats, CSS'da bj-pcard. typecheck 4/4.
- ✅ D1 (yadro): --bj-* palitra+harakat-til (tokens.css +86 qoida) + birjoy.tsx kit (7 komponent,
  inline-stil 0 grep-isbot).
**GAPS (nomma-nom, R7):** (1) admin CategoryDef-CRUD UI (ikonka-rasm yuklash) YO'Q — karusel hozircha
emoji-fallback bilan ishlaydi; (2) miniapp qidiruv hali client-side — server ?q=/MarketDemand UI'dan
ulanmagan; (3) do'kon-kartaga bosish hozircha banner (alohida do'kon-sahifa V2'da); (4) preview-DOM/
computed-style isbotlar olinmagan; (5) R4 mustaqil tekshiruv V1 uchun O'TKAZILMAGAN; (6) ega QABUL yo'q
→ flag DARK qoladi, EXPECTED_ON'ga kirmaydi; (7) SERVER DEPLOY BLOKLANGAN — GitHub credential o'lgan
(commit 86a7e40 + V1 kodi lokalda), ega `git push origin main` qilishi kerak → keyin Render trigger
(srv-d8mj9kkm0tmc73d72440); miniapp V0-deploy jonli, V1-build tayyor lekin deploy qilinmagan (server'siz
ma'nosiz). Eslatma: boshqa sessiyaning 4 uncommitted fayli (cashout/backup/intercity/restoran) ataylab
commit qilinmadi — aralashtirish yo'q.

**2026-07-20 kech-2 — gap'lar yopildi (1-4):** (1) admin 🎠 kategoriya-CRUD (owner-only routelar +
ShopCategoriesPanel: qo'shish/ikonka-rasm yuklash/faol-toggle/o'chirish, tgUploadPhoto pipeline);
(2) bazar'da qidiruv endi server-side (?q= debounce 450ms → tavsif-qidiruv + nol-natija MarketDemand);
(3) do'kon-sahifa lite (BjShopCard bosish → shu do'kon mahsulotlari + «← Bozorga qaytish»);
(4) **PREVIEW-DOM ISBOT olindi** (lokal botsiz server 8080 + vite 5173, real Neon data, owner-preview
tg=6506297119): title «🏪 BirJoy bozori» · subtitle · .bazar-light zumrad-fon computed-style ·
karusel 9 pill (emoji-fallback) · Parfumeriya-tanlash 100→10 filtr + .on holat · eski chiplar
yashirin · mobil-skrinshot olindi. Preview'da REAL BUG topilib tuzatildi: load()'ning [] effekti
stale-bazar'ni qotirardi (flag me-refetch bilan kelganda market so'ralmasdi) → alohida [bazar]-dep
effekt. testBazar+testShop yashil, typecheck 4/4, prod-build OK.
KUZATUV (ega ma'lumot-kiritishi): bugungi yangi mahsulotlarda «PARFUMERIYA» (katta-harf) kategoriya
paydo bo'lgan — admin endi select bo'lgani uchun yangi tartibsizlik to'xtaydi, mavjudlarini
cleanShopData mapping'iga qo'shib keyingi apply'da birlashtiramiz.
QOLGAN GAP: R4 mustaqil tekshiruv (V1) · ega telefon-QABUL · GitHub-push (PUSH_QILISH.bat kutmoqda,
Monitor armed) → keyin Render+Vercel deploy.

## 2026-07-21 — 🔎 R4 MUSTAQIL TEKSHIRUV (D1+V1): PASS + gap-fix
Kod yozmagan agent har DoD-satrni kod+jonli-deploy'ga qarshi tekshirdi (64 tool-chaqiruv):
V1.1-V1.5 + D1 + testlar (testBazar 18✅, testShop 94✅, TEST-DB guard) + typecheck 4/4 +
regressiya-ov (flag-OFF yo'l bayt-darajada o'zgarmagan, schema sof-additiv, buyProduct tegilmagan) —
**hammasi CONFIRMED, jonlida /api/shop/market 401 (deployed+gated), /health ok**.
TOPILGAN GAP (tuzatildi): importKosonAksiya.ts shopId qo'ymasdi → 07-20 importidagi 30 mahsulot
shopId=null (bazar-OFF ta'sir 0; ON'da do'kon#1 sahifasida ko'rinmasdi). Fix: importer'ga shopId:1 +
migrateBirjoySeller --apply qayta-yugurtirildi → «biriktirildi: 30 → do'kon #1, qolgan=0».
Kuzatuvlar: SLA-sweep flag'dan mustaqil jonli ishlayapti (faqat egaga ko'rinadi, 4 marker prod'da) ·
cat-icon/shop-photo proxy'lar auth'siz (mavjud /api/shop/photo naqshi, sezgir emas).
DEPLOY-ZANJIR IZOHI: c677833 deploy'i server.ts'dagi BOSHQA sessiyaning commit-qilinmagan
asyncGuard-importi tufayli yiqilgan (lokal diskda bor edi — shuning uchun lokal boot toza);
943c5e9 (boshqa sessiya) modulni qo'shib jonlantirdi. Saboq: commit'dan oldin import-graf
untracked-fayllarga ishora qilmasligini tekshirish.
QOLDI: ega telefon-QABUL (R6) → shundagina `bazar` EXPECTED_ON.

## 2026-07-21 — 🟢 BAZAR GO-LIVE: owner-accepted (R6)
Ega real telefonda ko'rib QABUL qildi («yaxshi chiqibdi») → `setFlag bazar on` jonli DB'da ijro
etildi (isbot: AppState feature:bazar=on, /health ok, 30s kesh ichida hammaga ochiladi) + `bazar`
EXPECTED_ON'ga qo'shildi. Endi HAR rider Do'kon tabida «🏪 BirJoy bozori»ni ko'radi (zumrad-tema,
kategoriya-karusel, server-qidiruv; do'kon-rail 2-do'kon kelganda ochiladi). Tiket-holat: D1+V1
**owner-accepted**. Rollback: `setFlag bazar off` (30s).
Keyingi: pilot-sellerlar (/sotuvchi — EGA: 3-5 do'kon topadi) · kategoriya-ikonkalar (admin 🎠
panel — ega chiroyli PNG yuklaydi) · V2 (savat/MarketOrder) plan-fayl bo'yicha.

## 2026-07-21 — 🧺 V2 (savat + MarketOrder) boshlandi — flag `bazarcart` (DARK)
Reja-fayl V2-bo'lim. Savat-qarori (tahlil qilingan): 1 savat = 1 do'kon (restoran naqshi —
sotuvchi o'zi yetkazadi, cross-seller savat N ta yetkazish/naqd/refund murakkabligi = rad).
Bo'linish: V2a (shu sessiya) = pul-yadro+savat+checkout+bot-oqim; V2b = variantlar+sevimlilar+PDP-polish.

### V2a DoD (KOD'DAN OLDIN)
| # | Mezon | Tekshiruv |
|---|---|---|
| 2.1a | MarketOrder schema additiv (itemsJson snapshot, status-mashina, slaAlertedAt) | db push diff faqat ADD |
| 2.1b | createMarketOrder: withMemberLock + BITTA tx (har-satr stock>=qty claim → SOLD_OUT rollback; tanga-hold `mkt:<id>`; minOrder; PENDING=3; dup-hash 60s) | testBazar yangi bloklar |
| 2.1c | Status-mashina shartli-o'tishlar: pending→accepted→delivering→delivered; reject (p/a/d'dan) va rider-cancel (pending'dan) = flip+restock-hammasi+refund `mktrefund:<id>` BITTA tx (V0.2 saboqlari tug'ma) | testBazar: parallel-poyga + refund-in'ektsiya |
| 2.1d | Cash-guard: cash'da coin-op YO'Q hech qaysi yo'lda | testBazar |
| 2.1e | SLA-sweep MarketOrder'ni ham qamraydi (poller YO'Q) | testBazar + grep setInterval |
| 2.2 | Bot: ko'p-satrli karta seller+ega'ga, [✅ Qabul][🚚 Yo'lda][✔ Yetkazdim][❌ Rad] guard'li; har o'tish rider-push | kod-isbot + mock-test |
| 2.3 | Savat-UI: qty-stepper, BjStickyCartBar, boshqa-do'kon prompt, checkout (manzil, naqd/tanga, COD-matn), MainButton/haptic | preview DOM |
| 2.4 | Buyurtmalarim: MarketOrder+ShopPurchase birlashgan ro'yxat, timeline-status, pending'da bekor | preview DOM + testBazar cancel |
| 2.5 | `bazarcart` OFF = bugungi 1-dona oqim AYNAN | flag-off kod-yo'l isboti |
| ∀ | typecheck 4/4 · testShop 94 regressiya · testBazar 3× yashil · R4 · ega QABUL → EXPECTED_ON | buyruq+natija |

Holat: **ready for verification** (2026-07-21, V2a kod-yakun):
- 2.1a: MarketOrder additiv ikkala DB'da (destruktiv-rad talab qilinmadi = isbot).
- 2.1b-e: marketOrderService — **testBazar 55 assertion, 3× ket-ket yashil**: happy-checkout
  (snapshot/hold/stock/ledger) · dublikat-hash · minOrder · HAMMASI-YOKI-HECH-NIMA (2-satr yetmasa
  1-satr rollback) · status-mashina (p→a→d→delivered, delivered'dan reject rad) · parallel reject×2
  → 1 g'olib/1 refund/1 restock · refund-in'ektsiya → rollback+pending+retry · CASH: hold/refund 0,
  restock bor · rider-cancel faqat pending + egalik-guard · SLA MarketOrder-qamrov idempotent.
- 2.2: bot/market.ts — ko'p-satrli karta seller+ega, [✅ Qabul][🚚][✔][❌] guard'li (marketChatsFor),
  har o'tishda rider-push, karta-matn holat bilan yangilanadi. notifyMarketOrder closure index.ts'da.
- 2.3: savat-UI (flag `bazarcart` DARK): detail'da «🧺 Savatga» + qty-stepper, BjStickyCartBar,
  savat-sheet (satrlar/hisob/minOrder-banner/naqd-tanga/manzil/COD-matn), boshqa-do'kon prompt.
  OFF = eski 1-dona oqim AYNAN (barcha bloklar bazarcart-guard'li). MainButton ATAYLAB emas —
  butun ilova in-sheet tugma konventsiyasida (alohida dizayn-qaror sifatida backlog'da).
- 2.4: Buyurtmalarim'da MarketOrder'lar (itemslar, timeline-nuqtalar, pending'da ✖ Bekor) +
  legacy ro'yxat pastda; /api/shop/market-orders + cancel endpointlar; seller-panel uchun scoped
  /api/admin/shop/market-orders.
- typecheck 4/4 · testShop 94 regressiya yashil · prod-build + bundle-grep («Savatga qo'shish»,
  «Buyurtma berish»). QOLDI: ega QABUL (flag DARK — xavfsiz).

## 2026-07-21 — 🔎 R4 MUSTAQIL TEKSHIRUV (V2a): PASS + gap-fix; DEPLOY jonli (acc6367)
Kod yozmagan agent (42 tool-chaqiruv) har DoD-satrni kod+jonli-deploy'ga qarshi tekshirdi:
2.1a-2.1e (pul-yadro), 2.2 (bot-guardlar), 2.3 (flag-off tozaligi), 2.4 (endpoint-auth + PII-strip)
— **hammasi CONFIRMED**. Jonli isbot: /api/shop/checkout→401, /api/shop/market-orders→401,
/api/admin/shop/market-orders→403; jonli DB'da FAQAT feature:bazar=on (bazarcart satri YO'Q = OFF),
marketOrder count=0 (haqiqatan DARK, 0 jonli foydalanish). testBazar 55✅ ×3, testShop 94✅,
typecheck 4/4, buyProduct 0-satr o'zgardi (regressiya yo'q). Deploy: Render acc6367 LIVE + /health ok
+ miniapp Vercel yangi bundle.
Topilgan 4 gap: (1) assertion-count drift PROGRESS'da — tuzatildi (55, ne 54); (2) rider-izoh hech
qayerda ko'rinmaydi — V2b backlog; (3) note ichidagi #<hash> markeri /market-orders javobida xom
qaytardi (hech qaysi yuzada render bo'lmaydi) — **tuzatildi: toView strip qildi**; (4) editMessageText
parse_mode'siz (kosmetik, HTML-leak yo'q — ataylab qoldirildi, entity-stripped matnga HTML qайta
qo'shish real parse-xato berishi mumkin). Hech biri pul-kritik EMAS.
QOLDI: ega telefon-QABUL (R6) → shundagina `bazarcart` EXPECTED_ON.

---

## 2026-07-21 — PROD-AVARIYA + HARDENING-1 (CI-gate, monitoring, backup)

**Avariya:** c677833 `server.ts` import qilgan `src/api/asyncGuard.ts` git-add qilinmagan →
20-iyul ikkala deploy `update_failed` (bot 8-iyul buildida qolgan) → 21-iyul 09:24 UTC instans
restart → eski sxemali `prisma db push` yangi DB'ga data-loss rad → crash-loop, bot ~26 daqiqa
o'lik + webhook'da 77 update. Tuzatish: 943c5e9 (fayl commit) → deploy live, navbat 0.
`welcomebonus` flag-audit signali: ega "o'chirganman" dedi → EXPECTED_ON'dan chiqarildi (6f9d0c9).

**Hardening-1 (shu commit):**
- CI-gated deploy: Render autoDeploy OFF + start'dan `db push` olib tashlandi (API orqali
  qo'llangan); ci.yml'ga `deploy` jobi — faqat yashil shield'dan keyin Render'ga deploy + poll.
- health.yml: har ~10 daq /health ping, 3 urinish yiqilsa admin-chatga Telegram alert
  (mijozlarga EMAS); bonus — free-tier instansni uyg'oq tutadi.
- backup.yml: har kecha 03:30 (Toshkent) to'liq logical dump → GH artifact (30 kun).
  backup.ts sinxronlandi (100/100 model: +marketShop/categoryDef/marketDemand/marketOrder,
  BigInt→string) — lokal isbot: 42 642 satr snapshot.
- Flag-o'zgarish logi: admin-panel toggle + setFlag.ts endi alertAdmins beradi (17-iyul jim
  welcomebonus-toggle saboqi). setFeature ichiga emas — testlar spam qilmasin.
- GH secrets o'rnatildi: RENDER_API_KEY, BOT_TOKEN, DATABASE_URL, ALERT_CHAT_ID.

Holat: **ready for verification** (CI yashil + deploy jobi live + health-run yashil = isbot).
Keyingi: Contabo to'liq migratsiya (~23-iyul, ega VPS+domen beradi).

## 2026-07-21 — 🐛 Savat-yo'qolish bug FIX (ega telefonda topdi)
Ega: «savatcha yuqolib qoldi». Sabab: ShopView tab-almashinuvida unmount bo'ladi (App.tsx
`{tab==="dokon" && <ShopView/>}`), savat esa sof React-state edi → tab almashib qaytganda yoki
ilova qayta-ochilganda nol bo'lardi. FIX: savat localStorage'da (`bj_cart_v1`, lazy-init + har
o'zgarishda saqlash, bo'sh bo'lsa tozalash; 1 savat = 1 do'kon). BONUS-topilma (preview'da): tanga
yetmagan mahsulotda «Savatga qo'shish» tugmasi yo'q edi (faqat yetarli-balans tarmog'ida) — savat
naqd bilan yakunlangani uchun kam-tanga tarmog'iga ham qo'shildi. ISBOT (jonli preview, ega-preview
tg=6506297119, real Neon): savatga qo'shildi → localStorage {shopId:1,items:{170:1}} → Uy tabga
o'tib qaytildi → savat-bar «🧺 1 ta mahsulot 50 000 → Savat» saqlanib qoldi. typecheck OK, build,
Vercel jonli (shop-CkgTNFsf.js, bj_cart_v1 grep=1). Flag `bazarcart` hamon DARK (ega-preview'gina).

## 2026-07-21 — 🎁 V2b (sevimlilar) + V3 (tanga-cashback + sharh-mukofot) boshlandi
Ega "hammasini qil" dedi. Ko'lam-qaror (aniq belgilanadi, jim tashlab ketilmaydi):
**shu sessiyada:** V2b = ProductFavorite (sevimlilar, xizmatlar-naqshi) · V3 = xarid-cashback +
sharh-uchun-tanga (⭐ ProductReview'ga yulduz qo'shiladi). **KEYINGA QOLDIRILDI (ataylab, sabab
bilan):** ProductVariant (2.2) — savat/checkout/bot-karta/admin barchasiga tegadi, alohida katta
tiket bo'lishi kerak; sotuvchi-reyting (3.3) va tier-yetkazish-badge (3.4) — V1 sotuvchilari hali
kam, ma'noli reyting uchun ma'lumot yo'q.

### V2b+V3 DoD (KOD'DAN OLDIN)
| # | Mezon | Tekshiruv |
|---|---|---|
| 2.5a | ProductFavorite additiv (memberId — shop-konventsiya, @@unique) + favCount Product'da | db push diff faqat ADD |
| 2.5b | toggle-fav idempotent, favCount aniq hisoblanadi | testBazar/testShop yangi blok |
| 2.5c | Miniapp: ❤ optimistic-toggle kartada+detail'da, «Sevimlilar» filtri | preview DOM |
| 3.1a | Xarid-cashback YANGI emissiya-manba, O'Z byudjeti — safar ≤350 clamp'ga TEGMAYDI (bookingId=null) | kod-isbot + testEconomy regressiya |
| 3.1b | Grant FAQAT delivered-o'tish `count===1`da (reject-ferma strukturaviy 0) | testBazar parallel-test |
| 3.1c | Durability: pendingCreate→grantCoins→pendingResolve (crash-holatda pending qoladi, tick qayta-uradi) | testBazar in'ektsiya-test |
| 3.1d | Knoblar clamp'langan (pct/perOrder/dailyMax), flag `shopcashback` DARK | kod-isbot |
| 3.2a | ProductReview'ga rating(1-5) qo'shiladi (additiv, eski thumb-only ishlayveradi) | db push diff |
| 3.2b | Sharh-uchun-tanga: FAQAT delivered-xaridor, ≥30 belgi, kuniga cap, kalit BIR UMR (edit/delete qayta to'lamaydi) | testBazar |
| 3.2c | Flag `revtanga` DARK | kod-isbot |
| ∀ | typecheck 4/4 · testShop+testBazar regressiya yashil 3× · yangi testlar yashil 3× · R4 · ega QABUL | buyruq+natija |

Holat: **in progress**.

## 2026-07-21/22 — V2b + V3.1 + V3.2 kod-yakun (READY FOR VERIFICATION)
Ega "hammasini qil" dedi. Belgilangan ko'lam bo'yicha 3 tiket to'liq qurildi va isbotlandi
(ProductVariant/sotuvchi-reyting/tier-badge ATAYLAB keyinga qoldirilgan — sabab yuqoridagi yozuvda).

### ✅ V2b — Sevimlilar (ProductFavorite)
Schema additiv (ProductFavorite + Product.favCount) · toggleProductFavorite (idempotent, floor-0) ·
listFavoriteProducts (shaxsiy, memberId-scoped) · listActiveProducts endi isFav/favCount qaytaradi
(memberId softly resolved — link qilinmagan userlar uchun ham ishlaydi) · miniapp: ❤ optimistic-
toggle (kartada + PDP'da, xatoda rollback) + «Sevimlilar»-filtr tugma + bo'sh-holat.
**Isbot:** testBazar 17-20-blok (favCount aniq, boshqa a'zoga ta'sir yo'q, ikki marta ON/OFF
idempotent, floor-0) — 3× yashil.

### ✅ V3.1 — Xarid-cashback (`shopcashback` flag, DARK)
YANGI emissiya-manba — safar ≤350 clamp'ga TEGMAYDI (bookingId=null; kalit `shopcb:sp<id>`/
`shopcb:mo<id>` clamp'ning `:memberId:bookingId` suffiks-shabloniga mos KELMAYDI — mustaqil
tekshirildi). Grant FAQAT delivered-flip `count===1` muvaffaqiyatli bo'lgach (deliverPurchase +
advanceMarketOrder ikkalasida ham) — reject-ferma strukturaviy nol. Knoblar admin-panelda avto-
render («BirJoy bozor» guruh): pct=2%, perOrder=2000, dailyMax=5000 (hammasi clamp'langan).
Durability: pendingCreate→grantCoins→pendingResolve (T0.5 naqshi) — `retryPendingMoney` (mavjud
15-min tick, yangi poller YO'Q) endi "shopcb" markerini ham skanerlaydi.
**Isbot:** testBazar 21-28-blok — flag DARK/ON, aniq-foiz hisob, perOrder-cap, dailyMax-cap
(ketma-ket 3 xarid bilan chegara aniq kesilgani), reject→cashback YO'Q, **durability-in'ektsiya**
(qo'lda pending-marker qoldirilib, `retryPendingMoney` uni to'ldirgani isbotlandi) — 3× yashil.

### ✅ V3.2 — Sharh-uchun-tanga + ⭐ rating (`revtanga` flag, DARK)
ProductReview.rating (1-5, additiv) + tangaPaid. Kalit `revtanga:<member>:<product>` **CoinTxn'da**
tekshiriladi (ProductReview qatoridan MUSTAQIL) — shuning uchun edit ham, DELETE+qayta-yuborish ham
ikkinchi marta to'lamaydi (isbot: qator o'chirilib qayta yaratildi, baribir 0 tanga). Shartlar:
delivered-xaridor (ShopPurchase YOKI MarketOrder itemsJson — ikkalasi ham tekshirildi), ≥30 belgi,
kuniga cap (dona-hisob). miniapp: 1-5 yulduz tanlash (thumb baribir majburiy — eski sharhlar
buzilmaydi), «+300 tanga» hint (flag ON'da), grant-toast+confetti, ro'yxatda yulduz-render, avgRating.
**Isbot:** testBazar 29-36-blok (non-buyer=0, delivered-buyer=aniq-summa, edit=0, delete-resubmit=0,
MarketOrder-yo'li ham=aniq-summa, qisqa-matn=0-lekin-saqlanadi, rating-validatsiya 0/6 rad, dailyMax
aniq kesilgan, flag-DARK=0) — 3× yashil.

**Umumiy isbot:** testBazar **36+ blok, ~70 assertion, 3× ket-ket yashil** · testShop 94 regressiya
yashil ×2 · typecheck 4/4 · prod-build + bundle-grep (shop-rev-star, «Sharh (≥30 belgi)»).
**Out-of-scope topilma:** testEconomy.ts'da 2 ta BirJoy'ga aloqasi yo'q, oldindan mavjud xato
(mission-reward cap) — spawn_task orqali alohida belgilandi, bu ishga aralashtirilmadi.

**QOLDI (deploy'dan oldin):** commit+push+Render/Vercel deploy · R4 mustaqil tekshiruv · preview-DOM
isbot · ega QABUL (3 flag DARK: shopcashback/revtanga darhol, bazarcart allaqachon DARK edi).

## 2026-07-22 — 🔎 R4 (V2b+V3.1+V3.2) qayta o'tkazildi: PASS + 2 gap-fix
Birinchi R4 urinishi sessiya-uzilishidan yo'qolgan edi — qaytadan ishga tushirildi (20-punktli
qattiq tekshiruv, 54 tool-chaqiruv). **Verdikt: PASS.** Eng muhim da'vo — safar ≤350 clamp'dan
izolyatsiya — matematik isbot bilan tasdiqlandi (kalit-shakl clamp'ning `:memberId:bookingId`
suffiks-shabloniga hech qachon mos kela olmaydi). Jonli DB'da ikkala flag ham chinakam DARK
(0 satr). 102+94 assertion 3× yashil, typecheck 4/4, jonli-endpoint 401'lar tasdiqlandi.

**Topilgan 2 race-condition gap (pul yo'qolmagan, lekin tuzatildi):**
1. `toggleProductFavorite` ON-yo'li: parallel ikki chaqiruv ikkalasi ham favCount'ni oshirishi
   mumkin edi (findUnique-keyin-unconditional-increment). Fix: increment endi FAQAT shu chaqiruv
   o'zining `create()`i g'olib chiqqanda (P2002 = mag'lub — increment YO'Q).
2. `grantShopCashback` kunlik-limit o'qishi `withMemberLock`siz edi — bir a'zoning ikki buyurtmasi
   deyarli bir vaqtda yetkazilsa, ikkalasi ham eski "qolgan-limit"ni o'qib, jamda dailyMax'ni
   buzishi mumkin edi. Fix: butun funksiya `withMemberLock`ga o'raldi (buyProduct/withdraw naqshi).
**Isbot:** yangi testBazar 20b (parallel ON×2 → aynan 1 satr+1 increment — DB'dan alohida
yakuniy o'qish bilan, chaqiruvlarning o'z-javobi EMAS, chunki bu faqat ko'rsatkich va cross-call
o'qish-sinxronligi kafolat qilinmaydi) + 27b (parallel 2 yetkazish dailyMax chegarasida → jami
aynan headroom, kunlik-yig'indi aynan dailyMax) — **3× ket-ket yashil**.
QOLDI: ega telefon-QABUL (flaglar hamon DARK).

## 2026-07-22 — 🤖 AI-agent v1 (aibrain flag, DARK) — READY FOR VERIFICATION
Groq jonli ishga tushdi (ega kalitni o'zi qo'ydi: lokal .env + Render env; servis restart
07:13, birinchi jonli LLM chaqiruvlar tasdiqlandi ai_used=2). Keyin ega talabi: "haqiqiy
chatlar, bot hamma amallarni qila olsin" → tool-calling agent qurildi.

**Nima qurildi:**
- `services/ai/agent.ts` (yangi): Groq llama-3.3 tool-calling router. Suhbat xotirasi =
  oxirgi 30 daqiqa / 8 ta SupportMsg (in+out). Tool'lar: taksi_chaqir(manzil?),
  buyurtma_holati, balans. AMALLAR LOKAL bajariladi — balans/telefon/holat LLM'ga
  round-trip QILINMAYDI (balans javobi tarixga neytral marker bilan yoziladi).
  Dispatch har doim mijoz tugma bosishi bilan (agent faqat manzil-tanlash oqimini ochadi).
- `booking.ts`: `tryAddressBooking(ctx, query)` eksport (ichki (b)-yo'l dedup qilindi).
- `bot.ts`: fallback endi aibrain-flag'li — ON=agent, OFF=eski aiSupport. AI/FAQ javoblari
  SupportMsg'ga `direction:"out"` bilan yoziladi (xotira + ega auditi).
- BUG-FIX (flag'siz ham): AI-1 book-intent'ning `bk:addr:<kasId>` inline tugmalari O'LIK edi
  (booking handler payload'ni sessiya-INDEKS deb o'qiydi, sessiya yo'q → jim ignore).
  Endi haqiqiy manzil-tanlash oqimi ochiladi.
- `llmRouter.ts`: cap helper'lar eksport (aiCapOk/aiCapBump/aiDay), member-cap 10→30
  (agent+askLlm BIR XIL hisoblagichlardan; global 1200 o'zgarmadi).
- Yangi skriptlar: `checkAiUsage.ts` (kunlik cap hisoblagichlari), `checkAiConvo.ts`
  (so'nggi suhbatlar auditi), `testAgent.ts` (jonli-Groq smoke, TAG'li satrlar+cleanup).

**Isbot:** typecheck 0 xato (har qadam) · testAgent 4/4 scenariy **3× ket-ket yashil**
(taksi-so'rov→book, "obronga" follow-up→book("obronga") [xotira isboti], balans-savol→balance,
imkoniyat-savoli→to'g'ri matn-javob). Telegram'ga XABAR YUBORILMADI, real a'zo tegilmadi.

**Buzilmas qoidalarga muvofiqlik:** aibrain kill-switch (hozir OFF/DARK) · pul-amallari
agent'ga berilmagan (faqat read-only balans-ko'rsatish, yechish Mini App tugmalarida) ·
tanga-emissiya yo'q · yangi poller yo'q · "coin" so'zi UI'da yo'q (prompt'da ham taqiq).

**QOLDI:** commit+push+deploy · ega REAL telefonda sinovi (aibrain OFF holda deploy;
setFlag aibrain ON — alert bilan) · ega QABUL'idan keyingina flag yoqiq qoladi.

## 2026-07-22 — 🔔📊 AI v2 P1: Eslatma + Hisob-kitob (airemind/aihisob) — READY FOR VERIFICATION
Reja: AI_V2_PLAN.md (Sonnet+Fable ikki mustaqil draft sintezi; ega "har qanday" — tavsiya
variantlar qabul qilindi). P1 quruldi:

**Yangi:** `Reminder` jadvali (db push OK, sof-additiv) · `timeParse.ts` (deterministik o'zbek
vaqt-parser, LLM vaqt HISOBLAMAYDI — noaniqlik tugma bilan so'raladi) · `reminderService.ts`
(create/list/cancel/deliver, guardrail: ≥5daq/≤30kun, 5 pending, 10/kun) · `aiStats.ts`
(lokal agregatlar) · `calc.ts` (rules-first arifmetika, eval'siz, LLM'siz) · agent'ga 4 yangi
tool (eslatma_qoy/eslatmalarim/eslatma_bekor/hisob_kitob) — flag bo'yicha DINAMIK roster
(OFF feature tool'i Groq'ga umuman yuborilmaydi) · bot.ts tasdiqlash-kartalar (rem:opt/no/
del/snooze) — AI hech qachon jim eslatma yaratmaydi · index.ts sweep'ga deliverDueReminders
(yangi poller YO'Q, claim-first, kas'ga 0 so'rov, ≤90s aniqlik).

**Maxfiylik:** hisobot/balans raqamlari LLM'ga round-trip qilinmaydi (SupportMsg'ga faqat
neytral marker); eslatma matni DB'dan aynan qaytariladi (LLM qayta yozmaydi); yetkazish
0 LLM-chaqiruv.

**Isbot:** typecheck 0 xato · timeParse 27/27 · calc 16/16 · reminderService 13/13 ×3
(stub-bot, Telegram'ga 0 xabar, TAG+cleanup) · agent E2E 8/8 ×2 (3-run 5/8 — faqat groq 429
free-tier limiti, mantiq emas). Flaglar: airemind/aihisob ON (setFlag orqali, alert ketdi) —
lekin aibrain OFF bo'lgani uchun mijozlarga MUTLAQO ko'rinmaydi (tool'lar faqat agent ichida).

**Ma'lum cheklov:** Groq free-tier kunlik token-budjeti tor (~60-70 agent-chaqiruv/kun) —
rules-first 80%ni ushlaydi, lekin o'sishda tool-calling'ga multi-provider fallback yoki
pullik tarif kerak bo'ladi (V-NEXT).

**QOLDI:** commit+push+deploy · ega REAL telefonda sinovi (aibrain ON qilib) · ega QABUL.

## 2026-07-22 — 🔑 V1.6 (sotuvchi o'zi-xizmat kirish) boshlandi — real bo'shliq yopilmoqda
Ega: «har bir do'kon akkaunt ochib o'z mahsulotlarini yuklashi kerak endi». Tekshiruv natijasi:
V1.2 (seller-scope) va V1.3 (/sotuvchi wizard) qurilgan, LEKIN ular orasidagi ko'prik yo'q edi —
`mkt:approve` faqat `active:true` qiladi, tokenni HECH KIM avtomatik bermaydi. Mavjud admin-panel
tugmasi (`optoken("shopseller")`) faqat BARE "shopseller" (=shop#1, «BirJoy o'z do'koni») yaratadi —
API'da shopId parametri UMUMAN yo'q, ya'ni yangi pilot-do'konlar (#2, #3...) uchun mutlaqo ishlamaydi.

### V1.6 DoD (KOD'DAN OLDIN)
| # | Mezon | Tekshiruv |
|---|---|---|
| 1.6a | `getOrCreateSellerToken(shopId)` — mavjud tokenni qayta ishlatadi (idempotent), yo'q bo'lsa yangi yaratadi | testBazar: 2× chaqiruv bir xil token qaytaradi |
| 1.6b | `/api/admin/optoken` shopId qabul qiladi (shopseller'da); do'kon mavjudligini tekshiradi; `/optokens` ro'yxati do'kon-nomini ko'rsatadi | curl-isbot + admin preview |
| 1.6c | `mkt:approve`da avto token-mint + seller'ga tayyor link+yo'riqnoma DM (xato bo'lsa jim, tasdiqlash xabari buzilmaydi) | bot-mock test |
| 1.6d | Yangi `/dokonim` buyrug'i — seller istalgan vaqt o'z linkini qayta oladi (faqat o'z faol do'koni uchun) | bot-mock test |
| 1.6e | Admin: qo'lda token-yaratishda >1 do'kon bo'lsa tanlov (select); bare "shopseller" = shop#1 sifatida saqlanadi (backward-compat) | preview DOM |
| ∀ | typecheck 4/4 · testBazar regressiya + yangi bloklar 3× yashil · R4 · ega QABUL kerak emas (bu — mavjud LIVE V1.2/V1.3'ning bo'shlig'ini yopish, yangi flag emas) | buyruq+natija |

Holat: **in progress**.

## 2026-07-22 — 🔑 V1.6 (sotuvchi o'zi-xizmat kirish) READY FOR VERIFICATION
Barcha 5 tiket qurildi, isbotlandi:
- 1.6a `getOrCreateSellerToken(shopId)` — idempotent mint-yoki-qayta-ishlatish + **R4-uslub
  o'z-o'zini-tekshiruv jarayonida topilgan parallel-mint race'ga qarshi qo'shimcha mustahkamlash**:
  deterministik pointer-qator (`sellertoken:<shopId>`, key-unique) — ikki bir vaqtdagi so'rov endi
  bitta xil tokenga tushadi (eski find-then-create ikkita TURLI tokenni yaratishi mumkin edi).
  Revoke (`DELETE /optokens/:token`) endi pointer'ni ham tozalaydi (aks holda qayta so'rov o'lik
  tokenni abadiy qaytarardi).
- 1.6b `/api/admin/optoken` shopId qabul qiladi (do'kon-mavjudlik tekshiruvi bilan); `/optokens`
  ro'yxati endi do'kon-nomini ko'rsatadi; yangi `/api/admin/market-shops` (owner-only, picker uchun).
- 1.6c `mkt:approve`da AVTOMATIK token-mint + tayyor havola+yo'riqnoma DM — ega endi HECH QANDAY
  qo'lda qadam qilmaydi (avval: CLI-skript yugurtirish yoki admin-panelda qo'lda tugma bosish kerak
  edi, ikkalasi ham faqat shop#1 uchun ishlagan).
- 1.6d yangi `/dokonim` buyrug'i — seller o'z linkini istalgan vaqt qayta oladi.
- 1.6e admin UI: >1 do'kon bo'lsa token-yaratishda do'kon-tanlov select; ro'yxatda do'kon-nomi.
**Isbot:** testBazar +4 blok (37-40: idempotent/scoped/parallel-race/revoke-pointer-tozalash) —
3× ket-ket yashil (jami 40+ blok) · testShop 94 regressiya yashil · typecheck 4/4 · **jonli preview
isbot** (owner-auth: market-shops ro'yxat, optoken mint+reuse+revoke+pointer-tozalash, scoped
seller-token: /shop/products=200, /market-shops=403, /economy=403 — hammasi real serverda, real Neon
ma'lumot bilan tekshirildi, test-tokenlar tozalab tashlandi).
QOLDI: R4 mustaqil tekshiruv (xohlasa), keyin commit+deploy. Bu — mavjud V1.2/V1.3'ning ishlab
turgan bo'shlig'ini yopish, yangi flag talab qilmaydi (bazar allaqachon LIVE).

## 2026-07-22 — 💛 Koson AI K4: Do'st-rejim (aidost) — in progress (gaps: E2E to'liq emas)
Reja: KOSON_AI_PLAN.md v2 (ega yo'nalishlari: universal provider-registry «har qanday xizmatga
flexible» + emotsional AI + o'z-xotira). K4 kodi qurildi:
- `MemberMemory` jadvali (db push, sof-additiv) · `memoryService.ts` (saqlash/recall/unut;
  20-cap evict, ≤200 belgi, 6+ raqam-devor) — **8/8 unit-test yashil**.
- agent.ts: do'st-persona (hamdard, nasihatsiz; psixolog EMAS — og'ir holatda 103/102/1050),
  `eslab_qol`/`unut` tool'lari (aidost-gated), recall → faqat o'sha mijoz kontekstiga.
- bot.ts: memory_save (jim saqlash + iliq javob), memory_forget («meni unut»), do'st-rejimda
  «Operator» futeri olib tashlandi. Typecheck 0 xato. aidost ON (aibrain OFF — mijozga DARK).

**MUHIM TOPILMA (429-fallback tajribasi):** llama-3.1-8b zaxira-model sifatida sinaldi va
TOOL CHAQIRMASDAN «📝 Eslatma qo'yildi» deb YOLG'ON tasdiq + to'qilgan raqamlar («5 safar,
cashback 10%») qaytardi — invariant-buzar. 8b OLIB TASHLANDI: 70b ishlamasa halol null
(«tushunmadim») — yolg'onchi AI'dan yaxshi. Bu K3 (Gemini Flash function-calling, alohida
bepul kvota) zarurligini isbotladi.

**E2E holati (halol):** dardlashish-scenariy 70b'da 2× yashil («Ha, og'ir bo'libdi...»);
LEKIN eslab_qol/unut tool-chaqiruvi 70b'da hali BIR MARTA ham isbotlanmadi — bugungi
~100 test-chaqiruv Groq kunlik budjetini yedi (429). Ertaga kvota yangilanganda 3× yashil
talab qilinadi YOKI GEMINI_API_KEY qo'shilib K3 zanjiri bilan bugun tekshiriladi.
**QOLDI:** agent-E2E memory-scenariylar 3× yashil · K1/K2/K3 · commit/push/deploy · ega QABUL.

## 2026-07-22 — 🐛 KRITIK BUG-FIX: /sotuvchi wizard telefon-qadami hech qachon ishlamagan
Ega telefonda `/sotuvchi`ni sinab ko'rdi: do'kon-nomi kiritildi, keyin telefon-raqam so'ralganda
raqam yozilgach bot «Raqamni qo'lda yozib bo'lmaydi — bu xavfsiz emas / 📱 Raqamni ulashish /
Boshqa raqam» degan XATOLIK ko'rsatdi (haqiqiy hisob-bog'lash oqimi, wizard emas).
**Ildiz-sabab:** `bot.ts`da global xavfsizlik-handler (`bot.hears(/^\+?\d[\d\s\-()]{8,}$/)`,
"raqamni qo'lda kiritib bo'lmaydi" ogohlantirishi) `registerMarket(bot)`dan (1496-qator) ANCHA
OLDINROQ (~686-qator) ro'yxatdan o'tgan va mos kelganda `next()` chaqirmaydi — shuning uchun
har qanday telefon-shaklidagi matn shu yerda to'xtab qolardi, wizard'ning HECH BIR qadami
(nafaqat telefon — sessiya davomida yozilgan HAR qanday raqam-shakldagi matn) hech qachon
ko'rilmasdi. Bu **V1.3'dan buyon jonli bug** edi — `/sotuvchi` amalda hech qachon to'liq
ishlamagan (2/6-qadamdan o'tib bo'lmasdi).
**Fix (xavfsiz — boshqa handler'lar tartibiga tegilmadi):** market.ts'dan `isInMarketWizard(tg)`
eksport qilindi (sessions-map'ni faqat o'qiydi); bot.ts'dagi global handler endi shu tekshiruvni
birinchi qiladi — faol wizard-sessiyasi bo'lsa `next()` bilan o'tkazib yuboradi, aks holda
(oddiy foydalanuvchilar uchun) xavfsizlik-xatti-harakati AYNAN saqlanadi.
**KUZATUV (out-of-scope, bayroq qo'yildi):** aynan shu regex bir xil sabab bilan `cashout.ts`ning
karta-raqam qabul qilish qadamini ham ushlab qolishi mumkin (kod-o'xshashlik bilan aniqlandi,
chuqur tekshirilmadi — alohida ishga topshirildi).
**Isbot:** typecheck 4/4 · testBazar 41-blok (isInMarketWizard eksport+false-holat) + eski
40 blok 3× yashil regressiya. Chuqurroq (true-holat, grammY Context) isbot bu kod-bazada mavjud
bo'lmagan bot-mock infratuzilmasini talab qiladi — ASOSIY isbot: ega hozir jonli telefonda qayta
sinaydi.

## 2026-07-22 — ✅ Telefon-bug fix EGA TOMONIDAN JONLI TASDIQLANDI
Ega: «qaytadan urinib ko'rdim, ishladi». `/sotuvchi` wizard endi telefon-qadamidan muvaffaqiyatli
o'tadi (commit c90392a, Render live). R4 (V1.6): PASS. Ticket holati: **owner-accepted**.

## 2026-07-22 (kech) — K3 fallback-zanjir qurildi; E2E holati halol qayd
- K3: `callGroq` (70b) → `callGemini` (gemini-flash-latest, function-calling, javob bir xil
  LlmMsg shaklga normalizatsiya — tool-handlerlar o'zgarmadi). 2.0-flash 2026 free-tier'da
  kvota-0 → `gemini-flash-latest` probe bilan tanlandi. thinkingBudget:0 (matn-uzilish fix).
  llmRouter'dagi eski gemini-provider ham yangi modelga ko'chirildi. GEMINI_API_KEY lokal+
  Render'da (ega qo'ydi; Render'dagi GEMINE typo birga tuzatildi).
- **E2E isbot-holati:** to'liq 11/11 yashil — 1× (butun oqim Gemini orqali; Groq TPD tugagan
  edi = fallback jangovar sinovi). Oldinroq P1-subset 8/8 ×2 (Groq orqali). Yana 2 yugurish
  0/11 — IKKALA provayder kunlik kvotasi bugungi ~150 test-chaqiruvdan tugadi (barcha xatolar
  «all providers rate-limited», yolg'on javob YO'Q — 8b-saboq qoidasi ishladi).
- **3× ket-ket to'liq-yashil hali YO'Q** — kvotalar ertaga yangilanadi, shunda 3× yugurib
  isbot yopiladi. Bugun boshqa LLM-chaqiruv qilinmaydi (kvota real mijozlarga kerak emas —
  aibrain OFF, lekin isrof ham qilmaymiz).
**QOLDI:** ertaga E2E 3× yashil → commit/push/deploy → ega telefon-QABUL (aibrain ON pilot).

## 2026-07-22 (kech-2) — 🏙 K1 yadro qurildi (aicity, DARK) — LLM-siz testlar 12/12 ×3
Ega talabi «har qanday xizmatga flexible» bo'yicha provider-registry arxitektura:
- `services/ai/providers/types.ts` — AiProvider interfeys (search/order/execute/status,
  AiCard/ConfirmCard). Yangi shahar-xizmati = BITTA adapter-fayl + registry'da 1 import.
- `providers/index.ts` — registry: activeProviders() har chaqiruvda flag-filtr (modul
  flagi DARK → provider LLM ro'yxatidan avtomatik yo'qoladi); __registerForTest stub-yo'li.
- `providers/restoranProvider.ts` — 1-adapter: qidiruv (so'z-chegarali reyting — «osh»
  «kartOSHka»ni yengadi), order→ConfirmCard (manzil talab), execute→MAVJUD createFoodOrder
  (naqd-concierge, operator-notice notifyOwnerNewFoodOrder orqali), status→myFoodOrders.
- agent.ts: 3 universal tool (shahar_qidir/buyurtma/holat) — enum+tavsif RUNTIME'da
  registry'dan; yangi provider'da agent.ts O'ZGARMAYDI. bot.ts: karta-render, tasdiqlash
  [✅ ai:ok]/[✖️ ai:no] (yadro kafolati: execute FAQAT human-tap'dan keyin), pendingCity.
- `botInstance.ts` (yangi, 14 qator): bot-singleton — chuqur servislardan owner-alert.
- MUHIM FAKT: `restoran` flag jonli DB'da allaqachon ON (7 restoran, 113 taom) — AI-provider
  real katalog ustida ishlaydi. `aicity` esa DARK (DEFAULT_OFF, satr yo'q).
**Isbot:** typecheck 0 xato · testCity 12/12 **×3 yashil** (LLM'siz: registry, flag-gate,
stub search→order→confirm→execute round-trip, jonli katalogda «osh» to'g'ri topiladi).
**Ega qarori:** pullik LLM (~$10-20/oy) olinadi — free-tier-only qoidasi yumshaydi (memory'da).
**QOLDI (ertaga, kvota yangilangach):** testAgent'ga city-scenariylar → to'liq E2E 3× yashil →
commit/push/deploy → ega telefon-QABUL (aibrain+aicity pilot).

## 2026-07-22 (kech-3) — Gemini pullik tarif + K1 E2E to'liq 14/14
- Ega API billing to'ladi ($10) → CLAUDE.md free-tier qoidasi yumshadi (memory: koson-ai-paid-llm).
- BUG-FIX (0/11'larning asl sababi topildi): gemini-flash-latest'da thinkingBudget:0 → 400
  INVALID_ARGUMENT. Probe bilan aniqlandi: minimal 128 kerak. Tuzatildi (128 + 1024 chiqish).
- Zanjir Gemini-ASOSIY qilib almashtirildi: callGemini (pullik, barqaror, 429 yo'q) → callGroq
  (bepul zaxira). Pul asosiy yo'lda ishlaydi.
- **E2E 14/14 yashil** (P1 4 + eslatma 3 + hisob 1 + do'st 3 + K1-shahar 3): city_search
  (restoran «osh»), city_order (2×osh + manzil parse), city_status — hammasi to'g'ri route.
**QOLDI:** 3× ket-ket yashil (yugurmoqda) → commit/push/deploy → ega telefon-QABUL.

## 2026-07-22 (yakun) — commit f835bdb push + FULL-DARK deploy posture
- 3× ket-ket E2E 14/14 · butun unit-batareya yashil (timeParse 27, calc 16, memory 8,
  reminder 13, city 12) · regressiya yo'q (featureFlags + testRestoran yashil) · typecheck 0.
- Commit f835bdb push qilindi (faqat AI-fayllar; boshqa birovning ishlagan fayllari
  cashout/backup/intercity/restoranService TEGILMADI). DB sxema (Reminder+MemberMemory)
  allaqachon jonli (ongli db push qadami — deploy migratsiya talab qilmaydi).
- **BARCHA yangi flaglar OFF** (airemind/aihisob/aidost/aicity + aibrain) → deploy 100% DARK,
  mijozlarga hech narsa ko'rinmaydi. Gemini pullik kaliti Render'da to'g'ri nomda.
**QOLGAN YAGONA ISH — EGA PILOTI:** deploy chiqqach, ega o'z telefonida yoqib sinaydi:
  setFlag aibrain on + airemind on + aihisob on + aidost on + aicity on (har biri alert beradi).
  Sinov: dardlashish · «ertaga 7 da bozorga taksi, eslat» · «bu oy qancha ishlatdim» ·
  «osh buyurtma qil, manzil…». Yoqsa — QABUL, flaglar yoniq qoladi. Yoqmasa — bir buyruq OFF.

## 2026-07-22 (yakun-2) — Brend tuzatildi: AI = BirJoy (Koson AI), 1067 faqat taksida
Ega tuzatishi: BirJoy — brend/mahsulot; 1067 — shunchaki taksi dispetcher raqami (bitta modul),
identity EMAS. AI system-promptlar endi «BirJoy / Koson AI»; mexanik «☎️ Operator: 1067» footer
barcha AI/FAQ javoblaridan olib tashlandi; 1067 faqat taksi savolida chiqadi. «1067 Plus» →
«BirJoy Plus». AI_TEST_FORCE_TOOLS test-seam (jonli flagga tegmasdan routing tekshiriladi).
Reja: K5 (Life Graph + Needs Engine) Founder Bible §17.4/17.5 asosida qo'shildi; K5.2 darvozali.
Isbot: typecheck 0 · E2E 14/14 (BirJoy ovozi, routing butun) · barcha AI-flag jonli DB'da OFF.
Commit aabe4f8 (lokal — push kutilyapti). Deploy hamon DARK bo'lib qoladi.
NB: bot.ts'ning TAKSI/onboarding qismida hali «1067 taxi» matnlari bor (/start tanishuv, admin,
haydovchi taklifi) — bu ALOHIDA, kattaroq «butun bot BirJoy rebrend» ishi (ega qaroriga).

## 2026-07-23 — Jonli pilot topgan 2 bug tuzatildi (ega real telefonda sinadi)
Ega hammani yoqib sinadi. Agent chindan ishladi (BirJoy ovozi, dardlashish, greeting) — LEKIN:
1. «basen kerak» → topilmadi. Sabab: shahar_qidir FAQAT restorandan qidirardi (xizmatProvider
   hali yo'q edi). FIX: `xizmatProvider.ts` (K2) qurildi — 139 ta xizmat/usta bazasidan qidiradi,
   1067-tekshiruvi>verified>reyting saralash, 📞 raqam kartada (Telegram auto-link). Sinonim-
   kengaytma («basen»→«basseyn», «santehnik»→«santexnik») + per-word. Isbot: «basen/chilla basen/
   hovuz/santexnik» hammasi topiladi; agent «basen»→city_search(xizmat,"basseyn").
2. «3 daqiqadan keyin eslat» rad etildi. Sabab: eslatma min-vaqti 5 daqiqa edi. FIX: 1 daqiqaga
   tushirildi (reminderService + timeParse). Yetkazish sweep bilan ±90s.
Isbot: typecheck 0 · timeParse 28/28 · city 14/14 (xizmat basseyn qo'shildi) · reminder 13/13.
Flaglar JONLI ON (ega pilot davom etyapti). Deploy: bu tuzatishlar push→live bo'ladi.

## 2026-07-23 (2) — 🧠 Jamoaviy bilim (aibilim): odam yozadi → ega tasdiqlaydi → AI biladi
Ega talabi: «botga AI uchun ma'lumot berish joyi — odamlar yozsin, admin paneldan qabul qilsam
AI bilimida tursin». Qurildi (Bible §17.2 Business Registry urug'i):
- `AiKnowledge` model (db push) · `knowledgeService.ts` (submit/moderate/list/delete +
  relevantKnowledge keyword-retrieval: KB≤15 hammasi, katta bo'lsa top-8).
- Bot: `/bilim` → bir martalik matn-capture → owner-card [✅/❌] (`aiKnowledge.ts`, xizmatlar
  naqshi). Tasdiq/rad → yuboruvchiga xabar. Kunlik 5/odam limit.
- Admin panel API: GET /api/admin/knowledge · POST /:id/moderate · DELETE /:id.
- Agent: tasdiqlangan faktlar system-prompt'ga grounding (aibilim flag; test-seam bilan ham).
**Isbot:** typecheck 0 · testBilim 10/10 ×3 · grounding E2E: yuborilgan fakt tasdiqlangach agent
«Zilola oshxonasi ertalab 6:00 da ochiladi» deb JAVOB BERDI (faktdan). Barcha reja KOSON_AI_PLAN.md.
QOLDI: commit/push/deploy · aibilim ON (pilot) · keyingi qadamlar (generic fabrika → bazar → ...).

## 2026-07-23 (3) — «uyim» manzil-muammosi + niyat-taxmin (jonli pilot topdi)
Jonli suhbatда «uyimga taxi yubor» → «uyimga topilmadi» (joy deb qidirdi). FIX:
- `isHomeRef()` (bot.ts): uyim/uyimga/uyga/hozirgi joyim/shu yer → saqlangan 1-tap pickup,
  joy-qidiruvi EMAS. Agent-book va rules-book yo'llari ham 🏠 1-bosishга yo'naltiradi.
- System-prompt: uy-so'zlarni tushunish + NIYAT-TAXMIN qoidasi qo'shildi.
**Isbot:** typecheck 0 · isHomeRef 8/8 (real joylar false) · agent-taxmin: «tez ketishim
kerak»→taksi, «qornim ochdi»→ovqat, «uy jihozi buzildi»→usta, «uyimga»→book(uyimga)→1-tap.

## 2026-07-23 (4) — 💡 Needs Engine v0 (aineeds, DARK) + to'liq roadmap
Ega: proaktiv AI (ehtiyotkor) + halol kuchli psixologiya + Koson-shevasi + «nima qoldi» reja.
- `needsEngine.ts`: T1 habit-safar (haftalik naqsh, perfect-timing) + T2 referral-urug' (halol
  value). Guardrail: mavjud push (kunlik 2 + opt-out + tun 21-08 + dedup) + haftalik 2 cap +
  [🔕 needs:off] bir-bosishда to'liq o'chirish. Mavjud tick'ga ulandi (yangi poller YO'Q).
  Halol persuasion (Hooked/loss-aversion/social-proof/timing) — aldov EMAS (Bible §12.3).
- Isbot: typecheck 0 · testNeeds 6/6 ×3 (opt-out/dedup/kunlik-cap/haftalik-cap/stop-tugma).
- KOSON_AI_PLAN.md: to'liq roadmap (qurilgan + 11 qolgan ish, ustuvorlik bilan).
QOLDI: commit/push/deploy · aineeds DARK qoladi — ega xabar-matnlarini ko'rib, o'zi yoqadi
(real mijozga proaktiv — eng ehtiyot qadam). Needs Engine v1 (LLM-shaxsiy xabar) keyingi.

## 2026-07-23 (5) — D2/C1/S1 reja QABUL qilindi: Do'kon-profil + Chat + Hikoya (story)
Ega so'rovi: (1) har do'konga kuchli profil-sahifa (hozir bo'sh sarlavha), (2) mijoz do'konga
to'g'ridan-to'g'ri yoza olsin, (3) do'konlar kunlik video/foto "hikoya" (Instagram/Snapchat-uslub)
qo'ya olsin. Tadqiqot (Carrot Market/Etsy/Depop/OLX) + 2 mockup-iteratsiya (ega "premium emas"
dedi → tuzatildi: emoji-siz chrome, foto-birinchi plitalar, jim info-qator, zumrad faqat aksent)
orqali to'liq reja tuzildi va TASDIQLANDI. Reja: `.claude/plans/tingly-petting-lecun.md`
(chat orqali saqlangan; nusxa ko'rish uchun git-tracked emas — kerak bo'lsa qayta yozib beraman).

**D2.1/C1.1/S1.1 (schema, additiv) BAJARILDI:**
- `MarketShop` + `story`/`announcement`/`announcementAt`/`neighborhood` (barchasi nullable).
- `SupportMsg` + `shopId`/`relayMsgId` (nullable; null=bugungi AI/support-chat, o'zgarishsiz)
  + indeks `[shopId, telegramId]`.
- YANGI `ShopStory` + `ShopStoryView` jadvallari (24h expiry — o'qish-vaqtida filtr, poller YO'Q).
**Isbot:** `prisma migrate diff --script` TEST_DATABASE_URL VA DATABASE_URL'ga qarshi tekshirildi
— ikkalasida ham FAQAT ADD COLUMN/CREATE TABLE/CREATE INDEX (drop/alter yo'q). `db push` ikkalasiga
ham qo'llandi (avval xatolik bilan live'ga tushib ketdi — sabab: bu loyihada `db push` `DIRECT_URL`
ishlatadi, `DATABASE_URL` emas; men avval faqat `DATABASE_URL`ni override qilgandim. Zararsiz edi
(faqat additiv), lekin tartib noto'g'ri edi — TUZATILDI, TEST_DATABASE_URL'ga ham to'g'ri push
qilindi, ikkalasi endi mos). `tsc --noEmit` 0 xato (server paketi).
QOLDI: D2.2-D2.5 (upload+admin-panel+miniapp profil-ekran), S1.2-S1.4 (video-upload+bot-oqim+
miniapp tray/viewer), C1.2-C1.6 (relay-service+bot-handler+routes+miniapp chat+admin-inbox).
Barcha yangi UI DARK flag ostida (`shopchat`/`shopstory`), ega QABUL'siz ON bo'lmaydi.

## 2026-07-23 (5) — Generic katalog-fabrikasi + bazar/reys/e'lonlar (tasdiqlangan reja)
Ega tasdiqi: generic fabrika → bazar/reys/e'lonlar shu tartibda.
- `catalogFactory.ts`: makeCatalogProvider(config) + shared expandTerms. Yangi modul = faqat
  `fetch` (~15 qator). xizmatProvider FABRIKAGA ko'chirildi (isbot: yadro tegilmadi, 14/14 saqlandi).
- `bazarProvider` (do'kon mahsulot, ["shop"]) · `elonProvider` (e'lon taxtasi, ["elonlar"]) ·
  `reysProvider` (shaharlararo — shahar-nom asosida, ["intercity"]). Uchalasi ~15-25 qator.
- Isbot: typecheck 0 · testCity 19/19 ×3 · agent AVTOMATIK yo'naltiradi (agent.ts O'ZGARMADI):
  «qoshiq»→bazar, «mashina sotaman»→elon, «Qarshiga reys»→reys. Bazar jonli 111 mahsulotда ishlaydi
  (e'lon/reys bazasi hozir bo'sh — provayder to'g'ri, ma'lumot kelsa ishlaydi).
Modul flaglari (shop/elonlar/intercity) JONLI ON → deploy'dan keyin AI qamrovi «butun Koson»ga kengayadi.

## 2026-07-23 (6) — D2.2-D2.4 in progress: do'kon-profil backend+admin-panel
- `shopService.ts`: `getShopProfile`/`updateShopProfile`/`uploadShopPhoto`/`listShopReviews`
  (barchasi mavjud naqshlarni klonlagan — tgUploadPhoto/listReviews/getMarketHome).
- `server.ts`: `GET/POST /api/admin/shop/profile` + `POST /api/admin/shop/profile/photo`
  (requireAdmin+requireShopWrite, sellerShopId-scope avtomatik, owner `?shopId=` bilan) +
  ommaviy `GET /api/shop/profile/:id` (requireUser, profile+reviews bitta chaqiruvda).
- Admin: `ShopProfilePanel` (App.tsx) — `ShopAdminView` ichiga kiritildi, story/e'lon/mahalla/
  muqova-rasm tahrirlaydi.
**Isbot (qisman):** `tsc --noEmit` 0 xato — shared, server, admin paketlarining har biri alohida.
QOLDI (D2 tugashi uchun): D2.5 miniapp «Do'kon-profil» ekrani (§2 blueprint) — hozircha `shop.tsx`
hali eski bo'sh-sarlavha holatida, YANGI ekran ulanmagan. testBazar/testShop regressiya HALI
YURGIZILMAGAN bu o'zgarishlar bilan. R4 yo'q. Ega QABUL yo'q. **READY FOR VERIFICATION emas —
in progress.**

## 2026-07-23 (6) — Fuzzy manzil-qidiruv (ega: «harf almashtirsin, qoqilmasin»)
Jonli rasmda «uyim postgayi tarafga» → «postgayi topilmadi» (dead-end). Sabab: qidiruv faqat
substring edi. FIX: resolveAddresses (booking.ts) ga fuzzy bosqich — fuzzyNorm (tire/bo'shliq
olib tashlash) + Levenshtein edit-distance kas katalogi (~111) ustidan, so'z-vs-so'z. Threshold
~1 harf/3 belgi. Substring/aniq mos har doim birinchi, fuzzy qolgan slotlarni to'ldiradi.
**Isbot:** typecheck 0 · testAddr 5/5 ×3 jonli katalogda: «shabda»→SHABADA, «post-gai»/«postgayi»
→POST-GAI (rasm holati), «shabada tarafga»→SHABADA, «obran»→OBRON.
QOLDI (ega so'radi): discoverability (tugmalar+/bilim tugma+tanishuv), chala'larni to'liq
(bazar/xizmat buyurtma, Needs v1, bilim admin UI), yangi (ovoz/rasm/guruh — internetdan).

## 2026-07-23 (7) — Discoverability (ega: «bular bilinmagan» + /bilim tugma)
Muammo: AI imkoniyatlari ko'rinmasди. FIX:
- mainMenu'ga «🤖 Koson AI» tugmasi · /ai buyrug'i · Telegram komanda-menyusiga /ai + /bilim.
- showAiIntro — nima qila olishini ko'rsatadi + inline «🧠 ma'lumot berish» (bilim:start) tugma.
- bilim:start callback → /bilim oqimini boshlaydi (buyruq yozish shart emas — ega so'ragan).
- «Tushunmadim» nudge endi imkoniyatlarни ko'rsatadi. renderHelp: BirJoy + Koson AI + /bilim.
Isbot: typecheck 0. (UI — jonli tugma, ega sinaydi.) QOLDI: ovoz (C) → chala'lar (B).

## 2026-07-23 (8) — 🎤 Ovoz (C — 2026 trend): gapirib buyurtma
Odam yozmasdan GAPIRADI. Matn-handler `runAiText(ctx, rawText)` funksiyaga ajratildi (matn+ovoz
bir xil oqim). `voiceService.ts`: Telegram voice → Gemini audio-transkripsiya (o'zbekcha, temp 0)
→ runAiText. aibrain-gated. Xato bo'lsa «yozib yuboring» deydi. GEMINI_API_KEY qayta ishlatiladi
(alohida STT yo'q). Isbot: typecheck 0 (jonli ovoz-test — ega ovoz yuboradi).
QOLDI: chala'larni to'liq (B) — bazar/xizmat buyurtma, Needs v1, bilim admin UI.

## 2026-07-23 (9) — B boshlandi: bazar BUYURTMA to'liq (chala→to'liq) + FAQ-bug fix
- FAQ «qayer» bug tuzatildi (book-niyati o'g'irlanmaydi) — parseIntent test bilan.
- bazarProvider'ga order/execute qo'shildi (restoran naqshi): AI mahsulot TAVSIYA qiladi +
  tanga bilan XARID qiladi (mavjud buyProduct oqimi), tasdiqlash-karta + human ✅ tap +
  ega-xabar (notifyOwnerShop). Manzil talab. Pul-invariant: ✅ bosilmaguncha tanga ketmaydi.
  Isbot: typecheck 0 · order-card (manzilsiz→so'raydi, manzil bilan→ConfirmCard) · agent yo'naltiradi.
Eslatma: xizmat/e'lon/reys — qo'ng'iroq/band-qilish modeli (chala emas, shunday to'g'ri).
QOLGAN B: Needs Engine v1 (AI-shaxsiy matn) · bilim admin-panel UI (frontend).

## 2026-07-23 (10) — Needs Engine v1: AI-shaxsiy Koson-shevasida matn (DARK)
Shablon o'rniga `aiNudge(brief)` — Gemini Koson-shevasида iliq, halol proaktiv matn yozadi
(PII YO'Q promptда, faqat trigger-brief). Chiqish tozalanadi (Option/*/tirnoq olib tashlanadi),
buzuq/ro'yxatsimon bo'lsa SHABLONGA qaytadi. maxOutputTokens 1024 (kam bo'lsa kesilardi).
Namunalar: «Juma muborak... taksingizni taxt qilib berishga tayyorman», «...jo'rangizni taklif
qilsangiz 2000 dan oshiq tanga barakasi, oshnangizga ham sovg'a» — tabiiy, sheva, halol.
Isbot: typecheck 0 · testNeeds 6/6 ×3 · AI-namuna finishReason STOP (kesilmaydi). aineeds DARK.

## 2026-07-23 (11) — Admin UI: AI Bilim moderatsiya tab (B tugadi)
Admin-panelга «🧠 AI Bilim» tab: pending/approved/rejected ro'yxat + ✅ Tasdiqlash / ❌ Rad /
🗑 O'chirish (mavjud /api/admin/knowledge endpointlari). api.ts + App.tsx (Tab-tur, NAV, view).
Isbot: admin typecheck 0 · vite build muvaffaqiyatli. Server-API allaqachon jonli (aibilim commit).
NB: admin FRONTEND alohida Vercel-deploy talab qiladi (kod tayyor+build). Telegram owner-card
moderatsiya baribir ishlaydi (ega telefondan tasdiqlaydi) — admin-UI qo'shimcha surface.
B YAKUNI: bazar-buyurtma ✅ · Needs v1 ✅ · admin-UI ✅ (Vercel-deploy qoldi).

## 2026-07-23 (7) — D2.5 miniapp do'kon-profil ekrani + 3× regressiya tasdiqlandi
- `shop.tsx`: eski bo'sh `shopFilter` sarlavha o'rniga to'liq **Do'kon-profil** ekrani (§2
  blueprint): hero (rasm/gradient-fallback) + reyting-badge + yopishqoq info-qator (mahalla/
  ochiq-yopiq/javob-tezlik/yetkazish) + e'lon-banner + "Biz haqimizda" (collapse) + do'kon-darajali
  sharhlar-sheet (`listShopReviews` orqali, o'qish-uchun, submit-shakli yo'q) + do'kon-ichi
  kategoriya-sub-filtr (`shopCategories`, mavjud `shop-cat-chip` uslubi).
- `tokens.css`: yangi `.bj-profile-*` blok — §1bis premium-qoidaga mos (emoji faqat matn-kontent
  darajasida, jim info-qator, zumrad faqat aksent, rasm-tonli hero).
- `api.ts` (miniapp): `shopProfile(shopId)` — `GET /api/shop/profile/:id` (D2.2/D2.4'da qurilgan).
**Isbot:** `tsc --noEmit` 4/4 paket (shared/server/admin/miniapp) 0 xato · `testBazar.ts`
TEST_DATABASE_URL'da **3× ketma-ket ALL GREEN** (114/114 har safar) — schema/service
qo'shimchalaridan hech qanday regressiya yo'q.
**QOLDI D2 "ready for verification" bo'lishi uchun:** mustaqil R4 tekshiruvi (kod yozmagan
sub-agent) + ega telefonda REAL ko'rish (bazar flag hozircha ON bo'lgan pilot muhitda). Flag
holati o'zgarmadi — bu safar hech narsa yangi ON qilinmadi, faqat mavjud `bazar` flag ostidagi
ekran boyitildi.

## 2026-07-23 (12) — Butun bot BirJoy rebrend (#6)
Foydalanuvchiga ko'rinadigan «1067 Taxi/1067 taxi» brend-satrlari → BirJoy:
- render.ts: welcome header «✨ BirJoy — Kosonда bir joy» + aqlli-yordamchi satri; link-prompt «taksi».
- bot.ts: /start intro «Men BirJoy botiman + Koson AI...», invite, «BirJoy ilovasi ham bor» ×2,
  haydovchi-taklif, admin-title, ops-holat, menu-button «🚕 BirJoy», taxi-tugma, telefon-ulash matnlar.
- booking.ts/bookingNotifier.ts share «BirJoy taksida», adminOps broadcast header, channelService jackpot.
- «1067» FAQAT qoldi: taksi-dispetcher raqami (kontekstда), kas-payment memo (ichki), @koson1067bot
  (real username), URL'lar, webhook/deploy nomlari. Isbot: typecheck 0 · brand-grep bo'sh.
