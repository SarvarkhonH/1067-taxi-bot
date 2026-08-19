// 🔔 Smart push engine (Duolingo architecture, rules-only — no LLM needed):
// max 2 pushes per member per day, never the same trigger twice a day, silent
// 21:00-08:00 Tashkent. Triggers by priority: comeback → lucky-day →
// free-spin reminder. Plus the Monday recap "mini-Wrapped".
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

/** ⏰ OY-07 — jim-soat qo'rig'i endi `trySend` ning O'ZIDA (avval faqat `pushEngineTick` da edi,
 *  holbuki `oyinService` izohi «`notifyOnce` jim-soat qo'rig'ini beradi» deb YOZARDI — hujjat
 *  bilan kod bir-biriga zid edi va mavsum push'lari tunda ham ketaverardi).
 *  `urgent: true` — FAQAT kechiktirilsa MA'NOSINI YO'QOTADIGAN xabarlar uchun (g'olib e'loni,
 *  «oxirgi soat» ogohlantirishi). Default xavfsiz: jim-soat HURMAT QILINADI.
 *
 *  ⚠️ KEYINGI AGENTGA — `urgent: true` QO'YILISHI KERAK BO'LGAN chaqiruvlar (fayllar bu
 *  o'zgarishda TEGILMAGAN, egaga hisobotda ajratib aytilgan):
 *   • `oyinService.seasonDrawNotify` → `oyin_win:*` — g'olib e'loni, kechiktirib bo'lmaydi;
 *   • `oyinService.seasonWarningTick` → `oyin_warn49h:*` — «oxirgi soat», 1 soatlik deraza;
 *   • `bookingNotifier` → `oyin_ref_ride:*` va `campaignService` → `cmp_done:*` — BIR MARTALIK
 *     chaqiruvlar (qayta urinish TIKI YO'Q), jim-soatda tushib qolsa xabar butunlay yo'qoladi.
 *  Qolganlari (warn7 · warn3 · seasonend · sprint · cardmem · lost · drv_* · cmp_rem) tikda
 *  qayta uriladi — ular uchun default (jim-soat hurmat qilinadi) TO'G'RI. */
export interface NotifyOpts {
  urgent?: boolean;
}

/** Public wrapper so other engagement ticks (e.g. driver pushes) reuse the SAME dedup/cap/quiet
 *  rules. Returns true only if the message was actually DELIVERED (see `trySend`). */
export async function notifyOnce(bot: Bot, chatId: string, memberId: number, kind: string, html: string, extra?: object, opts?: NotifyOpts): Promise<boolean> {
  return trySend(bot, chatId, memberId, kind, html, extra, opts);
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
  const dk = dayKey(); // BITTA o'qish: claim va (kerak bo'lsa) `releaseSlot` bir xil kunga tegsin
  if (await isNotifyOff(memberId)) return { ok: false, reason: "notify_off" };
  const { isBlocked, pushMessage } = await import("./pushSend");
  if (await isBlocked(chatId)) return { ok: false, reason: "blocked" };
  try {
    await prisma.notifyLog.create({ data: { memberId, kind, dayKey: dk } });
  } catch {
    return { ok: false, reason: "duplicate" }; // shu `kind` bugun allaqachon ketgan
  }
  const r = await pushMessage(bot, chatId, kind, html, { memberId, prechecked: true, extra });
  // 🔴 OY-12 (shu yerda ham): avval `r === "skipped" ? failed : ok` edi — ya'ni 429/tarmoq
  // (`failed`) va 403 (`blocked`) HAM `ok: true` berardi. Mijoz "Rahmat ayt" ni bosardi, ekran
  // "yuborildi" derdi, xabar esa hech qayerga bormasdi VA kunlik `kind` markeri qolgani uchun
  // u shu kuni QAYTA URINA OLMASDI. Endi haqiqiy natija qaytadi; yetkazilmasa marker o'chadi.
  if (r !== "sent") {
    await releaseSlot(memberId, kind, dk);
    return { ok: false, reason: r === "failed" ? "failed" : "blocked" };
  }
  return { ok: true };
}

/** Yetkazilmagan xabarning BAND QILINGAN slotini bo'shatadi. Best-effort: o'chirish o'zi yiqilsa
 *  ham xabar oqimi to'xtamaydi (eng yomoni — o'sha `kind` shu kuni qayta urinilmaydi). */
async function releaseSlot(memberId: number, kind: string, dk: string): Promise<void> {
  await prisma.notifyLog.deleteMany({ where: { memberId, kind, dayKey: dk } }).catch(() => undefined);
}

/** 🔴 OY-12 — QAYTISH QIYMATI ENDI "YETKAZILDI", "urinildi" EMAS.
 *  Avval `!== "skipped"` hisoblanardi: 429/tarmoq (`failed`) va 403 (`blocked`) ham `true` berardi.
 *  Oqibati DURABLE edi — `oyinService` chaqiruvlari shu `true` ga qarab `markPushed(...)` yozadi
 *  (`oyin:warn7/warn3/warn49h/seasonend/winner/…`), ya'ni bitta 429 tufayli sovrin YUTGAN odam
 *  «SIZ YUTDINGIZ» xabarini ABADIY olmasdi.
 *  Eski izoh buni bilib turib saqlagan edi: qaytish qiymati o'zgarsa `pushEngineTick` dagi
 *  `continue` zanjiri buziladi va `comebackOfferUntil` yozilmay qoladi. Bu ikki talab endi
 *  ZID EMAS, chunki yetkazilmaganda NotifyLog markeri O'CHIRILADI (`releaseSlot`):
 *   • chaqiruvchi `false` oladi → durable marker QO'YILMAYDI → keyingi tik qayta uradi;
 *   • slot bo'shagani uchun qayta urinish kunlik cap/dedup ga tiqilib qolmaydi;
 *   • `comebackOfferUntil` YOZILMAYDI — bu ATAYLAB TO'G'RI: mijoz "48 soatlik taklif" xabarini
 *     ko'rmagan bo'lsa, taklif jimgina yonib ketmasligi kerak. Keyingi tik xabarni ham,
 *     taklifni ham birga beradi. */
async function trySend(bot: Bot, chatId: string, memberId: number, kind: string, html: string, extra?: object, opts?: NotifyOpts): Promise<boolean> {
  const dk = dayKey();
  // ⏰ OY-07: shoshilinch bo'lmagan xabar jim-soatda YUBORILMAYDI. Tekshiruv CLAIM'dan OLDIN —
  // marker qo'yilmaydi, ya'ni bu "yo'qotish" emas, KECHIKTIRISH: 08:00 dan keyingi tik uradi.
  // (Bir martalik chaqiruvchilar uchun `urgent: true` kerak — `NotifyOpts` izohidagi ro'yxat.)
  if (!opts?.urgent && quietHours()) return false;
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
  const outcome = await pushMessage(bot, chatId, kind, html, { memberId, prechecked: true, extra });
  if (outcome !== "sent") {
    // `blocked` da ham bo'shatamiz: `recordBlock` allaqachon `blockedAt` yozgan, shuning uchun
    // keyingi tik yuqoridagi `isBlocked` darvozasida to'xtaydi — cheksiz qayta urinish yo'q.
    await releaseSlot(memberId, kind, dk);
    return false;
  }
  return true;
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

  // 🎁 free-spin reminder (flag "spinreminder"): surface the forgotten free daily wheel. ONE batched
  // query for who already spun today (freespin idempotency key) → the loop nudges only those who
  // HAVEN'T, in a midday window, within the same 2/day cap + quiet hours. Read-only.
  const spinReminderOn = await (await import("./featureFlags")).featureOn("spinreminder");
  const spunToday = new Set<number>();
  // Cadence guard: a member can only get this nudge once every ≥48h (was: once per day whenever
  // eligible) — batched with spunToday so this stays one extra query, not N+1.
  const recentlyNudged = new Set<number>();
  if (spinReminderOn) {
    const rows = await prisma.coinTxn.findMany({
      where: { kind: "freespin", idempotencyKey: { endsWith: `:${dk}` } },
      select: { memberId: true },
    });
    for (const r of rows) spunToday.add(r.memberId);
    const since48h = new Date(Date.now() - 48 * 3600 * 1000);
    const nudgeRows = await prisma.notifyLog.findMany({
      where: { kind: "freespin_wait", sentAt: { gte: since48h } },
      select: { memberId: true },
    });
    for (const r of nudgeRows) recentlyNudged.add(r.memberId);
  }

  for (const m of linked) {
    const chatId = m.telegramUser!.id;

    // ① comeback: 7+ days without a ride → 48h guaranteed-3x offer
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

    // ② lucky-day morning announce (scarcity — only fires on the lucky weekday)
    if (lucky && hour >= 8 && hour < 12) {
      const sent = await trySend(bot, chatId, m.id, "lucky_day", `🍀 <b>BUGUN OMAD KUNI!</b>\nHar safar ruletasi <b>2 BARAVAR</b> to'laydi — bugun yo'lga chiqish ayni payt! 🚕`, appBtn("🚕 Taxi chaqirish", "book"));
      if (sent) continue;
    }

    // ③ free-spin reminder (midday 11–17): a real rider who hasn't spun the free wheel today AND
    // hasn't gotten this same nudge in the last 48h (≈ every 2-3 days, not daily). Lower priority
    // than comeback/lucky above (they `continue` first) so it never crowds them out.
    if (spinReminderOn && hour >= 11 && hour < 17 && m.phone && !spunToday.has(m.id) && !recentlyNudged.has(m.id)) {
      await trySend(bot, chatId, m.id, "freespin_wait", `🎁 <b>Bugungi bepul aylantirishingiz kutmoqda!</b>\nSafarsiz ham tanga yutib oling — bir bosishda 👇 🍀`, appBtn("🎡 Aylantirish", "play"));
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
  // ⏰ OY-07: marker HAFTASIGA BIR MARTA qo'yiladi, ya'ni recap BIR MARTALIK. Dushanba 00:00 da
  // ishga tushsa `trySend` ning yangi jim-soat qo'rig'i hammasini rad qilardi va recap butun
  // hafta yo'qolardi. Shuning uchun MARKERNI QO'YISHDAN OLDIN kutamiz: dushanba 08:00 dan
  // keyingi birinchi tik yuboradi (recap shoshilinch emas — ertalab o'qilgani yaxshiroq ham).
  if (quietHours()) return;
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
