export interface NamedStudent {
  firstName: string;
  lastName: string;
}

/** "First Last"; a lone first name (empty lastName) renders without a trailing space. */
export function studentFullName(s: NamedStudent): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

/** Case-insensitive "last first" key for alphabetical-by-last-name sorting. */
export function studentSortKey(s: NamedStudent): string {
  return `${s.lastName} ${s.firstName}`.trim().toLowerCase();
}

/**
 * Splits a single legacy "First Middle Last" string on its first space:
 * everything before is the first name, everything after (possibly empty) is
 * the last name. Used to migrate student records written before first/last
 * were tracked separately.
 */
export function splitLegacyName(raw: string): NamedStudent {
  const s = raw.trim().replace(/\s+/g, " ");
  const space = s.indexOf(" ");
  if (space === -1) return { firstName: s, lastName: "" };
  return { firstName: s.slice(0, space), lastName: s.slice(space + 1) };
}
