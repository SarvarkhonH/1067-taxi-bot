// 🔑 4-digit link-code: 4-digit gen, single-use, rate-limit lock (no brute-force), TTL expiry.
// TAG'd AppState row + full cleanup. Run: dotenv -e ../../.env -- tsx src/scripts/testVerifyCode.ts
import "../env";
import { prisma } from "../db";
import { checkLinkCode, generateLinkCode } from "../services/verifyCodeService";

const PHONE = "+998900008123";
const KEY = `vcode:${PHONE.replace(/\D/g, "").slice(-9)}`;
let failed = 0;
function ok(c: boolean, label: string): void {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) failed++;
}
const cleanup = () => prisma.appState.deleteMany({ where: { key: KEY } });

async function main(): Promise<void> {
  await cleanup();

  // 1. generate a 4-digit code
  const code = await generateLinkCode(PHONE);
  ok(/^\d{4}$/.test(code), `generateLinkCode → 4-digit code (${code})`);

  // 2. wrong code → reason "wrong" (attempt counted, not consumed)
  const guess = code === "0000" ? "1111" : "0000";
  const wrong = await checkLinkCode(PHONE, guess);
  ok(!wrong.ok && wrong.reason === "wrong", `wrong code → reason=${wrong.reason}`);

  // 3. correct code → ok, then SINGLE-USE (reuse → no_code)
  const good = await checkLinkCode(PHONE, code);
  ok(good.ok, `correct code → ok`);
  const reuse = await checkLinkCode(PHONE, code);
  ok(!reuse.ok && reuse.reason === "no_code", `single-use: reuse → no_code`);

  // 4. rate-limit: a fresh code + 5 wrong tries → locked (4 digits can't be brute-forced)
  const c2 = await generateLinkCode(PHONE);
  const bad = c2 === "0000" ? "1111" : "0000";
  let last: Awaited<ReturnType<typeof checkLinkCode>> | undefined;
  for (let i = 0; i < 5; i++) last = await checkLinkCode(PHONE, bad);
  ok(!!last && !last.ok && last.reason === "locked", `5 wrong tries → locked (reason=${last?.reason})`);
  const afterLock = await checkLinkCode(PHONE, c2); // even the correct code is now rejected
  ok(!afterLock.ok, `after lock the code is consumed (even correct → rejected)`);

  // 5. TTL expiry: a fresh code, force its exp into the past → expired
  const c3 = await generateLinkCode(PHONE);
  const row = (await prisma.appState.findUnique({ where: { key: KEY } }))!;
  const data = JSON.parse(row.value) as { code: string; exp: number; attempts: number };
  data.exp = Date.now() - 1000;
  await prisma.appState.update({ where: { key: KEY }, data: { value: JSON.stringify(data) } });
  const exp = await checkLinkCode(PHONE, c3);
  ok(!exp.ok && exp.reason === "expired", `expired code → reason=${exp.reason}`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 verify-code checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
