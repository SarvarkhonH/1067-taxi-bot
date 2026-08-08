// 🏗 Sim-provision: Docker-Postgres ko'tarish → prisma sxema push → eski sim-ma'lumot reset →
// olam-konfiguratsiya seed (flaglar/knoblar/mavsum/katalog). Servislar va ../db FAQAT funksiya
// ichida dinamik import qilinadi — run.ts import-tartibi (_simDb → clock → servislar) buzilmasin.
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DAY_MS, assertClockInstalled, installSimClock } from "../clock";
import type { SimConfig } from "../types";

const PG_USER = "sim";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function dockerOut(cmd: string): string {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

/** _simDb bilan bir xil qo'riq — provision dbUrl parametri ham shu talablarga bo'ysunadi.
 *  Muvaffaqiyatda port + baza-nomni qaytaradi (ko'p-baza flot rejimi shulardan nom yasaydi). */
function guardSimUrl(dbUrl: string): { port: number; db: string } {
  if (/neon\.tech|neon\.build/i.test(dbUrl)) {
    throw new Error("[provision] Neon host taqiqlangan (muzlatilgan nusxa).");
  }
  const m = dbUrl.match(/@(localhost|127\.0\.0\.1):(\d+)\/([A-Za-z0-9_]+)/);
  if (!m || !m[3]!.startsWith("birjoy_sim")) {
    throw new Error(
      `[provision] dbUrl localhost + 'birjoy_sim*' bo'lishi shart (app-DB himoyasi). Berilgan: ${dbUrl}`,
    );
  }
  return { port: Number(m[2]!), db: m[3]! };
}

/** Ko'p-baza flot: konteyner/volume nomi portdan. ⚠️ MEROS-ISTISNO — 5434 birinchi sim sifatida
 *  "birjoy-sim-t1"/"birjoy_sim_t1" nomi bilan yaratilgan; formulani unga qo'llasak ensureDocker
 *  band 5434-portga IKKINCHI konteyner ochishga urinib, yurayotgan yugurishni buzardi. */
function dockerParams(dbUrl: string): { port: number; db: string; container: string; volume: string } {
  const { port, db } = guardSimUrl(dbUrl);
  if (port === 5434) return { port, db, container: "birjoy-sim-t1", volume: "birjoy_sim_t1" };
  return { port, db, container: `birjoy-sim-${port}`, volume: `birjoy_sim_${port}` };
}

/** (a) Konteyner yo'q → yaratish; to'xtagan → start; keyin pg_isready bo'lguncha kutish.
 *  Port/baza/konteyner dbUrl'dan olinadi (5434→birjoy_sim_t1 avvalgidek, aynan). */
export async function ensureDocker(dbUrl: string): Promise<void> {
  const { port, db, container, volume } = dockerParams(dbUrl);
  const running = dockerOut(`docker ps --format "{{.Names}}"`).split(/\r?\n/);
  if (!running.includes(container)) {
    const all = dockerOut(`docker ps -a --format "{{.Names}}"`).split(/\r?\n/);
    if (all.includes(container)) {
      console.log(`[provision] konteyner to'xtagan — docker start ${container}`);
      dockerOut(`docker start ${container}`);
    } else {
      console.log(`[provision] konteyner yo'q — yaratilmoqda (${container}, port ${port})`);
      dockerOut(
        `docker run -d --name ${container} -e POSTGRES_USER=${PG_USER} -e POSTGRES_PASSWORD=sim ` +
          `-e POSTGRES_DB=${db} -p ${port}:5432 -v ${volume}:/var/lib/postgresql/data postgres:16`,
      );
    }
  }
  for (let i = 0; i < 60; i++) {
    try {
      dockerOut(`docker exec ${container} pg_isready -U ${PG_USER} -d ${db}`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`[provision] ${container} 60s ichida tayyor bo'lmadi (pg_isready yiqildi).`);
}

/** (b) Prisma sxemasini sim-bazaga push (faqat dbUrl env bilan — lokal .env DATABASE_URL tegilmaydi). */
export function schemaPush(dbUrl: string): void {
  guardSimUrl(dbUrl);
  const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  console.log(`[provision] prisma db push → ${dbUrl.replace(/:[^:@/]+@/, ":***@")}`);
  execSync("npx prisma db push --skip-generate", {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    stdio: "inherit",
  });
}

/** (d) Oldingi sim-qoldiqlarni tozalash. FAQAT sim-DB (dinamik _simDb import qo'riq beradi):
 *  SIM-% a'zolar + bog'liq ledgerlar, sim% telegram-userlar, oyin/feature/bonus AppState qatorlari. */
export async function resetSimData(runTag: string): Promise<void> {
  await import("../_simDb"); // qo'riqchi: DATABASE_URL faqat birjoy_sim* bo'lishi mumkin
  const { prisma } = await import("../../db");

  const members = await prisma.member.findMany({
    // "SIM-" joriy prefiks; "SIMFRAUD-" — eski (dashsiz) fraud-alt orfanlari (crash-qoldig'i) ham tozalansin.
    where: { OR: [{ kasId: { startsWith: "SIM-" } }, { kasId: { startsWith: "SIMFRAUD-" } }] },
    select: { id: true },
  });
  const ids = members.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    // RideReward/GashtakReward'da FK yo'q (oddiy memberId) — cascade ishlamaydi, qo'lda o'chiriladi
    await prisma.rideReward.deleteMany({ where: { memberId: { in: chunk } } });
    await prisma.gashtakReward.deleteMany({ where: { memberId: { in: chunk } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: chunk } } });
  }
  await prisma.referral.deleteMany({
    where: { OR: [{ referrerId: { startsWith: "sim" } }, { refereeId: { startsWith: "sim" } }] },
  });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: "sim" } } });
  for (let i = 0; i < ids.length; i += 5000) {
    await prisma.member.deleteMany({ where: { id: { in: ids.slice(i, i + 5000) } } });
  }
  // "oyin" prefiksi oyin:% VA oyin_sold:% ni birga qamraydi; feature/bonus seed'da qayta yoziladi
  await prisma.appState.deleteMany({
    where: {
      OR: [{ key: { startsWith: "oyin" } }, { key: { startsWith: "feature:" } }, { key: "bonus:econ" }],
    },
  });

  // Keshlarni ham nolga tushirish — o'chirilgan qatorlar 30-60s kesh ortidan "tirik" ko'rinmasin
  const ff = await import("../../services/featureFlags");
  ff.__resetFeatureCache();
  const season = await import("../../services/oyinSeason");
  season.invalidateSeasonCache();
  const oyin = await import("../../services/oyinService");
  oyin.invalidateBallCacheExternal();
  console.log(`[provision] reset (${runTag}): ${ids.length} SIM-a'zo va bog'liq qatorlar o'chirildi`);
}

// P1 kichik test-katalog — jonli seed emas: 4-5 arzon sovrin, hammasi darhol OCHIQ (queued:false).
const SMALL_CATALOG: ReadonlyArray<{
  icon: string; name: string; valueLabel: string; price: number; limit: number;
}> = [
  { icon: "🫖", name: "Elektr choynak", valueLabel: "150 000 so'm", price: 600, limit: 20 },
  { icon: "🍚", name: "Guruch 25kg", valueLabel: "250 000 so'm", price: 750, limit: 16 },
  { icon: "🧺", name: "Oziq-ovqat savati", valueLabel: "300 000 so'm", price: 850, limit: 12 },
  { icon: "🔥", name: "Gaz plita", valueLabel: "450 000 so'm", price: 1000, limit: 10 },
  { icon: "📱", name: "Smartfon", valueLabel: "600 000 so'm", price: 1200, limit: 8 },
];

/** Bitta sovrin-katalog qatori (SMALL_CATALOG shakli; arm-preset ham shu shaklda). */
export interface SimCatalogPrize {
  icon: string; name: string; valueLabel: string; price: number; limit: number;
}

/** (c) Olam-konfiguratsiya: flaglar → knoblar (bonus:econ) → mavsum → katalog.
 *  `catalogOverride` berilsa (L9 arm-preset) SMALL_CATALOG o'rniga SHU ishlatiladi:
 *   · undefined → default SMALL_CATALOG · [] → katalog BO'SH qoladi (chipta sotilmaydi). */
export async function seedWorldConfig(
  cfg: SimConfig,
  catalogOverride?: ReadonlyArray<SimCatalogPrize>,
): Promise<void> {
  await import("../_simDb");
  const t0 = Date.parse(cfg.t0Iso);
  if (!Number.isFinite(t0)) throw new Error(`[provision] cfg.t0Iso yaroqsiz: ${cfg.t0Iso}`);
  // Mavsum-validatsiya Date.now() ishlatadi (o'tmish-sana rad etiladi) — sim-soat SHART.
  try {
    assertClockInstalled();
  } catch {
    installSimClock(t0);
  }

  const ff = await import("../../services/featureFlags");
  const known = new Set<string>(ff.FEATURES);
  for (const [name, on] of Object.entries(cfg.flags)) {
    if (!known.has(name)) throw new Error(`[provision] noma'lum feature-flag: "${name}"`);
    await ff.setFeature(name as Parameters<typeof ff.setFeature>[0], on);
  }
  ff.__resetFeatureCache();

  // Knoblar AppState "bonus:econ" JSON-blobida — setBonusEcon clamp qiladi va keshni o'zi buzadi
  const { setBonusEcon } = await import("../../services/bonusConfig");
  for (const [k, v] of Object.entries(cfg.knobs)) {
    const res = await setBonusEcon(k, v);
    if (!(k in res)) throw new Error(`[provision] noma'lum bonus-knob: "${k}"`);
    if (res[k] !== v) console.warn(`[provision] knob ${k}=${v} clamp bilan ${res[k]} ga qisildi`);
  }

  const oyin = await import("../../services/oyinService");
  await oyin.adminSetSeason({
    startIso: new Date(t0 + DAY_MS).toISOString(),
    endIso: new Date(t0 + 46 * DAY_MS).toISOString(),
    label: "SIM",
  });

  if (cfg.catalog === "small") {
    const { prisma } = await import("../../db");
    // ⚠️ Avval BO'SH massiv yoziladi: qator umuman YO'Q bo'lsa getCatalog/mutateCatalog
    // OYIN_SEED_CATALOG'ni qayta urug'laydi va kichik katalog jonli seed ustiga qo'shilardi.
    await prisma.appState.upsert({
      where: { key: "oyin:catalog" },
      create: { key: "oyin:catalog", value: "[]" },
      update: { value: "[]" },
    });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "oyin_sold:" } } });
    // catalogOverride === undefined → default; [] → ataylab bo'sh (arm A/B/C/G); aks holda arm-preset
    const catalog = catalogOverride ?? SMALL_CATALOG;
    for (const p of catalog) {
      // queued:false ANIQ beriladi — adminUpsertPrize yangi sovrinni default NAVBATGA qo'yadi
      await oyin.adminUpsertPrize({ ...p, photoUrl: null, queued: false });
    }
  }
  // catalog "live": qator o'chirilgan holda qoladi — birinchi o'qishda OYIN_SEED_CATALOG urug'lanadi
  oyin.invalidateBallCacheExternal();
  const catN = cfg.catalog === "small" ? (catalogOverride ?? SMALL_CATALOG).length : "live";
  console.log(
    `[provision] seed: ${Object.keys(cfg.flags).length} flag · ${Object.keys(cfg.knobs).length} knob · mavsum SIM · katalog=${cfg.catalog}(${catN})`,
  );
}

/** To'liq provision: docker → sxema → reset → seed. run.ts sim boshida bir marta chaqiradi.
 *  `catalogOverride` — L9 arm-preset (undefined = default SMALL_CATALOG, [] = bo'sh katalog). */
export async function provisionSim(
  cfg: SimConfig,
  dbUrl: string,
  catalogOverride?: ReadonlyArray<SimCatalogPrize>,
): Promise<void> {
  guardSimUrl(dbUrl);
  if (process.env.SIM_DATABASE_URL && process.env.SIM_DATABASE_URL !== dbUrl) {
    throw new Error(
      `[provision] SIM_DATABASE_URL (${process.env.SIM_DATABASE_URL}) berilgan dbUrl bilan mos emas — ikki xil bazaga yozib bo'lmaydi.`,
    );
  }
  process.env.SIM_DATABASE_URL = dbUrl;
  await ensureDocker(dbUrl);
  schemaPush(dbUrl);
  await resetSimData(cfg.name);
  await seedWorldConfig(cfg, catalogOverride);
}
