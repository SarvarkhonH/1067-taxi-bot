/**
 * 🧪 S1 HOLAT SINOVI — sodiqlik dasturi iqtisod langari.
 *
 * DB YO'Q, tarmoq YO'Q — faqat `@t1067/shared` dagi sof funksiyalar va knob jadvali.
 * Shuning uchun CI'da ham, lokalda ham (baza yopiq) bir xil yuradi.
 *
 * Nimani isbotlaydi:
 *   A. `oyinCardPlan` kafolati — to'lgan mukofot ortida DOIM 3× qiymat (m=3)
 *   B. Chekka qiymatlar (0, manfiy, NaN, Infinity) NaN/Infinity CHIQARMAYDI
 *   C. `oyinSuggestTier` — Z 20-100 oralig'ida qoladi (yoki nega qolmasligi aytiladi)
 *   D. Ball jadvali — uch xil mijoz profilining oylik yig'imi rejaga mos
 *   E. Bepul yo'l emissiyaning 66% chegarasidan PAST (aks holda real zarar)
 *   F. Oylik iqtisod — 600 va 2 500 safar stsenariylari
 *
 * Yugurtirish: pnpm --filter @t1067/server exec tsx src/scripts/simLoyalty.ts
 */
import {
  BONUS_ECON_KNOBS,
  OYIN_PRIZE_MULTIPLIER,
  OYIN_SOM_PER_BALL,
  OYIN_SOM_PER_RIDE,
  OYIN_STORY_SEASON_LIMIT,
  OYIN_TIERS,
  oyinCardPlan,
  oyinSuggestTier,
  type OyinTier,
} from "@t1067/shared";

let failed = 0;
const ok = (cond: boolean, msg: string): void => {
  if (cond) console.log(`✅ ${msg}`);
  else { console.log(`❌ ${msg}`); failed++; }
};
const knob = (key: string): number => {
  const k = BONUS_ECON_KNOBS.find((x) => x.key === key);
  if (!k) { console.log(`❌ knob topilmadi: ${key}`); failed++; return 0; }
  return k.def;
};
const n = (x: number): string => Math.round(x).toLocaleString("ru-RU").replace(/ /g, " ");

const RIDE = knob("oyinRideBall");

console.log("🎁 SODIQLIK DASTURI — S1 HOLAT SINOVI");
console.log(`   langar: 1 ball = ${OYIN_SOM_PER_BALL} so'm · m = ${OYIN_PRIZE_MULTIPLIER} · safar = ${RIDE} ball\n`);

// ── A. Kafolat: har to'lgan mukofot ortida 3× qiymat ─────────────────────────────────────────
console.log("── A. Mukofot kafolati (m=3) ──");
const VALUES = [30_000, 50_000, 120_000, 189_000, 350_000, 749_000, 800_000, 900_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const TIERS: OyinTier[] = ["kichik", "orta", "katta", "bosh"];
let worstCover = Infinity;
for (const v of VALUES) {
  for (const t of TIERS) {
    const p = oyinCardPlan(v, t, RIDE);
    // To'lganda yig'ilgan so'm mukofot narxidan kamida m barobar katta bo'lishi SHART.
    const cover = p.somCapacity / v;
    if (cover < worstCover) worstCover = cover;
    if (cover < OYIN_PRIZE_MULTIPLIER) {
      console.log(`❌ ${n(v)} so'm / ${t}: qoplash ${cover.toFixed(2)}× < ${OYIN_PRIZE_MULTIPLIER}×`);
      failed++;
    }
  }
}
ok(worstCover >= OYIN_PRIZE_MULTIPLIER, `hamma kombinatsiyada qoplash ≥ ${OYIN_PRIZE_MULTIPLIER}× (eng yomoni ${worstCover.toFixed(2)}×)`);
ok(worstCover < OYIN_PRIZE_MULTIPLIER + 0.6, `ortiqcha yig'ilmaydi — eng yomoni ${worstCover.toFixed(2)}× (yaxlitlash qoldig'i)`);

// ── B. Chekka qiymatlar ──────────────────────────────────────────────────────────────────────
console.log("\n── B. Chekka qiymatlar ──");
const EDGE: [string, number][] = [
  ["0", 0], ["manfiy", -500_000], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY],
  ["1 so'm", 1], ["0.5 so'm", 0.5],
];
for (const [label, v] of EDGE) {
  const p = oyinCardPlan(v, "orta", RIDE);
  const clean = Number.isFinite(p.slots) && Number.isFinite(p.ballPrice) && Number.isFinite(p.costPct)
    && p.slots >= 1 && p.ballPrice > 0;
  ok(clean, `${label} → slots=${p.slots} baho=${p.ballPrice} foiz=${p.costPct.toFixed(1)} (NaN/Infinity yo'q)`);
}
// `rideBall = 0` — knob nolga sozlansa "necha safar" tarjimasi MA'NOSIZ bo'ladi.
// ⚠️ Avvalgi sinov `rides >= 1` deb tekshirardi va u JUDA BO'SH edi: kod "1 200 safar" degan
// bema'ni sonni qaytarardi-yu, sinov o'tib ketardi. Endi 0 talab qilinadi (UI "—" chizadi).
const zeroRide = oyinCardPlan(500_000, "orta", 0);
ok(zeroRide.rides === 0, `safar bali 0 → rides=${zeroRide.rides} (bema'ni son emas, 0)`);
const normalRide = oyinCardPlan(500_000, "orta", 35);
ok(normalRide.rides === 34, `safar bali 35 → rides=${normalRide.rides} (kutilgan 34)`);
// Astronomik lekin "finite" qiymat — ship ushlashi kerak
const huge = oyinCardPlan(1e300, "orta", 35);
ok(Number.isFinite(huge.slots) && huge.slots <= 500_000, `1e300 → slots=${n(huge.slots)} (ship ushladi)`);

// ⚠️ NAZORATCHI TOPGAN BO'SHLIQLAR (2026-08-04) — quyidagilar sinalmagan edi.
// B2. Son BO'LMAGAN kirish. Avvalgi `EDGE` massivi `[string, number][]` tipida edi, ya'ni
//     faqat sonlar bilan tekshirardi — halbuki route'dan `req.body` orqali istalgan narsa keladi.
for (const [label, v] of [["'abc'", "abc"], ["null", null], ["undefined", undefined], ["{}", {}], ["[]", []]] as [string, unknown][]) {
  const p = oyinCardPlan(v as number, "orta", 35);
  ok(Number.isFinite(p.slots) && Number.isFinite(p.costPct) && p.ballPrice > 0, `${label} → slots=${p.slots} (NaN yo'q)`);
}
// B3. NOTO'G'RI `tier` — avval `OYIN_TIERS[tier]` qo'riqsiz edi va `slots` JSON'da `null` chiqardi.
const badTier = oyinCardPlan(500_000, "buyuk" as OyinTier, 35);
ok(Number.isFinite(badTier.slots) && badTier.ballPrice > 0, `noto'g'ri tier → baho=${badTier.ballPrice} slots=${badTier.slots} (null emas)`);
// B4. SHIP USTIDAGI ZONA — kafolat aynan shu yerda buziladi, `clamped` buni AYTISHI shart.
for (const v of [150_000_000, 500_000_000, 1e12]) {
  const p = oyinCardPlan(v, "bosh", 35);
  const realCover = p.somCapacity / v;
  ok(p.clamped === true, `${n(v)} so'm → clamped=${p.clamped} (haqiqiy qoplash ${realCover.toFixed(2)}× — UI ogohlantirishi SHART)`);
}
const under = oyinCardPlan(90_000_000, "bosh", 35);
ok(under.clamped === false, `90 mln so'm → clamped=false (ship ostida, kafolat buzilmagan)`);

// ── C. Daraja tavsiyasi — Z oralig'i ────────────────────────────────────────────────────────
console.log("\n── C. Daraja tavsiyasi (Z 20-100) ──");
console.log("   narx          daraja    Z     karta      = safar   to'lganda");
let outOfRange = 0;
for (const v of VALUES) {
  const t = oyinSuggestTier(v);
  const p = oyinCardPlan(v, t, RIDE);
  const flag = p.slots > 100 ? "  ⚠️ Z>100" : p.slots < 20 ? "  ⚠️ Z<20" : "";
  if (p.slots > 100) outOfRange++;
  console.log(`   ${n(v).padStart(11)}  ${t.padEnd(8)} ${String(p.slots).padStart(4)}  ${n(p.ballPrice).padStart(7)} ball  ${String(p.rides).padStart(4)}   ${n(p.somCapacity).padStart(11)} so'm${flag}`);
}
ok(outOfRange <= 3, `Z>100 bo'lgan narxlar: ${outOfRange} ta (faqat 2 mln+ orzu mukofotlarda kutiladi)`);

// ── D. Ball jadvali — mijoz profillari ──────────────────────────────────────────────────────
console.log("\n── D. Mijoz profillari (oyiga) ──");
const QUEST = knob("oyinDailyQuestBall");
const STREAK = knob("oyinStreakBall");
const STORY = knob("oyinStoryProofBall");
const LOGIN = knob("oyinDailyLoginBall");
const SHARE = knob("oyinShareBall");
const HOME = knob("oyinHomeScreenBall");
const PHONE = knob("oyinPhoneBall");
const REF_FIRST = knob("oyinReferFirstRideBall");
const REF_RIDE = knob("oyinReferRideBall");

/** Bir oylik yig'im. `questDays` — topshiriq bajarilgan kunlar (safar talab qiladi). */
const monthly = (rides: number, friends: number, friendRides: number, questDays: number): number =>
  rides * RIDE
  + questDays * QUEST
  + 4 * STREAK
  + 4 * STORY
  + 30 * LOGIN
  + friends * friendRides * REF_RIDE;

const PROFILES: [string, number, number, number][] = [
  ["oddiy (20 safar, do'stsiz)", 20, 0, 15],
  ["faol (60 safar, 3 do'st)", 60, 3, 25],
  ["chempion (120 safar, 10 do'st)", 120, 10, 30],
];
for (const [label, rides, friends, qd] of PROFILES) {
  const total = monthly(rides, friends, 20, qd);
  const cheapest = OYIN_TIERS.kichik;
  console.log(`   ${label.padEnd(32)} ${n(total).padStart(7)} ball  → kichik karta ${Math.floor(total / cheapest)} ta/oy`);
  ok(total >= cheapest, `${label}: oyiga kamida 1 ta karta oladi (mijoz toliqmaydi)`);
}

// ── E. Bepul yo'l ulushi ────────────────────────────────────────────────────────────────────
console.log("\n── E. Bepul yo'l (daromadsiz ball) ──");
// ⚠️ BU BO'LIM QAYTA YOZILDI (nazoratchi agent 2026-08-04). Avvalgi hisob HIKOYANI hisobga
// olmasdi — halbuki `economy.ts` ning O'ZI uni "bepul yo'l" deb nomlaydi va u SAFAR TALAB
// QILMAYDI. Ayni paytda maxraj `4 × STORY` bilan shishirilgan edi (`OYIN_STORY_SEASON_LIMIT`
// esa 3/MAVSUM). Ikkala xato ham nisbatni KICHRAYTIRISH tomonga ishlardi va `< 10%` sinovi
// yolg'ondan o'tardi. To'g'ri hisobda u YIQILADI — va bu haqiqat.
const STORY_PER_MONTH = OYIN_STORY_SEASON_LIMIT; // hozirgi kod: mavsumda 3 ta (ega "haftada 1" so'ragan — S1b)
const monthlyHonest = (rides: number, friends: number, friendRides: number, questDays: number): number =>
  rides * RIDE + questDays * QUEST + 4 * STREAK + STORY_PER_MONTH * STORY + 30 * LOGIN
  + friends * friendRides * REF_RIDE;
// Safar TALAB QILMAYDIGAN hamma manba: kirish · ulashish · hikoya · ekranga o'rnatish (12 oyga taqsimlangan).
const freeMonthly = 30 * LOGIN + 30 * SHARE + STORY_PER_MONTH * STORY + HOME / 12;
const earnedMonthly = monthlyHonest(20, 0, 20, 15);
const freePct = (freeMonthly / earnedMonthly) * 100;
console.log(`   bepul: ${n(freeMonthly)} ball/oy (kirish ${30 * LOGIN} · ulashish ${30 * SHARE} · hikoya ${STORY_PER_MONTH * STORY} · o'rnatish ${Math.round(HOME / 12)})`);
console.log(`   jami:  ${n(earnedMonthly)} ball/oy → bepul ulush ${freePct.toFixed(1)}%`);
ok(freePct < 66, `bepul ulush ${freePct.toFixed(1)}% < 66% — MATEMATIK CHEGARA (undan oshsa mukofot ortidagi daromad narxidan KAM bo'ladi, ya'ni real zarar)`);
ok(SHARE === 0, "ulashish balli 0 — daromadsiz manba yopilgan");
// ℹ️ Hikoyasiz ulush — ega qarori bo'yicha hikoya REKLAMA xarajati, "leak" emas.
const freeNoStory = 30 * LOGIN + 30 * SHARE + HOME / 12;
const pctNoStory = (freeNoStory / earnedMonthly) * 100;
ok(pctNoStory < 5, `hikoyasiz bepul ulush ${pctNoStory.toFixed(1)}% < 5% (sof "bosish" yo'li)`);
console.log(`   ℹ️ Hikoya (${n(STORY_PER_MONTH * STORY)} ball) bepul yo'lning ${(100 - (pctNoStory / freePct) * 100).toFixed(0)}% ini tashkil qiladi — ega qarori: bu REKLAMA xarajati, cheklovchisi admin tasdig'i.`);

// ── F. Oylik iqtisod ────────────────────────────────────────────────────────────────────────
console.log("\n── F. Oylik iqtisod ──");
const SOM_PER_RIDE = OYIN_SOM_PER_RIDE; // ega komissiyasi — qotirilgan son EMAS, shared konstanta
console.log("   safar/oy   emissiya      mukofot xarajati   daromad        xarajat %");
for (const rides of [600, 2500]) {
  // Emissiya: safar balli + taklif oqimi (safarlarning ~40% ida taklifchi bor) + bonuslar (~35%)
  const base = rides * RIDE;
  const referFlow = rides * 0.4 * REF_RIDE;
  const bonuses = base * 0.35;
  const emission = base + referFlow + bonuses;
  const prizeCost = (emission * OYIN_SOM_PER_BALL) / OYIN_PRIZE_MULTIPLIER;
  const revenue = rides * SOM_PER_RIDE;
  const pct = (prizeCost / revenue) * 100;
  console.log(`   ${String(rides).padStart(8)}   ${n(emission).padStart(8)} ball  ${n(prizeCost).padStart(12)} so'm  ${n(revenue).padStart(11)} so'm  ${pct.toFixed(1).padStart(6)}%`);
  ok(pct < 30, `${rides} safar/oy: mukofot xarajati ${pct.toFixed(1)}% < 30%`);
}

// Bir martalik bonuslar hisobga olinganini eslatib qo'yamiz (sinov emas — ma'lumot).
console.log(`\n   ℹ️ Bir martalik: telefon ${PHONE} · ekranga o'rnatish ${HOME} · do'st 1-safari ${REF_FIRST}`);

console.log(failed === 0
  ? "\n🛡 S1: HAMMA HOLAT O'TDI"
  : `\n💥 S1: ${failed} ta holat YIQILDI`);
process.exit(failed === 0 ? 0 : 1);
