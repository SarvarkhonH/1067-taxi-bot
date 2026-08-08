export {}; // modul-belgisi (top-level await uchun)
// _simDb qo'riqlarining SALBIY-SINOVI (P1-DoD A2): har rejimda TO'G'RI xabar bilan yiqilishi shart.
// Yugurish: SIM_GUARD_CASE=a|b|c npx tsx src/sim/_simDb.negative-test.ts  → chiqish-kodi 0 = sinov O'TDI.
const CASE = process.env.SIM_GUARD_CASE ?? "a";
if (CASE === "a") delete process.env.SIM_DATABASE_URL; // dotenv .env.sim ni ham chetlab o'tish uchun quyida flag
if (CASE === "b") process.env.SIM_DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/birjoy_sim_x";
if (CASE === "c") process.env.SIM_DATABASE_URL = "postgresql://sim:sim@localhost:5434/birjoy";

const EXPECT: Record<string, string> = {
  a: "SIM_DATABASE_URL kerak",
  b: "Neon host taqiqlangan",
  c: "birjoy_sim",
};

try {
  if (CASE === "a") {
    // .env.sim faylini dotenv o'qib qo'ymasin — sinov aynan "URL yo'q" holatini tekshiradi
    process.env.SIM_DATABASE_URL = "";
  }
  await import("./_simDb");
  console.error(`❌ SINOV ${CASE}: qo'riq YIQILMADI — bu jiddiy xavfsizlik-teshigi!`);
  process.exit(1);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes(EXPECT[CASE]!)) {
    console.log(`✅ SINOV ${CASE}: to'g'ri rad etildi — "${msg.slice(0, 90)}..."`);
    process.exit(0);
  }
  console.error(`❌ SINOV ${CASE}: boshqa xato: ${msg}`);
  process.exit(1);
}
