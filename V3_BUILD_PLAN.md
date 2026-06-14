# 1067 v3 — BUILD PLAN
### Working language: English. App user-facing language: Uzbek-first (Russian second). Built ON the v0–v2 foundation — not a rewrite.

> Based on three deep-research reports (Telegram game wave · live-ops engine · Uzbekistan market) + the existing AUDIT.md. Owner picked the v3 feel: **an AI that knows you + a living animated world + a daily-life super-app.** Plus two owner requests: **anonymous driver↔client relay chat**, and **improve all v2 functions**.

---

## 1. NORTH STAR

1067 stops being a taxi *menu* and becomes a **living Koson with a brain.**
You open it and it is already alive — your city at this hour, cars moving on real streets, your district glowing because you "own" it — and an AI greets you by name and books your ride *before you ask.* Over time it becomes the app you open for everything in Koson.

This is a 1000x leap because v2 has none of the three things that define it:
- **A brain** — v2 waits for taps; v3 predicts and talks.
- **A living world** — v2 is separate menus; v3 is one place that grows with you.
- **Reach** — v2 is a taxi app; v3 runs your day.

Everything is built on what already works: money-safety (T0.5), Neon DB, Frankfurt speed, the design system (T1), and the booking/trip/games rebuild (T4–T6).

---

## 2. THE UNIFYING PRODUCT — the living home screen

The home screen IS the product. Not a menu — a living map of Koson (dark Carto, time-of-day lighting), your taxi parked outside your home, live cars drifting, your owned districts glowing. An AI assistant (named, Uzbek voice) greets you and offers your usual ride in one tap. Every service, game, and reward is a *place or action in this world*, tied together by **tanga**. You don't navigate menus — you live in Koson.

This single screen contains all three pillars at once, which is why it is the first thing we build (it reuses the T4 map work — not a detour).

---

## 3. THE THREE PILLARS (concrete)

### Pillar A — The AI brain ("knows you")
- Named assistant persona, Uzbek-first, warm and short.
- **Proactive:** learns patterns (home→work ~8:00, work→home ~18:00), weather-aware ("yomg'ir — erta chiqasizmi?"), suggests the ride before you ask.
- **Conversational booking:** "ishxonaga" → knows the address → 1 tap to confirm.
- **Handles problems in chat:** "haydovchi kech qolyapti" → AI responds, offers options, can re-dispatch.
- **Personal:** greets by name, remembers preferences, celebrates milestones, auto-translates uz↔ru.
- Powered by the existing `llmRouter` (already in the codebase) with strict daily caps (atomic, per AUDIT 3.11 fix).

### Pillar B — The living world ("grows with you")
- Home = animated Koson map (time-of-day, live cars, your taxi, glowing districts).
- **Your Koson grows** with every real ride (the "Mening Koson" builder is the meta).
- **Car + tier** level up visually (bronze→diamond), real perks per tier.
- **Yashil to'lqin** (the chosen game) lives in the waiting moment; rewards feed the world.
- All v2 reward mechanics (roulette, garage, streak, league) re-rendered as *places in this world*, not separate menus — connected by one progression and one currency.

### Pillar C — Super-app reach ("runs your day")
Phased by frequency (research law: increase frequency, not scope), tied by tanga:
taxi (now) → food (5–20 local restaurants; drivers courier off-peak) → KosonPay (bills, P2P, QR via Payme/Click PSP) → KosonBazaar (local market, drivers deliver) → mini-apps (pharmacy, doctor, services) → finance (BNPL on transaction history). Each is a new place in the same world. This is the long arc (1–2 years); the *feeling* of a different world arrives with Pillar A+B now.

---

## 4. NEW FEATURE — Anonymous relay chat (driver ↔ client)

**What:** When a ride is assigned, the bot opens a private relay tied to `bookingId`. Client types in the bot → forwarded to driver as "Mijoz: …"; driver replies → "Haydovchi: …". Neither sees the other's phone, username, or chat ID. The bot is the middleman.

**Mechanics:**
- One-tap quick replies for drivers (driving-safe): "Chiqdim", "2 daqiqada", "Yetib keldim", "Qayerdasiz?". Relayed voice messages allowed.
- Auto-closes a few minutes after ride ends. Messages logged for dispute/abuse.
- Safety: profanity filter (reuse market moderation), report button, **strip phone numbers/usernames** from relayed text, per-user rate limit.
- **AI sits inside the relay:** suggests replies, auto-translates uz↔ru, detects "I'm late" → proactively offers the client options.

**Why it matters (three wins at once):** privacy/safety (no personal numbers), **anti-disintermediation** (driver & client literally cannot exchange contacts → cannot leave the platform), and it's the natural home for the AI pillar.

**DEPENDENCY to confirm first:** is the driver reachable on our Telegram bot, or only inside the kas1067 app? If on the bot → straightforward. If only in kas → integrate kas messaging or bring drivers onto the bot's driver panel. The audit (V0) must answer this before this ticket is built.

---

## 5. v2 REBUILD — all four areas (owner picked all)

Each is reborn *into the world spine* (not a separate menu) and fixes its AUDIT items.

- **Wallet & transfers** — sheets not prompts (AUDIT 4.1/4.2), clear pending/success/rollback states, never optimistic on the balance number, faster `/api/me` (count-ahead, T2). Money-safety already hardened (T0.5).
- **Rewards & games** — roulette/garage/streak/missions/league connected into ONE progression + identity (the spine). Skill-based earning sits beside the existing wheel; healthy engagement (Duolingo-lenient streaks, no FOMO punishment).
- **Marketplace & trade** — buy/sell sheets with number input + min/max + preview, atomic trades (T0.5 hardened), clearer moderation reasons (AUDIT 4.9), better empty/error states.
- **Referral, family & corporate** — fix half-finished pieces (family-remove missing UI, AUDIT 4.4), make **referral the growth engine** the research demands (dual-incentive, mahalla-scoped leaderboard, meaningful reward), fix corp report N+1 (AUDIT 2.7).

---

## 6. GUARDRAILS (non-negotiable, carried from the proven process)

- **Money safety + idempotency** — every grant keyed; `resilient()` retry only on idempotent ops (T0.5 + T3 discipline). Clamp 350/ride. No pay-to-win.
- **Healthy engagement** — lenient streaks, no FOMO/streak-punishment, no chance-based real-money rewards. Fixed/skill rewards. (Uzbek gambling law new 2025 → legal review before any chance mechanic.)
- **Uzbek-first UI**, data-light (<200KB, 3G, budget Android), feature-flag everything (old flow never breaks).
- **Real-test gate** — "done" means proven (real data, edge values, real authenticated render). No "deploy = done", no grep/demo as UI proof.
- **Design gate** — owner sees real rendered screens before each UI ticket closes.

---

## 7. v3 TICKET ROADMAP (audit-first — mirrors the proven T0→T8 process)

- **V0 — v3 AUDIT** (do first): comprehensive product audit, every feature/screen/flow rated for improvement against the v3 vision. Includes the kas driver-channel question.
- **V1 — Living AI home screen** (after T4 map lands; reuses MapLibre).
- **V2 — AI concierge brain** (patterns, proactive, in-chat problems, uz↔ru; on `llmRouter`).
- **V3 — Anonymous relay chat** (after V0 confirms driver channel).
- **V4 — Living world deepening** (Mening Koson grows with rides; car/tier visuals) + **Yashil to'lqin** game in the waiting moment.
- **V5 — Live-ops engine** (streak+freeze, mahalla leaderboard pools of 30, one weekly event, holiday seasons, personality push).
- **V6 — v2 rebuilds** (wallet · rewards/games · marketplace/trade · referral/family/corp — folded into the spine).
- **Later — super-app phases** (food → KosonPay → bazaar → mini-apps → finance).

(Existing T4–T6 continue in parallel as the premium booking/trip/games base these build on.)

---

## 8. PASTE-READY: FIRST TICKET — V0 (v3 AUDIT)

```
CLAUDE.md ISHLASH PROTOKOLIga amal qil. PROGRESS.md, AUDIT.md, va v3 build planni o'qi.
ROLE: product + engineering auditor. NO code changes — read-only, report only.

# V0 — v3 IMPROVEMENT AUDIT (audit every point against the v3 vision)
Produce AUDIT_v3.md. For EVERY feature/screen/flow in the app (booking, wallet,
transfers, withdraw, top-up, roulette, garage, streak, missions, league,
marketplace, trade, items, referral, family, corporate, bot menu, driver panel,
admin), rate it on FOUR axes and give file:line evidence:

1. KEEP / IMPROVE / CONNECT / CUT — does it serve the v3 vision (AI brain +
   living world + super-app), and how?
2. UX gaps — every prompt()/confirm(), silent catch, missing error/empty/skeleton
   state, confusing copy, >2-tap flow. (Extend AUDIT.md section 4.)
3. Money/safety — any non-idempotent grant, non-resilient reward path, race,
   un-keyed mutation. (Confirm T0.5/T3 coverage is complete.)
4. v3-readiness — what must change for this feature to live IN the world spine
   (one progression, one currency) instead of as a separate menu.

ALSO ANSWER (blocks the relay-chat ticket):
- Driver channel: are drivers reachable on OUR Telegram bot, or only inside kas1067?
  Evidence (driver panel code, how driver gets notified/assigned).

OUTPUT: AUDIT_v3.md — table per feature with the 4 axes + file:line, a TOP-15
improvement list ranked by (impact ÷ effort), and the driver-channel answer.
NO source file changed (git status clean except AUDIT_v3.md + PROGRESS.md).
```

---

## 9. THE GAME & ITS ECONOMY (owner refinement)

**The game = a taxi endless-runner ("Danger Dash" style).** You drive through Koson: dodge traffic, don't crash, don't stop at the red line, chain combos. **Skill, not luck** (legally safe, distinct from the roulette wheel). Free to play; you win or lose a run. 30–60s rounds, juicy feedback. This is the addictive first-month hook.

**Economy — the payout safety valve (the key point):**
- The game pays **tanga only — never cash.** Tanga buys ride discounts / free rides inside the app and can never be cashed out. (Legal safety in Uzbekistan + zero money drain.)
- **Hard daily cap** (~20–30 tanga/day from the game) no matter how long you play. This is the protection the owner wants: the game can never drain real money and can never be "farmed."
- **Ride-multiplier:** more real rides this week → higher daily cap / better rate. The game rewards real customers, not idle grinders.

**Honest reframe of "grind 10 hours = 100 so'm":** designing maximum addiction for near-zero payout is the Hamster Kombat trap — players feel used and quit angry (that game crashed; people resented it). The daily cap gives the SAME business safety *without* the resentment, if we flip the framing: people play because the game is **fun**, tanga is a small useful bonus (not the goal), and the cap means "you got your fun + your bonus — come back tomorrow," not "you grinded all day for nothing." Fun drives the first month; the cap protects the money. Both win.

**Guardrails:** young people will play → no dark patterns, respect the player's time, fixed/skill rewards (not gambling), daily cap shown upfront. Safer for users and under Uzbekistan's 2025 gambling law.

## 10. ADVANCE BOOKING (under Pillar A — AI brain)

Schedule a ride **3–4 days ahead** ("ertaga 8:00 ishxonaga"). The AI confirms, reminds before, and dispatches on time; it learns recurring trips and offers to auto-schedule them. A real "intelligence" feature and a genuine differentiator over informal phone-dispatch taxi. Lands with the AI brain ticket (V2); driver-side assignment for future rides confirmed in the V0 audit.

---

## SOURCES / BASIS
- v3 master plan (Uzbek) + the three research reports: super-app playbook, live-ops engine, Uzbekistan market (see `1067_v3_BOSHQA_OLAM_master_plan.md`).
- Existing `AUDIT.md` (T0 technical rentgen, 75 items).
