// 🗺 READ-ONLY dump — koson-sim (yetkazish-masofa simulyatori) uchun kas1067'dan ikkita statik
// ma'lumot: (1) to'liq manzil-katalogi lat/lng bilan, (2) amaldagi mijoz-tarifi.
//
// ⛔ HECH NARSA YOZMAYDI: faqat GET api/addresses/ va GET api/clientTariffs. Booking yaratilmaydi,
// bazaga tegilmaydi (prisma import qilinmagan). dumpMahallaCatalog.ts bilan bir xil naqsh.
//
// Yugurtirish: cd packages/server && npx tsx src/scripts/dumpKosonGeo.ts
import "../env";
import { env, repoRoot } from "../env";
import { KasLiveSource } from "../kas/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Simulyator repo TASHQARISIDA turadi (prod deploy'ga 0% xavf) — natija to'g'ridan-to'g'ri unga.
const OUT_DIR = resolve(repoRoot, "../koson-sim/data");

async function main(): Promise<void> {
  const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
  await kas.login();
  console.log("login ✓");

  const addresses = await kas.getAllAddresses();
  console.log(`manzillar: ${addresses.length} (lat/lng bor: ${addresses.filter((a) => a.lat && a.lng).length})`);

  const tariff = await kas.getTariff();
  console.log("tarif:", JSON.stringify(tariff));

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(
    resolve(OUT_DIR, "kas-points.json"),
    JSON.stringify({ source: "kas1067 api/addresses/", fetchedAt: stamp, rows: addresses }, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve(OUT_DIR, "kas-tariff.json"),
    JSON.stringify({ source: "kas1067 api/clientTariffs", fetchedAt: stamp, tariff }, null, 2),
    "utf8",
  );
  console.log(`→ ${OUT_DIR}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
