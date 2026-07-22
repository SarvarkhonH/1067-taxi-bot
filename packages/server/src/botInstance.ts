// Tiny bot singleton — lets deep services (AI providers) send owner/operator alerts
// without threading the Bot through every call chain. Set once in index.ts at startup;
// null before that (callers must handle a not-yet-ready bot gracefully).
import type { Bot } from "grammy";

let instance: Bot | null = null;

export function setBotInstance(bot: Bot): void {
  instance = bot;
}
export function getBotInstance(): Bot | null {
  return instance;
}
