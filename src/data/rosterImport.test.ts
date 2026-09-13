import { describe, expect, it } from "vitest";
import { splitRosterName } from "./rosterImport";

describe("splitRosterName", () => {
  it('splits a "Last, First" cell on the comma', () => {
    expect(splitRosterName("Lovelace, Ada")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("handles extra whitespace around the comma", () => {
    expect(splitRosterName("Lovelace ,  Ada")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("falls back to the first-space rule when there's no comma", () => {
    expect(splitRosterName("Oscar Mario Lopez")).toEqual({
      firstName: "Oscar",
      lastName: "Mario Lopez",
    });
  });

  it("gives a single-word name an empty last name", () => {
    expect(splitRosterName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});
