import type { ClassPickerProgress, RandomPickerSettings } from "../types";

export interface PickResult {
  studentId: string;
  progress: ClassPickerProgress | null;
}

/** A student is eligible for picking only if active and currently seated (visible on the chart). */
export function isPickableStudent(s: { active: boolean; seatIndex: number | null }): boolean {
  return s.active && s.seatIndex != null;
}

/**
 * Pick a student id for a class given its active roster, the global picker
 * settings, any prior cycle progress for that class, and today's local date
 * (YYYY-MM-DD). Pure — no store or storage access. Returns null when there
 * are no active students to pick from. In "random" mode, `progress` is
 * always null — random picks never change cycle state.
 */
export function pickStudent(
  activeStudentIds: string[],
  settings: RandomPickerSettings,
  progress: ClassPickerProgress | undefined,
  today: string
): PickResult | null {
  if (activeStudentIds.length === 0) return null;

  if (settings.mode === "random") {
    const studentId = activeStudentIds[Math.floor(Math.random() * activeStudentIds.length)];
    return { studentId, progress: null };
  }

  let calledStudentIds = progress?.calledStudentIds ?? [];
  let cycleStartDate = progress?.cycleStartDate ?? today;

  if (settings.resetDaily && cycleStartDate !== today) {
    calledStudentIds = [];
    cycleStartDate = today;
  }

  let eligible = activeStudentIds.filter((id) => !calledStudentIds.includes(id));
  if (eligible.length === 0) {
    calledStudentIds = [];
    eligible = activeStudentIds;
  }

  const studentId = eligible[Math.floor(Math.random() * eligible.length)];
  return {
    studentId,
    progress: { calledStudentIds: [...calledStudentIds, studentId], cycleStartDate },
  };
}
