// Name-edit correctness: the user's chosen name (displayName) must WIN over the kas-mirrored
// fullName AND survive a sync (which overwrites fullName). This is the bug the displayName field
// fixes — editing fullName reverted on the next sync.
//
// Run: KAS_MODE=mock pnpm tsx src/scripts/testDisplayName.ts
import "../env";
import { prisma } from "../db";
import { setDisplayName, getMeByMemberId } from "../services/memberService";

const TAG = "dispname-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-1`, fullName: "Kas Ismi", phone: "+998900099001", trips: 3 } });

  // before edit: me shows the kas name
  ok((await getMeByMemberId(m.id))?.member.fullName === "Kas Ismi", `before edit → kas fullName shown`);

  // edit → displayName wins
  const saved = await setDisplayName(m.id, "  Mening   Ismim  ");
  ok(saved === "Mening Ismim", `setDisplayName trims + collapses spaces (got "${saved}")`);
  ok((await getMeByMemberId(m.id))?.member.fullName === "Mening Ismim", `after edit → displayName shown, not fullName`);

  // SIMULATE A SYNC: overwrite fullName (exactly what sync.ts:79 does). displayName must survive.
  await prisma.member.update({ where: { id: m.id }, data: { fullName: "Kas Yangilandi", points: 999 } });
  ok((await getMeByMemberId(m.id))?.member.fullName === "Mening Ismim", `🔑 after a SYNC overwrites fullName → displayName STILL wins (survives)`);

  // clear → reverts to the (new) kas name
  await setDisplayName(m.id, "");
  ok((await getMeByMemberId(m.id))?.member.fullName === "Kas Yangilandi", `clear ("") → reverts to kas fullName`);

  // invalid (1 char) rejected, not saved
  const bad = await setDisplayName(m.id, "x");
  ok(bad === null, `1-char name rejected (got ${JSON.stringify(bad)})`);
  ok((await getMeByMemberId(m.id))?.member.fullName === "Kas Yangilandi", `rejected edit didn't change the name`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DISPLAY-NAME: tahrirlangan ism sync'dan omon qoladi + tozalash ishlaydi");
  process.exit(failed ? 1 : 0);
}
main();
