/**
 * Reminders to apply — the date arithmetic, in one place.
 *
 * A Researching role can carry a deadline and a remind-me date. This module
 * decides what the remind-me date should be when you have not typed one, and
 * when an ignored reminder should come back in Compress. It is imported by the
 * browser (the confirm screens preview the date as you choose) and by the
 * server (which fills one in if the browser sent none), so both agree.
 *
 * No clock of its own: every function takes `now` as a civil date, and all
 * day maths goes through src/lib/time.ts.
 */

import {
  ESTIMATED_REMINDER_AFTER_POSTING_DAYS, REMINDER_LEAD_DAYS, RESURFACE_BEFORE_DEADLINE_DAYS,
} from "./constants";
import { addDays, type CivilDate } from "./time";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string, or null for anything else. */
export function civilOrNull(value: unknown): CivilDate | null {
  return typeof value === "string" && ISO_DATE.test(value.trim()) ? value.trim() : null;
}

const later = (a: CivilDate, b: CivilDate): CivilDate => (a > b ? a : b);
const earlier = (a: CivilDate, b: CivilDate): CivilDate => (a < b ? a : b);

/**
 * How far ahead to be reminded, as offered on the confirm screens.
 * "date" means a specific day you pick.
 */
export type ReminderChoice = "default" | "7" | "14" | "date";

export const REMINDER_CHOICES: ReminderChoice[] = ["default", "7", "14", "date"];

export function reminderChoiceLabel(choice: ReminderChoice, hasDeadline: boolean): string {
  const rel = hasDeadline ? " before" : "";
  const pre = hasDeadline ? "" : "In ";
  switch (choice) {
    case "default":
      return `${pre}${REMINDER_LEAD_DAYS} days${rel} (default)`;
    case "7":
      return `${pre}1 week${rel}`;
    case "14":
      return `${pre}2 weeks${rel}`;
    case "date":
      return "On a date…";
  }
}

export function leadDaysFor(choice: ReminderChoice): number {
  return choice === "7" ? 7 : choice === "14" ? 14 : REMINDER_LEAD_DAYS;
}

/**
 * The reminder for a lead time.
 *
 * With a deadline it counts back from the deadline; without one it counts
 * forward from today, so "in 10 days" still means something for a rolling
 * application. Never earlier than today — a reminder for a day already gone
 * is one you will never see.
 */
export function reminderForLead(
  deadline: CivilDate | null,
  leadDays: number,
  now: CivilDate,
): CivilDate {
  if (deadline) return later(now, addDays(deadline, -leadDays));
  return addDays(now, leadDays);
}

/**
 * A reminder for a listing that shows only when it was posted.
 *
 * A posting date is not a deadline, so this is a guess and is stored as
 * estimated. `seenOn` is the day the screenshot was read, which is what
 * "posted 3 weeks ago" was relative to.
 */
export function estimatedReminderFromPosting(
  postedDaysAgo: number,
  seenOn: CivilDate,
  now: CivilDate,
): CivilDate {
  const posted = addDays(seenOn, -Math.max(0, Math.round(postedDaysAgo)));
  return later(now, addDays(posted, ESTIMATED_REMINDER_AFTER_POSTING_DAYS));
}

/**
 * When an ignored reminder comes back in Compress.
 *
 * `windowDays` after the reminder, but never later than two days before the
 * deadline — and never before the reminder itself, which gets its own day on
 * the calendar first. A role with a deadline and no reminder resurfaces two
 * days out. A role with neither has nothing to resurface on.
 */
export function resurfaceOn(
  remindOn: CivilDate | null,
  deadline: CivilDate | null,
  windowDays: number,
): CivilDate | null {
  const cap = deadline ? addDays(deadline, -RESURFACE_BEFORE_DEADLINE_DAYS) : null;
  if (!remindOn) return cap;
  const afterWindow = addDays(remindOn, Math.max(0, windowDays));
  return cap ? later(remindOn, earlier(afterWindow, cap)) : afterWindow;
}

export type ReminderState =
  /** Nothing to remind about: no reminder date and no deadline. */
  | "undated"
  /** The reminder has not come round yet, or is still inside its window. */
  | "waiting"
  /** Past its window with the role still in Researching. */
  | "ignored"
  /** The deadline itself has passed. */
  | "missed";

export function reminderState(
  role: { remind_on: CivilDate | null; deadline: CivilDate | null },
  windowDays: number,
  now: CivilDate,
): ReminderState {
  if (role.deadline && role.deadline < now) return "missed";
  const resurface = resurfaceOn(role.remind_on, role.deadline, windowDays);
  if (!resurface) return "undated";
  return now >= resurface ? "ignored" : "waiting";
}
