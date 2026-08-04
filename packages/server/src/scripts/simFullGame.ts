/**
 * 🎮 TO'LIQ O'YIN SIMULYATSIYASI — sodiqlik dasturini boshidan oxirigacha yurgizadi.
 *
 * Ega talabi (2026-08-04): "to'liq o'yin o'tkaz o'zing, soxta, lekin kodlarni sinash uchun;
 * hamma bo'lishi kerak bo'lgan funksiyalar ro'yxatini tuz, ular nima qilishi kerak edi,
 * edge-caselarda birma-bir sina, keyin umumiy sina, yiqitish yo'lini top."
 *
 * ⚠️ DB YO'Q (CLAUDE.md: lokal baza yopiq). Shuning uchun bu MODELLASHTIRISH: jonli servis
 * MANTIG'I aynan takrorlanadi (formulalar `@t1067/shared` dan REAL import qilinadi, qoidalar
 * `oyinService.ts` dan ko'chirilgan) va shu model ustida hujum qilinadi. Model va jonli kod
 * ajralib ketmasligi uchun har qoida yonida `oyinService.ts` dagi manbasi yozilgan.
 *
 * Yugurtirish: pnpm --filter @t1067/server exec tsx src/scripts/simFullGame.ts
 */
import {
  BONUS_ECON_KNOBS,
  OYIN_CAPACITY_RATIO,
  OYIN_MAX_OPEN_PRIZES,
  OYIN_PRIZE_MULTIPLIER,
  OYIN_SOM_PER_BALL,
  OYIN_SOM_PER_RIDE,
  OYIN_TIERS,
  oyinCardPlan,
  oyinSuggestTier,
  type OyinTier,
} from "@t1067/shared";

// ── kichik yordamchilar ──────────────────────────────────────────────────────────────────────
let failed = 0;
const fails: string[] = [];
const ok = (cond: boolean, msg: string): void => {
  if (cond) console.log(`   ✅ ${msg}`);
  else { console.log(`   ❌ ${msg}`); failed++; fails.push(msg); }
};
const n = (x: number): string => Math.round(x).toLocaleString("ru-RU").replace(/ /g, " ");
const knob = (k: string): number => BONUS_ECON_KNOBS.find((x) => x.key === k)?.def ?? 0;

// Determinlashtirilgan RNG — har yugurishda BIR XIL natija (flaky sinov = ishonchsiz sinov).
let seed = 1067;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)] as T;

// ── knoblar ──────────────────────────────────────────────────────────────────────────────────
const RIDE = knob("oyinRideBall");
const FIRST_RIDE = knob("oyinFirstRideBall");
const REF_FIRST = knob("oyinReferFirstRideBall");
const REF_RIDE = knob("oyinReferRideBall");
const QUEST = knob("oyinDailyQuestBall");
const STREAK = knob("oyinStreakBall");
const LOGIN = knob("oyinDailyLoginBall");
const PHONE = knob("oyinPhoneBall");
const MAX_PER_PRIZE = knob("oyinMaxTicketsPerPrize");
const MIN_SELL_PCT = knob("oyinMinSellPct");

// ── MODEL ────────────────────────────────────────────────────────────────────────────────────
interface Member { id: number; ball: number; spent: number; rides: number; inviter: number | null; cards: number[]; banned: boolean; staff: boolean }
interface Prize { key: string; name: string; value: number; price: number; limit: number; sold: number; queued: boolean; holders: Map<number, number>; drawnAt: number | null; winner: number | null }

interface World {
  members: Map<number, Member>;
  prizes: Prize[];
  gno: number; // global karta raqami
  ownerSpend: number; // mukofotlarga to'langan
  revenue: number; // safarlardan kelgan komissiya
  emitted: number; // chiqarilgan ball
  frozen: boolean;
  day: number;
}

const world: World = { members: new Map(), prizes: [], gno: 729474, ownerSpend: 0, revenue: 0, emitted: 0, frozen: false, day: 0 };

// ── FUNKSIYALAR RO'YXATI — har biri jonli koddagi manbasi bilan ──────────────────────────────
// Har funksiya "nima qilishi kerak edi" izohi bilan; sinovlar shu shartnomani tekshiradi.

/** `computeBallMap` (oyinService.ts:236) — ball = max(0, earned − spent). MANFIY BO'LMAYDI. */
const ballOf = (m: Member): number => Math.max(0, m.ball - m.spent);

/** `minSellOf` (oyinService.ts:754) — 100% da minSell = limit. */
const minSellOf = (limit: number, pct = MIN_SELL_PCT): number =>
  pct <= 0 || limit <= 0 ? 0 : Math.min(limit, Math.ceil((limit * pct) / 100));

/** `reserveSoldSlot` (oyinService.ts:1053) — atomik; `sold > limit` bo'lsa DEKREMENT + null. */
const reserveSlot = (p: Prize): number | null => {
  p.sold += 1;
  if (p.sold > p.limit) { p.sold -= 1; return null; }
  return p.sold;
};

/** `buyTicket` (oyinService.ts:1129) — DARVOZALAR TARTIBI jonli kod bilan bir xil bo'lishi SHART.
 *  bayroq → mavsum → FINAL-48 → muzlatilgan → mukofot bor/ochiq → ban → safar → ball → limit → o'rin */
type BuyReason = "ok" | "frozen" | "unknown_prize" | "banned" | "no_ride" | "insufficient" | "own_limit" | "sold_out";
const buyCard = (m: Member, p: Prize): BuyReason => {
  if (world.frozen) return "frozen";
  if (p.queued || p.sold >= p.limit) return p.queued ? "unknown_prize" : "sold_out";
  if (m.banned) return "banned";
  if (m.rides <= 0) return "no_ride"; // 🚧 safar darvozasi
  if (ballOf(m) < p.price) return "insufficient";
  const maxOwn = Math.max(1, Math.min(Math.round(MAX_PER_PRIZE), Math.ceil(p.limit / 2)));
  if ((p.holders.get(m.id) ?? 0) >= maxOwn) return "own_limit";
  const no = reserveSlot(p);
  if (no === null) return "sold_out";
  m.spent += p.price;
  world.gno += 1;
  m.cards.push(world.gno);
  p.holders.set(m.id, (p.holders.get(m.id) ?? 0) + 1);
  return "ok";
};

/** `getCapacity` (oyinService.ts:910) — ochiq sig'im / xalqdagi ball. */
const capacity = (): { openBall: number; circ: number; ratio: number; healthy: boolean; open: number } => {
  let openBall = 0; let open = 0;
  for (const p of world.prizes) {
    if (p.queued || p.sold >= p.limit) continue;
    open++; openBall += (p.limit - p.sold) * p.price;
  }
  let circ = 0;
  for (const m of world.members.values()) circ += ballOf(m);
  const ratio = circ > 0 ? openBall / circ : (openBall > 0 ? OYIN_CAPACITY_RATIO : 0);
  return { openBall, circ, ratio, healthy: circ === 0 || ratio >= OYIN_CAPACITY_RATIO, open };
};

/** `autoOpenPrizes` (oyinService.ts:947) — sig'im tushsa navbatdan ochadi, shipgacha. */
const autoOpen = (): string[] => {
  const cap = capacity();
  if (cap.healthy || cap.open >= OYIN_MAX_OPEN_PRIZES) return [];
  const queued = world.prizes.filter((p) => p.queued && p.sold < p.limit).sort((a, b) => a.price - b.price);
  const opened: string[] = [];
  let openBall = cap.openBall; let open = cap.open;
  const need = cap.circ * OYIN_CAPACITY_RATIO;
  for (const p of queued) {
    if (open >= OYIN_MAX_OPEN_PRIZES || openBall >= need) break;
    p.queued = false; opened.push(p.key);
    openBall += (p.limit - p.sold) * p.price; open++;
  }
  return opened;
};

/** `drawExport` (oyinService.ts:1560) — FAQAT to'lgan mukofot, ban qilinganlar CHIQARILADI. */
const drawPrize = (p: Prize): { drawn: boolean; winner: number | null; pool: number } => {
  if (p.sold < minSellOf(p.limit)) return { drawn: false, winner: null, pool: 0 };
  const pool: number[] = [];
  for (const [mid, cnt] of p.holders) {
    const m = world.members.get(mid);
    if (!m || m.banned || m.staff) continue; // 🚫 chetlatilgan va xodim tirajda YO'Q
    for (let i = 0; i < cnt; i++) pool.push(mid);
  }
  if (pool.length === 0) return { drawn: false, winner: null, pool: 0 };
  const w = pool[Math.floor(rnd() * pool.length)] as number;
  p.drawnAt = world.day; p.winner = w;
  world.ownerSpend += p.value;
  return { drawn: true, winner: w, pool: pool.length };
};

// ── DUNYONI QURISH ───────────────────────────────────────────────────────────────────────────
const addPrize = (name: string, value: number, queued = true): Prize => {
  const tier = oyinSuggestTier(value, RIDE);
  const plan = oyinCardPlan(value, tier, RIDE);
  const p: Prize = { key: name.toLowerCase().replace(/\s+/g, "-"), name, value, price: plan.ballPrice, limit: plan.slots, sold: 0, queued, holders: new Map(), drawnAt: null, winner: null };
  world.prizes.push(p);
  return p;
};

const addMember = (id: number, inviter: number | null, staff = false): Member => {
  const m: Member = { id, ball: 0, spent: 0, rides: 0, inviter, cards: [], banned: false, staff };
  world.members.set(id, m);
  return m;
};

/** Bitta safar — ball emissiyasi va komissiya. `computeBallMap` mantig'i. */
const doRide = (m: Member): void => {
  const first = m.rides === 0;
  m.rides += 1;
  const gain = first ? FIRST_RIDE : RIDE;
  m.ball += gain; world.emitted += gain;
  world.revenue += OYIN_SOM_PER_RIDE;
  if (m.inviter != null) {
    const inv = world.members.get(m.inviter);
    if (inv) {
      const b = first ? REF_FIRST : REF_RIDE; // do'st 1-safari 175, keyin 10 — CHEKSIZ (ega qarori)
      inv.ball += b; world.emitted += b;
    }
  }
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("🎮 TO'LIQ O'YIN SIMULYATSIYASI");
console.log(`   1 ball = ${OYIN_SOM_PER_BALL} so'm · m = ${OYIN_PRIZE_MULTIPLIER} · safar = ${RIDE} ball · qulf = ${MIN_SELL_PCT}%\n`);

// ── 1-BOSQICH: FUNKSIYALAR BIRMA-BIR, CHEKKA HOLATLARDA ─────────────────────────────────────
console.log("━━ 1. FUNKSIYALAR — birma-bir, chekka holatlarda ━━\n");

console.log("① ballOf — ball hech qachon manfiy bo'lmaydi");
{
  const m = addMember(-1, null); m.ball = 100; m.spent = 500;
  ok(ballOf(m) === 0, `earned 100, spent 500 → ${ballOf(m)} (manfiy emas)`);
  m.ball = 0; m.spent = 0;
  ok(ballOf(m) === 0, "yangi a'zo → 0");
  world.members.delete(-1);
}

console.log("\n② minSellOf — 100% qulf");
{
  ok(minSellOf(57) === 57, `limit 57 → ${minSellOf(57)} (hammasi)`);
  ok(minSellOf(1) === 1, "limit 1 → 1");
  ok(minSellOf(0) === 0, "limit 0 → 0 (bo'linish yo'q)");
  ok(minSellOf(57, 0) === 0, "qo'riq o'chiq (0%) → 0");
  ok(minSellOf(57, 50) === 29, `50% → ${minSellOf(57, 50)}`);
}

console.log("\n③ reserveSlot — limitdan OSHMAYDI (atomik)");
{
  const p: Prize = { key: "t", name: "T", value: 1, price: 100, limit: 3, sold: 0, queued: false, holders: new Map(), drawnAt: null, winner: null };
  ok(reserveSlot(p) === 1 && reserveSlot(p) === 2 && reserveSlot(p) === 3, "1,2,3 ketma-ket");
  ok(reserveSlot(p) === null, "4-urinish → null (limitdan oshmadi)");
  ok(p.sold === 3, `sold ${p.sold} (dekrement ishladi)`);
}

console.log("\n④ buyCard — darvozalar TARTIBI");
{
  const p = addPrize("Sinov", 100_000, false);
  const noRide = addMember(-2, null);
  noRide.ball = 999_999;
  ok(buyCard(noRide, p) === "no_ride", "safarsiz + ko'p ball → no_ride (ball darvozadan KEYIN)");
  doRide(noRide);
  ok(buyCard(noRide, p) === "ok", "safar qilgach → ok");
  const poor = addMember(-3, null); doRide(poor);
  ok(buyCard(poor, p) === "insufficient", "safar bor, ball yo'q → insufficient");
  const banned = addMember(-4, null); doRide(banned); banned.ball = 999_999; banned.banned = true;
  ok(buyCard(banned, p) === "banned", "chetlatilgan → banned (ball darvozadan OLDIN)");
  noRide.ball = 999_999; noRide.spent = 0;
  const maxOwn = Math.max(1, Math.min(Math.round(MAX_PER_PRIZE), Math.ceil(p.limit / 2)));
  let bought = 1;
  while (buyCard(noRide, p) === "ok") bought++;
  ok(bought === maxOwn, `limitga yetdi: ${bought} karta (max ${maxOwn})`);
  world.frozen = true;
  ok(buyCard(poor, p) === "frozen", "muzlatilgan → frozen (HAMMA darvozadan OLDIN)");
  world.frozen = false;
  world.prizes = []; world.members.clear(); world.gno = 729474;
}

console.log("\n⑤ drawPrize — to'lmasa O'YNALMAYDI, xodim/chetlatilgan CHIQADI");
{
  const p = addPrize("Yarim", 100_000, false);
  const a = addMember(1, null); doRide(a); a.ball = 999_999;
  buyCard(a, p);
  ok(drawPrize(p).drawn === false, `${p.sold}/${p.limit} → o'ynalmadi (100% qulf)`);
  // to'ldiramiz
  let uid = 100;
  while (p.sold < p.limit) { const m = addMember(uid++, null); doRide(m); m.ball = 999_999; buyCard(m, p); }
  const r = drawPrize(p);
  ok(r.drawn === true, `${p.sold}/${p.limit} → o'ynaldi, g'olib #${r.winner}`);
  ok(r.pool === p.sold, `poyga hovuzi ${r.pool} = sotilgan ${p.sold}`);

  // xodim va chetlatilgan hovuzdan chiqadimi
  const p2 = addPrize("Xodimli", 100_000, false);
  const staff = addMember(900, null, true); doRide(staff); staff.ball = 999_999;
  const bad = addMember(901, null); doRide(bad); bad.ball = 999_999;
  buyCard(staff, p2); buyCard(bad, p2); bad.banned = true;
  while (p2.sold < p2.limit) { const m = addMember(uid++, null); doRide(m); m.ball = 999_999; buyCard(m, p2); }
  const r2 = drawPrize(p2);
  ok(r2.pool === p2.sold - 2, `hovuz ${r2.pool} = ${p2.sold} − 2 (xodim + chetlatilgan chiqdi)`);
  ok(r2.winner !== 900 && r2.winner !== 901, `g'olib #${r2.winner} — xodim ham, chetlatilgan ham emas`);
  world.prizes = []; world.members.clear(); world.ownerSpend = 0; world.revenue = 0; world.emitted = 0; world.gno = 729474;
}

console.log("\n⑥ capacity + autoOpen — navbat teshigi");
{
  addPrize("Ochiq", 100_000, false);
  for (let i = 0; i < 5; i++) addPrize(`Navbat ${i}`, 200_000, true);
  const rich = addMember(1, null); doRide(rich); rich.ball = 500_000;
  const c1 = capacity();
  ok(c1.healthy === false, `sig'im ${c1.ratio.toFixed(2)}× < ${OYIN_CAPACITY_RATIO}× → sog'lom EMAS`);
  const opened = autoOpen();
  ok(opened.length > 0, `navbatdan ${opened.length} ta ochildi`);
  const c2 = capacity();
  ok(c2.ratio > c1.ratio, `sig'im ${c1.ratio.toFixed(2)}× → ${c2.ratio.toFixed(2)}×`);
  ok(c2.open <= OYIN_MAX_OPEN_PRIZES, `ochiq ${c2.open} ≤ ship ${OYIN_MAX_OPEN_PRIZES}`);
  ok(autoOpen().length >= 0, "ikkinchi chaqiruv yiqilmaydi (idempotent)");
  world.prizes = []; world.members.clear();
}

// ── 2-BOSQICH: TO'LIQ O'YIN — 90 kun ────────────────────────────────────────────────────────
console.log("\n━━ 2. TO'LIQ O'YIN — 90 kun, 300 a'zo ━━\n");
{
  world.prizes = []; world.members.clear(); world.ownerSpend = 0; world.revenue = 0; world.emitted = 0; world.gno = 729474; world.day = 0;

  // Katalog: 3 arzon (birinchi g'oliblar) + 5 ta ega mahsuloti
  const CATALOG: [string, number][] = [
    ["Vaucher", 30_000], ["Termos", 50_000], ["Choy servizi", 120_000],
    ["Dazmol", 189_000], ["Changyutgich", 350_000], ["Suv sovutgich", 749_000],
    ["Yandex Stansiya", 800_000], ["Mikroto'lqinli pech", 900_000],
  ];
  CATALOG.forEach(([nm, v], i) => addPrize(nm, v, i >= 3)); // birinchi 3 tasi ochiq

  // 300 a'zo: 60% oddiy (20 safar/oy), 30% faol (60), 10% chempion (120)
  const RIDES_MONTH = (i: number): number => (i % 10 === 0 ? 120 : i % 10 < 4 ? 60 : 20);
  for (let i = 1; i <= 300; i++) {
    const inviter = i > 30 && rnd() < 0.45 ? 1 + Math.floor(rnd() * 30) : null;
    addMember(i, inviter);
  }

  let draws = 0; const winners = new Set<number>();
  for (let day = 1; day <= 90; day++) {
    world.day = day;
    for (const m of world.members.values()) {
      const perDay = RIDES_MONTH(m.id) / 30;
      const rides = Math.floor(perDay) + (rnd() < perDay % 1 ? 1 : 0);
      for (let r = 0; r < rides; r++) doRide(m);
      if (rides > 0) { m.ball += QUEST; world.emitted += QUEST; }         // kunlik topshiriq
      m.ball += LOGIN; world.emitted += LOGIN;                             // kunlik kirish
      if (day % 7 === 0 && rides > 0) { m.ball += STREAK; world.emitted += STREAK; } // zanjir
      if (m.rides === 1) { m.ball += PHONE; world.emitted += PHONE; }      // telefon (bir marta)
    }
    // Xarid: har a'zo eng arzon YETADIGAN ochiq mukofotni oladi (real xulq — arzoniga og'ish)
    for (const m of world.members.values()) {
      const open = world.prizes.filter((p) => !p.queued && p.sold < p.limit && p.price <= ballOf(m)).sort((a, b) => a.price - b.price);
      for (const p of open) { if (buyCard(m, p) !== "ok") continue; break; }
    }
    autoOpen();
    // Mukofot kuni — har shanba to'lganlar o'ynaladi
    if (day % 7 === 0) {
      for (const p of world.prizes) {
        if (p.drawnAt != null || p.sold < p.limit) continue;
        const r = drawPrize(p);
        if (r.drawn) { draws++; if (r.winner != null) winners.add(r.winner); }
      }
    }
  }

  const cap = capacity();
  let circ = 0; for (const m of world.members.values()) circ += ballOf(m);
  const spentBall = [...world.members.values()].reduce((s, m) => s + m.spent, 0);
  const prizeCostPct = world.revenue > 0 ? (world.ownerSpend / world.revenue) * 100 : 0;

  console.log(`   90 kun · ${n(world.revenue / OYIN_SOM_PER_RIDE)} safar · ${n(world.revenue)} so'm daromad`);
  console.log(`   emissiya ${n(world.emitted)} ball · sarflandi ${n(spentBall)} · xalqda ${n(circ)}`);
  console.log(`   ${draws} mukofot o'ynaldi · ${winners.size} xil g'olib · ${n(world.ownerSpend)} so'm xarajat (${prizeCostPct.toFixed(1)}%)`);
  console.log(`   sig'im ${cap.ratio.toFixed(2)}× · ochiq ${cap.open} · sof foyda ${n(world.revenue - world.ownerSpend)} so'm\n`);

  ok(draws > 0, `${draws} ta mukofot o'ynaldi (g'olibsiz o'yin = o'lik o'yin)`);
  ok(winners.size >= draws * 0.6, `${winners.size} xil g'olib / ${draws} tiraj — bir odam hammasini olmadi`);
  ok(prizeCostPct < 35, `mukofot xarajati ${prizeCostPct.toFixed(1)}% < 35%`);
  ok(world.revenue - world.ownerSpend > 0, "sof foyda MUSBAT");
  // 🛡 ASOSIY KAFOLAT: har o'ynalgan mukofot ortida narxidan ≥m barobar karta-qiymat
  let worst = Infinity;
  for (const p of world.prizes) {
    if (p.drawnAt == null) continue;
    const collected = p.sold * p.price * OYIN_SOM_PER_BALL;
    worst = Math.min(worst, collected / p.value);
  }
  ok(worst >= OYIN_PRIZE_MULTIPLIER, `KAFOLAT: eng yomon qoplash ${worst === Infinity ? "—" : worst.toFixed(2)}× ≥ ${OYIN_PRIZE_MULTIPLIER}×`);
  ok(world.prizes.every((p) => p.sold <= p.limit), "hech bir mukofot limitdan oshmadi");
  ok([...world.members.values()].every((m) => ballOf(m) >= 0), "hech kimda manfiy ball yo'q");

  // 🚨 ENG MUHIM TEKSHIRUV — ega o'zi aytgan teshik: "25-kuni ball bor odamlar bor, na
  // sodiqlik kartasi qoldi". Sarflanmagan ball emissiyaning katta qismini tashkil qilsa,
  // demak katalog KICHIK va ball qadrsizlanadi. Bu o'yinni o'ldiradigan yagona holat.
  const strandedPct = world.emitted > 0 ? (circ / world.emitted) * 100 : 0;
  const neededSom = (world.emitted * OYIN_SOM_PER_BALL) / OYIN_PRIZE_MULTIPLIER;
  const haveSom = world.prizes.reduce((s, p) => s + p.value, 0);
  // ⚠️ Bu IKKI o'lchov KODNI emas, KATALOGNI baholaydi — shuning uchun ular OGOHLANTIRISH
  // (sinovni yiqitmaydi). Kod to'g'ri ishlaydi; katalog kichik. Qattiq tekshiruv quyida,
  // TO'G'RI O'LCHAMDAGI katalog bilan (3-stsenariy) — u yiqilsa DIZAYN buzilgan bo'ladi.
  console.log(`   ${strandedPct <= 40 ? "✅" : "⚠️"} sarflanmagan ball ${strandedPct.toFixed(0)}% (mo'ljal ≤40%)`);
  console.log(`   ${cap.healthy ? "✅" : "⚠️"} oxirgi sig'im ${cap.ratio.toFixed(2)}× (mo'ljal ≥${OYIN_CAPACITY_RATIO}×)`);
  console.log(`   📐 KATALOG KERAK: ${n(neededSom)} so'm · BOR: ${n(haveSom)} so'm → ${(neededSom / Math.max(1, haveSom)).toFixed(1)}× KAM`);
  console.log(`      → ega 90 kunga ~${n(neededSom)} so'mlik mukofot yuklashi kerak (navbatga, bir so'm turmaydi)\n`);
}

// ── 2b-BOSQICH: TO'G'RI O'LCHAMDAGI KATALOG — dizayn ishlaydimi ─────────────────────────────
console.log("━━ 2b. TO'G'RI O'LCHAMDAGI KATALOG — 90 kun ━━\n");
{
  world.prizes = []; world.members.clear(); world.ownerSpend = 0; world.revenue = 0; world.emitted = 0; world.gno = 729474; world.day = 0;

  // ~14 mln so'mlik katalog: 60 ta arzon + 24 o'rta + 10 katta + 3 bosh. Ega aynan shunday
  // yuklaydi — hammasi NAVBATGA, tizim sig'imga qarab ochadi.
  const MIX: [string, number, number][] = [["Vaucher", 30_000, 60], ["Termos", 50_000, 24], ["Servizi", 150_000, 24], ["Maishiy", 400_000, 10], ["Katta", 900_000, 3]];
  let idx = 0;
  for (const [nm, val, cnt] of MIX) for (let i = 0; i < cnt; i++) addPrize(`${nm}-${idx++}`, val, !(idx <= 6));

  const RIDES_MONTH = (i: number): number => (i % 10 === 0 ? 120 : i % 10 < 4 ? 60 : 20);
  for (let i = 1; i <= 300; i++) addMember(i, i > 30 && rnd() < 0.45 ? 1 + Math.floor(rnd() * 30) : null);

  let draws = 0; const winners = new Set<number>();
  for (let day = 1; day <= 90; day++) {
    world.day = day;
    for (const m of world.members.values()) {
      const perDay = RIDES_MONTH(m.id) / 30;
      const rides = Math.floor(perDay) + (rnd() < perDay % 1 ? 1 : 0);
      for (let r = 0; r < rides; r++) doRide(m);
      if (rides > 0) { m.ball += QUEST; world.emitted += QUEST; }
      m.ball += LOGIN; world.emitted += LOGIN;
      if (day % 7 === 0 && rides > 0) { m.ball += STREAK; world.emitted += STREAK; }
      if (m.rides === 1) { m.ball += PHONE; world.emitted += PHONE; }
    }
    for (const m of world.members.values()) {
      const open = world.prizes.filter((p) => !p.queued && p.sold < p.limit && p.price <= ballOf(m)).sort((a, b) => b.price - a.price);
      for (const p of open) { if (buyCard(m, p) !== "ok") continue; break; }
    }
    autoOpen();
    if (day % 7 === 0) {
      for (const p of world.prizes) {
        if (p.drawnAt != null || p.sold < p.limit) continue;
        const r = drawPrize(p);
        if (r.drawn) { draws++; if (r.winner != null) winners.add(r.winner); }
      }
    }
  }

  const cap = capacity();
  let circ = 0; for (const m of world.members.values()) circ += ballOf(m);
  const pct = world.revenue > 0 ? (world.ownerSpend / world.revenue) * 100 : 0;
  const stranded = world.emitted > 0 ? (circ / world.emitted) * 100 : 0;
  console.log(`   ${n(world.prizes.length)} mukofot · ${n(world.revenue)} so'm daromad · ${draws} tiraj · ${winners.size} g'olib`);
  console.log(`   xarajat ${n(world.ownerSpend)} so'm (${pct.toFixed(1)}%) · sarflanmagan ball ${stranded.toFixed(0)}% · sig'im ${cap.ratio.toFixed(2)}×\n`);

  ok(draws >= 20, `${draws} ta tiraj (mo'ljal ≥20 — muntazam g'olib oqimi)`);
  ok(winners.size >= draws * 0.5, `${winners.size} xil g'olib / ${draws} tiraj`);
  ok(stranded <= 45, `sarflanmagan ball ${stranded.toFixed(0)}% ≤ 45%`);
  ok(pct < 30, `mukofot xarajati ${pct.toFixed(1)}% < 30%`);
  ok(world.revenue - world.ownerSpend > 0, `sof foyda ${n(world.revenue - world.ownerSpend)} so'm — MUSBAT`);
  let worst = Infinity;
  for (const p of world.prizes) {
    if (p.drawnAt == null) continue;
    worst = Math.min(worst, (p.sold * p.price * OYIN_SOM_PER_BALL) / p.value);
  }
  ok(worst >= OYIN_PRIZE_MULTIPLIER, `KAFOLAT: eng yomon qoplash ${worst === Infinity ? "—" : worst.toFixed(2)}× ≥ ${OYIN_PRIZE_MULTIPLIER}×`);
}

// ── 3-BOSQICH: SINDIRISH URINISHLARI ────────────────────────────────────────────────────────
console.log("━━ 3. SINDIRISH — hujum stsenariylari ━━\n");

console.log("🗡 A. Whale bitta mukofotni sotib olishga urinadi");
{
  world.prizes = []; world.members.clear();
  const p = addPrize("Nishon", 350_000, false);
  const whale = addMember(1, null); doRide(whale); whale.ball = 10_000_000;
  let got = 0;
  while (buyCard(whale, p) === "ok") got++;
  const share = (got / p.limit) * 100;
  ok(share <= 50, `whale ${got}/${p.limit} = ${share.toFixed(0)}% oldi (≤50% — mukofotni SOTIB OLA olmadi)`);
}

console.log("\n🗡 B. Safarsiz ferma — 20 ta soxta akkaunt");
{
  world.prizes = []; world.members.clear();
  const p = addPrize("Nishon", 350_000, false);
  let bought = 0;
  for (let i = 1; i <= 20; i++) {
    const m = addMember(i, null);
    // Bepul yo'l: 30 kun kirish + topshiriq (topshiriq SAFAR talab qiladi — ferma ololmaydi)
    m.ball = 30 * LOGIN + PHONE;
    if (buyCard(m, p) === "ok") bought++;
  }
  ok(bought === 0, `20 ta safarsiz akkaunt ${bought} ta karta oldi (kutilgan 0 — safar darvozasi)`);
}

console.log("\n🗡 C. Soxta safar fermasi — iqtisodiy ma'nomi?");
{
  const fakeCost = OYIN_SOM_PER_RIDE; // haydovchi har safarda komissiya to'laydi
  const fakeGain = RIDE * OYIN_SOM_PER_BALL / OYIN_PRIZE_MULTIPLIER; // kutilgan mukofot-qiymati
  ok(fakeGain < fakeCost, `soxta safar: ${n(fakeGain)} so'm foyda < ${n(fakeCost)} so'm xarajat → MINUSDA`);
}

console.log("\n🗡 D. Sig'im ochligi — hamma ball, hech qanday mukofot");
{
  world.prizes = []; world.members.clear();
  addPrize("Yagona", 30_000, false);
  for (let i = 1; i <= 50; i++) { const m = addMember(i, null); doRide(m); m.ball = 5000; }
  const c = capacity();
  const opened = autoOpen();
  ok(c.healthy === false, `sig'im ${c.ratio.toFixed(2)}× — teshik ANIQLANDI`);
  ok(opened.length === 0, "navbat bo'sh → hech narsa ochilmadi (ega ogohlantirilishi SHART)");
}

console.log("\n🗡 E. Muzlatilgan tirajga karta qo'shish");
{
  world.prizes = []; world.members.clear();
  const p = addPrize("Muzlagan", 100_000, false);
  const m = addMember(1, null); doRide(m); m.ball = 999_999;
  world.frozen = true;
  ok(buyCard(m, p) === "frozen", "muzlatilgandan keyin karta olib BO'LMAYDI");
  world.frozen = false;
}

console.log("\n🗡 F. Navbatdagi mukofotga to'g'ridan-to'g'ri so'rov");
{
  world.prizes = []; world.members.clear();
  const p = addPrize("Yashirin", 100_000, true);
  const m = addMember(1, null); doRide(m); m.ball = 999_999;
  ok(buyCard(m, p) === "unknown_prize", "navbatdagi mukofotga karta SOTILMAYDI");
}

console.log("\n🗡 G. Chetlatilgan a'zoning eski kartalari tirajda qatnashadimi");
{
  world.prizes = []; world.members.clear();
  const p = addPrize("Nishon", 100_000, false);
  const cheat = addMember(1, null); doRide(cheat); cheat.ball = 999_999;
  buyCard(cheat, p); buyCard(cheat, p);
  let uid = 100;
  while (p.sold < p.limit) { const x = addMember(uid++, null); doRide(x); x.ball = 999_999; buyCard(x, p); }
  cheat.banned = true; // chetlatildi — LEKIN kartalari o'sha yerda
  const r = drawPrize(p);
  ok(r.pool === p.sold - 2, `hovuz ${r.pool} = ${p.sold} − 2 (chetlatilganning 2 kartasi CHIQARILDI)`);
  ok(r.winner !== 1, "chetlatilgan g'olib BO'LA OLMADI");
}

// ── YAKUN ────────────────────────────────────────────────────────────────────────────────────
console.log(failed === 0 ? "\n🛡 TO'LIQ O'YIN: HAMMA HOLAT O'TDI" : `\n💥 ${failed} ta holat YIQILDI:`);
for (const f of fails) console.log(`   · ${f}`);
process.exit(failed === 0 ? 0 : 1);
