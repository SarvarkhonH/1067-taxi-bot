// 📸 HIKOYA-ISBOT — mijoz posterni hikoyasiga qo'yadi, havolasini yuboradi, admin tekshiradi,
// tasdiqlangach ball tushadi (HIKOYA_POSTER_PLAN.md, ega talabi 2026-08-02).
//
// Naqsh: sovrin-katalog bilan bir xil — AppState JSON, yangi Prisma model YO'Q.
//   `oyin:story:<memberId>` = { items: [...] }   — bitta mijozning arizalari
//   `oyin:postertext`       = { items: [...] }   — admin sozlagan poster matnlari
//
// ⚠️ Ball BU YERDA berilmaydi. Ball `computeBallMap()` da jonli hisoblanadi (tasdiqlangan va
// mavsum oynasidagi arizalar × knob) — boshqa hamma manba bilan bir xil. Shunda "grant yozildi-yu
// ball ko'rinmadi" degan holat tug'ilmaydi.
import { OYIN_STORY_SEASON_LIMIT, type OyinPosterTemplateKey, type OyinPosterText, type OyinStoryAdminRow, type OyinStoryItem, type OyinStorySubmitResult } from "@t1067/shared";
import { prisma } from "../db";
import { getSeason } from "./oyinSeason";

/** Havolani solishtirish uchun bir ko'rinishga keltirish: sxema/`www`/so'rov/oxirgi `/`
 *  tashlanadi, host kichik harfga tushadi. Aks holda bir xil hikoya to'rt xil URL bo'lardi. */
function normalizeStoryUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch { return raw.trim().toLowerCase(); }
}

const TEXT_KEY = "oyin:postertext";
const STORY_PREFIX = "oyin:story:";

/** Mavsumda eng ko'pi shuncha tasdiqlangan isbot. Cheksiz bo'lsa bitta odam ballni yeb qo'yadi. */
// Yagona manba — `@t1067/shared`. Avval bu yerda alohida `3` turardi va `computeBallMap`
// da ikkinchi qavat himoya qo'yilganda ikkita mustaqil raqam paydo bo'lardi.
const STORY_SEASON_LIMIT = OYIN_STORY_SEASON_LIMIT;
export { OYIN_STORY_SEASON_LIMIT as STORY_SEASON_LIMIT };

// Faqat haqiqiy hikoya joylanadigan platformalar. Tasodifiy matn / o'z saytiga havola o'tmaydi.
const ALLOWED_HOSTS = ["instagram.com", "www.instagram.com", "t.me", "telegram.me", "facebook.com", "www.facebook.com", "fb.watch"];

// ⏳ Ketma-ket ikki hikoya orasidagi eng kam tanaffus (ega talabi, 2026-08-05) — mavsumiy
// `STORY_SEASON_LIMIT`ning USTIGA qo'shiladigan qoida (ikkalasi ham bajarilishi kerak).
export const STORY_COOLDOWN_HOURS = 72;

const TEMPLATE_KEYS: OyinPosterTemplateKey[] = ["prize", "city", "citygift", "dissolve", "network", "road", "gift", "tickets", "phone"];

/** 72 soatlik tanaffusdan necha soat qolgani (0 = tanaffus tugagan/umuman yo'q — birinchi ariza).
 *  Sof funksiya — DB'siz sinaladi (`simGuards.ts`). */
export function storyCooldownHoursLeft(lastAtIso: string | undefined, nowMs: number): number {
  if (!lastAtIso) return 0;
  const lastAt = Date.parse(lastAtIso);
  if (!Number.isFinite(lastAt)) return 0;
  const hoursSince = (nowMs - lastAt) / 3600_000;
  if (hoursSince >= STORY_COOLDOWN_HOURS) return 0;
  return Math.max(1, Math.ceil(STORY_COOLDOWN_HOURS - hoursSince));
}

const SEED_TEXTS: OyinPosterText[] = [
  // ⚠️ Bu matnlar POSTERGA chiqadi, ya'ni MIJOZ EKRANIDA ko'rinadi — sodiqlik dasturi tilida
  // bo'lishi shart (S6, 2026-08-04). `{chipta}`/`{sovrin}` — SHABLON kalitlari, ular
  // `fillPlaceholders` bilan bog'langan, shuning uchun o'zgarmaydi (kod identifikatori).
  { id: "t1", text: "Menda {chipta} ta sodiqlik kartasi bor", active: true, templateKey: "prize" },
  { id: "t2", text: "Sen ham qo'shil", active: true, templateKey: "prize" },
  { id: "t3", text: "{sovrin} meniki bo'ladi", active: true, templateKey: "prize" },
];

// 🖼 8 ta yangi rasm-shablon (2026-08-05, ega yuborgan 20 ta dizayn tahlili — statik, raqamsiz
// qism, `poster.ts`da chizuvchisi bor). `getPosterTexts()` bularni MAVJUD saqlangan ro'yxatga
// (bo'sh bo'lmasa ham) id bo'yicha yo'q bo'lsa QO'SHADI — shu bilan eski 3 ta matn ustiga
// tinch-tinch yangi shablonlar paydo bo'ladi, birortasi ham qayta yozilmaydi/yo'qolmaydi.
const BUILTIN_TEMPLATES: OyinPosterText[] = [
  { id: "tpl_city", text: "Kosonliklar allaqachon sodiqlik kartasi yig'yapti", active: true, templateKey: "city" },
  { id: "tpl_citygift", text: "Koson uchun yangi sovrinlar o'yini boshlandi", active: true, templateKey: "citygift" },
  { id: "tpl_dissolve", text: "Bu oy o'tkazib yuborma — keyingi oyga qolmasin", active: true, templateKey: "dissolve" },
  { id: "tpl_network", text: "Do'stlarim yig'ishni boshladi", active: true, templateKey: "network" },
  { id: "tpl_road", text: "Har safar maqsadga yaqinlashtiradi", active: true, templateKey: "road" },
  { id: "tpl_gift", text: "Men o'yindaman — BirJoy sovrinlar dasturi", active: true, templateKey: "gift" },
  { id: "tpl_tickets", text: "Birga yig'amiz — ko'proq do'st, ko'proq sodiqlik kartasi!", active: true, templateKey: "tickets" },
  { id: "tpl_phone", text: "Bir tap bilan qo'shil — boshlash juda oson!", active: true, templateKey: "phone" },
];

interface StoreShape<T> { items: T[] }

function parseItems<T>(raw: string | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as Partial<StoreShape<T>>;
    return Array.isArray(v.items) ? v.items : [];
  } catch {
    return [];
  }
}

async function saveItems<T>(key: string, items: T[]): Promise<void> {
  const value = JSON.stringify({ items });
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// ── Poster matnlari (admin) ──────────────────────────────────────────────────────────────────
/** Eski qatorlar `templateKey`siz saqlangan bo'lishi mumkin (2026-08-05'dan oldingi) — xavfsiz
 *  standart "prize" (sovrin-fotosi bilan, eski yagona shablon), noma'lum kalit ham shunga tushadi. */
function normalizeTemplateKey(k: unknown): OyinPosterTemplateKey {
  return typeof k === "string" && (TEMPLATE_KEYS as string[]).includes(k) ? (k as OyinPosterTemplateKey) : "prize";
}

export async function getPosterTexts(): Promise<OyinPosterText[]> {
  const row = await prisma.appState.findUnique({ where: { key: TEXT_KEY } });
  let items = parseItems<OyinPosterText>(row?.value).map((t) => ({ ...t, templateKey: normalizeTemplateKey(t.templateKey) }));
  if (!items.length) items = SEED_TEXTS;
  // Yangi 8 ta rasm-shablon — mavjud ro'yxatga id bo'yicha YO'Q bo'lganini QO'SHADI, borini
  // TEGMAYDI (admin allaqachon o'chirgan/o'zgartirgan bo'lsa qayta tirilmasin).
  const missing = BUILTIN_TEMPLATES.filter((b) => !items.some((t) => t.id === b.id));
  if (missing.length || !row) {
    items = [...items, ...missing];
    await saveItems(TEXT_KEY, items).catch(() => undefined);
  }
  return items;
}

export async function adminUpsertPosterText(input: { id?: string; text: string; active?: boolean; templateKey?: string }): Promise<OyinPosterText[]> {
  const items = await getPosterTexts();
  const text = (input.text || "").trim().slice(0, 60);
  if (!text) return items;
  const templateKey = normalizeTemplateKey(input.templateKey);
  const found = input.id ? items.find((t) => t.id === input.id) : undefined;
  if (found) Object.assign(found, { text, active: input.active ?? found.active, templateKey });
  else items.push({ id: `t${Date.now().toString(36)}`, text, active: true, templateKey });
  await saveItems(TEXT_KEY, items);
  return items;
}

export async function adminDeletePosterText(id: string): Promise<OyinPosterText[]> {
  const items = (await getPosterTexts()).filter((t) => t.id !== id);
  await saveItems(TEXT_KEY, items);
  return items;
}

/** O'rin-egallarni almashtirish. Mijozga TAYYOR matnlar boradi — miniapp shablon bilan ovora bo'lmaydi. */
export function fillPlaceholders(text: string, v: { ism: string; chipta: number; sovrin: string }): string {
  return text
    .replace(/\{ism\}/g, v.ism)
    .replace(/\{chipta\}/g, String(v.chipta))
    .replace(/\{sovrin\}/g, v.sovrin);
}

// ── Mijoz arizalari ──────────────────────────────────────────────────────────────────────────
async function itemsOf(memberId: number): Promise<OyinStoryItem[]> {
  const row = await prisma.appState.findUnique({ where: { key: `${STORY_PREFIX}${memberId}` } });
  return parseItems<OyinStoryItem>(row?.value);
}

function inSeasonItems(items: OyinStoryItem[], startMs: number, endMs: number): OyinStoryItem[] {
  return items.filter((i) => {
    const t = Date.parse(i.at);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
}

/** Mijoz ko'radigan holat (OyinStateResponse ichida). */
export async function storyStateOf(memberId: number, ballEach: number, ctx: { ism: string; chipta: number; sovrin: string }): Promise<{
  approved: number; limit: number; pending: boolean; ballEach: number; lastRejectReason: string | null;
  texts: { text: string; templateKey: OyinPosterTemplateKey }[];
}> {
  const [season, items, texts] = await Promise.all([getSeason(), itemsOf(memberId), getPosterTexts()]);
  const scoped = season.configured ? inSeasonItems(items, season.startMs as number, season.endMs as number) : [];
  const rejected = [...scoped].filter((i) => i.status === "rejected").sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return {
    approved: scoped.filter((i) => i.status === "approved").length,
    limit: STORY_SEASON_LIMIT,
    pending: scoped.some((i) => i.status === "pending"),
    ballEach,
    lastRejectReason: rejected?.reason ?? null,
    texts: texts.filter((t) => t.active).map((t) => ({ text: fillPlaceholders(t.text, ctx), templateKey: t.templateKey })),
  };
}

/** Mijoz hikoya havolasini yuboradi. Ball BU YERDA berilmaydi — admin tasdig'idan keyin jonli hisoblanadi. */
export async function submitStory(memberId: number, urlRaw: string): Promise<OyinStorySubmitResult> {
  const season = await getSeason();
  if (season.phase !== "active") return { ok: false, reason: "season_off" };

  const url = (urlRaw || "").trim().slice(0, 400);
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  if (!ALLOWED_HOSTS.includes(host)) return { ok: false, reason: "bad_url" };

  const items = await itemsOf(memberId);
  const scoped = inSeasonItems(items, season.startMs as number, season.endMs as number);
  if (scoped.some((i) => i.status === "pending")) return { ok: false, reason: "pending" };
  // Rad etilganlar limitdan SANALMAYDI — xato qilgan odam yana urinadi (adolat).
  if (scoped.filter((i) => i.status === "approved").length >= STORY_SEASON_LIMIT) return { ok: false, reason: "limit" };
  // ⏳ 72-soatlik tanaffus (ega talabi, 2026-08-05) — mavsumiy limitning USTIGA, holatidan
  // qat'i nazar ENG SO'NGGI arizadan hisoblanadi (rad etilgan bo'lsa ham — aks holda mijoz
  // qasddan rad etiladigan havola yuborib tanaffusni "aylanib o'tishi" mumkin edi).
  const lastAt = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.at;
  const hoursLeft = storyCooldownHoursLeft(lastAt, Date.now());
  if (hoursLeft > 0) return { ok: false, reason: "cooldown", hoursLeft };
  // ⚠️ Dedup BUTUN POPULYATSIYA bo'ylab va NORMALIZATSIYA bilan. Avval (a) faqat o'z
  // arizalari ichida tekshirilardi — bitta real hikoyani 20 ta akkaunt yuborib 20×150 ball
  // olardi; (b) aniq satr solishtiruvi edi — `…/p/abc`, `…/p/abc/`, `…/p/abc?x=1` va
  // `INSTAGRAM.com/p/abc` to'rttasi ham "boshqa" URL hisoblanardi.
  const norm = normalizeStoryUrl(url);
  const allRows = await prisma.appState.findMany({
    where: { key: { startsWith: STORY_PREFIX } },
    select: { value: true },
  });
  for (const r of allRows) {
    for (const it of parseItems<OyinStoryItem>(r.value)) {
      if (it.status !== "rejected" && normalizeStoryUrl(it.url) === norm) {
        return { ok: false, reason: "duplicate" };
      }
    }
  }

  items.push({ id: `s${Date.now().toString(36)}`, url, at: new Date().toISOString(), status: "pending", reviewedAt: null, reason: null });
  await saveItems(`${STORY_PREFIX}${memberId}`, items);
  return { ok: true };
}

// ── Admin moderatsiya ────────────────────────────────────────────────────────────────────────
/** Kutilayotgan arizalar (eng eskisi tepada — 24 soat SLA shu tartibda ishlaydi). */
export async function adminListStories(status: "pending" | "all" = "pending"): Promise<OyinStoryAdminRow[]> {
  const [season, rows, tus] = await Promise.all([
    getSeason(),
    prisma.appState.findMany({ where: { key: { startsWith: STORY_PREFIX } } }),
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { memberId: true, firstName: true, lastName: true, username: true } }),
  ]);
  const nameOf = new Map<number, string>();
  for (const t of tus) {
    if (!t.memberId) continue;
    const first = t.firstName?.trim();
    nameOf.set(t.memberId, first ? (t.lastName?.trim() ? `${first} ${t.lastName.trim()[0]}.` : first) : t.username?.trim() ? `@${t.username.trim()}` : `#${t.memberId}`);
  }

  const out: OyinStoryAdminRow[] = [];
  for (const row of rows) {
    const memberId = Number(row.key.slice(STORY_PREFIX.length));
    if (!Number.isFinite(memberId)) continue;
    const items = parseItems<OyinStoryItem>(row.value);
    const scoped = season.configured ? inSeasonItems(items, season.startMs as number, season.endMs as number) : items;
    const approvedInSeason = scoped.filter((i) => i.status === "approved").length;
    for (const i of items) {
      if (status === "pending" && i.status !== "pending") continue;
      out.push({
        ...i,
        memberId,
        name: nameOf.get(memberId) ?? `#${memberId}`,
        approvedInSeason,
        hoursWaiting: Math.max(0, Math.round((Date.now() - Date.parse(i.at)) / 3600_000)),
      });
    }
  }
  out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); // eng eski birinchi
  return out;
}

/** Admin qarori. Tasdiqlansa ball keyingi ball-hisobida O'ZI paydo bo'ladi (jonli manba). */
export async function adminReviewStory(
  memberId: number,
  storyId: string,
  approve: boolean,
  reason?: string,
): Promise<{ ok: boolean }> {
  const key = `${STORY_PREFIX}${memberId}`;
  const items = await itemsOf(memberId);
  const item = items.find((i) => i.id === storyId);
  if (!item || item.status !== "pending") return { ok: false };
  item.status = approve ? "approved" : "rejected";
  item.reviewedAt = new Date().toISOString();
  item.reason = approve ? null : (reason || "Hikoya topilmadi").trim().slice(0, 120);
  await saveItems(key, items);

  // Mijozga xabar — qaror qanday bo'lsa ham. Javobsiz qoldirish eng yomon variant.
  try {
    const { getBotInstance } = await import("../botInstance");
    const bot = getBotInstance();
    const tu = await prisma.telegramUser.findUnique({ where: { memberId }, select: { id: true } });
    if (bot && tu) {
      const { pushSend } = await import("./pushSend");
      const text = approve
        ? "📸 <b>Hikoyangiz tasdiqlandi!</b>\n\nBall hisobingizga qo'shildi — rahmat! 🎉"
        : `📸 <b>Hikoya qabul qilinmadi</b>\n\nSabab: ${item.reason}\n\nQayta urinib ko'rishingiz mumkin.`;
      await pushSend(tu.id, "oyin_story_review", () => bot.api.sendMessage(tu.id, text, { parse_mode: "HTML" }), { memberId });
    }
  } catch (e) {
    console.error("[oyin] story review push failed:", e);
  }
  return { ok: true };
}

/** 24 soat SLA — javobsiz qolgan arizalar soni (index.ts tickidan tekshiriladi). */
export async function overdueStoryCount(): Promise<number> {
  const rows = await adminListStories("pending");
  return rows.filter((r) => r.hoursWaiting >= 24).length;
}
