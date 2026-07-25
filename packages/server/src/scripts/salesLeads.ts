// 📞 SOTUV RO'YXATI — kunlik ish ro'yxati (READ-ONLY, hech narsa yozmaydi).
// SOTUV_PLAN asosida 3 blok chiqaradi:
//   1) DALIL-MIJOZLAR — BirJoy orqali haqiqiy qo'ng'iroq olganlar. Ular buni BILISHMAYDI.
//      Borib raqamni ko'rsating + iqtibos so'rang — bu sizning butun sotuv materialingiz.
//   2) TO'LDIRISH NAVBATI — ko'p ko'rilgan, lekin foto/soat/narxi yo'q e'lonlar. Bo'sh karta
//      = mijoz bosadigan narsa yo'q. Sotuvdan OLDIN shular to'ldiriladi.
//   3) TOPILMAGAN SO'ROVLAR — odamlar qidirib topa olmagan narsalar (prefiks-shovqin tozalangan).
//      Har biri = "sizda bor, bizda yo'q" deb boradigan aniq biznes-manzil.
// Yugurtirish: pnpm --filter @t1067/server exec dotenv -e ../../.env -- tsx src/scripts/salesLeads.ts
import "../env";
import { prisma } from "../db";

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 15);

function line(): void {
  console.log("─".repeat(72));
}

/** Qidiruv har harf bosilganda yozilgani uchun bitta so'rov o'nlab yozuv qoldiradi. Ikki xil
 *  shovqin bor va ikkalasi ham tozalanadi:
 *    1) PREFIKS-zanjiri: "kul" → "kull" → "kulle"  (qisqasi uzunига yutiladi)
 *    2) IMLO-variantlari: "...kiyum" vs "...kiyimlar" (prefiks emas — boshlang'ich 5 belgi
 *       bo'yicha guruhlanadi, har guruhdan eng UZUN yozuv vakil bo'ladi) */
const GROUP_LEN = 5;
function collapseTypingNoise(queries: string[]): { q: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const raw of queries) {
    const q = raw.trim().toLowerCase();
    if (q.length < 2) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  // 1) prefiks-zanjirini yig'ish — uzundan qisqaga qarab, qisqasi uzuniga qo'shiladi
  const byLenDesc = [...counts.keys()].sort((a, b) => b.length - a.length);
  const kept: { q: string; n: number }[] = [];
  for (const q of byLenDesc) {
    const host = kept.find((k) => k.q.startsWith(q));
    if (host) host.n += counts.get(q)!;
    else kept.push({ q, n: counts.get(q)! });
  }
  // 2) imlo-variantlarini boshlang'ich belgilar bo'yicha yig'ish
  const groups = new Map<string, { q: string; n: number }>();
  for (const k of kept) {
    const key = k.q.slice(0, GROUP_LEN);
    const g = groups.get(key);
    if (!g) groups.set(key, { ...k });
    else {
      g.n += k.n;
      if (k.q.length > g.q.length) g.q = k.q;
    }
  }
  return [...groups.values()].sort((a, b) => b.n - a.n);
}

async function main(): Promise<void> {
  const d30 = new Date(Date.now() - 30 * 864e5);

  // ── 1) DALIL-MIJOZLAR ───────────────────────────────────────────────────────
  const proof = await prisma.serviceListing.findMany({
    where: { status: "active", callCount: { gt: 0 } },
    orderBy: { callCount: "desc" },
    select: { id: true, name: true, phone: true, callCount: true, viewCount: true },
  });
  line();
  console.log("1️⃣  DALIL-MIJOZLAR — BirJoy ularga mijoz olib kelgan (ular bilishmaydi!)");
  line();
  if (!proof.length) {
    console.log("   (hali yo'q — 2-blokdagi kartalarni to'ldiring, qo'ng'iroqlar shundan keyin keladi)");
  } else {
    for (const p of proof) {
      console.log(`   📞 ${String(p.callCount).padStart(3)} qo'ng'iroq · ${String(p.viewCount).padStart(4)} ko'rish · ${p.name}`);
      console.log(`       ${p.phone}   → raqamni ko'rsating, 1 jumla iqtibos + ruxsat so'rang`);
    }
    console.log(`\n   JAMI: ${proof.reduce((s, p) => s + p.callCount, 0)} qo'ng'iroq, ${proof.length} ta biznesga.`);
  }

  // ── 2) TO'LDIRISH NAVBATI ───────────────────────────────────────────────────
  // "Asosiy to'liq" = FOTO + ISH VAQTI. Narx ataylab mezonga kirmaydi — stomatolog/usta narx
  // e'lon qilmasligi normal, lekin fotosiz va soatsiz karta har doim o'lik ko'rinadi.
  const CORE_MISSING = { status: "active", OR: [{ workHours: null }, { photos: { none: {} } }] };
  const empty = await prisma.serviceListing.findMany({
    where: CORE_MISSING,
    orderBy: [{ viewCount: "desc" }, { id: "asc" }],
    take: LIMIT,
    select: {
      id: true, name: true, phone: true, viewCount: true, callCount: true, workHours: true,
      _count: { select: { photos: true, prices: true } },
    },
  });
  const [emptyTotal, activeTotal, noPrice] = await Promise.all([
    prisma.serviceListing.count({ where: CORE_MISSING }),
    prisma.serviceListing.count({ where: { status: "active" } }),
    prisma.serviceListing.count({ where: { status: "active", prices: { none: {} } } }),
  ]);
  line();
  console.log(`2️⃣  TO'LDIRISH NAVBATI — foto/soat yo'q kartalar (${emptyTotal}/${activeTotal} to'liq emas)`);
  line();
  for (const e of empty) {
    const miss = [e._count.photos === 0 ? "foto" : null, !e.workHours ? "soat" : null].filter(Boolean).join(" + ");
    const extra = e._count.prices === 0 ? "  (narx ham yo'q)" : "";
    console.log(`   #${String(e.id).padStart(3)} · ${String(e.viewCount).padStart(4)} ko'rish · ${e.name}`);
    console.log(`       ${e.phone}   ❌ ${miss}${extra}`);
  }
  console.log(`\n   ⚠️  Bo'sh karta = mijoz bosadigan narsa yo'q. Kuniga 6 ta to'ldiring.`);

  // ── 3) TOPILMAGAN SO'ROVLAR ────────────────────────────────────────────────
  const demandRows = await prisma.marketDemand.findMany({
    where: { createdAt: { gte: d30 } },
    select: { query: true },
  });
  const real = collapseTypingNoise(demandRows.map((d) => d.query));
  line();
  console.log(`3️⃣  TOPILMAGAN SO'ROVLAR (30 kun) — ${demandRows.length} yozuv → ${real.length} ta haqiqiy so'rov`);
  line();
  if (!real.length) {
    console.log("   (bo'sh)");
  } else {
    for (const r of real.slice(0, LIMIT)) {
      console.log(`   🔎 «${r.q}»${r.n > 1 ? `  (${r.n}× qidirildi)` : ""}`);
    }
    console.log(`\n   💬 Skript: "Ilovamizda odamlar «${real[0]!.q}» deb qidiryapti, Kosonda topolmayapti.`);
    console.log(`      Sizda bor. Bepul qo'shamiz." — shu so'zlarni sotadigan bizneslarni toping.`);
  }

  // ── Haftalik 4 nazorat raqami ──────────────────────────────────────────────
  const [callSum, withCalls, shops, buys30, food30] = await Promise.all([
    prisma.serviceListing.aggregate({ _sum: { callCount: true } }),
    prisma.serviceListing.count({ where: { status: "active", callCount: { gt: 0 } } }),
    prisma.marketShop.count({ where: { active: true } }),
    prisma.shopPurchase.count({ where: { createdAt: { gte: d30 } } }),
    prisma.foodOrder.count({ where: { createdAt: { gte: d30 } } }),
  ]);
  const full = activeTotal - emptyTotal;
  const pct = activeTotal ? Math.round((full / activeTotal) * 100) : 0;
  line();
  console.log("📊 HAFTALIK 4 RAQAM (boardga)");
  line();
  console.log(`   1. Jami qo'ng'iroqlar ............ ${callSum._sum.callCount ?? 0}`);
  console.log(`   2. Qo'ng'iroq olgan e'lonlar ..... ${withCalls} / ${activeTotal}`);
  console.log(`   3. To'liq e'lonlar (foto+soat) ... ${full} / ${activeTotal} = ${pct}%  (maqsad: 50%+)`);
  console.log(`      narxi bor .................... ${activeTotal - noPrice} / ${activeTotal}  (ixtiyoriy)`);
  console.log(`   4. Tranzaksiya (30 kun) .......... do'kon ${buys30} + restoran ${food30}   [${shops} faol do'kon]`);
  line();

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
