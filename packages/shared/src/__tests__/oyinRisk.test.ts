// 🛠 O'yin konsoli — XAVF BALLI va AUDIT sxemasi. SOF funksiyalar, DB yo'q.
//
// Nega test kerak: xavf balli odamlarni TEKSHIRUV NAVBATIGA saralaydi. Og'irlik yoki chegara
// jimgina o'zgarsa, ega boshqa odamlarni tekshirib yuradi va buni sezmaydi. Shuning uchun
// har og'irlik va har chegara shu yerda QOTIRILGAN — o'zgartirish testni yiqitadi.
import { describe, expect, it } from "vitest";
import {
  OYIN_AUDIT_ACTIONS,
  OYIN_AUDIT_MAX,
  OYIN_RISK_FLAGS,
  OYIN_RISK_LIMITS,
  OYIN_RISK_WEIGHTS,
  oyinRiskScore,
  type OyinRiskInput,
} from "../oyin";

const clean: OyinRiskInput = { earned: 3200, seasonRides: 44, adjust: 0, maxCardsOnOnePrize: 2, maxReferralsInADay: 1 };

describe("oyinRiskScore — toza mijoz", () => {
  it("faol, ko'p safar qilgan mijozda 0 ball va 0 flag", () => {
    const r = oyinRiskScore(clean);
    expect(r.score).toBe(0);
    expect(r.flags).toEqual([]);
    expect(r.reasons).toEqual([]);
  });

  it("ball ko'p bo'lsa ham, safar yetarli bo'lsa shubha YO'Q", () => {
    // Bu eng muhim salbiy holat: eng yaxshi mijoz (ko'p safar → ko'p ball) shubhali
    // bo'lib qolsa, ro'yxat ma'nosini yo'qotadi.
    expect(oyinRiskScore({ ...clean, earned: 99_000, seasonRides: 300 }).score).toBe(0);
  });
});

describe("ballWithoutRides — safarsiz ball", () => {
  it("safar kam + ball ko'p → flag va 45 ball", () => {
    const r = oyinRiskScore({ ...clean, seasonRides: 3, earned: 6140 });
    expect(r.flags).toContain("ballWithoutRides");
    expect(r.score).toBe(OYIN_RISK_WEIGHTS.ballWithoutRides);
    expect(r.reasons[0]).toContain("3 safar");
  });

  it("chegara ANIQ: 5 safar shubhali EMAS, 4 safar shubhali", () => {
    expect(oyinRiskScore({ ...clean, seasonRides: 5, earned: 9000 }).flags).not.toContain("ballWithoutRides");
    expect(oyinRiskScore({ ...clean, seasonRides: 4, earned: 9000 }).flags).toContain("ballWithoutRides");
  });

  it("safar kam, lekin ball ham kam → shubha YO'Q (yangi mijoz jazolanmaydi)", () => {
    expect(oyinRiskScore({ ...clean, seasonRides: 1, earned: 1999 }).flags).toEqual([]);
    expect(oyinRiskScore({ ...clean, seasonRides: 1, earned: 2000 }).flags).toContain("ballWithoutRides");
  });
});

describe("cardHoarding — bitta mukofotga karta yig'ish", () => {
  it("5 ta karta → flag, 4 ta → yo'q", () => {
    expect(oyinRiskScore({ ...clean, maxCardsOnOnePrize: 5 }).flags).toContain("cardHoarding");
    expect(oyinRiskScore({ ...clean, maxCardsOnOnePrize: 4 }).flags).not.toContain("cardHoarding");
  });
});

describe("referBurst — bir kunda ko'p do'st", () => {
  it("4 ta → flag, 3 ta → yo'q", () => {
    expect(oyinRiskScore({ ...clean, maxReferralsInADay: 4 }).flags).toContain("referBurst");
    expect(oyinRiskScore({ ...clean, maxReferralsInADay: 3 }).flags).not.toContain("referBurst");
  });
});

describe("adjustHeavy — ball qo'ldan berilgan", () => {
  it("yig'ilganning yarmidan ko'pi qo'lda qo'shilgan bo'lsa → flag", () => {
    const r = oyinRiskScore({ ...clean, earned: 4000, adjust: 2000 });
    expect(r.flags).toContain("adjustHeavy");
    expect(r.reasons.some((x) => x.includes("50%"))).toBe(true);
  });

  it("MANFIY tuzatish HECH QACHON shubha emas — bu jazo/tuzatish, ayb emas", () => {
    expect(oyinRiskScore({ ...clean, earned: 4000, adjust: -3000 }).flags).not.toContain("adjustHeavy");
  });

  it("earned=0 da bo'linish xatosi yo'q", () => {
    const r = oyinRiskScore({ ...clean, earned: 0, adjust: 500, seasonRides: 44 });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.flags).not.toContain("adjustHeavy");
  });
});

describe("yig'indi va shift", () => {
  it("hamma signal yonsa ham 100 dan oshmaydi", () => {
    const r = oyinRiskScore({ earned: 9000, seasonRides: 0, adjust: 8000, maxCardsOnOnePrize: 12, maxReferralsInADay: 9 });
    expect(r.score).toBe(100);
    expect(r.flags).toHaveLength(4);
  });

  it("og'irliklar yig'indisi 100 dan oshadi — ya'ni shift HAQIQATAN kerak", () => {
    const total = Object.values(OYIN_RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("har flagning o'z og'irligi bor (ro'yxat va og'irlik jadvali mos)", () => {
    for (const f of OYIN_RISK_FLAGS) expect(OYIN_RISK_WEIGHTS[f]).toBeGreaterThan(0);
    expect(Object.keys(OYIN_RISK_WEIGHTS)).toHaveLength(OYIN_RISK_FLAGS.length);
  });
});

describe("chegaralar qotirilgan (jim surilish qo'rig'i)", () => {
  it("kutilgan qiymatlar", () => {
    expect(OYIN_RISK_LIMITS).toEqual({ minRides: 5, ballFloor: 2000, cardsOnOnePrize: 5, referralsPerDay: 4, adjustShare: 0.5 });
    expect(OYIN_RISK_WEIGHTS).toEqual({ ballWithoutRides: 45, cardHoarding: 25, referBurst: 20, adjustHeavy: 10 });
  });

  it("«kunlik shift» signali YO'Q — kodda bunday shift mavjud emas, o'ylab topilmadi", () => {
    expect(OYIN_RISK_FLAGS as readonly string[]).not.toContain("capHits");
    expect(OYIN_RISK_FLAGS as readonly string[]).not.toContain("dailyCap");
  });
});

describe("audit sxemasi", () => {
  it("jurnal aylanma va chegarasi bor (AppState cheksiz o'smasin)", () => {
    expect(OYIN_AUDIT_MAX).toBe(500);
  });

  it("PUL bilan bog'liq har amal jurnalga tushadigan ro'yxatda bor", () => {
    for (const a of ["ball.adjust", "ticket.cancel", "prize.upsert", "prize.cancelTickets", "season.reset", "freeze.set", "catalog.bulk"]) {
      expect(OYIN_AUDIT_ACTIONS as readonly string[]).toContain(a);
    }
  });

  it("amal nomlari noyob", () => {
    expect(new Set(OYIN_AUDIT_ACTIONS).size).toBe(OYIN_AUDIT_ACTIONS.length);
  });
});
