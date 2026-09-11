// Time + date helpers. All "today"/"year" comparisons use the local timezone,
// matching how a teacher thinks about a school day.

import type { AppEvent, ViewPeriod } from "../types";

/** Human-readable duration, e.g. 95 -> "1m 35s", 3725 -> "1h 2m 5s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** Local YYYY-MM-DD key for a date. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayDateKey(): string {
  return localDateKey(new Date());
}

/** Parse a YYYY-MM-DD string as local midnight. */
export function parseDateOnlyLocal(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Whether an ISO timestamp falls on today's local calendar day. */
export function isToday(iso: string): boolean {
  return localDateKey(new Date(iso)) === todayDateKey();
}

/** Whether an ISO timestamp is on/after the school-year start (local midnight). */
export function isInSchoolYear(iso: string, schoolYearStart: string): boolean {
  return new Date(iso).getTime() >= parseDateOnlyLocal(schoolYearStart).getTime();
}

/**
 * Default school-year start: Aug 1 of the current school year. Aug or later ->
 * this calendar year's Aug 1; before Aug -> last calendar year's Aug 1.
 */
export function defaultSchoolYearStart(now: Date = new Date()): string {
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}

/** Elapsed whole seconds between an ISO start and now (or a given end). */
export function elapsedSeconds(startIso: string, end: Date = new Date()): number {
  return Math.max(0, Math.round((end.getTime() - new Date(startIso).getTime()) / 1000));
}

/** Like formatDuration but drops zero parts, e.g. 300 -> "5m", 305 -> "5m 5s". */
export function formatDurationCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** Compact minutes for desk badges, e.g. 635 -> "10m", 35 -> "<1m". */
export function formatMinutesShort(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  if (m < 1) return totalSeconds > 0 ? "<1m" : "0m";
  return `${m}m`;
}

/** Human-readable value for one event: a tally count, or its duration (elapsed-so-far if still running). */
export function describeEventDuration(e: AppEvent): string {
  if (e.type === "count") return "1×";
  if (e.open) return `${formatDuration(elapsedSeconds(e.startedAt))} (running)`;
  return formatDuration(e.durationSeconds ?? 0);
}

// ---- Date ranges (for the Summary view + History filter) ----

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export type RangePreset = "today" | "yesterday" | "week" | "month" | "year";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday-based start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

/** Build a DateRange for a named preset (relative to now / the school year). */
export function presetRange(preset: RangePreset, schoolYearStart: string, now: Date = new Date()): DateRange {
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y), label: "Yesterday" };
    }
    case "week":
      return { start: startOfWeek(now), end: endOfDay(now), label: "This week" };
    case "month":
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
        label: "This month",
      };
    case "year":
      return {
        start: parseDateOnlyLocal(schoolYearStart),
        end: endOfDay(now),
        label: "This school year",
      };
  }
}

/** Build a DateRange from two YYYY-MM-DD inputs (inclusive of both days). */
export function customRange(startDateOnly: string, endDateOnly: string): DateRange {
  const start = parseDateOnlyLocal(startDateOnly);
  const end = endOfDay(parseDateOnlyLocal(endDateOnly));
  return {
    start,
    end,
    label:
      startDateOnly === endDateOnly
        ? start.toLocaleDateString()
        : `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
  };
}

/** Whether an ISO timestamp falls within [start, end]. */
export function isInRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/** ISO timestamp -> value for an <input type="datetime-local"> (local time). */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO timestamp. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

/**
 * The date range the standing "Period" totals column reflects: the teacher's
 * custom start/end when configured, otherwise the whole school year to date.
 */
export function resolveViewPeriodRange(
  viewPeriod: ViewPeriod,
  schoolYearStart: string,
  now: Date = new Date()
): DateRange {
  if (viewPeriod.mode === "custom" && viewPeriod.customStart && viewPeriod.customEnd) {
    return customRange(viewPeriod.customStart, viewPeriod.customEnd);
  }
  return presetRange("year", schoolYearStart, now);
}
