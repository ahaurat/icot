import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_BY_KEY } from "../constants/categories";
import type { CategoryKey } from "../types";
import { useAppStore, useCurrentClass } from "../state/useAppStore";
import { elapsedSeconds, formatDurationCompact, isInRange, presetRange } from "../utils/time";
import type { DateRange } from "../utils/time";
import DateRangePicker from "./DateRangePicker";
import Modal from "./Modal";
import type { PrintRequest } from "../utils/printReport";
import { studentFullName } from "../utils/studentName";

interface SummaryLine {
  studentName: string;
  categoryKey: CategoryKey;
  text: string;
}

export default function SummaryModal({
  onClose,
  onPrint,
}: {
  onClose: () => void;
  onPrint: (request: PrintRequest) => void;
}) {
  const currentClass = useCurrentClass();
  const currentClassId = useAppStore((s) => s.currentClassId);
  const students = useAppStore((s) => s.students);
  const events = useAppStore((s) => s.events);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);

  const [range, setRange] = useState<DateRange>(() => presetRange("today", schoolYearStart));
  const [printScope, setPrintScope] = useState<"class" | "all">("class");

  const lines = useMemo<SummaryLine[]>(() => {
    const nameById = new Map(students.map((s) => [s.id, studentFullName(s)]));
    const catOrder = new Map(CATEGORIES.map((c, i) => [c.key, i]));

    // Aggregate per student × category within the range.
    const groups = new Map<string, { seconds: number; occurrences: number }>();
    for (const e of events) {
      if (e.classId !== currentClassId) continue;
      if (!isInRange(e.startedAt, range)) continue;
      const key = `${e.studentId}|${e.categoryKey}`;
      const g = groups.get(key) ?? { seconds: 0, occurrences: 0 };
      g.occurrences += 1;
      if (e.type === "timed") {
        g.seconds += e.durationSeconds ?? (e.open ? elapsedSeconds(e.startedAt) : 0);
      }
      groups.set(key, g);
    }

    const result: SummaryLine[] = [];
    for (const [key, g] of groups) {
      const [studentId, categoryKey] = key.split("|") as [string, CategoryKey];
      const cat = CATEGORY_BY_KEY[categoryKey];
      const name = nameById.get(studentId) ?? "Unknown student";
      let text = `${name} ${cat.summaryVerb}`;
      if (cat.type === "timed") {
        text += ` for ${formatDurationCompact(g.seconds)}`;
        if (g.occurrences > 1) text += ` (${g.occurrences} trips)`;
      } else if (g.occurrences > 1) {
        text += ` (${g.occurrences}×)`;
      }
      text += ".";
      result.push({ studentName: name, categoryKey, text });
    }

    return result.sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) ||
        (catOrder.get(a.categoryKey)! - catOrder.get(b.categoryKey)!)
    );
  }, [events, students, currentClassId, range]);

  function handlePrint() {
    onPrint({ scope: printScope, classId: currentClassId, range });
    onClose();
  }

  return (
    <Modal
      title={`Summary — ${currentClass?.name ?? ""}`}
      onClose={onClose}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        <DateRangePicker value={range} onChange={setRange} />

        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>Print:</span>
          <select
            className="rounded border p-1"
            value={printScope}
            onChange={(e) => setPrintScope(e.target.value as "class" | "all")}
          >
            <option value="class">This class</option>
            <option value="all">All classes</option>
          </select>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printScope === "class" && !currentClassId}
            className="rounded bg-gray-700 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print…
          </button>
        </div>

        <p className="text-xs text-gray-500">
          {range.label} · {lines.length} {lines.length === 1 ? "activity" : "activities"}
        </p>

        {lines.length === 0 ? (
          <p className="text-sm text-gray-500">No activity recorded for this period.</p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span aria-hidden className="mt-0.5">
                  {CATEGORY_BY_KEY[line.categoryKey].emoji}
                </span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
