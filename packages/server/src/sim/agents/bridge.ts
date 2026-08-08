// 🤝 L10 SUB-AGENT KO'PRIGI — PULLIK API YO'Q, faqat FAYL-ALMASHINUV (master-reja L10).
//
// Oqim: checkpoint kunida sim `writeAgentInbox` bilan sim-out/<run>/agent-inbox/<checkpoint>/ ga
// kontekst-fayllar yozadi (digest / events-digest / sample-agents / role-requests). Bosh Direktor
// (Claude Code sessiya) har rol uchun sub-agent yurgizadi, ular verdiktlarni
// sim-out/<run>/agent-outbox/<checkpoint>/<rol>.json ga yozadi. `readAgentOutbox` ularni o'qib
// FORMAT-tekshiruv + RAQAM-VALIDATOR (har keltirilgan metrik-raqam digest.json'dagi qiymatlardan
// ±1% ichida — bo'lmasa reject-ro'yxatga) bilan qabul/rad qiladi.
//
// SOF fs-MODUL: DB YO'Q, Math.random/Date.now YO'Q (agentlar sababiy zanjirdan TASHQARIDA —
// determinizm-hash o'zgarmaydi). types.ts ga TEGILMAGAN — qo'shimcha tiplar shu faylda lokal.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentState, FunnelStage, SimEvent, TickMetrics, WorldState } from "../types";
import { ARCHETYPE_ORDER } from "../config/personas";

// ── Lokal tiplar (types.ts o'zgarmaydi — L10 kontrakti shu yerda) ─────────────
export type RoleKey =
  | "psixolog" | "iqtisodchi" | "dizayner" | "redteam"
  | "solnomachi" | "fokus-guruh" | "ceo";

export const ALL_ROLES: readonly RoleKey[] = [
  "psixolog", "iqtisodchi", "dizayner", "redteam", "solnomachi", "fokus-guruh", "ceo",
] as const;

export interface WeeklyAggregate {
  hafta: number;              // 0-indeks (kun 0-6 = hafta 0)
  kunlar: [number, number];   // [boshKun, oxirgiKun]
  safarBirjoy: number;
  ulushPctOrtacha: number;
  yangiAware: number;
  yangiInstalled: number;
  yangiLinked: number;
  birinchiSafarlar: number;
  referrallar: number;
  chiptaSotildi: number;
  oyinOchishlar: number;
  churn: number;
  confusion: number;
  fraudUrinish: number;
  fraudBlok: number;
  qanoatOrtacha: number;
  kassaOxiri: number;
  solvencyOxiri: string;
}

export interface AgentDigest {
  run: string;
  seed: string;
  checkpoint: number;         // necha KUN o'tgani (day-indeks EMAS): metrics day < checkpoint olinadi
  simDate: string;            // qamrovdagi oxirgi sim-sana
  kunlar: number;             // qamrab olingan tik-soni
  snapshot: {
    pop: TickMetrics["pop"];
    money: TickMetrics["money"];
    oyin: TickMetrics["oyin"];
    mood: TickMetrics["mood"];
  };
  haftalik: WeeklyAggregate[];
  funnel: {
    jamiYangiAware: number;
    jamiYangiInstalled: number;
    jamiYangiLinked: number;
    jamiBirinchiSafar: number;
    jamiReferral: number;
    linkRatePct: number;        // jamiYangiLinked / jamiYangiInstalled
    linkedToFirstPct: number;   // (rode+habitual) / jamiYangiLinked
    ulushPctOxirgiKun: number;
  };
  pul: {
    revenue: number;
    prizeSpend: number;
    bonusSpend: number;
    kassa: number;
    kassaMin: number;
    outstandingTangaSom: number;
    outstandingBallSom: number;
    solvency: string;
    solvencyOzgarishlar: Array<{ kun: number; holat: string }>;
  };
  oyin: { jamiOchish: number; jamiChiptaSotildi: number; ticketsTotal: number; goliblar: number };
  fraud: { jamiUrinish: number; jamiBlok: number };
  kayfiyat: { qanoatOxirgi: number; jamiChurn: number; jamiConfusion: number };
}

export interface EventsDigest {
  jami: number;
  haftalik: number[]; // hafta-indeks bo'yicha hodisa-soni
  turlar: Record<
    string,
    { soni: number; birinchiKun: number; oxirgiKun: number; namunalar: Array<{ kun: number; detail: string }> }
  >;
}

/** Persona-karta — sub-agentlar (ayniqsa fokus-guruh) SHU odamlarni "o'ynaydi". */
export interface PersonaCard {
  agentId: number;
  arxetip: string;
  taqdirTeg: string; // nega tanlangani: "arxetip-vakili" | "ketgan" | "adashgan" | ...
  stage: FunnelStage;
  satisfaction: number;
  ridesTotal: number;
  ticketsBought: number;
  confusionEvents: number;
  lossStreak: number;
  wonEver: boolean;
  firstRideDay: number | null;
  lastRideDay: number | null;
  taklifQilingan: boolean;
  doustlarSoni: number;
  muhimTraitlar: {
    rideNeed: number;
    trust: number;
    priceSensitivity: number;
    rewardSensitivity: number;
    techAffinity: number;
    patience: number;
  };
  tavsif: string; // bir qatorlik o'zbekcha portret (deterministik, ma'lumotdan quriladi)
}

export interface RoleRequest {
  rol: RoleKey;
  savollar: string[];
  kutilganFormat: {
    fayl: string; // agent-outbox/<checkpoint>/<rol>.json
    maydonlar: Record<string, string>;
    raqamQoidasi: string;
  };
}

export interface AgentInboxPaths {
  dir: string;
  digest: string;
  eventsDigest: string;
  sampleAgents: string;
  roleRequests: string;
}

export interface OutboxVerdict {
  fayl: string;
  rol: RoleKey;
  data: Record<string, unknown>;
}

export interface OutboxReject {
  fayl: string;
  rol: string | null;
  sabablar: string[];
}

export interface OutboxResult {
  qabul: OutboxVerdict[];
  rad: OutboxReject[];
  yetishmaganRollar: RoleKey[];
}

// ── 1. INBOX yozish ───────────────────────────────────────────────────────────
/**
 * Checkpoint-kontekstni sub-agentlar uchun yozadi.
 * @param runDir     sim-out/<run> (MetricsCollector.runDir) — metrics.jsonl/events.jsonl shu yerda
 * @param checkpoint necha KUN o'tgani (cfg.checkpoints qiymati, masalan 30) — day < checkpoint olinadi
 * @param world      joriy olam-holati (sample-agents persona-kartalari shu yerdan)
 */
export function writeAgentInbox(runDir: string, checkpoint: number, world: WorldState): AgentInboxPaths {
  const ticks = readMetrics(runDir).filter((m) => m.day < checkpoint);
  if (ticks.length === 0) {
    throw new Error(`[bridge] ${runDir}/metrics.jsonl da checkpoint=${checkpoint} uchun tik topilmadi`);
  }
  const events = readEvents(runDir).filter((e) => e.day < checkpoint);

  const digest = buildDigest(ticks, checkpoint);
  const eventsDigest = buildEventsDigest(events);
  const sampleAgents = buildSampleAgents(world);
  const roleRequests = buildRoleRequests(digest, checkpoint);

  const dir = join(runDir, "agent-inbox", String(checkpoint));
  mkdirSync(dir, { recursive: true });
  const paths: AgentInboxPaths = {
    dir,
    digest: join(dir, "digest.json"),
    eventsDigest: join(dir, "events-digest.json"),
    sampleAgents: join(dir, "sample-agents.json"),
    roleRequests: join(dir, "role-requests.json"),
  };
  writeFileSync(paths.digest, JSON.stringify(digest, null, 2) + "\n");
  writeFileSync(paths.eventsDigest, JSON.stringify(eventsDigest, null, 2) + "\n");
  writeFileSync(paths.sampleAgents, JSON.stringify(sampleAgents, null, 2) + "\n");
  writeFileSync(paths.roleRequests, JSON.stringify(roleRequests, null, 2) + "\n");
  return paths;
}

function readMetrics(runDir: string): TickMetrics[] {
  const p = join(runDir, "metrics.jsonl");
  if (!existsSync(p)) throw new Error(`[bridge] metrics.jsonl topilmadi: ${p}`);
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as TickMetrics);
}

function readEvents(runDir: string): SimEvent[] {
  const p = join(runDir, "events.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SimEvent);
}

// ── 2. digest.json — metrics.jsonl'dan siqilgan xulosa ────────────────────────
function buildDigest(ticks: TickMetrics[], checkpoint: number): AgentDigest {
  const last = ticks[ticks.length - 1]!;
  const weeks = new Map<number, TickMetrics[]>();
  for (const t of ticks) {
    const w = Math.floor(t.day / 7);
    const arr = weeks.get(w);
    if (arr) arr.push(t);
    else weeks.set(w, [t]);
  }
  const haftalik: WeeklyAggregate[] = [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, ws]) => {
      const wl = ws[ws.length - 1]!;
      return {
        hafta: w,
        kunlar: [ws[0]!.day, wl.day],
        safarBirjoy: sum(ws, (t) => t.rides.birjoy),
        ulushPctOrtacha: round2(avg(ws, (t) => t.rides.sharePct)),
        yangiAware: sum(ws, (t) => t.funnel.newAware),
        yangiInstalled: sum(ws, (t) => t.funnel.newInstalled),
        yangiLinked: sum(ws, (t) => t.funnel.newLinked),
        birinchiSafarlar: sum(ws, (t) => t.funnel.firstRides),
        referrallar: sum(ws, (t) => t.funnel.referrals),
        chiptaSotildi: sum(ws, (t) => t.oyin.ticketsSold),
        oyinOchishlar: sum(ws, (t) => t.oyin.opens),
        churn: sum(ws, (t) => t.mood.churnedToday),
        confusion: sum(ws, (t) => t.mood.confusionEvents),
        fraudUrinish: sum(ws, (t) => t.fraud.attempts),
        fraudBlok: sum(ws, (t) => t.fraud.blocked),
        qanoatOrtacha: round2(avg(ws, (t) => t.mood.avgSatisfaction)),
        kassaOxiri: wl.money.ownerCash,
        solvencyOxiri: wl.money.solvency,
      };
    });

  const solvencyOzgarishlar: Array<{ kun: number; holat: string }> = [];
  let prevSolvency: string | null = null;
  let kassaMin = Number.POSITIVE_INFINITY;
  for (const t of ticks) {
    if (t.money.solvency !== prevSolvency) {
      solvencyOzgarishlar.push({ kun: t.day, holat: t.money.solvency });
      prevSolvency = t.money.solvency;
    }
    if (t.money.ownerCash < kassaMin) kassaMin = t.money.ownerCash;
  }

  const jamiYangiInstalled = sum(ticks, (t) => t.funnel.newInstalled);
  const jamiYangiLinked = sum(ticks, (t) => t.funnel.newLinked);
  const riders = last.pop.rode + last.pop.habitual;

  return {
    run: last.run,
    seed: last.seed,
    checkpoint,
    simDate: last.simDate,
    kunlar: ticks.length,
    snapshot: { pop: last.pop, money: last.money, oyin: last.oyin, mood: last.mood },
    haftalik,
    funnel: {
      jamiYangiAware: sum(ticks, (t) => t.funnel.newAware),
      jamiYangiInstalled,
      jamiYangiLinked,
      jamiBirinchiSafar: sum(ticks, (t) => t.funnel.firstRides),
      jamiReferral: sum(ticks, (t) => t.funnel.referrals),
      linkRatePct: pct(jamiYangiLinked, jamiYangiInstalled),
      linkedToFirstPct: pct(riders, jamiYangiLinked),
      ulushPctOxirgiKun: last.rides.sharePct,
    },
    pul: {
      revenue: last.money.revenue,
      prizeSpend: last.money.prizeSpend,
      bonusSpend: last.money.bonusSpend,
      kassa: last.money.ownerCash,
      kassaMin,
      outstandingTangaSom: last.money.outstandingTangaSom,
      outstandingBallSom: last.money.outstandingBallSom,
      solvency: last.money.solvency,
      solvencyOzgarishlar,
    },
    oyin: {
      jamiOchish: sum(ticks, (t) => t.oyin.opens),
      jamiChiptaSotildi: sum(ticks, (t) => t.oyin.ticketsSold),
      ticketsTotal: last.oyin.ticketsTotal,
      goliblar: last.oyin.winners,
    },
    fraud: {
      jamiUrinish: sum(ticks, (t) => t.fraud.attempts),
      jamiBlok: sum(ticks, (t) => t.fraud.blocked),
    },
    kayfiyat: {
      qanoatOxirgi: last.mood.avgSatisfaction,
      jamiChurn: sum(ticks, (t) => t.mood.churnedToday),
      jamiConfusion: sum(ticks, (t) => t.mood.confusionEvents),
    },
  };
}

// ── 3. events-digest.json ─────────────────────────────────────────────────────
const EVENT_SAMPLES_PER_TYPE = 5;

function buildEventsDigest(events: SimEvent[]): EventsDigest {
  const turlar: EventsDigest["turlar"] = {};
  const haftalikMap = new Map<number, number>();
  for (const e of events) {
    const t = turlar[e.type];
    if (t) {
      t.soni++;
      if (e.day < t.birinchiKun) t.birinchiKun = e.day;
      if (e.day > t.oxirgiKun) t.oxirgiKun = e.day;
      if (t.namunalar.length < EVENT_SAMPLES_PER_TYPE) t.namunalar.push({ kun: e.day, detail: e.detail });
    } else {
      turlar[e.type] = {
        soni: 1,
        birinchiKun: e.day,
        oxirgiKun: e.day,
        namunalar: [{ kun: e.day, detail: e.detail }],
      };
    }
    const w = Math.floor(e.day / 7);
    haftalikMap.set(w, (haftalikMap.get(w) ?? 0) + 1);
  }
  const maxHafta = haftalikMap.size > 0 ? Math.max(...haftalikMap.keys()) : -1;
  const haftalik: number[] = [];
  for (let w = 0; w <= maxHafta; w++) haftalik.push(haftalikMap.get(w) ?? 0);
  return { jami: events.length, haftalik, turlar };
}

// ── 4. sample-agents.json — 12-16 turli-taqdirli persona-karta ────────────────
const SAMPLE_MIN = 12;
const SAMPLE_MAX = 16;

const STAGE_UZ: Record<FunnelStage, string> = {
  unaware: "eshitmagan",
  aware: "eshitgan",
  installed: "botni ochgan",
  linked: "raqam ulagan",
  rode: "safar qilgan",
  habitual: "odatlangan",
  churned: "ketgan",
};

function buildSampleAgents(world: WorldState): PersonaCard[] {
  const agents = world.agents;
  const picked = new Map<number, { a: AgentState; teg: string }>();
  const add = (a: AgentState | undefined, teg: string): void => {
    if (a && !picked.has(a.id)) picked.set(a.id, { a, teg });
  };
  const top = (
    pred: (x: AgentState) => boolean,
    cmp: (p: AgentState, q: AgentState) => number,
  ): AgentState | undefined => {
    let best: AgentState | undefined;
    for (const x of agents) {
      if (!pred(x)) continue;
      if (!best || cmp(x, best) < 0) best = x;
    }
    return best;
  };
  const byRidesDesc = (p: AgentState, q: AgentState): number => q.ridesTotal - p.ridesTotal || p.id - q.id;

  // (1) HAR arxetipdan bittadan vakil — eng faoli (funnelga kirgan; bo'lmasa eng kichik id).
  for (const arch of ARCHETYPE_ORDER) {
    const vakil =
      top((x) => x.archetype === arch && x.stage !== "unaware", byRidesDesc) ??
      top((x) => x.archetype === arch, (p, q) => p.id - q.id);
    add(vakil, "arxetip-vakili");
  }
  // (2) Taqdir-slotlar — har xil hikoyalar (fokus-guruh/psixolog uchun kontrast).
  add(top((x) => x.stage === "churned", byRidesDesc), "ketgan");
  add(top((x) => x.confusionEvents > 0, (p, q) => q.confusionEvents - p.confusionEvents || p.id - q.id), "adashgan");
  add(top((x) => x.ticketsBought > 0, (p, q) => q.ticketsBought - p.ticketsBought || p.id - q.id), "chipta-xaridor");
  add(top((x) => x.wonEver, byRidesDesc), "golib");
  add(top((x) => x.stage === "linked" && x.ridesTotal === 0, (p, q) => p.id - q.id), "ulangan-minmagan");
  add(top((x) => x.stage === "installed", (p, q) => p.id - q.id), "ornatgan-ulanmagan");
  add(top((x) => x.stage === "habitual", byRidesDesc), "sadoqatli");
  add(
    top((x) => x.stage === "aware", (p, q) => (q.awareDay ?? -1) - (p.awareDay ?? -1) || p.id - q.id),
    "yangi-eshitgan",
  );
  // (3) 12 taga to'ldirish (eng faollar bilan) — 16 tadan oshirmaslik.
  if (picked.size < SAMPLE_MIN) {
    const faollar = agents
      .filter((x) => x.stage !== "unaware")
      .sort(byRidesDesc);
    for (const a of faollar) {
      if (picked.size >= SAMPLE_MIN) break;
      add(a, "qoshimcha-faol");
    }
  }
  return [...picked.values()].slice(0, SAMPLE_MAX).map(({ a, teg }) => toPersonaCard(a, teg));
}

function toPersonaCard(a: AgentState, teg: string): PersonaCard {
  const t = a.traits;
  const tavsif =
    `${a.archetype} · ${STAGE_UZ[a.stage]} · ${a.ridesTotal} safar · ${a.ticketsBought} chipta · ` +
    `qanoat ${Math.round(a.satisfaction)}/100 · adashish ${a.confusionEvents}x` +
    (a.wonEver ? " · yutgan" : "") +
    (a.invitedByAgentId != null ? " · dost taklifi bilan kelgan" : "");
  return {
    agentId: a.id,
    arxetip: a.archetype,
    taqdirTeg: teg,
    stage: a.stage,
    satisfaction: Math.round(a.satisfaction),
    ridesTotal: a.ridesTotal,
    ticketsBought: a.ticketsBought,
    confusionEvents: a.confusionEvents,
    lossStreak: a.lossStreak,
    wonEver: a.wonEver,
    firstRideDay: a.firstRideDay,
    lastRideDay: a.lastRideDay,
    taklifQilingan: a.invitedByAgentId != null,
    doustlarSoni: a.friends.length,
    muhimTraitlar: {
      rideNeed: round2(t.rideNeed),
      trust: round2(t.trust),
      priceSensitivity: round2(t.priceSensitivity),
      rewardSensitivity: round2(t.rewardSensitivity),
      techAffinity: round2(t.techAffinity),
      patience: round2(t.patience),
    },
    tavsif,
  };
}

// ── 5. role-requests.json — har rolga savollar + kutilgan format ──────────────
const RAQAM_QOIDASI =
  "Matningda keltirgan HAR metrik-raqam digest.json'dagi qiymatlardan biriga ±1% ichida bo'lishi " +
  "SHART va `raqamlar` xaritasida {nom: qiymat} ko'rinishida takrorlanishi kerak. Digest'da " +
  "yo'q raqam o'ylab topilmaydi — validator rad etadi.";

function outFile(checkpoint: number, rol: RoleKey): string {
  return `agent-outbox/${checkpoint}/${rol}.json`;
}

function buildRoleRequests(d: AgentDigest, checkpoint: number): RoleRequest[] {
  const umumiy: Record<string, string> = {
    rol: "rol nomi (aynan shu so'rovdagi qiymat)",
    checkpoint: `raqam, aynan ${checkpoint}`,
    raqamlar: "keltirilgan metrik-raqamlar xaritasi {nom: qiymat} — validator shu yerni tekshiradi",
  };
  const w = d.haftalik[d.haftalik.length - 1];
  const safarOxirgiHafta = w ? w.safarBirjoy : 0;
  return [
    {
      rol: "psixolog",
      savollar: [
        `Funnel'dagi eng katta psixologik to'siq qayerda: ${d.funnel.jamiYangiLinked} ulangandan faqat ${d.snapshot.pop.rode + d.snapshot.pop.habitual} kishi safar qildi — nega?`,
        `Jami ${d.kayfiyat.jamiConfusion} adashish-hodisasi va ${d.kayfiyat.jamiChurn} churn kuzatildi — sample-agents.json'dagi kartalarga tayanib, qaysi persona-tip eng zaif?`,
        "Qaysi psixologik mexanizm (social-proof, near-miss, present-bias) hozirgi holatda ISHLAMAYAPTI va nima o'zgartirilsin?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "psixolog"),
        maydonlar: {
          ...umumiy,
          xulosa: "3-5 gaplik asosiy xulosa (o'zbekcha)",
          topilmalar: "massiv: [{mavzu, dalil, tavsiya}] — dalil digest/sample-agents'dan",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "iqtisodchi",
      savollar: [
        `Kassa ${d.pul.kassa} so'm (minimal nuqta ${d.pul.kassaMin}), solvency "${d.pul.solvency}" — 12 oylik proyeksiyada asosiy xavf nima?`,
        `Majburiyatlar: tanga ${d.pul.outstandingTangaSom} so'm + ball ${d.pul.outstandingBallSom} so'm nominal — real cash-xavfga qanday baholaysan?`,
        "Bonus-xarajatlar qo'shimcha foydali harakat yaratdimi (delta-hisob) — VETO kerakmi?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "iqtisodchi"),
        maydonlar: {
          ...umumiy,
          xulosa: "3-5 gaplik iqtisodiy xulosa",
          solvencyBaho: "Healthy | Growing | Fragile | Critical | Insolvent (o'z bahong)",
          xavflar: "massiv: satr-ro'yxat, eng kattasidan boshlab",
          vetoTaklif: "ixtiyoriy satr: qaysi mexanikaga veto va nega",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "dizayner",
      savollar: [
        `O'yin-qatnashuv: ${d.oyin.jamiOchish} ochilish, ${d.oyin.jamiChiptaSotildi} chipta sotildi, ${d.oyin.goliblar} g'olib — o'yin-halqa qayerda uzilyapti?`,
        "Sovrin-katalog jozibasi yetarlimi (events-digest'dagi prize_filled/winner oqimiga qarab)?",
        "Qaysi BITTA o'yin-o'zgarish keyingi checkpointgacha eng ko'p qatnashuv keltiradi?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "dizayner"),
        maydonlar: {
          ...umumiy,
          xulosa: "3-5 gaplik o'yin-dizayn xulosasi",
          ishlayotgan: "massiv: nima ishlayapti (dalil bilan)",
          ishlamayotgan: "massiv: nima ishlamayapti (dalil bilan)",
          tavsiyalar: "massiv: aniq, sinaladigan takliflar",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "redteam",
      savollar: [
        `Fraud: ${d.fraud.jamiUrinish} urinish, ${d.fraud.jamiBlok} bloklangan — qo'riqlar teshigi qayerda?`,
        "Qaysi mexanika (referral, cashback, chipta, withdraw) hozirgi konfiguratsiyada eng oson ekspluatatsiya qilinadi?",
        "Eng yomon stsenariy: bitta uyushgan guruh 30 kunda qancha zarar yetkaza oladi?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "redteam"),
        maydonlar: {
          ...umumiy,
          xulosa: "3-5 gaplik xavfsizlik-xulosa (agressiv rejim)",
          zaifliklar: "massiv: [{nom, tavsif, jiddiylik}] — jiddiylik 1-5 butun son",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "solnomachi",
      savollar: [
        `${d.kunlar} kunlik davrni (hafta-hafta) hikoya qil: nima o'sdi, nima to'xtadi, burilish-nuqtalari qaysi kunlarda?`,
        "Events-digest'dagi eng muhim 3 hodisa-turini hikoyaga to'qi.",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "solnomachi"),
        maydonlar: {
          ...umumiy,
          sarlavha: "bitta gazeta-sarlavha (o'zbekcha)",
          hikoya: "haftama-hafta bayon (o'zbekcha, raqamlar digest'dan)",
          burilishNuqtalari: "massiv: [{kun, nima}]",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "fokus-guruh",
      savollar: [
        "sample-agents.json'dagi persona-kartalardan 6-10 tasini JONLI odam sifatida o'yna: har biri BirJoy haqida nima deydi?",
        "Har ishtirokchi: nimani tushundi, nimadan adashdi, ketish niyati bormi, do'stiga aytadimi?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "fokus-guruh"),
        maydonlar: {
          ...umumiy,
          ishtirokchilar:
            "massiv (6-10 ta): [{agentId, verdict, understood, confused, churnIntent, quote, wouldTellFriend}] — " +
            "verdict 1-5 butun son · understood/confused satr-massivlari · churnIntent 0..1 son · " +
            "quote JONLI o'zbekcha iqtibos (persona ovozida) · wouldTellFriend boolean",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
    {
      rol: "ceo",
      savollar: [
        `Oxirgi hafta ${safarOxirgiHafta} safar, bozor-ulush ${d.funnel.ulushPctOxirgiKun}%, solvency "${d.pul.solvency}" — joriy konfiguratsiya davom etsinmi?`,
        "Boshqa rollarning verdiktlarini (kelgach) hisobga olib: GO / MODIFY / REJECT — va NEGA?",
      ],
      kutilganFormat: {
        fayl: outFile(checkpoint, "ceo"),
        maydonlar: {
          ...umumiy,
          qaror: "GO | MODIFY | REJECT",
          nega: "qaror asosi (o'zbekcha, raqamlar digest'dan)",
          shartlar: "massiv: MODIFY bo'lsa — aniq o'zgartirish-shartlari (bo'lmasa bo'sh massiv)",
        },
        raqamQoidasi: RAQAM_QOIDASI,
      },
    },
  ];
}

// ── 6. OUTBOX o'qish + validatsiya ────────────────────────────────────────────
const SOLVENCY_VALUES = ["Healthy", "Growing", "Fragile", "Critical", "Insolvent"];
const CEO_DECISIONS = ["GO", "MODIFY", "REJECT"];
/** Matn-skan pastki chegarasi: 1-5 baho, 0..1 ehtimol kabi kichik sonlar metrik emas. */
const TEXT_NUM_MIN = 10;
/** Iqtibos-maydonlar matn-skandan ozod (jonli persona-ovoz erkin gapiradi). */
const QUOTE_KEYS = new Set(["quote", "iqtibos"]);

/**
 * agent-outbox/<checkpoint>/*.json verdiktlarni o'qiydi va validatsiya qiladi:
 * (1) format-tekshiruv (rol/checkpoint/majburiy maydonlar, fokus-guruh ishtirokchi-formati),
 * (2) raqam-validator — verdiktda keltirilgan har raqam (raqamlar-xaritasi + matn ichidagi ≥10
 *     tokenlar) digest.json'dagi qiymatlardan biriga ±1% ichida bo'lishi SHART, bo'lmasa reject.
 */
export function readAgentOutbox(runDir: string, checkpoint: number): OutboxResult {
  const outDir = join(runDir, "agent-outbox", String(checkpoint));
  const result: OutboxResult = { qabul: [], rad: [], yetishmaganRollar: [] };
  if (!existsSync(outDir)) {
    result.yetishmaganRollar = [...ALL_ROLES];
    return result;
  }

  const digestPath = join(runDir, "agent-inbox", String(checkpoint), "digest.json");
  if (!existsSync(digestPath)) {
    throw new Error(`[bridge] digest.json topilmadi (${digestPath}) — avval writeAgentInbox chaqirilsin`);
  }
  const digest = JSON.parse(readFileSync(digestPath, "utf8")) as AgentDigest;
  const pool: number[] = [];
  collectNumbers(digest, pool);

  const acceptedRoles = new Set<RoleKey>();
  const files = readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
  for (const fayl of files) {
    const full = join(outDir, fayl);
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(readFileSync(full, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        result.rad.push({ fayl, rol: null, sabablar: ["ildiz JSON-obyekt emas"] });
        continue;
      }
      data = parsed as Record<string, unknown>;
    } catch (e) {
      result.rad.push({ fayl, rol: null, sabablar: [`JSON o'qilmadi: ${(e as Error).message}`] });
      continue;
    }

    const rolRaw = data.rol;
    const rol = typeof rolRaw === "string" && (ALL_ROLES as readonly string[]).includes(rolRaw)
      ? (rolRaw as RoleKey)
      : null;
    const sabablar: string[] = [];
    if (!rol) {
      sabablar.push(`"rol" maydoni noma'lum yoki yo'q (kutilgan: ${ALL_ROLES.join("|")})`);
    } else {
      sabablar.push(...validateRoleFormat(rol, data, checkpoint));
    }
    if (rol) sabablar.push(...validateNumbers(data, pool));

    if (sabablar.length > 0) {
      result.rad.push({ fayl, rol: rolRaw != null ? String(rolRaw) : null, sabablar });
    } else {
      result.qabul.push({ fayl, rol: rol!, data });
      acceptedRoles.add(rol!);
    }
  }
  result.yetishmaganRollar = ALL_ROLES.filter((r) => !acceptedRoles.has(r));
  return result;
}

// ── Format-tekshiruv ──────────────────────────────────────────────────────────
function validateRoleFormat(rol: RoleKey, data: Record<string, unknown>, checkpoint: number): string[] {
  const errs: string[] = [];
  if (data.checkpoint !== checkpoint) {
    errs.push(`checkpoint mos emas: kutilgan ${checkpoint}, kelgan ${String(data.checkpoint)}`);
  }
  const needStr = (k: string): void => {
    if (typeof data[k] !== "string" || (data[k] as string).trim().length === 0) {
      errs.push(`"${k}" bo'sh-bo'lmagan satr bo'lishi kerak`);
    }
  };
  const needArr = (k: string): void => {
    if (!Array.isArray(data[k])) errs.push(`"${k}" massiv bo'lishi kerak`);
  };

  switch (rol) {
    case "psixolog":
      needStr("xulosa");
      needArr("topilmalar");
      break;
    case "iqtisodchi":
      needStr("xulosa");
      needArr("xavflar");
      if (typeof data.solvencyBaho !== "string" || !SOLVENCY_VALUES.includes(data.solvencyBaho)) {
        errs.push(`"solvencyBaho" ${SOLVENCY_VALUES.join("|")} dan biri bo'lishi kerak`);
      }
      break;
    case "dizayner":
      needStr("xulosa");
      needArr("ishlayotgan");
      needArr("ishlamayotgan");
      needArr("tavsiyalar");
      break;
    case "redteam":
      needStr("xulosa");
      needArr("zaifliklar");
      if (Array.isArray(data.zaifliklar)) {
        (data.zaifliklar as unknown[]).forEach((z, i) => {
          if (typeof z !== "object" || z === null) {
            errs.push(`zaifliklar[${i}] obyekt emas`);
            return;
          }
          const zo = z as Record<string, unknown>;
          if (typeof zo.nom !== "string") errs.push(`zaifliklar[${i}].nom satr emas`);
          if (typeof zo.jiddiylik !== "number" || !Number.isInteger(zo.jiddiylik) || zo.jiddiylik < 1 || zo.jiddiylik > 5) {
            errs.push(`zaifliklar[${i}].jiddiylik 1-5 butun son bo'lishi kerak`);
          }
        });
      }
      break;
    case "solnomachi":
      needStr("sarlavha");
      needStr("hikoya");
      break;
    case "fokus-guruh":
      needArr("ishtirokchilar");
      if (Array.isArray(data.ishtirokchilar)) {
        const arr = data.ishtirokchilar as unknown[];
        if (arr.length < 3) errs.push(`fokus-guruh kamida 3 ishtirokchi talab qiladi (kelgan: ${arr.length})`);
        arr.forEach((p, i) => errs.push(...validateFokusParticipant(p, i)));
      }
      break;
    case "ceo":
      needStr("nega");
      if (typeof data.qaror !== "string" || !CEO_DECISIONS.includes(data.qaror)) {
        errs.push(`"qaror" ${CEO_DECISIONS.join("|")} dan biri bo'lishi kerak`);
      }
      break;
  }
  return errs;
}

/** Master-reja L10 fokus-guruh formati: {verdict 1-5, understood[], confused[], churnIntent, quote, wouldTellFriend}. */
function validateFokusParticipant(p: unknown, i: number): string[] {
  const errs: string[] = [];
  if (typeof p !== "object" || p === null) return [`ishtirokchilar[${i}] obyekt emas`];
  const o = p as Record<string, unknown>;
  if (typeof o.verdict !== "number" || !Number.isInteger(o.verdict) || o.verdict < 1 || o.verdict > 5) {
    errs.push(`ishtirokchilar[${i}].verdict 1-5 butun son bo'lishi kerak`);
  }
  if (!Array.isArray(o.understood)) errs.push(`ishtirokchilar[${i}].understood satr-massivi bo'lishi kerak`);
  if (!Array.isArray(o.confused)) errs.push(`ishtirokchilar[${i}].confused satr-massivi bo'lishi kerak`);
  if (typeof o.churnIntent !== "number" || o.churnIntent < 0 || o.churnIntent > 1) {
    errs.push(`ishtirokchilar[${i}].churnIntent 0..1 son bo'lishi kerak`);
  }
  if (typeof o.quote !== "string" || o.quote.trim().length === 0) {
    errs.push(`ishtirokchilar[${i}].quote bo'sh-bo'lmagan o'zbekcha iqtibos bo'lishi kerak`);
  }
  if (typeof o.wouldTellFriend !== "boolean") {
    errs.push(`ishtirokchilar[${i}].wouldTellFriend boolean bo'lishi kerak`);
  }
  return errs;
}

// ── Raqam-validator ───────────────────────────────────────────────────────────
/** digest.json'ning BARCHA raqamli qiymatlarini chuqur yig'adi (validator-havzasi). */
function collectNumbers(x: unknown, pool: number[]): void {
  if (typeof x === "number") {
    if (Number.isFinite(x)) pool.push(x);
    return;
  }
  if (Array.isArray(x)) {
    for (const v of x) collectNumbers(v, pool);
    return;
  }
  if (typeof x === "object" && x !== null) {
    for (const v of Object.values(x)) collectNumbers(v, pool);
  }
}

function inPool(v: number, pool: number[]): boolean {
  for (const d of pool) {
    if (Math.abs(v - d) <= Math.max(Math.abs(d) * 0.01, 1e-9)) return true;
  }
  return false;
}

function validateNumbers(data: Record<string, unknown>, pool: number[]): string[] {
  const errs: string[] = [];
  // (a) `raqamlar` xaritasi — har qiymat digest'dan ±1% ichida.
  const raqamlar = data.raqamlar;
  if (raqamlar !== undefined) {
    if (typeof raqamlar !== "object" || raqamlar === null || Array.isArray(raqamlar)) {
      errs.push(`"raqamlar" {nom: qiymat} obyekti bo'lishi kerak`);
    } else {
      for (const [nom, qiymat] of Object.entries(raqamlar as Record<string, unknown>)) {
        if (typeof qiymat !== "number" || !Number.isFinite(qiymat)) {
          errs.push(`raqamlar["${nom}"] son emas`);
        } else if (!inPool(qiymat, pool)) {
          errs.push(`raqamlar["${nom}"]=${qiymat} digest.json'dagi hech bir qiymatga ±1% ichida mos emas`);
        }
      }
    }
  }
  // (b) Matn ichidagi raqam-tokenlar (≥10; iqtibos-maydonlar ozod, sanalar olib tashlanadi).
  scanTextNumbers(data, [], pool, errs);
  return errs;
}

function scanTextNumbers(x: unknown, path: string[], pool: number[], errs: string[]): void {
  if (typeof x === "string") {
    const lastKey = path[path.length - 1] ?? "";
    if (QUOTE_KEYS.has(lastKey)) return;
    if (lastKey === "rol") return;
    // Sana/vaqt-ko'rinishlarni olib tashlash ("2025-01-30", "2026-yil") — metrik raqam emas.
    const cleaned = x
      .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?\b/g, " ")
      .replace(/\b\d{4}-yil\w*/g, " ");
    for (const tok of cleaned.match(/-?\d+(?:[.,]\d+)?/g) ?? []) {
      const v = Number(tok.replace(",", "."));
      if (!Number.isFinite(v) || Math.abs(v) < TEXT_NUM_MIN) continue;
      if (!inPool(v, pool)) {
        errs.push(`matndagi raqam ${v} (maydon: ${path.join(".") || "?"}) digest.json'da yo'q (±1%)`);
      }
    }
    return;
  }
  if (Array.isArray(x)) {
    x.forEach((v, i) => scanTextNumbers(v, [...path, String(i)], pool, errs));
    return;
  }
  if (typeof x === "object" && x !== null) {
    for (const [k, v] of Object.entries(x)) scanTextNumbers(v, [...path, k], pool, errs);
  }
}

// ── Yordamchilar ──────────────────────────────────────────────────────────────
function sum(arr: TickMetrics[], f: (t: TickMetrics) => number): number {
  let s = 0;
  for (const t of arr) s += f(t);
  return s;
}

function avg(arr: TickMetrics[], f: (t: TickMetrics) => number): number {
  return arr.length > 0 ? sum(arr, f) / arr.length : 0;
}

function pct(num: number, den: number): number {
  return den > 0 ? round2((num / den) * 100) : 0;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
