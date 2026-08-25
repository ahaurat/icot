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
    <div className="mb-4 flex flex-wrap items-center gap-3 max-[800px]:gap-2">
      <h1 className="text-3xl font-bold max-[800px]:text-xl">ICOT</h1>

      <select
        className="rounded border p-2 max-[800px]:p-1 max-[800px]:text-sm"
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
        className="rounded bg-purple-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 max-[800px]:px-2 max-[800px]:py-1 max-[800px]:text-sm"
      >
        <span className="max-[800px]:hidden">Choose random student</span>
        <span className="hidden max-[800px]:inline">Pick student</span>
      </button>

      <div className="ml-auto flex items-center gap-2 max-[800px]:gap-1">
        <button
          type="button"
          onClick={onOpenSummary}
          className="rounded bg-indigo-500 px-4 py-2 text-white max-[800px]:px-2 max-[800px]:py-1 max-[800px]:text-sm"
        >
          Summary
        </button>
        <button
          type="button"
          onClick={onToggleEditSeating}
          className={`rounded px-4 py-2 text-white max-[800px]:px-2 max-[800px]:py-1 max-[800px]:text-sm ${
            editSeating ? "bg-green-600" : "bg-gray-600"
          }`}
        >
          <span className="max-[800px]:hidden">
            {editSeating ? "Done moving seats" : "Edit seating"}
          </span>
          <span className="hidden max-[800px]:inline">
            {editSeating ? "Done" : "Edit seats"}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="rounded bg-blue-500 p-2 text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
