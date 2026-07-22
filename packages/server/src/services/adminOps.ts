import type {
  AdminActionResult,
  AdminAuditRow,
  AdminEconomy,
  AdminGrowth,
  AdminHealth,
  AdminLiveBooking,
  BallDistribution,
} from "@t1067/shared";
import { LEVELS, computeXp, levelForXp } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";
import { getJackpot } from "./weeklyService";
import { grantCoins, withPhoneLock } from "./coinService";

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

  // In LIVE mode there is NO bulk runSync (SyncRun row) — members are refreshed per-user each
  // tick (refreshLinkedMembers), which stamps member.lastSyncAt. So the true "sync is alive"
  // signal in live mode is the freshest member.lastSyncAt, NOT the (permanently stale) SyncRun.
  // Using SyncRun in live mode made the health card show a false RED "20 days ago".
  let lastSyncInfo: AdminHealth["lastSync"] = null;
  if (env.KAS_MODE === "live") {
    const fresh = await prisma.member.findFirst({ where: { lastSyncAt: { not: null } }, orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } });
    if (fresh?.lastSyncAt) {
      lastSyncInfo = { at: fresh.lastSyncAt.toISOString(), status: "ok", ageMin: Math.round((Date.now() - fresh.lastSyncAt.getTime()) / 60000) };
    }
  } else {
    const lastSync = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
    if (lastSync) {
      lastSyncInfo = {
        at: (lastSync.finishedAt ?? lastSync.startedAt).toISOString(),
        status: lastSync.status,
        ageMin: Math.round((Date.now() - (lastSync.finishedAt ?? lastSync.startedAt).getTime()) / 60000),
      };
    }
  }
  return {
    kas: { ok: kasOk, ms: kasMs, mode: env.KAS_MODE, message: kasMsg },
    db: { ok: dbOk, ms: dbMs },
    bot: env.hasBot,
    bookingLive: env.bookingLive,
    lastSync: lastSyncInfo,
    serverTime: new Date().toISOString(),
  };
}

// ─── 💰 economy ─────────────────────────────────────────────────────────────
export async function getEconomy(): Promise<AdminEconomy> {
  const { getWithdrawBudget } = await import("./economyService");
  const [outstanding, byKindRaw, wAll, wToday, jackpot, budget] = await Promise.all([
    prisma.member.aggregate({ _sum: { coins: true } }),
    prisma.coinTxn.groupBy({ by: ["kind"], _sum: { amount: true }, _count: true }),
    prisma.withdrawal.aggregate({ where: { kasApplied: true }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { kasApplied: true, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } }, _sum: { amount: true } }),
    getJackpot(),
    getWithdrawBudget(),
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
    withdrawBudget: budget,
  };
}

// 🏅 Tier loyalty monitoring: client tier distribution (computed XP → level) + ball stats.
// Tier is derived (points + trips*2 + ballPoints), so this is a live read over all clients.
export async function getBallDistribution(): Promise<BallDistribution> {
  const clients = await prisma.member.findMany({ where: { type: "client" }, select: { points: true, trips: true, ballPoints: true } });
  const tiers = LEVELS.map((l) => ({ index: l.index, name: l.name, emoji: l.emoji, color: l.color, count: 0, ballSum: 0 }));
  let totalBall = 0, withBall = 0, maxBall = 0;
  for (const c of clients) {
    const lvl = levelForXp(computeXp({ points: c.points, trips: c.trips, ballPoints: c.ballPoints })).level;
    const t = tiers[lvl.index]!;
    t.count++;
    t.ballSum += c.ballPoints;
    totalBall += c.ballPoints;
    if (c.ballPoints > 0) withBall++;
    if (c.ballPoints > maxBall) maxBall = c.ballPoints;
  }
  return {
    members: clients.length,
    withBall,
    totalBall,
    avgBall: withBall > 0 ? Math.round(totalBall / withBall) : 0,
    maxBall,
    tiers,
  };
}

/** 💼 Platform commission revenue (PlatformLedger): lifetime + last 24h, coins collected. */
export async function platformEarned(): Promise<{ total: number; today: number }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [all, today] = await Promise.all([
    prisma.platformLedger.aggregate({ _sum: { amount: true } }),
    prisma.platformLedger.aggregate({ where: { createdAt: { gte: since } }, _sum: { amount: true } }),
  ]);
  return { total: all._sum.amount ?? 0, today: today._sum.amount ?? 0 };
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

// 🪙 Grant/deduct TANGA by PHONE — resolves the account the user actually uses (telegram-linked
// first, else client). The actions-panel "give money" uses this: an admin top-up must land as
// SPENDABLE TANGA (wallet / games / transfers / fare), not as kas cashback.
export async function adminGrantCoinsByPhone(phone: string, amount: number, reason: string, adminId: string): Promise<AdminActionResult> {
  const norm = phone.replace(/\D/g, "").slice(-9);
  if (norm.length < 9) return { ok: false, message: "Raqam noto'g'ri (+998…)" };
  let members = await prisma.member.findMany({ where: { phone: { endsWith: norm } }, include: { telegramUser: true } });
  if (!members.length) {
    // on-demand: pull this phone from kas (client OR driver) + upsert (adopt-aware), so an account
    // that hasn't used the bot yet can STILL be bonused by phone — same as the cashback grant does.
    try {
      const { upsertKasMember } = await import("./memberService");
      for (const km of await getDataSource().fetchByPhone(phone)) await upsertKasMember(km);
    } catch {
      /* kas lookup best-effort */
    }
    members = await prisma.member.findMany({ where: { phone: { endsWith: norm } }, include: { telegramUser: true } });
  }
  if (!members.length) return { ok: false, message: "Bu raqamli foydalanuvchi 1067'da topilmadi" };
  const target = members.find((m) => m.telegramUser) ?? members.find((m) => m.type === "client") ?? members[0]!;
  return adminGrantCoins(target.id, amount, reason, adminId);
}

// Grant/deduct TANGA (coins) to a SPECIFIC account by id — any type (client OR driver). Fixes the
// adminGrant gap: that one is client-only + writes kas POINTS by phone, so a grant to a driver (or
// to someone who has both a client AND a driver account) never lands on the account the owner sees.
export async function adminGrantCoins(memberId: number, amount: number, reason: string, adminId: string): Promise<AdminActionResult> {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 1_000_000) return { ok: false, message: "Noto'g'ri summa (±1..1000000)" };
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, fullName: true, type: true, coins: true } });
  if (!member) return { ok: false, message: "Akkaunt topilmadi" };
  if (amt > 0) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const agg = await prisma.coinTxn.aggregate({ where: { kind: "admin_coin", amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } });
    if ((agg._sum.amount ?? 0) + amt > ADMIN_GRANT_DAILY_CAP) return { ok: false, message: `Kunlik admin-tanga limiti (${ADMIN_GRANT_DAILY_CAP.toLocaleString("ru-RU")}) oshib ketadi` };
    const g = await grantCoins(member.id, amt, "admin_coin", `Admin tanga: ${reason || "qo'lda"} (by ${adminId.slice(-4)})`, `admincoin:${member.id}:${Date.now()}`);
    return g.ok ? { ok: true, message: `✅ ${member.fullName} [${member.type}]: +${amt} tanga (balans ${g.balance})` } : { ok: false, message: "Berib bo'lmadi" };
  }
  const ded = Math.min(member.coins, -amt); // never below 0
  if (ded <= 0) return { ok: false, message: "Balans 0 — ayirib bo'lmaydi" };
  await prisma.$transaction(async (tx) => {
    await tx.coinTxn.create({ data: { memberId: member.id, amount: -ded, kind: "admin_coin", reason: `Admin tanga ayirdi: ${reason || "qo'lda"} (by ${adminId.slice(-4)})` } });
    await tx.member.update({ where: { id: member.id }, data: { coins: { decrement: ded } } });
  });
  return { ok: true, message: `✅ ${member.fullName} [${member.type}]: −${ded} tanga (balans ${member.coins - ded})` };
}

// 💼 Admin: move an account's OWN tanga → their OWN kas balance, with NO daily cap.
// The user-facing withdraw has a 50 000/day per-user cap (anti-farm); the owner legitimately
// needs to settle a real user's full tanga in one go, so this ADMIN-TRUSTED path bypasses that
// cap. Money-safe by construction: deduct atomically FIRST (never below 0, audited), then write
// kas — and if the kas write fails/throws, REFUND the exact amount (audited) so tanga is never lost.
export async function adminMoveToBalance(memberId: number, amount: number, adminId: string): Promise<AdminActionResult> {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt < 1 || amt > 1_000_000) return { ok: false, message: "Noto'g'ri summa (1..1000000)" };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, type: true, fullName: true, coins: true, kasId: true, carNumber: true, phone: true },
  });
  if (!member) return { ok: false, message: "Akkaunt topilmadi" };
  if (member.type === "driver" ? member.kasId == null : !member.phone) {
    return { ok: false, message: member.type === "driver" ? "Haydovchi kas-id yo'q" : "Telefon raqami yo'q" };
  }
  const last4 = adminId.slice(-4);

  // A3 (audit P0): kas has no idempotency key — an unresolved "sent" marker means a previous
  // move's kas outcome is UNKNOWN (crash/timeout mid-write). Block until it's manually resolved.
  const { pendingCreate, pendingResolve } = await import("./appStateUtil");
  const stale = await prisma.appState.findFirst({ where: { key: { startsWith: `pending:admmove:m${memberId}-` } }, select: { key: true } });
  if (stale) return { ok: false, message: `⏳ Oldingi ko'chirish holati NOANIQ (${stale.key}) — kas balansini tekshirib clearPending.ts bilan yeching.` };

  // ── atomic deduct: never below 0 (the row-level guard is the whole safety) ──
  const dec = await prisma.member.updateMany({ where: { id: memberId, coins: { gte: amt } }, data: { coins: { decrement: amt } } });
  if (dec.count === 0) return { ok: false, message: "Tanga yetarli emas" };
  await prisma.coinTxn.create({ data: { memberId, amount: -amt, kind: "admin_coin", reason: `Admin: balansga ko'chirdi (by ${last4})` } });

  // ── kas write: driver → own driver balance; client → own cashback bonus ──
  const refund = async (): Promise<void> => {
    await prisma.member.update({ where: { id: memberId }, data: { coins: { increment: amt } } });
    await prisma.coinTxn.create({ data: { memberId, amount: amt, kind: "admin_coin", reason: "balansga ko'chirish amalga oshmadi — qaytarildi" } });
  };
  // "sent" guard BEFORE the kas write (driverDebtService pattern) — a crash mid-write leaves a
  // durable marker + blocks the next attempt instead of silently double-paying on retry.
  const reqId = `m${memberId}-${Date.now()}`;
  await pendingCreate("admmove", reqId, { memberId, amount: amt, note: `by ${last4}` });
  try {
    const res =
      member.type === "driver"
        ? await getDataSource().addDriverPayment(Number(member.kasId), member.carNumber ?? "", amt, "Admin balans")
        : await getDataSource().addClientBonus(member.phone!, amt);
    await pendingResolve("admmove", reqId); // kas ANSWERED — outcome known either way
    if (!res.ok) {
      await refund();
      return { ok: false, message: `kas xato: status ${"status" in res ? res.status : "?"}` };
    }
    const where = member.type === "driver" ? `balans: ${(res as { balance: number | null }).balance}` : `${(res as { oldBonus: number; newBonus: number }).oldBonus} → ${(res as { oldBonus: number; newBonus: number }).newBonus}`;
    return { ok: true, message: `✅ ${member.fullName}: ${amt} tanga → balans (${where})` };
  } catch (e) {
    // UNKNOWN outcome (throw = timeout/socket death): kas MAY have applied it. No auto-refund
    // (that's the double-pay); coins stay held, marker stays, admin resolves manually.
    return { ok: false, message: `⚠️ kas javob bermadi — holat NOANIQ, tanga ushlab turildi. Kas balansini tekshirib pending:admmove:${reqId} ni yeching. (${e instanceof Error ? e.message.slice(0, 60) : "xato"})` };
  }
}

// ─── 📣 announce / 🎁 segment grant / 😴 wake-up (admin) ─────────────────────
export type AdminSegment = "all" | "linked" | "dormant";
const ADMIN_DAY = 24 * 3600 * 1000;

/** Telegram ids of DORMANT linked clients — no ride in `days` (re-engagement target). */
async function dormantClientTgIds(days: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - Math.max(1, days) * ADMIN_DAY);
  const recent = await prisma.rideReward.findMany({ where: { createdAt: { gte: cutoff } }, distinct: ["memberId"], select: { memberId: true } });
  const active = new Set(recent.map((r) => r.memberId));
  const clients = await prisma.member.findMany({ where: { type: "client", telegramUser: { isNot: null } }, select: { id: true, telegramUser: { select: { id: true } } } });
  return clients.filter((c) => c.telegramUser && !active.has(c.id)).map((c) => c.telegramUser!.id);
}
/** Member ids for a segment (for bulk grant). */
async function segmentMemberIds(segment: AdminSegment, days: number): Promise<number[]> {
  if (segment === "dormant") {
    const cutoff = new Date(Date.now() - Math.max(1, days) * ADMIN_DAY);
    const recent = await prisma.rideReward.findMany({ where: { createdAt: { gte: cutoff } }, distinct: ["memberId"], select: { memberId: true } });
    const active = new Set(recent.map((r) => r.memberId));
    const clients = await prisma.member.findMany({ where: { type: "client", telegramUser: { isNot: null } }, select: { id: true } });
    return clients.filter((c) => !active.has(c.id)).map((c) => c.id);
  }
  const ms = await prisma.member.findMany({ where: segment === "linked" ? { telegramUser: { isNot: null } } : {}, select: { id: true } });
  return ms.map((m) => m.id);
}

export async function adminAnnounce(
  text: string,
  segment: AdminSegment,
  send: (telegramId: string, html: string) => Promise<void>,
  days = 14,
): Promise<AdminActionResult> {
  const body = text.trim();
  if (body.length < 3 || body.length > 2000) return { ok: false, message: "Matn 3..2000 belgi bo'lsin" };
  if (!["all", "linked", "dormant"].includes(segment)) return { ok: false, message: "Segment noto'g'ri" };
  // escape HTML so a literal <, >, & in admin text can't break EVERY send (Telegram 400)
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const users = segment === "dormant"
    ? (await dormantClientTgIds(days)).map((id) => ({ id }))
    : await prisma.telegramUser.findMany({ where: segment === "linked" ? { memberId: { not: null } } : {}, select: { id: true } });
  let sent = 0;
  const failedIds: string[] = [];
  for (const u of users) {
    try {
      await send(u.id, `📣 <b>1067 Taxi</b>\n\n${esc}`);
      sent++;
    } catch {
      failedIds.push(u.id); // user blocked the bot (or transient) — record who
    }
    if ((sent + failedIds.length) % 25 === 0) await new Promise((r) => setTimeout(r, 1000)); // gentle rate-limit
  }
  console.log(`[admin] announce segment=${segment} sent=${sent}/${users.length} len=${body.length}`);
  // resolve names/phones for the un-reached so the admin can call/re-invite them
  const failedList = failedIds.length
    ? (await prisma.telegramUser.findMany({
        where: { id: { in: failedIds } },
        select: { id: true, firstName: true, lastName: true, username: true, member: { select: { fullName: true, displayName: true, phone: true } } },
      })).map((t) => ({
        telegramId: t.id,
        name: t.member?.displayName || t.member?.fullName || [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : t.id),
        phone: t.member?.phone ?? null,
      }))
    : [];
  // 📢 PERSIST the delivery log so the owner can see who was NOT reached at any
  // time (not just right after sending). Design: Broadcast row always (counts),
  // BroadcastRecipient rows ONLY for FAILED recipients (full list, forever) —
  // sent users are a count, which keeps rows bounded. Persist errors never
  // break the announce result itself.
  try {
    await prisma.broadcast.create({
      data: {
        text: body,
        segment,
        sentCount: sent,
        failedCount: failedIds.length,
        totalCount: users.length,
        recipients: failedList.length
          ? { create: failedList.map((f) => ({ telegramId: f.telegramId, name: f.name, phone: f.phone, status: "failed" })) }
          : undefined,
      },
    });
  } catch (e) {
    console.error("[admin] broadcast log persist failed", e);
  }
  return {
    ok: true,
    message: `📤 ${sent}/${users.length} yuborildi${failedIds.length ? ` (${failedIds.length} yetib bormadi)` : ""}`,
    failedList,
  };
}

// ─── 📢 persistent broadcast history ───────────────────────────────────────
export async function getAdminBroadcasts(limit = 50): Promise<{ id: number; createdAt: string; text: string; segment: string; sentCount: number; failedCount: number; totalCount: number }[]> {
  const rows = await prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((b) => ({ id: b.id, createdAt: b.createdAt.toISOString(), text: b.text, segment: b.segment, sentCount: b.sentCount, failedCount: b.failedCount, totalCount: b.totalCount }));
}

export async function getAdminBroadcastDetail(id: number): Promise<{ id: number; createdAt: string; text: string; segment: string; sentCount: number; failedCount: number; totalCount: number; failed: { telegramId: string; name: string; phone: string | null }[] } | null> {
  const b = await prisma.broadcast.findUnique({ where: { id }, include: { recipients: { where: { status: "failed" }, orderBy: { id: "asc" } } } });
  if (!b) return null;
  return {
    id: b.id, createdAt: b.createdAt.toISOString(), text: b.text, segment: b.segment,
    sentCount: b.sentCount, failedCount: b.failedCount, totalCount: b.totalCount,
    failed: b.recipients.map((r) => ({ telegramId: r.telegramId, name: r.name, phone: r.phone })),
  };
}

/** 🎁 Bulk grant tanga to a whole segment (idempotent per batch, hard total-emission guard). */
export async function adminGrantSegment(segment: AdminSegment, amount: number, reason: string, adminId: string, days = 14): Promise<AdminActionResult> {
  amount = Math.floor(amount);
  if (!(amount > 0) || amount > 100000) return { ok: false, message: "Summa 1..100000 bo'lsin" };
  const ids = await segmentMemberIds(segment, days);
  const total = ids.length * amount;
  if (total > 5_000_000) return { ok: false, message: `Juda katta: ${ids.length} × ${amount} = ${total.toLocaleString("ru-RU")} tanga. Kichikroq summa yoki segment tanlang.` };
  const batch = `adminseg:${Date.now()}`;
  let granted = 0;
  let skipped = 0;
  for (const id of ids) {
    const g = await grantCoins(id, amount, "admin_gift", reason || "🎁 1067 sovg'asi", `${batch}:${id}`).catch(() => ({ ok: false } as { ok: boolean }));
    if (g.ok) granted++;
    else skipped++;
    if ((granted + skipped) % 25 === 0) await new Promise((r) => setTimeout(r, 400));
  }
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(`🎁 Admin segment-bonus: <b>${amount}</b> tanga × ${granted} a'zo (segment ${segment}) — admin ${adminId}`).catch(() => undefined);
  console.log(`[admin] grant-segment ${segment} amount=${amount} granted=${granted}/${ids.length}`);
  return { ok: true, message: `🎁 ${granted}/${ids.length} a'zoga ${amount} tanga berildi${skipped ? ` (${skipped} o'tkazildi)` : ""}` };
}

/** 😴 Wake-up: message the dormant segment AND (optionally) drop a comeback bonus — one action. */
export async function adminWakeUp(text: string, bonus: number, days: number, send: (telegramId: string, html: string) => Promise<void>, adminId: string): Promise<AdminActionResult> {
  const msg = await adminAnnounce(text, "dormant", send, days);
  if (!msg.ok) return msg;
  let gift = "";
  if (Math.floor(bonus) > 0) {
    const g = await adminGrantSegment("dormant", Math.floor(bonus), "🎁 Sizni sog'indik — qaytib keling!", adminId, days);
    gift = g.ok ? ` · ${g.message}` : ` · ⚠️ bonus: ${g.message}`;
  }
  return { ok: true, message: `😴→🔔 ${msg.message}${gift}` };
}

// ─── 🏁 ride history (from RideReward — our local record of every cashback-earning trip) ───
export async function getAdminRides(limit = 150): Promise<{ id: number; memberId: number; memberName: string; phone: string | null; bookingId: number; amount: number; tier: string; lucky: boolean; source: string; at: string }[]> {
  const rows = await prisma.rideReward.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const memberIds = [...new Set(rows.map((r) => r.memberId))];
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, fullName: true, phone: true },
  });
  const mmap = new Map(members.map((m) => [m.id, m]));
  return rows.map((r) => {
    const m = mmap.get(r.memberId);
    return {
      id: r.id,
      memberId: r.memberId,
      memberName: m?.fullName ?? "—",
      phone: m?.phone ?? null,
      bookingId: r.bookingId,
      amount: r.amount,
      tier: r.tier,
      lucky: r.lucky,
      source: r.source,
      at: r.createdAt.toISOString(),
    };
  });
}

// ─── 💳 driver debt payments ─────────────────────────────────────────────────
export async function getAdminDriverDebts(limit = 100): Promise<{ id: number; memberId: number; carNumber: string; amount: number; status: string; kasBalance: number | null; errorNote: string | null; at: string }[]> {
  const rows = await prisma.driverDebtPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    carNumber: r.carNumber,
    amount: r.amount,
    status: r.status,
    kasBalance: r.kasBalance ?? null,
    errorNote: r.errorNote ?? null,
    at: r.createdAt.toISOString(),
  }));
}

// ─── 👥 referral chain ───────────────────────────────────────────────────────
export async function getAdminReferrals(limit = 200): Promise<{ id: number; referrerId: string; referrerName: string; refereeId: string; refereeName: string; rewardReferrer: number; rewardReferee: number; paid: boolean; at: string }[]> {
  const rows = await prisma.referral.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const tgIds = [...new Set([...rows.map((r) => r.referrerId), ...rows.map((r) => r.refereeId)])];
  const users = await prisma.telegramUser.findMany({
    where: { id: { in: tgIds } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return id;
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.username ? "@" + u.username : id);
  };
  return rows.map((r) => ({
    id: r.id,
    referrerId: r.referrerId,
    referrerName: nameOf(r.referrerId),
    refereeId: r.refereeId,
    refereeName: nameOf(r.refereeId),
    rewardReferrer: r.rewardReferrer,
    rewardReferee: r.rewardReferee,
    paid: !!r.referrerPaidAt,
    at: r.createdAt.toISOString(),
  }));
}

// ─── 🚫 ban / unban ──────────────────────────────────────────────────────────
export async function adminBan(memberId: number, reason: string): Promise<{ ok: boolean; message: string }> {
  await prisma.member.update({ where: { id: memberId }, data: { riskFlag: true, riskNote: reason || "admin ban" } });
  return { ok: true, message: `🚫 #${memberId} bloklandi` };
}

export async function adminUnban(memberId: number): Promise<{ ok: boolean; message: string }> {
  await prisma.member.update({ where: { id: memberId }, data: { riskFlag: false, riskNote: null } });
  return { ok: true, message: `✅ #${memberId} blok olib tashlandi` };
}

export async function getAdminBanned(): Promise<{ id: number; fullName: string | null; phone: string | null; type: string; riskNote: string | null; trips: number; coins: number; hardBanned: boolean; banReason: string | null }[]> {
  // both control levels in one list: 🚫 hard ban (banned = total lockout) and 🚩 cash freeze (riskFlag)
  const rows = await prisma.member.findMany({
    where: { OR: [{ riskFlag: true }, { banned: true }] },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    phone: m.phone,
    type: m.type,
    riskNote: m.riskNote ?? null,
    trips: m.trips,
    coins: m.coins,
    hardBanned: m.banned,
    banReason: m.bannedReason ?? null,
  }));
}

// ─── 💸 withdrawals (dedicated tab) ─────────────────────────────────────────
export async function getAdminWithdrawals(limit = 100): Promise<{ id: number; amount: number; kasApplied: boolean; kasMessage: string | null; memberName: string | null; phone: string | null; type: string | null; at: string }[]> {
  const rows = await prisma.withdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { member: { select: { fullName: true, phone: true, type: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    kasApplied: r.kasApplied,
    kasMessage: r.kasMessage ?? null,
    memberName: r.member?.fullName ?? null,
    phone: r.member?.phone ?? null,
    type: r.member?.type ?? null,
    at: r.createdAt.toISOString(),
  }));
}

// ─── 💸 unified transaction ledger (transfers + withdrawals) ─────────────────
// Full control feed: WHO sent money to WHOM (tip / p2p transfer / pay-driver-by-plate)
// and WHICH member cashed out (withdraw). Both resolved to real names+phones.
export interface AdminTxnRow {
  id: string; // prefixed so transfer/withdraw ids never collide ("t123" | "w45")
  kind: string; // transfer | tip | fare | withdraw
  amount: number;
  commission: number; // sender-side fee (transfers only)
  fromName: string | null;
  fromPhone: string | null;
  fromType: string | null; // client | driver
  toName: string | null; // for withdraw: "Kartaga / naxt"
  toPhone: string | null;
  toType: string | null;
  note: string | null;
  at: string;
}

export async function getAdminTransactions(kind: "all" | "transfer" | "tip" | "fare" | "withdraw" = "all", limit = 200): Promise<AdminTxnRow[]> {
  const rows: AdminTxnRow[] = [];

  // Transfers (member → member): tip to driver, pay-by-plate, p2p transfer
  if (kind !== "withdraw") {
    const where = kind === "all" ? {} : { kind };
    const transfers = await prisma.transfer.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
    const ids = [...new Set(transfers.flatMap((t) => [t.fromMemberId, t.toMemberId]))];
    const members = await prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, displayName: true, phone: true, type: true } });
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const t of transfers) {
      const f = byId.get(t.fromMemberId);
      const to = byId.get(t.toMemberId);
      rows.push({
        id: `t${t.id}`,
        kind: t.kind,
        amount: t.amount,
        commission: t.commission,
        fromName: f?.displayName || f?.fullName || null,
        fromPhone: f?.phone ?? null,
        fromType: f?.type ?? null,
        toName: to?.displayName || to?.fullName || null,
        toPhone: to?.phone ?? null,
        toType: to?.type ?? null,
        note: t.note ?? null,
        at: t.createdAt.toISOString(),
      });
    }
  }

  // Withdrawals (member → real money out)
  if (kind === "all" || kind === "withdraw") {
    const ws = await prisma.withdrawal.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { member: { select: { fullName: true, displayName: true, phone: true, type: true } } } });
    for (const w of ws) {
      rows.push({
        id: `w${w.id}`,
        kind: "withdraw",
        amount: w.amount,
        commission: 0,
        fromName: w.member?.displayName || w.member?.fullName || null,
        fromPhone: w.member?.phone ?? null,
        fromType: w.member?.type ?? null,
        toName: w.kasApplied ? "💳 Kartaga / naxt (bajarildi)" : "💳 Kartaga / naxt (kutilyapti)",
        toPhone: null,
        toType: null,
        note: w.kasMessage ?? null,
        at: w.createdAt.toISOString(),
      });
    }
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return rows.slice(0, limit);
}

// ─── 📵 users who blocked the bot ────────────────────────────────────────────
export async function getAdminBlocked(limit = 500): Promise<{ telegramId: string; name: string; phone: string | null; linked: boolean; at: string }[]> {
  const rows = await prisma.telegramUser.findMany({
    where: { blockedAt: { not: null } },
    orderBy: { blockedAt: "desc" },
    take: limit,
    select: { id: true, firstName: true, lastName: true, username: true, blockedAt: true, member: { select: { fullName: true, displayName: true, phone: true } } },
  });
  return rows.map((t) => ({
    telegramId: t.id,
    name: t.member?.displayName || t.member?.fullName || [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : t.id),
    phone: t.member?.phone ?? null,
    linked: !!t.member,
    at: (t.blockedAt ?? new Date()).toISOString(),
  }));
}

// ─── ⭐ ride ratings ──────────────────────────────────────────────────────────
export async function getAdminRatings(limit = 200): Promise<{ id: number; memberId: number; bookingId: number; carNumber: string; stars: number; tags: string; at: string }[]> {
  const rows = await prisma.rideRating.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    bookingId: r.bookingId,
    carNumber: r.carNumber,
    stars: r.stars,
    tags: r.tags,
    at: r.createdAt.toISOString(),
  }));
}

// ─── 💬 support chat ─────────────────────────────────────────────────────────
export async function getChatConversations(): Promise<{ telegramId: string; name: string | null; username: string | null; lastMsg: string; lastAt: string; unread: number }[]> {
  const msgs = await prisma.supportMsg.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const byId = new Map<string, typeof msgs[0][]>();
  for (const m of msgs) {
    if (!byId.has(m.telegramId)) byId.set(m.telegramId, []);
    byId.get(m.telegramId)!.push(m);
  }
  const tgIds = [...byId.keys()];
  const users = await prisma.telegramUser.findMany({
    where: { id: { in: tgIds } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
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

export async function getChatMessages(telegramId: string): Promise<{ id: number; direction: string; text: string; at: string }[]> {
  const rows = await prisma.supportMsg.findMany({
    where: { telegramId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  await prisma.supportMsg.updateMany({ where: { telegramId, direction: "in", read: false }, data: { read: true } });
  return rows.map((r) => ({ id: r.id, direction: r.direction, text: r.text, at: r.createdAt.toISOString() }));
}

export async function sendChatReply(telegramId: string, text: string, sendTg: (id: string, html: string) => Promise<void>): Promise<{ ok: boolean }> {
  await sendTg(telegramId, text);
  await prisma.supportMsg.create({ data: { telegramId, direction: "out", text: text.slice(0, 1000), read: true } });
  return { ok: true };
}

// ─── 📱 notify/message history (outgoing from admin) ─────────────────────────
export async function getAdminMsgHistory(limit = 200): Promise<{ id: number; telegramId: string; direction: string; text: string; at: string }[]> {
  const rows = await prisma.supportMsg.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({ id: r.id, telegramId: r.telegramId, direction: r.direction, text: r.text, at: r.createdAt.toISOString() }));
}

// ─── Peak Hours ───────────────────────────────────────────────────────────────

export async function getPeakHours() {
  return prisma.peakHour.findMany({ orderBy: { startTime: "asc" } });
}

export async function upsertPeakHour(
  data: { id?: number; label: string; startTime: string; endTime: string; bonusTanga: number; active: boolean },
  sendTg: (telegramId: string, text: string) => Promise<void>,
) {
  const row = data.id
    ? await prisma.peakHour.update({ where: { id: data.id }, data: { label: data.label, startTime: data.startTime, endTime: data.endTime, bonusTanga: data.bonusTanga, active: data.active } })
    : await prisma.peakHour.create({ data: { label: data.label, startTime: data.startTime, endTime: data.endTime, bonusTanga: data.bonusTanga, active: data.active } });

  if (data.active) {
    // notify all drivers
    const drivers = await prisma.member.findMany({
      where: { type: "driver", telegramUser: { isNot: null } },
      include: { telegramUser: true },
    });
    const text =
      `🚖 <b>Pik vaqt sozlandi!</b>\n\n` +
      `⏰ ${data.label}: <b>${data.startTime} – ${data.endTime}</b>\n` +
      `💰 Har buyurtma uchun: <b>+${data.bonusTanga.toLocaleString("ru-RU")} tanga bonus</b>\n\n` +
      `🔥 Shu payt faqat <b>1067</b> orqali buyurtma oling — <b>50% chegirma</b> komissiyaga!\n` +
      `👊 Pik vaqtda ishlang, ko'proq toping!`;
    for (const d of drivers) {
      if (d.telegramUser?.id) {
        await sendTg(d.telegramUser.id, text).catch(() => undefined);
      }
    }
  }
  return row;
}

export async function deletePeakHour(id: number) {
  await prisma.peakHour.delete({ where: { id } });
}

/** Check if the given UTC timestamp falls inside any active peak hour (Tashkent UTC+5). */
export async function getActivePeakBonus(atMs: number): Promise<number> {
  const peaks = await prisma.peakHour.findMany({ where: { active: true } });
  if (!peaks.length) return 0;
  const tashkentDate = new Date(atMs + 5 * 3600 * 1000);
  const hhmm = `${String(tashkentDate.getUTCHours()).padStart(2, "0")}:${String(tashkentDate.getUTCMinutes()).padStart(2, "0")}`;
  for (const p of peaks) {
    if (hhmm >= p.startTime && hhmm < p.endTime) return p.bonusTanga;
  }
  return 0;
}
