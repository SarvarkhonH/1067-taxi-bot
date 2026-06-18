// A1 self-registration + reconciliation. Proves: a brand-new phone (not in kas1067) can
// join + use the app; money stays safe (no withdraw without rides); and when the phone
// later appears in kas, the SAME member is adopted (kasId tg_→real, tangas preserved, NO
// duplicate). TAG'd throwaway rows + full cleanup. Run with KAS_MODE=mock for determinism.
import "../env";
import { prisma } from "../db";
import { getMe, getMemberId, linkByPhone, upsertKasMember } from "../services/memberService";
import { grantCoins, withdraw } from "../services/coinService";

const TAG = "SELFREG";
const TG = `${TAG}_tg1`;
const PHONE = "+998900009091"; // not in mock kas + not a real kas client → forces self-register
const REAL_KAS = "tselfreg_real_1";
let failed = 0;
function ok(c: boolean, label: string): void {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({
    where: { OR: [{ phone: PHONE }, { kasId: { startsWith: `tg_${TAG}` } }, { kasId: REAL_KAS }] },
    select: { id: true },
  });
  const ids = ms.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.withdrawal.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  await prisma.telegramUser.create({ data: { id: TG } }); // bot /start touched the user

  // 1) self-register: brand-new phone (not in kas) → linked + synthetic tg_ member
  const r = await linkByPhone(TG, PHONE, { firstName: "Yangi", username: "yangiuser" });
  ok(r.status === "linked" && !!r.memberId, `self-register → linked (status=${r.status}, member=${r.memberId})`);
  const m1 = await prisma.member.findUnique({ where: { id: r.memberId! } });
  ok(m1?.kasId === `tg_${TG}` && m1?.type === "client" && m1?.phone === PHONE, `member has synthetic kasId tg_${TG}, type client, phone set`);

  // 2) usable: getMe non-null + telegramUser linked
  const me = await getMe(TG);
  const mid = await getMemberId(TG);
  ok(!!me && mid === r.memberId, `getMe non-null + telegramUser linked → usable`);

  // 3) money-safe: earned tangas but CANNOT withdraw (zero rides → anti-farm gate)
  await grantCoins(r.memberId!, 8000, "manual", "test seed");
  const w = await withdraw(r.memberId!, 6000);
  ok(!w.ok && w.reason === "no_ride", `withdraw blocked (no_ride) for zero-ride self-reg → reason=${w.reason}`);

  // 4) reconciliation: same phone appears in kas → ADOPT the SAME member in place
  const balBefore = (await prisma.member.findUnique({ where: { id: r.memberId! } }))!.coins;
  const adopted = await upsertKasMember({ type: "client", kasId: REAL_KAS, fullName: "Yangi Mijoz", phone: PHONE, points: 1234, trips: 5, rating: 0 });
  ok(adopted.id === r.memberId, `kas record ADOPTS the same member (id ${adopted.id} === ${r.memberId})`);
  const m2 = await prisma.member.findUnique({ where: { id: r.memberId! } });
  ok(m2?.kasId === REAL_KAS && m2?.points === 1234 && m2?.trips === 5, `kasId swapped tg_→real + kas data synced (kasId=${m2?.kasId}, points=${m2?.points})`);
  const balAfter = (await prisma.member.findUnique({ where: { id: r.memberId! } }))!.coins;
  ok(balAfter === balBefore && balBefore === 8000, `tangas PRESERVED across reconciliation (${balBefore} → ${balAfter})`);

  // 5) NO duplicate: exactly one member for the phone
  const dupes = await prisma.member.count({ where: { phone: PHONE } });
  ok(dupes === 1, `exactly ONE member for the phone (no duplicate) → ${dupes}`);

  // 6) re-sync the same kas record → still one member, same id (idempotent)
  const again = await upsertKasMember({ type: "client", kasId: REAL_KAS, fullName: "Yangi Mijoz", phone: PHONE, points: 1300, trips: 6, rating: 0 });
  const dupes2 = await prisma.member.count({ where: { phone: PHONE } });
  ok(again.id === r.memberId && dupes2 === 1, `re-sync same kas record → same member, still ONE (idempotent) → id=${again.id}, count=${dupes2}`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 self-register checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); process.exit(1); });
