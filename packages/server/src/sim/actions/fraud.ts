// 🕵 L7 — FIRIBGAR-AHOLI: fraudRole "opportunist"/"fraudster" agentlarining kunlik hujum-urinishlari.
// HAMMASI REAL endpoint orqali (soxta emas) — har urinish o'tdimi/to'sildimi + QAYSI qo'riq to'sdi.
// Bu qatlam qaror-mantiqni real servis-qo'riqlariga URADI: guardlar haqiqatan ishlayaptimi shu yerda
// isbotlanadi (red-team LLM keyin agressiv tahlil qiladi).
//
// Import qoidasi (run.ts import-tartibi): services/ va db FAQAT funksiya ICHIDA dinamik import qilinadi.
// Sof-modul bo'lib qolishi uchun bu faylda top-level'da db/service importi YO'Q.
// Randomlik FAQAT `rng`-oqimdan (Math.random TAQIQ) va vaqt `world.day`dan — determinizm buzilmaydi.
import { rngBool, rngInt, seedFromString, type Rng } from "../rng";
import { getOpenPrizes, tryBuyTicket } from "./realBridge";
import type { AgentState, WorldState } from "../types";

/** Bir firibgar-urinishning natijasi (lokal kontrakt — types.ts tegilmaydi). Chaqiruvchi
 *  (run.ts) `world.todayCounters.fraudAttempts` ni har element uchun, `fraudBlocked` ni
 *  `blocked===true` bo'lganlar uchun oshiradi. `guard` — qaysi qo'riq to'sdi (o'tsa "none"). */
export interface FraudAttempt {
  day: number;
  agentId: number;
  kind: "selfReferralRing" | "ticketCancelAbuse" | "gashtakRejoinFarm" | "storySpam";
  /** Qo'riq to'sdimi (yoki payout nol'landimi). `false` = hujum o'tib ketdi (teshik). */
  blocked: boolean;
  /** To'sgan qo'riq nomi / rad-sabab. O'tib ketgan bo'lsa "none". */
  guard: string;
}

// ── Run-belgi (realBridge bilan bir xil sxema — determinizm; alt-akkauntlar noyob bo'lsin) ──────
function runHashOf(world: WorldState): string {
  return seedFromString(`${world.cfg.name}:${world.cfg.seed}`).toString(36);
}

/** Fraudster'ning SYBIL-telefoni: bitta odam, ko'p burner Telegram — alt'lar BIR telefonni bo'lishadi
 *  (aynan shu naqshni referralService anti-sybil telefon-dedup qo'rig'i tutadi). Real a'zolarnikidan
 *  (`+99890…`) alohida prefiks (`+99871…`) — real member bilan tasodifan to'qnashmasin. */
function sybilPhoneOf(agentId: number): string {
  return `+99871${String(agentId).padStart(7, "0")}`;
}

/** Bir fraud-agent uchun necha marta har hujumni urinadi — rolga qarab (rng-oqimdan, tartibi qat'iy).
 *  Bu funksiya rng'ni FIKSIRLANGAN tartibda iste'mol qiladi (agent-rol deterministik → sekvensiya barqaror). */
function attemptBudget(role: AgentState["fraudRole"], rng: Rng): {
  ring: number; cancel: number; gashtak: number; story: number;
} {
  if (role === "fraudster") {
    return {
      ring: rngInt(rng, 1, 3),
      cancel: rngInt(rng, 1, 2),
      gashtak: 1,
      story: rngInt(rng, 1, 3),
    };
  }
  // opportunist — yengil, tasodifiy tegib ketadi (fraudster emas, imkoniyatdan foydalanadi)
  return {
    ring: rngBool(rng, 0.12) ? 1 : 0,
    cancel: rngBool(rng, 0.25) ? 1 : 0,
    gashtak: rngBool(rng, 0.1) ? 1 : 0,
    story: rngBool(rng, 0.15) ? 1 : 0,
  };
}

// ── 1) SELF-REFERRAL RING — fraudster o'z alt-akkauntini "taklif" qiladi ─────────────────────────
// Yangi (fresh) TelegramUser → attachPendingReferral(fraudster kodi) → alt Member+link → completeReferral.
// Alt'lar BITTA sybil-telefonni bo'lishadi: BIRINCHI alt o'tib ketadi (dedup uchun avval hech narsa yo'q —
// bu HALOL kamchilik, sim uni yashirmaydi), 2-alt'dan boshlab telefon-dedup payoutni nol'laydi → to'sildi.
// Qo'riq: referralService.ts:170-183 (norm9 telefon solishtiruv, referrer.memberId bo'lsa).
async function selfReferralRing(
  fraudster: AgentState,
  world: WorldState,
  attempts: number,
): Promise<FraudAttempt[]> {
  const out: FraudAttempt[] = [];
  if (attempts <= 0 || fraudster.memberId == null || !fraudster.tgId) return out;

  const { prisma } = await import("../../db");
  const { getOrCreateCode, attachPendingReferral, completeReferral } = await import("../../services/referralService");

  // Fraudster'ning o'z taklif-kodi (real endpoint) — alt uni "bosgandek" bo'ladi.
  if (!fraudster.referralCode) fraudster.referralCode = await getOrCreateCode(fraudster.tgId);
  const code = fraudster.referralCode;
  const phone = sybilPhoneOf(fraudster.id); // hamma alt shu telefonni bo'lishadi (sybil)
  const hash = runHashOf(world);

  const mkAttempt = (blocked: boolean, guard: string): FraudAttempt => ({
    day: world.day, agentId: fraudster.id, kind: "selfReferralRing", blocked, guard,
  });

  for (let i = 0; i < attempts; i++) {
    const altTg = `fraud${hash}x${fraudster.id}d${world.day}i${i}`;
    // (1) Fresh TelegramUser — attach faqat hali-ulanmagan userga ishlaydi.
    await prisma.telegramUser.upsert({ where: { id: altTg }, create: { id: altTg }, update: {} });
    // (2) Taklif-havolani "bosish".
    const att = await attachPendingReferral(altTg, code);
    if (!att.attached) {
      out.push(mkAttempt(true, "referral_attach_reject"));
      continue;
    }
    // (3) Alt raqam ulaydi (Member + link) — SYBIL telefon bilan.
    const altMember = await prisma.member.create({
      data: {
        type: "client",
        // ⚠️ "SIM-" prefiks MAJBURIY: resetSimData faqat shu prefiksni tozalaydi (aks holda
        //    o'tgan seed'ning fraud-alt'lari qoladi → (type,kasId) unique to'qnashuvi). seed ham
        //    kiritiladi — bir xil --name ostidagi turli seedlar to'qnashmasin.
        kasId: `SIM-FRAUD-${world.cfg.seed}-${fraudster.id}-${world.day}-${i}`,
        fullName: `Sim alt #${fraudster.id}.${world.day}.${i}`,
        phone,
        coins: 0,
      },
    });
    await prisma.telegramUser.update({ where: { id: altTg }, data: { memberId: altMember.id, linkedAt: new Date() } });
    // (4) Referralni yakunlash — telefon-dedup shu yerda payoutni nol'laydi.
    const credit = await completeReferral(altTg, altMember.id);
    if (!credit) {
      out.push(mkAttempt(true, "referral_complete_null"));
    } else if (credit.referrerReward <= 0 && credit.shareReward <= 0) {
      // Payout nol'landi = anti-sybil telefon-dedup ishladi (yoki bonus-oqim OFF nol berdi).
      out.push(mkAttempt(true, "referral_phone_dedup"));
    } else {
      // Reward va'da qilindi → hujum o'tdi (odatda ringning BIRINCHISI — dedup uchun avval hech narsa yo'q).
      out.push(mkAttempt(false, "none"));
    }
  }
  return out;
}

// ── 2) TICKET-CANCEL ABUSE — chipta ol → darhol bekor qil sikli ──────────────────────────────────
// buyTicket → cancelOwnTicket(memberId, gno). Qo'riqlar: xarid yo'lida no_ride/insufficient/…,
// bekor yo'lida will_draw (sotuv chegaraga yetgan chiptani ortga qaytarib bo'lmaydi) / final_lock.
async function ticketCancelAbuse(
  fraudster: AgentState,
  world: WorldState,
  cycles: number,
): Promise<FraudAttempt[]> {
  const out: FraudAttempt[] = [];
  if (cycles <= 0 || fraudster.memberId == null) return out;
  const memberId = fraudster.memberId;

  const prizes = await getOpenPrizes();
  if (prizes.length === 0) return out;
  // Eng arzon sovrin — xarid o'tish ehtimoli yuqori (ball yetsa).
  const cheapest = [...prizes].sort((a, b) => a.price - b.price)[0]!;

  const { cancelOwnTicket } = await import("../../services/oyinService");

  const mkAttempt = (blocked: boolean, guard: string): FraudAttempt => ({
    day: world.day, agentId: fraudster.id, kind: "ticketCancelAbuse", blocked, guard,
  });

  for (let i = 0; i < cycles; i++) {
    const buy = await tryBuyTicket(fraudster, cheapest.key);
    if (!buy.ok) {
      // Xarid darvozasi to'sdi (no_ride / insufficient / season_off / frozen / …) — sikl boshlanmadi.
      out.push(mkAttempt(true, `buy:${buy.reason ?? "unknown"}`));
      continue;
    }
    if (buy.gno == null) {
      out.push(mkAttempt(true, "buy:no_gno"));
      continue;
    }
    const cancel = await cancelOwnTicket(memberId, buy.gno);
    if (cancel.ok) {
      // Bekor o'tdi (ball qaytdi) — bu siklda qo'riq to'smadi (chegaraga yetmagan chipta bekor qilinadi).
      out.push(mkAttempt(false, "none"));
    } else {
      // will_draw / final_lock / season_off / not_ticket — bekor qilish to'sildi (chipta qotdi).
      out.push(mkAttempt(true, `cancel:${cancel.reason ?? "unknown"}`));
    }
  }
  return out;
}

// ── 3) GASHTAK REJOIN FARM — guruhga kir-chiq aylanib navbat-ball fermasi ─────────────────────────
// leaveJamoa (chiqishda cooldown belgisi qo'yiladi) → createJamoa (darhol qayta) → cooldown qo'rig'i to'sadi.
// Qo'riq: checkGashtakCooldown (oyinService.ts:2310) — create/join/add uchalasida bir xil.
async function gashtakRejoinFarm(
  fraudster: AgentState,
  world: WorldState,
  attempts: number,
): Promise<FraudAttempt[]> {
  const out: FraudAttempt[] = [];
  if (attempts <= 0 || fraudster.memberId == null) return out;
  const memberId = fraudster.memberId;

  const { leaveJamoa, createJamoa } = await import("../../services/oyinService");

  for (let i = 0; i < attempts; i++) {
    // Guruhda bo'lsa chiqadi (cooldown shtamplanadi); bo'lmasa not_in — ziyoni yo'q.
    await leaveJamoa(memberId);
    // Darhol qayta guruh tuzishga urinadi — cooldown faol bo'lsa TO'SILADI.
    const res = await createJamoa(memberId, `Ferma${fraudster.id}`, false);
    out.push({
      day: world.day,
      agentId: fraudster.id,
      kind: "gashtakRejoinFarm",
      blocked: !res.ok,
      // ok bo'lsa "none" (birinchi marta — cooldown yo'q, guruhga kirdi; keyingi kunlarda cooldown to'sadi).
      guard: res.ok ? "none" : (res.reason ?? "unknown"),
    });
  }
  return out;
}

// ── 4) STORY SPAM — submitStory ketma-ket (72h-cooldown + mavsum-limit + pending + duplicate) ──────
// Qo'riq: oyinStory.ts submitStory — pending (oldingi ariza hali ko'rilmagan) / cooldown (72h) /
// limit (STORY_SEASON_LIMIT) / duplicate (butun-populyatsiya normalizatsiyalangan URL dedup).
async function storySpam(
  fraudster: AgentState,
  world: WorldState,
  submits: number,
): Promise<FraudAttempt[]> {
  const out: FraudAttempt[] = [];
  if (submits <= 0 || fraudster.memberId == null) return out;
  const memberId = fraudster.memberId;

  const { submitStory } = await import("../../services/oyinStory");
  const hash = runHashOf(world);

  for (let i = 0; i < submits; i++) {
    // ALLOWED_HOSTS ichidagi haqiqiy host; yo'l noyob (agent+kun+idx) — bad_url o'rniga cooldown/pending sinaladi.
    const url = `https://instagram.com/p/${hash}${fraudster.id}_${world.day}_${i}`;
    const res = await submitStory(memberId, url);
    out.push({
      day: world.day,
      agentId: fraudster.id,
      kind: "storySpam",
      blocked: !res.ok,
      // Birinchi ariza o'tadi (pending bo'lib turadi) → keyingilari pending/cooldown bilan to'siladi.
      guard: res.ok ? "none" : (res.reason ?? "unknown"),
    });
  }
  return out;
}

/**
 * HAR KUN bir marta chaqiriladi (run.ts sub-fazasidan). Fraud-agentlar ustidan id-tartibida yuradi
 * (determinizm), har biri uchun rolga mos hujum-urinishlarini REAL endpointlarga uradi.
 * Faqat `AgentState.memberId != null` (real ulanган) fraud-agentlar hujum qiladi — hujumlar
 * agentning haqiqiy holatiga quriladi (soxta a'zo yaratilmaydi, faqat self-referral alt'lari bundan mustasno).
 *
 * ⚠️ world.todayCounters ni BU FUNKSIYA oshirmaydi — chaqiruvchi (run.ts) natija ustidan yuradi.
 */
export async function runFraudDay(world: WorldState, rng: Rng): Promise<FraudAttempt[]> {
  const attempts: FraudAttempt[] = [];
  for (const a of world.agents) {
    if (a.fraudRole === "none") continue;
    if (a.stage === "churned") continue;
    // rng BUDJET har fraud-agent uchun (rol deterministik → sekvensiya barqaror).
    const budget = attemptBudget(a.fraudRole, rng);
    if (a.memberId == null) continue; // hali ulanmagan — hujum uchun real a'zo yo'q (budjet baribir olindi: determinizm)

    attempts.push(...(await selfReferralRing(a, world, budget.ring)));
    attempts.push(...(await ticketCancelAbuse(a, world, budget.cancel)));
    attempts.push(...(await gashtakRejoinFarm(a, world, budget.gashtak)));
    attempts.push(...(await storySpam(a, world, budget.story)));
  }
  return attempts;
}
