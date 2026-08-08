import type { CategoryKey } from "../types";
import { CATEGORY_BY_KEY } from "../constants/categories";

interface CategoryPillProps {
  categoryKey: CategoryKey;
  /** Extra text after the label, e.g. a duration or count. */
  trailing?: string;
  showEmoji?: boolean;
  /** Dimmed outline style (used for unselected filter chips). */
  muted?: boolean;
  className?: string;
}

/** A small colored pill for a category, matching the log-an-event button colors. */
export default function CategoryPill({
  categoryKey,
  trailing,
  showEmoji = false,
  muted = false,
  className = "",
}: CategoryPillProps) {
  const cat = CATEGORY_BY_KEY[categoryKey];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={
        muted
          ? { backgroundColor: "transparent", color: cat.color, border: `1px solid ${cat.color}` }
          : { backgroundColor: cat.color, color: "#fff" }
      }
    >
      {showEmoji && <span aria-hidden>{cat.emoji}</span>}
      <span>{cat.label}</span>
      {trailing && <span className="font-semibold">{trailing}</span>}
    </span>
  );
}
