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
  const createGroups = useAppStore((s) => s.createGroups);
  const [groupSize, setGroupSize] = useState(4);

  function handleCreate() {
    createGroups(classId, groupSize);
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
