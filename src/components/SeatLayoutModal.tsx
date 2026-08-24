import { useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { clearOrder, resizeLayout, toggleDeskCell } from "../utils/seatLayout";
import type { SeatLayout } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";

const SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function SeatLayoutModal({ onClose }: { onClose: () => void }) {
  const saved = useAppStore((s) => s.settings.seatLayout);
  const setSeatLayout = useAppStore((s) => s.setSeatLayout);
  const reseatActiveClasses = useAppStore((s) => s.reseatActiveClasses);
  const classes = useAppStore((s) => s.classes);
  const students = useAppStore((s) => s.students);

  const [layout, setLayout] = useState<SeatLayout>(saved);
  const [confirmingReseat, setConfirmingReseat] = useState(false);

  const deskCount = layout.seatOrder.length;
  const seatNumberByCell = new Map(layout.seatOrder.map((cell, i) => [cell, i + 1]));

  const activeClasses = classes.filter((c) => !c.archivedAt);
  const overflow = activeClasses
    .map((c) => ({ name: c.name, n: students.filter((s) => s.classId === c.id && s.active).length }))
    .filter((c) => c.n > deskCount);

  function handleSave() {
    setSeatLayout(layout);
    onClose();
  }

  function handleReseat() {
    setSeatLayout(layout);
    reseatActiveClasses();
    onClose();
  }

  return (
    <Modal title="Seating layout" onClose={onClose} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Click desks in the order students should fill them (seat 1, 2, 3…). Click a
          numbered desk to remove it. Blank cells are aisles/gaps.
        </p>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            Rows
            <select
              className="rounded border p-1"
              value={layout.rows}
              onChange={(e) => setLayout((l) => resizeLayout(l, Number(e.target.value), l.cols))}
            >
              {SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Cols
            <select
              className="rounded border p-1"
              value={layout.cols}
              onChange={(e) => setLayout((l) => resizeLayout(l, l.rows, Number(e.target.value)))}
            >
              {SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="text-gray-500">
            Desks: <span className="font-medium tabular-nums">{deskCount}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-2"
            style={{ gridTemplateColumns: `repeat(${layout.cols}, 2.5rem)` }}
          >
            {Array.from({ length: layout.rows * layout.cols }, (_, i) => {
              const seatNo = seatNumberByCell.get(i);
              const isDesk = seatNo != null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLayout((l) => toggleDeskCell(l, i))}
                  className={`h-10 w-10 rounded border text-xs font-medium tabular-nums ${
                    isDesk
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-dashed border-gray-300 bg-gray-50 text-gray-300"
                  }`}
                  title={isDesk ? `Seat ${seatNo}` : "Aisle — click to add a desk"}
                >
                  {isDesk ? seatNo : "·"}
                </button>
              );
            })}
          </div>
        </div>

        {overflow.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {overflow.map((c) => `${c.name}: ${c.n} students`).join("; ")} — more than the{" "}
            {deskCount} desks. Extra students overflow into leftover cells / new rows.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLayout((l) => clearOrder(l))}
              className="rounded border px-3 py-2 text-sm"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setLayout(DEFAULT_SEAT_LAYOUT)}
              className="rounded border px-3 py-2 text-sm"
            >
              Load default order
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
            >
              Save layout
            </button>
          </div>
        </div>

        {activeClasses.length > 0 && (
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setConfirmingReseat(true)}
              className="rounded border border-amber-400 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
            >
              Save &amp; re-seat active classes into this order
            </button>
            <p className="mt-1 text-xs text-gray-500">
              Applies the order to your {activeClasses.length} active{" "}
              {activeClasses.length === 1 ? "class" : "classes"} now, overwriting manual seat
              positions.
            </p>
          </div>
        )}
      </div>

      {confirmingReseat && (
        <ConfirmDialog
          title="Re-seat active classes"
          message="Re-seat all active classes into this order now? This overwrites any manual seat positions."
          confirmLabel="Re-seat"
          danger
          onConfirm={handleReseat}
          onCancel={() => setConfirmingReseat(false)}
        />
      )}
    </Modal>
  );
}
