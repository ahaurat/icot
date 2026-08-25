import { describe, expect, it, vi } from "vitest";
import { isPickableStudent, pickStudent } from "./randomPicker";

describe("isPickableStudent", () => {
  it("is true for an active, seated student", () => {
    expect(isPickableStudent({ active: true, seatIndex: 3 })).toBe(true);
  });
  it("is false for an inactive student", () => {
    expect(isPickableStudent({ active: false, seatIndex: 3 })).toBe(false);
  });
  it("is false for an active but unseated student", () => {
    expect(isPickableStudent({ active: true, seatIndex: null })).toBe(false);
  });
});

describe("pickStudent", () => {
  it("returns null when there are no active students", () => {
    expect(pickStudent([], { mode: "random", resetDaily: true }, undefined, "2026-08-24")).toBeNull();
  });

  it("fully random mode picks from the whole roster, ignoring progress, and reports no progress change", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // picks index 0
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "random", resetDaily: true },
      { calledStudentIds: ["a", "b", "c"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a");
    expect(result?.progress).toBeNull();
    vi.restoreAllMocks();
  });

  it("cycle mode excludes already-called students", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // picks first eligible
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("b"); // eligible = [b, c], index 0 = b
    expect(result?.progress?.calledStudentIds).toEqual(["a", "b"]);
    vi.restoreAllMocks();
  });

  it("cycle mode auto-restarts when the pool is exhausted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a", "b"], cycleStartDate: "2026-08-24" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a"); // pool refilled to [a, b], index 0 = a
    expect(result?.progress?.calledStudentIds).toEqual(["a"]);
    vi.restoreAllMocks();
  });

  it("cycle mode resets on a new calendar day when resetDaily is true", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: true },
      { calledStudentIds: ["a", "b"], cycleStartDate: "2026-08-23" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("a"); // list cleared, then picked from full roster
    expect(result?.progress?.calledStudentIds).toEqual(["a"]);
    expect(result?.progress?.cycleStartDate).toBe("2026-08-24");
    vi.restoreAllMocks();
  });

  it("cycle mode does not reset on a new calendar day when resetDaily is false", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = pickStudent(
      ["a", "b", "c"],
      { mode: "cycle", resetDaily: false },
      { calledStudentIds: ["a"], cycleStartDate: "2026-08-23" },
      "2026-08-24"
    );
    expect(result?.studentId).toBe("b"); // eligible = [b, c], not reset
    expect(result?.progress?.calledStudentIds).toEqual(["a", "b"]);
    expect(result?.progress?.cycleStartDate).toBe("2026-08-23"); // unchanged
    vi.restoreAllMocks();
  });
});
