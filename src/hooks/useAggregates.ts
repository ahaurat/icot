import { useMemo } from "react";
import type { AppEvent, CategoryKey } from "../types";
import { CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import type { DateRange } from "../utils/time";
import { elapsedSeconds, isInRange, presetRange, resolveViewPeriodRange } from "../utils/time";

/** For timed categories these are seconds; for count categories, instance counts. */
export interface CategoryTotal {
  today: number;
  period: number;
}

export type StudentTotals = Record<CategoryKey, CategoryTotal>;

function emptyTotals(): StudentTotals {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c.key, { today: 0, period: 0 }])
  ) as StudentTotals;
}

/** Value a single event contributes: elapsed seconds (timed) or 1 (count). */
function eventValue(e: AppEvent): number {
  if (e.type === "count") return 1;
  if (e.durationSeconds != null) return e.durationSeconds;
  return e.open ? elapsedSeconds(e.startedAt) : 0;
}

/**
 * Per-category totals for one student within an arbitrary date range. Shared
 * by the standing "period" column (`useStudentTotals` below) and printed
 * reports (`src/utils/printReport.ts`), which total over a teacher-chosen
 * range instead.
 */
export function computeCategoryTotalsInRange(
  events: AppEvent[],
  studentId: string,
  range: DateRange
): Record<CategoryKey, number> {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<CategoryKey, number>;
  for (const e of events) {
    if (e.studentId !== studentId) continue;
    if (!isInRange(e.startedAt, range)) continue;
    totals[e.categoryKey] += eventValue(e);
  }
  return totals;
}

/**
 * Per-category Today and Period totals for one student. Period is either the
 * whole school year or a teacher-configured custom range
 * (`settings.viewPeriod`); running timers contribute their elapsed-so-far.
 */
export function useStudentTotals(studentId: string | null): StudentTotals {
  const events = useAppStore((s) => s.events);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);

  return useMemo(() => {
    const totals = emptyTotals();
    if (!studentId) return totals;

    const todayRange = presetRange("today", schoolYearStart);
    const periodRange = resolveViewPeriodRange(viewPeriod, schoolYearStart);
    const today = computeCategoryTotalsInRange(events, studentId, todayRange);
    const period = computeCategoryTotalsInRange(events, studentId, periodRange);

    for (const c of CATEGORIES) {
      totals[c.key] = { today: today[c.key], period: period[c.key] };
    }
    return totals;
  }, [events, schoolYearStart, viewPeriod, studentId]);
}

/** Display label for the active period range (e.g. "This school year", or a custom range's label). */
export function usePeriodRangeLabel(): string {
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);
  return useMemo(
    () => resolveViewPeriodRange(viewPeriod, schoolYearStart).label,
    [viewPeriod, schoolYearStart]
  );
}
