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
