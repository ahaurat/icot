import { describe, expect, it } from "vitest";
import { sortByPeriod } from "./classSort";

function named(names: string[]) {
  return names.map((name) => ({ name }));
}

describe("sortByPeriod", () => {
  it("sorts numerically, not alphabetically", () => {
    const sorted = sortByPeriod(named(["Period 5", "Period 2", "Period 3", "Period 1", "Period 6"]));
    expect(sorted.map((c) => c.name)).toEqual([
      "Period 1",
      "Period 2",
      "Period 3",
      "Period 5",
      "Period 6",
    ]);
  });

  it("keeps double digits after single digits", () => {
    const sorted = sortByPeriod(named(["Period 10", "Period 2"]));
    expect(sorted.map((c) => c.name)).toEqual(["Period 2", "Period 10"]);
  });

  it("does not mutate the input array", () => {
    const input = named(["Period 2", "Period 1"]);
    sortByPeriod(input);
    expect(input.map((c) => c.name)).toEqual(["Period 2", "Period 1"]);
  });

  it("falls back to alphabetical for names without a number", () => {
    const sorted = sortByPeriod(named(["Zebra", "Apple"]));
    expect(sorted.map((c) => c.name)).toEqual(["Apple", "Zebra"]);
  });
});
