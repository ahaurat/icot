import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Student } from "../types";
import { CATEGORIES, CATEGORY_BY_KEY } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { useNowTick } from "../state/useTimers";
import { useStudentTotals } from "../hooks/useAggregates";
import { elapsedSeconds, formatDuration, formatMinutesShort } from "../utils/time";

interface SeatProps {
  index: number;
  student: Student | undefined;
  editMode: boolean;
  onOpen: (studentId: string) => void;
  highlighted: boolean;
}

export default function Seat({ index, student, editMode, onOpen, highlighted }: SeatProps) {
  // Each desk position is a drop target while editing the seating chart.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `seat-${index}`,
    disabled: !editMode,
  });

  return (
    <div
      ref={setDropRef}
      className={`relative h-20 rounded border text-center text-sm transition-colors ${
        student ? "bg-gray-300" : "bg-gray-100 border-dashed"
      } ${isOver ? "ring-2 ring-blue-500" : ""} ${
        highlighted ? "ring-4 ring-yellow-400" : ""
      }`}
    >
      {student ? (
        <SeatContent student={student} editMode={editMode} onOpen={onOpen} />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-gray-400">
          {editMode ? "drop here" : ""}
        </div>
      )}
    </div>
  );
}

function SeatContent({
  student,
  editMode,
  onOpen,
}: {
  student: Student;
  editMode: boolean;
  onOpen: (studentId: string) => void;
}) {
  const openEvent = useAppStore((s) =>
    s.events.find((e) => e.studentId === student.id && e.open)
  );
  const stopTimer = useAppStore((s) => s.stopTimer);
  const totals = useStudentTotals(student.id);
  useNowTick(Boolean(openEvent));

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: student.id,
    disabled: !editMode,
  });

  if (editMode) {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }}
        {...listeners}
        {...attributes}
        className="flex h-full cursor-grab items-center justify-center px-1 font-medium active:cursor-grabbing"
      >
        {student.name}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(student.id)}
      className="flex h-full w-full cursor-pointer flex-col items-center justify-center px-1"
    >
      <span className="font-medium leading-tight">{student.name}</span>

      {openEvent ? (
        <span className="mt-1 flex flex-col items-center gap-1">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: CATEGORY_BY_KEY[openEvent.categoryKey].color }}
          >
            {CATEGORY_BY_KEY[openEvent.categoryKey].emoji}{" "}
            {formatDuration(elapsedSeconds(openEvent.startedAt))}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              stopTimer(openEvent.id);
            }}
            className="rounded bg-red-500 px-2 py-0.5 text-xs text-white"
          >
            Stop
          </span>
        </span>
      ) : (
        <SeatBadges totals={totals} />
      )}
    </button>
  );
}

/** Today's activity badges: minutes for timed categories, counts for count ones. */
function SeatBadges({ totals }: { totals: ReturnType<typeof useStudentTotals> }) {
  const active = CATEGORIES.filter((c) => totals[c.key].today > 0);
  if (active.length === 0) return null;

  return (
    <span className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-1">
      {active.map((cat) => {
        const today = totals[cat.key].today;
        const text = cat.type === "timed" ? formatMinutesShort(today) : `${today}`;
        return (
          <span
            key={cat.key}
            className="rounded px-1 text-xs font-semibold text-white"
            style={{ backgroundColor: cat.color }}
            title={`${cat.label} today: ${
              cat.type === "timed" ? formatDuration(today) : `${today}×`
            }`}
          >
            {cat.emoji} {text}
          </span>
        );
      })}
    </span>
  );
}
