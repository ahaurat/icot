import { describe, expect, it } from "vitest";
import { describeEventDuration, localDateKey, resolveViewPeriodRange } from "./time";
import type { AppEvent } from "../types";

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: "e1",
    studentId: "s1",
    classId: "c1",
    categoryKey: "bathroom",
    type: "timed",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
    durationSeconds: 300,
    open: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    ...patch,
  };
}

describe("describeEventDuration", () => {
  it("describes a count event as a single tally", () => {
    expect(
      describeEventDuration(makeEvent({ type: "count", categoryKey: "cellphone", durationSeconds: null }))
    ).toBe("1×");
  });

  it("describes a closed timed event by its stored duration", () => {
    expect(describeEventDuration(makeEvent({ durationSeconds: 95 }))).toBe("1m 35s");
  });

  it("describes an open timed event as running, using elapsed time", () => {
    const started = new Date(Date.now() - 65_000).toISOString();
    const text = describeEventDuration(
      makeEvent({ open: true, startedAt: started, durationSeconds: null, endedAt: null })
    );
    expect(text).toMatch(/\(running\)$/);
    expect(text).toMatch(/^1m/);
  });
});

describe("resolveViewPeriodRange", () => {
  it('uses the school-year start through now when mode is "year"', () => {
    const range = resolveViewPeriodRange(
      { mode: "year", customStart: "", customEnd: "" },
      "2025-08-01",
      new Date("2026-01-15T12:00:00")
    );
    expect(localDateKey(range.start)).toBe("2025-08-01");
  });

  it('uses the custom start/end when mode is "custom" and both are set', () => {
    const range = resolveViewPeriodRange(
      { mode: "custom", customStart: "2026-01-20", customEnd: "2026-06-05" },
      "2025-08-01"
    );
    expect(localDateKey(range.start)).toBe("2026-01-20");
    expect(localDateKey(range.end)).toBe("2026-06-05");
  });

  it('falls back to whole-year when mode is "custom" but a date is missing', () => {
    const range = resolveViewPeriodRange(
      { mode: "custom", customStart: "2026-01-20", customEnd: "" },
      "2025-08-01",
      new Date("2026-01-15T12:00:00")
    );
    expect(localDateKey(range.start)).toBe("2025-08-01");
  });
});
