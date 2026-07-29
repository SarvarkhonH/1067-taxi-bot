// 🗺 Address aliases: local slang / mispronunciations of a real kas1067 catalog address, mapped
// to that address's exact name — e.g. "banisa" → "OBRON BALNITSA" (confirmed 2026-07-29: a rider
// typed "Banisaga" twice and got "topilmadi" both times, then typed "Obron banisaga" and picked
// that exact catalog entry from the results shown). Stored in AppState (no schema change) under
// `addralias:<fuzzyNorm(alias)>` so the owner can add more via setAddrAlias.ts without a deploy.
//
// ⛔ NEVER auto-guessed or LLM-generated: a wrong alias here sends a REAL taxi to the wrong address.
// Every row must come from either (a) a rider's own follow-up search confirming the real place, or
// (b) an owner/dispatcher confirming it by phone. See scripts/setAddrAlias.ts / listAddrAliases.ts.
import { prisma } from "../db";

// Same normalization as bot/booking.ts's fuzzyNorm (duplicated, not imported — booking.ts imports
// THIS module for lookups, so importing back from it would be a circular dependency). Keep in sync
// if that one ever changes; it's a one-line pure string transform, unlikely to drift.
function fuzzyNorm(s: string): string {
  return s.toLowerCase().replace(/[''`]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

const PREFIX = "addralias:";
const CACHE_MS = 600_000; // 10 min — aliases change rarely; no need to hit the DB on every search

let cache: { at: number; map: Map<string, string> } | null = null;

export async function getAddressAliases(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: PREFIX } }, select: { key: true, value: true } });
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.key.slice(PREFIX.length), r.value);
  cache = { at: Date.now(), map };
  return map;
}

export async function setAddressAlias(alias: string, canonicalName: string): Promise<void> {
  const key = `${PREFIX}${fuzzyNorm(alias)}`;
  await prisma.appState.upsert({ where: { key }, create: { key, value: canonicalName }, update: { value: canonicalName } });
  cache = null; // force a fresh read on next lookup
}

export async function removeAddressAlias(alias: string): Promise<void> {
  await prisma.appState.deleteMany({ where: { key: `${PREFIX}${fuzzyNorm(alias)}` } });
  cache = null;
}

export async function listAddressAliases(): Promise<{ alias: string; canonicalName: string }[]> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: PREFIX } }, orderBy: { key: "asc" } });
  return rows.map((r) => ({ alias: r.key.slice(PREFIX.length), canonicalName: r.value }));
}
