// 🍽 Koson AI provider #1 — restoran taomlari (concierge model: naqd to'lov, operator
// qo'ng'iroq qiladi; CoinTxn YO'Q). Order goes through the EXISTING createFoodOrder with
// all its walls (open-hours, min-order, pending-limit, price snapshot). The member's
// phone is resolved server-side inside createFoodOrder — never through the LLM.
import { prisma } from "../../../db";
import type { AiCard, AiProvider, ConfirmCard } from "./types";

interface OrderPayload {
  restaurantId: number;
  menuItemId: number;
  qty: number;
  address: string;
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU").replace(/ /g, " ");
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Keyword search over active restaurants + their menus (public catalog only). */
async function searchMeals(query: string): Promise<{ card: AiCard; restaurantId: number; item: { id: number; name: string; priceSom: number } }[]> {
  const { listActiveRestaurants, getRestaurantDetail } = await import("../../restoranService");
  const q = query.toLowerCase().replace(/[''`]/g, "'").trim();
  if (q.length < 2) return [];
  const restaurants = await listActiveRestaurants();
  const scored: { score: number; card: AiCard; restaurantId: number; item: { id: number; name: string; priceSom: number } }[] = [];
  const qWords = q.split(/\s+/).filter((w) => w.length >= 2);
  for (const r of restaurants) {
    const { restaurant, items } = await getRestaurantDetail(r.id);
    if (!restaurant) continue;
    for (const it of items) {
      if (!it.available) continue;
      const hayWords = `${it.name} ${it.section} ${restaurant.name} ${restaurant.category}`.toLowerCase().split(/[^\p{L}\d']+/u);
      // word-boundary ranking — "osh" must beat "kartOSHka": exact word 3 > prefix 2 > substring 1
      let score = 0;
      for (const w of qWords) {
        if (hayWords.some((h) => h === w)) score += 3;
        else if (hayWords.some((h) => h.startsWith(w))) score += 2;
        else if (w.length >= 4 && hayWords.some((h) => h.includes(w))) score += 1;
      }
      if (score === 0) continue;
      scored.push({
        score,
        restaurantId: r.id,
        item: { id: it.id, name: it.name, priceSom: it.priceSom },
        card: {
          id: String(it.id),
          title: `${it.name} — ${restaurant.name}`,
          subtitle: `${fmt(it.priceSom)} so'm · ⭐ ${restaurant.avgRating.toFixed(1)}${restaurant.deliveryFeeSom ? ` · 🛵 ${fmt(restaurant.deliveryFeeSom)} so'm` : ""}`,
        },
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 6);
}

export const restoranProvider: AiProvider = {
  key: "restoran",
  title: "restoran taomlari va yetkazib berish (dastavka)",
  flags: ["restoran"],

  async search(query: string): Promise<AiCard[]> {
    return (await searchMeals(query)).map((m) => m.card);
  },

  /** item = taom nomi yoki search-card id. Address talab qilinadi (concierge yetkazish). */
  async order(memberId: number, _tgId: string, item: string, qty: number, extra: string): Promise<ConfirmCard | { error: string }> {
    const n = Math.min(Math.max(Math.floor(qty) || 1, 1), 20);
    const matches = await searchMeals(item);
    if (!matches.length) return { error: `«${item}» menyudan topilmadi. Boshqacha nom bilan qidirib ko'ring.` };
    const uniq = new Map(matches.map((m) => [m.item.id, m]));
    if (uniq.size > 1 && !/^\d+$/.test(item)) {
      const list = [...uniq.values()].slice(0, 3).map((m) => `• ${m.card.title} (${fmt(m.item.priceSom)} so'm)`).join("\n");
      return { error: `Bir nechta variant bor — qaysi biri?\n${list}` };
    }
    const picked = /^\d+$/.test(item) ? [...uniq.values()].find((m) => m.item.id === Number(item)) ?? [...uniq.values()][0]! : [...uniq.values()][0]!;
    const address = (extra ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (address.length < 5) return { error: "Yetkazish manzilini yozing (masalan: «Obod mahalla, 12-uy») — shunda buyurtmani rasmiylashtiraman." };
    const payload: OrderPayload = { restaurantId: picked.restaurantId, menuItemId: picked.item.id, qty: n, address };
    return {
      html:
        `🍽 <b>Buyurtma tasdiqlash</b>\n` +
        `${n}× ${esc(picked.item.name)} — <b>${fmt(picked.item.priceSom * n)} so'm</b>\n` +
        `📍 ${esc(address)}\n` +
        `💵 To'lov: naqd (yetkazilganda). Operator qo'ng'iroq qilib tasdiqlaydi.\n\nRasmiylashtiraymi?`,
      payload: JSON.stringify(payload),
    };
  },

  async execute(memberId: number, _tgId: string, payloadRaw: string): Promise<{ ok: boolean; message: string }> {
    let p: OrderPayload;
    try {
      p = JSON.parse(payloadRaw) as OrderPayload;
    } catch {
      return { ok: false, message: "Buyurtma ma'lumoti buzilgan — qaytadan urinib ko'ring." };
    }
    const { createFoodOrder } = await import("../../restoranService");
    const r = await createFoodOrder(memberId, p.restaurantId, [{ menuItemId: p.menuItemId, qty: p.qty }], p.address, "", "Koson AI orqali", false);
    if (!r.ok) {
      const reasons: Record<string, string> = {
        closed: "Restoran hozir yopiq 😔 Ish vaqtida qayta urinib ko'ring.",
        below_min: "Buyurtma restoran minimal summasidan kam — yana biror narsa qo'shing.",
        pending_limit: "Sizda kutilayotgan buyurtmalar ko'p — avval ularini yakunlang.",
        bad_address: "Manzil juda qisqa — aniqroq yozing.",
      };
      return { ok: false, message: reasons[r.reason ?? ""] ?? "Buyurtma o'tmadi — keyinroq urinib ko'ring." };
    }
    // owner/operator alert — the same path the Mini App checkout uses
    if (r.notice) {
      const { getBotInstance } = await import("../../../botInstance");
      const bot = getBotInstance();
      if (bot) await (await import("../../../bot/restoran")).notifyOwnerNewFoodOrder(bot, r.notice).catch(() => undefined);
    }
    return { ok: true, message: `✅ <b>Buyurtma qabul qilindi!</b> #${r.orderId}\n💵 Jami: ${fmt(r.totalSom ?? 0)} so'm (naqd)\n📞 Operator tez orada qo'ng'iroq qilib tasdiqlaydi.` };
  },

  async status(memberId: number): Promise<string | null> {
    const { myFoodOrders } = await import("../../restoranService");
    const rows = await myFoodOrders(memberId, 1);
    const o = rows[0];
    if (!o) return null;
    const st: Record<string, string> = { pending: "⏳ Operator tasdiqlashini kutmoqda", accepted: "👨‍🍳 Tayyorlanmoqda", delivering: "🛵 Yo'lda", delivered: "✅ Yetkazildi", rejected: "❌ Rad etildi", cancelled: "✖️ Bekor qilingan" };
    return `🍽 Oxirgi buyurtma #${o.id} — ${esc(o.restaurantName)}\n${o.itemsJson.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")} · ${fmt(o.totalSom)} so'm\nHolat: ${st[o.status] ?? o.status}`;
  },
};
