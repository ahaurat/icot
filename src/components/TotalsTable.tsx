import { COUNT_CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import type { CategoryConfig } from "../constants/categories";
import { usePeriodRangeLabel, useStudentTotals } from "../hooks/useAggregates";
import { formatDuration } from "../utils/time";

/** Format a total: duration for timed categories, count for count categories. */
function formatTotal(value: number, type: "timed" | "count"): string {
  if (type === "count") return value === 0 ? "—" : `${value}×`;
  return value === 0 ? "—" : formatDuration(value);
}

export default function TotalsTable({ studentId }: { studentId: string }) {
  const totals = useStudentTotals(studentId);
  const periodLabel = usePeriodRangeLabel();

  const timedToday = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].today, 0);
  const timedPeriod = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].period, 0);

  const renderRow = (cat: CategoryConfig) => {
    const t = totals[cat.key];
    return (
      <tr key={cat.key} className="border-t">
        <td className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.label}
            {cat.type === "count" && <span className="text-xs text-gray-400">(count)</span>}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatTotal(t.today, cat.type)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatTotal(t.period, cat.type)}</td>
      </tr>
    );
  };

  return (
    <div className="overflow-hidden rounded border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 text-right font-semibold">Today</th>
            <th className="px-3 py-2 text-right font-semibold">{periodLabel}</th>
          </tr>
        </thead>
        <tbody>
          {TIMED_CATEGORIES.map(renderRow)}

          {/* Total off-task time = sum of the timed categories. */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td className="px-3 py-1.5">Total off-task</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {timedToday === 0 ? "—" : formatDuration(timedToday)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {timedPeriod === 0 ? "—" : formatDuration(timedPeriod)}
            </td>
          </tr>

          {COUNT_CATEGORIES.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}
