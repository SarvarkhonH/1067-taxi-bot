/**
 * 🛡 simGuards — nazoratchi topgan qo'riqlarni HAQIQIY kodga qarshi sinaydi.
 *
 * ⚠️ NEGA ALOHIDA FAYL: 2026-08-04 nazoratchisi eng chuqur tanqidni aytdi —
 * `simFullGame.ts` ball formulasining QAYTA YOZILGAN NUSXASINI sinardi, `computeBallMap`
 * ning o'zini emas. Shuning uchun u S7/S8 dagi 18 ta topilmaning BIRORTASINI ham ushlamadi.
 * Bu fayl faqat MODULDAN IMPORT QILINGAN qiymatlarni sinaydi — nusxa YO'Q. Kod o'zgarsa
 * sinov ham o'zgaradi; nusxa esa jimgina eskirib qolardi.
 *
 * DB'ga TEGMAYDI: faqat sof funksiya va konstantalar o'qiladi (prisma so'rov yo'q).
 */
import {
  ARCHIVED_PREFIXES, tierOfPrice,
  navbatchiOf, assignTurn, addMonths, parseJamoa, applyRemoveMember, applySetTurn, type JamoaRecord,
} from "../services/oyinService";
import { STORY_COOLDOWN_HOURS, storyCooldownHoursLeft } from "../services/oyinStory";
import { OYIN_TIERS, OYIN_JAMOA_MIN, OYIN_SEED_CATALOG } from "@t1067/shared";
import { BONUS_ECON_KNOBS } from "@t1067/shared";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

console.log("\n🛡 simGuards — nazoratchi topilmalari, HAQIQIY kodga qarshi\n");

// ── 🔴 S8-2 · 🔴 №1: arxiv ro'yxati va yashirin qarz ────────────────────────────────
console.log("A) «Toza boshlash» — ball tarixi arxivlanmasligi kerak");
// Sabab: `spent` (kartalar) abadiy. Agar `earned` manbai arxivlansa
// `ball = max(0, earned − spent)` mijozga KO'RINMAYDIGAN qarz qoldiradi.
const BALL_SOURCES = [
  "oyin:login:", "oyin:share:", "oyin:quest:", "oyin:home:", "oyin:story:",
  "oyin:sprintwin:", "oyin:adj:", "oyin:jamoa:", "oyin:jamoamem:",
];
for (const p of BALL_SOURCES) {
  ok(!ARCHIVED_PREFIXES.includes(p), `ball manbai «${p}» arxivlanmaydi`);
}
for (const p of ["oyin:tickets:", "oyin_sold:", "oyin:winner:", "oyin:ban:"]) {
  ok(!ARCHIVED_PREFIXES.includes(p), `abadiy yozuv «${p}» arxivlanmaydi`);
}
// Va aksincha — holat markerlari arxivlanishi SHART (aks holda sprint qayta bazalanmaydi).
for (const p of ["oyin:weeksnap:", "oyin:sprintdone:"]) {
  ok(ARCHIVED_PREFIXES.includes(p), `holat markeri «${p}» arxivlanadi`);
}

// ── 🟡 №6: narx → daraja moslashuvi ────────────────────────────────────────────────
console.log("\nB) Narx → daraja: jonli katalogda HAR narx darajaga tushishi kerak");
// Eski kod `p.price === OYIN_TIERS[t]` deb bitma-bit solishtirardi — jonli katalogda
// birorta narx mos kelmasdi, ya'ni «Navbatdan ochish» tugmasi hech narsa qilmasdi.
const tierVals = Object.values(OYIN_TIERS);
ok(tierVals.length === 4, `4 daraja mavjud: ${tierVals.join(" · ")}`);
let unmatched = 0;
for (const p of OYIN_SEED_CATALOG) {
  const t = tierOfPrice(p.price);
  if (!(t in OYIN_TIERS)) unmatched++;
}
ok(unmatched === 0, `seed katalogdagi ${OYIN_SEED_CATALOG.length} narxning hammasi darajaga tushdi`);
// Chegaraviy holatlar — hech qachon undefined qaytmasligi kerak.
for (const price of [0, 1, 599, 600, 900, 1201, 2400, 3600, 999_999, -5, NaN]) {
  const t = tierOfPrice(price);
  ok(typeof t === "string" && t in OYIN_TIERS, `tierOfPrice(${price}) → ${t}`);
}
// Aniqlik: tier qiymatining O'ZI o'ziga qaytishi shart.
for (const [t, b] of Object.entries(OYIN_TIERS)) {
  ok(tierOfPrice(b) === t, `tierOfPrice(${b}) === "${t}"`);
}

// ── 🔴 S7-1 / S7-2b: jamoa knoblari ────────────────────────────────────────────────
console.log("\nC) Gap-jamoa knoblari");
const jk = BONUS_ECON_KNOBS.find((k) => k.key === "oyinJamoaBallPerRide");
ok(jk != null, "oyinJamoaBallPerRide knobi mavjud");
ok(jk?.def === 6, `def = ${jk?.def} (S7-2b bajarilgandan keyin qayta yoqildi)`);
ok(jk?.min === 0, "knobni 0 ga tushirish mumkin (kill-switch)");
ok(OYIN_JAMOA_MIN >= 3, `OYIN_JAMOA_MIN = ${OYIN_JAMOA_MIN} (yolg'iz «jamoa» bo'lmaydi)`);
// 🟡 TOPILMA 2 (2026-08-05): guruhlararo cheklov — cooldown knobi mavjud va yoqiq bo'lishi shart.
const cdk = BONUS_ECON_KNOBS.find((k) => k.key === "oyinGashtakRejoinCooldownDays");
ok(cdk != null, "oyinGashtakRejoinCooldownDays knobi mavjud");
ok((cdk?.def ?? 0) > 0, `def = ${cdk?.def} (0 bo'lsa ketma-ket guruh almashtirib navbat termash cheklanmaydi)`);


// ── 🔴 S7-2b: NAVBAT QAYTA TAQSIMLANMASLIGI — ekspluatatsiyaning O'ZIGA sinov ───────
console.log("\nD) Gap-jamoa navbati — a'zo qo'shilsa O'TGAN oy O'ZGARMASLIGI kerak");
const g: JamoaRecord = { id: "TEST01", name: "Sinov", createdAt: "2026-01-15T00:00:00.000Z", members: [], turns: {}, leaderId: 101, joinedAt: {}, disbandedAt: null, testNames: {}, turnOverrides: {} };
// Uch a'zo ketma-ket qo'shiladi.
for (const m of [101, 102, 103]) { g.members.push(m); assignTurn(g, m); }
const before = { "2026-01": navbatchiOf(g, "2026-01"), "2026-02": navbatchiOf(g, "2026-02"), "2026-03": navbatchiOf(g, "2026-03") };
ok(before["2026-01"] === 101, `1-oy navbatchisi = ${before["2026-01"]} (tuzuvchi)`);
ok(before["2026-02"] === 102, `2-oy navbatchisi = ${before["2026-02"]}`);
ok(before["2026-03"] === 103, `3-oy navbatchisi = ${before["2026-03"]}`);
// ⚡ EKSPLUATATSIYA URINISHI: to'rtinchi a'zo qo'shiladi. Eski kodda `members[i % N]` edi va
// N 3→4 bo'lishi bilan HAMMA o'tgan oy qayta taqsimlanardi.
g.members.push(104); assignTurn(g, 104);
ok(navbatchiOf(g, "2026-01") === before["2026-01"], "a'zo qo'shildi — 1-oy O'ZGARMADI");
ok(navbatchiOf(g, "2026-02") === before["2026-02"], "a'zo qo'shildi — 2-oy O'ZGARMADI");
ok(navbatchiOf(g, "2026-03") === before["2026-03"], "a'zo qo'shildi — 3-oy O'ZGARMADI");
ok(navbatchiOf(g, "2026-04") === 104, "4-a'zo KEYINGI bo'sh oyni oldi");
// ⚡ CHIQ→QAYTA KIR: navbat bo'shatilmasligi kerak, aks holda o'sha oy qayta sotilardi.
g.members = g.members.filter((m) => m !== 102);
ok(navbatchiOf(g, "2026-02") === 102, "chiqqan a'zoning O'TGAN oyi saqlanadi (yashirin qarz bo'lmasin)");
g.members.push(102); const again = assignTurn(g, 102);
ok(again === "2026-02", `qayta kirgan a'zo O'SHA oyini oldi, yangisini EMAS (${again})`);
ok(navbatchiOf(g, "2026-05") === null, "chiq→kir aylanishi YANGI navbat oyi yaratmadi");
// Har a'zoga bitta navbat — umrbod shift strukturaviy.
const counts = new Map<number, number>();
for (const m of Object.values(g.turns)) counts.set(m, (counts.get(m) ?? 0) + 1);
ok([...counts.values()].every((c) => c === 1), "har a'zoga UMRI DAVOMIDA bitta navbat");

console.log("\nE) addMonths — `monthsBetween` bilan bir xil ta'rifda");
ok(addMonths("2026-01", 0) === "2026-01", "addMonths(+0)");
ok(addMonths("2026-11", 2) === "2027-01", "addMonths yil chegarasidan o'tadi: 2026-11 +2 → 2027-01");
ok(addMonths("2026-12", 1) === "2027-01", "addMonths(2026-12,+1) → 2027-01");

console.log("\nF) parseJamoa — buzuq qator butun o'yinni yiqitmasligi kerak");
ok(parseJamoa('{"id":"X","members":[1],"createdAt":"salom"}')?.createdAt !== "salom", "buzuq createdAt almashtirildi (RangeError yo'q)");
ok(Object.keys(parseJamoa('{"id":"X","members":[1],"turns":{"salom":5,"2026-01":7}}')?.turns ?? {}).length === 1, "turns'dagi buzuq kalit tashlandi");
const legacy = parseJamoa('{"id":"X","members":[1]}');
ok(legacy != null && Object.keys(legacy.turns).length === 0, "eski yozuvda turns bo'sh → ball yo'q (xavfsiz sukut)");
// Yangi maydonlar (2026-08-05, Gashtak boshlig'i rejasi) — xavfsiz default.
ok(parseJamoa('{"id":"X","members":[7,8]}')?.leaderId === 7, "leaderId yo'q → birinchi a'zo (tuzuvchi taxmin qilinadi)");
ok(parseJamoa('{"id":"X","members":[7,8],"leaderId":99}')?.leaderId === 7, "leaderId a'zolikda YO'Q qiymat → birinchi a'zoga qaytariladi (jazo emas)");
ok(parseJamoa('{"id":"X","members":[7,8],"leaderId":8}')?.leaderId === 8, "leaderId to'g'ri saqlangan bo'lsa o'zgarmaydi");
ok(parseJamoa('{"id":"X","members":[1]}')?.disbandedAt === null, "disbandedAt yo'q → faol (null)");
ok(parseJamoa('{"id":"X","members":[1],"disbandedAt":"salom"}')?.disbandedAt === null, "buzuq disbandedAt → faol deb hisoblanadi (RangeError yo'q)");

// ── 🔴 TOPILMA 1 (2026-08-05 ekspluatatsiya tahlili) — guruh bo'shasa TARIX SAQLANADI ──────
console.log("\nG) applyRemoveMember — guruh bo'shaganda qator SOFT-DELETE bo'ladi, tarix yo'qolmaydi");
// Bu — jonli kodda hozirgacha yo'q bo'lgan sinov: `leaveJamoa` avval oxirgi a'zo chiqqanda
// qatorni HARD DELETE qilardi (`deleteMany`), ya'ni `turns` (ball tarixi) ham yo'qolardi.
const solo: JamoaRecord = { id: "SOLO1", name: "Yakka", createdAt: "2026-01-01T00:00:00.000Z", members: [201], turns: { "2026-01": 201 }, leaderId: 201, joinedAt: {}, disbandedAt: null, testNames: {}, turnOverrides: {} };
const afterLeave = applyRemoveMember(solo, 201);
ok(afterLeave.members.length === 0, "oxirgi a'zo chiqqach members bo'sh");
ok(afterLeave.disbandedAt != null, "disbandedAt YOZILDI (soft-delete belgisi)");
ok(Object.keys(afterLeave.turns).length === 1 && afterLeave.turns["2026-01"] === 201, "🔴 turns (ball tarixi) TO'LIQ SAQLANDI — qator o'chirilmagan bo'lsa bu son 0 bo'lardi");
ok(afterLeave.id === solo.id, "guruh IDENTITETI saqlanadi — bu obyektni keyin qayta topish mumkin (adminGashtakDetail)");
// Ko'p a'zoli guruhda BITTASI chiqsa — guruh FAOL qoladi, faqat o'sha kishi yo'qoladi.
const trio: JamoaRecord = { id: "TRIO1", name: "Uchtasi", createdAt: "2026-01-01T00:00:00.000Z", members: [1, 2, 3], turns: { "2026-01": 1, "2026-02": 2 }, leaderId: 1, joinedAt: {}, disbandedAt: null, testNames: {}, turnOverrides: {} };
const afterOneLeaves = applyRemoveMember(trio, 2);
ok(afterOneLeaves.members.length === 2 && !afterOneLeaves.members.includes(2), "faqat chiqqan a'zo olib tashlandi");
ok(afterOneLeaves.disbandedAt === null, "guruh hali faol — disbandedAt YOZILMAYDI (hammasi chiqmagan)");
ok(afterOneLeaves.turns["2026-02"] === 2, "chiqqan a'zoning O'TGAN navbati BAND qoladi (ball tarixi buzilmaydi)");

// ── 🎯 KIMGA BALL YIG'AMIZ (2026-08-05, ega talabi) — HAQIQIY funksiyaga qarshi ─────────────
console.log("\nH) applySetTurn — boshliq/admin ONGLI belgilashi, hammaga ko'rinadigan e'lon");
const squad: JamoaRecord = { id: "SQ1", name: "Kvadrat", createdAt: "2026-01-01T00:00:00.000Z", members: [1, 2, 3], turns: { "2026-01": 1 }, leaderId: 1, joinedAt: {}, disbandedAt: null, testNames: {}, turnOverrides: {} };
const set1 = applySetTurn(squad, "2026-03", 2, "Sardorga karta uchun");
ok(set1 != null && set1.turns["2026-03"] === 2, "yangi oy belgilandi");
ok(set1?.turnOverrides["2026-03"] === "Sardorga karta uchun", "HAMMAGA ko'rinadigan matn saqlandi (audit-izoh EMAS, e'lon)");
const setEmpty = applySetTurn(squad, "2026-04", 3, "");
ok(setEmpty?.turnOverrides["2026-04"] === "Bu oy ball #3 uchun yig'ilmoqda", "matn bo'sh qoldirilsa avtomatik hosil bo'ladi");
ok(applySetTurn(squad, "2026-05", 999, "xato") === null, "guruh a'zosi BO'LMAGAN odamga belgilab bo'lmaydi (typo himoyasi)");
// ⚠️ ATAYLAB: bir-navbat-umrbod avtomatik qo'riqini AYLANIB O'TADI — ONGLI qaror.
const overrideExisting = applySetTurn(squad, "2026-01", 2, "Qayta belgilandi");
ok(overrideExisting?.turns["2026-01"] === 2, "1-a'zoning ESKI oyi 2-a'zoga QAYTA berildi (inson qarori qo'riq o'rnini bosadi)");
const cleared = applySetTurn(squad, "2026-01", null, "");
ok(cleared != null && !("2026-01" in cleared.turns) && !("2026-01" in cleared.turnOverrides), "memberId:null — oy BUTUNLAY bekor qilinadi (hech kim olmaydi)");
// Manfiy ID (sinov a'zo) ham xuddi shu HAQIQIY funksiya bilan ishlaydi — ikkinchi yo'l yo'q.
const withTest: JamoaRecord = { id: "SQ2", name: "Sinovli", createdAt: "2026-01-01T00:00:00.000Z", members: [1, -483921], turns: {}, leaderId: 1, joinedAt: {}, disbandedAt: null, testNames: { [-483921]: "🧪 Test 1" }, turnOverrides: {} };
const setTest = applySetTurn(withTest, "2026-02", -483921, "");
ok(setTest?.turnOverrides["2026-02"] === "Bu oy ball 🧪 Test 1 uchun yig'ilmoqda", "sinov a'zo uchun ism `testNames`dan olinadi, `#-483921` emas");

// ── ⏳ 72-SOATLIK HIKOYA TANAFFUSI (2026-08-05, ega talabi) — HAQIQIY funksiyaga qarshi ─────
console.log("\nI) storyCooldownHoursLeft — ketma-ket ikki hikoya orasidagi eng kam tanaffus");
const NOW = Date.parse("2026-08-05T12:00:00.000Z");
ok(storyCooldownHoursLeft(undefined, NOW) === 0, "birinchi ariza — tanaffus YO'Q");
ok(storyCooldownHoursLeft("not-a-date", NOW) === 0, "buzuq sana — tanaffus qo'llanmaydi (RangeError yo'q)");
const oneHourAgo = new Date(NOW - 1 * 3600_000).toISOString();
ok(storyCooldownHoursLeft(oneHourAgo, NOW) === STORY_COOLDOWN_HOURS - 1, `1 soat oldin → ${STORY_COOLDOWN_HOURS - 1} soat qoldi`);
const seventyOneHoursAgo = new Date(NOW - 71 * 3600_000).toISOString();
ok(storyCooldownHoursLeft(seventyOneHoursAgo, NOW) === 1, "71 soat oldin → 1 soat qoldi (hali RAD etiladi)");
const exactly72 = new Date(NOW - STORY_COOLDOWN_HOURS * 3600_000).toISOString();
ok(storyCooldownHoursLeft(exactly72, NOW) === 0, "AYNAN 72 soat oldin → tanaffus TUGAGAN (0)");
const wayPast = new Date(NOW - 200 * 3600_000).toISOString();
ok(storyCooldownHoursLeft(wayPast, NOW) === 0, "200 soat oldin → tanaffus tugagan (0)");

console.log(fail === 0 ? "\n🛡 simGuards: HAMMA QO'RIQ JOYIDA\n" : `\n❌ simGuards: ${fail} ta qo'riq YO'Q\n`);
process.exit(fail === 0 ? 0 : 1);
