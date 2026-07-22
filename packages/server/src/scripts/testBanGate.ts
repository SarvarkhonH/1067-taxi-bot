// Verifies the HARD-BAN gate end-to-end against a THROWAWAY tagged member (created + fully deleted).
// No sweep is triggered and alertAdmins is a no-op here (no notifier registered) — nothing reaches
// a real user. Run: cd packages/server && npx tsx src/scripts/testBanGate.ts
import "../env";
import { prisma } from "../db";
import { loadBans, isTgBanned, banMember, unbanMember, isMemberBanned } from "../services/banService";
import { linkByPhone } from "../services/memberService";

let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

const TS = Date.now();
const KAS_ID = `BANTEST_${TS}`;
const PHONE = `+99890${String(TS).slice(-7)}`; // unique throwaway
const TG_OLD = `bant_old_${TS}`;
const TG_NEW = `bant_new_${TS}`;

async function cleanup(memberId?: number) {
  await prisma.telegramUser.deleteMany({ where: { id: { in: [TG_OLD, TG_NEW] } } }).catch(() => undefined);
  if (memberId) {
    await prisma.coinTxn.deleteMany({ where: { memberId } }).catch(() => undefined);
    await prisma.member.delete({ where: { id: memberId } }).catch(() => undefined);
  }
  // any member self-registered by the link-evasion test under our throwaway phone
  await prisma.member.deleteMany({ where: { kasId: `tg_${TG_NEW}` } }).catch(() => undefined);
}

async function main() {
  // fresh throwaway client member + its linked telegram id
  const member = await prisma.member.create({
    data: { type: "client", kasId: KAS_ID, fullName: "BAN TEST", phone: PHONE, trips: 5, active: true },
  });
  await prisma.telegramUser.create({ data: { id: TG_OLD, memberId: member.id } });

  try {
    // 1. baseline — not banned
    await loadBans();
    ok(!isTgBanned(TG_OLD), "baseline: linked tg id NOT banned");
    ok(!(await isMemberBanned(member.id)), "baseline: member.banned false in DB");

    // 2. ban → in-memory set + DB flip
    const r1 = await banMember(member.id, "test sabab", "testscript");
    ok(r1.ok, "banMember returns ok");
    ok(isTgBanned(TG_OLD), "after ban: tg id in in-memory set (bot+API gate blocks)");
    const dbAfterBan = await prisma.member.findUnique({ where: { id: member.id }, select: { banned: true, bannedReason: true, bannedAt: true } });
    ok(dbAfterBan?.banned === true && dbAfterBan.bannedReason === "test sabab" && !!dbAfterBan.bannedAt, "after ban: DB banned=true + reason + bannedAt set");

    // 3. persistence across a restart — rebuild the set purely from the DB
    await loadBans();
    ok(isTgBanned(TG_OLD), "after loadBans() (simulated restart): still banned from DB");

    // 4. link-evasion — a NEW telegram id tries to attach to the banned member's phone
    const link = await linkByPhone(TG_NEW, PHONE, { firstName: "Yangi" });
    ok(link.status === "banned", `link-evasion: new tg on banned phone REFUSED (status=${link.status})`);
    ok(isTgBanned(TG_NEW), "link-evasion: the new tg id is now also gated");
    const newTu = await prisma.telegramUser.findUnique({ where: { id: TG_NEW } });
    ok(!newTu?.memberId, "link-evasion: new tg NOT linked to the member");

    // 5. unban → clears both DB + set
    const r2 = await unbanMember(member.id, "testscript");
    ok(r2.ok, "unbanMember returns ok");
    ok(!isTgBanned(TG_OLD), "after unban: tg id removed from set");
    const dbAfterUnban = await prisma.member.findUnique({ where: { id: member.id }, select: { banned: true, bannedReason: true } });
    ok(dbAfterUnban?.banned === false && dbAfterUnban.bannedReason === null, "after unban: DB banned=false + reason cleared");
  } finally {
    await cleanup(member.id);
  }

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
