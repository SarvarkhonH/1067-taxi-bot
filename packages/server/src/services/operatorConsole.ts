// 🎧 Super Operator console — backend core. A human operator does everything the Koson AI
// agent can do (book/search/order/remind/status/balance/stats) PLUS member-management the
// admin panel already has (coins/ban), on behalf of a specific member — either attached to a
// live Telegram chat or standalone for a call-center caller (memberId only, no telegramId).
//
// DESIGN INVARIANT: every action here calls the EXACT SAME underlying function the real
// customer-facing flow (bot or Mini App) already calls — callOneTapFor, createFoodOrder,
// createMarketOrder, createReminder, adminGrantCoins, banMember, etc. Nothing here writes
// money/state through a new parallel path. This file is a DISPATCH layer, not a second
// implementation.
import { prisma } from "../db";
import { logAudit } from "./shopService";

export interface DispatchResult {
  ok: boolean;
  message: string;
  extra?: unknown;
}

export interface DispatchParams {
  // taxi
  addressQuery?: string;
  addressId?: number;
  // search / order (city providers — restoran/xizmat/bazar/elon/reys)
  providerKey?: string;
  query?: string;
  // food order (multi-item, direct — NOT the AI's single-item provider tool)
  restaurantId?: number;
  foodItems?: { menuItemId: number; qty: number }[];
  address?: string;
  isPickup?: boolean;
  // bazar order (multi-item, direct)
  shopId?: number;
  bazarItems?: { productId: number; qty: number }[];
  pay?: "tanga" | "cash";
  // cancel/refund targets
  orderId?: number;
  tripId?: number;
  reason?: string;
  // reminder
  text?: string;
  runAtIso?: string;
  kind?: "oddiy" | "taksi" | "qarz";
  // stats
  period?: "bugun" | "hafta" | "oy";
  // coins / ban
  amount?: number;
}

/** One operator turn. `telegramId` is null for a call-center member with no Telegram link —
 *  every branch that would normally push a message to the customer's chat just skips that
 *  push and the operator reads the result off the admin screen instead. */
export async function dispatchAction(
  memberId: number,
  telegramId: string | null,
  action: string,
  params: DispatchParams,
  operatorName: string,
  sendTg?: (telegramId: string, html: string) => Promise<void>,
): Promise<DispatchResult> {
  const push = async (html: string): Promise<void> => {
    if (telegramId && sendTg) await sendTg(telegramId, html).catch((e) => console.error("[opr] push failed:", e instanceof Error ? e.message : e));
  };
  const audit = (detail: string): void => {
    void logAudit(operatorName, telegramId, `opr_${action}`, "member", memberId, detail.slice(0, 200));
  };

  switch (action) {
    case "book": {
      const { callOneTapFor, resolveAddress } = await Promise.all([import("./bookingService"), import("./ai/intent")]).then(([a, b]) => ({
        callOneTapFor: a.callOneTapFor,
        resolveAddress: b.resolveAddress,
      }));
      let addressId = params.addressId;
      if (!addressId && params.addressQuery) {
        const matches = await resolveAddress(params.addressQuery);
        if (matches.length === 1) addressId = matches[0]!.id;
        else if (matches.length > 1) {
          audit(`manzil-tanlov: ${params.addressQuery}`);
          return { ok: false, message: "Bir nechta manzil topildi — birini tanlang.", extra: { suggestions: matches } };
        }
      }
      const res = await callOneTapFor(memberId, addressId ? { addressId } : {}, "operator-console");
      audit(`taksi: ${res.state}`);
      if (res.state === "dispatched") {
        await push(`🚕 <b>Taksi chaqirildi</b> — ${res.pickupName ?? ""}`);
        return { ok: true, message: `✅ Taksi chaqirildi: ${res.pickupName ?? ""}` };
      }
      if (res.state === "need_pickup") return { ok: false, message: "Manzil aniqlanmadi — tanlang.", extra: { suggestions: res.suggestions } };
      if (res.state === "active") return { ok: false, message: "Bu mijozning faol buyurtmasi bor." };
      return { ok: false, message: res.message ?? `Bajarilmadi (${res.state})` };
    }
    case "cancel_taxi": {
      const { cancelBookingFor } = await import("./bookingService");
      const res = await cancelBookingFor(memberId);
      audit(`taksi-bekor: ok=${res.ok} reason=${res.reason ?? ""}`);
      if (res.ok) await push("✖️ <b>Taksi buyurtmangiz bekor qilindi.</b>");
      return { ok: res.ok, message: res.ok ? "✅ Bekor qilindi" : `Bekor qilinmadi (${res.reason ?? "xato"})` };
    }
    case "status_taxi": {
      const { getActiveBookingFor } = await import("./bookingService");
      const active = await getActiveBookingFor(memberId);
      return { ok: true, message: active ? `📍 Faol: ${active.addressName ?? ""} — ${active.status}` : "Faol taksi buyurtmasi yo'q." };
    }
    case "search": {
      if (!params.providerKey || !params.query) return { ok: false, message: "provider/query kerak" };
      const { providerByKey } = await import("./ai/providers");
      const prov = providerByKey(params.providerKey);
      if (!prov) return { ok: false, message: "Bu bo'lim hozir mavjud emas" };
      const cards = await prov.search(params.query).catch(() => []);
      audit(`qidiruv: ${params.providerKey} "${params.query}" -> ${cards.length}`);
      return { ok: true, message: `${cards.length} ta topildi`, extra: { cards } };
    }
    case "order_food": {
      if (!params.restaurantId || !params.foodItems?.length || !params.address) return { ok: false, message: "restoran/taomlar/manzil kerak" };
      const { createFoodOrder } = await import("./restoranService");
      const r = await createFoodOrder(memberId, params.restaurantId, params.foodItems, params.address, "", `Operator: ${operatorName}`, !!params.isPickup);
      audit(`ovqat-buyurtma: rest=${params.restaurantId} items=${params.foodItems.length} ok=${r.ok}`);
      if (!r.ok) return { ok: false, message: `Bajarilmadi: ${r.reason ?? "xato"}` };
      if (r.notice) {
        const { getBotInstance } = await import("../botInstance");
        const bot = getBotInstance();
        if (bot) await (await import("../bot/restoran")).notifyOwnerNewFoodOrder(bot, r.notice).catch(() => undefined);
      }
      await push(`🍽 <b>Buyurtmangiz qabul qilindi!</b> #${r.orderId}\n💵 Jami: ${(r.totalSom ?? 0).toLocaleString("ru-RU")} so'm (naqd)`);
      return { ok: true, message: `✅ Buyurtma #${r.orderId} — ${(r.totalSom ?? 0).toLocaleString("ru-RU")} so'm` };
    }
    case "order_bazar": {
      if (!params.shopId || !params.bazarItems?.length || !params.address) return { ok: false, message: "do'kon/mahsulot/manzil kerak" };
      const { createMarketOrder } = await import("./marketOrderService");
      const r = await createMarketOrder(memberId, params.shopId, params.bazarItems, params.address, params.pay ?? "tanga", `Operator: ${operatorName}`);
      audit(`bozor-buyurtma: shop=${params.shopId} items=${params.bazarItems.length} ok=${r.ok}`);
      if (!r.ok) return { ok: false, message: `Bajarilmadi: ${r.reason ?? "xato"}` };
      // MarketCheckoutResponse doesn't carry the total — read it back off the row we just created.
      const created = r.orderId ? await prisma.marketOrder.findUnique({ where: { id: r.orderId }, select: { total: true } }) : null;
      const totalStr = (created?.total ?? 0).toLocaleString("ru-RU");
      await push(`🛒 <b>Buyurtmangiz qabul qilindi!</b> #${r.orderId}\n💰 Jami: ${totalStr} tanga`);
      return { ok: true, message: `✅ Buyurtma #${r.orderId} — ${totalStr} tanga` };
    }
    case "remind": {
      if (!params.text || !params.runAtIso) return { ok: false, message: "matn/vaqt kerak" };
      if (!telegramId) return { ok: false, message: "Eslatma faqat Telegram-bog'langan mijozlar uchun" };
      const { createReminder, tashkentLabel } = await import("./ai/reminderService");
      const runAt = new Date(params.runAtIso);
      const res = await createReminder(memberId, telegramId, params.text, runAt, params.kind ?? "oddiy");
      audit(`eslatma: "${params.text}" @ ${params.runAtIso} ok=${res.ok}`);
      if (res.ok) await push(`🔔 Operator sizga eslatma qo'ydi: <b>${tashkentLabel(runAt)}</b> — «${params.text}»`);
      return { ok: res.ok, message: res.ok ? "✅ Eslatma saqlandi" : `Saqlanmadi: ${res.reason ?? "xato"}` };
    }
    case "balance": {
      const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      return { ok: true, message: `🪙 Balans: ${(m?.coins ?? 0).toLocaleString("ru-RU")} tanga` };
    }
    case "stats": {
      const { memberStats, renderStats } = await import("./ai/aiStats");
      const period = params.period ?? "oy";
      const s = await memberStats(memberId, period);
      return { ok: true, message: renderStats(s) };
    }
    case "coins": {
      if (!params.amount) return { ok: false, message: "summa kerak" };
      const { adminGrantCoins } = await import("./adminOps");
      const r = await adminGrantCoins(memberId, params.amount, params.reason || `Operator: ${operatorName}`, operatorName);
      audit(`tanga: ${params.amount > 0 ? "+" : ""}${params.amount} sabab="${params.reason ?? ""}" ok=${r.ok}`);
      if (r.ok && params.amount > 0) await push(`🎁 Sizga <b>+${params.amount.toLocaleString("ru-RU")} tanga</b> qo'shildi${params.reason ? ` — ${params.reason}` : ""}`);
      return { ok: r.ok, message: r.message };
    }
    case "ban": {
      const { adminBan } = await import("./adminOps");
      const r = await adminBan(memberId, params.reason || `Operator: ${operatorName}`);
      audit(`ban (soft): ${params.reason ?? ""}`);
      return { ok: r.ok, message: r.message };
    }
    case "unban": {
      const { adminUnban } = await import("./adminOps");
      const r = await adminUnban(memberId);
      audit("unban (soft)");
      return { ok: r.ok, message: r.message };
    }
    case "hardban": {
      const { banMember } = await import("./banService");
      const r = await banMember(memberId, params.reason || `Operator: ${operatorName}`, operatorName);
      audit(`hardban: ${params.reason ?? ""}`);
      return { ok: r.ok, message: r.message };
    }
    case "hardunban": {
      const { unbanMember } = await import("./banService");
      const r = await unbanMember(memberId, operatorName);
      audit("hardunban");
      return { ok: r.ok, message: r.message };
    }
    case "cancel_food": {
      if (!params.orderId) return { ok: false, message: "orderId kerak" };
      const { rejectFoodOrder } = await import("./restoranService");
      const r = await rejectFoodOrder(params.orderId, params.reason || `Operator: ${operatorName}`);
      audit(`ovqat-bekor: #${params.orderId} ok=${r.ok}`);
      if (r.ok && r.notice) await push(`❌ <b>Buyurtmangiz bekor qilindi</b> (#${params.orderId}) — ${r.notice.restaurantName}. Naqd to'lov bo'lgani uchun pul yechilmagan.`);
      return { ok: r.ok, message: r.ok ? "✅ Bekor qilindi" : `Bekor qilinmadi (${r.reason ?? "xato"})` };
    }
    case "cancel_bazar": {
      if (!params.orderId) return { ok: false, message: "orderId kerak" };
      const { rejectMarketOrder } = await import("./marketOrderService");
      const r = await rejectMarketOrder(params.orderId, params.reason || `Operator: ${operatorName}`);
      audit(`bozor-bekor: #${params.orderId} ok=${r.ok}`);
      if (r.ok) await push(`❌ <b>Buyurtmangiz bekor qilindi</b> (#${params.orderId})${r.payKind !== "cash" ? " — tanga qaytarildi" : ""}.`);
      return { ok: r.ok, message: r.ok ? `✅ Bekor qilindi${r.payKind !== "cash" ? " (tanga qaytarildi)" : ""}` : `Bekor qilinmadi (${r.reason ?? "xato"})` };
    }
    case "profile_edit": {
      if (params.text) {
        const { setDisplayName } = await import("./memberService");
        await setDisplayName(memberId, params.text);
      }
      if (params.addressQuery && params.addressId) {
        await prisma.member.update({ where: { id: memberId }, data: { defaultPickupId: params.addressId, defaultPickupName: params.addressQuery } }).catch(() => undefined);
      }
      audit(`profil-tahrir: ism="${params.text ?? ""}" manzil="${params.addressQuery ?? ""}"`);
      return { ok: true, message: "✅ Profil yangilandi" };
    }
    case "send_button": {
      if (!telegramId) return { ok: false, message: "Faqat Telegram-bog'langan mijozlar uchun" };
      if (!params.text) return { ok: false, message: "matn kerak" };
      const { getBotInstance } = await import("../botInstance");
      const { webAppUrl } = await import("../bot/webAppUrl");
      const bot = getBotInstance();
      if (!bot) return { ok: false, message: "Bot ulanmagan" };
      const { InlineKeyboard } = await import("grammy");
      const kb = params.query ? new InlineKeyboard().webApp(params.query, webAppUrl(params.providerKey ?? "")) : undefined;
      await bot.api.sendMessage(telegramId, params.text, { parse_mode: "HTML", reply_markup: kb }).catch((e) => {
        throw e;
      });
      audit(`tugma yuborildi: "${params.text}" btn="${params.query ?? ""}"`);
      return { ok: true, message: "✅ Yuborildi" };
    }
    case "cancel_intercity": {
      if (!params.tripId) return { ok: false, message: "tripId kerak" };
      const { adminForceCancelTrip } = await import("./intercityService");
      const r = await adminForceCancelTrip(params.tripId);
      audit(`reys-bekor: #${params.tripId} ok=${r.ok}`);
      return { ok: r.ok, message: r.ok ? "✅ Reys bekor qilindi" : "Bekor qilinmadi" };
    }
    default:
      return { ok: false, message: `Noma'lum amal: ${action}` };
  }
}

// ─── 📡 Nazorat — live ops dashboard ────────────────────────────────────────
// One merged, age-sorted view of everything currently active across modules, each row a
// direct read of the SAME tables/sources their own existing admin list views already use
// (getLiveBookings, FoodOrder, MarketOrder, IntercityTrip) — no new tracking, just a merge.
export interface OpsRow {
  module: "taxi" | "food" | "bazar" | "reys";
  id: number | string;
  memberId?: number;
  title: string;
  status: string;
  ageMin: number;
  stuck: boolean;
}

const STUCK_THRESHOLD_MIN: Record<OpsRow["module"], number> = { taxi: 5, food: 15, bazar: 15, reys: 30 };

export async function getOpsDashboard(): Promise<OpsRow[]> {
  const now = Date.now();
  const ageMin = (d: Date): number => Math.floor((now - d.getTime()) / 60_000);

  const [taxi, foodRows, bazarRows, tripRows] = await Promise.all([
    (async () => {
      const { getLiveBookings } = await import("./adminOps");
      return getLiveBookings().catch(() => []);
    })(),
    prisma.foodOrder.findMany({ where: { status: { in: ["pending", "accepted", "preparing", "delivering"] } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.marketOrder.findMany({ where: { status: { in: ["pending", "accepted", "delivering"] } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.intercityTrip.findMany({ where: { status: { in: ["OPEN", "BOARDING", "DEPARTED"] } }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);

  const rows: OpsRow[] = [];
  for (const b of taxi) {
    rows.push({ module: "taxi", id: b.id, title: b.addressName || b.phone, status: b.status, ageMin: b.ageMin, stuck: b.ageMin >= STUCK_THRESHOLD_MIN.taxi && !b.hasDriver });
  }
  for (const o of foodRows) {
    const a = ageMin(o.createdAt);
    rows.push({ module: "food", id: o.id, memberId: o.memberId, title: `#${o.id} — ${o.totalSom.toLocaleString("ru-RU")} so'm`, status: o.status, ageMin: a, stuck: a >= STUCK_THRESHOLD_MIN.food });
  }
  for (const o of bazarRows) {
    const a = ageMin(o.createdAt);
    rows.push({ module: "bazar", id: o.id, memberId: o.memberId, title: `#${o.id} — ${o.total.toLocaleString("ru-RU")} tanga`, status: o.status, ageMin: a, stuck: a >= STUCK_THRESHOLD_MIN.bazar });
  }
  for (const t of tripRows) {
    const a = ageMin(t.createdAt);
    rows.push({ module: "reys", id: t.id, title: `Reys #${t.id}`, status: t.status, ageMin: a, stuck: a >= STUCK_THRESHOLD_MIN.reys });
  }
  return rows.sort((a, b) => b.ageMin - a.ageMin);
}

// ─── 🩺 Tizim holati — so an operator can tell "AI butunlay o'chganmi" from "faqat shu mijoz" ──
const AI_FLAGS = ["aibrain", "airemind", "aihisob", "aidost", "aicity", "aibilim", "aineeds"] as const;
const DAILY_GLOBAL_CAP = 3000; // keep in sync with llmRouter.ts — informational display only
const DAILY_MEMBER_CAP = 100;

export interface SystemHealth {
  flags: { name: string; on: boolean }[];
  globalUsedToday: number;
  globalCap: number;
  memberCap: number; // informational only (per-member usage isn't queried here — see checkCap.ts for one member)
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const { featureOn } = await import("./featureFlags");
  const { aiDay } = await import("./ai/llmRouter");
  const flags = await Promise.all(AI_FLAGS.map(async (f) => ({ name: f, on: await featureOn(f) })));
  const row = await prisma.appState.findUnique({ where: { key: `ai_used:${aiDay()}` } });
  return { flags, globalUsedToday: row ? Number(row.value) || 0 : 0, globalCap: DAILY_GLOBAL_CAP, memberCap: DAILY_MEMBER_CAP };
}
