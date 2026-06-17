# 1067 — V0: v3 IMPROVEMENT AUDIT

**Date 2026-06-17 · read-only audit (no source file changed; verified `git status` clean before/after).**
Method: 5 parallel independent auditors (booking/driver · money rails · games/engagement · social/commerce · admin/ops), each rating every feature on 4 axes with `file:line` evidence, against the v3 vision (AI brain + living world + super-app reach). This is the V0 ticket of [V3_BUILD_PLAN.md](V3_BUILD_PLAN.md) §8.

---

## 0. BOTTOM LINE (read this first)

1. **The money model is ALREADY the v3 backbone — and it is solid.** One currency (**tanga**), one emission throttle (`grantRideCoins` ≤350/ride clamp), one idempotent ledger (`CoinTxn`), per-member serialization. Every auditor independently said: *do not touch the economic spine.* The clean, careful money code (cashback roll, transfer, withdraw, self-check/reconciliation) is genuinely v3-grade.

2. **The v3 gap is almost entirely PRESENTATION, not plumbing.** The app is **6 flat tabs / separate menus** ([App.tsx:18-26](packages/miniapp/src/App.tsx:18)); reward mechanics are scattered across 3 tabs and items/collection is mis-filed under `market`. v3's "one living world" = re-architect the surface so wheel/garage/jackpot/streak/missions/collection/league become *places in one Koson home*, not menus. **No data-model rewrite needed** to start.

3. **Two real guardrail violations vs the v3 "healthy engagement" rule** (both off-spec today): league **relegates** members for inactivity ("come back or fall") and the streak **hard-resets** on one missed day (no Duolingo grace).

4. **A short list of genuine bugs** (money-adjacent or security), independent of v3 — worth fixing now regardless of roadmap.

5. **The booking3 map flow (the closest thing to the v3 "living home") is built but flag-OFF for users** — the whole v3 map vision is blocked behind one owner sign-off + flag flip.

---

## 1. DRIVER-CHANNEL ANSWER (blocking gate for the relay-chat ticket)

> **Are drivers reachable on OUR Telegram bot, or only inside kas1067?**

### Answer: **KAS_ONLY**
Our bot dispatches to kas1067; **kas decides and notifies which driver gets the ride, inside kas's own system.** Our bot only messages drivers for *loyalty* events (tips, recruit milestones) — never "a ride is waiting, accept it." There is **no ride list, no accept button, no incoming-order surface** anywhere on our side.

### Evidence
| Claim | Evidence |
|---|---|
| Dispatch is a kas web call, not a driver message | every path ends at `getDataSource().createBooking()` → `POST api/bookings/throughWeb` ([kas/client.ts:329](packages/server/src/kas/client.ts:329)); callers `bookingService.ts:144,351`, `bot/booking.ts:425`, `scheduledService.ts:66,123` — none messages a driver |
| kas assigns; we only observe | assigned driver appears only when kas sets `carNumber`, looked up via `getDriverByCar` ([kas/client.ts:377-431](packages/server/src/kas/client.ts:377)); `notifiedCount` read from kas's list ([client.ts:442](packages/server/src/kas/client.ts:442)) |
| The sweep messages the RIDER, never the driver about a ride | `pushBookingUpdates` edits the ride card to the *booker's* `telegramUser` ([bookingNotifier.ts:174-259](packages/server/src/services/bookingNotifier.ts:174)); new-booking notices go to **admins** via `alertAdmins`, not drivers |
| `driver.tsx` is driver-facing but a **wallet, not a dispatch panel** | earnings/ledger only ([driver.tsx:1-75](packages/miniapp/src/driver.tsx:1)); no ride list / accept |
| Drivers *can* be bot users | linked by phone (recruit QR, tip recipient) — so a channel to a specific driver *exists*, it's just never used to deliver a ride |

### Implication for anonymous relay-chat
**Not buildable as a guaranteed feature today.** The data seam exists — given a `carNumber` from kas you can resolve the driver's `telegramUser` (`prisma.member.findFirst({type:"driver",carNumber})`, already done at [bookingNotifier.ts:356-360](packages/server/src/services/bookingNotifier.ts:356)) — but relay-chat is blocked on:
1. **Driver-side bot adoption** — the assigned driver must reliably be a linked `telegramUser` watching our bot at dispatch time (today only ad-hoc via recruit QR / tips).
2. **A masking decision** — we currently *show the driver's raw phone* to the rider ([bookingNotifier.ts:79](packages/server/src/services/bookingNotifier.ts:79), `bk:call`). "Anonymous" relay would be a *new* guarantee requiring we stop surfacing that phone.

**Verdict: defer the relay-chat ticket** until drivers are first-class bot users at kas-assignment time. The recruit funnel is the prerequisite. Until then it degrades to "best-effort if the driver happens to be linked."

---

## 2. PER-FEATURE AUDIT (4 axes + file:line)

Verdict legend: **KEEP** (serves v3) · **IMPROVE** (keep, fix gaps) · **CONNECT** (good, but de-silo into the world spine) · **CUT** (retire/merge).

### Cluster A — Booking · trip · scheduling · driver · bot menu
| Feature | Verdict | UX gaps (file:line) | Money/safety | v3-readiness |
|---|---|---|---|---|
| Classic booking | **CUT** (fold into booking3) | silent `.catch(()=>…)` on every load: history/scheduled/nearby/predict/estimate/poll/search/rate ([booking.tsx:68,102,264,289,306,317,337,383](packages/miniapp/src/booking.tsx:68)); map-dead only a CSS class after 4 tile errors (:219) | clean — routes through atomic `claimDispatchSlot` + active-booking guard | a menu, not a place; migrate ScheduleBlock+family then delete |
| booking3 (map-first) | **KEEP+IMPROVE** (the spine candidate) | **flag-OFF for users** ([booking3.tsx:160](packages/miniapp/src/booking3.tsx:160)); no scheduled/family entry here; RIDE_TAGS/TILE_URL hand-duped from server (:43) | clean — all rewards display-only, granted by sweep w/ idempotent keys | make it the default home; AI proactive chip plugs in above the pickup sheet |
| Trip card / live timeline | **KEEP** (strongest piece) | card cadence = global sweep (~slow) vs 3-12s miniapp polls; cancelled-while-searching card has no rebook CTA | **cleanest money code in repo** — every finish-grant idempotent-keyed + `resilient()`; finish-card once-per-ride marker | already currency-unified; make rewards resolve as "earned at <place>" |
| Scheduled + family booking | **CONNECT** | only reachable from classic flow after pickup; bot "later" intent is **stubbed** ([bot.ts:506](packages/server/src/bot/bot.ts:506) says "tez orada", doesn't schedule); fixed slots not learned | clean — validates ≥15min/≤7d/≤3 pending; atomic dispatch claim | the literal substrate for pillar-A "learns home→work" |
| Driver panel | **IMPROVE** (it's a loyalty wallet, not ops) | answers "app tanga earned," easily confused with cash fares; static "manbalari" paragraph | clean — read-only view | drivers need a real hub (rides, recruit, tier) — invisible today |
| Bot menu / commands | **KEEP+IMPROVE** | `Buyurtmam` + `Taxi` both → `go=book` (relies on booking3 flag); **3 booking surfaces** (classic miniapp + booking3 + in-chat wizard); free-text AI thin | clean — tip via capped idempotent `transfer()` | the menu *is* the anti-pattern v3 dissolves; deep-links are the right bridge |

### Cluster B — Money rails
| Feature | Verdict | UX gaps (file:line) | Money/safety | v3-readiness |
|---|---|---|---|---|
| Wallet view | **CONNECT** | hero counts from **stale `me.coins`** until `/api/wallet` loads ([wallet.tsx:353](packages/miniapp/src/wallet.tsx:353)); `CashbackFareCard`+missions `.catch(()=>null)` → silently vanish (:22,343) | clean — read-only; server re-checks can-withdraw/topup | **two-balance model (tanga vs cashback/so'm) is the central v3 misfit** |
| P2P transfer | **KEEP** | lookup error == "not found" (no retry); **no confirm step** showing net-after-burn before send | clean & best-defended — `withMemberLock(from)` (the just-fixed cap race **is present**, [transferService.ts:96](packages/server/src/services/transferService.ts:96)); received-cap soft (no recipient lock, multi-sender = inspection-only) | promote from sub-sheet to a social verb (tip from ride screen) |
| Withdraw (real money out) | **KEEP** | refund-on-fail window shows scary zero; global-budget block reuses personal `daily_cap` copy (wrong message) | clean — `withMemberLock` + DB-atomic revenue budget + 50000/day + ride-gate; **kas lost-ack double-credit = inspection-only** (kas has no idempotency) | make budget-block vs personal-cap legible |
| Top-up (cashback→tanga) | **KEEP** | conditional discoverability; `kas_failed` is **un-retried** (marker only on success) → possible silent cashback loss | clean — `topup:{reqId}` key + `withPhoneLock`; same kas lost-ack caveat (opposite sign) | disappears if v3 unifies on one currency |
| Cashback (ride-roll → coins) | **KEEP** (the heartbeat) | preview card silently vanishes on error | clean — `RideReward` unique-first, then claim; ≤350 via `grantRideCoins` clamp; **jackpot intentionally bypasses the clamp** (pre-funded pool, single claim — "≤350" needs that asterisk) | route *every* future world reward through `grantRideCoins` to keep one throttle |

### Cluster C — Games & engagement
| Feature | Verdict | UX gaps (file:line) | Money/safety | v3-readiness |
|---|---|---|---|---|
| Roulette / wheel | **KEEP+CONNECT** | spin failure swallowed, no toast ([rewards.tsx:162](packages/miniapp/src/rewards.tsx:162)); dead for non-riders; duplicate rule copy | clean — WheelSpin insert before jackpot claim; shared `jackpotwin` key; ≤350 clamp; kill-switch at service | fire as the in-ride world moment, not a tab card |
| Garage | **KEEP+CONNECT** | earn is **invisible** — `equippedEstimate` computed ([garageService.ts:88](packages/server/src/services/garageService.ts:88)) but never rendered; quiet 50%-unserviced bleed | clean — wear advances only when grant lands (atomic) | render the car *on the map* with a live tanga counter |
| Streak / check-in | **KEEP+IMPROVE** | **currency bug:** toast says `+N so'm` but pays tanga ([rewards.tsx:332](packages/miniapp/src/rewards.tsx:332)) — violates CLAUDE.md "tanga only" | clean — `streak:<m>:<day>` key | **GUARDRAIL MISS: hard reset on 1 missed day** ([rewardService.ts:73](packages/server/src/services/rewardService.ts:73)) — add Duolingo grace/freeze |
| Missions | **KEEP+CONNECT** | own tab; cross-tab handoff from Bonus; **kombo ×2 triggers silently** ([missionService.ts:94](packages/server/src/services/missionService.ts:94)) — best re-engagement hook is invisible | clean — pay-first-then-stamp w/ `mission:<code>:<m>:<period>` key | confirm the kombo with a toast; fold into world home |
| Weekly league / tiers | **KEEP+IMPROVE** | another silo; no "X pts to next rank" nudge (data exists) | clean — payout idempotent (`weekly_paid_<wk>`) | **GUARDRAIL MISS: relegation-for-inactivity** ([weeklyService.ts:168](packages/server/src/services/weeklyService.ts:168) "come back or fall") — remove |
| Mystery box | **KEEP+CONNECT** | open failure swallowed ([rewards.tsx:220](packages/miniapp/src/rewards.tsx:220)); locked state doesn't name the remaining quest; **half-built premium box** scaffolding ([boxService.ts:33](packages/server/src/services/boxService.ts:33)) | clean — find-or-create row anchor + keyed grant | a chest that appears in Koson when your day is done |
| Items / collection | **CONNECT** (mis-placed) | **filed under `market` tab** ([api.ts:144](packages/miniapp/src/api.ts:144)), divorced from garage; drop moments uncelebrated | clean — mint = spend+cap in one tx; ≥3-ride anti-farm | **most mis-placed feature** — unify with garage as "your Koson world" |
| 1067 Plus | **KEEP+IMPROVE** | section **silently vanishes** on load error ([rewards.tsx:87](packages/miniapp/src/rewards.tsx:87)); copy "cashback ×1.5" (should be tanga + convey the +150 cap) | clean — trial one-shot marker; paid via atomic spend | weave perks through the world vs a purchase card |
| Jackpot | **KEEP+CONNECT** | **no home** — only a badge on the wheel ([rewards.tsx:182](packages/miniapp/src/rewards.tsx:182)); growth invisible | clean — atomic SQL grow; claim resets to floor; shared key | a persistent, visibly-climbing pot everyone sees |
| Surprise drop | **KEEP+IMPROVE** | **push-only, zero in-app surface** ([weeklyService.ts:209](packages/server/src/services/weeklyService.ts:209)); "just for being with us" masks tuned reinforcement | clean — `surprise:<m>:<day>` key | surface as a gift that appears in your Koson home |

### Cluster D — Social & commerce
| Feature | Verdict | UX gaps (file:line) | Money/safety | v3-readiness |
|---|---|---|---|---|
| Marketplace / shops | **KEEP** | `MyShopPanel` returns null on error → owner sees nothing ([market.tsx:251](packages/miniapp/src/market.tsx:251)); vouchers have **no shop address/phone/hours** | mostly clean — **`buyListing` per-user-cap is racy** (count-then-spend not atomic, [marketService.ts:78](packages/server/src/services/marketService.ts:78)) | shops should be *places* on the map, not a flat list |
| Trade / barter | **IMPROVE → CONNECT/CUT** | **discovery-blind** (no browse of what's for sale); strikes 1-2 give no warning before 30-day ban | **strongest code in cluster** — escrow + dual barter fee + ownership-guarded flips in one tx | a separate menu w/ its own chat = moderation cost for low traffic |
| **Referral** (THE growth engine) | **IMPROVE (top priority)** | reward **invisible until it pays** — no "friend joined, waiting on first ride" pending state ([referralService.ts:45](packages/server/src/services/referralService.ts:45)); link-only virality (no forward-to-chat) | clean — textbook anti-sybil (deferred to referee's first ride, phone-dedup, ride-agnostic keys) | **~50% built as growth engine: NO mahalla scope anywhere** (`weekly.ts` has zero neighborhood field), no referral-specific board, no milestone tier |
| Driver recruit | **KEEP** | **backend+QR only** — recruiter is blind in-bot; no "Mening mijozlarim" panel (data exists in `recruitStats`) | clean — `recruit1/recruit3/rev:` keys, P2002 race re-read, 30k/mo cap, self/family dedup | driver needs an in-bot recruit panel |
| Corporate (B2B) | **KEEP** (admin tool) | balance top-up via **`prompt()` → `Number()` → `NaN`** corrupts balance ([admin App.tsx:422](packages/admin/src/App.tsx:422) + no guard [corpService.ts:21](packages/server/src/services/corpService.ts:21)); report is a comma-string; no employee-remove | N+1 **already fixed** (2 batched queries); **but `adjustCorpBalance` accepts NaN/negative** | fine as admin-only ("later" pillar); harden the mutation |
| Gap circles | **KEEP** | **no shareable link** (code-only join), no leave/disband; "~8 safar" copy ≠ real `ceil(members*1.5)` | clean — all 4 payouts idempotency-keyed; settle marker advisory but keys block double-pay | **almost the v3 mahalla unit already** — build the inter-gap (mahalla) leaderboard on gaps |

### Cluster E — Admin & cross-cutting ops
| Feature | Verdict | UX gaps (file:line) | Money/safety | v3-readiness |
|---|---|---|---|---|
| Admin login / auth | **KEEP** | no skeleton (covered by pill); `?key=` URL auth still live | **operator tokens can NEVER be revoked/listed** (create-only, [server.ts:706](packages/server/src/api/server.ts:706)); no brute-force throttle on login | needs an operator registry (issued/label/last-seen/revoke) for a multi-op team |
| Puls (ops pulse) | **IMPROVE** | 30s poll never pauses on hidden tab | clean — read-only; degrades gracefully on stale reports | **reactive thresholds, not the AI brain** — wants demand forecast + anomaly-vs-baseline |
| Moliya (finance) | **KEEP** (strongest screen) | full error/empty states present | clean — authoritative liability; **latent: full-table groupBy every 30s/tab** ([adminOps.ts:64](packages/server/src/services/adminOps.ts:64)) | add burn-rate/runway trend + per-cohort liability |
| Live map + 360 | **IMPROVE** | shared error string across both panels; map no empty state; **`alert()`** on QR | both `requireAdmin` (read-only PII — ok for ops) | wants supply-vs-demand heatmap + churn banner on member360 |
| Kill-switch panel | **KEEP** | `alert()` feedback; `prompt()` for corp money | features POST correctly `requireOwner`; **`corps/:id/employees` is operator-open** ([server.ts:725](packages/server/src/api/server.ts:725)) — operator adds members who spend prepaid balance | add an audit log of who toggled what |
| Withdraw queue | **KEEP** | **read-only — no retry/resolve action** on a stuck cashout; no "25 of N" | clean — keyed on `kasApplied:false` | wants one-click re-push + SLA timer |
| Smart push (notifyService) | **KEEP** | **zero operator visibility** into the engine; failures dropped with no metric | clean — 2/day cap, quiet hours, claim-before-send dedup; **per-member N+1** in comeback/garage checks ([notifyService.ts:67,85](packages/server/src/services/notifyService.ts:67)) | the seed of pillar A but **no feedback loop / telemetry** |
| Analytics / north-star | **KEEP** | cards sit at "…" forever on error (no retry, unlike Puls) | clean read; driver tiers recompute off a structurally-thin ~1.3-day kas window (documented) | wants D1/D7/D30 cohort retention + churn + LTV |
| Self-check + reconciliation | **KEEP** (crown jewel) | heal has no error feedback; **unflag button missing though the alert tells the owner to use it** ([reconciliation.ts:76](packages/server/src/services/reconciliation.ts:76) vs [App.tsx:512](packages/admin/src/App.tsx:512)) | **best boundary** — heal/unflag `requireOwner`, floors at 0; full-table scan is heavy but correct | wants anomaly severity scoring + auto-freeze on worst cases |

---

## 3. TOP-15 IMPROVEMENTS (ranked by impact ÷ effort)

> Impact H/M/L · Effort S/M/L. Tier 1 = money/security/guardrail correctness (do regardless of v3). Tier 2 = high-leverage v3/UX.

| # | Fix | Why | File | Impact/Effort |
|---|---|---|---|---|
| 1 | **Guard `adjustCorpBalance` vs NaN/negative + replace the `prompt()`** | a typo in the admin prompt silently corrupts a paying corp's prepaid pool | [corpService.ts:21](packages/server/src/services/corpService.ts:21), [admin App.tsx:422](packages/admin/src/App.tsx:422) | H / S |
| 2 | **Add operator-token list + revoke** (`GET`/`DELETE /api/admin/optokens` + panel) | a leaked/ex-employee operator token is valid **forever** today | [server.ts:706](packages/server/src/api/server.ts:706) | H / S |
| 3 | **Add `requireOwner` to `corps/:id/employees`** | operator can add members who then drain a corp's prepaid balance | [server.ts:725](packages/server/src/api/server.ts:725) | H / S |
| 4 | **Add the missing unflag button to IntegrityView** | frozen withdraws can't be lifted from the panel; the alert *promises* a control that doesn't exist | [App.tsx:512](packages/admin/src/App.tsx:512), [reconciliation.ts:76](packages/server/src/services/reconciliation.ts:76) | H / S |
| 5 | **Remove league relegation-for-inactivity** | direct v3 "no FOMO/punishment" guardrail violation ("come back or fall") | [weeklyService.ts:168](packages/server/src/services/weeklyService.ts:168) | H / S |
| 6 | **Fix check-in toast `so'm` → `tanga`** | factually wrong currency + breaks CLAUDE.md "coin/so'm never in UI, always tanga" | [rewards.tsx:332](packages/miniapp/src/rewards.tsx:332) | H / S |
| 7 | **Make `buyListing` per-user cap atomic** | concurrent buys bypass `perUserLimit` (mint 2 vouchers) | [marketService.ts:78](packages/server/src/services/marketService.ts:78) | M / M |
| 8 | **Wire bot "later" intent → real `createScheduled`** | conversational scheduling is currently a stub that says "soon" and does nothing | [bot.ts:506](packages/server/src/bot/bot.ts:506) | H / S |
| 9 | **Surface referral pending state** ("friend joined — waiting on 1st ride") | biggest conversion leak in THE growth engine; data already exists | [referralService.ts:45](packages/server/src/services/referralService.ts:45) | H / S |
| 10 | **Fix `MyShopPanel` silent-blank on error** | a shop owner whose panel fails sees nothing, == "you own no shop" | [market.tsx:251](packages/miniapp/src/market.tsx:251) | H / S |
| 11 | **Error toasts on silent action failures** (wheel spin, box open, +Plus/cashback vanish) | failed actions give the user nothing; pervasive `.catch(()=>…)` | [rewards.tsx:162,220,87](packages/miniapp/src/rewards.tsx:162), [wallet.tsx:22](packages/miniapp/src/wallet.tsx:22) | M / S |
| 12 | **Confirm the daily-kombo ×2 trigger** (toast/animation) | best re-engagement hook in the codebase is currently invisible | [missionService.ts:94](packages/server/src/services/missionService.ts:94) | H / S |
| 13 | **Add streak grace-day / freeze** | Duolingo-lenient guardrail; one missed day shouldn't zero the streak | [rewardService.ts:73](packages/server/src/services/rewardService.ts:73) | M / M |
| 14 | **Split withdraw `daily_cap` vs `budget_exhausted` copy** | a user under personal cap but blocked by global budget is told the wrong, unactionable thing | [coinService.ts:184](packages/server/src/services/coinService.ts:184), [wallet.tsx:199](packages/miniapp/src/wallet.tsx:199) | M / S |
| 15 | **Add gap shareable invite link + leave/disband** | code-only join kills a viral circle mechanic; no exit (half-finished-remove pattern) | [gapService.ts](packages/server/src/services/gapService.ts), [components.tsx:325](packages/miniapp/src/components.tsx:325) | H / S |

**Strategic (owner decisions / larger, tracked separately — not in the 15 because effort or owner-gated):**
- **Flip `booking3` ON** (owner-accept + 1 pilot ride) — unblocks the entire v3 map/living-home vision. The single biggest unlock; gated on owner sign-off, not engineering. (H / S once accepted.)
- **Add `mahalla` to Member + build the mahalla-scoped leaderboard ON gaps** — one change feeds the v3 referral growth-engine AND the gap feature AND the "one world/progression" spine. (H / L.)
- **Kas-write reconciliation** (idempotency or post-hoc reconcile of kas bonus writes vs `Withdrawal` rows) — closes the lost-ack double-credit/silent-loss. (H / L, real money, low probability.)

---

## 4. CROSS-CUTTING THEMES

### 4.1 Healthy-engagement guardrail violations (v3 §6)
| Concern | Where | Severity |
|---|---|---|
| League **relegation for zero-score/inactivity** ("come back or fall") | [weeklyService.ts:168-176](packages/server/src/services/weeklyService.ts:168) | **Highest — direct FOMO/punishment** |
| **Hard streak reset** on one missed day (no grace) | [rewardService.ts:73](packages/server/src/services/rewardService.ts:73) | High — contradicts "Duolingo-lenient" |
| Streak "saqlang" loss-framing | [rewards.tsx:292](packages/miniapp/src/rewards.tsx:292) | Low |
| Surprise-drop "just for being with us" masks tuned reinforcement | [weeklyService.ts:212](packages/server/src/services/weeklyService.ts:212) | Low (no cost to user) |
| ✅ **No chance-based REAL-money risk anywhere** — wheel/box/jackpot all every-win, no paid entry, tanga-settled, ≤350 clamp | — | **Compliant** |

### 4.2 Real bugs (independent of v3 — fix anytime)
1. `adjustCorpBalance` NaN/negative via `prompt()` → corrupts corp balance (#1 above).
2. `buyListing` per-user-cap race → voucher cap bypass (#7).
3. Operator tokens never revocable/listable (#2); `corps/:id/employees` operator-open (#3).
4. Unflag UI missing though endpoint + alert reference it (#4).
5. **kas lost-ack** → withdraw double-credit / topup silent-loss (kas has no idempotency; inspection-only, low prob).

### 4.3 Latent scaling risk (escalate before any horizontal scale)
**Every `withMemberLock`/`withPhoneLock` guarantee is in-process** ([coinService.ts:7,21](packages/server/src/services/coinService.ts:7)) — sound on Render single-instance **today**, but transfer/withdraw/topup races all reopen the moment a 2nd instance/region is added. Only the global **withdraw budget** is DB-atomic and survives multi-instance. **Document single-instance as a hard deploy constraint**, or move the locks to DB advisory locks before scaling.

### 4.4 Pervasive UX-quality patterns
- **Silent `.catch(()=>…)`** swallowing errors into blank/empty (booking ×8, wallet cards, wheel, box, Plus, market panels, analytics) — inconsistent with the good retry pattern used in Liga/Missions/Finance. Standardize on `<LoadError onRetry>` / toast.
- **Currency-label leaks**: "so'm"/"cashback" where the rule mandates "tanga" (check-in toast, Plus copy, referral/recruit code comments).
- **`prompt()`/`alert()`** anti-patterns in admin (corp balance, QR) — replace with inline forms/toasts.
- **Earned value invisible at the moment it's earned** (garage per-ride, surprise drop, part/badge drops, kombo ×2) — the payoff isn't felt.

---

## 5. WHAT THIS MEANS FOR THE v3 ROADMAP

| v3 ticket | Audit verdict | Note |
|---|---|---|
| **V1 — Living AI home** | **Start here, low-risk** — reuses booking3's map (built). Flip `booking3` ON first. | the map exists; the work is making it the home + placing mechanics as world spots |
| **V2 — AI brain** | foundation present (`llmRouter` + `intent` skeleton, OFF) — needs free keys + the proactive/scheduling layer wired ([bot.ts:506](packages/server/src/bot/bot.ts:506) stub) | |
| **V3 — Relay chat** | **BLOCKED** — driver channel is KAS_ONLY (§1). Do the driver-adoption funnel first. | |
| **V4 — Living world / collection** | items/collection is the most mis-placed feature; unify with garage. Guardrail fixes (#5,#13) land here. | |
| **V5 — Live-ops engine** | smart-push + self-check are strong seeds; missing the telemetry/feedback loop + mahalla scope. | |
| **V6 — v2 rebuilds into the spine** | the bulk of the TOP-15 lives here — it's mostly presentation + the silent-catch/currency-leak sweep. | |

**One-sentence v3 thesis confirmed by the audit:** the engine is built and safe; v3 is about **collapsing 6 menus into one living Koson world, fixing two guardrail violations, and adding the intelligence/telemetry layer** — not rebuilding the money core.

---

*Generated by the V0 audit (5 independent read-only auditors). No source file modified. Next: owner picks the first v3 build ticket (recommended: V1 living-home, starting with the `booking3` flag flip).*
