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
- T1 DEPLOY QILINDI — EGA TASDIG'I KUTILMOQDA ("dizayn QABUL" demaguncha T2 boshlanmaydi). Revert bir buyruq bilan sinab qo'yilgan: git revert --no-edit ae243eee9f89519da778cdec341834f7c00b7f92^..HEAD

## Qarorlar jurnali
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
