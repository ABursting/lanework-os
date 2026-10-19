import { test } from "node:test";
import assert from "node:assert/strict";
import {
  civilOrNull, estimatedReminderFromPosting, reminderForLead, reminderState, resurfaceOn,
} from "../src/lib/reminders.ts";
import {
  COMPRESS_DEFAULTS, sanitizeSettings, scaleWindows, taskAge, uniformScale,
} from "../src/lib/compress.ts";

const TODAY = "2026-09-15";

// ── the reminder date ───────────────────────────────────────────────────────

test("a deadline is reminded ten days before by default", () => {
  assert.equal(reminderForLead("2026-10-15", 10, TODAY), "2026-10-05");
});

test("a reminder is never set for a day already gone", () => {
  // Deadline in five days with a ten-day lead: remind today, not last week.
  assert.equal(reminderForLead("2026-09-20", 10, TODAY), TODAY);
});

test("with no deadline, the lead counts forward from today", () => {
  assert.equal(reminderForLead(null, 14, TODAY), "2026-09-29");
});

test("a listing posted three weeks ago is estimated from the posting date", () => {
  // Posted Aug 25 + 14 days = Sep 8, which has passed, so today.
  assert.equal(estimatedReminderFromPosting(21, TODAY, TODAY), TODAY);
  // Posted two days ago: Sep 13 + 14 = Sep 27.
  assert.equal(estimatedReminderFromPosting(2, TODAY, TODAY), "2026-09-27");
});

test("the posting estimate is relative to when the screenshot was read", () => {
  // Read on Sep 10, "posted 1 day ago" → Sep 9 + 14 = Sep 23.
  assert.equal(estimatedReminderFromPosting(1, "2026-09-10", TODAY), "2026-09-23");
});

test("only a real YYYY-MM-DD is accepted as a date", () => {
  assert.equal(civilOrNull("2026-10-01"), "2026-10-01");
  assert.equal(civilOrNull(""), null);
  assert.equal(civilOrNull("Oct 1"), null);
  assert.equal(civilOrNull(undefined), null);
});

// ── when Compress brings it back ────────────────────────────────────────────

test("an ignored reminder resurfaces its window after the reminder", () => {
  assert.equal(resurfaceOn("2026-10-05", "2026-10-15", 3), "2026-10-08");
});

test("but never later than two days before the deadline", () => {
  // Reminder Oct 5 + 10-day window = Oct 15, the deadline itself. Capped to Oct 13.
  assert.equal(resurfaceOn("2026-10-05", "2026-10-15", 10), "2026-10-13");
});

test("and never before the reminder has had its own day", () => {
  // Reminder a day before the deadline: the cap would be earlier than the reminder.
  assert.equal(resurfaceOn("2026-10-14", "2026-10-15", 3), "2026-10-14");
});

test("a deadline with no reminder resurfaces two days out", () => {
  assert.equal(resurfaceOn(null, "2026-10-15", 3), "2026-10-13");
});

test("a role with no dates has nothing to resurface", () => {
  assert.equal(resurfaceOn(null, null, 3), null);
  assert.equal(reminderState({ remind_on: null, deadline: null }, 3, TODAY), "undated");
});

test("reminder states move from waiting to ignored to missed", () => {
  const role = { remind_on: "2026-09-10", deadline: "2026-09-30" };
  assert.equal(reminderState(role, 3, "2026-09-12"), "waiting");
  assert.equal(reminderState(role, 3, "2026-09-13"), "ignored");
  assert.equal(reminderState(role, 3, "2026-10-01"), "missed");
});

test("a zero window resurfaces on the reminder day itself", () => {
  assert.equal(reminderState({ remind_on: TODAY, deadline: null }, 0, TODAY), "ignored");
});

// ── the sliders ─────────────────────────────────────────────────────────────

test("the all-windows slider scales every default together", () => {
  assert.deepEqual(scaleWindows(1), COMPRESS_DEFAULTS);
  assert.deepEqual(scaleWindows(0.5), {
    compress_job_days: 15,
    compress_contact_days: 15,
    compress_task_days: 4,
    compress_reminder_days: 2,
  });
});

test("scaling respects each slider's bounds", () => {
  // 3x the 30-day job window is 90 (inside 120); 0.25x of 3 reminder days is 1.
  assert.equal(scaleWindows(3).compress_job_days, 90);
  assert.equal(scaleWindows(0.25).compress_reminder_days, 1);
});

test("a uniform multiple is recognised, and separate moves are not", () => {
  assert.equal(uniformScale(scaleWindows(2)), 2);
  assert.equal(uniformScale({ ...COMPRESS_DEFAULTS, compress_task_days: 20 }), null);
});

test("settings from the browser are clamped and stray keys ignored", () => {
  assert.deepEqual(
    sanitizeSettings({ compress_job_days: 999, compress_task_days: "5", user_id: "x" }),
    { compress_job_days: 120, compress_task_days: 5 },
  );
});

// ── stale tasks ─────────────────────────────────────────────────────────────

test("a dated task is measured from its due date", () => {
  assert.deepEqual(
    taskAge({ due_date: "2026-09-05", created_at: "2026-08-01T15:00:00.000Z" }, TODAY),
    { days: 10, since: "due" },
  );
});

test("a task due ahead is not stale, however old it is", () => {
  const age = taskAge({ due_date: "2026-09-20", created_at: "2026-08-01T15:00:00.000Z" }, TODAY);
  assert.ok(age.days < 0);
});

test("an undated task is measured from the local day it was created", () => {
  // 03:00 UTC on Sep 6 is still Sep 5 in Chicago — 10 days before Sep 15, not 9.
  assert.deepEqual(
    taskAge({ due_date: null, created_at: "2026-09-06T03:00:00.000Z" }, TODAY),
    { days: 10, since: "created" },
  );
});
