import type { AppData, AppEvent, ClassRoom, Settings, Student } from "../types";
import type { DataStore } from "./store";
import { emptyData } from "./store";
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

  return {
    async loadAll() {
      const [classes, students, events, settings] = await Promise.all([
        sb.from("classes").select("*"),
        sb.from("students").select("*"),
        sb.from("events").select("*"),
        sb.from("settings").select("*").eq("id", "app").maybeSingle(),
      ]);
      check(classes.error, "load classes");
      check(students.error, "load students");
      check(events.error, "load events");
      check(settings.error, "load settings");

      return {
        classes: (classes.data as ClassRow[]).map(rowToClass),
        students: (students.data as StudentRow[]).map(rowToStudent),
        events: (events.data as EventRow[]).map(rowToEvent),
        settings: settings.data
          ? { schoolYearStart: (settings.data as { school_year_start: string }).school_year_start }
          : emptyData().settings,
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
      const { error } = await sb
        .from("settings")
        .upsert({ id: "app", school_year_start: s.schoolYearStart });
      check(error, "save settings");
    },

    async importAll(data: AppData) {
      // Replace everything: clear child-to-parent, then insert parent-to-child.
      await sb.from("events").delete().neq("id", "");
      await sb.from("students").delete().neq("id", "");
      await sb.from("classes").delete().neq("id", "");

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
