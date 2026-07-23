// 🏠 V1.5 (Mahalla bozori) — Mahalla jadvalini seed qiladi. Ro'yxat kas1067 manzil-katalogidan
// (api/addresses/, dumpMahallaCatalog.ts) tortib olingan, ega qo'lda 39 tasini "haqiqiy mahalla"
// deb tasdiqlagan (qolgani maktab/bozor/bar/muassasa — chiqarib tashlangan, mahalla_review.tsv).
// IDEMPOTENT: nomi bo'yicha findUnique guard — qayta yugurtirilsa 0 yangi qo'shadi.
// Default DRY-RUN; yozish: npx tsx src/scripts/seedMahalla.ts --apply
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");

const MAHALLA: { name: string; lat: number; lng: number }[] = [
  { name: "ARABXONA", lat: 39.04678810796633, lng: 65.56404861031092 },
  { name: "ARALIQ", lat: 39.0236847766798, lng: 65.5973267555237 },
  { name: "ABBOSPAY", lat: 39.051133963177, lng: 65.5750033173828 },
  { name: "ESABOY", lat: 39.03369281207088, lng: 65.5121980324765 },
  { name: "BIRINCHI SEKTOR", lat: 39.0324815042926, lng: 65.599718262558 },
  { name: "BOG'ISHAMOL", lat: 39.03315279324923, lng: 65.55130004882812 },
  { name: "DO'STLIK", lat: 39.05615485499933, lng: 65.58751075138584 },
  { name: "ISTIQBOL", lat: 39.0249683673204, lng: 65.5621716294555 },
  { name: "JIZZALIK", lat: 39.0343683065475, lng: 65.5702826295166 },
  { name: "LOLAZOR", lat: 39.0517341661235, lng: 65.5815882225582 },
  { name: "MUG'JAGUL", lat: 39.0345816518157, lng: 65.5767800110626 },
  { name: "NARTCHUQUR", lat: 39.0395517525125, lng: 65.5825306671906 },
  { name: "NARTCHUQUR DORQUDUQ", lat: 39.0447348182314, lng: 65.5766341004638 },
  { name: "NARTCHUQUR CHORAXA", lat: 39.0425248477712, lng: 65.5770397296588 },
  { name: "NARTIBALAND QABRISTON", lat: 39.0375863227058, lng: 65.5978631973267 },
  { name: "NARTIBALAND NAVRUZ", lat: 39.0790947900216, lng: 65.5820047334986 },
  { name: "OLON", lat: 39.0367953678773, lng: 65.5805209794004 },
  { name: "OQTEPA", lat: 39.0965335233595, lng: 65.6119276779938 },
  { name: "OQYO'L", lat: 39.0284643816096, lng: 65.5688621300507 },
  { name: "PIKARNI YANGIOBOD", lat: 39.0224332685558, lng: 65.5708576935578 },
  { name: "PILAQUM", lat: 39.0654461262203, lng: 65.5593992966461 },
  { name: "QUYBOQ", lat: 39.0377350896501, lng: 65.5609442490387 },
  { name: "QUYI OBRON", lat: 39.0300351049016, lng: 65.6116133135461 },
  { name: "YUQORI OBRON", lat: 39.00995021768721, lng: 65.63363301954746 },
  { name: "O'RTA OBRON", lat: 39.019365838337, lng: 65.6224419373322 },
  { name: "RAVOT", lat: 39.0265674204549, lng: 65.5866934555817 },
  { name: "RAVOT TOG' ETAGI", lat: 39.0177838921612, lng: 65.5836768553783 },
  { name: "REGZOR", lat: 39.02506593599393, lng: 65.60185140292315 },
  { name: "SARIPUL MAHALLA", lat: 39.03077170879244, lng: 65.5880257355167 },
  { name: "SARG'AYMA", lat: 39.02826254767916, lng: 65.58829850051153 },
  { name: "TAHTABOZOR", lat: 39.018139713504, lng: 65.5681421759315 },
  { name: "TEMIRCHI GUZAR", lat: 39.0338464385423, lng: 65.5810926348118 },
  { name: "TOKZOR", lat: 39.0280009811892, lng: 65.565493275528 },
  { name: "UCHQIRA", lat: 39.0414683276132, lng: 65.5852772620707 },
  { name: "VAGZAL", lat: 39.0620531211106, lng: 65.5781103867341 },
  { name: "YANGIOBOD", lat: 39.0255472407201, lng: 65.5690552490997 },
  { name: "SHABADA", lat: 39.027211641074565, lng: 65.60648330561659 },
  { name: "CHORBOG'", lat: 39.0825730331471, lng: 65.5496499848761 },
  { name: "5-MIKRORAYON", lat: 39.0587433409092, lng: 65.5680413369688 },
];

async function main(): Promise<void> {
  console.log(`— seedMahalla ${APPLY ? "APPLY" : "DRY-RUN"} — ${MAHALLA.length} nomzod`);
  let created = 0;
  for (let i = 0; i < MAHALLA.length; i++) {
    const m = MAHALLA[i]!;
    const has = await prisma.mahalla.findUnique({ where: { name: m.name } });
    if (has) continue;
    console.log(`  yangi: ${m.name}`);
    if (APPLY) {
      await prisma.mahalla.create({ data: { name: m.name, lat: m.lat, lng: m.lng, sortOrder: i } });
      created++;
    }
  }
  if (APPLY) {
    const total = await prisma.mahalla.count();
    console.log(`ISBOT: yangi yaratildi=${created} · jami Mahalla=${total}`);
  } else {
    console.log(`(dry-run — yozish uchun --apply qo'shing)`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
