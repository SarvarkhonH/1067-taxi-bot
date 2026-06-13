// Sweep-simulyatsiya testlari (testRideCard) JONLI prod-DB'da ishlasa, jonli
// bot'ning 90s sweep'i test sintetik a'zolarini poygalaydi (finish branch) →
// flaky + prod-DB ifloslanadi. TEST_DATABASE_URL bo'lsa, db.ts dan OLDIN
// DATABASE_URL'ni unga almashtiramiz (izolyatsiya). Bu fayl ENG BIRINCHI import.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}
export {};
