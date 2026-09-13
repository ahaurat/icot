import type { AppEvent, CategoryKey } from "../types";
import { CATEGORIES } from "../constants/categories";
import { elapsedSeconds, isInRange } from "./time";
import type { DateRange } from "./time";

/** Value a single event contributes: elapsed seconds (timed) or 1 (count). */
function eventValue(e: AppEvent): number {
  if (e.type === "count") return 1;
  if (e.durationSeconds != null) return e.durationSeconds;
  return e.open ? elapsedSeconds(e.startedAt) : 0;
}

/**
 * Per-category totals for one student within an arbitrary date range. Shared
 * by the standing "period" column (src/hooks/useAggregates.ts) and printed
 * reports (src/utils/printReport.ts).
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
