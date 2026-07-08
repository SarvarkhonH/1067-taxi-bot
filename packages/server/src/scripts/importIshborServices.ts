// 🔎 XIZMATLAR seed batch 2: real usta/xizmat ads curated by hand from a Telegram Desktop export
// of @koson_ishbor (a job-board GROUP, not a channel — most content was hiring posts/chat noise;
// this is the ~23 genuine "call me for a recurring service" ads found after dedup). Idempotent
// on phone (skips if already in DB). Usage: npx tsx src/scripts/importIshborServices.ts
import "../env";
import { prisma } from "../db";
import { normalizeUzPhone } from "../services/serviceDirectory";

interface Row { name: string; phone: string; category: string; tags: string }

const ROWS: Row[] = [
  { name: "Xusen Saidnabiev — elektr montaj", phone: "770377873", category: "Usta-servis", tags: "elektrik, elektr montaj" },
  { name: "Mironshox — bolalarga qarash", phone: "979521512", category: "Boshqa", tags: "bolalarga qarash, enagalik, Koson sh." },
  { name: "Azimjon Azamatov — sement/shlakoblok", phone: "951018144", category: "Qurilish", tags: "sement, shlakoblok, qurilish mollari, yetkazib berish" },
  { name: "Asqar Asadov — paxsa xizmati", phone: "880703433", category: "Qurilish", tags: "paxsa" },
  { name: "Allayev G'ulom — beton teshish", phone: "908857783", category: "Qurilish", tags: "beton teshish" },
  { name: "Yelbek — aboy, natyajnoy potolok", phone: "339980008", category: "Usta-servis", tags: "aboy, fotoaboy, natyajnoy potolok" },
  { name: "Maftuna — parda xizmati", phone: "914521138", category: "Usta-servis", tags: "parda" },
  { name: "S. A. G'dullayev — eski uy buzish", phone: "908972732", category: "Qurilish", tags: "uy buzish, demontaj, stayajka, lumboz" },
  { name: "Bolalarga qarovchi enaga", phone: "333142838", category: "Boshqa", tags: "bolalarga qarash, madaniyat markazi yonida" },
  { name: "Elbek — hovuz va kaldis quyish", phone: "918130082", category: "Qurilish", tags: "hovuz, kaldis" },
  { name: "Aircon Servis — konditsioner", phone: "943301300", category: "Usta-servis", tags: "konditsioner, aircon, freon quyish" },
  { name: "ShaXzOd — o't o'rish, yer og'darish", phone: "993326698", category: "Boshqa", tags: "o't o'rish, yer og'darish, traktor" },
  { name: "Abdiraxim — Rim ustunlari", phone: "942951596", category: "Qurilish", tags: "rim ustunlari, dekor" },
  { name: "Ilyos — malyarchilik", phone: "912209095", category: "Usta-servis", tags: "malyar, aboy, rang, travertin, kafel" },
  { name: "Ali_817 — nerjaveyka perilla", phone: "979409997", category: "Usta-servis", tags: "nerjaveyka, perilla, payvandlash" },
  { name: "Javohir Asadov — tandir, mangal, mebel", phone: "976677628", category: "Qurilish", tags: "tandir, o'choq, mangal, karavot, yog'och usta" },
  { name: "Mittisantexnik Baxodir — santexnik 24/7", phone: "990814050", category: "Usta-servis", tags: "santexnik, kotyol, konditsioner, ariston" },
  { name: "Xisrav — Koson-Toshkent taksi/pochta", phone: "886740800", category: "Transport", tags: "taksi, pochta, shaharlararo" },
  { name: "Xudoyberdi — hovuz kanalizatsiya", phone: "914452610", category: "Qurilish", tags: "hovuz, kanalizatsiya" },
  { name: "Maxmud Narchayev — qo'y qirqim", phone: "885191790", category: "Boshqa", tags: "qo'y qirqim, chorvachilik" },
  { name: "Umid Ibragimov — sahna bezaklari", phone: "908700756", category: "To'y-marosim", tags: "sahna bezagi, dekoratsiya, sarpo-sandiq" },
  { name: "Fazliddin — shtukaturka, g'isht terish", phone: "908926709", category: "Qurilish", tags: "shtukaturka, styajka, g'isht terish" },
  { name: "Begmat — qurilish, benzapila", phone: "332490006", category: "Qurilish", tags: "benzapila, beton quyish, g'isht terish, tom qoqish, shtukaturka" },
];

async function main(): Promise<void> {
  const cats = await prisma.serviceCategory.findMany();
  const catId = new Map(cats.map((c) => [c.name, c.id]));

  let created = 0, skippedDup = 0, badPhone = 0, badCat = 0;
  for (const r of ROWS) {
    const phone = normalizeUzPhone(r.phone);
    if (!phone) { badPhone++; console.log(`  ⚠️ yaroqsiz telefon: ${r.phone} (${r.name})`); continue; }
    const cid = catId.get(r.category);
    if (!cid) { badCat++; console.log(`  ⚠️ kategoriya topilmadi: ${r.category} (${r.name})`); continue; }
    const dup = await prisma.serviceListing.findFirst({ where: { phone }, select: { id: true } });
    if (dup) { skippedDup++; console.log(`  · dublikat, o'tkazildi: ${r.name} (${phone})`); continue; }
    await prisma.serviceListing.create({
      data: { categoryId: cid, name: r.name.slice(0, 80), phone, tags: r.tags.slice(0, 200), status: "active", rankScore: 4.0 },
    });
    created++;
  }
  const total = await prisma.serviceListing.count({ where: { status: "active" } });
  console.log(`\n✅ Import: ${created} yangi · ${skippedDup} dublikat · ${badPhone} yaroqsiz telefon · ${badCat} kategoriyasiz`);
  console.log(`📊 Katalogda jami ${total} ta aktiv xizmat.`);
  await prisma.$disconnect();
}

void main();
