// 🛒 Koson AI provider #3 — bazar (do'kon mahsulotlari). catalogFactory + order/execute:
// the AI can now RECOMMEND and place a tanga purchase (1 unit) through the existing buyProduct
// flow — confirm-card + human ✅ tap before any tanga leaves the wallet (money invariant).
import { prisma } from "../../../db";
import { makeCatalogProvider } from "./catalogFactory";
import type { AiCard, ConfirmCard } from "./types";

interface BazarPayload {
  productId: number;
  address: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function tanga(n: number): string {
  return n.toLocaleString("ru-RU");
}

function card(r: { id: number; name: string; priceTanga: number; oldPriceTanga: number | null; stock: number }): AiCard {
  return {
    id: String(r.id),
    title: esc(r.name),
    subtitle: `🪙 ${tanga(r.priceTanga)} tanga${r.oldPriceTanga ? ` (edi ${tanga(r.oldPriceTanga)})` : ""} · 📦 ${r.stock} dona`,
  };
}

/** Find the single best product for an order term (numeric = id, else name/desc/category match). */
async function findProduct(item: string): Promise<{ id: number; name: string; priceTanga: number; oldPriceTanga: number | null; stock: number } | null> {
  const sel = { id: true, name: true, priceTanga: true, oldPriceTanga: true, stock: true };
  if (/^\d+$/.test(item)) {
    const byId = await prisma.product.findFirst({ where: { id: Number(item), active: true, stock: { gt: 0 } }, select: sel });
    if (byId) return byId;
  }
  const terms = item.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 2);
  const OR = [item, ...terms].flatMap((t) => [{ name: { contains: t, mode: "insensitive" as const } }, { description: { contains: t, mode: "insensitive" as const } }, { category: { contains: t, mode: "insensitive" as const } }]);
  return prisma.product.findFirst({ where: { active: true, stock: { gt: 0 }, OR }, orderBy: [{ featured: "desc" }, { favCount: "desc" }], select: sel });
}

export const bazarProvider = makeCatalogProvider({
  key: "bazar",
  title: "bozor/do'kon mahsulotlari (tanga bilan sotib olinadi, yetkazib beriladi)",
  flags: ["shop"],

  async fetch(terms: string[], limit: number): Promise<AiCard[]> {
    const OR = terms.flatMap((t) => [
      { name: { contains: t, mode: "insensitive" as const } },
      { description: { contains: t, mode: "insensitive" as const } },
      { category: { contains: t, mode: "insensitive" as const } },
    ]);
    const rows = await prisma.product.findMany({
      where: { active: true, stock: { gt: 0 }, OR },
      orderBy: [{ featured: "desc" }, { favCount: "desc" }, { sortOrder: "asc" }],
      take: limit,
      select: { id: true, name: true, priceTanga: true, oldPriceTanga: true, stock: true },
    });
    return rows.map(card);
  },

  async order(_memberId, _tgId, item, _qty, extra): Promise<ConfirmCard | { error: string }> {
    const p = await findProduct(item);
    if (!p) return { error: `«${item}» do'kondan topilmadi. Boshqacha nom bilan qidirib ko'ring.` };
    const address = (extra ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (address.length < 5) return { error: `«${esc(p.name)}» — ${tanga(p.priceTanga)} tanga. Yetkazish manzilini yozing (masalan «Obod mahalla 12-uy») — buyurtmani rasmiylashtiraman.` };
    const payload: BazarPayload = { productId: p.id, address };
    return {
      html:
        `🛒 <b>Buyurtma tasdiqlash</b>\n` +
        `${esc(p.name)} — <b>🪙 ${tanga(p.priceTanga)} tanga</b> (1 dona)\n` +
        `📍 ${esc(address)}\n` +
        `💳 To'lov: tangangizdan yechiladi. Ega tasdiqlab, yetkazib beradi.\n\nRasmiylashtiraymi?`,
      payload: JSON.stringify(payload),
    };
  },

  async execute(memberId, _tgId, payloadRaw): Promise<{ ok: boolean; message: string }> {
    let p: BazarPayload;
    try {
      p = JSON.parse(payloadRaw) as BazarPayload;
    } catch {
      return { ok: false, message: "Buyurtma ma'lumoti buzilgan — qaytadan urinib ko'ring." };
    }
    const { buyProduct } = await import("../../shopService");
    const r = await buyProduct(memberId, p.productId, p.address, false, "tanga");
    if (!r.ok) {
      const reasons: Record<string, string> = {
        insufficient: "Tangangiz yetarli emas 😔 Mini App → Hamyon'da balansingizni ko'ring.",
        sold_out: "Afsuski, bu mahsulot tugab qoldi.",
        pending_limit: "Sizda kutilayotgan buyurtmalar ko'p — avval ularini yakunlang.",
        bad_address: "Manzil juda qisqa — aniqroq yozing.",
        duplicate: "Bu buyurtma allaqachon berilgan.",
      };
      return { ok: false, message: reasons[r.reason ?? ""] ?? "Buyurtma o'tmadi — keyinroq urinib ko'ring." };
    }
    if (r.notice) {
      const { getBotInstance } = await import("../../../botInstance");
      const bot = getBotInstance();
      if (bot) await (await import("../../../bot/shop")).notifyOwnerShop(bot, r.notice).catch(() => undefined);
    }
    return { ok: true, message: `✅ <b>Buyurtma qabul qilindi!</b> #${r.orderId}\n🪙 Yangi balans: ${tanga(r.balance ?? 0)} tanga\n📦 Ega tasdiqlab, tez orada yetkazib beradi.` };
  },
});
