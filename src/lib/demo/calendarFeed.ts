import { addDays, startOfDayInstant, startOfWeek, today } from "../time";
import type { CivilDate } from "../time";

/**
 * The demo's fictional calendar.
 *
 * ── Why this is generated rather than a file in public/ ─────────────────────
 * A fixed .ics would be correct for about a week. The demo is a portfolio
 * piece someone might open in March, and a calendar card showing an empty
 * week — or interviews three months in the past — says the opposite of what
 * it is meant to say. So the text is built fresh on each read, anchored to the
 * current week, and Jamie's week always looks lived-in.
 *
 * ── Why it is still iCal text ───────────────────────────────────────────────
 * It would be less work to hand the calendar card ready-made event objects and
 * skip the parser. Running the demo through the same ical.js path the real
 * feed uses means the demo exercises the real code — including the all-day
 * handling and the CATEGORIES-based colouring — rather than a shortcut that
 * could drift away from it and quietly stop representing the app.
 *
 * Nothing here reaches the network, so the demo cannot touch a real calendar
 * even if CALENDAR_ICS_URL were somehow set in its environment.
 */

type DemoEvent = {
  /** Days from the start of this week (Monday = 0). */
  offset: number;
  summary: string;
  /** Local start and end in 24h "HH:MM". Omit both for an all-day entry. */
  from?: string;
  to?: string;
  category: "INTERVIEW" | "INFORMATIONAL" | "DEADLINE" | "NETWORKING";
  location?: string;
};

/**
 * Two weeks of a plausible search: a couple of real interview rounds, the
 * coffee chats that lead to them, two deadlines and one campus event. Spread
 * across climate, energy, data & AI and product, which are the four fields
 * Jamie is targeting.
 */
const EVENTS: DemoEvent[] = [
  // ── This week ──────────────────────────────────────────────────────────────
  { offset: 0, summary: "Coffee chat — Priya Raghunathan (Helio Grid)", from: "09:30", to: "10:00", category: "INFORMATIONAL", location: "Video call" },
  { offset: 1, summary: "Phone screen — Arcadia Climate, Data Analyst", from: "14:00", to: "14:45", category: "INTERVIEW", location: "Phone" },
  { offset: 2, summary: "Terrawatt Energy — application deadline", category: "DEADLINE" },
  { offset: 3, summary: "Informational — Marcus Oyelaran (Northwind Analytics)", from: "16:00", to: "16:30", category: "INFORMATIONAL", location: "Video call" },
  { offset: 4, summary: "Climate & Energy Careers mixer", from: "17:30", to: "19:30", category: "NETWORKING", location: "Hartley Student Center" },

  // ── Next week ──────────────────────────────────────────────────────────────
  { offset: 7, summary: "Final round — Arcadia Climate (3 interviews)", from: "10:00", to: "13:00", category: "INTERVIEW", location: "Video call" },
  { offset: 8, summary: "Case study due — Northwind Analytics", category: "DEADLINE" },
  { offset: 9, summary: "Coffee chat — Dana Whitfield (Current Labs)", from: "11:00", to: "11:30", category: "INFORMATIONAL", location: "Rowan Hall cafe" },
  { offset: 10, summary: "Product panel — Meridian Software, PM intern loop", from: "13:00", to: "15:00", category: "INTERVIEW", location: "Video call" },
  { offset: 11, summary: "Alumni networking night — Energy & Climate", from: "18:00", to: "20:00", category: "NETWORKING", location: "Dockside Brewing" },
];

/** "2026-10-07" → "20261007". */
function stamp(date: CivilDate): string {
  return date.replace(/-/g, "");
}

/**
 * A wall-clock time in the app's timezone, written as the UTC instant it
 * actually falls on.
 *
 * The first version of this emitted a "floating" time — no zone, no trailing
 * Z — on the theory that it would read as 9:30am to everyone. It did not. A
 * floating time is parsed as UTC and then rendered in the app's timezone, so
 * every event in the demo showed five hours early: the 9:30am coffee chat
 * appeared at 4:30am, which is not a time anyone takes a coffee chat.
 *
 * Resolving the instant through the app's own day-boundary helper is also the
 * only way to get this right across the daylight-saving changeover, since the
 * offset is five hours for part of the year and six for the rest.
 */
function localStamp(date: CivilDate, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const instant = new Date(
    startOfDayInstant(date).getTime() + (hours * 60 + minutes) * 60_000,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${instant.getUTCFullYear()}${pad(instant.getUTCMonth() + 1)}${pad(instant.getUTCDate())}` +
    `T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}00Z`
  );
}

/** The whole feed, as iCal text. */
export function demoIcs(now: CivilDate = today()): string {
  const monday = startOfWeek(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lanework//Demo Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Recruiting (demo)",
  ];

  for (const [index, event] of EVENTS.entries()) {
    const date = addDays(monday, event.offset);
    const allDay = !event.from;

    lines.push("BEGIN:VEVENT");
    // Stable within a week so the same event keeps its identity across reads,
    // and distinct between weeks so a re-render after midnight does not collide.
    lines.push(`UID:demo-${stamp(monday)}-${index}@lanework.demo`);
    lines.push(`DTSTAMP:${stamp(monday)}T000000Z`);

    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${stamp(date)}`);
      lines.push(`DTEND;VALUE=DATE:${stamp(addDays(date, 1))}`);
    } else {
      lines.push(`DTSTART:${localStamp(date, event.from!)}`);
      lines.push(`DTEND:${localStamp(date, event.to ?? event.from!)}`);
    }

    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    lines.push(`CATEGORIES:${event.category}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** iCal reserves these four characters inside a text value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
