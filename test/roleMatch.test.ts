import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, findPossibleMatch, type TrackedRole } from "../src/lib/roleMatch.ts";

/**
 * How a newly captured role is compared with the ones already tracked.
 *
 * The case that prompted this (2026-10-06): one role captured from two sites,
 * with and without "Program" in its title, was saved twice and never flagged.
 * Fictional company and roles below, shaped like the real ones.
 */

const TRACKED: TrackedRole[] = [
  { id: "app-analyst", company_name: "Northwind", stage: "applied",
    role_title: "AI Strategy & Innovation Analyst - Future Leaders Program (2027)" },
  { id: "app-specialist", company_name: "Northwind", stage: "applied",
    role_title: "Strategy Specialist - Future Leaders Program (2027)" },
  { id: "app-architect", company_name: "Northwind", stage: "researching",
    role_title: "AI Business Solutions Architect - Future Leaders Program (2027)" },
  { id: "app-pm", company_name: "Helio Grid", stage: "applied",
    role_title: "Technical Program Manager" },
];

/* ── Same role: decided without asking ───────────────────────────────────── */

test("'&' and 'and', and connecting words, do not make a second role", () => {
  assert.equal(
    dedupeKey("Northwind", "AI Strategy & Innovation Analyst"),
    dedupeKey("northwind", "AI Strategy and Innovation Analyst"),
  );
  assert.equal(
    dedupeKey("Northwind", "Head of the Data Team"),
    dedupeKey("Northwind", "Head, Data Team"),
  );
});

test("'Program' is not ignored — Program Manager is not Manager", () => {
  assert.notEqual(
    dedupeKey("Helio Grid", "Technical Program Manager"),
    dedupeKey("Helio Grid", "Technical Manager"),
  );
});

/* ── Possible match: asked about ─────────────────────────────────────────── */

test("the regression: one role, with and without 'Program', is asked about", () => {
  const match = findPossibleMatch(
    "Northwind", "AI Strategy & Innovation Analyst - Future Leaders (2027)", TRACKED,
  );
  assert.equal(match?.application_id, "app-analyst");
  assert.equal(match?.stage, "applied");
});

test("a shortened title from another site is asked about", () => {
  const match = findPossibleMatch("Northwind", "AI Strategy & Innovation Analyst", TRACKED);
  assert.equal(match?.application_id, "app-analyst");
});

test("a different year of the same programme is asked about, not assumed", () => {
  const match = findPossibleMatch(
    "Northwind", "Strategy Specialist - Future Leaders Program (2028)", TRACKED,
  );
  assert.equal(match?.application_id, "app-specialist");
});

/* ── Not flagged: different roles ────────────────────────────────────────── */

test("different roles in the same programme are not flagged", () => {
  assert.equal(
    findPossibleMatch("Northwind", "Supply Chain Analyst - Future Leaders Program (2027)", TRACKED),
    null,
  );
  // Each tracked role against the others: sharing a programme name is not enough.
  for (const role of TRACKED.filter((r) => r.company_name === "Northwind")) {
    const others = TRACKED.filter((r) => r.id !== role.id);
    assert.equal(findPossibleMatch(role.company_name, role.role_title, others), null, role.role_title);
  }
});

test("an exact match is not also reported as a possible one", () => {
  assert.equal(
    findPossibleMatch("Northwind", "Strategy Specialist – Future Leaders Program (2027)", TRACKED),
    null,
  );
});

test("a one-word title does not match everything it appears in", () => {
  assert.equal(findPossibleMatch("Helio Grid", "Manager", TRACKED), null);
});

test("only roles at the same company are considered", () => {
  assert.equal(
    findPossibleMatch("Arcadia Climate", "AI Strategy & Innovation Analyst - Future Leaders (2027)", TRACKED),
    null,
  );
});
