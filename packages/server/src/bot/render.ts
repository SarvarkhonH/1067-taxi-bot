import {
  formatNumber,
  progressBar,
  rankMedal,
  badgeByCode,
  type LeaderboardResponse,
  type MeResponse,
  type MemberType,
} from "@t1067/shared";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STARS = (r: number): string => "⭐".repeat(Math.max(0, Math.min(5, Math.round(r))));

export function renderWelcome(name: string): string {
  return (
    `Assalomu alaykum, <b>${esc(name)}</b>! 👋\n\n` +
    `Bu — <b>1067 Taxi</b> bonus boti. Bu yerda siz:\n` +
    `• 💰 to'plagan ball/bonuslaringizni ko'rasiz\n` +
    `• 🏆 reytingda raqobatlashasiz\n` +
    `• 🎖 nishonlar yutib, darajangizni oshirasiz\n\n` +
    `Boshlash uchun telefon raqamingizni ulashing 👇`
  );
}

export function renderLinkPrompt(): string {
  return (
    `🔗 <b>Akkauntni bog'lash</b>\n\n` +
    `Ma'lumotlaringizni ko'rsatishim uchun telefon raqamingizni yuboring. ` +
    `Pastdagi <b>«📱 Raqamni ulashish»</b> tugmasini bosing.`
  );
}

export function renderNotFound(): string {
  return (
    `😕 Bu raqam bo'yicha hech narsa topilmadi.\n\n` +
    `1067 Taxi tizimida ro'yxatdan o'tgan raqamingizni yuboring yoki administrator bilan bog'laning.`
  );
}

export function renderTaken(): string {
  return `⚠️ Bu profil allaqachon boshqa Telegram akkauntga bog'langan. Administrator bilan bog'laning.`;
}

/** The hero card — the "beautiful bonuses" view, adapts to client vs driver. */
export function renderProfile(me: MeResponse): string {
  const { member, stats, level, nextLevel, type, metricLabel } = me;
  const isDriver = type === "driver";
  const title = isDriver && member.carNumber ? `${esc(member.fullName)} · ${esc(member.carNumber)}` : esc(member.fullName);

  const bar = progressBar(me.progress, 10);
  const pct = Math.round(me.progress * 100);
  const toNext =
    nextLevel && me.xpForNext !== null
      ? `${nextLevel.emoji} <b>${esc(nextLevel.name)}</b>gacha: <b>${formatNumber(nextLevel.minXp - me.xp)}</b> so'm`
      : `🏆 Eng yuqori daraja!`;

  const earned = me.badges.filter((b) => b.earned);
  const badgeStrip = earned.length ? earned.map((b) => b.emoji).join(" ") : "—";

  const lines = [
    `${isDriver ? "🚗" : "🏅"} <b>${title}</b>`,
    ``,
    `${level.emoji} <b>${esc(level.name)}</b> daraja`,
    `${bar}  ${pct}%`,
    toNext,
    ``,
    `💰 <b>${esc(metricLabel)}</b>: <b>${formatNumber(stats.points)} so'm</b>`,
    `🚕 Safarlar: <b>${formatNumber(stats.trips)}</b>`,
  ];
  if (isDriver) lines.push(`⭐ Reyting: <b>${stats.rating.toFixed(2)}</b> ${STARS(stats.rating)}`);
  lines.push(
    ``,
    `📊 O'rin: <b>${me.rank ? rankMedal(me.rank) : "—"}</b> / ${me.totalMembers}`,
    ``,
    `🎖 Nishonlar: <b>${earned.length}/${me.badges.length}</b>`,
    badgeStrip,
  );
  return lines.join("\n");
}

export function renderLeaderboard(lb: LeaderboardResponse, limit = 10): string {
  const heading = lb.type === "driver" ? "Haydovchilar reytingi" : "Mijozlar reytingi";
  const lines = lb.entries.slice(0, limit).map((e) => {
    const tag = e.isMe ? " 👈" : "";
    const name = e.isMe ? `<b>${esc(e.fullName)}</b>` : esc(e.fullName);
    return `${rankMedal(e.rank)} ${e.level.emoji} ${name} — <b>${formatNumber(e.points)} so'm</b>${tag}`;
  });

  let footer = "";
  if (lb.me && lb.me.rank > limit) {
    footer = `\n— — —\n👉 Siz: <b>${rankMedal(lb.me.rank)}</b> · ${formatNumber(lb.me.points)} ${esc(lb.metricLabel.toLowerCase())}`;
  }
  return `🏆 <b>${heading}</b> <i>(${esc(lb.metricLabel)})</i>\n\n${lines.join("\n")}${footer}`;
}

export function renderBadgeUnlocked(code: string): string | null {
  const b = badgeByCode(code);
  if (!b) return null;
  return (
    `🎉 <b>Yangi nishon ochildi!</b>\n\n` +
    `${b.emoji} <b>${esc(b.name)}</b>\n${esc(b.description)}\n\n` +
    `Tabriklaymiz! 🥳`
  );
}

/** Instant push when a member's cashback/balance grows (the addictive loop). */
export function renderEarnPush(delta: number, total: number, type: MemberType): string {
  const head =
    type === "client"
      ? `🎉 <b>+${formatNumber(delta)} so'm</b> cashback oldingiz!`
      : `💵 <b>+${formatNumber(delta)} so'm</b> balansingizga qo'shildi!`;
  return `${head}\n\n💰 Jami: <b>${formatNumber(total)} so'm</b>\n\nBatafsil: /me`;
}
