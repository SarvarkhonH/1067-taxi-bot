// 🛡 R2 (OYIN_KARTA_PLAN.md §14) — kafolat buzilgan sovrinlarning KARTA SONINI tuzatish.
//
// Kafolat: `price × limit × OYIN_SOM_PER_BALL >= multiplier × narx`. Buzilgan sovrin to'lganda
// yig'ilgan pul narxini QOPLAMAYDI (jonli misol: TECNO SPARK `limit=2` — 1,39 mln so'mlik
// telefon 1 200 ballga to'lardi, m=0.02).
//
// ⚠️ Bu skript limitni FAQAT OSHIRADI. Oshirish sotilgan karta raqamini buzmaydi, LEKIN
// allaqachon karta olgan odamning yutish ehtimolini pasaytiradi — shuning uchun sotilgan
// karta bo'lsa skript O'SHA sovrinni CHETLAB O'TADI va ega qaroriga qoldiradi.
//
// Standart — QURUQ YURISH (hech narsa yozilmaydi). Yozish uchun: `--apply`
//   cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/fixPrizeMultiplier.ts
//   … src/scripts/fixPrizeMultiplier.ts --apply
import "../env";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { getBonusEcon } = await import("../services/bonusConfig");
  const { OYIN_SOM_PER_BALL, OYIN_PRIZE_MULTIPLIER } = await import("@t1067/shared");

  const econ = await getBonusEcon();
  const m = econ.oyinPrizeMultiplier ?? OYIN_PRIZE_MULTIPLIER;
  console.log(`Kafolat multiplikatori (jonli knob): m = ${m}`);
  console.log(`So'm/ball: ${OYIN_SOM_PER_BALL}`);
  console.log(APPLY ? "\n⚠️  --apply — O'ZGARISHLAR YOZILADI\n" : "\n🔍 QURUQ YURISH — hech narsa yozilmaydi (yozish uchun --apply)\n");

  const catalog = await svc.getCatalog();
  const soldRows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin_sold:" } } });
  const sold = new Map<string, number>();
  for (const r of soldRows) sold.set(r.key.slice("oyin_sold:".length), Number(r.value) || 0);

  const plans: { key: string; name: string; oldLimit: number; newLimit: number; oldM: number; newM: number }[] = [];
  const blocked: string[] = [];

  for (const p of catalog) {
    if (!p.active) continue;
    const valueSom = Number(String(p.valueLabel).replace(/[^\d]/g, "")) || 0;
    if (valueSom <= 0 || p.price <= 0) continue;
    const curM = (p.price * p.limit * OYIN_SOM_PER_BALL) / valueSom;
    if (curM >= m) continue;

    const newLimit = Math.max(1, Math.ceil((m * valueSom) / (OYIN_SOM_PER_BALL * p.price)));
    if (newLimit <= p.limit) continue;
    const soldNow = sold.get(p.key) ?? 0;
    if (soldNow > 0) {
      blocked.push(`${p.key} — ${soldNow} ta karta ALLAQACHON sotilgan (limit ${p.limit} → ${newLimit} ehtimolni pasaytiradi). EGA qaroriga qoldirildi.`);
      continue;
    }
    plans.push({ key: p.key, name: p.name, oldLimit: p.limit, newLimit, oldM: curM, newM: (p.price * newLimit * OYIN_SOM_PER_BALL) / valueSom });
  }

  if (blocked.length) {
    console.log("⛔ CHETLAB O'TILDI (sotilgan karta bor):");
    for (const b of blocked) console.log(`   ${b}`);
    console.log();
  }
  if (plans.length === 0) { console.log("✅ Tuzatish kerak bo'lgan sovrin yo'q."); return; }

  console.log("📋 REJA:");
  for (const pl of plans) {
    console.log(`   ${pl.name.slice(0, 38).padEnd(38)} | limit ${String(pl.oldLimit).padStart(4)} → ${String(pl.newLimit).padStart(4)} | m ${pl.oldM.toFixed(2)} → ${pl.newM.toFixed(2)}`);
  }
  if (!APPLY) { console.log("\n(quruq yurish — hech narsa yozilmadi)"); return; }

  for (const pl of plans) {
    // ⚠️ `adminUpsertPrize` HAR MAYDONNI input'dan qayta yozadi (berilmagan `name` → "Sovrin",
    // `price` → 1). Shuning uchun MAVJUD qatorning hamma maydoni uzatiladi, faqat `limit`
    // almashtiriladi — aks holda tuzatish sovrinning nomi/narxi/rasmini yo'q qilardi.
    const cur = catalog.find((x) => x.key === pl.key);
    if (!cur) { console.log(`❌ ${pl.key} — katalogda topilmadi, o'tkazib yuborildi`); process.exitCode = 1; continue; }
    await svc.adminUpsertPrize({
      key: cur.key, icon: cur.icon, name: cur.name, valueLabel: cur.valueLabel,
      price: cur.price, limit: pl.newLimit, photoUrl: cur.photoUrl, queued: cur.queued,
    });
    console.log(`✅ yozildi: ${pl.key} → limit=${pl.newLimit}`);
  }

  // Tasdiq: katalogni QAYTA o'qib, kafolat tiklanganini VA boshqa maydonlar buzilmaganini isbotlash
  const after = await svc.getCatalog();
  let bad = 0;
  for (const pl of plans) {
    const before = catalog.find((x) => x.key === pl.key)!;
    const p = after.find((x) => x.key === pl.key);
    const valueSom = Number(String(p?.valueLabel ?? "").replace(/[^\d]/g, "")) || 0;
    const nm = p && valueSom > 0 ? (p.price * p.limit * OYIN_SOM_PER_BALL) / valueSom : 0;
    const intact = p?.name === before.name && p?.price === before.price && p?.valueLabel === before.valueLabel && p?.photoUrl === before.photoUrl;
    const ok = p?.limit === pl.newLimit && nm >= m && intact;
    console.log(`${ok ? "✅" : "❌"} tasdiq: ${pl.key} limit=${p?.limit} m=${nm.toFixed(2)} nom/narx/rasm buzilmagan=${intact}`);
    if (!ok) bad++;
  }
  if (bad > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
