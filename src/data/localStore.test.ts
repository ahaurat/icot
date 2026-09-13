import { describe, expect, it } from "vitest";
import { migrateStudent } from "./localStore";

describe("migrateStudent", () => {
  it("passes through a record that already has firstName/lastName", () => {
    const s = { id: "1", classId: "c1", firstName: "Ada", lastName: "Lovelace", seatIndex: 0, active: true };
    expect(migrateStudent(s as any)).toEqual({ ...s, groupColor: null });
  });

  it("splits a legacy single `name` field on the first space", () => {
    const legacy = { id: "1", classId: "c1", name: "Oscar Mario Lopez", seatIndex: 0, active: true } as any;
    expect(migrateStudent(legacy)).toEqual({
      id: "1",
      classId: "c1",
      firstName: "Oscar",
      lastName: "Mario Lopez",
      seatIndex: 0,
      active: true,
      groupColor: null,
    });
  });

  it("gives a legacy single-word name an empty last name", () => {
    const legacy = { id: "1", classId: "c1", name: "Cher", seatIndex: null, active: true } as any;
    expect(migrateStudent(legacy)).toEqual({
      id: "1",
      classId: "c1",
      firstName: "Cher",
      lastName: "",
      seatIndex: null,
      active: true,
      groupColor: null,
    });
  });

  it("preserves an existing groupColor instead of overwriting it", () => {
    const s = {
      id: "1",
      classId: "c1",
      firstName: "Ada",
      lastName: "Lovelace",
      seatIndex: 0,
      active: true,
      groupColor: "#fecaca",
    };
    expect(migrateStudent(s as any)).toEqual(s);
  });
});
