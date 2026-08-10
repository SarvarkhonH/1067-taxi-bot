// 🛡 GUARD: o'yin konsolining `.oyinx` tokenlari v2 `:root` tokenlari bilan MOS turishi.
//
// Nega bu test `shared` da: CI qalqoni FAQAT `pnpm --filter @t1067/shared test` ni yurgizadi
// (ci.yml:40). Boshqa joyga qo'yilsa hech qachon ishlamasdi.
//
// Nega umuman kerak: konsol v1 panel ichida quriladi, v2 `design/tokens.css` esa `:root` da
// yozadi va eski `styles.css` bilan BESH o'zgaruvchi ustida to'qnashadi (`--bg --line --ok
// --bad --text`) — import qilsak eski panelning 33 tabi qayta bo'yalardi. Shuning uchun
// tokenlar `oyin/oyin.css` da `.oyinx` doirasida NUSXALANGAN. Nusxa esa vaqt o'tib
// ASL NUSXADAN AJRALIB KETADI. Bu test aynan shuni ushlaydi.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const admin = resolve(here, "../../../admin/src");
const read = (p: string): string => readFileSync(resolve(admin, p), "utf8");

/** Bitta CSS blokdagi `--nom: qiymat;` juftliklari. */
function varsIn(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selektor topilmadi: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const block = css.slice(open + 1, close);
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    // Qiymatdan keyingi izohni tashlaymiz: `tokens.css` da `--ctrl-h: 34px; /* … */` shaklida
    // yozilgan va izoh bilan solishtirish soxta farq berardi.
    out.set(m[1]!, m[2]!.replace(/\/\*[\s\S]*?\*\//g, "").trim());
  }
  return out;
}

describe("oyin konsoli — token nusxasi asl nusxadan ajralib ketmasin", () => {
  const root = varsIn(read("design/tokens.css"), ":root {");
  const scoped = varsIn(read("oyin/oyin.css"), ".oyinx {");

  it("konsol e'lon qilgan HAR token v2 tokenlarida ham bor", () => {
    const missing = [...scoped.keys()].filter((k) => !root.has(k));
    expect(missing).toEqual([]);
  });

  it("umumiy tokenlarning QIYMATI aynan bir xil", () => {
    const drifted: string[] = [];
    for (const [k, v] of scoped) {
      const rv = root.get(k);
      if (rv !== undefined && rv !== v) drifted.push(`${k}: konsol="${v}" vs tokens="${rv}"`);
    }
    expect(drifted).toEqual([]);
  });

  it("rang/o'lcham uchun yetarli token ko'chirilgan (bo'sh nusxa emas)", () => {
    expect(scoped.size).toBeGreaterThan(50);
    for (const must of ["--bg", "--surface", "--text", "--brand", "--coin", "--ok", "--warn", "--bad", "--line"]) {
      expect(scoped.has(must)).toBe(true);
    }
  });
});

describe("eski panel bo'yog'i himoyalangan (D0)", () => {
  // ⚠️ IZOHLAR TASHLANADI: fayl izohida `:root` so'zi ATAYLAB bor (nega undan qochilgani
  // tushuntirilgan). Tekshiruv KODGA tegishli, matnga emas — aks holda izoh yozgani uchun
  // test yiqilardi va keyingi odam izohni o'chirib qo'yardi.
  const css = read("oyin/oyin.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("konsol CSS'ida `:root` YO'Q — aks holda 33 ta eski tab qayta bo'yalardi", () => {
    expect(css.includes(":root")).toBe(false);
  });

  it("`html`/`body` ga global qoida YO'Q", () => {
    expect(/^\s*(html|body)\b/m.test(css)).toBe(false);
  });

  it("har qoida `.oyinx` doirasida (`@`-qoidalar va davomiy selektorlardan tashqari)", () => {
    const bad: string[] = [];
    for (const line of css.split("\n")) {
      const t = line.trim();
      // Faqat selektor QATORI tekshiriladi: `{` bilan tugaydi yoki `,` bilan davom etadi.
      if (!t || t.startsWith("/*") || t.startsWith("*") || t.startsWith("@") || t.startsWith("}")) continue;
      if (!/[{,]\s*$/.test(t)) continue;
      const sel = t.replace(/[{,]\s*$/, "").trim();
      if (!sel || sel.startsWith("from") || sel.startsWith("to") || /^\d/.test(sel)) continue;
      if (!sel.includes(".oyinx") && !sel.startsWith(".oy-")) bad.push(sel);
    }
    expect(bad).toEqual([]);
  });

  it("`.oy-` prefiksli sinflar eski `styles.css` sinflari bilan to'qnashmaydi", () => {
    const legacy = read("styles.css");
    const legacyClasses = new Set([...legacy.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!));
    const mine = new Set([...css.matchAll(/\.(oy-[a-z0-9-]+|oyinx)/g)].map((m) => m[1]!));
    const clash = [...mine].filter((c) => legacyClasses.has(c));
    expect(clash).toEqual([]);
  });
});
