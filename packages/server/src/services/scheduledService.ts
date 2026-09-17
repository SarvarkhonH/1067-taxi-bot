// ⏰ I.2 scheduled rides + 👨‍👩‍👧 I.3 family booking.
// Scheduled: we store the order ourselves and the periodic tick dispatches it
// T-10min via the same throughWeb path (BOOKING_LIVE-gated). Family: up to 3
// saved relatives; the taxi goes to THEIR phone, the member keeps the receipt.
import type { Bot } from "grammy";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource, type BookingResult } from "../kas";

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
  // A scheduled ride stores only a place id, so only a catalogue place can be dispatched from it later
  // (a map pin or saved place would reach the core with no coordinates and be refused at run time).
  const { catalogPlaceById } = await import("./bookingService");
  if (!(await catalogPlaceById(addressId))) return { ok: false, reason: "bad_place" };

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
    // An unanswered order holds the member's dispatches for a few minutes — wait it out, don't add a car.
    const { isDispatchHeld, catalogPlaceById, claimDispatchSlot, releaseDispatchSlot } = await import("./bookingService");
    if (await isDispatchHeld(r.memberId)) {
      await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "pending" } }).catch(() => null);
      continue;
    }
    const place = await catalogPlaceById(r.addressId);
    if (!place) {
      // An EMPTY catalogue means the core could not be read, not that the place is gone: retry.
      const { getAddressCatalog } = await import("./addressCatalog");
      if ((await getAddressCatalog().catch(() => [])).length === 0 && Date.now() - r.runAt.getTime() < DISPATCH_WINDOW_MS) {
        await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "pending" } }).catch(() => null);
        continue;
      }
    }
    // For the member's own phone, the same atomic slot as a manual tap: the two can't both send a car.
    const ownPhone = !!member?.phone && member.phone.replace(/\D/g, "").slice(-9) === r.phone.replace(/\D/g, "").slice(-9);
    const slot = ownPhone && place ? await claimDispatchSlot(r.memberId) : null;
    if (slot && !slot.ok) {
      await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "pending" } }).catch(() => null);
      continue;
    }
    // Never a second car: that phone already having a ride skips this one; a core that cannot be read
    // puts the ride back for the next tick instead of guessing "no ride".
    let already: Awaited<ReturnType<ReturnType<typeof getDataSource>["getActiveBooking"]>>;
    try {
      already = await getDataSource().getActiveBooking(r.phone);
    } catch {
      if (Date.now() - r.runAt.getTime() < DISPATCH_WINDOW_MS) {
        await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "pending" } }).catch(() => null);
        continue;
      }
      already = null; // long overdue — try once rather than leave it pending forever
    }
    const res: BookingResult = already
      ? { ok: false, message: "active" }
      : !place
        ? { ok: false, message: "place" }
        : await getDataSource()
          .createBooking({ clientName: member?.fullName ?? "Mijoz", addressName: r.addressName, addressId: r.addressId, phoneNumber: r.phone, additionalPayment: 0 })
          .catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : String(e) }));
    // No answer = the order may exist: leave it "dispatched", hold the member, and say so — never "send again".
    if (res.unknown) {
      const { holdAfterUnknownDispatch } = await import("./bookingService");
      await holdAfterUnknownDispatch(r.memberId);
    }
    if (!res.ok && !res.unknown) {
      if (slot?.ok) await releaseDispatchSlot(r.memberId, slot.prev);
      await prisma.scheduledRide.update({ where: { id: r.id }, data: { status: "failed" } }).catch(() => null);
    } else {
      sent++;
    }
    if (member?.telegramUser) {
      // BLK-1: foydalanuvchining O'ZI rejalashtirgan safari — `force` (hech qachon bostirilmaydi)
      const { pushSend } = await import("./pushSend");
      const html = res.ok
        ? `⏰ Rejali taksingiz chiqarildi! 📍 ${r.addressName}${r.phone !== member.phone ? ` · 📞 ${r.phone} raqamiga` : ""}`
        : res.unknown
          ? `⏰ Rejali safar (${r.addressName}) yuborildi, tizim javobini kutyapmiz — qayta chaqirmang, holati «📍 Buyurtmam»da chiqadi.`
          : already
            ? `ℹ️ Rejali safar (${r.addressName}) chiqarilmadi — bu raqamda allaqachon faol buyurtma bor.`
            : !place
              ? `⚠️ Rejali safar (${r.addressName}) chiqarilmadi — bu joy endi ro'yxatda yo'q. Qaytadan chaqiring yoki 1067 ga qo'ng'iroq qiling.`
              : `⚠️ Rejali safar (${r.addressName}) yuborilmadi — qaytadan chaqiring yoki 1067 ga qo'ng'iroq qiling.`;
      await pushSend(member.telegramUser.id, "sched_ride", () => bot.api.sendMessage(member.telegramUser!.id, html), { memberId: member.id, force: true });
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
  // Only a catalogue place: this path carries no coordinates.
  const { catalogPlaceById, claimDispatchSlot, releaseDispatchSlot, holdAfterUnknownDispatch, isDispatchHeld } = await import("./bookingService");
  const place = await catalogPlaceById(pickupId);
  if (!place) return { ok: false, live: env.bookingLive, message: "Ro'yxatdagi joylardan birini tanlang." };
  if (!env.bookingLive) return { ok: true, live: false, message: "TEST rejimi — haqiqiy taxi chaqirilmadi" };
  if (await isDispatchHeld(memberId)) return { ok: false, live: true, message: "Oldingi buyurtma holati aniqlanmoqda — bir necha daqiqadan keyin urinib ko'ring." };
  // never a second car for that phone; an unreadable core is not "no ride"
  const already = await getDataSource().getActiveBooking(fam.phone).then((b) => !!b, () => null);
  if (already === null) return { ok: false, live: true, message: "Taksi tizimi hozir javob bermayapti — 1067 ga qo'ng'iroq qiling." };
  if (already) return { ok: false, live: true, message: `${fam.name}da allaqachon faol buyurtma bor.` };
  // the same atomic slot as every other dispatch path: two taps can't both send a car
  const slot = await claimDispatchSlot(memberId);
  if (!slot.ok) return { ok: false, live: true, message: "Hozirgina buyurtma yuborilgan — biroz kuting" };
  const res: BookingResult = await getDataSource()
    .createBooking({ clientName: `${fam.name} (${me?.fullName ?? "1067"})`, addressName: place.name, addressId: place.id, phoneNumber: fam.phone, additionalPayment: 0 })
    .catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : String(e) }));
  if (res.ok) return { ok: true, live: true, message: `🚕 ${fam.name}ga taksi chaqirildi!` };
  if (res.unknown) {
    await holdAfterUnknownDispatch(memberId);
    return { ok: false, live: true, message: "Buyurtma yuborildi, tizim javobini kutyapmiz — qayta bosmang." };
  }
  await releaseDispatchSlot(memberId, slot.prev);
  return { ok: false, live: true, message: res.message ?? "Buyurtma yuborilmadi — 1067 ga qo'ng'iroq qiling." };
}
