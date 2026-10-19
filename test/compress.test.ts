import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPRESS_DEFAULTS, SCALE_BOUNDS, WINDOW_BOUNDS, WINDOW_KEYS,
  clampWindow, sanitizeSettings, scaleWindows, taskAge, uniformScale,
} from "../src/lib/compress.ts";

/**
 * The Compress windows: how long something sits before the page surfaces it.
 *
 * `sanitizeSettings` is the one with teeth — it is what stands between a
 * slider value arriving from the browser and a column with a CHECK constraint
 * on it. Everything it lets through has to be storable, because a value that
 * fails the constraint comes back as a 23502 several layers from the slider
 * that caused it.
 */

/* ── Clamping ─────────────────────────────────────────────────────────────── */

test("a window is held inside its own slider range", () => {
  for (const key of WINDOW_KEYS) {
    const { min, max } = WINDOW_BOUNDS[key];
    assert.equal(clampWindow(key, min - 50), min);
    assert.equal(clampWindow(key, max + 500), max);
    assert.equal(clampWindow(key, min), min);
    assert.equal(clampWindow(key, max), max);
  }
});

test("every slider range sits inside what the database will accept", () => {
  // The columns allow 1–365, and 0–365 for reminders. A slider that could ask
  // for something outside that would produce a constraint violation rather
  // than a message.
  for (const key of WINDOW_KEYS) {
    const { min, max } = WINDOW_BOUNDS[key];
    assert.ok(max <= 365, `${key} can exceed the column's 365 limit`);
    assert.ok(min >= (key === "compress_reminder_days" ? 0 : 1), `${key} can go below its floor`);
    assert.ok(min < max, `${key} has an empty range`);
  }
});

test("a fractional value is rounded, never stored as a fraction", () => {
  assert.equal(clampWindow("compress_job_days", 30.4), 30);
  assert.equal(clampWindow("compress_job_days", 30.6), 31);
});

test("a value that is not a number falls back to the default", () => {
  for (const nonsense of [NaN, Infinity, -Infinity]) {
    assert.equal(clampWindow("compress_job_days", nonsense), COMPRESS_DEFAULTS.compress_job_days);
  }
});

/* ── The all-windows slider ───────────────────────────────────────────────── */

test("scaling moves every window together", () => {
  const doubled = scaleWindows(2);
  for (const key of WINDOW_KEYS) {
    const expected = Math.min(WINDOW_BOUNDS[key].max, COMPRESS_DEFAULTS[key] * 2);
    assert.equal(doubled[key], expected, key);
  }
  assert.deepEqual(scaleWindows(1), COMPRESS_DEFAULTS);
});

test("scaling never escapes the slider ranges", () => {
  for (const scale of [SCALE_BOUNDS.min, 0.5, 1, 2, SCALE_BOUNDS.max, 99]) {
    const scaled = scaleWindows(scale);
    for (const key of WINDOW_KEYS) {
      assert.ok(scaled[key] >= WINDOW_BOUNDS[key].min, `${key} below range at ${scale}`);
      assert.ok(scaled[key] <= WINDOW_BOUNDS[key].max, `${key} above range at ${scale}`);
    }
  }
});

test("a scaled set reports the scale it was made from", () => {
  // So the all-windows slider can show where it is instead of resetting to the
  // middle every time the page loads.
  for (const scale of [0.5, 1, 1.5, 2]) {
    assert.equal(uniformScale(scaleWindows(scale)), scale, `scale ${scale}`);
  }
});

test("windows moved separately report no single scale", () => {
  const mixed = { ...COMPRESS_DEFAULTS, compress_task_days: COMPRESS_DEFAULTS.compress_task_days + 5 };
  assert.equal(uniformScale(mixed), null);
});

/* ── What reaches the database ────────────────────────────────────────────── */

test("a settings patch is clamped on the way in", () => {
  const out = sanitizeSettings({ compress_job_days: 9999, compress_reminder_days: -5 });
  assert.equal(out.compress_job_days, WINDOW_BOUNDS.compress_job_days.max);
  assert.equal(out.compress_reminder_days, WINDOW_BOUNDS.compress_reminder_days.min);
});

test("a number arriving as a string is still accepted", () => {
  // Form fields and JSON bodies both hand over strings.
  assert.equal(sanitizeSettings({ compress_job_days: "45" }).compress_job_days, 45);
});

test("anything that is not a number is dropped, not coerced to zero", () => {
  // Number(null) is 0 and Number("") is 0, and a window of zero days would
  // surface the entire board at once. Dropping the key leaves the stored
  // value alone, which is the safe outcome.
  for (const junk of [null, "", "soon", {}, [], true, undefined]) {
    assert.deepEqual(sanitizeSettings({ compress_job_days: junk }), {});
  }
});

test("unknown keys cannot be smuggled through to the row", () => {
  const out = sanitizeSettings({
    compress_job_days: 40,
    user_id: "someone-else",
    updated_at: "whenever",
    drop_table: 1,
  });
  assert.deepEqual(Object.keys(out), ["compress_job_days"]);
});

test("an empty patch stays empty rather than writing defaults over the row", () => {
  assert.deepEqual(sanitizeSettings({}), {});
});

/* ── How old a task is ────────────────────────────────────────────────────── */

const NOW = "2026-10-05";

test("a task with a due date is measured from the date it was due", () => {
  const overdue = taskAge({ due_date: "2026-10-01", created_at: "2026-01-01T00:00:00Z" }, NOW);
  assert.equal(overdue.days, 4);
  assert.equal(overdue.since, "due");
});

test("a task still ahead of its deadline has a negative age", () => {
  const ahead = taskAge({ due_date: "2026-10-09", created_at: "2026-01-01T00:00:00Z" }, NOW);
  assert.equal(ahead.days, -4);
  assert.equal(ahead.since, "due");
});

test("a task with no date is measured from when it was written down", () => {
  // An undated task left open for weeks is precisely the backlog Compress is
  // for; treating it as never late would hide it forever.
  const undated = taskAge({ due_date: null, created_at: "2026-09-25T12:00:00Z" }, NOW);
  assert.equal(undated.days, 10);
  assert.equal(undated.since, "created");
});
