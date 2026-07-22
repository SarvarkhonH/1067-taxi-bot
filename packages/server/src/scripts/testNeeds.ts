// Needs Engine guardrail test — the SAFETY-critical path (proactive push to real customers).
// Fake memberId namespace (no Member FK on NotifyLog), stub bot, full cleanup. No real sends.
// Run: dotenv -e ../../.env -- tsx testNeeds.ts
import "../env";
import type { Bot } from "grammy";
import { prisma } from "../db";
import { sendNudge } from "../services/ai/needsEngine";
import { dayKey, setNotifyOff } from "../services/notifyService";

const MID = 999996;
const CHAT = "needstest-chat";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}
async function cleanup(): Promise<void> {
  await prisma.notifyLog.deleteMany({ where: { memberId: MID } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: `needs_wk:${MID}:` } } });
  await setNotifyOff(MID, false);
}

async function main(): Promise<void> {
  await cleanup();
  const sends: string[] = [];
  const bot = { api: { sendMessage: async (_c: string, html: string) => { sends.push(html); } } } as unknown as Bot;

  // opt-out blocks everything
  await setNotifyOff(MID, true);
  check("opt-out → yuborilmaydi", (await sendNudge(bot, CHAT, MID, "needs_habit", "x")) === false && sends.length === 0);
  await setNotifyOff(MID, false);

  // first send OK + stop-button message present
  const s1 = await sendNudge(bot, CHAT, MID, "needs_habit", "Odatdagi safar");
  check("1-taklif yuborildi", s1 === true && sends.length === 1 && sends[0]!.includes("Odatdagi"));

  // same kind same day → dedup
  check("bir xil tur qayta → dedup", (await sendNudge(bot, CHAT, MID, "needs_habit", "y")) === false);

  // second DIFFERENT kind OK (under 2/day)
  check("2-tur (kunlik cap ichida) → yuboriladi", (await sendNudge(bot, CHAT, MID, "needs_referral", "Do'st chaqiring")) === true);

  // third → 2/day cap blocks
  check("3-taklif → kunlik 2 cap rad", (await sendNudge(bot, CHAT, MID, "needs_extra", "z")) === false);

  // weekly counter bumped to 2
  const wk = await prisma.appState.findFirst({ where: { key: { startsWith: `needs_wk:${MID}:` } } });
  check("haftalik hisoblagich = 2", Number(wk?.value) === 2);

  await cleanup();
  console.log(`\n${pass}/${pass + fail} o'tdi`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
