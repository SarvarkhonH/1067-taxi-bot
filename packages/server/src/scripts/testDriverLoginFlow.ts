// Bosqich 2 E2E: simulate the /driver_login wizard end-to-end against the mock kas + real Postgres.
// Steps: synthesize a TelegramUser linked to a fresh test Member → walk the bot state map by hand
// (the message:text handler logic is in driverLogin.ts; here we replay its critical effects so we
// can assert on the DB + sealed-key round-trip). Throwaway rows (TAG'd) cleaned up at the end.
//
// Run: DRIVER_KEY_AES=$(openssl rand -hex 32) KAS_MODE=mock pnpm tsx src/scripts/testDriverLoginFlow.ts
import "../env";
import { prisma } from "../db";
import { driverLogin, driverConfirmSms, botDeviceSerial } from "../services/kasDriverApi";
import { saveDriverSession, getDriverSession, revokeDriverSession } from "../services/driverAuth";

const TAG = "drvlogin-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  await prisma.driverSession.deleteMany({ where: { member: { kasId: { startsWith: TAG } } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  // synth: a Member with phone but no carNumber yet — mirrors a fresh signup who only later logs in
  const m = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}-m1`, fullName: "Login Test", phone: "+998900088002" },
  });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg`, memberId: m.id } });

  // ── Step 1: driverLogin → SMS sent (mock) ──────────────────────────────────
  const CAR = "70A111AA";
  const r1 = await driverLogin(CAR, botDeviceSerial(m.id));
  ok(r1.ok, `driverLogin ok=true (mock)`);
  ok(!!r1.smsCentreNumber1, `smsCentreNumber1 present (driver UI would show "from ${r1.smsCentreNumber1}")`);

  // ── Step 2: confirmSms → live secretKey ────────────────────────────────────
  const r2 = await driverConfirmSms(CAR, "12345");
  ok(r2.ok && !!r2.secretKey, `confirmSms returned secretKey`);

  // ── Step 3: seal + persist + decrypt back ──────────────────────────────────
  await saveDriverSession(m.id, CAR, r2.secretKey!);
  const row = await prisma.driverSession.findUnique({ where: { memberId: m.id } });
  ok(!!row, `DriverSession row created`);
  ok(row?.carNumber === CAR, `carNumber stored normalized (${row?.carNumber})`);
  ok(row!.encryptedKey !== r2.secretKey, `at-rest encryptedKey != plaintext secretKey`);
  ok(row!.encryptedKey.length > 0 && row!.keyIv.length === 24 && row!.keyTag.length === 32, `hex shapes correct`);
  ok(row?.revokedAt === null, `fresh session is unrevoked`);

  // ── Step 4: getDriverSession decrypts ──────────────────────────────────────
  const s = await getDriverSession(m.id);
  ok(s?.secretKey === r2.secretKey, `getDriverSession round-trips the same secretKey`);
  ok(s?.carNumber === CAR, `getDriverSession returns carNumber`);

  // ── Step 5: re-login (replay step 1-3) overwrites cleanly ──────────────────
  const r3 = await driverConfirmSms(CAR, "54321");
  await saveDriverSession(m.id, CAR, r3.secretKey!);
  const s2 = await getDriverSession(m.id);
  ok(s2?.secretKey === r3.secretKey, `re-login overwrites the prior key`);
  const count = await prisma.driverSession.count({ where: { memberId: m.id } });
  ok(count === 1, `still ONE session row per member (upsert, not duplicate)`);

  // ── Step 6: revoke → getDriverSession returns null ─────────────────────────
  await revokeDriverSession(m.id);
  const sAfter = await getDriverSession(m.id);
  ok(sAfter === null, `revoked session returns null from getDriverSession`);
  const revokedRow = await prisma.driverSession.findUnique({ where: { memberId: m.id } });
  ok(!!revokedRow?.revokedAt, `revokedAt timestamp set (row preserved for audit)`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-LOGIN-FLOW: E2E (mock kas + Postgres) yashil");
  process.exit(failed ? 1 : 0);
}
main();
