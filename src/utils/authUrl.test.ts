import { describe, expect, it } from "vitest";
import { isRecoveryHash, parseAuthErrorFromHash } from "./authUrl";

describe("parseAuthErrorFromHash", () => {
  it("extracts and decodes the error description from a Supabase redirect hash", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(parseAuthErrorFromHash(hash)).toBe("Email link is invalid or has expired");
  });

  it("returns null when the hash carries a session instead of an error", () => {
    expect(parseAuthErrorFromHash("#access_token=abc123&type=recovery")).toBeNull();
  });

  it("returns null for an empty hash", () => {
    expect(parseAuthErrorFromHash("")).toBeNull();
  });

  it("works whether or not the leading # is included", () => {
    expect(parseAuthErrorFromHash("error_description=Something+broke")).toBe("Something broke");
  });
});

describe("isRecoveryHash", () => {
  it("returns true for a real recovery hash", () => {
    expect(isRecoveryHash("#access_token=abc123&refresh_token=def456&type=recovery")).toBe(true);
  });

  it("returns false for a non-recovery hash", () => {
    expect(isRecoveryHash("#access_token=abc123&refresh_token=def456&type=magiclink")).toBe(
      false,
    );
  });

  it("returns false for an empty hash", () => {
    expect(isRecoveryHash("")).toBe(false);
  });
});
