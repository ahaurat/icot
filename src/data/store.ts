import type { AppData, AppEvent, ClassRoom, Settings, Student } from "../types";
import { defaultSchoolYearStart } from "../utils/time";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { normalizeSeatLayout } from "../utils/seatLayout";
import { createLocalStore } from "./localStore";
import { createSupabaseStore } from "./supabaseStore";
import { hasSupabaseConfig } from "./supabaseClient";

/** Fill in defaults for any settings shape read from storage, an import, or a fresh install. */
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  return {
    schoolYearStart: s?.schoolYearStart || defaultSchoolYearStart(),
    seatLayout: s?.seatLayout ? normalizeSeatLayout(s.seatLayout) : DEFAULT_SEAT_LAYOUT,
    randomPicker: s?.randomPicker ?? { mode: "random", resetDaily: true },
    pickerProgress: s?.pickerProgress ?? {},
    seatingSnapshots: s?.seatingSnapshots ?? {},
  };
}

/**
 * Persistence contract. Implemented by both the localStorage adapter (default)
 * and the Supabase adapter. Mutations are granular so the cloud adapter can do
 * targeted upserts; the localStorage adapter just rewrites its blob.
 */
export interface DataStore {
  loadAll(): Promise<AppData>;
  upsertClass(c: ClassRoom): Promise<void>;
  deleteClass(id: string): Promise<void>;
  upsertStudent(s: Student): Promise<void>;
  deleteStudent(id: string): Promise<void>;
  upsertEvent(e: AppEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  /** Replace the entire dataset (used for JSON import and initial seeding). */
  importAll(data: AppData): Promise<void>;
}

export function emptyData(): AppData {
  return {
    classes: [],
    students: [],
    events: [],
    settings: withSettingsDefaults(null),
  };
}

/** Which backend is active, for display in the UI. */
export type StorageMode = "supabase" | "local";

export const storageMode: StorageMode = hasSupabaseConfig ? "supabase" : "local";

/** Returns the active data store: Supabase when configured, else localStorage. */
export function getDataStore(): DataStore {
  return hasSupabaseConfig ? createSupabaseStore() : createLocalStore();
}
