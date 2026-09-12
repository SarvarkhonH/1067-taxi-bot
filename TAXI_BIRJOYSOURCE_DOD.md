# TAXI F1-BRIDGE — Slice 5 DoD: `BirJoySource` (`KAS_MODE=birjoy`)

**Repo:** A (`1067 bot`) · **Holat:** ega tasdiqladi, bajarilyapti · **Sana:** 2026-09-09
**Kontekst:** [BIRJOY_TAXI_MASTER.md](BIRJOY_TAXI_MASTER.md) §4-§5 · [KAS_PARITET.md](KAS_PARITET.md) §6
**Qoida:** A `CLAUDE.md` tanga invariantlari — ≤350 clamp · CoinTxn + idempotent kalit · korp-ledger
alohida · yangi poller YO'Q (sweep kengaytiriladi) · "coin" so'zi UI'da YO'Q.

## Maqsad
Kas1067'dan uzilishning uchinchi implementatsiyasi: `BirJoySource implements KasDataSource` — bot (A)
taxi ishini B (`1067-taxi`) API'sidan o'qiydi. Almashish = `KAS_MODE=birjoy`, orqaga qaytish `=live`.

## Fayllar
- `packages/server/src/env.ts` — `KAS_MODE` enum + `KAS_BIRJOY_URL` + `KAS_SERVICE_TOKEN`
- `packages/server/src/kas/types.ts` — `name: "mock" | "live" | "birjoy"`
- `packages/server/src/kas/index.ts` — `getDataSource()` uchinchi shox
- `packages/server/src/kas/birjoy.ts` — YANGI: `BirJoySource`
- `packages/server/src/kas/birjoy.spec.ts` — YANGI: shakl/parity testlari
- `.env.example` — `KAS_BIRJOY_URL`, `KAS_SERVICE_TOKEN`

## Bajarilish tartibi (sub-qadamlar)
- **5a — Skelet:** ✅ DONE (commit 7276eb45, A repo ahead 1). env enum + `name` tipi +
  `getDataSource()` 3-shox + `BirJoySource` (HTTP chokepoint + `x-service-token`) + getCarModels
  real (chokepoint isboti) + 26 stub (reject). Isbot: `pnpm -r typecheck` exit 0 + tsx verify.
  Flag o'chiq (`KAS_MODE` "live"/"mock" qoladi) → dormant, jonli ta'sir nol.
- **5b — 24 HTTP metod:** 7 to'liq + 17 qisman → B endpointlariga. B javobini `KasDataSource`
  tip-shakliga map qilish.
- **5c — tanga metodlar (§5):** `setClientBonus`/`addClientBonus`/`getBonusRules` + `RideHistoryItem.cashback`
  → **A ichida** (coinService/tanga daftari), B'ga bormaydi. Sync metodlari no-op (coinService yagona hokim).
- **5d — parity + regressiya testi.**

## Qabul mezonlari (har biri buyruq+natija bilan isbotlanadi)
1. `KAS_MODE` `"birjoy"` qabul qiladi; default `"mock"` o'zgarmagan. **Tekshiruv:** env parse testi + `.env` grep.
2. `KasDataSource.name = "mock" | "live" | "birjoy"`. **Tekshiruv:** `tsc --noEmit`.
3. `KAS_MODE=birjoy` → `BirJoySource`; live/mock o'zgarmagan. **Tekshiruv:** `getDataSource` unit test.
4. 27/27 metod implementatsiya qilingan; **birortasi `throw new Error("not implemented")` EMAS**.
   **Tekshiruv:** grep + metod-ro'yxati bo'yicha test.
5. Har metod B javobini `KasDataSource` shakliga map qiladi. **Tekshiruv:** parity test — `KasMockSource`
   shakliga solishtirish (HTTP mock bilan), har metod uchun.
6. Tanga metodlari A ichida hal bo'ladi; ≤350 clamp + CoinTxn idempotent (kalit=`dispatchBookingId`) +
   **yangi poller yo'q**. **Tekshiruv:** unit test + `grep setInterval/setTimeout/Cron` = 0 yangi.
7. `KAS_MODE=live` regressiya — jonli xatti-harakat bayt-bir xil. **Tekshiruv:** mavjud kas testlari +
   `pnpm typecheck` + `simEconomy`/`simLoyalty`/`simGuards` yashil.
8. Hech qanday global flag yoqilmagan; `.env`da `KAS_MODE` o'zgarmagan. **Tekshiruv:** `.env` grep.

## Qamralmagan (ochiq / partial)
- **Uchidan-uchgacha (real HTTP → B):** F2 soya darvozasi. Hozir unit-sinab bo'lmaydi (B lokalda docker'da
  ishlashi kerak). Slice 5 = **build + unit + parity** (B'siz); real round-trip F2'da.
- `getMainReport.completedYesterday` / `listDriverRoster` qo'shimcha maydonlari — B'da hali yo'q (Slice 4
  deferred), BirJoySource mavjud shaklni qaytaradi.

## Xavflar
- Tanga metodlari noto'g'ri → ikki marta tanga. Yumshatish: coinService yagona hokim, sync no-op.
- B qisman-javob shakllari mos kelmasligi. Yumshatish: parity test + shakl assertion.
- A jonli bot — LEKIN `KAS_MODE` "live"/"mock" qoladi (flag o'chiq) → BirJoySource F2'gacha uxlaydi,
  jonli ta'sir NOL.

## Bajarilmaguncha "done" YO'Q — faqat "READY FOR VERIFICATION" + isbot (A CLAUDE.md DoD R1).
