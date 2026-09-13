import { describe, expect, it, vi } from "vitest";
import { shuffleSeats } from "./seatRandomizer";

describe("shuffleSeats", () => {
  it("returns an empty array for no seated students", () => {
    expect(shuffleSeats([])).toEqual([]);
  });

  it("preserves the exact set of ids and the exact set of seat indices", () => {
    const input = [
      { id: "a", seatIndex: 5 },
      { id: "b", seatIndex: 1 },
      { id: "c", seatIndex: 3 },
    ];
    const result = shuffleSeats(input);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    expect(result.map((r) => r.seatIndex).sort((x, y) => x - y)).toEqual([1, 3, 5]);
  });

  it("produces the expected permutation for a mocked Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const input = [
      { id: "a", seatIndex: 10 },
      { id: "b", seatIndex: 20 },
      { id: "c", seatIndex: 30 },
    ];
    const result = shuffleSeats(input);
    // Fisher-Yates with random() always 0: i=2 swaps ids[2]<->ids[0] -> [c,b,a];
    // i=1 swaps ids[1]<->ids[0] -> [b,c,a]. Sorted indices [10,20,30] zip onto that order.
    expect(result).toEqual([
      { id: "b", seatIndex: 10 },
      { id: "c", seatIndex: 20 },
      { id: "a", seatIndex: 30 },
    ]);
    vi.restoreAllMocks();
  });
});
