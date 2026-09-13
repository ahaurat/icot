import { create } from "zustand";
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
import { isPickableStudent, pickStudent } from "../utils/randomPicker";
import { shuffleSeats } from "../utils/seatRandomizer";
import { sortByPeriod } from "../utils/classSort";

/** The active class to default to: the lowest-period one, so period order (not storage order) wins. */
function defaultActiveClassId(classes: ClassRoom[]): string | null {
  return sortByPeriod(classes.filter((c) => !c.archivedAt))[0]?.id ?? classes[0]?.id ?? null;
}

const store = getDataStore();

/** Fire-and-forget persistence; surfaces errors without blocking the UI. */
function persist(p: Promise<void>) {
  p.catch((err) => {
    console.error("Persistence error:", err);
    useAppStore.setState({ error: err instanceof Error ? err.message : String(err) });
  });
}

function nowIso() {
  return new Date().toISOString();
}

interface AppState extends AppData {
  loaded: boolean;
  error: string | null;
  currentClassId: string | null;

  init: () => Promise<void>;
  setCurrentClass: (classId: string) => void;

  // Timed + count events
  startTimer: (studentId: string, categoryKey: CategoryKey) => void;
  stopTimer: (eventId: string) => void;
  logCount: (studentId: string, categoryKey: CategoryKey) => void;
  updateEvent: (id: string, patch: Partial<AppEvent>) => void;
  deleteEvent: (id: string) => void;

  // Roster + seating
  addStudent: (classId: string, name: string, seatIndex: number | null) => void;
  renameStudent: (id: string, name: string) => void;
  moveStudent: (id: string, seatIndex: number) => void;
  removeStudent: (id: string) => void;
  restoreStudent: (id: string) => void;
  deleteStudentPermanently: (id: string) => void;

  // Roster upload + archiving
  importRosters: (rosters: ParsedRoster[], archiveFirst: boolean) => void;
  archiveCurrentRosters: () => void;
  restoreClass: (id: string) => void;
  deleteClassPermanently: (id: string) => void;

  // Seat layout
  setSeatLayout: (layout: SeatLayout) => void;
  reseatActiveClasses: () => void;

  // Settings + data
  setSchoolYearStart: (date: string) => void;
  importData: (data: AppData) => void;
  exportData: () => AppData;

  // Random student picker
  setRandomPickerSettings: (patch: Partial<RandomPickerSettings>) => void;
  pickRandomStudent: (classId: string) => string | null;

  // Seat randomization
  randomizeSeats: (classId: string, persistMode: "save" | "today") => void;
  revertStaleSeatingSnapshots: () => void;
}

let initStarted = false;

// A fresh Supabase login can briefly fail with "JWT issued at future": the
// auth service mints the token's iat off its own clock, and the API service
// validates it off a slightly different clock, so a just-minted token can
// look future-dated for a moment. One retry after a short delay gives the
// token's iat time to safely fall behind that clock's "now".
const LOAD_RETRY_DELAY_MS = 1500;

async function loadWithRetry(retriesLeft: number): Promise<void> {
  try {
    let data = await store.loadAll();
    if (data.classes.length === 0) {
      // Fresh storage: seed with the ported rosters and persist them.
      data = buildSeedData();
      await store.importAll(data);
    }
    useAppStore.setState({
      ...data,
      error: null,
      loaded: true,
      currentClassId: defaultActiveClassId(data.classes),
    });
    useAppStore.getState().revertStaleSeatingSnapshots();
  } catch (err) {
    if (retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, LOAD_RETRY_DELAY_MS));
      return loadWithRetry(retriesLeft - 1);
    }
    // Release the latch so the failure can be retried without a reload, and
    // record the reason — `loaded` stays false, so App shows this instead of
    // sitting on "Loading…" forever.
    initStarted = false;
    console.error("Load error:", err);
    useAppStore.setState({ error: err instanceof Error ? err.message : String(err) });
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  classes: [],
  students: [],
  events: [],
  settings: {
    schoolYearStart: "",
    seatLayout: DEFAULT_SEAT_LAYOUT,
    randomPicker: { mode: "random", resetDaily: true },
    pickerProgress: {},
    seatingSnapshots: {},
  },
  loaded: false,
  error: null,
  currentClassId: null,

  async init() {
    if (initStarted) return;
    initStarted = true;
    await loadWithRetry(1);
  },

  setCurrentClass(classId) {
    set({ currentClassId: classId });
  },

  startTimer(studentId, categoryKey) {
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (cat.type !== "timed") return;
    const student = get().students.find((s) => s.id === studentId);
    if (!student) return;

    // Only one running timer per student: close any that are still open.
    const ts = nowIso();
    const stillOpen = get().events.filter((e) => e.studentId === studentId && e.open);
    stillOpen.forEach((e) => get().stopTimer(e.id));

    const event: AppEvent = {
      id: newId(),
      studentId,
      classId: student.classId,
      categoryKey,
      type: "timed",
      startedAt: ts,
      endedAt: null,
      durationSeconds: null,
      open: true,
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ events: [...s.events, event] }));
    persist(store.upsertEvent(event));
  },

  stopTimer(eventId) {
    const event = get().events.find((e) => e.id === eventId);
    if (!event || !event.open) return;
    const ended = nowIso();
    const updated: AppEvent = {
      ...event,
      open: false,
      endedAt: ended,
      durationSeconds: elapsedSeconds(event.startedAt, new Date(ended)),
      updatedAt: ended,
    };
    set((s) => ({ events: s.events.map((e) => (e.id === eventId ? updated : e)) }));
    persist(store.upsertEvent(updated));
  },

  logCount(studentId, categoryKey) {
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (cat.type !== "count") return;
    const student = get().students.find((s) => s.id === studentId);
    if (!student) return;

    const ts = nowIso();
    const event: AppEvent = {
      id: newId(),
      studentId,
      classId: student.classId,
      categoryKey,
      type: "count",
      startedAt: ts,
      endedAt: null,
      durationSeconds: null,
      open: false,
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ events: [...s.events, event] }));
    persist(store.upsertEvent(event));
  },

  updateEvent(id, patch) {
    const event = get().events.find((e) => e.id === id);
    if (!event) return;
    const updated: AppEvent = { ...event, ...patch, id: event.id, updatedAt: nowIso() };
    set((s) => ({ events: s.events.map((e) => (e.id === id ? updated : e)) }));
    persist(store.upsertEvent(updated));
  },

  deleteEvent(id) {
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
    persist(store.deleteEvent(id));
  },

  addStudent(classId, name, seatIndex) {
    const student: Student = {
      id: newId(),
      classId,
      name: name.trim(),
      seatIndex,
      active: true,
      groupColor: null,
    };
    set((s) => ({ students: [...s.students, student] }));
    persist(store.upsertStudent(student));
  },

  renameStudent(id, name) {
    const student = get().students.find((s) => s.id === id);
    if (!student) return;
    const updated = { ...student, name: name.trim() };
    set((s) => ({ students: s.students.map((x) => (x.id === id ? updated : x)) }));
    persist(store.upsertStudent(updated));
  },

  moveStudent(id, seatIndex) {
    const student = get().students.find((s) => s.id === id);
    if (!student) return;

    // If an active student already sits at the target, swap their seats.
    const occupant = get().students.find(
      (s) => s.classId === student.classId && s.active && s.seatIndex === seatIndex && s.id !== id
    );

    const moved = { ...student, seatIndex };
    const updates: Student[] = [moved];
    if (occupant) updates.push({ ...occupant, seatIndex: student.seatIndex });

    set((s) => ({
      students: s.students.map((x) => updates.find((u) => u.id === x.id) ?? x),
    }));
    updates.forEach((u) => persist(store.upsertStudent(u)));
  },

  removeStudent(id) {
    // Soft delete: keep history + year totals, free the desk.
    const student = get().students.find((s) => s.id === id);
    if (!student) return;
    const updated = { ...student, active: false, seatIndex: null };
    set((s) => ({ students: s.students.map((x) => (x.id === id ? updated : x)) }));
    persist(store.upsertStudent(updated));
  },

  restoreStudent(id) {
    const student = get().students.find((s) => s.id === id);
    if (!student) return;
    const updated = { ...student, active: true };
    set((s) => ({ students: s.students.map((x) => (x.id === id ? updated : x)) }));
    persist(store.upsertStudent(updated));
  },

  deleteStudentPermanently(id) {
    set((s) => ({
      students: s.students.filter((x) => x.id !== id),
      events: s.events.filter((e) => e.studentId !== id),
    }));
    persist(store.deleteStudent(id));
  },

  importRosters(rosters, archiveFirst) {
    const ts = nowIso();
    const layout = get().settings.seatLayout;

    // Optionally archive (soft-delete) all currently-active classes first.
    const archived: ClassRoom[] = [];
    const classes = get().classes.map((c) => {
      if (archiveFirst && !c.archivedAt) {
        const a = { ...c, archivedAt: ts };
        archived.push(a);
        return a;
      }
      return c;
    });

    // Build the new active classes + their students placed by the stored layout.
    const newClasses: ClassRoom[] = [];
    const newStudents: Student[] = [];
    for (const roster of rosters) {
      const classId = newId();
      const placement = placementForLayout(layout, roster.names.length);
      const maxIndex = placement.reduce((m, i) => Math.max(m, i), -1);
      const seatRows = Math.max(layout.rows, Math.ceil((maxIndex + 1) / layout.cols));
      newClasses.push({
        id: classId,
        name: roster.period,
        seatRows,
        seatCols: layout.cols,
        archivedAt: null,
      });
      roster.names.forEach((name, i) => {
        newStudents.push({
          id: newId(),
          classId,
          name,
          seatIndex: placement[i],
          active: true,
          groupColor: null,
        });
      });
    }

    set({
      classes: [...classes, ...newClasses],
      students: [...get().students, ...newStudents],
      currentClassId: sortByPeriod(newClasses)[0]?.id ?? get().currentClassId,
    });

    // Students reference their class by FK, so every class row must be written
    // before any student row. These are separate network calls in cloud mode,
    // so they must be awaited in order rather than fired off together.
    persist(
      (async () => {
        await Promise.all([...archived, ...newClasses].map((c) => store.upsertClass(c)));
        await Promise.all(newStudents.map((s) => store.upsertStudent(s)));
      })(),
    );
  },

  archiveCurrentRosters() {
    const ts = nowIso();
    const archived: ClassRoom[] = [];
    const classes = get().classes.map((c) => {
      if (!c.archivedAt) {
        const a = { ...c, archivedAt: ts };
        archived.push(a);
        return a;
      }
      return c;
    });
    set({ classes, currentClassId: classes.find((c) => !c.archivedAt)?.id ?? null });
    archived.forEach((c) => persist(store.upsertClass(c)));
  },

  restoreClass(id) {
    const cls = get().classes.find((c) => c.id === id);
    if (!cls) return;
    const updated = { ...cls, archivedAt: null };
    set((s) => ({ classes: s.classes.map((c) => (c.id === id ? updated : c)) }));
    persist(store.upsertClass(updated));
  },

  deleteClassPermanently(id) {
    set((s) => ({
      classes: s.classes.filter((c) => c.id !== id),
      students: s.students.filter((st) => st.classId !== id),
      events: s.events.filter((e) => e.classId !== id),
      currentClassId:
        s.currentClassId === id
          ? defaultActiveClassId(s.classes.filter((c) => c.id !== id))
          : s.currentClassId,
    }));
    persist(store.deleteClass(id));
  },

  setSeatLayout(layout) {
    const settings = { ...get().settings, seatLayout: normalizeSeatLayout(layout) };
    set({ settings });
    persist(store.saveSettings(settings));
  },

  reseatActiveClasses() {
    const layout = get().settings.seatLayout;
    const changedClasses: ClassRoom[] = [];
    const changedStudents: Student[] = [];

    for (const cls of get().classes.filter((c) => !c.archivedAt)) {
      const roster = get().students.filter((s) => s.classId === cls.id && s.active);
      const plan = planReseat(roster, layout);
      const byId = new Map(plan.map((p) => [p.id, p.seatIndex]));
      const maxIndex = plan.reduce((m, p) => Math.max(m, p.seatIndex), -1);
      const seatRows = Math.max(layout.rows, Math.ceil((maxIndex + 1) / layout.cols));

      changedClasses.push({ ...cls, seatCols: layout.cols, seatRows });
      for (const s of roster) {
        if (byId.has(s.id)) changedStudents.push({ ...s, seatIndex: byId.get(s.id)! });
      }
    }

    set((state) => ({
      classes: state.classes.map((c) => changedClasses.find((u) => u.id === c.id) ?? c),
      students: state.students.map((s) => changedStudents.find((u) => u.id === s.id) ?? s),
    }));
    changedClasses.forEach((c) => persist(store.upsertClass(c)));
    changedStudents.forEach((s) => persist(store.upsertStudent(s)));
  },

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
      .students.filter((s) => s.classId === classId && isPickableStudent(s))
      .map((s) => s.id);
    const current = get().settings;
    const result = pickStudent(
      activeIds,
      current.randomPicker,
      current.pickerProgress[classId],
      todayDateKey()
    );
    if (!result) return null;

    if (result.progress) {
      const settings = {
        ...current,
        pickerProgress: { ...current.pickerProgress, [classId]: result.progress },
      };
      set({ settings });
      persist(store.saveSettings(settings));
    }
    return result.studentId;
  },

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

  importData(data) {
    const settings = withSettingsDefaults(data.settings);
    const coerced = { ...data, settings };
    set({
      classes: coerced.classes,
      students: coerced.students,
      events: coerced.events,
      settings,
      currentClassId: defaultActiveClassId(coerced.classes),
    });
    persist(store.importAll(coerced));
  },

  exportData() {
    const { classes, students, events, settings } = get();
    return { classes, students, events, settings };
  },
}));

/** Convenience selector: the currently selected classroom. */
export function useCurrentClass(): ClassRoom | undefined {
  return useAppStore((s) => s.classes.find((c) => c.id === s.currentClassId));
}
