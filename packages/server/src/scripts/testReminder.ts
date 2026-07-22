// reminderService unit/integration test — NO Telegram sends (stub bot captures calls),
// TAG'd throwaway rows + full cleanup, fake memberId namespace. Live sweep can't race:
// deployed code doesn't call deliverDueReminders yet, and every row is removed at exit.
// Run: pnpm exec dotenv -e ../../.env -- tsx src/scripts/testReminder.ts
import "../env";
import type { Bot } from "grammy";
import { prisma } from "../db";
import { cancelByIndex, createReminder, deliverDueReminders, listPending } from "../services/ai/reminderService";

const TAG_TG = "aitest-rem-999";
const FAKE_MEMBER = 999998;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function cleanup(): Promise<void> {
  await prisma.reminder.deleteMany({ where: { telegramId: TAG_TG } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: `rem_made:${FAKE_MEMBER}:` } } });
}

async function main(): Promise<void> {
  await cleanup();
  const in10 = new Date(Date.now() + 10 * 60_000);

  // validation walls — 30s is safely BELOW the 1-min floor (60_000 was flaky exactly at the boundary)
  check("<1 daqiqa rad", !(await createReminder(FAKE_MEMBER, TAG_TG, "test", new Date(Date.now() + 30_000))).ok);
  check(">30 kun rad", !(await createReminder(FAKE_MEMBER, TAG_TG, "test", new Date(Date.now() + 31 * 86400_000))).ok);
  check("bo'sh matn rad", !(await createReminder(FAKE_MEMBER, TAG_TG, "   ", in10)).ok);

  // create + pending cap 5
  for (let i = 1; i <= 5; i++) {
    const r = await createReminder(FAKE_MEMBER, TAG_TG, `eslatma ${i}`, in10);
    if (!r.ok) check(`create #${i}`, false, r.reason);
  }
  check("5 ta pending yaratildi", (await listPending(FAKE_MEMBER)).length === 5);
  check("6-chi pending-cap rad", !(await createReminder(FAKE_MEMBER, TAG_TG, "oshib ketdi", in10)).ok);

  // cancel by index frees a slot
  const c = await cancelByIndex(FAKE_MEMBER, 1);
  check("indeks bo'yicha bekor", c.ok && c.text === "eslatma 1");
  check("bekor keyin 4 pending", (await listPending(FAKE_MEMBER)).length === 4);

  // delivery: insert a DUE row directly (create() blocks past times by design)
  const due = await prisma.reminder.create({
    data: { memberId: FAKE_MEMBER, telegramId: TAG_TG, text: "vaqti keldi", runAt: new Date(Date.now() - 60_000), kind: "taksi" },
  });
  const sends: { chat: string; text: string; hasKb: boolean }[] = [];
  const stubBot = { api: { sendMessage: async (chat: string, text: string, opts?: { reply_markup?: unknown }) => { sends.push({ chat, text, hasKb: !!opts?.reply_markup }); } } } as unknown as Bot;
  const n1 = await deliverDueReminders(stubBot);
  check("due yetkazildi (1 ta)", n1 === 1 && sends.length === 1);
  check("taksi-kind tugma bilan", sends[0]?.hasKb === true && /vaqti keldi/.test(sends[0]?.text ?? ""));
  const rowAfter = await prisma.reminder.findUnique({ where: { id: due.id } });
  check("status=sent + sentAt", rowAfter?.status === "sent" && rowAfter.sentAt !== null);
  const n2 = await deliverDueReminders(stubBot);
  check("ikkinchi sweep hech narsa yubormaydi (claim)", n2 === 0 && sends.length === 1);

  // failure path → status failed, not retried
  const bad = await prisma.reminder.create({
    data: { memberId: FAKE_MEMBER, telegramId: TAG_TG, text: "yiqiladi", runAt: new Date(Date.now() - 60_000) },
  });
  const throwBot = { api: { sendMessage: async () => { throw new Error("stub-fail"); } } } as unknown as Bot;
  await deliverDueReminders(throwBot);
  const badAfter = await prisma.reminder.findUnique({ where: { id: bad.id } });
  check("send-xato → status=failed", badAfter?.status === "failed");
  const n3 = await deliverDueReminders(stubBot);
  check("failed qayta yuborilmaydi", n3 === 0);

  await cleanup();
  console.log(`\n${pass}/${pass + fail} o'tdi`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
