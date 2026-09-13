import { describe, expect, it } from "vitest";
import { buildGroups } from "./groups";

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
