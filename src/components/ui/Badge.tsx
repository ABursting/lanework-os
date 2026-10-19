import type { ReactNode } from "react";
import type { Lane } from "@/lib/types";
import { LANE_LABEL, laneBadgeStyle } from "@/lib/display";

/** The lane chip. Same treatment on applications, contacts, tasks and goals. */
export function LaneBadge({ lane, size = "sm" }: { lane: Lane | null | undefined; size?: "sm" | "xs" }) {
  if (!lane) return null;
  return (
    <span
      className={`inline-flex flex-none items-center rounded-[5px] border uppercase tracking-[0.08em] ${
        size === "xs" ? "px-[7px] py-[2px] text-[9.5px]" : "px-2 py-[2px] text-[10px]"
      }`}
      style={laneBadgeStyle(lane)}
    >
      {LANE_LABEL[lane]}
    </span>
  );
}

/** A neutral chip for anything that is not a lane. */
export function Chip({
  children,
  color,
  className = "",
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-[5px] px-2 py-[2px] text-[9.5px] uppercase tracking-[0.08em] ${className}`}
      style={
        color
          ? { color, background: `color-mix(in oklab, ${color} 15%, transparent)` }
          : {
              color: "var(--color-dim)",
              background: "color-mix(in oklab, var(--color-text) 7%, transparent)",
            }
      }
    >
      {children}
    </span>
  );
}

/**
 * The sticky resume-passed marker. Present but hollow when false, so the
 * column of cards stays aligned and "never got a look" reads as an absence
 * rather than a missing element.
 */
export function ResumePassedMark({ passed }: { passed: boolean }) {
  return (
    <span
      className="grid size-[15px] flex-none place-items-center rounded-full border text-[9px] leading-none"
      style={{
        color: passed ? "var(--color-pass)" : "transparent",
        background: passed ? "color-mix(in oklab, var(--color-pass) 16%, transparent)" : "transparent",
        borderColor: passed ? "color-mix(in oklab, var(--color-pass) 42%, transparent)" : "transparent",
      }}
      title={passed ? "Cleared the resume screen" : undefined}
      aria-label={passed ? "Cleared the resume screen" : undefined}
    >
      {passed ? "✓" : ""}
    </span>
  );
}
