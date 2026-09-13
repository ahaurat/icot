import { useState } from "react";
import Modal from "./Modal";

const PRESET_MINUTES = [1, 2, 3, 5, 10];

export default function LogMinutesDialog({
  title,
  onLog,
  onClose,
}: {
  title: string;
  onLog: (minutes: number) => void;
  onClose: () => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("1");

  function logAndClose(minutes: number) {
    if (Number.isFinite(minutes) && minutes > 0) onLog(minutes);
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">How many minutes?</p>

        {customMode ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              autoFocus
              className="w-20 rounded border p-2"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <span className="text-sm text-gray-600">min</span>
            <button
              type="button"
              onClick={() => logAndClose(Math.floor(Number(customValue)))}
              className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
            >
              Log
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PRESET_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => logAndClose(m)}
                className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Other…
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
