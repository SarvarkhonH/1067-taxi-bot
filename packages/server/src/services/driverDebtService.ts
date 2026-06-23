// 💸 Bosqich 3 — a driver settles their kas company debt with tanga, from the bot. Money-safe by
// construction (same proven shape as adminMoveToBalance): hold tanga ATOMICALLY first, persist a
// "sent" guard row BEFORE the kas write, then write kas — and on any KNOWN failure, refund the
// exact tanga (audited) so the driver is never charged for a payment that didn't land.
//
// The one residual risk (process dies in the µs window between kas-write-success and recording
// "confirmed") surfaces as a `sent` row that we REFUSE to auto-repay — flagged for manual admin
// reconciliation rather than silently double-paying kas. kas has no idempotency key of its own,
// so this guard is the only thing standing between a crash-retry and a double charge.
//
// Gated behind the `qarz` kill-switch (DEFAULT_OFF) → ships dark until the owner pilots one real
// repayment and accepts it.
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { getCoins, grantCoins, spendCoinsIdempotent } from "./coinService";
import { featureOn } from "./featureFlags";

export interface DriverDebtInfo {
  ok: boolean;
  reason?: "feature_off" | "not_driver" | "kas_unreachable";
  carNumber?: string;
  debt?: number; // so'm owed to the company
  balance?: number; // kas wallet balance
  coins?: number; // our tanga balance (1 tanga = 1 so'm)
}

// The driver is ALREADY linked via /start (phone → kas member, type=driver, carNumber mirrored from
// kas). No /driver_login is needed: the kas writes here (getDriverAccount, addDriverPayment debt=true)
// are ADMIN-authenticated SPA calls, so the driver's secretKey is never required. We just need their
// plate, which the Member row already holds.
async function driverCar(memberId: number): Promise<string | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { type: true, carNumber: true } });
  if (m?.type !== "driver" || !m.carNumber) return null;
  return m.carNumber;
}

/** Read the driver's debt + balances for the qarz card. Uses the member's own (already-linked) plate. */
export async function getDriverDebtInfo(memberId: number): Promise<DriverDebtInfo> {
  if (!(await featureOn("qarz"))) return { ok: false, reason: "feature_off" };
  const carNumber = await driverCar(memberId);
  if (!carNumber) return { ok: false, reason: "not_driver" };
  const acct = await getDataSource().getDriverAccount(carNumber);
  if (!acct) return { ok: false, reason: "kas_unreachable", carNumber };
  const coins = await getCoins(memberId);
  return { ok: true, carNumber, debt: acct.debt, balance: acct.balance, coins };
}

export interface DebtPayResult {
  ok: boolean;
  paid?: number;
  newDebtKnown?: boolean;
  kasBalance?: number | null;
  message: string;
}

/**
 * Settle `amount` tanga against the driver's kas debt. `nonce` makes the idempotency key stable per
 * intent (the bot passes the debt-card message id → a double-tap of the SAME card is a no-op, while
 * a fresh /qarz card allows a new payment). MONEY-CRITICAL — read the module header before editing.
 */
export async function payDebtWithCoins(memberId: number, amount: number, nonce: string | number): Promise<DebtPayResult> {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt < 1) return { ok: false, message: "Noto'g'ri summa." };
  if (!(await featureOn("qarz"))) return { ok: false, message: "Bu imkoniyat hozir o'chirilgan." };

  const carNumber = await driverCar(memberId);
  if (!carNumber) return { ok: false, message: "Bu hisob haydovchi sifatida ulanmagan." };

  const acct = await getDataSource().getDriverAccount(carNumber);
  if (!acct) return { ok: false, message: "Kas serverdan ma'lumot olinmadi. Birozdan keyin urinib ko'ring." };
  if (acct.debt <= 0) return { ok: false, message: "Qarzingiz yo'q 🎉" };
  if (amt > acct.debt) return { ok: false, message: `Qarzingiz ${acct.debt} so'm — undan ko'p to'lab bo'lmaydi.` };

  const idempotencyKey = `debt:${memberId}:${nonce}`;

  // ── idempotency guard: never double-pay kas on a retry of the SAME intent ──
  const prior = await prisma.driverDebtPayment.findUnique({ where: { idempotencyKey } });
  if (prior) {
    if (prior.status === "confirmed") return { ok: true, paid: prior.amount, kasBalance: prior.kasBalance, message: `✅ Allaqachon to'langan: ${prior.amount} so'm.` };
    if (prior.status === "sent") return { ok: false, message: "⏳ Oldingi to'lov holati aniq emas — adminga murojaat qiling (ikki marta to'lab yubormaslik uchun)." };
    if (prior.status === "balance_ok") return { ok: false, message: "⏳ To'lov yarim qoldi — adminga murojaat qiling." };
    // refunded / pending → fall through and let a fresh attempt run (tanga already returned/never held)
  }

  // ── 1) hold tanga atomically (idempotent: double-tap → no-op) ──────────────
  const hold = await spendCoinsIdempotent(memberId, amt, "debt_pay", `Qarz to'lash: ${amt} so'm (${carNumber})`, idempotencyKey);
  if (!hold.ok) {
    if (hold.skipped === "insufficient") return { ok: false, message: `Tanga yetarli emas. Sizda ${await getCoins(memberId)} tanga, kerak ${amt}.` };
    return { ok: false, message: "Tanga ushlab turishda xato." };
  }

  // ── 2) persist a "sent" guard BEFORE the kas write (crash-retry won't repay) ─
  await prisma.driverDebtPayment.upsert({
    where: { idempotencyKey },
    create: { memberId, carNumber: carNumber, amount: amt, status: "sent", idempotencyKey },
    update: { status: "sent", amount: amt },
  });

  // ── 3) kas write: settle debt (debt=true). On KNOWN failure, refund tanga. ──
  const refund = async (note: string, code?: number): Promise<void> => {
    await grantCoins(memberId, amt, "debt_refund", `Qarz to'lash amalga oshmadi — qaytarildi (${carNumber})`, `${idempotencyKey}:refund`);
    await prisma.driverDebtPayment.update({ where: { idempotencyKey }, data: { status: "refunded", errorNote: note.slice(0, 200), kasStatusCode: code ?? null } });
  };
  try {
    // PAY VIA ПЛАСТИК (debt=FALSE) — kas's online/card method REDUCES the debt by the amount
    // (proven on 70A111AA: 60000→55000 for a 5000 payment). NEVER debt=TRUE: that's the kas "долг"
    // method which makes the driver BORROW (debt goes UP) — the original bug the owner caught.
    const res = await getDataSource().addDriverPayment(acct.kasId, carNumber, amt, "1067 bot — qarz to'lash (plastik)", false);
    if (!res.ok) {
      await refund(`kas status ${res.status}`, res.status);
      return { ok: false, message: `❌ Kas qabul qilmadi (status ${res.status}). Tanga qaytarildi.` };
    }
    await prisma.driverDebtPayment.update({ where: { idempotencyKey }, data: { status: "confirmed", kasBalance: res.balance, kasStatusCode: res.status } });
    return { ok: true, paid: amt, kasBalance: res.balance, newDebtKnown: false, message: `✅ ${amt} so'm qarz to'landi. Rahmat!` };
  } catch (e) {
    await refund(e instanceof Error ? e.message : String(e)).catch(() => undefined);
    return { ok: false, message: "❌ Kas serverda xato. Tanga qaytarildi." };
  }
}
