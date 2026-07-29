// 📋 E'LONLAR (feature "elonlar") — mahalla e'lon taxtasi (OLX-uslub, ELONLAR_PLAN.md). E2 = model +
// CRUD + browse + 3-tap wizard + to'lov. Har e'lon `pending`da tug'iladi; admin ✅/❌ (E3) xalqqa
// ochadi/rad etadi. To'lov shop.ts naqshi: create+charge BITTA transactionda, CoinTxn idempotencyKey
// `elon_post_<adId>`; rad etilsa `elon_refund_<adId>` bilan bir marta avto-qaytariladi.
import type { Bot } from "grammy";
import {
  CLASSIFIED_AD_DAYS,
  CLASSIFIED_MAX_PHOTOS,
  classifiedCategoryDef,
  formatNumber,
  type AdminAdContactRow,
  type AdminAdReactionRow,
  type AdminAdViewerRow,
  type AdminClassifiedListResponse,
  type AdminClassifiedRow,
  type ClassifiedCard,
  type ClassifiedDetail,
  type ClassifiedOwnerProfile,
  type ClassifiedReactBody,
  type ClassifiedReactResponse,
  type ClassifiedReportResponse,
  type ClassifiedSubmitBody,
  type ClassifiedSubmitResponse,
  type ClassifiedTopBuyResponse,
  type MyClassifiedRow,
} from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { getBonusEcon } from "./bonusConfig";
import { grantCoins, withMemberLock } from "./coinService";
import { normalizeUzPhone } from "./serviceDirectory"; // reuse — same +998 normalization

const NEW_BADGE_HOURS = 1; // "Yangi" pulse-nuqta (§4.1)
const LIST_PAGE_MAX = 50;
const REPORTS_TO_HIDE = 3; // §5 community report → auto-hide + re-queue (services pattern)
const SLA_HOURS = 2; // §5 moderatsiya SLA eslatma
const TOP_HOURS = 24; // §6 TOP boost muddati
const EXPIRY_WARN_DAYS = 2; // §7 "tugayapti" push — muddatdan N kun oldin
const SOLD_CHECK_DAYS = 3; // §7 "chirigan doska" himoyasi — chiqqandan N kun keyin 1-tap push

// §5 "taqiqlangan so'z filtri submit'da" — kichik, kengaytiriladigan ro'yxat (substring, case-insensitive).
const BANNED_WORDS = ["qurol", "porox", "giyohvand", "narkotik", "otash qurol", "pistolet"];
function hasBannedWord(text: string): boolean {
  const low = text.toLowerCase();
  return BANNED_WORDS.some((w) => low.includes(w));
}

async function elonlarOn(preview: boolean): Promise<boolean> {
  return preview || (await featureOn("elonlar"));
}

type AdRow = {
  id: number; category: string; subtype: string; title: string; priceSom: number | null;
  isTop: boolean; createdAt: Date; photos: { id: number }[];
};

function toCard(a: AdRow): ClassifiedCard {
  return {
    id: a.id,
    category: a.category as ClassifiedCard["category"],
    subtype: a.subtype,
    title: a.title,
    priceSom: a.priceSom,
    isTop: a.isTop,
    hasPhoto: a.photos.length > 0,
    photoCount: a.photos.length,
    createdAt: a.createdAt.toISOString(),
    isNew: Date.now() - a.createdAt.getTime() < NEW_BADGE_HOURS * 3600_000,
  };
}

// ── rider surface ────────────────────────────────────────────────────────────────────────────────

export async function listAds(
  opts: { category?: string; subtype?: string; priceBand?: "arzon" | "ortacha" | "qimmat"; q?: string; limit?: number; offset?: number },
  preview = false,
): Promise<{ ads: ClassifiedCard[]; total: number }> {
  if (!(await elonlarOn(preview))) return { ads: [], total: 0 };
  const take = Math.min(LIST_PAGE_MAX, Math.max(1, opts.limit ?? 20));
  const skip = Math.max(0, opts.offset ?? 0);
  const q = (opts.q ?? "").trim().slice(0, 60);
  // narx tez-chiplari: 3 belgilangan chegara (slider EMAS) — §4 "Arzon/O'rtacha/Qimmat"
  const priceWhere =
    opts.priceBand === "arzon" ? { priceSom: { lte: 200_000 } }
    : opts.priceBand === "ortacha" ? { priceSom: { gt: 200_000, lte: 2_000_000 } }
    : opts.priceBand === "qimmat" ? { priceSom: { gt: 2_000_000 } }
    : {};
  const where = {
    status: "active",
    expiresAt: { gt: new Date() }, // §7(a) lazy-filter — sweep (E4) faqat DB-yozuvni yopadi
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.subtype ? { subtype: opts.subtype } : {}),
    ...priceWhere,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { desc: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.classifiedAd.findMany({
      where,
      include: { photos: { select: { id: true }, take: 1 } },
      orderBy: [{ isTop: "desc" }, { createdAt: "desc" }],
      take,
      skip,
    }),
    skip > 0 ? prisma.classifiedAd.count({ where }) : Promise.resolve(0),
  ]);
  return { ads: rows.map(toCard), total: skip > 0 ? total : skip + rows.length };
}

async function ownerProfile(tgId: bigint): Promise<ClassifiedOwnerProfile> {
  const [tu, soldAds] = await Promise.all([
    prisma.telegramUser.findUnique({ where: { id: tgId.toString() }, select: { createdAt: true, username: true, member: { select: { trips: true } } } }),
    prisma.classifiedAd.findMany({ where: { tgId, status: "sold" }, select: { id: true } }),
  ]);
  const rideCount = tu?.member?.trips ?? 0;
  const soldIds = soldAds.map((a) => a.id);
  const contacted = soldIds.length
    ? await prisma.adContact.groupBy({ by: ["adId"], where: { adId: { in: soldIds } } })
    : [];
  const soldCount = new Set(contacted.map((c) => c.adId)).size;
  const activeAdsCount = await prisma.classifiedAd.count({ where: { tgId, status: "active" } });
  const memberSince = tu?.createdAt?.toISOString() ?? null;
  const daysSince = tu?.createdAt ? (Date.now() - tu.createdAt.getTime()) / 86400_000 : 999;
  return { memberSince, rideCount, soldCount, isNewMember: daysSince < 7 && rideCount === 0, activeAdsCount, username: tu?.username ?? null };
}

export async function getAd(id: number, tgId: string | null, preview = false): Promise<ClassifiedDetail | null> {
  if (!(await elonlarOn(preview))) return null;
  const a = await prisma.classifiedAd.findUnique({ where: { id }, include: { photos: { select: { id: true } } } });
  if (!a || a.status !== "active") return null;
  // AdView upsert — fire-and-forget, never blocks the render (§4/§6.1)
  if (tgId) {
    void prisma.adView.upsert({
      where: { adId_tgId: { adId: id, tgId: BigInt(tgId) } },
      update: { at: new Date() },
      create: { adId: id, tgId: BigInt(tgId) },
    }).catch(() => undefined);
    void prisma.classifiedAd.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  }
  const [owner, reactionGroups, mine] = await Promise.all([
    ownerProfile(a.tgId),
    prisma.adReaction.groupBy({ by: ["kind"], where: { adId: id }, _count: true }),
    tgId ? prisma.adReaction.findUnique({ where: { adId_tgId: { adId: id, tgId: BigInt(tgId) } }, select: { kind: true } }) : Promise.resolve(null),
  ]);
  const likeCount = reactionGroups.find((g) => g.kind === "like")?._count ?? 0;
  const dislikeCount = reactionGroups.find((g) => g.kind === "dislike")?._count ?? 0;
  return {
    ...toCard(a),
    desc: a.desc,
    phone: a.phone,
    authorName: a.authorName,
    viewCount: a.viewCount + (tgId ? 1 : 0),
    callCount: a.callCount,
    owner,
    likeCount,
    dislikeCount,
    myReaction: (mine?.kind as "like" | "dislike" | undefined) ?? null,
  };
}

/** 👍👎 rider reaksiyasi — like bitta tegish, dislike izoh talab qiladi (egasiga foydali signal).
 *  Bir xil kind qayta bosilsa reaksiya OLIB TASHLANADI (toggle-off); boshqa kind bosilsa almashadi. */
export async function submitReaction(
  tgId: string,
  authorName: string,
  adId: number,
  body: ClassifiedReactBody,
  preview = false,
): Promise<ClassifiedReactResponse> {
  if (!(await elonlarOn(preview))) return { ok: false, reason: "off" };
  if (body.kind !== "like" && body.kind !== "dislike") return { ok: false, reason: "bad_kind" };
  const a = await prisma.classifiedAd.findUnique({ where: { id: adId }, select: { id: true, status: true } });
  if (!a || a.status !== "active") return { ok: false, reason: "not_found" };

  const comment = (body.comment ?? "").trim().slice(0, 300);
  const existing = await prisma.adReaction.findUnique({ where: { adId_tgId: { adId, tgId: BigInt(tgId) } } });
  const willRemove = existing && existing.kind === body.kind;
  // comment only required when a dislike is being CREATED/CHANGED-TO — not when toggling an
  // existing dislike OFF (that's a plain removal, no new reason needed).
  if (!willRemove && body.kind === "dislike") {
    if (comment.length < 3) return { ok: false, reason: "need_comment" };
    if (hasBannedWord(comment)) return { ok: false, reason: "banned_word" };
  }

  if (willRemove) {
    await prisma.adReaction.delete({ where: { id: existing!.id } });
  } else {
    await prisma.adReaction.upsert({
      where: { adId_tgId: { adId, tgId: BigInt(tgId) } },
      update: { kind: body.kind, comment: body.kind === "dislike" ? comment : "", authorName: authorName.slice(0, 60) },
      create: { adId, tgId: BigInt(tgId), authorName: authorName.slice(0, 60), kind: body.kind, comment: body.kind === "dislike" ? comment : "" },
    });
  }
  const groups = await prisma.adReaction.groupBy({ by: ["kind"], where: { adId }, _count: true });
  const likeCount = groups.find((g) => g.kind === "like")?._count ?? 0;
  const dislikeCount = groups.find((g) => g.kind === "dislike")?._count ?? 0;
  const mine = await prisma.adReaction.findUnique({ where: { adId_tgId: { adId, tgId: BigInt(tgId) } }, select: { kind: true } });
  return { ok: true, likeCount, dislikeCount, myReaction: (mine?.kind as "like" | "dislike" | undefined) ?? null };
}

/** 📞/✍️ bosilganda log — fire-and-forget, soxtalab bo'lmaydi (server-side, §4). */
export async function logContact(adId: number, tgId: string, viewerName: string, kind: "call" | "message", preview = false): Promise<{ ok: boolean }> {
  if (!(await elonlarOn(preview))) return { ok: false };
  await prisma.adContact.create({ data: { adId, tgId: BigInt(tgId), viewerName: viewerName.slice(0, 60), kind } });
  await prisma.classifiedAd.updateMany({ where: { id: adId }, data: { callCount: { increment: 1 } } });
  return { ok: true };
}

// ── submit (3-tap wizard, §4) ───────────────────────────────────────────────────────────────────

export interface ClassifiedOwnerNotice {
  adId: number;
  title: string;
  categoryLabel: string;
  priceSom: number | null;
  phone: string;
  submitterName: string;
}

export async function submitAd(
  tgId: string,
  memberId: number,
  authorName: string,
  memberPhone: string | null,
  body: ClassifiedSubmitBody,
  preview = false,
): Promise<ClassifiedSubmitResponse & { notice?: ClassifiedOwnerNotice }> {
  if (!(await elonlarOn(preview))) return { ok: false, reason: "off" };
  const cat = classifiedCategoryDef(body.category);
  if (!cat) return { ok: false, reason: "bad_category" };
  if (!cat.subtypes.includes(body.subtype)) return { ok: false, reason: "bad_subtype" };
  const title = (body.title ?? "").trim().slice(0, 80);
  if (title.length < 3) return { ok: false, reason: "bad_title" };
  const desc = (body.desc ?? "").trim().slice(0, 500);
  if (hasBannedWord(title) || hasBannedWord(desc)) return { ok: false, reason: "banned_word" };
  let priceSom: number | null = null;
  if (cat.priced && body.priceSom != null) {
    const p = Math.floor(Number(body.priceSom));
    if (!Number.isFinite(p) || p < 0) return { ok: false, reason: "bad_price" };
    priceSom = p > 0 ? Math.min(p, 5_000_000_000) : null; // 0/omitted = "Kelishiladi"
  }
  const phone = body.phone ? normalizeUzPhone(body.phone) : (memberPhone ? normalizeUzPhone(memberPhone) : null);
  if (!phone) return { ok: false, reason: "no_phone" };

  const econ = await getBonusEcon();
  const maxActive = Math.max(1, Math.floor(econ.elonMaxActive ?? 3));
  const openCount = await prisma.classifiedAd.count({ where: { tgId: BigInt(tgId), status: { in: ["pending", "active"] } } });
  if (openCount >= maxActive) return { ok: false, reason: "max_active" };

  // Yo'qoldi–Topildi DOIM bepul (community-good, viral, §6) — knobdan qat'i nazar.
  const price = cat.id === "yoqoldi" ? 0 : Math.max(0, Math.floor(econ.elonPostPrice ?? 0));
  const expiresAt = new Date(Date.now() + CLASSIFIED_AD_DAYS * 86400_000);

  return withMemberLock(memberId, async () => {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const ad = await tx.classifiedAd.create({
          data: {
            tgId: BigInt(tgId), authorName: authorName.slice(0, 60), category: cat.id, subtype: body.subtype,
            title, desc, priceSom: cat.priced ? priceSom : null, phone, expiresAt,
          },
        });
        if (price > 0) {
          const paid = await tx.member.updateMany({ where: { id: memberId, coins: { gte: price } }, data: { coins: { decrement: price } } });
          if (paid.count === 0) throw new Error("INSUFFICIENT");
          await tx.coinTxn.create({
            data: { memberId, amount: -price, kind: "elon_post", reason: `📋 E'lon joylash: «${title}» (#${ad.id})`, idempotencyKey: `elon_post_${ad.id}` },
          });
          await tx.classifiedAd.update({ where: { id: ad.id }, data: { paidCoins: price } });
        }
        return ad;
      });
      const balance = (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0;
      return {
        ok: true as const, id: created.id, paidCoins: price, balance,
        notice: { adId: created.id, title, categoryLabel: cat.label, priceSom: cat.priced ? priceSom : null, phone, submitterName: authorName },
      };
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false as const, reason: "insufficient" as const };
      throw e;
    }
  });
}

export async function myAds(tgId: string): Promise<MyClassifiedRow[]> {
  const rows = await prisma.classifiedAd.findMany({ where: { tgId: BigInt(tgId) }, orderBy: { id: "desc" }, take: 50 });
  return rows.map((a) => ({
    id: a.id, category: a.category as MyClassifiedRow["category"], subtype: a.subtype, title: a.title,
    priceSom: a.priceSom, status: a.status as MyClassifiedRow["status"], viewCount: a.viewCount, callCount: a.callCount,
    paidCoins: a.paidCoins, isTop: a.isTop && !!a.topUntil && a.topUntil > new Date(), topUntil: a.topUntil?.toISOString() ?? null,
    expiresAt: a.expiresAt.toISOString(), createdAt: a.createdAt.toISOString(),
  }));
}

/** ✅ Sotildi — egasi bosadi (§7 "chirigan doska" himoyasi). Faqat active'dan. */
export async function markSold(tgId: string, adId: number): Promise<{ ok: boolean }> {
  const r = await prisma.classifiedAd.updateMany({ where: { id: adId, tgId: BigInt(tgId), status: "active" }, data: { status: "sold" } });
  return { ok: r.count > 0 };
}

/** 🔄 Qayta faollashtirish — muddati o'tganda 1 bosim (§4). Qayta to'lov YO'Q (bir marta tasdiqlangan
 *  e'lonni qayta moderatsiya qilish shart emas) — faqat expiresAt yangilanadi. */
export async function reactivateAd(tgId: string, adId: number): Promise<{ ok: boolean }> {
  const r = await prisma.classifiedAd.updateMany({
    where: { id: adId, tgId: BigInt(tgId), status: "expired" },
    data: { status: "active", expiresAt: new Date(Date.now() + CLASSIFIED_AD_DAYS * 86400_000) },
  });
  return { ok: r.count > 0 };
}

export async function deleteAd(tgId: string, adId: number): Promise<{ ok: boolean }> {
  const r = await prisma.classifiedAd.updateMany({ where: { id: adId, tgId: BigInt(tgId), status: { not: "sold" } }, data: { status: "archived" } });
  return { ok: r.count > 0 };
}

// ── Admin CRUD (panel-side edit/delete — approve/reject stays Telegram-first, but admin can now
// fix a bad title/phone/category directly, or remove a listing outright, without a raw DB script). ──

export interface AdminAdPatch {
  title?: string;
  desc?: string;
  category?: string;
  subtype?: string;
  priceSom?: number | null;
  phone?: string;
  status?: string;
}

export async function adminEditAd(id: number, b: AdminAdPatch): Promise<{ ok: boolean; error?: string }> {
  const data: Record<string, unknown> = {};
  if (typeof b.title === "string") {
    const t = b.title.trim().slice(0, 80);
    if (t.length < 3) return { ok: false, error: "bad_title" };
    data.title = t;
  }
  if (typeof b.desc === "string") data.desc = b.desc.trim().slice(0, 500);
  if (b.category !== undefined || b.subtype !== undefined) {
    const cur = await prisma.classifiedAd.findUnique({ where: { id }, select: { category: true, subtype: true } });
    if (!cur) return { ok: false, error: "not_found" };
    const cat = classifiedCategoryDef(b.category ?? cur.category);
    if (!cat) return { ok: false, error: "bad_category" };
    const subtype = b.subtype ?? cur.subtype;
    if (!cat.subtypes.includes(subtype)) return { ok: false, error: "bad_subtype" };
    data.category = cat.id;
    data.subtype = subtype;
  }
  if (b.priceSom !== undefined) {
    if (b.priceSom === null) data.priceSom = null;
    else {
      const p = Math.floor(Number(b.priceSom));
      if (!Number.isFinite(p) || p < 0) return { ok: false, error: "bad_price" };
      data.priceSom = p > 0 ? Math.min(p, 5_000_000_000) : null;
    }
  }
  if (typeof b.phone === "string") {
    const p = normalizeUzPhone(b.phone);
    if (!p) return { ok: false, error: "bad_phone" };
    data.phone = p;
  }
  if (typeof b.status === "string" && ["pending", "active", "sold", "rejected", "archived", "expired"].includes(b.status)) data.status = b.status;
  if (Object.keys(data).length === 0) return { ok: true }; // nothing to change
  await prisma.classifiedAd.update({ where: { id }, data }).catch(() => undefined);
  return { ok: true };
}

/** Hard delete — for spam/test/mis-imported rows. Everything else in this file only soft-archives;
 *  this is the one true removal, admin-only. AdPhoto cascades via FK; AdView/AdContact have no FK
 *  (adId is a plain int) so they're cleared explicitly to avoid orphaned analytics rows. */
export async function adminDeleteAd(id: number): Promise<{ ok: boolean }> {
  await prisma.$transaction([
    prisma.adView.deleteMany({ where: { adId: id } }),
    prisma.adContact.deleteMany({ where: { adId: id } }),
    prisma.classifiedAd.delete({ where: { id } }),
  ]).catch(() => undefined);
  return { ok: true };
}

export async function adminClearAdPhotos(adId: number): Promise<{ ok: boolean }> {
  await prisma.adPhoto.deleteMany({ where: { adId } });
  return { ok: true };
}

export interface AdminAdCreate {
  title: string;
  desc?: string;
  category: string;
  subtype: string;
  priceSom?: number | null;
  phone: string;
  authorName?: string;
  ownerTgId?: string; // bo'sh = 1-admin akkaunt (shop/xizmatlar "darhol aktiv" naqshi)
}

/** Admin/operator: panel'dan to'g'ridan-to'g'ri e'lon qo'shish (xizmatlar/do'kon naqshi) —
 *  moderatsiyasiz, darhol "active". Mijoz telefon qilib/kelib e'lon berganda, lekin o'zi
 *  bot/miniapp ishlatolmaganda operator shu yerdan kiritadi.
 *
 *  Egalik: agar `ownerTgId` berilmasa, kiritilgan TELEFON RAQAM orqali botda mavjud a'zo
 *  qidiriladi (Member.phone → TelegramUser) — topilsa e'lon O'SHA mijozning akkountiga
 *  bog'lanadi (keyin "Mening e'lonlarim"da o'zi ko'radi/boshqaradi). Topilmasa 1-admin
 *  akkauntga bog'lanadi (raw DB skript o'rniga bo'lgan zaxira yo'l). */
export async function adminCreateAd(b: AdminAdCreate): Promise<{ ok: boolean; id?: number; error?: string; ownerMatched?: boolean; ownerName?: string }> {
  const cat = classifiedCategoryDef(b.category);
  if (!cat) return { ok: false, error: "bad_category" };
  if (!cat.subtypes.includes(b.subtype)) return { ok: false, error: "bad_subtype" };
  const title = (b.title ?? "").trim().slice(0, 80);
  if (title.length < 3) return { ok: false, error: "bad_title" };
  const phone = normalizeUzPhone(b.phone ?? "");
  if (!phone) return { ok: false, error: "bad_phone" };
  let priceSom: number | null = null;
  if (cat.priced && b.priceSom != null) {
    const p = Math.floor(Number(b.priceSom));
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: "bad_price" };
    priceSom = p > 0 ? Math.min(p, 5_000_000_000) : null;
  }

  let ownerTgId = b.ownerTgId?.trim() || "";
  let ownerMatched = false;
  let matchedName: string | undefined;
  if (!ownerTgId) {
    // Member.phone kas1067 sync'dan xom holda keladi ("+" siz) — ClassifiedAd.phone kabi hamma
    // vaqt normalized emas, shuning uchun oxirgi 9 raqam bo'yicha moslashtiramiz (formatga bog'liq emas).
    const last9 = phone.slice(-9);
    const member = await prisma.member.findFirst({
      where: { phone: { endsWith: last9 }, telegramUser: { isNot: null } },
      select: { displayName: true, fullName: true, telegramUser: { select: { id: true } } },
    });
    if (member?.telegramUser?.id) {
      ownerTgId = member.telegramUser.id;
      ownerMatched = true;
      matchedName = member.displayName || member.fullName;
    }
  }
  if (!ownerTgId) {
    const { env } = await import("../env");
    ownerTgId = env.adminIds.find((id) => id.trim() !== "") || "";
  }
  if (!ownerTgId) return { ok: false, error: "no_owner" };

  const ad = await prisma.classifiedAd.create({
    data: {
      tgId: BigInt(ownerTgId), authorName: (b.authorName ?? matchedName ?? "Admin").slice(0, 60), category: cat.id, subtype: b.subtype,
      title, desc: (b.desc ?? "").trim().slice(0, 500), priceSom: cat.priced ? priceSom : null, phone,
      status: "active", expiresAt: new Date(Date.now() + CLASSIFIED_AD_DAYS * 86400_000),
    },
  });
  return { ok: true, id: ad.id, ownerMatched, ownerName: matchedName };
}

// ── E4: TOP boost (tanga-sink, §6) — rider o'z aktiv e'lonini 24 soatga TOP qiladi ────────────────

/** ⭐ TOP sotib olish — bitta $transaction (shop.ts naqshi): shartli tanga-yechish + CoinTxn +
 *  isTop/topUntil yangilash. idempotencyKey KUNGA bog'liq (`elon_top_<adId>_<YYYY-MM-DD>`) — bir
 *  kunda takror bosish idempotent no-op, ERTAGA qayta xarid qilish esa YANGI kun = yangi to'lov. */
export async function buyTopBoost(tgId: string, memberId: number, adId: number, preview = false): Promise<ClassifiedTopBuyResponse> {
  if (!(await elonlarOn(preview))) return { ok: false, reason: "off" };
  if (!(preview || (await featureOn("elontop")))) return { ok: false, reason: "elontop_off" };
  const a = await prisma.classifiedAd.findUnique({ where: { id: adId } });
  if (!a) return { ok: false, reason: "not_found" };
  if (a.tgId.toString() !== tgId) return { ok: false, reason: "not_owner" };
  if (a.status !== "active") return { ok: false, reason: "not_active" };

  const econ = await getBonusEcon();
  const price = Math.max(0, Math.floor(econ.elonTopPrice ?? 2000));
  const day = new Date().toISOString().slice(0, 10); // Tashkent-yaqin kunlik granularity — bitta kun ichida takror-xavfsiz
  const key = `elon_top_${adId}_${day}`;
  const topUntil = new Date(Date.now() + TOP_HOURS * 3600_000);

  return withMemberLock(memberId, async () => {
    const existing = await prisma.coinTxn.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      await prisma.classifiedAd.update({ where: { id: adId }, data: { isTop: true, topUntil } }); // shu kun ichidagi takror — TOP muddatini yangilaydi, pul yechilmaydi
      return { ok: true, topUntil: topUntil.toISOString(), balance: (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0 };
    }
    if (price === 0) {
      await prisma.classifiedAd.update({ where: { id: adId }, data: { isTop: true, topUntil } });
      return { ok: true, topUntil: topUntil.toISOString(), balance: (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0 };
    }
    try {
      await prisma.$transaction(async (tx) => {
        const paid = await tx.member.updateMany({ where: { id: memberId, coins: { gte: price } }, data: { coins: { decrement: price } } });
        if (paid.count === 0) throw new Error("INSUFFICIENT");
        await tx.coinTxn.create({ data: { memberId, amount: -price, kind: "elon_top", reason: `📌 TOP boost: «${a.title}» (#${adId})`, idempotencyKey: key } });
        await tx.classifiedAd.update({ where: { id: adId }, data: { isTop: true, topUntil } });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT") return { ok: false as const, reason: "insufficient" as const };
      throw e;
    }
    const balance = (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0;
    return { ok: true as const, topUntil: topUntil.toISOString(), balance };
  });
}

// ── owner decisions (E3 admin/Telegram UI wraps these — service-level only in E2) ────────────────

export interface ClassifiedDecision { ok: boolean; reason?: string; tgId?: string; title?: string }

/** ✅ admin approve — pending → active. Status guard = double-tap no-op (shop/services pattern). */
export async function approveAd(adId: number): Promise<ClassifiedDecision> {
  const a = await prisma.classifiedAd.findUnique({ where: { id: adId } });
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status !== "pending") return { ok: false, reason: a.status };
  await prisma.classifiedAd.update({ where: { id: adId }, data: { status: "active" } });
  return { ok: true, tgId: a.tgId.toString(), title: a.title };
}

/** ❌ admin reject — refund (exactly once via elon_refund_<id>). Status guard makes a double-tap and
 *  an approve→reject race no-op: the first decision wins, the refund key physically can't double-pay. */
export async function rejectAd(adId: number, note?: string): Promise<ClassifiedDecision> {
  const a = await prisma.classifiedAd.findUnique({ where: { id: adId } });
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status !== "pending") return { ok: false, reason: a.status };
  await prisma.classifiedAd.update({ where: { id: adId }, data: { status: "rejected" } });
  if (a.paidCoins > 0) {
    const memberId = await (await import("./memberService")).getMemberId(a.tgId.toString());
    if (memberId) {
      const refund = await grantCoins(memberId, a.paidCoins, "elon_refund", `📋 «${a.title}» rad etildi — tanga qaytarildi${note ? `: ${note}` : ""}`, `elon_refund_${adId}`);
      if (!refund.ok && refund.skipped !== "duplicate") {
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`⚠️ E'lon refund FAILED: ad #${adId}, m${memberId}, ${a.paidCoins} tanga — qo'lda tekshiring.`).catch(() => undefined);
      }
    }
  }
  return { ok: true, tgId: a.tgId.toString(), title: a.title };
}

/** 🚩 community report — 1 report per user per ad (AppState marker, services pattern); 3rd report
 *  pulls the ad OFF the public board and back into the moderation queue (status→pending) for the
 *  owner to re-review — no separate "hidden" status needed, listAds already only shows `active`. */
export async function reportAd(adId: number, tgId: string, preview = false): Promise<ClassifiedReportResponse> {
  if (!(await elonlarOn(preview))) return { ok: false };
  try {
    await prisma.appState.create({ data: { key: `elonrep:${adId}:${tgId}`, value: "1" } });
  } catch {
    return { ok: true }; // already reported by this user — silent no-op
  }
  const a = await prisma.classifiedAd.update({ where: { id: adId }, data: { reports: { increment: 1 } } }).catch(() => null);
  if (!a) return { ok: false };
  if (a.reports >= REPORTS_TO_HIDE && a.status === "active") {
    await prisma.classifiedAd.update({ where: { id: adId }, data: { status: "pending" } });
    return { ok: true, hidden: true };
  }
  return { ok: true };
}

// ── E3: admin nazorat (moderatsiya navbati + e'lonlar jadvali, §5) ───────────────────────────────

async function ownerInfo(tgId: bigint): Promise<{ name: string; phone: string | null; activeAdsCount: number }> {
  const [tu, activeAdsCount] = await Promise.all([
    prisma.telegramUser.findUnique({ where: { id: tgId.toString() }, select: { member: { select: { displayName: true, fullName: true, phone: true } } } }),
    prisma.classifiedAd.count({ where: { tgId, status: "active" } }),
  ]);
  const m = tu?.member;
  return { name: m?.displayName || m?.fullName || `tg${tgId}`, phone: m?.phone ?? null, activeAdsCount };
}

export async function adminListAds(status?: string): Promise<AdminClassifiedListResponse> {
  const rows = await prisma.classifiedAd.findMany({
    where: status ? { status } : undefined,
    include: { photos: { select: { id: true } } },
    orderBy: { id: "desc" },
    take: 300,
  });
  const ownerCache = new Map<string, { name: string; phone: string | null; activeAdsCount: number }>();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [pending, active, todayViews, todayPaid, reactionGroups] = await Promise.all([
    prisma.classifiedAd.count({ where: { status: "pending" } }),
    prisma.classifiedAd.count({ where: { status: "active" } }),
    prisma.adView.count({ where: { at: { gte: dayStart } } }),
    prisma.classifiedAd.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: { paidCoins: true } }),
    prisma.adReaction.groupBy({ by: ["adId", "kind"], where: { adId: { in: rows.map((a) => a.id) } }, _count: true }),
  ]);
  const reactionCounts = new Map<number, { like: number; dislike: number }>();
  for (const g of reactionGroups) {
    const cur = reactionCounts.get(g.adId) ?? { like: 0, dislike: 0 };
    if (g.kind === "like") cur.like = g._count;
    else if (g.kind === "dislike") cur.dislike = g._count;
    reactionCounts.set(g.adId, cur);
  }
  const out: AdminClassifiedRow[] = [];
  for (const a of rows) {
    const key = a.tgId.toString();
    if (!ownerCache.has(key)) ownerCache.set(key, await ownerInfo(a.tgId));
    const owner = ownerCache.get(key)!;
    const rc = reactionCounts.get(a.id) ?? { like: 0, dislike: 0 };
    out.push({
      id: a.id, category: a.category as AdminClassifiedRow["category"], subtype: a.subtype, title: a.title,
      desc: a.desc, phone: a.phone,
      priceSom: a.priceSom, status: a.status as AdminClassifiedRow["status"], paidCoins: a.paidCoins,
      hasPhoto: a.photos.length > 0, photoCount: a.photos.length, viewCount: a.viewCount, contactCount: a.callCount,
      likeCount: rc.like, dislikeCount: rc.dislike,
      reports: a.reports, owner: { tgId: key, name: owner.name, phone: owner.phone, activeAdsCount: owner.activeAdsCount },
      createdAt: a.createdAt.toISOString(), expiresAt: a.expiresAt.toISOString(),
      pendingMinutes: a.status === "pending" ? Math.round((Date.now() - a.createdAt.getTime()) / 60_000) : null,
      isTop: a.isTop && !!a.topUntil && a.topUntil > new Date(), topUntil: a.topUntil?.toISOString() ?? null,
    });
  }
  return { rows: out, pending, active, todayViews, todayCoins: todayPaid._sum.paidCoins ?? 0 };
}

export async function adminAdReactions(adId: number): Promise<AdminAdReactionRow[]> {
  const rows = await prisma.adReaction.findMany({ where: { adId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({ id: r.id, tgId: r.tgId.toString(), authorName: r.authorName, kind: r.kind as "like" | "dislike", comment: r.comment, at: r.createdAt.toISOString() }));
}

export async function adminAdViewers(adId: number): Promise<AdminAdViewerRow[]> {
  const rows = await prisma.adView.findMany({ where: { adId }, orderBy: { at: "desc" }, take: 100 });
  if (!rows.length) return [];
  const members = await prisma.telegramUser.findMany({
    where: { id: { in: rows.map((r) => r.tgId.toString()) } },
    select: { id: true, member: { select: { displayName: true, fullName: true } } },
  });
  const nameOf = new Map(members.map((m) => [m.id, m.member?.displayName || m.member?.fullName || `tg${m.id}`]));
  return rows.map((r) => ({ tgId: r.tgId.toString(), name: nameOf.get(r.tgId.toString()) ?? r.viewerName ?? `tg${r.tgId}`, at: r.at.toISOString() }));
}

export async function adminAdContacts(adId: number): Promise<AdminAdContactRow[]> {
  const rows = await prisma.adContact.findMany({ where: { adId }, orderBy: { at: "desc" }, take: 100 });
  if (!rows.length) return [];
  const members = await prisma.telegramUser.findMany({
    where: { id: { in: rows.map((r) => r.tgId.toString()) } },
    select: { id: true, member: { select: { displayName: true, fullName: true } } },
  });
  const nameOf = new Map(members.map((m) => [m.id, m.member?.displayName || m.member?.fullName || `tg${m.id}`]));
  return rows.map((r) => ({ tgId: r.tgId.toString(), name: nameOf.get(r.tgId.toString()) ?? r.viewerName ?? `tg${r.tgId}`, kind: r.kind as "call" | "message", at: r.at.toISOString() }));
}

/** Admin: arxivla (istalgan holatdan, "sold" ham) — o'chirish emas, ko'rinishdan olib tashlaydi. */
export async function adminArchiveAd(adId: number): Promise<{ ok: boolean }> {
  const r = await prisma.classifiedAd.updateMany({ where: { id: adId }, data: { status: "archived" } });
  return { ok: r.count > 0 };
}

/** Admin: muddat uzayt — +N kun (default 30). */
export async function adminExtendAd(adId: number, days = CLASSIFIED_AD_DAYS): Promise<{ ok: boolean }> {
  const a = await prisma.classifiedAd.findUnique({ where: { id: adId }, select: { expiresAt: true } });
  if (!a) return { ok: false };
  const base = a.expiresAt > new Date() ? a.expiresAt : new Date();
  await prisma.classifiedAd.update({ where: { id: adId }, data: { expiresAt: new Date(base.getTime() + days * 86400_000), status: "active" } });
  return { ok: true };
}

/** Admin: TOP ber/olib tashla — owner-discretion comp (pullik xarid E4 qamrovi, alohida). */
export async function adminSetTop(adId: number, on: boolean, hours = 24): Promise<{ ok: boolean }> {
  await prisma.classifiedAd.update({ where: { id: adId }, data: { isTop: on, topUntil: on ? new Date(Date.now() + hours * 3600_000) : null } }).catch(() => undefined);
  return { ok: true };
}

/** §5 SLA eslatma: 2 soatdan ortiq javobsiz pending bo'lsa ownerga bitta jamlangan push — piggyback
 *  the existing 15-min index.ts timer (CLAUDE.md invariant: yangi poller yo'q). O'zini kamida
 *  SLA_HOURS oraliqda 1 marta yuboradi (AppState marker) — har 15 daqiqada spam qilmaydi. */
export async function elonlarSlaTick(): Promise<void> {
  const cutoff = new Date(Date.now() - SLA_HOURS * 3600_000);
  const stale = await prisma.classifiedAd.count({ where: { status: "pending", createdAt: { lt: cutoff } } });
  if (stale === 0) return;
  const marker = await prisma.appState.findUnique({ where: { key: "elonlar:slasent" } });
  const lastSent = marker ? Number(marker.value) || 0 : 0;
  if (Date.now() - lastSent < SLA_HOURS * 3600_000) return; // throttle — bitta davrda bitta push
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(`📋 <b>E'lonlar navbati:</b> ${stale} ta e'lon ${SLA_HOURS} soatdan ortiq moderatsiyada kutmoqda.`).catch(() => undefined);
  await prisma.appState.upsert({ where: { key: "elonlar:slasent" }, create: { key: "elonlar:slasent", value: String(Date.now()) }, update: { value: String(Date.now()) } });
}

// ── E4: §7 muddat tugashi (YANGI POLLER YO'Q — mavjud 15-daq index.ts tick'iga qo'shiladi) ────────

/** (a) active→expired batch (lazy-filter §7(a) listAds'da allaqachon bor — bu yerda faqat DB-yozuv
 *  yopiladi, real-time'ga ta'sir qilmaydi). (b) 2-kun-oldin "tugayapti" push (1 marta/e'lon, marker).
 *  (c) 3-kunlik "sotildimi?" push (1 marta/e'lon, [✅ Faol qolsin]/[❌ Sotildi] inline). TEST_DATABASE_URL
 *  bilan to'liq izolyatsiyada sinaladi — kas/booking holatiga bog'liq emas, memberScope kerak emas. */
export async function elonlarLifecycleTick(bot?: Bot): Promise<{ expired: number; warned: number; soldChecked: number }> {
  const now = new Date();
  const expiredRes = await prisma.classifiedAd.updateMany({ where: { status: "active", expiresAt: { lt: now } }, data: { status: "expired" } });

  let warned = 0;
  const nearExpiry = await prisma.classifiedAd.findMany({
    where: { status: "active", expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRY_WARN_DAYS * 86400_000) } },
    select: { id: true, tgId: true, title: true },
  });
  for (const a of nearExpiry) {
    try {
      await prisma.appState.create({ data: { key: `elonexpwarn:${a.id}`, value: "1" } });
    } catch {
      continue; // allaqachon ogohlantirilgan
    }
    if (bot) {
      const { pushMessage } = await import("./pushSend"); // 📵 BLK-1
      await pushMessage(bot, a.tgId.toString(), "elon_expiry", `⏳ <b>E'loningiz tugayapti!</b>\n📋 ${a.title}\n\n«Mening e'lonlarim»dan 🔄 qayta faollashtirishingiz mumkin.`);
    }
    warned++;
  }

  let soldChecked = 0;
  const soldCheckCutoff = new Date(now.getTime() - SOLD_CHECK_DAYS * 86400_000);
  const soldCandidates = await prisma.classifiedAd.findMany({
    where: { status: "active", createdAt: { lte: soldCheckCutoff } },
    select: { id: true, tgId: true, title: true },
  });
  for (const a of soldCandidates) {
    try {
      await prisma.appState.create({ data: { key: `elonsoldcheck:${a.id}`, value: "1" } });
    } catch {
      continue; // allaqachon so'ralgan (bir martalik 1-tap, §7)
    }
    if (bot) {
      const { InlineKeyboard } = await import("grammy");
      const kb = new InlineKeyboard().text("✅ Faol qolsin", `elonlar:keep:${a.id}`).text("❌ Sotildi", `elonlar:sold:${a.id}`);
      const { pushMessage } = await import("./pushSend"); // 📵 BLK-1
      await pushMessage(bot, a.tgId.toString(), "elon_soldcheck", `🤔 <b>Hali sotilmadimi?</b>\n📋 ${a.title}\n\nAgar sotilgan bo'lsa yoping — xaridorlar bekorga qo'ng'iroq qilmasin.`, { extra: { reply_markup: kb } });
    }
    soldChecked++;
  }

  return { expired: expiredRes.count, warned, soldChecked };
}

// ── photos (ProductPhoto/ServicePhoto pattern: Telegram file_id = free durable storage) ──────────

async function tgUploadAdPhoto(buf: Buffer, mime: string, caption: string): Promise<{ fileId: string | null; thumbFileId: string | null }> {
  const { env } = await import("../env");
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  if (!env.BOT_TOKEN || !adminId) return { fileId: null, thumbFileId: null };
  try {
    const form = new FormData();
    form.append("chat_id", adminId);
    form.append("photo", new Blob([buf], { type: mime }), "ad.jpg");
    form.append("caption", caption);
    form.append("disable_notification", "true");
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
    const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string; width: number }[] } };
    const sizes = data.ok ? (data.result?.photo ?? []) : [];
    if (!sizes.length) return { fileId: null, thumbFileId: null };
    const full = sizes[sizes.length - 1]!;
    const thumb = sizes.find((s) => s.width >= 280) ?? full;
    return { fileId: full.file_id, thumbFileId: thumb.file_id === full.file_id ? null : thumb.file_id };
  } catch {
    return { fileId: null, thumbFileId: null };
  }
}

export async function uploadAdPhoto(adId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean; error?: string; photoCount?: number }> {
  const existing = await prisma.adPhoto.count({ where: { adId } });
  if (existing >= CLASSIFIED_MAX_PHOTOS) return { ok: false, error: "max_photos" };
  const { fileId, thumbFileId } = await tgUploadAdPhoto(buf, mime, `📋 Ad photo · #${adId}`);
  const url = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.adPhoto.create({ data: { adId, fileId, thumbFileId, url, sortOrder: existing } });
  return { ok: true, photoCount: existing + 1 };
}

export async function resolveAdPhoto(adId: number, idx = 0, small = false): Promise<string | null> {
  const photos = await prisma.adPhoto.findMany({ where: { adId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const pick = photos[idx];
  if (!pick) return null;
  if (pick.url) return pick.url;
  const fid = (small && pick.thumbFileId) || pick.fileId;
  if (!fid) return null;
  const { resolveTelegramFileUrl } = await import("./driverPhotoService");
  return resolveTelegramFileUrl(fid);
}

/** TEST-ONLY: no in-memory cache in this service (knobs/flags already have their own resets). */
export function __noopResetClassifiedCaches(): void {}
