// 📸 HIKOYA-POSTER generatori — 1080×1920 PNG, BRAUZERDA canvas bilan chiziladi.
//
// Nega serverda emas: serverda rasm-kutubxonasi yo'q (faqat `qrcode`), qo'shish esa yangi native
// bog'liqlik + VPS build muammosi degani. Canvas bepul, bir zumda va oflayn ishlaydi.
//
// ⚠️ Canvas "iflos" bo'lmasligi uchun HAR ikkala tashqi rasm O'Z domenimizdan olinadi
// (`/api/oyin/prizephoto`, `/api/oyin/qr`) va `crossOrigin="anonymous"` bilan yuklanadi.
// Iflos canvas'da `toBlob` ishlamaydi — ya'ni poster saqlanmay qolardi.
//
// Dizayn manbai: HIKOYA_POSTER_PLAN.md §DIZAYN BRIFI. Ranglar o'yin ekrani bilan bir xil
// (yorug' tema) — poster va ilova bitta tilda gapiradi.

export interface PosterInput {
  headline: string; // asosiy xabar (admin matni yoki mijoz yozgani)
  name: string; // mijoz ismi (bo'sh bo'lishi mumkin)
  prizeName: string;
  prizePhotoUrl: string | null; // /api/oyin/prizephoto?key=… yoki null
  prizeIcon: string; // emoji fallback
  qrUrl: string | null; // /api/oyin/qr?code=…
  drawDate: string; // "14-sentabr"
}

const W = 1080;
const H = 1920;
const INK = "#141a2e";
const INK_2 = "rgba(20, 26, 46, 0.62)";
const GOLD_DEEP = "#8a6207";
const CARD = "#ffffff";
const PAD = 84;

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
    c.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
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

/** Posterni chizadi va PNG blob qaytaradi. */
export async function renderPoster(input: PosterInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return null;

  // ── fon: yorug', yuqorida yumshoq binafsha nur (o'yin ekrani bilan bir xil) ──
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
  c.font = `500 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.textBaseline = "alphabetic";
  c.fillText("BirJoy", PAD, 132);
  c.font = `500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = GOLD_DEEP;
  const badge = "O'yin mavsumi";
  const bw = c.measureText(badge).width + 44;
  c.fillStyle = "#fff4d6";
  roundRect(c, W - PAD - bw, 96, bw, 52, 26);
  c.fill();
  c.fillStyle = GOLD_DEEP;
  c.fillText(badge, W - PAD - bw + 22, 132);

  // ── sovrin rasmi (qahramon, ~40% balandlik) ──
  const imgX = PAD;
  const imgY = 190;
  const imgW = W - PAD * 2;
  const imgH = 740;
  c.save();
  roundRect(c, imgX, imgY, imgW, imgH, 48);
  c.clip();
  const photo = input.prizePhotoUrl ? await loadImage(input.prizePhotoUrl) : null;
  if (photo) {
    // "cover": nisbatni saqlab, ramkani to'ldiradi
    const scale = Math.max(imgW / photo.width, imgH / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    c.drawImage(photo, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
  } else {
    // Rasm yo'q — RANGLI fon + katta emoji. Bo'sh kulrang kvadrat TAQIQ (DIZAYN_QOIDALARI #10).
    const g = c.createLinearGradient(imgX, imgY, imgX + imgW, imgY + imgH);
    g.addColorStop(0, "rgba(245, 183, 0, 0.18)");
    g.addColorStop(1, "rgba(110, 90, 255, 0.16)");
    c.fillStyle = g;
    c.fillRect(imgX, imgY, imgW, imgH);
    c.font = "300px system-ui, -apple-system, sans-serif";
    c.textAlign = "center";
    c.fillText(input.prizeIcon || "🎁", W / 2, imgY + imgH / 2 + 110);
    c.textAlign = "left";
  }
  c.restore();

  // ── sovrin nomi ──
  let y = imgY + imgH + 96;
  const pn = wrapText(c, input.prizeName, W - PAD * 2, 60, 500, 1);
  c.font = `500 ${pn.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = INK_2;
  c.fillText(pn.lines[0] ?? "", PAD, y);

  // ── ASOSIY xabar (yagona oltin urg'u) ──
  y += 40;
  const hl = wrapText(c, input.headline, W - PAD * 2, 104, 500, 3);
  c.font = `500 ${hl.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = GOLD_DEEP;
  for (const line of hl.lines) {
    y += hl.size * 1.12;
    c.fillText(line, PAD, y);
  }

  // ── ism ──
  if (input.name.trim()) {
    y += 62;
    c.font = `400 38px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
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
  c.font = `500 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillText("Sen ham qo'shil", tx, qrY + 62);
  c.fillStyle = INK_2;
  c.font = `400 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillText("Skanerla — bepul qatnash", tx, qrY + 112);
  c.fillStyle = GOLD_DEEP;
  c.font = `500 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.fillText(`Tiraj: ${input.drawDate}`, tx, qrY + 164);

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
