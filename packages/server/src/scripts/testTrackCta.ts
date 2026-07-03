// trackcta viral-loop service tests. Runs ONLY on TEST_DATABASE_URL (_testDb refuses the app
// DB): this suite flips the GLOBAL feature:trackcta flag, which on the app DB would dark-launch
// the CTA to real TrackView viewers for the 30s flag-cache window. KAS_MODE is forced to mock so
// resolveTrack sees a synthetic active ride for any phone.
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "TRKCTA";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { createTrackToken, resolveTrack } = await import("../services/trackService");
  const { setFeature, __resetFeatureCache, featureOn } = await import("../services/featureFlags");
  const { attachPendingReferral, getOrCreateCode } = await import("../services/referralService");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { startsWith: TAG } }, { refereeId: { startsWith: TAG } }] } });
    await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: members.map((m) => m.id) } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: `trackjoin:${TAG}` } } });
    await prisma.appState.deleteMany({ where: { key: "feature:trackcta" } });
  };
  await cleanup();

  // sharer: linked member with a phone (mock kas returns an active ride for any phone)
  const member = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Track Sharer", phone: "+998900000001" } });
  const tgA = `${TAG}_A`;
  await prisma.telegramUser.create({ data: { id: tgA, memberId: member.id, linkedAt: new Date() } });

  // 1) DEFAULT_OFF: no explicit row → flag reads off
  __resetFeatureCache();
  ok((await featureOn("trackcta")) === false, "trackcta is DEFAULT_OFF (no row → off)");

  // 2) token mint
  const token = await createTrackToken(member.id);
  ok(/^[A-Za-z0-9_-]{6,24}$/.test(token), "createTrackToken mints an unguessable token");

  // 3) flag OFF → public payload has NO ctaLink (page renders exactly as before)
  let trip = await resolveTrack(token);
  ok(trip.active === true, "mock active ride resolves through the token");
  ok(!trip.ctaLink, "flag OFF → no ctaLink in the public payload");

  // 4) flag ON → ctaLink is the sharer's reft_ deep-link; no spin yet → no badge
  await setFeature("trackcta", true);
  __resetFeatureCache();
  trip = await resolveTrack(token);
  const code = await getOrCreateCode(tgA);
  ok(!!trip.ctaLink && trip.ctaLink!.endsWith(`?start=reft_${code}`), "flag ON → ctaLink ends with ?start=reft_<sharer code>");
  ok(trip.won === false, "no winning spin on this booking → no badge");

  // 4b) jackpot-badge fusion: a winning mid-ride spin on the CURRENT booking (mock id 40400) → won:true
  await prisma.wheelSpin.create({ data: { memberId: member.id, bookingId: 40400, dayKey: "2020-01-01", prize: "100 tanga", amount: 100 } });
  trip = await resolveTrack(token);
  ok(trip.won === true, "winning spin on this booking → won badge (amount never sent)");

  // 5) unknown token stays safe (no CTA leak, no crash)
  const none = await resolveTrack("zzzzzzzzzzzz");
  ok(none.active === false && !none.ctaLink, "unknown token → inactive, no CTA");

  // 6) the SAME code attaches through the EXISTING referral pipeline (what start=reft_ does)
  const tgB = `${TAG}_B`;
  await prisma.telegramUser.create({ data: { id: tgB } });
  const r = await attachPendingReferral(tgB, code);
  ok(r.attached === true && r.referrerTelegramId === tgA, "viewer joins via track code → referral attached to sharer");

  // 7) re-attach no-ops (idempotent — re-click of the banner link mints nothing)
  const r2 = await attachPendingReferral(tgB, code);
  ok(r2.attached === false, "second attach no-ops (idempotent)");

  // 8) self-invite blocked (sharer opening their own page earns nothing)
  const self = await attachPendingReferral(tgA, code);
  ok(self.attached === false, "self-invite blocked");

  await cleanup(); // also drops the feature row → back to DEFAULT_OFF
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
