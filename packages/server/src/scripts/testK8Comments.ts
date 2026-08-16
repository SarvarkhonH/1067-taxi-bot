// 💬 K8 (OYIN_KARTA_PLAN.md §13) — sovg'a ostidagi komentariya E2E tekshiruvi.
// TEST_DATABASE_URL'da yuguradi (_testDb.ts, testElonlar.ts naqshi) — app DB'ga HECH QACHON.
// Qayta yugurtirish: cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testK8Comments.ts
import "./_testDb";

const TAG = "K8TEST";
const PRIZE = `${TAG}_prize`;
const AUTHOR = -900000;
const REPORTERS = [-900001, -900002, -900003];

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinCommentService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    await prisma.oyinComment.deleteMany({ where: { prizeKey: { startsWith: TAG } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "oyin:commentrep:" } } });
    await prisma.appState.deleteMany({ where: { key: `oyin:commentban:${AUTHOR}` } });
  };
  await cleanup();

  // flag ON — bu sinov "oyin" yoqilgan holatni tekshiradi (K8'ning normal ishlash sharti)
  await setFeature("oyin", true);
  __resetFeatureCache();

  // 1. flag ON'da post — muvaffaqiyatli bo'lishi kerak
  const post1 = await svc.postComment(AUTHOR, PRIZE, "Bu test-komentariya — K8 tekshiruvi");
  ok(post1.ok === true && !!post1.comment, "1. flag ON: postComment muvaffaqiyatli");

  // 2. list — yozuv ko'rinishi kerak, mine=true, myText to'g'ri
  const list1 = await svc.listComments(PRIZE, AUTHOR);
  ok(list1.comments.some((c) => c.mine && c.id === post1.comment?.id), "2. listComments: yangi yozuv ko'rinadi (mine:true)");
  ok(list1.myText === "Bu test-komentariya — K8 tekshiruvi", "2b. myText to'g'ri qaytadi");

  // 3. qayta yuborish = TAHRIR (yangi qator emas)
  const post2 = await svc.postComment(AUTHOR, PRIZE, "Tahrirlangan matn");
  ok(post2.comment?.id === post1.comment?.id, "3. qayta yuborish bir xil id (tahrir, yangi qator emas)");
  const countAfterEdit = await prisma.oyinComment.count({ where: { prizeKey: PRIZE, memberId: AUTHOR } });
  ok(countAfterEdit === 1, "3b. DB'da hali ham FAQAT 1 qator (@@unique ishlayapti)");

  // 4. 140 belgidan uzun — rad etiladi
  const tooLong = await svc.postComment(AUTHOR, PRIZE, "x".repeat(141));
  ok(tooLong.ok === false && tooLong.reason === "too_long", "4. 141-belgili matn rad etiladi (too_long)");

  // 5. flag OFF — yozish rad etiladi
  await setFeature("oyin", false);
  __resetFeatureCache();
  const offPost = await svc.postComment(AUTHOR, PRIZE, "Flag ochiqda yozishga urinish");
  ok(offPost.ok === false && offPost.reason === "off", "5. flag OFF: postComment rad etiladi (off)");
  const offReport = await svc.reportComment(post1.comment!.id, REPORTERS[0]!);
  ok(offReport.ok === false && offReport.reason === "off", "5b. flag OFF: reportComment rad etiladi (off)");
  // preview=true (admin) — flag OFF bo'lsa ham o'tadi
  const previewPost = await svc.postComment(AUTHOR, PRIZE, "Tahrirlangan matn", true);
  ok(previewPost.ok === true, "5c. flag OFF lekin preview:true (admin) — o'tadi");
  await setFeature("oyin", true);
  __resetFeatureCache();

  // 6. report x3 -> 3-chida hidden
  let hiddenAfter: boolean | undefined;
  for (const r of REPORTERS) {
    const rep = await svc.reportComment(post1.comment!.id, r);
    hiddenAfter = rep.hidden;
  }
  ok(hiddenAfter === true, "6. 3-shikoyat komentariyani hidden qiladi");

  // 6b. bir xil kishi qayta shikoyat qilsa — no-op (ok:true, lekin reports oshmaydi)
  const rowBeforeDup = await prisma.oyinComment.findUnique({ where: { id: post1.comment!.id } });
  const dupRep = await svc.reportComment(post1.comment!.id, REPORTERS[0]!);
  const rowAfterDup = await prisma.oyinComment.findUnique({ where: { id: post1.comment!.id } });
  ok(dupRep.ok === true && rowBeforeDup?.reports === rowAfterDup?.reports, "6b. bir xil kishi ikkinchi marta shikoyat qilolmaydi (reports o'zgarmadi)");

  // 7. hidden bo'lgach ommaviy ro'yxatdan yo'qoladi
  const list2 = await svc.listComments(PRIZE, AUTHOR);
  ok(!list2.comments.some((c) => c.id === post1.comment!.id), "7. hidden komentariya ommaviy ro'yxatda YO'Q");

  // 8. admin navbatida ko'rinadi
  const queue = await svc.adminListComments();
  const inQueue = queue.rows.find((r) => r.id === post1.comment!.id);
  ok(!!inQueue && inQueue.status === "hidden" && inQueue.reports === 3, "8. admin navbatida (status:hidden, reports:3)");
  ok(inQueue?.prizeName === PRIZE, "8b. prizeName fallback ishlayapti (katalogda yo'q kalit uchun ham)");

  // 9. admin approve -> active, reports reset 0
  const appr = await svc.adminApproveComment(post1.comment!.id);
  ok(appr.ok === true, "9. adminApproveComment muvaffaqiyatli");
  const afterAppr = await prisma.oyinComment.findUnique({ where: { id: post1.comment!.id } });
  ok(afterAppr?.status === "active" && afterAppr?.reports === 0, "9b. status=active, reports=0 (reset)");

  // 10. qayta ommaviy ro'yxatda
  const list3 = await svc.listComments(PRIZE, AUTHOR);
  ok(list3.comments.some((c) => c.id === post1.comment!.id), "10. approve'dan keyin qayta ro'yxatda");

  // 10b. eski shikoyatchilar qayta shikoyat qila olmaydi (marker saqlangan)
  const repAgain = await svc.reportComment(post1.comment!.id, REPORTERS[0]!);
  const rowAfterReapprove = await prisma.oyinComment.findUnique({ where: { id: post1.comment!.id } });
  ok(repAgain.ok === true && rowAfterReapprove?.reports === 0, "10c. eski shikoyatchi approve'dan keyin ham qayta hisoblanmaydi");

  // 11. bloklash — yozishdan mahrum, lekin eski komentariyasi qoladi
  const ban = await svc.adminSetCommentBan(AUTHOR, true);
  ok(ban.ok === true, "11. adminSetCommentBan(true) muvaffaqiyatli");
  ok(await svc.isCommentBanned(AUTHOR), "11b. isCommentBanned true qaytaradi");
  const blockedPost = await svc.postComment(AUTHOR, PRIZE, "Bloklanganda yozish");
  ok(blockedPost.ok === false && blockedPost.reason === "banned", "11c. bloklangan a'zo yoza olmaydi");
  const list4 = await svc.listComments(PRIZE, AUTHOR);
  ok(list4.banned === true, "11d. listComments.banned=true");
  ok(list4.comments.some((c) => c.id === post1.comment!.id), "11e. eski komentariyasi bloklashdan keyin ham ko'rinadi");
  const unban = await svc.adminSetCommentBan(AUTHOR, false);
  ok(unban.ok === true && !(await svc.isCommentBanned(AUTHOR)), "11f. blokdan chiqarish ishlaydi");

  // 12. o'z-o'zini o'chirish
  const del = await svc.deleteOwnComment(AUTHOR, post1.comment!.id);
  ok(del.ok === true, "12. deleteOwnComment muvaffaqiyatli");
  const list5 = await svc.listComments(PRIZE, AUTHOR);
  ok(!list5.comments.some((c) => c.id === post1.comment!.id), "12b. o'chirishdan keyin ro'yxatda yo'q");
  // boshqa kishi begona komentariyani o'chira olmaydi
  const post3 = await svc.postComment(AUTHOR, PRIZE, "Yana bir test-yozuv");
  const foreignDel = await svc.deleteOwnComment(REPORTERS[0]!, post3.comment!.id);
  ok(foreignDel.ok === false, "12c. boshqa kishi begona komentariyani o'chira olmaydi");

  // 13. admin remove — ABADIY, qayta yozish ham aylanib o'ta olmaydi
  const rm = await svc.adminRemoveComment(post3.comment!.id);
  ok(rm.ok === true, "13. adminRemoveComment muvaffaqiyatli");
  const afterRm = await prisma.oyinComment.findUnique({ where: { id: post3.comment!.id } });
  ok(afterRm?.status === "removed", "13b. status=removed");
  const repost = await svc.postComment(AUTHOR, PRIZE, "Removed ustiga qayta yozish");
  ok(repost.ok === false && repost.reason === "banned", "13c. removed ustiga qayta yozib bo'lmaydi");

  // 14. vitals-hisoblagich
  const pending = await svc.pendingCommentCount();
  ok(typeof pending === "number", "14. pendingCommentCount son qaytaradi");

  await cleanup();
  const remaining = await prisma.oyinComment.count({ where: { prizeKey: { startsWith: TAG } } });
  ok(remaining === 0, "15. tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
