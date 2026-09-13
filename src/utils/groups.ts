/** Light background colors for group color-coding, distinct from category and highlight colors. */
export const GROUP_COLOR_PALETTE = [
  "#fecaca", // red-100
  "#fed7aa", // orange-100
  "#fde68a", // amber-100
  "#bbf7d0", // green-100
  "#99f6e4", // teal-100
  "#bfdbfe", // blue-100
  "#e9d5ff", // purple-100
  "#fbcfe8", // pink-100
];

/**
 * Partition student ids into groups of roughly `targetSize`, shuffled. The
 * number of groups is ceil(n / targetSize); students are distributed across
 * that many groups round-robin, so group sizes differ by at most 1.
 */
export function buildGroups(studentIds: string[], targetSize: number): string[][] {
  if (studentIds.length === 0) return [];
  const size = Math.max(1, Math.floor(targetSize));
  const numGroups = Math.max(1, Math.ceil(studentIds.length / size));

  const shuffled = [...studentIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((id, i) => groups[i % numGroups].push(id));
  return groups;
}

export interface GroupSeatAssignment {
  studentId: string;
  seatIndex: number;
  groupColor: string;
}

/**
 * Assign every student a seat and a group color: students are partitioned via
 * `buildGroups`, then groups are laid onto consecutive slices of `seatOrder`.
 * The caller must pass a `seatOrder` already arranged so any consecutive
 * slice is a spatially adjacent run of desks (see `spatialSweepOrder` in
 * seatLayout.ts) — this function only handles grouping + sequential
 * assignment, not spatial reasoning.
 */
export function planGroupSeating(
  studentIds: string[],
  seatOrder: number[],
  targetSize: number
): GroupSeatAssignment[] {
  const groups = buildGroups(studentIds, targetSize);
  const assignments: GroupSeatAssignment[] = [];
  let seatCursor = 0;
  groups.forEach((group, i) => {
    const groupColor = GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length];
    for (const studentId of group) {
      assignments.push({ studentId, seatIndex: seatOrder[seatCursor], groupColor });
      seatCursor++;
    }
  });
  return assignments;
}
