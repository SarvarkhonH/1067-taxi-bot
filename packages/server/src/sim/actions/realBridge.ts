// 🌉 REAL KOD-KO'PRIK — sim-agent qarorlarini JONLI servislar (cashback/referral/oyin) va
// Prisma'ga ulaydigan YAGONA qatlam. Bu yerda qaror-mantiq YO'Q: faqat real-chaqiruv + DB-bog'lam.
// Servis/db importlari FAQAT funksiya ichida dinamik (run.ts import-tartibi: _simDb → clock → servis).
import type { OyinBuyResult, OyinStateResponse } from "@t1067/shared";
import { simNow } from "../clock";
import { seedFromString } from "../rng";
import type { AgentState, WorldState } from "../types";

/** Run-belgisi: bir xil (name, seed) = bir xil id'lar (determinizm; sim-DB har run'da toza). */
function runHashOf(world: WorldState): string {
  return seedFromString(`${world.cfg.name}:${world.cfg.seed}`).toString(36);
}

function simTgIdOf(world: WorldState, agentId: number): string {
  return `sim${runHashOf(world)}x${agentId}`;
}

/** Sim-vaqtdagi Toshkent kuni (YYYY-MM-DD) — Member.lastActiveDay formatiga mos. */
function tashkentDayOfSim(): string {
  return new Date(simNow() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Installed-bosqich: bot /start dagidek TelegramUser satri (memberId'SIZ) yaratiladi.
 * attachPendingReferral referee-satr mavjudligini talab qiladi — shu funksiya ta'minlaydi.
 */
export async function ensureTgUser(agent: AgentState, world: WorldState): Promise<string> {
  if (!agent.tgId) agent.tgId = simTgIdOf(world, agent.id);
  const { prisma } = await import("../../db");
  await prisma.telegramUser.upsert({ where: { id: agent.tgId }, create: { id: agent.tgId }, update: {} });
  return agent.tgId;
}

/**
 * Installed→linked bosqichi: Member + TelegramUser-bog'lam (linkedAt = sim-vaqt, clock-shim).
 * Idempotent: memberId allaqachon bor bo'lsa qayta yaratmaydi.
 */
export async function ensureMember(agent: AgentState, world: WorldState): Promise<number> {
  if (agent.memberId != null) return agent.memberId;
  const tgId = await ensureTgUser(agent, world);
  const { prisma } = await import("../../db");
  const member = await prisma.member.create({
    data: {
      type: "client",
      kasId: `SIM-${world.cfg.name}-${agent.id}`,
      fullName: `Sim ${agent.archetype} #${agent.id}`,
      phone: `+99890${String(agent.id).padStart(7, "0")}`,
      coins: 0,
    },
  });
  await prisma.telegramUser.update({ where: { id: tgId }, data: { memberId: member.id, linkedAt: new Date() } });
  agent.memberId = member.id;
  return member.id;
}

/**
 * Bitta tugagan safar: sintetik bookingId (world hisoblagichi) bilan real cashback-roll —
 * RideReward + gashtak-ledger + tanga-grant zanjirini servisning O'ZI yurgizadi.
 * null (dublikat-roll) = 0 qaytadi. Qaytgan son = to'langan cashback (satisfaction kirishi).
 */
export async function doRide(agent: AgentState, world: WorldState): Promise<number> {
  if (agent.memberId == null) throw new Error(`[realBridge] doRide: agent ${agent.id} hali linked emas (memberId yo'q)`);
  const bookingId = world.nextBookingId++;
  const { rollRideCashback } = await import("../../services/cashbackService");
  const roll = await rollRideCashback(agent.memberId, bookingId);
  const { prisma } = await import("../../db");
  await prisma.member.update({
    where: { id: agent.memberId },
    data: { trips: { increment: 1 }, lastActiveDay: tashkentDayOfSim() },
  });
  if (roll) {
    // Gashtak-ledger ball-keshni chetlab o'tadi — keyingi getOyinState eskirgan ballni ko'rmasin.
    const { invalidateBallCacheExternal } = await import("../../services/oyinService");
    invalidateBallCacheExternal();
  }
  return roll?.amount ?? 0;
}

/**
 * Taklif-havola bosilishi: inviter kodi (getOrCreateCode) → attachPendingReferral.
 * `world` berilsa yetishmagan TG-satrlar yaratiladi; berilmasa ikkala agentda tgId bo'lishi shart.
 * ⚠️ Real servis memberId'li (allaqachon ulangan) referee'ni RAD ETADI — chaqiruvchi attach'ni
 * ensureMember'dan OLDIN qilishi kerak, natijadagi `attached` ni tekshirsin.
 */
export async function attachReferral(
  inviter: AgentState,
  invitee: AgentState,
  world?: WorldState,
): Promise<{ attached: boolean; referrerTelegramId?: string; startReward?: number }> {
  const inviterTg = inviter.tgId ?? (world ? await ensureTgUser(inviter, world) : null);
  const inviteeTg = invitee.tgId ?? (world ? await ensureTgUser(invitee, world) : null);
  if (!inviterTg || !inviteeTg) {
    throw new Error(`[realBridge] attachReferral: tgId yo'q (inviter ${inviter.id} / invitee ${invitee.id}) va world berilmagan`);
  }
  const { getOrCreateCode, attachPendingReferral } = await import("../../services/referralService");
  if (!inviter.referralCode) inviter.referralCode = await getOrCreateCode(inviterTg);
  const res = await attachPendingReferral(inviteeTg, inviter.referralCode);
  if (res.attached) invitee.invitedByAgentId = inviter.id;
  return res;
}

/** Invitee raqam ulagach: real completeReferral (idempotent — servis o'zi qo'riqlaydi). */
export async function completeReferralFor(
  agent: AgentState,
): Promise<import("../../services/referralService").ReferralCredit | null> {
  if (!agent.tgId || agent.memberId == null) {
    throw new Error(`[realBridge] completeReferralFor: agent ${agent.id} tgId/memberId to'liq emas`);
  }
  const { completeReferral } = await import("../../services/referralService");
  return completeReferral(agent.tgId, agent.memberId);
}

/** O'yin-ekranini ochish: real getOyinState JSON'i — agent qarori shu asosda (chaqiruvchida). */
export async function openGame(agent: AgentState): Promise<OyinStateResponse> {
  if (agent.memberId == null) throw new Error(`[realBridge] openGame: agent ${agent.id} memberId yo'q`);
  const { getOyinState } = await import("../../services/oyinService");
  return getOyinState(agent.memberId);
}

/** Chipta-xarid urinishi: real buyTicket natijasi AYNAN qaytadi (rad-sabab bilan — satisfaction kirishi). */
export async function tryBuyTicket(agent: AgentState, prizeKey: string): Promise<OyinBuyResult> {
  if (agent.memberId == null) throw new Error(`[realBridge] tryBuyTicket: agent ${agent.id} memberId yo'q`);
  const { buyTicket } = await import("../../services/oyinService");
  return buyTicket(agent.memberId, prizeKey);
}

/** Ochiq (active + stage="open") sovrinlar — agent xarid-qarori uchun ixcham ko'rinish. */
export interface SimOpenPrize {
  key: string;
  price: number; // chipta ball-narxi
  limit: number;
  sold: number;
  valueSom: number; // valueLabel'dan ajratilgan so'm (parseSumLabel uslubi); topilmasa 0 (prospect=0 → o'tkazib yuboriladi)
}

export async function getOpenPrizes(): Promise<SimOpenPrize[]> {
  const { adminListCatalog } = await import("../../services/oyinService");
  const rows = await adminListCatalog();
  return rows
    .filter((p) => p.active && p.stage === "open")
    .map((p) => ({ key: p.key, price: p.price, limit: p.limit, sold: p.sold, valueSom: parseSomLabel(p.valueLabel) }));
}

function parseSomLabel(label: string): number {
  const digits = (label || "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
