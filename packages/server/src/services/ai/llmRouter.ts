// 🤖 AI layer transport — FREE-tier LLM router with auto-failover.
// Provider chain: Gemini Flash → Groq → OpenRouter(free) → Mistral. Each is an
// external HTTP call (NO local models — tiny VPS rule). With no keys set the
// router returns null and every caller falls back to rules/buttons — the
// whole AI layer ships DISABLED until the owner adds free keys.
// PRIVACY (hard rule): callers must never pass phone numbers, names or
// balances; sanitize() strips long digit runs as a second line of defense.
import { prisma } from "../../db";

// 2026-07-23: raised after the real per-call cost was measured from actual Gemini billing
// (~$0.0025/call, Tier 1 paid) — 30/day per member was hit by ONE active real user in a single
// day now that the AI is the ONLY interface (no buttons), and the cost at these caps is still
// small (worst case ~100×$0.0025≈$0.25/member/day, ~3000×$0.0025≈$7.5/day company-wide). Revisit
// again as real DAU grows toward the owner's 10k-user target — these are NOT sized for that scale.
const DAILY_GLOBAL_CAP = 3000;
const DAILY_MEMBER_CAP = 100;

interface Provider {
  name: string;
  key: string | undefined;
  call: (key: string, prompt: string, system: string) => Promise<string | null>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const PROVIDERS: Provider[] = [
  {
    name: "gemini",
    key: process.env.GEMINI_API_KEY,
    call: async (key, prompt, system) => {
      const d = (await postJson(
        // gemini-flash-latest: 2026 free-tier kalitlarda 2.0-flash kvotasi 0 (agent.ts'dagi probe)
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
        {},
        { systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }] },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return d.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    },
  },
  {
    name: "groq",
    key: process.env.GROQ_API_KEY,
    call: async (key, prompt, system) => {
      const d = (await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${key}` },
        { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: 400 },
      )) as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content ?? null;
    },
  },
  {
    name: "openrouter",
    key: process.env.OPENROUTER_API_KEY,
    call: async (key, prompt, system) => {
      const d = (await postJson(
        "https://openrouter.ai/api/v1/chat/completions",
        { Authorization: `Bearer ${key}` },
        { model: "meta-llama/llama-3.3-70b-instruct:free", messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: 400 },
      )) as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content ?? null;
    },
  },
  {
    name: "mistral",
    key: process.env.MISTRAL_API_KEY,
    call: async (key, prompt, system) => {
      const d = (await postJson(
        "https://api.mistral.ai/v1/chat/completions",
        { Authorization: `Bearer ${key}` },
        { model: "mistral-small-latest", messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: 400 },
      )) as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content ?? null;
    },
  },
];

export function llmAvailable(): boolean {
  return PROVIDERS.some((p) => !!p.key);
}

/** Strip anything that could identify a member before it leaves our server. */
export function sanitize(text: string): string {
  return text.replace(/\d{6,}/g, "[raqam]").slice(0, 500);
}

async function dayCount(key: string): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key } });
  return row ? Number(row.value) || 0 : 0;
}

async function bumpDay(key: string): Promise<void> {
  // T0.5 (AUDIT 3.11): atomic raw upsert — parallel chaqiriqlarda cap aniq
  const { atomicIncrement } = await import("../appStateUtil");
  await atomicIncrement(key, 1);
}

/** Shared daily-cap gate (agent + askLlm draw from the SAME counters). */
export async function aiCapOk(memberId: number): Promise<boolean> {
  const day = aiDay();
  if ((await dayCount(`ai_used:${day}`)) >= DAILY_GLOBAL_CAP) return false;
  if ((await dayCount(`ai_member:${memberId}:${day}`)) >= DAILY_MEMBER_CAP) return false;
  return true;
}

export async function aiCapBump(memberId: number): Promise<void> {
  const day = aiDay();
  await bumpDay(`ai_used:${day}`);
  await bumpDay(`ai_member:${memberId}:${day}`);
}

/** Toshkent (UTC+5) sanasi — kunlik cap kalitlari uchun. */
export function aiDay(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** Ask the chain. Returns null when disabled, capped, or every provider fails. */
export async function askLlm(memberId: number, prompt: string, system: string): Promise<string | null> {
  if (!(await aiCapOk(memberId))) return null;
  const clean = sanitize(prompt);
  for (const p of PROVIDERS) {
    if (!p.key) continue;
    try {
      const out = await p.call(p.key, clean, system);
      if (out) {
        await aiCapBump(memberId);
        return out.slice(0, 1500);
      }
    } catch {
      continue; // next provider in the chain
    }
  }
  return null;
}
