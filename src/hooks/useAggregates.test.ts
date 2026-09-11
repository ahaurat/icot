import { describe, expect, it } from "vitest";
import { computeCategoryTotalsInRange } from "./useAggregates";
import type { AppEvent } from "../types";
import type { DateRange } from "../utils/time";

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: "e1",
    studentId: "s1",
    classId: "c1",
    categoryKey: "bathroom",
    type: "timed",
    startedAt: "2026-01-10T12:00:00.000Z",
    endedAt: "2026-01-10T12:05:00.000Z",
    durationSeconds: 300,
    open: false,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:05:00.000Z",
    ...patch,
  };
}

const january: DateRange = {
  start: new Date("2026-01-01T00:00:00"),
  end: new Date("2026-01-31T23:59:59"),
  label: "January",
};

describe("computeCategoryTotalsInRange", () => {
  it("sums a timed category's durations for the given student, within range", () => {
    const events = [
      makeEvent({ id: "e1", durationSeconds: 300 }),
      makeEvent({ id: "e2", studentId: "other-student", durationSeconds: 999 }),
      makeEvent({ id: "e3", startedAt: "2025-12-01T00:00:00.000Z", durationSeconds: 999 }),
    ];
    const totals = computeCategoryTotalsInRange(events, "s1", january);
    expect(totals.bathroom).toBe(300);
  });

  it("counts count-type events as 1 each", () => {
    const events = [
      makeEvent({ id: "e1", type: "count", categoryKey: "cellphone", durationSeconds: null }),
      makeEvent({ id: "e2", type: "count", categoryKey: "cellphone", durationSeconds: null }),
    ];
    const totals = computeCategoryTotalsInRange(events, "s1", january);
    expect(totals.cellphone).toBe(2);
  });

  it("counts elapsed-so-far for a still-open timed event", () => {
    const started = new Date(Date.now() - 42_000).toISOString();
    const events = [makeEvent({ open: true, startedAt: started, durationSeconds: null, endedAt: null })];
    const openEndedRange: DateRange = { start: new Date(0), end: new Date(Date.now() + 60_000), label: "now" };
    const totals = computeCategoryTotalsInRange(events, "s1", openEndedRange);
    expect(totals.bathroom).toBeGreaterThanOrEqual(41);
    expect(totals.bathroom).toBeLessThanOrEqual(44);
  });
});
