// 🏢 Corp balance guard: a typo'd / non-numeric delta (NaN/Infinity) must never touch the
// balance, and a prepaid balance can never be driven below 0 — incl. under concurrency.
// Run: dotenv -e ../../.env -- tsx src/scripts/testCorpGuard.ts
import "../env";
import { prisma } from "../db";
import { adjustCorpBalance, createCorp } from "../services/corpService";

const TAG = "corpguard-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  await prisma.corpAccount.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  const { id } = await createCorp(`${TAG} Korxona`, 30);
  const bal = async (): Promise<number> => (await prisma.corpAccount.findUnique({ where: { id } }))?.balance ?? -1;

  ok((await bal()) === 0, "fresh corp balance is 0");

  let r = await adjustCorpBalance(id, NaN);
  ok(!r.ok && r.reason === "bad_amount" && (await bal()) === 0, "NaN rejected, balance untouched");
  r = await adjustCorpBalance(id, Infinity);
  ok(!r.ok && r.reason === "bad_amount" && (await bal()) === 0, "Infinity rejected, balance untouched");
  r = await adjustCorpBalance(id, 0);
  ok(!r.ok && r.reason === "bad_amount", "zero rejected");

  r = await adjustCorpBalance(id, 100000);
  ok(r.ok && r.balance === 100000, `+100000 applied (${r.balance})`);
  r = await adjustCorpBalance(id, -40000);
  ok(r.ok && r.balance === 60000, `-40000 applied (${r.balance})`);
  r = await adjustCorpBalance(id, -999999);
  ok(!r.ok && r.reason === "insufficient" && (await bal()) === 60000, "over-debit blocked → balance stays 60000 (never negative)");

  // concurrency: 10 parallel -10000 debits on a 60000 balance → atomic guard lets exactly 6
  // through, balance lands on 0, never negative (without the gte-guard it would go to -40000).
  const res = await Promise.all(Array.from({ length: 10 }, () => adjustCorpBalance(id, -10000).catch(() => ({ ok: false }) as { ok: boolean })));
  const okN = res.filter((x) => x.ok).length;
  const fin = await bal();
  ok(okN === 6 && fin === 0, `concurrency: ${okN}/10 debits applied, balance ${fin} (never negative)`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 corp guard checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
