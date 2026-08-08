// 🔮 P2 — MUHRLANGAN BASHORAT (L11 backtest-protokol, master-reja "loyihaning yuragi").
//
// Maqsad: kalibratsiyalangan egizak kelgusi <days> kun uchun BASHORATNI OLDINDAN yozib
// MUHRLAB qo'yadi (fayl sha256'i alohida .seal faylda — keyin o'zgartirilsa bilinadi).
// Real natija kelgach `verifyPrediction` xato-hisobot chiqaradi: har metrika bo'yicha
// bashorat-oraliq (p5..p95) vs real, ichida/tashqarida, foiz-xato → <...>-verdict.md.
// Model "men aniqman" demaydi — "shu ma'lumot bilan shunday bashorat qildim" deydi (L11).
//
// ⚠️ P1-SODDALIK (ONGLI QAROR, ochiq yozildi): bashorat REAL-KOSON JORIY HOLATIDAN
// (975 safar, 166 rider, mavjud kohortalar) boshlanMAYdi — kalibratsiyalangan BASELINE'dan
// (yangi sintetik olam) boshlanadi. Birinchi WARMUP_DAYS kun = olam kalibratsiyalangan
// barqaror-holatga chiqishi (kalibratsiya ham xuddi shu shaklda yugurgan: 60 kun, oxirgi
// 30-kun oynasi o'lchanadi). Ya'ni bashorat = "kalibratsiyalangan egizakning barqaror OYI",
// real kelgusi oy bilan "katta o'zgarish bo'lmaydi" farazi ostida solishtiriladi.
// Real joriy-holatdan warm-start — P3 ishi; bu soddalik verdict-tahlilda hisobga olinadi.
//
// Yugurish (⛔ Docker-DB band bo'lsa YUGURTIRILMAYDI — Bosh Direktor ruxsati bilan):
//   Muhrlash: npx tsx src/sim/predict.ts --from 2026-08-08 --days 30 --n 30 [--params <file>] [--pop 5000]
//   Tekshirish (real natija kelgach):
//     npx tsx src/sim/predict.ts --verify sim-out/_predictions/2026-08-08-30d.json --real <real.json>
//     <real.json> shakli: { "monthlyRides": 640, "monthlyRiders": 130 } (growthX ixtiyoriy — o'zi hisoblaydi)
//
// Bu fayl SIM EMAS — orkestrator (runMany.ts uslubi): sealedAt uchun REAL devor-soat
// (Date.now/new Date) MUMKIN. Runlar KETMA-KET execSync (bitta Docker-DB). run.ts'ga tegilmagan.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunSummary } from "./types";
import { metricsHash } from "./metrics/collector";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, "../..");
const OUT = resolve(HERE, "../../../..", "sim-out");
const PRED_DIR = resolve(OUT, "_predictions");

/** Barqaror-holatga chiqish davri (kalibratsiya days=60 · oxirgi-30-kun oynasi bilan mos shakl). */
const WARMUP_DAYS = 30;
/** BASELINE.md N1 (iyul 2026) — growthX maxraji (collector.ts bilan bir xil qiymat). */
const BASELINE_MONTHLY_RIDES = 642;

// ── Lokal tiplar (types.ts ga tegilmaydi — qoida #4) ─────────────────────────
export interface PredictionQuantiles {
  p5: number; p25: number; p50: number; p75: number; p95: number;
}

/** growthX-bucket chegaralari — muhrlash va verdict BIR manbadan o'qiydi (drift bo'lmasin). */
export const GROWTH_BUCKETS: ReadonlyArray<{ label: string; lo: number; hi: number }> = [
  { label: "o'lik <0.5×", lo: 0, hi: 0.5 },
  { label: "past 0.5-0.8×", lo: 0.5, hi: 0.8 },
  { label: "baseline 0.8-1.2×", lo: 0.8, hi: 1.2 },
  { label: "o'sish 1.2-2×", lo: 1.2, hi: 2 },
  { label: "kuchli 2×+", lo: 2, hi: Infinity },
];

export interface SealedPrediction {
  /** REAL devor-soat (bu fayl sim emas) — bashorat QACHON muhrlangani. */
  sealedAt: string;
  from: string; // bashorat-gorizont boshlanish sanasi (YYYY-MM-DD)
  horizonDays: number;
  n: number; // nechta seed-olam
  pop: number;
  simDays: number; // warmup + horizon
  warmupDays: number;
  paramsFile: string;
  paramsHash: string; // params-fayl baytlarining sha256 (hex)
  baselineNote: string; // P1-soddalik ochiq yozuvi
  taqsimot: {
    monthlyRides: PredictionQuantiles;
    monthlyRiders: PredictionQuantiles;
    growthX: PredictionQuantiles & { buckets: Record<string, number> }; // label → foiz
  };
  /** Har seed-run metrics.jsonl determinizm-hash'i — bashorat qaysi runlarga tayanganini isbotlaydi. */
  metricsFileHashes: Array<{ seed: string; sha256: string }>;
  /** Xato-tahlil uchun xom yakunlar (kichik — n ta qator). */
  runs: Array<{ seed: string; monthlyRides: number; monthlyRiders: number; growthX: number; solvencyEnd: string }>;
}

/** Real natija fayli shakli (verify uchun). growthX berilmasa 642-maxrajdan hisoblanadi. */
export interface RealOutcome {
  monthlyRides: number;
  monthlyRiders: number;
  growthX?: number;
}

// ── Yordamchilar ─────────────────────────────────────────────────────────────
function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i]!;
}

function quantiles(values: number[]): PredictionQuantiles {
  const s = [...values].sort((a, b) => a - b);
  return { p5: pct(s, 5), p25: pct(s, 25), p50: pct(s, 50), p75: pct(s, 75), p95: pct(s, 95) };
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function bucketOf(growthX: number): string {
  for (const b of GROWTH_BUCKETS) if (growthX >= b.lo && growthX < b.hi) return b.label;
  return GROWTH_BUCKETS[GROWTH_BUCKETS.length - 1]!.label;
}

// ── Muhrlash (bashorat-yaratish) ─────────────────────────────────────────────
function sealPrediction(): void {
  // --from berilmasa REAL bugungi sana (bu orkestrator — sim-vaqt emas).
  const from = argOf("from") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error(`[predict] --from YYYY-MM-DD shaklida bo'lishi kerak (berilgan: "${from}")`);
  }
  const horizonDays = Number(argOf("days") ?? 30);
  const n = Number(argOf("n") ?? 30);
  const pop = Number(argOf("pop") ?? 5000);
  const paramsFile = resolve(argOf("params") ?? resolve(OUT, "_calibration", "calibrated-params.json"));
  if (!existsSync(paramsFile)) {
    throw new Error(`[predict] params topilmadi: ${paramsFile} — avval calibrate.ts darvozadan o'tsin.`);
  }
  if (horizonDays > 30) {
    // RunSummary.monthlyRides = OXIRGI 30 kun oynasi — uzunroq gorizontda faqat dumini o'lchaydi.
    console.warn(`[predict] ⚠️ horizon ${horizonDays} > 30: taqsimot faqat gorizontning OXIRGI 30 kunini qamraydi.`);
  }
  mkdirSync(PRED_DIR, { recursive: true });

  const paramsHash = sha256OfFile(paramsFile);
  const tag = paramsHash.slice(0, 8); // seed'ga bog'lanadi: boshqa params = boshqa run-to'plam (resume xavfsiz)
  const simDays = WARMUP_DAYS + horizonDays;

  console.log(`\n🔮 MUHRLANGAN BASHORAT: from=${from} · +${horizonDays} kun · ${n} olam · pop=${pop} · params=${tag}…`);
  const summaries: Array<{ seed: string; s: RunSummary; hash: string }> = [];
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    const seed = `pred-${from}-${tag}-${String(i).padStart(3, "0")}`;
    const runDir = resolve(OUT, `pred-${seed}`);
    const summaryPath = resolve(runDir, "summary.json");
    const iterStart = Date.now();
    // RESUME (runMany uslubi): seed+params determinizmi tufayli tayyor run qayta yugurtirilmaydi.
    if (!existsSync(summaryPath)) {
      execSync(
        `npx tsx src/sim/run.ts --days ${simDays} --pop ${pop} --seed ${seed} --name pred --params "${paramsFile}"`,
        { cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
      );
    }
    const s = JSON.parse(readFileSync(summaryPath, "utf8")) as RunSummary;
    const hash = metricsHash(runDir);
    summaries.push({ seed, s, hash });
    const el = Math.round((Date.now() - iterStart) / 1000);
    const eta = Math.round((((Date.now() - t0) / i) * (n - i)) / 60000);
    console.log(
      `  ${i}/${n} · ${seed} · oylik ${s.monthlyRides} safar/${s.monthlyRiders} rider · growth ${s.growthX.toFixed(2)}× · ${el}s (ETA ~${eta} daq)`,
    );
  }

  // ── Taqsimot ───────────────────────────────────────────────────────────────
  const growth = summaries.map((x) => x.s.growthX);
  const buckets: Record<string, number> = {};
  for (const b of GROWTH_BUCKETS) {
    buckets[b.label] = Math.round(
      (growth.filter((g) => g >= b.lo && g < b.hi).length / Math.max(1, growth.length)) * 100,
    );
  }

  const prediction: SealedPrediction = {
    sealedAt: new Date().toISOString(), // REAL vaqt — muhr-tamg'a
    from,
    horizonDays,
    n,
    pop,
    simDays,
    warmupDays: WARMUP_DAYS,
    paramsFile,
    paramsHash,
    baselineNote:
      "P1-soddalik: bashorat real-Koson joriy holatidan EMAS, kalibratsiyalangan baseline'dan " +
      `(yangi sintetik olam, ${WARMUP_DAYS} kun warmup) boshlanadi. Bashorat = egizakning barqaror OYI, ` +
      "'katta o'zgarish yo'q' farazi ostida real kelgusi oy bilan solishtiriladi.",
    taqsimot: {
      monthlyRides: quantiles(summaries.map((x) => x.s.monthlyRides)),
      monthlyRiders: quantiles(summaries.map((x) => x.s.monthlyRiders)),
      growthX: { ...quantiles(growth), buckets },
    },
    metricsFileHashes: summaries.map((x) => ({ seed: x.seed, sha256: x.hash })),
    runs: summaries.map((x) => ({
      seed: x.seed,
      monthlyRides: x.s.monthlyRides,
      monthlyRiders: x.s.monthlyRiders,
      growthX: x.s.growthX,
      solvencyEnd: x.s.solvencyEnd,
    })),
  };

  // ── Yozish + MUHR ─────────────────────────────────────────────────────────
  const predPath = resolve(PRED_DIR, `${from}-${horizonDays}d.json`);
  writeFileSync(predPath, JSON.stringify(prediction, null, 2) + "\n");
  // Faylning O'Z sha256'i alohida .seal faylga (sha256sum-mos format) — o'zgartirilsa bilinadi.
  const seal = sha256OfFile(predPath);
  const sealPath = resolve(PRED_DIR, `${from}-${horizonDays}d.seal`);
  writeFileSync(sealPath, `${seal}  ${basename(predPath)}\n`);

  const q = prediction.taqsimot;
  console.log(`\n🔏 BASHORAT MUHRLANDI: ${predPath}`);
  console.log(`   seal(sha256): ${seal} → ${sealPath}`);
  console.log(`   oylik safar: p5=${q.monthlyRides.p5} · median=${q.monthlyRides.p50} · p95=${q.monthlyRides.p95}`);
  console.log(`   oylik rider: p5=${q.monthlyRiders.p5} · median=${q.monthlyRiders.p50} · p95=${q.monthlyRiders.p95}`);
  console.log(`   growth×: median=${q.growthX.p50.toFixed(2)} · bucketlar: ${JSON.stringify(buckets)}`);
  console.log(`   Real natija kelgach: npx tsx src/sim/predict.ts --verify "${predPath}" --real <real.json>`);
}

// ── Backtest-tekshiruv (real natija kelgach) ─────────────────────────────────
interface VerdictRow {
  metric: string;
  p5: number;
  p50: number;
  p95: number;
  real: number;
  inside: boolean;
  /** Imzoli nisbiy xato mediandan, % ((real−p50)/p50·100); p50=0 bo'lsa null. */
  errPct: number | null;
}

/**
 * Muhrlangan bashoratni real natija bilan solishtiradi → xato-hisobot (verdict.md).
 * @param predFile  sim-out/_predictions/<from>-<days>d.json yo'li
 * @param realJsonFile  RealOutcome-shaklidagi JSON fayl yo'li
 * @returns verdict-fayl yo'li + muhr-holati + qatorlar (dasturiy foydalanish uchun)
 */
export function verifyPrediction(
  predFile: string,
  realJsonFile: string,
): { verdictPath: string; sealOk: boolean | null; rows: VerdictRow[]; insideCount: number } {
  const predRaw = readFileSync(predFile);
  const pred = JSON.parse(predRaw.toString("utf8")) as SealedPrediction;

  // 1) Muhr-tekshiruv: fayl muhrlangandan beri o'zgartirilmaganmi?
  const sealPath = predFile.replace(/\.json$/i, ".seal");
  let sealOk: boolean | null = null; // null = seal-fayl topilmadi (tekshirib bo'lmadi)
  if (existsSync(sealPath)) {
    const expected = readFileSync(sealPath, "utf8").trim().split(/\s+/)[0] ?? "";
    sealOk = createHash("sha256").update(predRaw).digest("hex") === expected;
  }

  // 2) Real natija
  const real = JSON.parse(readFileSync(realJsonFile, "utf8")) as RealOutcome;
  if (typeof real.monthlyRides !== "number" || typeof real.monthlyRiders !== "number") {
    throw new Error(`[verify] real-JSON'da monthlyRides/monthlyRiders raqam bo'lishi shart: ${realJsonFile}`);
  }
  const realGrowth = real.growthX ?? round2(real.monthlyRides / BASELINE_MONTHLY_RIDES);

  // 3) Har metrika: oraliq vs real
  const mk = (metric: string, q: PredictionQuantiles, realV: number): VerdictRow => ({
    metric,
    p5: q.p5,
    p50: q.p50,
    p95: q.p95,
    real: realV,
    inside: realV >= q.p5 && realV <= q.p95,
    errPct: q.p50 !== 0 ? round2(((realV - q.p50) / q.p50) * 100) : null,
  });
  const rows: VerdictRow[] = [
    mk("Oylik safar (monthlyRides)", pred.taqsimot.monthlyRides, real.monthlyRides),
    mk("Oylik rider (monthlyRiders)", pred.taqsimot.monthlyRiders, real.monthlyRiders),
    mk("O'sish (growthX)", pred.taqsimot.growthX, realGrowth),
  ];
  const insideCount = rows.filter((r) => r.inside).length;

  // 4) Bucket-tahlil: real growthX qaysi bucketga tushdi, bashorat unga necha % bergan edi
  const realBucket = bucketOf(realGrowth);
  const bucketProb = pred.taqsimot.growthX.buckets[realBucket] ?? 0;

  // 5) Verdict-markdown
  const sealLine =
    sealOk === null
      ? "⚠️ seal-fayl topilmadi — muhrni tekshirib bo'lmadi"
      : sealOk
        ? "✅ muhr BUTUN (fayl muhrlangandan beri o'zgartirilmagan)"
        : "❌ MUHR BUZILGAN — bashorat-fayl muhrlangandan keyin O'ZGARTIRILGAN, hisobot ishonchsiz!";
  const verdictWord =
    insideCount === rows.length ? "✅ BASHORAT O'TDI" : insideCount >= rows.length - 1 ? "🟡 QISMAN O'TDI" : "❌ O'TMADI";
  const lines: string[] = [
    `# Backtest-verdikt — ${pred.from} +${pred.horizonDays} kun`,
    "",
    `- Bashorat muhrlangan: ${pred.sealedAt} (${pred.n} olam · pop=${pred.pop} · params ${pred.paramsHash.slice(0, 12)}…)`,
    `- Muhr: ${sealLine}`,
    `- Real natija fayli: ${realJsonFile}`,
    `- P1-soddalik eslatmasi: ${pred.baselineNote}`,
    "",
    "| Metrika | Bashorat p5..p95 | Median (p50) | Real | Oraliq ichida? | Xato % (mediandan) |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.metric} | ${r.p5}..${r.p95} | ${r.p50} | ${r.real} | ${r.inside ? "✅ ichida" : "❌ tashqarida"} | ${r.errPct === null ? "—" : `${r.errPct > 0 ? "+" : ""}${r.errPct}%`} |`,
    ),
    "",
    `**growthX-bucket:** real ${realGrowth.toFixed(2)}× → "${realBucket}" — bashorat bu bucketga **${bucketProb}%** ehtimol bergan edi.`,
    "",
    `## Xulosa: ${verdictWord} (${insideCount}/${rows.length} metrika p5..p95 ichida)`,
    "",
    insideCount === rows.length
      ? "Model gorizontni qamradi — keyingi qadam: xato-manbalarni baribir ko'rib chiqish (p50-og'ish belgisi) va P3-masshtabga tavsiya."
      : "Qayta kalibratsiya kerak: eng katta |xato %| bergan metrikadan boshlab qaysi parametr noto'g'ri ekanini tahlil qiling " +
        "(contagion? konversiya? reward-sensitivity? — L11), so'ng calibrate.ts qayta yugurtirilsin va YANGI muhrlangan bashorat qilinsin.",
    "",
    `_Qabul-chegara (taklif): 3/3 ichida = o'tdi, aks holda qayta kalibratsiya. Yakuniy "o'tdi" — ega qarori (DoD R1)._`,
    "",
  ];
  const verdictPath = predFile.replace(/\.json$/i, "-verdict.md");
  writeFileSync(verdictPath, lines.join("\n"));
  return { verdictPath, sealOk, rows, insideCount };
}

// ── CLI-dispetcher (import qilinganda main yugurmaydi — verifyPrediction toza eksport) ──
const isCli =
  process.argv[1] != null && /predict\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, "/"));
if (isCli) {
  const verifyArg = argOf("verify");
  if (verifyArg) {
    const realArg = argOf("real");
    if (!realArg) throw new Error("[predict] --verify bilan birga --real <real.json> ham kerak");
    const res = verifyPrediction(resolve(verifyArg), resolve(realArg));
    console.log(`\n📋 Verdikt yozildi: ${res.verdictPath}`);
    console.log(`   muhr: ${res.sealOk === null ? "topilmadi" : res.sealOk ? "butun" : "BUZILGAN"} · ${res.insideCount}/${res.rows.length} metrika oraliq ichida`);
  } else {
    sealPrediction();
  }
}
