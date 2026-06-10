import type {
  AdminActionResult,
  AdminAuditRow,
  AdminEconomy,
  AdminGrowth,
  AdminHealth,
  AdminLiveBooking,
} from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";
import { getJackpot } from "./weeklyService";
import { withPhoneLock } from "./coinService";

// ─── 🚦 system health ───────────────────────────────────────────────────────
export async function getHealth(): Promise<AdminHealth> {
  // kas reachability: one light lookup, timed
  const t0 = Date.now();
  let kasOk = false;
  let kasMsg = "skipped (mock)";
  if (env.KAS_MODE === "live") {
    try {
      await getDataSource().getCompanyInfo();
      kasOk = true;
      kasMsg = "reachable";
    } catch (e) {
      kasMsg = e instanceof Error ? e.message.slice(0, 80) : "unreachable";
    }
  } else {
    kasOk = true;
  }
  const kasMs = Date.now() - t0;

  const t1 = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    /* db down */
  }
  const dbMs = Date.now() - t1;

  const lastSync = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
  return {
    kas: { ok: kasOk, ms: kasMs, mode: env.KAS_MODE, message: kasMsg },
    db: { ok: dbOk, ms: dbMs },
    bot: env.hasBot,
    bookingLive: env.bookingLive,
    lastSync: lastSync
      ? {
          at: (lastSync.finishedAt ?? lastSync.startedAt).toISOString(),
          status: lastSync.status,
          ageMin: Math.round((Date.now() - (lastSync.finishedAt ?? lastSync.startedAt).getTime()) / 60000),
        }
      : null,
    serverTime: new Date().toISOString(),
  };
}

// ─── 💰 economy ─────────────────────────────────────────────────────────────
export async function getEconomy(): Promise<AdminEconomy> {
  const [outstanding, byKindRaw, wAll, wToday, jackpot] = await Promise.all([
    prisma.member.aggregate({ _sum: { coins: true } }),
    prisma.coinTxn.groupBy({ by: ["kind"], _sum: { amount: true }, _count: true }),
    prisma.withdrawal.aggregate({ where: { kasApplied: true }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { kasApplied: true, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } }, _sum: { amount: true } }),
    getJackpot(),
  ]);

  let emitted = 0;
  let sunk = 0;
  const byKind = byKindRaw
    .map((g) => {
      const total = g._sum.amount ?? 0;
      if (total > 0) emitted += total;
      else if (g.kind !== "withdraw") sunk += -total;
      return { kind: g.kind, total, count: g._count };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return {
    coinsOutstanding: outstanding._sum.coins ?? 0,
    emitted,
    sunk,
    withdrawnTotal: wAll._sum.amount ?? 0,
    withdrawnToday: wToday._sum.amount ?? 0,
    jackpot,
    byKind,
  };
}

// ─── 📈 growth ──────────────────────────────────────────────────────────────
export async function getGrowth(): Promise<AdminGrowth> {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const ago7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const ago24 = new Date(Date.now() - 24 * 3600 * 1000);
  const [botUsers, linked, newToday, new7d, active24h, coinHolders] = await Promise.all([
    prisma.telegramUser.count(),
    prisma.telegramUser.count({ where: { memberId: { not: null } } }),
    prisma.telegramUser.count({ where: { createdAt: { gte: startToday } } }),
    prisma.telegramUser.count({ where: { createdAt: { gte: ago7 } } }),
    prisma.telegramUser.count({ where: { updatedAt: { gte: ago24 } } }),
    prisma.member.count({ where: { coins: { gt: 0 } } }),
  ]);
  return { botUsers, linked, newToday, new7d, active24h, coinHolders };
}

// ─── 🚖 live bookings ───────────────────────────────────────────────────────
export async function getLiveBookings(): Promise<AdminLiveBooking[]> {
  const list = await getDataSource().listActiveBookings().catch(() => []);
  return list.map((b) => ({
    id: b.id,
    phone: b.phoneNorm,
    addressName: b.addressName,
    status: b.status,
    carNumber: b.carNumber || null,
    cashback: b.clientBonus,
    ageMin: 0,
    hasDriver: !!b.carNumber,
  }));
}

// ─── 📜 audit log ───────────────────────────────────────────────────────────
export async function getAuditLog(limit = 60): Promise<AdminAuditRow[]> {
  const [grants, withdrawals] = await Promise.all([
    prisma.rewardGrant.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { member: { select: { fullName: true } } } }),
    prisma.withdrawal.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { member: { select: { fullName: true } } } }),
  ]);
  const rows: AdminAuditRow[] = [
    ...grants.map((g) => ({ at: g.createdAt.toISOString(), kind: g.kind, member: g.member.fullName, amount: g.amount, reason: g.reason, appliedToKas: g.appliedToKas })),
    ...withdrawals.map((w) => ({ at: w.createdAt.toISOString(), kind: "withdraw", member: w.member.fullName, amount: -w.amount, reason: w.kasApplied ? "so'mga aylandi" : "muvaffaqiyatsiz", appliedToKas: w.kasApplied })),
  ];
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

// ─── 💸 grant cashback (admin write) ────────────────────────────────────────
const ADMIN_GRANT_DAILY_CAP = 500_000; // total positive so'm admins can grant per rolling 24h

export async function adminGrant(target: string, amount: number, reason: string, adminId: string): Promise<AdminActionResult> {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 1_000_000) return { ok: false, message: "Noto'g'ri summa (±1..1000000)" };

  // bound a compromised admin: cap total positive grants per rolling 24h
  if (amt > 0) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const agg = await prisma.rewardGrant.aggregate({ where: { kind: "admin", amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } });
    if ((agg._sum.amount ?? 0) + amt > ADMIN_GRANT_DAILY_CAP) {
      return { ok: false, message: `Kunlik admin-grant limiti (${ADMIN_GRANT_DAILY_CAP.toLocaleString("ru-RU")} so'm) oshib ketadi` };
    }
  }

  const norm = target.replace(/\D/g, "").slice(-9);

  let member =
    (await prisma.member.findMany({ where: { type: "client", phone: { not: null } } })).find(
      (m) => m.phone!.replace(/\D/g, "").slice(-9) === norm,
    ) ?? null;
  if (!member?.phone) {
    // on-demand pull from kas
    try {
      for (const km of await getDataSource().fetchByPhone(target)) {
        if (km.type === "client") {
          member = await prisma.member.upsert({
            where: { type_kasId: { type: "client", kasId: km.kasId } },
            create: { type: "client", kasId: km.kasId, fullName: km.fullName, phone: km.phone ?? target, points: km.points, trips: km.trips, rating: km.rating },
            update: { points: km.points },
          });
          break;
        }
      }
    } catch {
      /* lookup failed */
    }
  }
  if (!member?.phone) return { ok: false, message: "Bu raqamli mijoz topilmadi" };

  try {
    // share the user-facing withdraw/topup lock so an admin grant can't race a
    // simultaneous withdrawal on the same phone (kas has no compare-and-set)
    const phone = member.phone;
    const res = await withPhoneLock(phone, () => getDataSource().addClientBonus(phone, amt));
    await prisma.rewardGrant.create({
      data: { memberId: member.id, amount: amt, reason: `Admin: ${reason || "qo'lda"} (by ${adminId.slice(-4)})`, kind: "admin", appliedToKas: res.ok, kasMessage: res.ok ? `${res.oldBonus} -> ${res.newBonus}` : `failed ${res.status}` },
    });
    if (res.ok) await prisma.member.update({ where: { id: member.id }, data: { points: { increment: amt } } });
    return res.ok
      ? { ok: true, message: `✅ ${member.fullName}: ${amt > 0 ? "+" : ""}${amt} so'm (${res.oldBonus} → ${res.newBonus})` }
      : { ok: false, message: `kas xato: ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 100) : "xatolik" };
  }
}

// ─── 📣 announce (admin broadcast) ──────────────────────────────────────────
export async function adminAnnounce(
  text: string,
  segment: "all" | "linked",
  send: (telegramId: string, html: string) => Promise<void>,
): Promise<AdminActionResult> {
  const body = text.trim();
  if (body.length < 3 || body.length > 2000) return { ok: false, message: "Matn 3..2000 belgi bo'lsin" };
  if (segment !== "all" && segment !== "linked") return { ok: false, message: "Segment noto'g'ri" };
  // escape HTML so a literal <, >, & in admin text can't break EVERY send (Telegram 400)
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const users = await prisma.telegramUser.findMany({
    where: segment === "linked" ? { memberId: { not: null } } : {},
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      await send(u.id, `📣 <b>1067 Taxi</b>\n\n${esc}`);
      sent++;
    } catch {
      failed++; // user blocked the bot (or transient) — skip
    }
    if ((sent + failed) % 25 === 0) await new Promise((r) => setTimeout(r, 1000)); // gentle rate-limit
  }
  console.log(`[admin] announce segment=${segment} sent=${sent}/${users.length} len=${body.length}`);
  return { ok: true, message: `📤 ${sent}/${users.length} yuborildi${failed ? ` (${failed} yetib bormadi)` : ""}` };
}
