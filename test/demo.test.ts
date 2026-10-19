import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveClassification, type ClassifierRows } from "../src/lib/ai/classify.ts";
import { sampleNotes, recordedAnswer } from "../src/lib/demo/sampleNotes.ts";
import { demoIcs } from "../src/lib/demo/calendarFeed.ts";
import { seedRows, SEED_ORDER } from "../src/lib/demo/seed.ts";
import { today, addDays, startOfWeek } from "../src/lib/time.ts";

/**
 * The public demo.
 *
 * These tests exist because two bugs reached the live demo on 2026-10-05 and
 * were both caught by eye rather than by anything automatic — one of them only
 * because a confirm screen happened to say something obviously wrong. Each has
 * a regression test here.
 *
 * None of this touches the network or the database: the seed is a pure
 * function of today's date, the calendar is generated, and the sample answers
 * are resolved against rows passed in by hand.
 */

/* ── The sample notes ─────────────────────────────────────────────────────── */

/** The demo's own rows, near enough for resolution to be meaningful. */
const DEMO_ROWS: ClassifierRows = {
  companies: [
    { id: "co-arcadia", name: "Arcadia Climate" },
    { id: "co-current", name: "Current Labs" },
    { id: "co-lumen", name: "Lumen Robotics" },
  ],
  contacts: [
    { id: "ct-priya", name: "Priya Raghunathan", company_id: null },
    { id: "ct-dana", name: "Dana Whitfield", company_id: "co-arcadia" },
    { id: "ct-tomas", name: "Tomas Lindqvist", company_id: "co-current" },
  ],
  applications: [
    { id: "app-lumen", company_name: "Lumen Robotics", role_title: "Applied AI Analyst", stage: "interviewing", lane: "secondary", kind: "job" },
    { id: "app-current", company_name: "Current Labs", role_title: "Solutions Engineer", stage: "interviewing", lane: "secondary", kind: "job" },
  ],
};

test("every sample note is answered, and matched on its exact text", () => {
  for (const sample of sampleNotes()) {
    assert.ok(recordedAnswer(sample.text), `no recorded answer for "${sample.label}"`);
  }
  // Whitespace and case should not stop a sample being recognised, because
  // being unrecognised means a live model call the demo is trying to avoid.
  const first = sampleNotes()[0];
  assert.ok(recordedAnswer(`  ${first.text.toUpperCase()}  `));
  assert.equal(recordedAnswer("something nobody recorded"), null);
});

test("a sample note carries no identifiers of its own", () => {
  // The recordings are written in the shape the model answers in, which has no
  // ids at all. If one ever acquires an id field it has been written in the
  // resolved shape by mistake — which is exactly the 2026-10-05 regression.
  const serialised = JSON.stringify(sampleNotes().map((s) => s.parsed));
  for (const forbidden of ["existing_company_id", "duplicate_of_application_id", "contact_id", "application_id", '"id"']) {
    assert.ok(!serialised.includes(forbidden), `a sample note contains ${forbidden}`);
  }
});

/**
 * The regression. Before the fix these answers went to the confirm screen
 * unresolved, so committing "applied to Arcadia Climate" would have created a
 * second Arcadia Climate beside the one already on the board.
 */
test("the application sample resolves to the company that already exists", () => {
  const parsed = recordedAnswer(sampleNotes()[0].text)!;
  const out = resolveClassification(parsed, DEMO_ROWS);

  assert.equal(out.suggested_applications[0].existing_company_id, "co-arcadia");
  assert.equal(out.matched_companies[0].id, "co-arcadia");
  assert.equal(out.matched_companies[0].is_new, false);
  assert.equal(out.matched_contacts[0].id, "ct-priya");
});

test("the conversation sample resolves to the person who already exists", () => {
  const sample = sampleNotes().find((s) => s.label === "A conversation I had")!;
  const out = resolveClassification(sample.parsed, DEMO_ROWS);

  assert.equal(out.suggested_contact_touches[0].contact_id, "ct-dana");
  assert.equal(out.suggested_contact_touches[0].follow_up_in_days, 7);
});

test("the multi-part sample resolves both stage changes to real applications", () => {
  const sample = sampleNotes().find((s) => s.label === "Several things at once")!;
  const out = resolveClassification(sample.parsed, DEMO_ROWS);

  const ids = out.suggested_stage_changes.map((m) => m.application_id).sort();
  assert.deepEqual(ids, ["app-current", "app-lumen"]);
  assert.equal(out.suggested_tasks.length, 2);
});

test("the sample dates move with today, so a sample is never stale", () => {
  const sample = sampleNotes().find((s) => s.label === "A role to apply to later")!;
  const deadline = sample.parsed.suggested_applications[0].deadline;
  assert.ok(deadline > today(), "the sample deadline is in the past");
  assert.equal(sample.parsed.suggested_applications[0].stage, "researching");
});

/* ── The fictional calendar ───────────────────────────────────────────────── */

/**
 * The other 2026-10-05 bug: every event showed five hours early, because the
 * feed emitted iCal "floating" times on the theory that they read as the same
 * wall clock anywhere. They are in fact read as UTC.
 */
test("a 9:30am event is written as the instant that is 9:30am in Chicago", () => {
  const ics = demoIcs();
  const starts = ics.split("\r\n").filter((l) => l.startsWith("DTSTART:"));

  assert.ok(starts.length > 0, "no timed events in the feed");
  for (const line of starts) {
    // Every timed event must name its zone by ending in Z. A stamp without one
    // is floating, and floating is the bug.
    assert.match(line, /^DTSTART:\d{8}T\d{6}Z$/, `not an absolute instant: ${line}`);
  }

  // The first event of the week is the 9:30am coffee chat. In Chicago that is
  // 14:30 UTC in summer time and 15:30 in winter — either is right, 09:30 is
  // the bug and 04:30 is the bug the other way.
  const hour = Number(starts[0].slice(-7, -5));
  assert.ok(hour === 14 || hour === 15, `9:30am Chicago became ${hour}:30 UTC`);
});

test("all-day entries stay dates, not instants", () => {
  const ics = demoIcs();
  assert.ok(ics.includes("DTSTART;VALUE=DATE:"), "no all-day events in the feed");
  // A deadline is a day, not a moment; giving it a time would make it shift
  // across midnight for anyone in another zone.
  for (const line of ics.split("\r\n").filter((l) => l.startsWith("DTSTART;VALUE=DATE:"))) {
    assert.match(line, /^DTSTART;VALUE=DATE:\d{8}$/);
  }
});

test("the calendar is anchored to this week, so it is never empty", () => {
  const ics = demoIcs();
  const monday = startOfWeek(today()).replace(/-/g, "");
  assert.ok(ics.includes(monday), "nothing on this week's Monday");
  assert.ok(ics.includes(addDays(startOfWeek(today()), 7).replace(/-/g, "")), "nothing next week");
});

test("the feed is well-formed iCal with escaped text", () => {
  const ics = demoIcs();
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  assert.equal(
    (ics.match(/BEGIN:VEVENT/g) ?? []).length,
    (ics.match(/END:VEVENT/g) ?? []).length,
  );
  // A comma inside a summary ends the value unless escaped, which would
  // silently truncate the event title.
  assert.ok(ics.includes("\\,"), "no escaped commas — check escapeText is applied");
});

/* ── The seed ─────────────────────────────────────────────────────────────── */

test("the seed fills every table the reset clears", () => {
  const rows = seedRows();
  for (const table of SEED_ORDER) {
    assert.ok(table in rows, `${table} is cleared by the reset but never seeded`);
  }
  assert.deepEqual(Object.keys(rows).sort(), [...SEED_ORDER].sort());
});

test("the seed has a pipeline worth looking at", () => {
  const { applications } = seedRows();
  const byStage = new Map<string, number>();
  for (const a of applications) {
    const stage = a.stage as string;
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
  }
  // Every stage populated, or the board has an empty column and the funnel on
  // the review page says nothing.
  for (const stage of ["researching", "applied", "interviewing", "offer", "rejected", "archived"]) {
    assert.ok((byStage.get(stage) ?? 0) > 0, `no applications in ${stage}`);
  }
  assert.ok(applications.length >= 30, `only ${applications.length} applications`);
});

test("every row the seed writes points at something that exists", () => {
  const rows = seedRows();
  const ids = (table: string) => new Set(rows[table as keyof typeof rows].map((r) => (r as { id: string }).id));
  const companies = ids("companies");
  const applications = ids("applications");
  const captures = ids("raw_captures");

  for (const a of rows.applications) {
    assert.ok(companies.has(a.company_id as string), `application ${a.id} has no company`);
  }
  for (const t of rows.tasks) {
    if (t.company_id) assert.ok(companies.has(t.company_id as string), `task ${t.id} has no company`);
    if (t.application_id) assert.ok(applications.has(t.application_id as string), `task ${t.id} has no application`);
    if (t.source_capture_id) assert.ok(captures.has(t.source_capture_id as string), `task ${t.id} has no capture`);
  }
  for (const e of rows.application_events) {
    assert.ok(applications.has(e.application_id as string), `event ${e.id} has no application`);
  }
  for (const c of rows.contacts) {
    if (c.company_id) assert.ok(companies.has(c.company_id as string), `contact ${c.id} has no company`);
  }
});

test("the seed writes no duplicate ids", () => {
  const rows = seedRows();
  for (const [table, batch] of Object.entries(rows)) {
    const ids = batch.map((r) => (r as { id?: string }).id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${table} has a duplicate id`);
  }
});

test("the seed obeys the CHECK constraints it will be inserted against", () => {
  const rows = seedRows();
  const stages = ["researching", "applied", "interviewing", "offer", "rejected", "archived"];
  const lanes = ["primary", "secondary", "peripheral"];

  for (const a of rows.applications) {
    assert.ok(stages.includes(a.stage as string), `bad stage ${a.stage}`);
    assert.ok(lanes.includes(a.lane as string), `bad lane ${a.lane}`);
    assert.ok(["job", "grad_school"].includes(a.kind as string), `bad kind ${a.kind}`);
  }
  for (const e of rows.application_events) {
    assert.ok(stages.includes(e.to_stage as string), `bad to_stage ${e.to_stage}`);
    if (e.from_stage !== null) assert.ok(stages.includes(e.from_stage as string));
  }
  for (const m of rows.memory_log) {
    assert.ok(
      ["capture", "stage_change", "task_completed", "weekly_review", "habit_note", "contact_touch", "crm_change"]
        .includes(m.source_type as string),
      `bad memory source ${m.source_type}`,
    );
  }
});

test("an applied role has an applied date and a researching role does not", () => {
  for (const a of seedRows().applications) {
    if (a.stage === "researching") {
      assert.equal(a.applied_date, null, "a researching role has an applied date");
    } else {
      assert.ok(a.applied_date, `${a.role_title} is ${a.stage} with no applied date`);
    }
  }
});

test("the seed is anchored to today, so the demo never looks abandoned", () => {
  const rows = seedRows();
  const dates = rows.daily_logs.map((l) => l.log_date as string).sort();
  assert.equal(dates[dates.length - 1], today(), "the habit grid stops before today");
  assert.equal(dates.length, 42, "six weeks of history is what the timeline needs");

  // The newest row must be today's and the oldest six weeks back, whenever
  // this is run — a fixed seed would have gone stale within a week.
  assert.equal(dates[0], addDays(today(), -41));
});

test("the day a reset runs does not change what the seed contains", () => {
  // Same shape every night, only shifted. A seed whose size wandered would
  // make the reset's own log impossible to read.
  const a = seedRows();
  const b = seedRows();
  for (const table of SEED_ORDER) {
    assert.equal(a[table].length, b[table].length, `${table} is not deterministic`);
  }
});
