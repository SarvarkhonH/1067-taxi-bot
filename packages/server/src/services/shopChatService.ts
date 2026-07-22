// 💬 C1 (BirJoy): mijoz↔do'kon chat — BOT-RELAY, yangi chat-server QURILMAYDI. Sotuvchi allaqachon
// botdan DM orqali buyurtma-xabar oladi — shu KANALNI kengaytiramiz. Mavjud `SupportMsg` (owner↔any-
// user AI/support-chat) qayta ishlatiladi: `shopId` null = bugungi AI-chat (o'zgarishsiz), non-null
// = mijoz↔do'kon thread. `relayMsgId` — sotuvchiga yuborilgan DM'ning Telegram message_id'si, sotuvchi
// javobini AYNAN shu suhbatga bog'lash uchun (reply_to_message orqali, bot/market.ts'da ishlatiladi).
import { SHOP_CHAT_MAX_TEXT, type ShopChatMessageView, type ShopChatSendResponse, type ShopChatThreadResponse } from "@t1067/shared";
import { prisma } from "../db";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 🔁 sotuvchi reply_to_message ishlatmasa — "oxirgi faol suhbat" zaxira (mavjud svcSearchWait/
// codeLink naqshi, bot.ts): har yangi relay shu sotuvchi uchun qayta yoziladi, 15 daq TTL.
const LAST_THREAD_TTL_MS = 15 * 60_000;
const lastActiveThread = new Map<string, { shopId: number; buyerTg: string; at: number }>();

export function noteActiveThread(sellerTg: string, shopId: number, buyerTg: string): void {
  lastActiveThread.set(sellerTg, { shopId, buyerTg, at: Date.now() });
}

export function getActiveThread(sellerTg: string): { shopId: number; buyerTg: string } | undefined {
  const e = lastActiveThread.get(sellerTg);
  if (!e || Date.now() - e.at > LAST_THREAD_TTL_MS) return undefined;
  return { shopId: e.shopId, buyerTg: e.buyerTg };
}

/** Telegram sendMessage — xom fetch (tgUploadPhoto naqshiga o'xshash, `bot` obyekti kerak emas,
 *  API-marshrutdan chaqiriladi). message_id qaytaradi — reply-routing uchun saqlanadi. */
async function tgSendMessage(chatId: string, text: string): Promise<number | null> {
  const { env } = await import("../env");
  if (!env.BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
    return data.ok ? (data.result?.message_id ?? null) : null;
  } catch {
    return null;
  }
}

/** Mijoz → do'kon xabar. Spam-himoya: shop+mijoz jufti uchun 60s ichida ≤5 xabar (buyProduct'ning
 *  60s dublikat-guard naqshiga o'xshash — matn-takror emas, hajm-cap). */
export async function sendBuyerMessage(memberId: number, shopId: number, text: string, preview = false): Promise<ShopChatSendResponse> {
  const { featureOn } = await import("./featureFlags");
  if (!preview && !(await featureOn("shopchat"))) return { ok: false, reason: "not_found" };
  const clean = text.trim().slice(0, SHOP_CHAT_MAX_TEXT);
  if (!clean) return { ok: false, reason: "bad_text" };
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { name: true, active: true, ownerChatId: true } });
  if (!shop || !shop.active) return { ok: false, reason: "shop_inactive" };
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  if (!tu) return { ok: false, reason: "not_found" };
  const buyerTg = tu.id;

  const recent = await prisma.supportMsg.count({
    where: { shopId, telegramId: buyerTg, direction: "in", createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 5) return { ok: false, reason: "too_fast" };

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, fullName: true } });
  const buyerName = (member?.displayName || member?.fullName || "Mijoz").trim().split(/\s+/)[0]!;

  const row = await prisma.supportMsg.create({ data: { shopId, telegramId: buyerTg, direction: "in", text: clean } });

  if (shop.ownerChatId) {
    const relayText = `🛍 <b>${esc(buyerName)}</b> do'koningiz haqida yozdi:\n«${esc(clean)}»\n\n<i>Javob berish uchun shu xabarga reply qiling.</i>`;
    const relayMsgId = await tgSendMessage(shop.ownerChatId, relayText);
    if (relayMsgId) {
      await prisma.supportMsg.update({ where: { id: row.id }, data: { relayMsgId } }).catch(() => undefined);
      noteActiveThread(shop.ownerChatId, shopId, buyerTg);
    }
  }
  return { ok: true };
}

/** Mijozning do'kon bilan suhbat-tarixi (o'zi ishlatadi, mini-app chat-Sheet). */
export async function getBuyerThread(memberId: number, shopId: number, preview = false): Promise<ShopChatThreadResponse | null> {
  const { featureOn } = await import("./featureFlags");
  if (!preview && !(await featureOn("shopchat"))) return null;
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { name: true } });
  if (!shop) return null;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  if (!tu) return null;
  const rows = await prisma.supportMsg.findMany({ where: { shopId, telegramId: tu.id }, orderBy: { createdAt: "asc" }, take: 100 });
  const messages: ShopChatMessageView[] = rows.map((r) => ({ id: r.id, direction: r.direction as "in" | "out", text: r.text, at: r.createdAt.toISOString() }));
  return { shopName: shop.name, messages };
}

/** Sotuvchi botda javob yozganda chaqiriladi (bot/market.ts, AI-catchall'dan OLDIN registratsiya
 *  qilingan handler ichida) — qaysi (shopId,buyerTg) threadga tegishli ekanini hal qiladi:
 *  1) reply_to_message → relayMsgId moslashtiradi (aniq, ko'p-suhbat xavfsiz)
 *  2) fallback — "oxirgi faol suhbat" (bitta-vaqtda-bitta-suhbat holatida yetarli)
 *  Moslik topilmasa `null` qaytaradi — chaqiruvchi `next()` chaqirib boshqa handlerlarga o'tkazadi. */
export async function handleSellerReply(sellerTg: string, replyToMessageId: number | undefined, text: string): Promise<{ shopId: number; buyerTg: string } | null> {
  let target: { shopId: number; buyerTg: string } | undefined;
  if (replyToMessageId) {
    const relayed = await prisma.supportMsg.findFirst({ where: { relayMsgId: replyToMessageId, shopId: { not: null } }, orderBy: { id: "desc" } });
    // R4-gap fix: Telegram `message_id` is only unique PER-CHAT, not globally — `relayMsgId` alone
    // could numerically collide with a DIFFERENT shop's relayed message. Never trust the match
    // without confirming the resolved shop's ownerChatId is genuinely THIS sender — otherwise any
    // Telegram user replying to an unrelated old message could impersonate another shop's owner.
    if (relayed && relayed.shopId) {
      const owned = await prisma.marketShop.findFirst({ where: { id: relayed.shopId, ownerChatId: sellerTg } });
      if (owned) target = { shopId: relayed.shopId, buyerTg: relayed.telegramId };
    }
  }
  if (!target) target = getActiveThread(sellerTg);
  if (!target) return null;

  const clean = text.trim().slice(0, SHOP_CHAT_MAX_TEXT);
  if (!clean) return target;
  const shop = await prisma.marketShop.findUnique({ where: { id: target.shopId }, select: { name: true } });
  await prisma.supportMsg.create({ data: { shopId: target.shopId, telegramId: target.buyerTg, direction: "out", text: clean } });
  const pingText = `🏪 <b>${esc(shop?.name ?? "Do'kon")}</b> sizga yozdi:\n«${esc(clean)}»`;
  await tgSendMessage(target.buyerTg, pingText);
  return target;
}

// ── C1.6: admin-panel sotuvchi-inbox (bot-DM'ning zaxira/qo'shimcha yo'li — mavjud owner
// ChatView naqshiga o'xshash, lekin BITTA shopId'ga scoped). ──
export interface ShopChatConvo { telegramId: string; name: string | null; username: string | null; lastMsg: string; lastAt: string; unread: number }

export async function listShopChatConversations(shopId: number): Promise<ShopChatConvo[]> {
  const msgs = await prisma.supportMsg.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 500 });
  const byId = new Map<string, typeof msgs>();
  for (const m of msgs) { if (!byId.has(m.telegramId)) byId.set(m.telegramId, []); byId.get(m.telegramId)!.push(m); }
  const tgIds = [...byId.keys()];
  const users = await prisma.telegramUser.findMany({ where: { id: { in: tgIds } }, select: { id: true, firstName: true, lastName: true, username: true } });
  const umap = new Map(users.map((u) => [u.id, u]));
  return tgIds.map((id) => {
    const ms = byId.get(id)!;
    const u = umap.get(id);
    const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || null : null;
    const latest = ms[0]!;
    const unread = ms.filter((m) => m.direction === "in" && !m.read).length;
    return { telegramId: id, name, username: u?.username ?? null, lastMsg: latest.text.slice(0, 80), lastAt: latest.createdAt.toISOString(), unread };
  });
}

export async function getShopChatMessages(shopId: number, telegramId: string): Promise<ShopChatMessageView[]> {
  const rows = await prisma.supportMsg.findMany({ where: { shopId, telegramId }, orderBy: { createdAt: "asc" }, take: 100 });
  await prisma.supportMsg.updateMany({ where: { shopId, telegramId, direction: "in", read: false }, data: { read: true } });
  return rows.map((r) => ({ id: r.id, direction: r.direction as "in" | "out", text: r.text, at: r.createdAt.toISOString() }));
}

/** Admin-paneldan sotuvchi javob yozadi (bot-DM'ga muqobil/qo'shimcha yo'l). */
export async function sendSellerReplyFromPanel(shopId: number, telegramId: string, text: string): Promise<{ ok: boolean }> {
  const clean = text.trim().slice(0, SHOP_CHAT_MAX_TEXT);
  if (!clean) return { ok: false };
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { name: true } });
  await prisma.supportMsg.create({ data: { shopId, telegramId, direction: "out", text: clean, read: true } });
  await tgSendMessage(telegramId, `🏪 <b>${esc(shop?.name ?? "Do'kon")}</b> sizga yozdi:\n«${esc(clean)}»`);
  return { ok: true };
}
