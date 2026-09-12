import { useEffect } from "react";
import { CATEGORY_BY_KEY, COUNT_CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { formatDuration } from "../utils/time";
import { buildPrintDocumentTitle, buildPrintReports, formatPrintRangeLabel } from "../utils/printReport";
import type { PrintRequest } from "../utils/printReport";

function formatCategoryTotal(value: number, type: "timed" | "count"): string {
  if (type === "count") return value === 0 ? "—" : `${value}×`;
  return value === 0 ? "—" : formatDuration(value);
}

export default function PrintReport({
  request,
  onDone,
}: {
  request: PrintRequest;
  onDone: () => void;
}) {
  const classes = useAppStore((s) => s.classes);
  const students = useAppStore((s) => s.students);
  const events = useAppStore((s) => s.events);

  const scopedClasses =
    request.scope === "all" ? classes : classes.filter((c) => c.id === request.classId);
  const reports = buildPrintReports(scopedClasses, students, events, request.range);
  const rangeLabel = formatPrintRangeLabel(request.range);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = buildPrintDocumentTitle(request, scopedClasses);
    window.addEventListener("afterprint", onDone);
    window.print();
    return () => {
      window.removeEventListener("afterprint", onDone);
      document.title = originalTitle;
    };
  }, [onDone, request]);

  return (
    <div className="hidden print:block">
      {reports.map((r, i) => {
        const timedTotal = TIMED_CATEGORIES.reduce((sum, c) => sum + r.totals[c.key], 0);
        return (
          <section key={r.student.id} className={`p-6 ${i > 0 ? "break-before-page" : ""}`}>
            <h1 className="text-xl font-bold">{r.student.name}</h1>
            <p className="mb-4 text-sm text-gray-600">
              {r.classRoom.name} · {rangeLabel}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-2 py-1 font-semibold">Category</th>
                  <th className="px-2 py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {TIMED_CATEGORIES.map((cat) => (
                  <tr key={cat.key} className="border-t">
                    <td className="px-2 py-1">{cat.label}</td>
                    <td className="px-2 py-1 text-right">
                      {formatCategoryTotal(r.totals[cat.key], cat.type)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="px-2 py-1">Total off-task</td>
                  <td className="px-2 py-1 text-right">
                    {timedTotal === 0 ? "—" : formatDuration(timedTotal)}
                  </td>
                </tr>
                {COUNT_CATEGORIES.map((cat) => (
                  <tr key={cat.key} className="border-t">
                    <td className="px-2 py-1">{cat.label}</td>
                    <td className="px-2 py-1 text-right">
                      {formatCategoryTotal(r.totals[cat.key], cat.type)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="mb-1 mt-4 text-sm font-semibold">Activity log</h2>
            {r.events.length === 0 ? (
              <p className="text-sm text-gray-500">No activity recorded for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {r.events.map((e, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">{CATEGORY_BY_KEY[e.categoryKey].label}</td>
                      <td className="px-2 py-1">{e.text}</td>
                      <td className="px-2 py-1 text-right text-xs text-gray-500">
                        {new Date(e.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
