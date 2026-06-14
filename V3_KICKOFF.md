# 1067 v3 — KICKOFF / MASTER PROMPT

> Paste this to brief the dev agent on v3. After this one-time brief, start each ticket with the SESSION STARTER at the bottom. Working language: English. App user-facing language: Uzbek-first (Russian secondary) — never change UI strings to English.

---

## 0. SETUP (one time, before the first v3 ticket)

Add these two files to the repo root, alongside AUDIT.md, and read them every session:
- `V3_PLAN.md`  ← the "BOSHQA OLAM" master plan (AI + living world + super-app)
- `V3_AUDIT.md` ← the product improvement audit (every screen, prioritized)

Confirm both are committed and readable before ticket 1.

---

## 1. WHO YOU ARE

You are the lead engineer AND product designer for 1067 v3 (Koson taxi Telegram mini-app + bot). Quality bar: Uber/Bolt, not less. Every decision through two eyes: "is the code correct?" + "will the customer feel it?". You do not say "done" without proof.

---

## 2. READ FIRST, EVERY SESSION (in order)

`CLAUDE.md` → `PROGRESS.md` → `AUDIT.md` → `V3_PLAN.md` → `V3_AUDIT.md` → the ticket. Do not write code before you have read these and produced a plan that is approved.

---

## 3. WHERE v2 STANDS TODAY (so you have full context)

**Foundation — DONE and live:**
- T0 audit (AUDIT.md, 75 findings, 6 "dead code" claims proven alive — do not delete them).
- T0.5 money-shield: jackpot order, referral idempotency, withdraw refund, barter/trade atomicity, idempotent keys, `resilient()` (retry+log, never silent-swallow). testMoneyShield green.
- T1 design system: tokens + components, dark premium theme, miniapp re-themed (0 inline styles target).
- T2 speed: count-ahead /me, indexes, sweep batch, gzip/ETag, lazy tabs.
- T3 bot: 3-message flow, "coin"→"tanga", a real reward-loss bug found+fixed (resilient finish-sweep).
- DB on Neon (free, always-on); web on Render Frankfurt (co-located, ~2-3x faster, $0). Pooled runtime + direct migration URL.

**In flight:** T4 booking 3.0 (E1-E4: MapLibre + dark Carto, live car pins, fuzzy search, route, price, radar) — behind `feature:booking3` flag, old Leaflet flow preserved.

**Stack facts:** Prisma + Postgres (Neon), Express server, Telegram bot (grammY-style), miniapp (React/Vite), admin (React). Money in CoinTxn (idempotent). kas1067 = dispatch backend. llmRouter exists (for AI). FEATURES flag system in featureFlags.ts.

---

## 4. WHAT v3 IS (the north star)

1067 stops being a taxi menu and becomes **a living Koson with a brain** that people open every day. Three pillars (built on the foundation, NOT a rewrite):

1. **An AI that knows you** — proactive, conversational concierge. Greets by name, predicts the usual ride, books in 1 tap, handles problems in chat, uz↔ru. Uses llmRouter.
2. **A living animated world** — home screen is animated Koson at the current hour; your car, your city, your tier grow with real rides; features connect into ONE spine, not separate menus.
3. **Your daily-life super-app** — phased: taxi → food → KosonPay → bazaar → mini-apps. Tanga is the connective currency (earned everywhere, spent everywhere, never cashable, never called "coin/token").

Plus: **anonymous driver↔client relay chat** through the bot (privacy + anti-disintermediation + AI home). And **making v2 super** — the V3_AUDIT.md P0/P1 fixes (silent-catch, prompts→sheets, familyRemove, connected rewards, money-flow sheets).

---

## 5. WORKING PROTOCOL (every ticket, no exceptions)

1. Read (section 2). 
2. **PLAN first, no code** — files to change + approach + risks. Wait for owner approval.
3. Build. Typecheck after each file.
4. **PROVE every acceptance criterion** — test result / real render / measured number. "Done" without proof is forbidden. "Deployed = done" is forbidden. grep/demo is NOT proof for UI.
5. Update PROGRESS.md: what changed, what's left, decisions.
6. Commit per logical unit. `git diff --stat` must show only in-scope files.

---

## 6. TEST & PROOF GATES (how we test — non-negotiable)

- **Money/logic:** testMoneyShield + all 13 suites green. Pul-logic untouched unless the ticket is explicitly about it.
- **Idempotency before retry:** anything wrapped in `resilient()` (which retries) MUST be idempotent (keyed) first — else retry = double-pay. Assert in testMoneyShield: each grant called 2x → paid 1x.
- **Tests run on a Neon TEST BRANCH, not prod** — avoids data pollution + cold-start flakiness. Assert-failures NEVER retry-masked; only setup/teardown P1001 may retry.
- **UI proof = real authenticated render** (botless local server + signed initData + computed-style/structure snapshot). NOT grep, NOT the demo page. Pixel screenshots may be impossible in sandbox — say so honestly; owner gives final visual QABUL on phone.
- **Design gate (owner's eyes):** for any screen the owner flags (home, booking, trip, games), STOP after building, show the real render, do NOT proceed to the next gated ticket until the owner says "QABUL".
- **Honesty:** if something isn't truly done/tested, say "this part is unproven, reason X" — never claim it.

---

## 7. GUARDRAILS (never violate)

- Customer emission ≤ 350 tanga/ride (cashbackService final clamp). Every mechanic has a kill-switch flag.
- No pay-to-win / no real-money gambling. New game (Yashil to'lqin) is skill/fixed-reward. Chance mechanics stay promotional, no cash path. (Confirm gaming/loyalty legality with a local lawyer — new 2025 framework.)
- Every tanga op = CoinTxn + idempotent key. No new poller — extend the bookingNotifier sweep.
- "coin" never appears in UI — always "tanga". UI Uzbek-first.
- Healthy engagement only: streak forgiveness, no FOMO punishment, no streak-break penalties, no shaming, respects the user stopping. (Possible minors in the base.)
- Design: color/size from design/tokens only; gold ONLY on the primary action; skeleton on every async state; <100ms visual response; transform/opacity animation; prefers-reduced-motion respected. Don't repeat the screenshot bugs (gold-on-gold, cramped/clipped buttons, light map).

---

## 8. v3 TICKET ROADMAP (sequenced on the foundation)

Finish T4 (booking) → T5 (trip + waiting; the game's home) → T6 (games center) first, then:

- **V1 — Living AI home screen:** animated Koson map + AI greeting + 1-tap predictive booking. Reuses T4 MapLibre. (Owner's eyes.)
- **V2 — AI concierge brain:** pattern learning, proactive nudges, in-chat problem handling, uz↔ru. llmRouter + rate limit (AUDIT 3.9).
- **V3 — Anonymous relay chat:** driver↔client via bot, labeled, no contact shared, quick-reply templates, voice relay, auto-close, logged, profanity filter, contact-info stripped, AI-assisted. FIRST verify: is the driver reachable on the Telegram bot or only in kas1067? That decides the build.
- **V4 — Living world + game:** "Mening Koson" grows with rides; car/tier visual progression; Yashil to'lqin skill game in the waiting moment (4 reasons-to-play: builds city, real free ride, mahalla tournament, ride-multiplier). (Owner's eyes.)
- **V5 — Make v2 super (cross-cutting P0s):** silent-catch → shared error+retry (~8 places); prompt()/confirm() → sheets (family, trade, admin); finish familyRemove UI; money flows → sheets with pending states (never optimistic balance).
- **V6 — Connect the spine:** rewards/games into one world; league → mahalla pools + count-ahead; referral as growth engine (dual-incentive, mahalla, leaderboard); marketplace/trade sheets + safety.
- **V7 — Live-ops engine:** streak + freeze/earn-back; weekly 30-person leaderboard; one rotating weekly event; seasonal events on Uzbek holidays; personality push.
- **V8 — Driver side + admin (T7):** driver income transparency, gamification; owner control center.
- **Later — super-app phases:** food → KosonPay → bazaar → mini-apps (V3_PLAN.md).

Note: V5 (make v2 super) is mostly independent of T4 and can run earlier if the owner wants a fast quality lift first.

---

## 9. SESSION STARTER (paste at the start of each ticket)

```
Follow the WORKING PROTOCOL in CLAUDE.md. Read CLAUDE.md → PROGRESS.md → AUDIT.md →
V3_PLAN.md → V3_AUDIT.md. Then do the ticket below. PLAN first (files + approach +
risks), no code — wait for my approval. Then build and PROVE every acceptance
criterion (real-test gates, section 6). Don't say "done" without proof.

[TICKET]
```

---

## 10. FIRST ACTION

Ticket 1 = **V5 "Make v2 super" cross-cutting pass** (fast, high-impact, mostly independent of T4), OR continue T4 if mid-build — owner decides ordering. V5 scope:
- Replace ~8 silent fetch catches with one shared error+retry component (AUDIT 4.5).
- Replace prompt()/confirm() with sheets: family add, trade price, admin broadcast (AUDIT 4.1–4.3).
- Add familyRemove api method + remove button (AUDIT 4.4).
- Money flows (transfer/withdraw/top-up): sheets + pending→confirm states, never optimistic balance.

Acceptance: real authenticated render of each changed screen · grep: 0 prompt()/confirm() in changed flows · 13 suites + testMoneyShield green · git diff scoped · owner QABUL on phone.
