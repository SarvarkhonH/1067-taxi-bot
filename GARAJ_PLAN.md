# GARAJ — IMPLEMENTATION PLAN (world-class v2)

> Bu hujjat 2 qatlam: **(A) QARORLAR + AUDIT TUZATISHLARI** (quyida — USTUN) va **(B) to'liq dizayn manbasi** (pastda — 29-agent fleet chiqargani). Ziddiyatda bo'lsa, (A) ustun.

## 0. PROVENANCE + QARORLAR + AUDIT (AVVAL SHUNI O'QING)

**Qanday tug'ildi:** 29-agent Sonnet fleet (8 real-o'yin benchmark → 13 quyi-tizim dizayn → 6 red-team → sintez → mustaqil audit) + Opus integratsiya + kod-tasdiq. ~1.96M token, ~22 daqiqa.

**OWNER QARORLARI (qat'iy, 2026-06-18):**

| Qaror | Holat |
|---|---|
| Eski idle garaj | OLIB TASHLANADI (almashtiriladi, kengaytirilmaydi) |
| Garaj bosilganda | alohida to'liq ekranli o'yin ochiladi |
| Migratsiya / refund / bonus | **YO'Q** — hali hech kim o'ynamagan → toza olib tashlanadi |
| Valyuta | ikki: 🪙 Tanga + 🏺 Ko'zacha (faqat real safardan) |

**MIGRATSIYA — BEKOR QILINDI.** Pastdagi **§3 (EXISTING-OWNER MIGRATION)**, §8 dagi **"Pre-Phase-1 gate"**, DoD **#1 va #4**, risk **R1**, hamda `migrateGaraj.ts` / `garaj_migration_policy` / `MemberCar.purchaseCost` — HAMMASI E'TIBORGA OLINMAYDI (jonli o'yinchi yo'q). Audit topilmalari **B3 / C7 / C8** ham shu bilan bekor. O'rniga: `FEATURE_GARAGE_V3=true` bo'lganda `garageService.ts` + `bookingNotifier`'dagi `earnForRide` chaqiruvi + rewards-tab garaj chiplari + `MemberCar` o'qish-yo'li olib tashlanadi (jadval drop yoki o'lik qoldiriladi). Refund/convert/goodwill YO'Q.

**AUDIT BLOCKER/MAJOR TUZATISHLARI (build paytida MAJBURIY — pastdagi matnni bekor qiladi):**

| ID | Tuzatish |
|---|---|
| **B1** | `GarajFlip.saleId String @unique` qo'shiladi. Flip idempotency kaliti `flip:{memberId}:{memberCarId}:{saleId}` — bu yerda `saleId = sha256(memberId+memberCarId+listingCloseTs)` (tx'dan OLDIN hisoblanadi). cuid `id` kalit sifatida ISHLATILMAYDI (double-grant bug edi). |
| **B4** | Kunlik flip-emissiya cap (8000t) `grantCoins` bilan BITTA `$transaction` ichida: `UPDATE AppState SET value=... WHERE CAST(value AS INT)+amt <= 8000 RETURNING *`; 0 satr qaytsa → rollback. (Handler-counter atomik emas edi.) |
| **M4** | `computeFlipGrant` cap: `Math.max(...)` → **`Math.min(basePrice*2.5, (acquireCost+repairSpent)*3.0 + basePrice*0.5)`**. Arzon-mashina + Ko'zacha-boost exploit (Damas 600t → 3600t foyda) yopiladi. `simEconomy` `DAMAS_HEAVY_KOZACHA` scenariysi bilan isbot. |
| **M1** | Demand qayta-hisob har sweep'da 24 query EMAS: `AppState market:demand:nextRecalcAt` timestamp; `now() < next` bo'lsa butun blok o'tkazib yuboriladi (sweep latency himoyasi). |
| **M2** | `reputationScore` har ride'da COUNT/SUM EMAS: `MemberGarajMeta`'ga denormalizatsiya `carsOwnedCount Int` + `sumCarLevels Int` (mashina mutatsiyasida yangilanadi). |
| **M3** | Mahalla haftalik reset (Phase 4): `AppState mahallaReset:{weekKey}:status = started\|done` + `WHERE NOT EXISTS MahallaWeeklyResult` — qisman-reset crash-xavfsiz. |
| **M5** | `GarajBazaarListing` (Phase 3) `@@unique([sellerId,memberCarId,status])` NOTO'G'RI → raw partial index `... WHERE status IN ('open','pending_payment')`. |
| **m1–m4** | `.ogg` Vite bundling CI-tekshiruvi (yoki `.mp3`); `sourcingBoardSeed()` aniq `sha256...readUInt32BE(0)`; bitta faol repair-job uchun raw partial index `WHERE status='active'`; streak kaliti `streak:reward:{memberId}:{milestone}:{lastRideDate}` (isoWeek emas). |

**PHASE 1 — HAQIQIY 1-2 HAFTALIK SLICE (audit B2 — pastdagi §8 Phase 1 scope'ni BEKOR qiladi):**

Pastdagi §8 Phase 1 ro'yxati aslida **3-4 hafta** (8 jadval, ~20 komponent). Audit tasdiqlagan haqiqiy 1-2 haftalik, "his"ni isbotlovchi slice:

1. Shell + lazy chunk (flag-gated, slide-up)
2. FTUE: faqat Tiko, 5 qadam, juice stack (audio + WinBurst + clip-path reveal)
3. BITTA mashina xaridi (statik narx — Sourcing Board YO'Q)
4. BITTA repair task (oil-change, faqat tanga — timing-bar keyin, hozir faqat "Avtomatik")
5. BITTA flip (faqat Quick-Flip, `computeFlipGrant` base-mult, coin rain)
6. Dream Car horizon bar (statik, keyingi mashina hardcoded)
7. `spendCoinsIdempotent` + `simEconomy` flip-path (≤350 va flip-cap 0-violation isbot)

**Jadvallar: faqat 3** (`MemberGarajMeta`, `GarajCar`, `GarajFlip`) · **komponent ~8** · **service 1**. **Phase 1'da YO'Q:** Workshop Craftsman slot, Diagnosis Sheet, Style picker, Sourcing Board, Ko'zacha earn, audio pipeline murakkabligi, Order Board, Bozor, Mahalla, mavsumlar. DoD: §8 jadvalidan #1/#4 (migratsiya) olib tashlanadi; qolgan satrlar + audit qayta-yozgan tekshiriladigan variantlar + `simEconomy` 0-violation + **Rule-4 mustaqil verify** + **owner QABUL** real telefonda (global flag undan keyin).

---

# GARAJ V3 — WORLD-CLASS DIZAYN MANBASI (to'liq)

---

## 1. CORE FANTASY + NORTH STAR + PLAYER FEELING

**Core fantasy:** You are not a garage owner. You are a person growing into the legendary master mechanic of Koson — from one broken Tiko in a yard to a dealership the whole mahalla respects.

**North star (one sentence):** Every real taxi ride you take as a passenger delivers something to your garage, and every garage action makes your next ride feel more meaningful.

**Three feelings to hit, always:**
- **Pride** — I restored that car. I did it.
- **Mastery** — I know this system. I made the right call.
- **Status** — Koson knows me now.

**Reputation arc:** Havaskor → Usta → Servis egasi → Diler → Koson afsonasi

**Red-team resolutions baked in from the start:**
- Cross-car resource contention: one Workshop Craftsman slot shared across all active repair jobs creates real tradeoffs between cars.
- Non-ride daily progression: one free Workshop Action per day that advances any repair task regardless of tanga balance.
- Kozacha items affect the flip economy (sell price multipliers), not only ride earn, so the 350 clamp cannot suppress their value.
- Style-buyer match is visible from day 1 via icon chips on buyer cards, not a hidden rule learned through punishment.
- Migration policy is an explicit pre-Phase-1 gate, not a Phase-1 deliverable.
- `computeFlipGrant()` is one canonical function in `garajConfig.ts`, verified by `simEconomy.ts` before any flag flips.

---

## 2. FULL-SCREEN DEDICATED PAGE

### 2.1 Entry Mechanics

When the player taps the GARAJ tab in the main bottom nav, the GARAJ shell **slides up from the bottom** with CSS `transform: translateY(100%) → translateY(0)` at `transition: 400ms cubic-bezier(0.22, 1, 0.36, 1)`. It is a `position: fixed; inset: 0; z-index: 100` overlay covering everything. The main app nav is `visibility: hidden; pointer-events: none` while the shell is open. Exit: a back-chevron (top-left) slides the shell back down.

The shell is lazy-loaded: `import(/* webpackChunkName: "garaj" */ './garaj/GarajShell')`. First load shows a skeleton: black screen, gold pulsing garage silhouette SVG, "Garaj yuklanmoqda..." text (≤600ms). Subsequent taps hit the cache with no perceptible delay.

**Flag-gated cutover:**
- `FEATURE_GARAGE_V3=true` → new shell opens on tab tap, old rewards-tab chips hidden
- `FEATURE_GARAGE_V3=false` → old idle mechanic, old chips visible

Both code paths coexist until owner QABUL. The flag is read in `RewardsTab.tsx`, `BottomNav.tsx`, and the lazy chunk loader.

### 2.2 Internal Navigation (5 Tabs)

The shell renders its own bottom nav bar (gold accent, black background, distinct from the main app nav).

| Tab | Icon | Section | Purpose |
|---|---|---|---|
| Garaj | Wrench SVG | `garage` | HOME — garage scene, car shelf, equipped car, offline box, dream car bar, daily workshop action |
| Bozor | Tag SVG | `bozor` | Bazaar market, sourcing board, parts shop, demand chips, price history |
| Buyurtma | Clipboard SVG | `orders` | NPC order board, craftsman queue, seasonal event progress |
| Mahalla | People SVG | `mahalla` | Neighbour garages, gifting, community meter, league, exhibition |
| Men | Person SVG | `profile` | Car biography, mastery ranks, achievements, skill tree, settings |

Navigation between sections is instant (no animation, no fetch) because all data is loaded in the initial `GET /api/garaj/state` single round-trip. Individual mutations return `{ delta, grant?, celebration? }` and the client merges delta into `GarajShellContext`.

### 2.3 Home Section Layout

```
┌─────────────────────────────────────────────┐
│  ← Garaj           [Streak 🔥7] [K 24] [T 4820]
├─────────────────────────────────────────────┤
│  [GARAGE SCENE — CSS layered divs]          │
│  Tier 1: cracked asphalt yard               │
│  Tier 3+: hydraulic lift, lights, banner    │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  EQUIPPED CAR CARD (large, centered) │   │
│  │  Nexia · Level 3 · 🔥 Kombo         │   │
│  │  [Konditsiya: Good ████░░]           │   │
│  │  [Service: 18/25 ███████░░]          │   │
│  │  [Mastery: Usta ██████░░░░]          │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ── Keyingi mashina ───────────────────── │
│  [Tracker ████████░░] 8,200/12,000t  68%  │
│                                             │
│  [Workshop Action: 1 FREE today ✓]          │
│                                             │
│  [Car Shelf — horizontal scroll]            │
│  [Damas✓][Nexia✓][Tracker💭][Lacetti🔲]    │
├─────────────────────────────────────────────┤
│  [Garaj] [Bozor] [Buyurtma] [Mahalla] [Men] │
└─────────────────────────────────────────────┘
```

**Workshop Action chip** (resolves Red-Team BLOCKER: non-ride daily progression): once per day, one repair task on any car advances for free regardless of tanga balance. Gated by `AppState garaj:free_action:memberId:YYYY-MM-DD`. Idempotency key: `garaj:free_action:memberId:YYYY-MM-DD:carCode:taskCode`. This key is written at task completion — not at the "claim" tap — so a player cannot claim and then crash before the task completes.

**Car shelf scroll:** unowned cars show as `filter: brightness(0) saturate(0)` silhouette + gold border pulse. The scroll initializes at `scrollLeft = lastOwnedIndex * cardWidth - 20px` so the next unowned car is always peeking into view (Zeigarnik hook).

**Offline box chip:** top-right, "Quti: 36t" with gold bounce animation when >0. One tap → `POST /api/garaj/collect-box`. Hidden when box = 0.

### 2.4 Car Detail Sheet

Tapping the equipped car card opens a `<Sheet>` at 95% screen height.

```
┌─────────────────────────────────────────────┐
│  Nexia 3                          [×]        │
│  Level 3  Condition: Good  🔥 Kombo          │
│                                             │
│  [CAR SVG — full color if restored,        │
│   CSS damage overlays if worn]              │
│                                             │
│  [Haydovchi] [Tarixi] [Qismlar]            │
│                                             │
│  [Active tab content]                       │
│                                             │
│  [Ta'mirlash] [Sotish] [Jihozlash]          │
└─────────────────────────────────────────────┘
```

Three tabs: Stats (Haydovchi), Biography (Tarixi), Parts (Qismlar). Level-up flip animation, before/after reveal slider, and service animation all live here.

### 2.5 Old Garage Removal

When `FEATURE_GARAGE_V3=true`:
- `<GarageRewardsSection>` in `RewardsTab.tsx` is wrapped in `{!featureOn('GARAGE_V3') && <GarageRewardsSection />}`
- Old `EquippedCarChip` in the main feed header is removed
- Mission completion toasts with "Go to garage" deep-links now fire `openGarajShell()` instead of navigating to rewards tab

All `MemberCar` rows, ride-earn logic, and `ridesSinceService` increment remain untouched until migration runs.

---

## 3. EXISTING-OWNER MIGRATION

### 3.1 Pre-Phase-1 Gate (MANDATORY before any code)

The migration script (`scripts/migrateGaraj.ts`) MUST be:
1. Written
2. Run in `--dry-run` mode against a production data dump
3. Output reviewed by owner (per-member refund amounts, no negative coins)
4. Owner explicitly writes `GARAJ_MIGRATION_POLICY` in AppState
5. ONLY THEN can `FEATURE_GARAGE_V3=true` be set

The flag gate enforces this: `if (featureOn('GARAJ_V3') && !AppState['garaj_migration_policy']) → throw "Migration policy not set"`. This check runs on server startup and on the first `GET /api/garaj/state` call.

### 3.2 Migration Policies

Controlled by one constant: `AppState key 'garaj_migration_policy'` (set by owner, never by code).

| Policy | Effect | Tanga impact |
|---|---|---|
| `refund_only` | All `MemberCar` rows get `purchaseCost` refunded 100% via `grantCoins`. Rows soft-deleted (`deletedAt = now()`). Player starts fresh. | Neutral (re-credits spent tanga) |
| `refund_and_convert` **(recommended)** | 70% of `purchaseCost` refunded. Cars remain in fleet, mapped to new system: `condition = 'good'`, `totalRides = 0`, `acquiredAt = boughtAt`. No tanga taken. | Favorable: player gets partial refund AND keeps cars |
| `fresh_with_goodwill` | No refund. Cars kept. One-time goodwill grant: `min(ownedCarCount, 5) × 200t` via `grantCoins`. | Positive: goodwill grant, no disruption |

**Critical:** Migration uses `MemberCar.purchaseCost` (the price actually paid), not the catalog price. The schema must add `purchaseCost INT` (nullable, backfilled from CoinTxn history for existing rows during migration dry-run). For rows where `purchaseCost` is unrecoverable, fall back to catalog price with a warning logged per member.

### 3.3 Migration Script Structure

```typescript
// scripts/migrateGaraj.ts
const POLICY = await getAppState('garaj_migration_policy'); // throws if not set

// Idempotency gate
const done = await getAppState('garaj:migration:v2:done');
if (done && !argv.includes('--force')) { console.log('Already migrated'); process.exit(0); }

// Phase 1: snapshot (read-only)
const members = await prisma.memberCar.groupBy({ by: ['memberId'], ... });
// Phase 2: per-member atomic transaction
for (const m of members) {
  await withMemberLock(m.memberId, async () => {
    await prisma.$transaction(async (tx) => {
      if (POLICY === 'refund_only' || POLICY === 'refund_and_convert') {
        const rate = POLICY === 'refund_only' ? 1.0 : 0.7;
        const refund = Math.floor(m.totalPurchaseCost * rate);
        await grantCoins(tx, m.memberId, refund, 'garaj_migration',
          'Garaj v1 qaytarildi', `garaj:migrate:refund:${m.memberId}`);
      }
      if (POLICY === 'refund_and_convert' || POLICY === 'fresh_with_goodwill') {
        await tx.memberCar.updateMany({
          where: { memberId: m.memberId, deletedAt: null },
          data: { condition: 'good', totalRides: 0, acquiredAt: new Date() }
        });
        await tx.memberGarajMeta.upsert({
          where: { memberId: m.memberId },
          create: { memberId: m.memberId, garageTier: 1 },
          update: {}
        });
      }
      if (POLICY === 'fresh_with_goodwill') {
        const goodwill = Math.min(m.carCount, 5) * 200;
        await grantCoins(tx, m.memberId, goodwill, 'garaj_migration',
          'Garaj v2 xush kelibsiz', `garaj:migrate:goodwill:${m.memberId}`);
      }
    });
  });
}
// Phase 3: set done marker
await setAppState('garaj:migration:v2:done', '1');
```

**Money safety proof:** The refund grant key includes `memberId` only (not a period), so it fires exactly once per member per migration run. The idempotency key prevents double-refund on re-run. The `--dry-run` flag skips Phase 2 and Phase 3 entirely, outputting a preview table.

---

## 4. FULL GAME SYSTEMS

### 4.1 Core Loop: Decision at Every Step

**The 7-step arc:** FIND → DIAGNOSE → PLAN → PARTS+ASSEMBLE → TEST → SELL → GROW

**Cross-car resource contention** (resolves Red-Team BLOCKER-1): one shared Workshop Craftsman slot. A player can work on multiple cars but only ONE active repair job runs at a time. Starting a repair job on Car B requires explicitly pausing or completing the job on Car A. The "Ustaxona" tab shows the single slot with the current active job. This creates genuine tradeoffs: if you have a Nexia halfway repaired and a towed Lacetti arrives, you must decide whether to finish the Nexia or pivot to the Lacetti.

#### STEP 1 — FIND (The Hunt)

**Sourcing Board:** 3 car cards in horizontal scroll, each showing car name, damage profile (2-4 visible damage icons), asking price, and 24h countdown. Refreshes daily via `AppState date-marker garajBoard:memberId:YYYY-MM-DD` checked in sweep. Cards are deterministic per `hash(memberId + dateString + slot)` — same board all day.

| Slot | Price range | Damage |
|---|---|---|
| Cheap | basePrice × 0.55–0.70 | 2-3 zones |
| Mid | basePrice × 0.60–0.75 | 1-2 zones |
| Aspirational | basePrice × 0.65–0.80 | 1-2 zones |

Acquisition cost: `spendCoinsIdempotent(key: 'garaj:acquire:{memberId}:{carCode}:{dateKey}', amount: askPrice)`.

Fleet capacity: Tier 1 = 2 slots, Tier 2 = 3 slots, Tier 3 = 4 slots (Kollektsioner branch = +1 slot). Buying beyond capacity is blocked with a clear error.

The player cannot acquire a car they already own (`UNIQUE(memberId, carCode)` enforced in `MemberCar`).

#### STEP 2 — DIAGNOSE (The Reveal)

**Hidden attributes** on `GarajCar`: `engineCond`, `bodyCond`, `tyreCond`, `electricCond`, `interiorCond` (0–100 each). Set once at acquisition from `diagnosisSeed = hash(memberId + carCode + acquiredAt)`. Never re-rolled.

**Diagnosis Sheet:** static SVG of the car body with 5 tap zones. Each zone is revealed with a 0.3s staggered CSS animation. Zone results derive from `diagnosisSeed`:

| ustaKozRank | Depth shown |
|---|---|
| 0–19 | Binary: "Muammo bor" / "Yaxshi" |
| 20–39 | Named part: "Karbyurator" |
| 40–59 | Part + severity: "Karbyurator — o'rtacha" |
| 60–79 | Part + severity + cost estimate ±20% |
| 80–100 | Full picture + profit delta: "To'liq ta'mirlasangiz +2,200t ko'proq" |

**Sell-back window:** 10 minutes after diagnosis, player can sell back at `askPrice × 0.85`. Creates tension — "the damage is worse than expected, do I cut losses?"

**Diagnosing writes** `GarajCar.diagnosisResult JSONB` and `diagnosedAt`. Free. No coin movement.

#### STEP 3 — PLAN (The Build Order Decision)

**Style commitment screen** (shown before first repair task — ships in Phase 1 with 2 styles active):

```
Birinchi ta'mirlashni boshlashdan avval uslubni tanlang:

[Tezkor Sotish]  [To'liq Tiklash]  [Tuning🔒Tier2]  [Davr Asili🔒Usta]

⚠️ Tanlov o'zgartirilmaydi.
```

Style is locked on first repair task completion. The player must read buyer cards in the Bozor tab BEFORE committing — this is the skill layer.

**Style definitions:**

| Style | Unlock | Repair scope | Condition ceiling | Base sell mult | Best buyer match |
|---|---|---|---|---|---|
| `QUICK_FLIP` | Default | Any 2 tasks | `fair` | 1.0× | Young Tuner (mismatched: 0.85×) |
| `FULL_RESTORE` | Default | All tasks, OEM parts, 10 rides post-repair | `mint` | 1.35× | Family Driver (+0.40×), Newlywed (+0.40×) |
| `TUNING` | Tier 2 + `savdogar >= 1` | Engine + suspension, 2+ Sport parts, Level 3+ | `fair` | 1.20× | Young Tuner (+0.45×) |
| `PERIOD_CORRECT` | Tier 3 `Diler` rep + era car only | Body + interior, NO Sport parts, 7-day patience | `mint` | 1.30× | Collector (+0.55×, era cars only) |

**Era cars** for Period-Correct and Collector buyer: `DAMAS`, `MATIZ`, `TIKO`, `NEXIA_G1`.

#### STEP 4 — PARTS + ASSEMBLE

**Repair queue:** vertical checklist in `<Sheet>`. Each task:
- `tangaCost` (fixed, visible before spending)
- `partRequired` (optional — consumed from `MemberPartInventory`)
- `rideRequirement` (0–N rides on this car since last service to unlock)

**Shared Workshop Craftsman slot:** starting a repair job (`GarajRepairJob.status = 'active'`) blocks all other cars from starting a new job. The UI shows the active job in the Buyurtma tab's Ustaxona section. Player can pause (releases the slot) or complete.

**Juice stack on each task completion:**
1. Sound: `part-click.ogg` (~7KB)
2. Micro-shake: 80ms `@keyframes garaj-shake`
3. WinBurst `size="sm"` 8 particles from tap coordinates
4. Tanga counter scale punch: `1.0 → 1.28 → 1.0`, 180ms
5. Part slot icon: `filter: grayscale(1) → none`, gold border appears

`prefers-reduced-motion`: instant state change, no animation, sound plays.

**Spend idempotency key:** `repair:{memberCarId}:{taskCode}`.

**Free daily Workshop Action:** once per day (`AppState garaj:free_action:memberId:YYYY-MM-DD`), one repair task completes for free. The idempotency key includes the task: `garaj:free_action:memberId:YYYY-MM-DD:memberCarId:taskCode`. This means the free action cannot be "saved" for a later task — it is consumed by whichever task the player explicitly triggers while the daily action is available.

#### STEP 5 — TEST (The Ceremony)

All repair tasks complete → "Sinov yo'li" button appears. Full-screen TEST overlay (black background, gold accent):

```
Timeline:
  0ms   engine-rev.ogg plays (~6KB, volume 0.9)
  0ms   car SVG micro-shake, 600ms
  300ms car SVG begins desaturating in reverse (colors bloom in from center)
  800ms clip-path reveal: inset(0 100% 0 0) → inset(0 0% 0 0), 800ms ease
  1200ms WinBurst 16 particles
  1600ms restored state holds
  1700ms before/after slider appears (draggable CSS clip-path thumb)
  2000ms Sell / Keep buttons appear
```

Costs 0 tanga. `prefers-reduced-motion`: instant reveal + static WinBurst flash.

#### STEP 6 — SELL (The Flip Reveal)

**Canonical sell price formula** — ONE function in `packages/shared/src/garajConfig.ts`:

```typescript
export function computeFlipGrant(params: FlipParams): number {
  const { basePrice, level, style, buyerArchetype, condition,
          repairQualityBonus, savdogarTier5Bonus, kuzovchiTier5Bonus,
          seasonalBonus } = params;

  const levelMult = 1.0 + (level - 1) * 0.15;
  const conditionMult = { WORN: 0.80, FAIR: 0.90, GOOD: 1.00, MINT: 1.10 }[condition];
  const styleMult = STYLE_BASE_MULT[style];
  const buyerMult = BUYER_STYLE_MATCH[buyerArchetype][style];

  const raw = basePrice
    * levelMult
    * (styleMult + buyerMult)
    * conditionMult
    * repairQualityBonus   // product of all timing results, default 1.0
    * (1 + savdogarTier5Bonus)   // 0.12 if Savdogar T5 passive buyer, else 0
    * (1 + kuzovchiTier5Bonus)   // 0.08 if Kuzovchi T5 + body conditions 80+, else 0
    * (1 + seasonalBonus);       // e.g. 0.10 for Navruz if style=PERIOD_CORRECT

  const MAX_SELL_PRICE = Math.max(
    basePrice * 2.5,
    (params.acquireCost + params.repairSpent) * 3.0  // proportional cap
  );

  return Math.min(Math.round(raw), MAX_SELL_PRICE);
}
```

This function is imported in `garageService.ts` flip handler and in `simEconomy.ts`. No other file contains sell price logic.

**Flip Summary Sheet:**

```
┌───────────────────────────────────────┐
│   NEXIA 3  ·  To'liq tiklash          │
│   Xaridor: Hamid aka (Oilaviy)        │
│   "Aynan shu! Oilam uchun mukammal."  │
│                                       │
│   Kupib oldim:      3,200t            │
│   Ta'mirlash:         600t            │
│   Jami xarajat:     3,800t            │
│   Sotish narxi:     4,100t            │
│   ───────────────────────             │
│   FOYDA:           +  300t  ✓         │
│                                       │
│   [Tasdiqlash — 4,100t olish]         │
│   [Saqlab qolish — haydash uchun]     │
└───────────────────────────────────────┘
```

On confirm:
1. `grantCoins(key: 'flip:{memberId}:{memberCarId}:{saleId}', amount: sellPrice)` — mission-style, idempotent, OUTSIDE ride-clamp
2. `GarajFlip` row written in same transaction
3. WinBurst 24 particles
4. Coin rain canvas animation (20 coins, rAF, 1s)
5. `MemberCar.deletedAt = now()` (soft delete)
6. Telegram bot message: "Nexia 3 sotildi! Foyda: +300t"

**Concurrent buyer protection:** Listing status is updated via `UPDATE CarListing SET status='sold' WHERE id=? AND status='active'` with `count === 1` check BEFORE tanga transfer. This resolves Red-Team BLOCKER-2.

**NPC buyer flavor:** 12 named NPCs in `shared/npcFlavor.ts`, rotated by `hash(memberId + saleId) % 12`. Each has 4 strings (one per style). Hardcoded, no ML.

#### STEP 7 — GROW

Post-sell Growth Prompt (bottom Sheet, appears 3s after WinBurst):

```
Keyingi qadam:
① [Dream car if set] Tracker — 8,200t. Sizda: 5,100t. ~62 safar
② Garajni yaxshilang (Tier 2) — 2,000t. 2 yangi slot
③ Yangi mashina toping — bugungi taxtani ko'rish
```

**Dream Car horizon bar** persists on the Garaj home screen at all times: `[Tracker ████████░░] 8,200/12,000t  68%  ≈ 62 safar`. Updates live from balance. The ride count estimate: `gap / avgRideGrant` where `avgRideGrant = 47` (configurable in AppState).

---

### 4.2 Skill System

#### Usta Ko'z Rank (0–100)

```
Advances: +1 rank per 3 diagnoses completed
diagnosisSeed determines zone breakdowns (never re-rolled)
Accuracy bonus per flip: floor(rank/10) × 25t, capped 3 per day
  grantCoins(key: 'diagnosis:accuracy:{memberId}:{memberCarId}:{YYYY-MM-DD}:{n}')
  Daily cap n ∈ {1,2,3} prevents rank-100 accuracy farming
```

#### Timing Mini-Game

A bar with a moving marker. Player taps when the marker is in the green zone.

- At rank 0: 2.4s traversal, 30% green zone. But: the result is shown AFTER the tap — the green zone highlights where the sweet spot was, and where the player actually tapped. This is Guitar Hero-style teaching on every attempt, not just failures. Resolves Red-Team BLOCKER-2.
- At rank 100: 1.2s traversal, 15% green zone
- `animationDuration = 2.4s - (rank × 0.012s)`
- `greenZoneWidth = 30% - (rank × 0.15%)`

| Tap position | Quality | Effect |
|---|---|---|
| Centre ±5% of green | EXCELLENT | conditionDelta +15, repairQualityBonus ×1.05 |
| Green zone | GOOD | conditionDelta +10 |
| Yellow zone (±10%) | FAIR | conditionDelta +5 |
| Red zone | DEFECT | conditionDelta +2 |
| Avtomatik button | AUTO | conditionDelta +5, always visible |

**`GarajRepairResult` unique constraint:** `(memberId, jobId, taskCode)` — one result per task per repair job. Resolves Red-Team MAJOR-3. XP accrues at task COMPLETION, not at each timing attempt.

**XP per quality:** EXCELLENT +4, GOOD +3, FAIR/AUTO +2, DEFECT +1 toward `ustaKozRank`.

#### 4-Branch Specialization Tree

Chosen at Tier 3. Displayed as "XP preview" from day 1 (branch bars visible but labeled "Tier 3 tanlovi"). One-time free respec within 7 days of Tier 3 unlock.

**Branch XP accrual from activity:**

| Activity | Muhandis | Kuzovchi | Savdogar | Kollektsioner |
|---|---|---|---|---|
| EXCELLENT engine timing | +5 | — | — | — |
| EXCELLENT body/interior timing | — | +5 | — | — |
| Flip for profit | — | — | +4 | +1 |
| Flip at EXCELLENT condition | — | — | +2 | +2 |
| Level 5 on any car | +1 | +1 | — | +5 |
| Buy from sourcing board | — | — | +2 | +2 |
| Accurate diagnosis | +2 | +2 | — | +1 |

**Branch tiers and unlock gates:**

| Tier | XP (cumulative) |
|---|---|
| 1 | 0 (free) |
| 2 | 25 |
| 3 | 75 |
| 4 | 150 |
| 5 | 300 |

**Muhandis (Engine Specialist):**

| Tier | Passive | Unlock |
|---|---|---|
| 1 | Engine zone reveals at one rank lower threshold | — |
| 2 | EXCELLENT engine: conditionDelta +18 | Timing speed -5% |
| 3 | Engine GOOD also gives conditionDelta +12 | 2 engine sub-zones added to Diagnosis Sheet |
| 4 | Engine repairs -10% tanga cost | NPC Ustoz Hamid weekly engine quests |
| 5 | Engine service interval 25 → 32 rides (flag: `MemberMechanicSkill.engineServiceExtension`) | Gear-icon badge |

**Kuzovchi (Body Specialist):**

| Tier | Passive | Unlock |
|---|---|---|
| 1 | Body zone reveals at one rank lower | — |
| 2 | EXCELLENT body: conditionDelta +18 | Before/After reveal duration doubles |
| 3 | Body GOOD gives conditionDelta +12 | 3 extra CSS livery variants unlocked |
| 4 | Body condition contributes 15% more to flip price | Photo Mode unlocked |
| 5 | Restored body car (body conds 80+) gets "Yangi kafolat" badge: +8% Bazaar ask premium | Spray-can badge |

**Savdogar (Merchant):**

| Tier | Passive | Unlock |
|---|---|---|
| 1 | Flip Summary shows last 3 flips for comparison | — |
| 2 | Sourcing Board shows 3-day price trend chip | 2 PriceAlerts (vs 0 at launch) |
| 3 | Market tax 3% → 1% | Haggling Window unlocked |
| 4 | 3 simultaneous Bazaar listings (vs 1) | Order Board gains 4th slot |
| 5 | Passive buyer once/week: pays basePrice ×1.12 for best-condition car | Coin-stack badge |

**Kollektsioner (Collector):**

| Tier | Passive | Unlock |
|---|---|---|
| 1 | Biography records 2 extra event types | — |
| 2 | Daily Check-In tap gives +8t instead of +5t | Garage shows car count badge "6/8" |
| 3 | Offline box earn rate ×1.3 | Museum donation earns 2× plaque XP |
| 4 | All 8 cars simultaneously: +5t/day fleet bonus via `grantCoins(key: fleet:memberId:YYYYMMDD)` | Fleet-overview CSS screen |
| 5 | Animated gold crown on profile | Mahalla Exhibition slot unlocked |

**Skill Screen layout:**

```
USTA KO'Z RANKI: [████████████░░░░]  47/100  Malakali mexanik

IXTISOSLIKLAR:
⚙ MUHANDIS      [████░░░]  3/5  Motor Usta
🎨 KUZOVCHI     [██░░░░░]  2/5  Bo'yoqchi
💰 SAVDOGAR     [█░░░░░░]  1/5  Sotuvchi
🏛 KOLLEKTSIONER [████░░░] 3/5  Kollektsioner

KEYINGI YUTUQ:
Muhandis tier 4: ta'mirlash -10% xarajat
Kerak: 75 XP  Sizda: 48 XP  (27 qoldi  ≈ 9 EXCELLENT ta'mirlash)
```

---

### 4.3 Restoration Styles + Buyer Archetypes

Full multiplier table (all values canonical in `garajConfig.ts`):

**STYLE_BASE_MULT:**

```typescript
{ QUICK_FLIP: 1.0, FULL_RESTORE: 1.35, TUNING: 1.20, PERIOD_CORRECT: 1.30 }
```

**BUYER_STYLE_MATCH (additive on top of base mult):**

```typescript
{
  FAMILY_DRIVER:  { QUICK_FLIP: -0.15, FULL_RESTORE: +0.40, TUNING: -0.10, PERIOD_CORRECT: 0 },
  YOUNG_TUNER:    { QUICK_FLIP:  0,    FULL_RESTORE: +0.10, TUNING: +0.45, PERIOD_CORRECT: -0.20 },
  NEWLYWED:       { QUICK_FLIP: -0.20, FULL_RESTORE: +0.40, TUNING: +0.05, PERIOD_CORRECT: +0.30 },
  COLLECTOR:      { QUICK_FLIP: +0.05, FULL_RESTORE: +0.15, TUNING: -9.9,  PERIOD_CORRECT: +0.55 }
  // TUNING: -9.9 = hard block (renders as greyed-out with lock icon)
}
```

**Buyer signal chips (visible from day 1):**

Each buyer card shows 3 icon chips before the player commits: `🔧 Ishonchlilik ★★★` / `⚡ Sport ×` / `👴 Original ★★★`. No hidden rules. The skill is reading chips quickly and pattern-matching.

**Newlywed condition gate:** `POST /api/garaj/listing` returns 422 `BUYER_CONDITION_MISMATCH` if `buyerArchetype=NEWLYWED AND condition < 'good'`. The buyer card greys out when condition is insufficient.

**Collector availability:** only renders for era cars. For modern cars, this slot shows a placeholder "Kolleksioner sotuvchi yo'q".

**First flip guarantee** (resolves Red-Team BLOCKER-3): the player's first flip always includes a perfectly matched buyer for whatever style they chose. Implemented: `GET /api/garaj/listing-preview` checks `AppState garaj:firstFlipDone:memberId`. If absent, the response forces the best-match buyer into slot 1. Set `garaj:firstFlipDone:memberId = true` after the first sale.

---

### 4.4 Dual Currency: Tanga + Kozacha

#### Separation of concerns

| Property | Tanga | Kozacha |
|---|---|---|
| Earned by | Rides, missions, flips, box, NPC quests | Real taxi rides ONLY |
| Buyable | No | No |
| Tanga↔Kozacha conversion | Never | Never |
| Withdrawable | Yes | No |
| 350 ride-clamp | Applies to grantRideCoins path | N/A (not tanga) |
| Kill-switch | N/A (live) | `FEATURE_KOZACHA` |

#### Kozacha earning (ride hook)

In `bookingNotifier` ride-finish block, after `grantRideCoins`:

```typescript
if (featureOn('FEATURE_KOZACHA')) {
  const amount = Math.min(Math.floor(rideDurationMinutes), 8); // 1K/min, cap 8K/ride
  await grantKozacha(memberId, amount,
    `kozacha:ride:${memberId}:${bookingId}`,
    'ride_complete');
}
```

The `GarajRideDrop(memberId, bookingId)` unique anchor prevents double-drops on sweep re-runs.

**Lint enforcement:** CI check via `.husky/pre-push` runs `grep -rn "grantKozacha\|GarajKozacha" packages/ --include="*.ts"`. Any new call site not in the approved list (`bookingNotifier.ts`, `garajMigration.ts`) triggers a build failure. The migration script is the only approved non-ride source, documented as an explicit exception.

#### Kozacha sinks

**Primary: flip price multipliers** (NOT ride earn — resolves Red-Team MAJOR on clamp suppression):

| Item | Cost | Effect | Notes |
|---|---|---|---|
| `KOZACHA_FLIP_BOOST_5PCT` | 15K | Next flip sell price +5% (additive in `computeFlipGrant`) | Cap: 1 active at a time |
| `KOZACHA_FLIP_BOOST_10PCT` | 30K | Next flip sell price +10% | Replaces 5% boost |
| `PART_OEM_FILTER` | 25K | Service interval 25 → 35 rides (one-time per car) | Not clamp-affected |
| `PART_TURBO_ENGINE` | 120K | +4t/min ride earn AND +10% flip price | Level 4+ only; flip bonus unaffected by clamp |
| `SPEEDUP_CRAFT_1H` | 15K | Skip 1h of Ustaxona craft time | Convenience |
| `SPEEDUP_SERVICE` | 20K | Auto-service equipped car immediately | Convenience |
| `COSMETIC_BODY_COAT` | 40K | Premium CSS livery (cosmetic only) | 2/week per player |

Kozacha-purchased items are flagged `sourceKozacha = true` in `GarajPartInventory`. They are BLOCKED from Bazaar listing (`POST /api/garaj/bazaar/listing` returns 403 if `part.sourceKozacha`). This prevents Kozacha→Tanga laundering (resolves Red-Team MAJOR-1 from economy review).

#### Anti-inflation guarantees

**G1:** `grantKozacha` called in exactly one production code path (sweep). CI lint enforces this.

**G2:** No conversion function exists between Tanga and Kozacha at the code level.

**G3:** `KozachaTxn.amount` is always negative for spend, never flows into `CoinTxn`.

**Monthly drain sim:** at 5 rides/day = 40K/day max × 30 = 1,200K/month earned. A player buying 1 Turbo Motor (120K) + 4 OEM Filters (100K) + 3 Flip Boosts (90K) + 3 craft speedups (45K) = 355K/month spent. Surplus: +845K. Phase 3 seasonal cosmetics (80-100K each, 4/year) absorb the rest. The shop is not the only sink — overflow is by design since Kozacha is non-withdrawable.

**`simEconomy.ts` extension:** Add `kozachaTrack` simulation (parallel to tanga, no tanga impact). Assert: ride-earn path never emits tanga via Kozacha. Assert: `PART_TURBO_ENGINE` flip bonus in `computeFlipGrant` still respects `MAX_SELL_PRICE` cap.

---

### 4.5 Living Market + Demand Waves + Skill Auctions

#### Demand Wave Engine

```typescript
function computeDemandMultiplier(carCode: string, data: DemandData): number {
  const { ridesLast7d, activeListingVolume, salesLast24h, seasonalBase } = data;
  const raw = 0.40 * (ridesLast7d / BASELINE_RIDES[carCode])
            + 0.30 * (1 - Math.min(activeListingVolume / BASELINE_VOLUME[carCode], 1))
            + 0.20 * (salesLast24h / BASELINE_SALES[carCode])
            + 0.10 * seasonalBase;
  const x = raw - 1;
  return 0.70 + (0.80 / (1 + Math.exp(-3 * x))); // sigmoid, range [0.70, 1.50]
}
```

Data source for `ridesLast7d`: NOT a CoinTxn scan. Uses `GarajRideStats(carCode, dateKey, rideCount)` table (resolves Red-Team MAJOR-4), upserted atomically in `earnForRide`:

```sql
INSERT INTO "GarajRideStats" (carCode, dateKey, rideCount)
VALUES ($1, $2, 1)
ON CONFLICT (carCode, dateKey) DO UPDATE SET rideCount = rideCount + 1;
```

Data source for `activeListingVolume`: sum of `askPrice` for active listings (not count — resolves Red-Team MAJOR-2 demand manipulation).

Demand multiplier stored in `AppState market:demand:{carCode}` and `market:demand:history:{carCode}:{YYYY-MM-DD}` (7-day history for sparkline). Recomputed every 15 minutes inside the sweep via `AppState liveops:tick:{tenMinSlot}` guard.

**UI display:**

| multiplier | label | color |
|---|---|---|
| < 0.85 | Talab past | `--color-danger` |
| 0.85–1.10 | Oddiy | `--color-text-secondary` |
| 1.10–1.30 | Talab yuqori | `--color-accent` |
| > 1.30 | Juda yuqori! | `--color-gold` + CSS pulse |

#### Bazaar (Peer-to-Peer Car Market)

**Schema:**

```prisma
model GarajBazaarListing {
  id           String   @id @default(cuid())
  sellerId     String
  itemType     String   // car | part
  carCode      String?
  memberCarId  String?
  partCode     String?
  sourceKozacha Boolean @default(false)  // blocks listing if true
  qty          Int      @default(1)
  askPrice     Int
  condition    String   @default("good")
  status       String   @default("open")
  listedAt     DateTime @default(now())
  expiresAt    DateTime
  buyerId      String?
  soldAt       DateTime?
  listingFee   Int      @default(10)
  @@unique([sellerId, memberCarId]) // only one active listing per car per seller
  @@index([status, itemType, expiresAt])
}
```

**Buy-now flow (resolves Red-Team BLOCKER-2 from technical review):**

```typescript
// Claim-before-pay pattern
const claimed = await tx.garajBazaarListing.updateMany({
  where: { id: listingId, status: 'open' },
  data:  { status: 'pending_payment', buyerId }
});
if (claimed.count === 0) throw new Error('ALREADY_SOLD');

// Only now debit the buyer
await spendCoinsIdempotent(buyerId, listing.askPrice,
  'bazaar_buy', 'Bozor xarid',
  `bazaar:buy:${listingId}:${buyerId}`);

// Grant seller
const fee = Math.round(listing.askPrice * 0.03);
await grantCoins(sellerId, listing.askPrice - fee,
  'bazaar_sell', 'Bozor sotish',
  `bazaar:sell:${listingId}:${sellerId}`);

// Transfer car
await tx.memberCar.update({
  where: { id: listing.memberCarId },
  data:  { memberId: buyerId }
});

await tx.garajBazaarListing.update({
  where: { id: listingId },
  data:  { status: 'sold', soldAt: new Date() }
});
```

**Anti-wash:** self-buy blocked (`if (buyerId === listing.sellerId) throw 'SELF_TRADE'`). 3% tax burns tanga on every round-trip. 24h listing delay for new accounts (`Member.createdAt + 24h < now()`).

**Price alerts:** synchronous scan on `POST /api/garaj/bazaar/listing` creation. O(50) max scan. No new poller.

#### Sealed-Bid Auction (Phase 3)

- Bid escrowed via `spendCoinsIdempotent` at submission
- Anti-snipe: if bid in last 5 minutes, `endsAt += 5 minutes` (max 3 extensions)
- **Anti-snipe ordering fix (resolves Red-Team MINOR-1):** the sweep's auction-close pass runs AFTER processing all bids for that tick. The `WHERE endsAt < now()` query re-fetches `endsAt` after any bid extensions committed in that tick.
- Close: sweep checks `status='open' AND endsAt < now()`. Highest bidder wins. Losers refunded via `grantCoins(key: 'auction:refund:{auctionId}:{bidderId}')`.
- Salvage auction (auto-triggered at `ridesSinceService > 40`) requires owner notification AND explicit cancel button. Hard-blocked on cars with `purchaseCost > 5000` unless player opts in — resolves Red-Team MAJOR-5 from money safety review.

---

### 4.6 Reputation Arc + 5 Garage Tiers

#### Reputation Score

```typescript
reputationScore = totalRides * 1
               + carsOwnedCount * 50
               + sumCarLevels * 20
               + carsSoldCount * 30
               + ordersCompleted * 15
               + uniquePartsInstalled * 10
               + streakDays * 5
               + prestigeCount * 500
```

Recomputed on-write in `bookingNotifier` and on any garage mutation. Stored in `MemberGarajMeta.reputationScore`.

#### 5 Tiers

| Tier | Name | Rep Gate | Physical CSS | New Mechanic | Unlock into Next |
|---|---|---|---|---|---|
| 1 | Ko'cha Garaj | 0 | Cracked asphalt yard, single car, plastic chair | Equip + ride earn + service + shop (Level 1-3) | rep≥500, 1 car Level 3, 300t spent on services |
| 2 | Mahalla Garaj | 500 | Proper concrete floor, fluorescent light SVG | Order Board (3 slots), Style unlock: FULL_RESTORE | rep≥2000, 10 orders completed, 3+ car models owned |
| 3 | Usta Garaj | 2000 | Hydraulic lift SVG, parts shelf, "TA'MIRLASH XIZMATI" signage | Skill tree choice, Parts economy, Ustaxona crafting (3 stations), Style unlock: TUNING | rep≥8000, 5 cars flipped, specialization chosen + 3 orders with branch advantage, 1 car Level 5 |
| 4 | Avtosalon | 8000 | Glass-front wall (`opacity: 0.85` + `rgba` — NOT `backdrop-filter`, resolves Red-Team MINOR-3), reception desk | Peer Bazaar (P2P market), NPC Hamid/Maftuna/Jahongir appear, League leaderboard, Style unlock: PERIOD_CORRECT | rep≥25000, 20 Bazaar sales + TraderRep≥75, all 8 cars owned once (Museum entry), full skill tree, 2 seasonal events |
| 5 | Diler Markazi | 25000 | Four car display slots, "DILER" gold sign | Clan Garage, Community Auction, Offline box ×2, Prestige available | N/A (end-state) |

**Tier unlock ceremony:** clip-circle CSS animation (`clip-path: circle(0% → 150%)`), 600ms, WinBurst full, bundled crowd-cheer `.ogg` (~6KB), Telegram bot message.

#### Prestige Loop

Available after Tier 5 + all 8 cars at Level 5 + all Museum entries. Shows explicit before/after screen.

| Lost | Kept | Gained |
|---|---|---|
| All MemberCar rows | Tier 5 | +5% offline earn multiplier |
| All GarajPart inventory | Specialization | Prestige badge ★ |
| All levels | Clan membership | Hall of Fame star |
| | reputationScore (preserved) | +500 rep head-start |

`prestigeMultiplier = 1.0 + (prestigeCount × 0.05)`, hard cap `1.25` (prestige 5).

**Prestige multiplier applies to:** offline box earn rate, flip price via `computeFlipGrant`. Does NOT apply to `grantRideCoins` — the 350 clamp is absolute. `simEconomy.ts` verifies this.

Max 5 prestiges. After Prestige 5: permanent `GarajHallOfFame` entry, visible to all new players on the Museum screen.

---

### 4.7 Ride-to-Game Magic Integration

#### Drop Table (deterministic, not RNG)

```typescript
const seed = SHA256(`${memberId}:${bookingId}`).readUInt32BE(0);
const bucket = seed % 1000;
```

| Bucket | Type | Rate | Phase |
|---|---|---|---|
| 0–399 | `PART_COMMON` | 40% | Phase 1 |
| 400–599 | `PART_RARE` | 20% | Phase 2 |
| 600–699 | `TOWED_CAR` | 10% | Phase 1 |
| 700–799 | `CUSTOMER_VISIT` | 10% | Phase 2 |
| 800–879 | `GUEST_CAR` | 8% | Phase 2 (only if `driverMemberId` exists AND has equipped car — otherwise falls back to `PART_COMMON`) |
| 880–929 | `PARTS_CRATE` | 5% | Phase 2 |
| 930–969 | `BARN_FIND_HINT` | 4% | Phase 3 (flag DEFAULT_OFF; Phase 1 shows UI placeholder only, accumulates NO data) |
| 970–989 | `MECHANIC_TIP` | 2% | Phase 2 |
| 990–999 | `LEGENDARY_PART` | 1% | Phase 3 |

**Idempotency anchor:** `GarajRideDrop(memberId, bookingId)` UNIQUE. Sweep does `INSERT ... ON CONFLICT DO NOTHING`. If the row already exists, the entire drop block is skipped.

**TOWED_CAR specifics:**
- Offered at `basePrice × 0.65`, shown for 48h
- Accept: `spendCoinsIdempotent(key: 'tow:{memberId}:{bookingId}', amount: discountedPrice)`
- Decline: `AppState garajDeclinedCar:{memberId}:{carCode}:{weekKey}` prevents same car reappearing for 7 days
- Only offered for cars the player does not own
- If player owns all cars: bucket re-rolls to `PART_RARE`

**GUEST_CAR check (resolves Red-Team MAJOR-2 from technical review):**
```typescript
if (driverMemberId && featureOn('GARAJ_GUEST_CAR')) {
  const driverCar = await prisma.memberCar.findFirst({
    where: { memberId: driverMemberId, isEquipped: true }
  });
  if (!driverCar) return dropFallback(seed, 'PART_COMMON', memberId, bookingId);
  // proceed with GUEST_CAR drop
}
```

**Mini App delivery animation:** after ride finish, a delivery card slides up from bottom (`translateY(100%) → 0`, 400ms overshoot cubic) showing drop type icon + item name + "Qabul qilish" button. WinBurst on accept. Sound: `garaj-delivery.ogg` (~8KB).

**Bot push rate:** max 2 Garaj magic pushes per member per 24h (`AppState garajPushCount:memberId:dateKey`). If limit hit, drop still processes — only push is suppressed.

---

### 4.8 Mahalla Social + Virality

#### Mahalla Identity

```prisma
model MahallaGroup {
  id           String @id @default(cuid())
  name         String
  code         String @unique  // 6-char invite slug
  founderMemberId String
  weeklyScore  Int    @default(0)
  badgeCode    String?
  memberCount  Int    @default(1)
  @@index([weeklyScore])
}
model MahallaGroupMember {
  id          String @id @default(cuid())
  groupId     String
  memberId    String @unique  // one mahalla per member, hard constraint
  joinedAt    DateTime
  role        String @default("MEMBER")  // FOUNDER | ELDER | MEMBER
  weekContrib Int    @default(0)
  @@index([groupId])
}
```

Score formula (per ride in sweep): `weeklyScore += floor(rideMinutes × equippedCarLevel × (1 + prestigeBonus))`

Score metric is ride-time × car quality, NOT raw tanga — cannot be farmed via coin mechanics.

**Group size cap:** 20 members. "Yosh Mahalla" bracket for groups under 4 weeks old — they compete only against other new groups (resolves Red-Team MAJOR on mahalla bootstrap).

**Weekly reset:** Monday midnight UTC+5. Writes `MahallaWeeklyResult(groupId, weekKey, rank, badge)` — THIS insert IS the idempotency marker (its presence = reset already ran), no separate AppState key needed. Resolves Red-Team MINOR-2.

#### Dual Referral

When referred member completes their 3rd real ride:
- Referrer gets: `GarajPart {partCode: 'spark_plug_oem', qty: +1}` via `GarajPartDrop(memberId, 'referral_bonus', referralCode)` unique constraint
- Referred gets: `GarajPart {partCode: 'filter_oil_sport', qty: +1}`
- No tanga movement — parts only

This is the **primary social hook**, promoted to the Garaj home screen: "Do'stingizni taklif qiling → ikkovingiz OEM qism olasiz."

**Clan projects** (Tier 5 only): shared ride/flip/level goals, `grantCoins` 50t to each member on completion. Clan reward requires `weekContrib >= 5` rides from the member during the goal period (resolves Red-Team MAJOR-7 from economy review).

---

### 4.9 Live-Ops Calendar

All live-ops hooks plug into the existing `bookingNotifier` sweep via an END-OF-SWEEP pass guarded by `AppState liveops:tick:{tenMinSlot}` (10-minute granularity).

#### Forgiving Streak

```
Streak {
  memberId     String @unique
  current      Int    @default(0)
  longest      Int    @default(0)
  lastRideDate String?  // YYYY-MM-DD Tashkent
  freezeAvailable Boolean @default(false)
  freezeUsed   Boolean @default(false)
}
```

Logic in ride-finish block:
- Same Tashkent day as `lastRideDate`: no-op
- Yesterday: `current++`
- 2 days ago + `freezeAvailable AND NOT freezeUsed`: `freezeUsed = true`, `current++`
- Otherwise: reset to 1

Day 7 → `freezeAvailable = true` (earned spare tire). `freezeAvailable` resets when streak resets.

Reward ladder (idempotency key suffix = `{memberId}:{isoWeek}` to prevent same-week double-grant after reset):

| Day | Grant | Extra |
|---|---|---|
| 3 | +20t | — |
| 5 | +30t | — |
| 7 | +60t | Spare tire unlocked |
| 14 | +100t | "14 kun" badge on car card |
| 30 | +200t | Gold plate frame |

Comeback bonus (app-open handler, NOT sweep): if `daysSinceLastCheckIn >= 3` → `grantCoins(25t, key: 'comeback:{memberId}:{isoWeek}')`.

#### Daily Cipher

- Admin posts 3-letter code in Telegram channel daily
- Player taps 3-button pad in Garaj tab, hits "Tasdiqlash"
- **Attempt counter is server-side** (`AppState cipher:attempts:{memberId}:{YYYY-MM-DD}` via Postgres atomic increment `UPDATE ... SET value = CAST(CAST(value AS INT) + 1 AS TEXT)`) — resolves Red-Team MINOR-2 from economy review
- After 5 wrong attempts: 429 until next Tashkent day
- Correct: `grantCoins(30t, key: 'cipher:{memberId}:{YYYY-MM-DD}')`

#### Weekly Events

`GarajWeeklyEvent` table with `weekKey`, `eventType`, `multiplier`, `label`. Admin fills weekly. 3-chip row at top of Garaj screen.

| Type | Effect | Constraint |
|---|---|---|
| `double_parts` | Every ride drops a part (vs every 10th) | Items only, 0 tanga |
| `discount_service` | Service cost × `1 - (1 - multiplier)` | Tanga sink reduction |
| `bonus_orders` | Order reward × multiplier | Bounded by daily order cap |
| `xp_boost` | Required rides ÷ multiplier | Progression, not economy |

#### Seasonal Events (5/year)

| Event | Dates | Ride earn bonus | Quest reward |
|---|---|---|---|
| Navruz | Mar 21-27 | +10% (pre-clamp) | Tulip hood decal CSS |
| Ramadan | Admin-set (lunar) | Offline box ×2 | Green crescent badge |
| Mustaqillik | Sep 1-7 | None | Flag-color plate frame |
| Qish | Dec 20-Jan 3 | +5t cipher bonus | Ice-blue tint CSS |
| Hamjamiyat | 1 week/quarter | Community ride goal | Shared banner + badge |

Seasonal `+10% ride earn bonus`: applied in `grantRideCoins` BEFORE the 350 clamp. Clamp fires last. `simEconomy.ts` must include `seasonalBoostPath` scenario confirming 0 violations at max multiplier stack.

#### Offline Box

Rate: `floor(carLevel × 0.5)` tanga/hr. Cap: 24h. Daily idempotency key uses Tashkent calendar date (resolves Red-Team MAJOR-3 timezone exploit): `collectSlot = toTashkentDate(new Date())` formatted `YYYY-MM-DD`. Prestige multiplier applies but overall daily passive cap is enforced: `MIN(earned × prestigeMultiplier, 75)` — resolves Red-Team BLOCKER-4 offline box compound exploit.

---

### 4.10 Juice, Game-Feel + Audio Spec

#### Audio Assets

| ID | File | Size | Trigger |
|---|---|---|---|
| `snd_part_click` | `part-click.ogg` | ≤7KB | Part install |
| `snd_coin_clink` | `coin-clink.ogg` | ≤5KB | Tanga grant |
| `snd_engine_rev` | `engine-rev.ogg` | ≤12KB | Level-up hood flip + test drive |
| `snd_sale_chord` | `sale-chord.ogg` | ≤8KB | Flip confirm |
| `snd_whoosh` | `whoosh.ogg` | ≤5KB | Before/after reveal |
| `snd_wrench` | `wrench.ogg` | ≤4KB | Daily oil tap |

Total bundled audio: ≤41KB gzipped. Lazy-loaded inside the `garaj` chunk. `GarajAudio` singleton: `localStorage('garaj_muted')` persists. All `AudioContext.play()` calls wrapped in try/catch. Mute toggle: 32×32 icon button in Garaj header.

#### The 5-Layer Feedback Stack

All five fire simultaneously on meaningful actions. Each layer suppressible. `prefers-reduced-motion` collapses layers 1-4 to instant.

| Layer | Mechanic | Implementation |
|---|---|---|
| 1 Sound | `GarajAudio.play(id)` | Web Audio API, graceful fallback |
| 2 Micro-shake | `@keyframes garaj-shake` 80-140ms | `animation-duration` varies by action weight |
| 3 WinBurst | Reuse existing component, `size` prop | `sm`=8, `md`=12, `lg`=24 particles |
| 4 Number punch | `transform: scale(1→1.28→1)` 180ms | Applied to tanga counter |
| 5 State icon | CSS class swap on car card | `filter: none`, gold border, condition badge |

`will-change: transform` added at animation start, removed in `animationend` callback. Never set statically. No animated `filter` on fleet views.

**Before/After Reveal:** `clip-path: inset(0 100% 0 0) → inset(0 0% 0 0)`, 800ms ease. `prefers-reduced-motion`: instant state change.

**Hood Flip (Level-Up):** CSS `rotateY(0→90→0)`, 500ms total. Mid-point at 250ms shows hood-open SVG overlay (~800 bytes inline SVG). `prefers-reduced-motion`: instant class swap.

**Coin Rain (Flip Sale):** 20 coins on a single `<canvas>` element (400×300, `devicePixelRatio` aware) rendered via `rAF` loop. Canvas removed after 1200ms. Deterministic arcs via `Math.sin(i × 2.4) × 60` — no `Math.random()`. `prefers-reduced-motion`: skip canvas, balance increments in one jump.

**Sheen on rare/restored cars:** CSS `::after` pseudo-element, `@keyframes sheen-slide` 3.2s cycle with 40% active movement. `prefers-reduced-motion`: static gradient stripe, no animation.

**Engine Vroom (Test Drive):** car SVG lateral shake ±3px for 600ms (`steps(1)` for mechanical rattle feel). `prefers-reduced-motion`: sound only + single 80ms scale punch.

---

### 4.11 90-Second Onboarding

5-step state machine in `AppState 'garaj:onboard:{memberId}'`. All transitions server-side, idempotent.

**Starter car:** `carCode='DAMAS_ONBOARD'` (Phase 1 uses Tiko: `carCode='TIKO_ONBOARD'`) with `basePrice=0` in `carCatalog.ts` — never appears in the regular shop. Resolves Red-Team MINOR-2 from scope review.

**Steps:**

| Step | Action | Cost | Juice | Time |
|---|---|---|---|---|
| 0→1 | Broken Tiko slides in from right, tap "Ha, boshlaylik" | 0t | Slide-in animation, `TourPointer` on button | 4-8s |
| 1→2 | Tap engine zone → diagnosis card → repair "Yog' almashtirish 0t" | 0t | Full 5-layer juice stack, zone turns gold | 8-22s |
| 2→3 | Tap "Sinov yurishi" | 0t | Engine vroom, color bloom, WinBurst md | 6-12s |
| 3→4 | Tap "Sotish" → Flip Summary shows +80t | 0t (grant +80t) | Coin rain canvas, sale chord sound | 8-18s |
| 4→5 | Dream car tease (Nexia 3 silhouette, progress bar), tap "Garajga kirish" | 0t | TourPointer on Nexia for 2s | 5-15s |

**Total: 31-75s median, 120s worst-case.**

**Step 3→4 grant:** `grantCoins(80t, key: 'garaj:onboarding:first_flip:{memberId}')` — key uses `memberId`. Multi-account protection: also check `TelegramUser.id` (resolves Red-Team BLOCKER-3 from economy review) — key additionally includes `telegramUserId`: `garaj:onboarding:first_flip:tg:{telegramUserId}`. If a second account shares the same `telegramUserId`, the grant returns `skipped: duplicate`.

**Flip guard:** the `POST /api/garaj/v2/flip` handler checks `MemberCar.onboardCar = true` → returns 422 `ONBOARD_CAR_USE_FTUE_FLOW` (resolves Red-Team MAJOR-5 from technical review).

**Existing-member skip:** any member with `MemberGarajMeta` row OR `MemberCar` rows skips to `step = 5` immediately.

**`TourPointer` spec:** `<TourPointer target={ref} />` — `position: absolute`, `z-index: 9999`, `pointer-events: none`. CSS `@keyframes pulse-ring` (ring expanding from center, opacity 0→1→0). Disappears on tap of target element. `prefers-reduced-motion`: static pointer, no pulse.

---

### 4.12 Ethical Monetization + Accessibility

#### Monetization Rules (non-negotiable)

1. No paid randomness. Every purchase has a fixed, visible outcome.
2. No pay-to-win on rides. Max tanga/ride is 350 for all players.
3. Passes the "explain to a 10-year-old" test.

#### Kozacha (already detailed in 4.4)

Primary ethical premium currency. Earned by riding, spent on flip multipliers and cosmetics.

#### Battle Pass: "Usta Obunasi"

- Cost: 4,000t/month (`spendCoinsIdempotent(key: 'ustaob:{memberId}:{YYYY-MM}')`)
- 30-day grid: one square unlocked per day-of-month on app open
- Day 1: gold car card border. Day 7: "Usta Haydovchi" plate frame. Day 14: exclusive car wrap. Day 30: next-in-rotation part (deterministic, not random)
- Ride earn cap: identical for all players (350/ride). Subscriber advantage: 1 Ustaxona instant-complete/day, cosmetics, slight convenience.

**Free vs Paid ride income:** equal. Max tanga/ride = 350 for all.

#### Accessibility

- `prefers-reduced-motion`: all animations collapse to instant state change. Timing bar mini-game still fully functional (Avtomatik button always present).
- Audio: mute persists to `localStorage`. First sound requires explicit unmute or gesture. All audio in try/catch.
- Color accessibility: all text-on-background meets WCAG AA. Condition badges use BOTH color AND icon (wrench, half-wrench, checkmark, star) for colorblind players.
- One-handed operation: all FTUE interactive elements in lower 65% of screen. Confirm buttons anchored to bottom of Sheet.
- Android performance: target 60fps on Redmi A2+. `will-change: transform` managed dynamically. No `backdrop-filter`. Coin rain on canvas (not DOM nodes). WinBurst max 24 particles.

---

## 5. REAL-TIME INFRA ANSWER

### Postgres Now

All per-member state serialized via `withMemberLock(memberId)` — in-process Map, prevents concurrent mutations for the same member. Correctness guarantee is NOT the lock alone but the idempotency key on `CoinTxn`/`KozachaTxn` — the P2002 unique constraint is the actual guard.

**`spendCoinsIdempotent` is a Postgres-transaction-wrapped function** (resolves Red-Team BLOCKER-4):

```typescript
export async function spendCoinsIdempotent(
  memberId: string, amount: number,
  kind: string, reason: string, idempotencyKey: string
): Promise<CoinResult> {
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, balance: await getCoins(memberId) };
  return withMemberLock(memberId, async () => {
    return prisma.$transaction(async (tx) => {
      // Check idempotency INSIDE transaction
      const existing = await tx.coinTxn.findUnique({ where: { idempotencyKey } });
      if (existing) return { ok: false, balance: await getCoins(memberId, tx), skipped: 'duplicate' };
      // Atomic debit + record in ONE transaction
      const res = await tx.member.updateMany({
        where: { id: memberId, coins: { gte: amount } },
        data:  { coins: { decrement: amount } }
      });
      if (res.count === 0) return { ok: false, balance: await getCoins(memberId, tx), skipped: 'insufficient' };
      await tx.coinTxn.create({ data: { memberId, amount: -amount, kind, reason, idempotencyKey } });
      return { ok: true, balance: await getCoins(memberId, tx) };
    });
  });
}
```

`updateMany` and `coinTxn.create` in ONE `prisma.$transaction`. Process crash between them now rolls back both. The same atomic pattern applies to `spendKozachaIdempotent`.

### The Scale Trigger

When ANY of these conditions are true:
- Concurrent member count > 500 at peak
- Sweep tail latency > 60s (measured via `AppState sweep:lastCompletedAt`)
- Lock contention errors appearing in logs

### One-File Swap to Redis/Socket.IO

All per-member locking is in `packages/server/src/services/coinService.ts` in `withMemberLock()`. Replace the in-process Map with `redlock` on Redis:

```typescript
// BEFORE (in-process):
const locks = new Map<string, Promise<void>>();
async function withMemberLock<T>(id: string, fn: () => Promise<T>) { ... }

// AFTER (Redis, one file change):
const redlock = new Redlock([redisClient], { retryCount: 5, retryDelay: 200 });
async function withMemberLock<T>(id: string, fn: () => Promise<T>) {
  const lock = await redlock.acquire([`lock:member:${id}`], 5000);
  try { return await fn(); } finally { await lock.release(); }
}
```

Socket.IO: the game page currently polls `GET /api/garaj/state` on focus (`visibilitychange` event). When Socket.IO ships, replace the poll with a socket event subscription. The server-side game logic is unchanged — only the delivery mechanism changes. This is a two-file change (`GarajShell.tsx` + `socketServer.ts`).

AppState key-value: `appStateUtil.ts` wraps `prisma.appState.findUnique/upsert`. Replace with `redis.get/set`. One file, all callers unchanged.

---

## 6. FULL POSTGRES SCHEMA

### 6.1 Extensions to Existing Tables

```prisma
// Extend MemberCar (all nullable, backward-compatible)
model MemberCar {
  // ... existing fields unchanged ...
  condition        String?  // worn|fair|good|mint, default 'good'
  totalRides       Int?     @default(0)
  totalTangaEarned Int?     @default(0)
  acquiredAt       DateTime?  // null → use boughtAt
  purchaseCost     Int?     // price paid at acquisition (for migration)
  onboardCar       Boolean  @default(false)  // FTUE-created car, blocks real flip endpoint
  isLegacy         Boolean  @default(false)  // pre-v3 car, kept for backward compat
}
```

### 6.2 New Tables

```prisma
// ── Garage metadata (1:1 with Member) ────────────────────────
model MemberGarajMeta {
  memberId         String   @id
  garageTier       Int      @default(1)
  reputationScore  Int      @default(0)
  prestigeCount    Int      @default(0)
  prestigeMultiplier Float  @default(1.0)  // 1.0 + (count × 0.05), max 1.25
  kozachaBalance   Int      @default(0)    // denormalized, updated atomically
  boostRidesLeft   Int      @default(0)
  lastBoxCollectedAt DateTime?
  lastDailyOilAt   DateTime?
  dreamCarCode     String?
  mechanicUntil    DateTime?
  garageDecorJson  String?   // JSON skin slots
  lastOpenAt       DateTime?
  migratedAt       DateTime?
  migrationPolicy  String?
  updatedAt        DateTime  @updatedAt
  @@index([memberId])
}

// ── Kozacha ledger ────────────────────────────────────────────
model KozachaTxn {
  id             String   @id @default(cuid())
  memberId       String
  amount         Int      // positive = earn, negative = spend
  reason         String
  idempotencyKey String   @unique
  createdAt      DateTime @default(now())
  @@index([memberId, createdAt])
}

// ── GarajCar (per-car game state, extends MemberCar) ─────────
model GarajCar {
  id                  String      @id @default(cuid())
  memberCarId         String      @unique  // FK to MemberCar.id
  memberId            String
  carCode             String
  diagnosisSeed       Int?        // set once at acquisition
  diagnosisResult     Json?       // zone breakdown
  diagnosedAt         DateTime?
  style               String?     // QUICK_FLIP|FULL_RESTORE|TUNING|PERIOD_CORRECT
  styleLockedAt       DateTime?
  sportPartsInstalled Int         @default(0)
  ridesPostLastRepair Int         @default(0)
  repairQualityBonus  Float       @default(1.0)  // product of timing results
  maxRideGrant        Int         @default(0)
  @@unique([memberId, carCode])
  @@index([memberId])
}

// ── Repair jobs ───────────────────────────────────────────────
model GarajRepairJob {
  id         String      @id @default(cuid())
  memberId   String
  garajCarId String
  carCode    String
  status     String      @default("active")  // active|paused|completed
  startedAt  DateTime    @default(now())
  completedAt DateTime?
  @@index([memberId, status])
}

// ── Repair tasks ──────────────────────────────────────────────
model GarajRepairTask {
  id             String    @id @default(cuid())
  jobId          String    // FK to GarajRepairJob
  memberId       String
  garajCarId     String
  taskCode       String    // oil_change|tyre_swap|body_dent|interior|battery|engine_rebuild
  status         String    @default("locked")  // locked|unlocked|completed
  tangaCost      Int
  partRequired   String?
  rideUnlockAt   Int       @default(0)
  completedAt    DateTime?
  idempotencyKey String?   @unique
  @@unique([jobId, taskCode])  // one task per job (resolves Red-Team MAJOR-3)
  @@index([memberId, status])
}

// ── Repair timing results ─────────────────────────────────────
model GarajRepairResult {
  id         String    @id @default(cuid())
  memberId   String
  jobId      String
  taskCode   String
  quality    String    // EXCELLENT|GOOD|FAIR|DEFECT|AUTO
  condDelta  Int
  xpAwarded  Int
  branchHit  String?   // muhandis|kuzovchi|null
  createdAt  DateTime  @default(now())
  @@unique([jobId, taskCode])  // one result per task per job (NOT date-scoped)
  @@index([memberId])
}

// ── Mechanic skill ────────────────────────────────────────────
model MemberMechanicSkill {
  memberId              String  @id
  ustaKozRank           Int     @default(0)
  totalDiagnoses        Int     @default(0)
  correctReads          Int     @default(0)
  muhandisXp            Int     @default(0)
  kuzovchiXp            Int     @default(0)
  savdogarXp            Int     @default(0)
  kollektsionerXp       Int     @default(0)
  muhandisTier          Int     @default(1)
  kuzovchiTier          Int     @default(1)
  savdogarTier          Int     @default(1)
  kollektsionerTier     Int     @default(1)
  engineServiceExtension Boolean @default(false)
  updatedAt             DateTime @updatedAt
}

// ── Flip/sale archive ─────────────────────────────────────────
model GarajFlip {
  id          String    @id @default(cuid())
  memberId    String
  memberCarId String
  carCode     String
  boughtForT  Int
  repairSpentT Int
  soldForT    Int
  profitT     Int
  style       String
  buyerArchetype String
  kozachaFlipBoost Float @default(0)  // Kozacha flip boost applied
  soldAt      DateTime  @default(now())
  @@index([memberId, soldAt])
}

// ── Part inventory ────────────────────────────────────────────
model GarajPartInventory {
  id           String  @id @default(cuid())
  memberId     String
  partCode     String
  qty          Int     @default(0)
  sourceKozacha Boolean @default(false)  // blocks Bazaar listing
  @@unique([memberId, partCode])
  @@index([memberId])
}

// ── Ride drop idempotency anchor ──────────────────────────────
model GarajRideDrop {
  id         String    @id @default(cuid())
  memberId   String
  bookingId  String
  dropType   String
  dropCode   String
  quantity   Int       @default(1)
  seed       Int
  processedAt DateTime @default(now())
  @@unique([memberId, bookingId])
  @@index([memberId])
}

// ── Ride stats (for demand wave — NOT CoinTxn scan) ───────────
model GarajRideStats {
  carCode  String
  dateKey  String  // YYYY-MM-DD
  rideCount Int    @default(0)
  @@id([carCode, dateKey])
  @@index([carCode, dateKey])
}

// ── Workshop orders ───────────────────────────────────────────
model GarajOrder {
  id         String    @id @default(cuid())
  memberId   String
  slotIndex  Int       // 0|1|2|3
  npcName    String
  carCode    String
  taskCode   String
  rewardT    Int       // max 80t
  expiresAt  DateTime
  acceptedAt DateTime?
  claimedAt  DateTime?
  source     String    @default("daily")  // daily|ride
  @@index([memberId, claimedAt])
}

// ── Ustaxona crafting ─────────────────────────────────────────
model GarajCraft {
  id            String    @id @default(cuid())
  memberId      String
  station       String    // tyre_station|oil_station|body_station
  componentCode String
  startedAt     DateTime  @default(now())
  doneAt        DateTime
  collectedAt   DateTime?
  tangaCost     Int
  partsConsumed Json
  @@index([memberId, collectedAt])
  @@index([doneAt])
}

// ── Bazaar listings ───────────────────────────────────────────
model GarajBazaarListing {
  id            String    @id @default(cuid())
  sellerId      String
  itemType      String    // car|part
  carCode       String?
  memberCarId   String?
  partCode      String?
  sourceKozacha Boolean   @default(false)
  qty           Int       @default(1)
  askPrice      Int
  condition     String    @default("good")
  status        String    @default("open")  // open|pending_payment|sold|cancelled|expired
  listedAt      DateTime  @default(now())
  expiresAt     DateTime
  buyerId       String?
  soldAt        DateTime?
  listingFee    Int       @default(10)
  @@unique([sellerId, memberCarId, status])
  @@index([status, itemType, expiresAt])
}

// ── Counter-offer (haggling) ──────────────────────────────────
model GarajCounterOffer {
  id           String    @id @default(cuid())
  listingId    String
  buyerId      String
  offeredPrice Int
  status       String    @default("pending")
  sellerCounter Int?
  expiresAt    DateTime
  @@index([listingId, status])
}

// ── Demand events (admin-set scarcity) ───────────────────────
model GarajDemandEvent {
  id          String    @id @default(cuid())
  eventCode   String    @unique
  carCategory String
  demandLabel String
  startsAt    DateTime
  endsAt      DateTime
  active      Boolean   @default(true)
}

// ── Trader reputation ─────────────────────────────────────────
model GarajTraderRep {
  memberId         String @id
  completedSales   Int    @default(0)
  completedBuys    Int    @default(0)
  positiveRatings  Int    @default(0)
  totalRatings     Int    @default(0)
  repScore         Int    @default(35)  // starts at 35, not 50 (resolves Red-Team MINOR-4)
}

// ── NPC relationships ─────────────────────────────────────────
model GarajNpc {
  id               String    @id @default(cuid())
  memberId         String
  npcCode          String    // hamid|maftuna|jahongir
  questsCompleted  Int       @default(0)
  lastSeenAt       DateTime?
  relationshipJson Json?
  @@unique([memberId, npcCode])
}

// ── Seasonal event progress ───────────────────────────────────
model GarajSeasonProgress {
  id           String    @id @default(cuid())
  memberId     String
  seasonCode   String
  ridesLogged  Int       @default(0)
  unlocked     Boolean   @default(false)
  unlockedAt   DateTime?
  @@unique([memberId, seasonCode])
  @@index([seasonCode, unlocked])
}

// ── Museum (first Level-5 per car model) ──────────────────────
model GarajMuseum {
  carCode       String    @id
  firstMemberId String
  achievedAt    DateTime  @default(now())
}

// ── Hall of Fame (post-prestige) ──────────────────────────────
model GarajHallOfFame {
  id          String    @id @default(cuid())
  memberId    String
  prestigeCount Int
  achievedAt  DateTime  @default(now())
}

// ── Forgiving streak ──────────────────────────────────────────
model GarajStreak {
  memberId       String   @id
  currentDays    Int      @default(0)
  longestDays    Int      @default(0)
  lastRideDate   String?  // YYYY-MM-DD Tashkent
  freezeAvailable Boolean @default(false)
  freezeUsed     Boolean  @default(false)
  updatedAt      DateTime @updatedAt
}

// ── Live-ops calendar ─────────────────────────────────────────
model GarajCalendar {
  weekKey    String  @id  // "2026-W25"
  slot1Type  String?
  slot1Value Float?
  slot2Type  String?
  slot2Value Float?
  slot3Type  String?
  slot3Value Float?
}

// ── Mahalla social ────────────────────────────────────────────
model MahallaGroup {
  id              String   @id @default(cuid())
  name            String
  code            String   @unique
  founderMemberId String
  weeklyScore     Int      @default(0)
  badgeCode       String?
  memberCount     Int      @default(1)
  createdAt       DateTime @default(now())
  @@index([weeklyScore])
}

model MahallaGroupMember {
  id          String   @id @default(cuid())
  groupId     String
  memberId    String   @unique  // one mahalla per member
  joinedAt    DateTime @default(now())
  role        String   @default("MEMBER")
  weekContrib Int      @default(0)
  @@index([groupId])
}

model MahallaWeeklyResult {
  id       String @id @default(cuid())
  groupId  String
  weekKey  String
  rank     Int
  badge    String?
  @@unique([groupId, weekKey])
}

// ── Member cosmetics ──────────────────────────────────────────
model MemberCosmetic {
  id           String   @id @default(cuid())
  memberId     String
  cosmeticCode String
  earnedAt     DateTime @default(now())
  source       String   @default("mission")
  @@unique([memberId, cosmeticCode])
  @@index([memberId])
}

// ── Price alerts ──────────────────────────────────────────────
model GarajPriceAlert {
  id          String   @id @default(cuid())
  memberId    String
  carCode     String
  targetPrice Int
  direction   String   // above|below
  triggeredAt DateTime?
  createdAt   DateTime @default(now())
  @@index([memberId])
}

// ── Reputation log ────────────────────────────────────────────
model MemberReputation {
  id        String   @id @default(cuid())
  memberId  String
  delta     Int
  reason    String
  createdAt DateTime @default(now())
  @@index([memberId, createdAt])
}

// ── Usta subscription ─────────────────────────────────────────
model UstaSubscription {
  id        String   @id @default(cuid())
  memberId  String
  startedAt DateTime
  expiresAt DateTime
  monthKey  String
  paidTanga Int      @default(4000)
  @@unique([memberId, monthKey])
}
```

---

## 7. ANTI-EXPLOIT: EVERY SYSTEM

### 7.1 Flip Grant (resolves Red-Team BLOCKER-1)

- `computeFlipGrant()` is ONE function in `garajConfig.ts` used everywhere
- Hard cap: `MIN(computedPrice, MAX(basePrice × 2.5, (acquireCost + repairSpent) × 3.0))`
- Daily per-member flip emission cap: `AppState garaj:flipDailyBudget:{memberId}:{YYYY-MM-DD}`, max 8,000t/day. Counter incremented inside the flip handler before `grantCoins`. If exceeded, flip is blocked with a user-facing message.
- `simEconomy.ts` MUST include `garajFlipEmission` scenario: 10 flips/week at max multiplier, assert daily emission ≤ 8,000t per player AND ≤ 80,000t/day across 100 active flippers.

### 7.2 Market Wash Trading (resolves Red-Team MAJOR)

- 3% tax on every Bazaar sale makes round-trip wash costly
- `activeListingVolume` (sum of ask prices, not count) prevents cheap listing spam to suppress demand
- Self-buy blocked server-side
- New accounts: 24h listing delay enforced in listing creation endpoint (`Member.createdAt + 24h < now()`)
- Kozacha-purchased parts: `sourceKozacha = true` blocks Bazaar listing (prevents Kozacha→Tanga laundering)
- TraderRep starts at 35 (not 50), first listing requires `completedSales >= 1` OR `repScore >= 40`

### 7.3 Auction Collusion

- Sealed-bid: one bid per bidder per auction, no revisions
- Anti-snipe: processed synchronously in bid handler BEFORE auction-close sweep pass
- 5% auction fee makes losing-and-rebidding progressively expensive
- Salvage auction on cars with `purchaseCost > 5000` requires explicit player opt-in, not auto-trigger

### 7.4 Offline Income Farming

- Daily passive cap: `MIN(earned × prestigeMultiplier, 75)` hard ceiling in `collectBox` endpoint
- Idempotency key uses Tashkent calendar date: `garajbox:{memberId}:{YYYY-MM-DD}` — no timezone epoch exploit
- `withMemberLock` wraps the entire read-compute-grant-update sequence

### 7.5 Referral Farming

- Dual referral drop is part (non-tanga), non-transferable, non-withdrawable
- `GarajPartDrop` unique constraint on `(memberId, 'referral_bonus', referralCode)` — fires once
- Parts marked `sourceKozacha` do not apply here (referral parts are regular common parts)

### 7.6 Multi-Account / FTUE Farming

- FTUE grant key includes `telegramUserId`: `garaj:onboarding:first_flip:tg:{telegramUserId}`
- One grant per Telegram identity, not per app account

### 7.7 Cipher Brute-Force

- Attempt counter is server-side: Postgres atomic increment via `$executeRaw`
- After 5 failures: 429 until next Tashkent day
- Admin can rotate the code at any time by writing a new `AppState cipher:code:{YYYY-MM-DD}` value

### 7.8 XP Farming via Repeated Repairs

- `GarajRepairResult` unique on `(jobId, taskCode)` — one result per task per job instance
- Each flip creates a new `GarajRepairJob` — re-buying the same car creates a new jobId
- XP accrues at task COMPLETION, not at each timing attempt

### 7.9 `spendCoinsIdempotent` Race Condition

- `updateMany` AND `coinTxn.create` are in ONE `prisma.$transaction`
- Process crash rolls back both atomically
- Same pattern applied to `spendKozachaIdempotent`

---

## 8. BUILD PHASES

### Phase 1 — Vertical Slice (1–2 weeks) — PROVE THE FEELING

**Goal:** A dedicated page shell opens on GARAJ tab tap. The player can buy one car, run the 90-second juiced onboarding, make ONE real decision (Quick-Flip vs Full-Restore), repair with juice, see the before/after reveal, sell with coin rain, and feel the dream car pulling them back. Proves FEELING + DECISION, not the whole game.

**Pre-Phase-1 gate (must complete before writing any code):**
1. Run `scripts/migrateGaraj.ts --dry-run` against production data dump
2. Owner reviews output (per-member refund amounts, 0 negative coins)
3. Owner writes `AppState garaj_migration_policy = 'refund_and_convert'`
4. Owner writes `AppState FEATURE_GARAGE_V3 = 'false'` (confirming policy set before flag)

**Scope IN:**

| Feature | New tables | Kill-switch |
|---|---|---|
| `GarajShell.tsx` lazy chunk | — | `FEATURE_GARAGE_V3` |
| Old rewards-tab chips removal | — | same flag |
| `GarageHomeSection.tsx` | `MemberGarajMeta` | `GARAJ_HOME` |
| `CarDetailSheet.tsx` (stats + biography tabs) | `GarajCar` | `GARAJ_CAR_DETAIL` |
| `CarShelfScroll.tsx` (silhouette + Zeigarnik) | — | `GARAJ_SHOWROOM` |
| FTUE onboarding (5 steps, Tiko only) | — | `GARAJ_ONBOARDING` |
| Sourcing Board (1-car-per-day simple version) | `GarajRideDrop` | `GARAJ_SOURCING` |
| Diagnosis Sheet (binary good/bad, 5 zones) | `GarajCar.diagnosisSeed` | `GARAJ_DIAGNOSIS` |
| Style picker (Quick-Flip + Full-Restore only; Tuning + Period-Correct greyed "Tez kunda") | `GarajRepairJob` | `GARAJ_STYLES` |
| Repair queue (tanga-only, no part deps) | `GarajRepairTask` | `GARAJ_REPAIR` |
| Craftsman single slot (Workshop contention) | — | `GARAJ_CRAFTSMAN_SLOT` |
| Test + before/after clip-path reveal | — | `GARAJ_REVEAL` |
| Flip Summary + `computeFlipGrant()` + coin rain | `GarajFlip` | `GARAJ_FLIP` |
| Dream Car horizon bar | AppState key | `GARAJ_HORIZON_BAR` |
| Free daily Workshop Action | AppState key | `GARAJ_FREE_ACTION` |
| Juice stack (part-click, coin-clink, engine-rev) | — | `GARAJ_JUICE` |
| Migration handler (`migrateIfNeeded()`) | — | Pre-Phase-1 gate |
| `spendCoinsIdempotent` in `coinService.ts` | — | N/A (core infra) |
| `simEconomy.ts` extension (flip + multiplier stack) | — | Must pass before flag |

**Scope OUT:**

- Diagnosis revelation tiers (only binary good/bad in Phase 1)
- Timing mini-game (only Avtomatik button — always present, but the timing bar is Phase 2)
- Skill tree branch XP display (preview bars shown, no XP accrual yet)
- Tuning + Period-Correct styles
- Family Driver + Young Tuner buyers (Phase 1); Newlywed + Collector (Phase 2)
- Kozacha currency (earn hook present in sweep but `FEATURE_KOZACHA = false`)
- Bazaar / peer market
- NPC dialogue / relationship memory
- Order Board (Phase 2)
- Mahalla social
- Seasonal events
- Garage tier unlock ceremonies (Tier 2+ are shown as locked with gate progress)
- Crafting chain (Ustaxona)
- Museum
- Prestige loop
- Parts inventory + drops (the `GarajRideDrop` table exists for idempotency, but Phase 1 only drops `PART_COMMON` and `TOWED_CAR` without showing parts in UI)

**Phase 1 DoD** (every line independently verifiable — R1-R8 culture):

| # | Criterion | Verification command / observation |
|---|---|---|
| 1 | Pre-Phase-1 gate: migration dry-run passes, policy set | `tsx scripts/migrateGaraj.ts --dry-run` → table of (memberId, refundAmount), 0 negative values; owner confirms `AppState garaj_migration_policy` is set |
| 2 | GARAJ tab tap opens shell, slides up in ≤400ms (cached: ≤100ms) | Manual test on Telegram WebApp on Redmi A2+ class Android |
| 3 | Old rewards-tab garage chips invisible when `FEATURE_GARAGE_V3=true` | `grep -r "GarageRewardsSection" packages/miniapp/src` → single conditional render; manual Rewards tab check |
| 4 | `migrateIfNeeded()` runs on first open, `MemberGarajMeta` row created, player sees migration sheet | `curl -H "Authorization: ..." /api/garaj/state` on member with old `MemberCar` rows; assert `migratedAt` set |
| 5 | `computeFlipGrant()` exists in `garajConfig.ts`, imported by flip handler | `grep -r "computeFlipGrant" packages/` → exactly 2 results (garajConfig.ts + flip handler) |
| 6 | Flip grant respects `MAX_SELL_PRICE` cap | Unit test: `computeFlipGrant({ carCode: 'gelandewagen', level: 5, style: 'PERIOD_CORRECT', buyerArchetype: 'COLLECTOR', condition: 'MINT', ... })` ≤ `45000 * 2.5 = 112500` |
| 7 | `spendCoinsIdempotent` is atomic (updateMany + coinTxn.create in one $transaction) | `grep -A 20 "spendCoinsIdempotent" packages/server/src/services/coinService.ts` → `prisma.$transaction` wrapping both ops |
| 8 | Style commitment: calling `POST /api/garaj/repair-task` when `style = null` auto-sets to `QUICK_FLIP` on first task | Test script: create GarajCar with no style, complete first repair task, assert `GarajCar.style = 'QUICK_FLIP'` |
| 9 | Double-tap on repair task is idempotent | POST repair task twice with same idempotencyKey → DB has 1 GarajRepairTask row, balance deducted once |
| 10 | Free daily Workshop Action fires once per Tashkent day | POST `/api/garaj/repair-task` with `freeAction: true` twice same day → second returns `skipped: already_used_today` |
| 11 | `simEconomy.ts` extended with flip grant path and worst-case multiplier stack, 30k rides, 0 violations ≤350/ride | `pnpm tsx packages/server/src/simEconomy.ts` → output `violations: 0`, output includes `flipGrantDaily` stats |
| 12 | Before/after clip-path reveal fires on all tasks complete, no jank on Redmi A2+ | Manual test: complete all repair tasks, observe reveal on target device — 60fps sustained |
| 13 | Coin rain canvas element is removed from DOM after 1200ms | Browser DevTools: Elements panel — `<canvas>` disappears after sell confirm |
| 14 | FTUE grant fires once per `telegramUserId` not per `memberId` | Create two accounts with same Telegram user → second FTUE reaches step 4 → grant returns `skipped: duplicate` |
| 15 | `FEATURE_GARAGE_V3 = false` leaves old game fully functional | Toggle flag off → rewards tab garage chips visible, old earn path fires, no JS errors |
| 16 | All Phase 1 flags individually disableable | Toggle each `featureOn` off → feature disappears, no console errors |
| 17 | Bundle size: garaj chunk ≤ 80KB gzipped | `pnpm build && ls -lh dist/assets/garaj-*.js` |
| 18 | `prefers-reduced-motion` honored across all animations | Chrome DevTools → Emulate reduced motion → no CSS animations in FTUE or repair flow, Avtomatik button functional |
| 19 | Independent agent (R4) re-verifies DoD lines 5-11 against code + live deploy | Separate verification session, file:line + quote + result for each line |
| 20 | Owner QABUL on real phone before `FEATURE_GARAGE_V3=true` in prod | Owner taps GARAJ tab on personal device, completes FTUE, completes one flip, confirms feeling |

---

### Phase 2 — Core Depth (2-4 weeks after Phase 1 owner-accepted)

**Goal:** All 4 styles, all 4 buyers, timing mini-game, Kozacha earn visible, Order Board, Navruz seasonal event, push notifications.

Scope in: timing bar + EXCELLENT/GOOD/FAIR/DEFECT outcomes, `MemberMechanicSkill` table, `GarajRepairResult` table, Tuning + Period-Correct styles, Newlywed + Collector buyers, `KozachaTxn` + Kozacha earn in sweep (shop empty, balance visible), Order Board (3 slots), `GarajStreak` + forgiving streak with spare tire, daily cipher, offline box, weekly events, first seasonal event (Navruz), PART_COMMON + TOWED_CAR drops showing in UI with delivery card animation.

Scope out: Bazaar, auctions, Mahalla social, full skill tree tiers 3-5, Kozacha shop.

### Phase 3 — Economy Depth (4-6 weeks after Phase 2)

**Goal:** Peer Bazaar live, demand waves visible, Kozacha shop open, skill tree full, garage Tier 3 unlock, NPC dialogue.

Scope in: `GarajBazaarListing`, demand multiplier engine + chips UI, Kozacha shop (flip boosts + OEM parts), specialization branch choice at Tier 3, Ustaxona crafting stations, `GarajNpc` dialogue, 4-branch skill tree progression, Museum (first Level-5 entry), CUSTOMER_VISIT + MECHANIC_TIP drops.

### Phase 4 — Social (6-10 weeks after Phase 3)

**Goal:** Mahalla league live, Exhibition voting, clan projects, dual referral prominent.

Scope in: `MahallaGroup` + `MahallaGroupMember`, weekly score in sweep, league leaderboard, Exhibition submit/vote/winner ceremony, clan projects, dual referral part drop, GUEST_CAR drop (after confirming `driverMemberId` availability on bookings), neighbour garage visits.

### Phase 5 — End-Game (post-Phase 4)

**Goal:** Tier 4 Avtosalon + Bazaar gating, Tier 5 Diler Markazi, prestige loop, Hall of Fame, sealed-bid auctions, salvage auctions, clan community auctions.

---

## 9. RISK REGISTER + EXPLICIT NOT-DOING-IN-PHASE-1

### Risk Register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Migration double-refund destroys economy | CRITICAL | Pre-Phase-1 dry-run + AppState policy gate + `grantCoins` idempotency key |
| R2 | Flip grant uncapped — real money printer | CRITICAL | `computeFlipGrant()` in one file, daily cap 8000t, `simEconomy.ts` extension required before flag |
| R3 | Concurrent Bazaar buy — double debit | HIGH | Claim-before-pay (`updateMany status=pending_payment` check before spend) |
| R4 | Sweep latency exceeds 90s at scale | HIGH | END-OF-SWEEP pass capped at 10-min granularity; push engine uses targeted query not full-member scan; `GarajRideStats` table avoids CoinTxn scan |
| R5 | Kozacha→Tanga laundering via Bazaar | HIGH | `sourceKozacha = true` blocks all listings; enforced at DB level |
| R6 | FTUE grant farmed via multi-account | MEDIUM | Key includes `telegramUserId` not just `memberId` |
| R7 | Timezone exploit on offline box | MEDIUM | Idempotency key uses Tashkent calendar date, not epoch floor |
| R8 | XP farming via repeated DEFECT retries | MEDIUM | `GarajRepairResult` unique on `(jobId, taskCode)`, no date dimension |
| R9 | Salvage auction disposes high-value assets without consent | MEDIUM | Hard-blocked on `purchaseCost > 5000` without explicit opt-in |
| R10 | GUEST_CAR drop fails silently for most drivers | LOW | Phase 2 only; fallback to PART_COMMON explicit; feature flag DEFAULT_OFF until `driverMemberId` availability confirmed |
| R11 | `repairQualityBonus` and `conditionMult` in separate docs | LOW | `computeFlipGrant()` unifies them; both docs reference the single function |

### Explicit NOT-DOING in Phase 1

| Item | Reason |
|---|---|
| Timing mini-game bar | Not needed to prove fun loop; Avtomatik always present |
| All 4 skill tree branches | Complex, requires Phase 1 repair system to be stable first |
| Kozacha shop UI | No spend path until Phase 2 |
| Tuning + Period-Correct styles | Proof-of-concept with 2 styles first |
| Newlywed + Collector buyers | 2 buyers sufficient to prove the matching system |
| Order Board | Depends on parts system; Phase 2 |
| Mahalla social | Requires playerbase; Phase 4 |
| Seasonal events | Live-ops; Phase 2 |
| Bazaar / P2P market | Requires stable flip loop first; Phase 3 |
| Garage tier 2+ ceremony | Players won't reach Tier 2 in Phase 1 testing window |
| Prestige loop | Months away from any player reaching it |
| Museum | Requires multiple players reaching Level 5; Phase 3 |
| NPC dialogue | Cozy layer; Phase 3 |
| Sealed-bid auctions | Complex infra; Phase 5 |
| Barn-find fragments | Not accumulating data until mechanic is designed (Phase 3) |
| `html2canvas` / Photo Mode | Non-critical Phase 3 feature |
| Crafting chain (Ustaxona) | Phase 2 prerequisite: Order Board must ship first |
| Clan community projects | Phase 4 |
| Hall of Fame | Phase 5 |