// 💎 Kolleksiya — numbered collectibles in OUR Postgres. Mint = sink (or free
// ride-drop), resale = 10% burn. mintCap is immutable by convention: there is
// deliberately NO route that raises a cap.
import { prisma } from "../db";
import { getCoins, grantCoins, spendCoins } from "./coinService";

export const CAR_PARTS = [
  "g'ildirak", "motor", "eshik", "kapot", "oyna", "rul", "o'rindiq", "far",
  "bamper", "krilo", "radiator", "akkumulyator", "karobka", "glushitel",
  "tormoz", "amortizator", "salon", "panel", "antenna", "bagaj",
] as const;

const SEED: { code: string; name: string; emoji: string; rarity: string; kind: string; mintCap: number; mintPrice: number }[] = [
  { code: "gold_1067", name: "Oltin raqam «1067»", emoji: "🏅", rarity: "afsonaviy", kind: "plate", mintCap: 1, mintPrice: 50000 },
  { code: "koson_plate", name: "KOSON plakasi", emoji: "🏷", rarity: "nodir", kind: "plate", mintCap: 10, mintPrice: 5000 },
  { code: "tesla_1067", name: "Tesla 1067", emoji: "⚡", rarity: "nodir", kind: "car", mintCap: 50, mintPrice: 15000 },
  { code: "tilla_cobalt", name: "Tilla Cobalt", emoji: "👑", rarity: "afsonaviy", kind: "car", mintCap: 20, mintPrice: 25000 },
  { code: "founder", name: "Asoschi", emoji: "🌟", rarity: "nodir", kind: "badge", mintCap: 100, mintPrice: 0 },
  { code: "jackpot_trophy", name: "Jackpot kubogi", emoji: "🏆", rarity: "kam", kind: "trophy", mintCap: 0, mintPrice: 0 },
  { code: "sayyoh", name: "Koson sayyohi", emoji: "🗺", rarity: "kam", kind: "badge", mintCap: 0, mintPrice: 0 },
  { code: "car_full", name: "Yig'ilgan mashina", emoji: "🚙", rarity: "nodir", kind: "car", mintCap: 0, mintPrice: 0 },
  ...CAR_PARTS.map((p) => ({ code: `part_${p.replace(/[^a-z]/gi, "")}`, name: `Qism: ${p}`, emoji: "🔧", rarity: "oddiy", kind: "part", mintCap: 0, mintPrice: 0 })),
];

export async function seedItemTypes(): Promise<void> {
  for (const t of SEED) {
    await prisma.itemType.upsert({ where: { code: t.code }, create: t, update: { name: t.name, emoji: t.emoji } });
  }
}

/** Mint one item. Paid mints are sinks; free mints are ride-drops/awards. */
export async function mintItem(
  memberId: number,
  code: string,
  opts: { free?: boolean } = {},
): Promise<{ ok: boolean; reason?: "unknown" | "sold_out" | "insufficient" | "already"; serial?: number; name?: string }> {
  const t = await prisma.itemType.findUnique({ where: { code } });
  if (!t) return { ok: false, reason: "unknown" };
  // one-per-member for badges/trophies (founder, sayyoh)
  if (t.kind === "badge" || t.kind === "trophy") {
    const has = await prisma.item.findFirst({ where: { ownerId: memberId, itemTypeId: t.id } });
    if (has) return { ok: false, reason: "already" };
  }
  if (!opts.free && t.mintPrice > 0) {
    const spend = await spendCoins(memberId, t.mintPrice, "item_mint", `💎 ${t.name}`);
    if (!spend.ok) return { ok: false, reason: "insufficient" };
  }
  try {
    const serial = await prisma.$transaction(async (tx) => {
      const fresh = await tx.itemType.findUnique({ where: { id: t.id } });
      if (!fresh) throw new Error("sold_out");
      if (fresh.mintCap > 0 && fresh.mintedCount >= fresh.mintCap) throw new Error("sold_out");
      const upd = await tx.itemType.update({ where: { id: t.id }, data: { mintedCount: { increment: 1 } } });
      await tx.item.create({ data: { itemTypeId: t.id, serial: upd.mintedCount, ownerId: memberId } });
      return upd.mintedCount;
    });
    return { ok: true, serial, name: t.name };
  } catch {
    if (!opts.free && t.mintPrice > 0) {
      await grantCoins(memberId, t.mintPrice, "item_mint", `💎 ${t.name} — sotuvda qolmadi, tanga qaytdi`);
    }
    return { ok: false, reason: "sold_out" };
  }
}

/** Random car-part drop for a driver's completed ride (XIII stage 1, cost 0). */
export async function dropCarPart(driverId: number, bookingId: number): Promise<{ part: string; fullCar: boolean } | null> {
  // idempotent per ride via AppState key (cheap, avoids an extra model)
  const key = `partdrop:${driverId}:${bookingId}`;
  try {
    await prisma.appState.create({ data: { key, value: "1" } });
  } catch {
    return null;
  }
  const part = CAR_PARTS[Math.floor(Math.random() * CAR_PARTS.length)]!;
  const code = `part_${part.replace(/[^a-z]/gi, "")}`;
  const r = await mintItem(driverId, code, { free: true });
  if (!r.ok) return null;
  // full set? distinct part types owned = 20 → mint the assembled car once
  const partTypes = await prisma.itemType.findMany({ where: { kind: "part" }, select: { id: true } });
  const owned = await prisma.item.groupBy({ by: ["itemTypeId"], where: { ownerId: driverId, itemTypeId: { in: partTypes.map((p) => p.id) } } });
  let fullCar = false;
  if (owned.length >= CAR_PARTS.length) {
    const fullType = await prisma.itemType.findUnique({ where: { code: "car_full" } });
    const has = fullType ? await prisma.item.findFirst({ where: { ownerId: driverId, itemTypeId: fullType.id } }) : null;
    if (!has) {
      const m = await mintItem(driverId, "car_full", { free: true });
      fullCar = m.ok;
    }
  }
  return { part, fullCar };
}

/** Koson district quest: first ride to a new address mints a district badge. */
export async function dropDistrictBadge(memberId: number, addressId: number, addressName: string): Promise<{ name: string; total: number; sayyoh: boolean } | null> {
  const code = `district_${addressId}`;
  let t = await prisma.itemType.findUnique({ where: { code } });
  if (!t) {
    t = await prisma.itemType.create({
      data: { code, name: `Tuman: ${addressName.slice(0, 30)}`, emoji: "📍", rarity: "oddiy", kind: "badge", mintCap: 0, mintPrice: 0 },
    }).catch(() => null as never);
    if (!t) t = await prisma.itemType.findUnique({ where: { code } });
    if (!t) return null;
  }
  const has = await prisma.item.findFirst({ where: { ownerId: memberId, itemTypeId: t.id } });
  if (has) return null;
  await prisma.item.create({ data: { itemTypeId: t.id, serial: 0, ownerId: memberId } }).catch(() => undefined);
  const districtTypes = await prisma.itemType.findMany({ where: { kind: "badge", code: { startsWith: "district_" } }, select: { id: true } });
  const total = (await prisma.item.groupBy({ by: ["itemTypeId"], where: { ownerId: memberId, itemTypeId: { in: districtTypes.map((d) => d.id) } } })).length;
  let sayyoh = false;
  if (total >= 10) {
    const m = await mintItem(memberId, "sayyoh", { free: true });
    if (m.ok) {
      await grantCoins(memberId, 5000, "quest", "🗺 Koson sayyohi — to'liq xarita!", `sayyoh:${memberId}`);
      sayyoh = true;
    }
  }
  return { name: t.name, total, sayyoh };
}

// ── resale (10% burn) ─────────────────────────────────────────────────────────
export async function listItem(memberId: number, itemId: number, price: number): Promise<{ ok: boolean; reason?: string }> {
  price = Math.floor(price);
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || item.ownerId !== memberId) return { ok: false, reason: "not_owner" };
  const t = await prisma.itemType.findUnique({ where: { id: item.itemTypeId } });
  if (!t) return { ok: false, reason: "unknown" };
  if (t.kind === "badge" || t.kind === "trophy") return { ok: false, reason: "not_sellable" };
  const floor = Math.max(100, Math.floor(t.mintPrice * 0.5));
  const ceil = t.mintPrice > 0 ? Math.floor(t.mintPrice * 3) : 50000;
  if (price < floor || price > ceil) return { ok: false, reason: "price_range" };
  try {
    await prisma.itemListing.create({ data: { itemId, sellerId: memberId, price } });
  } catch {
    return { ok: false, reason: "already_listed" };
  }
  return { ok: true };
}

export async function unlistItem(memberId: number, itemId: number): Promise<boolean> {
  const r = await prisma.itemListing.deleteMany({ where: { itemId, sellerId: memberId } });
  return r.count > 0;
}

export async function buyListedItem(buyerId: number, listingId: number): Promise<{ ok: boolean; reason?: string; name?: string; coins: number }> {
  const listing = await prisma.itemListing.findUnique({ where: { id: listingId } });
  const coins = async () => getCoins(buyerId);
  if (!listing) return { ok: false, reason: "not_found", coins: await coins() };
  if (listing.sellerId === buyerId) return { ok: false, reason: "self", coins: await coins() };
  // anti-farm: buyers need ≥3 real rides
  const buyer = await prisma.member.findUnique({ where: { id: buyerId }, select: { trips: true } });
  if ((buyer?.trips ?? 0) < 3) return { ok: false, reason: "need_rides", coins: await coins() };

  const spend = await spendCoins(buyerId, listing.price, "item_buy", `💎 Kolleksiya xaridi #${listing.itemId}`);
  if (!spend.ok) return { ok: false, reason: "insufficient", coins: spend.balance };
  const seller = Math.floor(listing.price * 0.9); // 10% burn
  try {
    await prisma.$transaction(async (tx) => {
      const del = await tx.itemListing.deleteMany({ where: { id: listingId } });
      if (del.count === 0) throw new Error("gone");
      await tx.item.update({ where: { id: listing.itemId }, data: { ownerId: buyerId } });
    });
  } catch {
    await grantCoins(buyerId, listing.price, "item_buy", "Kolleksiya: buyum sotilib bo'lgan — tanga qaytdi");
    return { ok: false, reason: "not_found", coins: await coins() };
  }
  await grantCoins(listing.sellerId, seller, "item_sell", `💎 Buyum sotildi (#${listing.itemId})`, `itemsale:${listingId}`);
  const item = await prisma.item.findUnique({ where: { id: listing.itemId } });
  const t = item ? await prisma.itemType.findUnique({ where: { id: item.itemTypeId } }) : null;
  return { ok: true, name: t?.name, coins: spend.balance };
}

export async function getCollection(memberId: number) {
  await seedItemTypes();
  const [types, mine, listings] = await Promise.all([
    prisma.itemType.findMany({ where: { mintPrice: { gt: 0 } }, orderBy: { mintPrice: "desc" } }),
    prisma.item.findMany({ where: { ownerId: memberId }, orderBy: { acquiredAt: "desc" } }),
    prisma.itemListing.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const typeById = new Map((await prisma.itemType.findMany()).map((t) => [t.id, t]));
  const partTypes = [...typeById.values()].filter((t) => t.kind === "part");
  const myParts = new Set(mine.filter((i) => partTypes.some((p) => p.id === i.itemTypeId)).map((i) => i.itemTypeId));
  const listedItemIds = new Set((await prisma.itemListing.findMany({ where: { sellerId: memberId } })).map((l) => l.itemId));
  return {
    catalog: types.map((t) => ({ code: t.code, name: t.name, emoji: t.emoji, rarity: t.rarity, price: t.mintPrice, left: t.mintCap > 0 ? t.mintCap - t.mintedCount : null })),
    mine: mine.map((i) => {
      const t = typeById.get(i.itemTypeId);
      return { id: i.id, code: t?.code ?? "", name: t?.name ?? "", emoji: t?.emoji ?? "💎", serial: i.serial, cap: t?.mintCap ?? 0, sellable: t ? t.kind !== "badge" && t.kind !== "trophy" : false, listed: listedItemIds.has(i.id) };
    }),
    partsProgress: { have: myParts.size, total: partTypes.length },
    market: await Promise.all(
      listings.map(async (l) => {
        const i = await prisma.item.findUnique({ where: { id: l.itemId } });
        const t = i ? typeById.get(i.itemTypeId) : null;
        return { listingId: l.id, itemId: l.itemId, name: t?.name ?? "", emoji: t?.emoji ?? "💎", serial: i?.serial ?? 0, price: l.price, mine: l.sellerId === memberId };
      }),
    ),
    coins: await getCoins(memberId),
  };
}
