# 1067 — NEXT LEVEL PLAN (v1, 2026-07-02)

> Co-authored: Sonnet (product/growth draft) + Fable (architecture critique, phasing, guardrails).
> Owner goal: **chaqmoqdek tez, buzilmaydigan** taxi bot + Mini App; stronger ordering UX, more
> bonus paths, deeper habit loops, faster spread, a handy+deep admin. Everything below rides
> existing sweeps (no new pollers), ships behind kill-switch flags, and respects the ≤350/ride
> client-emission clamp unless it has its OWN budget.

Correction baked in: `ScheduledRide`, `FamilyMember`, `RideRating`, `PeakHour`, `Streak`, tier
decay — **already built**. Most "new" product work is surfacing + wiring, not greenfield.

---

## Phase 0 — Poydevor: fast & unbreakable (DO FIRST, ~1 week)

Without this, every growth feature amplifies load on a fragile core.

| # | Work | Why | Effort |
|---|---|---|---|
| 0.1 | Finish Phase-2 code strip (garaj/motor/tolqin/mahalla/aibrain/garage-v1, ~10k LOC) | smaller bundle, faster agent work, fewer sweep hooks | ✅ DONE 2026-07-02 (−9,737 LOC, merged 84c2d3b) |
| 0.2 | **kas queue**: 1 req/s serial queue + single shared in-flight login promise at `getText` | kills 429 cascades + login stampede — the #1 outage source | S |
| 0.3 | **Sweep diet**: early-skip members with no active ride; replace throw-away INSERT markers with read-first | DB load drops ~10× at scale; removes guaranteed-error inserts per tick | S |
| 0.4 | **AppState TTL cleanup** job on the existing 15-min tick (per-ride markers >30 days old) | stops unbounded row growth | S |
| 0.5 | Security: rate-limit `/api/driver-photo/:id`, `timingSafeEqual` admin token, plan `KAS_BONUS_SECRET_KEY` rotation with kas ops | closes forgeable-bonus + enumeration holes | S |
| 0.6 | **vitest money suite in CI** (clamp, grant idempotency, withdraw budget, transfer caps — 10-15 tests) | money logic currently has ZERO automated tests; growth features multiply money paths | M |
| 0.7 | **Measurement baseline**: D1/D7/D30 retention + rides/user/week from `RideReward.createdAt` (one SQL aggregate → admin AnalyticsView) | Phases 2-3 are judged by these numbers; measure BEFORE building loops | S |

**DoD**: strip merged w/ green typecheck+build ×3 packages; burst-test `getBookingInfo` ×10 parallel
→ 0×429; sweep tick query count logged before/after; CI red on a broken clamp; retention chart live.

## Phase 1 — Taxi UX: order in 1 tap (~1 week)

| # | Feature | Mechanic | Effort |
|---|---|---|---|
| 1.1 | **"Yana shu yo'l"** one-tap chips | home shows last 3 pickup+time patterns from ride history → 1 tap = dispatched | S |
| 1.2 | **Smart pickup default** | rank saved addresses by hour+weekday frequency; pre-select the likely one | S |
| 1.3 | **Scheduled-ride nudge** | habitual same-time riders get "Ertaga 8:00 ga yozib qo'yaymi?" card (ScheduledRide exists) | S |
| 1.4 | **Family tile** | "Onam uchun chaqir" surfaced on home (flow exists, buried in submenu) | S |
| 1.5 | **Post-ride moment card** | after rating, ONE memorable stat (oy tejalgani / streak / shahar reytingi) before the roll reveal | S |
| 1.6 | **Driver ETA honesty** | track promised-vs-actual per driver → rider sees "odatda vaqtida" badge; feeds driver tiers | M |

**DoD**: repeat-trip order = 1 tap (screen-recorded); scheduled rides/week ↑ measured; ETA delta
stored per driver for ≥2 weeks before badge ships.

## Phase 2 — Bonus & habit loops (~2 weeks, each behind a flag)

| # | Mechanic | Hook | Budget | Effort |
|---|---|---|---|---|
| 2.1 | **"Jonli qidiruv"** — ✅ BUILT + OWNER-ACCEPTED + LIVE 2026-07-02 (flag `waitcomp` ON, commit c4a8889). Passive ticker (~500/daq, 3 daqiqada 1500, knob-tunable) + honest status ladder + **"topilmadi" next-ride voucher** (failed search → amount waits on the NEXT completed ride, 72h — farm-safe retention hook) + bot apology message. Proof: testWaitComp 16/16 ×3. | own daily pool (knob) | ✅ LIVE |
| 2.2 | **Streak freeze** | 1 free skip/hafta; broken streak buy-back ≤50 tanga | tiny, inside game econ | S |
| 2.3 | **"Bugun mumkin" counter** | missions+spin+ride bonuses summed into one visible daily-potential number; partial completion nags | UI-only | S |
| 2.4 | **Tier decay countdown** | "3 kun qoldi — Kumushdan tushasiz" (decay logic exists, invisible) | UI-only | S |
| 2.5 | **Rating bonus** | ≥4★ within 10 min → 30-50 tanga (capped 2/day) — buys the data 1.6 needs | own pool, outside clamp | S |
| 2.6 | **Off-peak ride bonus** | PeakHour rows drive "hozir bukssangiz +X%" pushes in demand valleys | own pool via knobs | M |
| 2.7 | **Weekly ride-streak multiplier** | 3 safar/hafta → next roll ×1.5 (inside clamp — multiplies existing roll) | inside clamp | M |

Deferred: co-ride matching (needs kas dispatch signal we don't have), weather surge (no data source).

**DoD per mechanic**: flag DARK → owner QABUL on real phone → flag on → 1 week of emission
telemetry reviewed vs guardrails (below) before the next mechanic ships.

### DEFERRED — Mini App SSE (bot-level ~1s status) — gated on Render Standard ($25/mo)

Owner decision 2026-07-04: build ONLY after upgrading Render free → Standard ($25). Today the bot
card is socket-instant (~1s); the Mini App polls every 3s (`booking3.tsx` searching tick, was 12s).
SSE closes that 3s→~1s gap but adds a long-lived-connection subsystem the free tier can't safely hold
(0.5 CPU / 512 MB) and a deploy-reconnect burst risk. When on Standard:
- **SSE emits STATUS ONLY, from OUR DB** (member.lastBookingStatus, already updated by the sweep +
  kasClientSocket trigger) — a status event tells the Mini App "refetch now"; it NEVER hits kas on
  the SSE path, so a reconnect burst can't hammer kas's 1 req/s.
- **Poll stays as fallback** (SSE down / old WebView) — just at a slower cadence when SSE is connected.
- **Reconnect: jitter + heartbeat** (~20s `:ping`), initial state served from DB (not kas), so a
  redeploy's synchronized reconnect is spread + cheap. (Mirror the kasClientSocket backoff+jitter.)
- Endpoint: `GET /api/booking/stream` (SSE, requireUser) → pushes on the member's status change; the
  server keeps an in-memory member→response map (deepens the single-instance lock — already true).
Effort ~1 day. Risk without the above guards: connection-count + deploy reconnect storm (see the
2026-07-04 SSE risk table in chat). Prereq: Render Standard live.

## Phase 3 — Virality (small-city saturation, ~1 week eng + ops)

| # | Play | Logic | Effort |
|---|---|---|---|
| 3.1 | **Driver QR ops push** | stickers to ALL drivers (assets exist: 1067_driver_qr_stickers.pdf). k = drivers × scan-rate — highest idle lever | ops, not code |
| 3.2 | **Family-invite → referral wiring** | FamilyMember add fires the same staged referral rewards (currently bypasses them) | S |
| 3.3 | **Jackpot/triple share card** | rare win → auto-generated Telegram share card; rare moments compound in a small city | S |
| 3.4 | **City leaderboard + share** | weekly top-10 (names recognizable in Koson = social proof IS the ad) | S |
| 3.5 | Inline ride-receipt share | "men N so'm tejadim" forwardable card | M |

**DoD**: referral joins/week baseline vs +4 weeks; share-card CTR logged.

## Phase 4 — Admin: handy + deep (~1-2 weeks)

**P0**: unified **approval inbox** (cash-out+qarz+campaign in one badge-counted tab); **anomaly
banner** on Overview (emission spike / withdraw spike / kas-429 storm — thresholds on existing
DailyStat, one check on the 15-min tick); **knob effect preview** ("bu safar ≈X to'laydi" computed
client-side from BONUS_ECON_KNOBS before save).
**P1**: flag switchboard with **blast-radius labels** (money/UX/cosmetic); cohort/retention chart
(from 0.7); campaign composer segment presets (dormant-14d, high-value, new-driver).
**P2**: split the 2.5k-line App.tsx per tab (maintainability only, last).

## Economy guardrails (applies to every phase)

- All client faucets: through `grantRideCoins` (≤350/ride) OR an own capped pool — never a bare grant.
- New pools (rating bonus, off-peak, wait-comp) each get a knob + daily company budget row.
- Weekly review ritual (owner + reconciliation sweep): total emission vs kas revenue; if emission/
  revenue > agreed %, newest mechanic's flag goes off first (LIFO kill order).
- Withdraw door stays the single real-money exit: ride-gated + daily revenue budget (unchanged).

## Owner action items (kod emas)

1. QABUL queue: wait-comp (2.1) — o'ynab ko'rib flag yoqish qarori.
2. Driver QR stickers print + tarqatish (3.1) — eng katta bepul o'sish dastagi.
3. kas ops bilan `KAS_BONUS_SECRET_KEY` rotatsiyasini kelishish (0.5).
4. `komissiya=on` (1% har o'tkazmada) — ataylabmi, tasdiqlang.
5. Har hafta: emission-vs-revenue jadvalini ko'rish (guardrail rituali).

## Sequencing summary

**0 (poydevor) → 1 (UX) → 2 (loops, bittadan) → 3 (virality) → 4 (admin P0 istalgan payt parallel).**
Phase 0 is non-negotiable first — every later phase multiplies traffic and money paths on top of it.
