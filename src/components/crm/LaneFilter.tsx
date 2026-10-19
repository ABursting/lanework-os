"use client";

import { LANE_LABEL, laneColor, tint } from "@/lib/display";
import { LANES, type Lane } from "@/lib/types";

export type LaneFilterValue = Lane | "all";

/** The All / Primary / Secondary / Peripheral chip row above the CRM tables. */
export function LaneFilter({
  value,
  onChange,
}: {
  value: LaneFilterValue;
  onChange: (v: LaneFilterValue) => void;
}) {
  const options: LaneFilterValue[] = ["all", ...LANES];

  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const active = value === option;
        const color = option === "all" ? "var(--color-accent)" : laneColor(option as Lane);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="rounded-md px-[11px] py-[5px] text-[11px] uppercase tracking-[0.06em] transition-colors"
            style={{
              color: active ? color : "var(--color-muted)",
              border: `1px solid ${active ? tint(color, 42) : "var(--color-edge-strong)"}`,
              background: active ? tint(color, 14) : "transparent",
            }}
            aria-pressed={active}
          >
            {option === "all" ? "All" : LANE_LABEL[option as Lane]}
          </button>
        );
      })}
    </div>
  );
}
