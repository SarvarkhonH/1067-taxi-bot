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
import { ARCHIVED_PREFIXES, tierOfPrice } from "../services/oyinService";
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

// ── 🔴 S7-2: jamoa balli o'chiqligi ────────────────────────────────────────────────
console.log("\nC) Gap-jamoa — navbat saqlanmagunga qadar ball BERMASLIGI kerak");
const jk = BONUS_ECON_KNOBS.find((k) => k.key === "oyinJamoaBallPerRide");
ok(jk != null, "oyinJamoaBallPerRide knobi mavjud");
ok(jk?.def === 0, `def = ${jk?.def} (0 bo'lishi shart — navbat retroaktiv qayta taqsimlanadi)`);
ok(jk?.min === 0, "knobni 0 ga tushirish mumkin (kill-switch)");
ok(OYIN_JAMOA_MIN >= 3, `OYIN_JAMOA_MIN = ${OYIN_JAMOA_MIN} (yolg'iz «jamoa» bo'lmaydi)`);

console.log(fail === 0 ? "\n🛡 simGuards: HAMMA QO'RIQ JOYIDA\n" : `\n❌ simGuards: ${fail} ta qo'riq YO'Q\n`);
process.exit(fail === 0 ? 0 : 1);
