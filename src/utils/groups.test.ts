import { describe, expect, it } from "vitest";
import { buildGroups, GROUP_COLOR_PALETTE, planGroupSeating } from "./groups";

describe("buildGroups", () => {
  it("returns no groups for an empty roster", () => {
    expect(buildGroups([], 4)).toEqual([]);
  });

  it("covers every id exactly once", () => {
    const ids = Array.from({ length: 18 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.flat().sort()).toEqual([...ids].sort());
  });

  it("uses ceil(n / targetSize) groups, sized within 1 of each other", () => {
    const ids = Array.from({ length: 18 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.length).toBe(5); // ceil(18/4)
    expect(groups.map((g) => g.length).sort((a, b) => a - b)).toEqual([3, 3, 4, 4, 4]);
  });

  it("splits an evenly-divisible roster into equal groups", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const groups = buildGroups(ids, 4);
    expect(groups.length).toBe(3);
    expect(groups.every((g) => g.length === 4)).toBe(true);
  });

  it("makes a single group when the roster is smaller than targetSize", () => {
    const groups = buildGroups(["a", "b"], 4);
    expect(groups.length).toBe(1);
    expect(groups[0].sort()).toEqual(["a", "b"]);
  });
});

describe("planGroupSeating", () => {
  it("assigns every student exactly one seat and one color, using only the given seats", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const seatOrder = [10, 11, 12, 13, 14, 15, 16, 17];
    const result = planGroupSeating(ids, seatOrder, 4);
    expect(result.map((r) => r.studentId).sort()).toEqual([...ids].sort());
    expect(result.map((r) => r.seatIndex).sort((a, b) => a - b)).toEqual(
      [...seatOrder].sort((a, b) => a - b)
    );
  });

  it("assigns the same color to every member of the same group", () => {
    const ids = ["a", "b", "c", "d"];
    const seatOrder = [100, 101, 102, 103];
    const result = planGroupSeating(ids, seatOrder, 2);
    const colorOf = (seatIndex: number) => result.find((r) => r.seatIndex === seatIndex)!.groupColor;
    // First 2 seat-order slots are one group, next 2 are the other group.
    expect(colorOf(100)).toBe(colorOf(101));
    expect(colorOf(102)).toBe(colorOf(103));
    expect(colorOf(100)).not.toBe(colorOf(102));
  });

  it("cycles the color palette when there are more groups than palette colors", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const seatOrder = Array.from({ length: 20 }, (_, i) => i);
    const result = planGroupSeating(ids, seatOrder, 1); // 20 groups of 1
    const colorsUsed = new Set(result.map((r) => r.groupColor));
    expect(colorsUsed.size).toBe(GROUP_COLOR_PALETTE.length);
  });
});
