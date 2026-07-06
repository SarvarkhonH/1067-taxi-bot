// 🛍 Hamkor-do'kon importi: @KOSON_AKSIYA kanalining ochiq web-preview'idan (t.me/s/...) mahsulot
// postlarini o'qib do'konga joylaydi: rasm(lar) + nom + narx (❌ eski narx → chegirma sifatida).
// Idempotent: har post AppState `kaimport:<postId>` marker bilan — qayta yugurtirish dublikat qilmaydi.
// Rasm oqimi mavjud pipeline: bytes → uploadProductPhoto (Telegram file_id + ~320px thumb).
//   Yugurtirish:  npx tsx src/scripts/importKosonAksiya.ts [--limit 100] [--dry]
import "../env";

const CHANNEL = "KOSON_AKSIYA";
const CATEGORY = "Aksiya"; // ega admin paneldan qayta kategoriyalashi mumkin
const DEFAULT_STOCK = 10; // real qoldiq noma'lum — ega tahrirlaydi; xato holatda rad=avto-refund
const MAX_PHOTOS = 5;
const MIN_PRICE = 1_000;
const MAX_PRICE = 5_000_000;

const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1] || 0) || 100;
const DRY = process.argv.includes("--dry");

interface ParsedPost {
  postId: number;
  name: string;
  description: string;
  price: number;
  oldPrice: number | null;
  photoUrls: string[];
}

function stripEmoji(s: string): string {
  return s
    .replace(/[‘’ʻʼ]/g, "'") // O‘ → O' (o'zbek apostrofi saqlanadi)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200B}-\u{200D}⁠]/gu, " ")
    .replace(/[✅❌⭕️🔥‼️❗️]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

const BOILER = /TELEGRAM\s*KANAL|GRUPPAMIZ|@KOSON|KUZATIB\s*BORISH|SAVOLLAR\s*B|BARCHA\s*MAXSULOTLARNI\s*SHU/i;
// kanal sloganlari — mahsulot NOMI emas; nom sifatida birinchi slogan-BO'LMAGAN qator olinadi
const SLOGAN = /^(SUPER\s*)?AKSIYA$|SOTUVDA|^ZAKAS\b|^YANGI(\s*(MAHSULOT|KELDI))?\s*!*$|^ENDI\b|^CHIROYLI\s*K.RINISHDAGI$|^BOLAJONLAR\s*UCHUN$|^\d|SO'MDAN|S.MDAN/i;

function parsePost(chunk: string): ParsedPost | null {
  const pid = /data-post="[^"]+\/(\d+)"/.exec(chunk);
  if (!pid) return null;
  const postId = Number(pid[1]);

  // album'da bir nechta photo_wrap bo'ladi — hammasini olamiz (galereya ≤5)
  const photoUrls: string[] = [];
  const photoRe = /tgme_widget_message_photo_wrap[^"]*"\s+style="[^"]*background-image:url\('([^']+)'\)/g;
  for (let m = photoRe.exec(chunk); m; m = photoRe.exec(chunk)) photoUrls.push(m[1]!);
  if (photoUrls.length === 0) return null;

  const txt = /tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/.exec(chunk);
  if (!txt) return null;
  const text = decodeEntities(txt[1]!.replace(/<br\/?>/g, "\n").replace(/<[^>]+>/g, ""));

  // reklama-quyrug'ini kesamiz
  const lines = text.split("\n").map((l) => l.trim());
  const cut = lines.findIndex((l) => BOILER.test(l));
  const body = (cut >= 0 ? lines.slice(0, cut) : lines).filter((l) => l.length > 0);
  if (body.length === 0) return null;

  // narxlar: "87.000" / "55 000" / "20000" (1k..5M oralig'ida)
  const joined = body.join("\n");
  const prices: number[] = [];
  const priceRe = /(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})/g;
  for (let m = priceRe.exec(joined); m; m = priceRe.exec(joined)) {
    const v = Number(m[1]!.replace(/[.\s]/g, ""));
    if (v >= MIN_PRICE && v <= MAX_PRICE) prices.push(v);
  }
  if (prices.length === 0) return null;
  const price = Math.min(...prices);
  const maxP = Math.max(...prices);
  const oldPrice = maxP > price ? maxP : null;

  // nom: birinchi SLOGAN bo'lmagan ma'noli qator ("SUPER AKSIYA"/"YANGI MAHSULOT" nom emas)
  const clean = body.map((l) => stripEmoji(l));
  let nameIdx = clean.findIndex((l) => l.length >= 4 && !SLOGAN.test(l));
  if (nameIdx < 0) nameIdx = clean.findIndex((l) => l.length >= 4);
  if (nameIdx < 0) return null;
  // yarim qolgan nom ("MEHMONHONA VA") — keyingi qatorni ulaymiz to ma'no tugaguncha (≤60 belgi)
  let name = clean[nameIdx]!;
  for (let j = nameIdx + 1; j < clean.length && (name.length < 24 || /\b(VA|UCHUN|HAMDA|BILAN)$/i.test(name)); j++) {
    const nxt = clean[j]!;
    if (!nxt || SLOGAN.test(nxt) || name.length + nxt.length > 60) break;
    name = `${name} ${nxt}`.trim();
  }
  name = name.slice(0, 80).trim();
  if (name.length < 3) return null;

  const description = body.filter((_, i) => i !== nameIdx).join("\n").slice(0, 400).trim() || "";
  return { postId, name, description, price, oldPrice, photoUrls: photoUrls.slice(0, MAX_PHOTOS) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(before?: number): Promise<string> {
  const url = `https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!res.ok) throw new Error(`t.me ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { uploadProductPhoto } = await import("../services/shopService");

  const collected: ParsedPost[] = [];
  let before: number | undefined;
  let skippedNoParse = 0;
  for (let page = 0; page < 60 && collected.length < LIMIT; page++) {
    const html = await fetchPage(before);
    const chunks = html.split("tgme_widget_message_wrap").slice(1);
    if (chunks.length === 0) break;
    let minId = Infinity;
    for (const c of chunks) {
      const pid = /data-post="[^"]+\/(\d+)"/.exec(c);
      if (pid) minId = Math.min(minId, Number(pid[1]));
      const p = parsePost(c);
      if (p) collected.push(p);
      else skippedNoParse++;
    }
    if (!Number.isFinite(minId) || minId <= 1) break;
    before = minId;
    await sleep(300);
  }
  // yangi postlar birinchi bo'lsin, LIMIT tagacha
  collected.sort((a, b) => b.postId - a.postId);
  const posts = collected.slice(0, LIMIT);
  console.log(`Parsed ${posts.length} valid posts (skipped ${skippedNoParse} without photo/price).`);

  if (DRY) {
    for (const p of posts.slice(0, 15)) {
      console.log(`#${p.postId} | ${p.price}${p.oldPrice ? ` (eski ${p.oldPrice})` : ""} | ${p.photoUrls.length} rasm | ${p.name}`);
    }
    console.log("--dry: hech narsa yozilmadi.");
    return;
  }

  let created = 0, skippedDup = 0, photoFails = 0;
  for (const p of posts) {
    const key = `kaimport:${p.postId}`;
    if (await prisma.appState.findUnique({ where: { key } })) { skippedDup++; continue; }
    const product = await prisma.product.create({
      data: {
        name: p.name,
        description: p.description || null,
        category: CATEGORY,
        priceTanga: p.price,
        oldPriceTanga: p.oldPrice,
        stock: DEFAULT_STOCK,
        active: false, // rasm(lar) muvaffaqiyatli yuklansagina yoqiladi (pastda)
      },
    });
    let uploaded = 0;
    for (const url of p.photoUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = Buffer.from(await res.arrayBuffer());
        const r = await uploadProductPhoto(product.id, buf, "image/jpeg");
        if (r.ok) uploaded++;
      } catch {
        photoFails++;
      }
      await sleep(350); // Telegram sendPhoto rate-limitiga hurmat
    }
    if (uploaded > 0) await prisma.product.update({ where: { id: product.id }, data: { active: true } });
    await prisma.appState.create({ data: { key, value: String(product.id) } });
    created++;
    console.log(`✅ #${p.postId} → product ${product.id} «${p.name.slice(0, 40)}» ${p.price} so'm, ${uploaded}/${p.photoUrls.length} rasm`);
  }
  console.log(`\nDONE: ${created} yaratildi, ${skippedDup} allaqachon bor edi, rasm-xato ${photoFails}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
