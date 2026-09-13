import { useRef, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { parseRosterFiles, type ParsedRoster } from "../data/rosterImport";
import { sortByPeriod } from "../utils/classSort";
import Modal from "./Modal";
import { studentFullName } from "../utils/studentName";

export default function RosterUploadModal({ onClose }: { onClose: () => void }) {
  const classes = useAppStore((s) => s.classes);
  const importRosters = useAppStore((s) => s.importRosters);
  const deskTotal = useAppStore((s) => s.settings.seatLayout.seatOrder.length);

  const activeClasses = sortByPeriod(classes.filter((c) => !c.archivedAt));
  const fileRef = useRef<HTMLInputElement>(null);

  const [rosters, setRosters] = useState<ParsedRoster[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveFirst, setArchiveFirst] = useState(true);

  async function handleFiles(fileList: FileList) {
    setParsing(true);
    setError(null);
    try {
      const parsed = await parseRosterFiles(Array.from(fileList));
      const nonEmpty = parsed.filter((r) => r.students.length > 0);
      if (nonEmpty.length === 0) {
        setError("No student names found in those files. Expected a column headed “Student Name”.");
        setRosters(null);
      } else {
        setRosters(nonEmpty);
      }
    } catch (e) {
      console.error(e);
      setError("Couldn't read those files. Make sure they're .xlsx roster exports.");
      setRosters(null);
    } finally {
      setParsing(false);
    }
  }

  function handleImport() {
    if (!rosters) return;
    const doArchive = archiveFirst && activeClasses.length > 0;
    importRosters(rosters, doArchive);
    onClose();
  }

  const totalStudents = rosters?.reduce((n, r) => n + r.students.length, 0) ?? 0;

  return (
    <Modal title="Upload rosters" onClose={onClose} maxWidthClass="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose one Excel (.xlsx) roster file per class period. The file name's number
          sets the period (e.g. <code>01 Names.xlsx</code> → Period 1), and students are
          seated in list order along your custom seat order.
        </p>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
          >
            {rosters ? "Choose different files" : "Choose roster files"}
          </button>
          {parsing && <span className="ml-3 text-sm text-gray-500">Reading files…</span>}
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {rosters && (
          <>
            <div className="overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-3 py-2 font-semibold">Period</th>
                    <th className="px-3 py-2 font-semibold">Students</th>
                    <th className="px-3 py-2 font-semibold">First / last on list</th>
                  </tr>
                </thead>
                <tbody>
                  {rosters.map((r) => (
                    <tr key={r.fileName} className="border-t align-top">
                      <td className="px-3 py-1.5 font-medium">{r.period}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {r.students.length}
                        {r.students.length > deskTotal && (
                          <span className="ml-1 text-xs text-amber-600">
                            (&gt;{deskTotal}, grid grows)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-500">
                        {studentFullName(r.students[0])} …{" "}
                        {studentFullName(r.students[r.students.length - 1])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activeClasses.length > 0 && (
              <label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={archiveFirst}
                  onChange={(e) => setArchiveFirst(e.target.checked)}
                />
                <span>
                  <strong>Archive current rosters first.</strong> Your {activeClasses.length}{" "}
                  current {activeClasses.length === 1 ? "class" : "classes"} (
                  {activeClasses.map((c) => c.name).join(", ")}) will be hidden but kept —
                  recoverable from “Archived rosters” in Settings. Uncheck to keep them
                  alongside the new classes.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="rounded bg-green-600 px-4 py-2 text-sm text-white"
              >
                Import {rosters.length} {rosters.length === 1 ? "class" : "classes"} ({totalStudents}{" "}
                students)
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
