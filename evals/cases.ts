/**
 * The eval cases: a note (or screenshot), and what a correct reading of it
 * must contain.
 *
 * Checks are about structure, not wording — "exactly two stage changes, one
 * to Rejected for Brightline" — because those are what turn into rows. A
 * summary phrased differently is fine; a dropped move is not.
 */
import type { CaptureClassification, ScreenshotClassification, Stage } from "../src/lib/types.ts";

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const check = (name: string, pass: boolean, detail?: string): Check => ({ name, pass, detail });
const count = (name: string, actual: number, expected: number) =>
  check(name, actual === expected, `expected ${expected}, got ${actual}`);

/** Is there a move of this application to this stage? */
const moves = (c: CaptureClassification, appId: string, to: Stage) =>
  c.suggested_stage_changes.some((m) => m.application_id === appId && m.to_stage === to);

export interface NoteCase {
  id: string;
  /** What this case is probing, in a line — shown in the report. */
  probes: string;
  note: string;
  expect: (c: CaptureClassification) => Check[];
}

export const NOTE_CASES: NoteCase[] = [
  {
    id: "two-moves",
    probes: "two pipeline moves in one note (the old single-slot bug)",
    note: "Got rejected from Brightline today, and Northwind invited me to interview for the BI Engineer role.",
    expect: (c) => [
      count("stage changes", c.suggested_stage_changes.length, 2),
      check("Brightline → Rejected", moves(c, "app-bright", "rejected")),
      check("Northwind BI Engineer → Interviewing", moves(c, "app-nw-bi", "interviewing")),
      count("new applications", c.suggested_applications.filter((a) => !a.duplicate_of_application_id).length, 0),
    ],
  },
  {
    id: "researching-to-applied",
    probes: "submitting a role already in Researching is a move, not a duplicate",
    note: "Finally submitted my application for the Rhodium research analyst role.",
    expect: (c) => [
      check("Rhodium → Applied", moves(c, "app-rhodium", "applied")),
      count("new applications", c.suggested_applications.filter((a) => !a.duplicate_of_application_id).length, 0),
    ],
  },
  {
    id: "two-roles-one-company",
    probes: "two new roles at the same company stay two entries",
    note: "Applied to the Product Analyst role and the Data Engineer role at Vela Robotics.",
    expect: (c) => {
      const vela = c.suggested_applications.filter((a) => /vela/i.test(a.company_name));
      return [
        count("Vela applications", vela.length, 2),
        check("both at Applied", vela.every((a) => a.stage === "applied")),
        count("stage changes", c.suggested_stage_changes.length, 0),
      ];
    },
  },
  {
    id: "remind-to-apply",
    probes: "a role to apply to later is Researching with its deadline, not a task",
    note: "Remind me to apply to the Strategy Associate role at Kestrel Partners — it's due Oct 20.",
    expect: (c) => {
      const k = c.suggested_applications.find((a) => /kestrel/i.test(a.company_name));
      return [
        check("Kestrel proposed", Boolean(k)),
        check("stage Researching", k?.stage === "researching", `got ${k?.stage}`),
        check("deadline Oct 20", Boolean(k?.deadline?.endsWith("-10-20")), `got ${k?.deadline}`),
        count("tasks", c.suggested_tasks.length, 0),
      ];
    },
  },
  {
    id: "three-tasks",
    probes: "a list of to-dos is every to-do, and none are logged as conversations",
    note: "Need to email Dara about the timeline, prep for the Lumen case interview, and redo my resume summary.",
    expect: (c) => [
      count("tasks", c.suggested_tasks.length, 3),
      count("conversations", c.suggested_contact_touches.length, 0),
    ],
  },
  {
    id: "three-touches",
    probes: "outreach already sent is conversations, not tasks",
    note: "Reached out to three alums today: Priya at Northwind, Marcus at Lumen, and Jo at Brightline.",
    expect: (c) => [
      count("conversations", c.suggested_contact_touches.length, 3),
      count("tasks", c.suggested_tasks.length, 0),
    ],
  },
  {
    id: "known-contact-follow-up",
    probes: "a known person resolves to the real row; 'next week' is 7 days",
    note: "Coffee chat with Sam Patel went really well — follow up next week.",
    expect: (c) => {
      const t = c.suggested_contact_touches[0];
      return [
        count("conversations", c.suggested_contact_touches.length, 1),
        check("resolved to Sam's row", t?.contact_id === "ct-sam", `got ${t?.contact_id}`),
        check("follow up in 7 days", t?.follow_up_in_days === 7, `got ${t?.follow_up_in_days}`),
      ];
    },
  },
  {
    id: "grad-school",
    probes: "a degree program is grad school, with the university as the company",
    note: "Want to apply to Stanford's MS in Management Science & Engineering by December 1.",
    expect: (c) => {
      const s = c.suggested_applications[0];
      return [
        count("applications", c.suggested_applications.length, 1),
        check("kind grad school", s?.kind === "grad_school", `got ${s?.kind}`),
        check("company is Stanford", /stanford/i.test(s?.company_name ?? "")),
        check("stage Researching", s?.stage === "researching", `got ${s?.stage}`),
        check("deadline Dec 1", Boolean(s?.deadline?.endsWith("-12-01")), `got ${s?.deadline}`),
      ];
    },
  },
  {
    id: "intent-without-role",
    probes: "intent with no named role is a task, not an application",
    note: "I should apply to Figma at some point.",
    expect: (c) => [
      count("applications", c.suggested_applications.length, 0),
      check("one task", c.suggested_tasks.length === 1, `got ${c.suggested_tasks.length}`),
    ],
  },
  {
    id: "enthusiasm-only",
    probes: "enthusiasm is not a pipeline move",
    note: "Really excited about the Lumen role, the team seems great.",
    expect: (c) => [
      count("stage changes", c.suggested_stage_changes.length, 0),
      count("applications", c.suggested_applications.length, 0),
    ],
  },
  {
    id: "offer",
    probes: "an offer moves the role to Offer",
    note: "Got the offer from Lumen Health!!",
    expect: (c) => [
      check("Lumen → Offer", moves(c, "app-lumen", "offer")),
      count("stage changes", c.suggested_stage_changes.length, 1),
    ],
  },
  {
    id: "ambiguous-company",
    probes: "a move on a company with two roles must not guess the role",
    note: "Northwind invited me to interview.",
    expect: (c) => {
      const m = c.suggested_stage_changes[0];
      return [
        count("stage changes", c.suggested_stage_changes.length, 1),
        check("to Interviewing", m?.to_stage === "interviewing", `got ${m?.to_stage}`),
        // Two Northwind roles exist and the note names neither: the server
        // must leave the pick to you rather than choose one.
        check("application left for you to pick", m?.application_id === null, `got ${m?.application_id}`),
      ];
    },
  },
  {
    id: "rejection-plus-new",
    probes: "a move and a new submission in one note",
    note: "Heard back from Brightline — rejected. On the bright side I applied to Kestrel Partners' Strategy Associate role.",
    expect: (c) => [
      check("Brightline → Rejected", moves(c, "app-bright", "rejected")),
      check("Kestrel added at Applied", c.suggested_applications.some(
        (a) => /kestrel/i.test(a.company_name) && a.stage === "applied")),
    ],
  },
  {
    id: "no-fabricated-ids",
    probes: "an unknown person and company stay new — nothing is matched to a real row",
    note: "Had a quick call with Jordan Reyes at Acme Robotics about their analytics team.",
    expect: (c) => {
      const t = c.suggested_contact_touches[0];
      const acme = c.matched_companies.find((m) => /acme/i.test(m.matched_name));
      return [
        check("Jordan is new", t ? t.contact_id === null : true, `got ${t?.contact_id}`),
        check("Acme is new", acme ? acme.is_new && acme.id === null : true),
      ];
    },
  },
];

export interface ScreenshotCase {
  id: string;
  probes: string;
  /** Files in evals/screenshots/. */
  files: string[];
  expect: (c: ScreenshotClassification) => Check[];
}

export const SCREENSHOT_CASES: ScreenshotCase[] = [
  {
    id: "confirmation-email",
    probes: "an 'application received' email is one job (the StepStone case)",
    files: ["confirmation-email.png"],
    expect: (c) => [
      count("jobs", c.jobs.length, 1),
      check("company Kestrel Partners", /kestrel/i.test(c.jobs[0]?.company_name ?? "")),
      check("role Strategy Associate", /strategy associate/i.test(c.jobs[0]?.role_title ?? "")),
    ],
  },
  {
    id: "saved-jobs",
    probes: "a saved-jobs page: every listing, its deadline and posting age, and a tracked duplicate",
    files: ["saved-jobs.png"],
    expect: (c) => {
      const by = (re: RegExp) => c.jobs.find((j) => re.test(j.company_name));
      return [
        count("jobs", c.jobs.length, 3),
        check("Orbital deadline Nov 3", Boolean(by(/orbital/i)?.deadline?.endsWith("-11-03")),
          `got ${by(/orbital/i)?.deadline}`),
        check("Tidewater posted 14 days ago", by(/tidewater/i)?.posted_days_ago === 14,
          `got ${by(/tidewater/i)?.posted_days_ago}`),
        check("Brightline flagged as tracked", Boolean(by(/brightline/i)?.duplicate_of_application_id)),
      ];
    },
  },
  {
    id: "rejection-email",
    probes: "a rejection email is not a listing — it belongs to the text capture",
    files: ["rejection-email.png"],
    expect: (c) => [count("jobs", c.jobs.length, 0)],
  },
];
