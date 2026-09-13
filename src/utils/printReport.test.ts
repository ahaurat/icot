import { describe, expect, it } from "vitest";
import { buildPrintDocumentTitle, buildPrintReports, formatPrintRangeLabel } from "./printReport";
import type { PrintRequest } from "./printReport";
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

const alice: Student = {
  id: "s1",
  classId: "c1",
  name: "Alice",
  seatIndex: 1,
  active: true,
  groupColor: null,
};
const bob: Student = {
  id: "s2",
  classId: "c1",
  name: "Bob",
  seatIndex: 0,
  active: true,
  groupColor: null,
};
const inactive: Student = {
  id: "s3",
  classId: "c1",
  name: "Zoe",
  seatIndex: 2,
  active: false,
  groupColor: null,
};
const charlie: Student = {
  id: "s4",
  classId: "c1",
  name: "Charlie",
  seatIndex: 5,
  active: true,
  groupColor: null,
};
const zach: Student = {
  id: "s5",
  classId: "c1",
  name: "Zach",
  seatIndex: null,
  active: true,
  groupColor: null,
};
const amy: Student = {
  id: "s6",
  classId: "c1",
  name: "Amy",
  seatIndex: null,
  active: true,
  groupColor: null,
};

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
    const carl: Student = {
      id: "s4",
      classId: "c3",
      name: "Carl",
      seatIndex: 0,
      active: true,
      groupColor: null,
    };
    const reports = buildPrintReports([period3, classA, archivedClass], [alice, bob, carl], [], range);
    expect(reports.map((r) => r.classRoom.id)).toEqual(["c1", "c1", "c3"]);
  });

  it("orders unseated students alphabetically, after seated students by seat index", () => {
    // Test branches: both unseated → alphabetical (Amy/Zach); mixed unseated → unseated last; both seated → by index
    const reports = buildPrintReports([classA], [charlie, zach, bob, amy], [], range);
    // Expected: bob (seat 0), charlie (seat 5), amy (unseated, alpha), zach (unseated, alpha)
    expect(reports.map((r) => r.student.name)).toEqual(["Bob", "Charlie", "Amy", "Zach"]);
  });
});

describe("buildPrintDocumentTitle", () => {
  it("names the class for a single-class scope", () => {
    const request: PrintRequest = { scope: "class", classId: "c1", range };
    expect(buildPrintDocumentTitle(request, [classA])).toBe("ICOT Report · Period 1 · January 2026");
  });

  it("says 'All classes' for the all-classes scope, regardless of which classes are passed", () => {
    const request: PrintRequest = { scope: "all", classId: null, range };
    expect(buildPrintDocumentTitle(request, [classA])).toBe("ICOT Report · All classes · January 2026");
  });

  it("falls back to a generic label if the scoped class list is empty", () => {
    const request: PrintRequest = { scope: "class", classId: "missing", range };
    expect(buildPrintDocumentTitle(request, [])).toBe("ICOT Report · Class · January 2026");
  });
});

describe("formatPrintRangeLabel", () => {
  it("formats a single-day range (e.g. Today/Yesterday) as one full date", () => {
    const today: DateRange = {
      start: new Date(2026, 8, 10, 0, 0, 0),
      end: new Date(2026, 8, 10, 23, 59, 59),
      label: "Today",
    };
    expect(formatPrintRangeLabel(today)).toBe("September 10, 2026");
  });

  it("formats a range confined to one calendar month (e.g. This month) as \"Month Year\"", () => {
    const thisMonthSoFar: DateRange = {
      start: new Date(2026, 8, 1, 0, 0, 0),
      end: new Date(2026, 8, 12, 23, 59, 59), // partway through the month
      label: "This month",
    };
    expect(formatPrintRangeLabel(thisMonthSoFar)).toBe("September 2026");
  });

  it("formats a full calendar month the same way as a partial one", () => {
    const wholeMonth: DateRange = {
      start: new Date(2026, 8, 1, 0, 0, 0),
      end: new Date(2026, 8, 30, 23, 59, 59),
      label: "September",
    };
    expect(formatPrintRangeLabel(wholeMonth)).toBe("September 2026");
  });

  it("formats a range spanning multiple months as a full date range", () => {
    const semester: DateRange = {
      start: new Date(2026, 7, 15, 0, 0, 0), // Aug 15 — not the 1st, so not month-collapsed
      end: new Date(2026, 8, 10, 0, 0, 0),
      label: "custom",
    };
    expect(formatPrintRangeLabel(semester)).toBe("August 15, 2026 – September 10, 2026");
  });

  it("formats a range that starts on the 1st but spans into a later month as a full date range", () => {
    const schoolYear: DateRange = {
      start: new Date(2026, 7, 1, 0, 0, 0), // Aug 1
      end: new Date(2026, 8, 12, 0, 0, 0), // Sep 12 — different month than start
      label: "This school year",
    };
    expect(formatPrintRangeLabel(schoolYear)).toBe("August 1, 2026 – September 12, 2026");
  });
});
