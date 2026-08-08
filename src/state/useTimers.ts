import { useEffect, useState } from "react";

/**
 * Returns a `Date.now()` value that refreshes every second while `enabled`.
 * Components displaying a running stopwatch use this to recompute elapsed time
 * from an event's `startedAt`. When no timer is running, the interval is off.
 */
export function useNowTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
