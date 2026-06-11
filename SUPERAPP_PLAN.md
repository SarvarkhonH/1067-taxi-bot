# 1067 SUPER-APP — MASTER PLAN

*Lead architect document. Goes straight to the owner. Every claim below was verified against the real codebase (`coinService.ts`, `economyService.ts`, `schema.prisma`, `referralService.ts`, `bookingNotifier.ts`, `booking.ts`).*

---

## 1. Vision (3 sentences)

When someone in Koson thinks "taxi," they open 1067 — one tap, a car is coming, no menu, no typing. Every ride pays back a variable cashback "ball" that is **spendable** inside 1067 — on the next ride, at the local barber, café, or kiosk — so the money never leaves the loop and the user never leaves the app. Drivers become linked, tippable, withdrawable accounts inside the same ledger, turning our 569-driver liquidity moat into a network that competitors 10x our size cannot copy before Yandex arrives in ~2028.

---

## 2. What we REMOVE — and why

**Remove: all five arcade games — race (poyga), crash (tezlik), duel, quiz (viktorina), park.**

| Why | Detail |
|---|---|
| **Off-strategy** | The MASTER KITOB never asks for arcade games. It asks for a *ride-anchored* habit loop. Arcade reward is decoupled from taxi orders/day — our one real KPI. |
| **They muddy the money story** | A slot-machine jackpot and a real ride cashback currently land in the same `Member.coins` balance, blurring the anomaly detector and the "can someone drain us" answer. |
| **Dead weight** | 5 service files, 7 Prisma models, 5 miniapp components, 14 API routes, 2 periodic sweeps, 3 missions — all maintenance surface that earns us nothing toward #1-in-Koson. |

**What we KEEP** (all already independent of arcade in code): streak, spin/wheel, mystery box, daily quests, league, level, referral, achievements, jackpot, lucky-day. These are the HOOKED variable-reward + investment layer — we re-anchor them to *rides* instead of *games*.

**Removal is zero-loss and order-critical** (verified: the running Prisma client crashes if tables drop before code stops importing them):

1. Deploy a one-time **drain script** refunding live escrow via `grantCoins` (idempotency `arcade_drain:<game>:<id>`) for `RaceSession status='created'`, `Duel status in (created|open|accepted)` (both sides), `CrashRound status='live'`. Park/Quiz hold no escrow.
2. Verify `getIntegrity()` drift === 0; re-run grants nothing.
3. Deploy code purge (stop importing arcade models/services/routes/sweeps; drop the 3 arcade missions; update `render.ts:32` welcome text).
4. Run migration `remove_arcade` (drop 7 models + 8 `Member` relations).
5. Deploy miniapp (tab `O'yin` → `Mukofot`; keep 5 tabs so the `tab-ind` 20% layout is untouched).
6. **Never touch `CoinTxn` rows or `Member.coins/points`** — historical `race|duel|park|quiz|crash` kinds stay as immutable audit history; `getEconomy()` byKind must still aggregate them, and reconciliation (`Member.coins == Σ CoinTxn`) depends on every row surviving. Only **append** new kinds, never remove old ones.

---

## 3. The 4 new pillars

> Order of build is deliberate: **Pillar 0 (the withdraw ride-gate) ships before everything**, because every "can't be drained" claim in Pillars 2–4 rests on it. See §4 and §5.

### Pillar 1 — One-tap "1067 Now"

**User experience.** The second ride onward is **one tap**. We resolve the kas `addressId` *behind* the button instead of in front of the user, via a 5-tier cascade — best of robustness + persistence:

| Tier | Condition | Result |
|---|---|---|
| T1 | GPS within 120 m of last pickup | repeat ride from the usual spot (dominant case) |
| T2 | GPS nearest saved address ≤ 250 m | at a known place, GPS snaps to it |
| T3 | `defaultPickupId` (sticky home) | GPS denied but a default exists |
| T4 | `lastPickup` (persisted) | GPS denied, no default, booked before |
| → | fall through to today's picker | first-time user, or GPS far from everything |

In a small city (Koson), 90%+ of rides are home/work/bazaar repeated — they hit T1/T3/T4. First-timers see today's multi-step picker **once**; that booking teaches the default, and every ride after is literally one tap. This directly serves "1 call or 3 buttons; every extra click loses the customer."

**The real bug we fix.** `lastPickup` lives in an **in-memory `Map` at `booking.ts:19`** and dies on every server restart — silently degrading "1-tap" to "multi-step" after every deploy. (Verified.) We do **not** add a separate table — the `Member` row already carries `lastBookingId/lastBookingStatus`, so we extend the same record and keep the button render a single no-join read.

**Data model delta** (migration `add_oneclick_booking`):
```
Member +=  defaultPickupId Int?  defaultPickupName String?  defaultPickupLat/Lng Float?
           lastPickupId Int?     lastPickupName String?     lastPickupLat/Lng Float?
           lastBookingAt DateTime?   bookingStreakDays Int @default(0)
AddressUse { memberId, addressId, count @default(0), @@id([memberId,addressId]) }  // LATER: auto-promote default after ≥3 uses
```
No `CoinTxn.kind` change, no economy-model change — **booking grants nothing.**

**Key endpoints.** One new contract:
```
POST /api/booking/now  (requireUser, rateLimit(3), withMember)
  body  {lat?, lng?, addressId?}
  → {state: "dispatched"|"active"|"need_pickup"|"throttled"|"confirm_required", booking?, suggestions?}
```
Everything else (`/api/booking/info|active|search|create|cancel|estimate`) stays exactly as-is for the first-timer fallback. The new endpoint wraps the **existing, unchanged `createBookingFor`** — `additionalPayment:0`, no coin grant.

**The response state machine** (single contract both clients branch on):
```
callOneTapFor(memberId, lat?, lng?, overrideAddressId?):
  1. active = getActiveBookingFor()  → if active: {state:"active"}            // never double-book
  2. pickup = resolvePickup()        → if none:  {state:"need_pickup", suggestions}
  3. guards (throttle / cancel-farm) → if tripped: {state:"throttled"|"confirm_required"}
  4. createBookingFor({pickupId})    // EXISTING, additionalPayment:0
  5. on ok: upsert default*/lastPickup*, bump bookingStreakDays (idempotent)
  6. {state:"dispatched", booking}
```

**Bot changes** (`bot.ts`, `booking.ts`):
- `mainMenu()`: promote **one full-width primary button** to the top; label carries the destination — `"🚕 1067 — {short}"` when `defaultPickupName` set, else `"🚕 Taxi chaqirish"`. The label *is* the confirmation, no confirm screen.
- Delete the in-memory `lastPickup` Map; read `Member.default*/lastPickup*`. New `bk:now` callback → `callOneTapFor` (immediate dispatch T3/T4). Keep `request_location` keyboard for GPS-fresh T1/T2.
- Reuse the **already-correct** transition-gated status-push loop (`bookingNotifier.ts:56` already gates on `lastBookingId/lastBookingStatus` change) to `editMessageText` the tracking card on `searching→on_the_way→arrived`. On completion, swap `[✖ Bekor]` → `[🔁 Yana 1067]`.

**Mini app** (`booking.tsx`, `api.ts`): open state = giant hero button + default-pickup chip, map dimmed behind; destination/cars/add-ons collapse behind "⌄ Boshqa manzil". Fire `navigator.geolocation` **once silently** on open; ≤250 m of a saved address → swap chip (T2), else keep default — no permission nag. `api.bookingNow(addressId?)` with money-op retry (1 retry). `{state:"dispatched"}` → existing `TrackingCard`/Timeline (already polls every 3s). `{state:"need_pickup"}` → existing picker inline.

**Fare honesty (taximeter — never fake a quote).** kas has no fixed from→to fare. Show a **rate card**, never a single number: `"≈ 8 000 so'm dan · taximetr bo'yicha"` (`getFareConfig().minimalPayment`) + `"+{cashbackPerRide} so'm bonus qaytadi"`. The cashback line is the variable-reward hook shown at the exact moment of decision.

**Economic guardrails** (this pillar is money-safe *because booking was never a money source*):
- Booking mints **zero coins**, touches **no** withdraw/cashback/kas-bonus path. Faster booking therefore *cannot drain real money*. The money-integrity core is untouched.
- **Active-booking guard** (already present): `getActiveBookingFor` checked first → no duplicate dispatch on double-tap.
- **Repeat-throttle**: reject `/api/booking/now` if `lastBookingAt < 60s` ago with no active booking, + existing `rateLimit(3)/min` on route and `bk:now`.
- **Cancel-farm cap**: track self-cancels per member per Tashkent day in `AppState` (`cancels:memberId:dayKey`) via the exact `$executeRaw` atomic-increment pattern from `consumeWithdrawBudget`. After ≥4 self-cancels/day, the 1-tap button requires the full confirm screen for the rest of the day. These guards protect **driver liquidity** (phantom dispatches — our #1 moat), not the coin economy.

---

### Pillar 2 — Driver platform + wallet + P2P transfer (closed-loop, one ledger)

**The synthesis decision (verified against code).** Keep **ONE currency** (coins, one ledger, one reconciliation). Do **not** add a second balance column or a "credit" currency — that would force duplicating the entire reconciliation + heal + anomaly + withdraw-budget surface, and `healMember`'s `Math.max(0,...)` clamp would silently destroy negative-net positions. Instead split coins into two *spendability classes* tracked by `CoinTxn.kind`.

**User experience.**
- **Driver onboarding = pure gating, zero forms.** `linkByPhone` already returns `type:"driver"` and prefers the driver role (verified). The bot menu shows `"🚗 Haydovchi"` only when `member.type==="driver"`. A client can never self-declare driver — kas must return a driver record (kas-owned phone→driver mapping is the anti-impersonation model).
- **Tip a driver (the HOOKED 1-tap hero).** Ride completes → card shows driver name + `[Rahmat: 1000 · 2000 · 5000]` → one tap → coins move rider→driver in one atomic tx.
- **P2P send.** Wallet → "O'tkazish" → recipient phone + amount + note → "remaining today" → confirm. Recipient resolved by phone; rejected if not linked.
- **Driver wallet** = existing `Member.coins`, relabeled "Daromad."
- **Driver cash-out** reuses `WithdrawSheet`, **budget-gated identically to clients**.

**Data model delta.** ONE new table:
```
Transfer { id, fromMemberId, toMemberId, amount, note?, kind @default("transfer") // transfer|tip,
           idempotencyKey String? @unique, createdAt, @@index([fromMemberId,createdAt]), @@index([toMemberId,createdAt]) }
CoinTxn.kind += transfer_in | transfer_out | tip_in | tip_out | driver_bonus   // values only, no column change
```
No second balance, no `DriverProfile`, no `RideEarning`. Driver wallet = `Member.coins`. Driver identity = `Member.type` + `TelegramUser` link.

**Key endpoints:**
```
POST /api/wallet/transfer   (requireUser, rateLimit(5)) → transferService.transfer(...)
GET  /api/driver/info       → {profile, earnings, todayEarned, txns[]}
GET  /api/driver/earnings   → CoinTxn filtered to tip_in|transfer_in|driver_bonus
POST /api/driver/withdraw   (rateLimit(5)) → generalized withdraw() (driver branch), still consumeWithdrawBudget-gated
```

**Atomic transfer** (new `transferService.ts`): single `prisma.$transaction` — conditional-decrement debit (`updateMany WHERE coins>=amount`, the exact `spendCoins` primitive at `coinService.ts:52`), increment credit, **two paired `CoinTxn` rows**. Net coin supply unchanged → the reconciliation invariant `Member.coins == Σ CoinTxn` holds per-member with **zero changes to `reconciliation.ts`**. Idempotency via `Transfer.idempotencyKey` + `:out`/`:in`-suffixed `CoinTxn` keys.

**Driver cash-out = generalize `withdraw()` — the one true code change.** Today `withdraw()` hard-rejects `type!=="client"` (verified, `coinService.ts:110`). Branch on type:
- **client** → kas client-bonus write (byte-identical to today).
- **driver, A1** → if the driver's phone also exists as a kas client record, reuse `withdraw()` verbatim.
- **driver, A2** (no client record — kas has no driver-balance write API, confirmed `mapDriver` read-only) → create `Withdrawal{kasApplied:false, kasMessage:"driver_manual"}`, deduct coins, `alertAdmins`, settle via the in-bot ops console (commit `e00e0d4`).
- **CRITICAL:** **both** branches call `consumeWithdrawBudget(amount)` FIRST. Driver payouts compete in the same revenue-linked pool — total real-money-out is unchanged.

**Bot/miniapp changes.** `bot.ts mainMenu`: `"🚗 Haydovchi"` (driver-only) + `"💸 O'tkazish"` (everyone). `wallet.tsx`: `TransferSheet` (copy `WithdrawSheet`). New `driver.tsx` tab gated on `me.type==='driver'`. Post-ride `[Rahmat]` buttons on the booking card.

**Economic guardrails:**
- **Closed-loop P2P** is net-zero on supply — it MOVES coins, never MINTS them → cannot increase cash-out exposure by one so'm.
- **Anti-funnel caps** (in `checkTransferLimits()`, before money moves, stored in `AppState` via the `consumeWithdrawBudget` `$executeRaw` pattern): min 500 / per-tx 20k / **daily-sent 30k / daily-RECEIVED 30k** (caps the funnel *target*) / ≤5 distinct counterparties/day / 48h account-age gate (`TelegramUser.linkedAt`) / A→B→A ring-detect → soft-block + `alertAdmins`. A **2% burn** destroys coins on every transfer, so P2P *shrinks* supply. Tips exempt from counterparty-COUNT only (a driver gets many tippers), never from the received-cap.
- **Driver earnings are a bonus overlay, NOT the fare** (solvency-critical): the driver collects the fare in-car (taximeter). Our wallet credits only tips + P2P-in + a flat per-trip `driver_bonus` (~200–300 coin ≤ ~2000 net profit/order). We never owe a driver money the business didn't make.
- **`driver_bonus` deferred to Phase 3** — it needs a `carNumber→driverMember` lookup that doesn't exist yet (`bookingNotifier.ts:52-53` matches by *rider* phone; driver is only known by `carNumber` — verified). When shipped: `idempotencyKey = kas booking id` (no sync-replay double-pay), daily driver earn cap ~20k, only on `status=completed` with a real fare signal.

---

### Pillar 3 — "Bozor": spendable cashback marketplace

**Core insight (verified).** Today coins have one exit — `withdraw()` → 100% real so'm, gated by `consumeWithdrawBudget`. Bozor adds a **cheaper exit**. Per-listing settlement: **ABSORB** (shop honors coins as its own discount → costs us 0) or **REDEEM** (we cash-settle the shop at a spread, default 0.12 → costs us coins×0.88). Unredeemed vouchers cost 0 (breakage). Every coin routed to Bozor instead of `withdraw` saves 30–100% of face value.

**Mechanical correction both naive designs got wrong (verified).** `withdraw()` is hardcoded to the *caller's own* phone and rejects non-clients. So a shop **cannot** be paid by "reusing `withdraw()`." Shop cash settlement MUST be a new path: `addClientBonus(shopOwnerPhone, netSom)` under `withPhoneLock(shopOwnerPhone)`, gated by a **NEW `consumeBozorBudget()`** that clones `economyService` exactly (separate `AppState` key `bozor_budget_used:DAY`, separate `BASE + rides×PER_RIDE` pool). This keeps Bozor cash-out revenue-linked and **double-walled** — it can never touch the user withdraw budget.

**User experience.** Bozor tab → vetted Koson shops by category (geo-sortable, reuse haversine) → listings priced in coins ("Soch olish — 15 000 coin") → "Sotib olish" → coins debited instantly (escrow) → 6-digit voucher code → show code at shop → owner confirms in "🏪 Mening do'konim" → "✅ Vaucher ishlatildi" + tiny engagement drop. Never redeemed → coins already spent, voucher expires (gentle loss-aversion).

**Data model delta** (take simplicity: **shop = a `Member` of `type="shop"`**, synthetic `kasId="shop:<id>"`, phone = owner's verified phone → reconciliation + `getIntegrity` + `getEconomy` byKind for **free**):
```
Shop    { id, name, category, ownerMemberId Int?, ownerPhone, settlementMode @default("absorb"),
          spread @default(0.12), status @default("pending"), trustTier @default(0),
          dailyCap @default(<<small, see guardrails>>), shopMemberId, geoLat/Lng?, createdAt }
Listing { id, shopId, title, priceCoins, settlementMode @default("absorb"), perUserLimit @default(3),
          stock @default(-1), active @default(true), @@index([shopId,active]) }
ShopOrder { id, shopId, listingId, buyerMemberId, priceCoins, shopOwedCoins, settlementMode,
          voucherCode @unique, status @default("issued") // issued|redeemed|refunded|expired,
          idempotencyKey @unique, redeemedAt?, @@index([buyerMemberId,createdAt]), @@index([shopId,status]) }
CoinTxn.kind += market_spend | market_settle
Phase 2: AppState key bozor_budget_used:YYYY-MM-DD
```

**Key endpoints:**
```
GET  /api/market/shops          GET /api/market/listings?shopId=
POST /api/market/buy {listingId}   (rateLimit(10)): self-deal + perUserLimit + velocity guards,
                                    then spendCoins(buyer, price, "market_spend") atomic, create ShopOrder(issued)
GET  /api/market/orders
POST /api/market/redeem {code}     shop-owner-gated, idempotent via status==="issued":
                                    ABSORB → mark redeemed (pay 0); REDEEM → grantCoins(shopMemberId, net, "market_settle")
Phase-2 cron settleShopsWeekly() → addClientBonus(ownerPhone) under withPhoneLock + consumeBozorBudget
```

**Buy flow = escrow.** `spendCoins` debits the buyer immediately; `ShopOrder(status="issued")` is the durable escrow record. **No multi-party atomicity at buy time** because the shop is not paid yet. To close the crash-window (coins debited, no order), create `ShopOrder` as `pending` first, then `spendCoins`, then flip to `issued` — `getIntegrity` catches any drift, refund is a manual heal.

**Trust ladder (the spread debate, resolved).** Safety-ordering as the GATE, spread as the CEILING: new shop (`trustTier 0`) = **ABSORB-only** (0 cash risk). Admin promotes to REDEEM (spread 0.12, floor 0.05, cap 0.30) only after a clean ABSORB track record + manual review. The dangerous cash path is the **last** privilege earned.

**Bot/miniapp.** `"🏪 Bozor"` button + `showMarket`; shop owners get `"🏪 Mening do'konim"` reusing the ops console. New `market.tsx` tab (shop list → listings → buy sheet copying `WithdrawSheet` → voucher card).

**Economic guardrails:**
- Every Bozor spend **BURNS** the buyer's coin (no path back to the buyer's wallet → zero farmable buy-side reward, kills wash-trade-for-profit by construction).
- ABSORB costs exactly 0 cash; new/untrusted shops are ABSORB-only.
- REDEEM uses the separate, double-walled `consumeBozorBudget` — Bozor can never blow the user withdraw budget.
- **Anti-self-deal**: reject buy if `buyerMemberId === ownerMemberId` or buyer phone === owner phone.
- **Anti-wash**: `Shop.dailyCap` (set **well below the bozor budget** — a small multiple of the shop's own ride/revenue contribution, *not* a flat 500k) + `Listing.perUserLimit` + per-buyer→per-shop velocity + fan-in detect (≥5 fresh buyers → 1 shop) → settlement-hold + `alertAdmins` before any cash leaves. Spread>0 means every collusion round-trip BLEEDS 12%.
- **No self-serve onboarding** — manual admin KYC (you know Koson businesses — a moat). Owner is a kas-verified, suspendable phone identity.
- **MVP ships ABSORB-only** with 3–5 hand-picked anchor shops (café, barber, kiosk) for social proof — **zero cash risk** — proving the loop end-to-end with `KAS_MODE=mock`. REDEEM + `consumeBozorBudget` ships in Phase 2 only after anchors validate.

---

### Pillar 4 — Unified economy: ride-anchored variable cashback + spendable coin sink

**The headline loop.** The spine is the ONE ride-completion event (`bookingNotifier.ts`). `cashbackService.rollRideCashback(memberId, bookingId, baseBonus)` rolls the book's 80/15/4/1 distribution: 80%→5% / 15%→10% / 4%→15% / 1%→JACKPOT free ride. Level shifts the floor (VIP base higher — the 5%→15% ladder). Lucky-day (`AppState lucky_day:YYYY-Www`, first ride that day) doubles the band.

**The bug both naive plans missed (verified).** `b.clientBonus` (the fare-derived cashback) is read **live** from the active booking (`bookingNotifier.ts:32`); at the ride-finished branch (`:65`) kas has already dropped the booking from its active list, so the base is **gone**. There is no `lastBookingFare` on `Member`. **Fix:** add `Member.lastBookingBonus Float?`; in the active branch (`:56-63`) write `lastBookingBonus: b.clientBonus`; in the finished branch (`:65`) read it as the base, fire the roll, then null it.

**The grant-path decision (verified, load-bearing).** Grant the band as **COINS** (`grantCoins`, internal), **NOT** `grantCashback` (real kas so'm). `grantCashback` writes straight to kas real money under a 50k/24h cap and *is* the real-money exit; routing every ride's variable reward through it both fights the existing fixed kas cashback and uncaps per-ride real-money leakage. Coins exit ONLY through the existing revenue-budget-capped `withdraw()` or get spent in Bozor. Idempotency `cashback:<memberId>:<bookingId>` + `@@unique([memberId,bookingId])` on `RideReward` → a re-poll grants nothing; no ride = no roll.

**Jackpot re-fed by rides.** Lost its arcade feeders → re-fed by the surviving wheel (`spinWheel→growJackpot`) PLUS a tiny `growJackpot(N)` per completed ride inside the roll. The pool now grows with ride volume (ties the most exciting reward to orders/day) and can only ever pay what spins+rides funded. (Note: verify `weeklyService.ts:224` malformed-comment `\**` compiles before relying on `claimJackpot`.)

**Data model delta:**
```
Member += lastBookingBonus Float?
RideReward { id, memberId (Cascade), bookingId, tier, amount, createdAt,
             @@unique([memberId,bookingId]), @@index([memberId,createdAt]) }   // idempotent cashback log
MarketRedemption / ShopOrder is the coin SINK (Pillar 3)
CoinTxn.kind += cashback, refund   (append only)
```

**Endpoints.** No new *ride* endpoint — cashback fires **server-side** in `bookingNotifier` (server-authoritative; the client can never claim a ride completed). Missions: delete the 3 arcade ones, add `daily_lucky`, `weekly_3rides`, `weekly_market` (drives the new sink).

**Bot/miniapp.** Tab swap `O'yin → Mukofot` (keep 5 tabs). `RewardsView` = Wheel + Box (kept) + Streak card + Lucky-day banner + Jackpot ticker + Level ring. A `"🚕 Safar qil"` hero card atop Hamyon with a "keyingi safar JACKPOT bo'lishi mumkin" teaser = pre-ride variable-reward trigger. Completion card: `"🏁 +{cashback} cashback · 🔥 N kun streak · [🔁 Yana]"`.

**Economic guardrails:** every variable reward is COINS → can never directly emit real money. Idempotent per real metered ride → unfarmable. Jackpot is a closed pool. Market spends are atomic burns. Removal is zero-loss (drain → drift 0 gate). **Keep at least one daily mission in the free-box unlock set ride-anchored** (`daily_ride`) so the daily free box (~600–2500 coin, verified unlocks when all dailies done) is itself ride-gated, not a free no-ride mint.

---

## 4. The unified economic-safety model — "Can someone drain us?" → No.

**The one idea: coins are Monopoly money.** Minted, won, gifted, spent freely inside the walls. The walls have **exactly ONE door to real cash: `withdraw()`** (coin → kas bonus). Every new surface (driver wallet, P2P, Bozor) may *move* coins but may NEVER open a second cash door. Bozor's REDEEM is a *separately-walled* door with its own revenue-linked budget. The codebase already enforces the single-door property — `withdraw()` is the sole real-money writer besides admin grant.

**FOUR WALLS guard that door:**

| Wall | Status | What it does |
|---|---|---|
| **1. Global revenue-linked budget** | EXISTS (`consumeWithdrawBudget`) | Total real cash out across ALL users ≤ `BASE(20k) + completedRides×PER_RIDE(300)`/day, atomic via `AppState $executeRaw`, fail-safe to floor when kas is unreachable. At 165 rides = ~69.5k/day out vs ~330k/day net profit (≤21%). **Keep PER_RIDE=300**; revisit after 30 days of live data, not at design time. Scales WITH the business — can never outrun it. A "Damas" (~80–100M) is structurally impossible. |
| **2. Per-member daily cap** | EXISTS | 50k so'm/day. **Lower to 30k for `trustTier 0`** (new accounts). |
| **3. Ride-eligibility gate** | ⚠️ **MISSING — SHIP FIRST** | Verified: `withdraw()` (`coinService.ts:110`) checks only `type==='client' && phone`. **No `trips>0` check.** A fresh fake account nets ~5–7k coins on day one (referral 5k + free box + wheel + streak), all withdrawable 1:1. A farm of fakes captures the entire ~69.5k/day budget. **Fix = 2 lines:** `if ((member.trips ?? 0) < 1) return fail("no_ride")`. `trips` already exists (`schema.prisma:23`, synced from kas) — no new column. Now every withdrawing account must have generated real revenue first; a 100-account farm needs 100 real paid rides, at which point **they have paid us more than they can extract.** |
| **4. Transfer/market velocity + burn** | NEW | Two-sided caps: **received-cap 30k/day < withdraw-cap** → funneling coins IN gives **zero** extra withdraw capacity. 2% P2P burn shrinks supply. The global budget caps the whole operation regardless of how coins are shuffled. |

**Settlement & closed-loop properties:**
- **Closed-loop:** P2P and tips write **paired `CoinTxn` rows in one `$transaction`** → net-zero supply → `Member.coins == Σ CoinTxn` holds per-member with zero reconciliation changes.
- **Bozor double-wall:** REDEEM cash exits via `addClientBonus(ownerPhone)` under `withPhoneLock` + a **separate** `consumeBozorBudget` (own `AppState` key, own revenue-linked pool). It can never touch the user withdraw budget.
- **Driver payouts share Wall 1** — both A1 (kas-write) and A2 (admin-settled queue) call `consumeWithdrawBudget` FIRST. The A2 manual queue must never bypass the budget.
- **No +EV mint:** every internal path ≤100% RTP (wheel respin −43%, premium box 6% burn, P2P 2% burn, market 100% sink, withdraw 1:1 but budget-gated). No infinite-money loop can exist.

**Anomaly layer + kill-switch** (extend `reconciliationWatch`, runs on the existing 15-min sync tick, no new infra): keep the 24h-gain (80k) + drift-heal, ADD earn-with-no-rides (`coins>50k AND trips=0` → `riskFlag`), fan-in (≥5 fresh senders → 1 recipient), fan-out (1 sender → ≥5 same-day withdrawers), budget-exhausted-before-noon alert. **`riskFlag` FREEZES the withdraw door only** — coins stay spendable on in-ecosystem sinks, so a falsely-flagged real user still enjoys discounts/spins while an admin reviews. White-hat-friendly, abuse-hostile.

**The "can someone drain us" answer, stated plainly:** A farmer with 100 fake accounts hits the wall — none can withdraw a single so'm until each has paid for a real ride (Wall 3); funneling coins between them grants zero extra withdraw capacity (Wall 4); and the whole farm still shares one revenue-capped daily pool (Wall 1). Worst case real-money loss is bounded by today's withdraw budget (~69.5k at 165 rides), and that budget only exists because real rides happened.

**Gate before any money feature ships "done":** a `tsx` script firing 50 concurrent transfers asserting `Member.coins == Σ CoinTxn` for every member, total supply unchanged (minus burn), AND a mule-ring scenario extracting **no more real money than the day's withdraw budget**.

---

## 5. Phased build roadmap (each phase independently shippable & verifiable)

| Phase | Scope | Ships | Verify gate | Book growth tie |
|---|---|---|---|---|
| **0 — Close the leak (today, <2h)** | Withdraw **ride-gate** (`trips>0`, 2 lines, `coinService.ts:110`); add `trustTier` col + lower tier-0 cap to 30k; keep `PER_RIDE=300`. | Both owner-fears become mathematically impossible. | `tsx` test: zero-ride account → `withdraw` returns `no_ride`; rode-once account → passes. | Protects unit economics — the precondition for every growth move. |
| **1 — Purge + one-tap foundation (days 1–4)** | Arcade drain → `remove_arcade` migration → code/miniapp purge. Persist pickup on `Member` + `callOneTapFor` + `/api/booking/now` + bot stateful button + status-push edit + miniapp hero + silent GPS + rate-card + 3 booking guards. | Arcade gone (zero loss, `getIntegrity` drift 0). **Second ride onward is one tap.** | `getIntegrity` drift 0; book a ride end-to-end in `KAS_MODE=mock`; restart server → default pickup survives. | "1 call or 3 buttons" — the minimal-action reflex that wins repeat riders. |
| **2 — Ride-anchored economy (days, after P1)** | `lastBookingBonus` col + `cashbackService` hooked into `bookingNotifier` (capture in active branch, roll in finished branch) + lucky-day + ride-fed jackpot + new missions + `RewardsView` + `"🚕 Safar qil"` hero + bot text. | Every ride pays a variable cashback ball; HOOKED loop closes (trigger→reward→investment). | `tsx`: simulate completed ride → exactly one `RideReward`, coins granted (not cashback), re-poll grants nothing. | Variable reward + ride-linked habit loop — drives orders/day, the core KPI toward 600–800/day. |
| **3 — Driver platform + P2P + transfer (days)** | `Transfer` model + `transferService` (atomic, idempotent, 2% burn, two-sided caps, ring-detect) + `/api/wallet/transfer` + `TransferSheet` + post-ride `[Rahmat]` tips + driver menu gate + `driver.tsx` + generalize `withdraw()` (A1/A2, both budget-gated). | Tip your driver in 1 tap; send coins to a friend; drivers are linked, tippable, withdrawable accounts. | `tsx`: 50 concurrent transfers → invariant holds, supply unchanged minus burn, mule-ring extracts ≤ day's budget. | Activates the **569-driver liquidity moat** — the asset competitors can't copy before Yandex. |
| **3b — Driver auto-bonus (LATER)** | `carNumber→driverMember` lookup in the booking sweep + flat `driver_bonus` (idem = kas booking id, daily cap, ≤ profit). | Drivers earn passively per trip. | `tsx`: sync replay never double-pays; bonus ≤ net profit. | Driver retention → ride supply → liquidity. |
| **4 — Bozor ABSORB (days)** | Schema (Shop/Listing/ShopOrder) + `marketService.buy/redeem` (ABSORB-only, escrow via `spendCoins`, shop=Member) + 5 `/api/market/*` + Bozor tab + 3–5 anchor shops seeded. | Spendable cashback ball becomes real local goods — **zero cash risk.** | End-to-end buy→voucher→redeem in `KAS_MODE=mock`; `getIntegrity` drift 0. | Spendable closed-loop economy — the book's explicit mandate; local-knowledge moat. |
| **5 — Bozor REDEEM (LATER)** | `consumeBozorBudget` (clone `economyService`, separate `AppState` key) + weekly cash/kas-bonus payout under `withPhoneLock` + trust tiers + anomaly-hold + lowered `dailyCap`. | Shops that don't self-absorb get cash-settled at a spread, double-walled. | `tsx`: REDEEM never exceeds `bozor_budget`; settlement-hold fires on fan-in. | Broadens merchant network → more sinks → less withdraw pressure. |
| **6 — Anomaly + governance (half day)** | Extend `reconciliationWatch` (earn-no-ride, fan-in/out, budget-exhausted) → `riskFlag` freeze-check in `withdraw()`/`transfer()`; ops-console budget-vs-payout view. | Abuse-hostile, false-positive-friendly governance. | `tsx`: ring scenario sets `riskFlag`, withdraw freezes, coins still spend. | Sustains trust at scale toward 30–40M/mo. |

---

## 6. Top 5 risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| **1** | **Withdraw ride-gate not shipped first.** Until `trips>0` lands in `withdraw()`, the global budget is fully drainable by zero-ride fake accounts via referral/box/wheel/streak mints. This is the single catastrophic, *currently-live* hole. | **Phase 0, today, 2 lines** — before any booking-speedup or transfer/market amplifies the funnel. Every other safety claim depends on it. |
| **2** | **Sybil referral farm.** Self-invite is blocked only by Telegram-ID equality (verified `referralService.ts:67/91`); no phone/device dedup. One operator + N burner numbers mints 5k coins per fake invitee. | (a) Ride-gate (#1) makes referral coins non-cashable until each account takes a real paid ride. (b) Defer the referrer 3k reward until `referee.trips>0` — turns referral from a mint into a real-acquisition reward. (c) De-dup referees by phone last-9. (d) Fan-in detect (≥5 fresh referees → 1 referrer/week → `riskFlag`). |
| **3** | **Deploy-ordering crash on arcade removal.** Dropping arcade tables before the code stops importing them crashes the running Prisma client. | Strict order: **drain → verify drift 0 → code purge → migrate → miniapp.** Archive `testGames.ts`/`prodVerifyGames.ts` in the same commit so the build stays green; add `testReconciliationAfterPurge.ts` asserting drift 0 as the gate. |
| **4** | **A real-money exit bypasses the revenue budget.** Driver A2 admin-queue or Bozor REDEEM could leak around `consumeWithdrawBudget` if wired carelessly. | Both driver branches call `consumeWithdrawBudget` FIRST. Bozor REDEEM uses a *separate but identical* `consumeBozorBudget`; **MVP ships ABSORB-only** so no Bozor cash path exists until the budget gate is wired and tested. Keep the client `withdraw()` branch byte-identical; add new branches behind the type check. |
| **5** | **Accidental one-tap dispatches a real taxi / phantom cancels waste a driver trip** — degrades the driver-liquidity moat, not the coin economy. | Active-booking guard (already present) + repeat-throttle (60s + `rateLimit(3)`) + cancel-farm cap (≥4/day → confirm screen) + optimistic "Topyapmiz…" state before the kas round-trip. Add a 5s soft-hold undo **only if drivers actually complain** — don't pre-build it. |

---

### Sources of truth (verified this session)
- `coinService.ts:100-150` — `withdraw()` gates only `type/phone`, **no `trips` check**; single real-money writer; per-phone lock; refund-on-fail.
- `economyService.ts:11-60` — `BASE_BUDGET=20k`, `PER_RIDE=300`, atomic `$executeRaw` budget, kas-unreachable fail-safe to floor.
- `schema.prisma:23` — `Member.trips Int @default(0)` exists (the ride-gate needs no new column). `:27-28` — `lastBookingId/lastBookingStatus` exist (one-tap reuses this row). `:225` — `CoinTxn.kind` is free-text.
- `referralService.ts:67,91` — self-invite blocked only by Telegram-ID equality; referrer reward not ride-gated.
- `bookingNotifier.ts:32,52-53,56` — `clientBonus` read live (lost on finish → needs `lastBookingBonus`); rider-phone match, no `carNumber→driver` join; status push already transition-gated/idempotent.
- `booking.ts:19` — `lastPickup` is an in-memory `Map` (dies on restart — the real one-tap killer).