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
- T2 TEZLIK server-tomon BAJARILDI + live (Render). Telefon-o'lchovlari ko'chishdan keyin.
- DB → NEON KO'CHIRILDI (BEPUL, $0): ega bepul yo'lni tanladi (Fly pullik ekan). Neon (eu-central-1, doim-yoqiq, kartasiz) schema `db push` + 4045 satr ko'chirildi (Member 2526 = Render bilan bir xil, ledger drift 0). Render env DATABASE_URL + lokal .env → Neon. **2026-07-10 Postgres muddati MUAMMOSI HAL.** Web Render free'da qoldi (cold-start uyg'onish ekrani bilan). Eski Render PG fallback sifatida 07-10 gacha qoladi (o'chirilmaydi).
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
