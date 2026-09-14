/**
 * Matches browser-level fetch failures (request never got a response), as
 * opposed to a real error response from the server. Message text varies by
 * engine: Safari says "Load failed", Chrome/Edge say "Failed to fetch",
 * Firefox says "NetworkError when attempting to fetch resource".
 */
export function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /load failed|failed to fetch|networkerror/i.test(message);
}

export const OFFLINE_MESSAGE = "Couldn't save — check your internet connection and try again.";
