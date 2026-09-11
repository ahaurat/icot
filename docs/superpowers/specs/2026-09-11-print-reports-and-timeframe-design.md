# Printable Student Reports + Totals Timeframe — Design Spec

## Purpose

Two independent features requested together:

1. **Print reports**: let the teacher hand each student a printed copy of their own ICOT data for a date range (e.g. end of quarter), one page per student.
2. **Totals timeframe**: let the teacher switch the standing "Year" totals shown in the app between "whole school year" and a specific bounded window (e.g. semester 2), so counts effectively "restart" for a new term without losing history.

They share underlying date-range infrastructure (`src/utils/time.ts`'s `DateRange`/`customRange`/`isInRange`) but are otherwise unrelated and can ship independently.

---

## Feature A — Printable per-student reports

### Entry point

Extend [SummaryModal.tsx](../../../src/components/SummaryModal.tsx), which already has a per-class date-range picker (`DateRangePicker`) and computes range-scoped activity. Add:

- A scope control: **"This class" / "All classes"** (local state, defaults to "This class").
- A **Print** button, using whatever range/scope is currently selected in the modal.

No new modal, no new date-range UI — reuses what's already there.

### Data to print, per student

- Header: student name, class name (or, in "All classes" mode, printed once per class group), and the range label (e.g. "Jan 20 – Mar 15, 2026", from `DateRange.label`).
- **Totals table**: same category rows as [TotalsTable.tsx](../../../src/components/TotalsTable.tsx) (timed categories, "Total off-task", count categories), but computed for the selected range instead of "today/year".
- **Itemized event log**: chronological list of this student's events within the range — date, time, category, and duration/count — same row shape as [EventHistory.tsx](../../../src/components/EventHistory.tsx) but flattened for print (no interactive filter chips, no Edit buttons).
- A student with **zero events in range still gets a page** ("No activity recorded for this period.") rather than being skipped, so the printed set always matches the roster.

### Which students, in what order

- Only **active** students (`student.active`), matching how the rest of the app treats soft-deleted students.
- "This class": students in `currentClassId`, ordered by `seatIndex` (nulls last), then name — matches seating-chart order.
- "All classes": non-archived classes via `sortByPeriod`, then students within each class as above. One page per student regardless of scope; "All classes" just means more pages, grouped by class.

### New pure helper: range-scoped totals

Add a function (alongside `useStudentTotals` in [useAggregates.ts](../../../src/hooks/useAggregates.ts), or a small sibling module) that computes a `StudentTotals`-shaped result for an arbitrary `DateRange` instead of "today"/"school year", e.g.:

```ts
function computeRangeTotals(events: AppEvent[], studentId: string, range: DateRange): Record<CategoryKey, number>
```

This reuses the existing `eventValue()` logic (seconds for timed, 1 for count) and `isInRange()`. Both the print report and (per Feature B below) the in-app "period" total end up calling into the same range-totaling logic — no duplicated aggregation math.

### Rendering + printing mechanism

- A new component `PrintReport.tsx` takes the resolved list of `{ student, classRoom }` entries plus the range, and renders one `<section>` per student with `break-after-page` (CSS) so each lands on its own sheet.
- It's mounted in `App.tsx` (`MainApp`), not inside the modal tree, so it isn't affected by the modal's own overlay/z-index and prints cleanly: `{printRequest && <PrintReport request={printRequest} onDone={() => setPrintRequest(null)} />}`.
- Visibility uses Tailwind's built-in `print` variant (v3.4, already in use — no new dependency): the report root is `hidden print:block`; the rest of the app's top-level wrapper gets `print:hidden`. On screen you never see the report; when printing, only the report shows.
- Clicking Print in `SummaryModal` calls a prop (`onPrint(request)`) that sets `printRequest` in `App.tsx` and closes the Summary modal. `PrintReport` calls `window.print()` in a `useEffect` on mount, and clears itself via the `afterprint` event.

### Testing

- Unit test the new range-totaling helper (given events + a range, returns expected per-category numbers), following the existing Vitest pattern (`store.test.ts`, `seatLayout.test.ts`).
- Manual verification: use the browser preview's print-to-PDF to confirm page breaks land one-per-student, zero-activity students still get a page, and "All classes" groups/orders correctly.

---

## Feature B — Whole-year vs. custom timeframe totals

### Data model

Extend `Settings` (in [types.ts](../../../src/types.ts)):

```ts
export interface ViewPeriod {
  mode: "year" | "custom";
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customStart: string;
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customEnd: string;
}

export interface Settings {
  schoolYearStart: string;
  seatLayout: SeatLayout;
  randomPicker: RandomPickerSettings;
  pickerProgress: Record<string, ClassPickerProgress>;
  viewPeriod: ViewPeriod; // new
}
```

- Default: `{ mode: "year", customStart: "", customEnd: "" }` — identical behavior to today until the teacher opts in.
- Both `customStart`/`customEnd` persist independently of `mode`, so toggling back to "Whole year" to check the cumulative total and then back to "Custom" doesn't lose the semester dates already entered.
- `withSettingsDefaults` in [store.ts](../../../src/data/store.ts) gets a default for `viewPeriod`, same pattern as `randomPicker`/`pickerProgress`.
- Supabase: add a `view_period jsonb` column to the `settings` table (same pattern as `random_picker`/`picker_progress`), mapped in [supabaseStore.ts](../../../src/data/supabaseStore.ts). **Requires a manual `ALTER TABLE ... ADD COLUMN IF NOT EXISTS view_period jsonb` on both the dev and prod Supabase projects after merge** — schema changes here are not automatic (per prior incident where a missing column silently broke saves).

### Computing the "period" total

In `useStudentTotals` ([useAggregates.ts](../../../src/hooks/useAggregates.ts)):

- Resolve the active range from `settings.viewPeriod`:
  - `mode === "year"`, or `mode === "custom"` with either date empty (not yet configured): range = `[schoolYearStart, now)` — today's exact behavior.
  - `mode === "custom"` with both dates set: range = `customRange(customStart, customEnd)` (inclusive of both days, via the existing helper).
- Replace the `isInSchoolYear` check with `isInRange(e.startedAt, resolvedRange)`, feeding the same `computeRangeTotals` logic Feature A introduces — one code path for "range totals," used by both the standing period column and the print report.
- Rename `CategoryTotal.year` → `CategoryTotal.period` for clarity (it's no longer necessarily a year). Blast radius is small: only `TotalsTable.tsx` and `StudentModal.tsx` read `.year` today; `Seat.tsx`'s badges only use `.today` and are untouched.

### UI

- **Settings modal** ([SettingsModal.tsx](../../../src/components/SettingsModal.tsx)): new "Totals timeframe" section near "School year start":
  - Mode toggle: **Whole year** / **Custom range** (radio buttons or a two-option segmented control).
  - When "Custom range" is selected: two date inputs (start, end), styled like the existing school-year-start date input.
  - A new store action `setViewPeriod(patch: Partial<ViewPeriod>)` mirrors `setRandomPickerSettings`, updating `settings.viewPeriod` and persisting via `store.saveSettings`.
- **TotalsTable.tsx**: second column header reads **"Year"** when `mode === "year"`, or the custom range's compact label (e.g. "Jan 20 – Jun 5") when `mode === "custom"` and both dates are set.
- **StudentModal.tsx**: the "has been off-task for a total of X this year" sentence swaps "this year" → "this period" (or the range label) to match.

### Edge cases

- Custom mode selected but dates not yet filled in: falls back to whole-year behavior (never a broken/empty state).
- `customStart` after `customEnd`: mirror `DateRangePicker`'s existing pattern of clamping via each input's `min`/`max` so this can't be entered in the first place.
- Existing settings rows without `viewPeriod` (pre-migration): default via `withSettingsDefaults`, same as any other settings field added historically.

### Testing

- Unit tests for the range-resolution logic (year mode; custom mode with both dates; custom mode with a date missing falls back to year).
- Manual verification: toggle mode in Settings, confirm `TotalsTable` header/values and the `StudentModal` sentence update; confirm values persist across reload.

---

## Out of scope (both features)

- No named/preset terms (Q1–Q4, Semester 1/2) — just a manual start/end date, per decision.
- No per-class timeframe — `viewPeriod` is global, matching how `schoolYearStart` already works today.
- Print report has no per-category filtering or customization of what's included — it's the full totals table + full event log for the range.
- No PDF-generation library — relies on the browser's native print dialog (print-to-PDF covers "save as PDF" if needed).
