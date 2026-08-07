// 📣 Koson public channel — publishes existing, already-idempotent events to an OPEN Telegram
// channel (NOT a money mechanic, only PUBLISHES). Gated per-caller by env KOSON_CHANNEL_ID (empty
// = silent no-op, so dev/preview never posts anywhere) plus each initiative's own feature flag.
// Every send swallows errors — a deleted channel or revoked admin right must never break the money
// path that calls us.
//
// Sender is REGISTERED at boot (same pattern as economyService.registerAdminNotifier) so money
// services can post without holding a Bot instance: a channel id ("-100…"/"@name") is just a chat
// id to bot.api.sendMessage.
import { prisma } from "../db";
import { env } from "../env";
import { featureOn } from "./featureFlags";

type Sender = (chatId: string, html: string) => Promise<void>;
let sender: Sender | null = null;

export function registerChannelSender(fn: Sender): void {
  sender = fn;
}

/** Infra-only gate (env + sender registered) — NOT flag-specific. Individual callers gate their
 *  own feature flag before calling postToChannel. */
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

/** 🔎 XIZMATLAR P4: «hafta TOP xizmatlari» — re-markets the whole directory to the existing taxi
 *  audience without them opening the Mini App. Gated by ITS OWN flag (`xizmatlar`).
 *  Own AppState marker (`channel:svcdigest`). Read-only (view/call counters), no coin path. */
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
