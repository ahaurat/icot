import type { AppEvent, CategoryKey, ClassRoom, Student } from "../types";
import { computeCategoryTotalsInRange } from "./categoryTotals";
import { sortByPeriod } from "./classSort";
import { describeEventDuration, isInRange } from "./time";
import type { DateRange } from "./time";

export interface PrintEventRow {
  categoryKey: CategoryKey;
  startedAt: string;
  text: string;
}

export interface PrintStudentReport {
  student: Student;
  classRoom: ClassRoom;
  totals: Record<CategoryKey, number>;
  events: PrintEventRow[];
}

export interface PrintRequest {
  scope: "class" | "all";
  /** Required when scope === "class"; ignored for "all". */
  classId: string | null;
  range: DateRange;
}

/** Active students in a class, seated first (by seat index), then unseated, alphabetically. */
function orderedActiveStudents(students: Student[], classId: string): Student[] {
  return students
    .filter((s) => s.classId === classId && s.active)
    .sort((a, b) => {
      if (a.seatIndex == null && b.seatIndex == null) return a.name.localeCompare(b.name);
      if (a.seatIndex == null) return 1;
      if (b.seatIndex == null) return -1;
      return a.seatIndex - b.seatIndex;
    });
}

/**
 * A document title for the print job, so a browser's "Save as PDF" dialog
 * suggests something useful instead of the app's static page title.
 */
export function buildPrintDocumentTitle(request: PrintRequest, scopedClasses: ClassRoom[]): string {
  const scopeLabel = request.scope === "all" ? "All classes" : scopedClasses[0]?.name ?? "Class";
  return `ICOT Report · ${scopeLabel} · ${request.range.label}`;
}

/**
 * Builds one printable report per active student across the given classes,
 * for the given range. Archived classes are always excluded; classes are
 * ordered by period, students within a class by seat order.
 */
export function buildPrintReports(
  classes: ClassRoom[],
  students: Student[],
  events: AppEvent[],
  range: DateRange
): PrintStudentReport[] {
  const orderedClasses = sortByPeriod(classes.filter((c) => !c.archivedAt));
  const reports: PrintStudentReport[] = [];

  for (const classRoom of orderedClasses) {
    for (const student of orderedActiveStudents(students, classRoom.id)) {
      const totals = computeCategoryTotalsInRange(events, student.id, range);
      const studentEvents = events
        .filter((e) => e.studentId === student.id && isInRange(e.startedAt, range))
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        .map((e) => ({
          categoryKey: e.categoryKey,
          startedAt: e.startedAt,
          text: describeEventDuration(e),
        }));

      reports.push({ student, classRoom, totals, events: studentEvents });
    }
  }

  return reports;
}
