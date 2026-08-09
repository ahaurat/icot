import { describe, expect, it } from "vitest";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { deskCount, isAisleCell, normalizeSeatLayout, placementForLayout } from "./seatLayout";
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
