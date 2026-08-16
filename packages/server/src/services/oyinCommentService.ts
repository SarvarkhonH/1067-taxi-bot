// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 💬 K8 — SOVG'A OSTIDAGI KOMENTARIYA (OYIN_KARTA_PLAN.md §13)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Moderatsiya `classifiedService.ts`dagi `reportAd`/`approveAd`/`rejectAd` naqshi bilan BIR XIL:
// komentariya DARHOL active (oldindan moderatsiya YO'Q — ega tasdig'i 2026-08-16, §13.2), 3-shikoyat
// avto `hidden`ga tushiradi. Shikoyat uchun alohida jadval YO'Q — `oyin:commentrep:<id>:<memberId>`
// AppState marker (`elonrep:` bilan bir xil naqsh). Bloklash ham yangi ustun EMAS —
// `oyin:commentban:<memberId>` bayrog'i (K1-K7 avatar/qayd naqshi, GLOBAL `Member.banned` EMAS).
//
// Kim yoza oladi: ega qarori (2026-08-16) — HAMMA bog'langan a'zo (karta egaligi sharti YO'Q).
// Spam himoyasi uch qatlamli: server.ts'dagi `rateLimit` + 1 komentariya/kishi/sovrin
// (`@@unique([prizeKey, memberId])` — qayta yuborish TAHRIR qiladi, yangi qator ochmaydi) + shikoyat.
//
// Alohida fayl (oyinService.ts ga QO'SHILMAGAN) — u allaqachon 4000+ qator, yana bitta subtizim
// uni yanada og'irlashtirmaydi (ARCHITECTURE.md §5 dagi "add carefully" ogohlantirishi).
import { prisma } from "../db";
import type {
  OyinComment,
  OyinCommentListResponse,
  OyinPostCommentResult,
  OyinReportCommentResult,
  OyinAdminCommentRow,
  OyinAdminCommentListResponse,
  OyinAdminCommentActionResult,
} from "@t1067/shared";
import { ownerNames, getCatalog } from "./oyinService";
import { featureOn } from "./featureFlags";

const TEXT_MAX = 140; // K2 (egasining karta qaydi) bilan bir xil chegara — izchillik
const REPORTS_TO_HIDE = 3; // classifiedService.ts (`REPORTS_TO_HIDE`) bilan BIR XIL — bir xil his

function banKey(memberId: number): string {
  return `oyin:commentban:${memberId}`;
}
export async function isCommentBanned(memberId: number): Promise<boolean> {
  return !!(await prisma.appState.findUnique({ where: { key: banKey(memberId) } }));
}

/** 💬 Sovrin ostidagi ochiq komentariyalar (faqat `active`) + chaqiruvchining o'z matni/holati. */
export async function listComments(prizeKey: string, viewerMemberId: number | null): Promise<OyinCommentListResponse> {
  const [rows, mineRow, banned] = await Promise.all([
    prisma.oyinComment.findMany({ where: { prizeKey, status: "active" }, orderBy: { createdAt: "desc" }, take: 200 }),
    viewerMemberId != null
      ? prisma.oyinComment.findUnique({ where: { prizeKey_memberId: { prizeKey, memberId: viewerMemberId } } })
      : Promise.resolve(null),
    viewerMemberId != null ? isCommentBanned(viewerMemberId) : Promise.resolve(false),
  ]);
  const names = await ownerNames(rows.map((r) => r.memberId));
  const comments: OyinComment[] = rows.map((r) => ({
    id: r.id,
    authorName: names.get(r.memberId) ?? r.authorName.slice(0, 24),
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    mine: viewerMemberId != null && r.memberId === viewerMemberId,
  }));
  // mineRow status "hidden"/"removed" bo'lsa ham matn tahrir maydonini oldindan to'ldiradi —
  // egasi o'z (yashiringan) matnini ko'rishi/tahrirlashi kerak, ro'yxatda ko'rinmasa ham.
  return { prizeKey, comments, myText: mineRow?.text ?? null, banned };
}

/** ✍️ Yozish/tahrirlash. 1 kishi/sovringa BITTA qator — qayta yuborish shu qatorni yangilaydi,
 *  holat (`status`)/shikoyat-hisoblagichga TEGMAYDI (aks holda bitta so'z tuzatish yashiringan
 *  komentariyani jimgina qayta ko'rinadigan qilib qo'yardi — faqat admin `approve` shunga haqli).
 *  `preview` — `buyTicket`/`setGoalPrize` bilan BIR XIL naqsh (`oyinService.ts`dagi 10+ funksiya):
 *  flag "oyin" o'chiq bo'lsa YOZISH rad etiladi (admin `oyinPreviewOf` bilan aylanib o'tadi) —
 *  `listComments`/`deleteOwnComment` esa `getCardDetail`/`cancelOwnTicket` kabi ATAYLAB gate'siz
 *  (o'qish/o'z-o'chirish xavfsiz, dark-feature xavfi faqat YANGI yozuv yaratishda). */
export async function postComment(memberId: number, prizeKey: string, textRaw: string, preview = false): Promise<OyinPostCommentResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  const text = textRaw.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > TEXT_MAX) return { ok: false, reason: "too_long" };
  if (await isCommentBanned(memberId)) return { ok: false, reason: "banned" };
  const existing = await prisma.oyinComment.findUnique({ where: { prizeKey_memberId: { prizeKey, memberId } } });
  if (existing?.status === "removed") return { ok: false, reason: "banned" }; // admin olib tashlagan — qayta yozib bo'lmaydi
  const authorName = (await ownerNames([memberId])).get(memberId) ?? "Mijoz";
  const row = await prisma.oyinComment.upsert({
    where: { prizeKey_memberId: { prizeKey, memberId } },
    create: { prizeKey, memberId, authorName, text, status: "active" },
    update: { text, authorName },
  });
  return { ok: true, comment: { id: row.id, authorName: row.authorName, text: row.text, createdAt: row.createdAt.toISOString(), mine: true } };
}

/** 🗑 Egasi o'z komentariyasini o'chiradi — chin o'chirish (moderatsiya izi EMAS, o'zining matni). */
export async function deleteOwnComment(memberId: number, commentId: number): Promise<{ ok: boolean }> {
  const r = await prisma.oyinComment.deleteMany({ where: { id: commentId, memberId } }); // egalik shart
  return { ok: r.count > 0 };
}

/** 🚩 1 shikoyat/kishi/komentariya (AppState marker, `elonrep:` naqshi); 3-chegara `hidden`ga
 *  tushiradi — ro'yxatdan darhol yo'qoladi, admin navbatiga tushadi. `preview` — `reportAd`
 *  (classifiedService.ts) bilan bir xil naqsh. */
export async function reportComment(commentId: number, memberId: number, preview = false): Promise<OyinReportCommentResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  try {
    await prisma.appState.create({ data: { key: `oyin:commentrep:${commentId}:${memberId}`, value: "1" } });
  } catch {
    return { ok: true }; // shu kishi allaqachon shikoyat qilgan — jim no-op
  }
  const row = await prisma.oyinComment.update({ where: { id: commentId }, data: { reports: { increment: 1 } } }).catch(() => null);
  if (!row) return { ok: false };
  if (row.reports >= REPORTS_TO_HIDE && row.status === "active") {
    await prisma.oyinComment.update({ where: { id: commentId }, data: { status: "hidden" } });
    return { ok: true, hidden: true };
  }
  return { ok: true };
}

// ── 🛡 Admin — moderatsiya navbati ──────────────────────────────────────────────────────────────

/** Standart — faqat `hidden` (shikoyat qilinganlar, ya'ni haqiqiy navbat). `status` berilsa filtr
 *  o'zgaradi (masalan tarixni ko'rish uchun "removed"/"active" ham so'ralishi mumkin). */
export async function adminListComments(status?: string): Promise<OyinAdminCommentListResponse> {
  const rows = await prisma.oyinComment.findMany({
    where: { status: status || "hidden" },
    orderBy: { id: "desc" },
    take: 300,
  });
  const [catalog, bannedRows] = await Promise.all([
    getCatalog(),
    prisma.appState.findMany({ where: { key: { in: [...new Set(rows.map((r) => banKey(r.memberId)))] } }, select: { key: true } }),
  ]);
  const nameByKey = new Map(catalog.map((p) => [p.key, p.name]));
  const bannedSet = new Set(bannedRows.map((b) => b.key));
  const out: OyinAdminCommentRow[] = rows.map((r) => ({
    id: r.id,
    prizeKey: r.prizeKey,
    prizeName: nameByKey.get(r.prizeKey) ?? r.prizeKey,
    memberId: r.memberId,
    authorName: r.authorName,
    text: r.text,
    reports: r.reports,
    status: r.status as "active" | "hidden" | "removed",
    createdAt: r.createdAt.toISOString(),
    banned: bannedSet.has(banKey(r.memberId)),
  }));
  return { rows: out };
}

/** ✅ hidden → active. Shikoyat-hisoblagich ham NOLGA tushadi — aks holda birinchi YANGI shikoyat
 *  darhol yana yashirib qo'yardi (eski 3 ta hisoblanaveradi). Eski `oyin:commentrep:` markerlari
 *  SAQLANADI: xuddi o'sha kishilar qayta shikoyat qila olmaydi — yangi, mustaqil 3 kishi kerak. */
export async function adminApproveComment(id: number): Promise<OyinAdminCommentActionResult> {
  const r = await prisma.oyinComment.updateMany({ where: { id, status: "hidden" }, data: { status: "active", reports: 0 } });
  return { ok: r.count > 0 };
}

/** 🗑 Admin — shikoyat kutmasdan ham. ABADIY: `removed`dan boshqa holatga qaytmaydi, qayta
 *  yozish (`postComment`) ham buni aylanib o'ta olmaydi. */
export async function adminRemoveComment(id: number): Promise<OyinAdminCommentActionResult> {
  const r = await prisma.oyinComment.updateMany({ where: { id, status: { not: "removed" } }, data: { status: "removed" } });
  return { ok: r.count > 0 };
}

/** 🚫 Komentariya huquqidan mahrum qilish — GLOBAL `Member.banned` EMAS (bot/safar/o'yindan
 *  butunlay chetlatmaydi), faqat yangi komentariya yozishdan. Eski komentariyalari qoladi. */
export async function adminSetCommentBan(memberId: number, banned: boolean): Promise<OyinAdminCommentActionResult> {
  const key = banKey(memberId);
  if (banned) await prisma.appState.upsert({ where: { key }, create: { key, value: "1" }, update: { value: "1" } });
  else await prisma.appState.deleteMany({ where: { key } });
  return { ok: true };
}

/** Vital panel/Nazorat uchun — shikoyat qilib navbatga tushgan komentariyalar soni. */
export async function pendingCommentCount(): Promise<number> {
  return prisma.oyinComment.count({ where: { status: "hidden" } });
}
