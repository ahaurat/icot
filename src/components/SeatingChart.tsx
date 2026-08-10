import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useAppStore, useCurrentClass } from "../state/useAppStore";
import { isAisleCell } from "../utils/seatLayout";
import Seat from "./Seat";

interface SeatingChartProps {
  editMode: boolean;
  onOpenStudent: (studentId: string) => void;
}

export default function SeatingChart({ editMode, onOpenStudent }: SeatingChartProps) {
  const currentClass = useCurrentClass();
  const currentClassId = useAppStore((s) => s.currentClassId);
  const students = useAppStore((s) => s.students);
  const moveStudent = useAppStore((s) => s.moveStudent);
  const seatLayout = useAppStore((s) => s.settings.seatLayout);

  // Require a small drag distance so clicks aren't swallowed as drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!currentClass) return null;

  const seatCount = currentClass.seatRows * currentClass.seatCols;
  const activeInClass = students.filter((s) => s.classId === currentClassId && s.active);
  const studentBySeat = new Map<number, (typeof activeInClass)[number]>();
  for (const s of activeInClass) {
    if (s.seatIndex != null) studentBySeat.set(s.seatIndex, s);
  }

  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id;
    if (typeof overId !== "string" || !overId.startsWith("seat-")) return;
    const seatIndex = Number(overId.slice("seat-".length));
    moveStudent(String(e.active.id), seatIndex);
  }

  const grid = (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${currentClass.seatCols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: seatCount }, (_, i) => {
        const student = studentBySeat.get(i);
        // An empty non-desk cell is a visible aisle/gap and not a drop target.
        if (!student && isAisleCell(seatLayout, i)) {
          return <div key={i} aria-hidden className="h-20" />;
        }
        return (
          <Seat
            key={i}
            index={i}
            student={student}
            editMode={editMode}
            onOpen={onOpenStudent}
          />
        );
      })}
    </div>
  );

  if (!editMode) return grid;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}
