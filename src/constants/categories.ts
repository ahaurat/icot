import type { CategoryKey, CategoryType } from "../types";

export interface CategoryConfig {
  key: CategoryKey;
  label: string;
  type: CategoryType;
  /** Hex color used for buttons/badges/pills (applied inline to avoid Tailwind purge issues). */
  color: string;
  /** Emoji shown on desk badges and in the summary. */
  emoji: string;
  /** Past-tense phrase for the daily summary, e.g. "went to the bathroom". */
  summaryVerb: string;
  /** True when the duration is typed in by the teacher (e.g. Tardy) rather than measured by starting/stopping a live timer. Only meaningful when type === "timed". */
  manualDuration?: boolean;
}

// Order here drives button order in the student modal.
// Timed = stopwatch with a duration; count = tap to tally one instance.
export const CATEGORIES: CategoryConfig[] = [
  { key: "bathroom", label: "Bathroom", type: "timed", color: "#f59e0b", emoji: "🚽", summaryVerb: "went to the bathroom" },
  { key: "nurse", label: "Nurse", type: "timed", color: "#22c55e", emoji: "🤒", summaryVerb: "went to the nurse" },
  { key: "office", label: "Office", type: "timed", color: "#3b82f6", emoji: "🏢", summaryVerb: "went to the office" },
  { key: "sleeping", label: "Sleeping", type: "timed", color: "#ec4899", emoji: "😴", summaryVerb: "slept" },
  { key: "other", label: "Other", type: "timed", color: "#ef4444", emoji: "🚪", summaryVerb: "was out of class (other)" },
  { key: "tardy", label: "Tardy", type: "timed", manualDuration: true, color: "#6366f1", emoji: "⏰", summaryVerb: "was tardy" },
  { key: "cellphone", label: "Cell Phone", type: "count", color: "#a855f7", emoji: "📱", summaryVerb: "had their cell phone out" },
  { key: "headphones", label: "Headphones", type: "count", color: "#6b7280", emoji: "🎧", summaryVerb: "had headphones in" },
  { key: "extracredit", label: "Extra Credit", type: "count", color: "#0d9488", emoji: "⭐", summaryVerb: "earned extra credit" },
];

export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryConfig> =
  Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<
    CategoryKey,
    CategoryConfig
  >;

export const TIMED_CATEGORIES = CATEGORIES.filter((c) => c.type === "timed");
export const COUNT_CATEGORIES = CATEGORIES.filter((c) => c.type === "count");
