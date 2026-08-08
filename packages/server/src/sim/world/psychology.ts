// 🧠 Xulq-iqtisod sof funksiyalari — agent-qarorlarning psixologik yadrosi.
// Har formula adabiyotdan olingan (manba har funksiya tepasida). DB/rng YO'Q — faqat matematik
// xarita: kirish-son → chiqish-son. market.ts va oyin-modullari shulardan quradi.

/** Kahneman-Tversky (1992): ehtimol-og'irlik w(p)=p^γ/(p^γ+(1−p)^γ)^(1/γ) — kichik p ortiqcha his qilinadi. */
export function prospectWeight(p: number, gamma = 0.61): number {
  const pc = Math.min(1, Math.max(0, p));
  if (pc === 0) return 0;
  if (pc === 1) return 1;
  const num = Math.pow(pc, gamma);
  const den = Math.pow(num + Math.pow(1 - pc, gamma), 1 / gamma);
  return num / den;
}

/** Kahneman-Tversky qiymat-funksiya: w(p)·win^α − λ·cost^α (α=0.88; yo'qotish λ barobar og'riqli). */
export function prospectValue(win: number, cost: number, pWin: number, lambda = 2.25): number {
  const ALPHA = 0.88;
  const gain = prospectWeight(pWin) * Math.pow(Math.max(0, win), ALPHA);
  const loss = lambda * Math.pow(Math.max(0, cost), ALPHA);
  return gain - loss;
}

/** Laibson (1997) kvazi-giperbolik β-δ diskont: bugun=1, keyingi kunlar β·δ^kun (hozir-moyillik). */
export function presentBiasDiscount(daysUntil: number, beta = 0.7, delta = 0.99): number {
  if (daysUntil <= 0) return 1;
  return beta * Math.pow(delta, daysUntil);
}

/** Skinner (operant): near-miss — sovrin deyarli to'lganda qo'zg'alish o'sadi; multiplikator ≥1. */
export function nearMissBoost(soldPct: number): number {
  const s = Math.min(1, Math.max(0, soldPct));
  if (s < 0.5) return 1;
  return 1 + Math.pow((s - 0.5) / 0.5, 2) * 0.8; // 50%dan keyin kvadratik, maks +80%
}

/** Cialdini: social proof — yaqin-atrofdagi yutuqlar log-to'yinish bilan ishonchni oshiradi (≥1). */
export function socialProofBoost(recentWinsNearby: number, beta: number): number {
  return 1 + Math.max(0, beta) * Math.log1p(Math.max(0, recentWinsNearby));
}

/** Fogg B=MAP: xulq faqat prompt BOR va motivatsiya×qobiliyat ostonadan oshganda yuz beradi. */
export function foggGate(
  motivation: number,
  ability: number,
  hasPrompt: boolean,
  threshold: number,
): boolean {
  if (!hasPrompt) return false;
  return motivation * ability >= threshold;
}
