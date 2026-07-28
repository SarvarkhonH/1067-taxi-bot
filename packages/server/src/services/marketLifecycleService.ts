// 🔔 V4 — BirJoy Market hayot-sikli push'lari (bayroq `mktlife`, DEFAULT_OFF).
//
// NIMA ALLAQACHON BOR (qayta qurilmadi): buyurtma holati o'zgarganda xaridorga push
// (`bot/market.ts` — qabul/yo'lda/yetkazildi/rad + ETA) va javobsiz buyurtmani avto-yopish
// (`mktexpire`). Ya'ni TRANZAKSION hayot-sikl yopilgan. Bu fayl esa mijozning O'Z SIGNALIGA
// javob beradigan ikkita push'ni quradi:
//
//   V4.1 «Qidirganingiz keldi»  — mijoz qidirgan, topilmagan (MarketDemand), keyin o'sha
//                                 mahsulot do'konda paydo bo'lgan.
//   V4.2 «Sevimlingiz arzonlashdi» — mijoz ❤️ bosgan mahsulotga chegirma qo'yilgan.
//
// ⛔ SAVAT-TASHLAB-KETISH PUSH'I YO'Q: savat faqat mijoz qurilmasida turadi, server uni bilmaydi.
//    Uni qilish savatni serverga saqlashni talab qiladi (yangi API + jadval) — alohida tiket.
//
// SPAM QARSHI (buzilmas): bayroq DARK · faqat 09:00–21:00 Toshkent · bir a'zoga KUNIGA 1 ta ·
// bir (a'zo, mahsulot) juftligiga BIR MARTA · bir tick'da ko'pi bilan 20 ta · yangi poller YO'Q
// (15-daqiqalik tick'ga ulanadi).
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

export const LIFECYCLE_MAX_PER_TICK = 20;
const QUIET_FROM = 9; // Toshkent soati (shu soatdan boshlab yuboriladi)
const QUIET_TO = 21; // shu soatgacha (21:00 dan keyin yo'q)
const DEMAND_LOOKBACK_DAYS = 30; // shundan eskisi uchun xabar berish g'alati (mijoz unutgan)
const FRESH_HOURS = 48; // mahsulot/chegirma shu oyna ichida paydo bo'lgan bo'lsa "yangilik"

export type LifecycleKind = "demand" | "fav";
export interface LifecyclePush {
  memberId: number;
  productId: number;
  kind: LifecycleKind;
  lead: string; // mahsulot kartasidan OLDIN yuboriladigan bir qatorli sabab
  why: string; // faqat log/dry-run uchun
}

/** Toshkent soati (UTC+5) — server UTC'da yuradi. */
function tashkentHour(now = new Date()): number {
  return new Date(now.getTime() + 5 * 3600_000).getUTCHours();
}
function tashkentDayKey(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** Qidiruv-so'zini solishtirishga tayyorlash: sotuvchilar 𝐁𝐎𝐋𝐀 uslubidagi "matematik" harflar
 *  bilan ham yozadi (recategorizeProducts'dagi bilan bir xil normalizatsiya). */
function norm(s: string): string {
  let out = "";
  for (const ch of s) {
    const o = ch.codePointAt(0)!;
    if (o >= 0x1d400 && o <= 0x1d419) out += String.fromCharCode(65 + o - 0x1d400);
    else if (o >= 0x1d41a && o <= 0x1d433) out += String.fromCharCode(97 + o - 0x1d41a);
    else out += ch;
  }
  return out.toLowerCase().replace(/[ʻʼ']/g, "'").replace(/õ/g, "o").trim();
}

async function markerExists(key: string): Promise<boolean> {
  return !!(await prisma.appState.findUnique({ where: { key }, select: { key: true } }).catch(() => null));
}
async function putMarker(key: string, value = "1"): Promise<void> {
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } }).catch(() => undefined);
}

/** Kim nima olishi kerakligini HISOBLAYDI — hech narsa YUBORMAYDI va marker QO'YMAYDI.
 *  Shu sababli jonli bazada xavfsiz "dry-run" qilsa bo'ladi (K8). */
export async function planLifecyclePushes(now = new Date()): Promise<{ enabled: boolean; quiet: boolean; pushes: LifecyclePush[] }> {
  const enabled = await featureOn("mktlife");
  const hour = tashkentHour(now);
  const quiet = hour < QUIET_FROM || hour >= QUIET_TO;
  if (!enabled || quiet) return { enabled, quiet, pushes: [] };

  const dayKey = tashkentDayKey(now);
  const out: LifecyclePush[] = [];
  const usedToday = new Set<number>(); // shu tick ichida ham bir a'zoga bittadan ko'p bermaymiz

  const eligible = async (memberId: number, productId: number, kindKey: string): Promise<boolean> => {
    if (out.length >= LIFECYCLE_MAX_PER_TICK) return false;
    if (usedToday.has(memberId)) return false;
    if (await markerExists(`mktlife:day:${memberId}:${dayKey}`)) return false; // kunlik cheklov
    if (await markerExists(kindKey)) return false; // shu juftlikka allaqachon yuborilgan
    const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
    return !!tu;
  };

  // ── V4.1: qidirilgan-topilmagan → endi bor ──────────────────────────────────────────────────
  const since = new Date(now.getTime() - DEMAND_LOOKBACK_DAYS * 86400_000);
  const demands = await prisma.marketDemand.findMany({
    where: { createdAt: { gte: since }, memberId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const freshCutoff = new Date(now.getTime() - FRESH_HOURS * 3600_000);
  // Faqat YANGI paydo bo'lgan (yoki yangi yangilangan) faol mahsulotlar — eski katalogni qayta
  // e'lon qilish "yangilik" emas, spam bo'lardi.
  const freshProducts = await prisma.product.findMany({
    where: { active: true, stock: { gt: 0 }, OR: [{ createdAt: { gte: freshCutoff } }, { updatedAt: { gte: freshCutoff } }] },
    select: { id: true, name: true, priceTanga: true, oldPriceTanga: true },
    take: 300,
  });
  for (const d of demands) {
    if (out.length >= LIFECYCLE_MAX_PER_TICK) break;
    const q = norm(d.query);
    if (q.length < 3) continue;
    const hit = freshProducts.find((p) => norm(p.name).includes(q));
    if (!hit) continue;
    const memberId = d.memberId!;
    const key = `mktlife:d:${memberId}:${hit.id}`;
    if (!(await eligible(memberId, hit.id, key))) continue;
    usedToday.add(memberId);
    out.push({ memberId, productId: hit.id, kind: "demand", lead: `🔎 <b>Siz qidirgan «${d.query}» endi bor</b>`, why: `demand#${d.id} «${d.query}» → product#${hit.id}` });
  }

  // ── V4.2: sevimliga chegirma qo'yildi ───────────────────────────────────────────────────────
  const favs = await prisma.productFavorite.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const favProductIds = [...new Set(favs.map((f) => f.productId))];
  const favProducts = favProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: favProductIds }, active: true, stock: { gt: 0 }, updatedAt: { gte: freshCutoff } },
        select: { id: true, name: true, priceTanga: true, oldPriceTanga: true },
      })
    : [];
  const discounted = new Map(favProducts.filter((p) => p.oldPriceTanga && p.oldPriceTanga > p.priceTanga).map((p) => [p.id, p]));
  for (const f of favs) {
    if (out.length >= LIFECYCLE_MAX_PER_TICK) break;
    const p = discounted.get(f.productId);
    if (!p) continue;
    // Narx kalitning bir qismi: keyinchalik YANA arzonlashsa yangi xabar haqli bo'ladi.
    const key = `mktlife:f:${f.memberId}:${p.id}:${p.priceTanga}`;
    if (!(await eligible(f.memberId, p.id, key))) continue;
    const pct = Math.round((1 - p.priceTanga / p.oldPriceTanga!) * 100);
    usedToday.add(f.memberId);
    out.push({ memberId: f.memberId, productId: p.id, kind: "fav", lead: `💥 <b>Sevimlingiz arzonlashdi — ${pct}%</b>`, why: `fav member#${f.memberId} → product#${p.id} (−${pct}%)` });
  }

  return { enabled, quiet, pushes: out };
}

/** Rejani BAJARADI: har push uchun sabab-qatori + mavjud mahsulot kartasi. Marker faqat
 *  yuborish MUVAFFAQIYATLI bo'lgandan keyin qo'yiladi — aks holda tarmoq xatosi mijozni
 *  bir umr shu xabardan mahrum qilardi. */
export async function runLifecyclePushes(
  send: (memberId: number, lead: string, productId: number) => Promise<boolean>,
  now = new Date(),
): Promise<{ planned: number; sent: number }> {
  const { pushes } = await planLifecyclePushes(now);
  const dayKey = tashkentDayKey(now);
  let sent = 0;
  for (const p of pushes) {
    const ok = await send(p.memberId, p.lead, p.productId).catch(() => false);
    if (!ok) continue;
    sent++;
    const key = p.kind === "demand" ? `mktlife:d:${p.memberId}:${p.productId}` : null;
    if (key) await putMarker(key);
    else {
      const prod = await prisma.product.findUnique({ where: { id: p.productId }, select: { priceTanga: true } });
      await putMarker(`mktlife:f:${p.memberId}:${p.productId}:${prod?.priceTanga ?? 0}`);
    }
    await putMarker(`mktlife:day:${p.memberId}:${dayKey}`);
  }
  return { planned: pushes.length, sent };
}
