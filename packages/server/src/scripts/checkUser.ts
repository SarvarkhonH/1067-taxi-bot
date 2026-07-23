// Read-only: locate user 906391026 across TelegramUser/Member/SupportMsg.
import "../env";
import { prisma } from "../db";

async function main() {
  const tg = process.argv[2] || "906391026";

  // 1) TelegramUser row (link table)
  const tu = await prisma.telegramUser.findUnique({ where: { id: tg } }).catch((e) => { console.log("tu err", e.message); return null; });
  console.log("=== TelegramUser ===");
  console.log(tu ? JSON.stringify({ id: (tu as any).id, memberId: (tu as any).memberId, username: (tu as any).username, firstName: (tu as any).firstName, createdAt: tu.createdAt }, null, 0) : "NONE");

  // 2) Member via relation
  if (tu && (tu as any).memberId) {
    const m = await prisma.member.findUnique({ where: { id: (tu as any).memberId } });
    console.log("=== Member ===");
    console.log(m ? JSON.stringify({ id: m.id, name: (m as any).displayName || (m as any).fullName, phone: (m as any).phone, coins: (m as any).coins, trips: (m as any).trips, banned: (m as any).banned, riskFlag: (m as any).riskFlag, lastBookingStatus: (m as any).lastBookingStatus, lastBookingAt: (m as any).lastBookingAt }, null, 0) : "NONE");
  } else {
    console.log("=== Member === (no telegramUser link)");
  }

  // 3) SupportMsg
  const total = await prisma.supportMsg.count({ where: { telegramId: tg } });
  const msgs = await prisma.supportMsg.findMany({ where: { telegramId: tg }, orderBy: { createdAt: "desc" }, take: 60 });
  msgs.reverse();
  console.log(`\n=== SupportMsg (total=${total}, last ${msgs.length}) ===`);
  for (const x of msgs) console.log(`[${x.createdAt.toISOString().slice(5, 16)}] ${x.direction === "in" ? "👤U" : "🤖A"} (${x.shopId ? "shop" + x.shopId : "AI"}): ${x.text.slice(0, 280)}`);

  // 4) sanity: how many distinct tg have written in last 24h
  const recent = await prisma.supportMsg.findMany({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, select: { telegramId: true }, take: 500 });
  console.log(`\n=== last-24h SupportMsg distinct senders: ${new Set(recent.map((r) => r.telegramId)).size}, rows: ${recent.length} ===`);

  await prisma.$disconnect();
}
void main();
