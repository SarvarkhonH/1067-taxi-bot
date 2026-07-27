// 🎀 RAVELLA (feature "ravella", RAVELLA_PLAN.md) — hamkor-brend bezak KONSTRUKTORI.
// Asosiy bezak (rasm + narx) + qo'shimchalar `+`/`−` (har biriga o'z "qo'shilgan holat" rasmi).
// PUL QOIDALARI (§7, buzilmas):
//   1. Narx SERVERDA hisoblanadi — client faqat id'lar yuboradi, summaga ISHONILMAYDI.
//   2. Buyurtmada CoinTxn YO'Q (to'lov naqd/kelishuv — restoran V1 concierge naqshi).
//   3. 10% chegirma RAVELLA hisobidan (bizga 0 so'm), 1% cashback BIZNING hisobimizdan.
//   4. Cashback FAQAT `done`-flip muvaffaqiyatli bo'lgach, `rvlcb:<orderId>` idempotent kaliti +
//      pendingCreate/pendingResolve bardoshlilik naqshi bilan; `bookingId` BERILMAYDI → safar
//      ≤350 clamp indeksi bu grantni umuman ko'rmaydi.
import type {
  AdminRavellaAddonRow, AdminRavellaCategoryRow, AdminRavellaItemRow, AdminRavellaOrderRow,
  RavellaAddonView, RavellaCatalogResponse, RavellaItemCard, RavellaItemDetailResponse,
  RavellaOrderCreateBody, RavellaOrderStatus, RavellaOrderView,
} from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

/** Jonli xato saboqi (restoranService.ts:8-14): `findUnique({where:{id: NaN}})` Prisma darajasida
 *  UNHANDLED tashlaydi (crash). Har id-bo'yicha qidiruv shu bilan himoyalanadi. */
function validId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

const PENDING_PER_MEMBER = 3; // shop/restoran bilan bir xil anti-spam chegarasi
const MAX_ADDON_LINES = 20;

interface AddonLine { addonId: number; name: string; qty: number; priceSom: number }

const parseAddons = (j: unknown): AddonLine[] => (Array.isArray(j) ? (j as AddonLine[]) : []);

async function knobs(): Promise<{ discountPct: number; cashbackPct: number; perOrder: number; daily: number; slaMinutes: number }> {
  const { getBonusEcon } = await import("./bonusConfig");
  const e = await getBonusEcon();
  return {
    discountPct: e.ravellaDiscountPct ?? 0,
    cashbackPct: e.ravellaCashbackPct ?? 0,
    perOrder: e.ravellaCashbackPerOrder ?? 0,
    daily: e.ravellaCashbackDaily ?? 0,
    slaMinutes: e.ravellaSlaMinutes ?? 15,
  };
}

const itemCard = (r: { id: number; categoryId: number; name: string; desc: string | null; basePriceSom: number; photoFileId: string | null; photoUrl: string | null }): RavellaItemCard => ({
  id: r.id,
  categoryId: r.categoryId,
  name: r.name,
  desc: r.desc,
  basePriceSom: r.basePriceSom,
  hasPhoto: !!(r.photoFileId || r.photoUrl),
});

const addonView = (a: { id: number; name: string; priceSom: number; maxQty: number; photoFileId: string | null; photoUrl: string | null }): RavellaAddonView => ({
  id: a.id,
  name: a.name,
  priceSom: a.priceSom,
  maxQty: a.maxQty,
  hasPhoto: !!(a.photoFileId || a.photoUrl),
});

// ── katalog (mijoz tomoni) ───────────────────────────────────────────────────────────────────────
// `preview=true` (ega) DARK flagni chetlab o'tadi — ega katalogni QABUL qilgunча mijozlar hech
// nima ko'rmaydi (shop/restoran owner-preview naqshi AYNAN).

export async function getRavellaCatalog(preview = false): Promise<RavellaCatalogResponse> {
  const k = await knobs();
  const empty: RavellaCatalogResponse = { categories: [], discountPct: k.discountPct, cashbackPct: k.cashbackPct };
  if (!preview && !(await featureOn("ravella"))) return empty;
  const [cats, items] = await Promise.all([
    prisma.ravellaCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 30 }),
    prisma.ravellaItem.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 200 }),
  ]);
  const byCat = new Map<number, RavellaItemCard[]>();
  for (const it of items) {
    if (!byCat.has(it.categoryId)) byCat.set(it.categoryId, []);
    byCat.get(it.categoryId)!.push(itemCard(it));
  }
  return {
    ...empty,
    // bo'sh kategoriya mijozga KO'RSATILMAYDI (bozor saboqi: bo'sh do'kon = o'lik ekran)
    categories: cats
      .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, items: byCat.get(c.id) ?? [] }))
      .filter((c) => c.items.length > 0),
  };
}

/** Konstruktor ekrani: bezak + unga tegishli qo'shimchalar (o'ziga xos + kategoriya-bo'ylab umumiy). */
export async function getRavellaItemDetail(id: number, preview = false): Promise<RavellaItemDetailResponse> {
  const k = await knobs();
  const empty: RavellaItemDetailResponse = { item: null, addons: [], discountPct: k.discountPct, cashbackPct: k.cashbackPct };
  if (!validId(id)) return empty;
  if (!preview && !(await featureOn("ravella"))) return empty;
  const item = await prisma.ravellaItem.findUnique({ where: { id } });
  if (!item || (!item.active && !preview)) return empty;
  const addons = await prisma.ravellaAddon.findMany({
    where: { active: true, OR: [{ itemId: id }, { itemId: null, categoryId: item.categoryId }] },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 50,
  });
  return { ...empty, item: itemCard(item), addons: addons.map(addonView) };
}

// ── buyurtma ─────────────────────────────────────────────────────────────────────────────────────

export interface RavellaOwnerNotice {
  orderId: number;
  itemName: string;
  addonsText: string;
  subtotalSom: number;
  discountSom: number;
  totalSom: number;
  buyerName: string;
  contact: string;
  address: string;
  eventDate: string;
  note: string;
}

/**
 * Buyurtma yaratish. §7.1: mijoz YUBORGAN summalar YO'Q — jami shu yerda, jonli DB narxlaridan
 * hisoblanadi. Chegirma ham knobdan olinadi (client "useDiscount" faqat XOHISH bildiradi, foizni
 * O'ZI belgilay olmaydi). Natijadagi `notice` — hamkor bot-kartasi uchun.
 */
export async function createRavellaOrder(
  memberId: number,
  body: RavellaOrderCreateBody,
  preview = false,
): Promise<{ ok: boolean; reason?: string; orderId?: number; totalSom?: number; cashbackSom?: number; notice?: RavellaOwnerNotice }> {
  if (!preview && !(await featureOn("ravella"))) return { ok: false, reason: "off" };
  if (!validId(body?.itemId)) return { ok: false, reason: "unavailable" };

  const contact = (body.contact ?? "").trim().slice(0, 30);
  if (contact.replace(/\D/g, "").length < 7) return { ok: false, reason: "bad_contact" };
  const address = (body.address ?? "").trim().slice(0, 200);
  if (address.length < 5) return { ok: false, reason: "bad_address" };

  const item = await prisma.ravellaItem.findUnique({ where: { id: body.itemId } });
  if (!item || !item.active) return { ok: false, reason: "unavailable" };

  const open = await prisma.ravellaOrder.count({ where: { memberId, status: { in: ["pending", "accepted", "called"] } } });
  if (open >= PENDING_PER_MEMBER) return { ok: false, reason: "pending_limit" };

  // qo'shimchalar: id'lar bo'yicha JONLI qayta o'qiladi + shu bezakka tegishliligi tekshiriladi
  const wanted = (body.addons ?? [])
    .filter((a) => Number.isInteger(a?.addonId) && Number.isInteger(a?.qty) && a.qty > 0)
    .slice(0, MAX_ADDON_LINES);
  let addonLines: AddonLine[] = [];
  if (wanted.length) {
    const rows = await prisma.ravellaAddon.findMany({
      where: {
        id: { in: wanted.map((a) => a.addonId) },
        active: true,
        OR: [{ itemId: item.id }, { itemId: null, categoryId: item.categoryId }],
      },
    });
    if (rows.length !== new Set(wanted.map((a) => a.addonId)).size) return { ok: false, reason: "bad_addon" };
    const byId = new Map(rows.map((r) => [r.id, r]));
    addonLines = wanted.map((a) => {
      const r = byId.get(a.addonId)!;
      return { addonId: r.id, name: r.name, qty: Math.min(a.qty, r.maxQty), priceSom: r.priceSom };
    });
  }

  const subtotalSom = item.basePriceSom + addonLines.reduce((s, a) => s + a.priceSom * a.qty, 0);
  const k = await knobs();
  const discountPct = body.useDiscount ? k.discountPct : 0;
  const discountSom = Math.floor((subtotalSom * discountPct) / 100);
  const totalSom = Math.max(0, subtotalSom - discountSom);

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { fullName: true, displayName: true } });
  const order = await prisma.ravellaOrder.create({
    data: {
      memberId,
      itemId: item.id,
      itemName: item.name,
      addonsJson: addonLines as unknown as object, // Prisma Json input (marketOrderService:121 naqshi)
      subtotalSom, discountPct, discountSom, totalSom,
      contact, address,
      eventDate: (body.eventDate ?? "").trim().slice(0, 40) || null,
      note: (body.note ?? "").trim().slice(0, 300),
    },
  });
  await prisma.ravellaItem.update({ where: { id: item.id }, data: { orderCount: { increment: 1 } } }).catch(() => undefined);

  return {
    ok: true,
    orderId: order.id,
    totalSom,
    // VA'DA (hali berilmagan tanga) — mijoz ekranida "ish tugagach shuncha qaytadi" deb ko'rsatiladi
    cashbackSom: cashbackFor(totalSom, k.cashbackPct, k.perOrder),
    notice: {
      orderId: order.id,
      itemName: item.name,
      addonsText: addonLines.length ? addonLines.map((a) => `${a.name} ×${a.qty}`).join(", ") : "—",
      subtotalSom, discountSom, totalSom,
      buyerName: member?.displayName || member?.fullName || "Mijoz",
      contact, address,
      eventDate: order.eventDate ?? "—",
      note: order.note,
    },
  };
}

/** Buyurtma cap'lar ichida qancha tanga beradi (VA'DA hisobi ham, HAQIQIY grant ham shundan). */
function cashbackFor(totalSom: number, pct: number, perOrder: number): number {
  if (totalSom <= 0 || pct <= 0) return 0;
  const raw = Math.floor((totalSom * pct) / 100);
  return perOrder > 0 ? Math.min(raw, perOrder) : raw;
}

const toOrderView = (o: {
  id: number; itemName: string; addonsJson: unknown; subtotalSom: number; discountSom: number; totalSom: number;
  status: string; rejectReason: string | null; cashbackSom: number; address: string; eventDate: string | null; createdAt: Date;
}): RavellaOrderView => ({
  id: o.id,
  itemName: o.itemName,
  addons: parseAddons(o.addonsJson),
  subtotalSom: o.subtotalSom,
  discountSom: o.discountSom,
  totalSom: o.totalSom,
  status: o.status as RavellaOrderStatus,
  rejectReason: o.rejectReason,
  cashbackSom: o.cashbackSom,
  address: o.address,
  eventDate: o.eventDate,
  createdAt: o.createdAt.toISOString(),
});

export async function myRavellaOrders(memberId: number, take = 20): Promise<RavellaOrderView[]> {
  const rows = await prisma.ravellaOrder.findMany({ where: { memberId }, orderBy: { id: "desc" }, take });
  return rows.map(toOrderView);
}

/** Mijoz bekor qiladi — FAQAT `pending` (hamkor hali qabul qilmagan). Naqd — refund kerak emas. */
export async function cancelRavellaOrder(memberId: number, orderId: number): Promise<{ ok: boolean; reason?: string }> {
  if (!validId(orderId)) return { ok: false, reason: "not_pending" };
  const r = await prisma.ravellaOrder.updateMany({ where: { id: orderId, memberId, status: "pending" }, data: { status: "cancelled_by_user" } });
  return r.count > 0 ? { ok: true } : { ok: false, reason: "not_pending" };
}

// ── hamkor/operator holat-o'tishlari ─────────────────────────────────────────────────────────────
// Har o'tish SHARTLI `updateMany` (status-guard): ikki marta bosilsa yoki ikki kishi bir vaqtda
// bossa — faqat BITTASI o'tadi, ikkinchisi no-op (marketOrder/restoran naqshi).

export interface RavellaDecision {
  ok: boolean;
  reason?: string;
  memberId?: number;
  itemName?: string;
  newStatus?: RavellaOrderStatus;
  cashbackSom?: number;
}

async function flip(orderId: number, from: RavellaOrderStatus[], to: RavellaOrderStatus, extra: Record<string, unknown> = {}): Promise<RavellaDecision> {
  if (!validId(orderId)) return { ok: false, reason: "not_found" };
  const o = await prisma.ravellaOrder.findUnique({ where: { id: orderId }, select: { memberId: true, itemName: true, status: true } });
  if (!o) return { ok: false, reason: "not_found" };
  const r = await prisma.ravellaOrder.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: to, ...extra } });
  if (r.count === 0) return { ok: false, reason: o.status };
  return { ok: true, memberId: o.memberId, itemName: o.itemName, newStatus: to };
}

/** ✅ Hamkor buyurtmani qabul qiladi. */
export const acceptRavellaOrder = (orderId: number): Promise<RavellaDecision> =>
  flip(orderId, ["pending"], "accepted", { acceptedAt: new Date() });

/** ☎️ "Mijoz bilan bog'landim" — mijozga ham ko'rinadi (u telefon kutmoqda). */
export const markRavellaCalled = (orderId: number): Promise<RavellaDecision> =>
  flip(orderId, ["pending", "accepted"], "called");

/** ❌ Rad — hali ish boshlanmagan holatlardan. Naqd → refund logikasi kerak emas. */
export async function rejectRavellaOrder(orderId: number, reason: string): Promise<RavellaDecision> {
  const clean = (reason ?? "").trim().slice(0, 300) || "Sabab ko'rsatilmagan";
  return flip(orderId, ["pending", "accepted", "called"], "rejected", { rejectReason: clean });
}

/**
 * ✔ Ish BAJARILDI — YAGONA pul chiqadigan nuqta. Cashback grant'i SHU flip (count===1)
 * muvaffaqiyatli bo'lgachgina ishga tushadi: soxta buyurtma + o'z-o'zini bekor qilish fermasi
 * strukturaviy NOL to'laydi (bu holatga hamkorsiz yetib bo'lmaydi). Grant xatosi ishni "bajarilmagan"
 * qilib qo'ymaydi (ish allaqachon haqiqiy) — alohida try/catch, `retryPendingMoney` qayta uradi.
 */
export async function finishRavellaOrder(orderId: number): Promise<RavellaDecision> {
  const d = await flip(orderId, ["accepted", "called"], "done", { doneAt: new Date() });
  if (!d.ok) return d;
  const cashbackSom = await grantRavellaCashback(orderId).catch((e) => {
    console.error("[ravellacb] grant failed:", e);
    return 0;
  });
  return { ...d, cashbackSom };
}

/** §7.3-7.5: 1% — BIZNING emissiyamiz. bookingId BERILMAYDI → safar ≤350 clamp'iga tegmaydi.
 *  Buyurtma cap'i + a'zoga kunlik cap; o'qish+grant `withMemberLock` ichida serializatsiya
 *  qilinadi (ikki buyurtma bir vaqtda tugasa kunlik capdan oshib ketmasin — shopcashback R4-gap saboqi). */
export async function grantRavellaCashback(orderId: number): Promise<number> {
  if (!(await featureOn("ravella"))) return 0;
  const o = await prisma.ravellaOrder.findUnique({ where: { id: orderId }, select: { memberId: true, totalSom: true, status: true, cashbackSom: true } });
  if (!o || o.status !== "done" || o.cashbackSom > 0) return 0;
  const k = await knobs();
  const base = cashbackFor(o.totalSom, k.cashbackPct, k.perOrder);
  if (base <= 0) return 0;

  const { withMemberLock } = await import("./coinService");
  return withMemberLock(o.memberId, async () => {
    let amount = base;
    if (k.daily > 0) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const sum = await prisma.coinTxn.aggregate({ where: { memberId: o.memberId, kind: "ravella_cashback", createdAt: { gte: since } }, _sum: { amount: true } });
      amount = Math.max(0, Math.min(amount, k.daily - (sum._sum.amount ?? 0)));
    }
    if (amount <= 0) return 0;
    const { pendingCreate, pendingResolve } = await import("./appStateUtil");
    const { grantCoins } = await import("./coinService");
    const id = String(orderId);
    await pendingCreate("ravellacb", id, { memberId: o.memberId, amount });
    const r = await grantCoins(o.memberId, amount, "ravella_cashback", "🎀 Ravella buyurtmangiz uchun tanga", `rvlcb:${id}`);
    if (r.ok || r.skipped === "duplicate") {
      await pendingResolve("ravellacb", id);
      await prisma.ravellaOrder.update({ where: { id: orderId }, data: { cashbackSom: amount } }).catch(() => undefined);
      return amount;
    }
    return 0;
  });
}

/** SLA: javobsiz `pending` buyurtmalar — MAVJUD sweep tick'iga ulanadi (YANGI POLLER YO'Q).
 *  Bir marta ogohlantiradi (`slaAlertedAt` idempotent-belgi). Mijozga ko'rinmaydi — ichki nazorat. */
export async function checkRavellaSlaAndAlert(alertAdmins: (html: string) => Promise<void>): Promise<void> {
  if (!(await featureOn("ravella"))) return;
  const k = await knobs();
  const cutoff = new Date(Date.now() - k.slaMinutes * 60_000);
  const stale = await prisma.ravellaOrder.findMany({
    where: { status: "pending", createdAt: { lt: cutoff }, slaAlertedAt: null },
    select: { id: true, itemName: true, createdAt: true, contact: true },
    take: 50,
  });
  if (!stale.length) return;
  const lines = stale.map((s) => `#${s.id} · ${s.itemName} · ${Math.floor((Date.now() - s.createdAt.getTime()) / 60_000)} daq · ${s.contact}`);
  await alertAdmins(`🎀 <b>Ravella: ${stale.length} ta buyurtma ${k.slaMinutes}+ daq javobsiz</b>\n${lines.join("\n")}`).catch(() => undefined);
  await prisma.ravellaOrder.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { slaAlertedAt: new Date() } });
}

// ── rasm (Telegram file_id quvuri — driver-photo/shop/restoran naqshi) ───────────────────────────

export async function resolveRavellaItemPhoto(itemId: number): Promise<string | null> {
  if (!validId(itemId)) return null;
  const r = await prisma.ravellaItem.findUnique({ where: { id: itemId }, select: { photoUrl: true, photoFileId: true } });
  return resolvePhoto(r);
}

export async function resolveRavellaAddonPhoto(addonId: number): Promise<string | null> {
  if (!validId(addonId)) return null;
  const r = await prisma.ravellaAddon.findUnique({ where: { id: addonId }, select: { photoUrl: true, photoFileId: true } });
  return resolvePhoto(r);
}

async function resolvePhoto(r: { photoUrl: string | null; photoFileId: string | null } | null): Promise<string | null> {
  if (!r) return null;
  if (r.photoUrl) return r.photoUrl;
  if (r.photoFileId) {
    const { resolveTelegramFileUrl } = await import("./driverPhotoService");
    return resolveTelegramFileUrl(r.photoFileId);
  }
  return null;
}

async function tgUploadPhoto(buf: Buffer, mime: string, caption: string): Promise<{ fileId: string | null }> {
  const { env } = await import("../env");
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  if (!env.BOT_TOKEN || !adminId) return { fileId: null };
  try {
    const form = new FormData();
    form.append("chat_id", adminId);
    form.append("photo", new Blob([buf], { type: mime }), "photo.jpg");
    form.append("caption", caption);
    form.append("disable_notification", "true");
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
    const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string }[] } };
    const sizes = data.ok ? (data.result?.photo ?? []) : [];
    return { fileId: sizes.length ? sizes[sizes.length - 1]!.file_id : null };
  } catch {
    return { fileId: null };
  }
}

export async function uploadRavellaItemPhoto(itemId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean }> {
  const { fileId } = await tgUploadPhoto(buf, mime, `🎀 Ravella bezak · #${itemId}`);
  const url = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.ravellaItem.update({ where: { id: itemId }, data: { photoFileId: fileId, photoUrl: url } }).catch(() => undefined);
  return { ok: true };
}

export async function uploadRavellaAddonPhoto(addonId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean }> {
  const { fileId } = await tgUploadPhoto(buf, mime, `🎀 Ravella qo'shimcha · #${addonId}`);
  const url = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.ravellaAddon.update({ where: { id: addonId }, data: { photoFileId: fileId, photoUrl: url } }).catch(() => undefined);
  return { ok: true };
}

// ── admin CRUD (route qatlamida `requireAdmin` bilan qulflangan) ─────────────────────────────────

export async function adminListRavella(): Promise<{
  enabled: boolean;
  partnerChatId: string | null;
  categories: AdminRavellaCategoryRow[];
  items: AdminRavellaItemRow[];
  addons: AdminRavellaAddonRow[];
}> {
  const [enabled, partnerChatId, cats, items, addons] = await Promise.all([
    featureOn("ravella"),
    getRavellaPartnerChat(),
    prisma.ravellaCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.ravellaItem.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.ravellaAddon.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
  ]);
  const itemsPerCat = new Map<number, number>();
  for (const i of items) itemsPerCat.set(i.categoryId, (itemsPerCat.get(i.categoryId) ?? 0) + 1);
  const addonsPerItem = new Map<number, number>();
  for (const a of addons) if (a.itemId) addonsPerItem.set(a.itemId, (addonsPerItem.get(a.itemId) ?? 0) + 1);
  return {
    enabled,
    partnerChatId,
    categories: cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, sortOrder: c.sortOrder, active: c.active, itemCount: itemsPerCat.get(c.id) ?? 0 })),
    items: items.map((i) => ({ ...itemCard(i), active: i.active, sortOrder: i.sortOrder, orderCount: i.orderCount, addonCount: addonsPerItem.get(i.id) ?? 0 })),
    addons: addons.map((a) => ({ ...addonView(a), itemId: a.itemId, categoryId: a.categoryId, active: a.active, sortOrder: a.sortOrder })),
  };
}

export interface RavellaCategoryPatch { name?: string; emoji?: string; sortOrder?: number; active?: boolean }
export interface RavellaItemPatch { categoryId?: number; name?: string; desc?: string | null; basePriceSom?: number; sortOrder?: number; active?: boolean }
export interface RavellaAddonPatch { itemId?: number | null; categoryId?: number | null; name?: string; priceSom?: number; maxQty?: number; sortOrder?: number; active?: boolean }

const MAX_PRICE = 50_000_000; // saxna bezaklari/zal — millionlab so'm bo'lishi normal (aql-idrok shifti)

function cleanCategory(b: RavellaCategoryPatch): RavellaCategoryPatch {
  const out: RavellaCategoryPatch = {};
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 60);
  if (typeof b.emoji === "string" && b.emoji.trim()) out.emoji = b.emoji.trim().slice(0, 8);
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  if (typeof b.active === "boolean") out.active = b.active;
  return out;
}

function cleanItem(b: RavellaItemPatch): RavellaItemPatch {
  const out: RavellaItemPatch = {};
  if (typeof b.categoryId === "number" && validId(b.categoryId)) out.categoryId = b.categoryId;
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (b.desc !== undefined) out.desc = (b.desc ?? "").toString().trim().slice(0, 300) || null;
  if (typeof b.basePriceSom === "number" && Number.isFinite(b.basePriceSom)) out.basePriceSom = Math.min(MAX_PRICE, Math.max(0, Math.floor(b.basePriceSom)));
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  if (typeof b.active === "boolean") out.active = b.active;
  return out;
}

function cleanAddon(b: RavellaAddonPatch): RavellaAddonPatch {
  const out: RavellaAddonPatch = {};
  if (b.itemId !== undefined) out.itemId = validId(Number(b.itemId)) ? Number(b.itemId) : null;
  if (b.categoryId !== undefined) out.categoryId = validId(Number(b.categoryId)) ? Number(b.categoryId) : null;
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (typeof b.priceSom === "number" && Number.isFinite(b.priceSom)) out.priceSom = Math.min(MAX_PRICE, Math.max(0, Math.floor(b.priceSom)));
  if (typeof b.maxQty === "number" && Number.isFinite(b.maxQty)) out.maxQty = Math.min(20, Math.max(1, Math.floor(b.maxQty)));
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  if (typeof b.active === "boolean") out.active = b.active;
  return out;
}

export async function adminCreateCategory(b: RavellaCategoryPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanCategory(b);
  if (!p.name) return { ok: false, error: "name_required" };
  const row = await prisma.ravellaCategory.create({ data: { name: p.name, emoji: p.emoji ?? "🎀", sortOrder: p.sortOrder ?? 0 } });
  return { ok: true, id: row.id };
}

export async function adminEditCategory(id: number, b: RavellaCategoryPatch): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  await prisma.ravellaCategory.update({ where: { id }, data: cleanCategory(b) }).catch(() => undefined);
  return { ok: true };
}

/** Kategoriya o'chirilsa ichidagi bezaklar ham (va ularning qo'shimchalari) ketadi — buyurtma
 *  TARIXI tegilmaydi (RavellaOrder'da narx/nom SNAPSHOT, loose FK). */
export async function adminDeleteCategory(id: number): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  const items = await prisma.ravellaItem.findMany({ where: { categoryId: id }, select: { id: true } });
  await prisma.ravellaAddon.deleteMany({ where: { OR: [{ categoryId: id }, { itemId: { in: items.map((i) => i.id) } }] } }).catch(() => undefined);
  await prisma.ravellaItem.deleteMany({ where: { categoryId: id } }).catch(() => undefined);
  await prisma.ravellaCategory.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}

export async function adminCreateItem(b: RavellaItemPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanItem(b);
  if (!p.name || !p.categoryId || p.basePriceSom === undefined) return { ok: false, error: "name_category_price_required" };
  const row = await prisma.ravellaItem.create({
    data: { name: p.name, categoryId: p.categoryId, basePriceSom: p.basePriceSom, desc: p.desc ?? null, sortOrder: p.sortOrder ?? 0, active: false }, // DARK yaratiladi — EGA yoqadi
  });
  return { ok: true, id: row.id };
}

export async function adminEditItem(id: number, b: RavellaItemPatch): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  await prisma.ravellaItem.update({ where: { id }, data: cleanItem(b) }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteItem(id: number): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  await prisma.ravellaAddon.deleteMany({ where: { itemId: id } }).catch(() => undefined);
  await prisma.ravellaItem.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}

export async function adminCreateAddon(b: RavellaAddonPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanAddon(b);
  if (!p.name || p.priceSom === undefined) return { ok: false, error: "name_price_required" };
  if (!p.itemId && !p.categoryId) return { ok: false, error: "item_or_category_required" };
  const row = await prisma.ravellaAddon.create({
    data: { name: p.name, priceSom: p.priceSom, itemId: p.itemId ?? null, categoryId: p.categoryId ?? null, maxQty: p.maxQty ?? 5, sortOrder: p.sortOrder ?? 0 },
  });
  return { ok: true, id: row.id };
}

export async function adminEditAddon(id: number, b: RavellaAddonPatch): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  await prisma.ravellaAddon.update({ where: { id }, data: cleanAddon(b) }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteAddon(id: number): Promise<{ ok: boolean }> {
  if (!validId(id)) return { ok: false };
  await prisma.ravellaAddon.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}

export async function adminListRavellaOrders(status?: string): Promise<AdminRavellaOrderRow[]> {
  const rows = await prisma.ravellaOrder.findMany({ where: status ? { status } : undefined, orderBy: { id: "desc" }, take: 200 });
  const members = await prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } });
  const nameOf = new Map(members.map((m) => [m.id, m.displayName || m.fullName || "Mijoz"]));
  const now = Date.now();
  return rows.map((o) => ({
    ...toOrderView(o),
    memberId: o.memberId,
    buyerName: nameOf.get(o.memberId) ?? "Mijoz",
    contact: o.contact,
    note: o.note,
    ageMinutes: Math.floor((now - o.createdAt.getTime()) / 60_000),
  }));
}

// ── hamkor chat-id (AppState `ravella:chat`) ─────────────────────────────────────────────────────
// Sozlanmagan bo'lsa buyurtma kartalari EGAga tushadi (xavfsiz fallback — buyurtma hech qachon
// "hech kimga" ketmaydi).

/** Xom qiymat (admin ekranida ko'rsatiladi). Ega qarori 2026-07-27: BIR NECHTA hamkor bo'lishi
 *  mumkin — vergul/probel bilan ajratiladi, buyurtma kartasi HAMMASIGA boradi. */
export async function getRavellaPartnerChat(): Promise<string | null> {
  const row = await prisma.appState.findUnique({ where: { key: "ravella:chat" } }).catch(() => null);
  return row?.value?.trim() || null;
}

/** Yuborish/guard uchun tozalangan ro'yxat. Bo'sh bo'lsa [] — chaqiruvchi egaga tushiradi. */
export async function getRavellaPartnerChats(): Promise<string[]> {
  const raw = await getRavellaPartnerChat();
  if (!raw) return [];
  return [...new Set(raw.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^-?\d{5,}$/.test(x)))];
}

export async function setRavellaPartnerChat(chatId: string): Promise<{ ok: boolean }> {
  const raw = (chatId ?? "").trim().slice(0, 200);
  if (!raw) {
    await prisma.appState.upsert({ where: { key: "ravella:chat" }, create: { key: "ravella:chat", value: "" }, update: { value: "" } });
    return { ok: true };
  }
  const ids = raw.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  // BITTASI ham noto'g'ri bo'lsa butun so'rov rad etiladi — yarim saqlangan ro'yxat
  // (bir hamkor tushib qolgan) jim yo'qotish bo'lardi.
  if (!ids.every((x) => /^-?\d{5,}$/.test(x))) return { ok: false };
  await prisma.appState.upsert({
    where: { key: "ravella:chat" },
    create: { key: "ravella:chat", value: ids.join(",") },
    update: { value: ids.join(",") },
  });
  return { ok: true };
}
