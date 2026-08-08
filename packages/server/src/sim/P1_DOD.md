# P1 (MVP-simulator) — DoD ISBOT-JADVALI (2026-08-08)

Holat: **READY FOR VERIFICATION** (12/12 band isbotlangan). Har band: buyruq + xom natija.
"Done" — faqat ega qabulidan keyin (CLAUDE.md R1/R6).

⭐ MEXANIKA-TOPILMA (mech-mech1, o'yin JONLI): o'yin yoqilganda growth **4.80×** (baseline 0.93×) —
lekin solvency "Growing"dan "Fragile"ga tushdi (sovrin-to'lovlari kassani siqadi). Bu — egizakning
bosh vazifasi: o'yin o'sish beradi, LEKIN solvency-xavf tug'diradi. A-H armlari (P3) buni raqamlaydi.

| # | Band | Holat | Isbot |
|---|---|---|---|
| A1 | Docker-PG + `prisma db push` | ✅ | `[provision] konteyner yo'q — yaratilmoqda (birjoy-sim-t1, port 5434)` → `Your database is now in sync with your Prisma schema. Done in 2.43s` (smoke-run log) |
| A2 | `_simDb` 2+ salbiy-sinov | ✅ | `SIM_GUARD_CASE=a/b/c npx tsx src/sim/_simDb.negative-test.ts` → 3/3: URL'siz RAD (`SIM_DATABASE_URL kerak`), Neon RAD (`Neon host taqiqlangan`), app-baza-nom RAD (`birjoy_sim bilan boshlanishi shart`) |
| A3 | SimClock: sim ichida vaqt=sim-vaqt, oynalar siljiydi | ✅ | 60-kunlik runlarda sezon-fazalar/kunlik-keshlar sim-sanada ishladi; `[simClock] vaqt orqaga surilmaydi` qo'rig'i 2 ta real tartib-xatoni ushladi (tuzatildi) |
| A4 | timestamp-fixup: sentinel-qoldiq = 0 | ✅ | `assertNoSentinel` HAR tik oxirida yuradi (collector.ts:72) — 100+ runda birorta ham otilmadi; otilsa run yiqilardi |
| A5a | Real `rollRideCashback` orqali safarlar | ✅ | kalibratsiya-runlar: oylik 543-727 safar, hammasi RideReward real-yozuvlari (`computeRunSummary` DB'dan o'qiydi) |
| A5b | Real `buyTicket` + 1 to'liq tiraj-ritual (freeze→drawList→adminRecordWinner) | ✅ | mech-mech1 run: **18 real chipta-xarid** · **2 g'olib to'liq ritual orqali** (`winner Gaz plita → a'zo #94005 (gno 729485, 450 000 so'm)`, `winner Smartfon → gno 729491, 600 000 so'm`) · Docker-bazada 3164 RideReward qatori (`docker exec ... psql`) |
| A6 | Flag/knob/sezon konfigdan | ✅ | `[provision] seed: 5 flag · 0 knob · mavsum SIM · katalog=small` har runda; knob-yozuv `setBonusEcon` orqali (clamp-tekshiruvli) |
| B-cal | **Kalibratsiya-darvoza (L2): ≥8/10 nishon** | ✅ | `calibrate.ts` iter-8: **8/10** — N1 543 (642±128) ✅ · N2 142 (127±25) ✅ · N3 73.8% (72.5±10) ✅ · N4 18.4% (19.4±5) ✅ · N7 74.4% ✅ · N8 65.1% ✅ · N9 8.9% ✅ · N10 0 ✅ · N5 68.2% (❌ +1.8pp) · N6 66.9% (❌ +2.5pp). Jurnal: `sim-out/_calibration/calibration-journal.md`, muhr: `calibrated-params.json` |
| B-det | **Determinizm: bir seed 2× = bir hash** | ✅ | `--seed det1` 2×: ikkalasi `657be73f...` (slo/devor-soat hash'dan chiqarilgan; real-kod `Math.random` seeded-shim) |
| B-dist | 100-500 seed-run taqsimoti | ✅ 100/100 | `dist-report.json`: growth× median **0.93** (p5 0.81, p95 1.09) · 93% baseline-bucket · oylik safar median 596 (real 642) · rider 139 (real 127) · solvency 100/100 "Growing" · bankrotlik 0. Real ma'lumot bilan mos (9-haftalik plato). |
| B-dash | Dashboard-MVP jonli | ✅ | `localhost:5555` brauzerda ochildi: sarlavha + 4 grafik-bo'lim render, konsol-xato 0 (`sim-dashboard` launch-entry qo'shildi) |
| B-run | Runtime o'lchandi | ✅ | 60-kun × 5000-aholi ≈ **52-90s/run** (kalibratsiya-log) — P3 uchun asos: 365-kun ≈ 6-9 daq/olam |

## Topilgan-tuzatilgan xatolar (sim o'zi-o'zini tekshirdi)
1. run.ts'dagi ikkinchi `resetSimData` endigina urug'langan flag/mavsum/katalogni o'chirardi — "chipta abadiy 0"ning asl sababi.
2. Real kod `Math.random` (cashback-tier roll) determinizmni sindirardi — seeded-oqim shimi.
3. Sub-faza soat-tartibi 2 joyda orqaga surilardi (a'zo-yaratish 08:00 vs safar 07:00; safar-oyna 21:00 vs o'yin 19:00).
4. `tsx -e` salbiy-sinovlari noto'g'ri sabab bilan "o'tgan" — haqiqiy sinov-faylga almashtirildi (isbot-sifat saboqi).

## Qamrov-cheklovlar (halollik, R8)
- N5/N6 ~2pp tashqarida (rider-yopishqoqlik qoldig'i) — P2 backtest oldidan yana bir kalibratsiya-urinish rejalashtiriladi.
- O'yin-oqim (chipta/tiraj) kalibratsiyada tabiiy 0 (real nol-startga mos) — mexanika A5b alohida jonlantirilgan runda isbotlanadi.
- Fidelity-yo'l (KasMock+pushBookingUpdates taqqoslash) P1 doirasiga kirmadi — P3'da.
- Sim-kod hali commit qilinmagan (ega ko'rsatmasi bo'yicha commit/push alohida so'raladi).
