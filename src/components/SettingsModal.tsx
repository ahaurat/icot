import { useRef, useState } from "react";
import type { AppData } from "../types";
import { useAppStore } from "../state/useAppStore";
import { signOut, useAuth } from "../state/useAuth";
import { storageMode } from "../data/store";
import { todayDateKey } from "../utils/time";
import Modal from "./Modal";
import RosterManager from "./RosterManager";
import RosterUploadModal from "./RosterUploadModal";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { email } = useAuth();
  const classes = useAppStore((s) => s.classes);
  const students = useAppStore((s) => s.students);
  const currentClassId = useAppStore((s) => s.currentClassId);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const setSchoolYearStart = useAppStore((s) => s.setSchoolYearStart);
  const exportData = useAppStore((s) => s.exportData);
  const importData = useAppStore((s) => s.importData);
  const restoreClass = useAppStore((s) => s.restoreClass);
  const deleteClassPermanently = useAppStore((s) => s.deleteClassPermanently);

  const activeClasses = classes.filter((c) => !c.archivedAt);
  const archivedClasses = classes
    .filter((c) => c.archivedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));

  const [rosterClassId, setRosterClassId] = useState(currentClassId ?? activeClasses[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the roster selector valid if the selected class was archived/replaced.
  const effectiveRosterClassId = activeClasses.some((c) => c.id === rosterClassId)
    ? rosterClassId
    : activeClasses[0]?.id ?? "";

  function handleExport() {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icot-backup-${todayDateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!parsed.classes || !parsed.students || !parsed.events || !parsed.settings) {
        alert("That doesn't look like an ICOT backup file.");
        return;
      }
      if (confirm("Importing will REPLACE all current data with the backup's contents. Continue?")) {
        importData(parsed as AppData);
        setRosterClassId(parsed.classes[0]?.id ?? "");
      }
    } catch {
      alert("Could not read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} maxWidthClass="max-w-xl">
      <div className="space-y-6">
        {/* School year */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">School year</h3>
          <p className="mb-2 text-xs text-gray-500">
            Year totals include events on or after this date. Defaults to Aug 1.
          </p>
          <input
            type="date"
            className="rounded border p-2 text-sm"
            value={schoolYearStart}
            onChange={(e) => setSchoolYearStart(e.target.value)}
          />
        </section>

        {/* Roster upload */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Roster upload</h3>
          <p className="mb-2 text-xs text-gray-500">
            Start a new school year: upload one .xlsx roster per period. Students are seated
            in list order using your custom seat order.
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
          >
            Upload rosters…
          </button>
        </section>

        {/* Roster management */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Manage roster</h3>
          {activeClasses.length === 0 ? (
            <p className="text-sm text-gray-500">No active classes. Upload rosters to begin.</p>
          ) : (
            <>
              <select
                className="mb-3 rounded border p-2 text-sm"
                value={effectiveRosterClassId}
                onChange={(e) => setRosterClassId(e.target.value)}
              >
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {effectiveRosterClassId && <RosterManager classId={effectiveRosterClassId} />}
            </>
          )}
        </section>

        {/* Archived rosters */}
        {archivedClasses.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">
              Archived rosters ({archivedClasses.length})
            </h3>
            <p className="mb-2 text-xs text-gray-500">
              Past years, hidden from the app but recoverable. Restore brings a class back;
              delete removes it and its history permanently.
            </p>
            <div className="max-h-48 divide-y overflow-y-auto rounded border">
              {archivedClasses.map((c) => {
                const count = students.filter((s) => s.classId === c.id).length;
                const when = c.archivedAt ? new Date(c.archivedAt).toLocaleDateString() : "";
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-xs text-gray-500">
                        · {count} students · archived {when}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreClass(c.id)}
                      className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Permanently delete ${c.name} and all its students and history? This cannot be undone.`
                          )
                        ) {
                          deleteClassPermanently(c.id);
                        }
                      }}
                      className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Backup */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Backup &amp; restore</h3>
          <p className="mb-2 text-xs text-gray-500">
            {storageMode === "supabase"
              ? "Data syncs to Supabase. Export still gives you a portable JSON backup."
              : "Data is saved in this browser. Export a backup regularly so you don't lose it."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="rounded bg-gray-700 px-3 py-2 text-sm text-white"
            >
              Export backup
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded border px-3 py-2 text-sm"
            >
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
          </div>
        </section>

        {/* Account (cloud mode only) */}
        {storageMode === "supabase" && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Account</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{email ?? "Signed in"}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded border px-3 py-2 text-sm"
              >
                Sign out
              </button>
            </div>
          </section>
        )}
      </div>

      {uploadOpen && <RosterUploadModal onClose={() => setUploadOpen(false)} />}
    </Modal>
  );
}
