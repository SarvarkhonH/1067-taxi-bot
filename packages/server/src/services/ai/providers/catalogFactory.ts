// 🏭 Generic catalog-provider factory. A new searchable BirJoy module becomes AI-visible by
// supplying ONLY: how to fetch rows for a set of search terms, and how to render one row as a
// card (+ optional order/execute/status hooks). The factory owns the shared plumbing —
// query normalization, synonym + per-word term expansion, result limit — so a new provider is
// ~15 lines instead of a full adapter. This is the "ertaga funksiya qo'shilsa AI o'zidan biladi"
// mechanism: register the config in providers/index.ts and the agent picks it up at runtime.
import type { AiCard, AiProvider } from "./types";
import type { FeatureName } from "../../featureFlags";

export interface CatalogConfig {
  key: string; // enum value the LLM sees ("bazar", "reys", "elon"…)
  title: string; // short Uzbek description for the tool prompt
  flags: FeatureName[]; // ALL must be ON for the provider to appear
  synonyms?: Record<string, string>; // colloquial → catalog form ("basen"→"basseyn")
  stopWords?: string[]; // extra words to drop from the query when expanding terms
  minTermLen?: number; // default 3
  limit?: number; // default 6
  /** Module-specific: fetch candidate rows for the expanded terms (already normalized). */
  fetch: (terms: string[], limit: number) => Promise<AiCard[]>;
  order?: AiProvider["order"];
  execute?: AiProvider["execute"];
  status?: AiProvider["status"];
}

const DEFAULT_STOP = ["kerak", "uchun", "menga", "qayerda", "qanday", "bormi", "topib", "top", "yaxshi", "arzon", "eng"];

/** Query → candidate search terms: raw query + each significant word + synonym expansions. */
export function expandTerms(query: string, synonyms: Record<string, string> = {}, stopWords: string[] = [], minLen = 3): string[] {
  const stop = new Set([...DEFAULT_STOP, ...stopWords]);
  const words = query
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .split(/[^\p{L}\d']+/u)
    .filter((w) => w.length >= 2 && !stop.has(w));
  const set = new Set<string>();
  const q = query.trim();
  if (q.length >= minLen) set.add(q.toLowerCase());
  for (const w of words) {
    if (w.length >= minLen) set.add(w);
    if (synonyms[w]) set.add(synonyms[w]);
  }
  return [...set].slice(0, 6);
}

export function makeCatalogProvider(cfg: CatalogConfig): AiProvider {
  const limit = cfg.limit ?? 6;
  return {
    key: cfg.key,
    title: cfg.title,
    flags: cfg.flags,
    async search(query: string): Promise<AiCard[]> {
      const q = query.trim();
      if (q.length < 2) return [];
      const terms = expandTerms(q, cfg.synonyms, cfg.stopWords, cfg.minTermLen ?? 3);
      if (!terms.length) return [];
      return (await cfg.fetch(terms, limit)).slice(0, limit);
    },
    ...(cfg.order ? { order: cfg.order } : {}),
    ...(cfg.execute ? { execute: cfg.execute } : {}),
    ...(cfg.status ? { status: cfg.status } : {}),
  };
}
