// 🔐 K1 (2026-08-14, OYIN_KARTA_PLAN.md §1) — ko'rinadigan karta raqami.
//
// Ichkarida `gno` (oddiy ketma-ket hisoblagich, `nextGlobalTicketNo`) O'ZGARMAYDI — u ATOMIK,
// isbotlangan (S7-3, poyga-himoyalangan RETURNING so'rovi). Tashqariga chiqadigan raqam esa
// shu `gno`ning Feistel almashtirishi + Luhn nazorat raqami:
//   · Feistel — ketma-ketlikni yashiradi (729480/729481 ketma-ket sotib olinganini oshkor
//     qilmaydi, tasodifiy ko'rinadi).
//   · Luhn — og'zaki o'qish/yozishdagi xatoni (bitta noto'g'ri raqam, ikkita almashtirilgan
//     raqam) 100% ushlaydi — KLIENTDA, serverga so'rov yubormasdan.
//
// Format: "KO-XXX-XXX-XXXX" — 10 xona (9 Feistel + 1 Luhn), plandagi namunaga mos.
//
// Maxfiy kalit ENV'DA EMAS: bir marta tasodifiy generatsiya qilinib AppState'da saqlanadi
// (`nextGlobalTicketNo` bilan BIR XIL bootstrap-naqsh) — deploy uchun qo'lda sozlash shart emas,
// kalit hech qachon klientga yoki logga chiqmaydi.

import crypto from "node:crypto";
import { prisma } from "../db";

const DOMAIN = 1_000_000_000; // 10^9 — 9 xonali chiqish oralig'i
const HALF_BITS = 15; // 2×15 = 30 bit >= 10^9 (2^30 = 1 073 741 824)
const HALF_MASK = (1 << HALF_BITS) - 1;
const ROUNDS = 4;

let cachedSecret: Buffer | null = null;

async function getSecret(): Promise<Buffer> {
  if (cachedSecret) return cachedSecret;
  const key = "oyin:cardcodesecret";
  const row = await prisma.appState.findUnique({ where: { key } });
  if (row?.value) {
    cachedSecret = Buffer.from(row.value, "hex");
    return cachedSecret;
  }
  const fresh = crypto.randomBytes(32);
  try {
    await prisma.appState.create({ data: { key, value: fresh.toString("hex") } });
    cachedSecret = fresh;
  } catch {
    // 🛡 Poyga: parallel so'rov bizdan OLDIN yozgan bo'lishi mumkin — o'sha yozuvni o'qib olamiz
    // (aks holda ikki jarayon ikki xil kalit ishlatib, bir xil gno ikki xil kod chiqarardi).
    const row2 = await prisma.appState.findUnique({ where: { key } });
    cachedSecret = row2?.value ? Buffer.from(row2.value, "hex") : fresh;
  }
  return cachedSecret;
}

function roundFn(half: number, round: number, secret: Buffer): number {
  const h = crypto.createHmac("sha256", secret).update(`${round}:${half}`).digest();
  return h.readUInt32BE(0) & HALF_MASK;
}

/** Bitta Feistel-tarmoq bosqichi — istalgan `roundFn` uchun har doim qaytariladigan
 *  (invertible), garchi `roundFn` o'zi qaytarilmasa ham — Feistel tuzilishining o'zi shuni
 *  kafolatlaydi. */
function feistelForward(x: number, secret: Buffer): number {
  let l = x >>> HALF_BITS;
  let r = x & HALF_MASK;
  for (let round = 0; round < ROUNDS; round++) {
    const f = roundFn(r, round, secret);
    const nl = r;
    const nr = (l ^ f) & HALF_MASK;
    l = nl;
    r = nr;
  }
  return ((l << HALF_BITS) | r) >>> 0;
}
function feistelBackward(x: number, secret: Buffer): number {
  let l = x >>> HALF_BITS;
  let r = x & HALF_MASK;
  for (let round = ROUNDS - 1; round >= 0; round--) {
    const f = roundFn(l, round, secret);
    const nr = l;
    const nl = (r ^ f) & HALF_MASK;
    l = nl;
    r = nr;
  }
  return ((l << HALF_BITS) | r) >>> 0;
}

/** 🔁 Cycle-walking (Black–Rogaway FPE naqshi): 2^30 to'liq fazoda Feistel BIYEKSIYA,
 *  lekin bizga faqat [0, DOMAIN) kerak. Natija domendan chiqsa — domenga qaytguncha
 *  QAYTA almashtiriladi. DOMAIN/2^30 ≈ 0.93 bo'lgani uchun o'rtacha ~1.07 urinish — tez.
 *  Forward va backward bir xil orbitani teskari yo'nalishda bosib o'tadi, shuning uchun
 *  juft funksiya HAQIQIY teskari bo'lib qoladi (pastdagi test skripti bilan tasdiqlangan). */
export function permuteForward(x: number, secret: Buffer): number {
  let y = x;
  do { y = feistelForward(y, secret); } while (y >= DOMAIN);
  return y;
}
export function permuteBackward(y: number, secret: Buffer): number {
  let x = y;
  do { x = feistelBackward(x, secret); } while (x >= DOMAIN);
  return x;
}

export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false; // eng o'ngdagi (nazorat) raqam ikkilanmaydi
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** `gno` → "KO-XXX-XXX-XXXX". Server-ichi funksiyalar uchun (myTickets, karta sahifasi). */
export async function encodeCardCode(gno: number): Promise<string> {
  const secret = await getSecret();
  const permuted = permuteForward(Math.max(0, Math.trunc(gno)), secret);
  const nine = String(permuted).padStart(9, "0");
  const check = luhnCheckDigit(nine);
  const ten = nine + String(check);
  return `KO-${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6, 10)}`;
}

/** "KO-XXX-XXX-XXXX" (yoki bo'sh joy/tire farqisiz variantlar) → `gno`, yoki `null` (Luhn
 *  mos kelmasa — mijoz xato terdi, serverga umuman yuborilmasin, ANIQ shu sabab bilan). */
export async function decodeCardCode(codeRaw: string): Promise<number | null> {
  const digits = codeRaw.toUpperCase().replace(/^KO[-\s]?/, "").replace(/[^0-9]/g, "");
  if (digits.length !== 10) return null;
  if (!luhnValid(digits)) return null;
  const nine = Number(digits.slice(0, 9));
  const secret = await getSecret();
  return permuteBackward(nine, secret);
}
