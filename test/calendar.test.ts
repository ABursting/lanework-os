import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { fetchEvents } from "../src/lib/calendar.ts";
import { formatTime } from "../src/lib/time.ts";

// CALENDAR_ICS_URL and NEXT_PUBLIC_APP_TIMEZONE are set by the `test` script;
// both are read at module load, so they cannot be assigned in here.

/** A feed shaped like Google's export: a VTIMEZONE, UTC times, an all-day
 *  event, a weekly series, and one event outside the requested window. */
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:DAYLIGHT
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
TZNAME:CDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
TZNAME:CST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:evt-screen@example
DTSTART:20260827T190000Z
DTEND:20260827T193000Z
SUMMARY:Recruiter screen with Halcyon
LOCATION:Google Meet
END:VEVENT
BEGIN:VEVENT
UID:evt-deadline@example
DTSTART;VALUE=DATE:20260828
DTEND;VALUE=DATE:20260829
SUMMARY:Kestrel Labs application deadline
END:VEVENT
BEGIN:VEVENT
UID:evt-weekly@example
DTSTART;TZID=America/Chicago:20260803T090000
DTEND;TZID=America/Chicago:20260803T093000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Weekly alumni coffee
END:VEVENT
BEGIN:VEVENT
UID:evt-far@example
DTSTART:20260915T160000Z
DTEND:20260915T170000Z
SUMMARY:Something in September
END:VEVENT
END:VCALENDAR
`;

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async () =>
    new Response(ICS, { status: 200 })) as typeof globalThis.fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

test("parses a week out of an iCal feed", async () => {
  const events = await fetchEvents("2026-08-24", "2026-08-30");
  const summaries = events.map((e) => e.summary);

  // The September event is outside the window and must not appear.
  assert.ok(!summaries.includes("Something in September"));
  assert.equal(events.length, 3);
});

test("a UTC time lands on the operator's local day and hour", async () => {
  const [screen] = (await fetchEvents("2026-08-24", "2026-08-30")).filter((e) =>
    e.summary.includes("Recruiter screen"),
  );
  // 19:00Z in August is 2:00pm in Chicago.
  assert.equal(screen.date, "2026-08-27");
  assert.equal(formatTime(screen.start), "2:00pm");
  assert.equal(screen.allDay, false);
  assert.equal(screen.location, "Google Meet");
});

test("an all-day event keeps its own date and is not shifted by a timezone", async () => {
  const [deadline] = (await fetchEvents("2026-08-24", "2026-08-30")).filter((e) =>
    e.summary.includes("Kestrel"),
  );
  assert.equal(deadline.date, "2026-08-28");
  assert.equal(deadline.allDay, true);
});

test("a weekly series is expanded into the window", async () => {
  const [weekly] = (await fetchEvents("2026-08-24", "2026-08-30")).filter((e) =>
    e.summary.includes("alumni coffee"),
  );
  // The series starts Aug 3; only the Aug 24 occurrence falls in this week.
  assert.equal(weekly.date, "2026-08-24");
  assert.equal(formatTime(weekly.start), "9:00am");
});

test("event kinds are inferred, and unmatched events stay neutral", async () => {
  const events = await fetchEvents("2026-08-24", "2026-08-30");
  const kind = (needle: string) => events.find((e) => e.summary.includes(needle))!.kind;
  assert.equal(kind("Recruiter screen"), "interview");
  assert.equal(kind("Kestrel"), "deadline");
  assert.equal(kind("alumni coffee"), "informational");
});

test("a failing feed surfaces the status rather than silently emptying", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof globalThis.fetch;
  await assert.rejects(() => fetchEvents("2026-08-24", "2026-08-30"), /404/);
  globalThis.fetch = saved;
});
