import { describe, expect, it } from "vitest";
import { withSettingsDefaults } from "./store";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";

describe("withSettingsDefaults", () => {
  it("supplies the default layout when none is stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.schoolYearStart).toBe("2025-08-01");
    expect(s.seatLayout).toEqual(DEFAULT_SEAT_LAYOUT);
  });
  it("supplies defaults for null input", () => {
    const s = withSettingsDefaults(null);
    expect(s.seatLayout).toEqual(DEFAULT_SEAT_LAYOUT);
    expect(typeof s.schoolYearStart).toBe("string");
  });
  it("normalizes a provided layout", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      seatLayout: { rows: 6, cols: 6, seatOrder: [0, 0, 99] },
    });
    expect(s.seatLayout).toEqual({ rows: 6, cols: 6, seatOrder: [0] });
  });
  it("supplies default random picker settings when none are stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.randomPicker).toEqual({ mode: "random", resetDaily: true });
    expect(s.pickerProgress).toEqual({});
  });
  it("preserves provided random picker settings and progress", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      randomPicker: { mode: "cycle", resetDaily: false },
      pickerProgress: { "class-1": { calledStudentIds: ["s1"], cycleStartDate: "2025-09-01" } },
    });
    expect(s.randomPicker).toEqual({ mode: "cycle", resetDaily: false });
    expect(s.pickerProgress).toEqual({
      "class-1": { calledStudentIds: ["s1"], cycleStartDate: "2025-09-01" },
    });
  });
  it("supplies default view period settings when none are stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.viewPeriod).toEqual({ mode: "year", customStart: "", customEnd: "" });
  });
  it("preserves provided view period settings", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      viewPeriod: { mode: "custom", customStart: "2026-01-20", customEnd: "2026-06-05" },
    });
    expect(s.viewPeriod).toEqual({
      mode: "custom",
      customStart: "2026-01-20",
      customEnd: "2026-06-05",
    });
  });
});
