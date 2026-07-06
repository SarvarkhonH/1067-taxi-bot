// 📋 E'LONLAR (feature "elonlar", ELONLAR_PLAN.md E2) tests. Runs ONLY on TEST_DATABASE_URL —
// flips the GLOBAL feature:elonlar flag + moves REAL coin balances (CoinTxn), so it must never
// touch the app DB (CLAUDE.md sweep-test lesson).
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "ELONTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/classifiedService");
  const { setFeature, __resetFeatureCache, featureOn } = await import("../services/featureFlags");
  const { setBonusEcon, getBonusEcon } = await import("../services/bonusConfig");

  const cleanup = async (): Promise<void> => {
    const ads = await prisma.classifiedAd.findMany({ where: { authorName: { startsWith: TAG } }, select: { id: true } });
    const ids = ads.map((a) => a.id);
    await prisma.adView.deleteMany({ where: { adId: { in: ids } } });
    await prisma.adContact.deleteMany({ where: { adId: { in: ids } } });
    await prisma.adPhoto.deleteMany({ where: { adId: { in: ids } } });
    await prisma.classifiedAd.deleteMany({ where: { id: { in: ids } } });
    await prisma.coinTxn.deleteMany({
      where: { idempotencyKey: { in: [
        ...ids.map((id) => `elon_post_${id}`), ...ids.map((id) => `elon_refund_${id}`),
        ...ids.flatMap((id) => [0, 1].map((d) => `elon_top_${id}_${new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10)}`)),
      ] } },
    });
    await prisma.member.deleteMany({ where: { fullName: { startsWith: TAG } } });
    await prisma.telegramUser.deleteMany({ where: { id: { startsWith: "9" }, firstName: TAG } });
    await prisma.appState.deleteMany({ where: { key: "feature:elonlar" } });
    await prisma.appState.deleteMany({ where: { key: "feature:elontop" } });
    await prisma.appState.deleteMany({ where: { key: "bonus:econ" } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "elonrep:" } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "elonexpwarn:" } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "elonsoldcheck:" } } });
    await prisma.appState.deleteMany({ where: { key: "elonlar:slasent" } });
  };
  await cleanup();

  const mkMember = async (tgId: string, coins: number): Promise<number> => {
    const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}${tgId}`, fullName: `${TAG} Member ${tgId}`, phone: "+998901234567", coins, trips: 3 } });
    await prisma.telegramUser.create({ data: { id: tgId, memberId: m.id, firstName: TAG } });
    return m.id;
  };

  // 1) flag default OFF → everything dark for riders (owner-preview bypasses at route layer only)
  __resetFeatureCache();
  ok((await featureOn("elonlar")) === false, "1: elonlar is DEFAULT_OFF");
  ok((await svc.listAds({})).ads.length === 0, "1: browse empty while dark");
  const m1 = await mkMember("910000001", 10_000);
  const offSub = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "sotaman", title: "Dark ad" });
  ok(offSub.ok === false && offSub.reason === "off", "1: submit blocked while dark");
  await setFeature("elonlar", true);
  __resetFeatureCache();

  // 2) validation
  const badCat = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "banana" as never, subtype: "sotaman", title: "x" });
  ok(badCat.ok === false && badCat.reason === "bad_category", "2: bad category rejected");
  const badSub = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "banana", title: "Titlelong" });
  ok(badSub.ok === false && badSub.reason === "bad_subtype", "2: bad subtype rejected");
  const shortTitle = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "sotaman", title: "ab" });
  ok(shortTitle.ok === false && shortTitle.reason === "bad_title", "2: too-short title rejected");

  // 3) knob=0 (default) → FREE post, no CoinTxn, balance unchanged
  ok((await getBonusEcon()).elonPostPrice === 0, "3: elonPostPrice default is 0");
  const before3 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  const free = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "sotaman", title: "Velosiped sotiladi", priceSom: 300_000 });
  ok(free.ok === true && free.paidCoins === 0, "3: free post ok, paidCoins=0");
  const after3 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(after3 === before3, "3: balance unchanged on free post");
  ok((await prisma.classifiedAd.findUnique({ where: { id: free.id! } }))!.status === "pending", "3: new ad born pending");
  const noTxn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `elon_post_${free.id}` } });
  ok(noTxn === null, "3: no CoinTxn row created for a free post");

  // 4) knob=500 → charges tanga, CoinTxn keyed elon_post_<adId>, idempotent
  await setBonusEcon("elonPostPrice", 500);
  const before4 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  const paid = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "ish", subtype: "izlayman", title: "Santexnik kerak" });
  ok(paid.ok === true && paid.paidCoins === 500, "4: paid post charged 500");
  const after4 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(after4 === before4 - 500, "4: balance decremented by 500");
  const txn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `elon_post_${paid.id}` } });
  ok(!!txn && txn.amount === -500, "4: CoinTxn idempotencyKey elon_post_<adId> exists, amount -500");

  // 5) insufficient balance → rejected, NO ad row persists (tx rollback), no partial charge
  const m2 = await mkMember("910000002", 100); // less than 500
  const adCountBefore5 = await prisma.classifiedAd.count({ where: { tgId: BigInt("910000002") } });
  const poor = await svc.submitAd("910000002", m2, `${TAG} Vali`, "+998901234568", { category: "transport", subtype: "mashina", title: "Moshina sotiladi" });
  ok(poor.ok === false && poor.reason === "insufficient", "5: insufficient balance rejected");
  const adCountAfter5 = await prisma.classifiedAd.count({ where: { tgId: BigInt("910000002") } });
  ok(adCountAfter5 === adCountBefore5, "5: no orphan ad row on failed charge (tx rollback)");
  ok((await prisma.member.findUnique({ where: { id: m2 } }))!.coins === 100, "5: balance untouched on failed charge");

  // 6) Yo'qoldi–Topildi ALWAYS free, even with elonPostPrice=500
  const lost = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "yoqoldi", subtype: "yoqoldi", title: "Hujjat yo'qoldi" });
  ok(lost.ok === true && lost.paidCoins === 0, "6: yoqoldi is free regardless of knob");
  ok((await prisma.classifiedAd.findUnique({ where: { id: lost.id! } }))!.priceSom === null, "6: yoqoldi has no price field");

  // 7) admin approve/reject: approve → visible; reject → refund (exactly once, idempotent double-tap)
  const appr = await svc.approveAd(free.id!);
  ok(appr.ok === true, "7: approve ok");
  ok((await svc.listAds({})).ads.some((a) => a.id === free.id), "7: approved ad visible in browse");
  ok((await svc.approveAd(free.id!)).ok === false, "7: double-approve is a no-op");

  const beforeReject = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  const rej = await svc.rejectAd(paid.id!, "spam");
  ok(rej.ok === true, "7: reject ok");
  const afterReject = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(afterReject === beforeReject + 500, "7: reject refunds paidCoins exactly once");
  const refundTxn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `elon_refund_${paid.id}` } });
  ok(!!refundTxn && refundTxn.amount === 500, "7: refund CoinTxn keyed elon_refund_<adId>");
  const rej2 = await svc.rejectAd(paid.id!, "again");
  ok(rej2.ok === false && rej2.reason === "rejected", "7: double-reject is a no-op (no double refund)");
  const afterReject2 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(afterReject2 === afterReject, "7: idempotent-retry — balance unchanged after double-reject");

  // 8) max active cap (knob elonMaxActive, default 3) — m1 already has: free(active) + lost(pending) = 2 open
  await setBonusEcon("elonPostPrice", 0); // back to free for the cap test noise-free
  const openBefore = await prisma.classifiedAd.count({ where: { tgId: BigInt("910000001"), status: { in: ["pending", "active"] } } });
  ok(openBefore === 2, "8: sanity — m1 has 2 open ads (free approved + lost pending)");
  const a3 = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "uyjoy", subtype: "ijara", title: "Xona ijaraga" });
  ok(a3.ok === true, "8: 3rd open ad ok (cap=3)");
  const a4 = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "uyjoy", subtype: "sotuv", title: "Uy sotiladi" });
  ok(a4.ok === false && a4.reason === "max_active", "8: 4th open ad blocked by max_active cap");

  // 9) view/contact logging (AdView upsert, AdContact + callCount)
  const detail = await svc.getAd(free.id!, "910000003");
  ok(!!detail && detail.viewCount === 1, "9: view counted");
  await svc.getAd(free.id!, "910000003"); // same viewer again → upsert, not a 2nd row
  const viewRows = await prisma.adView.count({ where: { adId: free.id! } });
  ok(viewRows === 1, "9: 1 viewer = 1 AdView row (upsert, not duplicated)");
  const contact = await svc.logContact(free.id!, "910000003", "Vali", "call");
  ok(contact.ok === true, "9: contact logged");
  const adAfterContact = await prisma.classifiedAd.findUnique({ where: { id: free.id! } });
  ok(adAfterContact!.callCount === 1, "9: callCount incremented");

  // 10) owner trust profile (§4.2) — badges from EXISTING data, no coin mechanic
  ok(!!detail!.owner && detail!.owner.rideCount === 3, "10: owner rideCount reflects member.trips");
  ok(detail!.owner.isNewMember === false, "10: seasoned test member (trips>0) is not flagged 'new'");

  // 11) markSold + reactivate (expired only)
  const sold = await svc.markSold("910000001", free.id!);
  ok(sold.ok === true, "11: markSold ok on active ad");
  ok((await prisma.classifiedAd.findUnique({ where: { id: free.id! } }))!.status === "sold", "11: status → sold");
  await prisma.classifiedAd.update({ where: { id: a3.id! }, data: { status: "expired" } });
  const react = await svc.reactivateAd("910000001", a3.id!);
  ok(react.ok === true, "11: reactivate ok on expired ad");
  ok((await prisma.classifiedAd.findUnique({ where: { id: a3.id! } }))!.status === "active", "11: status → active after reactivate");
  ok((await svc.reactivateAd("910000001", free.id!)).ok === false, "11: reactivate no-op on non-expired (sold) ad");

  // 12) price-band filter (arzon/o'rtacha/qimmat)
  await svc.approveAd(a3.id!).catch(() => undefined); // already active via reactivate; no-op guard is fine
  const cheap = await prisma.classifiedAd.create({
    data: { tgId: BigInt("910000001"), authorName: `${TAG} Ali`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Arzon`, priceSom: 50_000, phone: "+998901234567", status: "active", expiresAt: new Date(Date.now() + 30 * 86400_000) },
  });
  const band = await svc.listAds({ priceBand: "arzon" });
  ok(band.ads.some((a) => a.id === cheap.id), "12: arzon band includes ≤200k item");
  ok(!band.ads.some((a) => a.id === a3.id), "12: arzon band excludes an active no-price (Kelishiladi) item");

  // 13) E3: banned-word filter at submit
  const banned = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "sotaman", title: "Qurol sotaman arzon" });
  ok(banned.ok === false && banned.reason === "banned_word", "13: banned word in title rejected");
  const bannedDesc = await svc.submitAd("910000001", m1, `${TAG} Ali`, "+998901234567", { category: "oldi_sotdi", subtype: "sotaman", title: "Yaxshi tovar", desc: "ichida GIYOHVAND yashiringan" });
  ok(bannedDesc.ok === false && bannedDesc.reason === "banned_word", "13: banned word in desc (case-insensitive) rejected");

  // 14) E3: community report — 1/user no-op-retry, 3rd report auto-hides (active → pending re-queue)
  const m3 = await mkMember("910000004", 5000);
  const m4 = await mkMember("910000005", 5000);
  const m5 = await mkMember("910000006", 5000);
  await svc.approveAd(cheap.id).catch(() => undefined); // cheap was created directly active already; approveAd no-ops (not pending) — fine, stays active
  const rep1 = await svc.reportAd(cheap.id, "910000004");
  ok(rep1.ok === true && !rep1.hidden, "14: 1st report ok, not yet hidden");
  const rep1dup = await svc.reportAd(cheap.id, "910000004"); // same user retries
  ok(rep1dup.ok === true && !rep1dup.hidden, "14: duplicate report by same user is a silent no-op");
  ok((await prisma.classifiedAd.findUnique({ where: { id: cheap.id } }))!.reports === 1, "14: reports count stayed 1 after duplicate retry");
  await svc.reportAd(cheap.id, "910000005");
  const rep3 = await svc.reportAd(cheap.id, "910000006");
  ok(rep3.ok === true && rep3.hidden === true, "14: 3rd unique report auto-hides (re-queues)");
  ok((await prisma.classifiedAd.findUnique({ where: { id: cheap.id } }))!.status === "pending", "14: status flipped back to pending (off the public board)");
  ok(!(await svc.listAds({})).ads.some((a) => a.id === cheap.id), "14: hidden ad no longer visible in browse");

  // 15) E3: admin table — owner info, view/contact counts, pendingMinutes, viewers/contacts drill-down
  await svc.getAd(a3.id!, "910000003"); // 1 view on a3 (active)
  await svc.logContact(a3.id!, "910000003", "Vali", "message");
  const adminRows = await svc.adminListAds();
  const a3Row = adminRows.rows.find((r) => r.id === a3.id);
  ok(!!a3Row && a3Row.viewCount >= 1 && a3Row.contactCount >= 1, "15: adminListAds row reflects view/contact counts");
  ok(!!a3Row && a3Row.owner.name.includes(TAG), "15: adminListAds row carries owner name");
  ok(adminRows.pending >= 1, "15: adminListAds pending counter includes re-queued cheap ad");
  const viewers = await svc.adminAdViewers(a3.id!);
  ok(viewers.some((v) => v.tgId === "910000003"), "15: adminAdViewers lists the viewer");
  const contacts = await svc.adminAdContacts(a3.id!);
  ok(contacts.some((c) => c.tgId === "910000003" && c.kind === "message"), "15: adminAdContacts lists the contact + kind");

  // 16) E3: admin actions — archive / extend / TOP
  const arch = await svc.adminArchiveAd(lost.id!);
  ok(arch.ok === true, "16: adminArchiveAd ok");
  ok((await prisma.classifiedAd.findUnique({ where: { id: lost.id! } }))!.status === "archived", "16: status → archived");
  const beforeExpiry = (await prisma.classifiedAd.findUnique({ where: { id: a3.id! } }))!.expiresAt.getTime();
  const ext = await svc.adminExtendAd(a3.id!, 10);
  ok(ext.ok === true, "16: adminExtendAd ok");
  const afterExpiry = (await prisma.classifiedAd.findUnique({ where: { id: a3.id! } }))!.expiresAt.getTime();
  ok(afterExpiry > beforeExpiry, "16: adminExtendAd pushed expiresAt forward");
  const top = await svc.adminSetTop(a3.id!, true);
  ok(top.ok === true, "16: adminSetTop ok");
  const a3AfterTop = await prisma.classifiedAd.findUnique({ where: { id: a3.id! } });
  ok(a3AfterTop!.isTop === true && a3AfterTop!.topUntil != null, "16: isTop + topUntil set");

  // 17) E3: SLA tick — 2h+ stale pending triggers the reminder path + throttle marker, doesn't double-fire
  const stale = await prisma.classifiedAd.create({
    data: {
      tgId: BigInt("910000001"), authorName: `${TAG} Stale`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Stale pending`,
      phone: "+998901234567", status: "pending", expiresAt: new Date(Date.now() + 30 * 86400_000),
      createdAt: new Date(Date.now() - 3 * 3600_000), // 3h old — past the 2h SLA
    },
  });
  await prisma.appState.deleteMany({ where: { key: "elonlar:slasent" } }); // ensure throttle is cold
  await svc.elonlarSlaTick().catch((e) => { throw e; });
  const marker1 = await prisma.appState.findUnique({ where: { key: "elonlar:slasent" } });
  ok(!!marker1, "17: SLA tick sets the throttle marker when stale pending ads exist");
  const sentAt1 = marker1!.value;
  await svc.elonlarSlaTick().catch((e) => { throw e; }); // immediate re-tick — must be throttled (no re-send)
  const marker2 = await prisma.appState.findUnique({ where: { key: "elonlar:slasent" } });
  ok(marker2!.value === sentAt1, "17: immediate re-tick is throttled (marker unchanged, no spam)");
  await prisma.classifiedAd.delete({ where: { id: stale.id } });
  await prisma.appState.deleteMany({ where: { key: "elonlar:slasent" } });
  await svc.elonlarSlaTick().catch((e) => { throw e; });
  ok(true, "17: elonlarSlaTick no-ops cleanly with 0 stale pending ads");

  // 18) E4: TOP boost — elontop flag OFF → blocked even though elonlar is ON
  ok((await featureOn("elontop")) === false, "18: elontop is DEFAULT_OFF");
  const topOff = await svc.buyTopBoost("910000001", m1, a3.id!);
  ok(topOff.ok === false && topOff.reason === "elontop_off", "18: buyTopBoost blocked while elontop flag is off");
  await setFeature("elontop", true);

  // 19) E4: TOP boost — knob charge, isTop+topUntil set, CoinTxn keyed elon_top_<adId>_<day>
  ok((await getBonusEcon()).elonTopPrice === 2000, "19: elonTopPrice default is 2000");
  const topAd = await prisma.classifiedAd.create({
    data: { tgId: BigInt("910000001"), authorName: `${TAG} TopAd`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Top qilinadigan`, phone: "+998901234567", status: "active", expiresAt: new Date(Date.now() + 30 * 86400_000) },
  });
  const beforeTop = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  const top1 = await svc.buyTopBoost("910000001", m1, topAd.id);
  ok(top1.ok === true && !!top1.topUntil, "19: buyTopBoost ok, topUntil returned");
  const afterTop = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(afterTop === beforeTop - 2000, "19: balance decremented by elonTopPrice (2000)");
  const topAdRow = await prisma.classifiedAd.findUnique({ where: { id: topAd.id } });
  ok(topAdRow!.isTop === true && topAdRow!.topUntil != null, "19: isTop + topUntil set on the ad");
  const today = new Date().toISOString().slice(0, 10);
  const topTxn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `elon_top_${topAd.id}_${today}` } });
  ok(!!topTxn && topTxn.amount === -2000, "19: CoinTxn idempotencyKey elon_top_<adId>_<day> exists, amount -2000");

  // 20) E4: TOP boost — not_owner / not_active guards
  const notOwner = await svc.buyTopBoost("910000002", m2, topAd.id);
  ok(notOwner.ok === false && notOwner.reason === "not_owner", "20: buyTopBoost rejects a non-owner");
  const notActive = await svc.buyTopBoost("910000001", m1, lost.id!); // lost is archived (test 16)
  ok(notActive.ok === false && notActive.reason === "not_active", "20: buyTopBoost rejects a non-active ad");

  // 21) E4: same-day re-buy is idempotent — NO second charge (renews topUntil only)
  const beforeTop2 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  const top2 = await svc.buyTopBoost("910000001", m1, topAd.id);
  ok(top2.ok === true, "21: same-day re-buy still reports ok");
  const afterTop2 = (await prisma.member.findUnique({ where: { id: m1 } }))!.coins;
  ok(afterTop2 === beforeTop2, "21: same-day re-buy does NOT charge again (idempotent key)");

  // 22) E4: TOP boost — insufficient balance
  await prisma.member.update({ where: { id: m2 }, data: { coins: 50 } });
  const topAd2 = await prisma.classifiedAd.create({
    data: { tgId: BigInt("910000002"), authorName: `${TAG} TopPoor`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Poor top`, phone: "+998901234568", status: "active", expiresAt: new Date(Date.now() + 30 * 86400_000) },
  });
  const topPoor = await svc.buyTopBoost("910000002", m2, topAd2.id);
  ok(topPoor.ok === false && topPoor.reason === "insufficient", "22: buyTopBoost rejects insufficient balance");
  ok((await prisma.classifiedAd.findUnique({ where: { id: topAd2.id } }))!.isTop === false, "22: ad stays non-TOP on failed charge");

  // 23) E4: §7 lifecycle tick — expiry batch, 2-day warning marker, 3-day sold-check marker (bot-less = DB only)
  const expiredAd = await prisma.classifiedAd.create({
    data: { tgId: BigInt("910000001"), authorName: `${TAG} Expired`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Muddati o'tgan`, phone: "+998901234567", status: "active", expiresAt: new Date(Date.now() - 3600_000) },
  });
  const nearExpAd = await prisma.classifiedAd.create({
    data: { tgId: BigInt("910000001"), authorName: `${TAG} NearExp`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} Tugayapti`, phone: "+998901234567", status: "active", expiresAt: new Date(Date.now() + 1 * 86400_000) },
  });
  const oldActiveAd = await prisma.classifiedAd.create({
    data: {
      tgId: BigInt("910000001"), authorName: `${TAG} OldActive`, category: "oldi_sotdi", subtype: "sotaman", title: `${TAG} 4 kunlik e'lon`,
      phone: "+998901234567", status: "active", expiresAt: new Date(Date.now() + 30 * 86400_000), createdAt: new Date(Date.now() - 4 * 86400_000),
    },
  });
  const tick1 = await svc.elonlarLifecycleTick(); // bot-less — DB batch only, no crash
  ok(tick1.expired >= 1, "23: lifecycle tick expired the past-expiresAt ad");
  ok((await prisma.classifiedAd.findUnique({ where: { id: expiredAd.id } }))!.status === "expired", "23: expiredAd status flipped to expired");
  ok(tick1.warned >= 1, "23: lifecycle tick warned the near-expiry ad (marker created)");
  ok(!!(await prisma.appState.findUnique({ where: { key: `elonexpwarn:${nearExpAd.id}` } })), "23: elonexpwarn marker exists for nearExpAd");
  ok(tick1.soldChecked >= 1, "23: lifecycle tick asked the 3-day-old ad (marker created)");
  ok(!!(await prisma.appState.findUnique({ where: { key: `elonsoldcheck:${oldActiveAd.id}` } })), "23: elonsoldcheck marker exists for oldActiveAd");
  const tick2 = await svc.elonlarLifecycleTick();
  ok(tick2.expired === 0, "23: re-tick doesn't re-expire (already expired, not active)");
  ok(tick2.warned === 0 && tick2.soldChecked === 0, "23: immediate re-tick sends 0 duplicate warnings/checks (markers already set)");

  await cleanup();
  console.log(process.exitCode ? "\n❌ SOME TESTS FAILED" : "\n✅ ALL testElonlar PASSED");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
