// 📵 BLK-1 QABUL TESTI — A2..A6. Soxta bot (403 / 429 / OK) bilan `pushSend` xulqini tekshiradi.
// TAG'li tashlab yuboriladigan TelegramUser satrlari (99900000x) — hech qanday Member'ga
// bog'lanmaydi, hech qanday sweep ularni ko'rmaydi, oxirida BUTUNLAY o'chiriladi.
// Yugurtirish (VPS): npx dotenv -e ../../.env -- npx tsx src/scripts/testBlockRecord.ts
import type { Bot } from "grammy";
import { prisma } from "../db";
import { pushMessage, isBlocked } from "../services/pushSend";
import { touchTelegramUser } from "../services/memberService";

const ID_A = "999000001";
const ID_B = "999000002";
const IDS = [ID_A, ID_B];
let calls = 0;

const e403 = Object.assign(new Error("Forbidden: bot was blocked by the user"), { error_code: 403 });
const e429 = Object.assign(new Error("Too Many Requests: retry after 5"), { error_code: 429 });
const fakeBot = (throwErr?: Error): Bot =>
  ({ api: { sendMessage: async () => { calls++; if (throwErr) throw throwErr; return {}; } } }) as unknown as Bot;

const results: { line: string; ok: boolean; detail: string }[] = [];
const check = (line: string, ok: boolean, detail: string) => results.push({ line, ok, detail });

async function main(): Promise<void> {
  for (const id of IDS) await prisma.telegramUser.upsert({ where: { id }, create: { id }, update: { blockedAt: null } });

  // ── A2: 403 → blockedAt + BlockEvent(kind, block)
  const o2 = await pushMessage(fakeBot(e403), ID_A, "freespin_wait", "test");
  const u2 = await prisma.telegramUser.findUnique({ where: { id: ID_A }, select: { blockedAt: true } });
  const ev2 = await prisma.blockEvent.findFirst({ where: { telegramId: ID_A, event: "block" }, orderBy: { id: "desc" } });
  check("A2 403 → blockedAt + BlockEvent(kind)", o2 === "blocked" && !!u2?.blockedAt && ev2?.kind === "freespin_wait",
    `outcome=${o2} blockedAt=${u2?.blockedAt?.toISOString() ?? "null"} event=${ev2?.event}/${ev2?.kind}`);

  // ── A3: bloklanganga API chaqiruvi 0 ta
  calls = 0;
  const o3 = await pushMessage(fakeBot(), ID_A, "lucky_day", "test");
  check("A3 bloklanganga chaqiruv YO'Q", o3 === "skipped" && calls === 0, `outcome=${o3} sendMessage chaqirildi=${calls}`);

  // ── A5: 429 blok DEB YOZILMAYDI
  calls = 0;
  const o5 = await pushMessage(fakeBot(e429), ID_B, "streak_saver", "test");
  const u5 = await prisma.telegramUser.findUnique({ where: { id: ID_B }, select: { blockedAt: true } });
  const ev5 = await prisma.blockEvent.count({ where: { telegramId: ID_B } });
  check("A5 429 → blok EMAS", o5 === "failed" && !u5?.blockedAt && ev5 === 0,
    `outcome=${o5} blockedAt=${u5?.blockedAt?.toISOString() ?? "null"} blockEvent=${ev5} chaqiruv=${calls}`);

  // ── A6: force → bloklanganga ham urinadi (safar push'i)
  calls = 0;
  const o6 = await pushMessage(fakeBot(), ID_A, "ride_arrived", "test", { force: true });
  check("A6 force → safar push'i ketadi", o6 === "sent" && calls === 1, `outcome=${o6} chaqiruv=${calls}`);

  // ── A4: qaytish → blockedAt tozalanadi + BlockEvent(return)
  const blockedBefore = await isBlocked(ID_A);
  await touchTelegramUser(ID_A, { firstName: "BLK1TEST" });
  const u4 = await prisma.telegramUser.findUnique({ where: { id: ID_A }, select: { blockedAt: true } });
  const ev4 = await prisma.blockEvent.findFirst({ where: { telegramId: ID_A, event: "return" } });
  check("A4 qaytish → tozalash + return yozuvi", blockedBefore && !u4?.blockedAt && !!ev4,
    `oldin bloklangan=${blockedBefore} keyin blockedAt=${u4?.blockedAt?.toISOString() ?? "null"} returnEvent=${!!ev4}`);

  // ── A4b: bloklanmagan odam harakat qilsa — ORTIQCHA satr yozilmaydi
  const before = await prisma.blockEvent.count({ where: { telegramId: ID_B } });
  await touchTelegramUser(ID_B, { firstName: "BLK1TEST" });
  const after = await prisma.blockEvent.count({ where: { telegramId: ID_B } });
  check("A4b bloklanmaganda satr yozilmaydi", before === 0 && after === 0, `oldin=${before} keyin=${after}`);
}

main()
  .catch((e) => {
    console.error("TEST YIQILDI:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // TO'LIQ TOZALASH — prod bazasida bitta ham iz qolmaydi
    const delEv = await prisma.blockEvent.deleteMany({ where: { telegramId: { in: IDS } } });
    const delTg = await prisma.telegramUser.deleteMany({ where: { id: { in: IDS } } });
    const leftEv = await prisma.blockEvent.count({ where: { telegramId: { in: IDS } } });
    const leftTg = await prisma.telegramUser.count({ where: { id: { in: IDS } } });

    console.log("\n════ BLK-1 QABUL TESTI ════");
    for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.line}\n     ${r.detail}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nNATIJA: ${results.length - failed}/${results.length} o'tdi`);
    console.log(`TOZALASH: BlockEvent -${delEv.count}, TelegramUser -${delTg.count} → qoldiq: ${leftEv} / ${leftTg}`);
    if (failed || leftEv || leftTg) process.exitCode = 1;
    await prisma.$disconnect();
  });
