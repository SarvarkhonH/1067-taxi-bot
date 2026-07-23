// 📊 Phase-4 admin insights — read-only aggregates for the Overview anomaly banner + approval inbox.
// ISOLATED (new file, no edits to money-core services) so it never collides with the parallel audit.
// Everything here is a plain SELECT/aggregate over existing tables + the in-memory kas health snapshot.
import { prisma } from "../db";
import { kasHealthSnapshot } from "./kasHealth";

/** Tashkent (UTC+5) midnight `offsetDays` ago, expressed in real UTC — for day-bucketed aggregates. */
function tashkentMidnightUtc(offsetDays = 0): Date {
  const shifted = new Date(Date.now() + 5 * 3600_000 - offsetDays * 86400_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 5 * 3600_000);
}

export interface AnomalyItem {
  level: "warn" | "alert";
  text: string;
}
export interface AnomalyReport {
  level: "ok" | "warn" | "alert";
  items: AnomalyItem[];
  emissionToday: number;
  cashoutToday: number;
}

/** Owner safety scan: emission/withdraw spikes vs the trailing week + kas health + stuck money
 *  markers. Read-only, cheap; surfaced as a banner so the owner SEES trouble without digging. */
export async function getAnomalies(): Promise<AnomalyReport> {
  const todayStart = tashkentMidnightUtc(0);
  const weekStart = tashkentMidnightUtc(7);
  const [emitToday, emitWeek, cashToday, cashWeek, stuck] = await Promise.all([
    prisma.coinTxn.aggregate({ where: { amount: { gt: 0 }, createdAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.coinTxn.aggregate({ where: { amount: { gt: 0 }, createdAt: { gte: weekStart, lt: todayStart } }, _sum: { amount: true } }),
    prisma.cashoutRequest.aggregate({ where: { status: "paid", decidedAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.cashoutRequest.aggregate({ where: { status: "paid", decidedAt: { gte: weekStart, lt: todayStart } }, _sum: { amount: true } }),
    prisma.appState.count({ where: { key: { startsWith: "pending:" } } }).catch(() => 0),
  ]);
  const et = Math.round(emitToday._sum.amount ?? 0);
  const eAvg = (emitWeek._sum.amount ?? 0) / 7;
  const ct = Math.round(cashToday._sum.amount ?? 0);
  const cAvg = (cashWeek._sum.amount ?? 0) / 7;

  const items: AnomalyItem[] = [];
  if (et > 50_000 && et > eAvg * 2.5) items.push({ level: "alert", text: `Emissiya bugun ${et.toLocaleString("ru-RU")} tanga — 7-kun o'rtachasidan (${Math.round(eAvg).toLocaleString("ru-RU")}) keskin yuqori` });
  if (ct > 50_000 && ct > cAvg * 2.5) items.push({ level: "alert", text: `Naxt-to'lov bugun ${ct.toLocaleString("ru-RU")} tanga — o'rtachadan (${Math.round(cAvg).toLocaleString("ru-RU")}) keskin yuqori` });
  const kas = kasHealthSnapshot();
  if (kas.degraded || kas.c429 > 5) items.push({ level: "warn", text: `kas ulanishi zaif: ${kas.c429}×429, ${kas.fails}/${kas.total} xato (so'nggi oyna)` });
  if (stuck > 0) items.push({ level: "warn", text: `${stuck} ta osilib qolgan pul-marker — qo'lda ko'rish kerak (clearPending.ts)` });

  const level = items.some((i) => i.level === "alert") ? "alert" : items.length ? "warn" : "ok";
  return { level, items, emissionToday: et, cashoutToday: ct };
}

export interface InboxItem {
  id: number;
  amount: number;
  method: string;
  mask: string;
  name: string;
  phone: string;
  at: string;
}

/** Unified approval queue: cash-out requests still awaiting the owner's decision (the approve/reject
 *  itself happens on the owner's Telegram — this is the single at-a-glance backlog + count). */
export async function getApprovalInbox(): Promise<{ pending: InboxItem[]; count: number }> {
  const rows = await prisma.cashoutRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { member: { select: { fullName: true, displayName: true, phone: true } } },
  });
  const pending = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    method: r.method,
    mask: r.mask,
    name: r.member.displayName || r.member.fullName || "—",
    phone: r.member.phone ?? r.contact,
    at: r.createdAt.toISOString(),
  }));
  return { pending, count: pending.length };
}

// 🏪 V1.7/§10.1: "Bugungi holat" — do'kon-tomonning kunlik nabzi, BARCHA do'konlar bo'yicha bir
// qarashda (owner ko'p-do'kon boshqarganda har birini alohida ochib tekshirmasin).
export interface ShopDailyStatus {
  pendingOrders: number; // ShopPurchase (legacy 1-dona buy) — hali javob kutayotgan
  unansweredChats: number; // C1: mijozdan kelgan, hali o'qilmagan/javobsiz xabarlar (barcha do'kon)
  todayStories: number; // S1: bugun joylangan hikoyalar soni (barcha do'kon)
  activeShops: number;
}

export async function getShopDailyStatus(): Promise<ShopDailyStatus> {
  const todayStart = tashkentMidnightUtc(0);
  const [pendingOrders, unansweredChats, todayStories, activeShops] = await Promise.all([
    prisma.shopPurchase.count({ where: { status: "pending" } }),
    // "unread" bilan bir xil semantika — shopChatService.listShopChatConversations
    prisma.supportMsg.count({ where: { shopId: { not: null }, direction: "in", read: false } }),
    prisma.shopStory.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.marketShop.count({ where: { active: true } }),
  ]);
  return { pendingOrders, unansweredChats, todayStories, activeShops };
}

// §10.1: "Nima o'zgardi" — bugun vs kecha (yangi audit-jadval kerak emas, mavjud createdAt
// timestamplaridan hisoblanadi). Yangi buyurtma/rad/sharh sonlarini solishtiradi.
export interface ShopDailyDiff {
  today: { newOrders: number; rejected: number; newReviews: number };
  yesterday: { newOrders: number; rejected: number; newReviews: number };
}

export async function getShopDailyDiff(): Promise<ShopDailyDiff> {
  const todayStart = tashkentMidnightUtc(0);
  const yestStart = tashkentMidnightUtc(1);
  const dayWindow = (from: Date, to: Date) => ({ gte: from, lt: to });
  const [
    tOrdersA, tOrdersB, tRejA, tRejB, tRev,
    yOrdersA, yOrdersB, yRejA, yRejB, yRev,
  ] = await Promise.all([
    prisma.shopPurchase.count({ where: { createdAt: dayWindow(todayStart, new Date()) } }),
    prisma.marketOrder.count({ where: { createdAt: dayWindow(todayStart, new Date()) } }),
    prisma.shopPurchase.count({ where: { status: "rejected", decidedAt: dayWindow(todayStart, new Date()) } }),
    prisma.marketOrder.count({ where: { status: "rejected", decidedAt: dayWindow(todayStart, new Date()) } }),
    prisma.productReview.count({ where: { createdAt: dayWindow(todayStart, new Date()) } }),
    prisma.shopPurchase.count({ where: { createdAt: dayWindow(yestStart, todayStart) } }),
    prisma.marketOrder.count({ where: { createdAt: dayWindow(yestStart, todayStart) } }),
    prisma.shopPurchase.count({ where: { status: "rejected", decidedAt: dayWindow(yestStart, todayStart) } }),
    prisma.marketOrder.count({ where: { status: "rejected", decidedAt: dayWindow(yestStart, todayStart) } }),
    prisma.productReview.count({ where: { createdAt: dayWindow(yestStart, todayStart) } }),
  ]);
  return {
    today: { newOrders: tOrdersA + tOrdersB, rejected: tRejA + tRejB, newReviews: tRev },
    yesterday: { newOrders: yOrdersA + yOrdersB, rejected: yRejA + yRejB, newReviews: yRev },
  };
}

// §10.1: "Prognoz-chiziq" — so'nggi 6 haftaning xarid-hajmi (Tashkent-hafta, dushanbadan boshlab
// emas — oddiy 7-kunlik oynalar bugungi kundan orqaga, kalendar-haftaga bog'lanmaydi).
export interface WeeklyTrendPoint {
  weekStart: string; // ISO sana — oynaning boshi
  orders: number;
}

export async function getWeeklyOrderTrend(weeks = 6): Promise<WeeklyTrendPoint[]> {
  // boundaries[0] = hozir, boundaries[k] = k*7 kun oldingi Tashkent-yarim-tun
  const boundaries = [new Date(), ...Array.from({ length: weeks }, (_, k) => tashkentMidnightUtc((k + 1) * 7))];
  const points: WeeklyTrendPoint[] = [];
  for (let week = weeks - 1; week >= 0; week--) {
    const to = boundaries[week]!; // yaqinroq chegara
    const from = boundaries[week + 1]!; // uzoqroq chegara
    const [a, b] = await Promise.all([
      prisma.shopPurchase.count({ where: { createdAt: { gte: from, lt: to } } }),
      prisma.marketOrder.count({ where: { createdAt: { gte: from, lt: to } } }),
    ]);
    points.push({ weekStart: from.toISOString().slice(0, 10), orders: a + b });
  }
  return points;
}
