import { useMemo, useState } from "react";
import type { AppEvent, CategoryKey } from "../types";
import { CATEGORIES, CATEGORY_BY_KEY } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { describeEventDuration } from "../utils/time";
import CategoryPill from "./CategoryPill";
import EditEventDialog from "./EditEventDialog";

export default function EventHistory({ studentId }: { studentId: string }) {
  const events = useAppStore((s) => s.events);
  const [editing, setEditing] = useState<AppEvent | null>(null);
  // Categories toggled OFF; empty = show all.
  const [hidden, setHidden] = useState<Set<CategoryKey>>(new Set());

  const all = useMemo(
    () =>
      events
        .filter((e) => e.studentId === studentId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [events, studentId]
  );

  // Which categories actually appear in this student's history (in display order).
  const present = useMemo(
    () => CATEGORIES.filter((c) => all.some((e) => e.categoryKey === c.key)),
    [all]
  );

  const rows = all.filter((e) => !hidden.has(e.categoryKey));

  function toggle(key: CategoryKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (all.length === 0) {
    return <p className="text-sm text-gray-500">No entries yet.</p>;
  }

  return (
    <>
      {present.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {present.map((c) => (
            <button key={c.key} type="button" onClick={() => toggle(c.key)} title="Toggle filter">
              <CategoryPill categoryKey={c.key} showEmoji muted={hidden.has(c.key)} />
            </button>
          ))}
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="text-xs text-blue-600 underline"
            >
              show all
            </button>
          )}
        </div>
      )}

      <div className="max-h-56 divide-y overflow-y-auto rounded border">
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500">No entries match the filter.</p>
        ) : (
          rows.map((e) => {
            const cat = CATEGORY_BY_KEY[e.categoryKey];
            const d = new Date(e.startedAt);
            return (
              <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="w-24 shrink-0 font-medium">{cat.label}</span>
                <span className="w-28 shrink-0 tabular-nums">{describeEventDuration(e)}</span>
                <span className="flex-1 text-right text-xs text-gray-500">
                  {d.toLocaleDateString()}{" "}
                  {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(e)}
                  className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
                >
                  Edit
                </button>
              </div>
            );
          })
        )}
      </div>

      {editing && <EditEventDialog event={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
