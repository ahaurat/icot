import type { AppData, AppEvent, ClassRoom, Settings, Student } from "../types";
import type { DataStore } from "./store";
import { emptyData, withSettingsDefaults } from "./store";
import { splitLegacyName } from "../utils/studentName";

const STORAGE_KEY = "icot:data:v1";

type LegacyStudent = Student & { name?: string };

/** Upgrades a student record written before first/last names were tracked separately. */
export function migrateStudent(s: LegacyStudent): Student {
  const { name, firstName, lastName, ...rest } = s;
  if (firstName != null && lastName != null) return { ...rest, firstName, lastName };
  return { ...rest, ...splitLegacyName(name ?? "") };
}

function read(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      // Coerce archivedAt for data written before the archive feature existed.
      classes: (parsed.classes ?? []).map((c) => ({ ...c, archivedAt: c.archivedAt ?? null })),
      students: ((parsed.students as LegacyStudent[] | undefined) ?? []).map(migrateStudent),
      events: parsed.events ?? [],
      settings: withSettingsDefaults(parsed.settings),
    };
  } catch (err) {
    console.error("Failed to read local data, starting fresh:", err);
    return emptyData();
  }
}

function write(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** localStorage-backed store. Each mutation read-modify-writes the whole blob. */
export function createLocalStore(): DataStore {
  return {
    async loadAll() {
      return read();
    },

    async upsertClass(c: ClassRoom) {
      const data = read();
      const i = data.classes.findIndex((x) => x.id === c.id);
      if (i >= 0) data.classes[i] = c;
      else data.classes.push(c);
      write(data);
    },

    async deleteClass(id: string) {
      const data = read();
      data.classes = data.classes.filter((c) => c.id !== id);
      data.students = data.students.filter((s) => s.classId !== id);
      data.events = data.events.filter((e) => e.classId !== id);
      write(data);
    },

    async upsertStudent(s: Student) {
      const data = read();
      const i = data.students.findIndex((x) => x.id === s.id);
      if (i >= 0) data.students[i] = s;
      else data.students.push(s);
      write(data);
    },

    async deleteStudent(id: string) {
      const data = read();
      data.students = data.students.filter((s) => s.id !== id);
      data.events = data.events.filter((e) => e.studentId !== id);
      write(data);
    },

    async upsertEvent(e: AppEvent) {
      const data = read();
      const i = data.events.findIndex((x) => x.id === e.id);
      if (i >= 0) data.events[i] = e;
      else data.events.push(e);
      write(data);
    },

    async deleteEvent(id: string) {
      const data = read();
      data.events = data.events.filter((e) => e.id !== id);
      write(data);
    },

    async saveSettings(s: Settings) {
      const data = read();
      data.settings = s;
      write(data);
    },

    async importAll(data: AppData) {
      write(data);
    },
  };
}
