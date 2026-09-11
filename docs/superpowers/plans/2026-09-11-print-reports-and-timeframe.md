# Print Reports + Totals Timeframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) a printable per-student report (totals + itemized event log) for a chosen date range and class scope, one page per student, and (2) a Settings-level switch between "whole school year" and a custom start/end range for the standing "Year"/"Period" totals shown throughout the app.

**Architecture:** Both features build on the app's existing `DateRange` infrastructure (`src/utils/time.ts`) and a new shared pure function, `computeCategoryTotalsInRange`, that both the in-app totals hook and the print report call to total a student's events over an arbitrary range. No new dependencies: printing uses the browser's native print dialog via Tailwind's built-in `print:` variant; the timeframe switch is stored as a new `Settings.viewPeriod` field, persisted the same way `schoolYearStart`/`seatLayout` already are.

**Tech Stack:** React + TypeScript + Vite, Zustand (`useAppStore`), Tailwind CSS v3.4 (has the `print:` variant and `break-before-page`/`break-after-page` utilities built in — no plugin needed), Vitest for unit tests, Supabase (Postgres) for the cloud backend.

## Global Constraints

- No new npm dependencies — printing uses `window.print()` + Tailwind's `print:` variant; no PDF library.
- Follow existing code patterns exactly: settings fields persist via `withSettingsDefaults` (`src/data/store.ts`) + a `setX` action on `useAppStore` (`src/state/useAppStore.ts`) that does `set({ settings })` then `persist(store.saveSettings(settings))`.
- Supabase settings columns are individual typed/jsonb columns on one `settings` table row per teacher (not one blob) — every new `Settings` field needs a matching column in `supabase/schema.sql` and a mapping in `src/data/supabaseStore.ts`.
- **Schema changes are not automatic in this project.** After this plan merges, the user must manually run the new `alter table settings add column if not exists view_period jsonb;` on both the dev and prod Supabase projects (a past incident here: a missing column silently broke saves because reads use `select("*")` and don't error on an absent column). Flag this to the user at the end — do not attempt to run it yourself.
- Unit tests go in `*.test.ts` next to the module they test, using Vitest's `describe`/`it`/`expect` (see `src/utils/randomPicker.test.ts` for the house style). Run via `npm run test` (= `vitest run`).
- Typecheck via `npm run typecheck` (`tsc --noEmit`) after each task that touches types.

---

### Task 1: `ViewPeriod` settings field — types, defaults, store action, Supabase plumbing

**Files:**
- Modify: `src/types.ts` (add `ViewPeriod`, extend `Settings`)
- Modify: `src/data/store.ts:10-17` (`withSettingsDefaults`)
- Modify: `src/state/useAppStore.ts` (import type, initial state, `AppState` interface, `setViewPeriod` action)
- Modify: `src/data/supabaseStore.ts` (`SettingsRow`, `loadAll` mapping, `saveSettings`)
- Modify: `supabase/schema.sql` (new column + `alter table` for existing deployments)
- Test: `src/data/store.test.ts`

**Interfaces:**
- Produces: `export interface ViewPeriod { mode: "year" | "custom"; customStart: string; customEnd: string }` in `src/types.ts`, and `Settings.viewPeriod: ViewPeriod`.
- Produces: `useAppStore.getState().setViewPeriod(patch: Partial<ViewPeriod>): void`.
- Default value everywhere: `{ mode: "year", customStart: "", customEnd: "" }`.

- [ ] **Step 1: Write the failing tests**

In `src/data/store.test.ts`, add two more `it` blocks inside the existing `describe("withSettingsDefaults", ...)`:

```ts
  it("supplies default view period settings when none are stored", () => {
    const s = withSettingsDefaults({ schoolYearStart: "2025-08-01" });
    expect(s.viewPeriod).toEqual({ mode: "year", customStart: "", customEnd: "" });
  });
  it("preserves provided view period settings", () => {
    const s = withSettingsDefaults({
      schoolYearStart: "2025-08-01",
      viewPeriod: { mode: "custom", customStart: "2026-01-20", customEnd: "2026-06-05" },
    });
    expect(s.viewPeriod).toEqual({
      mode: "custom",
      customStart: "2026-01-20",
      customEnd: "2026-06-05",
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- store.test.ts`
Expected: FAIL — `s.viewPeriod` is `undefined`, not the expected object (property doesn't exist yet).

- [ ] **Step 3: Add the `ViewPeriod` type**

In `src/types.ts`, add after `ClassPickerProgress` (around line 76) and extend `Settings`:

```ts
export interface ViewPeriod {
  mode: "year" | "custom";
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customStart: string;
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customEnd: string;
}
```

Then update `Settings` (currently lines 78-87) to add one field:

```ts
export interface Settings {
  /** ISO date (YYYY-MM-DD) marking the start of the tracked school year. */
  schoolYearStart: string;
  /** Shared seating layout used by roster upload and the seating chart. */
  seatLayout: SeatLayout;
  /** Global "Choose random student" config. */
  randomPicker: RandomPickerSettings;
  /** Per-class cycle progress for the random picker, keyed by classId. */
  pickerProgress: Record<string, ClassPickerProgress>;
  /** Which date range the standing "Period" totals column reflects. */
  viewPeriod: ViewPeriod;
}
```

- [ ] **Step 4: Add the default in `withSettingsDefaults`**

In `src/data/store.ts`, update the function (lines 10-17):

```ts
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  return {
    schoolYearStart: s?.schoolYearStart || defaultSchoolYearStart(),
    seatLayout: s?.seatLayout ? normalizeSeatLayout(s.seatLayout) : DEFAULT_SEAT_LAYOUT,
    randomPicker: s?.randomPicker ?? { mode: "random", resetDaily: true },
    pickerProgress: s?.pickerProgress ?? {},
    viewPeriod: s?.viewPeriod ?? { mode: "year", customStart: "", customEnd: "" },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- store.test.ts`
Expected: PASS (all `withSettingsDefaults` tests, including the two new ones).

- [ ] **Step 6: Wire up `useAppStore`**

In `src/state/useAppStore.ts`:

Add `ViewPeriod` to the type import (line 2-10):

```ts
import type {
  AppData,
  AppEvent,
  CategoryKey,
  ClassRoom,
  RandomPickerSettings,
  SeatLayout,
  Student,
  ViewPeriod,
} from "../types";
```

Add to the `AppState` interface, right after `setSchoolYearStart` (line 75):

```ts
  setSchoolYearStart: (date: string) => void;
  setViewPeriod: (patch: Partial<ViewPeriod>) => void;
```

Add `viewPeriod` to the initial `settings` state literal (lines 125-130):

```ts
  settings: {
    schoolYearStart: "",
    seatLayout: DEFAULT_SEAT_LAYOUT,
    randomPicker: { mode: "random", resetDaily: true },
    pickerProgress: {},
    viewPeriod: { mode: "year", customStart: "", customEnd: "" },
  },
```

Add the action implementation right after `setSchoolYearStart` (line 415-419):

```ts
  setSchoolYearStart(date) {
    const settings = { ...get().settings, schoolYearStart: date };
    set({ settings });
    persist(store.saveSettings(settings));
  },

  setViewPeriod(patch) {
    const settings = {
      ...get().settings,
      viewPeriod: { ...get().settings.viewPeriod, ...patch },
    };
    set({ settings });
    persist(store.saveSettings(settings));
  },
```

- [ ] **Step 7: Wire up the Supabase adapter**

In `src/data/supabaseStore.ts`:

Add `ViewPeriod` to the type import (line 1-10) and a field to `SettingsRow` (lines 43-48):

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
  ViewPeriod,
} from "../types";
```

```ts
interface SettingsRow {
  school_year_start: string;
  seat_layout: SeatLayout | null;
  random_picker: RandomPickerSettings | null;
  picker_progress: Record<string, ClassPickerProgress> | null;
  view_period: ViewPeriod | null;
}
```

In `loadAll` (lines 149-158), add the mapped field:

```ts
        settings: withSettingsDefaults(
          settings.data
            ? {
                schoolYearStart: (settings.data as SettingsRow).school_year_start,
                seatLayout: (settings.data as SettingsRow).seat_layout ?? undefined,
                randomPicker: (settings.data as SettingsRow).random_picker ?? undefined,
                pickerProgress: (settings.data as SettingsRow).picker_progress ?? undefined,
                viewPeriod: (settings.data as SettingsRow).view_period ?? undefined,
              }
            : null
        ),
```

In `saveSettings` (lines 192-205), add the column to the upsert:

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
          view_period: s.viewPeriod,
        },
        { onConflict: "owner_id" }
      );
      check(error, "save settings");
    },
```

- [ ] **Step 8: Update the Supabase schema file**

In `supabase/schema.sql`, add a column to the `create table` (lines 44-50):

```sql
create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null,
  seat_layout       jsonb,
  random_picker     jsonb,
  picker_progress   jsonb,
  view_period       jsonb
);
```

And add an `alter table` line next to the existing ones (lines 52-54):

```sql
-- Existing deployments: add the columns if the table already exists without them.
alter table settings add column if not exists random_picker   jsonb;
alter table settings add column if not exists picker_progress jsonb;
alter table settings add column if not exists view_period     jsonb;
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/data/store.ts src/data/store.test.ts src/state/useAppStore.ts src/data/supabaseStore.ts supabase/schema.sql
git commit -m "Add viewPeriod settings field (whole-year vs custom timeframe)"
```

---

### Task 2: Shared date-range helpers in `src/utils/time.ts`

**Files:**
- Modify: `src/utils/time.ts`
- Test: `src/utils/time.test.ts` (new)

**Interfaces:**
- Consumes: `ViewPeriod` type from `src/types.ts` (Task 1); `DateRange`, `customRange`, `presetRange`, `formatDuration`, `elapsedSeconds` already in this file.
- Produces: `resolveViewPeriodRange(viewPeriod: ViewPeriod, schoolYearStart: string, now?: Date): DateRange`; `describeEventDuration(e: AppEvent): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeEventDuration, localDateKey, resolveViewPeriodRange } from "./time";
import type { AppEvent } from "../types";

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: "e1",
    studentId: "s1",
    classId: "c1",
    categoryKey: "bathroom",
    type: "timed",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
    durationSeconds: 300,
    open: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    ...patch,
  };
}

describe("describeEventDuration", () => {
  it("describes a count event as a single tally", () => {
    expect(
      describeEventDuration(makeEvent({ type: "count", categoryKey: "cellphone", durationSeconds: null }))
    ).toBe("1×");
  });

  it("describes a closed timed event by its stored duration", () => {
    expect(describeEventDuration(makeEvent({ durationSeconds: 95 }))).toBe("1m 35s");
  });

  it("describes an open timed event as running, using elapsed time", () => {
    const started = new Date(Date.now() - 65_000).toISOString();
    const text = describeEventDuration(
      makeEvent({ open: true, startedAt: started, durationSeconds: null, endedAt: null })
    );
    expect(text).toMatch(/\(running\)$/);
    expect(text).toMatch(/^1m/);
  });
});

describe("resolveViewPeriodRange", () => {
  it('uses the school-year start through now when mode is "year"', () => {
    const range = resolveViewPeriodRange(
      { mode: "year", customStart: "", customEnd: "" },
      "2025-08-01",
      new Date("2026-01-15T12:00:00")
    );
    expect(localDateKey(range.start)).toBe("2025-08-01");
  });

  it('uses the custom start/end when mode is "custom" and both are set', () => {
    const range = resolveViewPeriodRange(
      { mode: "custom", customStart: "2026-01-20", customEnd: "2026-06-05" },
      "2025-08-01"
    );
    expect(localDateKey(range.start)).toBe("2026-01-20");
    expect(localDateKey(range.end)).toBe("2026-06-05");
  });

  it('falls back to whole-year when mode is "custom" but a date is missing', () => {
    const range = resolveViewPeriodRange(
      { mode: "custom", customStart: "2026-01-20", customEnd: "" },
      "2025-08-01",
      new Date("2026-01-15T12:00:00")
    );
    expect(localDateKey(range.start)).toBe("2025-08-01");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- time.test.ts`
Expected: FAIL — `describeEventDuration` and `resolveViewPeriodRange` are not exported from `./time`.

- [ ] **Step 3: Implement the two functions**

In `src/utils/time.ts`, add near the top an import for the two types these functions need (the file currently has no imports):

```ts
import type { AppEvent, ViewPeriod } from "../types";
```

Add `describeEventDuration` right after `formatMinutesShort` (after line 79):

```ts
/** Human-readable value for one event: a tally count, or its duration (elapsed-so-far if still running). */
export function describeEventDuration(e: AppEvent): string {
  if (e.type === "count") return "1×";
  if (e.open) return `${formatDuration(elapsedSeconds(e.startedAt))} (running)`;
  return formatDuration(e.durationSeconds ?? 0);
}
```

Add `resolveViewPeriodRange` at the end of the file, after `fromDatetimeLocalValue`:

```ts
/**
 * The date range the standing "Period" totals column reflects: the teacher's
 * custom start/end when configured, otherwise the whole school year to date.
 */
export function resolveViewPeriodRange(
  viewPeriod: ViewPeriod,
  schoolYearStart: string,
  now: Date = new Date()
): DateRange {
  if (viewPeriod.mode === "custom" && viewPeriod.customStart && viewPeriod.customEnd) {
    return customRange(viewPeriod.customStart, viewPeriod.customEnd);
  }
  return presetRange("year", schoolYearStart, now);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- time.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/time.ts src/utils/time.test.ts
git commit -m "Add resolveViewPeriodRange + describeEventDuration to time utils"
```

---

### Task 3: Refactor totals to a shared range-based helper (`today`/`period`)

**Files:**
- Modify: `src/hooks/useAggregates.ts`
- Modify: `src/components/EventHistory.tsx` (use the new `describeEventDuration` instead of its local copy)
- Test: `src/hooks/useAggregates.test.ts` (new)

**Interfaces:**
- Consumes: `resolveViewPeriodRange`, `presetRange`, `isInRange`, `describeEventDuration` from `src/utils/time.ts` (Task 2).
- Produces: `computeCategoryTotalsInRange(events: AppEvent[], studentId: string, range: DateRange): Record<CategoryKey, number>` (used by Task 6's print builder); `CategoryTotal { today: number; period: number }` (renamed from `{ today, year }`); `usePeriodRangeLabel(): string`.
- `useStudentTotals`'s return shape changes from `{ today, year }` to `{ today, period }` per category — every consumer must be updated in the same commit (Task 4 handles `TotalsTable`/`StudentModal`; `Seat.tsx` only reads `.today` and needs no change).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAggregates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeCategoryTotalsInRange } from "./useAggregates";
import type { AppEvent } from "../types";
import type { DateRange } from "../utils/time";

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: "e1",
    studentId: "s1",
    classId: "c1",
    categoryKey: "bathroom",
    type: "timed",
    startedAt: "2026-01-10T12:00:00.000Z",
    endedAt: "2026-01-10T12:05:00.000Z",
    durationSeconds: 300,
    open: false,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:05:00.000Z",
    ...patch,
  };
}

const january: DateRange = {
  start: new Date("2026-01-01T00:00:00"),
  end: new Date("2026-01-31T23:59:59"),
  label: "January",
};

describe("computeCategoryTotalsInRange", () => {
  it("sums a timed category's durations for the given student, within range", () => {
    const events = [
      makeEvent({ id: "e1", durationSeconds: 300 }),
      makeEvent({ id: "e2", studentId: "other-student", durationSeconds: 999 }),
      makeEvent({ id: "e3", startedAt: "2025-12-01T00:00:00.000Z", durationSeconds: 999 }),
    ];
    const totals = computeCategoryTotalsInRange(events, "s1", january);
    expect(totals.bathroom).toBe(300);
  });

  it("counts count-type events as 1 each", () => {
    const events = [
      makeEvent({ id: "e1", type: "count", categoryKey: "cellphone", durationSeconds: null }),
      makeEvent({ id: "e2", type: "count", categoryKey: "cellphone", durationSeconds: null }),
    ];
    const totals = computeCategoryTotalsInRange(events, "s1", january);
    expect(totals.cellphone).toBe(2);
  });

  it("counts elapsed-so-far for a still-open timed event", () => {
    const started = new Date(Date.now() - 42_000).toISOString();
    const events = [makeEvent({ open: true, startedAt: started, durationSeconds: null, endedAt: null })];
    const openEndedRange: DateRange = { start: new Date(0), end: new Date(Date.now() + 60_000), label: "now" };
    const totals = computeCategoryTotalsInRange(events, "s1", openEndedRange);
    expect(totals.bathroom).toBeGreaterThanOrEqual(41);
    expect(totals.bathroom).toBeLessThanOrEqual(44);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- useAggregates.test.ts`
Expected: FAIL — `computeCategoryTotalsInRange` is not exported from `./useAggregates`.

- [ ] **Step 3: Rewrite `src/hooks/useAggregates.ts`**

Replace the entire file with:

```ts
import { useMemo } from "react";
import type { AppEvent, CategoryKey } from "../types";
import { CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import type { DateRange } from "../utils/time";
import { elapsedSeconds, isInRange, presetRange, resolveViewPeriodRange } from "../utils/time";

/** For timed categories these are seconds; for count categories, instance counts. */
export interface CategoryTotal {
  today: number;
  period: number;
}

export type StudentTotals = Record<CategoryKey, CategoryTotal>;

function emptyTotals(): StudentTotals {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c.key, { today: 0, period: 0 }])
  ) as StudentTotals;
}

/** Value a single event contributes: elapsed seconds (timed) or 1 (count). */
function eventValue(e: AppEvent): number {
  if (e.type === "count") return 1;
  if (e.durationSeconds != null) return e.durationSeconds;
  return e.open ? elapsedSeconds(e.startedAt) : 0;
}

/**
 * Per-category totals for one student within an arbitrary date range. Shared
 * by the standing "period" column (`useStudentTotals` below) and printed
 * reports (`src/utils/printReport.ts`), which total over a teacher-chosen
 * range instead.
 */
export function computeCategoryTotalsInRange(
  events: AppEvent[],
  studentId: string,
  range: DateRange
): Record<CategoryKey, number> {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<CategoryKey, number>;
  for (const e of events) {
    if (e.studentId !== studentId) continue;
    if (!isInRange(e.startedAt, range)) continue;
    totals[e.categoryKey] += eventValue(e);
  }
  return totals;
}

/**
 * Per-category Today and Period totals for one student. Period is either the
 * whole school year or a teacher-configured custom range
 * (`settings.viewPeriod`); running timers contribute their elapsed-so-far.
 */
export function useStudentTotals(studentId: string | null): StudentTotals {
  const events = useAppStore((s) => s.events);
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);

  return useMemo(() => {
    const totals = emptyTotals();
    if (!studentId) return totals;

    const todayRange = presetRange("today", schoolYearStart);
    const periodRange = resolveViewPeriodRange(viewPeriod, schoolYearStart);
    const today = computeCategoryTotalsInRange(events, studentId, todayRange);
    const period = computeCategoryTotalsInRange(events, studentId, periodRange);

    for (const c of CATEGORIES) {
      totals[c.key] = { today: today[c.key], period: period[c.key] };
    }
    return totals;
  }, [events, schoolYearStart, viewPeriod, studentId]);
}

/** Display label for the active period range (e.g. "This school year", or a custom range's label). */
export function usePeriodRangeLabel(): string {
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);
  return useMemo(
    () => resolveViewPeriodRange(viewPeriod, schoolYearStart).label,
    [viewPeriod, schoolYearStart]
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- useAggregates.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove the now-dead `isToday`/`isInSchoolYear` from `src/utils/time.ts`**

These were only ever called from the old `useAggregates.ts`, which no longer exists after Step 3. Delete these two functions (originally lines 37-45):

```ts
/** Whether an ISO timestamp falls on today's local calendar day. */
export function isToday(iso: string): boolean {
  return localDateKey(new Date(iso)) === todayDateKey();
}

/** Whether an ISO timestamp is on/after the school-year start (local midnight). */
export function isInSchoolYear(iso: string, schoolYearStart: string): boolean {
  return new Date(iso).getTime() >= parseDateOnlyLocal(schoolYearStart).getTime();
}
```

Confirm nothing else references them:

Run: `grep -rn "isToday\|isInSchoolYear" src`
Expected: no output.

- [ ] **Step 6: Update `EventHistory.tsx` to use the shared `describeEventDuration`**

In `src/components/EventHistory.tsx`, change the import (line 5, currently `import { elapsedSeconds, formatDuration } from "../utils/time";`) to:

```ts
import { describeEventDuration } from "../utils/time";
```

Delete the local `describe` function (lines 9-13):

```ts
function describe(e: AppEvent): string {
  if (e.type === "count") return "1×";
  if (e.open) return `${formatDuration(elapsedSeconds(e.startedAt))} (running)`;
  return formatDuration(e.durationSeconds ?? 0);
}
```

And update its one call site (line 85, inside the row rendering) from `{describe(e)}` to `{describeEventDuration(e)}`.

- [ ] **Step 7: Typecheck (this will show the now-broken `.year` references — expected, fixed in Task 4)**

Run: `npm run typecheck`
Expected: errors in `src/components/TotalsTable.tsx` and `src/components/StudentModal.tsx` (`Property 'year' does not exist on type 'CategoryTotal'`). This is expected — Task 4 fixes both files next. Do not fix them here.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useAggregates.ts src/hooks/useAggregates.test.ts src/utils/time.ts src/components/EventHistory.tsx
git commit -m "Refactor totals to a shared range-based helper (today/period)"
```

---

### Task 4: Update `TotalsTable` and `StudentModal` for the renamed `period` field

**Files:**
- Modify: `src/components/TotalsTable.tsx`
- Modify: `src/components/StudentModal.tsx`

**Interfaces:**
- Consumes: `useStudentTotals` (now returns `{ today, period }`) and `usePeriodRangeLabel()` from `src/hooks/useAggregates.ts` (Task 3).

- [ ] **Step 1: Rewrite `src/components/TotalsTable.tsx`**

Replace the entire file with:

```tsx
import { COUNT_CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import type { CategoryConfig } from "../constants/categories";
import { usePeriodRangeLabel, useStudentTotals } from "../hooks/useAggregates";
import { formatDuration } from "../utils/time";

/** Format a total: duration for timed categories, count for count categories. */
function formatTotal(value: number, type: "timed" | "count"): string {
  if (type === "count") return value === 0 ? "—" : `${value}×`;
  return value === 0 ? "—" : formatDuration(value);
}

export default function TotalsTable({ studentId }: { studentId: string }) {
  const totals = useStudentTotals(studentId);
  const periodLabel = usePeriodRangeLabel();

  const timedToday = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].today, 0);
  const timedPeriod = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].period, 0);

  const renderRow = (cat: CategoryConfig) => {
    const t = totals[cat.key];
    return (
      <tr key={cat.key} className="border-t">
        <td className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.label}
            {cat.type === "count" && <span className="text-xs text-gray-400">(count)</span>}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatTotal(t.today, cat.type)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{formatTotal(t.period, cat.type)}</td>
      </tr>
    );
  };

  return (
    <div className="overflow-hidden rounded border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 text-right font-semibold">Today</th>
            <th className="px-3 py-2 text-right font-semibold">{periodLabel}</th>
          </tr>
        </thead>
        <tbody>
          {TIMED_CATEGORIES.map(renderRow)}

          {/* Total off-task time = sum of the timed categories. */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td className="px-3 py-1.5">Total off-task</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {timedToday === 0 ? "—" : formatDuration(timedToday)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {timedPeriod === 0 ? "—" : formatDuration(timedPeriod)}
            </td>
          </tr>

          {COUNT_CATEGORIES.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/components/StudentModal.tsx`**

Change the import (line 4) from:

```ts
import { useStudentTotals } from "../hooks/useAggregates";
```

to:

```ts
import { usePeriodRangeLabel, useStudentTotals } from "../hooks/useAggregates";
```

Change lines 20-21 from:

```ts
  const totals = useStudentTotals(studentId);
  const timedYear = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].year, 0);
```

to:

```ts
  const totals = useStudentTotals(studentId);
  const periodLabel = usePeriodRangeLabel();
  const timedPeriod = TIMED_CATEGORIES.reduce((sum, c) => sum + totals[c.key].period, 0);
```

Change the summary sentence (lines 65-70) from:

```tsx
          {timedYear > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {student.name.split(" ")[0]} has been off-task for a total of{" "}
              <strong>{formatDuration(timedYear)}</strong> this year.
            </p>
          )}
```

to:

```tsx
          {timedPeriod > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {student.name.split(" ")[0]} has been off-task for a total of{" "}
              <strong>{formatDuration(timedPeriod)}</strong> during{" "}
              {periodLabel.charAt(0).toLowerCase() + periodLabel.slice(1)}.
            </p>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the two errors from Task 3 Step 7 are now gone).

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/TotalsTable.tsx src/components/StudentModal.tsx
git commit -m "Show the active period's label/values in TotalsTable and StudentModal"
```

---

### Task 5: Settings UI for the timeframe switch

**Files:**
- Modify: `src/components/SettingsModal.tsx`

**Interfaces:**
- Consumes: `settings.viewPeriod` and `setViewPeriod` from `useAppStore` (Task 1).

- [ ] **Step 1: Add the store bindings**

In `src/components/SettingsModal.tsx`, add after the existing `schoolYearStart` bindings (lines 19-20):

```ts
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const setSchoolYearStart = useAppStore((s) => s.setSchoolYearStart);
  const viewPeriod = useAppStore((s) => s.settings.viewPeriod);
  const setViewPeriod = useAppStore((s) => s.setViewPeriod);
```

- [ ] **Step 2: Add the "Totals timeframe" section**

Insert a new `<section>` right after the existing "School year" section (after line 94, before the "Random picker" section):

```tsx
        {/* Totals timeframe */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Totals timeframe</h3>
          <p className="mb-2 text-xs text-gray-500">
            Controls the second Totals column shown for each student. Switch to a custom
            range — e.g. the first day of semester 2 — to count only events from then on,
            without losing earlier history.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="view-period-mode"
                checked={viewPeriod.mode === "year"}
                onChange={() => setViewPeriod({ mode: "year" })}
              />
              Whole year
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="view-period-mode"
                checked={viewPeriod.mode === "custom"}
                onChange={() => setViewPeriod({ mode: "custom" })}
              />
              Custom range
            </label>
          </div>
          {viewPeriod.mode === "custom" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <input
                type="date"
                className="rounded border p-1"
                value={viewPeriod.customStart}
                max={viewPeriod.customEnd || undefined}
                onChange={(e) => setViewPeriod({ customStart: e.target.value })}
              />
              <span>to</span>
              <input
                type="date"
                className="rounded border p-1"
                value={viewPeriod.customEnd}
                min={viewPeriod.customStart || undefined}
                onChange={(e) => setViewPeriod({ customEnd: e.target.value })}
              />
            </div>
          )}
        </section>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification in the browser preview**

Start the dev server (`npm run dev`), open Settings, confirm:
- "Whole year" is selected by default and no date inputs show.
- Selecting "Custom range" reveals two date inputs.
- Setting a start/end date, closing Settings, and reopening a student modal shows the `TotalsTable`'s second column header change from "This school year" to the custom range's label (e.g. "Jan 20, 2026 – Jun 5, 2026"), with values recomputed for that range.
- Reloading the page preserves the choice (persisted to `localStorage`/Supabase).

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "Add Totals timeframe setting (whole year vs custom range)"
```

---

### Task 6: Pure print-report data builder

**Files:**
- Create: `src/utils/printReport.ts`
- Test: `src/utils/printReport.test.ts`

**Interfaces:**
- Consumes: `computeCategoryTotalsInRange` from `src/hooks/useAggregates.ts` (Task 3); `describeEventDuration`, `isInRange`, `DateRange` from `src/utils/time.ts`; `sortByPeriod` from `src/utils/classSort.ts`.
- Produces:
  - `export interface PrintEventRow { categoryKey: CategoryKey; startedAt: string; text: string }`
  - `export interface PrintStudentReport { student: Student; classRoom: ClassRoom; totals: Record<CategoryKey, number>; events: PrintEventRow[] }`
  - `export interface PrintRequest { scope: "class" | "all"; classId: string | null; range: DateRange }`
  - `export function buildPrintReports(classes: ClassRoom[], students: Student[], events: AppEvent[], range: DateRange): PrintStudentReport[]` — internally excludes archived classes and inactive students, and orders classes by period (`sortByPeriod`) and students by seat index (unseated last, then name).

- [ ] **Step 1: Write the failing tests**

Create `src/utils/printReport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPrintReports } from "./printReport";
import type { AppEvent, ClassRoom, Student } from "../types";
import type { DateRange } from "./time";

const range: DateRange = {
  start: new Date("2026-01-01T00:00:00"),
  end: new Date("2026-01-31T23:59:59"),
  label: "January",
};

const classA: ClassRoom = { id: "c1", name: "Period 1", seatRows: 6, seatCols: 6, archivedAt: null };
const archivedClass: ClassRoom = {
  id: "c2",
  name: "Period 2",
  seatRows: 6,
  seatCols: 6,
  archivedAt: "2025-06-01T00:00:00.000Z",
};

const alice: Student = { id: "s1", classId: "c1", name: "Alice", seatIndex: 1, active: true };
const bob: Student = { id: "s2", classId: "c1", name: "Bob", seatIndex: 0, active: true };
const inactive: Student = { id: "s3", classId: "c1", name: "Zoe", seatIndex: 2, active: false };

function makeEvent(patch: Partial<AppEvent>): AppEvent {
  return {
    id: patch.id ?? "e1",
    studentId: "s1",
    classId: "c1",
    categoryKey: "bathroom",
    type: "timed",
    startedAt: "2026-01-10T12:00:00.000Z",
    endedAt: "2026-01-10T12:05:00.000Z",
    durationSeconds: 300,
    open: false,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:05:00.000Z",
    ...patch,
  };
}

describe("buildPrintReports", () => {
  it("includes only active students, ordered by seat index", () => {
    const reports = buildPrintReports([classA], [alice, bob, inactive], [], range);
    expect(reports.map((r) => r.student.id)).toEqual(["s2", "s1"]);
  });

  it("gives a student with no events in range a zeroed report", () => {
    const [report] = buildPrintReports([classA], [alice], [], range);
    expect(report.totals.bathroom).toBe(0);
    expect(report.events).toEqual([]);
  });

  it("includes only events within range, sorted chronologically", () => {
    const events = [
      makeEvent({ id: "e2", startedAt: "2026-01-20T00:00:00.000Z" }),
      makeEvent({ id: "e1", startedAt: "2026-01-05T00:00:00.000Z" }),
      makeEvent({ id: "e3", startedAt: "2025-12-01T00:00:00.000Z" }), // outside range
    ];
    const [report] = buildPrintReports([classA], [alice], events, range);
    expect(report.events.map((e) => e.startedAt)).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-20T00:00:00.000Z",
    ]);
    expect(report.totals.bathroom).toBe(600);
  });

  it("excludes archived classes and orders active classes by period", () => {
    const period3: ClassRoom = { id: "c3", name: "Period 3", seatRows: 6, seatCols: 6, archivedAt: null };
    const carl: Student = { id: "s4", classId: "c3", name: "Carl", seatIndex: 0, active: true };
    const reports = buildPrintReports([period3, classA, archivedClass], [alice, bob, carl], [], range);
    expect(reports.map((r) => r.classRoom.id)).toEqual(["c1", "c1", "c3"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- printReport.test.ts`
Expected: FAIL — cannot find module `./printReport`.

- [ ] **Step 3: Implement `src/utils/printReport.ts`**

```ts
import type { AppEvent, CategoryKey, ClassRoom, Student } from "../types";
import { computeCategoryTotalsInRange } from "../hooks/useAggregates";
import { sortByPeriod } from "./classSort";
import { describeEventDuration, isInRange } from "./time";
import type { DateRange } from "./time";

export interface PrintEventRow {
  categoryKey: CategoryKey;
  startedAt: string;
  text: string;
}

export interface PrintStudentReport {
  student: Student;
  classRoom: ClassRoom;
  totals: Record<CategoryKey, number>;
  events: PrintEventRow[];
}

export interface PrintRequest {
  scope: "class" | "all";
  /** Required when scope === "class"; ignored for "all". */
  classId: string | null;
  range: DateRange;
}

/** Active students in a class, seated first (by seat index), then unseated, alphabetically. */
function orderedActiveStudents(students: Student[], classId: string): Student[] {
  return students
    .filter((s) => s.classId === classId && s.active)
    .sort((a, b) => {
      if (a.seatIndex == null && b.seatIndex == null) return a.name.localeCompare(b.name);
      if (a.seatIndex == null) return 1;
      if (b.seatIndex == null) return -1;
      return a.seatIndex - b.seatIndex;
    });
}

/**
 * Builds one printable report per active student across the given classes,
 * for the given range. Archived classes are always excluded; classes are
 * ordered by period, students within a class by seat order.
 */
export function buildPrintReports(
  classes: ClassRoom[],
  students: Student[],
  events: AppEvent[],
  range: DateRange
): PrintStudentReport[] {
  const orderedClasses = sortByPeriod(classes.filter((c) => !c.archivedAt));
  const reports: PrintStudentReport[] = [];

  for (const classRoom of orderedClasses) {
    for (const student of orderedActiveStudents(students, classRoom.id)) {
      const totals = computeCategoryTotalsInRange(events, student.id, range);
      const studentEvents = events
        .filter((e) => e.studentId === student.id && isInRange(e.startedAt, range))
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        .map((e) => ({
          categoryKey: e.categoryKey,
          startedAt: e.startedAt,
          text: describeEventDuration(e),
        }));

      reports.push({ student, classRoom, totals, events: studentEvents });
    }
  }

  return reports;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- printReport.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/printReport.ts src/utils/printReport.test.ts
git commit -m "Add pure builder for per-student print reports"
```

---

### Task 7: `PrintReport` component

**Files:**
- Create: `src/components/PrintReport.tsx`

**Interfaces:**
- Consumes: `buildPrintReports`, `PrintRequest`, `PrintStudentReport` from `src/utils/printReport.ts` (Task 6); `classes`/`students`/`events` from `useAppStore`.
- Produces: `export default function PrintReport({ request, onDone }: { request: PrintRequest; onDone: () => void }): JSX.Element` — renders hidden-except-print (`hidden print:block`), one `<section>` per student with a forced page break before every student after the first, and calls `window.print()` once on mount, invoking `onDone` when the browser's print dialog closes (`afterprint`).

- [ ] **Step 1: Create `src/components/PrintReport.tsx`**

```tsx
import { useEffect } from "react";
import { CATEGORY_BY_KEY, COUNT_CATEGORIES, TIMED_CATEGORIES } from "../constants/categories";
import { useAppStore } from "../state/useAppStore";
import { formatDuration } from "../utils/time";
import { buildPrintReports } from "../utils/printReport";
import type { PrintRequest } from "../utils/printReport";

function formatCategoryTotal(value: number, type: "timed" | "count"): string {
  if (type === "count") return value === 0 ? "—" : `${value}×`;
  return value === 0 ? "—" : formatDuration(value);
}

export default function PrintReport({
  request,
  onDone,
}: {
  request: PrintRequest;
  onDone: () => void;
}) {
  const classes = useAppStore((s) => s.classes);
  const students = useAppStore((s) => s.students);
  const events = useAppStore((s) => s.events);

  const scopedClasses =
    request.scope === "all" ? classes : classes.filter((c) => c.id === request.classId);
  const reports = buildPrintReports(scopedClasses, students, events, request.range);

  useEffect(() => {
    window.print();
    window.addEventListener("afterprint", onDone);
    return () => window.removeEventListener("afterprint", onDone);
  }, [onDone]);

  return (
    <div className="hidden print:block">
      {reports.map((r, i) => {
        const timedTotal = TIMED_CATEGORIES.reduce((sum, c) => sum + r.totals[c.key], 0);
        return (
          <section key={r.student.id} className={`p-6 ${i > 0 ? "break-before-page" : ""}`}>
            <h1 className="text-xl font-bold">{r.student.name}</h1>
            <p className="mb-4 text-sm text-gray-600">
              {r.classRoom.name} · {request.range.label}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-2 py-1 font-semibold">Category</th>
                  <th className="px-2 py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {TIMED_CATEGORIES.map((cat) => (
                  <tr key={cat.key} className="border-t">
                    <td className="px-2 py-1">{cat.label}</td>
                    <td className="px-2 py-1 text-right">
                      {formatCategoryTotal(r.totals[cat.key], cat.type)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="px-2 py-1">Total off-task</td>
                  <td className="px-2 py-1 text-right">
                    {timedTotal === 0 ? "—" : formatDuration(timedTotal)}
                  </td>
                </tr>
                {COUNT_CATEGORIES.map((cat) => (
                  <tr key={cat.key} className="border-t">
                    <td className="px-2 py-1">{cat.label}</td>
                    <td className="px-2 py-1 text-right">
                      {formatCategoryTotal(r.totals[cat.key], cat.type)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="mb-1 mt-4 text-sm font-semibold">Activity log</h2>
            {r.events.length === 0 ? (
              <p className="text-sm text-gray-500">No activity recorded for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {r.events.map((e, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">{CATEGORY_BY_KEY[e.categoryKey].label}</td>
                      <td className="px-2 py-1">{e.text}</td>
                      <td className="px-2 py-1 text-right text-xs text-gray-500">
                        {new Date(e.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This component isn't reachable from the UI yet — that's Task 8 — so there's nothing to manually verify in the browser until then.)

- [ ] **Step 3: Commit**

```bash
git add src/components/PrintReport.tsx
git commit -m "Add PrintReport component (print-only, one page per student)"
```

---

### Task 8: Wire up Print into `SummaryModal` and `App.tsx`

**Files:**
- Modify: `src/components/SummaryModal.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PrintReport` (Task 7), `PrintRequest` (Task 6).
- `SummaryModal` gains a required prop `onPrint: (request: PrintRequest) => void`.

- [ ] **Step 1: Update `src/components/SummaryModal.tsx`**

Add an import for `PrintRequest` (near the top, with the other type imports):

```ts
import type { PrintRequest } from "../utils/printReport";
```

Change the component signature (line 16) from:

```ts
export default function SummaryModal({ onClose }: { onClose: () => void }) {
```

to:

```ts
export default function SummaryModal({
  onClose,
  onPrint,
}: {
  onClose: () => void;
  onPrint: (request: PrintRequest) => void;
}) {
```

Add a `printScope` state next to the existing `range` state (line 23):

```ts
  const [range, setRange] = useState<DateRange>(() => presetRange("today", schoolYearStart));
  const [printScope, setPrintScope] = useState<"class" | "all">("class");
```

Add a handler right before the `return` (after the `lines` `useMemo`, before line 66):

```ts
  function handlePrint() {
    onPrint({ scope: printScope, classId: currentClassId, range });
    onClose();
  }
```

Insert the scope selector + Print button right after `<DateRangePicker value={range} onChange={setRange} />` (line 73), before the activity-count `<p>`:

```tsx
        <DateRangePicker value={range} onChange={setRange} />

        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>Print:</span>
          <select
            className="rounded border p-1"
            value={printScope}
            onChange={(e) => setPrintScope(e.target.value as "class" | "all")}
          >
            <option value="class">This class</option>
            <option value="all">All classes</option>
          </select>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printScope === "class" && !currentClassId}
            className="rounded bg-gray-700 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print…
          </button>
        </div>

        <p className="text-xs text-gray-500">
```

(The `<p className="text-xs text-gray-500">` line already exists — just insert the new `<div>` block directly above it, don't duplicate it.)

- [ ] **Step 2: Update `src/App.tsx`**

Change the imports (lines 1-9) to add `useCallback`, `PrintReport`, and the `PrintRequest` type:

```tsx
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "./state/useAppStore";
import { useAuth } from "./state/useAuth";
import Header from "./components/Header";
import SeatingChart from "./components/SeatingChart";
import StudentModal from "./components/StudentModal";
import SettingsModal from "./components/SettingsModal";
import SummaryModal from "./components/SummaryModal";
import PrintReport from "./components/PrintReport";
import LoginScreen from "./components/LoginScreen";
import type { PrintRequest } from "./utils/printReport";
```

Add `printRequest` state and a stable `onDone` callback, alongside the other `MainApp` state (lines 30-34):

```ts
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSeating, setEditSeating] = useState(false);
  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null);
  const [pickNonce, setPickNonce] = useState(0);
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
  const handlePrintDone = useCallback(() => setPrintRequest(null), []);
```

Change the final `return` (lines 73-113) from a single wrapping `<div>` to a fragment with `print:hidden` added to that div, plus `PrintReport` as a sibling:

```tsx
  return (
    <>
      <div className="mx-auto max-w-5xl p-4 print:hidden">
        <Header
          editSeating={editSeating}
          onToggleEditSeating={() => setEditSeating((v) => !v)}
          onOpenSummary={() => setSummaryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onPickedStudent={handlePickedStudent}
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

        {summaryOpen && (
          <SummaryModal onClose={() => setSummaryOpen(false)} onPrint={setPrintRequest} />
        )}

        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>

      {printRequest && <PrintReport request={printRequest} onDone={handlePrintDone} />}
    </>
  );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Manual verification in the browser preview**

Start the dev server, open a class with a couple of students who have some logged events, open **Summary**, pick a custom date range covering their activity, choose "This class", click **Print…**. Confirm:
- The browser's print dialog opens (use its print-to-PDF preview to inspect without a physical printer).
- Each active student appears on their own page, in seat order, with a totals table and an activity log matching the chosen range.
- A student with no events in range still gets a page saying "No activity recorded for this period."
- Canceling the print dialog returns to the normal app view (no leftover blank overlay).
- Switching scope to "All classes" and printing again produces pages for every active class, grouped and ordered by period.

- [ ] **Step 6: Commit**

```bash
git add src/components/SummaryModal.tsx src/App.tsx
git commit -m "Wire up Print (scope + button) from Summary through to PrintReport"
```

---

### Task 9: Docs + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Features list**

In `README.md`, replace the existing "Totals" bullet (around line 42-44):

```markdown
- **Totals**: each student modal shows a Today / Year total per category, a
  **Total off-task** row summing the timed categories, and a plain-English summary
  ("… off-task for a total of 15m this year").
```

with:

```markdown
- **Totals**: each student modal shows a Today / Period total per category, a
  **Total off-task** row summing the timed categories, and a plain-English summary
  ("… off-task for a total of 15m during this school year"). What "Period" means
  is controlled by **Totals timeframe** below.
```

Add two new bullets right after the existing "School-year boundary" bullet (around line 58-59):

```markdown
- **Totals timeframe**: Settings → Totals timeframe switches the Period column
  between "Whole year" and a custom start/end range (e.g. the first day of
  semester 2), so counts can restart for a new term without losing earlier
  history.
- **Print reports**: from the Summary modal, pick a date range and "This class"
  or "All classes", then **Print…** for one page per active student with their
  totals and itemized activity log for that range — handy for end-of-term
  handouts.
```

- [ ] **Step 2: Full verification pass**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS — every test file (`store.test.ts`, `time.test.ts`, `useAggregates.test.ts`, `printReport.test.ts`, plus the pre-existing `classSort.test.ts`, `randomPicker.test.ts`, `seatLayout.test.ts`).

Run: `npm run build`
Expected: builds cleanly (this also re-typechecks via `tsc -b`).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Totals timeframe and Print reports in README"
```

- [ ] **Step 4: Tell the user about the manual Supabase migration**

This plan added a `view_period` column (Task 1). Remind the user, once this branch is merged and deployed: run

```sql
alter table settings add column if not exists view_period jsonb;
```

on both the dev (`kqiijbfwblkwlyxmkqwa`) and prod (`xgbbcnlyhmajibvdvcpn`) Supabase projects — schema changes here are not automatic, and a missing column has silently broken saves before.

---

## Self-review notes

- **Spec coverage:** Print scope (class/all), zero-activity pages, seat/period ordering, totals + itemized log, print-only rendering via Tailwind's `print:` variant → Tasks 6-8. Timeframe mode + custom start/end, persisted, Settings-only UI, dynamic column label/sentence → Tasks 1, 3, 4, 5. Supabase migration note → Tasks 1 and 9. All spec sections have a task.
- **Type consistency checked:** `CategoryTotal.period` (Task 3) is consumed identically in Task 4 (`TotalsTable`, `StudentModal`); `computeCategoryTotalsInRange`'s signature (Task 3) matches its call sites in Task 3's own `useStudentTotals` and Task 6's `buildPrintReports`; `PrintRequest`/`PrintStudentReport`/`PrintEventRow` (Task 6) match their use in Task 7 (`PrintReport`) and Task 8 (`SummaryModal`, `App.tsx`) exactly.
- **No placeholders:** every step has complete code, not descriptions of code.
