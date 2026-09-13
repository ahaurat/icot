import { useMemo, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { studentFullName } from "../utils/studentName";
import ConfirmDialog from "./ConfirmDialog";

export default function RosterManager({ classId }: { classId: string }) {
  const students = useAppStore((s) => s.students);
  const classes = useAppStore((s) => s.classes);
  const addStudent = useAppStore((s) => s.addStudent);
  const renameStudent = useAppStore((s) => s.renameStudent);
  const removeStudent = useAppStore((s) => s.removeStudent);
  const restoreStudent = useAppStore((s) => s.restoreStudent);
  const deleteStudentPermanently = useAppStore((s) => s.deleteStudentPermanently);

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newSeat, setNewSeat] = useState<string>("");
  const [pendingDeleteStudentId, setPendingDeleteStudentId] = useState<string | null>(null);

  const cls = classes.find((c) => c.id === classId);
  const seatCount = cls ? cls.seatRows * cls.seatCols : 36;

  const roster = students.filter((s) => s.classId === classId);
  const active = roster.filter((s) => s.active);
  const inactive = roster.filter((s) => !s.active);

  const openSeats = useMemo(() => {
    const taken = new Set(active.map((s) => s.seatIndex).filter((i) => i != null));
    return Array.from({ length: seatCount }, (_, i) => i).filter((i) => !taken.has(i));
  }, [active, seatCount]);

  function handleAdd() {
    const firstName = newFirstName.trim();
    const lastName = newLastName.trim();
    if (!firstName && !lastName) return;
    const seat = newSeat === "" ? null : Number(newSeat);
    addStudent(classId, firstName, lastName, seat);
    setNewFirstName("");
    setNewLastName("");
    setNewSeat("");
  }

  return (
    <div className="space-y-4">
      {/* Add student */}
      <div className="rounded border p-3">
        <p className="mb-2 text-sm font-medium text-gray-700">Add student</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="flex-1 rounded border p-2 text-sm"
            placeholder="First name"
            value={newFirstName}
            onChange={(e) => setNewFirstName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <input
            className="flex-1 rounded border p-2 text-sm"
            placeholder="Last name"
            value={newLastName}
            onChange={(e) => setNewLastName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <select
            className="rounded border p-2 text-sm"
            value={newSeat}
            onChange={(e) => setNewSeat(e.target.value)}
          >
            <option value="">No seat</option>
            {openSeats.map((i) => (
              <option key={i} value={i}>
                Seat {i + 1}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded bg-blue-500 px-3 py-2 text-sm text-white"
          >
            Add
          </button>
        </div>
      </div>

      {/* Active roster */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          Active students ({active.length})
        </p>
        <div className="max-h-64 divide-y overflow-y-auto rounded border">
          {active.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-1.5">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                defaultValue={s.firstName}
                placeholder="First name"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.firstName) renameStudent(s.id, v, s.lastName);
                }}
              />
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                defaultValue={s.lastName}
                placeholder="Last name"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== s.lastName) renameStudent(s.id, s.firstName, v);
                }}
              />
              <span className="w-16 shrink-0 text-xs text-gray-500">
                {s.seatIndex != null ? `Seat ${s.seatIndex + 1}` : "Unseated"}
              </span>
              <button
                type="button"
                onClick={() => removeStudent(s.id)}
                className="shrink-0 rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                title="Remove from class (keeps history)"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Inactive roster */}
      {inactive.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">
            Removed students ({inactive.length})
          </p>
          <div className="max-h-40 divide-y overflow-y-auto rounded border bg-gray-50">
            {inactive.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="flex-1 text-gray-600">{studentFullName(s)}</span>
                <button
                  type="button"
                  onClick={() => restoreStudent(s.id)}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-white"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteStudentId(s.id)}
                  className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingDeleteStudentId &&
        (() => {
          const s = inactive.find((s) => s.id === pendingDeleteStudentId);
          if (!s) return null;
          return (
            <ConfirmDialog
              title="Delete student"
              message={`Permanently delete ${studentFullName(s)} and all their history? This cannot be undone.`}
              confirmLabel="Delete"
              danger
              onConfirm={() => {
                deleteStudentPermanently(s.id);
                setPendingDeleteStudentId(null);
              }}
              onCancel={() => setPendingDeleteStudentId(null)}
            />
          );
        })()}
    </div>
  );
}
