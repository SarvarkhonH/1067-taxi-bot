// P2P coin transfer (client<->client, client->driver tip).
//
// Closed-loop by construction: coins MOVE between members, never mint — paired
// CoinTxn rows (-amount sender / +net receiver) are written in the SAME
// transaction as the balance updates, so the reconciliation invariant
// (Member.coins == Σ CoinTxn) holds per member at all times. The burn is
// destroyed (supply shrinks), so wash-trading always loses money.
//
// Anti-funnel walls (all enforced INSIDE the transaction):
//   • two-sided daily caps — received-cap < per-member withdraw cap, so
//     funneling farm coins into one mule grants zero extra cash-out
//   • distinct-recipient fan-out cap (tips to drivers exempt)
//   • 48h account-age gate on the sender
//   • A→B→A ring reject (24h window) + admin alert on big moves
import {
  TRANSFER_BURN_RATE,
  TRANSFER_DAILY_RECEIVED,
  TRANSFER_DAILY_SENT,
  TRANSFER_MAX_COUNTERPARTIES,
  TRANSFER_MAX_PER_TX,
  TRANSFER_MIN,
  TRANSFER_MIN_ACCOUNT_AGE_H,
  formatNumber,
  type TransferResponse,
} from "@t1067/shared";
import { prisma } from "../db";

const DAY_MS = 24 * 3600 * 1000;

function norm9(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

/** Resolve a transfer recipient by phone (last-9 digits, like kas lookups). */
export async function findRecipientByPhone(phone: string): Promise<{ id: number; fullName: string; type: string } | null> {
  const last9 = norm9(phone);
  if (last9.length !== 9) return null;
  const m = await prisma.member.findFirst({
    where: { phone: { endsWith: last9 } },
    select: { id: true, fullName: true, type: true },
  });
  return m;
}

export async function transfer(
  fromMemberId: number,
  toPhone: string,
  amount: number,
  opts: { note?: string; kind?: "transfer" | "tip"; toMemberId?: number } = {},
): Promise<TransferResponse> {
  amount = Math.floor(amount);
  const kind = opts.kind ?? "transfer";
  const burn = Math.floor(amount * TRANSFER_BURN_RATE);
  const net = amount - burn;

  const sender = await prisma.member.findUnique({
    where: { id: fromMemberId },
    select: { id: true, coins: true, fullName: true, phone: true, telegramUser: { select: { linkedAt: true, createdAt: true } } },
  });
  const fail = (reason: TransferResponse["reason"]): TransferResponse => ({
    ok: false,
    reason,
    amount,
    received: net,
    burn,
    coinsLeft: sender?.coins ?? 0,
  });
  if (!sender) return fail("failed");
  if (amount < TRANSFER_MIN) return fail("below_min");
  if (amount > TRANSFER_MAX_PER_TX) return fail("over_max");

  // sender must be an established account (sybil farms are fresh)
  const linkedAt = sender.telegramUser?.linkedAt ?? sender.telegramUser?.createdAt ?? null;
  if (!linkedAt || Date.now() - linkedAt.getTime() < TRANSFER_MIN_ACCOUNT_AGE_H * 3600 * 1000) {
    return fail("account_too_new");
  }

  const recipient = opts.toMemberId
    ? await prisma.member.findUnique({ where: { id: opts.toMemberId }, select: { id: true, fullName: true, type: true, phone: true } })
    : await prisma.member.findFirst({
        where: { phone: { endsWith: norm9(toPhone) } },
        select: { id: true, fullName: true, type: true, phone: true },
      });
  if (!recipient || (!opts.toMemberId && norm9(toPhone).length !== 9)) return fail("not_found");
  if (recipient.id === fromMemberId || (sender.phone && recipient.phone && norm9(sender.phone) === norm9(recipient.phone))) {
    return fail("self");
  }

  const since = new Date(Date.now() - DAY_MS);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // caps checked inside the transaction — concurrent sends can't slip past
      const sent = await tx.transfer.aggregate({ where: { fromMemberId, createdAt: { gte: since } }, _sum: { amount: true } });
      if ((sent._sum.amount ?? 0) + amount > TRANSFER_DAILY_SENT) throw new Error("daily_sent_cap");

      const recv = await tx.transfer.aggregate({ where: { toMemberId: recipient.id, createdAt: { gte: since } }, _sum: { amount: true } });
      if ((recv._sum.amount ?? 0) + amount > TRANSFER_DAILY_RECEIVED) throw new Error("daily_received_cap");

      if (kind !== "tip") {
        const partners = await tx.transfer.findMany({
          where: { fromMemberId, createdAt: { gte: since } },
          select: { toMemberId: true },
          distinct: ["toMemberId"],
        });
        const set = new Set(partners.map((p) => p.toMemberId));
        if (!set.has(recipient.id) && set.size >= TRANSFER_MAX_COUNTERPARTIES) throw new Error("too_many_recipients");
      }

      // A→B→A ring: they sent ME coins in the last 24h and now I send back
      const reverse = await tx.transfer.findFirst({
        where: { fromMemberId: recipient.id, toMemberId: fromMemberId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (reverse) throw new Error("ring");

      // atomic debit — never goes negative
      const dec = await tx.member.updateMany({
        where: { id: fromMemberId, coins: { gte: amount } },
        data: { coins: { decrement: amount } },
      });
      if (dec.count === 0) throw new Error("insufficient");

      await tx.member.update({ where: { id: recipient.id }, data: { coins: { increment: net } } });

      const row = await tx.transfer.create({
        data: { fromMemberId, toMemberId: recipient.id, amount, burn, note: opts.note?.slice(0, 120), kind },
      });
      const label = kind === "tip" ? "Rahmat (tip)" : "P2P o'tkazma";
      await tx.coinTxn.create({
        data: { memberId: fromMemberId, amount: -amount, kind: `${kind}_out`, reason: `${label} → ${recipient.fullName}`, idempotencyKey: `transfer:${row.id}:out` },
      });
      await tx.coinTxn.create({
        data: { memberId: recipient.id, amount: net, kind: `${kind}_in`, reason: `${label} ← ${sender.fullName}`, idempotencyKey: `transfer:${row.id}:in` },
      });
      return row;
    });

    if (amount >= 10000) {
      const { alertAdmins } = await import("./economyService");
      await alertAdmins(
        `💸 ${kind === "tip" ? "Tip" : "O'tkazma"}: <b>${formatNumber(amount)}</b> — ${sender.fullName} → ${recipient.fullName} (id ${result.id})`,
      ).catch(() => undefined);
    }
    const after = await prisma.member.findUnique({ where: { id: fromMemberId }, select: { coins: true } });
    return { ok: true, amount, received: net, burn, coinsLeft: after?.coins ?? 0, toName: recipient.fullName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const known: TransferResponse["reason"][] = ["daily_sent_cap", "daily_received_cap", "too_many_recipients", "insufficient", "ring"];
    return fail(known.includes(msg as TransferResponse["reason"]) ? (msg as TransferResponse["reason"]) : "failed");
  }
}

/** Driver earnings view: tips + transfers in, lifetime and today. */
export async function getDriverEarnings(memberId: number): Promise<{ todayIn: number; totalIn: number; txns: { amount: number; kind: string; reason: string; at: string }[] }> {
  const since = new Date(Date.now() - DAY_MS);
  const inKinds = ["tip_in", "transfer_in", "driver_bonus"];
  const [today, total, txns] = await Promise.all([
    prisma.coinTxn.aggregate({ where: { memberId, kind: { in: inKinds }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.coinTxn.aggregate({ where: { memberId, kind: { in: inKinds } }, _sum: { amount: true } }),
    prisma.coinTxn.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return {
    todayIn: today._sum.amount ?? 0,
    totalIn: total._sum.amount ?? 0,
    txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt.toISOString() })),
  };
}
