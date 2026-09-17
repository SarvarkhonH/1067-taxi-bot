/**
 * A passenger's kas1067 cashback, turned into tanga — once.
 *
 * Owner decision, 2026-09-17: kas1067 is removed with no way back, and the so'm
 * cashback passengers held there goes with it. Rather than let it vanish, every
 * client's last known cashback (Member.points, mirrored from kas) becomes the
 * same number of tanga, 1 so'm = 1 tanga, in this system's own ledger.
 *
 * Money rules (CLAUDE.md):
 *   • every credit is a CoinTxn with an idempotency key `kascb:<memberId>` —
 *     running this twice pays nobody twice
 *   • kind `kas_cashback` is excluded from the weekly tanga leaderboard
 *     (REYTING_EXCLUDE): it is money they had, not money earned this week
 *   • Member.points is NOT touched: it also feeds XP, level and the leaderboards
 *     (computeXp = points + trips·2 + ball), so zeroing it would drop every
 *     converted passenger's level. The passenger screens no longer show it as
 *     so'm; the key `kascb:<id>` alone makes a rerun pay nobody twice
 *
 * Modes:
 *   (default)   dry run — how many passengers, how much, the ten largest; writes nothing
 *   --go        credit tanga (idempotent); one owner alert with the totals
 *   --preview   send the customer message to ADMIN_TELEGRAM_IDS only, with a sample amount
 *   --notify    after --go: tell each converted, bot-linked passenger (once, marker kascbmsg:<id>)
 *
 * Run on the VPS:
 *   cd /opt/app/packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/convertKasCashback.ts [--go|--preview|--notify]
 */
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { grantCoins } from "../services/coinService";

const GO = process.argv.includes("--go");
const PREVIEW = process.argv.includes("--preview");
const NOTIFY = process.argv.includes("--notify");

const message = (amount: number): string =>
  `🎁 <b>Cashback'ingiz tangaga aylandi</b>\n\n` +
  `Taksi cashback hisobingizdagi <b>${formatNumber(amount)} so'm</b> endi hamyoningizda ` +
  `<b>${formatNumber(amount)} tanga</b> bo'lib turibdi.\n\n` +
  `1 tanga = 1 so'm — bozorda xarid qilish, haydovchiga to'lash va o'yinlarda ishlating. 🚕`;

async function send(chatId: string, html: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return false;
  if (res.status === 429) {
    const j = (await res.json().catch(() => ({}))) as { parameters?: { retry_after?: number } };
    await new Promise((r) => setTimeout(r, ((j.parameters?.retry_after ?? 3) + 1) * 1000));
    return send(chatId, html);
  }
  return res.ok;
}

async function main(): Promise<void> {
  if (PREVIEW) {
    if (!env.adminIds.length) throw new Error("ADMIN_TELEGRAM_IDS is empty");
    for (const id of env.adminIds) console.log(`preview → ${id}: ${(await send(id, message(12500))) ? "yuborildi" : "YUBORILMADI"}`);
    return;
  }

  if (NOTIFY) {
    const converted = await prisma.coinTxn.findMany({
      where: { kind: "kas_cashback", idempotencyKey: { startsWith: "kascb:" } },
      select: { memberId: true, amount: true },
    });
    let sent = 0, skipped = 0, failed = 0;
    for (const c of converted) {
      const key = `kascbmsg:${c.memberId}`;
      if (await prisma.appState.findUnique({ where: { key } })) { skipped++; continue; }
      const tg = await prisma.telegramUser.findFirst({ where: { memberId: c.memberId, blockedAt: null }, select: { id: true } });
      if (!tg) { skipped++; continue; }
      // the marker is written only after Telegram accepted the message, so a failure is retried next run
      if (await send(tg.id, message(c.amount))) {
        await prisma.appState.create({ data: { key, value: "1" } }).catch(() => undefined);
        sent++;
      } else failed++;
      await new Promise((r) => setTimeout(r, 40)); // well under Telegram's 30 msg/s
    }
    console.log(`xabar: ${sent} yuborildi · ${skipped} o'tkazildi (allaqachon / botga ulanmagan / bloklagan) · ${failed} xato`);
    return;
  }

  const clients = await prisma.member.findMany({
    where: { type: "client", points: { gt: 0 } },
    select: { id: true, fullName: true, points: true, lastSyncAt: true, telegramUser: { select: { id: true } } },
    orderBy: { points: "desc" },
  });
  const total = clients.reduce((s, c) => s + c.points, 0);
  const linked = clients.filter((c) => c.telegramUser);
  const sum = (xs: typeof clients) => xs.reduce((s, c) => s + c.points, 0);
  const ageDays = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null);
  const stale30 = clients.filter((c) => { const a = ageDays(c.lastSyncAt); return a === null || a > 30; });
  console.log("═".repeat(72));
  console.log(GO ? "YOZISH (--go)" : "QURUQ YURGIZISH — hech narsa yozilmaydi");
  console.log("═".repeat(72));
  console.log(`mijozlar  : ${clients.length}`);
  console.log(`jami      : ${formatNumber(total)} so'm → ${formatNumber(total)} tanga`);
  console.log(`botga ulangan: ${linked.length} mijoz · ${formatNumber(sum(linked))} · ulanmagan: ${clients.length - linked.length} · ${formatNumber(total - sum(linked))}`);
  console.log(`kas'dan oxirgi yangilangani 30 kundan eski/noma'lum: ${stale30.length} mijoz · ${formatNumber(sum(stale30))} (summa eskirgan bo'lishi mumkin)`);
  console.log("eng kattalari:");
  for (const c of clients.slice(0, 10)) console.log(`  m${c.id}  ${formatNumber(c.points).padStart(9)}  ${c.fullName}`);

  if (!GO) {
    console.log("\nhech narsa yozilmadi. Yozish uchun: --go");
    return;
  }

  let paid = 0, duplicate = 0, amount = 0;
  for (const c of clients) {
    const g = await grantCoins(c.id, c.points, "kas_cashback", `kas1067 cashback → tanga (${formatNumber(c.points)} so'm)`, `kascb:${c.id}`);
    if (g.ok) { paid++; amount += c.points; }
    else if (g.skipped === "duplicate") duplicate++;
  }
  console.log(`\n✅ ${paid} mijozga ${formatNumber(amount)} tanga · ${duplicate} tasi avvalroq o'tkazilgan edi`);
  const { alertAdmins } = await import("../services/economyService");
  await alertAdmins(
    `🎁 <b>kas1067 cashback → tanga</b>\n${paid} mijozga jami <b>${formatNumber(amount)} tanga</b> o'tkazildi` +
      (duplicate ? ` (${duplicate} tasi avvalroq)` : "") + `.`,
  ).catch(() => undefined);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
