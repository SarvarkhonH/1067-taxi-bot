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
  type FareConfigResponse,
  type ReferralResponse,
  type WeeklyBoardResponse,
} from "@t1067/shared";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STARS = (r: number): string => "⭐".repeat(Math.max(0, Math.min(5, Math.round(r))));

const DIV = "━━━━━━━━━━━━━━";

export function renderWelcome(name: string): string {
  return (
    `🚕 <b>1067 TAXI</b>\n` +
    `Xush kelibsiz, <b>${esc(name)}</b>! 👋\n\n` +
    `Bir tugma bilan taxi chaqiring, har safardan <b>haqiqiy pul cashback</b> oling.\n\n` +
    `✨ <b>Sizni nima kutyapti:</b>\n` +
    `🚕 Taxi chaqirish — bir tugmada\n` +
    `💸 Har safar — cashback (haqiqiy pul)\n` +
    `🎁 Kunlik sovg'alar — streak · g'ildirak · qutilar\n` +
    `🏆 Liga + reyting — sovg'a uchun kurash\n` +
    `👥 Do'st taklif — ikkalangizga coin\n\n` +
    `Boshlash uchun raqamingizni ulashing 👇`
  );
}

export function renderLinkPrompt(): string {
  return (
    `🔗 <b>Bir qadam qoldi</b>\n\n` +
    `Hamyon, o'yinlar va cashback'ingizni ochish uchun telefon raqamingizni ulang.\n\n` +
    `Pastdagi <b>«📱 Raqamni ulashish»</b> tugmasini bosing — bir soniyada tayyor.`
  );
}

export function renderNotFound(): string {
  return (
    `😕 <b>Bu raqam topilmadi</b>\n\n` +
    `1067 Taxi tizimida ro'yxatdan o'tgan raqamni yuboring.\n` +
    `Hali mijoz emasmisiz? Bir marta <b>«🚖 Taxi chaqirish»</b> bilan safar qiling — keyin shu raqam ishlaydi. 🙌`
  );
}

export function renderTaken(): string {
  return `⚠️ <b>Bu profil band</b>\n\nUshbu raqam allaqachon boshqa Telegram akkauntga bog'langan. O'zingizniki bo'lsa — administrator bilan bog'laning.`;
}

/** Warm celebration the moment an account links. */
export function renderLinked(name: string, role: string): string {
  return `✅ <b>Tayyor!</b> ${esc(name)} (${role})\n\n🎉 Hamyon ochildi. Endi o'yna, yut, yech! Pastdagi menyudan boshlang 👇`;
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
  const streak = me.streak?.current ?? 0;

  const lines = [
    `${isDriver ? "🚗" : "🏅"} <b>${title}</b>`,
    `${level.emoji} <b>${esc(level.name)}</b>  ${bar} ${pct}%`,
    `<i>${toNext}</i>`,
    DIV,
    `💼 <b>HAMYON</b>`,
    `🚕 Cashback: <b>${formatNumber(stats.points)} so'm</b> <i>(safarlardan)</i>`,
    `🪙 Coin: <b>${formatNumber(me.coins)}</b> <i>(1 coin = 1 so'm — yechiladi)</i>`,
    DIV,
    `🔥 Streak: <b>${streak} kun</b>   🚕 Safar: <b>${formatNumber(stats.trips)}</b>`,
  ];
  if (isDriver) lines.push(`⭐ Reyting: <b>${stats.rating.toFixed(2)}</b> ${STARS(stats.rating)}`);
  lines.push(
    `📊 O'rin: <b>${me.rank ? rankMedal(me.rank) : "—"}</b>/${me.totalMembers}   🎖 <b>${earned.length}/${me.badges.length}</b> ${badgeStrip === "—" ? "" : badgeStrip}`,
    ``,
    `🎮 <i>Coin'ni ko'paytiring — «🎮 O'yinlar & Hamyon»da o'yna, yut, so'mga yech!</i>`,
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

/** kas1067 cashback + fare rules for passengers (the "use kas for clients" view). */
export function renderFare(cfg: FareConfigResponse): string {
  const cars = cfg.cars.length ? cfg.cars.map((c) => esc(c.name)).join(" · ") : "—";
  return (
    `🚕 <b>Narx va cashback</b> — ${esc(cfg.company.name)}\n\n` +
    `💰 <b>Cashback (har safardan):</b>\n` +
    `  • Ilovadan buyurtma: <b>+${formatNumber(cfg.cashback.perAppRide)} so'm</b>\n` +
    `  • Ilk safaringiz: <b>+${formatNumber(cfg.cashback.firstAppBonus)} so'm</b>\n` +
    `  <i>(${formatNumber(cfg.cashback.minDistanceKm)} km dan boshlab)</i>\n\n` +
    `🧮 <b>Taxi narxi:</b>\n` +
    `  • Eng kam: <b>${formatNumber(cfg.minimalPayment)} so'm</b> (${formatNumber(cfg.minimalDistanceKm)} km)\n` +
    `  • Keyin har km: <b>${formatNumber(cfg.perKmCity)} so'm</b> (shahar)\n\n` +
    `🚗 <b>Mashinalar:</b> ${cars}\n` +
    (cfg.company.phones.length ? `\n📞 Dispetcher: ${cfg.company.phones.map(esc).join(", ")}` : "") +
    `\n\n<i>Cashback'ni o'yinlarda oshiring — «🚀 Ilova».</i>`
  );
}

export function renderHelp(): string {
  return (
    `ℹ️ <b>1067 Taxi — yordam</b>\n\n` +
    `🚖 <b>Taxi</b> — «🚀 Ilova»da xaritadan chaqiring, jonli kuzating, bekor qiling.\n` +
    `💰 <b>Ikki hamyon</b> — 🚕 cashback (safardan) + 🪙 coin (bonuslardan). Ilovada bir-biriga o'tkaziladi, so'mga aylantiriladi.\n\n` +
    `<b>Coin topish:</b>\n` +
    `• 🔥 Kunlik streak · 🎯 vazifalar · 🎡 g'ildirak · 🎁 quti\n` +
    `• 🚕 Har safar — vazifa va liga ochkolari\n` +
    `• 👥 Do'st taklif: ikkalangizga +coin\n\n` +
    `<b>Buyruqlar:</b>\n` +
    `/start · /narx · /daily · /wheel · /missions · /invite · /me · /top\n\n` +
    `Savol? Dispetcher: «🚖 Narx & cashback»da raqamlar bor.`
  );
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
    return `🎁 Kunlik quti: ochildi — ${box.prize.emoji} <b>${esc(box.prize.label)}</b>. Ertaga yana!`;
  }
  if (box.eligible) {
    return `🎁 <b>BEPUL QUTI TAYYOR!</b> Pastdagi tugma bilan oching 👇`;
  }
  return `🎁 Kunlik quti: vazifalarni tugating (${box.dailiesDone}/${box.dailiesTotal}) — ichida <b>1 000 coin'gacha</b>!`;
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
    `🪙 U birinchi safarini qilganda sizga <b>+${formatNumber(reward)} coin</b> tushadi.\n\n` +
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
