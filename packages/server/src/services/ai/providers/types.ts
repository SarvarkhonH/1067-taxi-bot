// 🏙 Koson AI K1 — universal provider interface. The AI CORE knows no module: a new
// city service becomes AI-visible by shipping ONE file that implements AiProvider and
// registering it in providers/index.ts. The core guarantees (confirm-card before any
// order, PII stays server-side, flag-gating) live in the core — providers cannot skip them.
import type { FeatureName } from "../../featureFlags";

/** One search result the bot renders as a card line + optional inline buttons. */
export interface AiCard {
  id: string; // provider-internal id (menuItemId, listingId…) — used by order flows
  title: string; // "Osh — Milliy Taomlar"
  subtitle?: string; // "56 000 so'm · ⭐ 4.8 · Ochiq"
  buttons?: { text: string; data: string }[]; // ready callback_data (provider-owned handlers)
}

/** Confirm-card for an order — shown with core-owned [✅]/[✖️]; ✅ runs execute(payload). */
export interface ConfirmCard {
  html: string; // full order summary the human approves
  payload: string; // opaque provider payload (JSON) — replayed to execute() on ✅
}

export interface AiProvider {
  key: string; // enum value the LLM sees: "restoran" | "xizmat" | "bazar" | …
  title: string; // short Uzbek description for the tool prompt
  flags: FeatureName[]; // ALL must be ON for the provider to appear (module flag + own flag)
  /** Top-N public catalog matches. NO member data in, only public data out. */
  search(query: string): Promise<AiCard[]>;
  /** Optional: build a confirm-card. extra = free-text like a delivery address. */
  order?(memberId: number, tgId: string, item: string, qty: number, extra: string): Promise<ConfirmCard | { error: string }>;
  /** Optional: run the CONFIRMED order (only ever called after the human ✅ tap). */
  execute?(memberId: number, tgId: string, payload: string): Promise<{ ok: boolean; message: string }>;
  /** Optional: member's latest order status in this domain (rendered server-side). */
  status?(memberId: number): Promise<string | null>;
}
