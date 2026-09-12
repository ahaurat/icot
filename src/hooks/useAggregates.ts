import { useMemo } from "react";
import type { CategoryKey } from "../types";
import { CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { formatCompactDate, presetRange, resolveViewPeriodRange } from "../utils/time";
import { computeCategoryTotalsInRange } from "../utils/categoryTotals";

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

/** Compact header label for the period column (e.g. "Year" or "1/20 – 6/5"), distinct from usePeriodRangeLabel's full prose form. */
export function usePeriodColumnLabel(): string {
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);
  return useMemo(() => {
    if (viewPeriod.mode === "custom" && viewPeriod.customStart && viewPeriod.customEnd) {
      const range = resolveViewPeriodRange(viewPeriod, schoolYearStart);
      return `${formatCompactDate(range.start)} – ${formatCompactDate(range.end)}`;
    }
    return "Year";
  }, [viewPeriod, schoolYearStart]);
}
