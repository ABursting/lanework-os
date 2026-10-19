/**
 * Compress windows — how old something has to be before Compress shows it.
 *
 * Four windows, one per section, each set by its own slider on the Compress
 * page. A fifth slider moves all four together, as a multiple of their
 * defaults, for when the whole search speeds up or slows down: at 0.5× every
 * section tightens by half; at 2× everything gets twice the room.
 *
 * Browser-safe on purpose — the Compress page filters in the browser as the
 * sliders move, so nothing has to go back to the server to see the effect.
 */

import {
  IGNORED_REMINDER_DAYS, OVERDUE_TASK_DAYS, STALE_APPLICATION_DAYS, STALE_CONTACT_DAYS,
} from "./constants";
import { daysBetween, toCivilDate, type CivilDate } from "./time";
import type { Task, UserSettings } from "./types";

export type WindowKey = keyof UserSettings;

export const WINDOW_KEYS: WindowKey[] = [
  "compress_job_days",
  "compress_contact_days",
  "compress_task_days",
  "compress_reminder_days",
];

export const COMPRESS_DEFAULTS: UserSettings = {
  compress_job_days: STALE_APPLICATION_DAYS,
  compress_contact_days: STALE_CONTACT_DAYS,
  compress_task_days: OVERDUE_TASK_DAYS,
  compress_reminder_days: IGNORED_REMINDER_DAYS,
};

/**
 * Slider ranges. Kept inside the database's own CHECK bounds (1–365, and 0
 * for reminders), but narrower, so a slider's travel is usable rather than
 * spanning a year in a few pixels.
 */
export const WINDOW_BOUNDS: Record<WindowKey, { min: number; max: number }> = {
  compress_job_days: { min: 1, max: 120 },
  compress_contact_days: { min: 1, max: 120 },
  compress_task_days: { min: 1, max: 60 },
  compress_reminder_days: { min: 0, max: 30 },
};

/** The all-windows slider runs from a quarter of the defaults to triple. */
export const SCALE_BOUNDS = { min: 0.25, max: 3, step: 0.05 };

export function clampWindow(key: WindowKey, days: number): number {
  const { min, max } = WINDOW_BOUNDS[key];
  if (!Number.isFinite(days)) return COMPRESS_DEFAULTS[key];
  return Math.min(max, Math.max(min, Math.round(days)));
}

/** Every window set to `scale` × its default, rounded and clamped. */
export function scaleWindows(scale: number): UserSettings {
  return Object.fromEntries(
    WINDOW_KEYS.map((key) => [key, clampWindow(key, COMPRESS_DEFAULTS[key] * scale)]),
  ) as unknown as UserSettings;
}

/**
 * The multiple the settings sit at, or null when the sliders have been moved
 * separately and no single multiple describes them.
 */
export function uniformScale(settings: UserSettings): number | null {
  const scale = settings.compress_job_days / COMPRESS_DEFAULTS.compress_job_days;
  // Snap to the slider's own step, then see whether that one number
  // reproduces every window.
  const snapped = Math.round(scale / SCALE_BOUNDS.step) * SCALE_BOUNDS.step;
  const candidate = Math.min(SCALE_BOUNDS.max, Math.max(SCALE_BOUNDS.min, snapped));
  const rebuilt = scaleWindows(candidate);
  return WINDOW_KEYS.every((key) => rebuilt[key] === settings[key]) ? candidate : null;
}

/** Validate a settings patch from the browser. Unknown keys are ignored. */
export function sanitizeSettings(input: Record<string, unknown>): Partial<UserSettings> {
  const out: Partial<UserSettings> = {};
  for (const key of WINDOW_KEYS) {
    const raw = input[key];

    /*
      Only a number, or a string that is one. Everything else is dropped
      rather than coerced, because JavaScript's coercions are generous in
      exactly the wrong direction here: Number(null), Number("") and
      Number([]) are all 0, which is finite, which used to clamp up to the
      window's minimum. A cleared field therefore became a one-day window —
      and a one-day window surfaces the entire board at once.

      Not reachable from the Compress page, whose sliders always send a
      number. It matters because this is the validation for a public route,
      and dropping the key leaves whatever is stored alone, which is the safe
      outcome for a value nobody actually chose.
    */
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;

    if (!Number.isFinite(n)) continue;
    out[key] = clampWindow(key, n);
  }
  return out;
}

/**
 * How long a task has been waiting, for the tasks window.
 *
 * A task with a due date is measured from that date — days past due, and
 * negative while it is still ahead. A task with none has nothing to be late
 * against, so it is measured from the day it was created: an undated task
 * sitting open for weeks is exactly the backlog Compress is for.
 */
export function taskAge(
  task: Pick<Task, "due_date" | "created_at">,
  now: CivilDate,
): { days: number; since: "due" | "created" } {
  if (task.due_date) return { days: daysBetween(task.due_date, now), since: "due" };
  return { days: daysBetween(toCivilDate(new Date(task.created_at)), now), since: "created" };
}
