import { describe, expect, it } from "vitest";
import { isNetworkError } from "./networkError";

describe("isNetworkError", () => {
  it("recognizes Safari's fetch failure message", () => {
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
  });

  it("recognizes Chrome's fetch failure message", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
  });

  it("recognizes Firefox's fetch failure message", () => {
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
  });

  it("is case-insensitive and works on plain strings", () => {
    expect(isNetworkError("TypeError: LOAD FAILED")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isNetworkError(new Error("Supabase save settings failed: permission denied"))).toBe(false);
  });
});
