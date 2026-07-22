// 🧮 Rules-first arithmetic (feature "aihisob") — resolves BEFORE any LLM call, so
// user-typed numbers never meet sanitize()'s digit-stripping and it works even when
// Groq is down or caps are hit. Safe recursive-descent evaluator: + − × ÷ % and
// parentheses only. NO eval, NO LLM, NO access to any member data.

// Uzbek word-forms handled by rewriting to infix first:
//   "45000 ni 3 ga bo'l"        → 45000/3
//   "45000 ni 3 ga ko'paytir"   → 45000*3
//   "45000 ga 3000 ni qo'sh"    → 45000+3000
//   "45000 dan 3000 ni ayir"    → 45000-3000
//   "200000 ning 15 foizi"      → 200000*15/100

interface Tok {
  v: string;
}

function normalize(raw: string): string | null {
  let t = raw
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  // thousands separators inside numbers: "1 200 000" / "1,200,000" / "1.200.000" are risky
  // (dot is also decimal) — only join space-separated 3-digit groups and comma groups.
  t = t.replace(/(\d)[ ,](?=\d{3}\b)/g, "$1");
  // word-money: "45 ming" → 45000, "1.5 mln/million" → 1500000
  t = t.replace(/(\d+(?:\.\d+)?)\s*ming\b/g, (_, n: string) => String(Number(n) * 1000));
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:mln|million|milion)\b/g, (_, n: string) => String(Number(n) * 1_000_000));

  // percent: "X ning Y foizi" / "X ni(ng) Y %"
  let m = /(\d+(?:\.\d+)?)\s*(?:ning|ni)\s+(\d+(?:\.\d+)?)\s*(?:foiz(?:i|ini)?|%)/.exec(t);
  if (m) return `${m[1]}*${m[2]}/100`;
  // "X ni Y ga bo'l/bo'lsak/bo'lganda"
  m = /(\d+(?:\.\d+)?)\s*ni\s+(\d+(?:\.\d+)?)\s*(?:ga|kishiga|taga|ovga|ovimizga)?\s*(?:teng\s*)?bo'l/.exec(t);
  if (m) return `${m[1]}/${m[2]}`;
  m = /(\d+(?:\.\d+)?)\s*ni\s+(\d+(?:\.\d+)?)\s*ga\s*ko'paytir/.exec(t);
  if (m) return `${m[1]}*${m[2]}`;
  m = /(\d+(?:\.\d+)?)\s*ga\s+(\d+(?:\.\d+)?)\s*ni\s*qo'sh/.exec(t);
  if (m) return `${m[1]}+${m[2]}`;
  m = /(\d+(?:\.\d+)?)\s*dan\s+(\d+(?:\.\d+)?)\s*ni\s*ayir/.exec(t);
  if (m) return `${m[1]}-${m[2]}`;

  // plain infix: strip currency words then require it to look like an expression
  const expr = t
    .replace(/\b(so'm|som|сум|tanga|necha|qancha|bo'ladi|chiqadi|hisobla|\?|=)\b/g, " ")
    .replace(/[x×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[^0-9+\-*/().% ]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!expr) return null;
  if (!/^[0-9+\-*/().%]+$/.test(expr)) return null;
  if (!/\d/.test(expr) || !/[+\-*/%]/.test(expr)) return null; // must be an actual operation
  return expr;
}

// recursive-descent: expr := term (('+'|'-') term)* ; term := factor (('*'|'/'|'%') factor)* ;
// factor := number | '(' expr ')' | '-' factor
function evaluate(expr: string): number | null {
  const toks: Tok[] = [];
  const re = /\d+(?:\.\d+)?|[+\-*/()%]/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(expr))) toks.push({ v: mm[0] });
  let i = 0;
  const peek = (): string | undefined => toks[i]?.v;
  const next = (): string | undefined => toks[i++]?.v;

  function factor(): number | null {
    const v = next();
    if (v === undefined) return null;
    if (v === "-") {
      const f = factor();
      return f === null ? null : -f;
    }
    if (v === "(") {
      const e = exprFn();
      if (e === null || next() !== ")") return null;
      return e;
    }
    if (/^\d/.test(v)) return Number(v);
    return null;
  }
  function term(): number | null {
    let left = factor();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const right = factor();
      if (right === null) return null;
      if (op === "*") left *= right;
      else if (op === "/") {
        if (right === 0) return null;
        left /= right;
      } else left %= right;
    }
    return left;
  }
  function exprFn(): number | null {
    let left = term();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = term();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  const out = exprFn();
  return i === toks.length && out !== null && Number.isFinite(out) ? out : null;
}

/** Try to answer a message as pure arithmetic. Null = not an arithmetic message. */
export function tryCalc(raw: string): string | null {
  if (raw.length > 120) return null;
  const expr = normalize(raw);
  if (!expr) return null;
  const val = evaluate(expr);
  if (val === null) return null;
  const rounded = Math.abs(val - Math.round(val)) < 1e-9 ? Math.round(val) : Math.round(val * 100) / 100;
  const shown = expr.replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\+/g, " + ").replace(/-/g, " − ");
  return `🧮 ${shown} = <b>${rounded.toLocaleString("ru-RU")}</b>`;
}
