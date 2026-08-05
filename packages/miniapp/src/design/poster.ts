// 📸 HIKOYA-POSTER generatori — 1080×1920 PNG, BRAUZERDA canvas bilan chiziladi.
//
// Nega serverda emas: serverda rasm-kutubxonasi yo'q (faqat `qrcode`), qo'shish esa yangi native
// bog'liqlik + VPS build muammosi degani. Canvas bepul, bir zumda va oflayn ishlaydi.
//
// ⚠️ Canvas "iflos" bo'lmasligi uchun HAR ikkala tashqi rasm O'Z domenimizdan olinadi
// (`/api/oyin/prizephoto`, `/api/oyin/qr`) va `crossOrigin="anonymous"` bilan yuklanadi.
// Iflos canvas'da `toBlob` ishlamaydi — ya'ni poster saqlanmay qolardi.
//
// 🖼 2026-08-05 — bitta qattiq shablondan 9 ta shablon-registriga o'tildi (ega yuborgan 20 ta
// rasm-dizayn tahlili). Umumiy narsalar (brend qatori, headline, ism, pastki QR-karta) shu yerda
// baham ko'riladi; har shablonning FARQI faqat "hero-vizual" qutisi — pastdagi `TEMPLATES` xarita.
import type { OyinPosterTemplateKey } from "@t1067/shared";

export interface PosterInput {
  templateKey: OyinPosterTemplateKey;
  headline: string; // asosiy xabar (admin matni yoki mijoz yozgani)
  name: string; // mijoz ismi (bo'sh bo'lishi mumkin)
  prizeName: string;
  prizePhotoUrl: string | null; // /api/oyin/prizephoto?key=… yoki null
  prizeIcon: string; // emoji fallback
  qrUrl: string | null; // /api/oyin/qr?code=…
  drawDate: string; // "14-sentabr"
}

interface HeroBox { x: number; y: number; w: number; h: number }

const W = 1080;
const H = 1920;
const INK = "#141a2e";
const INK_2 = "rgba(20, 26, 46, 0.62)";
const GOLD_DEEP = "#8a6207";
const GOLD = "#ffd15a";
const BLUE = "#2f6fed";
const CARD = "#ffffff";
const PAD = 84;
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // yuklanmasa — emoji fallback, poster BUZILMAYDI
    img.src = src;
  });
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Matnni beriladigan enga sig'diradi: kerak bo'lsa qatorlarga bo'ladi, o'lchamni kichraytiradi. */
function wrapText(c: CanvasRenderingContext2D, text: string, maxW: number, startSize: number, weight: number, maxLines: number): { lines: string[]; size: number } {
  let size = startSize;
  for (;;) {
    c.font = `${weight} ${size}px ${FONT}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (c.measureText(t).width <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines || size <= 34) return { lines: lines.slice(0, maxLines), size };
    size -= 6;
  }
}

function drawGiftBox(c: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  c.save();
  c.fillStyle = "#ffffff";
  roundRect(c, cx - s / 2, cy - s * 0.32, s, s * 0.72, 16);
  c.fill();
  c.fillStyle = BLUE;
  c.fillRect(cx - s / 2, cy - s * 0.05, s, s * 0.14);
  c.fillRect(cx - s * 0.09, cy - s * 0.32, s * 0.18, s * 0.72);
  c.fillStyle = "#f3f6ff";
  roundRect(c, cx - s * 0.56, cy - s * 0.48, s * 1.12, s * 0.22, 12);
  c.fill();
  c.fillStyle = BLUE;
  c.fillRect(cx - s * 0.56, cy - s * 0.4, s * 1.12, s * 0.08);
  c.fillRect(cx - s * 0.09, cy - s * 0.48, s * 0.18, s * 0.22);
  c.beginPath();
  c.ellipse(cx - s * 0.16, cy - s * 0.52, s * 0.14, s * 0.09, -0.5, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(cx + s * 0.16, cy - s * 0.52, s * 0.14, s * 0.09, 0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawTicketCard(c: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, dim?: boolean): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.fillStyle = dim ? "rgba(28,35,71,0.9)" : "#232a55";
  roundRect(c, -w / 2, -h / 2, w, h, 22);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 2;
  roundRect(c, -w / 2, -h / 2, w, h, 22);
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.3)";
  c.setLineDash([6, 8]);
  c.beginPath();
  c.moveTo(w * 0.2 - w / 2, -h / 2);
  c.lineTo(w * 0.2 - w / 2, h / 2);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = GOLD;
  c.font = `600 30px ${FONT}`;
  c.textAlign = "left";
  c.fillText("BIRJOY", -w / 2 + 26, -6);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = `400 21px ${FONT}`;
  c.fillText("SODIQLIK KARTASI", -w / 2 + 26, 24);
  c.restore();
}

// ── Hero-vizual chizuvchilar — har biri o'z shablonining FARQ qiluvchi qismi ────────────────────

async function heroPrize(c: CanvasRenderingContext2D, box: HeroBox, input: PosterInput): Promise<void> {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const photo = input.prizePhotoUrl ? await loadImage(input.prizePhotoUrl) : null;
  if (photo) {
    const scale = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    c.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "rgba(245, 183, 0, 0.18)");
    g.addColorStop(1, "rgba(110, 90, 255, 0.16)");
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.font = `260px ${FONT}`;
    c.textAlign = "center";
    c.fillText(input.prizeIcon || "🎁", x + w / 2, y + h / 2 + 90);
    c.textAlign = "left";
  }
  c.restore();
}

function heroCityBase(c: CanvasRenderingContext2D, box: HeroBox, dusk: boolean): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x, y + h);
  if (dusk) {
    g.addColorStop(0, "#2b2350");
    g.addColorStop(0.55, "#4a2f52");
    g.addColorStop(1, "#7a3b3f");
  } else {
    g.addColorStop(0, "#141a3d");
    g.addColorStop(1, "#0b0e24");
  }
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  if (!dusk) {
    c.fillStyle = "rgba(255,255,255,0.55)";
    const stars = [[0.15, 0.12], [0.32, 0.22], [0.6, 0.1], [0.78, 0.18], [0.9, 0.3], [0.22, 0.35], [0.5, 0.28]];
    for (const [sx, sy] of stars) { c.beginPath(); c.arc(x + w * (sx ?? 0), y + h * (sy ?? 0), 3.4, 0, Math.PI * 2); c.fill(); }
  }
  c.fillStyle = dusk ? "#241c44" : "#1c2350";
  const buildings = dusk
    ? [[0, 0.7, 0.14, 0.3], [0.13, 0.6, 0.1, 0.4], [0.24, 0.74, 0.1, 0.26], [0.35, 0.55, 0.12, 0.45], [0.48, 0.68, 0.1, 0.32], [0.6, 0.5, 0.13, 0.5], [0.74, 0.66, 0.1, 0.34], [0.85, 0.58, 0.15, 0.42]]
    : [[0, 0.62, 0.12, 0.38], [0.1, 0.5, 0.1, 0.5], [0.19, 0.66, 0.09, 0.34], [0.27, 0.42, 0.11, 0.58], [0.37, 0.58, 0.1, 0.42], [0.46, 0.48, 0.12, 0.52], [0.57, 0.64, 0.09, 0.36], [0.65, 0.4, 0.13, 0.6], [0.77, 0.56, 0.1, 0.44], [0.86, 0.5, 0.14, 0.5]];
  for (const [bx, by, bw, bh] of buildings) c.fillRect(x + w * (bx ?? 0), y + h * (by ?? 0), w * (bw ?? 0), h * (bh ?? 0));
  if (!dusk) {
    c.fillStyle = GOLD;
    const pins = [[0.22, 0.55], [0.42, 0.68], [0.62, 0.5], [0.8, 0.6]];
    for (const [px0, py0] of pins) {
      const gx = x + w * (px0 ?? 0);
      const gy = y + h * (py0 ?? 0);
      const glow = c.createRadialGradient(gx, gy, 0, gx, gy, 26);
      glow.addColorStop(0, "rgba(255,209,90,0.9)");
      glow.addColorStop(1, "rgba(255,209,90,0)");
      c.fillStyle = glow;
      c.beginPath(); c.arc(gx, gy, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = GOLD;
      c.beginPath(); c.arc(gx, gy, 6, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

function heroCity(c: CanvasRenderingContext2D, box: HeroBox): void {
  heroCityBase(c, box, false);
}

function heroCityGift(c: CanvasRenderingContext2D, box: HeroBox): void {
  heroCityBase(c, box, true);
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  drawGiftBox(c, x + w / 2, y + h * 0.44, Math.min(w, h) * 0.32);
  c.restore();
}

function heroDissolve(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  c.fillStyle = "#12172c";
  c.fillRect(x, y, w, h);
  drawTicketCard(c, x + w * 0.34, y + h * 0.5, w * 0.5, h * 0.22, -0.06);
  const parts: [number, number, number, number][] = [[0.62, 0.42, 10, 0.8], [0.68, 0.55, 7, 0.6], [0.74, 0.38, 9, 0.5], [0.79, 0.6, 6, 0.35], [0.85, 0.46, 8, 0.28], [0.9, 0.35, 5, 0.18], [0.94, 0.58, 6, 0.12]];
  for (const [px, py, ps, pa] of parts) {
    c.fillStyle = `rgba(255,209,90,${pa})`;
    roundRect(c, x + w * px - ps / 2, y + h * py - ps / 2, ps, ps, 3);
    c.fill();
  }
  c.restore();
}

function heroNetwork(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#161b3a");
  g.addColorStop(1, "#0d1026");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const nodes: [number, number][] = [[0, -0.24], [-0.22, -0.06], [0.22, -0.06], [-0.24, 0.2], [0.24, 0.2]];
  c.strokeStyle = "rgba(255,255,255,0.28)";
  c.setLineDash([5, 7]);
  c.lineWidth = 2.4;
  for (const [nx, ny] of nodes) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + w * nx, cy + h * ny); c.stroke(); }
  c.setLineDash([]);
  c.fillStyle = GOLD;
  c.beginPath(); c.arc(cx, cy, 56, 0, Math.PI * 2); c.fill();
  c.font = `58px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("🧑", cx, cy + 4);
  for (const [nx, ny] of nodes) {
    const px = cx + w * nx;
    const py = cy + h * ny;
    c.fillStyle = BLUE;
    c.beginPath(); c.arc(px, py, 34, 0, Math.PI * 2); c.fill();
    c.font = `36px ${FONT}`;
    c.fillText("🙂", px, py + 3);
  }
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.restore();
}

function heroRoad(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#dfe6f7");
  g.addColorStop(1, "#c7d2ec");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const bx = x + w / 2;
  c.fillStyle = "#3a4258";
  c.beginPath();
  c.moveTo(bx - w * 0.08, y + h * 0.18);
  c.lineTo(bx + w * 0.08, y + h * 0.18);
  c.lineTo(bx + w * 0.36, y + h);
  c.lineTo(bx - w * 0.36, y + h);
  c.closePath();
  c.fill();
  c.strokeStyle = "#ffffff";
  c.lineWidth = 6;
  c.setLineDash([22, 20]);
  c.beginPath(); c.moveTo(bx, y + h * 0.22); c.lineTo(bx, y + h * 0.98); c.stroke();
  c.setLineDash([]);
  const pinX = bx + w * 0.02;
  const pinY = y + h * 0.42;
  c.fillStyle = GOLD;
  c.beginPath();
  c.arc(pinX, pinY, 34, Math.PI, 0);
  c.lineTo(pinX + 34, pinY + 6);
  c.lineTo(pinX, pinY + 52);
  c.lineTo(pinX - 34, pinY + 6);
  c.closePath();
  c.fill();
  c.font = `34px ${FONT}`;
  c.textAlign = "center";
  c.fillText("🎁", pinX, pinY + 12);
  c.textAlign = "left";
  c.restore();
}

function heroGift(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "rgba(245, 183, 0, 0.16)");
  g.addColorStop(1, "rgba(110, 90, 255, 0.14)");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const confetti: [number, number, string][] = [[0.15, 0.15, "#f5b700"], [0.82, 0.2, "#6e5aff"], [0.25, 0.75, BLUE], [0.7, 0.7, "#1f9d55"], [0.5, 0.12, "#e0507a"], [0.88, 0.55, "#f5b700"], [0.1, 0.5, "#6e5aff"]];
  for (const [cx2, cy2, col] of confetti) {
    c.save();
    c.translate(x + w * cx2, y + h * cy2);
    c.rotate(cx2 * 4);
    c.fillStyle = col;
    c.fillRect(-9, -5, 18, 10);
    c.restore();
  }
  drawGiftBox(c, x + w / 2, y + h * 0.56, Math.min(w, h) * 0.42);
  c.restore();
}

function heroTickets(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#161b3a");
  g.addColorStop(1, "#232a55");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  drawTicketCard(c, x + w / 2 - w * 0.09, y + h * 0.48, w * 0.62, h * 0.24, -0.05);
  drawTicketCard(c, x + w / 2 + w * 0.09, y + h * 0.56, w * 0.62, h * 0.24, 0.05, true);
  c.restore();
}

function heroPhone(c: CanvasRenderingContext2D, box: HeroBox): void {
  const { x, y, w, h } = box;
  c.save();
  roundRect(c, x, y, w, h, 48);
  c.clip();
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#eef1fb");
  g.addColorStop(1, "#e2e7f7");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const pw = w * 0.44;
  const ph = h * 0.72;
  const px = x + w / 2 - pw / 2;
  const py = y + h * 0.14;
  c.fillStyle = INK;
  roundRect(c, px, py, pw, ph, 44);
  c.fill();
  const sw = pw * 0.9;
  const sh = ph * 0.94;
  const sx = px + (pw - sw) / 2;
  const sy = py + (ph - sh) / 2;
  c.fillStyle = "#ffffff";
  roundRect(c, sx, sy, sw, sh, 30);
  c.fill();
  c.fillStyle = "#eef1fa";
  roundRect(c, sx + 24, sy + 40, sw - 48, sh * 0.28, 18);
  c.fill();
  c.fillStyle = "#dfe4f5";
  roundRect(c, sx + 24, sy + sh * 0.42, sw - 48, 18, 9);
  c.fill();
  roundRect(c, sx + 24, sy + sh * 0.42 + 34, sw * 0.6, 18, 9);
  c.fill();
  c.fillStyle = "#f5b700";
  roundRect(c, sx + 24, sy + sh - 90, sw - 48, 60, 30);
  c.fill();
  c.fillStyle = INK;
  c.font = `600 26px ${FONT}`;
  c.textAlign = "center";
  c.fillText("Boshlash", sx + sw / 2, sy + sh - 52);
  c.textAlign = "left";
  c.restore();
}

const TEMPLATES: Record<OyinPosterTemplateKey, (c: CanvasRenderingContext2D, box: HeroBox, input: PosterInput) => Promise<void> | void> = {
  prize: heroPrize,
  city: heroCity,
  citygift: heroCityGift,
  dissolve: heroDissolve,
  network: heroNetwork,
  road: heroRoad,
  gift: heroGift,
  tickets: heroTickets,
  phone: heroPhone,
};

/** Posterni chizadi va PNG blob qaytaradi. */
export async function renderPoster(input: PosterInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return null;

  // ── fon: yorug', yuqorida yumshoq binafsha nur ──
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#f7f8fc");
  bg.addColorStop(0.45, "#f1f3fa");
  bg.addColorStop(1, "#eef1f9");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  const halo = c.createRadialGradient(W / 2, -120, 0, W / 2, -120, 900);
  halo.addColorStop(0, "rgba(110, 90, 255, 0.13)");
  halo.addColorStop(1, "rgba(110, 90, 255, 0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, W, 900);

  // ── brend qatori ──
  c.fillStyle = INK;
  c.font = `500 40px ${FONT}`;
  c.textBaseline = "alphabetic";
  c.fillText("BirJoy", PAD, 132);
  c.font = `500 30px ${FONT}`;
  c.fillStyle = GOLD_DEEP;
  const badge = "Sodiqlik dasturi";
  const bw = c.measureText(badge).width + 44;
  c.fillStyle = "#fff4d6";
  roundRect(c, W - PAD - bw, 96, bw, 52, 26);
  c.fill();
  c.fillStyle = GOLD_DEEP;
  c.fillText(badge, W - PAD - bw + 22, 132);

  // ── ASOSIY xabar — endi BOSHDA, hero-vizualdan OLDIN (20 ta rasmning umumiy joylashuviga mos) ──
  let y = 210;
  const hl = wrapText(c, input.headline, W - PAD * 2, 100, 700, 3);
  c.font = `700 ${hl.size}px ${FONT}`;
  c.fillStyle = GOLD_DEEP;
  for (const line of hl.lines) {
    y += hl.size * 1.14;
    c.fillText(line, PAD, y);
  }

  // ── hero-vizual: qolgan joyni QR-kartagacha (va ixtiyoriy sovrin-nomi/ism qatorlarigacha)
  //    to'ldiradi — headline uzunligidan qat'i nazar hech qachon ustma-ust tushmaydi. ──
  const qrBoxTop = H - PAD - 260;
  const hasPrizeLine = input.templateKey === "prize" && input.prizeName.trim().length > 0;
  const hasNameLine = input.name.trim().length > 0;
  const reserveBottom = (hasPrizeLine ? 106 : 0) + (hasNameLine ? 98 : 0) + 40;
  const heroY = y + 44;
  const heroH = Math.max(420, Math.min(760, qrBoxTop - reserveBottom - heroY));
  const heroBox: HeroBox = { x: PAD, y: heroY, w: W - PAD * 2, h: heroH };
  await TEMPLATES[input.templateKey]?.(c, heroBox, input);
  y = heroY + heroH;

  // ── sovrin nomi (faqat "prize" shablonida — mahsulot fotosi ostida qisqa izoh) ──
  if (hasPrizeLine) {
    y += 56;
    const pn = wrapText(c, input.prizeName, W - PAD * 2, 44, 500, 1);
    c.font = `500 ${pn.size}px ${FONT}`;
    c.fillStyle = INK_2;
    c.fillText(pn.lines[0] ?? "", PAD, y);
  }

  // ── ism ──
  if (hasNameLine) {
    y += 58;
    c.font = `400 36px ${FONT}`;
    c.fillStyle = INK_2;
    c.fillText(input.name.trim(), PAD, y);
  }

  // ── pastki blok: QR + chaqiriq + tiraj sanasi ──
  const boxH = 260;
  const boxY = H - PAD - boxH;
  c.fillStyle = CARD;
  roundRect(c, PAD, boxY, W - PAD * 2, boxH, 40);
  c.fill();

  const qrSize = 168;
  const qrX = PAD + 44;
  const qrY = boxY + 46;
  const qr = input.qrUrl ? await loadImage(input.qrUrl) : null;
  if (qr) {
    c.drawImage(qr, qrX, qrY, qrSize, qrSize);
  } else {
    c.fillStyle = "#f1f3fa";
    roundRect(c, qrX, qrY, qrSize, qrSize, 16);
    c.fill();
  }

  const tx = qrX + qrSize + 40;
  c.fillStyle = INK;
  c.font = `500 46px ${FONT}`;
  c.fillText("Sen ham qo'shil", tx, qrY + 62);
  c.fillStyle = INK_2;
  c.font = `400 32px ${FONT}`;
  c.fillText("Skanerla — bepul qatnash", tx, qrY + 112);
  c.fillStyle = GOLD_DEEP;
  c.font = `500 32px ${FONT}`;
  c.fillText(`Mukofot kuni: ${input.drawDate}`, tx, qrY + 164);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** PNG'ni telefon galereyasiga tushiradi (QR-stikerlar bilan bir xil naqsh). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
