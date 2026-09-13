import { useAppStore } from "../state/useAppStore";
import { isPickableStudent } from "../utils/randomPicker";
import { sortByPeriod } from "../utils/classSort";

interface HeaderProps {
  editSeating: boolean;
  onToggleEditSeating: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onPickedStudent: (studentId: string) => void;
  hasPickedStudent: boolean;
  onClearPickedStudent: () => void;
  onOpenRandomizeSeats: () => void;
  onOpenCreateGroups: () => void;
}

// Every select/button in this row shares a fixed height so a browser's native
// <select> chrome (which can render taller than a same-padding <button>)
// doesn't throw off vertical alignment.
const controlClass = "flex h-9 items-center justify-center rounded px-4 text-sm font-medium";

export default function Header({
  editSeating,
  onToggleEditSeating,
  onOpenSummary,
  onOpenSettings,
  onPickedStudent,
  hasPickedStudent,
  onClearPickedStudent,
  onOpenRandomizeSeats,
  onOpenCreateGroups,
}: HeaderProps) {
  const allClasses = useAppStore((s) => s.classes);
  const classes = sortByPeriod(allClasses.filter((c) => !c.archivedAt));
  const currentClassId = useAppStore((s) => s.currentClassId);
  const setCurrentClass = useAppStore((s) => s.setCurrentClass);
  const students = useAppStore((s) => s.students);
  const pickRandomStudent = useAppStore((s) => s.pickRandomStudent);

  const hasActiveStudents = students.some(
    (s) => s.classId === currentClassId && isPickableStudent(s)
  );

  function handlePick() {
    if (!currentClassId) return;
    const studentId = pickRandomStudent(currentClassId);
    if (studentId) onPickedStudent(studentId);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-bold">ICOT</h1>

      <select
        className="flex h-9 items-center rounded border px-2 text-sm"
        value={currentClassId ?? ""}
        onChange={(e) => setCurrentClass(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {editSeating ? (
        <>
          <button
            type="button"
            onClick={onOpenRandomizeSeats}
            className={`${controlClass} bg-purple-600 text-white`}
          >
            Randomize seats…
          </button>
          <button
            type="button"
            onClick={onOpenCreateGroups}
            className={`${controlClass} bg-purple-600 text-white`}
          >
            Create groups…
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handlePick}
            disabled={!hasActiveStudents}
            className={`${controlClass} bg-purple-600 text-white disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Choose random student
          </button>
          {hasPickedStudent && (
            <button
              type="button"
              onClick={onClearPickedStudent}
              className="flex h-9 items-center text-sm text-gray-500 underline hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!editSeating && (
          <button
            type="button"
            onClick={onOpenSummary}
            className={`${controlClass} bg-indigo-500 text-white`}
          >
            Summary
          </button>
        )}
        <button
          type="button"
          onClick={onToggleEditSeating}
          className={`${controlClass} text-white ${editSeating ? "bg-green-600" : "bg-gray-600"}`}
        >
          {editSeating ? "Done moving seats" : "Edit seating"}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`${controlClass} bg-blue-500 text-white`}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
