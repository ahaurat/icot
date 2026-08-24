import type { ClassRoom } from "../types";

/** Sorts by the leading number in the class name (e.g. "Period 2" < "Period 10"); falls back to alphabetical for names without one. */
export function sortByPeriod<T extends Pick<ClassRoom, "name">>(classes: T[]): T[] {
  return [...classes].sort((a, b) => {
    const na = parseInt(a.name.match(/\d+/)?.[0] ?? "", 10);
    const nb = parseInt(b.name.match(/\d+/)?.[0] ?? "", 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.name.localeCompare(b.name);
  });
}
