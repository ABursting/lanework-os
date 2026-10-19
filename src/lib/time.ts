/**
 * The one place a day, week or month boundary is decided.
 *
 * Everything that cares about "today" — the habit reset, the daily_logs row,
 * goal periods, the calendar strip, staleness counts — calls in here. The
 * rule is that a boundary is resolved in APP_TIMEZONE, never from the
 * server's UTC date and never from `new Date().getDate()` on whatever machine
 * happens to be running. Vercel runs in UTC; between 6pm and midnight Central
 * the server's date is already tomorrow, and a habit grid that resets at 6pm
 * or a daily_log written under the wrong date is the result.
 *
 * Civil dates are plain "YYYY-MM-DD" strings. All arithmetic on them is done
 * at UTC noon, which is far enough from either edge that a DST shift can
 * never push a date onto the neighbouring day.
 */

import { APP_TIMEZONE } from "./constants";

/** A civil date with no time and no zone: "2026-08-27". */
export type CivilDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertCivil(date: CivilDate): void {
  if (!ISO_DATE.test(date)) {
    throw new Error(`Expected a YYYY-MM-DD civil date, got: ${JSON.stringify(date)}`);
  }
}

/** The civil date an instant falls on, as seen from `tz`. */
export function toCivilDate(instant: Date = new Date(), tz: string = APP_TIMEZONE): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today, in the operator's zone. The canonical "what day is it". */
export function today(tz: string = APP_TIMEZONE): CivilDate {
  return toCivilDate(new Date(), tz);
}

/** A civil date as a Date pinned to UTC noon — safe for date arithmetic. */
function atUtcNoon(date: CivilDate): Date {
  assertCivil(date);
  return new Date(`${date}T12:00:00.000Z`);
}

/** Shift a civil date by whole days. Negative goes backwards. */
export function addDays(date: CivilDate, days: number): CivilDate {
  const d = atUtcNoon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: CivilDate, months: number): CivilDate {
  const d = atUtcNoon(date);
  const targetMonth = d.getUTCMonth() + months;
  const dayOfMonth = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  // Clamp: Jan 31 + 1 month is Feb 28/29, not Mar 2/3.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, lastDay));
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a civil date. */
export function dayOfWeek(date: CivilDate): number {
  return atUtcNoon(date).getUTCDay();
}

/** The Monday of the week a civil date falls in. */
export function startOfWeek(date: CivilDate = today()): CivilDate {
  const dow = dayOfWeek(date);
  // Monday-start: Sunday (0) belongs to the week that began six days earlier.
  const back = (dow + 6) % 7;
  return addDays(date, -back);
}

/** The Sunday closing the week a civil date falls in. */
export function endOfWeek(date: CivilDate = today()): CivilDate {
  return addDays(startOfWeek(date), 6);
}

/** The seven civil dates of that week, Monday first. */
export function weekDays(date: CivilDate = today()): CivilDate[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(date: CivilDate = today()): CivilDate {
  assertCivil(date);
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: CivilDate = today()): CivilDate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

/**
 * The exact instant local midnight begins on a civil date.
 *
 * This is the bridge between civil dates and the timestamptz columns: to ask
 * "what was created this week" you need the UTC instant that the operator's
 * Monday actually started at, which is not midnight UTC.
 */
export function startOfDayInstant(date: CivilDate, tz: string = APP_TIMEZONE): Date {
  assertCivil(date);
  const naive = Date.parse(`${date}T00:00:00Z`);
  // Solve for the instant whose local wall-clock reading is 00:00 on `date`.
  // One refinement pass settles the DST-transition case.
  let guess = naive - zoneOffsetMs(new Date(naive), tz);
  guess = naive - zoneOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** The instant the local day *after* `date` begins — an exclusive upper bound. */
export function endOfDayInstant(date: CivilDate, tz: string = APP_TIMEZONE): Date {
  return startOfDayInstant(addDays(date, 1), tz);
}

/** How far `tz` is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour"), get("minute"), get("second"),
  );
  return asIfUtc - instant.getTime();
}

/** Whole days from `from` to `to`. Positive means `to` is later. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((atUtcNoon(to).getTime() - atUtcNoon(from).getTime()) / 86_400_000);
}

/**
 * Whole local days since a timestamp. Used for every staleness read
 * (last_touched_at, last_contacted_at), so "12d quiet" counts calendar days
 * in the operator's zone rather than 24-hour blocks.
 */
export function daysSince(timestamp: string | Date | null | undefined): number | null {
  if (!timestamp) return null;
  const instant = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(instant.getTime())) return null;
  return daysBetween(toCivilDate(instant), today());
}

export function isToday(date: CivilDate | null | undefined): boolean {
  return !!date && date === today();
}

export function isPast(date: CivilDate | null | undefined): boolean {
  return !!date && date < today();
}

/** The period_start a goal in this scope would carry right now. */
export function currentPeriodStart(scope: "week" | "month", date: CivilDate = today()): CivilDate {
  return scope === "week" ? startOfWeek(date) : startOfMonth(date);
}

/* — display helpers — every label in the UI is formatted in APP_TIMEZONE — */

/** "AUG 27" */
export function formatShortDate(date: CivilDate): string {
  const d = atUtcNoon(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(d)
    .toUpperCase();
}

/** "Aug 24 — Aug 30, 2026" */
export function formatRange(from: CivilDate, to: CivilDate): string {
  const f = atUtcNoon(from);
  const t = atUtcNoon(to);
  const md = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric" }).format(t);
  return `${md.format(f)} — ${md.format(t)}, ${year}`;
}

/** "Mon" */
export function weekdayLabel(date: CivilDate): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" })
    .format(atUtcNoon(date));
}

/** "27" — the day number, no leading zero. */
export function dayNumber(date: CivilDate): string {
  return String(Number(date.slice(8, 10)));
}

/** "2:00pm" for an instant, read in the operator's zone. */
export function formatTime(instant: Date, tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  })
    .format(instant)
    .replace(/\s?([AP])M/, (_, m: string) => m.toLowerCase() + "m");
}

/** ISO week number — the "WEEK 35" stamp on the weekly review. */
export function isoWeekNumber(date: CivilDate = today()): number {
  const d = atUtcNoon(date);
  const dow = (d.getUTCDay() + 6) % 7;         // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow + 3);       // move to the week's Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
