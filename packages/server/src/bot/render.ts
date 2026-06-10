import {
  formatNumber,
  progressBar,
  rankMedal,
  badgeByCode,
  type LeaderboardResponse,
  type MeResponse,
  type MemberType,
  type BoxStatusResponse,
  type MissionsResponse,
  type MissionView,
  type ReferralResponse,
  type WeeklyBoardResponse,
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
    `🚕 <b>${esc(metricLabel)}</b> (safarlardan): <b>${formatNumber(stats.points)} so'm</b>`,
    `🪙 <b>O'yin hamyoni</b>: <b>${formatNumber(me.coins)} coin</b> <i>(1 coin = 1 so'm, ilovada almashtiriladi)</i>`,
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

/** Weekly engagement league block, appended under the all-time leaderboard. */
export function renderWeeklyBlock(w: WeeklyBoardResponse): string {
  const prizes = w.prizes.map((p) => `${p.medal} ${formatNumber(p.amount)}`).join(" · ");
  const rows = w.entries.slice(0, 5).map((e) => {
    const name = e.isMe ? `<b>${esc(e.fullName)}</b> 👈` : esc(e.fullName);
    return `${rankMedal(e.rank)} ${name} — ${e.score} ball`;
  });
  let s =
    `\n\n⚡️ <b>Haftalik liga</b> <i>(${w.daysLeft} kun qoldi)</i>\n` +
    `Sovg'alar: ${prizes} coin\n\n` +
    (rows.length ? rows.join("\n") : "<i>Hafta endi boshlandi — birinchi bo'ling!</i>");
  if (w.me && w.me.rank > 5) s += `\n— — —\n👉 Siz: <b>#${w.me.rank}</b> · ${w.me.score} ball`;
  s += `\n\n<i>Ball: kunlik +10 · g'ildirak +10 · vazifa +15 · quti +20 · safar +30 · taklif +50. Dushanba — to'lov!</i>`;
  return s;
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

// ─── missions / quests ────────────────────────────────────────
function missionLine(x: MissionView): string {
  const bar = progressBar(x.target ? x.progress / x.target : 0, 6);
  const status = x.claimed
    ? "✅ olindi"
    : x.claimable
      ? `🎁 <b>+${formatNumber(x.reward)} coin</b> — tayyor!`
      : `${x.progress}/${x.target} · +${formatNumber(x.reward)}`;
  return `${x.emoji} ${esc(x.title)}\n   ${bar} ${status}`;
}

function boxLine(box: BoxStatusResponse): string {
  if (box.opened && box.prize) {
    return `🎁 Bepul quti: ochildi — ${box.prize.emoji} <b>${esc(box.prize.label)}</b>. 💎 Premium quti esa doim ochiq (${formatNumber(box.premiumCost)} coin)!`;
  }
  if (box.eligible) {
    return `🎁 <b>BEPUL QUTI TAYYOR!</b> Pastdagi tugma bilan oching 👇`;
  }
  return `🎁 Bepul quti: kunlik vazifalarni tugating (${box.dailiesDone}/${box.dailiesTotal}) — ichida <b>10 000 coin'gacha</b>!`;
}

export function renderMissions(m: MissionsResponse, box?: BoxStatusResponse): string {
  const claimable = [...m.daily, ...m.weekly].filter((x) => x.claimable).length;
  const head =
    claimable > 0
      ? `🎯 <b>Topshiriqlar</b> — ${claimable} ta mukofot tayyor! 🎁`
      : `🎯 <b>Topshiriqlar</b>`;
  return (
    `${head}\n\n` +
    `📅 <b>Kunlik</b>\n${m.daily.map(missionLine).join("\n")}\n\n` +
    `🗓 <b>Haftalik</b>\n${m.weekly.map(missionLine).join("\n")}\n\n` +
    (box ? `${boxLine(box)}\n\n` : "") +
    `<i>Mukofotni olish uchun pastdagi tugmani bosing yoki «🚀 Ilova»da yig'ing.</i>`
  );
}

// ─── referral ─────────────────────────────────────────────────
export function renderReferral(r: ReferralResponse): string {
  return (
    `👥 <b>Do'st taklif qiling — ikkalangiz ham coin olasiz!</b>\n\n` +
    `Har bir do'st uchun:\n` +
    `  • Siz: <b>+${formatNumber(r.rewardReferrer)} coin</b>\n` +
    `  • Do'stingiz: <b>+${formatNumber(r.rewardReferee)} coin</b>\n\n` +
    `🔗 <b>Sizning havolangiz:</b>\n${esc(r.link)}\n\n` +
    `✅ Taklif qilingan: <b>${r.invited}</b>\n` +
    `🪙 Ishlab topgan: <b>${formatNumber(r.earned)} coin</b>\n\n` +
    `<i>1 coin = 1 so'm — ilovada haqiqiy pulga aylantiriladi. Do'stingiz havola orqali kirib, raqamini ulasa — avtomatik tushadi.</i>`
  );
}

/** Notify the inviter the moment their referral lands (variable, social-proof reward). */
export function renderReferralWin(reward: number): string {
  return (
    `🎉 <b>Do'stingiz qo'shildi!</b>\n\n` +
    `🪙 <b>+${formatNumber(reward)} coin</b> hamyoningizga tushdi.\n\n` +
    `Yana taklif qiling — daromad cheksiz! 👥`
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
