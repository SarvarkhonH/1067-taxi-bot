// 🏠 V1.5 (Mahalla bozori) — Mahalla ro'yxati + GPS-eng-yaqin lookup. Ro'yxat rows kam o'zgaradi →
// serviceDirectory.ts'dagi catCache bilan bir xil 60s in-memory kesh naqshi.
import { prisma } from "../db";

export interface MahallaView { id: number; name: string; lat: number; lng: number }

let listCache: { at: number; data: MahallaView[] } | null = null;

/** TEST-ONLY: reset in-memory cache (mirrors serviceDirectory.__resetServiceCaches). */
export function __resetMahallaCache(): void { listCache = null; }

export async function listMahallas(): Promise<MahallaView[]> {
  if (listCache && Date.now() - listCache.at < 60_000) return listCache.data;
  const rows = await prisma.mahalla.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const data = rows.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng }));
  listCache = { at: Date.now(), data };
  return data;
}

/** GPS → eng yaqin mahalla. kas/client.ts nearestCatalogAddress bilan bir xil squared-degree +
 *  cos(lat) approksimatsiya — 39 qatorda bu DB spatial index'dan tezroq va soddaroq. Koson shahri
 *  kichik (~10km) bo'lgani uchun masofa-cap yo'q: har doim eng yaqinini qaytaradi. */
export async function nearestMahalla(lat: number, lng: number): Promise<MahallaView | null> {
  const all = await listMahallas();
  if (!all.length) return null;
  const coslat = Math.cos((lat * Math.PI) / 180);
  let best: MahallaView | null = null;
  let bestD = Infinity;
  for (const m of all) {
    const dx = (m.lng - lng) * coslat;
    const dy = m.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Foydalanuvchi "uy" mahallasini tanlaydi (mode="home") yoki safar-rejimida vaqtincha
 *  almashtiradi (mode="travel"). Yangi "uy" tanlansa, eski safar-override tozalanadi — ikkalasi
 *  hech qachon aralashtirilmaydi, doim bitta joriy mahalla bo'ladi. */
export async function setMemberMahalla(memberId: number, mahallaId: number, mode: "home" | "travel"): Promise<{ ok: boolean }> {
  const exists = await prisma.mahalla.findUnique({ where: { id: mahallaId }, select: { id: true } });
  if (!exists) return { ok: false };
  if (mode === "travel") {
    await prisma.member.update({ where: { id: memberId }, data: { travelMahallaId: mahallaId, travelMahallaSetAt: new Date() } });
  } else {
    await prisma.member.update({ where: { id: memberId }, data: { mahallaId, travelMahallaId: null, travelMahallaSetAt: null } });
  }
  return { ok: true };
}
