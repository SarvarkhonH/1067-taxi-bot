// 📤 CSV eksport — YAGONA manba.
// Eski panelda eksport ~27 joyda qo'lda yozilgan edi: har biri o'z qochirish
// (escaping) qoidasi bilan, ba'zilari BOM'siz (Excel kirill/lotin harflarni
// buzardi), ba'zilari vergulli qiymatlarni umuman qochirmasdi.

/** RFC 4180 bo'yicha bitta katakni qochirish. */
function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // Vergul, qo'shtirnoq, yangi qator YOKI boshi/oxiri bo'sh joy bo'lsa — qo'shtirnoqqa olinadi
  return /[",\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
}

/** Faylni yuklab olish. BOM (﻿) MAJBURIY — usiz Excel UTF-8 ni tanimaydi
 *  va o'zbekcha matn ("o'g'il", "Chinor") krakozyabraga aylanadi. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Blob'ni darhol emas, keyingi tick'da bo'shatamiz — ba'zi brauzerlar
  // yuklashni boshlashga ulgurmay qolardi.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sana bilan fayl nomi: "odamlar-2026-07-30.csv" */
export function csvName(base: string): string {
  const d = new Date(Date.now() + 5 * 3600_000); // Toshkent
  return `${base}-${d.toISOString().slice(0, 10)}.csv`;
}
