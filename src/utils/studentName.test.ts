import { describe, expect, it } from "vitest";
import { splitLegacyName, studentFullName, studentSortKey } from "./studentName";

describe("studentFullName", () => {
  it("joins first and last with a space", () => {
    expect(studentFullName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
  });

  it("omits the trailing space when lastName is empty", () => {
    expect(studentFullName({ firstName: "Cher", lastName: "" })).toBe("Cher");
  });
});

describe("studentSortKey", () => {
  it("orders by last name then first name, case-insensitively", () => {
    expect(studentSortKey({ firstName: "ada", lastName: "Lovelace" })).toBe("lovelace ada");
  });
});

describe("splitLegacyName", () => {
  it("splits a simple two-word name on the space", () => {
    expect(splitLegacyName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("treats everything after the first space as the last name", () => {
    expect(splitLegacyName("Oscar Mario Lopez")).toEqual({
      firstName: "Oscar",
      lastName: "Mario Lopez",
    });
  });

  it("gives a single-word name an empty last name", () => {
    expect(splitLegacyName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });

  it("trims surrounding whitespace and collapses internal runs", () => {
    expect(splitLegacyName("  Ada   Lovelace  ")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });
});
