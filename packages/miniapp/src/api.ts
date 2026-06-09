import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { tg } from "./telegram";

// In Telegram we authenticate with signed initData. Outside Telegram (local dev)
// we fall back to a debug id that the server trusts only when no bot token is set.
function authHeaders(): Record<string, string> {
  const initData = tg?.initData ?? "";
  if (initData) return { "X-Telegram-Init-Data": initData };
  // dev only (outside Telegram): pick the demo user via ?tg=<id> or env, else 12345
  const fromUrl = new URLSearchParams(location.search).get("tg");
  const dbg = fromUrl || (import.meta.env.VITE_DEBUG_TG_ID as string) || "12345";
  return { "X-Debug-Telegram-Id": dbg };
}

// Same-origin in dev (Vite proxy); absolute backend URL in production (set VITE_API_URL at build).
const API_BASE = ((import.meta.env.VITE_API_URL as string) || "").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  me: () => get<MeResponse | { linked: false }>("/api/me"),
  // server defaults the leaderboard to the caller's own member type
  leaderboard: () => get<LeaderboardResponse>("/api/leaderboard"),
};
