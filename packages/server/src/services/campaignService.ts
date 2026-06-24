// 🎁 Admin-configurable PROMO campaigns ("tasks with promises"). Mirrors driverMissionService:
// the config lives in AppState ("promo:campaigns", JSON) — no schema migration. Per-member
// progress is computed LIVE from our DB (referrals / rides / coin txns) within the campaign
// window; completion grants the reward exactly ONCE (idempotent CoinTxn key) and pushes a
// message. Runs on the existing periodic tick (NO new poller — BUZILMAS), self-throttled to
// ~hourly. Gated by the "promo" feature flag so it ships dark until owner QABUL.
import type { Bot } from "grammy";
import { CAMPAIGN_MAX_REWARD, formatNumber, type Campaign, type CampaignCond, type CampaignView } from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { notifyOnce } from "./notifyService";

const DAY = 24 * 3600 * 1000;
const CFG_KEY = "promo:campaigns";

export async function loadCampaigns(): Promise<Campaign[]> {
  const row = await prisma.appState.findUnique({ where: { key: CFG_KEY } }).catch(() => null);
  if (!row) return [];
  try {
    const arr = JSON.parse(row.value) as Campaign[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function saveCampaigns(cs: Campaign[]): Promise<void> {
  await prisma.appState.upsert({ where: { key: CFG_KEY }, create: { key: CFG_KEY, value: JSON.stringify(cs) }, update: { value: JSON.stringify(cs) } });
}
function newId(): string {
  return "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}
function endOf(c: Campaign): number {
  return new Date(c.startAt).getTime() + c.windowDays * DAY;
}

// ── admin CRUD (owner-gated at the route) ─────────────────────────────────────────────────────
export async function adminAddCampaign(input: { title: string; emoji?: string; cond: CampaignCond; target: number; windowDays: number; reward: number; audience: Campaign["audience"] }): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const cs = await loadCampaigns();
  if (cs.length >= 20) return { ok: false, reason: "limit" };
  if (!input.title.trim() || !(input.target > 0) || !(input.windowDays > 0)) return { ok: false, reason: "bad_input" };
  const c: Campaign = {
    id: newId(),
    emoji: (input.emoji || "🎁").slice(0, 4),
    title: input.title.trim().slice(0, 80),
    cond: input.cond,
    target: Math.max(1, Math.floor(input.target)),
    windowDays: Math.max(1, Math.min(90, Math.floor(input.windowDays))),
    reward: Math.max(0, Math.min(CAMPAIGN_MAX_REWARD, Math.floor(input.reward))),
    audience: input.audience,
    active: false, // created OFF — owner flips it ON to launch (which opens the window)
    startAt: new Date().toISOString(),
  };
  cs.push(c);
  await saveCampaigns(cs);
  return { ok: true, id: c.id };
}
export async function adminEditCampaign(id: string, patch: Partial<Pick<Campaign, "title" | "emoji" | "cond" | "target" | "windowDays" | "reward" | "audience">>): Promise<{ ok: boolean; reason?: string }> {
  const cs = await loadCampaigns();
  const c = cs.find((x) => x.id === id);
  if (!c) return { ok: false, reason: "not_found" };
  if (patch.title !== undefined) c.title = String(patch.title).slice(0, 80);
  if (patch.emoji !== undefined) c.emoji = (String(patch.emoji) || "🎁").slice(0, 4);
  if (patch.cond !== undefined) c.cond = patch.cond;
  if (patch.target !== undefined) c.target = Math.max(1, Math.floor(patch.target));
  if (patch.windowDays !== undefined) c.windowDays = Math.max(1, Math.min(90, Math.floor(patch.windowDays)));
  if (patch.reward !== undefined) c.reward = Math.max(0, Math.min(CAMPAIGN_MAX_REWARD, Math.floor(patch.reward)));
  if (patch.audience !== undefined) c.audience = patch.audience;
  await saveCampaigns(cs);
  return { ok: true };
}
export async function adminToggleCampaign(id: string, active: boolean): Promise<{ ok: boolean; reason?: string }> {
  const cs = await loadCampaigns();
  const c = cs.find((x) => x.id === id);
  if (!c) return { ok: false, reason: "not_found" };
  c.active = active;
  if (active) c.startAt = new Date().toISOString(); // (re)launch opens a fresh window
  await saveCampaigns(cs);
  return { ok: true };
}
export async function adminDeleteCampaign(id: string): Promise<{ ok: boolean }> {
  const cs = await loadCampaigns();
  await saveCampaigns(cs.filter((x) => x.id !== id));
  return { ok: true };
}
export async function adminListCampaigns(): Promise<CampaignView[]> {
  const cs = await loadCampaigns();
  const out: CampaignView[] = [];
  for (const c of cs) {
    const completions = await prisma.coinTxn.count({ where: { kind: "promo", idempotencyKey: { startsWith: `campaign:${c.id}:` } } }).catch(() => 0);
    out.push({ ...c, endAt: new Date(endOf(c)).toISOString(), ended: Date.now() > endOf(c), completions });
  }
  return out;
}

// ── live progress (our DB only — no kas calls) ────────────────────────────────────────────────
type Mem = { id: number; type: string; telegramUser: { id: string } | null; streak: { current: number } | null };
async function progressFor(m: Mem, c: Campaign, since: Date, until: Date): Promise<number> {
  const win = { gte: since, lte: until };
  switch (c.cond) {
    case "invite_ride":
      return m.telegramUser ? prisma.referral.count({ where: { referrerId: m.telegramUser.id, referrerPaidAt: win } }) : 0;
    case "invite_signup":
      return m.telegramUser ? prisma.referral.count({ where: { referrerId: m.telegramUser.id, createdAt: win } }) : 0;
    case "rides":
      return prisma.rideReward.count({ where: { memberId: m.id, createdAt: win } });
    case "streak":
      return m.streak?.current ?? 0;
    case "first_ride": {
      const first = await prisma.rideReward.findFirst({ where: { memberId: m.id }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      return first && first.createdAt >= since && first.createdAt <= until ? 1 : 0;
    }
    case "comeback": {
      const inWin = await prisma.rideReward.findFirst({ where: { memberId: m.id, createdAt: win }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      if (!inWin) return 0;
      const prev = await prisma.rideReward.findFirst({ where: { memberId: m.id, createdAt: { lt: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      return !prev || inWin.createdAt.getTime() - prev.createdAt.getTime() > 7 * DAY ? 1 : 0;
    }
    case "spend_tanga": {
      const a = await prisma.coinTxn.aggregate({ where: { memberId: m.id, amount: { lt: 0 }, kind: { in: ["market", "garage", "plus", "item", "shop"] }, createdAt: win }, _sum: { amount: true } });
      return Math.abs(a._sum.amount ?? 0);
    }
    case "earn_tanga": {
      const a = await prisma.coinTxn.aggregate({ where: { memberId: m.id, amount: { gt: 0 }, createdAt: win }, _sum: { amount: true } });
      return a._sum.amount ?? 0;
    }
    case "pay_fare":
      return prisma.coinTxn.count({ where: { memberId: m.id, kind: "fare_out", createdAt: win } });
    case "weekend_rides": {
      const rides = await prisma.rideReward.findMany({ where: { memberId: m.id, createdAt: win }, select: { createdAt: true } });
      return rides.filter((r) => { const d = new Date(r.createdAt.getTime() + 5 * 3600 * 1000).getUTCDay(); return d === 0 || d === 6; }).length;
    }
    default:
      return 0;
  }
}

// ── tick: piggybacks the periodic loop (NO new poller), self-throttled to ~hourly ──────────────
export async function campaignTick(bot: Bot): Promise<void> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("promo"))) return;
  const guard = await prisma.appState.findUnique({ where: { key: "promo:lastTick" } }).catch(() => null);
  if (guard && Date.now() - Number(guard.value || 0) < 55 * 60 * 1000) return; // ~hourly
  const live = (await loadCampaigns()).filter((c) => c.active && Date.now() <= endOf(c));
  if (!live.length) return;
  await prisma.appState.upsert({ where: { key: "promo:lastTick" }, create: { key: "promo:lastTick", value: String(Date.now()) }, update: { value: String(Date.now()) } });

  const members = await prisma.member.findMany({ where: { telegramUser: { isNot: null } }, include: { telegramUser: true, streak: true } });
  for (const c of live) {
    const since = new Date(c.startAt);
    const until = new Date(endOf(c));
    const daysLeft = Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY));
    // one query for everyone already rewarded (skip them — no per-member idempotency probe)
    const done = new Set<number>();
    const paid = await prisma.coinTxn.findMany({ where: { kind: "promo", idempotencyKey: { startsWith: `campaign:${c.id}:` } }, select: { idempotencyKey: true } }).catch(() => []);
    for (const p of paid) { const mid = Number(p.idempotencyKey?.split(":")[2]); if (mid) done.add(mid); }

    for (const m of members) {
      if (c.audience !== "all" && m.type !== c.audience) continue;
      if (!m.telegramUser || done.has(m.id)) continue;
      const prog = await progressFor(m as Mem, c, since, until);
      if (prog >= c.target) {
        const g = await grantCoins(m.id, Math.min(c.reward, CAMPAIGN_MAX_REWARD), "promo", `🎁 ${c.title}`, `campaign:${c.id}:${m.id}`);
        if (g.ok) await notifyOnce(bot, m.telegramUser.id, m.id, `cmp_done:${c.id}`, `🎉 <b>${c.emoji} ${c.title}</b> — bajardingiz!\n<b>+${formatNumber(c.reward)} tanga</b> hisobingizga tushdi. 🚕`);
      } else if (prog > 0 && prog * 2 >= c.target && daysLeft <= 3) {
        // near-complete + window closing → a single nudge (notifyOnce dedups per day + 2/day cap)
        await notifyOnce(bot, m.telegramUser.id, m.id, `cmp_rem:${c.id}`, `⏳ <b>${c.emoji} ${c.title}</b>: <b>${prog}/${c.target}</b> — ${daysLeft} kun qoldi!\nTugating: <b>+${formatNumber(c.reward)} tanga</b>. 🚕`);
      }
    }
  }
}
