import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveExtractedJobs, type KnownRows, type ParsedJobs,
} from "../src/lib/ai/extractJobs.ts";
import { dedupeKey, normalizeName } from "../src/lib/db/applications.ts";

/**
 * The screenshot importer's second half — what happens to what the model read
 * off a job board.
 *
 * It matters for the same reason the typed-note path does: this is where a
 * listing becomes either a new row or a duplicate flagged as already tracked,
 * and getting it wrong produces a second copy of a company rather than an
 * error anyone would notice.
 *
 * No model call here. `resolveExtractedJobs` is pure.
 */

const KNOWN: KnownRows = {
  companies: [
    { id: "co-arcadia", name: "Arcadia Climate" },
    { id: "co-helio", name: "Helio Grid" },
  ],
  applications: [
    { id: "app-helio", company_name: "Helio Grid", role_title: "Energy Data Analyst", stage: "applied" },
  ],
};

const jobs = (...list: Partial<ParsedJobs["jobs"][number]>[]): ParsedJobs =>
  ({
    jobs: list.map((j) => ({
      company_name: "", role_title: "", location: "", source_platform: "",
      deadline: "", posted_days_ago: 0, ...j,
    })),
    confidence: 0.9,
  }) as ParsedJobs;

/* ── Companies ────────────────────────────────────────────────────────────── */

/**
 * The regression. Until 2026-10-05 this path matched companies on
 * lowercase-and-trim alone, while role dedupe and the typed-note path both
 * stripped punctuation too. A screenshot naming "Arcadia Climate." therefore
 * created a second Arcadia Climate, and a typed note naming the same thing
 * did not.
 */
test("a company is matched the same way however it is punctuated", () => {
  for (const spelling of [
    "Arcadia Climate", "arcadia climate", "ARCADIA CLIMATE",
    "Arcadia  Climate", "Arcadia Climate.", "Arcadia-Climate",
  ]) {
    const out = resolveExtractedJobs(
      jobs({ company_name: spelling, role_title: "Analyst" }),
      KNOWN,
    );
    assert.equal(out.jobs[0].existing_company_id, "co-arcadia", `failed on "${spelling}"`);
  }
});

test("the screenshot path and the typed-note path agree on what a name is", () => {
  // One rule, exported once. Two rules that drift is how the bug above
  // happened in the first place.
  assert.equal(normalizeName("Arcadia  Climate."), normalizeName("arcadia climate"));
  assert.equal(
    dedupeKey("Arcadia Climate.", "Data Analyst"),
    dedupeKey("arcadia  climate", "data analyst"),
  );
});

test("a company nobody has applied to yet carries no id", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Totally New Co", role_title: "Analyst" }),
    KNOWN,
  );
  assert.equal(out.jobs[0].existing_company_id, null);
});

/* ── Duplicates ───────────────────────────────────────────────────────────── */

test("a role already on the board comes back flagged, with its stage", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Helio Grid", role_title: "Energy Data Analyst" }),
    KNOWN,
  );
  // Flagged rather than dropped: the confirm screen says "already tracked"
  // instead of silently logging it twice or silently hiding it.
  assert.equal(out.jobs[0].duplicate_of_application_id, "app-helio");
  assert.equal(out.jobs[0].duplicate_stage, "applied");
});

test("a different role at the same company is not a duplicate", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Helio Grid", role_title: "Commercial Analyst" }),
    KNOWN,
  );
  assert.equal(out.jobs[0].duplicate_of_application_id, null);
  // Still attached to the company that exists.
  assert.equal(out.jobs[0].existing_company_id, "co-helio");
});

test("the same listing twice in one import becomes one row", () => {
  // A pinned listing appears again in the list below it, and two screenshots
  // of one page overlap. Both are the same job.
  const out = resolveExtractedJobs(
    jobs(
      { company_name: "Helio Grid", role_title: "Commercial Analyst" },
      { company_name: "helio grid", role_title: "commercial  analyst" },
      { company_name: "Helio Grid", role_title: "Commercial Analyst." },
    ),
    KNOWN,
  );
  assert.equal(out.jobs.length, 1);
});

/* ── Fields ───────────────────────────────────────────────────────────────── */

test("a listing with no company or no role is dropped", () => {
  const out = resolveExtractedJobs(
    jobs(
      { company_name: "", role_title: "Analyst" },
      { company_name: "Helio Grid", role_title: "   " },
    ),
    KNOWN,
  );
  assert.equal(out.jobs.length, 0);
});

test("blank optional fields become null rather than empty strings", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "New Co", role_title: "Analyst", location: "  ", source_platform: "" }),
    KNOWN,
  );
  assert.equal(out.jobs[0].location, null);
  assert.equal(out.jobs[0].source_platform, null);
});

test("a posting age is kept when it is sane and dropped when it is not", () => {
  const out = resolveExtractedJobs(
    jobs(
      { company_name: "A Co", role_title: "One", posted_days_ago: 21 },
      { company_name: "B Co", role_title: "Two", posted_days_ago: -3 },
      { company_name: "C Co", role_title: "Three", posted_days_ago: 2.6 },
    ),
    KNOWN,
  );
  assert.equal(out.jobs[0].posted_days_ago, 21);
  // A listing posted in the future is a misread, not a date.
  assert.equal(out.jobs[1].posted_days_ago, null);
  assert.equal(out.jobs[2].posted_days_ago, 3);
});

test("a deadline that is not a date is dropped rather than stored", () => {
  const out = resolveExtractedJobs(
    jobs(
      { company_name: "A Co", role_title: "One", deadline: "2026-11-30" },
      { company_name: "B Co", role_title: "Two", deadline: "rolling" },
    ),
    KNOWN,
  );
  assert.equal(out.jobs[0].deadline, "2026-11-30");
  assert.equal(out.jobs[1].deadline, null);
});

test("confidence is clamped so it can be shown as a percentage", () => {
  const out = resolveExtractedJobs({ ...jobs(), confidence: 4 }, KNOWN);
  assert.equal(out.confidence, 1);
});

test("an empty CRM resolves everything as new rather than failing", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Arcadia Climate", role_title: "Analyst" }),
    { companies: [], applications: [] },
  );
  assert.equal(out.jobs[0].existing_company_id, null);
  assert.equal(out.jobs[0].duplicate_of_application_id, null);
});

/* ── Near-matches ─────────────────────────────────────────────────────────── */

/**
 * The 2026-10-06 regression: one role captured from two sites, the second
 * without "Program" in its title, went in as new without a word. It now comes
 * back as a possible match for the confirm screen to ask about.
 */
test("a near-identical title at the same company comes back as a possible match", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Helio Grid", role_title: "Energy Data Analyst (2027)" }),
    KNOWN,
  );
  assert.equal(out.jobs[0].duplicate_of_application_id, null);
  assert.equal(out.jobs[0].possible_match?.application_id, "app-helio");
});

test("an exact match is a duplicate, not a possible match", () => {
  const out = resolveExtractedJobs(
    jobs({ company_name: "Helio Grid", role_title: "Energy-Data Analyst." }),
    KNOWN,
  );
  assert.equal(out.jobs[0].duplicate_of_application_id, "app-helio");
  assert.equal(out.jobs[0].possible_match, null);
});
