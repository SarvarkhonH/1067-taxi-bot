// 🏙 RAQAMLI EGIZAK — YAGONA KIRISH NUQTASI (Bosh Orkestrator-quvur).
//
// IMPORT-TARTIB QATTIQ: (1) _simDb — bazani izolyatsiyaga majburlaydi; (2) clock — Date-shim;
// keyin qolganlari. services/ va db faqat modullar ICHIDA dinamik import qilinadi.
//
// Yugurish:  cd packages/server && npx tsx src/sim/run.ts [--days 30] [--pop 5000] [--seed s1]
import "./_simDb";
import { DAY_MS, HOUR_MS, installSimClock, setSimNow, simNow, realNow } from "./clock";
import { mulberry32, rngBool, rngInt, seedFromString, type Rng } from "./rng";
import type { AgentState, SimConfig, SimEvent, TickMetrics, WorldState } from "./types";
import { BASELINE_CONFIG } from "./config/baseline";
import { buildWorldPopulation } from "./world/socialGraph";
import { advanceFunnel } from "./world/adoption";
import { allocateDailyRides, applySatisfaction, checkChurn } from "./world/market";
import { presentBiasDiscount, prospectValue, nearMissBoost } from "./world/psychology";
import {
  attachReferral, completeReferralFor, doRide, ensureMember, ensureTgUser, getOpenPrizes, openGame, tryBuyTicket,
} from "./actions/realBridge";
import { initBooks, updateBooks } from "./owner/ownerBooks";
import { ownerDailyRoutine } from "./owner/ownerAgent";
import { applyArm, armCatalogOf, isArmKey, type ArmCatalogPrize } from "./config/arms";
import { runFraudDay } from "./actions/fraud";
import { MetricsCollector, computeRunSummary, computeTickMetrics, metricsHash, timestampFixup } from "./metrics/collector";
import { provisionSim } from "./setup/provision";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── CLI ───────────────────────────────────────────────────────────────────────
function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let cfg: SimConfig = {
  ...BASELINE_CONFIG,
  days: Number(argOf("days") ?? BASELINE_CONFIG.days),
  population: Number(argOf("pop") ?? BASELINE_CONFIG.population),
  seed: argOf("seed") ?? BASELINE_CONFIG.seed,
  name: argOf("name") ?? BASELINE_CONFIG.name,
};

// Kalibrator xulq-parametrlarni fayldan beradi (params-merge AVVAL — arm undan keyin ustun).
const paramsPath = argOf("params");
if (paramsPath) {
  const raw = JSON.parse(readFileSync(paramsPath, "utf8")) as {
    behavior?: Partial<SimConfig["behavior"]>;
    dailyAwarenessInflow?: number;
    knobs?: Record<string, number>;
    flags?: Record<string, boolean>;
  };
  cfg.behavior = { ...cfg.behavior, ...(raw.behavior ?? {}) };
  if (raw.dailyAwarenessInflow != null) cfg.dailyAwarenessInflow = raw.dailyAwarenessInflow;
  if (raw.knobs) cfg.knobs = { ...cfg.knobs, ...raw.knobs };
  if (raw.flags) cfg.flags = { ...cfg.flags, ...raw.flags };
}

// L9 eksperiment-arm (A-H) — params-merge'dan KEYIN overlay (arms.ts WIRING ko'rsatmasi).
const armArg = argOf("arm");
let armCatalog: ArmCatalogPrize[] | undefined;
if (armArg) {
  if (!isArmKey(armArg)) throw new Error(`[run] noma'lum arm: "${armArg}" (A-H)`);
  cfg = applyArm(cfg, armArg);
  armCatalog = [...armCatalogOf(armArg)]; // provision shu katalogni o'qiydi (bo'sh = chipta yo'q)
}

const OUT_DIR = resolve(HERE, "../../../..", "sim-out");
const RUN_NAME = `${cfg.name}-${cfg.seed}`;

// ── O'yin-sessiya qarori (psixologiya + real holat) ───────────────────────────
// Agent REAL getOyinState JSON'iga qarab qaror qiladi — bu "hikoya emas, ehtimollik" qoidasi:
// chipta-qiymati prospect-nazariya bilan, uzoq tiraj present-bias bilan arziydi/arzimaydi.
async function gameSession(world: WorldState, a: AgentState, rng: Rng, events: SimEvent[]): Promise<void> {
  const b = world.cfg.behavior;
  const affinity = a.traits.rewardSensitivity * 0.6 + a.traits.riskTolerance * 0.4;
  if (!rngBool(rng, Math.min(0.95, b.pOpenGameBase * (0.4 + 1.6 * affinity)))) return;

  const state = await openGame(a);
  if (!state) return;
  a.lastGameOpenDay = world.day;
  world.todayCounters.gameOpens++;

  const ball = state.ball ?? 0;
  const prizes = await getOpenPrizes();
  if (prizes.length === 0) return;

  // Eng jozibali sovrin: prospect-qiymat × present-bias (tirajgacha kunlar) × near-miss
  let best: { key: string; score: number; price: number } | null = null;
  const drawDays = Math.max(1, Math.round(((state.season?.endIso ? Date.parse(state.season.endIso) : simNow() + 30 * DAY_MS) - simNow()) / DAY_MS));
  for (const p of prizes) {
    if (ball < p.price) continue; // real kod ham rad etadi — urinib ko'rish shart emas har safar
    const pWin = 1 / Math.max(2, p.limit);
    const value = prospectValue(p.valueSom, p.price * 20, pWin, 2.25)
      * presentBiasDiscount(drawDays)
      * (1 + nearMissBoost(p.limit > 0 ? p.sold / p.limit : 0));
    if (!best || value > best.score) best = { key: p.key, score: value, price: p.price };
  }
  if (!best || best.score <= 0) return;

  const pBuy = Math.min(0.9, world.cfg.behavior.pBuyTicketBase * (0.5 + a.traits.rewardSensitivity));
  if (!rngBool(rng, pBuy)) return;

  const res = await tryBuyTicket(a, best.key);
  if (res.ok) {
    a.ticketsBought++;
    world.todayCounters.ticketsSold++;
    applySatisfaction(a, +3);
  } else {
    // Rad-sabab agent his qiladi: tushunmovchilik → confusion, ball yetmasa — intiladi
    if (res.reason === "no_ride" || res.reason === "final_lock") {
      a.confusionEvents++;
      world.todayCounters.confusionEvents++;
      applySatisfaction(a, -8 * (1 - a.traits.patience));
    }
  }
}

// ── Taklif-tarqatish (do'stlik-graf orqali) ───────────────────────────────────
async function inviteFlow(world: WorldState, a: AgentState, rng: Rng): Promise<void> {
  const b = world.cfg.behavior;
  if (a.stage !== "rode" && a.stage !== "habitual") return;
  if (!rngBool(rng, b.pInviteBase * (0.3 + 1.7 * a.traits.inviteProclivity))) return;
  const candidates = a.friends
    .map((id) => world.agents[id]!)
    .filter((f) => f.stage === "unaware" || f.stage === "aware");
  if (candidates.length === 0) return;
  const target = candidates[rngInt(rng, 0, candidates.length - 1)]!;
  // Taklif = kuchli prompt: awareness + keyin real attachReferral (installed bo'lganda)
  if (target.stage === "unaware") {
    target.stage = "aware";
    target.awareDay = world.day;
    world.todayCounters.newAware++;
  }
  target.invitedByAgentId = a.id;
}

// ── Bosh sikl ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const t0 = Date.parse(cfg.t0Iso);
  installSimClock(t0);

  console.log(`\n🏙 RAQAMLI EGIZAK — run "${RUN_NAME}" · ${cfg.population} aholi · ${cfg.days} kun`);
  // ⚠️ Real servis-kod ichida Math.random bor (cashback-tier roll) — determinizm uchun
  // global Math.random ham seeded-oqimga almashtiriladi (faqat shu sim-jarayonda).
  const realRandomStream = mulberry32(seedFromString(cfg.seed + ":real"));
  Math.random = realRandomStream;

  const dbUrl = process.env.SIM_DATABASE_URL!;
  // provisionSim O'ZI reset+seed qiladi — bu yerda QAYTA reset chaqirilmaydi
  // (avvalgi xato: ikkinchi reset endigina urug'langan flag/mavsum/katalogni o'chirib yuborardi).
  // armCatalog: arm berilgan bo'lsa uning preseti (bo'sh massiv = katalog bo'sh) — aks holda default.
  await provisionSim(cfg, dbUrl, armCatalog);

  // L9 pre-registered mezon artefakti: arm yugurishidan OLDIN yozib qo'yiladi (halollik-isbot)
  if (armArg && isArmKey(armArg)) {
    const { ARMS } = await import("./config/arms");
    const arm = ARMS[armArg];
    const preDir = resolve(OUT_DIR, RUN_NAME);
    mkdirSync(preDir, { recursive: true });
    writeFileSync(
      resolve(preDir, "pre-registered.json"),
      JSON.stringify({ arm: arm.key, title: arm.title, ...arm.preRegistered }, null, 2),
    );
  }

  const rng = mulberry32(seedFromString(cfg.seed));
  const { agents, mahallas } = buildWorldPopulation(cfg, rng);
  const world: WorldState = {
    cfg, day: 0, agents, mahallas,
    nextBookingId: 9_000_000, // jonli id-lar bilan to'qnashmasin (alohida bazada baribir)
    owner: initBooks(),
    todayCounters: null as unknown as WorldState["todayCounters"],
  };
  const collector = new MetricsCollector(RUN_NAME, cfg.seed, OUT_DIR);

  for (let day = 0; day < cfg.days; day++) {
    const tickStart = realNow();
    world.day = day;
    world.todayCounters = {
      ridesBirjoy: 0, rides1415: 0, rides1313: 0, newAware: 0, newInstalled: 0, newLinked: 0,
      firstRides: 0, referralsAttached: 0, ticketsSold: 0, gameOpens: 0, churnedToday: 0,
      confusionEvents: 0, fraudAttempts: 0, fraudBlocked: 0,
    };
    const events: SimEvent[] = [];
    const dayStartMs = t0 + day * DAY_MS;
    setSimNow(dayStartMs + 6 * HOUR_MS); // 06:00

    // 1) Funnel-siljish (aware/installed/linked) — sof qarorlar
    const funnel = advanceFunnel(world, rng);
    // Yangi o'rnatganlar/ulanganlar — REAL yozuvlar (07:00-10:00 oralig'ida)
    setSimNow(dayStartMs + 8 * HOUR_MS);
    for (const a of funnel.newLinked) {
      // ⚠️ TARTIB MUHIM (real kod talabi): attachPendingReferral faqat HALI ULANMAGAN
      // userga ishlaydi — shuning uchun avval tg-user + attach, KEYIN a'zo-yaratish, oxirida complete.
      const inviter = a.invitedByAgentId != null ? world.agents[a.invitedByAgentId]! : null;
      if (inviter?.memberId != null) {
        await ensureTgUser(a, world);
        await attachReferral(inviter, a);
      }
      await ensureMember(a, world);
      if (inviter?.memberId != null) {
        const credited = await completeReferralFor(a);
        if (credited) world.todayCounters.referralsAttached++;
      }
      world.todayCounters.newLinked++;
    }
    // Har o'rnatgan agent REAL bot-user qatorini oladi (link-rate = linked/installed haqiqiy bo'lsin)
    for (const a of funnel.newInstalled) await ensureTgUser(a, world);
    world.todayCounters.newInstalled += funnel.newInstalled.length;

    // 2) Bozor: bugungi safarlar (07:00-21:00 bo'ylab taqsimlab)
    const market = allocateDailyRides(world, rng);
    world.todayCounters.rides1415 = market.rides1415;
    world.todayCounters.rides1313 = market.rides1313;
    let rideIdx = 0;
    for (const rider of market.birjoyRiders) {
      // 09:00-19:00 oralig'i (sub-faza tartibi qat'iy: keyingi fazalar 20:00dan boshlanadi)
      setSimNow(dayStartMs + 9 * HOUR_MS + Math.floor((10 * HOUR_MS * rideIdx) / Math.max(1, market.birjoyRiders.length)));
      rideIdx++;
      const cashback = await doRide(rider, world);
      world.todayCounters.ridesBirjoy++;
      if (rider.firstRideDay == null) {
        rider.firstRideDay = world.day;
        rider.stage = "rode";
        world.todayCounters.firstRides++;
      }
      rider.ridesTotal++;
      rider.lastRideDay = world.day;
      if (rider.ridesTotal >= 4) rider.stage = "habitual";
      applySatisfaction(rider, +2 + (cashback > 0 ? 1 : 0));
    }

    // 3) Kechki o'yin-sessiya (20:00) + taklif-tarqatish (21:00)
    setSimNow(dayStartMs + 20 * HOUR_MS);
    for (const a of world.agents) {
      if (a.memberId == null || a.stage === "churned") continue;
      await gameSession(world, a, rng, events);
    }
    setSimNow(dayStartMs + 21 * HOUR_MS);
    for (const a of world.agents) {
      if (a.stage === "churned") continue;
      await inviteFlow(world, a, rng);
    }

    // 3b) Firibgar-aholi (21:30): FAQAT enableFraud=true bo'lsa (default OFF — L7 alohida red-team
    // pass; baseline/kalibratsiya taqsimoti fraudsiz, aks holda RNG-oqim va determinizm siljiydi).
    if (cfg.enableFraud) {
      setSimNow(dayStartMs + 21 * HOUR_MS + 30 * 60_000);
      const fraud = await runFraudDay(world, rng);
      for (const f of fraud) {
        world.todayCounters.fraudAttempts++;
        if (f.blocked) world.todayCounters.fraudBlocked++;
        else events.push({ day: world.day, type: "fraud_through", detail: `${f.kind} o'tib ketdi (guard: ${f.guard})` });
      }
    }

    // 4) Ega-agent (22:00): tiraj-ritual, restock
    setSimNow(dayStartMs + 22 * HOUR_MS);
    const ownerEvents = await ownerDailyRoutine(world, rng);
    events.push(...ownerEvents);

    // 5) Churn + kayfiyat (22:45)
    setSimNow(dayStartMs + 22 * HOUR_MS + 45 * 60_000);
    for (const a of world.agents) checkChurn(a, rng, world);

    // 6) Daftar + metrikalar + timestamp-fixup (23:00)
    setSimNow(dayStartMs + 23 * HOUR_MS);
    await updateBooks(world);
    const m: TickMetrics = computeTickMetrics(world, realNow() - tickStart);
    collector.writeTick(m);
    for (const e of events) collector.writeEvent(e);
    await timestampFixup(cfg.sentinelIso, new Date(dayStartMs + 23 * HOUR_MS).toISOString());

    if (day % 5 === 0 || day === cfg.days - 1) {
      console.log(
        `  kun ${String(day).padStart(3)} · safar ${m.rides.birjoy} · ulush ${m.rides.sharePct.toFixed(2)}% · ` +
        `linked ${m.pop.linked} · rode ${m.pop.rode} · chipta ${m.oyin.ticketsSold} · kassa ${Math.round(m.money.ownerCash / 1000)}k · ${m.slo.tickMs}ms`,
      );
    }
  }

  const summary = await computeRunSummary(world);
  collector.writeSummary?.(summary);
  const hash = metricsHash(resolve(OUT_DIR, RUN_NAME));
  console.log(`\n✅ Run tugadi: ${RUN_NAME}`);
  console.log(`   Oylik safar: ${summary.monthlyRides} (nishon 642±20%) · rider: ${summary.monthlyRiders} (127±20%)`);
  console.log(`   Link-rate: ${summary.linkRatePct.toFixed(1)}% · linked→1-safar: ${summary.linkedToFirstPct.toFixed(1)}% · 1→2: ${summary.firstToSecondPct.toFixed(1)}%`);
  console.log(`   D7: ${summary.d7Retention.toFixed(1)}% · D30: ${summary.d30Retention.toFixed(1)}% · growth×: ${summary.growthX.toFixed(2)}`);
  console.log(`   Kassa: ${summary.ownerCashEnd.toLocaleString()} so'm · solvency: ${summary.solvencyEnd}`);
  console.log(`   metrics-hash: ${hash}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("🔴 sim yiqildi:", e);
  process.exit(1);
});
