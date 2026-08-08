import { useAppStore } from "../state/useAppStore";
import { storageMode } from "../data/store";

interface HeaderProps {
  editSeating: boolean;
  onToggleEditSeating: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  editSeating,
  onToggleEditSeating,
  onOpenSummary,
  onOpenSettings,
}: HeaderProps) {
  const allClasses = useAppStore((s) => s.classes);
  const classes = allClasses.filter((c) => !c.archivedAt);
  const currentClassId = useAppStore((s) => s.currentClassId);
  const setCurrentClass = useAppStore((s) => s.setCurrentClass);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-bold">ICOT</h1>
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: storageMode === "supabase" ? "#dcfce7" : "#e5e7eb",
          color: storageMode === "supabase" ? "#166534" : "#374151",
        }}
        title={
          storageMode === "supabase"
            ? "Syncing to Supabase"
            : "Saving locally in this browser"
        }
      >
        {storageMode === "supabase" ? "☁ Cloud" : "💾 Local"}
      </span>

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
