// 🔢 Formatlovchilar — YAGONA manba. Eski panelda har ko'rinish o'z
// `toLocaleString` variantini yozgan (ba'zi joyda "ru-RU", ba'zi joyda yo'q),
// natijada bir xil raqam turli ekranda turlicha ko'rinardi.

/** 1234567 → "1 234 567" (bo'sh joy — o'zbek/rus konvensiyasi, vergul EMAS). */
export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
}

/** Kasrli raqam (baho, foiz koeffitsienti). */
export function dec(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** So'm: "1 234 567 so'm". */
export function som(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${num(n)} so'm`;
}

/** Tanga: "14 190 tanga". 1 tanga = 1 so'm, lekin UI'da ATAYLAB farqlanadi
 *  (CLAUDE.md: «coin» so'zi yo'q — hamma joyda «tanga»). */
export function tanga(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${num(n)} tanga`;
}

/** Katta summani qisqartirish — StatCard uchun ("2.1 mln"). */
export function short(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mlrd`;
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)} mln`;
  if (a >= 10_000) return `${Math.round(n / 1000)} ming`;
  return num(n);
}

/** Foiz: 0.1234 → "12.3%" (nisbat kiritiladi, 0-100 EMAS). */
export function pct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Tayyor foizni formatlash: 12.34 → "12.3%". */
export function pctRaw(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

const TZ_OFFSET_MS = 5 * 3600_000; // Toshkent UTC+5 — server ham shu shkalada hisoblaydi

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "30.07, 14:05" — jadval/suhbat uchun asosiy sana formati. */
export function dt(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  const t = new Date(d.getTime() + TZ_OFFSET_MS);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}, ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** Faqat sana: "30.07.2026". */
export function d(v: string | number | Date | null | undefined): string {
  const dd = toDate(v);
  if (!dd) return "—";
  const t = new Date(dd.getTime() + TZ_OFFSET_MS);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** "5 daq oldin" / "2 soat oldin" / "3 kun oldin" — jonli ro'yxatlar uchun. */
export function ago(v: string | number | Date | null | undefined): string {
  const dd = toDate(v);
  if (!dd) return "—";
  const s = Math.floor((Date.now() - dd.getTime()) / 1000);
  if (s < 0) return "hozir";
  if (s < 60) return `${s} sek oldin`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daq oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  const dys = Math.floor(h / 24);
  if (dys < 30) return `${dys} kun oldin`;
  return d(dd);
}

/** Daqiqani inson-o'qiy shaklga: 143 → "2s 23daq" (dashboard "yoshi" ustuni). */
export function mins(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const m = Math.max(0, Math.round(n));
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}s ${rest}daq` : `${h} soat`;
}

/** Telefon: "+998901234567" → "+998 90 123 45 67". */
export function phone(p: string | null | undefined): string {
  if (!p) return "—";
  const dg = p.replace(/\D/g, "");
  const m = /^998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(dg);
  if (m) return `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  const m9 = /^(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(dg);
  if (m9) return `+998 ${m9[1]} ${m9[2]} ${m9[3]} ${m9[4]}`;
  return p;
}

/** Nisbiy o'zgarish: bugun vs oldin → {pct, dir}. `prev` 0 bo'lsa nisbat
 *  ma'nosiz (∞) — shuning uchun `null` qaytadi va UI "—" ko'rsatadi. */
export function delta(today: number, prev: number): { pct: number | null; dir: "up" | "down" | "flat" } {
  if (!Number.isFinite(today) || !Number.isFinite(prev)) return { pct: null, dir: "flat" };
  if (prev === 0) return { pct: null, dir: today > 0 ? "up" : "flat" };
  const change = ((today - prev) / Math.abs(prev)) * 100;
  return { pct: change, dir: Math.abs(change) < 0.5 ? "flat" : change > 0 ? "up" : "down" };
}
