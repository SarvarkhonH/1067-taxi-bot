import { describe, expect, it } from "vitest";
import { REORDER_CANCEL_LIMIT, reorderNeedsConfirm } from "../reorder";

// P0-8 (Q2): one tap for a returning passenger; the confirm screen stays for a first ride and after
// four self-cancels in a day.
describe("reorderNeedsConfirm", () => {
  it("a returning passenger calls with one tap", () => {
    expect(reorderNeedsConfirm({ trips: 1, cancelsToday: 0 })).toBe(false);
    expect(reorderNeedsConfirm({ trips: 40, cancelsToday: 3 })).toBe(false);
  });

  it("a first ride keeps the confirm screen", () => {
    expect(reorderNeedsConfirm({ trips: 0, cancelsToday: 0 })).toBe(true);
    expect(reorderNeedsConfirm({ trips: null, cancelsToday: 0 })).toBe(true);
    expect(reorderNeedsConfirm({ trips: undefined, cancelsToday: undefined })).toBe(true);
  });

  it("four self-cancels in a day bring it back — the server's own limit", () => {
    expect(REORDER_CANCEL_LIMIT).toBe(4);
    expect(reorderNeedsConfirm({ trips: 12, cancelsToday: 4 })).toBe(true);
    expect(reorderNeedsConfirm({ trips: 12, cancelsToday: 9 })).toBe(true);
  });
});
