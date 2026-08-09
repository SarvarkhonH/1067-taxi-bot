// 🏙 RAQAMLI EGIZAK — yagona tip-kontrakt. HAMMA sim-modullar shu tiplarga bo'ysunadi.
// O'zgartirish = hamma modul bilan kelishish (parallel qurilishda drift bo'lmasin).

// ── Konfiguratsiya ─────────────────────────────────────────────────────────────
export interface SimConfig {
  name: string; // masalan "baseline-p1"
  seed: string; // odam o'qiy oladigan urug' — rng.seedFromString bilan raqamga aylanadi
  days: number; // necha sim-kun (P1: 30)
  population: number; // umumiy katta-yosh aholi (P1: 5000 dan boshlanadi; to'liq: 40000)
  /** Olam boshlanish sanasi (O'TMISHDA — timestamp-fixup sentineli ishlashi uchun). */
  t0Iso: string; // "2025-01-01T00:00:00+05:00"
  /** Real-hozirdan keyingi tamg'a = "tuzatilmagan" sentinel chegarasi. */
  sentinelIso: string; // "2026-06-01T00:00:00Z"
  /** Feature-flaglar (arm-konfiguratsiya) — provision setFeature bilan o'rnatadi. */
  flags: Record<string, boolean>;
  /** BONUS_ECON_KNOBS ustidan yozishlar (arm-konfiguratsiya). */
  knobs: Record<string, number>;
  /** Sovrin-katalog: "live" = jonli seed-katalog · "small" = P1 kichik test-katalog. */
  catalog: "live" | "small";
  /** Bozor parametrlari. */
  market: MarketConfig;
  /** Har kuni yangi eshituvchilar oqimi (reklama/organik) — adoption kirishi. */
  dailyAwarenessInflow: number;
  /** Kalibratsiya-siklda sozlanadigan xulq-parametrlar (default: calibrated-params.json). */
  behavior: BehaviorParams;
  checkpoints: number[]; // masalan [30] yoki [30, 90, 365]
  /** L7 firibgar-hujumlar YOQILADImi. Default OFF: baseline/kalibratsiya taqsimoti fraudsiz
   *  (aholida 2% fraud-rol BOR, lekin hujum QILMAYDI) — fraud ALOHIDA red-team pass'da (P4). */
  enableFraud?: boolean;
}

export interface MarketConfig {
  rides1415PerDay: number; // ~2000
  rides1313PerDay: number; // ~1000
  /** BirJoy ta'minoti: bir vaqtda xizmatdagi haydovchilar (kutish-vaqtga ta'sir). */
  birjoyDrivers: number;
  /** O'rtacha kutish (daqiqa) raqiblarda / BirJoy'da bazaviy. */
  waitCompetitorMin: number;
  waitBirjoyBaseMin: number;
}

/** Kalibratsiya aynan SHU parametrlarni buraydi (L2-halqa). */
export interface BehaviorParams {
  /** aware → installed (bot start) kunlik ehtimol-bazasi. */
  pInstallBase: number;
  /** installed → linked (raqam ulash) kunlik ehtimol (real: 72.5% umumiy). */
  pLinkBase: number;
  /** linked → 1-safar: kunlik urinish-ehtimoli bazasi (real umrbod-konv: 19.4%). */
  pFirstRideBase: number;
  /** Safar-chastota bazasi (safar/hafta, persona-koeff bilan ko'payadi). */
  ridesPerWeekBase: number;
  /** 1-safardan keyin odatlanish-kuchi (repeat boost; real 1→2: 58.4%, median 1.5 kun). */
  habitBoost: number;
  /** Kunlik churn-baza (satisfaction past bo'lsa ko'payadi). */
  pChurnBase: number;
  /** Ijtimoiy yuqumlilik: do'st faol bo'lsa awareness/istak-boost. */
  socialContagion: number;
  /** Taklif-yuborish ehtimol-bazasi (trigger kelganda). */
  pInviteBase: number;
  /** O'yin-ochish ehtimol-bazasi (gameAffinity bilan ko'payadi). */
  pOpenGameBase: number;
  /** Chipta-xarid moyillik-bazasi (prospect-qiymat ijobiy bo'lganda). */
  pBuyTicketBase: number;
  /** "Hech qachon ulamaydiganlar" darvozasi: trust/tech-ball shu chegaradan past bo'lsa —
   *  umuman ulamaydi (real: bot-userlarning 27.5%i raqam ulamagan). */
  linkGate: number;
  /** "Hech qachon minmaydiganlar" darvozasi: rideNeed/trust-ball past bo'lsa 1-safar bo'lmaydi
   *  (real: ulanganlarning 80.6%i hech minmagan). */
  firstRideGate: number;
  /** YETIB BORILADIGAN auditoriya ulushi (0..1). Faqat shu ulushdagi aholi umuman "eshitadi" —
   *  qolgani hech qachon aware bo'lmaydi (real: Telegram-taksi hammaga yetmaydi). Bu — PLATO
   *  manbai: awareness-oqim shu chekli hovuz tugagach so'nadi (P2-backtest tuzatishi). */
  reachablePct: number;
}

// ── Aholi ──────────────────────────────────────────────────────────────────────
export type ArchetypeKey =
  | "oddiy" | "qatnovchi" | "oyinchi" | "chempion"
  | "talaba" | "savdogar" | "sinovchi" | "konservator";

/** 13+ trait — hammasi 0..1 (ega ro'yxati; personas.ts prior-larni beradi). */
export interface Traits {
  income: number;         // daromad-darajasi
  age: number;            // 0=18yosh .. 1=65+
  rideNeed: number;       // taksi-ehtiyoj chastotasi
  priceSensitivity: number;
  loyalty: number;        // brend-sodiqlik (habit kuchi)
  patience: number;       // sabr (confusion'ga chidam)
  socialInfluence: number;// atrofga ta'sir kuchi + ta'sirlanish
  riskTolerance: number;
  rewardSensitivity: number; // bonus/sovg'aga qiziqish
  familiarity1415: number;   // eski dispetcherga o'rganganlik
  inviteProclivity: number;  // do'st chaqirish moyilligi
  quitAfterLoss: number;     // yutqazgach ketish moyilligi
  returnAfterWin: number;    // yutgach qaytish/kuchayish
  trust: number;             // yangi xizmatga ishonch
  techAffinity: number;      // ilova-ko'nikma
  cashNeed: number;          // pul yechishga ehtiyoj
}

export type FunnelStage =
  | "unaware" | "aware" | "installed" | "linked" | "rode" | "habitual" | "churned";

export type FraudRole = "none" | "opportunist" | "fraudster";

export interface AgentState {
  id: number; // sim-ichki indeks (0..N-1)
  archetype: ArchetypeKey;
  traits: Traits;
  mahallaId: number;
  householdId: number;
  friends: number[]; // agent-id lar (graf)
  fraudRole: FraudRole;
  // Funnel/holat
  stage: FunnelStage;
  awareDay: number | null;
  satisfaction: number; // 0..100
  dispatcherHabit: number; // 0=1415ga to'liq o'rgangan .. 1=BirJoy odat
  // Real-DB bog'lamlari (installed bo'lganda yaratiladi)
  tgId: string | null;
  memberId: number | null;
  referralCode: string | null; // o'z taklif-kodi (kerak bo'lganda olinadi)
  invitedByAgentId: number | null;
  // Hisoblagichlar (sim-tomon kuzatuv; DB — haqiqat manbai)
  ridesTotal: number;
  firstRideDay: number | null;
  lastRideDay: number | null;
  ticketsBought: number;
  lossStreak: number; // ketma-ket yutqazgan chiptalar
  wonEver: boolean;
  lastGameOpenDay: number | null;
  confusionEvents: number;
}

export interface Mahalla {
  id: number;
  name: string;
  agentIds: number[];
  /** So'nggi 14 kunda shu mahallada ko'ringan yutuqlar (social-proof boost). */
  recentWins: number[];
}

// ── Olam ───────────────────────────────────────────────────────────────────────
export interface WorldState {
  cfg: SimConfig;
  day: number; // 0-index sim-kun
  agents: AgentState[];
  mahallas: Mahalla[];
  /** Sintetik booking-id hisoblagichi (RideReward unique [memberId, bookingId]). */
  nextBookingId: number;
  owner: OwnerBooksState;
  /** Kunlik yig'iladigan hodisa-hisoblagichlar (metrics uchun, har tik nollanadi). */
  todayCounters: TodayCounters;
}

export interface TodayCounters {
  ridesBirjoy: number;
  rides1415: number;
  rides1313: number;
  newAware: number;
  newInstalled: number;
  newLinked: number;
  firstRides: number;
  referralsAttached: number;
  ticketsSold: number;
  gameOpens: number;
  churnedToday: number;
  confusionEvents: number;
  fraudAttempts: number;
  fraudBlocked: number;
}

// ── Ega-daftari (soxta kas1067) ────────────────────────────────────────────────
export interface OwnerBooksState {
  cash: number; // so'm
  revenueTotal: number;
  prizeSpendTotal: number;
  bonusSpendTotal: number; // tanga-to'lovlar so'mda (yechish/cashout)
  opCostTotal: number;
  /** Majburiyatlar (nominal): muomaladagi tanga + ball×20. Har kun DB'dan qayta o'lchanadi. */
  outstandingTangaSom: number;
  outstandingBallSom: number;
  solvencyStatus: "Healthy" | "Growing" | "Fragile" | "Critical" | "Insolvent";
  criticalSince: { day: number; reason: string } | null;
  bankruptDay: number | null;
}

// ── Metrikalar (har tik 1 qator JSONL) ────────────────────────────────────────
export interface TickMetrics {
  run: string;
  seed: string;
  day: number;
  simDate: string;
  pop: { aware: number; installed: number; linked: number; rode: number; habitual: number; churned: number; active7: number };
  rides: { birjoy: number; d1415: number; d1313: number; sharePct: number };
  money: {
    revenue: number; prizeSpend: number; bonusSpend: number;
    ownerCash: number; outstandingTangaSom: number; outstandingBallSom: number;
    solvency: OwnerBooksState["solvencyStatus"];
  };
  oyin: { opens: number; ticketsSold: number; ticketsTotal: number; prizesFilled: number; winners: number; jamoas: number };
  funnel: { newAware: number; newInstalled: number; newLinked: number; firstRides: number; referrals: number };
  mood: { avgSatisfaction: number; churnedToday: number; confusionEvents: number };
  fraud: { attempts: number; blocked: number };
  slo: { tickMs: number };
}

/** Yakuniy run-natija (ko'p-seed taqsimot uchun). */
export interface RunSummary {
  run: string;
  seed: string;
  days: number;
  finalLinked: number;
  finalRode: number;
  monthlyRides: number; // oxirgi 30 kundagi BirJoy safarlari
  monthlyRiders: number;
  d7Retention: number;
  d30Retention: number;
  firstToSecondPct: number;
  linkRatePct: number;
  linkedToFirstPct: number;
  sharePctEnd: number;
  /** N9: riderlardan ≥10 safar qilganlar ulushi (real 14.5%). */
  share10Pct: number;
  /** N10: jami sotilgan chipta (nol-start tekshiruvi). */
  ticketsTotal: number;
  /** N8: 1-oy faollaridan 2-oyda ham safar qilganlar ulushi (real ~60%). 60+ kunlik runda mazmunli. */
  m2mRetentionPct: number;
  ownerCashEnd: number;
  solvencyEnd: OwnerBooksState["solvencyStatus"];
  bankruptDay: number | null;
  growthX: number; // monthlyRides / baseline(642)
}

// ── Hodisa-jurnal (events.jsonl) ───────────────────────────────────────────────
export interface SimEvent {
  day: number;
  type: string; // "prize_filled" | "winner" | "bankrupt" | "fraud_blocked" | ...
  detail: string;
  data?: Record<string, unknown>;
}
