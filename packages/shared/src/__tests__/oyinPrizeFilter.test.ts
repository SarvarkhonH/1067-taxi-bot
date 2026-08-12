// 🔎 Vitrina filtri (ega talabi 2026-08-12): «bir kartalik · ko'p kartalik · kam kartali ·
// qimmat · arzon · yutilishiga kam qolganlari».
//
// Nega test: «arzon/qimmat» chegarasi RO'YXATNING O'ZIDAN hisoblanadi. Bu ataylab shunday —
// katalog o'zgarsa chegara ham siljiydi va filtr bo'sh qolib qolmaydi. Lekin shu sababdan u
// jimgina noto'g'ri ishlashi oson (bitta elementli ro'yxat, teng narxlar, bo'sh ro'yxat).
import { describe, expect, it } from "vitest";
import { oyinFilterPrizes, OYIN_PRIZE_FILTERS, type OyinFilterablePrize } from "../oyin";

const p = (price: number, limit: number, remaining: number): OyinFilterablePrize => ({ price, limit, remaining });

// arzon → qimmat tartibida
const LIST: OyinFilterablePrize[] = [
  p(200, 1, 1),    // bir kartalik
  p(400, 8, 6),    // kam kartali
  p(600, 24, 2),   // tugayapti (2/24 ≈ 8%)
  p(900, 50, 40),  // ko'p kartali
  p(1500, 60, 3),  // ko'p kartali + tugayapti (3/60 = 5%)
];

describe("oyinFilterPrizes", () => {
  it("«hammasi» ro'yxatni o'zgartirmaydi", () => {
    expect(oyinFilterPrizes(LIST, "hammasi")).toHaveLength(5);
  });

  it("«bitta» — faqat limit=1", () => {
    const r = oyinFilterPrizes(LIST, "bitta");
    expect(r).toHaveLength(1);
    expect(r[0]?.limit).toBe(1);
  });

  it("«kam» bir kartalikni O'Z ICHIGA OLMAYDI — u alohida filtr", () => {
    const r = oyinFilterPrizes(LIST, "kam");
    expect(r.map((x) => x.limit)).toEqual([8]);
  });

  it("«kop» — 40 va undan ko'p", () => {
    expect(oyinFilterPrizes(LIST, "kop").map((x) => x.limit)).toEqual([50, 60]);
  });

  it("«tugayapti» — qolgani chorakdan kam, LEKIN nol emas", () => {
    const r = oyinFilterPrizes(LIST, "tugayapti");
    expect(r.map((x) => x.remaining)).toEqual([2, 3]);
  });

  it("TUGAGAN sovg'a «tugayapti» ga TUSHMAYDI — u arxivga ketadi", () => {
    // 0 qolgan = sotib bo'lmaydi. Uni «tugayapti» deb ko'rsatish bo'sh va'da bo'lardi.
    expect(oyinFilterPrizes([p(500, 10, 0)], "tugayapti")).toHaveLength(0);
  });

  it("«arzon» va «qimmat» ro'yxatning O'ZIDAN hisoblanadi va BO'SH qolmaydi", () => {
    const arzon = oyinFilterPrizes(LIST, "arzon");
    const qimmat = oyinFilterPrizes(LIST, "qimmat");
    expect(arzon.length).toBeGreaterThan(0);
    expect(qimmat.length).toBeGreaterThan(0);
    // Eng arzoni «arzon» da, eng qimmati «qimmat» da bo'lishi SHART.
    expect(arzon.some((x) => x.price === 200)).toBe(true);
    expect(qimmat.some((x) => x.price === 1500)).toBe(true);
    // Va ular bir-birini butunlay qoplamasligi kerak.
    expect(arzon.length + qimmat.length).toBeLessThanOrEqual(LIST.length + 1);
  });

  it("bitta elementli ro'yxat hech qaysi narx-filtrida yiqilmaydi", () => {
    const one = [p(700, 5, 5)];
    expect(oyinFilterPrizes(one, "arzon")).toHaveLength(1);
    expect(oyinFilterPrizes(one, "qimmat")).toHaveLength(1);
  });

  it("bo'sh ro'yxat — har filtrda bo'sh, xato yo'q", () => {
    for (const f of OYIN_PRIZE_FILTERS) expect(oyinFilterPrizes([], f.id)).toHaveLength(0);
  });

  it("hamma filtr tugmasi haqiqiy filtr id'siga ega (o'lik tugma yo'q)", () => {
    for (const f of OYIN_PRIZE_FILTERS) {
      expect(() => oyinFilterPrizes(LIST, f.id)).not.toThrow();
    }
    expect(OYIN_PRIZE_FILTERS.map((f) => f.id)).toContain("hammasi");
  });
});
