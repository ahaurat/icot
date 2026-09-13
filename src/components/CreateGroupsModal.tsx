import { useState } from "react";
import { useAppStore } from "../state/useAppStore";
import Modal from "./Modal";

export default function CreateGroupsModal({
  classId,
  onClose,
}: {
  classId: string;
  onClose: () => void;
}) {
  const students = useAppStore((s) => s.students);
  const createGroups = useAppStore((s) => s.createGroups);
  const clearGroups = useAppStore((s) => s.clearGroups);
  const [groupSize, setGroupSize] = useState(4);

  const hasGroups = students.some((s) => s.classId === classId && s.groupColor);

  function handleCreate() {
    createGroups(classId, groupSize);
    onClose();
  }

  function handleClear() {
    clearGroups(classId);
    onClose();
  }

  return (
    <Modal title="Create groups" onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          Students per group
          <input
            type="number"
            min={2}
            value={groupSize}
            onChange={(e) => setGroupSize(Math.max(2, Number(e.target.value) || 2))}
            className="w-16 rounded border p-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          {hasGroups && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded border px-3 py-2 text-sm"
            >
              Clear groups
            </button>
          )}
          <button
            type="button"
            onClick={handleCreate}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
