// 🎲 Seeded PRNG (mulberry32) — determinizm-kafolati: bir seed = bit-aynan bir olam.
// Math.random TAQIQ sim-kodda (reproduktivlikni buzadi); har olam o'z urug'i bilan ochiladi,
// har agent-qaror shu oqimdan oladi. B6/P1-DoD: bir seed 2× yugurtirilsa metrics-hash bir xil.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Satr-seeddan raqamli seed (xorshift-aralash) — konfigda odam o'qiy oladigan seed yozish uchun. */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** [0,1) dan tashqari qulayliklar — hammasi bitta oqimdan, tartib muhim (determinizm). */
export function rngInt(rng: Rng, minIncl: number, maxIncl: number): number {
  return minIncl + Math.floor(rng() * (maxIncl - minIncl + 1));
}

export function rngPick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("[rng] bo'sh ro'yxatdan tanlab bo'lmaydi");
  return arr[Math.floor(rng() * arr.length)]!;
}

export function rngBool(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Normal-taqsimot (Box-Muller) — trait-shovqin uchun. */
export function rngGauss(rng: Rng, mean = 0, std = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 0..1 oralig'iga qisilgan gauss — trait qiymatlari uchun. */
export function rngTrait(rng: Rng, mean: number, std: number): number {
  return Math.min(1, Math.max(0, rngGauss(rng, mean, std)));
}

/** Puasson (kichik lambda uchun Knuth usuli) — kunlik hodisa-sonlari. */
export function rngPoisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}
