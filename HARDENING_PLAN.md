# 1067 Taxi Super-App — Master Hardening & Roadmap Plan

> Built from a 7-agent exhaustive audit of every subsystem (money, games, booking+kas, bot/UX, admin/ops, infra/security). Every case is placed in a tier; nothing dropped. Ordered strictly by **risk × leverage** — cheap-and-catastrophic first.

_Generated 2026-06-10. Prod env verified: `ALLOW_DEBUG_AUTH=false`, `WEBHOOK_SECRET` is a real 32-char secret, `ADMIN_PANEL_TOKEN` set — so the impersonation/weak-webhook flags below are about the LOCAL `.env` defaults, not prod. The live residual is secret **rotation** + purging `.env` from git history._

## 1. Executive Summary

The app is **live and feature-complete**: pickup-only taxi booking on kas1067, dual wallet (🚕 cashback real so'm vs 🪙 withdrawable coins), seven games + missions/league/referral, and a React admin command center. Engineering is solid where it counts — `grantCoins` idempotency-keyed, `spendCoins` atomic, withdraw refunds on kas failure, games server-authoritative.

But it's **one calendar event from total data loss** and running **blind**. Biggest risks:

| # | Risk | Why it dominates |
|---|------|------------------|
| 1 | **Postgres free tier expires 2026-07-10** | All coins/ledger/streaks/withdrawals in one ephemeral DB, **no backups** = total irreversible loss, hard date. |
| 2 | **Secrets pasted in chat/.env** (BOT_TOKEN, KAS_PASSWORD, DB creds, tokens) + `.env` on disk/in git | Must rotate; anyone with them owns the bot + kas account. |
| 3 | **Zero monitoring/alerting** | If DB/kas/sync/payout dies, nobody is paged — failures vanish to stdout. |
| 4 | **Money is `Float`** + non-atomic spend→settle→grant windows | Drift + crash-mid-settlement silently create/destroy coins; no reconciliation job exists. |
| 5 | **Sync can stick `running` forever** + multi-account referral farming (no per-phone cap) | Ops paralysis + a coin-farming path to the 50k/day withdrawal cap. |

**Strategy:** ship a *Survival* sprint first (backups + secret rotation + monitoring + stuck-sync watchdog), then money-safety (transactions + reconciliation + fraud caps), then anti-cheat/resilience, then deferred features, then scale/DR.

---

## 2. 🔴 P0 — Must-Fix Now

- **P0.1 Postgres expiry → data loss (2026-07-10):** `pg_dump` today to S3 + verify restore; enable Render daily backups; daily dump cron; **upgrade/migrate before 2026-06-28**; health flags YELLOW <7 days out. **M.**
- **P0.2 Secrets:** rotate BOT_TOKEN, KAS_PASSWORD, DB creds, ADMIN_PANEL_TOKEN, KAS_BONUS_SECRET_KEY; purge `.env` from git history (BFG); keep `.env.example`. Add boot-guard: hard-throw if `ALLOW_DEBUG_AUTH=true` outside dev. (Prod flags already safe.) **S–M.**
- **P0.3 Monitoring/alerting:** Sentry (server + Mini App); structured logging (`pino`, one line/request w/ traceId); Slack/Sentry alerts for DB fail, kas unreachable, sync >30min, periodic-task failure, withdraw kas-fail >10%; `X-Request-ID` propagation. **M.**
- **P0.4 Stuck-sync watchdog:** boot-cleanup orphaned `running` SyncRun >1h → `error`; 30-min watchdog; `Promise.race` timeout in `runSync`; SIGTERM marks active run; `POST /api/admin/sync-retry`; health color reflects sync. **S–M.**
- **P0.5 Crash-safe money (transactions + reconciliation):** wrap withdraw (record `pending` before spend; `$transaction` refund-on-fail; idempotencyKey), escrow games (spend+session-create atomic; settle-mark+grant atomic), `topUpFromBonus` (no silent `.catch`); **nightly reconciliation** (Σ CoinTxn vs Member.coins; settled rows w/o payout txn; pending/failed withdrawals) + admin panel; `grantCoins` reject ≤0 / >1M before idempotency lookup. **M+M.**
- **P0.6 kas resilience on money path:** login 6–8 retries w/ jitter + 5–10min cookie cache + circuit-breaker; auto-retry-on-401 for booking; **idempotency key** on createBooking (validate vs getActiveBooking); retry queue for failed kas writes. **M.**
- **P0.7 kas geo-restriction (UNCONFIRMED):** run `checkKasReach.ts` vs prod **today**; if Render IP blocked → whitelist/proxy/document; add kas-connectivity probe before each booking. **M.**
- **P0.8 Rate limiting:** `express-rate-limit` keyed on telegram id/IP — 10/min game stakes & claims, 5/min withdraw & admin-grant; `429 + Retry-After`. **S.**
- **P0.9 Referral/farming guard:** per-phone referral cap; require an action (first ride/link) before referral pays; flag IP/device bursts; admin referral-fraud view. **M.**

## 3. 🟠 P1 — Hardening & Correctness

- **Money:** Float→Int money migration + Zod amount validation; Postgres advisory-lock per memberId (replaces in-memory `phoneLocks`, survives restart/multi-instance); idempotency unique constraints (WheelSpin/BoxOpen/grant upsert); cashback cap inside txn; emission-vs-sink panel + `KasAuditLog`.
- **Games/anti-cheat:** crash double-settle + jackpot-claim `$transaction`/`FOR UPDATE`; duel accept-race txn; duel **commit-reveal** (hide chScore); real-time escrow release + tighter TTL (return 410 on stale); HMAC-SHA256 checksum + nonce + seed commitment + ~1% tolerance; anti-bot/ghost-pool hygiene (exclude <7d/<5-race accounts, flag 90% win or identical runs); quiz answer-leak fix; `crypto` PRNG for box/quiz; responsible-play caps; `duel_win` weekly score.
- **Admin/ops:** `AdminAction` audit table; ban/unlink/refund-coins/reverse-withdrawal ops; broadcast delivery tracking (`BroadcastLog` + retry + mark-blocked); `PeriodicTask` status + auto-retry + alert; kas metrics history (uptime/p50/p95); RBAC (`role` + `requireRole`); admin token rotation (JWT); kas circuit-breaker.
- **Perf (bites at 10k+):** `adminGrant` indexed query (no full-table scan) + `@@index([type,phone])`; `buildMe` rank via COUNT/window; incremental achievements off request path.
- **Bot/Mini-App:** re-link verification (anti-takeover); distinct error states (kas-timeout/not-linked/token-expired/cold-start); double-tap/AbortController guards; Telegram back-button → cancel booking; bot rate-limiter + 429 backoff; stricter phone regex.

## 4. 🟡 P2 — Completeness & Polish

- Ride history (confirm bookingReports verb; fallback = persist bookingId+status on finish; `/api/booking/history`); pay-with-bonus + booking↔cashback correlation (CoinTxn w/ bookingId FK); bot `/duel` + accept/settle push; i18n (uz/ru/en); accessibility; booking/live-state UX (confirm DELETE-cancel verb, coords warning, completed-card, faster push, per-call timeouts on getBookingInfo); game UX polish (weekly optimistic + tiebreaker, toast queue, server-time anchors, pause-on-background, ghost-null, pagination); GDPR export/delete; announce preview; admin link UI + 2FA.

## 5. 🟢 P3 — Scale & Future

- Backups/DR maturity (WAL/PITR, tested restores, replica); CI/CD + tests (GH Actions typecheck+test; coinService/memberService/bookingService unit tests; prodVerify as smoke; rollback runbook); scale-out (PgBouncer, Redis for locks/rate-limit/cache); observability maturity (Prometheus/Grafana/PagerDuty/tracing); hardening leftovers (CORS allow-list + CSRF, secret vault, type-safe kas mode, request dedup, tariff-driven ETA, data-retention purge).

---

## 6. Sequenced Execution

| Sprint | Focus | Closes |
|---|---|---|
| **0 — SURVIVAL** (this week, 3–4d) 🚨 | P0.1 backups+migration · P0.2 rotate secrets · P0.3 Sentry+alerts · P0.4 stuck-sync watchdog · P0.7 kas-reach check · P0.8 rate-limit | Postgres-expiry, secrets, monitoring, stuck-sync, kas-geo, rate-limit |
| **1 — MONEY SAFETY** (week 2) | P0.5 transactions + reconciliation · P0.6 kas retry/circuit-breaker + booking idempotency · P0.9 farming caps | all escrow/settlement/refund races, kas-429/dup-booking, farming |
| **2 — INTEGRITY & ADMIN** (week 3) | P1 unique constraints + advisory locks · game settlement races + commit-reveal · AdminAction audit + ban/refund + broadcast/periodic tracking · perf fixes | concurrency/idempotency, game races, admin gaps, N+1 |
| **3 — ANTI-CHEAT & UX** (week 4) | P1 HMAC + anti-bot + responsible-play · bot/app error states + guards · kas metrics + RBAC + token rotation | anti-cheat, UX correctness, kas observability, admin auth |
| **4 — FEATURES & POLISH** (wk 5–6) | P2 ride history, pay-with-bonus, /duel, GDPR, i18n, a11y, UX polish | deferred features + UX |
| **5 — SCALE & FUTURE** (ongoing) | P3 CI/tests, PITR/DR, Redis, observability, CORS/CSRF, retention | scale set |

> **Rule:** do not build features until Sprint 0 (Survival) ships.

## 7. Coverage Matrix
Every audited case across the 6 subsystems is placed in a tier above (Money, Games, Booking+Kas, Bot/UX, Admin/Ops, Infra/Security). By-design items (crash provable-fairness, intentional cancel-after-arrival) are explicitly accept/no-action.
