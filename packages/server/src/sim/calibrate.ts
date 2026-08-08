// 🎚 L2 — KALIBRATSIYA-HALQA: sim real Kosonning N-nishonlarini (BASELINE.md) qayta chiqara
// olmaguncha xulq-parametrlarni iterativ buraydi. Har iteratsiya jurnalga yoziladi (qaysi
// parametr, nega, qancha). Qabul: ≥8/10 nishon tolerans ichida → calibrated-params.json muhrlanadi.
//
// Yugurish:  cd packages/server && npx tsx src/sim/calibrate.ts [--iters 8] [--pop 5000] [--days 60]
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_CONFIG } from "./config/baseline";
import type { BehaviorParams, RunSummary } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, "../..");
const OUT = resolve(HERE, "../../../..", "sim-out");
const CAL_DIR = resolve(OUT, "_calibration");
mkdirSync(CAL_DIR, { recursive: true });

function argOf(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}
const ITERS = argOf("iters", 8);
const POP = argOf("pop", 5000);
const DAYS = argOf("days", 60);

// ── Nishonlar (BASELINE.md N1..N10) ──────────────────────────────────────────
interface Target {
  id: string;
  label: string;
  target: number;
  tol: number; // mutlaq-tolerans (pp yoki nisbiy so'mda emas — birlik nishonga mos)
  get: (s: RunSummary) => number;
}
const TARGETS: Target[] = [
  { id: "N1", label: "oylik safar", target: 642, tol: 642 * 0.2, get: (s) => s.monthlyRides },
  { id: "N2", label: "oylik rider", target: 127, tol: 127 * 0.2, get: (s) => s.monthlyRiders },
  { id: "N3", label: "link-rate %", target: 72.5, tol: 10, get: (s) => s.linkRatePct },
  { id: "N4", label: "ulangan→1-safar %", target: 19.4, tol: 5, get: (s) => s.linkedToFirstPct },
  { id: "N5", label: "1→2-safar %", target: 58.4, tol: 8, get: (s) => s.firstToSecondPct },
  { id: "N6", label: "D7 %", target: 54.4, tol: 10, get: (s) => s.d7Retention },
  { id: "N7", label: "D30 %", target: 76.5, tol: 10, get: (s) => s.d30Retention },
  { id: "N8", label: "oy→oy retention %", target: 60.0, tol: 12, get: (s) => s.m2mRetentionPct },
  { id: "N9", label: "≥10-safar dumi %", target: 14.5, tol: 6, get: (s) => s.share10Pct },
  // N10 (o'yin nol-start): chipta juda kam bo'lishi KERAK — 0..25 oralig'i o'tdi hisoblanadi
  { id: "N10", label: "o'yin nol-start (chipta)", target: 0, tol: 25, get: (s) => s.ticketsTotal },
];

interface Params {
  behavior: BehaviorParams;
  dailyAwarenessInflow: number;
}

// ── Sozlash-qoidalari: har nishon-xato qaysi parametrni qaysi tomonga buraydi ──
function adjust(p: Params, s: RunSummary, log: (msg: string) => void): Params {
  const b = { ...p.behavior };
  let inflow = p.dailyAwarenessInflow;
  const ratio = (actual: number, target: number): number =>
    target > 0 ? Math.max(0.5, Math.min(2, actual / target)) : 1;

  // N3 link-rate: baland bo'lsa linkGate ko'tariladi (ko'proq "hech ulamaydiganlar")
  const n3 = s.linkRatePct - 72.5;
  if (Math.abs(n3) > 4) {
    const step = Math.sign(n3) * Math.min(0.05, Math.abs(n3) * 0.004);
    b.linkGate = clamp(b.linkGate + step, 0.05, 0.7);
    log(`N3 ${s.linkRatePct.toFixed(1)}% → linkGate ${p.behavior.linkGate.toFixed(3)}→${b.linkGate.toFixed(3)}`);
  }
  // N4 ulangan→1-safar: baland bo'lsa firstRideGate ko'tariladi
  const n4 = s.linkedToFirstPct - 19.4;
  if (Math.abs(n4) > 2.5) {
    const step = Math.sign(n4) * Math.min(0.06, Math.abs(n4) * 0.006);
    b.firstRideGate = clamp(b.firstRideGate + step, 0.2, 0.85);
    log(`N4 ${s.linkedToFirstPct.toFixed(1)}% → firstRideGate ${p.behavior.firstRideGate.toFixed(3)}→${b.firstRideGate.toFixed(3)}`);
  }
  // N5 1→2 va N6 D7: baland bo'lsa habitBoost pasayadi (birinchi haftadagi qayta-safar bosimi)
  const n5r = ratio(s.firstToSecondPct, 58.4);
  const n6r = ratio(s.d7Retention, 54.4);
  const habitFactor = Math.sqrt((1 / n5r) * (1 / n6r));
  if (Math.abs(habitFactor - 1) > 0.05) {
    b.habitBoost = clamp(b.habitBoost * clamp(habitFactor, 0.7, 1.4), 0.3, 6);
    log(`N5=${s.firstToSecondPct.toFixed(1)}%/N6=${s.d7Retention.toFixed(1)}% → habitBoost ${p.behavior.habitBoost.toFixed(2)}→${b.habitBoost.toFixed(2)}`);
  }
  // N1 oylik safar: umumiy hajm — ridesPerWeekBase va inflow birga
  const n1r = ratio(s.monthlyRides, 642);
  if (Math.abs(n1r - 1) > 0.12) {
    const f = clamp(Math.pow(1 / n1r, 0.6), 0.75, 1.35);
    b.ridesPerWeekBase = clamp(b.ridesPerWeekBase * f, 0.4, 6);
    inflow = clamp(Math.round(inflow * clamp(Math.pow(1 / n1r, 0.4), 0.8, 1.25)), 5, 200);
    log(`N1 ${s.monthlyRides} → ridesPerWeekBase ${p.behavior.ridesPerWeekBase.toFixed(2)}→${b.ridesPerWeekBase.toFixed(2)} · inflow ${p.dailyAwarenessInflow}→${inflow}`);
  }
  // N2 oylik rider: kam bo'lsa inflow/firstRideGate orqali riderlar soni oshiriladi
  const n2r = ratio(s.monthlyRiders, 127);
  if (n2r < 0.85) {
    b.firstRideGate = clamp(b.firstRideGate - 0.02, 0.2, 0.85);
    inflow = clamp(Math.round(inflow * 1.1), 5, 200);
    log(`N2 ${s.monthlyRiders} past → firstRideGate −0.02, inflow ${inflow}`);
  }
  // N7/N8 (D30, oy→oy): past bo'lsa churn pasayadi, baland bo'lsa oshadi
  const n7 = s.d30Retention - 76.5;
  if (s.d30Retention > 0 && Math.abs(n7) > 6) {
    const f = n7 > 0 ? 1.3 : 0.75;
    b.pChurnBase = clamp(b.pChurnBase * f, 0.001, 0.05);
    log(`N7 ${s.d30Retention.toFixed(1)}% → pChurnBase ${p.behavior.pChurnBase.toFixed(4)}→${b.pChurnBase.toFixed(4)}`);
  }
  return { behavior: b, dailyAwarenessInflow: inflow };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// ── Halqa ─────────────────────────────────────────────────────────────────────
function runSim(iter: number, params: Params): RunSummary {
  const pFile = resolve(CAL_DIR, `params-${iter}.json`);
  writeFileSync(pFile, JSON.stringify(params, null, 2));
  const name = "calib";
  const seed = `cal-${iter}`;
  execSync(
    `npx tsx src/sim/run.ts --days ${DAYS} --pop ${POP} --seed ${seed} --name ${name} --params "${pFile}"`,
    { cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  const summary = JSON.parse(
    readFileSync(resolve(OUT, `${name}-${seed}`, "summary.json"), "utf8"),
  ) as RunSummary;
  return summary;
}

function scorecard(s: RunSummary): { passed: number; rows: string[] } {
  let passed = 0;
  const rows: string[] = [];
  for (const t of TARGETS) {
    const v = t.get(s);
    const ok = Math.abs(v - t.target) <= t.tol;
    if (ok) passed++;
    rows.push(
      `  ${ok ? "✅" : "❌"} ${t.id} ${t.label}: ${v.toFixed(1)} (nishon ${t.target}±${t.tol.toFixed(1)})`,
    );
  }
  return { passed, rows };
}

function main(): void {
  const journal = resolve(CAL_DIR, "calibration-journal.md");
  appendFileSync(journal, `\n\n# Kalibratsiya ${new Date().toISOString()} (pop=${POP}, days=${DAYS})\n`);
  let params: Params = {
    behavior: { ...BASELINE_CONFIG.behavior },
    dailyAwarenessInflow: BASELINE_CONFIG.dailyAwarenessInflow,
  };
  let best: { passed: number; iter: number; params: Params } | null = null;

  for (let i = 1; i <= ITERS; i++) {
    console.log(`\n═══ Iteratsiya ${i}/${ITERS} (pop=${POP}, days=${DAYS}) ═══`);
    const t0 = Date.now();
    const s = runSim(i, params);
    const { passed, rows } = scorecard(s);
    console.log(rows.join("\n"));
    console.log(`  → ${passed}/10 nishon · ${(Math.round((Date.now() - t0) / 1000))}s`);
    appendFileSync(journal, `\n## Iter ${i} — ${passed}/10\n${rows.join("\n")}\n`);

    if (!best || passed > best.passed) best = { passed, iter: i, params };
    if (passed >= 8) {
      writeFileSync(resolve(CAL_DIR, "calibrated-params.json"), JSON.stringify(params, null, 2));
      appendFileSync(journal, `\n**QABUL: iter ${i} da ${passed}/10 — calibrated-params.json muhrlandi.**\n`);
      console.log(`\n🎯 KALIBRATSIYA O'TDI (${passed}/10) — calibrated-params.json muhrlandi.`);
      return;
    }
    const changes: string[] = [];
    params = adjust(params, s, (m) => changes.push(m));
    appendFileSync(journal, changes.length ? `Sozlash: ${changes.join(" · ")}\n` : "Sozlash: yo'q (nozik farqlar)\n");
  }

  if (best) {
    writeFileSync(resolve(CAL_DIR, "best-params.json"), JSON.stringify(best.params, null, 2));
    appendFileSync(journal, `\n**Yakun: eng yaxshi iter ${best.iter} (${best.passed}/10) — best-params.json. Darvoza O'TILMADI.**\n`);
    console.log(`\n⚠️ ${ITERS} iteratsiyada darvoza o'tilmadi. Eng yaxshi: ${best.passed}/10 (iter ${best.iter}).`);
    process.exitCode = 1;
  }
}

main();
