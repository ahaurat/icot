// Assumes Supabase's default implicit auth flow, which returns recovery
// tokens and errors in the URL hash (#...). If flowType is ever switched to
// "pkce", these also need to check the query string (?...).

/**
 * Extracts a human-readable error message from a Supabase auth redirect's URL
 * hash, e.g. "#error=access_denied&error_code=otp_expired&error_description=
 * Email+link+is+invalid+or+has+expired" (sent back when a recovery or OAuth
 * link is expired or already used). Returns null when the hash carries no
 * auth error (including a normal session hash, or an empty hash).
 */
export function parseAuthErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("error_description");
}

/**
 * True when a URL hash carries Supabase recovery tokens (type=recovery),
 * e.g. "#access_token=...&refresh_token=...&type=recovery". Used to detect
 * a password-recovery redirect synchronously, before the Supabase client
 * has asynchronously parsed and consumed the hash.
 */
export function isRecoveryHash(hash: string): boolean {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("type") === "recovery";
}
