// 🔔 Smart push engine (Duolingo architecture, rules-only — no LLM needed):
// max 2 pushes per member per day, never the same trigger twice a day, silent
// 21:00-08:00 Tashkent. Triggers by priority: streak-saver → comeback →
// lucky-day → garage-service → jackpot. Plus the Monday recap "mini-Wrapped".
import type { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { appBtn } from "../bot/webAppUrl";

const DAILY_PUSH_CAP = 2;

export function tashkentNow(): Date {
  return new Date(Date.now() + 5 * 3600 * 1000);
}
export function dayKey(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
export function quietHours(): boolean {
  const h = tashkentNow().getUTCHours();
  return h >= 21 || h < 8;
}

/** User's "notifications off" setting (account → settings), stored in AppState (no schema change). */
export async function isNotifyOff(memberId: number): Promise<boolean> {
  return !!(await prisma.appState.findUnique({ where: { key: `notifyoff:${memberId}` } }));
}
export async function setNotifyOff(memberId: number, off: boolean): Promise<void> {
  const key = `notifyoff:${memberId}`;
  if (off) await prisma.appState.upsert({ where: { key }, create: { key, value: "1" }, update: { value: "1" } });
  else await prisma.appState.deleteMany({ where: { key } });
}

/** Public wrapper so other engagement ticks (e.g. driver pushes) reuse the SAME dedup/cap/quiet
 *  rules. Returns true only if the message was actually sent (claimed the once-per-day slot). */
export async function notifyOnce(bot: Bot, chatId: string, memberId: number, kind: string, html: string, extra?: object): Promise<boolean> {
  return trySend(bot, chatId, memberId, kind, html, extra);
}

/** Nega yuborilmadi — CHAQIRUVCHI mijozga to'g'ri sabab ayta olsin.
 *  ⚠️ 2026-08-03: "Rahmat ayt" hamma nosozlikni BITTA `unreachable` ga qulatardi va ekran
 *  "do'stingiz botni bloklagan bo'lishi mumkin" deb yozardi. Amalda eng ko'p uchraydigan sabab
 *  BLOK EMAS — `DAILY_PUSH_CAP` (safar bildirishnomalari ham shu limitni yeydi). Mijozga
 *  yolg'on sabab aytilardi va u do'stiga bekordan-bekor gumon qilardi. */
export type SendBlockReason = "blocked" | "notify_off" | "push_cap" | "duplicate" | "failed";

/** 👤 FOYDALANUVCHI O'ZI BOSGAN xabar (masalan "Rahmat ayt"). `DAILY_PUSH_CAP` ni AYLANIB O'TADI.
 *  Sabab: kunlik cap TIZIM o'z tashabbusi bilan spam qilmasin deb qo'yilgan (engagement push).
 *  Odam o'z do'stiga atayin yuborayotgan xabar unga bo'ysunmasligi kerak — aks holda mijoz tugmani
 *  bosadi, hech nima bo'lmaydi va sababi ham yolg'on aytiladi.
 *  Hurmat qilinadigan chegaralar SAQLANADI: blok · "bildirishnoma o'chiq" · bir xil `kind` kuniga
 *  bir marta (ya'ni bitta odam bitta do'stiga kuniga bitta rahmat — spam yo'li ochilmaydi). */
export async function notifyUserInitiated(
  bot: Bot, chatId: string, memberId: number, kind: string, html: string, extra?: object,
): Promise<{ ok: true } | { ok: false; reason: SendBlockReason }> {
  if (await isNotifyOff(memberId)) return { ok: false, reason: "notify_off" };
  const { isBlocked, pushMessage } = await import("./pushSend");
  if (await isBlocked(chatId)) return { ok: false, reason: "blocked" };
  try {
    await prisma.notifyLog.create({ data: { memberId, kind, dayKey: dayKey() } });
  } catch {
    return { ok: false, reason: "duplicate" }; // shu `kind` bugun allaqachon ketgan
  }
  const r = await pushMessage(bot, chatId, kind, html, { memberId, prechecked: true, extra });
  return r === "skipped" ? { ok: false, reason: "failed" } : { ok: true };
}

async function trySend(bot: Bot, chatId: string, memberId: number, kind: string, html: string, extra?: object): Promise<boolean> {
  const dk = dayKey();
  if (await isNotifyOff(memberId)) return false; // user opted out of smart push
  // 📵 BLK-1: blokni CLAIM'dan oldin tekshiramiz — bloklagan odamga NotifyLog markeri ham
  // yozilmaydi (aks holda "yuborildi" statistikasi hech qachon yetib bormagan xabar bilan bulg'anadi).
  const { isBlocked, pushMessage } = await import("./pushSend");
  if (await isBlocked(chatId)) return false;
  const sentToday = await prisma.notifyLog.count({ where: { memberId, dayKey: dk } });
  if (sentToday >= DAILY_PUSH_CAP) return false;
  try {
    await prisma.notifyLog.create({ data: { memberId, kind, dayKey: dk } }); // claim BEFORE send (no dup on crash)
  } catch {
    return false; // already sent this trigger today
  }
  // ⚠️ Qaytish qiymati AVVALGIDEK: "slot band qilindi" (yuborishga urinildi), "yetkazildi" EMAS.
  // Aks holda 429 da chaqiruvchi zanjiri (`continue`) buzilib, o'sha tick'da ikkinchi trigger
  // ishga tushardi va `comebackOfferUntil` yozilmay qolardi — bu tiket oqimni O'ZGARTIRMAYDI.
  return (await pushMessage(bot, chatId, kind, html, { memberId, prechecked: true, extra })) !== "skipped";
}

/** Periodic tick (piggybacks the existing loop). Cheap checks, hard caps. */
export async function pushEngineTick(bot: Bot): Promise<void> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("push"))) return;
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

  // 🎁 free-spin reminder (flag "spinreminder"): surface the forgotten free daily wheel. ONE batched
  // query for who already spun today (freespin idempotency key) → the loop nudges only those who
  // HAVEN'T, in a midday window, within the same 2/day cap + quiet hours. Read-only.
  const spinReminderOn = await (await import("./featureFlags")).featureOn("spinreminder");
  const spunToday = new Set<number>();
  if (spinReminderOn) {
    const rows = await prisma.coinTxn.findMany({
      where: { kind: "freespin", idempotencyKey: { endsWith: `:${dk}` } },
      select: { memberId: true },
    });
    for (const r of rows) spunToday.add(r.memberId);
  }

  for (const m of linked) {
    const chatId = m.telegramUser!.id;

    // ① streak-saver: evening, streak alive but today unchecked (loss aversion)
    if (hour >= 18 && (m.streak?.current ?? 0) >= 2) {
      const checkedToday = m.streak?.lastCheckIn ? dayKey(m.streak.lastCheckIn) === dk : false;
      if (!checkedToday) {
        const sent = await trySend(bot, chatId, m.id, "streak_saver", `🔥 <b>${m.streak!.current} kunlik streak xavfda!</b>\nBugun belgilamasangiz — kuyadi. Bir bosishda saqlang 👇`, appBtn("✅ Bugunni belgilash", "play"));
        if (sent) continue;
      }
    }

    // ② comeback: 7+ days without a ride → 48h guaranteed-3x offer
    if (m.type === "client" && !m.comebackOfferUntil) {
      const lastRide = await prisma.rideReward.findFirst({ where: { memberId: m.id }, orderBy: { createdAt: "desc" } });
      if (lastRide && Date.now() - lastRide.createdAt.getTime() > 7 * 24 * 3600 * 1000) {
        const until = new Date(Date.now() + 48 * 3600 * 1000);
        const sent = await trySend(bot, chatId, m.id, "comeback", `🎁 <b>Sizni sog'indik!</b>\n48 soat ichidagi birinchi safaringizda ruleta <b>kafolatlangan 3x</b> beradi. 🚕`, appBtn("🚕 Taxi chaqirish", "book"));
        if (sent) {
          await prisma.member.update({ where: { id: m.id }, data: { comebackOfferUntil: until } });
          continue;
        }
      }
    }

    // ③ lucky-day morning announce (scarcity — only fires on the lucky weekday)
    if (lucky && hour >= 8 && hour < 12) {
      const sent = await trySend(bot, chatId, m.id, "lucky_day", `🍀 <b>BUGUN OMAD KUNI!</b>\nHar safar ruletasi <b>2 BARAVAR</b> to'laydi — bugun yo'lga chiqish ayni payt! 🚕`, appBtn("🚕 Taxi chaqirish", "book"));
      if (sent) continue;
    }

    // ④ free-spin reminder (midday 11–17): a real rider who hasn't spun the free wheel today. Lower
    // priority than streak/comeback/lucky above (they `continue` first) so it never crowds them out.
    if (spinReminderOn && hour >= 11 && hour < 17 && m.phone && !spunToday.has(m.id)) {
      const sent = await trySend(bot, chatId, m.id, "freespin_wait", `🎁 <b>Bugungi bepul aylantirishingiz kutmoqda!</b>\nSafarsiz ham tanga yutib oling — bir bosishda 👇 🍀`, appBtn("🎡 Aylantirish", "play"));
      if (sent) continue;
    }

    // ⑤ big jackpot teaser
    if (jackpot >= 20000) {
      await trySend(bot, chatId, m.id, "jackpot", `🎰 JACKPOT <b>${formatNumber(jackpot)} tanga</b>ga yetdi!\nHar safarda 1% imkon — butun jamg'arma sizniki bo'lishi mumkin. 🚕`, appBtn("🚕 Taxi chaqirish", "book"));
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
