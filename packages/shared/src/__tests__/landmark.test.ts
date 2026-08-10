// 🏷 «Eng yaqin ≠ eng foydali» — server `nearestCatalogAddress` da orientir afzalligi bor.
// Bu test o'sha QARORNI (qaysi nom taniqli orientir) sof funksiya darajasida qulflaydi:
// ega jonli sinovda «sizning manzilingiz: QAZILI XOTDOG» ko'rgan edi, chunki mayda savdo
// nuqtasi 40 m da, «5-MAKTAB» esa 120 m da edi.
import { describe, expect, it } from "vitest";
import { placeKind } from "../pickup";

const LANDMARK = new Set(["school", "bazaar", "mahalla", "gov", "mosque", "transit", "park", "health"]);
const isLandmark = (n: string) => LANDMARK.has(placeKind(n));

describe("orientir tanlash", () => {
  it("haydovchi biladigan joylar ORIENTIR deb hisoblanadi", () => {
    for (const n of ["5-MAKTAB", "ESKI BOZOR", "RAVOT MAHALLA", "HOKIMLIK", "JOME MASJIDI", "AVTOSTANSIYA", "YOSHLAR BOG'I", "TUMAN POLIKLINIKASI"]) {
      expect(isLandmark(n), n).toBe(true);
    }
  });
  it("mayda savdo nuqtalari ORIENTIR EMAS — ular «manzilingiz» bo'lib chiqmasligi kerak", () => {
    for (const n of ["QAZILI XOTDOG", "KOMIL QASSOB", "ESABOY", "OTABEKVIDEO STUDIO"]) {
      expect(isLandmark(n), n).toBe(false);
    }
  });
});
