import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_KIND_LABEL, EVENT_KIND_VAR, GOAL_METRIC_LABEL, KIND_LABEL, LANE_LABEL, LANE_RANK,
  LANE_VAR, MEMORY_KIND_LABEL, MEMORY_KIND_VAR, RELATIONSHIP_LABEL, STAGE_LABEL, STAGE_VAR,
  TASK_TYPE_LABEL, TASK_TYPE_VAR, humanize, laneColor, safeHref, stageColor, tint,
  touchColor, touchLabel,
} from "../src/lib/display.ts";

/* ── Links ────────────────────────────────────────────────────────────────── */

/**
 * The job posting URL is free text the operator types, and it is rendered as a
 * clickable link. An href beginning "javascript:" runs as code when clicked,
 * so this is the one function in the display layer with a security job.
 *
 * The cases below are the real evasions, not just the obvious one: mixed case,
 * leading whitespace, and control characters inserted mid-scheme to slip past
 * a naive prefix check.
 */
test("only http and https survive", () => {
  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "java\nscript:alert(1)",
    "jav\tascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:someone@example.com",
  ]) {
    assert.equal(safeHref(hostile), null, `${JSON.stringify(hostile)} was not rejected`);
  }

  assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
  assert.equal(safeHref("http://example.com"), "http://example.com/");
});

test("a bare domain is assumed to be https rather than dropped", () => {
  // Typing "acme.com/careers" into the field is the common case, and refusing
  // to link it would be the wrong kind of strict.
  assert.equal(safeHref("example.com"), "https://example.com/");
  assert.equal(safeHref("www.example.com/a?b=c"), "https://www.example.com/a?b=c");
  // A protocol-relative address is a host, not a path — read as https.
  assert.equal(safeHref("//example.com"), "https://example.com/");
});

test("nothing, whitespace, or an unparseable address gives no link at all", () => {
  for (const empty of [null, undefined, "", "   "]) {
    assert.equal(safeHref(empty), null);
  }
  assert.equal(safeHref("not a url at all"), null);
  assert.equal(safeHref("https://"), null);
  assert.equal(safeHref("http://["), null);
});

/* ── Staleness ────────────────────────────────────────────────────────────── */

test("the touch label reads as a person would say it", () => {
  assert.equal(touchLabel(null), "—");
  assert.equal(touchLabel(0), "today");
  // Negative days should not render as "-2d"; anything not in the past is today.
  assert.equal(touchLabel(-2), "today");
  assert.equal(touchLabel(1), "1d");
  assert.equal(touchLabel(45), "45d");
});

test("the touch colour steps at half the window and again at the window", () => {
  const stale = 30;
  assert.equal(touchColor(null, stale), "var(--color-faint)");
  assert.equal(touchColor(0, stale), "var(--color-text)");
  assert.equal(touchColor(14, stale), "var(--color-text)");
  // Halfway is where it starts to fade.
  assert.equal(touchColor(15, stale), "var(--color-muted)");
  assert.equal(touchColor(29, stale), "var(--color-muted)");
  // At the window itself it goes red, not one day after.
  assert.equal(touchColor(30, stale), "var(--color-danger)");
  assert.equal(touchColor(300, stale), "var(--color-danger)");
});

test("the colour steps still work for a window the sliders can produce", () => {
  // The task window goes down to 1 day, where "half" rounds to zero — every
  // day including today must still land on a defined colour.
  for (const window of [1, 2, 3, 7, 60]) {
    for (const days of [0, 1, 2, window - 1, window, window + 1]) {
      assert.match(touchColor(days, window), /^var\(--color-[a-z]+\)$/);
    }
  }
});

/* ── Labels ───────────────────────────────────────────────────────────────── */

test("every label map is filled in", () => {
  // TypeScript enforces that the keys exist. It does not stop one being the
  // empty string, which renders as a blank badge.
  const maps = {
    LANE_LABEL, STAGE_LABEL, KIND_LABEL, RELATIONSHIP_LABEL, TASK_TYPE_LABEL,
    GOAL_METRIC_LABEL, MEMORY_KIND_LABEL, EVENT_KIND_LABEL,
  };
  for (const [name, map] of Object.entries(maps)) {
    for (const [key, label] of Object.entries(map)) {
      assert.ok(label.trim().length > 0, `${name}.${key} is blank`);
    }
  }
});

test("the interface colour maps resolve to theme variables, never raw hex", () => {
  // The palette is defined once in globals.css. A literal colour in the
  // interface would drift from the theme the moment one is adjusted.
  const maps = { LANE_VAR, STAGE_VAR, MEMORY_KIND_VAR, EVENT_KIND_VAR };
  for (const [name, map] of Object.entries(maps)) {
    for (const [key, value] of Object.entries(map)) {
      assert.match(value, /^var\(--color-[a-z0-9-]+\)$/, `${name}.${key} is ${value}`);
    }
  }
});

test("the chart palette is literal hex, and every category is distinguishable", () => {
  // Deliberately not theme variables: this is the validated chart palette, and
  // a chart drawn in canvas or SVG needs a real colour rather than something
  // the browser resolves from a stylesheet. Checked separately from the
  // interface maps for that reason.
  const values = Object.values(TASK_TYPE_VAR);
  for (const [key, value] of Object.entries(TASK_TYPE_VAR)) {
    assert.match(value, /^#[0-9a-f]{6}$/, `TASK_TYPE_VAR.${key} is ${value}`);
  }
  // Two categories sharing a colour would make the activity chart unreadable.
  assert.equal(new Set(values).size, values.length, "two task types share a colour");
});

test("a missing lane falls back rather than rendering nothing", () => {
  assert.match(laneColor(null), /^var\(/);
  assert.match(laneColor(undefined), /^var\(/);
  assert.equal(laneColor("primary"), LANE_VAR.primary);
});

test("every stage has its own colour, so no two columns look alike", () => {
  const colors = Object.values(STAGE_VAR);
  assert.equal(new Set(colors).size, colors.length, "two stages share a colour");
  assert.equal(stageColor("offer"), STAGE_VAR.offer);
});

test("lane rank is strongest-first, so the strongest role sets a company's lane", () => {
  // Higher is stronger. A company with one primary role and three peripheral
  // ones is a primary company — taking the maximum is the whole point.
  assert.ok(LANE_RANK.primary > LANE_RANK.secondary);
  assert.ok(LANE_RANK.secondary > LANE_RANK.peripheral);
  assert.equal(
    Math.max(LANE_RANK.peripheral, LANE_RANK.primary, LANE_RANK.peripheral),
    LANE_RANK.primary,
  );
});

test("tint produces a valid colour mix at any strength", () => {
  for (const pct of [0, 14, 50, 100]) {
    assert.match(tint("var(--color-accent)", pct), /color-mix\(in oklab/);
    assert.ok(tint("var(--color-accent)", pct).includes(`${pct}%`));
  }
});

test("humanize turns a column value into something readable", () => {
  assert.equal(humanize("networking_outreach"), "Networking outreach");
  assert.equal(humanize("offer"), "Offer");
  assert.equal(humanize("informational_interview_followup"), "Informational interview followup");
  assert.equal(humanize(""), "");
});
