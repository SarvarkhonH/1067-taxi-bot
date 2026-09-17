import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript";

// --- Why this file exists ----------------------------------------------------
//
// Part B, P0-1 (owner decision 2026-09-17): what a passenger reads on the taxi
// screen is true, and their position goes nowhere but our own servers. Three
// things were not, and each would come back looking harmless in a diff:
//
//   1. "Shabada yaqinida" on the answer card — the car does not go to Shabada,
//      it goes to the pin. The honest answer is "Xaritada belgilangan joy".
//   2. "Aniqlik ~800 m" — a distance in metres, which the passenger cannot act
//      on and which the owner ruled out (Q3: no distances anywhere).
//   3. the route line fetched from the public router.project-osrm.org, which
//      sent the passenger's pickup and the driver's position to a stranger's
//      server on every position update.
//
// The Mini App has no test runner of its own, so this reads its source.
// (A remembered map pin keeps the server's descriptive name, e.g. "Shabada
// yaqini" in the recent list: that is a true description of where the pin was,
// and the server package is not scanned here.)

const MINIAPP = path.join(__dirname, "..", "..", "..", "miniapp", "src");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Source with comments removed, so an explanation of the old bug does not trip the guard.
 * NOTE: the printer writes non-ASCII characters as \u escapes — keep every guard pattern ASCII.
 * The
 * TypeScript parser decides what a comment is: a regex got it wrong on a CRLF checkout and would
 * for strings such as "image/*".
 */
function code(file: string): string {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

const files = walk(MINIAPP);
const hits = (re: RegExp) =>
  files.filter((f) => re.test(code(f))).map((f) => path.relative(MINIAPP, f));

describe("the taxi screen only says what is true", () => {
  it("finds the Mini App source", () => {
    expect(files.some((f) => f.endsWith("booking3.tsx"))).toBe(true);
  });

  it("strips comments but keeps strings, on CRLF too", () => {
    const tmp = path.join(os.tmpdir(), `stripcheck-${process.pid}.tsx`);
    fs.writeFileSync(
      tmp,
      'const a = "image/*";\r\n// yaqinida\r\nconst b = "keep"; /* osrm */\r\nconst c = <div>{/* Aniqlik ~5 m */}</div>;\r\n',
    );
    try {
      const out = code(tmp);
      expect(out).toContain('"image/*"');
      expect(out).toContain('"keep"');
      expect(out).not.toMatch(/yaqinida|osrm|Aniqlik/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("never hedges a place name with 'yaqini' / 'yaqinida' / 'yaqinidagi'", () => {
    // "Yaqinim" (my relative, the family feature) is a different word and must not trip this.
    expect(hits(/\byaqini(da|dagi)?\b/i)).toEqual([]);
  });

  it("never shows GPS accuracy in metres", () => {
    expect(hits(/Aniqlik\s*~|aniqlik[^"'`]{0,24}\$\{[^}]*\}\s*m\b/i)).toEqual([]);
  });

  it("never sends a position to an outside routing server", () => {
    expect(hits(/osrm|\/route\/v1\/|openrouteservice|graphhopper|valhalla|api\.mapbox\.com\/directions/i)).toEqual([]);
  });
});
