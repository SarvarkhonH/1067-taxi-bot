# 1067 — Architecture map (agent onboarding)

> Read this ONCE before touching code. It is the low-token index to a ~43k-LOC monorepo.
> Goal state: a fast, unbreakable taxi bot + Mini App. Everything not serving that is being removed
> (see "Removal program"). When code and this file disagree, fix whichever is wrong in the same PR.

## 1. What this is (one paragraph)

A gamified taxi loyalty layer on top of an EXTERNAL dispatch company, **kas1067**. We do NOT run
dispatch — kas1067 does. We mirror its rides via scraping-style REST + a WebSocket, and add: a
Telegram bot, a rider Mini App (React), an admin dashboard (React), and a game/economy of "tanga"
(1 tanga = 1 so'm, our DB only; cash-out is owner-approved). Money rule #1: **client emission ≤ 350
tanga per ride** (clamped in `grantRideCoins`), and real money leaves only through the ride-gated,
budget-capped withdraw door.

## 2. Packages

| Package | LOC | What | Deploys to |
|---|---|---|---|
| `packages/server` | ~29k | Express API + grammY bot + periodic sweeps + kas client — ONE Node process | Render (`kas1067-taxi-fra`) |
| `packages/miniapp` | ~9.5k | Rider Mini App (React+Vite+Leaflet) | Vercel (`1067taxi-miniapp`) |
| `packages/admin` | ~3k | Owner dashboard (React) | Vercel (`admin`) |
| `packages/shared` | ~2k | Types + economy constants + tunable-knob defaults shared by all | — |

Monorepo = pnpm workspace. `@t1067/shared` is imported by every package — **economy constants live
there** (`packages/shared/src/economy.ts`), so a limit change is one edit, all packages.

## 3. The 4 request/event flows (this is 90% of the system)

1. **Rider opens Mini App** → `GET /api/booking/info` → `getBookingInfo` (bookingService.ts) fans out
   ~6 kas REST calls → renders map + saved addresses + active ride.
2. **Rider books** → `POST /api/booking/create|now` → `createBookingFor` → writes a real order into
   kas → kas dispatches a real driver.
3. **The sweep** (`bookingNotifier.ts::pushBookingUpdates`) runs every 5–90s: pulls kas's active
   bookings ONCE, then per linked member sends/edits the ONE live ride card, fires arrival pings, and
   ON RIDE FINISH grants all rewards (cashback roll, missions, etc). **This is the app's real main
   loop** — see the warning in §5.
2. **The 15-min periodic tick** (`index.ts` setInterval) runs ~18 background jobs in sequence
   (cashback mirror, weekly payout, backups, reconciliation…).

Money is ALWAYS granted server-side from the sweep (never the client), through the idempotent coin
ledger. A re-polled finish grants nothing (unique markers). This discipline is the codebase's
strongest part — preserve it.

## 4. Where things live (jump table)

**Server** (`packages/server/src/`)
- `index.ts` — process entry: boots bot+API+sweeps, the 18-job periodic tick, the adaptive booking
  sweep loop, kas WebSocket, self-ping.
- `api/server.ts` (1.7k) — every HTTP route. Routes lazily `await import()` their service.
- `bot/bot.ts` (1.5k) — every Telegram command/callback.
- `kas/client.ts` (1k) — the kas1067 REST/WS client (login, `getText` chokepoint, `getActiveBooking`,
  `listActiveBookings`, driver lookups). `kas/mock.ts` = offline stand-in (KAS_MODE=mock).
- `services/` (53 files) — one file per domain. Money core: `coinService.ts` (grant/spend/clamp +
  `withMemberLock`), `cashbackService.ts` (ride roll + wait-comp), `transferService.ts` (P2P),
  `cashoutService.ts` (withdraw). Dispatch: `bookingService.ts` (Mini App views), `bookingNotifier.ts`
  (the sweep), `bookingPlus.ts` (map pins). Config: `featureFlags.ts` (kill switches),
  `bonusConfig.ts` (owner-tunable knobs).
- `sync/sync.ts` — mirror kas member data into our DB (batched, see refreshLinkedMembers).
- `scripts/` (~80 files) — ad-hoc tsx ops/diagnostic scripts (NOT a test suite; see §5).
- `prisma/schema.prisma` — 73 models (many belong to removed games).

**Mini App** (`packages/miniapp/src/`)
- `main.tsx` → `App.tsx` — shell + tab routing; reads `me.flags` to show/hide sections.
- `booking3.tsx` (1.5k) — THE taxi flow: map, pins, search, dispatch, live tracking, rating, the wait
  game. `booking.tsx` = OLD flow, still a runtime fallback behind the `booking3` flag.
- `waitGame.tsx` — tap-to-earn while searching (feature `waitcomp`).
- `wallet.tsx` (Hamyon: balance, cash-out), `rewards.tsx` (missions/wheel), `home.tsx`, `driver.tsx`,
  `intercity.tsx` (kept), `TrackView.tsx` (public family-safety trip page).
- **Removed-game screens still present**: `garaj.tsx`, `market.tsx`, `tolqin.tsx`, `uy.tsx`,
  `service.tsx` — dead once flags are off; delete in the strip phase.
- `api.ts` — one flat object, ~180 endpoint methods. `telegram.ts` — WebApp bootstrap + helpers.
- `design/tokens.css` (1.4k) — the single global stylesheet (class-prefix soup, NOT design tokens).

## 5. Load-bearing invariants & traps (READ before editing)

- **Never trust the client for money.** Score/time/finish are all decided server-side.
  Every grant is idempotent via a unique key (`CoinTxn.idempotencyKey`, or a `*:bookingId` marker).
- **≤350 tanga/ride** enforced in `grantRideCoins` (coinService.ts) — funnel every per-ride faucet
  through it. Exceptions (jackpot, wait-comp) are OUTSIDE the clamp and have their OWN budget/pool.
- **No new pollers.** New per-ride behavior is grafted onto `pushBookingUpdates`. This is WHY it is a
  761-line god function — a known debt (see V-NEXT). Add carefully; keep per-member work cheap.
- **`withMemberLock` / rate-limit buckets are in-memory** → the app is single-instance only. A 2nd
  Render instance would race the money clamp. Horizontal scale needs Postgres advisory locks (not yet).
- **kas ~1 req/s.** `getText` has NO pacing yet — bursts trigger 429 cascades that break login/bookings
  (V-NEXT #1). The 15-min member refresh IS paced; API paths are not.
- **AppState is a schemaless KV** with per-ride markers (`waitstart:`,`wsarrived:`,`finishcard:`…) that
  currently accumulate forever — no cleanup job (V-NEXT #3).
- **Tests are manual tsx scripts against LIVE Postgres.** CI runs typecheck only — money logic has NO
  automated test. Use a SEPARATE `TEST_DATABASE_URL`; never run sweep tests against the app DB (the
  live 90s sweep will chase your test rows). See CLAUDE.md "TEXNIK ESLATMALAR".
- **Deploy**: server = push to `main` → Render auto-deploy (start cmd runs `prisma db push` — run
  destructive schema locally first). Mini App = `VITE_API_URL=<render> vite build` → copy `dist` to
  `.vercel/output/static` → `vercel deploy --prebuilt --prod`, then GREP the live bundle to prove it.

## 6. Feature flags = the control panel

Every risky mechanic is a kill switch in `featureFlags.ts` (`feature:<name>` in AppState, 30s cache).
`DEFAULT_OFF` flags stay off until an explicit `on` row exists. Flip live with
`tsx src/scripts/setFlag.ts <name> <on|off>`. Owner-tunable amounts (not on/off) live in
`bonusConfig.ts` knobs (`BONUS_ECON_KNOBS` in shared) → the admin panel auto-renders them.

**Live ON (the real product):** `booking3`, `wheel`, `baraban`, `cashout`, `welcomebonus`,
`recruit`/`refstaged`/`drvstaged`/`drvrecruit`, `plus`, `gap`, `promo`, `qarz`, `clientbooking`,
`komissiya`(1%), `tierloyalty`, `intercity`.
**Turned OFF 2026-07-02 (removal program):** `garajx`, `kozacha`, `motorolami`, `tolqin`, `mahalla`,
`livinghome`, `aibrain`, `garage`(v1), `carupgrade`.

## 7. Removal program ("chaqmoq-bot" — lightning-fast, unbreakable)

Owner decision 2026-07-02: strip all heavy game systems; keep taxi + wallet + light hooks.
- **Phase 1 (DONE)** — 9 flags off (above). Code still present; rollback = flag on.
- **Phase 2 (next)** — code strip ~10k LOC: `garajService.ts`(2.8k), `garaj.tsx`(1.8k),
  `garajGame.ts`(0.9k), `garaj.css`, motorolami/tolqin/mahalla/livinghome services + Mini App screens,
  their sweep hooks in `pushBookingUpdates`, their admin panels, their tsx test scripts.
- **Phase 3** — drop the orphaned Prisma models (30 days after Phase 1, so refunds can be computed
  from history). Refund policy: NO auto-refund; pay manually if a customer complains (68 GarajCar rows
  across 55 owners preserved until then).

## 8. V-NEXT — "strongest architecture" backlog (do in this order, each is small + isolated)

1. **kas queue** — a 1 req/s serial queue + single shared in-flight login promise at the `getText`
   chokepoint. Biggest stability win; kills 429 cascades + login stampede.
2. **Sweep diet** — skip members with no active ride early; replace the per-tick throw-away INSERT
   markers with read-first; the refresh already batches.
3. **AppState TTL cleanup** — one job on the existing tick deletes per-ride markers older than N days.
4. **Security** — rate-limit `/api/driver-photo/:id`, `timingSafeEqual` the admin token, rotate
   `KAS_BONUS_SECRET_KEY` (default "1303" is public — bonus writes are forgeable).
5. **Split `pushBookingUpdates`** into phase functions (behavior-preserving).
6. **vitest for money math** — 10–15 assertions in CI on every commit (clamp, grant idempotency,
   withdraw budget).
7. Split admin `App.tsx` (2.5k) and `booking3.tsx` (1.5k) last — not urgent.

## 9. Rules of engagement (from CLAUDE.md — non-negotiable)

Builder never says "done" — only "READY FOR VERIFICATION" + command+output proof; "done" is the
owner's word after acceptance. Write the Definition-of-Done before coding. Verify claims across ALL
`packages/*/src`, not a narrow grep. One change per turn, verify before reporting. Never git-add a
shared file carrying someone else's WIP imports.
