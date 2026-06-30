# 1067 Taxi — Tier Ladder Reward Loop: Production Engineering Plan

**Status:** DRAFT — requires owner QABUL before any code is written.
**Scope:** Client-side only. Drivers already have `DRIVER_TIER_REBATE` + `driverTier`; this plan does NOT touch the driver path.
**Live money system:** Every section assumes a mistake costs real so'm and real driver livelihoods.

---

## 1. Tier Multiplier on Per-Ride Tanga

### 1.1 Multiplier table
Floating-point factor applied to the roll `amount` in `rollRideCashback` **before** `grantRideCoins` (so the ≤350 clamp always wins). Owner-tunable via knobs.

| Tier | Index | XP | `levelMult` |
|------|-------|----|----|
| 🌱 Yangi | 0 | 0 | 1.00 |
| 🥉 Bronza | 1 | 500 | 1.05 |
| 🥈 Kumush | 2 | 2,000 | 1.10 |
| 🥇 Oltin | 3 | 5,000 | 1.15 |
| 💎 Platina | 4 | 12,000 | 1.20 |
| 💠 Olmos | 5 | 25,000 | 1.25 |
| 👑 Afsona | 6 | 50,000 | 1.30 |

### 1.2 Formula placement (`cashbackService.ts:76`)
```
const lm = featureOn ? (econ[tierMultKnobKey(level)] ?? 1.0) : 1.0;
amount = (econ.rideBase ?? RIDE_REWARD_BASE) * t.mult * (lucky?2:1) * (combo?2:1) * lm;
if (plus) amount += Math.min(150, Math.floor(amount * 0.5));
```
**Jackpot excluded** (jackpot sets `amount=0` at line 73, never reaches this line). The member is already fetched at line 62 — just extend the `select` to include `points` + `trips`; no extra query.

### 1.3 New knobs (group "Daraja multiplikator")
`tierMultBronza`/`Kumush`/`Oltin`/`Platina`/`Olmos`/`Afsona` — def per table, min 1.00, max 2.00, step 0.01. Yangi always 1.00 (no knob). Helper `tierMultKnobKey(levelIndex)`.

### 1.4 Sensitivity (RIDE_REWARD_BASE=100, CAP=350)
| Scenario | Calc | Granted |
|---|---|---|
| Afsona, triple, lucky, combo, Plus | 100·3·2·2·1.30=1560 +150 | **350** (clamped) |
| Oltin, standard, none | 100·1.15 | 115 |
| Kumush, double, lucky | 100·2·2·1.10=440 | **350** (clamped) |

**Proof: no combination ever exceeds 350** — `grantRideCoins` does `min(amount, room)`, `room = max(0, 350 − paid)`, independent of input magnitude (`coinService.ts:99-100`). Tier only raises payout on *standard* rolls where the cap isn't reached; EV shift ≈ +15 tanga/ride mid-tier. Economically safe.

---

## 2. Points Sources & the ≥50% Daily Rule

### 2.1 New `ballPoints` field — do NOT touch `Member.points`
`Member.points` = the kas-mirrored cashback **so'm** (convertible to real money via withdraw). Injecting synthetic ball there would corrupt reconciliation + be gameable. **Add a separate `Member.ballPoints Int @default(0)`** — game-only, decayable, never money, never read by withdraw/topUp/kas-sync.

`computeXp(s) = round(s.points + s.trips*2 + s.ballPoints)`.

### 2.2 "≥50% of daily tasks"
Of the 4 client daily missions that day (2 core + 2 rotating; drivers excluded), rider must have **≥2 claimed** (`progress≥target && claimedAt`). Using *claimed* (not just progress) is consistent with the reward-at-claim model.

### 2.3 Award in the existing sweep (no new poller)
Fires in the **first sweep after midnight UTC+5**, reading *yesterday's* missions. Idempotent key `dailyball:<memberId>:<dayKey>` in AppState. Write award FIRST, then the marker (crash-safe).

| Condition | Ball |
|---|---|
| ≥50% claimed | +100 (`ballHalf`) |
| 100% claimed | +250 (`ballFull`, replaces the 100) |

No conflict with `coinService.ts:282` (that path bumps `points`/so'm, not `ballPoints`).

---

## 3. Decay — CONFIRMED by owner: YES, soft, 7-day grace

**Only `ballPoints` decays** — never `points` (money) or `coins`. Real-ride XP is untouchable.

| Rule | Value |
|---|---|
| Active day (resets grace) | ≥1 claimed mission OR ≥1 ride today → stamps `lastActiveDay` |
| Grace | **7 idle days**, no penalty/notice |
| After grace | **−5% ballPoints/idle day**, floor 0 |
| Anti-yo-yo | decay applies **once per UTC+5 day** (`decayAppliedDay` guard) |

**Worked (Oltin, 5000 ball):** grace days 1–7 → 5000; day 8 → 4750; … drop to Kumush at ~day 25, Bronza at ~day 45. 25 idle days to lose one tier — proportionate.

**Why soft:** loss-aversion drives re-engagement; small city = long gaps between rides; ball is cheap to regain (a few missions), so nobody is permanently locked out. `decayPct=0` is a soft kill-switch.

**Warning (bot, once/day via `NotifyLog` kind `decay_warn`):** fired on idle-day 7 ("ertadan ball yechiladi"), again on idle-day 10. Uzbek copy in full plan.

---

## 4. Data Model
`Member`: `ballPoints Int @default(0)`, `lastActiveDay String?`, `decayAppliedDay String?` — all **additive-only**, safe for Render's startup `prisma db push` (no column changed/dropped, no backfill). Existing members start `ballPoints=0` → XP unchanged.

11 new knobs total: 6 multiplier + `ballHalf`(100) `ballFull`(250) `decayGraceDays`(7) `decayPct`(5) `decayFloor`(0).

---

## 5. Display — single source of truth
Benefit copy must NOT drift from real knobs. New `GET /api/tier-benefits` → `getTierBenefits()` builds labels from live `getBonusEcon()`. `TierLadder` (`wallet.tsx`) renders from the API (replaces static `TIER_MEANING`), shows "+X% cashback" badges, current-tier XP breakdown ("ball o'yindan + safardan + cashbackdan"), and a **decay-warning banner** when `me.decayWarning`. **Honest display:** when flag OFF, ladder stays cosmetic only (no benefit/multiplier shown).

`MeResponse` gains `ballPoints?`, `decayWarning?`, `idleDays?`, `flags.tierloyalty?`.

---

## 6. Flag & rollout
Flag `tierloyalty` in `FEATURES` + `DEFAULT_OFF`. **Pure no-op when OFF** (levelMult=1.0, sweep block skipped, zero extra hot-path DB reads). Stages: 0 migrate (OFF) → 1 owner-preview → 2 full ON via admin toggle → 3 knob-tune live.

---

## 7. Edge cases
New riders (null lastActiveDay → no decay); **drivers excluded** (`m.type==="client"` gate on award+decay+multiplier); 350 cap already-consumed interaction proven safe; multi-ride day = 1 ball award but stamps active; UTC+5 throughout; single-process sweep = no extra lock needed.

---

## 8. Test strategy (TEST_DATABASE_URL, TAG'd rows, memberScope, full cleanup)
TC-1 clamp-never-exceeded (7 tiers × 4 rolls × lucky+combo+Plus ≤350) · TC-2/3 ball award + idempotency · TC-4 decay math · TC-5 grace · TC-6 floor · TC-7 anti-yo-yo · TC-8 flag-OFF no-op · TC-9 sweep memberScope · TC-10 knob live-update · TC-11 computeXp+ballPoints.

---

## 9. Definition of Done — 22 independently-verifiable lines (D1–D22)
Each with exact verification command. Key ones: D4 (no ride >350, all combos), D5 (jackpot never multiplied), D7 (ball once/day idempotent), D11 (anti-yo-yo), D13 (decay touches only ballPoints), D17 (flag-OFF cosmetic only), D20 (drivers excluded). Independent agent re-checks each against code+live before "ready".

---

## 10. Open questions for owner (recommended defaults)
| # | Question | Default |
|---|---|---|
| Q1 | Tier stacks on combo-doubled amount? | Yes (multiplicative) |
| Q2 | A ride alone counts as active day? | Yes |
| Q3 | Yangi sees full aspirational ladder? | Yes |
| Q4 | Decay warn via bot + Mini App banner? | Both |
| Q5 | Show ballPoints as distinct number? | Yes (transparency) |
| Q6 | Grace window | 7 days (tune after 30d data) |
| Q7 | ballFull stacks with mystery box? | Keep separate, both fire |
| Q8 | Weekly ball award too? | No — daily only in V1 |

**Implementation order:** schema+flag → shared (knobs/type/computeXp) → cashback multiplier → new `tierLoyaltyService.ts` (awardDailyBall + applyDecay, called from sweep, flag-gated) → `/api/tier-benefits` + `/api/me` fields → TierLadder UI → tests → deploy OFF → owner QABUL → ON.

---

## 11. Owner additions (LOCKED — 2026-06-30)

### 11.1 Decay confirmed
Owner explicitly wants pasayish/kamayish. Decay stays exactly as Section 3 (soft, 7-day grace, −5%/idle-day, anti-yo-yo, bot warning). No "no-decay" variant.

### 11.2 Rules must be clearly visible ("odamlar shartlarni bilishi kerak")
A always-visible **"📋 Shartlar"** card in the profile panel (under TierLadder), plain Uzbek, numbers read live from knobs (single source of truth — never drift):
```
📋 Daraja shartlari
🎯 Ball to'plash:
   • Har kuni ≥2 vazifa bajaring → +{ballHalf} ball
   • Barcha 4 vazifa → +{ballFull} ball
   • Har safar ham ball qo'shadi
📉 Ball kamayishi:
   • {decayGraceDays} kun faolsiz → kuniga {decayPct}% yechiladi
   • 1 safar yoki 1 vazifa — to'xtaydi
🏅 Daraja oshsa → har safar ko'proq tanga
```
Shown regardless of current tier (aspirational). Flag OFF → card hidden (no false promise).

### 11.3 Progress "to'lib borishi" — animated fill
The tier progress bar (`.tier-bar`) fills with an **animated width transition** (`transition: width .6s` already; add a one-time fill-from-0 on mount via a mounted-flag so the bar visibly *fills up* each open, not just appears). Each ladder step for tiers BELOW current renders as a full (100%) filled segment; the current tier's bar shows live `me.progress` filling toward next. Reinforces "to'lib borishi" — momentum visual. transform/opacity + width only; `prefers-reduced-motion` → instant.

### 11.4 Status visible in Reyting ("others can see their status")
`LeaderboardEntry.level` is **already** in the API (`types.ts:77`) and the row already renders `e.level.emoji` (`components.tsx:221`). Enhancement (UI-only, no backend change): replace the bare emoji with a **colored tier pill** = `emoji + level.name` tinted with `e.level.color`, so every rider's status is legible to others. `me` row highlights own pill. No new endpoint, no money path touched.

### 11.5 Net new files touched by additions
Only `wallet.tsx` (Shartlar card + animated fill), `components.tsx` (leaderboard pill), `tokens.css` (pill + fill styles). All UI; gated by `tierloyalty` flag where they expose the new mechanic. Server plan unchanged.
