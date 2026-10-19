import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveClassification,
  type ClassifierRows,
  type ParsedClassification,
} from "../src/lib/ai/classify.ts";

/**
 * What the server does with what the model said.
 *
 * This is where hard rule 5 lives: the model answers with names, and every id
 * that reaches the confirm screen is looked up against rows that actually
 * exist. Nothing here calls the model — `resolveClassification` is the half
 * that runs after it, and it is pure, so it can be tested exhaustively for
 * nothing.
 *
 * It is worth testing hard because the failure mode is quiet. A resolution
 * that misses does not throw; it produces a confirm screen that looks right
 * and then writes a duplicate company, a second copy of a person, or a stage
 * change attached to nothing. That is exactly what shipped to the live demo on
 * 2026-10-05 and was caught by eye rather than by a test.
 */

const ROWS: ClassifierRows = {
  companies: [
    { id: "co-arcadia", name: "Arcadia Climate" },
    { id: "co-helio", name: "Helio Grid" },
    { id: "co-current", name: "Current Labs" },
  ],
  contacts: [
    { id: "ct-priya", name: "Priya Raghunathan", company_id: "co-helio" },
    { id: "ct-dana", name: "Dana Whitfield", company_id: "co-arcadia" },
  ],
  applications: [
    { id: "app-arcadia", company_name: "Arcadia Climate", role_title: "Data Analyst", stage: "applied", lane: "primary", kind: "job" },
    { id: "app-helio", company_name: "Helio Grid", role_title: "Grid Strategy Analyst", stage: "interviewing", lane: "primary", kind: "job" },
    { id: "app-current", company_name: "Current Labs", role_title: "Solutions Engineer", stage: "researching", lane: "secondary", kind: "job" },
  ],
};

/** A complete, empty answer. Each test fills in only the part it is about. */
const blank: ParsedClassification = {
  summary: "Something happened.",
  category: "reflection",
  matched_companies: [],
  matched_contacts: [],
  suggested_tasks: [],
  suggested_stage_changes: [],
  suggested_applications: [],
  suggested_contact_touches: [],
  confidence: 0.9,
} as ParsedClassification;

const answer = (parts: Partial<ParsedClassification>): ParsedClassification =>
  ({ ...blank, ...parts }) as ParsedClassification;

/* ── Matching names to rows ───────────────────────────────────────────────── */

test("a company that exists resolves to its id", () => {
  const out = resolveClassification(
    answer({ matched_companies: [{ matched_name: "Arcadia Climate", known: true }] }),
    ROWS,
  );
  assert.equal(out.matched_companies[0].id, "co-arcadia");
  assert.equal(out.matched_companies[0].is_new, false);
});

test("a company that does not exist comes back as new, not invented", () => {
  const out = resolveClassification(
    answer({ matched_companies: [{ matched_name: "Totally Fictional Inc", known: true }] }),
    ROWS,
  );
  // The model claimed it was known. The row does not exist, so the claim loses.
  assert.equal(out.matched_companies[0].id, null);
  assert.equal(out.matched_companies[0].is_new, true);
});

test("matching ignores case, punctuation and spacing", () => {
  // "arcadia  climate." and "Arcadia Climate" are the same company, and a
  // model that types the note's own wording should not create a second one.
  for (const spelling of ["arcadia climate", "ARCADIA CLIMATE", "Arcadia  Climate.", "arcadia-climate"]) {
    const out = resolveClassification(
      answer({ matched_companies: [{ matched_name: spelling, known: false }] }),
      ROWS,
    );
    assert.equal(out.matched_companies[0].id, "co-arcadia", `failed on "${spelling}"`);
  }
});

test("an empty name is dropped rather than matched to nothing", () => {
  const out = resolveClassification(
    answer({ matched_companies: [{ matched_name: "   ", known: false }] }),
    ROWS,
  );
  assert.equal(out.matched_companies.length, 0);
});

/* ── New applications ─────────────────────────────────────────────────────── */

test("a new role at a known company attaches to that company", () => {
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Arcadia Climate", role_title: "Climate Risk Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    ROWS,
  );
  // The regression that shipped on 2026-10-05: null here meant the confirm
  // screen offered to create a second Arcadia Climate.
  assert.equal(out.suggested_applications[0].existing_company_id, "co-arcadia");
  assert.equal(out.suggested_applications[0].duplicate_of_application_id, null);
});

test("a role at an unknown company carries no company id", () => {
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Brand New Co", role_title: "Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_applications[0].existing_company_id, null);
});

test("a role already on the board is flagged as a duplicate", () => {
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Arcadia Climate", role_title: "Data Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_applications[0].duplicate_of_application_id, "app-arcadia");
});

test("a role with no company or no title is dropped", () => {
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "", role_title: "Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
        { company_name: "Helio Grid", role_title: "  ", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_applications.length, 0);
});

test("a nonsense stage or lane falls back rather than reaching the database", () => {
  // The schema constrains these, so in practice the model cannot send them —
  // but the runtime fallback exists for the day the schema and the columns
  // drift apart, and that is the day it needs to work. Cast through unknown
  // because the point is to send values the type says are impossible.
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Helio Grid", role_title: "Analyst", lane: "sideways", stage: "ghosted", kind: "sabbatical", deadline: "", remind_on: "", remind_days_before: 0 },
      ] as unknown as ParsedClassification["suggested_applications"],
    }),
    ROWS,
  );
  // Every one of these columns has a CHECK constraint. An unrecognised value
  // must be corrected here, not sent to Postgres to be rejected.
  assert.equal(out.suggested_applications[0].stage, "applied");
  assert.equal(out.suggested_applications[0].lane, null);
  assert.equal(out.suggested_applications[0].kind, "job");
});

/* ── Stage changes ────────────────────────────────────────────────────────── */

test("a stage change finds its application by company and role", () => {
  const out = resolveClassification(
    answer({
      suggested_stage_changes: [
        { company_name: "Helio Grid", role_title: "Grid Strategy Analyst", to_stage: "offer" },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_stage_changes[0].application_id, "app-helio");
  assert.equal(out.suggested_stage_changes[0].to_stage, "offer");
});

test("a company with exactly one application needs no role named", () => {
  const out = resolveClassification(
    answer({
      suggested_stage_changes: [{ company_name: "Helio Grid", role_title: "", to_stage: "rejected" }],
    }),
    ROWS,
  );
  assert.equal(out.suggested_stage_changes[0].application_id, "app-helio");
});

test("a company the person has never applied to leaves the id null", () => {
  const out = resolveClassification(
    answer({
      suggested_stage_changes: [{ company_name: "Someone Else", role_title: "", to_stage: "rejected" }],
    }),
    ROWS,
  );
  // Null is correct: the confirm step asks which application was meant rather
  // than guessing and moving the wrong card.
  assert.equal(out.suggested_stage_changes[0].application_id, null);
});

test("naming the same application twice produces one move", () => {
  const out = resolveClassification(
    answer({
      suggested_stage_changes: [
        { company_name: "Helio Grid", role_title: "Grid Strategy Analyst", to_stage: "offer" },
        { company_name: "Helio Grid", role_title: "", to_stage: "offer" },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_stage_changes.length, 1);
});

test("a role being logged as new does not also get a stage change", () => {
  // "I applied to the Climate Risk Analyst role at Arcadia" is one fact. Asking
  // the person to tick both a new row and a move for it is asking twice.
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Arcadia Climate", role_title: "Climate Risk Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
      suggested_stage_changes: [
        { company_name: "Arcadia Climate", role_title: "Climate Risk Analyst", to_stage: "applied" },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_stage_changes.length, 0);
  assert.equal(out.suggested_applications.length, 1);
});

test("applying to a role already in Researching becomes a move, not a second row", () => {
  // The model is told to report submissions without checking what is tracked,
  // so "I applied to the Current Labs SE role" arrives as a new application
  // even though that role is already sitting in Researching.
  const out = resolveClassification(
    answer({
      suggested_applications: [
        { company_name: "Current Labs", role_title: "Solutions Engineer", lane: "secondary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_applications[0].duplicate_of_application_id, "app-current");
  assert.equal(out.suggested_stage_changes.length, 1);
  assert.equal(out.suggested_stage_changes[0].application_id, "app-current");
  assert.equal(out.suggested_stage_changes[0].to_stage, "applied");
});

/* ── Conversations ────────────────────────────────────────────────────────── */

test("a conversation resolves to the person it was with", () => {
  const out = resolveClassification(
    answer({
      suggested_contact_touches: [
        { contact_name: "Dana Whitfield", company_name: "Arcadia Climate", role: "Recruiter", relationship_type: "recruiter", note: "Coffee chat.", follow_up_in_days: 7 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_contact_touches[0].contact_id, "ct-dana");
  assert.equal(out.suggested_contact_touches[0].follow_up_in_days, 7);
});

test("a conversation with someone new carries no id, so the confirm step can offer to create them", () => {
  const out = resolveClassification(
    answer({
      suggested_contact_touches: [
        { contact_name: "Someone New", company_name: "", role: "", relationship_type: "unknown", note: "Met at a mixer.", follow_up_in_days: 0 },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_contact_touches[0].contact_id, null);
  assert.equal(out.suggested_contact_touches[0].company_name, null);
  assert.equal(out.suggested_contact_touches[0].relationship_type, null);
  assert.equal(out.suggested_contact_touches[0].follow_up_in_days, null);
});

/* ── Tasks ────────────────────────────────────────────────────────────────── */

test("a task keeps a real date and drops an unusable one", () => {
  const out = resolveClassification(
    answer({
      suggested_tasks: [
        { title: "Send the case study", task_type: "interview_prep", lane: "primary", due_date: "2026-10-09" },
        { title: "Chase Tomas", task_type: "nonsense", lane: "none", due_date: "next Friday" },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_tasks[0].due_date, "2026-10-09");
  assert.equal(out.suggested_tasks[0].lane, "primary");
  // "next Friday" is not a date this app can store, and "none" is not a lane.
  assert.equal(out.suggested_tasks[1].due_date, null);
  assert.equal(out.suggested_tasks[1].task_type, "other");
  assert.equal(out.suggested_tasks[1].lane, null);
});

test("every task in a note survives — not just the first", () => {
  const out = resolveClassification(
    answer({
      suggested_tasks: [
        { title: "Email Dara", task_type: "networking_outreach", lane: "primary", due_date: "" },
        { title: "Book the Lumen call", task_type: "other", lane: "none", due_date: "" },
        { title: "Redo the deck", task_type: "interview_prep", lane: "primary", due_date: "" },
      ],
    }),
    ROWS,
  );
  assert.equal(out.suggested_tasks.length, 3);
});

test("a task with no title is dropped", () => {
  const out = resolveClassification(
    answer({
      suggested_tasks: [{ title: "  ", task_type: "other", lane: "none", due_date: "" }],
    }),
    ROWS,
  );
  assert.equal(out.suggested_tasks.length, 0);
});

/* ── The envelope ─────────────────────────────────────────────────────────── */

test("confidence is clamped to something that can be shown as a percentage", () => {
  for (const [given, expected] of [[1.7, 1], [-0.4, 0], [0.62, 0.62]] as const) {
    const out = resolveClassification(answer({ confidence: given }), ROWS);
    assert.equal(out.confidence, expected);
  }
});

test("an empty CRM resolves everything as new rather than failing", () => {
  const empty: ClassifierRows = { companies: [], contacts: [], applications: [] };
  const out = resolveClassification(
    answer({
      matched_companies: [{ matched_name: "Arcadia Climate", known: true }],
      suggested_applications: [
        { company_name: "Arcadia Climate", role_title: "Analyst", lane: "primary", stage: "applied", kind: "job", deadline: "", remind_on: "", remind_days_before: 0 },
      ],
    }),
    empty,
  );
  assert.equal(out.matched_companies[0].is_new, true);
  assert.equal(out.suggested_applications[0].existing_company_id, null);
  assert.equal(out.suggested_applications[0].duplicate_of_application_id, null);
});
