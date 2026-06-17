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
import type { CheckInResult, WheelResult } from "../services/rewardService";

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
    `👥 Do'st taklif — ikkalangizga tanga\n\n` +
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
    `🪙 Tanga: <b>${formatNumber(me.coins)}</b> <i>(1 tanga = 1 so'm — yechiladi)</i>`,
    DIV,
    `🔥 Streak: <b>${streak} kun</b>   🚕 Safar: <b>${formatNumber(stats.trips)}</b>`,
  ];
  if (isDriver) lines.push(`⭐ Reyting: <b>${stats.rating.toFixed(2)}</b> ${STARS(stats.rating)}`);
  lines.push(
    `📊 O'rin: <b>${me.rank ? rankMedal(me.rank) : "—"}</b>/${me.totalMembers}   🎖 <b>${earned.length}/${me.badges.length}</b> ${badgeStrip === "—" ? "" : badgeStrip}`,
    ``,
    `🎮 <i>Tangani ko'paytiring — «🎮 O'yinlar & Hamyon»da o'yna, yut, so'mga yech!</i>`,
  );
  return lines.join("\n");
}

/** 👤 Account & settings — full info (kas-managed name/phone, read-only) + editable prefs. */
export function renderAccount(me: MeResponse, opts: { joined: Date | null; notifyOff: boolean }): string {
  const { member, stats, level, type } = me;
  const isDriver = type === "driver";
  const phone = member.phone ?? "";
  const maskedPhone = phone ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : "—";
  const joined = opts.joined ? opts.joined.toISOString().slice(0, 10) : "—";
  return [
    `👤 <b>${esc(member.fullName)}</b>${isDriver && member.carNumber ? ` · ${esc(member.carNumber)}` : ""}`,
    `${level.emoji} <b>${esc(level.name)}</b>`,
    DIV,
    `📞 Telefon: <b>${maskedPhone}</b>  <i>(1067 orqali)</i>`,
    `🆔 Holat: <b>${isDriver ? "Haydovchi" : "Mijoz"}</b>`,
    `📅 A'zo: <b>${joined}</b>`,
    DIV,
    `🚕 Safar: <b>${formatNumber(stats.trips)}</b>${isDriver ? `   ⭐ Reyting: <b>${stats.rating.toFixed(2)}</b>` : ""}`,
    `💰 Cashback: <b>${formatNumber(stats.points)} so'm</b>   🪙 Tanga: <b>${formatNumber(me.coins)}</b>`,
    `🔥 Streak: <b>${me.streak?.current ?? 0} kun</b>   📊 O'rin: <b>${me.rank ?? "—"}</b>/${me.totalMembers}`,
    DIV,
    `⚙️ <b>Sozlamalar</b>`,
    `🔔 Bildirishnomalar: <b>${opts.notifyOff ? "🔴 o'chiq" : "🟢 yoniq"}</b>`,
    ``,
    `<i>Ism va telefon 1067 tizimida boshqariladi — o'zgartirish: 1067 ga qo'ng'iroq.</i>`,
  ].join("\n");
}

/** 🏘 V5 — mahalla (gap-vs-gap) league card. */
export function renderMahalla(b: {
  week: string;
  gaps: { name: string; members: number; score: number; rank: number }[];
  me: { name: string; rank: number; score: number } | null;
}): string {
  if (!b.gaps.length) return "🏘 <b>Mahalla ligasi</b>\n\nHali davralar yo'q. «👥 Do'st» → Gap davra ochib, mahallangiz uchun tanga to'plang!";
  const medal = (r: number): string => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `${r}.`);
  const rows = b.gaps.slice(0, 10).map((g) => `${medal(g.rank)} <b>${esc(g.name)}</b> — ${formatNumber(g.score)} tanga · ${g.members} kishi`).join("\n");
  const mine = b.me
    ? `\n\n📍 Sizning davrangiz: <b>${esc(b.me.name)}</b> — ${medal(b.me.rank)} o'rin (${formatNumber(b.me.score)} tanga)`
    : `\n\n<i>Siz hali davrada emassiz — «👥 Do'st» → Gap orqali qo'shiling.</i>`;
  return `🏘 <b>Mahalla ligasi</b> <i>(${b.week})</i>\nDavra-vs-davra haftalik tanga:\n\n${rows}${mine}`;
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
    return `${rankMedal(e.rank)} ${name} — 🪙 ${formatNumber(e.score)} tanga`;
  });
  let s =
    `\n\n⚡️ <b>Haftalik liga</b> <i>(${w.daysLeft} kun qoldi)</i>\n` +
    `Sovg'alar: ${prizes} tanga\n\n` +
    (rows.length ? rows.join("\n") : "<i>Hafta endi boshlandi — birinchi bo'ling!</i>");
  if (w.me && w.me.rank > 5) s += `\n— — —\n👉 Siz: <b>#${w.me.rank}</b> · 🪙 ${formatNumber(w.me.score)} tanga`;
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
    `💰 <b>Ikki hamyon</b> — 🚕 cashback (safardan) + 🪙 tanga (bonuslardan). Ilovada bir-biriga o'tkaziladi, so'mga aylantiriladi.\n\n` +
    `<b>Tanga topish:</b>\n` +
    `• 🔥 Kunlik streak · 🎯 vazifalar · 🎡 g'ildirak · 🎁 quti\n` +
    `• 🚕 Har safar — vazifa va liga ochkolari\n` +
    `• 👥 Do'st taklif: ikkalangizga +tanga\n\n` +
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
      ? `🎁 <b>+${formatNumber(x.reward)} tanga</b> — tayyor!`
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
  return `🎁 Kunlik quti: vazifalarni tugating (${box.dailiesDone}/${box.dailiesTotal}) — ichida <b>1 000 tangagacha</b>!`;
}

export function renderMissions(m: MissionsResponse, box?: BoxStatusResponse): string {
  const claimable = [...m.daily, ...m.weekly].filter((x) => x.claimable).length;
  const head =
    claimable > 0
      ? `🎯 <b>Vazifalar</b> — ${claimable} ta mukofot tayyor! 🎁`
      : `🎯 <b>Vazifalar</b>`;
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
    `👥 <b>Do'st taklif qiling — ikkalangiz ham tanga olasiz!</b>\n\n` +
    `Har bir do'st uchun:\n` +
    `  • Siz: <b>+${formatNumber(r.rewardReferrer)} tanga</b>\n` +
    `  • Do'stingiz: <b>+${formatNumber(r.rewardReferee)} tanga</b>\n\n` +
    `🔗 <b>Sizning havolangiz:</b>\n${esc(r.link)}\n\n` +
    `✅ Taklif qilingan: <b>${r.invited}</b>\n` +
    `🪙 Ishlab topgan: <b>${formatNumber(r.earned)} tanga</b>\n\n` +
    `<i>1 tanga = 1 so'm — ilovada haqiqiy pulga aylantiriladi. Do'stingiz havola orqali kirib, raqamini ulasa — avtomatik tushadi.</i>`
  );
}

/** Notify the inviter the moment their referral lands (variable, social-proof reward). */
export function renderReferralWin(reward: number): string {
  return (
    `🎉 <b>Do'stingiz qo'shildi!</b>\n\n` +
    `🪙 U birinchi safarini qilganda sizga <b>+${formatNumber(reward)} tanga</b> tushadi.\n\n` +
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

// ── moved from bot.ts (T3 G5: centralize user-facing text in render.ts) ──

export function renderCheckIn(r: CheckInResult): string {
  if (r.alreadyChecked) {
    let s = `🔥 <b>Streak: ${r.current} kun</b>\n\nBugun allaqachon belgilangansiz ✅\nErtaga yana keling — streak'ni uzmang!`;
    if (r.next) s += `\n\n🎯 ${r.next.day}-kunda: <b>+${formatNumber(r.next.reward)} tanga</b>`;
    return s;
  }
  let s = `🔥 <b>Streak: ${r.current} kun!</b>\n`;
  if (r.rewardAmount > 0) {
    s += `\n🎉 <b>+${formatNumber(r.rewardAmount)} tanga!</b>${r.rewardApplied ? " — hamyoningizga tushdi 🪙" : ""}`;
  } else {
    s += `\nDavom eting — har kun streak o'sadi 💪`;
  }
  if (r.next) s += `\n\n🎯 Keyingi mukofot: ${r.next.day}-kun → <b>+${formatNumber(r.next.reward)} tanga</b>`;
  return s;
}

export function renderWheel(r: WheelResult): string {
  const pool = `\n\n🎰 JACKPOT hozir: <b>${formatNumber(r.jackpot)} tanga</b> — har safar uni oshiradi!`;
  if (r.noRide) {
    return `🎡 <b>Omad g'ildiragi endi SAFAR ICHIDA aylanadi!</b>\n\nTaxi chaqiring — mashinada ketayotganingizda aylantirasiz. Har spin YUTADI! 🚕${pool}`;
  }
  if (r.alreadySpun) {
    return `🎡 Bu safarning spini ishlatilgan.\nYutuq: ${r.prize.emoji} <b>${esc(r.prize.label)}</b>\n\nKeyingi safarda yana aylantirasiz! 🚕${pool}`;
  }
  if (r.prize.label.startsWith("JACKPOT")) {
    return `🎰🎰🎰 <b>JACKPOT!!!</b> 🎰🎰🎰\n\n💥 <b>+${formatNumber(r.prize.amount)} tanga</b>${r.applied ? " — hamyoningizga tushdi 🪙" : ""}!\n\nButun jamg'arma sizniki bo'ldi! 👑${pool}`;
  }
  return `🎉 ${r.prize.emoji} <b>${esc(r.prize.label)}!</b>\n\n+${formatNumber(r.prize.amount)} tanga${r.applied ? " — hamyoningizga tushdi 🪙" : ""}!${pool}`;
}

/** Driver earnings panel (text). */
export function renderDriverPanel(
  coins: number,
  e: { todayIn: number; totalIn: number; txns: { amount: number; reason: string }[] },
  recruit?: { recruits: number; recruitsThisMonth: number; earnedTotal: number; earnedThisMonth: number; revshareCapLeft: number; newRecruitCapLeft: number },
): string {
  const txnLines = e.txns
    .slice(0, 6)
    .map((t) => `  ${t.amount > 0 ? "➕" : "➖"} ${formatNumber(Math.abs(t.amount))} — ${esc(t.reason)}`)
    .join("\n");
  const recruitBlock = recruit
    ? `\n🚖 <b>MIJOZ TAKLIF (QR)</b>\n` +
      `👥 Mijozlaringiz: <b>${formatNumber(recruit.recruits)}</b>` +
      (recruit.recruitsThisMonth ? ` <i>(bu oy +${formatNumber(recruit.recruitsThisMonth)})</i>` : "") +
      `\n💰 QR-dan tushum: bu oy <b>${formatNumber(recruit.earnedThisMonth)}</b> · jami <b>${formatNumber(recruit.earnedTotal)}</b> tanga\n` +
      `📅 Bu oy yana: <b>${formatNumber(recruit.revshareCapLeft)}</b> tanga · <b>${formatNumber(recruit.newRecruitCapLeft)}</b> yangi mijoz\n` +
      `<i>«📷 Mening QR kodim» — mijozga ko'rsating; skanerlab safar qilsa sizga tanga tushadi.</i>\n`
    : "";
  return (
    `🚗 <b>Haydovchi paneli</b>\n\n` +
    `🪙 Tanga balans: <b>${formatNumber(coins)}</b>\n` +
    `📈 Bugun tushdi: <b>+${formatNumber(e.todayIn)}</b>\n` +
    `💼 Jami tushum (tip/o'tkazma): <b>${formatNumber(e.totalIn)}</b>\n` +
    recruitBlock +
    (txnLines ? `\n📜 Oxirgi amallar:\n${txnLines}\n` : "") +
    `\n💸 Tangalarni so'mga yechish — «🚀 Ilova» → Hamyon.\n🙏 Mijozlar safardan keyin sizga tanga bilan rahmat ayta oladi.`
  );
}

/** Badges screen (text). */
export function renderBadges(me: MeResponse): string {
  const lines = me.badges.map((b) => `${b.earned ? b.emoji : "🔒"} <b>${esc(b.name)}</b> — ${b.earned ? "olingan ✅" : esc(b.description)}`);
  const earned = me.badges.filter((b) => b.earned).length;
  return `🎖 <b>Nishonlar</b> (${earned}/${me.badges.length})\n\n${lines.join("\n")}`;
}
