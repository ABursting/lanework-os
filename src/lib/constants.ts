import { DEMO_MODE } from "./demo";

/**
 * The single-user configuration.
 *
 * v1 has no auth gate. Every row is written with USER_ID and every query
 * filters on it, so the whole app is already user-scoped — there just
 * happens to be exactly one user. Swapping in real auth means resolving
 * this value from the session instead of importing the constant; nothing
 * else in the app has to change.
 */

/** Hardcoded stand-in for the authenticated user. A uuid, so it can be
 *  pointed at Supabase's auth.uid() later without a schema migration. */
export const USER_ID = "a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60";

/**
 * Operator identity. There is no `profile` table — the scope's data model is
 * ten tables and none of them holds this — so these live beside USER_ID and
 * move with it when auth arrives. Edit them here; nothing else reads them.
 * "Focus today" is NOT here: it is per-day state, stored in daily_logs.notes.
 */
/**
 * These four come from the environment rather than sitting in the file, for
 * one reason: this repository is public and they are the owner's real name,
 * course and city. The running app is unaffected — the values live in
 * .env.local on the laptop and in Vercel — but a clone of the repo shows the
 * placeholders until someone fills them in, which is what a clone should show.
 *
 * NEXT_PUBLIC_ because the Operator card renders in the browser. Nothing here
 * is a secret; it is personal, which is a different thing.
 */
const REAL_OPERATOR = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Your name",
  /** Shown under the name. Track, degree, class year — whatever orients you. */
  track: process.env.NEXT_PUBLIC_OPERATOR_TRACK ?? "What you are going for",
  location: process.env.NEXT_PUBLIC_OPERATOR_LOCATION ?? "CITY, ST",
  /**
   * The university the outreach radar searches for alumni at. Not shown in the
   * interface — it exists so a search can say "<school> alumni at Terrawatt"
   * rather than being told the school every time. Left blank, the alumni
   * search refuses to run rather than searching for nobody: see findAlumniAt.
   */
  university: process.env.NEXT_PUBLIC_OPERATOR_UNIVERSITY ?? "",
} as const;

/**
 * The public demo's operator. Invented, like everything else in the demo.
 *
 * This matters more than it looks: the demo is an open page on the internet,
 * and without it the Operator card introduces the visitor to Asher by name,
 * degree and city — which is both wrong for a demo of a fictional student and
 * more of his own information than a portfolio piece needs to publish.
 */
const DEMO_OPERATOR = {
  name: "Jamie Rivera",
  /*
    Deliberately vaguer than the real operator's line, and deliberately not a
    paraphrase of it. A demo persona that mirrors its author's own field, degree
    shape and class year reads as the author with a false name on - which
    undercuts the point of inventing one. Broad enough to sit honestly over a
    board of energy and analytics roles without claiming the same niche.

    It is not only decoration: it is passed to the drafting prompt as who the
    sender is, so it has to be a sentence a real introduction could contain.
    Which is also why the class year stays '27: the prompt calls the sender a
    final-year student, and in late 2026 any earlier year would have already
    graduated. The field is what to vary here, not the date.
  */
  track: "Analytics & product · B.S. Data Science '27",
  location: "CALLOWAY UNIVERSITY",
  university: "Calloway University",
} as const;

/**
 * Whose dashboard this is, for display. The switch lives here rather than in
 * the card so there is still exactly one place identity is decided.
 */
export const OPERATOR = DEMO_MODE ? DEMO_OPERATOR : REAL_OPERATOR;

/**
 * The clock this app runs on.
 *
 * Every day/week/month boundary in the app resolves through this zone, never
 * through the server's UTC date. Vercel functions and the nightly cron run in
 * UTC, so without a fixed zone the habit reset, daily_logs date and goal
 * periods would each land on a different day than the one you are living in.
 * Set once here, consumed only via src/lib/time.ts.
 */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Chicago";

/** Weeks start Monday — matches the mockup's Mon–Sun calendar strip. */
export const WEEK_STARTS_ON = 1;

/**
 * How many weeks either side of today the Home calendar loads up front.
 *
 * Sliding between weeks costs nothing at this size: the iCal feed is one
 * download of the whole calendar however narrow the window, so asking for
 * thirteen weeks instead of one adds no network at all — only the events
 * themselves travel to the browser. Buying the whole band once is what makes
 * the arrows instant rather than a round trip each.
 *
 * Raise it if you find yourself hitting the ends; the only cost is a slightly
 * bigger page payload.
 */
export const CALENDAR_BAND_WEEKS = 6;

/**
 * Compress window defaults, in days.
 *
 * These are only the starting values: the sliders on the Compress page change
 * them, and what you set is kept in user_settings. The two 30-day windows are
 * straight from the scope doc; tasks and reminders were added on Sep 15.
 * The board's staleness colouring still reads STALE_APPLICATION_DAYS.
 */
export const STALE_APPLICATION_DAYS = 30;
export const STALE_CONTACT_DAYS = 30;
/** An open task shows this many days past its due date, or after it was added if undated. */
export const OVERDUE_TASK_DAYS = 7;
/** A reminder to apply resurfaces this many days after it was ignored. */
export const IGNORED_REMINDER_DAYS = 3;

/**
 * Reminders to apply.
 *
 * A Researching role is reminded REMINDER_LEAD_DAYS before its deadline by
 * default; the capture confirm screen and the application form both let you
 * pick another lead or a specific date.
 *
 * A listing with no deadline — only "posted 3 weeks ago" — gets a reminder
 * ESTIMATED_REMINDER_AFTER_POSTING_DAYS after the posting date instead, shown
 * as "est." because a posting date is not a deadline. Roles fill fast, so it
 * errs early.
 *
 * An ignored reminder resurfaces in Compress after its window, but never later
 * than RESURFACE_BEFORE_DEADLINE_DAYS before the deadline, so there is always
 * time left to act on it.
 */
export const REMINDER_LEAD_DAYS = 10;
export const ESTIMATED_REMINDER_AFTER_POSTING_DAYS = 14;
export const RESURFACE_BEFORE_DEADLINE_DAYS = 2;
