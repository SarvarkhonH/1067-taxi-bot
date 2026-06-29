// 💵 Real cash-out (tanga → plastik card / cash-to-home). The bot NEVER moves money itself — it
// records a request and forwards it to the owner, who pays manually and approves. Tangas are spent
// only on approval (idempotent), and card numbers are never persisted (only a •••• 1234 mask).
import { prisma } from "../db";
import { spendCoinsIdempotent, getCoins } from "./coinService";

export const CASHOUT_CARD_MIN = 50_000; // 💳 plastik kartaga: min balance
export const CASHOUT_HOME_MIN = 100_000; // 🏠 naxt uyga: min balance

export type CashoutMethod = "card" | "home";

/**
 * The data the owner sees + acts on for a cash-out request. Built by either entry point (bot flow OR
 * the Mini App API) and handed to the bot's `notifyOwnerCashout` so the approve/reject buttons match.
 * Raw card/address fields live ONLY in this transient owner message — never persisted (only the mask).
 */
export interface CashoutOwnerNotice {
  id: number;
  name: string;
  amount: number;
  method: CashoutMethod;
  contact: string;
  trips: number;
  cardFull?: string; // card flow only — shown to owner, never stored
  cardHolder?: string;
  address?: string; // home flow only
}

/** A member may have at most one open request at a time — guards against double-submit spam. */
export async function hasPendingCashout(memberId: number): Promise<boolean> {
  return (await prisma.cashoutRequest.count({ where: { memberId, status: "pending" } })) > 0;
}

export async function createCashout(
  memberId: number,
  amount: number,
  method: CashoutMethod,
  mask: string,
  contact: string,
): Promise<{ id: number }> {
  const r = await prisma.cashoutRequest.create({ data: { memberId, amount, method, mask, contact } });
  return { id: r.id };
}

export async function getCashout(id: number) {
  return prisma.cashoutRequest.findUnique({ where: { id }, include: { member: true } });
}

/** Owner «✅ To'landi» → spend the tangas (idempotent) + mark paid. Re-checks the balance, so if the
 * rider spent the coins between request and approval it fails cleanly instead of going negative. */
export async function approveCashout(id: number): Promise<{ ok: boolean; reason?: string; amount?: number; memberId?: number }> {
  const r = await prisma.cashoutRequest.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: "not_found" };
  if (r.status !== "pending") return { ok: false, reason: r.status };
  const spent = await spendCoinsIdempotent(r.memberId, r.amount, "cashout", `💵 Naxt pul (#${r.id})`, `cashout:${r.id}`);
  if (!spent.ok) return { ok: false, reason: "insufficient", memberId: r.memberId };
  await prisma.cashoutRequest.update({ where: { id }, data: { status: "paid", decidedAt: new Date() } });
  return { ok: true, amount: r.amount, memberId: r.memberId };
}

/** Owner «❌ Rad» → mark rejected. Tangas are untouched (never deducted before approval). */
export async function rejectCashout(id: number): Promise<{ ok: boolean; memberId?: number; amount?: number }> {
  const r = await prisma.cashoutRequest.findUnique({ where: { id } });
  if (!r || r.status !== "pending") return { ok: false };
  await prisma.cashoutRequest.update({ where: { id }, data: { status: "rejected", decidedAt: new Date() } });
  return { ok: true, memberId: r.memberId, amount: r.amount };
}

/** Live balance — used to lock the cash-out amount at request time. */
export async function cashoutBalance(memberId: number): Promise<number> {
  return getCoins(memberId);
}
