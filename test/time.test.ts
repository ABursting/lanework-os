import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, addMonths, daysBetween, dayOfWeek, endOfMonth, endOfWeek,
  isoWeekNumber, startOfDayInstant, startOfMonth, startOfWeek, toCivilDate, weekDays,
} from "../src/lib/time.ts";

const TZ = "America/Chicago";

test("a civil date is the operator's day, not the server's", () => {
  // 03:00 UTC on the 27th is 22:00 on the 26th in Chicago. A server reading
  // its own UTC date here would write the habit grid onto the wrong day.
  assert.equal(toCivilDate(new Date("2026-08-27T03:00:00Z"), TZ), "2026-08-26");
  assert.equal(toCivilDate(new Date("2026-08-27T13:00:00Z"), TZ), "2026-08-27");
  // And the boundary itself: 05:00 UTC is exactly midnight CDT.
  assert.equal(toCivilDate(new Date("2026-08-27T04:59:59Z"), TZ), "2026-08-26");
  assert.equal(toCivilDate(new Date("2026-08-27T05:00:00Z"), TZ), "2026-08-27");
});

test("weeks start on Monday", () => {
  assert.equal(dayOfWeek("2026-08-27"), 4);          // Thursday
  assert.equal(startOfWeek("2026-08-27"), "2026-08-24");
  assert.equal(startOfWeek("2026-08-24"), "2026-08-24"); // Monday is its own start
  // Sunday belongs to the week that began six days earlier, not the next one.
  assert.equal(startOfWeek("2026-08-30"), "2026-08-24");
  assert.equal(endOfWeek("2026-08-27"), "2026-08-30");
  assert.deepEqual(weekDays("2026-08-27"), [
    "2026-08-24", "2026-08-25", "2026-08-26",
    "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
  ]);
});

test("date arithmetic crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");   // across a DST spring-forward
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");   // across a DST fall-back
  assert.equal(daysBetween("2026-08-24", "2026-08-30"), 6);
  assert.equal(daysBetween("2026-08-30", "2026-08-24"), -6);
});

test("month arithmetic clamps rather than overflowing", () => {
  // Jan 31 plus a month is the end of February, not March 2nd or 3rd.
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29"); // leap year
  assert.equal(startOfMonth("2026-08-27"), "2026-08-01");
  assert.equal(endOfMonth("2026-08-27"), "2026-08-31");
  assert.equal(endOfMonth("2026-02-15"), "2026-02-28");
});

test("local midnight maps to the right UTC instant on both sides of DST", () => {
  // Standard time: Chicago is UTC-6, so midnight is 06:00Z.
  assert.equal(startOfDayInstant("2026-01-15", TZ).toISOString(), "2026-01-15T06:00:00.000Z");
  // Daylight time: UTC-5, so midnight is 05:00Z.
  assert.equal(startOfDayInstant("2026-08-27", TZ).toISOString(), "2026-08-27T05:00:00.000Z");
  // The spring-forward day itself still begins at 06:00Z — the jump is at 2am.
  assert.equal(startOfDayInstant("2026-03-08", TZ).toISOString(), "2026-03-08T06:00:00.000Z");
  // The day after it begins an hour earlier in UTC terms.
  assert.equal(startOfDayInstant("2026-03-09", TZ).toISOString(), "2026-03-09T05:00:00.000Z");
  // Fall-back day begins on daylight time.
  assert.equal(startOfDayInstant("2026-11-01", TZ).toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(startOfDayInstant("2026-11-02", TZ).toISOString(), "2026-11-02T06:00:00.000Z");
});

test("a week query window covers exactly seven local days", () => {
  const start = startOfDayInstant("2026-08-24", TZ);
  const end = startOfDayInstant("2026-08-31", TZ);
  assert.equal((end.getTime() - start.getTime()) / 3_600_000, 168);
});

test("ISO week numbers match the calendar", () => {
  // The mockup's review header for Aug 24-30 2026 reads WEEK 35.
  assert.equal(isoWeekNumber("2026-08-27"), 35);
  assert.equal(isoWeekNumber("2026-08-24"), 35);
  assert.equal(isoWeekNumber("2026-08-30"), 35);
  assert.equal(isoWeekNumber("2026-08-31"), 36);
  // 2026-01-01 is a Thursday, so it belongs to week 1.
  assert.equal(isoWeekNumber("2026-01-01"), 1);
});

test("a malformed civil date is rejected, not silently coerced", () => {
  assert.throws(() => addDays("27/08/2026", 1), /YYYY-MM-DD/);
  assert.throws(() => startOfDayInstant("2026-8-7"), /YYYY-MM-DD/);
});
