// 🖼 V0.5 (BirJoy audit) — thumb-backfill. Ikki holat (dry-run 2026-07-20 aniqlagan):
//   (a) fileId bor, thumb yo'q (1 dona)  → file_id'ni sendPhoto bilan qayta-yuborish size-ladder beradi;
//   (b) faqat data-URL, fileId YO'Q (274 dona — KOSON_AKSIYA importi base64 saqlagan!) → bufferni
//       Telegram'ga MULTIPART yuklash: file_id + thumb olamiz, DB'dagi og'ir base64 ham yengillashadi
//       (url fallback sifatida qoladi — hech narsa yo'qolmaydi).
// JONLI DB + JONLI Telegram (har rasm = 1 sokin xabar dump-chatga) — shuning uchun default DRY-RUN;
// yozish: npx tsx src/scripts/backfillProductThumbs.ts --apply
// Throttle ~1.1s/rasm (~5 daqiqa). Idempotent: thumb'i borlar o'tkaziladi.
import { prisma } from "../db";
import { env } from "../env";

const APPLY = process.argv.includes("--apply");
const DUMP_CHAT = process.env.PHOTO_DUMP_CHAT_ID || env.adminIds[0];

interface TgPhotoSize { file_id: string; width: number; height: number }
interface TgResp { ok: boolean; result?: { photo?: TgPhotoSize[] } }

function pickLadder(j: TgResp): { fileId: string; thumbFileId: string } | null {
  if (!j.ok || !j.result?.photo?.length) return null;
  const sizes = [...j.result.photo].sort((a, b) => a.width - b.width);
  const thumb = sizes.find((s) => s.width >= 280) ?? sizes[sizes.length - 1]!; // tgUploadPhoto bilan bir xil tanlov
  return { fileId: sizes[sizes.length - 1]!.file_id, thumbFileId: thumb.file_id };
}

async function resendById(fileId: string): Promise<{ fileId: string; thumbFileId: string } | null> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: DUMP_CHAT, photo: fileId, disable_notification: true }),
  });
  return pickLadder((await res.json()) as TgResp);
}

async function uploadDataUrl(url: string): Promise<{ fileId: string; thumbFileId: string } | null> {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
  if (!m) return null;
  const buf = Buffer.from(m[2]!, "base64");
  if (buf.length < 100) return null;
  const form = new FormData();
  form.append("chat_id", String(DUMP_CHAT));
  form.append("disable_notification", "true");
  form.append("photo", new Blob([buf], { type: m[1]! }), "photo.jpg");
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  return pickLadder((await res.json()) as TgResp);
}

async function main(): Promise<void> {
  console.log(`— backfillProductThumbs ${APPLY ? "APPLY" : "DRY-RUN"} —`);
  if (APPLY && (!env.BOT_TOKEN || !DUMP_CHAT)) { console.error("BOT_TOKEN yoki dump-chat yo'q — to'xtatildi"); process.exitCode = 1; return; }

  const byId = await prisma.productPhoto.findMany({
    where: { thumbFileId: null, fileId: { not: null } },
    select: { id: true, fileId: true }, orderBy: { id: "asc" },
  });
  const byUrl = await prisma.productPhoto.findMany({
    where: { thumbFileId: null, fileId: null, url: { startsWith: "data:image" } },
    select: { id: true, url: true }, orderBy: { id: "asc" },
  });
  console.log(`thumb'siz: file_id-resend=${byId.length} · data-URL-upload=${byUrl.length}`);
  if (!APPLY) { await prisma.$disconnect(); return; }

  let done = 0, failed = 0;
  const work: { id: number; run: () => Promise<{ fileId: string; thumbFileId: string } | null> }[] = [
    ...byId.map((r) => ({ id: r.id, run: () => resendById(r.fileId!) })),
    ...byUrl.map((r) => ({ id: r.id, run: () => uploadDataUrl(r.url!) })),
  ];
  for (const w of work) {
    try {
      const ladder = await w.run();
      if (ladder) { await prisma.productPhoto.update({ where: { id: w.id }, data: { fileId: ladder.fileId, thumbFileId: ladder.thumbFileId } }); done++; }
      else failed++;
    } catch { failed++; }
    if ((done + failed) % 25 === 0) console.log(`  ...${done + failed}/${work.length} (ok=${done} fail=${failed})`);
    await new Promise((res) => setTimeout(res, 1100)); // Telegram rate-limit hurmati
  }
  const left = await prisma.productPhoto.count({ where: { thumbFileId: null } });
  console.log(`ISBOT (DoD 0.5b): backfilled=${done} · fail=${failed} · qolgan thumb'siz=${left}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
