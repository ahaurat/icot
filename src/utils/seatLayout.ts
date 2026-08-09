import type { SeatLayout, Student } from "../types";

/** Number of desks the layout defines. */
export function deskCount(layout: SeatLayout): number {
  return layout.seatOrder.length;
}

/** True when a row-major cell is an aisle/gap: inside the grid but not a desk. */
export function isAisleCell(layout: SeatLayout, index: number): boolean {
  return index >= 0 && index < layout.rows * layout.cols && !layout.seatOrder.includes(index);
}

/**
 * seatIndex for each of `count` roster positions (0-based), given a layout:
 *   1. defined desks in seat order (layout.seatOrder)
 *   2. then remaining in-grid cells, row-major
 *   3. then cells beyond the grid (overflow), ascending
 * Never repeats a seatIndex.
 */
export function placementForLayout(layout: SeatLayout, count: number): number[] {
  const used = new Set<number>();
  const order: number[] = [];
  const push = (i: number) => {
    if (!used.has(i)) {
      used.add(i);
      order.push(i);
    }
  };
  for (const i of layout.seatOrder) push(i);
  const gridSize = layout.rows * layout.cols;
  for (let i = 0; i < gridSize; i++) push(i);
  for (let i = gridSize; order.length < count; i++) push(i);
  return order.slice(0, count);
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.round(Number.isFinite(n) ? n : lo);
  return Math.min(hi, Math.max(lo, v));
}

/** Drop out-of-range/duplicate desks (keep first occurrence, order preserved); clamp size. */
export function normalizeSeatLayout(layout: SeatLayout): SeatLayout {
  const rows = clampInt(layout.rows, 1, 20);
  const cols = clampInt(layout.cols, 1, 20);
  const gridSize = rows * cols;
  const seen = new Set<number>();
  const seatOrder: number[] = [];
  for (const i of layout.seatOrder) {
    if (Number.isInteger(i) && i >= 0 && i < gridSize && !seen.has(i)) {
      seen.add(i);
      seatOrder.push(i);
    }
  }
  return { rows, cols, seatOrder };
}

/** Toggle a cell's desk membership: remove it if a desk, else append it as the next seat. */
export function toggleDeskCell(layout: SeatLayout, index: number): SeatLayout {
  if (index < 0 || index >= layout.rows * layout.cols) return layout;
  const seatOrder = layout.seatOrder.includes(index)
    ? layout.seatOrder.filter((i) => i !== index)
    : [...layout.seatOrder, index];
  return { ...layout, seatOrder };
}

/** Resize the grid, dropping any desks that fall outside the new bounds. */
export function resizeLayout(layout: SeatLayout, rows: number, cols: number): SeatLayout {
  return normalizeSeatLayout({ ...layout, rows, cols });
}

/** Remove all desks (every cell becomes an aisle). */
export function clearOrder(layout: SeatLayout): SeatLayout {
  return { ...layout, seatOrder: [] };
}

/**
 * New seatIndex for each currently-seated student (seatIndex != null), ordered by
 * their current seatIndex ascending and placed onto the layout's order. Unseated
 * students are omitted (left unchanged by the caller).
 */
export function planReseat(
  students: Pick<Student, "id" | "seatIndex">[],
  layout: SeatLayout
): { id: string; seatIndex: number }[] {
  const seated = students
    .filter((s): s is { id: string; seatIndex: number } => s.seatIndex != null)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const placement = placementForLayout(layout, seated.length);
  return seated.map((s, i) => ({ id: s.id, seatIndex: placement[i] }));
}
