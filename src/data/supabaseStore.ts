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
import type { DataStore } from "./store";
import { withSettingsDefaults } from "./store";
import { getSupabaseClient } from "./supabaseClient";

// Row shapes (snake_case) as stored in Supabase. See supabase/schema.sql.
interface ClassRow {
  id: string;
  name: string;
  seat_rows: number;
  seat_cols: number;
  archived_at: string | null;
}
interface StudentRow {
  id: string;
  class_id: string;
  name: string;
  seat_index: number | null;
  active: boolean;
}
interface EventRow {
  id: string;
  student_id: string;
  class_id: string;
  category_key: string;
  type: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  open: boolean;
  created_at: string;
  updated_at: string;
}
interface SettingsRow {
  school_year_start: string;
  seat_layout: SeatLayout | null;
  random_picker: RandomPickerSettings | null;
  picker_progress: Record<string, ClassPickerProgress> | null;
  view_period: ViewPeriod | null;
}

const classToRow = (c: ClassRoom): ClassRow => ({
  id: c.id,
  name: c.name,
  seat_rows: c.seatRows,
  seat_cols: c.seatCols,
  archived_at: c.archivedAt,
});
const rowToClass = (r: ClassRow): ClassRoom => ({
  id: r.id,
  name: r.name,
  seatRows: r.seat_rows,
  seatCols: r.seat_cols,
  archivedAt: r.archived_at ?? null,
});

const studentToRow = (s: Student): StudentRow => ({
  id: s.id,
  class_id: s.classId,
  name: s.name,
  seat_index: s.seatIndex,
  active: s.active,
});
const rowToStudent = (r: StudentRow): Student => ({
  id: r.id,
  classId: r.class_id,
  name: r.name,
  seatIndex: r.seat_index,
  active: r.active,
});

const eventToRow = (e: AppEvent): EventRow => ({
  id: e.id,
  student_id: e.studentId,
  class_id: e.classId,
  category_key: e.categoryKey,
  type: e.type,
  started_at: e.startedAt,
  ended_at: e.endedAt,
  duration_seconds: e.durationSeconds,
  open: e.open,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});
const rowToEvent = (r: EventRow): AppEvent => ({
  id: r.id,
  studentId: r.student_id,
  classId: r.class_id,
  categoryKey: r.category_key as AppEvent["categoryKey"],
  type: r.type as AppEvent["type"],
  startedAt: r.started_at,
  endedAt: r.ended_at,
  durationSeconds: r.duration_seconds,
  open: r.open,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function check(error: { message: string } | null, context: string) {
  if (error) throw new Error(`Supabase ${context} failed: ${error.message}`);
}

/** Supabase-backed store. Active when VITE_SUPABASE_* env vars are set. */
export function createSupabaseStore(): DataStore {
  const sb = getSupabaseClient();

  // The current teacher's auth uid, resolved once and reused. Needed only so the
  // per-owner settings row can be upserted with an explicit conflict target;
  // all other tables get owner_id from the DB default and are scoped by RLS.
  let ownerIdPromise: Promise<string> | null = null;
  function ownerId(): Promise<string> {
    if (!ownerIdPromise) {
      ownerIdPromise = sb.auth.getUser().then(({ data, error }) => {
        if (error || !data.user) {
          ownerIdPromise = null; // allow a retry after re-auth
          throw new Error(`Supabase get user failed: ${error?.message ?? "no session"}`);
        }
        return data.user.id;
      });
    }
    return ownerIdPromise;
  }

  return {
    async loadAll() {
      const [classes, students, events, settings] = await Promise.all([
        sb.from("classes").select("*"),
        sb.from("students").select("*"),
        sb.from("events").select("*"),
        sb.from("settings").select("*").maybeSingle(),
      ]);
      check(classes.error, "load classes");
      check(students.error, "load students");
      check(events.error, "load events");
      check(settings.error, "load settings");

      return {
        classes: (classes.data as ClassRow[]).map(rowToClass),
        students: (students.data as StudentRow[]).map(rowToStudent),
        events: (events.data as EventRow[]).map(rowToEvent),
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
      } satisfies AppData;
    },

    async upsertClass(c) {
      const { error } = await sb.from("classes").upsert(classToRow(c));
      check(error, "upsert class");
    },

    async deleteClass(id) {
      const { error } = await sb.from("classes").delete().eq("id", id);
      check(error, "delete class");
    },

    async upsertStudent(s) {
      const { error } = await sb.from("students").upsert(studentToRow(s));
      check(error, "upsert student");
    },

    async deleteStudent(id) {
      const { error } = await sb.from("students").delete().eq("id", id);
      check(error, "delete student");
    },

    async upsertEvent(e) {
      const { error } = await sb.from("events").upsert(eventToRow(e));
      check(error, "upsert event");
    },

    async deleteEvent(id) {
      const { error } = await sb.from("events").delete().eq("id", id);
      check(error, "delete event");
    },

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

    async importAll(data: AppData) {
      // Replace everything: clear child-to-parent, then insert parent-to-child.
      // `id` is a uuid, so it can't be compared against "" (Postgres 22P02); match
      // every row via an always-true null check instead, and surface failures
      // rather than silently leaving old rows. Deletes are RLS-scoped to the owner.
      check((await sb.from("events").delete().not("id", "is", null)).error, "clear events");
      check((await sb.from("students").delete().not("id", "is", null)).error, "clear students");
      check((await sb.from("classes").delete().not("id", "is", null)).error, "clear classes");

      if (data.classes.length) {
        check((await sb.from("classes").insert(data.classes.map(classToRow))).error, "import classes");
      }
      if (data.students.length) {
        check((await sb.from("students").insert(data.students.map(studentToRow))).error, "import students");
      }
      if (data.events.length) {
        check((await sb.from("events").insert(data.events.map(eventToRow))).error, "import events");
      }
      await this.saveSettings(data.settings);
    },
  };
}
