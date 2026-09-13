# Seating Chart Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a way to clear the random-pick highlight, a "Randomize seats" flow (save permanently or revert tomorrow), and a "Create groups of X" flow (color-coded, reseated together) to the ICOT seating chart, plus three small bundled UI fixes.

**Architecture:** Two new pure helper modules (`seatRandomizer.ts`, `groups.ts`) mirror the existing `randomPicker.ts`/`seatLayout.ts` split of pure logic vs. store/React. New Zustand store actions on `useAppStore` apply that logic and persist through the existing `DataStore` interface (`localStore.ts` / `supabaseStore.ts`). Two new small modal components trigger the actions from a restructured `Header.tsx`.

**Tech Stack:** React 19 + TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Zustand, Tailwind CSS, Vitest. No component-testing library — UI correctness is verified manually via the browser preview, matching this codebase's existing pattern (only pure functions get unit tests).

## Global Constraints

- Full spec: [docs/superpowers/specs/2026-09-12-seating-chart-features-design.md](../specs/2026-09-12-seating-chart-features-design.md) — read it before starting if anything below is unclear.
- **Type-check with `npx tsc -b`, not `npm run typecheck`.** The latter runs `tsc --noEmit` against the root `tsconfig.json`, which has `"files": []` and is a silent no-op on this branch (confirmed: exits 0 instantly with no files checked). `npx tsc -b` actually builds the project references and catches errors.
- Run `npm test` after every task that touches a `src/utils/*.ts` or `src/data/*.ts` file; all existing 33 tests must keep passing.
- No student PII anywhere — this repo is public. The local dev server (`.claude/launch.json` config `icot-dev`, port 5199) runs in localStorage mode with the fictional demo class from `src/data/seed.ts`; use that for all manual verification, never a real roster.
- Match existing code style: no comments unless explaining a non-obvious WHY (see any existing file for the house style); Tailwind utility classes inline, no CSS-in-JS; hex colors inline (not Tailwind color classes) for anything that must match a JS-defined palette, exactly like `CategoryConfig.color` already does.
- Commit after each task (or each step group marked "Commit" below) with a message describing that task's change — do not squash multiple tasks into one commit.

---

### Task 1: Data model — new fields across storage layers

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data/store.ts`
- Modify: `src/data/localStore.ts`
- Modify: `src/data/supabaseStore.ts`
- Modify: `supabase/schema.sql`
- Test: `src/data/store.test.ts`

**Interfaces:**
- Produces: `Student.groupColor: string | null`; `SeatingSnapshot { savedAt: string; seats: Record<string, number> }`; `Settings.seatingSnapshots: Record<string, SeatingSnapshot>`; `withSettingsDefaults()` now fills `seatingSnapshots: {}` when absent.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/store.test.ts` (inside the existing `describe("withSettingsDefaults", ...)` block, after the last `it(...)`):

```ts
  it("supplies default seating snapshots when none are stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.seatingSnapshots).toEqual({});
  });
  it("preserves provided seating snapshots", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      seatingSnapshots: { "class-1": { savedAt: "2025-09-01", seats: { s1: 3 } } },
    });
    expect(s.seatingSnapshots).toEqual({
      "class-1": { savedAt: "2025-09-01", seats: { s1: 3 } },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- store.test.ts`
Expected: FAIL — `s.seatingSnapshots` is `undefined`, not `{}` (property doesn't exist on the `Settings` type yet, so this will actually fail to type-check; that's fine, TypeScript errors count as "fails" here).

- [ ] **Step 3: Add the types**

In `src/types.ts`, add `groupColor` to `Student` (after `active: boolean;`):

```ts
export interface Student {
  id: string;
  classId: string;
  name: string;
  /** 0-based desk position within the class grid, or null if unseated. */
  seatIndex: number | null;
  /** Soft-delete flag: inactive students keep their history but leave the chart. */
  active: boolean;
  /** Background color for "Create groups" display, or null when not grouped. */
  groupColor: string | null;
}
```

And add `SeatingSnapshot` + extend `Settings` (after the `ClassPickerProgress` interface and inside `Settings`):

```ts
export interface SeatingSnapshot {
  /** Local YYYY-MM-DD the snapshot was captured; used to detect the next calendar day. */
  savedAt: string;
  /** seatIndex per student id at the time "Randomize seats -> today only" was used. */
  seats: Record<string, number>;
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
  /** Per-class "randomize seats -> today only" snapshot, keyed by classId. */
  seatingSnapshots: Record<string, SeatingSnapshot>;
}
```

- [ ] **Step 4: Update `withSettingsDefaults`**

In `src/data/store.ts`, replace the function body:

```ts
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  return {
    schoolYearStart: s?.schoolYearStart || defaultSchoolYearStart(),
    seatLayout: s?.seatLayout ? normalizeSeatLayout(s.seatLayout) : DEFAULT_SEAT_LAYOUT,
    randomPicker: s?.randomPicker ?? { mode: "random", resetDaily: true },
    pickerProgress: s?.pickerProgress ?? {},
    seatingSnapshots: s?.seatingSnapshots ?? {},
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- store.test.ts`
Expected: PASS (all tests in that file, including the two new ones)

- [ ] **Step 6: Update the remaining storage layers (no dedicated test — mechanical, covered by the typecheck in Step 7)**

In `src/data/localStore.ts`, in the `read()` function, replace:

```ts
      students: parsed.students ?? [],
```

with:

```ts
      students: (parsed.students ?? []).map((s) => ({ ...s, groupColor: s.groupColor ?? null })),
```

In `src/data/supabaseStore.ts`:

1. Add `SeatingSnapshot` to the existing type-only import at the top (the only change is inserting the one new line — every other name stays exactly as it is today):

```ts
import type {
  AppData,
  AppEvent,
  ClassPickerProgress,
  ClassRoom,
  RandomPickerSettings,
  SeatLayout,
  SeatingSnapshot,
  Settings,
  Student,
} from "../types";
```

2. Add `group_color` to `StudentRow` and its mappers:

```ts
interface StudentRow {
  id: string;
  class_id: string;
  name: string;
  seat_index: number | null;
  active: boolean;
  group_color: string | null;
}
```

```ts
const studentToRow = (s: Student): StudentRow => ({
  id: s.id,
  class_id: s.classId,
  name: s.name,
  seat_index: s.seatIndex,
  active: s.active,
  group_color: s.groupColor,
});
const rowToStudent = (r: StudentRow): Student => ({
  id: r.id,
  classId: r.class_id,
  name: r.name,
  seatIndex: r.seat_index,
  active: r.active,
  groupColor: r.group_color ?? null,
});
```

3. Add `seating_snapshots` to `SettingsRow` and its two use sites:

```ts
interface SettingsRow {
  school_year_start: string;
  seat_layout: SeatLayout | null;
  random_picker: RandomPickerSettings | null;
  picker_progress: Record<string, ClassPickerProgress> | null;
  seating_snapshots: Record<string, SeatingSnapshot> | null;
}
```

In `loadAll`, inside the `withSettingsDefaults(...)` call's object literal, add a line after `pickerProgress`:

```ts
                pickerProgress: (settings.data as SettingsRow).picker_progress ?? undefined,
                seatingSnapshots: (settings.data as SettingsRow).seating_snapshots ?? undefined,
```

In `saveSettings`, inside the upsert object, add a line after `picker_progress`:

```ts
          picker_progress: s.pickerProgress,
          seating_snapshots: s.seatingSnapshots,
```

In `supabase/schema.sql`:

1. In the `students` table definition, add a column after `active`:

```sql
create table if not exists students (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid(),
  class_id    uuid not null references classes(id) on delete cascade,
  name        text not null,
  seat_index  int,
  active      boolean not null default true,
  group_color text
);
```

2. In the `settings` table definition, add a column after `picker_progress`:

```sql
create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null,
  seat_layout       jsonb,
  random_picker     jsonb,
  picker_progress   jsonb,
  seating_snapshots jsonb
);
```

3. Next to the existing `alter table settings add column if not exists ...` lines, add:

```sql
alter table settings add column if not exists random_picker      jsonb;
alter table settings add column if not exists picker_progress    jsonb;
alter table settings add column if not exists seating_snapshots  jsonb;
alter table students add column if not exists group_color        text;
```

(Replace the two existing `alter table settings` lines with these four, so all "existing deployment" migrations for this feature set live together.)

- [ ] **Step 7: Verify the whole project still type-checks**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/data/store.ts src/data/store.test.ts src/data/localStore.ts src/data/supabaseStore.ts supabase/schema.sql
git commit -m "Add groupColor and seatingSnapshots to the data model"
```

---

### Task 2: Pure helper — `shuffleSeats`

**Files:**
- Create: `src/utils/seatRandomizer.ts`
- Test: `src/utils/seatRandomizer.test.ts`

**Interfaces:**
- Produces: `shuffleSeats(seated: { id: string; seatIndex: number }[]): { id: string; seatIndex: number }[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/seatRandomizer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { shuffleSeats } from "./seatRandomizer";

describe("shuffleSeats", () => {
  it("returns an empty array for no seated students", () => {
    expect(shuffleSeats([])).toEqual([]);
  });

  it("preserves the exact set of ids and the exact set of seat indices", () => {
    const input = [
      { id: "a", seatIndex: 5 },
      { id: "b", seatIndex: 1 },
      { id: "c", seatIndex: 3 },
    ];
    const result = shuffleSeats(input);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    expect(result.map((r) => r.seatIndex).sort((x, y) => x - y)).toEqual([1, 3, 5]);
  });

  it("produces the expected permutation for a mocked Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const input = [
      { id: "a", seatIndex: 10 },
      { id: "b", seatIndex: 20 },
      { id: "c", seatIndex: 30 },
    ];
    const result = shuffleSeats(input);
    // Fisher-Yates with random() always 0: i=2 swaps ids[2]<->ids[0] -> [c,b,a];
    // i=1 swaps ids[1]<->ids[0] -> [b,c,a]. Sorted indices [10,20,30] zip onto that order.
    expect(result).toEqual([
      { id: "b", seatIndex: 10 },
      { id: "c", seatIndex: 20 },
      { id: "a", seatIndex: 30 },
    ]);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- seatRandomizer.test.ts`
Expected: FAIL — cannot find module `./seatRandomizer`

- [ ] **Step 3: Write the implementation**

Create `src/utils/seatRandomizer.ts`:

```ts
export interface SeatedStudent {
  id: string;
  seatIndex: number;
}

/**
 * Shuffle which student sits where, keeping the exact same set of occupied
 * seat indices — nobody moves to a currently-empty desk, nobody's seat count
 * changes, only who sits where.
 */
export function shuffleSeats(seated: SeatedStudent[]): SeatedStudent[] {
  const indices = seated.map((s) => s.seatIndex).sort((a, b) => a - b);
  const ids = seated.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.map((id, i) => ({ id, seatIndex: indices[i] }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- seatRandomizer.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/seatRandomizer.ts src/utils/seatRandomizer.test.ts
git commit -m "Add shuffleSeats pure helper for seat randomization"
```

---

### Task 3: Pure helper — `buildGroups`

**Files:**
- Create: `src/utils/groups.ts`
- Test: `src/utils/groups.test.ts`

**Interfaces:**
- Produces: `GROUP_COLOR_PALETTE: string[]` (8 hex colors); `buildGroups(studentIds: string[], targetSize: number): string[][]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGroups } from "./groups";

describe("buildGroups", () => {
  it("returns no groups for an empty roster", () => {
    expect(buildGroups([], 4)).toEqual([]);
  });

  it("covers every id exactly once", () => {
    const ids = Array.from({ length: 18 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.flat().sort()).toEqual([...ids].sort());
  });

  it("uses ceil(n / targetSize) groups, sized within 1 of each other", () => {
    const ids = Array.from({ length: 18 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.length).toBe(5); // ceil(18/4)
    expect(groups.map((g) => g.length).sort((a, b) => a - b)).toEqual([3, 3, 4, 4, 4]);
  });

  it("splits an evenly-divisible roster into equal groups", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.length).toBe(3);
    expect(groups.every((g) => g.length === 4)).toBe(true);
  });

  it("makes a single group when the roster is smaller than targetSize", () => {
    const groups = buildGroups(["a", "b"], 4);
    expect(groups.length).toBe(1);
    expect(groups[0].sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- groups.test.ts`
Expected: FAIL — cannot find module `./groups`

- [ ] **Step 3: Write the implementation**

Create `src/utils/groups.ts`:

```ts
/** Light background colors for group color-coding, distinct from category and highlight colors. */
export const GROUP_COLOR_PALETTE = [
  "#fecaca", // red-100
  "#fed7aa", // orange-100
  "#fde68a", // amber-100
  "#bbf7d0", // green-100
  "#99f6e4", // teal-100
  "#bfdbfe", // blue-100
  "#e9d5ff", // purple-100
  "#fbcfe8", // pink-100
];

/**
 * Partition student ids into groups of roughly `targetSize`, shuffled. The
 * number of groups is ceil(n / targetSize); students are distributed across
 * that many groups round-robin, so group sizes differ by at most 1.
 */
export function buildGroups(studentIds: string[], targetSize: number): string[][] {
  if (studentIds.length === 0) return [];
  const size = Math.max(1, Math.floor(targetSize));
  const numGroups = Math.max(1, Math.ceil(studentIds.length / size));

  const shuffled = [...studentIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((id, i) => groups[i % numGroups].push(id));
  return groups;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- groups.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/groups.ts src/utils/groups.test.ts
git commit -m "Add buildGroups pure helper and group color palette"
```

---

### Task 4: Store actions — `randomizeSeats` + `revertStaleSeatingSnapshots`

**Files:**
- Modify: `src/state/useAppStore.ts`

**Interfaces:**
- Consumes: `shuffleSeats` (Task 2), `isPickableStudent` (existing, `src/utils/randomPicker.ts`), `todayDateKey` (existing, `src/utils/time.ts`), `SeatingSnapshot` type (Task 1).
- Produces: `randomizeSeats(classId: string, persistMode: "save" | "today"): void`; `revertStaleSeatingSnapshots(): void` (called once automatically from `init()`'s success path — nothing else needs to call it).

- [ ] **Step 1: Add the import**

In `src/state/useAppStore.ts`, add a new import line after the existing `import { isPickableStudent, pickStudent } from "../utils/randomPicker";`:

```ts
import { shuffleSeats } from "../utils/seatRandomizer";
```

- [ ] **Step 2: Add the two methods to the `AppState` interface**

In the `AppState` interface, after the `// Random student picker` block's two methods, add:

```ts
  // Seat randomization
  randomizeSeats: (classId: string, persistMode: "save" | "today") => void;
  revertStaleSeatingSnapshots: () => void;
```

- [ ] **Step 3: Implement the methods**

In the `create<AppState>((set, get) => ({ ... }))` object, after the `pickRandomStudent` method and before `importData`, add:

```ts
  randomizeSeats(classId, persistMode) {
    const seated = get()
      .students.filter((s) => s.classId === classId && isPickableStudent(s))
      .map((s) => ({ id: s.id, seatIndex: s.seatIndex! }));
    if (seated.length === 0) return;

    const settings = get().settings;
    const today = todayDateKey();
    let seatingSnapshots = settings.seatingSnapshots;

    if (persistMode === "save") {
      if (seatingSnapshots[classId]) {
        const next = { ...seatingSnapshots };
        delete next[classId];
        seatingSnapshots = next;
      }
    } else {
      const existing = seatingSnapshots[classId];
      if (!existing || existing.savedAt !== today) {
        const seats: Record<string, number> = {};
        for (const s of seated) seats[s.id] = s.seatIndex;
        seatingSnapshots = { ...seatingSnapshots, [classId]: { savedAt: today, seats } };
      }
    }

    const shuffled = shuffleSeats(seated);
    const seatById = new Map(shuffled.map((s) => [s.id, s.seatIndex]));
    const updatedStudents = get().students.map((s) =>
      seatById.has(s.id) ? { ...s, seatIndex: seatById.get(s.id)! } : s
    );
    const newSettings = { ...settings, seatingSnapshots };

    set({ students: updatedStudents, settings: newSettings });
    for (const s of shuffled) {
      const student = updatedStudents.find((x) => x.id === s.id);
      if (student) persist(store.upsertStudent(student));
    }
    if (newSettings.seatingSnapshots !== settings.seatingSnapshots) {
      persist(store.saveSettings(newSettings));
    }
  },

  revertStaleSeatingSnapshots() {
    const settings = get().settings;
    const today = todayDateKey();
    const staleClassIds = Object.keys(settings.seatingSnapshots).filter(
      (classId) => settings.seatingSnapshots[classId].savedAt !== today
    );
    if (staleClassIds.length === 0) return;

    const remainingSnapshots = { ...settings.seatingSnapshots };
    const changedStudents: Student[] = [];

    for (const classId of staleClassIds) {
      const snapshot = remainingSnapshots[classId];
      delete remainingSnapshots[classId];
      for (const student of get().students) {
        if (student.classId !== classId || !student.active) continue;
        const savedSeatIndex = snapshot.seats[student.id];
        if (savedSeatIndex === undefined || savedSeatIndex === student.seatIndex) continue;
        changedStudents.push({ ...student, seatIndex: savedSeatIndex });
      }
    }

    const newSettings = { ...settings, seatingSnapshots: remainingSnapshots };
    set((state) => ({
      settings: newSettings,
      students: state.students.map((x) => changedStudents.find((u) => u.id === x.id) ?? x),
    }));
    persist(store.saveSettings(newSettings));
    changedStudents.forEach((s) => persist(store.upsertStudent(s)));
  },
```

- [ ] **Step 4: Call `revertStaleSeatingSnapshots` on load**

In `loadWithRetry`, inside the `try` block, right after the existing `useAppStore.setState({...})` call (the one setting `loaded: true`), add:

```ts
    useAppStore.getState().revertStaleSeatingSnapshots();
```

So that block reads:

```ts
    useAppStore.setState({
      ...data,
      error: null,
      loaded: true,
      currentClassId: defaultActiveClassId(data.classes),
    });
    useAppStore.getState().revertStaleSeatingSnapshots();
```

- [ ] **Step 5: Verify the project type-checks and existing tests pass**

Run: `npx tsc -b && npm test`
Expected: `tsc -b` exits 0 with no output; all existing tests (33) still pass (no new tests in this task — store actions aren't unit-tested anywhere in this codebase; they're covered by the pure-helper tests plus the manual browser pass in Task 10).

- [ ] **Step 6: Commit**

```bash
git add src/state/useAppStore.ts
git commit -m "Add randomizeSeats and revertStaleSeatingSnapshots store actions"
```

---

### Task 5: Store actions — `createGroups` + `clearGroups`

**Files:**
- Modify: `src/state/useAppStore.ts`

**Interfaces:**
- Consumes: `buildGroups`, `GROUP_COLOR_PALETTE` (Task 3), `placementForLayout` (existing, `src/utils/seatLayout.ts`, already imported in this file).
- Produces: `createGroups(classId: string, groupSize: number): void`; `clearGroups(classId: string): void`

- [ ] **Step 1: Add the import**

Add a new import line in `src/state/useAppStore.ts`:

```ts
import { buildGroups, GROUP_COLOR_PALETTE } from "../utils/groups";
```

- [ ] **Step 2: Add the two methods to the `AppState` interface**

After the `// Seat randomization` block added in Task 4, add:

```ts
  createGroups: (classId: string, groupSize: number) => void;
  clearGroups: (classId: string) => void;
```

- [ ] **Step 3: Implement the methods**

In the store object, after `revertStaleSeatingSnapshots`, add:

```ts
  createGroups(classId, groupSize) {
    const seated = get()
      .students.filter((s) => s.classId === classId && isPickableStudent(s))
      .sort((a, b) => a.seatIndex! - b.seatIndex!);
    if (seated.length === 0) return;

    const groups = buildGroups(seated.map((s) => s.id), groupSize);
    const layout = get().settings.seatLayout;
    const seatOrder = placementForLayout(layout, seated.length);

    const colorByStudentId = new Map<string, string>();
    const seatByStudentId = new Map<string, number>();
    let seatCursor = 0;
    groups.forEach((group, i) => {
      const color = GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length];
      for (const studentId of group) {
        colorByStudentId.set(studentId, color);
        seatByStudentId.set(studentId, seatOrder[seatCursor]);
        seatCursor++;
      }
    });

    const updated: Student[] = [];
    const updatedStudents = get().students.map((s) => {
      if (!colorByStudentId.has(s.id)) return s;
      const next = {
        ...s,
        groupColor: colorByStudentId.get(s.id)!,
        seatIndex: seatByStudentId.get(s.id)!,
      };
      updated.push(next);
      return next;
    });

    set({ students: updatedStudents });
    updated.forEach((s) => persist(store.upsertStudent(s)));
  },

  clearGroups(classId) {
    const updated: Student[] = [];
    const updatedStudents = get().students.map((s) => {
      if (s.classId !== classId || s.groupColor === null) return s;
      const next = { ...s, groupColor: null };
      updated.push(next);
      return next;
    });
    set({ students: updatedStudents });
    updated.forEach((s) => persist(store.upsertStudent(s)));
  },
```

- [ ] **Step 4: Verify the project type-checks and existing tests pass**

Run: `npx tsc -b && npm test`
Expected: `tsc -b` exits 0 with no output; all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/useAppStore.ts
git commit -m "Add createGroups and clearGroups store actions"
```

---

### Task 6: New modal components

**Files:**
- Create: `src/components/RandomizeSeatsModal.tsx`
- Create: `src/components/CreateGroupsModal.tsx`

**Interfaces:**
- Consumes: `useAppStore` actions `randomizeSeats`, `createGroups`, `clearGroups` (Tasks 4–5); `Modal` (existing, `src/components/Modal.tsx`).
- Produces: `<RandomizeSeatsModal classId={string} onClose={() => void} />`; `<CreateGroupsModal classId={string} onClose={() => void} />` — not yet referenced anywhere (wired up in Task 7).

- [ ] **Step 1: Create `RandomizeSeatsModal.tsx`**

```tsx
import { useAppStore } from "../state/useAppStore";
import Modal from "./Modal";

export default function RandomizeSeatsModal({
  classId,
  onClose,
}: {
  classId: string;
  onClose: () => void;
}) {
  const randomizeSeats = useAppStore((s) => s.randomizeSeats);

  function handle(mode: "save" | "today") {
    randomizeSeats(classId, mode);
    onClose();
  }

  return (
    <Modal title="Randomize seats" onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Shuffle where currently-seated students sit. Choose whether this becomes the new
          main chart, or reverts back automatically tomorrow.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => handle("save")}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
          >
            Save as new main chart
          </button>
          <button
            type="button"
            onClick={() => handle("today")}
            className="rounded border px-4 py-2 text-sm"
          >
            Just for today
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Create `CreateGroupsModal.tsx`**

```tsx
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
  const students = useAppStore((s) => s.students);
  const createGroups = useAppStore((s) => s.createGroups);
  const clearGroups = useAppStore((s) => s.clearGroups);
  const [groupSize, setGroupSize] = useState(4);

  const hasGroups = students.some((s) => s.classId === classId && s.groupColor);

  function handleCreate() {
    createGroups(classId, groupSize);
    onClose();
  }

  function handleClear() {
    clearGroups(classId);
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
          {hasGroups && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded border px-3 py-2 text-sm"
            >
              Clear groups
            </button>
          )}
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
```

- [ ] **Step 3: Verify the project type-checks**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 4: Commit**

```bash
git add src/components/RandomizeSeatsModal.tsx src/components/CreateGroupsModal.tsx
git commit -m "Add RandomizeSeatsModal and CreateGroupsModal components"
```

---

### Task 7: Header + App wiring — clear highlight, edit-mode buttons, alignment fix

**Files:**
- Modify: `src/components/Header.tsx` (full-file rewrite below)
- Modify: `src/App.tsx` (full-file rewrite below)

**Interfaces:**
- Consumes: `RandomizeSeatsModal`, `CreateGroupsModal` (Task 6).
- Produces: `Header` gains props `hasPickedStudent: boolean`, `onClearPickedStudent: () => void`, `onOpenRandomizeSeats: () => void`, `onOpenCreateGroups: () => void`.

This task delivers three things from the spec at once because they all land in the same two files and are easiest to verify together in the browser: **A** (Clear link), **B** (hide Choose-random/Summary + show Randomize/Create-groups while editing, plus the header alignment fix).

- [ ] **Step 1: Replace `src/components/Header.tsx`**

```tsx
import { useAppStore } from "../state/useAppStore";
import { isPickableStudent } from "../utils/randomPicker";
import { sortByPeriod } from "../utils/classSort";

interface HeaderProps {
  editSeating: boolean;
  onToggleEditSeating: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onPickedStudent: (studentId: string) => void;
  hasPickedStudent: boolean;
  onClearPickedStudent: () => void;
  onOpenRandomizeSeats: () => void;
  onOpenCreateGroups: () => void;
}

// Every select/button in this row shares a fixed height so a browser's native
// <select> chrome (which can render taller than a same-padding <button>)
// doesn't throw off vertical alignment.
const controlClass = "flex h-9 items-center justify-center rounded px-4 text-sm font-medium";

export default function Header({
  editSeating,
  onToggleEditSeating,
  onOpenSummary,
  onOpenSettings,
  onPickedStudent,
  hasPickedStudent,
  onClearPickedStudent,
  onOpenRandomizeSeats,
  onOpenCreateGroups,
}: HeaderProps) {
  const allClasses = useAppStore((s) => s.classes);
  const classes = sortByPeriod(allClasses.filter((c) => !c.archivedAt));
  const currentClassId = useAppStore((s) => s.currentClassId);
  const setCurrentClass = useAppStore((s) => s.setCurrentClass);
  const students = useAppStore((s) => s.students);
  const pickRandomStudent = useAppStore((s) => s.pickRandomStudent);

  const hasActiveStudents = students.some(
    (s) => s.classId === currentClassId && isPickableStudent(s)
  );

  function handlePick() {
    if (!currentClassId) return;
    const studentId = pickRandomStudent(currentClassId);
    if (studentId) onPickedStudent(studentId);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-bold">ICOT</h1>

      <select
        className="flex h-9 items-center rounded border px-2 text-sm"
        value={currentClassId ?? ""}
        onChange={(e) => setCurrentClass(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {editSeating ? (
        <>
          <button
            type="button"
            onClick={onOpenRandomizeSeats}
            className={`${controlClass} bg-purple-600 text-white`}
          >
            Randomize seats…
          </button>
          <button
            type="button"
            onClick={onOpenCreateGroups}
            className={`${controlClass} bg-purple-600 text-white`}
          >
            Create groups…
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handlePick}
            disabled={!hasActiveStudents}
            className={`${controlClass} bg-purple-600 text-white disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Choose random student
          </button>
          {hasPickedStudent && (
            <button
              type="button"
              onClick={onClearPickedStudent}
              className="flex h-9 items-center text-sm text-gray-500 underline hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!editSeating && (
          <button
            type="button"
            onClick={onOpenSummary}
            className={`${controlClass} bg-indigo-500 text-white`}
          >
            Summary
          </button>
        )}
        <button
          type="button"
          onClick={onToggleEditSeating}
          className={`${controlClass} text-white ${editSeating ? "bg-green-600" : "bg-gray-600"}`}
        >
          {editSeating ? "Done moving seats" : "Edit seating"}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`${controlClass} bg-blue-500 text-white`}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "./state/useAppStore";
import { useAuth } from "./state/useAuth";
import Header from "./components/Header";
import SeatingChart from "./components/SeatingChart";
import StudentModal from "./components/StudentModal";
import SettingsModal from "./components/SettingsModal";
import SummaryModal from "./components/SummaryModal";
import RandomizeSeatsModal from "./components/RandomizeSeatsModal";
import CreateGroupsModal from "./components/CreateGroupsModal";
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
  const [randomizeOpen, setRandomizeOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null);
  const [pickNonce, setPickNonce] = useState(0);

  useEffect(() => {
    void init();
  }, [init]);

  function handlePickedStudent(studentId: string) {
    setPickedStudentId(studentId);
    setPickNonce((n) => n + 1);
  }

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
          <p className="font-medium">Couldn't load your data.</p>
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
        onPickedStudent={handlePickedStudent}
        hasPickedStudent={pickedStudentId !== null}
        onClearPickedStudent={() => setPickedStudentId(null)}
        onOpenRandomizeSeats={() => setRandomizeOpen(true)}
        onOpenCreateGroups={() => setGroupsOpen(true)}
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
        pickNonce={pickNonce}
      />

      {selectedStudentId && !editSeating && (
        <StudentModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}

      {summaryOpen && <SummaryModal onClose={() => setSummaryOpen(false)} />}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {randomizeOpen && currentClassId && (
        <RandomizeSeatsModal classId={currentClassId} onClose={() => setRandomizeOpen(false)} />
      )}

      {groupsOpen && currentClassId && (
        <CreateGroupsModal classId={currentClassId} onClose={() => setGroupsOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the project type-checks**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 4: Manual verification in the browser**

Start the dev server (localStorage mode, demo class — no real data) and check:

1. Load the app — "Choose random student" and "Summary" are visible; the class `<select>` and every button in the row have visually level top/bottom edges (no jagged misalignment).
2. Click "Choose random student" — a seat highlights, and a "Clear" text link (underlined, gray, not a filled button) appears next to the picker button.
3. Click "Clear" — the highlight and the link both disappear immediately, without picking a new student.
4. Click "Edit seating" — "Choose random student" (and its Clear link, if a highlight was showing) and "Summary" disappear; "Randomize seats…" and "Create groups…" buttons appear next to the class select; "Done moving seats" and "Settings" remain on the right.
5. Click "Done moving seats" — the header returns to its normal-mode buttons.

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.tsx src/App.tsx
git commit -m "Wire up highlight-clear link and edit-mode header restructuring"
```

---

### Task 8: Seat background color for groups

**Files:**
- Modify: `src/components/Seat.tsx:26-33`

**Interfaces:**
- Consumes: `Student.groupColor` (Task 1).

- [ ] **Step 1: Update the seat's background**

In `src/components/Seat.tsx`, replace:

```tsx
  const ringClass = isOver ? "ring-2 ring-blue-500" : highlighted ? "ring-4 ring-yellow-400" : "";
  return (
    <div
      ref={setDropRef}
      className={`relative h-20 rounded border text-center text-sm transition-colors ${
        student ? "bg-gray-300" : "bg-gray-100 border-dashed"
      } ${ringClass}`}
    >
```

with:

```tsx
  const ringClass = isOver ? "ring-2 ring-blue-500" : highlighted ? "ring-4 ring-yellow-400" : "";
  const backgroundClass = student
    ? student.groupColor
      ? ""
      : "bg-gray-300"
    : "bg-gray-100 border-dashed";
  return (
    <div
      ref={setDropRef}
      className={`relative h-20 rounded border text-center text-sm transition-colors ${backgroundClass} ${ringClass}`}
      style={student?.groupColor ? { backgroundColor: student.groupColor } : undefined}
    >
```

- [ ] **Step 2: Verify the project type-checks**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 3: Manual verification in the browser**

In edit-seating mode, click "Create groups…", enter a group size (e.g. 3), click "Create". Confirm: students are visibly clustered into adjacent desks, each cluster has a distinct pastel background color, and un-grouped/unseated desks are unaffected. Re-open "Create groups…" — a "Clear groups" button is now present; click it and confirm every desk returns to the plain gray background with seats unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/Seat.tsx
git commit -m "Render group background colors on seated desks"
```

---

### Task 9: Count-button click feedback

**Files:**
- Modify: `src/components/StudentModal.tsx`

**Interfaces:**
- No new exports; purely internal component state.

- [ ] **Step 1: Update `StudentModal.tsx`**

Replace the full file:

```tsx
import { useEffect, useRef, useState } from "react";
import type { CategoryConfig } from "../constants/categories";
import { CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import type { CategoryKey } from "../types";
import { useAppStore } from "../state/useAppStore";
import { useStudentTotals } from "../hooks/useAggregates";
import { formatDuration } from "../utils/time";
import EventHistory from "./EventHistory";
import Modal from "./Modal";
import TotalsTable from "./TotalsTable";

export default function StudentModal({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const student = useAppStore((s) => s.students.find((x) => x.id === studentId));
  const startTimer = useAppStore((s) => s.startTimer);
  const logCount = useAppStore((s) => s.logCount);
  const totals = useStudentTotals(studentId);
  const timedYear = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].year, 0);

  const [flashKey, setFlashKey] = useState<CategoryKey | null>(null);
  const [flashNonce, setFlashNonce] = useState(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  if (!student) {
    onClose();
    return null;
  }

  function handleCategory(cat: CategoryConfig) {
    if (cat.type === "timed") {
      startTimer(student!.id, cat.key);
      onClose(); // timer now ticks on the seat
    } else {
      logCount(student!.id, cat.key); // tally; keep modal open to tap again
      setFlashKey(cat.key);
      setFlashNonce((n) => n + 1);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlashKey(null), 400);
    }
  }

  return (
    <Modal title={student.name} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Log an event</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategory(cat)}
                className="relative overflow-hidden rounded px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: cat.color }}
                title={cat.type === "timed" ? "Starts a timer" : "Adds one instance"}
              >
                {cat.label}
                {cat.type === "count" ? " +1" : ""}
                {flashKey === cat.key && (
                  <span
                    key={flashNonce}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded ring-4 ring-white animate-ping"
                  />
                )}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Bathroom/Nurse/Office/Sleeping/Other start a timer · Cell Phone/Headphones add a tally
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Totals</p>
          <TotalsTable studentId={student.id} />
          {timedYear > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {student.name.split(" ")[0]} has been off-task for a total of{" "}
              <strong>{formatDuration(timedYear)}</strong> this year.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">History</p>
          <EventHistory studentId={student.id} />
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify the project type-checks**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 3: Manual verification in the browser**

Open a student, tap "Headphones +1" (or any count-type button) — confirm a brief white ring flash appears over that button and fades within well under a second. Tap it rapidly several times in a row — confirm each tap restarts a visible flash rather than the animation looking "stuck" or missing on fast repeats. Confirm a timed-category button (e.g. "Bathroom") still closes the modal immediately as before (no flash — that path is unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/components/StudentModal.tsx
git commit -m "Add click feedback flash to count-type log buttons"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npx tsc -b && npm test`
Expected: `tsc -b` exits 0 with no output; all tests pass (33 existing + 8 new from Tasks 2–3 = 41).

- [ ] **Step 2: Start the dev server and open it in the browser**

Use the `icot-dev` config from `.claude/launch.json` (port 5199, localStorage mode, fictional demo class — no real student data).

- [ ] **Step 3: Randomize seats — save**

Enter edit-seating mode, click "Randomize seats…", choose "Save as new main chart". Confirm seats visibly reshuffle among only the previously-occupied desks (no one moves to a previously-empty desk, no one disappears). Reload the page — confirm the shuffled arrangement persisted (it's the new normal, not reverted).

- [ ] **Step 4: Randomize seats — today only, and the daily revert**

Click "Randomize seats…" again, choose "Just for today". Confirm seats reshuffle again. Reload the page — confirm the arrangement is still the "today" shuffle (same-day reload does not revert). Then, in the browser devtools console, inspect `localStorage.getItem("icot:data:v1")`, find the `settings.seatingSnapshots` entry for the current class, and manually edit its `savedAt` to yesterday's date (e.g. if today is 2026-09-12, set it to `"2026-09-11"`) via `localStorage.setItem(...)` with the modified JSON. Reload the page — confirm the seating reverts to the pre-randomization arrangement captured in that snapshot, and that `settings.seatingSnapshots` no longer has an entry for that class afterward.

- [ ] **Step 5: Create groups**

Enter edit-seating mode, click "Create groups…", set group size to something that doesn't evenly divide the demo class's roster size (check `src/data/seed.ts` for the current demo roster count), click "Create". Confirm: every currently-seated student got a color; students in the same group sit in adjacent desks; group sizes differ by at most 1. Re-open "Create groups…", click "Clear groups" — confirm colors are gone and seats are unchanged from where "Create" left them.

- [ ] **Step 6: Final full-suite check**

Run: `npx tsc -b && npm test`
Expected: same as Step 1 — everything still passes after the manual devtools poking in Step 4 (a page reload after Step 4/5 re-reads from `localStorage`, so no lingering bad state should affect anything; if it does, that's a real bug to fix before calling this done).

No commit for this task — it's verification only. If any check fails, go back to the relevant task, fix it, and re-run this task's steps from the top.
