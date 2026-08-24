import type { ClassPickerProgress, RandomPickerSettings } from "../types";

export interface PickResult {
  studentId: string;
  progress: ClassPickerProgress;
}

/**
 * Pick a student id for a class given its active roster, the global picker
 * settings, any prior cycle progress for that class, and today's local date
 * (YYYY-MM-DD). Pure — no store or storage access. Returns null when there
 * are no active students to pick from.
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
    return { studentId, progress: progress ?? { calledStudentIds: [], cycleStartDate: today } };
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
