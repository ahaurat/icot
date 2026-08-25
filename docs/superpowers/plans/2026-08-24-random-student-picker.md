# Random Student Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Choose random student" button next to the period dropdown that picks a student from the current period's active roster (Fully random, or Cycle without repeats), and remove the now-crowded storage-mode badge from the header.

**Architecture:** Extend the existing `Settings` object (already the home for `schoolYearStart`/`seatLayout`, persisted identically in localStorage and Supabase) with a global `randomPicker` config and a per-class `pickerProgress` map. A pure, unit-tested selection function decides who gets picked given the roster, config, and prior progress; a new zustand store action wraps it with state updates and persistence. The picked student is shown by highlighting their seat — no popup — via transient React state that lives in `App.tsx` and is cleared when the period changes.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest (pure-logic unit tests), Tailwind CSS, Supabase (jsonb columns) / localStorage.

## Global Constraints

- No popup/dialog for the picker result — seat highlight only (per spec decision).
- No manual "reset cycle" control — resets only happen automatically (exhaustion, or new calendar day when "Reset each day" is Yes).
- Picking is always scoped to the currently selected period (class) — never pools across periods.
- "Fully random" never excludes anyone, including students called on the previous click.
- The storage-mode badge (☁ Cloud / 💾 Local) is removed entirely from the header; `storageMode` itself stays exported from `src/data/store.ts` since `SettingsModal.tsx` still uses it.
- Follow existing code style: no comments except where a non-obvious constraint needs explaining, Tailwind utility classes matching neighboring components, `<select>` inputs for settings (this codebase has no radio-button precedent).

---

### Task 1: Types & Settings Defaults

**Files:**
- Modify: `src/types.ts:65-70`
- Modify: `src/data/store.ts:9-15`
- Test: `src/data/store.test.ts`

**Interfaces:**
- Produces: `RandomPickerSettings { mode: "random" | "cycle"; resetDaily: boolean }`, `ClassPickerProgress { calledStudentIds: string[]; cycleStartDate: string }`, and `Settings.randomPicker: RandomPickerSettings`, `Settings.pickerProgress: Record<string, ClassPickerProgress>`. `withSettingsDefaults` now fills in defaults (`mode: "random"`, `resetDaily: true`, `pickerProgress: {}`) for both new fields. Every later task relies on these exact names and shapes.

- [ ] **Step 1: Write the failing test**

Add to `src/data/store.test.ts` (inside the existing `describe("withSettingsDefaults", ...)` block, as new `it` cases):

```ts
  it("supplies default random picker settings when none are stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.randomPicker).toEqual({ mode: "random", resetDaily: true });
    expect(s.pickerProgress).toEqual({});
  });
  it("preserves provided random picker settings and progress", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      randomPicker: { mode: "cycle", resetDaily: false },
      pickerProgress: { "class-1": { calledStudentIds: ["s1"], cycleStartDate: "2025-09-01" } },
    });
    expect(s.randomPicker).toEqual({ mode: "cycle", resetDaily: false });
    expect(s.pickerProgress).toEqual({
      "class-1": { calledStudentIds: ["s1"], cycleStartDate: "2025-09-01" },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store.test.ts`
Expected: FAIL — `s.randomPicker` is `undefined`, not `{ mode: "random", resetDaily: true }` (TypeScript will also complain that `randomPicker`/`pickerProgress` don't exist on the object passed to `withSettingsDefaults` until Step 3 is done — if the type error blocks the test run, do Step 3's `types.ts` half first, then re-run to confirm the *value* assertions fail).

- [ ] **Step 3: Add the new types**

In `src/types.ts`, replace:

```ts
export interface Settings {
  /** ISO date (YYYY-MM-DD) marking the start of the tracked school year. */
  schoolYearStart: string;
  /** Shared seating layout used by roster upload and the seating chart. */
  seatLayout: SeatLayout;
}
```

with:

```ts
export interface RandomPickerSettings {
  mode: "random" | "cycle";
  /** Only meaningful when mode === "cycle": whether the called-list resets each calendar day. */
  resetDaily: boolean;
}

export interface ClassPickerProgress {
  /** Student ids already picked in the current cycle round. */
  calledStudentIds: string[];
  /** Local YYYY-MM-DD the current cycle round began; used for the daily reset check. */
  cycleStartDate: string;
}

export interface Settings {
  /** ISO date (YYYY-MM-DD) marking the start of the tracked school year. */
  schoolYearStart: string;
  /** Shared seating layout used by roster upload and the seating chart. */
  seatLayout: SeatLayout;
  /** Global "Choose random student" config. */
  randomPicker: RandomPickerSettings;
  /** Per-class cycle progress for the random picker, keyed by classId. */
  pickerProgress: Record<string, ClassPickerProgress>;
}
```

- [ ] **Step 4: Update `withSettingsDefaults`**

In `src/data/store.ts`, replace:

```ts
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  return {
    schoolYearStart: s?.schoolYearStart || defaultSchoolYearStart(),
    seatLayout: s?.seatLayout ? normalizeSeatLayout(s.seatLayout) : DEFAULT_SEAT_LAYOUT,
  };
}
```

with:

```ts
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  return {
    schoolYearStart: s?.schoolYearStart || defaultSchoolYearStart(),
    seatLayout: s?.seatLayout ? normalizeSeatLayout(s.seatLayout) : DEFAULT_SEAT_LAYOUT,
    randomPicker: s?.randomPicker ?? { mode: "random", resetDaily: true },
    pickerProgress: s?.pickerProgress ?? {},
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- store.test.ts`
Expected: PASS (5 tests: the 3 existing + 2 new)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/data/store.ts src/data/store.test.ts
git commit -m "Add random picker settings to Settings type and defaults"
```

---

### Task 2: Pure Picker Selection Logic

**Files:**
- Create: `src/utils/randomPicker.ts`
- Test: `src/utils/randomPicker.test.ts`

**Interfaces:**
- Consumes: `RandomPickerSettings`, `ClassPickerProgress` from `src/types.ts` (Task 1).
- Produces: `pickStudent(activeStudentIds: string[], settings: RandomPickerSettings, progress: ClassPickerProgress | undefined, today: string): { studentId: string; progress: ClassPickerProgress } | null`. Task 3 (store action) calls this directly.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/randomPicker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { pickStudent } from "./randomPicker";

describe("pickStudent", () => {
  it("returns null when there are no active students", () => {
    expect(pickStudent([], { mode: "random", resetDaily: true }, undefined, "2026-08-24")).toBeNull();
  });

  it("fully random mode picks from the whole roster, ignoring progress", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // picks index 0
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "random", resetDaily: true },
      { calledStudentIds: ["a", "b", "c"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a");
    vi.restoreAllMocks();
  });

  it("cycle mode excludes already-called students", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // picks first eligible
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("b"); // eligible = [b, c], index 0 = b
    expect(result?.progress.calledStudentIds).toEqual(["a", "b"]);
    vi.restoreAllMocks();
  });

  it("cycle mode auto-restarts when the pool is exhausted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a", "b"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a"); // pool refilled to [a, b], index 0 = a
    expect(result?.progress.calledStudentIds).toEqual(["a"]);
    vi.restoreAllMocks();
  });

  it("cycle mode resets on a new calendar day when resetDaily is true", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: true },
      { calledStudentIds: ["a", "b"], cycleStartDate: "2026-08-23" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a"); // list cleared, then picked from full roster
    expect(result?.progress.calledStudentIds).toEqual(["a"]);
    expect(result?.progress.cycleStartDate).toBe("2026-08-24");
    vi.restoreAllMocks();
  });

  it("cycle mode does not reset on a new calendar day when resetDaily is false", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a"], cycleStartDate: "2026-08-23" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("b"); // eligible = [b, c], not reset
    expect(result?.progress.calledStudentIds).toEqual(["a", "b"]);
    expect(result?.progress.cycleStartDate).toBe("2026-08-23"); // unchanged
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- randomPicker.test.ts`
Expected: FAIL — `Cannot find module './randomPicker'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/randomPicker.ts`:

```ts
import type { ClassPickerProgress, RandomPickerSettings } from "../types";

export interface PickResult {
  studentId: string;
  progress: ClassPickerProgress;
}

/**
 * Pick a student id for a class given its active roster, the global picker
 * settings, any prior cycle progress for that class, and today's local date
 * (YYYY-MM-DD). Pure — no store or storage access. Returns null when there
 * are no active students to pick from.
 */
export function pickStudent(
  activeStudentIds: string[],
  settings: RandomPickerSettings,
  progress: ClassPickerProgress | undefined,
  today: string
): PickResult | null {
  if (activeStudentIds.length === 0) return null;

  if (settings.mode === "random") {
    const studentId = activeStudentIds[Math.floor(Math.random() * activeStudentIds.length)];
    return { studentId, progress: progress ?? { calledStudentIds: [], cycleStartDate: today } };
  }

  let calledStudentIds = progress?.calledStudentIds ?? [];
  let cycleStartDate = progress?.cycleStartDate ?? today;

  if (settings.resetDaily && cycleStartDate !== today) {
    calledStudentIds = [];
    cycleStartDate = today;
  }

  let eligible = activeStudentIds.filter((id) => !calledStudentIds.includes(id));
  if (eligible.length === 0) {
    calledStudentIds = [];
    eligible = activeStudentIds;
  }

  const studentId = eligible[Math.floor(Math.random() * eligible.length)];
  return {
    studentId,
    progress: { calledStudentIds: [...calledStudentIds, studentId], cycleStartDate },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- randomPicker.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/randomPicker.ts src/utils/randomPicker.test.ts
git commit -m "Add pure random-student selection logic"
```

---

### Task 3: Store Actions

**Files:**
- Modify: `src/state/useAppStore.ts:1-17` (imports), `:33-70` (interface), `:110-117` (initial state), and add new actions near `setSeatLayout` (currently `:367-372`)

**Interfaces:**
- Consumes: `pickStudent` from `src/utils/randomPicker.ts` (Task 2); `RandomPickerSettings` from `src/types.ts` (Task 1); `todayDateKey` from `src/utils/time.ts` (already exists).
- Produces: `useAppStore().pickRandomStudent(classId: string): string | null` and `useAppStore().setRandomPickerSettings(patch: Partial<RandomPickerSettings>): void`. Tasks 5 and 8 (Header and SettingsModal) call these by exact name.

- [ ] **Step 1: Add imports**

In `src/state/useAppStore.ts`, replace:

```ts
import type {
  AppData,
  AppEvent,
  CategoryKey,
  ClassRoom,
  SeatLayout,
  Student,
} from "../types";
import { CATEGORY_BY_KEY } from "../constants/categories";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { normalizeSeatLayout, placementForLayout, planReseat } from "../utils/seatLayout";
import { buildSeedData } from "../data/seed";
import type { ParsedRoster } from "../data/rosterImport";
import { getDataStore, withSettingsDefaults } from "../data/store";
import { newId } from "../utils/id";
import { elapsedSeconds } from "../utils/time";
```

with:

```ts
import type {
  AppData,
  AppEvent,
  CategoryKey,
  ClassRoom,
  RandomPickerSettings,
  SeatLayout,
  Student,
} from "../types";
import { CATEGORY_BY_KEY } from "../constants/categories";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { normalizeSeatLayout, placementForLayout, planReseat } from "../utils/seatLayout";
import { buildSeedData } from "../data/seed";
import type { ParsedRoster } from "../data/rosterImport";
import { getDataStore, withSettingsDefaults } from "../data/store";
import { newId } from "../utils/id";
import { elapsedSeconds, todayDateKey } from "../utils/time";
import { pickStudent } from "../utils/randomPicker";
```

- [ ] **Step 2: Add actions to the `AppState` interface**

In `src/state/useAppStore.ts`, replace:

```ts
  // Settings + data
  setSchoolYearStart: (date: string) => void;
  importData: (data: AppData) => void;
  exportData: () => AppData;
}
```

with:

```ts
  // Settings + data
  setSchoolYearStart: (date: string) => void;
  importData: (data: AppData) => void;
  exportData: () => AppData;

  // Random student picker
  setRandomPickerSettings: (patch: Partial<RandomPickerSettings>) => void;
  pickRandomStudent: (classId: string) => string | null;
}
```

- [ ] **Step 3: Implement the actions**

In `src/state/useAppStore.ts`, replace:

```ts
  setSchoolYearStart(date) {
    const settings = { ...get().settings, schoolYearStart: date };
    set({ settings });
    persist(store.saveSettings(settings));
  },
```

with:

```ts
  setSchoolYearStart(date) {
    const settings = { ...get().settings, schoolYearStart: date };
    set({ settings });
    persist(store.saveSettings(settings));
  },

  setRandomPickerSettings(patch) {
    const settings = {
      ...get().settings,
      randomPicker: { ...get().settings.randomPicker, ...patch },
    };
    set({ settings });
    persist(store.saveSettings(settings));
  },

  pickRandomStudent(classId) {
    const activeIds = get()
      .students.filter((s) => s.classId === classId && s.active)
      .map((s) => s.id);
    const current = get().settings;
    const result = pickStudent(
      activeIds,
      current.randomPicker,
      current.pickerProgress[classId],
      todayDateKey()
    );
    if (!result) return null;

    const settings = {
      ...current,
      pickerProgress: { ...current.pickerProgress, [classId]: result.progress },
    };
    set({ settings });
    persist(store.saveSettings(settings));
    return result.studentId;
  },
```

(Leave `settings: { schoolYearStart: "", seatLayout: DEFAULT_SEAT_LAYOUT }` at line ~114, the pre-load placeholder state, unchanged — `withSettingsDefaults` fills in `randomPicker`/`pickerProgress` once `init()` loads real data, same as it already does for `seatLayout` before load.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all existing + Task 1/2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/state/useAppStore.ts
git commit -m "Add pickRandomStudent and setRandomPickerSettings store actions"
```

---

### Task 4: Supabase Persistence

**Files:**
- Modify: `supabase/schema.sql:44-48`
- Modify: `src/data/supabaseStore.ts:1`, `:34-37`, `:138-145`, `:179-188`

**Interfaces:**
- Consumes: `RandomPickerSettings`, `ClassPickerProgress` from `src/types.ts` (Task 1).
- Produces: no new exports — this task only makes the existing `saveSettings`/`loadAll` round-trip the two new `Settings` fields through Supabase's `settings` table. No Supabase instance is available to test against directly in this environment; correctness is covered by typecheck plus the manual verification in Task 9 (which runs against whichever backend — local or Supabase — the dev environment is configured for).

- [ ] **Step 1: Add the new columns to the schema**

In `supabase/schema.sql`, replace:

```sql
create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null,
  seat_layout       jsonb
);
```

with:

```sql
create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null,
  seat_layout       jsonb,
  random_picker     jsonb,
  picker_progress   jsonb
);

-- Existing deployments: add the columns if the table already exists without them.
alter table settings add column if not exists random_picker   jsonb;
alter table settings add column if not exists picker_progress jsonb;
```

- [ ] **Step 2: Update the row types and mapping**

In `src/data/supabaseStore.ts`, replace the import:

```ts
import type { AppData, AppEvent, ClassRoom, SeatLayout, Settings, Student } from "../types";
```

with:

```ts
import type {
  AppData,
  AppEvent,
  ClassPickerProgress,
  ClassRoom,
  RandomPickerSettings,
  SeatLayout,
  Settings,
  Student,
} from "../types";
```

Replace:

```ts
interface SettingsRow {
  school_year_start: string;
  seat_layout: SeatLayout | null;
}
```

with:

```ts
interface SettingsRow {
  school_year_start: string;
  seat_layout: SeatLayout | null;
  random_picker: RandomPickerSettings | null;
  picker_progress: Record<string, ClassPickerProgress> | null;
}
```

- [ ] **Step 3: Update `loadAll`'s settings mapping**

Replace:

```ts
        settings: withSettingsDefaults(
          settings.data
            ? {
                schoolYearStart: (settings.data as SettingsRow).school_year_start,
                seatLayout: (settings.data as SettingsRow).seat_layout ?? undefined,
              }
            : null
        ),
```

with:

```ts
        settings: withSettingsDefaults(
          settings.data
            ? {
                schoolYearStart: (settings.data as SettingsRow).school_year_start,
                seatLayout: (settings.data as SettingsRow).seat_layout ?? undefined,
                randomPicker: (settings.data as SettingsRow).random_picker ?? undefined,
                pickerProgress: (settings.data as SettingsRow).picker_progress ?? undefined,
              }
            : null
        ),
```

- [ ] **Step 4: Update `saveSettings`**

Replace:

```ts
    async saveSettings(s: Settings) {
      const owner_id = await ownerId();
      const { error } = await sb
        .from("settings")
        .upsert(
          { owner_id, school_year_start: s.schoolYearStart, seat_layout: s.seatLayout },
          { onConflict: "owner_id" }
        );
      check(error, "save settings");
    },
```

with:

```ts
    async saveSettings(s: Settings) {
      const owner_id = await ownerId();
      const { error } = await sb.from("settings").upsert(
        {
          owner_id,
          school_year_start: s.schoolYearStart,
          seat_layout: s.seatLayout,
          random_picker: s.randomPicker,
          picker_progress: s.pickerProgress,
        },
        { onConflict: "owner_id" }
      );
      check(error, "save settings");
    },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql src/data/supabaseStore.ts
git commit -m "Persist random picker settings and progress through Supabase"
```

---

### Task 5: Header — Remove Storage Badge, Add "Choose Random Student" Button

**Files:**
- Modify: `src/components/Header.tsx` (whole file)

**Interfaces:**
- Consumes: `useAppStore().pickRandomStudent` and `useAppStore().students`, `useAppStore().currentClassId` (Task 3 / existing store). `storageMode` from `src/data/store.ts` is no longer used in this file (its import is removed here) but remains exported for `SettingsModal.tsx`.
- Produces: `Header` now takes an additional required prop `onPickedStudent: (studentId: string) => void`, called with the picked id whenever a pick succeeds. Task 7 (`App.tsx`) supplies this prop.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/components/Header.tsx` with:

```tsx
import { useAppStore } from "../state/useAppStore";

interface HeaderProps {
  editSeating: boolean;
  onToggleEditSeating: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onPickedStudent: (studentId: string) => void;
}

export default function Header({
  editSeating,
  onToggleEditSeating,
  onOpenSummary,
  onOpenSettings,
  onPickedStudent,
}: HeaderProps) {
  const allClasses = useAppStore((s) => s.classes);
  const classes = allClasses.filter((c) => !c.archivedAt);
  const currentClassId = useAppStore((s) => s.currentClassId);
  const setCurrentClass = useAppStore((s) => s.setCurrentClass);
  const students = useAppStore((s) => s.students);
  const pickRandomStudent = useAppStore((s) => s.pickRandomStudent);

  const hasActiveStudents = students.some((s) => s.classId === currentClassId && s.active);

  function handlePick() {
    if (!currentClassId) return;
    const studentId = pickRandomStudent(currentClassId);
    if (studentId) onPickedStudent(studentId);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-bold">ICOT</h1>

      <select
        className="rounded border p-2"
        value={currentClassId ?? ""}
        onChange={(e) => setCurrentClass(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handlePick}
        disabled={!hasActiveStudents}
        className="rounded bg-purple-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Choose random student
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSummary}
          className="rounded bg-indigo-500 px-4 py-2 text-white"
        >
          Summary
        </button>
        <button
          type="button"
          onClick={onToggleEditSeating}
          className={`rounded px-4 py-2 text-white ${
            editSeating ? "bg-green-600" : "bg-gray-600"
          }`}
        >
          {editSeating ? "Done moving seats" : "Edit seating"}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded bg-blue-500 px-4 py-2 text-white"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `App.tsx` doesn't yet pass `onPickedStudent` (fixed in Task 7). Confirm the *only* error is the missing prop on the `<Header ... />` call in `src/App.tsx`; if there are other errors, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.tsx
git commit -m "Header: remove storage badge, add Choose random student button"
```

---

### Task 6: Seat Highlight Support

**Files:**
- Modify: `src/components/Seat.tsx:10-40`
- Modify: `src/components/SeatingChart.tsx` (whole file)

**Interfaces:**
- Produces: `Seat` takes a new required prop `highlighted: boolean` and rings the seat in yellow when true. `SeatingChart` takes a new required prop `pickedStudentId: string | null` and computes `highlighted` per seat. Task 7 (`App.tsx`) supplies `pickedStudentId` to `SeatingChart`.

- [ ] **Step 1: Add the `highlighted` prop to `Seat`**

In `src/components/Seat.tsx`, replace:

```tsx
interface SeatProps {
  index: number;
  student: Student | undefined;
  editMode: boolean;
  onOpen: (studentId: string) => void;
}

export default function Seat({ index, student, editMode, onOpen }: SeatProps) {
  // Each desk position is a drop target while editing the seating chart.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `seat-${index}`,
    disabled: !editMode,
  });

  return (
    <div
      ref={setDropRef}
      className={`relative h-20 rounded border text-center text-sm transition-colors ${
        student ? "bg-gray-300" : "bg-gray-100 border-dashed"
      } ${isOver ? "ring-2 ring-blue-500" : ""}`}
    >
```

with:

```tsx
interface SeatProps {
  index: number;
  student: Student | undefined;
  editMode: boolean;
  onOpen: (studentId: string) => void;
  highlighted: boolean;
}

export default function Seat({ index, student, editMode, onOpen, highlighted }: SeatProps) {
  // Each desk position is a drop target while editing the seating chart.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `seat-${index}`,
    disabled: !editMode,
  });

  return (
    <div
      ref={setDropRef}
      className={`relative h-20 rounded border text-center text-sm transition-colors ${
        student ? "bg-gray-300" : "bg-gray-100 border-dashed"
      } ${isOver ? "ring-2 ring-blue-500" : ""} ${
        highlighted ? "ring-4 ring-yellow-400" : ""
      }`}
    >
```

- [ ] **Step 2: Thread `pickedStudentId` through `SeatingChart`**

Replace the full contents of `src/components/SeatingChart.tsx` with:

```tsx
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useAppStore, useCurrentClass } from "../state/useAppStore";
import { isAisleCell } from "../utils/seatLayout";
import Seat from "./Seat";

interface SeatingChartProps {
  editMode: boolean;
  onOpenStudent: (studentId: string) => void;
  pickedStudentId: string | null;
}

export default function SeatingChart({ editMode, onOpenStudent, pickedStudentId }: SeatingChartProps) {
  const currentClass = useCurrentClass();
  const currentClassId = useAppStore((s) => s.currentClassId);
  const students = useAppStore((s) => s.students);
  const moveStudent = useAppStore((s) => s.moveStudent);
  const seatLayout = useAppStore((s) => s.settings.seatLayout);

  // Require a small drag distance so clicks aren't swallowed as drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!currentClass) return null;

  const seatCount = currentClass.seatRows * currentClass.seatCols;
  const activeInClass = students.filter((s) => s.classId === currentClassId && s.active);
  const studentBySeat = new Map<number, (typeof activeInClass)[number]>();
  for (const s of activeInClass) {
    if (s.seatIndex != null) studentBySeat.set(s.seatIndex, s);
  }

  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id;
    if (typeof overId !== "string" || !overId.startsWith("seat-")) return;
    const seatIndex = Number(overId.slice("seat-".length));
    moveStudent(String(e.active.id), seatIndex);
  }

  const grid = (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${currentClass.seatCols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: seatCount }, (_, i) => {
        const student = studentBySeat.get(i);
        // An empty non-desk cell is a visible aisle/gap and not a drop target.
        if (!student && isAisleCell(seatLayout, i)) {
          return <div key={i} aria-hidden className="h-20" />;
        }
        return (
          <Seat
            key={i}
            index={i}
            student={student}
            editMode={editMode}
            onOpen={onOpenStudent}
            highlighted={student?.id === pickedStudentId}
          />
        );
      })}
    </div>
  );

  if (!editMode) return grid;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `App.tsx` doesn't yet pass `pickedStudentId` to `<SeatingChart />` (fixed in Task 7). Confirm that's the only new error.

- [ ] **Step 4: Commit**

```bash
git add src/components/Seat.tsx src/components/SeatingChart.tsx
git commit -m "Add seat highlight support for the random picker result"
```

---

### Task 7: App.tsx Wiring

**Files:**
- Modify: `src/App.tsx` (whole file)

**Interfaces:**
- Consumes: `Header`'s `onPickedStudent` prop (Task 5) and `SeatingChart`'s `pickedStudentId` prop (Task 6); `useAppStore().currentClassId` (existing).
- Produces: nothing new for later tasks — this is the wiring task that makes Tasks 5 and 6 compile together.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/App.tsx` with:

```tsx
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
  const currentClassId = useAppStore((s) => s.currentClassId);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSeating, setEditSeating] = useState(false);
  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // Clear the "just picked" highlight on period switches so it never shows a
  // stale pick from a different class's roster.
  useEffect(() => {
    setPickedStudentId(null);
  }, [currentClassId]);

  // A load failure has to be shown here: the error banner below is unreachable
  // while `loaded` is false, so anything that throws in init() would otherwise
  // be indistinguishable from a slow load.
  if (!loaded) {
    if (!error) return <Centered>Loading…</Centered>;
    return (
      <Centered>
        <div className="max-w-md rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Couldn’t load your data.</p>
          <p className="mt-1 break-words">{error}</p>
          <button
            type="button"
            className="mt-3 rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            onClick={() => void init()}
          >
            Try again
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Header
        editSeating={editSeating}
        onToggleEditSeating={() => setEditSeating((v) => !v)}
        onOpenSummary={() => setSummaryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onPickedStudent={setPickedStudentId}
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

      <SeatingChart
        editMode={editSeating}
        onOpenStudent={setSelectedStudentId}
        pickedStudentId={pickedStudentId}
      />

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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Wire random picker highlight state through App"
```

---

### Task 8: Settings Modal — Random Picker Section

**Files:**
- Modify: `src/components/SettingsModal.tsx:13-24` (hooks) and `:79-91` (insert new section after "School year")

**Interfaces:**
- Consumes: `useAppStore().settings.randomPicker` and `useAppStore().setRandomPickerSettings` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the store hooks**

In `src/components/SettingsModal.tsx`, replace:

```tsx
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
```

with:

```tsx
  const { email } = useAuth();
  const classes = useAppStore((s) => s.classes);
  const students = useAppStore((s) => s.students);
  const currentClassId = useAppStore((s) => s.currentClassId);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const setSchoolYearStart = useAppStore((s) => s.setSchoolYearStart);
  const randomPicker = useAppStore((s) => s.settings.randomPicker);
  const setRandomPickerSettings = useAppStore((s) => s.setRandomPickerSettings);
  const exportData = useAppStore((s) => s.exportData);
  const importData = useAppStore((s) => s.importData);
  const restoreClass = useAppStore((s) => s.restoreClass);
  const deleteClassPermanently = useAppStore((s) => s.deleteClassPermanently);
```

- [ ] **Step 2: Add the "Random picker" section**

Replace:

```tsx
        {/* Roster upload */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Roster upload</h3>
```

with:

```tsx
        {/* Random picker */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Random picker</h3>
          <p className="mb-2 text-xs text-gray-500">
            Controls how "Choose random student" picks a name.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              Choose student
              <select
                className="rounded border p-1"
                value={randomPicker.mode}
                onChange={(e) =>
                  setRandomPickerSettings({ mode: e.target.value as "random" | "cycle" })
                }
              >
                <option value="random">Fully random</option>
                <option value="cycle">Cycle</option>
              </select>
            </label>
            {randomPicker.mode === "cycle" && (
              <label className="flex items-center gap-1">
                Reset each day
                <select
                  className="rounded border p-1"
                  value={randomPicker.resetDaily ? "yes" : "no"}
                  onChange={(e) => setRandomPickerSettings({ resetDaily: e.target.value === "yes" })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            )}
          </div>
        </section>

        {/* Roster upload */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Roster upload</h3>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "Add Random picker settings section"
```

---

### Task 9: Manual Verification in Browser

**Files:** none (verification only)

**Interfaces:** none — this task exercises the fully wired feature from Tasks 1–8.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS, build succeeds with no errors

- [ ] **Step 2: Start the dev server and open it in the browser preview**

Start the project's dev server (`npm run dev`) via the preview tool and open it.

- [ ] **Step 3: Verify the header**

Confirm the ☁/💾 storage badge is gone, and a "Choose random student" button appears immediately to the right of the period dropdown.

- [ ] **Step 4: Verify Fully random mode**

Open Settings → confirm "Random picker" section shows "Choose student: Fully random" by default. Close Settings, click "Choose random student" several times, and confirm a seat highlights each time (a yellow ring), and that the same student can be picked on consecutive clicks (no exclusion).

- [ ] **Step 5: Verify Cycle mode**

In Settings, switch "Choose student" to "Cycle" and confirm a "Reset each day" selector appears. Close Settings and click "Choose random student" repeatedly until every active student in the period has been highlighted at least once; confirm no student repeats before the full roster has been covered, and that after the last student, the next click starts a fresh round (a repeat becomes possible again).

- [ ] **Step 6: Verify persistence**

While mid-cycle (some but not all students called), reload the page. Click "Choose random student" again and confirm it continues excluding the already-called students from before the reload (progress survived the reload).

- [ ] **Step 7: Verify period isolation**

Switch to a different period (if more than one exists) and confirm the seat highlight clears, and that clicking "Choose random student" in the new period cycles independently of the first period's progress.

- [ ] **Step 8: Verify the disabled state**

If a period with zero active students is available (or can be simulated), confirm the button is disabled for that period.

- [ ] **Step 9: Report results**

No commit for this task — report the verification outcome to the user. If any check fails, return to the relevant earlier task, fix, re-run its tests, and re-verify here.
