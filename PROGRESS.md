# PROGRESS

## Bajarildi
- A-to'lqin: iqtisod rebalans (clamp 350), jonli safar kartasi + harakatlanuvchi pin, safar-ichi g'ildirak/taxmin/kombo, Analitika tab.
- B: Garaj (5 mashina, daqiqa-stavka faqat real safarda), haydovchi haftalik tierlari (percentildan) + kvestlar, aqlli push (2/kun cap, quiet hours).
- C: Kolleksiya (mintCap+serial, resale 10% burn), mashina qismlari dropi, Koson kvesti, recruit QR (100→25 revshare), TANGA rebrand, jackpot ticker.
- D: 1067 Plus (9990/oy, 1-oy bepul, cap'langan boostlar), Gap davralari (rotatsion pot), B2B prepaid registr, Mashina fondi (100 so'm/safar).
- E: narx-bashorat (delivered tarixidan), jonli bo'sh-mashina pinlari, ⭐ baho+teglar, rules-first AI (LLM kalitsiz o'chiq), savdo escrow/barter/chat, rejali safar (T-10 dispatch), oila uchun chaqirish.
- Admin: Jonli xarita, 360 qidiruv, kill-switch, korp, mashina hisoboti, operator-token (rollar-lite), recruit QR PNG.
- Testlar: 15 suite (~250 tekshiruv) yashil. Deploy: Render + Vercel (bundle-grep isbotlangan).

## Jarayonda
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

## T3 YAKUNLANDI (REAL ISBOT, 2026-06-13)
- coin→tanga: user-facing 'coin' = 0 (bot.ts+render.ts tuzatildi; grep isbot).
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

## Keyingi qadam
- T0.5 YAKUNLANDI (2026-06-12): 11 commit — jackpot insert→claim tartibi, referral konvergensiya+alert, withdraw/topup pending-marker+tick-retry, trade/buy atomik tx + sellerpay-marker, atomicIncrement, 1.1 o'chirildi; testMoneyShield 26/26 + 8 suite regressiya yashil; deploy qilindi.
- T1 BAJARILDI (2026-06-13 02:30): design/tokens.css (spec palitra + legacy-remap + motion + reduced-motion) · komponentlar (Button/Sheet/CoinCounter/LoadSection/RouletteWheel/TierBadge...) · lazy #demo (7.4KB alohida chunk, API'siz) · cold-start IKKI ekran (offline vs uyg'onmoqda+avto-retry) · 4.1/4.2 prompt→Sheet · 4.5 garaj/box/lookup xato-holatlar · miniapp style={{ }} = 0 (admin'dagilar T7 da) · WOW-14 joriy · booking.tsx logika-diff: faqat familyAdd prompt→Sheet ko'chishi. Keyingi: ega telefonda 6 ekranni ko'radi → "dizayn QABUL" → T2.
- T0 YAKUNLANDI (2026-06-12): AUDIT.md yozildi — 5 parallel auditor + adversarial verify (13 agent); 2 o'lik kod, 18 sekinlik, 17 xavf (eng muhimi: jackpot claim insert'dan oldin — 3.1), 24 UX dard, 14 arx-qarz, TOP-10. Hech bir manba fayl o'zgarmadi.
- Ochiq plan-bandlari: SeasonEvent freymvork, talab-heatmap, ochiq vitrina/PNG karta, safar-hafta streak ×1.1-1.3, oylik 🎟 o'yin tadbiri, MapLibre Booking 3.0 to'liq ekran.
- Egadan: bepul LLM kaliti (Gemini), Postgres ko'chirish (2026-07-10 gacha), 3-5 Bozor do'koni.
