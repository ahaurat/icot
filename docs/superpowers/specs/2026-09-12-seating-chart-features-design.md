# Seating Chart Features — Design Spec

## Purpose

Three related improvements to the seating chart / random picker workflow:

1. A way to dismiss the "just picked" highlight before it fades on its own (it currently never fades — the CSS animation loops forever).
2. Seat randomization, with a choice of making it permanent or reverting automatically the next day.
3. Grouping students into color-coded clusters, reseated together.

Plus three small UI polish items noticed along the way: the Clear control should read as a link not a button, the header's buttons/select aren't vertically aligned, and the count-type log buttons (Cell Phone / Headphones / Extra Credit) give no feedback when tapped.

## A. Clear the picked-student highlight

[Seat.tsx](../../../src/components/Seat.tsx) renders the highlight ring via `animate-ping` (Tailwind's default infinite animation) whenever `highlighted` is true — there is no built-in stop. Today it only clears via a new pick or a class switch (`useEffect` in [App.tsx](../../../src/App.tsx) keyed on `currentClassId`).

- Add a `pickedStudentId: string | null` → `hasPickedStudent` boolean prop to [Header.tsx](../../../src/components/Header.tsx), plus an `onClearPickedStudent: () => void` callback.
- When `hasPickedStudent` is true, render a small text-link-styled control (e.g. `text-sm text-gray-500 underline hover:text-gray-700`, not a `bg-*` button) next to "Choose random student" reading "Clear".
- Clicking it calls `onClearPickedStudent`, which in `App.tsx` does exactly what the class-switch effect already does: `setPickedStudentId(null)`.
- No change to `pickNonce` or the pick logic itself.

## B. Header changes while editing seating

Today, [Header.tsx](../../../src/components/Header.tsx) always renders "Choose random student", "Summary", "Edit seating"/"Done moving seats", and "Settings", regardless of `editSeating`. Neither the picker nor the summary is useful while rearranging desks, and the new seat-editing actions belong in the same place.

- While `editSeating` is true: hide "Choose random student" (and its Clear link from section A) and hide "Summary".
- In their place, show two new buttons: **"Randomize seats…"** and **"Create groups…"** (detailed in C and D), alongside the existing "Done moving seats".
- The class `<select>` and "Settings" stay visible in both modes.
- **Bundled fix**: while touching this layout, fix the vertical misalignment between the class `<select>` and the buttons in the row (currently `items-center` on a `flex-wrap` container, but the `<select>`'s default UA padding/line-height doesn't match the buttons' `py-2`). Normalize by giving the `<select>` explicit `text-sm leading-tight` (or equivalent) matching the buttons, and verify visually in the browser preview at both desktop and a wrapped/narrow width.

## C. Randomize seats

A new "Randomize seats…" button (visible only in edit-seating mode, per B) opens a small modal (reusing [Modal.tsx](../../../src/components/Modal.tsx)) with two actions:

- **Save as new main chart** (permanent)
- **Just for today**

**Population**: active students in the current class whose `seatIndex != null` (i.e. currently seated) — same population `isPickableStudent` already uses for the picker, and consistent with what's visibly on the chart.

**Algorithm** (new pure helper, `src/utils/seatRandomizer.ts`, mirroring `randomPicker.ts`/`seatLayout.ts`):

```ts
function shuffleSeats(seated: { id: string; seatIndex: number }[]): { id: string; seatIndex: number }[]
```

Fisher–Yates shuffle the list of student ids, then re-zip them onto the *same set* of seat indices (sorted ascending) that were already occupied. Nobody moves to a currently-empty desk; the set of occupied desks is unchanged, only who sits where.

**New state**: `Settings.seatingSnapshots: Record<classId, SeatingSnapshot>` where

```ts
interface SeatingSnapshot {
  savedAt: string; // YYYY-MM-DD, local
  seats: Record<studentId, number>; // seatIndex at time of snapshot
}
```

**New store actions** on `useAppStore`:

- `randomizeSeats(classId: string, persist: "save" | "today"): void`
  - Compute the shuffle via `shuffleSeats`.
  - If `persist === "save"`: apply the new `seatIndex` values, persist students normally, and if a snapshot exists for `classId`, delete it (the new arrangement is now the permanent one — nothing left to revert to).
  - If `persist === "today"`: if `seatingSnapshots[classId]` is missing or its `savedAt !== today`, capture one first from the *current* (pre-shuffle) seat assignments. Then apply the shuffle and persist students + the (possibly-new) snapshot via `saveSettings`. Re-randomizing later the same day does not recapture the snapshot — it stays pointed at the true "main" chart.
- `revertStaleSeatingSnapshots(): void`
  - For every `classId` in `seatingSnapshots` whose `savedAt !== today`: restore each still-active student's `seatIndex` from `snapshot.seats` (skip ids no longer present/active), delete that class's snapshot entry, and persist the affected students + updated settings.
  - Called once from `loadWithRetry`'s success path, after `set({...data, loaded: true, ...})`, so a teacher opening the app on a new day sees the main chart back automatically — matching how the picker's `resetDaily` cycle check already works, just applied eagerly at load instead of lazily at pick time.

**Accepted edge case**: any manual drag-and-drop during a "today only" day is also reverted the next day, since there's only one snapshot slot per class (the pre-randomization state). This keeps the model simple — one "today" per class, not a full undo history.

## D. Create groups of X

A new "Create groups…" button (edit-seating mode, per B) opens a modal with a number input ("Students per group") and a "Create" button. If the current class already has any grouped student (see data model below), the same modal also shows a "Clear groups" button.

**Population**: same as C — active, currently-seated students in the current class.

**Grouping algorithm** (new pure helper, alongside `seatRandomizer.ts` or in its own `src/utils/groups.ts`):

```ts
function buildGroups(studentIds: string[], targetSize: number): string[][]
```

- `numGroups = Math.ceil(n / targetSize)` (minimum 1).
- Shuffle `studentIds`, then distribute them across `numGroups` as evenly as possible via round-robin (sizes differ by at most 1 — e.g. 18 students at target size 4 → `numGroups = ceil(18/4) = 5` groups of sizes 4,4,4,3,3, not 4,4,4,4,+2 leftover).
- Returns one array of student ids per group.

**Seat placement**: compute `placementForLayout(seatLayout, n)` (existing helper in [seatLayout.ts](../../../src/utils/seatLayout.ts)) to get the first `n` seat-order positions. Assign group 1 to the first `sizes[0]` slots of that ordered list, group 2 to the next `sizes[1]`, and so on — so each group occupies a contiguous block along the room's existing seat order (whatever shape/aisles the teacher has configured).

**Color coding**: a fixed palette of 8 light background colors (Tailwind "100"-shade hex values, chosen for contrast with the existing dark seat text and visual distinction from the yellow pick-highlight ring / blue drag-over ring):

```ts
const GROUP_COLOR_PALETTE = [
  "#fecaca", // red-100
  "#fed7aa", // orange-100
  "#fde68a", // amber-100
  "#bbf7d0", // green-100
  "#99f6e4", // teal-100
  "#bfdbfe", // blue-100
  "#e9d5ff", // purple-100
  "#fbcfe8", // pink-100
];
```

Group *i* gets `GROUP_COLOR_PALETTE[i % 8]`.

**Data model**: `Student.groupColor: string | null` (hex, like `CategoryConfig.color`). Set on every student placed into a group; **not** cleared or touched by anything else (not by `removeStudent`, not by normal seat moves) — it persists until the class is regrouped or groups are explicitly cleared.

**New store actions**:

- `createGroups(classId: string, groupSize: number): void` — runs the algorithm above, applies both the new `seatIndex` and `groupColor` to affected students, persists them. The population (all currently-seated active students) is the same every time grouping runs, so a regroup always overwrites every visible student's color — no stale `groupColor` can survive from a prior grouping.
- `clearGroups(classId: string): void` — sets `groupColor: null` for every student with that `classId` (regardless of active/seated state, for a full reset), persists. Does **not** move seats.

**Rendering**: [Seat.tsx](../../../src/components/Seat.tsx) currently hardcodes `bg-gray-300` for an occupied desk. When `student.groupColor` is set, apply it as an inline `backgroundColor` style instead of the `bg-gray-300` class (same pattern already used for category colors elsewhere in this file).

**Permanence**: always permanent — no interaction with the C's snapshot/revert mechanism. This is a deliberate scope decision (confirmed with the user): groups and "today only" randomization are independent features.

## Data model changes (summary)

- `src/types.ts`:
  - `Student.groupColor: string | null`
  - `Settings.seatingSnapshots: Record<string, SeatingSnapshot>`, `SeatingSnapshot { savedAt: string; seats: Record<string, number> }`
- `src/data/store.ts` (`withSettingsDefaults`): default `seatingSnapshots: {}`.
- `src/data/localStore.ts`: coerce `groupColor: s.groupColor ?? null` when reading students written before this change existed (matching the existing `archivedAt` coercion for classes).
- `src/data/supabaseStore.ts`: add `group_color` to `StudentRow`/`studentToRow`/`rowToStudent` (default `?? null` on read), and `seating_snapshots` to `SettingsRow`/`saveSettings`/`loadAll` mapping.
- `supabase/schema.sql`: add `group_color text` to `students`, `seating_snapshots jsonb` to `settings`, each via `alter table ... add column if not exists` for existing deployments (matching the existing pattern in this file for `random_picker`/`picker_progress`).

## E. Count-button click feedback (bundled polish)

[StudentModal.tsx](../../../src/components/StudentModal.tsx)'s count-type buttons (Cell Phone, Headphones, Extra Credit) call `logCount` and stay on the same screen with no visual acknowledgment — a fast double-tap looks identical to a single tap.

- Add local state to `StudentModal`: `flashKey: CategoryKey | null` and a `flashNonce` counter.
- On a count-category click, in addition to `logCount(...)`: set `flashKey` to that category and bump `flashNonce`; clear `flashKey` via `setTimeout(..., 400)` (cleaned up on unmount/next click).
- While a given button's `cat.key === flashKey`, render a brief overlay on that button — same idiom already used for the seat pick highlight in [Seat.tsx](../../../src/components/Seat.tsx) (`key={flashNonce}` + `animate-ping`), so it's a bounded, self-clearing pulse rather than a new animation primitive. Since this one must stop on its own (unlike bug A), it's gated by the `flashKey`/timeout state rather than relying on the animation to stop itself.

## Testing

- Unit tests (Vitest) for the two new pure helpers:
  - `seatRandomizer.ts`: shuffle preserves the exact set of occupied seat indices and the exact set of student ids; output seat assignment differs from input often enough to prove it's not a no-op (seeded/mocked `Math.random` as needed, matching existing test style).
  - `groups.ts`: `buildGroups` returns groups covering every input id exactly once, sizes differ by at most 1, `numGroups === Math.ceil(n / targetSize)`.
- Manual verification in the browser preview:
  - Highlight Clear link appears/disappears correctly, doesn't affect pick/cycle logic.
  - Header hides/shows the right controls when toggling edit-seating; alignment looks right at normal and wrapped widths.
  - Randomize (save) persists across reload; randomize (today) reverts after simulating a date change (or via direct store/localStorage inspection, since we can't fast-forward real time) and does not revert same-day repeats.
  - Create groups: colors visibly distinct, group members seated contiguously; Clear groups removes colors without moving seats; regrouping replaces prior colors.
  - Count-button tap shows a visible, self-clearing flash; rapid repeated taps each restart it.

## Out of scope

- No cross-class randomization or grouping (always scoped to the current class, matching existing seating/picker conventions).
- No group naming/labeling beyond color — no group-management UI beyond create/clear.
- No "today only" variant for groups, and no interaction between the two features' persistence models.
- No undo history beyond the single "today" snapshot per class.
