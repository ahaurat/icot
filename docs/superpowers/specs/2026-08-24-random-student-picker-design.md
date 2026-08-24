# Random Student Picker — Design Spec

## Purpose

Help the teacher call on students fairly during lecture, without manually tracking who's already answered. A new "Choose random student" button picks a student from the current period's active roster, either fully at random each time or cycling through the roster so no one is called twice before everyone's had a turn.

## Data model

Extend `Settings` (in [src/types.ts](../../../src/types.ts)) with two new fields, persisted the same way `schoolYearStart` and `seatLayout` already are (one JSON blob in localStorage; one row with jsonb columns in Supabase, upserted via `saveSettings`):

```ts
interface RandomPickerSettings {
  mode: "random" | "cycle";
  resetDaily: boolean; // only meaningful when mode === "cycle"
}

interface ClassPickerProgress {
  calledStudentIds: string[];
  cycleStartDate: string; // YYYY-MM-DD (local), when the current cycle round began
}

interface Settings {
  schoolYearStart: string;
  seatLayout: SeatLayout;
  randomPicker: RandomPickerSettings;                    // global config
  pickerProgress: Record<string, ClassPickerProgress>;   // keyed by classId
}
```

- `randomPicker` is the single global "Choose student" setting (Fully random / Cycle, and Reset each day when Cycle is selected).
- `pickerProgress` tracks per-period cycle state independently, so switching periods doesn't interfere with another period's progress. It rides along with existing settings persistence, so it survives refresh/reload and syncs the same way `seatLayout` does today.
- `withSettingsDefaults` (in [src/data/store.ts](../../../src/data/store.ts)) gets defaults for both new fields (`mode: "random"`, `resetDaily: true`, `pickerProgress: {}`) so existing saved data without them still loads cleanly.
- Supabase: add `random_picker` and `picker_progress` jsonb columns to the `settings` table (migration), mapped in [src/data/supabaseStore.ts](../../../src/data/supabaseStore.ts) alongside `seat_layout`.

## UI

- **Button**: "Choose random student" next to the period dropdown in [src/components/Header.tsx](../../../src/components/Header.tsx). Disabled when the current period has zero active students.
- **Settings section**: new "Random picker" section in [src/components/SettingsModal.tsx](../../../src/components/SettingsModal.tsx):
  - "Choose student": Fully random / Cycle (radio or select).
  - When Cycle is selected: "Reset each day": Yes / No.
  - Changes call a new store action (`setRandomPickerSettings`) that updates `settings.randomPicker` and persists via `store.saveSettings`, following the same pattern as `setSchoolYearStart`.
- **Result display**: no popup dialog. The picked student's seat is highlighted on the seating chart. This is transient UI state (`pickedStudentId`) held in `App.tsx`, not persisted — it clears when a new student is picked or the current period is switched. Passed down through `SeatingChart` to `Seat` to apply a highlight style (e.g. a ring/border) to the matching seat.

## Picking logic

A new store action `pickRandomStudent(classId)` on `useAppStore`:

1. Gather active students for `classId`. If none, no-op (button is disabled so this shouldn't be reachable from the UI, but the action guards anyway).
2. If `randomPicker.mode === "random"`: pick uniformly at random from all active students. No exclusion — repeats across clicks are allowed by design.
3. If `randomPicker.mode === "cycle"`:
   a. Read `pickerProgress[classId]`, defaulting to `{ calledStudentIds: [], cycleStartDate: today }` if absent.
   b. If `randomPicker.resetDaily` is true and `progress.cycleStartDate !== today`, reset: `calledStudentIds = []`, `cycleStartDate = today`.
   c. Eligible pool = active students whose id is not in `calledStudentIds`.
   d. If the eligible pool is empty (everyone in the current roster has been called), auto-restart the cycle: clear `calledStudentIds`, leave `cycleStartDate` as-is (already handled in step b if the date changed), and refill the pool with all active students.
   e. Pick uniformly at random from the eligible pool.
   f. Append the picked student's id to `calledStudentIds` for `classId`, update `pickerProgress`, and persist via `store.saveSettings`.
4. Set the picked student's id as the current highlight (`pickedStudentId` in `App.tsx`) and return/expose it for the UI.

The pure selection logic (steps 2–3, given students, progress, settings, and today's date as inputs, returning the picked id and the new progress) lives in a standalone module `src/utils/randomPicker.ts` so it's independently unit-testable, mirroring how `src/utils/seatLayout.ts` separates pure logic from the store.

## Edge cases

- **Student removed from roster mid-cycle**: their id may remain in `calledStudentIds` harmlessly — they're no longer active, so they're excluded from the eligible pool regardless, and never picked again.
- **Student added mid-cycle**: active and not yet in `calledStudentIds`, so immediately eligible.
- **Switching mode (Fully random ↔ Cycle)**: no migration needed. `pickerProgress` is simply unused while `mode === "random"` and resumes from where it left off if the user switches back to `"cycle"`.
- **Zero active students in period**: "Choose random student" button is disabled.
- **Switching periods**: highlight clears; cycle progress for each period is tracked independently via `pickerProgress[classId]`.

## Testing

- Unit tests (Vitest, matching the existing pattern in [src/utils/seatLayout.test.ts](../../../src/utils/seatLayout.test.ts) and [src/data/store.test.ts](../../../src/data/store.test.ts)) for the pure logic in `src/utils/randomPicker.ts`:
  - Fully random mode picks from the full active roster.
  - Cycle mode excludes already-called students.
  - Cycle mode auto-restarts when the pool is exhausted.
  - Cycle mode resets on a new calendar day when `resetDaily` is true, and does not reset on a new day when `resetDaily` is false.
  - Empty active roster is handled without throwing.
- Manual verification in the browser preview: button placement/disabled state, settings section, seat highlight on pick, persistence across a page reload.

## Out of scope

- No popup/dialog for the result (seat highlight only, per decision).
- No manual "reset cycle" control — resets only happen automatically (exhaustion or, if enabled, new calendar day).
- No cross-period pooling — picking is always scoped to the currently selected period.
