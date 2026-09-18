import { describe, expect, it } from "vitest";
import { uxMarksLine } from "../uxMarks";

// P0-2: the phone's timing marks become one log line — and nothing else gets through.
describe("uxMarksLine", () => {
  it("writes the known marks in a fixed order, rounded", () => {
    expect(uxMarksLine({ name: 612.4, sheet: 180, boot: 95.6, cache: true })).toBe("sheet=180 name=612 boot=96 cache=hit");
    expect(uxMarksLine({ sheet: 900, cache: false })).toBe("sheet=900 cache=miss");
  });

  it("drops anything unknown, negative, huge or not a number", () => {
    expect(uxMarksLine({ sheet: -5, name: 70_000, boot: "12", phone: "+998901234567", user: 123 })).toBeNull();
    expect(uxMarksLine({ sheet: 200, phone: "+998901234567" })).toBe("sheet=200");
    expect(uxMarksLine(null)).toBeNull();
    expect(uxMarksLine("sheet=1")).toBeNull();
    expect(uxMarksLine({ cache: true })).toBeNull(); // a flag alone says nothing
  });
});
