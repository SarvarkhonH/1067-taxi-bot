// ⏰ I.2 scheduled rides + 👨‍👩‍👧 I.3 family booking.
// Scheduled: we store the order ourselves and the periodic tick dispatches it
// T-10min via the same throughWeb path (BOOKING_LIVE-gated). Family: up to 3
// saved relatives; the taxi goes to THEIR phone, the member keeps the receipt.
import type { Bot } from "grammy";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";

export const FAMILY_MAX = 3;
const DISPATCH_WINDOW_MS = 10 * 60_000;

export async function createScheduled(
  memberId: number,
  addressId: number,
  addressName: string,
  runAtIso: string,
  forPhone?: string,
): Promise<{ ok: boolean; reason?: string; id?: number; runAt?: string }> {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m?.phone) return { ok: false, reason: "no_phone" };
  const runAt = new Date(runAtIso);
  if (!Number.isFinite(runAt.getTime())) return { ok: false, reason: "bad_time" };
  if (runAt.getTime() < Date.now() + 15 * 60_000) return { ok: false, reason: "too_soon" }; // ≥15 min ahead
  if (runAt.getTime() > Date.now() + 7 * 86_400_000) return { ok: false, reason: "too_far" };
  const pending = await prisma.scheduledRide.count({ where: { memberId, status: "pending" } });
  if (pending >= 3) return { ok: false, reason: "too_many" };

  let phone = m.phone;
  if (forPhone) {
    const fam = await familyOf(memberId);
    const norm = forPhone.replace(/\D/g, "").slice(-9);
    if (!fam.some((f) => f.phone.endsWith(norm))) return { ok: false, reason: "not_family" };
    phone = forPhone;
  }
  const row = await prisma.scheduledRide.create({ data: { memberId, addressId, addressName, phone, runAt } });
  return { ok: true, id: row.id, runAt: runAt.toISOString() };
}

export async function cancelScheduled(memberId: number, id: number): Promise<{ ok: boolean }> {
  const r = await prisma.scheduledRide.updateMany({ where: { id, memberId, status: "pending" }, data: { status: "cancelled" } });
  return { ok: r.count > 0 };
}

export async function listScheduled(memberId: number): Promise<{ id: number; addressName: string; runAt: string; phone: string }[]> {
  const rows = await prisma.scheduledRide.findMany({ where: { memberId, status: "pending" }, orderBy: { runAt: "asc" } });
  return rows.map((r) => ({ id: r.id, addressName: r.addressName, runAt: r.runAt.toISOString(), phone: r.phone }));
}

/** Periodic: dispatch everything due within the next 10 minutes. */
export async function dispatchScheduled(bot: Bot): Promise<number> {
  const due = await prisma.scheduledRide.findMany({
    where: { status: "pending", runAt: { lte: new Date(Date.now() + DISPATCH_WINDOW_MS) } },
    take: 10,
  });
  let sent = 0;
  for (const r of due) {
    // claim first — a concurrent tick loses the race
    const claimed = await prisma.scheduledRide.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "dispatched" } });
    if (claimed.count === 0) continue;
    const member = await prisma.member.findUnique({ where: { id: r.memberId }, include: { telegramUser: true } });
    if (!env.bookingLive) {
      sent++;
      continue; // dry-run: status flip only (tests)
    }
    const res = await getDataSource()
      .createBooking({ clientName: member?.fullName ?? "Mijoz", addressName: r.addressName, addressId: r.addressId, phoneNumber: r.phone, additionalPayment: 0 })
      .catch(() => ({ ok: false }));
    if (!res.ok) {
      await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "failed" } }).catch(() => null);
    } else {
      sent++;
    }
    if (member?.telegramUser) {
      await bot.api
        .sendMessage(
          member.telegramUser.id,
          res.ok
            ? `⏰ Rejali taksingiz chiqarildi! 📍 ${r.addressName}${r.phone !== member.phone ? ` · 📞 ${r.phone} raqamiga` : ""}`
            : `⚠️ Rejali safar (${r.addressName}) yuborilmadi — qaytadan chaqiring yoki 1067 ga qo'ng'iroq qiling.`,
        )
        .catch(() => null);
    }
  }
  return sent;
}

// ── family ───────────────────────────────────────────────────────────────────
export async function familyOf(memberId: number): Promise<{ id: number; phone: string; name: string }[]> {
  return prisma.familyMember.findMany({ where: { memberId }, select: { id: true, phone: true, name: true } });
}

export async function addFamily(memberId: number, phone: string, name: string): Promise<{ ok: boolean; reason?: string }> {
  const norm = phone.replace(/\D/g, "").slice(-9);
  if (norm.length !== 9) return { ok: false, reason: "bad_phone" };
  const me = await prisma.member.findUnique({ where: { id: memberId } });
  if (me?.phone?.endsWith(norm)) return { ok: false, reason: "self" };
  if ((await prisma.familyMember.count({ where: { memberId } })) >= FAMILY_MAX) return { ok: false, reason: "max" };
  try {
    await prisma.familyMember.create({ data: { memberId, phone: norm, name: name.trim().slice(0, 30) || "Yaqinim" } });
  } catch {
    return { ok: false, reason: "already" };
  }
  return { ok: true };
}

export async function removeFamily(memberId: number, id: number): Promise<{ ok: boolean }> {
  const r = await prisma.familyMember.deleteMany({ where: { id, memberId } });
  return { ok: r.count > 0 };
}

/** Immediate booking for a family member's phone (validated against the list). */
export async function bookForFamily(
  memberId: number,
  familyId: number,
  pickupId: number,
  pickupName: string,
): Promise<{ ok: boolean; live: boolean; message?: string }> {
  const fam = await prisma.familyMember.findFirst({ where: { id: familyId, memberId } });
  if (!fam) return { ok: false, live: false, message: "Yaqin topilmadi" };
  const me = await prisma.member.findUnique({ where: { id: memberId } });
  if (!env.bookingLive) return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  const res = await getDataSource()
    .createBooking({ clientName: `${fam.name} (${me?.fullName ?? "1067"})`, addressName: pickupName, addressId: pickupId, phoneNumber: fam.phone, additionalPayment: 0 })
    .catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
  return { ok: res.ok, live: true, message: res.ok ? `🚕 ${fam.name}ga taksi chaqirildi!` : ("message" in res ? res.message : "Xatolik") };
}
