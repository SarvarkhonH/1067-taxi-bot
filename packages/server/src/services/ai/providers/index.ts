// 🏙 Koson AI provider registry. Static imports register the built-in providers; a new
// city service = write its provider file + add ONE import line here. activeProviders()
// re-checks feature flags on every call (30s flag cache underneath) so a DARK module's
// provider is invisible to the LLM the moment its flag goes off.
import { featureOn } from "../../featureFlags";
import type { AiProvider } from "./types";
import { restoranProvider } from "./restoranProvider";
import { xizmatProvider } from "./xizmatProvider";

const REGISTRY: AiProvider[] = [];

export function register(p: AiProvider): void {
  if (REGISTRY.some((r) => r.key === p.key)) throw new Error(`AiProvider dup key: ${p.key}`);
  REGISTRY.push(p);
}

/** TEST-ONLY: inject a stub provider (testCity.ts drives the generic pipeline with it). */
export function __registerForTest(p: AiProvider): void {
  const i = REGISTRY.findIndex((r) => r.key === p.key);
  if (i >= 0) REGISTRY.splice(i, 1);
  REGISTRY.push(p);
}

export async function activeProviders(): Promise<AiProvider[]> {
  const out: AiProvider[] = [];
  for (const p of REGISTRY) {
    const gates = await Promise.all(p.flags.map((f) => featureOn(f)));
    if (gates.every(Boolean)) out.push(p);
  }
  return out;
}

export function providerByKey(key: string): AiProvider | undefined {
  return REGISTRY.find((p) => p.key === key);
}

register(restoranProvider);
register(xizmatProvider);
