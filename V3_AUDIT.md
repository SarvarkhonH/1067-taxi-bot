# 1067 — PRODUCT IMPROVEMENT AUDIT (v3 lens)

> Companion to the technical AUDIT.md. That one = code (dead code, speed, risk, architecture). This one = **product, UX, features, and experience** — every screen and flow, what's weak today and what "better" means, prioritized. Read through the v3 north star: an AI that runs a living Koson you open every day, growing into your daily-life super-app.
>
> **Honest scope note:** this is synthesized from the technical AUDIT.md, the live screenshots, the work order, the market/retention research, and this product's known feature set — not a fresh line-by-line code read. Items marked `[verify]` need the dev agent to confirm against the current code before building.

**Priority key:** `P0` do now / blocks the leap · `P1` high value · `P2` later · `QW` quick win (small effort, visible payoff).

---

## 0. THE BIG LEVERS (cross-cutting — fix these and many screens improve at once)

1. **No brain.** `P0` — The app is silent; it waits for taps. The single biggest improvement is an AI layer that greets by name, predicts the usual ride, and answers in chat. Everything else feels more alive once this exists. (Uses the existing `llmRouter`.)
2. **Features are islands.** `P0` — Roulette, garage, streak, league, market each live in their own menu with no shared spine. Connect them into one progression/identity ("your Koson", your tier) so the app reads as a world, not a directory.
3. **Silent failure epidemic.** `P0` — ~8 places where a failed fetch shows a blank or an endless spinner (AUDIT 4.5). This is the #1 source of the "it's broken" feeling. One shared error+retry state everywhere.
4. **prompt()/confirm() for real actions.** `P0` — Family add, trade price, admin broadcast still use raw browser dialogs (AUDIT 4.1–4.3) — bad on mobile, dangerous for money. Replace with proper sheets.
5. **No reason to come back tomorrow.** `P1` — No streak, no daily reason, no leaderboard with stakes. The retention research is unanimous: this is the highest-leverage retention gap.
6. **Cold-start perception.** `P1` — First open after idle is slow; the "uyg'onmoqda" screen softens it but doesn't fix it. Keep-alive ping + the relay/AI keeping the bot warm.
7. **Uzbek-first not enforced everywhere.** `P1` `[verify]` — Audit found "coin" leftovers; check every user-facing string is Uzbek and consistent ("tanga", not "coin").

---

## 1. HOME / ENTRY

- `P0` Home is a menu, not a place. **Better:** the living AI home screen — animated Koson at the current hour, your car parked, live cars moving, your district glowing, AI greeting + 1-tap predictive booking. (This is v3 ticket V1.)
- `P1` No personalization. **Better:** greet by name, adapt morning vs evening, surface the most likely next action.
- `QW` Status bar (tanga · streak · jackpot) exists but is static. **Better:** live ticker, tanga count-up on change.

---

## 2. BOOKING FLOW (being rebuilt in T4 — fold these in)

- `P0` Light map clashes with the dark premium theme. **Better:** dark Carto (T4).
- `P0` Gold-on-gold buttons; primary CTA cramped against the map; clipped text (from screenshot). **Better:** gold only on the primary action, ghost secondary, breathing room, no clipping.
- `P1` Too many taps for a regular rider. **Better:** chip → confirm = 2 taps (T4 target), and with AI, often 1 tap from the home screen.
- `P1` `[verify]` ETA/price are rough. **Better:** keep honest "≈", but improve estimate quality over time from `bookingReports`.
- `P2` No fuzzy/typo-tolerant address search in old flow. **Better:** T4 adds it; make sure it handles Uzbek/Russian spelling variants.
- `P1` Pin-drag must resolve to a kas address (raw coords unsupported). **Better:** snap to nearest kas address, fall back to search — make the limitation invisible/graceful.

---

## 3. TRIP EXPERIENCE (T5 — the "magic" screen)

- `P0` 11–12 bot messages compressed to 3 (T3 done) — verify the live card edits cleanly on real rides.
- `P1` End-of-trip is the peak moment; today it's flat. **Better:** confetti → big win number → tanga count-up → streak → tip → "Yana" — one 5-second sequence (T5 E7).
- `P1` Garage counter, roulette gating to rides — make them feel live during the ride (T5 E6).
- `P0` **Anonymous driver↔client relay chat (NEW).** Today there's no in-app way for them to talk without sharing numbers. **Better:** bot relays messages (labeled Mijoz/Haydovchi), no contact info exposed, quick-reply templates, voice relay, auto-close after ride, logged for disputes, profanity filter, contact-info stripped. AI sits in it (suggested replies, uz↔ru translation, "running late" detection). `[verify]` **Dependency:** confirm the driver is reachable on the Telegram bot vs only in kas1067 — that decides the build.

---

## 4. WALLET & TRANSFERS  *(you flagged this)*

- `P0` Transfer phone-lookup has no indicator (AUDIT 4.7). **Better:** "Tekshirilmoqda…" state.
- `P0` Money actions must never be optimistic on the balance number. **Better:** pending → server confirm → update (no "17800→17450" flicker).
- `P1` Transfer/withdraw/top-up flows use prompts or thin states. **Better:** proper sheets with amount input, min/max, preview, clear success/pending/rollback.
- `P1` `/api/me` loads the whole table for rank (AUDIT 2.1) — wallet feels slow. **Better:** count-ahead (T2).
- `QW` Withdraw eligibility/limits are opaque. **Better:** show "you can withdraw X, after N more rides" inline.
- `P2` Money safety already hardened (T0.5): jackpot order, referral idempotency, withdraw refund, barter atomicity. Keep `resilient()` + idempotent keys as new grants are added.

---

## 5. REWARDS & GAMES  *(you flagged this)*

- `P0` Roulette/garage/streak/league/missions are separate menus with no spine. **Better:** one "games center" (T6) tied to the world — your Koson, your tier, your streak feed each other.
- `P1` Roulette is luck-based (gambling-adjacent). **Better:** keep it, but make the *new* game (Yashil to'lqin) skill/fixed-reward, and keep all chance mechanics clearly promotional, no real-money path, clamp 350, kill-switch. `[verify legal]`
- `P1` Wheel doesn't explain why it won't spin (no ride). **Better:** clear gating hint at the spin step (AUDIT 4.8).
- `P1` No streak forgiveness. **Better:** streak freeze (silent, 1–2/week) + earn-back — research shows +48% streak length, less churn.
- `P1` League is full-scan for users outside top-50 (AUDIT 2.3) and not social. **Better:** count-ahead + 30-person pools + **mahalla vs mahalla** competition (local pride).
- `P1` Missions: silent-catch failures, no clear "N to go". **Better:** error+retry state, goal-gradient progress.
- `P2` Garage clamp has no log (AUDIT 3.12); garage service status ("oil 18/25") underused as a hook.

---

## 6. MARKETPLACE & TRADE  *(you flagged this)*

- `P0` Trade offer price via prompt() — a money action in a raw dialog (AUDIT 4.2). **Better:** sheet with amount + min/max + preview.
- `P1` Chat moderation reason is opaque ("what's banned?") (AUDIT 4.9). **Better:** show the rule in the input.
- `P1` `[verify]` Buy/sell and offer flows: ensure atomic (T0.5 hardened acceptOffer/buyListedItem) and add clear pending/success states.
- `P1` Rare items have a sheen in the design system — make sure marketplace actually shows rarity/identity (collection value drives Gen Z spend).
- `P2` `POST /api/admin/market/shop` has no UI yet (kept for T7). **Better:** admin shop/product form (T7).
- `P2` Item history/listing pagination + stable ordering (AUDIT 2.13/2.14).

---

## 7. REFERRAL, FAMILY & CORPORATE  *(you flagged this)*

- `P0` `familyRemove` backend exists but there's NO UI button (AUDIT 4.4) — you can add family, can't remove. **Better:** add the api method + remove button.
- `P0` Family add uses prompt() (AUDIT 4.1). **Better:** sheet with phone input + validation.
- `P1` Referral is not the growth engine it should be. **Better (research-backed):** dual-incentive (both sides get a meaningful reward — a free ride, not 1%), one-tap share from result screens, **mahalla referral** ("invite 5 neighbors → everyone rides free"), visible referrer leaderboard.
- `P1` corpReport is N+1, slow (AUDIT 2.7). **Better:** single findMany + groupBy.
- `P2` Corporate billing/report UX — clarity on who spent what, exportable.

---

## 8. BOT / MESSAGING

- `P1` `[verify]` "coin" leftovers → "tanga" everywhere (T3 fixed bot.ts/render.ts; sweep all surfaces).
- `P1` Bot voice: one warm, short, consistent voice with a next-step button every message (T3). Verify on real rides.
- `P0` Anonymous relay chat (see §3) lives here.
- `P1` AI text handler hits the DB on every message with no per-user rate limit (AUDIT 3.9). **Better:** throttle + the AI concierge layer.

---

## 9. AI / INTELLIGENCE (mostly absent today — the v3 brain)

- `P0` No proactivity. **Better:** learn patterns (home→work at 8), weather-aware nudges, predictive 1-tap booking.
- `P1` No in-chat problem handling. **Better:** "driver's late" / "wrong pickup" handled conversationally with options.
- `P1` No personalization or memory. **Better:** remember preferences, greet by name, celebrate milestones.
- `P1` uz↔ru auto-translation in the relay and AI replies.
- `P2` llmRouter daily cap is non-atomic (AUDIT 3.11) — fix with atomicIncrement (T2).

---

## 10. RETENTION / LIVE-OPS (vs research — almost entirely missing)

- `P1` Streak with freeze/earn-back (Duolingo model).
- `P1` Weekly leaderboard, 30-person pools, Monday reset, demotion risk.
- `P1` One rotating weekly event (weekend sprint, rush-hour 2x).
- `P1` Seasonal events on Uzbek holidays (Navruz, Independence Day) — built-in emotional salience + reactivation.
- `P1` Push with personality and specificity (actual streak number, not "we miss you").
- `P2` Re-engagement sequence (D7/D14/D30) for lapsed users.
- `P2` Season pass (free + cheap paid track) once DAU supports it.

---

## 11. DRIVER SIDE (the real supply flywheel — under-served)

- `P1` Driver income transparency ("you earned X this week, breakdown") — research says this retains drivers more than bonuses.
- `P1` Driver gamification (streaks, tiers) mirroring the rider side.
- `P1` Driver lookup is unindexed (AUDIT 2.4) — fast assignment matters for pickup speed.
- `P2` Car-access is the supply constraint locally — explore a lease/micro-fleet angle (market research).

---

## 12. ADMIN (T7)

- `P1` God-file admin (848 lines, all tabs) (AUDIT 5.2) — split + rebuild as the owner control center.
- `P1` Owner needs a phone-openable "how's today?" in 2 minutes: north-star panel, cohort, live map, kill-switches, market management, driver analytics (T7).
- `P2` Live tables auto-refresh (AUDIT 2.18).

---

## 13. LOCAL-MARKET FIT (Uzbekistan / Koson)

- `P0` Uzbek-first everywhere (Russian secondary).
- `P1` Driver identity/trust shown before each ride (name, photo, mahalla, rating).
- `P1` Price transparency before the ride (the #1 informal-taxi complaint).
- `P1` Payme + Click integration; "pay digital → bonus tanga" nudge; UzQR-ready (mandatory July 2026).
- `P1` Data-light: home < 200KB, works on 3G, budget Android (AUDIT 2.9 lazy tabs helps).
- `P2` Mahalla committee endorsement as a launch/trust channel.

---

## 14. TECHNICAL / SAFETY (see AUDIT.md — don't duplicate; the must-keeps)

- Keep money paths idempotent + `resilient()` (T0.5 + T3). Any new grant = keyed before retry.
- Indexes (AUDIT 2.4–2.6, 2.11), count-ahead (2.1, 2.3), sweep batch (2.2) — T2.
- Tests on a Neon test-branch, not prod (avoid pollution + flakiness).
- Nightly self-check (balances = ledger; alert owner) + daily summary push (T8).
- Economy simulation before scaling rewards (T8).

---

## PRIORITIZED SHORTLIST (if you do nothing else, do these first)

| # | Item | Area | Priority |
|---|---|---|---|
| 1 | Living AI home screen (greet + predict + 1-tap) | Home/AI | P0 |
| 2 | Silent-catch → shared error+retry everywhere | Cross-cut | P0 |
| 3 | prompt()/confirm() → sheets (family, trade, admin) | UX | P0 |
| 4 | Anonymous driver↔client relay chat | Trip/Bot | P0 |
| 5 | familyRemove UI (finish the half-built feature) | Family | P0 |
| 6 | Connect rewards/games into one world spine | Games | P0 |
| 7 | Streak + freeze, mahalla leaderboard, weekly event | Live-ops | P1 |
| 8 | Referral as growth engine (dual-incentive, mahalla) | Referral | P1 |
| 9 | Money flows: sheets + pending states, never optimistic balance | Wallet | P1 |
| 10 | Trip-end magic sequence | Trip | P1 |

---

*Next: each row above becomes a v3 ticket with the real-test + design gates. The dev agent should `[verify]` the flagged items against current code before building.*
