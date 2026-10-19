import type { CSSProperties } from "react";
import type {
  Lane, Stage, RelationshipType, TaskType, GoalMetric, MemorySourceType, EventKind,
  ApplicationKind,
} from "./types";

/**
 * Display vocabulary — labels and colour treatments.
 *
 * Colours resolve to the theme's CSS variables rather than Tailwind classes.
 * Lane and stage colours are applied as a base plus tints (a 16% fill, a 40%
 * edge), which is what the mockup does; expressing that as inline style off a
 * single var keeps the tint arithmetic in one place instead of scattering
 * arbitrary-value utilities that Tailwind's scanner cannot see anyway.
 */

export const LANE_LABEL: Record<Lane, string> = {
  primary: "Primary",
  secondary: "Secondary",
  peripheral: "Peripheral",
};

export const LANE_VAR: Record<Lane, string> = {
  primary: "var(--color-lane-primary)",
  secondary: "var(--color-lane-secondary)",
  peripheral: "var(--color-lane-peripheral)",
};

/** Ranked strongest-first. Used to derive a company's lane from its roles. */
export const LANE_RANK: Record<Lane, number> = {
  primary: 3,
  secondary: 2,
  peripheral: 1,
};

export function laneColor(lane: Lane | null | undefined): string {
  return lane ? LANE_VAR[lane] : "var(--color-neutral-600)";
}

export function tint(color: string, pct: number): string {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
}

/** Text in the lane colour on a tinted ground with a matching edge. */
export function laneBadgeStyle(lane: Lane | null | undefined): CSSProperties {
  const c = laneColor(lane);
  return { color: c, background: tint(c, 16), borderColor: tint(c, 40) };
}

export function laneTextStyle(lane: Lane | null | undefined): CSSProperties {
  return { color: laneColor(lane) };
}

export const STAGE_LABEL: Record<Stage, string> = {
  researching: "Researching",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  archived: "Archived",
};

export const STAGE_VAR: Record<Stage, string> = {
  // The token survived the Aug 31 removal in globals.css, so Researching comes
  // back in the same quiet grey it left in.
  researching: "var(--color-stage-researching)",
  applied: "var(--color-stage-applied)",
  interviewing: "var(--color-stage-interviewing)",
  offer: "var(--color-stage-offer)",
  rejected: "var(--color-stage-rejected)",
  archived: "var(--color-stage-archived)",
};

export function stageColor(stage: Stage): string {
  return STAGE_VAR[stage];
}

export const KIND_LABEL: Record<ApplicationKind, string> = {
  job: "Job",
  grad_school: "Grad school",
};

export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  recruiter: "Recruiter",
  alum: "Alum",
  referral: "Referral",
  hiring_manager: "Hiring manager",
  peer: "Peer",
  other: "Other",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  application: "Application",
  networking_outreach: "Outreach",
  informational_interview_followup: "Info-interview follow-up",
  interview_prep: "Interview prep",
  research: "Research",
  admin: "Admin",
  other: "Other",
};

/**
 * A colour per task category — one hue per category, everywhere it appears.
 *
 * These are chart colours first. The earlier set borrowed the theme's own lane
 * and status tokens, which looked right as chips but failed as adjacent fills:
 * interview-prep and informational sat at ΔE 5.6 in *normal* vision, and admin
 * and other were effectively grey. Validated with the dataviz palette checker
 * against this app's dark panel surface (#232532) — lightness band, chroma
 * floor, CVD separation (worst adjacent ΔE 8.4 protan), normal-vision floor
 * (19.3) and contrast all pass.
 *
 * The interface stays calm because chips render them as a 15% tint behind
 * coloured text, not as full-strength fills; the timeline uses them at full
 * strength, where the separation is what matters. Same colour either way, so a
 * category means one thing wherever you meet it.
 *
 * Assigned in TASK_TYPES order and never cycled: a category keeps its hue even
 * when others are filtered out.
 */
export const TASK_TYPE_VAR: Record<TaskType, string> = {
  application: "#3987e5",                       // blue
  networking_outreach: "#d95926",               // orange
  informational_interview_followup: "#199e70",  // aqua
  interview_prep: "#c98500",                    // yellow
  research: "#d55181",                          // magenta
  admin: "#008300",                             // green
  other: "#9085e9",                             // violet
};

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  applications: "Applications submitted",
  networking_outreach: "Outreach sent",
  informational_interviews: "Informational interviews",
  manual: "Tracked by hand",
};

export const MEMORY_KIND_LABEL: Record<MemorySourceType, string> = {
  capture: "Capture",
  stage_change: "Status",
  task_completed: "Done",
  weekly_review: "Review",
  habit_note: "Habit",
  contact_touch: "Contact",
  crm_change: "CRM",
};

/** The Brain list tints its kind label by source, as the mockup does. */
export const MEMORY_KIND_VAR: Record<MemorySourceType, string> = {
  capture: "var(--color-accent)",
  stage_change: "var(--color-accent)",
  task_completed: "var(--color-lane-secondary)",
  weekly_review: "var(--color-lane-peripheral)",
  habit_note: "var(--color-neutral-500)",
  contact_touch: "var(--color-lane-secondary)",
  crm_change: "var(--color-neutral-500)",
};

/** "1d" / "12d" / "—". Staleness colours red past the threshold. */
export function touchLabel(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "today";
  return `${days}d`;
}

export function touchColor(days: number | null, staleAt: number): string {
  if (days === null) return "var(--color-faint)";
  if (days >= staleAt) return "var(--color-danger)";
  if (days >= Math.floor(staleAt / 2)) return "var(--color-muted)";
  return "var(--color-text)";
}

/** Sentence-case a snake_case enum for anywhere without an explicit label map. */
export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Calendar event kinds.
 *
 * An iCal feed carries no such field, so the kind is inferred when the feed is
 * parsed — see src/lib/calendar.ts. These are just how each one renders.
 */
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  interview: "Interview",
  informational: "Informational",
  deadline: "Deadline",
  networking: "Networking",
  apply: "Apply",
  other: "Other",
};

export const EVENT_KIND_VAR: Record<EventKind, string> = {
  interview: "var(--color-lane-primary)",
  informational: "var(--color-lane-secondary)",
  deadline: "var(--color-danger)",
  networking: "var(--color-lane-peripheral)",
  // A reminder to apply is a prompt to act, not an appointment — the app's
  // own accent, so it reads as the dashboard talking rather than the feed.
  apply: "var(--color-accent)",
  other: "var(--color-neutral-500)",
};

/**
 * Only http(s) links are rendered. The field is free text, and an href of
 * "javascript:…" would run as code when clicked.
 */
export function safeHref(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
