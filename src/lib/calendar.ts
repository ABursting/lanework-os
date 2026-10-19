import "server-only";
import ICAL from "ical.js";
import { APP_TIMEZONE } from "./constants";
import { DEMO_MODE } from "./demo";
import { demoIcs } from "./demo/calendarFeed";
import { endOfDayInstant, startOfDayInstant, toCivilDate, type CivilDate } from "./time";
// The event shape and its labels are needed in the browser too, so they live
// outside this module — nothing server-only may cross into a client component.
import type { CalendarEvent, EventKind } from "./types";

/**
 * The read-only Google Calendar feed.
 *
 * Parsed with ical.js specifically. node-ical (and anything else that reaches
 * for BigInt internally) parses fine on a local Node build and then dies on
 * Vercel's bundler in production with "o.BigInt is not a function" — a failure
 * that only shows up after deploy. ical.js is pure JavaScript and does not
 * have that problem.
 *
 * No OAuth and no write path: this reads the calendar's private "secret
 * address in iCal format" and nothing else.
 */

/**
 * The mockup colour-codes events four ways. An iCal feed carries no such
 * field, so the kind is inferred: an explicit CATEGORIES value wins, and
 * otherwise the summary is keyword-matched. Anything unrecognised is `other`
 * and renders neutral rather than being forced into a bucket.
 */
const KEYWORDS: [EventKind, RegExp][] = [
  ["interview", /\b(interview|screen|panel|loop|onsite|final round|case study|superday)\b/i],
  ["informational", /\b(informational|coffee|chat|intro call|catch[- ]up|1:1|check[- ]in)\b/i],
  ["deadline", /\b(deadline|due|closes|closing|application|apply by|submit)\b/i],
  ["networking", /\b(networking|mixer|meetup|alumni|conference|happy hour|career fair)\b/i],
];

function classifyEvent(summary: string, categories: string[]): EventKind {
  for (const raw of categories) {
    const c = raw.toLowerCase();
    if (c.includes("interview")) return "interview";
    if (c.includes("informational") || c.includes("info")) return "informational";
    if (c.includes("deadline") || c.includes("due")) return "deadline";
    if (c.includes("network")) return "networking";
  }
  for (const [kind, pattern] of KEYWORDS) {
    if (pattern.test(summary)) return kind;
  }
  return "other";
}

export function isCalendarConfigured(): boolean {
  // The demo always has a calendar — an invented one — so the card renders
  // rather than showing the "connect a calendar" empty state.
  return DEMO_MODE || Boolean(process.env.CALENDAR_ICS_URL);
}

/** The feed's raw iCal text, from Google or, in the demo, from thin air. */
async function feedText(): Promise<string | null> {
  /*
    The demo never reaches the network for this. Asher's calendar address is a
    secret URL that grants read access to his real schedule, and the surest way
    for the public deployment never to read it is for the public deployment to
    have no code path that fetches anything at all.
  */
  if (DEMO_MODE) return demoIcs();

  const url = process.env.CALENDAR_ICS_URL;
  if (!url) return null;

  const res = await fetch(url, {
    // A calendar is not worth re-fetching on every render, and it is not an
    // AI call, so a short shared cache is the right shape here.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Calendar feed returned ${res.status}. Check CALENDAR_ICS_URL.`);
  }
  return res.text();
}

/** Every occurrence between two local civil dates, inclusive. */
export async function fetchEvents(from: CivilDate, to: CivilDate): Promise<CalendarEvent[]> {
  const text = await feedText();
  if (text === null) return [];

  const windowStart = startOfDayInstant(from);
  const windowEnd = endOfDayInstant(to);

  const component = new ICAL.Component(ICAL.parse(text));

  // Register the feed's own VTIMEZONE blocks so zoned times resolve to the
  // right instant instead of being read as floating local time.
  for (const vtz of component.getAllSubcomponents("vtimezone")) {
    const timezone = new ICAL.Timezone(vtz);
    if (!ICAL.TimezoneService.has(timezone.tzid)) {
      ICAL.TimezoneService.register(timezone);
    }
  }

  const events: CalendarEvent[] = [];

  const push = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    const allDay = start.isDate;
    const startJs = start.toJSDate();
    const endJs = end.toJSDate();

    // For an all-day event the ICAL.Time carries a bare Y-M-D; reading those
    // fields directly avoids re-deriving the day through a timezone that
    // could shift it by one.
    const date = allDay
      ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
      : toCivilDate(startJs, APP_TIMEZONE);

    if (date < from || date > to) return;

    events.push({
      uid: `${event.uid}-${start.toString()}`,
      summary: event.summary || "(no title)",
      date,
      start: startJs,
      end: endJs,
      allDay,
      kind: classifyEvent(
        event.summary || "",
        event.component.getAllProperties("categories").flatMap((p) => {
          const value = p.getValues();
          return value.map(String);
        }),
      ),
      location: event.location || null,
    });
  };

  for (const vevent of component.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);

    // Modified instances of a recurring series come back through
    // getOccurrenceDetails on the parent; handling them separately would
    // double-count them.
    if (event.isRecurrenceException()) continue;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next = iterator.next();
      // A malformed or unbounded RRULE must not spin forever; a week's view
      // cannot legitimately need more than this many candidates.
      let guard = 0;
      while (next && guard < 750) {
        guard += 1;
        const details = event.getOccurrenceDetails(next);
        if (details.startDate.toJSDate() > windowEnd) break;
        if (details.endDate.toJSDate() >= windowStart) {
          push(event, details.startDate, details.endDate);
        }
        next = iterator.next();
      }
    } else {
      const start = event.startDate;
      const end = event.endDate ?? event.startDate;
      if (end.toJSDate() >= windowStart && start.toJSDate() <= windowEnd) {
        push(event, start, end);
      }
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
