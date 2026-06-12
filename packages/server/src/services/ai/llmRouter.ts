// 🤖 AI layer transport — FREE-tier LLM router with auto-failover.
// Provider chain: Gemini Flash → Groq → OpenRouter(free) → Mistral. Each is an
// external HTTP call (NO local models — tiny VPS rule). With no keys set the
// router returns null and every caller falls back to rules/buttons — the
// whole AI layer ships DISABLED until the owner adds free keys.
// PRIVACY (hard rule): callers must never pass phone numbers, names or
// balances; sanitize() strips long digit runs as a second line of defense.
import { prisma } from "../../db";

const DAILY_GLOBAL_CAP = 1200;
const DAILY_MEMBER_CAP = 10;

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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
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
  const n = (await dayCount(key)) + 1;
  await prisma.appState.upsert({ where: { key }, update: { value: String(n) }, create: { key, value: String(n) } });
}

/** Ask the chain. Returns null when disabled, capped, or every provider fails. */
export async function askLlm(memberId: number, prompt: string, system: string): Promise<string | null> {
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  if ((await dayCount(`ai_used:${day}`)) >= DAILY_GLOBAL_CAP) return null;
  if ((await dayCount(`ai_member:${memberId}:${day}`)) >= DAILY_MEMBER_CAP) return null;
  const clean = sanitize(prompt);
  for (const p of PROVIDERS) {
    if (!p.key) continue;
    try {
      const out = await p.call(p.key, clean, system);
      if (out) {
        await bumpDay(`ai_used:${day}`);
        await bumpDay(`ai_member:${memberId}:${day}`);
        return out.slice(0, 1500);
      }
    } catch {
      continue; // next provider in the chain
    }
  }
  return null;
}
