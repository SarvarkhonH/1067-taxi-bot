// memoryService unit test — fake member namespace, full cleanup, no Telegram.
// Run: pnpm exec dotenv -e ../../.env -- tsx src/scripts/testMemory.ts
import "../env";
import { prisma } from "../db";
import { forget, listNotes, recallNotes, saveNote } from "../services/ai/memoryService";

const FAKE_MEMBER = 999997;
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function main(): Promise<void> {
  await prisma.memberMemory.deleteMany({ where: { memberId: FAKE_MEMBER } });

  check("qisqa/bo'sh rad", !(await saveNote(FAKE_MEMBER, " a ")).ok);
  check("oddiy saqlash", (await saveNote(FAKE_MEMBER, "ertaga imtihoni bor")).ok);
  await saveNote(FAKE_MEMBER, "telefon raqami 998901234567 ekan");
  const notes1 = await listNotes(FAKE_MEMBER);
  check("raqam-devor: 6+ raqam [raqam]ga aylanadi", notes1.some((n) => n.note.includes("[raqam]") && !/\d{6,}/.test(n.note)));

  for (let i = 0; i < 25; i++) await saveNote(FAKE_MEMBER, `fakt raqami ${i} — uzunroq matn`);
  const after = await listNotes(FAKE_MEMBER);
  check("cap 20 (eng eskisi siqilgan)", after.length === 20, `len=${after.length}`);
  check("eng yangisi saqlangan", after[0]?.note.includes("24") === true);

  const recall = await recallNotes(FAKE_MEMBER);
  check("recall bullet-format", recall !== null && recall.startsWith("• "));

  const f1 = await forget(FAKE_MEMBER, 1);
  check("bitta faktni unutish", f1.ok && f1.count === 1 && (await listNotes(FAKE_MEMBER)).length === 19);
  const fAll = await forget(FAKE_MEMBER);
  check("meni unut — hammasi", fAll.ok && fAll.count === 19 && (await recallNotes(FAKE_MEMBER)) === null);

  await prisma.memberMemory.deleteMany({ where: { memberId: FAKE_MEMBER } });
  console.log(`\n${pass}/${pass + fail} o'tdi`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
