// 💡 Needs Engine (feature "aineeds") — the CAUTIOUS proactive layer. The AI reads a member's
// real habits and, at a good moment, sends ONE warm, value-first nudge in Koson-dialect Uzbek.
// ETHICAL persuasion only (Hooked triggers, honest loss-aversion, social proof, perfect timing) —
// NEVER deception/fake-scarcity: BirJoy is a trust company (Founder Bible §12.3), and in a small
// town a manipulative bot gets muted. Reuses the existing push guardrails via notifyOnce (2/day
// cap, opt-out, quiet hours 21-08, once-per-kind dedup) PLUS a weekly cap of 2. No new poller —
// piggybacks the existing engagement tick. Every message carries a one-tap [🔕 To'xtatish].
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db";

const WEEKLY_CAP = 2;
const WEEKDAY_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

function tashkent(d = new Date()): Date {
  return new Date(d.getTime() + 5 * 3600_000);
}
function weekKey(): string {
  const t = tashkent();
  const onejan = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.floor((t.getTime() - onejan) / (7 * 86400_000));
  return `${t.getUTCFullYear()}w${week}`;
}

async function weeklyCount(memberId: number): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: `needs_wk:${memberId}:${weekKey()}` } });
  return row ? Number(row.value) || 0 : 0;
}
async function bumpWeekly(memberId: number): Promise<void> {
  const { atomicIncrement } = await import("../appStateUtil");
  await atomicIncrement(`needs_wk:${memberId}:${weekKey()}`, 1);
}

const stopKb = (): InlineKeyboard => new InlineKeyboard().text("🔕 Bunday yozma", "needs:off");

/** One personalized nudge for one member (all guardrails inline, ONE message + stop button).
 *  Mirrors notifyService.trySend (opt-out + 2/day cap + once-per-kind dedup) so the Needs Engine
 *  never exceeds the smart-push budget, plus our own weekly cap. Returns true if actually sent. */
export async function sendNudge(bot: Bot, chatId: string, memberId: number, kind: string, html: string): Promise<boolean> {
  const { isNotifyOff, dayKey } = await import("../notifyService");
  if (await isNotifyOff(memberId)) return false; // user opted out of proactive push
  const dk = dayKey();
  if ((await prisma.notifyLog.count({ where: { memberId, dayKey: dk } })) >= 2) return false; // shared 2/day cap
  try {
    await prisma.notifyLog.create({ data: { memberId, kind, dayKey: dk } }); // claim BEFORE send (dedup + no crash-dup)
  } catch {
    return false; // this kind already fired today
  }
  await bot.api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: stopKb() }).catch(() => undefined);
  await bumpWeekly(memberId);
  return true;
}

/** CAUTIOUS trigger set (v0). Runs in morning/early-evening windows only; hard weekly cap. */
export async function needsEngineTick(bot: Bot): Promise<void> {
  const { featureOn } = await import("../featureFlags");
  if (!(await featureOn("aineeds"))) return;
  const { quietHours } = await import("../notifyService");
  if (quietHours()) return;
  const hour = tashkent().getUTCHours();
  // narrow windows keep it rare + well-timed (morning habit / midday referral)
  const morning = hour >= 7 && hour < 10;
  const midday = hour >= 12 && hour < 16;
  if (!morning && !midday) return;

  const todayDow = tashkent().getUTCDay();
  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null }, type: "client" },
    include: { telegramUser: true },
    take: 2000,
  });

  for (const m of linked) {
    const chatId = m.telegramUser!.id;
    if ((await weeklyCount(m.id)) >= WEEKLY_CAP) continue;

    // ── T1 (morning): HABIT-safar — same weekday ≥3× in last 4 weeks, and today is that day.
    // Powerful because it is genuinely useful + perfectly timed (personalization, not a blast).
    if (morning) {
      const since = new Date(Date.now() - 28 * 86400_000);
      const rides = await prisma.rideReward.findMany({ where: { memberId: m.id, createdAt: { gte: since } }, select: { createdAt: true } });
      if (rides.length >= 3) {
        const dowCount = new Map<number, number>();
        for (const r of rides) {
          const d = tashkent(r.createdAt).getUTCDay();
          dowCount.set(d, (dowCount.get(d) ?? 0) + 1);
        }
        if ((dowCount.get(todayDow) ?? 0) >= 3) {
          const sent = await sendNudge(
            bot,
            chatId,
            m.id,
            "needs_habit",
            `Assalomu alaykum! 🌅 Odatda <b>${WEEKDAY_UZ[todayDow]}</b> kunlari yo'lga chiqasiz — bugun ham taksi kerak bo'lsa, bir bosishда tayyor turaman. Yaxshi kun bo'lsin! 🚕`,
          );
          if (sent) continue;
        }
      }
    }

    // ── T2 (midday): REFERRAL seed — active rider (≥3 rides) who has invited NOBODY yet.
    // Honest value framing (earn tanga), social nudge, no pressure. Fires at most weekly.
    if (midday) {
      const trips = await prisma.rideReward.count({ where: { memberId: m.id } });
      if (trips >= 3) {
        const referred = await prisma.referral.count({ where: { referrerId: chatId } }); // telegram-id based
        if (referred === 0) {
          const sent = await sendNudge(
            bot,
            chatId,
            m.id,
            "needs_referral",
            `🎁 <b>Bilasizmi?</b> Bitta do'stingizni chaqirsangiz — u ilk safarini qilishi bilan <b>sizga 2000+ tanga</b> tushadi (unga ham sovg'a bor). Koson kichkina — kimdir albatta kerak qiladi 😊 «👥 Do'st» tugmasi orqali havolangizni ulashing.`,
          );
          if (sent) continue;
        }
      }
    }
  }
}
