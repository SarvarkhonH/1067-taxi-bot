// AI knowledge (jamoaviy bilim) test — submit → moderate → retrieval. TAG'd throwaway rows,
// fake tgId, full cleanup. No Telegram sends. Run: dotenv -e ../../.env -- tsx testBilim.ts
import "../env";
import { prisma } from "../db";
import { deleteKnowledge, listByStatus, moderate, relevantKnowledge, submitKnowledge } from "../services/ai/knowledgeService";

const TAG_TG = "bilimtest-999";
const OWNER = "bilimtest-owner";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}
async function cleanup(): Promise<void> {
  await prisma.aiKnowledge.deleteMany({ where: { submittedBy: TAG_TG } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: `bilim_sub:${TAG_TG}:` } } });
}

async function main(): Promise<void> {
  await cleanup();

  check("qisqa matn rad", !(await submitKnowledge(TAG_TG, "oz", "Test")).ok);
  const s1 = await submitKnowledge(TAG_TG, "Chilla basseyn dushanba kuni yopiq bo'ladi", "Test");
  check("submit → pending + notice", !!s1.ok && !!s1.id && (s1.notice?.text.includes("Chilla") ?? false));
  check("pending ro'yxatda ko'rinadi", (await listByStatus("pending")).some((r) => r.id === s1.id));

  // approved bo'lmaguncha AI bilimida YO'Q
  check("tasdiqsiz — relevantKnowledge topmaydi", !((await relevantKnowledge("chilla basseyn")) ?? "").includes("Chilla basseyn"));

  const m = await moderate(s1.id!, true, OWNER);
  check("tasdiqlash → ok", m.ok && m.submittedBy === TAG_TG);
  check("qayta moderatsiya → no-op", !(await moderate(s1.id!, true, OWNER)).ok);
  check("tasdiqlangach — relevantKnowledge topadi", ((await relevantKnowledge("chilla basseyn qachon yopiq")) ?? "").includes("Chilla basseyn"));

  // rad etilgan fakt bilimda bo'lmaydi
  const s2 = await submitKnowledge(TAG_TG, "Bu ma'lumot rad etiladi va AI ko'rmaydi albatta", "Test");
  await moderate(s2.id!, false, OWNER);
  check("rad etilgan — bilimda YO'Q", !((await relevantKnowledge("rad etiladi")) ?? "").includes("rad etiladi"));

  // kunlik limit (5/kun) — allaqachon 2 ta yuborilgan, yana 3 ta → 6-chi rad
  for (let i = 0; i < 3; i++) await submitKnowledge(TAG_TG, `Qo'shimcha fakt raqami ${i} — uzunroq matn`, "Test");
  check("6-chi kunlik-limit rad", !(await submitKnowledge(TAG_TG, "Limitdan oshib ketgan fakt matni", "Test")).ok);

  await deleteKnowledge(s1.id!);
  check("o'chirish → pending'dan ketadi", !(await listByStatus("approved")).some((r) => r.id === s1.id));

  await cleanup();
  console.log(`\n${pass}/${pass + fail} o'tdi`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
