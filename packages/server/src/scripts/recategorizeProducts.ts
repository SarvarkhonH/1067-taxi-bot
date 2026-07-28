// 🗂 Mahsulotlarni haqiqiy kategoriyalarga taqsimlash (ega so'rovi, 2026-07-28).
//
// NEGA BU SKRIPT BOR: 2026-07-27 da 30 ta OZIQ-OVQAT kategoriyasi seed qilingan edi, lekin jonli
// do'kon deyarli oziq-ovqat sotmaydi. 221 mahsulot nomi tahlil qilindi: 200 tasi ishonchli
// tarzda OLTI ta NO-OZIQ-OVQAT guruhga tushadi (idish-tovoq, serviz, maishiy texnika, parfumeriya,
// kiyim, bolalar), oziq-ovqatga esa ATIGI BITTA mahsulot mos keladi (Frisolac). Shuning uchun bu
// skript avval yetishmayotgan kategoriyalarni qo'shadi, keyin mahsulotlarni ko'chiradi.
//
// QOIDALAR (kalit so'z → kategoriya) ATAYLAB KONSERVATIV: birinchi mos kelgan qoida g'olib,
// hech qaysi qoidaga tushmagan mahsulot TEGILMAYDI (noto'g'ri joyga tashlashdan ko'ra o'z
// joyida qolgani yaxshi — sotuvchi keyin qo'lda to'g'rilaydi).
//
// ⛔ «Aksiya» dagi mahsulotlar TEGILMAYDI: u kategoriya emas, chegirma-javoni. Ularni ko'chirish
//    javonni bo'shatib qo'yardi. (To'g'ri yechim — javonni `oldPriceTanga` bo'yicha qurish —
//    alohida tiket.)
//
// IDEMPOTENT: ikkinchi yugurishda 0 o'zgarish. Default DRY-RUN.
// Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/recategorizeProducts.ts --apply
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");
const PROMO = "Aksiya"; // tegilmaydi

/** Yangi kategoriyalar — jonli assortimentdan kelib chiqqan (soni bo'yicha tartiblangan). */
const NEW_CATEGORIES: { slug: string; name: string; emoji: string; icon: string }[] = [
  { slug: "oshxona-idish", name: "Oshxona idishlari", emoji: "🍳",
    icon: `<path d="M4.2 10.6h13.2v4.8a4.2 4.2 0 0 1-4.2 4.2H8.4a4.2 4.2 0 0 1-4.2-4.2Z"/><path d="M17.4 11.8h1.8a1.9 1.9 0 1 1 0 3.8h-1.8"/><path d="M3 10.6h15.4" stroke-width="1.7"/><path d="M8.6 7.8c.7-.9.7-1.6 0-2.5M12.6 7.8c.7-.9.7-1.6 0-2.5" stroke="#d98f00"/>` },
  { slug: "dasturxon", name: "Dasturxon va serviz", emoji: "🍽",
    icon: `<path d="M6.4 4.6v6.2a2.2 2.2 0 0 0 4.4 0V4.6"/><path d="M8.6 4.6v14.8"/><path d="M16.6 4.6c1.6 0 2.6 1.8 2.6 4.4 0 2-.7 3.2-1.6 3.6v6.8"/><circle cx="6.4" cy="8" r=".9" fill="#d98f00" stroke="none"/>` },
  { slug: "maishiy-texnika", name: "Maishiy texnika", emoji: "🔌",
    icon: `<rect x="4.4" y="5.6" width="15.2" height="12.8" rx="2.4"/><path d="M8.4 9.4h7.2M8.4 12.6h4.6"/><circle cx="16.6" cy="15" r="1.3" fill="#d98f00" stroke="none"/>` },
  { slug: "kiyim", name: "Kiyim va aksessuar", emoji: "👕",
    icon: `<path d="M8.6 4.6 5 6.8l1.6 3.4 1.6-.8v9.2h7.6V9.4l1.6.8L19 6.8l-3.6-2.2"/><path d="M8.6 4.6a3.4 3.4 0 0 0 6.8 0" stroke="#d98f00"/>` },
];

/** Kalit so'z → kategoriya. Tartib MUHIM: birinchi mos kelgani g'olib. */
const RULES: { cat: string; keys: string[] }[] = [
  // eng aniq/tor qoidalar oldinda
  { cat: "Bolalar oziq-ovqati", keys: ["frisolac", "smes", "pyure", "bo'tqa"] },
  { cat: "Gigiyena", keys: ["sochiq", "tualet qog", "salfetka", "tish pastasi", "podguznik", "taroq"] },
  { cat: "Parfumeriya", keys: ["duxi", "parfum", "perume", "dlya dush", "krem", "maska", "mask ", "shampun", "sovun", "dezadrant", "dezik", "sprey", "lasyon", "lubricant", "intim", "skrab", "feramon", "aloe", "aloy", "talk", "make up", "makeup", "cho'tka", "chotka", "body", "essense", "gel", "asvijitel", "oyax", "olis pays", "kotob ten", "chumoli yog", "spa hair"] },
  { cat: "Maishiy texnika", keys: ["dazmol", "pilesos", "pelisos", "blendir", "mikser", "sokovijimalka", "sok vijimalka", "sok aparat", "misrofka", "mikrofka", "vintelator", "ventilyator", "fenlar", "fen ", "chopper", "utuk", "aparat", "kalonka", "kolonka", "pompa", "antena", "beltop", "belatop", "bosch", "samsung", "lg "] },
  { cat: "Oshxona idishlari", keys: ["kastrulka", "kasturulka", "kastrulkakar", "kasturulkakar", "tova", "pizza pan", "mantuqazon", "bak nerjaveka", "patnos", "choynak", "choynik", "xushtak", "samavor", "qazon", "qozon", "sushulka", "qoshiqdon", "pechonisa", "kirishka", "kurishka", "matrushka", "sirlik", "sirli ", "tortnisa", "savatcha", "termos", "termoz"] },
  { cat: "Dasturxon va serviz", keys: ["bakal", "martinka", "stakan", "grafin", "girafin", "qoshiq", "vilka", "pichoq", "serviz", "bagima", "padarishni", "torix", "chinni", "kubba", "tarelka", "poyola", "luna firma", "zepter", "nerjaveka"] },
  { cat: "Kiyim va aksessuar", keys: ["kiyim", "kolleksiya", "futbolka", "zagolka", "igna", "sumka", "aksessuar", "yurakcha", "hijob"] },
  { cat: "Bolalar uchun", keys: ["bolajon", "bolalar", "kichkintoy", "qizaloq", "yosh bolalarga", "shahzoda"] },
];

/** Sotuvchilar nomni 𝐁𝐎𝐋𝐀 kabi «matematik» harflar bilan ham yozadi — oddiy harfga tushiriladi,
 *  aks holda kalit so'z hech qachon mos kelmaydi. */
function norm(s: string): string {
  let out = "";
  for (const ch of s) {
    const o = ch.codePointAt(0)!;
    if (o >= 0x1d400 && o <= 0x1d419) out += String.fromCharCode(65 + o - 0x1d400);
    else if (o >= 0x1d41a && o <= 0x1d433) out += String.fromCharCode(97 + o - 0x1d41a);
    else out += ch;
  }
  return out.toLowerCase().replace(/[ʻʼ']/g, "'").replace(/õ/g, "o");
}

function classify(name: string): { cat: string; key: string } | null {
  const s = norm(name);
  for (const r of RULES) for (const k of r.keys) if (s.includes(k)) return { cat: r.cat, key: k };
  return null;
}

async function main(): Promise<void> {
  console.log(`— recategorizeProducts ${APPLY ? "APPLY" : "DRY-RUN"} —\n`);

  // 1) yetishmayotgan kategoriyalar (ikonkasi bilan)
  const maxSort = (await prisma.categoryDef.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  let added = 0;
  for (let i = 0; i < NEW_CATEGORIES.length; i++) {
    const c = NEW_CATEGORIES[i]!;
    if (await prisma.categoryDef.findUnique({ where: { slug: c.slug } })) continue;
    console.log(`1) + kategoriya: ${c.emoji} ${c.name}`);
    if (APPLY) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0d9668" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>`;
      await prisma.categoryDef.create({
        data: { slug: c.slug, name: c.name, emoji: c.emoji, sortOrder: maxSort + 1 + i, iconUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}` },
      });
      added++;
    }
  }

  // 2) taqsimlash
  const products = await prisma.product.findMany({ select: { id: true, name: true, category: true }, orderBy: { id: "asc" } });
  const plan = new Map<string, { id: number; name: string; from: string; key: string }[]>();
  let skippedPromo = 0, unmatched = 0, alreadyOk = 0;
  for (const p of products) {
    if (p.category === PROMO) { skippedPromo++; continue; }
    const hit = classify(p.name);
    if (!hit) { unmatched++; continue; }
    if (hit.cat === p.category) { alreadyOk++; continue; }
    if (!plan.has(hit.cat)) plan.set(hit.cat, []);
    plan.get(hit.cat)!.push({ id: p.id, name: p.name, from: p.category, key: hit.key });
  }

  for (const [cat, list] of [...plan.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n2) → ${cat}  (${list.length} ta)`);
    for (const it of list.slice(0, 5)) console.log(`     #${it.id} «${it.name.slice(0, 46)}» ← ${it.from} [${it.key}]`);
    if (list.length > 5) console.log(`     … yana ${list.length - 5} ta`);
    if (APPLY) await prisma.product.updateMany({ where: { id: { in: list.map((i) => i.id) } }, data: { category: cat } });
  }

  const moved = [...plan.values()].reduce((s, l) => s + l.length, 0);
  console.log(`\nISBOT: ko'chirildi=${moved} · allaqachon to'g'ri=${alreadyOk} · mos kelmadi (tegilmadi)=${unmatched} · «${PROMO}» javonida qoldi=${skippedPromo} · yangi kategoriya=${added}`);

  // 3) yakuniy holat
  const after = await prisma.product.groupBy({ by: ["category"], _count: { _all: true }, where: { active: true, stock: { gt: 0 } } });
  const cats = await prisma.categoryDef.findMany({ select: { name: true } });
  const names = new Set(cats.map((c) => c.name));
  console.log("\nISBOT (faol + zaxirada bor mahsulotlar):");
  for (const g of after.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${String(g._count._all).padStart(4)}  ${g.category}${names.has(g.category) ? "" : "   ⚠️ KATEGORIYA-RO'YXATIDA YO'Q"}`);
  }
  if (!APPLY) console.log("\n(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
