import type { SeatLayout } from "../types";

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
