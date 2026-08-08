import { useMemo } from "react";
import type { AppEvent, CategoryKey } from "../types";
import { CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { elapsedSeconds, isInSchoolYear, isToday } from "../utils/time";

/** For timed categories these are seconds; for count categories, instance counts. */
export interface CategoryTotal {
  today: number;
  year: number;
}

export type StudentTotals = Record<CategoryKey, CategoryTotal>;

function emptyTotals(): StudentTotals {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c.key, { today: 0, year: 0 }])
  ) as StudentTotals;
}

/** Value a single event contributes: elapsed seconds (timed) or 1 (count). */
function eventValue(e: AppEvent): number {
  if (e.type === "count") return 1;
  if (e.durationSeconds != null) return e.durationSeconds;
  return e.open ? elapsedSeconds(e.startedAt) : 0;
}

/**
 * Per-category Today and Year totals for one student. Year is bounded by the
 * configured school-year start; running timers contribute their elapsed-so-far.
 */
export function useStudentTotals(studentId: string | null): StudentTotals {
  const events = useAppStore((s) => s.events);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);

  return useMemo(() => {
    const totals = emptyTotals();
    if (!studentId) return totals;

    for (const e of events) {
      if (e.studentId !== studentId) continue;
      const value = eventValue(e);
      if (isInSchoolYear(e.startedAt, schoolYearStart)) totals[e.categoryKey].year += value;
      if (isToday(e.startedAt)) totals[e.categoryKey].today += value;
    }
    return totals;
  }, [events, schoolYearStart, studentId]);
}
