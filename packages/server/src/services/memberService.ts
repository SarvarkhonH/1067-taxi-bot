import {
  badgesForType,
  computeXp,
  levelForXp,
  metricLabel,
  type AdminBotUsersResponse,
  type AdminMemberRow,
  type AdminStats,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type MeResponse,
  type MemberType,
} from "@t1067/shared";
import type { Member, MemberAchievement } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";
import { canSpinWheel, getStreak } from "./rewardService";
import { getJackpot } from "./weeklyService";
import { featureOn } from "./featureFlags";
import { decayStatus } from "./tierLoyaltyService";
import { ONLINE_WINDOW_MS } from "./presence";

export function isAdmin(telegramId: string): boolean {
  return env.adminIds.includes(telegramId);
}

export async function getMemberId(telegramId: string | null | undefined): Promise<number | null> {
  // 🚪 Mehmon: identifikator yo'q → a'zo ham yo'q. Guard MANBADA turadi, chunki `findUnique({id:null})`
  // Prisma'da validatsiya xatosi (500) beradi — allowGuest marshrutlari aynan shunga qulagan edi.
  if (!telegramId) return null;
  const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId } });
  return tu?.memberId ?? null;
}

function levelOf(m: Pick<Member, "points" | "trips">) {
  return levelForXp(computeXp({ points: m.points, trips: m.trips })).level;
}

// A nameless kas client is stored as "Mijoz <id>" (driver "Haydovchi"). For anything the
// USER sees, fall back to their real Telegram name/username so nobody is shown a placeholder.
// A real kas name always wins; an explicit edited name (when present) is handled by callers.
const PLACEHOLDER_NAME = /^(Mijoz|Haydovchi)( \d+)?$/;
export function resolveDisplayName(
  kasName: string | null,
  tg?: { firstName?: string | null; lastName?: string | null; username?: string | null } | null,
): string {
  if (kasName && !PLACEHOLDER_NAME.test(kasName)) return kasName;
  const tgName = [tg?.firstName, tg?.lastName].filter(Boolean).join(" ") || (tg?.username ? `@${tg.username}` : "");
  return tgName || kasName || "Mijoz";
}

// ─── member self view ─────────────────────────────────────────────────────────
export async function getMe(telegramId: string | null | undefined): Promise<MeResponse | null> {
  if (!telegramId) return null; // 🚪 mehmon — yuqoridagi bilan bir xil sabab
  const tu = await prisma.telegramUser.findUnique({
    where: { id: telegramId },
    include: { member: { include: { achievements: true } } },
  });
  if (!tu?.member) return null;
  return buildMe(tu.member, tu.member.achievements, tu);
}

export async function getMeByMemberId(memberId: number): Promise<MeResponse | null> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { achievements: true } });
  if (!member) return null;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId } });
  return buildMe(member, member.achievements, tu);
}

/** Set the user's OWN display name (bot/Mini App edit). Written to `displayName`, which the kas sync
 *  never touches — so it survives (unlike editing fullName, which reverts on the next sync). Returns
 *  the cleaned name, or null if it's invalid. Pass "" to clear (revert to the kas/Telegram name). */
export async function setDisplayName(memberId: number, raw: string): Promise<string | null> {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name && name.length < 2) return null; // too short (but "" is allowed = clear)
  const m = await prisma.member.update({ where: { id: memberId }, data: { displayName: name || null }, select: { type: true, phone: true } });
  // Also push the name to kas1067 for CLIENTS (best-effort) so the official record + the dispatcher
  // view match what the user chose. Drivers have no kas name-update endpoint → local-only. Never
  // blocks/fails the edit: the local displayName already took effect. Only on a real (non-empty)
  // name and only in live mode.
  if (name && m.type === "client" && m.phone) {
    try {
      const { getDataSource } = await import("../kas");
      const ds = getDataSource();
      if (ds.name === "live") {
        const r = await ds.setClientName(m.phone, name);
        if (!r.ok) console.error(`[name] kas setClientName failed for member ${memberId} (status ${r.status ?? "?"})`);
      }
    } catch (e) {
      console.error(`[name] kas push errored for member ${memberId}:`, e instanceof Error ? e.message : e);
    }
  }
  return name;
}

async function buildMe(
  member: Member,
  achievements: MemberAchievement[],
  tg?: { firstName?: string | null; lastName?: string | null; username?: string | null } | null,
): Promise<MeResponse> {
  const type = member.type as MemberType;
  // 🏅 ballPoints (tierloyalty) adds to XP. It's 0 for everyone until the flag awards it, so this is
  // a pure no-op while OFF; once earned it persists as real XP. Rank stays on `points` (kas), below.
  const xp = computeXp({ points: member.points, trips: member.trips, ballPoints: member.ballPoints });
  const lp = levelForXp(xp);
  // decay status only matters (and only computed) for clients under the flag
  const tierOn = type === "client" && (await featureOn("tierloyalty"));
  const decay = tierOn ? await decayStatus(member.lastActiveDay) : { idleDays: 0, decayWarning: false };

  // T2 (AUDIT 2.1 + 2.10): rank/total via indeksli COUNT (butun jadval emas),
  // streak/wheel/jackpot bilan birga PARALLEL — 5 ketma-ket so'rov → 1 to'lqin.
  const [ahead, totalMembers, botMembers, streak, wheelAvailable, jackpot] = await Promise.all([
    prisma.member.count({ where: { type, points: { gt: member.points } } }),
    prisma.member.count({ where: { type } }),
    prisma.telegramUser.count(), // 👥 REAL bot a'zolari (kas1067 bazasi EMAS) — social-proof chip uchun
    getStreak(member.id),
    canSpinWheel(member.id),
    getJackpot(),
  ]);
  const rank = ahead + 1;

  const earnedMap = new Map(achievements.map((a) => [a.code, a.earnedAt]));
  const badges = badgesForType(type).map((b) => ({
    code: b.code,
    name: b.name,
    emoji: b.emoji,
    description: b.description,
    earned: earnedMap.has(b.code),
    earnedAt: earnedMap.get(b.code)?.toISOString() ?? null,
  }));

  return {
    linked: true,
    type,
    metricLabel: metricLabel(type),
    member: { id: member.id, fullName: member.displayName || resolveDisplayName(member.fullName, tg), phone: member.phone, carNumber: member.carNumber, mahallaId: member.mahallaId, travelMahallaId: member.travelMahallaId },
    stats: { points: member.points, trips: member.trips, rating: member.rating },
    ballPoints: member.ballPoints,
    idleDays: decay.idleDays,
    decayWarning: decay.decayWarning,
    level: { index: lp.level.index, name: lp.level.name, emoji: lp.level.emoji, color: lp.level.color },
    nextLevel: lp.next
      ? { index: lp.next.index, name: lp.next.name, emoji: lp.next.emoji, minXp: lp.next.minXp }
      : null,
    xp: lp.xp,
    xpIntoLevel: lp.xpIntoLevel,
    xpForNext: lp.xpForNext,
    progress: lp.progress,
    rank,
    totalMembers,
    botMembers,
    badges,
    streak,
    wheelAvailable,
    jackpot,
    coins: member.coins,
    leagueTier: member.leagueTier,
  };
}

// ─── leaderboard (scoped to a member type) ─────────────────────────────────────
function toEntry(m: Member, rank: number, myMemberId: number | null): LeaderboardEntry {
  const level = levelOf(m);
  return {
    rank,
    memberId: m.id,
    fullName: m.fullName,
    carNumber: m.carNumber,
    points: m.points,
    trips: m.trips,
    level: { name: level.name, emoji: level.emoji, color: level.color },
    isMe: myMemberId === m.id,
  };
}

export async function getLeaderboard(
  type: MemberType,
  telegramId?: string,
  limit = 50,
): Promise<LeaderboardResponse> {
  // Rank by ORDER COUNT (trips), not money — drivers by orders completed, clients by rides taken.
  // points is only the tiebreaker so equal-trip members get a stable order.
  const members = await prisma.member.findMany({ where: { type }, orderBy: [{ trips: "desc" }, { points: "desc" }], take: limit });

  let myMemberId: number | null = null;
  if (telegramId) {
    const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, include: { member: true } });
    if (tu?.member?.type === type) myMemberId = tu.member.id;
  }

  const entries = members.map((m, i) => toEntry(m, i + 1, myMemberId));
  let me = entries.find((e) => e.isMe) ?? null;

  if (!me && myMemberId) {
    const mine = await prisma.member.findUnique({ where: { id: myMemberId } });
    if (mine) {
      const higher = await prisma.member.count({ where: { type, trips: { gt: mine.trips } } });
      me = toEntry(mine, higher + 1, myMemberId);
    }
  }

  return { type, metricLabel: type === "driver" ? "Buyurtma" : "Safar", entries, me };
}

// ─── account linking (member shares phone in the bot) ──────────────────────────
function normPhone(s: string): string {
  return s.replace(/\D/g, "").slice(-9);
}

export interface LinkResult {
  status: "linked" | "not_found" | "taken" | "banned";
  memberId?: number;
  type?: MemberType;
  fullName?: string;
  welcomeBonus?: number; // tanga granted on first join (welcomebonus flag); caller shows the message
}

/**
 * 🎁 Universal JOIN welcome: the moment ANYONE (client OR driver) first links their phone, they
 * get ONE firstRide (5000) tanga — no ride/drive needed. Idempotent (welcome_join:<memberId>),
 * gated by "welcomebonus" (DARK). Driver-recruit joiners are SKIPPED (paid via the recruit flow).
 * Client-referral (ref_) joiners: LEGACY skips them (paid 5000 on first ride via the invite flow);
 * STAGED (refstaged) pays them HERE on join like everyone else — see below. Never double-paid.
 * Tanga stays withdraw-gated (no_ride), so a non-rider can't cash it — soft, low-risk incentive.
 */
async function grantJoinWelcome(memberId: number, telegramId: string): Promise<number> {
  try {
    const { featureOn } = await import("./featureFlags");
    if (!(await featureOn("welcomebonus"))) return 0;
    const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { referredByCode: true } });
    const code = tu?.referredByCode ?? "";
    if (code.startsWith("drvdrv_")) return 0; // driver→driver recruit → recruited DRIVER gets no client welcome
    // drv_ (client via a driver's QR): LEGACY pays the client's 5000 on ride #1 (recruit_welcome) → skip
    // here. STAGED (drvstaged) pays it HERE on JOIN like everyone → let drv_ through when staged.
    // (checked AFTER drvdrv_ since "drvdrv_" also startsWith "drv_").
    if (code.startsWith("drv_") && !(await featureOn("drvstaged"))) return 0;
    // ref_ (client referral): LEGACY pays the friend's 5000 on their FIRST RIDE → skip here to avoid
    // double-pay. STAGED (refstaged) pays the friend's 5000 HERE on JOIN — same as every other joiner,
    // so the invited friend no longer waits for a ride → let ref_ through when staged.
    if (code.startsWith("ref_") && !(await featureOn("refstaged"))) return 0;
    const { getBonusEcon } = await import("./bonusConfig");
    const amt = (await getBonusEcon()).firstRide ?? 5000;
    if (amt <= 0) return 0;
    const { grantCoins } = await import("./coinService");
    const g = await grantCoins(memberId, amt, "referral", "🎁 Botga xush kelibsiz — sovg'a!", `welcome_join:${memberId}`);
    // The sovg'a is spendable in-app immediately but can't be cashed or transferred until the owner has
    // ridden ≥MIN_RIDES_FOR_PAID times — enforced centrally by the withdraw + transfer ride-gates
    // (coinService.withdraw / transferService.transfer), so nothing extra is stamped here.
    return g.ok ? amt : 0;
  } catch {
    return 0;
  }
}

/**
 * Upsert a kas1067 member, ADOPTING a self-registered (tg_) member with the same phone so a
 * person who joined the app BEFORE kas knew them is never duplicated once they appear in kas.
 * The member id is preserved (tangas + all app data intact) — only kasId is swapped
 * tg_<telegramId> → the real kas id. Used by every kas-upsert path (runSync + linkByPhone).
 */
export async function upsertKasMember(km: {
  type: MemberType;
  kasId: string;
  fullName: string;
  phone?: string | null;
  carNumber?: string | null;
  points: number;
  trips: number;
  rating: number;
}): Promise<{ id: number; type: MemberType; fullName: string }> {
  const data = {
    fullName: km.fullName,
    phone: km.phone ?? null,
    carNumber: km.carNumber ?? null,
    points: km.points,
    trips: km.trips,
    rating: km.rating,
    active: true,
    lastSyncAt: new Date(),
  };
  // 1) we already track this real kas record → update it
  const byKas = await prisma.member.findUnique({ where: { type_kasId: { type: km.type, kasId: km.kasId } } });
  if (byKas) {
    const m = await prisma.member.update({ where: { id: byKas.id }, data });
    return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
  }
  // 2) ADOPT a self-registered member (synthetic tg_ kasId) with the same phone — ACROSS TYPES.
  //    A person who self-registered as a CLIENT (the default when they weren't in kas yet) and later
  //    turns out to be a kas DRIVER is UPGRADED IN PLACE: same member id, telegram link + tangas kept,
  //    type corrected. Without this they got a duplicate driver row and stayed a "client" in the bot,
  //    so their recruit/welcome bonuses landed on the orphan account they don't see.
  if (km.phone) {
    const want = normPhone(km.phone);
    const selfRegs = await prisma.member.findMany({ where: { kasId: { startsWith: "tg_" }, phone: { not: null } } });
    const tg = selfRegs.find((m) => m.phone && normPhone(m.phone) === want);
    if (tg) {
      try {
        const m = await prisma.member.update({ where: { id: tg.id }, data: { type: km.type, kasId: km.kasId, ...data } });
        return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
      } catch {
        // a concurrent path (or an existing real row for this type+kasId) won — read it back
        const m = await prisma.member.findUnique({ where: { type_kasId: { type: km.type, kasId: km.kasId } } });
        if (m) return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
      }
    }
  }
  // 3) brand-new kas member
  const m = await prisma.member.create({ data: { type: km.type, kasId: km.kasId, ...data } });
  return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
}

export async function linkByPhone(
  telegramId: string,
  rawPhone: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<LinkResult> {
  const norm = normPhone(rawPhone);

  // On-demand: pull this phone's record(s) from kas1067 (light) and upsert them (adopt-aware).
  let found: { id: number; type: MemberType; fullName: string }[] = [];
  try {
    for (const km of await getDataSource().fetchByPhone(rawPhone)) {
      found.push(await upsertKasMember(km));
    }
  } catch (e) {
    console.error("[link] kas1067 lookup failed:", e instanceof Error ? e.message : e);
  }
  // fallback: anything already stored locally with this phone
  if (!found.length) {
    const existing = await prisma.member.findMany({ where: { phone: { not: null } } });
    found = existing
      .filter((m) => m.phone && normPhone(m.phone) === norm)
      .map((m) => ({ id: m.id, type: m.type as MemberType, fullName: m.fullName }));
  }
  // a phone can be both a passenger and a driver — prefer the driver role
  const match = found.find((m) => m.type === "driver") ?? found[0];

  // 🚫 hard-ban evasion guard: this phone belongs to a hard-banned member. Refuse the link (so a NEW
  // Telegram account can't re-attach to a banned identity) AND add this fresh tgId to the in-memory
  // ban set, so even the attempt is locked from here on. Checked BEFORE self-register so a banned
  // person can't route around it via the synthetic-member branch either.
  if (match) {
    const { isMemberBanned, markTgBannedIfMemberBanned } = await import("./banService");
    if (await isMemberBanned(match.id)) {
      markTgBannedIfMemberBanned(telegramId, true);
      return { status: "banned" };
    }
  }

  const base = {
    username: profile.username ?? null,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    languageCode: profile.languageCode ?? null,
    phone: rawPhone,
    isAdmin: isAdmin(telegramId),
  };

  if (!match) {
    // A1 SELF-REGISTER: this phone isn't in kas1067 yet. Instead of locking a brand-new
    // person out, create a local client member so they can use the app + order their FIRST
    // taxi. kasId is synthetic (tg_<telegramId>); once they appear in kas, upsertKasMember
    // ADOPTS this same member (no duplicate, tangas preserved). Money stays safe — withdraw
    // still needs real rides (no_ride gate) and writes to kas BY PHONE, so the synthetic
    // kasId changes nothing there.
    const selfKasId = `tg_${telegramId}`;
    const selfName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || (profile.username ? `@${profile.username}` : "Mijoz");
    const created =
      (await prisma.member
        .create({ data: { type: "client", kasId: selfKasId, fullName: selfName, phone: rawPhone, points: 0, trips: 0, rating: 0, active: true } })
        .catch(() => null)) ?? (await prisma.member.findUnique({ where: { type_kasId: { type: "client", kasId: selfKasId } } }));
    if (!created) {
      await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
      return { status: "not_found" };
    }
    await prisma.telegramUser.upsert({
      where: { id: telegramId },
      create: { id: telegramId, ...base, memberId: created.id, linkedAt: new Date() },
      update: { ...base, memberId: created.id, linkedAt: new Date() },
    });
    const welcomeBonus = await grantJoinWelcome(created.id, telegramId);
    return { status: "linked", memberId: created.id, type: "client", fullName: created.fullName, welcomeBonus };
  }

  const existing = await prisma.telegramUser.findUnique({ where: { memberId: match.id } });
  if (existing && existing.id !== telegramId) {
    await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
    return { status: "taken" };
  }

  await prisma.telegramUser.upsert({
    where: { id: telegramId },
    create: { id: telegramId, ...base, memberId: match.id, linkedAt: new Date() },
    update: { ...base, memberId: match.id, linkedAt: new Date() },
  });
  const welcomeBonus = await grantJoinWelcome(match.id, telegramId);
  return { status: "linked", memberId: match.id, type: match.type as MemberType, fullName: match.fullName, welcomeBonus };
}

export async function touchTelegramUser(
  telegramId: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<void> {
  const base = {
    username: profile.username ?? null,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    languageCode: profile.languageCode ?? null,
    isAdmin: isAdmin(telegramId),
  };
  // any interaction proves they're reachable again → clear a stale "blocked" mark.
  // BLK-1: blokdan QAYTISH ham tarixga yoziladi — lekin faqat haqiqatan bloklangan bo'lsa
  // (updateMany count = 1). Har oddiy harakatda satr yozilmaydi.
  const unblocked = await prisma.telegramUser.updateMany({ where: { id: telegramId, blockedAt: { not: null } }, data: { blockedAt: null } }).catch(() => ({ count: 0 }));
  await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: { ...base, blockedAt: null } });
  if (unblocked.count === 1) {
    const { recordReturn } = await import("./pushSend");
    const row = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { memberId: true } }).catch(() => null);
    await recordReturn(telegramId, row?.memberId ?? null);
  }
}

// ─── admin (scoped to a member type) ───────────────────────────────────────────
export async function getAdminStats(type: MemberType): Promise<AdminStats> {
  const [totalMembers, activeMembers, linkedMembers, agg, lastSync, top] = await Promise.all([
    prisma.member.count({ where: { type } }),
    prisma.member.count({ where: { type, active: true } }),
    prisma.member.count({ where: { type, telegramUser: { isNot: null } } }),
    prisma.member.aggregate({ where: { type }, _sum: { points: true, trips: true } }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.member.findMany({ where: { type }, orderBy: { points: "desc" }, take: 5 }),
  ]);

  return {
    type,
    metricLabel: metricLabel(type),
    totalMembers,
    activeMembers,
    linkedMembers,
    pointsSum: agg._sum.points ?? 0,
    tripsSum: agg._sum.trips ?? 0,
    lastSync: lastSync
      ? {
          at: (lastSync.finishedAt ?? lastSync.startedAt).toISOString(),
          status: lastSync.status,
          source: lastSync.source,
          membersSeen: lastSync.membersSeen,
        }
      : null,
    topMembers: top.map((m, i) => toEntry(m, i + 1, null)),
  };
}

/** Who joined / uses the bot — the gamification audience, from our own data. */
export async function getBotUsers(): Promise<AdminBotUsersResponse> {
  // order by a genuine-activity signal: lastSeenAt (real interaction) first, updatedAt as fallback
  // for rows not yet stamped by the presence middleware. Nulls sort last.
  const tus = await prisma.telegramUser.findMany({
    include: { member: true },
    orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const now = Date.now();

  const users = tus.map((t) => {
    const tgName = [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : "");
    // lastSeenAt is the honest last-interaction stamp; fall back to updatedAt only until the user
    // interacts once more (self-healing). "online" is ONLY ever true from a real lastSeenAt.
    const seen = t.lastSeenAt;
    return {
      telegramId: t.id,
      name: tgName || "—",
      username: t.username,
      phone: t.phone,
      linked: !!t.memberId,
      memberType: (t.member?.type as MemberType) ?? null,
      // show a real person, not the kas "Mijoz <id>" placeholder (same resolver as the user view)
      memberName: t.member ? resolveDisplayName(t.member.fullName, t) : null,
      isAdmin: t.isAdmin,
      linkedAt: t.linkedAt?.toISOString() ?? null,
      lastActive: (seen ?? t.updatedAt).toISOString(),
      seenReliable: !!seen,
      online: !!seen && now - seen.getTime() < ONLINE_WINDOW_MS,
      joinedAt: t.createdAt.toISOString(),
    };
  });

  return {
    total: tus.length,
    linked: tus.filter((t) => t.memberId).length,
    admins: tus.filter((t) => t.isAdmin).length,
    newToday: tus.filter((t) => t.createdAt >= startToday).length,
    users,
  };
}

export async function getAdminMembers(type: MemberType): Promise<AdminMemberRow[]> {
  const members = await prisma.member.findMany({
    where: { type },
    orderBy: { points: "desc" },
    include: { telegramUser: true },
  });
  return members.map((m) => {
    const level = levelOf(m);
    return {
      id: m.id,
      kasId: m.kasId,
      type: m.type as MemberType,
      // prefer the user-owned displayName (kas sync never touches it); fall back to the
      // kas fullName / Telegram name. Keeps the admin list free of stale menu-tap names.
      fullName: m.displayName || resolveDisplayName(m.fullName, m.telegramUser),
      phone: m.phone,
      carNumber: m.carNumber,
      points: m.points,
      trips: m.trips,
      rating: m.rating,
      level: { name: level.name, emoji: level.emoji },
      linked: !!m.telegramUser,
      active: m.active,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    };
  });
}
