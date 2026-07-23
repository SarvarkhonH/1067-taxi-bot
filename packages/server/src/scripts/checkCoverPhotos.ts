// READ-ONLY: cover-photo status for the Dasturxon restaurants, without dumping base64 blobs.
import "../env";
import { prisma } from "../db";

const NAMES = ["Chinor Oilaviy Restorant", "Uchqirra Baliq", "Umar Ota", "Dehqon Bar", "Uzoq Bobo"];

async function main(): Promise<void> {
  for (const name of NAMES) {
    const r = await prisma.restaurant.findFirst({ where: { name } });
    if (!r) { console.log(`${name}: NOT FOUND`); continue; }
    const has = !!(r.photoFileId || r.photoUrl);
    console.log(`#${r.id} ${name}: cover=${has ? "YES" : "no"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
