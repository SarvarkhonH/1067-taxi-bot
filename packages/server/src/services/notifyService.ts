// 🔔 Smart push engine (Duolingo architecture, rules-only — no LLM needed):
// max 2 pushes per member per day, never the same trigger twice a day, silent
// 21:00-08:00 Tashkent. Triggers by priority: streak-saver → comeback →
// lucky-day → garage-service → jackpot. Plus the Monday recap "mini-Wrapped".
import type { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";

const DAILY_PUSH_CAP = 2;

function tashkentNow(): Date {
  return new Date(Date.now() + 5 * 3600 * 1000);
}
function dayKey(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function quietHours(): boolean {
  const h = tashkentNow().getUTCHours();
  return h >= 21 || h < 8;
}

async function trySend(bot: Bot, chatId: string, memberId: number, kind: string, html: string): Promise<boolean> {
  const dk = dayKey();
  const sentToday = await prisma.notifyLog.count({ where: { memberId, dayKey: dk } });
  if (sentToday >= DAILY_PUSH_CAP) return false;
  try {
    await prisma.notifyLog.create({ data: { memberId, kind, dayKey: dk } }); // claim BEFORE send (no dup on crash)
  } catch {
    return false; // already sent this trigger today
  }
  await bot.api.sendMessage(chatId, html, { parse_mode: "HTML" }).catch(() => undefined);
  return true;
}

/** Periodic tick (piggybacks the existing loop). Cheap checks, hard caps. */
export async function pushEngineTick(bot: Bot): Promise<void> {
  if (quietHours()) return;
  const hour = tashkentNow().getUTCHours();
  const dk = dayKey();

  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null } },
    include: { telegramUser: true, streak: true },
  });

  const { isLuckyToday } = await import("./cashbackService");
  const lucky = isLuckyToday();
  const { getJackpot } = await import("./weeklyService");
  const jackpot = await getJackpot();

  for (const m of linked) {
    const chatId = m.telegramUser!.id;

    // ① streak-saver: evening, streak alive but today unchecked (loss aversion)
    if (hour >= 18 && (m.streak?.current ?? 0) >= 2) {
      const checkedToday = m.streak?.lastCheckIn ? dayKey(m.streak.lastCheckIn) === dk : false;
      if (!checkedToday) {
        const sent = await trySend(bot, chatId, m.id, "streak_saver", `🔥 <b>${m.streak!.current} kunlik streak xavfda!</b>\nBugun belgilamasangiz — kuyadi. «🎁 Bonuslar» → ✅ (10 soniya).`);
        if (sent) continue;
      }
    }

    // ② comeback: 7+ days without a ride → 48h guaranteed-3x offer
    if (m.type === "client" && !m.comebackOfferUntil) {
      const lastRide = await prisma.rideReward.findFirst({ where: { memberId: m.id }, orderBy: { createdAt: "desc" } });
      if (lastRide && Date.now() - lastRide.createdAt.getTime() > 7 * 24 * 3600 * 1000) {
        const until = new Date(Date.now() + 48 * 3600 * 1000);
        const sent = await trySend(bot, chatId, m.id, "comeback", `🎁 <b>Sizni sog'indik!</b>\n48 soat ichidagi birinchi safaringizda ruleta <b>kafolatlangan 3x</b> beradi. 🚕`);
        if (sent) {
          await prisma.member.update({ where: { id: m.id }, data: { comebackOfferUntil: until } });
          continue;
        }
      }
    }

    // ③ lucky-day morning announce (scarcity — only fires on the lucky weekday)
    if (lucky && hour >= 8 && hour < 12) {
      const sent = await trySend(bot, chatId, m.id, "lucky_day", `🍀 <b>BUGUN OMAD KUNI!</b>\nHar safar ruletasi <b>2 BARAVAR</b> to'laydi — bugun yo'lga chiqish ayni payt! 🚕`);
      if (sent) continue;
    }

    // ④ garage service due (ownership nudge)
    const dueCar = await prisma.memberCar.findFirst({ where: { memberId: m.id, isEquipped: true, ridesSinceService: { gte: 25 } } });
    if (dueCar) {
      const sent = await trySend(bot, chatId, m.id, "garage_service", `🔧 Mashinangizga moy almashtirish kerak — hozir u <b>yarim tezlikda</b> ishlayapti. «🎁 Bonuslar» → Garaj.`);
      if (sent) continue;
    }

    // ⑤ big jackpot teaser
    if (jackpot >= 20000) {
      await trySend(bot, chatId, m.id, "jackpot", `🎰 JACKPOT <b>${formatNumber(jackpot)} tanga</b>ga yetdi!\nHar safarda 1% imkon — butun jamg'arma sizniki bo'lishi mumkin. 🚕`);
    }
  }
}

/** Monday recap — the mini-Wrapped (only for members who DID something). */
export async function weeklyRecap(bot: Bot): Promise<void> {
  const { weekKey } = await import("./missionService");
  const wk = weekKey(new Date());
  const marker = `recap_sent:${wk}`;
  if (await prisma.appState.findUnique({ where: { key: marker } })) return;
  if (tashkentNow().getUTCDay() !== 1) return; // Mondays only
  await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const linked = await prisma.member.findMany({ where: { telegramUser: { isNot: null } }, include: { telegramUser: true } });
  for (const m of linked) {
    const [rides, earned] = await Promise.all([
      prisma.rideReward.count({ where: { memberId: m.id, createdAt: { gte: since } } }),
      prisma.coinTxn.aggregate({ where: { memberId: m.id, amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    ]);
    const coins = Math.round(earned._sum.amount ?? 0);
    if (rides === 0 && coins === 0) continue; // only active members get a recap
    await trySend(
      bot,
      m.telegramUser!.id,
      m.id,
      "recap",
      `📊 <b>Haftangiz, ${m.fullName.split(" ")[0]}:</b>\n🚕 ${rides} safar · 🪙 +${formatNumber(coins)} tanga\nYangi hafta — yangi imkon. Liga yana 0 dan boshlandi! 🏁`,
    );
  }
}
