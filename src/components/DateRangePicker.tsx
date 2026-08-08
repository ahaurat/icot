import { useState } from "react";
import type { DateRange, RangePreset } from "../utils/time";
import { customRange, localDateKey, presetRange } from "../utils/time";
import { useAppStore } from "../state/useAppStore";

const PRESETS: RangePreset[] = ["today", "yesterday", "week", "month", "year"];

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const schoolYearStart = useAppStore((s) => s.settings.schoolYearStart);
  const [customStart, setCustomStart] = useState(localDateKey(value.start));
  const [customEnd, setCustomEnd] = useState(localDateKey(value.end));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const r = presetRange(p, schoolYearStart);
          const active = value.label === r.label;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(r)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active ? "bg-blue-500 text-white" : "border bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span>Custom:</span>
        <input
          type="date"
          className="rounded border p-1"
          value={customStart}
          max={customEnd}
          onChange={(e) => {
            setCustomStart(e.target.value);
            onChange(customRange(e.target.value, customEnd));
          }}
        />
        <span>to</span>
        <input
          type="date"
          className="rounded border p-1"
          value={customEnd}
          min={customStart}
          onChange={(e) => {
            setCustomEnd(e.target.value);
            onChange(customRange(customStart, e.target.value));
          }}
        />
      </div>
    </div>
  );
}
