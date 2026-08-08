// 🎲 KO'P-SEED TAQSIMOT-DVIGATELI (L8, Pog'ona-1): bir konfiguratsiyani N ta stoxastik olamda
// yugurtirib, natijani BITTA kelajak emas — EHTIMOLLIK TAQSIMOTI sifatida beradi
// (master-reja 4-qoida). Runlar KETMA-KET (bitta Docker-DB, har run to'liq reset).
//
// Yugurish:  npx tsx src/sim/runMany.ts [--n 100] [--days 60] [--pop 5000] [--params <file>]
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunSummary } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, "../..");
const OUT = resolve(HERE, "../../../..", "sim-out");
const DIST_DIR = resolve(OUT, "_distribution");
mkdirSync(DIST_DIR, { recursive: true });

function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const N = Number(argOf("n") ?? 100);
const DAYS = Number(argOf("days") ?? 60);
const POP = Number(argOf("pop") ?? 5000);
const PARAMS = argOf("params") ?? resolve(OUT, "_calibration", "calibrated-params.json");

if (!existsSync(PARAMS)) {
  throw new Error(`[runMany] params topilmadi: ${PARAMS} — avval calibrate.ts yugurtiring.`);
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i]!;
}

function main(): void {
  const summaries: RunSummary[] = [];
  const t0 = Date.now();
  for (let i = 1; i <= N; i++) {
    const seed = `dist-${String(i).padStart(3, "0")}`;
    const iterStart = Date.now();
    // RESUME: bu seed avval tugagan bo'lsa qayta yugurtirmaymiz (determinizm — natija baribir
    // aynan bir xil bo'lardi; uzilib qolgan flotni davom ettirish uchun).
    const existing = resolve(OUT, `dist-${seed}`, "summary.json");
    if (existsSync(existing)) {
      summaries.push(JSON.parse(readFileSync(existing, "utf8")) as RunSummary);
      console.log(`  ${i}/${N} · ${seed} · (avvaldan tayyor — o'tkazib yuborildi)`);
      continue;
    }
    execSync(
      `npx tsx src/sim/run.ts --days ${DAYS} --pop ${POP} --seed ${seed} --name dist --params "${PARAMS}"`,
      { cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    const s = JSON.parse(
      readFileSync(resolve(OUT, `dist-${seed}`, "summary.json"), "utf8"),
    ) as RunSummary;
    summaries.push(s);
    const el = Math.round((Date.now() - iterStart) / 1000);
    const eta = Math.round(((Date.now() - t0) / i) * (N - i) / 60000);
    console.log(
      `  ${i}/${N} · ${seed} · oylik ${s.monthlyRides} safar/${s.monthlyRiders} rider · growth ${s.growthX.toFixed(2)}× · ${s.solvencyEnd} · ${el}s (ETA ~${eta} daq)`,
    );
    if (i % 10 === 0 || i === N) {
      writeFileSync(resolve(DIST_DIR, "summaries.json"), JSON.stringify(summaries, null, 1));
    }
  }

  // ── Taqsimot-hisobot ───────────────────────────────────────────────────────
  const growth = summaries.map((s) => s.growthX).sort((a, b) => a - b);
  const rides = summaries.map((s) => s.monthlyRides).sort((a, b) => a - b);
  const riders = summaries.map((s) => s.monthlyRiders).sort((a, b) => a - b);
  const cash = summaries.map((s) => s.ownerCashEnd).sort((a, b) => a - b);
  const bucket = (lo: number, hi: number): number =>
    Math.round((growth.filter((g) => g >= lo && g < hi).length / growth.length) * 100);
  const solvCount: Record<string, number> = {};
  for (const s of summaries) solvCount[s.solvencyEnd] = (solvCount[s.solvencyEnd] ?? 0) + 1;
  const bankrupts = summaries.filter((s) => s.bankruptDay !== null).length;

  const report = {
    n: N, days: DAYS, pop: POP, params: PARAMS,
    growthX: {
      p5: pct(growth, 5), p25: pct(growth, 25), median: pct(growth, 50),
      p75: pct(growth, 75), p95: pct(growth, 95),
      buckets: {
        "o'lik <0.5×": bucket(0, 0.5),
        "past 0.5-0.8×": bucket(0.5, 0.8),
        "baseline 0.8-1.2×": bucket(0.8, 1.2),
        "o'sish 1.2-2×": bucket(1.2, 2),
        "kuchli 2×+": bucket(2, 99),
      },
    },
    monthlyRides: { p5: pct(rides, 5), median: pct(rides, 50), p95: pct(rides, 95) },
    monthlyRiders: { p5: pct(riders, 5), median: pct(riders, 50), p95: pct(riders, 95) },
    ownerCash: { p5: pct(cash, 5), median: pct(cash, 50), p95: pct(cash, 95) },
    solvency: solvCount,
    bankruptcies: bankrupts,
  };
  writeFileSync(resolve(DIST_DIR, "dist-report.json"), JSON.stringify(report, null, 2));

  console.log(`\n📈 TAQSIMOT (${N} olam, ${DAYS} kun, pop ${POP}):`);
  console.log(`   growth×: p5=${report.growthX.p5.toFixed(2)} · median=${report.growthX.median.toFixed(2)} · p95=${report.growthX.p95.toFixed(2)}`);
  console.log(`   bucketlar: ${JSON.stringify(report.growthX.buckets)}`);
  console.log(`   oylik safar: ${report.monthlyRides.p5}..${report.monthlyRides.median}..${report.monthlyRides.p95}`);
  console.log(`   solvency: ${JSON.stringify(solvCount)} · bankrotlik: ${bankrupts}/${N}`);
  console.log(`   → sim-out/_distribution/dist-report.json`);
}

main();
