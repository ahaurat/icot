import { useState } from "react";
import type { CategoryConfig } from "../constants/categories";
import { CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { usePeriodRangeLabel, useStudentTotals } from "../hooks/useAggregates";
import { formatDuration } from "../utils/time";
import { studentFullName } from "../utils/studentName";
import EventHistory from "./EventHistory";
import LogMinutesDialog from "./LogMinutesDialog";
import Modal from "./Modal";
import TotalsTable from "./TotalsTable";

export default function StudentModal({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const student = useAppStore((s) => s.students.find((x) => x.id === studentId));
  const startTimer = useAppStore((s) => s.startTimer);
  const logCount = useAppStore((s) => s.logCount);
  const logDuration = useAppStore((s) => s.logDuration);
  const totals = useStudentTotals(studentId);
  const periodLabel = usePeriodRangeLabel();
  const timedPeriod = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].period, 0);
  const [loggingMinutesFor, setLoggingMinutesFor] = useState<CategoryConfig | null>(null);

  if (!student) {
    onClose();
    return null;
  }

  function handleCategory(cat: CategoryConfig) {
    if (cat.manualDuration) {
      setLoggingMinutesFor(cat);
    } else if (cat.type === "timed") {
      startTimer(student!.id, cat.key);
      onClose(); // timer now ticks on the seat
    } else {
      logCount(student!.id, cat.key); // tally; keep modal open to tap again
    }
  }

  return (
    <Modal title={studentFullName(student)} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Log an event</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategory(cat)}
                className="rounded px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: cat.color }}
                title={
                  cat.manualDuration
                    ? "Log minutes"
                    : cat.type === "timed"
                    ? "Starts a timer"
                    : "Adds one instance"
                }
              >
                {cat.label}
                {cat.type === "count" ? " +1" : ""}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Bathroom/Nurse/Office/Sleeping/Other start a timer · Tardy logs minutes late · Cell
            Phone/Headphones add a tally
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Totals</p>
          <TotalsTable studentId={student.id} />
          {timedPeriod > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {student.firstName} has been off-task for a total of{" "}
              <strong>{formatDuration(timedPeriod)}</strong> during{" "}
              {periodLabel.charAt(0).toLowerCase() + periodLabel.slice(1)}.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">History</p>
          <EventHistory studentId={student.id} />
        </div>
      </div>

      {loggingMinutesFor && (
        <LogMinutesDialog
          title={loggingMinutesFor.label}
          onLog={(minutes) => logDuration(student!.id, loggingMinutesFor.key, minutes)}
          onClose={() => setLoggingMinutesFor(null)}
        />
      )}
    </Modal>
  );
}
