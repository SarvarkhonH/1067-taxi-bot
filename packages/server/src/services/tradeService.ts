// 🤝 Virtual bozor v2 — escrowed P2P deals on collection items.
// Offer types: coins (escrowed at create), barter (item-for-item, 50-tanga fee
// each side at accept), or both. Per-deal chat with regex moderation: phone
// numbers / cash-deal words are blocked; 3 strikes = 30-day trade ban.
// Real-money trading is FORBIDDEN (UI + oferta) — moderation enforces it.
import { prisma } from "../db";
import { grantCoins, spendCoins } from "./coinService";

export const BARTER_FEE = 50;
export const TRADE_STRIKE_BAN_DAYS = 30;
const TRADE_MIN_TRIPS = 3;

const BANNED = [
  /\d{7,}/, // phone numbers / card numbers
  /naqd|нақд|naxt|cash|dollar|so'mga\s+beraman|сум\s+бер/i,
  /klik|payme|humo|uzcard|visa/i,
];

async function tradeBanned(memberId: number): Promise<boolean> {
  const row = await prisma.appState.findUnique({ where: { key: `tradeban:${memberId}` } });
  return !!row && Number(row.value) > Date.now();
}

async function addStrike(memberId: number): Promise<void> {
  const key = `tradestrikes:${memberId}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const n = (row ? Number(row.value) : 0) + 1;
  await prisma.appState.upsert({ where: { key }, update: { value: String(n) }, create: { key, value: String(n) } });
  if (n >= 3) {
    await prisma.appState.upsert({
      where: { key: `tradeban:${memberId}` },
      update: { value: String(Date.now() + TRADE_STRIKE_BAN_DAYS * 86_400_000) },
      create: { key: `tradeban:${memberId}`, value: String(Date.now() + TRADE_STRIKE_BAN_DAYS * 86_400_000) },
    });
    await prisma.appState.update({ where: { key }, data: { value: "0" } }).catch(() => null);
  }
}

/** Make an offer on someone's item: coins (escrowed now) and/or your item as barter. */
export async function makeOffer(
  fromId: number,
  itemId: number,
  offerCoins: number,
  offerItemId?: number,
): Promise<{ ok: boolean; reason?: string; offerId?: number }> {
  if (await tradeBanned(fromId)) return { ok: false, reason: "banned" };
  const me = await prisma.member.findUnique({ where: { id: fromId } });
  if (!me || me.trips < TRADE_MIN_TRIPS) return { ok: false, reason: "need_rides" };
  const coins = Math.floor(offerCoins);
  if (coins < 0 || (coins === 0 && !offerItemId)) return { ok: false, reason: "empty_offer" };

  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, reason: "not_found" };
  if (item.ownerId === fromId) return { ok: false, reason: "own_item" };
  const itType = await prisma.itemType.findUnique({ where: { id: item.itemTypeId } });
  if (!itType || ["badge", "trophy"].includes(itType.kind)) return { ok: false, reason: "not_sellable" };

  if (offerItemId) {
    const mine = await prisma.item.findUnique({ where: { id: offerItemId } });
    if (!mine || mine.ownerId !== fromId) return { ok: false, reason: "barter_not_yours" };
    const mineType = await prisma.itemType.findUnique({ where: { id: mine.itemTypeId } });
    if (!mineType || ["badge", "trophy"].includes(mineType.kind)) return { ok: false, reason: "not_sellable" };
    const listed = await prisma.itemListing.findFirst({ where: { itemId: offerItemId } });
    if (listed) return { ok: false, reason: "barter_listed" };
  }

  const open = await prisma.tradeOffer.count({ where: { fromId, status: "open" } });
  if (open >= 5) return { ok: false, reason: "too_many_open" };

  if (coins > 0) {
    const esc = await spendCoins(fromId, coins, "trade_escrow", `🤝 Taklif #${itemId} uchun garov`);
    if (!esc.ok) return { ok: false, reason: "insufficient" };
  }
  const offer = await prisma.tradeOffer.create({
    data: { itemId, fromId, toId: item.ownerId, offerCoins: coins, offerItemId: offerItemId ?? null },
  });
  return { ok: true, offerId: offer.id };
}

/** Owner accepts. T0.5 (AUDIT 3.4+3.6): ALL validation happens before any
 *  spend; then ONE interactive transaction does status-guard + barter fees +
 *  ownership-guarded item flips + the sellerpay marker — atomically. The
 *  seller's 90% payout runs after the tx with an idempotent key; if the
 *  process dies in that window, the marker makes the tick retry it. */
export async function acceptOffer(toId: number, offerId: number): Promise<{ ok: boolean; reason?: string }> {
  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "open") return { ok: false, reason: "not_open" };
  if (offer.toId !== toId) return { ok: false, reason: "not_yours" };

  // pre-checks (no money moves here; re-verified by guards inside the tx)
  const item = await prisma.item.findUnique({ where: { id: offer.itemId } });
  if (!item || item.ownerId !== toId) {
    await cancelOffer(offer.fromId, offerId, true);
    return { ok: false, reason: "item_gone" };
  }
  if (offer.offerItemId) {
    const barterItem = await prisma.item.findUnique({ where: { id: offer.offerItemId } });
    if (!barterItem || barterItem.ownerId !== offer.fromId) {
      await cancelOffer(offer.fromId, offerId, true);
      return { ok: false, reason: "barter_gone" };
    }
  }

  const sellerAmount = offer.offerCoins > 0 ? Math.floor(offer.offerCoins * 0.9) : 0; // 10% burn
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.tradeOffer.updateMany({ where: { id: offerId, status: "open" }, data: { status: "accepted" } });
      if (claimed.count === 0) throw new Error("not_open");
      if (offer.offerItemId) {
        // barter fee from EACH side — balance-guarded, atomic with the swap
        const f1 = await tx.member.updateMany({ where: { id: offer.fromId, coins: { gte: BARTER_FEE } }, data: { coins: { decrement: BARTER_FEE } } });
        if (f1.count === 0) throw new Error("offerer_cant_fee");
        const f2 = await tx.member.updateMany({ where: { id: toId, coins: { gte: BARTER_FEE } }, data: { coins: { decrement: BARTER_FEE } } });
        if (f2.count === 0) throw new Error("insufficient_fee");
        await tx.coinTxn.createMany({
          data: [
            { memberId: offer.fromId, amount: -BARTER_FEE, kind: "trade_fee", reason: "🤝 Almashuv to'lovi" },
            { memberId: toId, amount: -BARTER_FEE, kind: "trade_fee", reason: "🤝 Almashuv to'lovi" },
          ],
        });
      }
      // ownership-guarded flips: if either item moved since the pre-check, abort everything
      const flip1 = await tx.item.updateMany({ where: { id: offer.itemId, ownerId: toId }, data: { ownerId: offer.fromId } });
      if (flip1.count === 0) throw new Error("item_gone");
      await tx.itemListing.deleteMany({ where: { itemId: offer.itemId } });
      if (offer.offerItemId) {
        const flip2 = await tx.item.updateMany({ where: { id: offer.offerItemId, ownerId: offer.fromId }, data: { ownerId: toId } });
        if (flip2.count === 0) throw new Error("barter_gone");
        await tx.itemListing.deleteMany({ where: { itemId: offer.offerItemId } });
      }
      if (sellerAmount > 0) {
        // sellerpay marker INSIDE the tx — the payout below can never be lost
        await tx.appState.create({
          data: { key: `pending:sellerpay:trade-${offerId}`, value: JSON.stringify({ memberId: toId, amount: sellerAmount, note: "trade", attempts: 0 }) },
        });
      }
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "failed";
    return { ok: false, reason: ["not_open", "offerer_cant_fee", "insufficient_fee", "item_gone", "barter_gone"].includes(reason) ? reason : "failed" };
  }

  if (sellerAmount > 0) {
    const g = await grantCoins(toId, sellerAmount, "trade_sale", `🤝 Bitim #${offerId}: buyum sotildi`, `sellerpay:trade-${offerId}`);
    if (g.ok || g.skipped === "duplicate") {
      const { pendingResolve } = await import("./appStateUtil");
      await pendingResolve("sellerpay", `trade-${offerId}`);
    }
  }
  // auto-reject other open offers on the same item + refund their escrow
  const others = await prisma.tradeOffer.findMany({ where: { itemId: offer.itemId, status: "open" } });
  for (const o of others) await cancelOffer(o.fromId, o.id, true);
  return { ok: true };
}

/** Reject (owner) or cancel (offerer) — escrow refunded idempotently. */
export async function cancelOffer(actorId: number, offerId: number, system = false): Promise<{ ok: boolean; reason?: string }> {
  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "open") return { ok: false, reason: "not_open" };
  if (!system && offer.fromId !== actorId && offer.toId !== actorId) return { ok: false, reason: "not_yours" };
  const status = offer.toId === actorId && !system ? "rejected" : "cancelled";
  const claimed = await prisma.tradeOffer.updateMany({ where: { id: offerId, status: "open" }, data: { status } });
  if (claimed.count === 0) return { ok: false, reason: "not_open" };
  if (offer.offerCoins > 0) {
    await grantCoins(offer.fromId, offer.offerCoins, "trade_refund", `↩️ Taklif #${offerId} qaytdi`, `traderef:${offerId}`);
  }
  return { ok: true };
}

/** In-deal chat: anonymous (first names only), moderated, open offers only. */
export async function sendTradeMessage(fromId: number, offerId: number, text: string): Promise<{ ok: boolean; reason?: string }> {
  if (await tradeBanned(fromId)) return { ok: false, reason: "banned" };
  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "open") return { ok: false, reason: "not_open" };
  if (offer.fromId !== fromId && offer.toId !== fromId) return { ok: false, reason: "not_yours" };
  const clean = text.trim().slice(0, 200);
  if (!clean) return { ok: false, reason: "empty" };
  const squeezed = clean.replace(/[\s\-()._]/g, ""); // "99 123 45 67" → digit run
  if (BANNED.some((re) => re.test(clean) || re.test(squeezed))) {
    await addStrike(fromId);
    return { ok: false, reason: "moderated" };
  }
  await prisma.tradeMessage.create({ data: { offerId, fromId, text: clean } });
  return { ok: true };
}

export async function myTrades(memberId: number): Promise<{
  incoming: TradeView[];
  outgoing: TradeView[];
}> {
  const offers = await prisma.tradeOffer.findMany({
    where: { OR: [{ toId: memberId }, { fromId: memberId }], status: "open" },
    include: { messages: { orderBy: { id: "asc" }, take: 30 } },
    orderBy: { id: "desc" },
    take: 20,
  });
  const itemIds = [...new Set(offers.flatMap((o) => [o.itemId, ...(o.offerItemId ? [o.offerItemId] : [])]))];
  const items = await prisma.item.findMany({ where: { id: { in: itemIds } } });
  const types = await prisma.itemType.findMany({ where: { id: { in: [...new Set(items.map((i) => i.itemTypeId))] } } });
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const byId = new Map(items.map((i) => [i.id, { ...i, itemType: typeOf.get(i.itemTypeId)! }]));
  const names = await prisma.member.findMany({
    where: { id: { in: [...new Set(offers.flatMap((o) => [o.fromId, o.toId]))] } },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(names.map((n) => [n.id, n.fullName.split(" ")[0] ?? "A'zo"]));
  const view = (o: (typeof offers)[number]): TradeView => ({
    id: o.id,
    item: byId.get(o.itemId) ? `${byId.get(o.itemId)!.itemType.emoji} ${byId.get(o.itemId)!.itemType.name} #${byId.get(o.itemId)!.serial}` : "?",
    offerCoins: o.offerCoins,
    offerItem: o.offerItemId && byId.get(o.offerItemId) ? `${byId.get(o.offerItemId)!.itemType.emoji} ${byId.get(o.offerItemId)!.itemType.name}` : null,
    from: nameOf.get(o.fromId) ?? "A'zo",
    mine: o.fromId === memberId,
    chat: o.messages.map((m) => ({ me: m.fromId === memberId, text: m.text })),
  });
  return {
    incoming: offers.filter((o) => o.toId === memberId).map(view),
    outgoing: offers.filter((o) => o.fromId === memberId).map(view),
  };
}

export interface TradeView {
  id: number;
  item: string;
  offerCoins: number;
  offerItem: string | null;
  from: string;
  mine: boolean;
  chat: { me: boolean; text: string }[];
}
