// Core domain types for ICOT.
//
// Note: the log entry type is named `AppEvent` (not `Event`) to avoid colliding
// with the DOM's global `Event` type.

export type CategoryKey =
  | "bathroom"
  | "nurse"
  | "office"
  | "sleeping"
  | "other"
  | "tardy"
  | "cellphone"
  | "headphones"
  | "extracredit";

export type CategoryType = "timed" | "count";

export interface ClassRoom {
  id: string;
  name: string;
  seatRows: number;
  seatCols: number;
  /** ISO timestamp when this class was archived (soft-deleted), or null if active. */
  archivedAt: string | null;
}

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

export interface AppEvent {
  id: string;
  studentId: string;
  classId: string;
  categoryKey: CategoryKey;
  type: CategoryType;
  /** ISO timestamp: when a timed event began, or when a count event occurred. */
  startedAt: string;
  /** ISO timestamp the timed event ended; null while running or for counts. */
  endedAt: string | null;
  /** Elapsed seconds for timed events; null for count events. */
  durationSeconds: number | null;
  /** True while a timed event's stopwatch is still running. */
  open: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeatLayout {
  /** Grid height in cells. */
  rows: number;
  /** Grid width in cells. */
  cols: number;
  /** Row-major grid indices that are desks, in seat order (seat 1 = seatOrder[0]).
      Any in-grid cell not listed is an aisle/gap. Entries are unique and < rows*cols. */
  seatOrder: number[];
}

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

export interface SeatingSnapshot {
  /** Local YYYY-MM-DD the snapshot was captured; used to detect the next calendar day. */
  savedAt: string;
  /** seatIndex per student id at the time "Randomize seats -> today only" was used. */
  seats: Record<string, number>;
}

export interface ViewPeriod {
  mode: "year" | "custom";
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customStart: string;
  /** YYYY-MM-DD; only meaningful when mode === "custom". */
  customEnd: string;
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
  /** Which date range the standing "Period" totals column reflects. */
  viewPeriod: ViewPeriod;
}

export interface AppData {
  classes: ClassRoom[];
  students: Student[];
  events: AppEvent[];
  settings: Settings;
}
