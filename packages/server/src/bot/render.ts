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

// firstRideBonus > 0 → show the "first ride = N tanga" hook (gated by the welcomebonus flag
// in the caller, so the copy NEVER promises a bonus the mechanic won't pay).
// Minimalizm (ega qarori 2026-07-26): /start — BITTA qisqa xabar, bitta harakat.
// Ilgari bu yerda AI-tanishtiruvi + «yozing yoki gapiring» ko'rsatmasi bor edi va ustiga
// alohida qadalgan ilova-kartasi ham yuborilardi — yangi foydalanuvchi bir vaqtda ikkita
// xabar va uchta taklif ko'rardi. Endi: raqam ulash → (ulangach) ilova havolasi. Tamom.
export function renderWelcome(name: string, firstRideBonus = 0): string {
  const hook =
    firstRideBonus > 0
      ? `\n🎁 Birinchi safaringiz uchun <b>${formatNumber(firstRideBonus)} tanga</b> sovg'a.\n`
      : "";
  return (
    `Salom, <b>${esc(name)}</b>! 👋\n` +
    hook +
    `\nBoshlash uchun raqamingizni ulang 👇`
  );
}

/** /start — ALREADY LINKED. One short line under the brand poster; no stats dump. The ladder,
 *  wallet, streak and rank all live in the app (and /me) — repeating them here was 20 lines of
 *  noise before the one button that actually matters. */
export function renderStartLinked(name: string): string {
  return (
    `Salom, <b>${esc(name)}</b>! 👋\n\n` +
    `Taksi · do'kon · restoran · hamyon — hammasi ilovada.\n\n` +
    `<i>Statistikangiz: /me</i>`
  );
}

/** /start — NOT LINKED YET. The old flow demanded a phone number before showing anything, and
 *  286 of 289 unlinked people never even tapped the button (DB, 2026-07-26). So the app comes
 *  FIRST and the number is offered second — both in this one message's keyboard. */
export function renderStartWelcome(name: string, firstRideBonus = 0): string {
  const hook = firstRideBonus > 0 ? `\n🎁 Birinchi safaringizga <b>${formatNumber(firstRideBonus)} tanga</b> sovg'a.\n` : "";
  return (
    `Salom, <b>${esc(name)}</b>! 👋\n\n` +
    `<b>BirJoy</b> — bir shahar, ko'plab xizmatlar: taksi, do'kon, restoran, xizmatlar.\n` +
    hook +
    `\n👇 <b>Ilovani oching</b> — ko'rib chiqing, hamma narsa ochiq.\n` +
    `📱 Taksi chaqirish va tangalar uchun raqamingizni ulang — bir bosishda.`
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
    `Taksida ro'yxatdan o'tgan raqamni yuboring.\n` +
    `📲 Taksidagi raqamingiz Telegram raqamingizdan boshqa bo'lsa — /boshqaraqam bilan ulang.\n` +
    `Hali mijoz emasmisiz? Bir marta <b>«🚖 Taxi chaqirish»</b> bilan safar qiling — keyin shu raqam ishlaydi. 🙌`
  );
}

export function renderTaken(): string {
  return `⚠️ <b>Bu profil band</b>\n\nUshbu raqam allaqachon boshqa Telegram akkauntga bog'langan. O'zingizniki bo'lsa — administrator bilan bog'laning.`;
}

/** Warm celebration the moment an account links. Post AI-first menu removal (2026-07-23) there is
 *  no "pastdagi menyu" anymore — this is the single best moment to seed 2-3 concrete example
 *  phrases (bonus/g'ildirak + do'st taklif were the two things people struggled to find) plus the
 *  /menu escape hatch, instead of pointing at a keyboard that no longer exists. */
// Ro'yxatdan o'tgach — bitta qisqa tasdiq + ilovaga kirish (chaqiruvchi web-app tugmasini qo'yadi).
export function renderLinked(name: string): string {
  return `✅ <b>Tayyor</b>, ${esc(name)}!\n\nIlovani oching 👇`;
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

export function renderLeaderboard(lb: LeaderboardResponse, limit = 10): string {
  const heading = lb.type === "driver" ? "Haydovchilar reytingi" : "Mijozlar reytingi";
  // Ranked by ORDER COUNT (trips), not money — show the count, not so'm. Unit = "buyurtma"/"safar".
  const unit = esc(lb.metricLabel.toLowerCase());
  const lines = lb.entries.slice(0, limit).map((e) => {
    const tag = e.isMe ? " 👈" : "";
    const name = e.isMe ? `<b>${esc(e.fullName)}</b>` : esc(e.fullName);
    return `${rankMedal(e.rank)} ${e.level.emoji} ${name} — <b>${formatNumber(e.trips)}</b> ${unit}${tag}`;
  });

  let footer = "";
  if (lb.me && lb.me.rank > limit) {
    footer = `\n— — —\n👉 Siz: <b>${rankMedal(lb.me.rank)}</b> · ${formatNumber(lb.me.trips)} ${unit}`;
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
    `ℹ️ <b>BirJoy — yordam</b>\n\n` +
    `🤖 <b>Koson AI</b> — shunchaki tabiiy tilда yozing, men tushunaman: «uyimga taksi», «osh buyurtma qil», «santexnik kerak», «ertaga 7 da eslat», «bu oy qancha ishlatdim». Dardlashsangiz ham — tinglayman. /ai\n` +
    `🧠 <b>Ma'lumot berish</b> — Koson haqida bilganingizni yozing, AI o'rgansin. /bilim\n\n` +
    `🚖 <b>Taxi</b> — «🚀 Ilova»da xaritadan chaqiring, jonli kuzating, bekor qiling.\n` +
    `💰 <b>Ikki hamyon</b> — 🚕 cashback (safardan) + 🪙 tanga (bonuslardan). Ilovada bir-biriga o'tkaziladi, so'mga aylantiriladi.\n\n` +
    `<b>Tanga topish:</b>\n` +
    `• 🔥 Kunlik streak · 🎯 vazifalar · 🎡 g'ildirak · 🎁 quti\n` +
    `• 👥 Do'st taklif: ikkalangizga +tanga\n\n` +
    `<b>Buyruqlar:</b>\n` +
    `/ai · /bilim · /start · /narx · /daily · /wheel · /invite · /me · /top`
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
  const stats =
    r.invited > 0
      ? `🔥 Siz allaqachon <b>${r.invited}</b> do'st chaqirib <b>${formatNumber(r.earned)} tanga</b> ishladingiz!\n\n`
      : `<i>Hali hech kimni chaqirmadingiz — birinchi do'stingiz bir bosishda 👇</i>\n\n`;
  return (
    `🎁 <b>Do'st chaqiring — IKKALANGIZ ham yutasiz</b>\n\n` +
    `Har bir do'stingiz havolangiz orqali kelib birinchi safarini qilganda:\n\n` +
    `🚕 <b>Do'stingizga</b> — birinchi safar butunlay <b>BEPUL</b>\n` +
    `     <i>(+${formatNumber(r.rewardReferee)} tanga sovg'a)</i>\n` +
    `💚 <b>Sizga</b> — <b>+${formatNumber(r.rewardReferrer)} tanga</b>, har bir do'st uchun\n` +
    `     <i>cheklov yo'q — qancha ko'p chaqirsangiz, shuncha ko'p 🪙</i>\n\n` +
    stats +
    `🔗 <b>Shaxsiy havolangiz</b> <i>(ustiga bosib nusxalang)</i>:\n` +
    `<code>${esc(r.link)}</code>\n\n` +
    `<i>1 tanga = 1 so'm — ilovada haqiqiy pulga aylanadi.</i>\n` +
    `Pastdagi tugma bilan bir bosishda ulashing 👇`
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
  recruit?: { recruits: number; recruitsThisMonth: number; pendingRecruits: number; earnedTotal: number; earnedThisMonth: number; revshareCapLeft: number; newRecruitCapLeft: number },
  kas?: { linked: boolean; carNumber?: string; balance?: number; debt?: number; ridesToday?: number; fareToday?: number },
): string {
  // kas account block (Bosqich 2-4): shown only after /driver_login. Surfaces the driver's REAL kas
  // balance/debt + today's rides; an unlinked driver gets a one-line prompt to connect.
  const kasBlock = !kas
    ? ""
    : kas.linked
      ? `\n🚗 <b>KAS HISOBI</b> · <code>${esc(kas.carNumber ?? "")}</code>\n` +
        (kas.balance != null ? `👛 Balans: <b>${formatNumber(kas.balance)} so'm</b>\n` : "") +
        (kas.debt != null && kas.debt > 0 ? `⚠️ Qarz: <b>${formatNumber(kas.debt)} so'm</b> — /qarz\n` : "") +
        (kas.ridesToday != null ? `🚕 Bugun: <b>${formatNumber(kas.ridesToday)}</b> safar · <b>${formatNumber(kas.fareToday ?? 0)} so'm</b>\n` : "")
      : `\n🔑 <b>Kas hisobingizni ulang</b> — /driver_login bilan safar, daromad va qarzni shu yerda ko'rasiz.\n`;
  const txnLines = e.txns
    .slice(0, 6)
    .map((t) => `  ${t.amount > 0 ? "➕" : "➖"} ${formatNumber(Math.abs(t.amount))} — ${esc(t.reason)}`)
    .join("\n");
  const recruitBlock = recruit
    ? `\n🚖 <b>MIJOZ TAKLIF (QR)</b>\n` +
      `👥 Mijozlaringiz: <b>${formatNumber(recruit.recruits)}</b>` +
      (recruit.recruitsThisMonth ? ` <i>(bu oy +${formatNumber(recruit.recruitsThisMonth)})</i>` : "") +
      `\n` +
      (recruit.pendingRecruits ? `⏳ Kutilmoqda: <b>${formatNumber(recruit.pendingRecruits)}</b> — skanladi, hali 1-safar qilmagan\n` : "") +
      `💰 QR-dan tushum: bu oy <b>${formatNumber(recruit.earnedThisMonth)}</b> · jami <b>${formatNumber(recruit.earnedTotal)}</b> tanga\n` +
      `📅 Bu oy yana: <b>${formatNumber(recruit.revshareCapLeft)}</b> tanga · <b>${recruit.newRecruitCapLeft < 0 ? "cheksiz" : formatNumber(recruit.newRecruitCapLeft)}</b> yangi mijoz\n` +
      `<i>«📷 Mening QR kodim» — mijozga ko'rsating; skanerlab safar qilsa sizga tanga tushadi.</i>\n`
    : "";
  return (
    `🚗 <b>Haydovchi paneli</b>\n\n` +
    `🪙 Tanga balans: <b>${formatNumber(coins)}</b>\n` +
    `📈 Bugun tushdi: <b>+${formatNumber(e.todayIn)}</b>\n` +
    `💼 Jami tushum (tip/o'tkazma): <b>${formatNumber(e.totalIn)}</b>\n` +
    kasBlock +
    recruitBlock +
    (txnLines ? `\n📜 Oxirgi amallar:\n${txnLines}\n` : "") +
    `\n💸 Tangalarni so'mga yechish — «🚀 Ilova» → Hamyon.\n🙏 Mijozlar safardan keyin sizga tanga bilan rahmat ayta oladi.`
  );
}

/** 🏆 drvrank: monthly driver QR-income leaderboard. Short names ("Axmedov Y.") — drivers see each
 *  other's hustle, that's the motivation engine; full amounts stay in each driver's own panel. */
export function renderDriverRank(
  lb: { top: { driverId: number; name: string; earned: number }[]; myRank: number | null; myEarned: number; total: number },
  meId: number,
): string {
  const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  const month = MONTHS[new Date(Date.now() + 5 * 3600 * 1000).getUTCMonth()]!;
  const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : x);
  const shortName = (s: string) => {
    const w = s.trim().split(/\s+/);
    return w.length > 1 ? `${cap(w[0]!)} ${w[1]![0]!.toUpperCase()}.` : cap(w[0] ?? "?");
  };
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);
  const lines = lb.top.map((r, i) =>
    `${medal(i)} ${r.driverId === meId ? "<b>SIZ</b>" : esc(shortName(r.name))} — <b>${formatNumber(r.earned)}</b> tanga`,
  );
  const myLine =
    lb.myRank !== null
      ? `\n\n📍 Siz: <b>№${lb.myRank}</b> (${lb.total} tadan) · bu oy <b>${formatNumber(lb.myEarned)}</b> tanga`
      : `\n\n📍 Siz hali ro'yxatda emassiz — QR'ni mijozga ko'rsating, birinchi mijozdanoq reytingga kirasiz.`;
  const body = lines.length ? lines.join("\n") : "Bu oy hali hech kim QR-daromad qilmadi — birinchi bo'ling! 🚀";
  return (
    `🏆 <b>QR-reyting — ${month}</b>\n` +
    `<i>Mijoz taklifidan tushgan tanga bo'yicha</i>\n\n` +
    body +
    myLine +
    `\n\n<i>Har oy yangi poyga. QR'ingiz: «📷 QR kodim».</i>`
  );
}

/** Badges screen (text). */
export function renderBadges(me: MeResponse): string {
  const lines = me.badges.map((b) => `${b.earned ? b.emoji : "🔒"} <b>${esc(b.name)}</b> — ${b.earned ? "olingan ✅" : esc(b.description)}`);
  const earned = me.badges.filter((b) => b.earned).length;
  return `🎖 <b>Nishonlar</b> (${earned}/${me.badges.length})\n\n${lines.join("\n")}`;
}
