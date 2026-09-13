import { describe, expect, it } from "vitest";
import { DEFAULT_SEAT_LAYOUT, DEFAULT_SEAT_ORDER } from "../constants/seatOrder";
import {
  clearOrder,
  deskCount,
  isAisleCell,
  normalizeSeatLayout,
  placementForLayout,
  planReseat,
  resizeLayout,
  spatialSweepOrder,
  toggleDeskCell,
} from "./seatLayout";
import type { SeatLayout } from "../types";

describe("deskCount", () => {
  it("counts the default layout's desks", () => {
    expect(deskCount(DEFAULT_SEAT_LAYOUT)).toBe(36);
  });
});

describe("isAisleCell", () => {
  it("is false for every cell of the dense default layout", () => {
    for (let i = 0; i < 36; i++) expect(isAisleCell(DEFAULT_SEAT_LAYOUT, i)).toBe(false);
  });
  it("is true for in-grid non-desk cells, false for desks and out-of-grid cells", () => {
    const layout: SeatLayout = { rows: 2, cols: 2, seatOrder: [0, 3] };
    expect(isAisleCell(layout, 0)).toBe(false); // desk
    expect(isAisleCell(layout, 1)).toBe(true); // aisle
    expect(isAisleCell(layout, 2)).toBe(true); // aisle
    expect(isAisleCell(layout, 3)).toBe(false); // desk
    expect(isAisleCell(layout, 4)).toBe(false); // out of grid
  });
});

describe("placementForLayout", () => {
  it("returns the seat order for the default layout at full count", () => {
    expect(placementForLayout(DEFAULT_SEAT_LAYOUT, 36)).toEqual(DEFAULT_SEAT_LAYOUT.seatOrder);
  });
  it("returns the first N desks for a partial roster", () => {
    expect(placementForLayout(DEFAULT_SEAT_LAYOUT, 3)).toEqual([32, 26, 20]);
  });
  it("overflows into leftover cells then new rows, without collisions", () => {
    const layout: SeatLayout = { rows: 1, cols: 3, seatOrder: [2, 0] };
    // desks 2,0; then remaining in-grid cell 1; then overflow 3,4
    expect(placementForLayout(layout, 5)).toEqual([2, 0, 1, 3, 4]);
    expect(new Set(placementForLayout(layout, 5)).size).toBe(5); // no dupes
  });
  it("returns [] for count 0", () => {
    expect(placementForLayout(DEFAULT_SEAT_LAYOUT, 0)).toEqual([]);
  });
});

describe("normalizeSeatLayout", () => {
  it("drops out-of-range and duplicate desks and clamps size", () => {
    const layout: SeatLayout = { rows: 6, cols: 6, seatOrder: [0, 0, 40, 3, -1] };
    expect(normalizeSeatLayout(layout)).toEqual({ rows: 6, cols: 6, seatOrder: [0, 3] });
  });
  it("clamps rows/cols into [1,20]", () => {
    expect(normalizeSeatLayout({ rows: 0, cols: 99, seatOrder: [] })).toEqual({
      rows: 1,
      cols: 20,
      seatOrder: [],
    });
  });
});

describe("toggleDeskCell", () => {
  it("appends a blank cell as the next seat", () => {
    const layout: SeatLayout = { rows: 2, cols: 2, seatOrder: [0] };
    expect(toggleDeskCell(layout, 3).seatOrder).toEqual([0, 3]);
  });
  it("removes a desk and keeps the rest in order (renumbering follows position)", () => {
    const layout: SeatLayout = { rows: 2, cols: 2, seatOrder: [0, 3, 1] };
    expect(toggleDeskCell(layout, 3).seatOrder).toEqual([0, 1]);
  });
  it("ignores out-of-grid indices", () => {
    const layout: SeatLayout = { rows: 2, cols: 2, seatOrder: [0] };
    expect(toggleDeskCell(layout, 9)).toEqual(layout);
  });
});

describe("resizeLayout", () => {
  it("drops desks outside the new bounds", () => {
    const layout: SeatLayout = { rows: 3, cols: 3, seatOrder: [0, 8, 4] };
    expect(resizeLayout(layout, 2, 2)).toEqual({ rows: 2, cols: 2, seatOrder: [0] });
  });
});

describe("clearOrder", () => {
  it("removes every desk", () => {
    const layout: SeatLayout = { rows: 2, cols: 2, seatOrder: [0, 1] };
    expect(clearOrder(layout)).toEqual({ rows: 2, cols: 2, seatOrder: [] });
  });
});

describe("spatialSweepOrder", () => {
  it("returns an empty array for no desks", () => {
    expect(spatialSweepOrder([], DEFAULT_SEAT_LAYOUT)).toEqual([]);
  });

  it("preserves the exact set of desk indices", () => {
    const desks = [2, 3, 8, 9, 14, 15];
    const layout: SeatLayout = { rows: 3, cols: 6, seatOrder: desks };
    expect(spatialSweepOrder(desks, layout).sort((a, b) => a - b)).toEqual(
      [...desks].sort((a, b) => a - b)
    );
  });

  it("sweeps a dense two-column block in boustrophedon order", () => {
    // Columns 2-3 across 4 rows on a 6-col grid.
    const desks = [2, 3, 8, 9, 14, 15, 20, 21];
    const layout: SeatLayout = { rows: 4, cols: 6, seatOrder: desks };
    expect(spatialSweepOrder(desks, layout)).toEqual([2, 3, 9, 8, 14, 15, 21, 20]);
  });

  it("keeps every consecutive pair grid-adjacent for DEFAULT_SEAT_ORDER's two-column demo class", () => {
    const firstTwelve = DEFAULT_SEAT_ORDER.slice(0, 12);
    const result = spatialSweepOrder(firstTwelve, DEFAULT_SEAT_LAYOUT);
    for (let i = 1; i < result.length; i++) {
      const prevRow = Math.floor(result[i - 1] / 6);
      const prevCol = result[i - 1] % 6;
      const row = Math.floor(result[i] / 6);
      const col = result[i] % 6;
      const adjacent =
        (prevRow === row && Math.abs(prevCol - col) === 1) ||
        (prevCol === col && Math.abs(prevRow - row) === 1);
      expect(adjacent).toBe(true);
    }
  });

  it("documents its limit: a row with desks on both sides of a gap is swept straight across it", () => {
    // A 6-col grid with a two-column gap in the middle of every row (desks at
    // cols 0,1 and 4,5, cols 2-3 are aisles) — a real, supported layout shape.
    const desks = [0, 1, 4, 5];
    const layout: SeatLayout = { rows: 1, cols: 6, seatOrder: desks };
    const result = spatialSweepOrder(desks, layout);
    // Ideally this row would sweep as two separate near clusters; instead the
    // single row's columns are all swept together, landing col 1 next to
    // col 4 even though they're on opposite sides of the gap.
    expect(result).toEqual([0, 1, 4, 5]);
    const gapCrossed = result.some((seat, i) => i > 0 && Math.abs(seat - result[i - 1]) > 1);
    expect(gapCrossed).toBe(true);
  });
});

describe("planReseat", () => {
  it("re-seats currently-seated students by ascending seatIndex, omitting unseated", () => {
    const layout: SeatLayout = { rows: 6, cols: 6, seatOrder: [32, 26, 20] };
    const students = [
      { id: "c", seatIndex: 8 },
      { id: "a", seatIndex: 2 },
      { id: "u", seatIndex: null },
      { id: "b", seatIndex: 5 },
    ];
    // sorted by seatIndex: a(2), b(5), c(8) -> placement [32,26,20]
    expect(planReseat(students, layout)).toEqual([
      { id: "a", seatIndex: 32 },
      { id: "b", seatIndex: 26 },
      { id: "c", seatIndex: 20 },
    ]);
  });
});
