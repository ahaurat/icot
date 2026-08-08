import { useState } from "react";
import type { AppEvent, CategoryKey } from "../types";
import { COUNT_CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "../utils/time";
import Modal from "./Modal";

export default function EditEventDialog({
  event,
  onClose,
}: {
  event: AppEvent;
  onClose: () => void;
}) {
  const updateEvent = useAppStore((s) => s.updateEvent);
  const deleteEvent = useAppStore((s) => s.deleteEvent);

  const isTimed = event.type === "timed";
  const options = isTimed ? TIMED_CATEGORIES : COUNT_CATEGORIES;

  const [categoryKey, setCategoryKey] = useState<CategoryKey>(event.categoryKey);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const initialSecs = event.durationSeconds ?? 0;
  const [minutes, setMinutes] = useState(Math.floor(initialSecs / 60));
  const [seconds, setSeconds] = useState(initialSecs % 60);

  function save() {
    const startIso = fromDatetimeLocalValue(startedAt);
    if (isTimed) {
      const duration = Math.max(0, minutes * 60 + seconds);
      updateEvent(event.id, {
        categoryKey,
        startedAt: startIso,
        durationSeconds: duration,
        endedAt: new Date(new Date(startIso).getTime() + duration * 1000).toISOString(),
        open: false,
      });
    } else {
      updateEvent(event.id, { categoryKey, startedAt: startIso });
    }
    onClose();
  }

  function remove() {
    if (confirm("Delete this entry? This cannot be undone.")) {
      deleteEvent(event.id);
      onClose();
    }
  }

  return (
    <Modal title="Edit entry" onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Category</span>
          <select
            className="mt-1 w-full rounded border p-2"
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value as CategoryKey)}
          >
            {options.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            {isTimed ? "Start time" : "Time"}
          </span>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border p-2"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </label>

        {isTimed && (
          <div>
            <span className="text-sm font-medium text-gray-700">Duration</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                className="w-20 rounded border p-2"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))}
              />
              <span className="text-sm text-gray-600">min</span>
              <input
                type="number"
                min={0}
                max={59}
                className="w-20 rounded border p-2"
                value={seconds}
                onChange={(e) =>
                  setSeconds(Math.min(59, Math.max(0, Number(e.target.value))))
                }
              />
              <span className="text-sm text-gray-600">sec</span>
            </div>
            {event.open && (
              <p className="mt-1 text-xs text-amber-600">
                This timer is still running; saving will stop it at the duration above.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={remove}
            className="rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
