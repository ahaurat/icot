import { useAppStore } from "../state/useAppStore";
import { isPickableStudent } from "../utils/randomPicker";
import { sortByPeriod } from "../utils/classSort";

interface HeaderProps {
  editSeating: boolean;
  onToggleEditSeating: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onPickedStudent: (studentId: string) => void;
}

export default function Header({
  editSeating,
  onToggleEditSeating,
  onOpenSummary,
  onOpenSettings,
  onPickedStudent,
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
        className="rounded border p-2"
        value={currentClassId ?? ""}
        onChange={(e) => setCurrentClass(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handlePick}
        disabled={!hasActiveStudents}
        className="rounded bg-purple-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Choose random student
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSummary}
          className="rounded bg-indigo-500 px-4 py-2 text-white"
        >
          Summary
        </button>
        <button
          type="button"
          onClick={onToggleEditSeating}
          className={`rounded px-4 py-2 text-white ${
            editSeating ? "bg-green-600" : "bg-gray-600"
          }`}
        >
          {editSeating ? "Done moving seats" : "Edit seating"}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded bg-blue-500 px-4 py-2 text-white"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
