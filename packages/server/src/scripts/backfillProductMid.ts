// 🖼 ~800px TIER BACKFILL (ega, 2026-07-28: «rasm o'lchamini kichraytir 800px ga»)
//
// MUAMMO (jonli o'lchov): mahsulot sahifasi/galereyasi TO'LIQ rasmni berardi — 450-545 KB har biri,
// 5 rasmli mahsulotni ochish ~2,5 MB. Telefon ekranida (390 CSS px) bu farq ko'rinmaydi.
//
// YECHIM: Telegram `sendPhoto` javobidagi size-ladder'da ~800px pog'onasi ALLAQACHON bor —
// biz faqat eng kattasini (fileId) va ~320px (thumbFileId) ni saqlagan ekanmiz. Shu skript har
// rasmni file_id bo'yicha dump-chatga QAYTA yuboradi (sokin), javobdagi ladder'dan ~800px
// pog'onasini oladi va `ProductPhoto.midFileId` ga yozadi. Yangi bayt yuklanmaydi — Telegram
// o'sha rasmning tayyor pog'onasini qaytaradi.
//
// backfillProductThumbs.ts naqshi (bir xil throttle, bir xil dump-chat).
// SXEMA: `ProductPhoto.midFileId` ustuni VPS'da OLDIN qo'shilgan bo'lishi shart (prisma db push).
//
// DRY-RUN default. Yozish:
//   cd /opt/app/packages/server
//   npx dotenv -e ../../.env -- npx tsx src/scripts/backfillProductMid.ts --apply
import { prisma } from "../db";
import { env } from "../env";

const APPLY = process.argv.includes("--apply");
const DUMP_CHAT = process.env.PHOTO_DUMP_CHAT_ID || env.adminIds[0];
const TARGET_W = 800;

interface TgPhotoSize { file_id: string; width: number; height: number }
interface TgResp { ok: boolean; result?: { photo?: TgPhotoSize[] }; description?: string }

/** ~800px pog'onasi: 700px dan katta ENG KICHIK pog'ona; yo'q bo'lsa eng kattasi. */
function pickMid(j: TgResp): { fileId: string; midFileId: string; w: number } | null {
  if (!j.ok || !j.result?.photo?.length) return null;
  const sizes = [...j.result.photo].sort((a, b) => a.width - b.width);
  const biggest = sizes[sizes.length - 1]!;
  const mid = sizes.find((s) => s.width >= TARGET_W * 0.875) ?? biggest;
  return { fileId: biggest.file_id, midFileId: mid.file_id, w: mid.width };
}

async function resendById(fileId: string): Promise<TgResp> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: DUMP_CHAT, photo: fileId, disable_notification: true }),
  });
  return (await res.json()) as TgResp;
}

async function main(): Promise<void> {
  console.log(`— backfillProductMid ${APPLY ? "APPLY" : "DRY-RUN"} —`);
  if (APPLY && (!env.BOT_TOKEN || !DUMP_CHAT)) { console.error("BOT_TOKEN yoki dump-chat yo'q — to'xtatildi"); process.exitCode = 1; return; }

  const rows = await prisma.productPhoto.findMany({
    where: { midFileId: null, fileId: { not: null } },
    select: { id: true, productId: true, fileId: true }, orderBy: { id: "asc" },
  });
  const total = await prisma.productPhoto.count();
  const already = await prisma.productPhoto.count({ where: { midFileId: { not: null } } });
  console.log(`galereya satrlari: ${total} · mid bor: ${already} · to'ldiriladi: ${rows.length}`);
  console.log(`taxminiy vaqt: ~${Math.ceil((rows.length * 1.1) / 60)} daqiqa (Telegram throttle 1.1s)`);
  if (!APPLY) { console.log("\n(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)"); await prisma.$disconnect(); return; }

  let ok = 0, fail = 0;
  const widths: number[] = [];
  for (const r of rows) {
    try {
      const picked = pickMid(await resendById(r.fileId!));
      if (picked) {
        await prisma.productPhoto.update({ where: { id: r.id }, data: { midFileId: picked.midFileId } });
        widths.push(picked.w);
        ok++;
      } else fail++;
    } catch { fail++; }
    if ((ok + fail) % 25 === 0) console.log(`  ...${ok + fail}/${rows.length} (ok=${ok} xato=${fail})`);
    await new Promise((res) => setTimeout(res, 1100));
  }

  const w = widths.sort((a, b) => a - b);
  console.log(`\nyakun: ok=${ok} · xato=${fail}`);
  if (w.length) console.log(`tanlangan kenglik: min=${w[0]} · median=${w[Math.floor(w.length / 2)]} · max=${w[w.length - 1]}`);
  const left = await prisma.productPhoto.count({ where: { midFileId: null, fileId: { not: null } } });
  console.log(`ISBOT — mid'siz qolgan satrlar: ${left}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exitCode = 1; });
