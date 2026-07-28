// 🖼 MAHSULOT-O'RINBOSAR RASMI (ega skrinshoti, 2026-07-28)
//
// MUAMMO: sotuvchi rasm yuklamagan mahsulot kafelida ULKAN HARF turardi («F» — Frisolac). Ega
// aynan shuni «xunuk» dedi. Jonli bazada bunday faol mahsulot 6 ta, lekin har yangi sotuvchi
// rasmsiz mahsulot qo'shsa yana paydo bo'ladi — ya'ni bu doimiy yamoq, bir martalik emas.
//
// YECHIM: mahsulotning KATEGORIYASIDAN chizma yasaymiz. Kategoriya ikonkalari (`CategoryDef.
// iconUrl`, `seedCategoryIcons.ts` — 35 ta qo'lda chizilgan SVG) allaqachon bazada turibdi;
// shuni katta qilib, yumshoq fonda ko'rsatamiz. Ya'ni «non» kategoriyasidagi rasmsiz mahsulot
// non ikonkasi bilan chiqadi — harf bilan emas.
//
// Ikonka ichki markupi NUSXALANADI (`<image href="data:…">` emas): SVG `<img>` ichida
// "secure static mode"da ishlaydi va tashqi/ichma-ich manbalarga ishonch yo'q — inline
// qilinganda esa hamma brauzerda kafolatlangan.
import { prisma } from "../db";

const CACHE = new Map<string, string>(); // kategoriya nomi → data-URL (jarayon umri davomida)
const E = "#0d9668";

/** `<svg …>ICHI</svg>` dan faqat ICHINI oladi */
function innerSvg(dataUrl: string): string | null {
  const m = /^data:image\/svg\+xml;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const svg = Buffer.from(m[1]!, "base64").toString("utf8");
  const body = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(svg);
  return body?.[1] ?? null;
}

function compose(inner: string | null, emoji: string): string {
  // ikonka 24×24 to'rda chizilgan → 160px ga cho'ziladi (scale 6.6667), markazga qo'yiladi
  const art = inner
    ? `<g transform="translate(80 72) scale(6.6667)" fill="none" stroke="${E}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
    : `<text x="160" y="196" font-size="120" text-anchor="middle">${emoji}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">` +
    `<rect width="320" height="320" rx="30" fill="#f3f7f4"/>` +
    `<circle cx="160" cy="152" r="106" fill="${E}" opacity=".08"/>` +
    art +
    `</svg>`
  );
}

/** Kategoriya bo'yicha o'rinbosar rasm (data-URL). Kategoriya topilmasa — umumiy savat belgisi. */
export async function categoryPlaceholder(category: string | null | undefined): Promise<string> {
  const key = (category ?? "").trim() || "—";
  const hit = CACHE.get(key);
  if (hit) return hit;
  let inner: string | null = null;
  let emoji = "🛍";
  if (key !== "—") {
    const def = await prisma.categoryDef.findFirst({ where: { name: key }, select: { iconUrl: true, emoji: true } });
    if (def?.emoji) emoji = def.emoji;
    if (def?.iconUrl) inner = innerSvg(def.iconUrl);
  }
  const url = `data:image/svg+xml;base64,${Buffer.from(compose(inner, emoji), "utf8").toString("base64")}`;
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(key, url);
  return url;
}
