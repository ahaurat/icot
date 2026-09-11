import { describe, expect, it } from "vitest";
import { buildPrintReports } from "./printReport";
import type { AppEvent, ClassRoom, Student } from "../types";
import type { DateRange } from "./time";

const range: DateRange = {
  start: new Date("2026-01-01T00:00:00"),
  end: new Date("2026-01-31T23:59:59"),
  label: "January",
};

const classA: ClassRoom = { id: "c1", name: "Period 1", seatRows: 6, seatCols: 6, archivedAt: null };
const archivedClass: ClassRoom = {
  id: "c2",
  name: "Period 2",
  seatRows: 6,
  seatCols: 6,
  archivedAt: "2025-06-01T00:00:00.000Z",
};

const alice: Student = { id: "s1", classId: "c1", name: "Alice", seatIndex: 1, active: true };
const bob: Student = { id: "s2", classId: "c1", name: "Bob", seatIndex: 0, active: true };
const inactive: Student = { id: "s3", classId: "c1", name: "Zoe", seatIndex: 2, active: false };

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: patch.id ?? "e1",
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

describe("buildPrintReports", () => {
  it("includes only active students, ordered by seat index", () => {
    const reports = buildPrintReports([classA], [alice, bob, inactive], [], range);
    expect(reports.map((r) => r.student.id)).toEqual(["s2", "s1"]);
  });

  it("gives a student with no events in range a zeroed report", () => {
    const [report] = buildPrintReports([classA], [alice], [], range);
    expect(report.totals.bathroom).toBe(0);
    expect(report.events).toEqual([]);
  });

  it("includes only events within range, sorted chronologically", () => {
    const events = [
      makeEvent({ id: "e2", startedAt: "2026-01-20T00:00:00.000Z" }),
      makeEvent({ id: "e1", startedAt: "2026-01-05T00:00:00.000Z" }),
      makeEvent({ id: "e3", startedAt: "2025-12-01T00:00:00.000Z" }), // outside range
    ];
    const [report] = buildPrintReports([classA], [alice], events, range);
    expect(report.events.map((e) => e.startedAt)).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-20T00:00:00.000Z",
    ]);
    expect(report.totals.bathroom).toBe(600);
  });

  it("excludes archived classes and orders active classes by period", () => {
    const period3: ClassRoom = { id: "c3", name: "Period 3", seatRows: 6, seatCols: 6, archivedAt: null };
    const carl: Student = { id: "s4", classId: "c3", name: "Carl", seatIndex: 0, active: true };
    const reports = buildPrintReports([period3, classA, archivedClass], [alice, bob, carl], [], range);
    expect(reports.map((r) => r.classRoom.id)).toEqual(["c1", "c1", "c3"]);
  });
});
