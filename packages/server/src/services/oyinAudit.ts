// ══════════════════════════════════════════════════════════════════════════════════════════════
// 🧾 O'YIN AUDIT JURNALI — «kim nimani o'zgartirdi»
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Ega talabi (2026-08-10): «kengroq kirib boradigan, nazorat qiladigan bo'lsin».
//
// Muammo: eski panelda admin amallari HECH QAYERDA qolmasdi. Mukofot narxi 5 600 dan 6 300 ga
// ko'tarilgan bo'lsa — kim, qachon, nima uchun qilgani bilinmasdi. Ball tuzatish faqat mijozning
// o'z jurnalida (`oyin:adj:<id>`) ko'rinardi, ya'ni EGA uchun umumiy manzara yo'q edi.
//
// ⚠️ Bu «📜 faoliyat jurnali» (`oyinActivity`) BILAN CHALKASHTIRILMAYDI:
//   · faoliyat = MIJOZ ball voqealari → mijozning «ballim qayerdan keldi» savoliga javob
//   · audit    = ADMIN amallari       → eganing «kim o'zgartirdi» savoliga javob
// Ikkalasi ham kerak, biri ikkinchisini almashtirmaydi.
//
// SAQLASH: BITTA aylanma ro'yxat (`oyin:audit`), oxirgi OYIN_AUDIT_MAX yozuv. Har yozuv uchun
// alohida AppState qatori YARATILMAYDI — ARCHITECTURE.md §5 dagi «markerlar abadiy to'planadi»
// qarzini takrorlamaslik uchun. Yozuv CAS bilan (`mutateCatalog` naqshi): ikki admin bir vaqtda
// amal qilsa ham birortasi yo'qolmaydi.
//
// ⛔ NIMA YOZILMAYDI: telefon raqami, token, mijozning shaxsiy ma'lumoti. Jurnal ADMIN amallari
// haqida — mijoz ma'lumotlari bazasining ikkinchi nusxasi emas.
import { OYIN_AUDIT_MAX, type OyinAuditAction, type OyinAuditEntry } from "@t1067/shared";
import { prisma } from "../db";

const AUDIT_KEY = "oyin:audit";

function parseAudit(value: string | undefined): OyinAuditEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as OyinAuditEntry[]) : [];
  } catch {
    // Buzuq JSON — jurnal O'CHIRILMAYDI, bo'sh deb o'qiladi va keyingi yozuv ustiga tushadi.
    // (Yozuvni tashlab yuborish jurnalning butun ma'nosini yo'qotardi.)
    console.error("[oyin] audit: buzuq JSON — bo'sh ro'yxat sifatida o'qildi");
    return [];
  }
}

/** ✍️ Jurnalga yozish. HECH QACHON chaqiruvchini yiqitmaydi: audit yozilmagani uchun ega
 *  narxni o'zgartira olmay qolishi mantiqsiz bo'lardi. Xato faqat log'ga chiqadi. */
export async function writeAudit(entry: Omit<OyinAuditEntry, "at">): Promise<void> {
  const row: OyinAuditEntry = { ...entry, at: new Date().toISOString() };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const cur = await prisma.appState.findUnique({ where: { key: AUDIT_KEY } });
      // Eng yangisi BOSHIDA — panel birinchi sahifada eng so'nggi amalni ko'rsatadi.
      const next = [row, ...parseAudit(cur?.value)].slice(0, OYIN_AUDIT_MAX);
      const value = JSON.stringify(next);
      if (!cur) {
        await prisma.appState.create({ data: { key: AUDIT_KEY, value } });
        return;
      }
      const n = await prisma.$executeRaw`UPDATE "AppState" SET "value" = ${value} WHERE "key" = ${AUDIT_KEY} AND "value" = ${cur.value}`;
      if (n === 1) return;
      // n === 0 → orada boshqa admin yozdi, qayta o'qiymiz (yozuv ustma-ust tushadi, yo'qolmaydi)
    } catch (e) {
      console.error("[oyin] audit yozilmadi:", e);
      return;
    }
  }
  console.error("[oyin] audit: 5 urinishda ham yozilmadi —", row.action, row.target);
}

export interface OyinAuditFilter {
  action?: OyinAuditAction;
  /** Nomi/nishoni bo'yicha qidiruv (kichik harfga keltirilgan qism). */
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface OyinAuditPage {
  rows: OyinAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Jurnal to'lganmi — to'lgan bo'lsa eng eski yozuvlar chiqib ketgan, buni panel AYTADI
   *  (jimgina qisqargan ro'yxat = yolg'on to'liqlik hissi). */
  truncated: boolean;
}

export async function readAudit(filter: OyinAuditFilter = {}): Promise<OyinAuditPage> {
  const cur = await prisma.appState.findUnique({ where: { key: AUDIT_KEY } });
  const all = parseAudit(cur?.value);
  const q = (filter.q ?? "").trim().toLowerCase();
  const rows = all.filter((r) => {
    if (filter.action && r.action !== filter.action) return false;
    if (!q) return true;
    return r.target.toLowerCase().includes(q) || r.actor.toLowerCase().includes(q) || r.action.includes(q);
  });
  const pageSize = Math.min(200, Math.max(10, Math.round(filter.pageSize ?? 50)));
  const page = Math.max(1, Math.round(filter.page ?? 1));
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    truncated: all.length >= OYIN_AUDIT_MAX,
  };
}

/** 🔧 Yordamchi: ikki obyektni solishtirib FAQAT o'zgargan maydonlarni qaytaradi.
 *  Butun obyektni jurnalga tashlash jurnalni o'qib bo'lmaydigan qiladi. */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields: { key: string; label: string }[],
): { field: string; from: string; to: string }[] {
  const out: { field: string; from: string; to: string }[] = [];
  for (const f of fields) {
    const a = before ? before[f.key] : undefined;
    const b = after[f.key];
    const from = a === undefined || a === null ? "—" : String(a);
    const to = b === undefined || b === null ? "—" : String(b);
    if (from !== to) out.push({ field: f.label, from, to });
  }
  return out;
}
