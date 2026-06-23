// 🔔 Driver engagement pushes — the "come to work, there's demand" + "today you earned X" nudges.
// Piggybacks the SAME periodic loop as the client push engine (NO new poller) and reuses the SAME
// dedup (NotifyLog: ≤2 pushes/day, one per trigger, quiet 21:00-08:00, respects notify-off).
//
// Cheap by design: ONE listActiveBookings() per tick (shared demand signal) + kasMapSocket.position()
// (in-memory, free) to know who's offline. The per-driver kas ride lookup runs ONLY in the evening
// summary window AND only after a NotifyLog pre-check says we haven't sent it yet — so a driver's
// rides are fetched at most once/day, never on every tick.
//
// Read-only: emits messages, moves NO money. Gated behind the `drvpush` flag (DEFAULT_OFF).
import type { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { kasMapSocket } from "./kasMapSocket";
import { featureOn } from "./featureFlags";
import { notifyOnce, quietHours, tashkentNow, dayKey } from "./notifyService";

const DEMAND_SPIKE = 3; // unassigned bookings that count as "chiqing, ish bor" worth a daytime ping

function kosonDay(at: string | Date): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface NudgeCtx {
  hour: number; // tashkent hour 0-23
  online: boolean; // driver broadcasting now
  totalActive: number; // all active bookings city-wide
  unassigned: number; // active bookings with no driver yet
  ridesToday: number; // this driver's completed rides today
  fareToday: number; // this driver's fare sum today
}
export interface Nudge {
  kind: "drv_workcall" | "drv_demand" | "drv_eod";
  html: string;
}

/** PURE trigger logic (no I/O) — given the driver's situation, what nudge (if any) fits this tick?
 *  Window-gated + priority-ordered: morning work-call → daytime demand spike → evening summary. */
export function pickDriverNudge(c: NudgeCtx): Nudge | null {
  // ① MORNING WORK-CALL (08–11): offline + there ARE orders → "ishga chiqing"
  if (c.hour >= 8 && c.hour < 11 && !c.online && c.totalActive >= 1) {
    const extra = c.unassigned > 0 ? ` (${c.unassigned} tasi haydovchisiz)` : "";
    return { kind: "drv_workcall", html: `🚖 <b>Ishga chiqing!</b>\nHozir <b>${c.totalActive} ta buyurtma</b>${extra} bor. Onlayn bo'ling — daromad sizni kutyapti! 💰` };
  }
  // ② DAYTIME DEMAND SPIKE (11–20): offline + unassigned spike → urgent ping
  if (c.hour >= 11 && c.hour < 20 && !c.online && c.unassigned >= DEMAND_SPIKE) {
    return { kind: "drv_demand", html: `🔥 <b>${c.unassigned} ta haydovchisiz buyurtma!</b>\nHozir chiqsangiz — tezda zakaz olasiz. 🚕💨` };
  }
  // ③ EVENING SUMMARY (20–21): today's work data + nudge
  if (c.hour >= 20 && c.hour < 21) {
    if (c.ridesToday > 0) {
      return { kind: "drv_eod", html: `🏁 <b>Bugun: ${c.ridesToday} safar · ${formatNumber(c.fareToday)} so'm</b>\nZo'r ish! 💪 Ertaga ham shu zarbda — 🚕` };
    }
    if (c.totalActive >= 1) {
      return { kind: "drv_eod", html: `📭 <b>Bugun safaringiz yo'q.</b>\nShahar bo'ylab buyurtmalar bo'ldi — ertaga onlayn chiqsangiz, daromad sizniki bo'ladi. 💰` };
    }
  }
  return null;
}

/** Periodic driver-engagement tick. Call right after pushEngineTick in the loop. */
export async function driverEngageTick(bot: Bot): Promise<void> {
  if (!(await featureOn("drvpush"))) return;
  if (quietHours()) return;
  const hour = tashkentNow().getUTCHours();
  const dk = dayKey();

  // Linked drivers with a plate (the only ones we can push + look up by car).
  const drivers = await prisma.member.findMany({
    where: { type: "driver", carNumber: { not: null }, telegramUser: { isNot: null } },
    include: { telegramUser: true },
  });
  if (drivers.length === 0) return;

  // ONE shared demand read (best-effort; on failure skip the demand-based triggers this tick).
  let totalActive = 0;
  let unassigned = 0;
  try {
    const active = await getDataSource().listActiveBookings();
    totalActive = active.length;
    unassigned = active.filter((b) => !b.carNumber).length;
  } catch {
    /* demand unknown this tick */
  }

  const eveningWindow = hour >= 20 && hour < 21;

  for (const d of drivers) {
    const chatId = d.telegramUser!.id;
    const car = d.carNumber!;
    const online = !!kasMapSocket.position(car); // free, in-memory

    // The evening summary needs this driver's ride count — but a kas lookup per driver per tick is
    // costly. Pre-check NotifyLog: if the EOD push already went today (or it's not the window), skip
    // the kas call entirely. So rides are fetched at most ONCE/day per driver.
    let ridesToday = 0;
    let fareToday = 0;
    if (eveningWindow) {
      const already = await prisma.notifyLog.findUnique({ where: { memberId_kind_dayKey: { memberId: d.id, kind: "drv_eod", dayKey: dk } } }).catch(() => null);
      if (already) continue;
      try {
        const todays = (await getDataSource().getRidesByCar(car, 30)).filter((r) => kosonDay(r.at) === dk);
        ridesToday = todays.length;
        fareToday = todays.reduce((s, r) => s + r.payment, 0);
      } catch {
        continue; // kas down → retry next tick
      }
    }

    const nudge = pickDriverNudge({ hour, online, totalActive, unassigned, ridesToday, fareToday });
    if (nudge) await notifyOnce(bot, chatId, d.id, nudge.kind, nudge.html);
  }
}
