// 🎯 P1 baseline-konfiguratsiya: BASELINE.md nishonlariga (N1..N10) boshlang'ich xulq-baho.
// L2-kalibratsiya aynan `behavior` maydonlarini buraydi — bu yerdagi qiymatlar START-nuqta.
import type { SimConfig } from "../types";

export const BASELINE_CONFIG: SimConfig = {
  name: "baseline-p1",
  seed: "p1-baseline-001",
  days: 30,
  population: 5000,
  t0Iso: "2025-01-01T00:00:00+05:00",
  sentinelIso: "2026-06-01T00:00:00Z",
  // Jonli holat 2026-08-08: oyin/jamoa yoqiq, bonus-oqimlar OFF (referral-bonuses-live-off).
  flags: { oyin: true, jamoa: true, welcomebonus: false, refstaged: false, recruit: false },
  knobs: {}, // jonli BONUS_ECON_KNOBS defaultlari o'zgarishsiz
  catalog: "small",
  market: {
    rides1415PerDay: 2000, // bozor-anchor (BASELINE.md §6)
    rides1313PerDay: 1000,
    birjoyDrivers: 8,
    waitCompetitorMin: 4,
    waitBirjoyBaseMin: 6,
  },
  dailyAwarenessInflow: 25, // ~1177 bot-user / ~2 oy oqimidan kunlik baho
  checkpoints: [30],
  behavior: {
    // aware→installed kunlik baza: iyul-portlashda oqim tez edi, o'rtacha bir-necha kunda start.
    pInstallBase: 0.1,
    // N3 (link-rate 72.5%): YUQORI kunlik ehtimol — ko'pchilik bir hafta ichida ulaydi.
    pLinkBase: 0.4,
    // N4 (ulangan→1-safar umrbod 19.4%): eng katta yo'qotish shu yerda — PAST kunlik baza.
    pFirstRideBase: 0.01,
    // N1 (642 safar/oy) + o'rtacha 5.87 safar/rider: baza ~1.5 safar/hafta, persona-koeff ko'paytiradi.
    ridesPerWeekBase: 1.5,
    // N5 (1→2-safar 58.4%, median 1.5 kun): 1-safardan keyin urinish-ehtimoli KUCHLI ko'payadi.
    habitBoost: 2.5,
    // N6/N7 (D7 54.4%, D30 76.5%): churn sekin — kichik kunlik baza.
    pChurnBase: 0.008,
    // Referral/mahalla-tarqalish (283 referral-yozuv): o'rtacha yuqumlilik.
    socialContagion: 0.15,
    // 283 taklif / 854 ulangan umrbod → trigger-boshiga past ehtimol.
    pInviteBase: 0.05,
    // N10 (o'yin nol-startdan): ochilishlar kam boshlanadi, gameAffinity-traitlar ko'paytiradi.
    pOpenGameBase: 0.02,
    // N10 (chipta-xaridor jonlida 1 kishi): xarid-moyillik juda past start.
    pBuyTicketBase: 0.005,
    // N3 (72.5% ulaydi): trait-ball taqsimotida pastki ~27% shu darvozadan o'tmaydi.
    linkGate: 0.35,
    // N4 (19.4% minadi): yuqori darvoza — ko'pchilik ulangan hech qachon minmaydi.
    firstRideGate: 0.55,
  },
};
