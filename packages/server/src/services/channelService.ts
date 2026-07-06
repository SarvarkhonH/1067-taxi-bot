// 📣 Koson public channel (W1 №2 "Jackpot-shou") — the cheapest viral engine: every ride-jackpot
// win + a Monday digest go to an OPEN Telegram channel, so wins become small-town talk ("falonchi
// taksidan pul yutibdi"). NOT a money mechanic — it only PUBLISHES existing, already-idempotent
// events. Double gate: feature flag "jackpotpost" (kill switch) AND env KOSON_CHANNEL_ID (empty =
// silent no-op, so dev/preview never posts anywhere). Every send swallows errors — a deleted
// channel or revoked admin right must never break the money path that calls us.
//
// Sender is REGISTERED at boot (same pattern as economyService.registerAdminNotifier) so money
// services can post without holding a Bot instance: a channel id ("-100…"/"@name") is just a chat
// id to bot.api.sendMessage.
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { featureOn } from "./featureFlags";

type Sender = (chatId: string, html: string) => Promise<void>;
let sender: Sender | null = null;

export function registerChannelSender(fn: Sender): void {
  sender = fn;
}

/** Infra-only gate (env + sender registered) — NOT flag-specific. Individual callers gate their
 *  own feature flag before calling postToChannel, so unrelated initiatives (jackpot vs xizmatlar
 *  digest) can be killed independently without one flag silencing the other's posts. */
async function channelInfraReady(): Promise<boolean> {
  return Boolean(env.KOSON_CHANNEL_ID) && sender !== null;
}

/** Fire-and-forget post to the public channel. Never throws. Caller must check its own flag first. */
export async function postToChannel(html: string): Promise<void> {
  if (!(await channelInfraReady())) return;
  await sender!(env.KOSON_CHANNEL_ID, html).catch((e) => {
    console.error("[channel] post failed:", e instanceof Error ? e.message.slice(0, 120) : e);
  });
}

/** First given name only — small-town privacy: "Dilshod yutdi" is the point, the full identity
 *  is not. displayName wins over kas fullName (user's own choice), same rule as everywhere else. */
export function channelName(displayName: string | null, fullName: string): string {
  const base = (displayName || fullName || "Mijoz").trim();
  return base.split(/\s+/)[0] ?? "Mijoz";
}

/** 🎰 A ride-jackpot was just won (called from the cashbackService jackpot branch, AFTER the
 *  idempotent claim — so this fires at most once per win). */
export async function announceJackpotWin(name: string, amount: number): Promise<void> {
  if (!(await featureOn("jackpotpost"))) return;
  await postToChannel(
    `🎰🎰🎰 <b>JACKPOT!</b>\n\n<b>${name}</b> bugun 1067 taxidan <b>${formatNumber(amount)} tanga</b> yutib oldi — safari BEPUL chiqdi! 🎉\n\n` +
      `Har safar jamg'armani o'stiradi — keyingisi sizniki bo'lishi mumkin. 🚕 @koson1067bot`,
  );
}

/** 📊 Monday digest — rides the existing 15-min tick (no new poller); the AppState marker makes it
 *  once per ISO-Monday. Numbers come from our own tables (read-only). */
export async function maybeWeeklyChannelDigest(): Promise<void> {
  if (!(await channelInfraReady()) || !(await featureOn("jackpotpost"))) return;
  const tashkent = new Date(Date.now() + 5 * 3600_000);
  if (tashkent.getUTCDay() !== 1) return; // Monday (Tashkent) only
  const dayKey = tashkent.toISOString().slice(0, 10);
  const row = await prisma.appState.findUnique({ where: { key: "channel:digest" } }).catch(() => null);
  if (row?.value === dayKey) return;
  await prisma.appState.upsert({ where: { key: "channel:digest" }, create: { key: "channel:digest", value: dayKey }, update: { value: dayKey } }).catch(() => undefined);

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [rides, paid, topWin] = await Promise.all([
    prisma.rideReward.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.rideReward.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.rideReward.findFirst({ where: { createdAt: { gte: weekAgo } }, orderBy: { amount: "desc" } }),
  ]);
  if (rides === 0) return; // dead week → no embarrassing empty digest
  const lines = [
    "📊 <b>1067 — o'tgan hafta</b>",
    `🚕 ${formatNumber(rides)} safar bajarildi`,
    `🪙 Mijozlarga ${formatNumber(Math.round(paid._sum.amount ?? 0))} tanga qaytdi`,
  ];
  if (topWin && topWin.amount > 0) lines.push(`🏆 Haftaning eng katta yutug'i: ${formatNumber(Math.round(topWin.amount))} tanga`);
  lines.push("", "Siz ham har safardan tanga oling 🚕 @koson1067bot");
  await postToChannel(lines.join("\n"));
}

/** 🔎 XIZMATLAR P4: «hafta TOP xizmatlari» — re-markets the whole directory to the existing taxi
 *  audience without them opening the Mini App. Gated by ITS OWN flag (`xizmatlar`), fully
 *  independent of jackpotpost — killing one initiative's channel posts never silences the other's.
 *  Own AppState marker (`channel:svcdigest`) so it can't collide with the jackpot digest's marker
 *  even if both fire in the same tick. Read-only (view/call counters), no coin path. */
export async function maybeWeeklyServicesDigest(): Promise<void> {
  if (!(await channelInfraReady()) || !(await featureOn("xizmatlar"))) return;
  const tashkent = new Date(Date.now() + 5 * 3600_000);
  if (tashkent.getUTCDay() !== 1) return; // Monday (Tashkent) only
  const dayKey = tashkent.toISOString().slice(0, 10);
  const row = await prisma.appState.findUnique({ where: { key: "channel:svcdigest" } }).catch(() => null);
  if (row?.value === dayKey) return;
  await prisma.appState.upsert({ where: { key: "channel:svcdigest" }, create: { key: "channel:svcdigest", value: dayKey }, update: { value: dayKey } }).catch(() => undefined);

  // all-time callCount/rankScore (not a weekly delta yet — good enough while the catalog is young)
  const top = await prisma.serviceListing.findMany({
    where: { status: "active", OR: [{ callCount: { gt: 0 } }, { reviewCount: { gt: 0 } }] },
    include: { category: { select: { emoji: true } } },
    orderBy: [{ callCount: "desc" }, { rankScore: "desc" }],
    take: 5,
  });
  if (top.length === 0) return; // hali hech kim qidirmagan — bo'sh digest yubormaymiz
  const lines = ["📊 <b>1067 Xizmatlar — hafta TOP</b>", ""];
  top.forEach((l, i) => {
    const stars = l.reviewCount > 0 ? ` · ★${(Math.round(l.avgRating * 10) / 10).toFixed(1)}` : "";
    lines.push(`${i + 1}. ${l.category.emoji || "🏪"} <b>${l.name}</b> — 📞 ${l.callCount}${stars}`);
  });
  lines.push("", "Koson'dagi barcha xizmatlar bitta joyda 🔎 @koson1067bot");
  await postToChannel(lines.join("\n"));
}
