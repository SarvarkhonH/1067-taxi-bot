import { describe, expect, it } from "vitest";
import { waitLabel } from "../honestWait";

// P0-6: the honest range, or no number — never the straight-line guess it replaces.
describe("waitLabel", () => {
  it("with honesteta: the measured range", () => {
    expect(waitLabel({ etaMin: 2, waitMin: { lo: 3, hi: 7 } }, true)).toBe("3–7");
  });

  it("with honesteta and no measured range: nothing — not the straight-line guess", () => {
    expect(waitLabel({ etaMin: 2, waitMin: null }, true)).toBeNull();
    expect(waitLabel({ etaMin: 2 }, true)).toBeNull();
  });

  it("without honesteta: yesterday's ~N, the range ignored", () => {
    expect(waitLabel({ etaMin: 2, waitMin: { lo: 3, hi: 7 } }, false)).toBe("~2");
    expect(waitLabel({ etaMin: null, waitMin: { lo: 3, hi: 7 } }, false)).toBeNull();
    expect(waitLabel(null, false)).toBeNull();
  });
});
