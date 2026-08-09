import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "./state/useAppStore";
import { useAuth } from "./state/useAuth";
import Header from "./components/Header";
import SeatingChart from "./components/SeatingChart";
import StudentModal from "./components/StudentModal";
import SettingsModal from "./components/SettingsModal";
import SummaryModal from "./components/SummaryModal";
import LoginScreen from "./components/LoginScreen";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-gray-500">{children}</div>;
}

export default function App() {
  const { ready, authed } = useAuth();

  if (!ready) return <Centered>Loading…</Centered>;
  if (!authed) return <LoginScreen />;
  return <MainApp />;
}

function MainApp() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);
  const error = useAppStore((s) => s.error);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSeating, setEditSeating] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  if (!loaded) return <Centered>Loading…</Centered>;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Header
        editSeating={editSeating}
        onToggleEditSeating={() => setEditSeating((v) => !v)}
        onOpenSummary={() => setSummaryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {editSeating && (
        <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Drag students between desks to rearrange seats. Click “Done moving seats” when finished.
        </p>
      )}

      <SeatingChart editMode={editSeating} onOpenStudent={setSelectedStudentId} />

      {selectedStudentId && !editSeating && (
        <StudentModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}

      {summaryOpen && <SummaryModal onClose={() => setSummaryOpen(false)} />}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
