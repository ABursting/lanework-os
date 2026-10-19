import { USER_ID } from "../constants";
import { addDays, currentPeriodStart, startOfWeek, today } from "../time";
import type { CivilDate } from "../time";

/**
 * The demo's fictional data.
 *
 * ── Who this is ─────────────────────────────────────────────────────────────
 * Jamie Rivera, a senior at Calloway University, looking for a first job in
 * climate, energy, data & AI, and product. Every company, person, role and
 * note below is invented. None of Asher's real recruiting data is in the demo
 * database, and none of it is in this repository.
 *
 * ── Why it is generated rather than a .sql file ─────────────────────────────
 * Two reasons. It is anchored to the current date, so a visitor in March sees
 * a search in progress rather than a board that stopped six months ago — the
 * timeline, the habit grid and the stale-application colouring all only mean
 * something relative to today. And the nightly reset restores the demo by
 * writing exactly these rows, so a single definition keeps the reset and the
 * first seeding honest with each other.
 *
 * ── The shape ───────────────────────────────────────────────────────────────
 * About six weeks of history ending today: 31 applications across every stage,
 * 12 companies, 8 contacts, open and finished tasks, three habits ticked
 * unevenly the way real ones are, goals part-met, a sealed weekly review and a
 * draft one, and a memory log assembled from all of it so Brain has something
 * to search.
 *
 * Lanes stay what they are in the real app — primary / secondary / peripheral
 * are priority tiers, not subject areas — so Jamie's four fields are spread
 * across all three rather than mapped onto them.
 */

/* ── Identifiers ─────────────────────────────────────────────────────────────
   Fixed, not random. The reset deletes everything and writes these same rows
   back, so stable ids keep the relationships between them intact and make a
   half-finished reset obvious rather than subtly wrong. */
const uid = (kind: number, n: number) =>
  `de${String(kind).padStart(2, "0")}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const company = (n: number) => uid(1, n);
const application = (n: number) => uid(2, n);
const contact = (n: number) => uid(3, n);
const task = (n: number) => uid(4, n);
const habit = (n: number) => uid(5, n);
const goal = (n: number) => uid(6, n);
const capture = (n: number) => uid(7, n);
const review = (n: number) => uid(8, n);
const event = (n: number) => uid(9, n);
const memory = (n: number) => uid(10, n);
const log = (n: number) => uid(11, n);
const connection = (n: number) => uid(12, n);

/* ── Clock ───────────────────────────────────────────────────────────────────
   `ago(n)` is n days before today as a civil date. `at(date, hour)` turns one
   into an instant at a plausible working hour — 17:00 UTC is roughly noon in
   America/Chicago year-round, close enough for seed data and immune to the
   daylight-saving arithmetic that would otherwise have to be got right twice
   a year for no visible benefit. */
const ago = (days: number, from: CivilDate = today()) => addDays(from, -days);
const at = (date: CivilDate, hourUtc = 17) =>
  `${date}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`;

export type SeedTable =
  | "companies"
  | "applications"
  | "contacts"
  | "connections"
  | "habit_definitions"
  | "goals"
  | "raw_captures"
  | "tasks"
  | "application_events"
  | "daily_logs"
  | "weekly_reviews"
  | "memory_log"
  | "user_settings";

/**
 * The order rows must be written in, because of the foreign keys: a company
 * before the applications that reference it, an application before its own
 * history and the tasks hanging off it, a capture before the task it created.
 * The reset deletes in exactly this order reversed.
 */
export const SEED_ORDER: SeedTable[] = [
  "companies",
  "applications",
  "contacts",
  "connections",
  "habit_definitions",
  "goals",
  "raw_captures",
  "tasks",
  "application_events",
  "daily_logs",
  "weekly_reviews",
  "memory_log",
  "user_settings",
];

/* ── Companies ───────────────────────────────────────────────────────────── */

const COMPANIES: [n: number, name: string, sector: string, site: string][] = [
  [1, "Arcadia Climate", "climate analytics", "arcadiaclimate.example"],
  [2, "Helio Grid", "solar & storage", "heliogrid.example"],
  [3, "Northwind Analytics", "data & AI consulting", "northwindanalytics.example"],
  [4, "Terrawatt Energy", "utility-scale renewables", "terrawatt.example"],
  [5, "Meridian Software", "product / B2B SaaS", "meridiansoftware.example"],
  [6, "Current Labs", "grid software", "currentlabs.example"],
  [7, "Verdant Capital", "climate venture", "verdantcap.example"],
  [8, "Lumen Robotics", "industrial AI", "lumenrobotics.example"],
  [9, "Basin Water Group", "water infrastructure", "basinwater.example"],
  [10, "Kestrel Mobility", "electric transport", "kestrelmobility.example"],
  [11, "Fieldstone Institute", "energy policy research", "fieldstone.example"],
  [12, "Calloway University", "graduate programs", "calloway.example"],
];

/* ── Applications ────────────────────────────────────────────────────────────
   Spread deliberately: a top-heavy pipeline with more applied than
   interviewing and more interviewing than offers is what a real search looks
   like in week six, and it is what makes the funnel on the review page say
   anything. `applied` is how many days ago it was submitted; `touched` how
   many days ago it last moved, which drives the stale colouring. */
type AppRow = {
  n: number;
  co: number;
  role: string;
  lane: "primary" | "secondary" | "peripheral";
  stage: "researching" | "applied" | "interviewing" | "offer" | "rejected" | "archived";
  applied?: number;
  touched: number;
  deadline?: number;
  remind?: number;
  remindEst?: boolean;
  passed?: boolean;
  kind?: "job" | "grad_school";
  platform?: string;
  notes?: string;
};

const APPLICATIONS: AppRow[] = [
  // ── Researching: planned, not yet sent. Each carries a reminder date. ──────
  { n: 1, co: 7, role: "Climate Investment Analyst", lane: "secondary", stage: "researching", touched: 2, deadline: -12, remind: -2, notes: "Posting says they review on a rolling basis — worth getting in early." },
  { n: 2, co: 9, role: "Infrastructure Data Analyst", lane: "peripheral", stage: "researching", touched: 5, deadline: -20, remind: -10 },
  { n: 3, co: 11, role: "Energy Policy Research Assistant", lane: "secondary", stage: "researching", touched: 1, remind: -4, remindEst: true, notes: "No deadline given; posted about three weeks ago." },
  { n: 4, co: 12, role: "MS Environmental Data Science", lane: "secondary", stage: "researching", touched: 8, deadline: -34, remind: -24, kind: "grad_school", notes: "Backup plan if the job search is still open in January." },
  { n: 5, co: 10, role: "Operations Analyst, Fleet", lane: "peripheral", stage: "researching", touched: 11, remind: 3, remindEst: true, notes: "Reminder has already slipped past — Compress should be surfacing this." },

  // ── Applied: sent, nothing back yet. ──────────────────────────────────────
  { n: 6, co: 2, role: "Energy Data Analyst", lane: "primary", stage: "applied", applied: 9, touched: 9, platform: "LinkedIn" },
  { n: 7, co: 4, role: "Renewables Analyst, Development", lane: "primary", stage: "applied", applied: 12, touched: 12, platform: "Handshake" },
  { n: 8, co: 6, role: "Associate Product Manager", lane: "primary", stage: "applied", applied: 7, touched: 7, platform: "Company site" },
  { n: 9, co: 8, role: "Data Analyst, Deployment", lane: "secondary", stage: "applied", applied: 16, touched: 16, platform: "LinkedIn" },
  { n: 10, co: 3, role: "Analytics Consultant", lane: "primary", stage: "applied", applied: 5, touched: 5, platform: "Referral" },
  { n: 11, co: 9, role: "Sustainability Associate", lane: "peripheral", stage: "applied", applied: 34, touched: 34, platform: "Handshake", notes: "Over a month with no word. Probably gone." },
  { n: 12, co: 10, role: "Product Analyst", lane: "secondary", stage: "applied", applied: 21, touched: 21, platform: "LinkedIn" },
  { n: 13, co: 11, role: "Research Analyst, Grid Policy", lane: "secondary", stage: "applied", applied: 14, touched: 14, platform: "Company site" },
  { n: 14, co: 7, role: "Investment Operations Associate", lane: "peripheral", stage: "applied", applied: 26, touched: 26, platform: "LinkedIn" },
  { n: 15, co: 5, role: "Technical Program Analyst", lane: "secondary", stage: "applied", applied: 3, touched: 3, platform: "Handshake" },
  { n: 16, co: 2, role: "Commercial Analyst, Storage", lane: "primary", stage: "applied", applied: 18, touched: 18, platform: "Company site" },

  // ── Interviewing: in a live process. ──────────────────────────────────────
  { n: 17, co: 1, role: "Data Analyst, Climate Risk", lane: "primary", stage: "interviewing", applied: 24, touched: 1, passed: true, platform: "Referral", notes: "Phone screen went well. Final round is three back-to-back next week." },
  { n: 18, co: 3, role: "Data Scientist, Energy Practice", lane: "primary", stage: "interviewing", applied: 30, touched: 4, passed: true, platform: "Referral", notes: "Case study due — they gave a week." },
  { n: 19, co: 5, role: "Product Manager Intern → FT", lane: "primary", stage: "interviewing", applied: 19, touched: 3, passed: true, platform: "Company site" },
  { n: 20, co: 6, role: "Solutions Engineer", lane: "secondary", stage: "interviewing", applied: 27, touched: 9, passed: true, platform: "LinkedIn", notes: "Recruiter went quiet after the second round — worth a nudge." },
  { n: 21, co: 8, role: "Applied AI Analyst", lane: "secondary", stage: "interviewing", applied: 22, touched: 6, passed: true, platform: "LinkedIn" },
  { n: 22, co: 4, role: "Project Development Analyst", lane: "primary", stage: "interviewing", applied: 33, touched: 12, passed: true, platform: "Handshake", notes: "Two rounds in, waiting on a decision about a third." },

  // ── Offers. ───────────────────────────────────────────────────────────────
  { n: 23, co: 2, role: "Analyst, Grid Strategy", lane: "primary", stage: "offer", applied: 38, touched: 2, passed: true, platform: "Referral", notes: "Verbal offer. They want an answer within two weeks." },
  { n: 24, co: 11, role: "Junior Policy Analyst", lane: "secondary", stage: "offer", applied: 41, touched: 8, passed: true, platform: "Company site", notes: "Lower pay, but the work is closest to what I said I wanted." },

  // ── Rejected. Resume-passed stays true where it got that far. ─────────────
  { n: 25, co: 1, role: "Associate Software Engineer", lane: "peripheral", stage: "rejected", applied: 40, touched: 29, platform: "LinkedIn", notes: "Fair — I am not a software engineer and the posting wanted one." },
  { n: 26, co: 3, role: "Business Analyst", lane: "secondary", stage: "rejected", applied: 36, touched: 20, passed: true, platform: "Handshake", notes: "Got to the second round. They went with someone internal." },
  { n: 27, co: 5, role: "Associate Product Designer", lane: "peripheral", stage: "rejected", applied: 37, touched: 31, platform: "LinkedIn" },
  { n: 28, co: 10, role: "Strategy Associate", lane: "peripheral", stage: "rejected", applied: 32, touched: 24, platform: "LinkedIn" },
  { n: 29, co: 8, role: "Field Operations Analyst", lane: "peripheral", stage: "rejected", applied: 28, touched: 17, passed: true, platform: "Company site" },

  // ── Archived: withdrawn or no longer wanted. ──────────────────────────────
  { n: 30, co: 9, role: "Water Quality Technician", lane: "peripheral", stage: "archived", applied: 39, touched: 25, platform: "Handshake", notes: "Withdrew — it was a lab role, not analysis." },
  { n: 31, co: 12, role: "MEng Energy Systems", lane: "peripheral", stage: "archived", applied: 35, touched: 30, kind: "grad_school", notes: "Decided against a second grad application this cycle." },
];

/* ── Contacts ────────────────────────────────────────────────────────────── */

type ContactRow = {
  n: number;
  co: number | null;
  name: string;
  role: string;
  type: "recruiter" | "alum" | "referral" | "hiring_manager" | "peer" | "other";
  contacted: number | null;
  followUp: number | null;
  notes?: string;
};

const CONTACTS: ContactRow[] = [
  { n: 1, co: 2, name: "Priya Raghunathan", role: "Senior Analyst, Grid Strategy", type: "alum", contacted: 3, followUp: -4, notes: "Calloway '21. Passed my resume to the hiring manager — the reason that application moved." },
  { n: 2, co: 3, name: "Marcus Oyelaran", role: "Engagement Manager", type: "referral", contacted: 6, followUp: -2, notes: "Offered to look over the case study before I send it." },
  { n: 3, co: 1, name: "Dana Whitfield", role: "Technical Recruiter", type: "recruiter", contacted: 1, followUp: -7, notes: "Coordinating the final round. Quick to reply." },
  { n: 4, co: 6, name: "Tomas Lindqvist", role: "Director of Product", type: "hiring_manager", contacted: 14, followUp: -1, notes: "Went quiet after round two. Owed a follow-up for a week now." },
  { n: 5, co: 5, name: "Alina Chaudhry", role: "Product Manager", type: "alum", contacted: 9, followUp: -11, notes: "Calloway '19. Walked me through how their PM loop is scored." },
  { n: 6, co: 4, name: "Ben Osei", role: "Development Associate", type: "peer", contacted: 20, followUp: null, notes: "Met at the climate careers mixer. Same year, same search." },
  { n: 7, co: 8, name: "Rachel Imamura", role: "University Recruiter", type: "recruiter", contacted: 31, followUp: null, notes: "Has gone cold. Last contact over a month ago." },
  { n: 8, co: null, name: "Professor Elena Vasquez", role: "Faculty, Energy Systems", type: "other", contacted: 12, followUp: -9, notes: "Writing a reference. Should tell her how the Arcadia round went." },
];

/* ── Tasks ───────────────────────────────────────────────────────────────── */

type TaskRow = {
  n: number;
  title: string;
  type: "application" | "networking_outreach" | "informational_interview_followup" | "interview_prep" | "research" | "admin" | "other";
  lane?: "primary" | "secondary" | "peripheral";
  app?: number;
  co?: number;
  due?: number;
  done?: number;
  fromCapture?: number;
  description?: string;
};

const TASKS: TaskRow[] = [
  // Open, and overdue — these are what Priorities should be shouting about.
  { n: 1, title: "Finish the Northwind case study", type: "interview_prep", lane: "primary", app: 18, co: 3, due: 1, description: "Three slides plus the model. Marcus offered to review it first." },
  { n: 2, title: "Prep for the Arcadia final round", type: "interview_prep", lane: "primary", app: 17, co: 1, due: -3, description: "Three interviews back to back. Re-read the climate risk methodology page." },
  { n: 3, title: "Nudge Tomas at Current Labs", type: "networking_outreach", lane: "secondary", co: 6, due: 2, description: "Two weeks since round two. Short and friendly." },
  { n: 4, title: "Send Priya a thank-you for the referral", type: "informational_interview_followup", lane: "primary", co: 2, due: 0 },
  { n: 5, title: "Decide on the Helio Grid offer", type: "admin", lane: "primary", app: 23, due: -9, description: "They want an answer within two weeks of the verbal." },
  { n: 6, title: "Apply to Verdant Capital", type: "application", lane: "secondary", app: 1, co: 7, due: -2 },
  { n: 7, title: "Ask Prof. Vasquez for the reference letter", type: "admin", lane: "secondary", due: -5 },
  { n: 8, title: "Research Terrawatt's development pipeline", type: "research", lane: "primary", co: 4, due: -6 },
  { n: 9, title: "Update resume with the capstone project", type: "admin", due: -8 },

  // Done, across the last few weeks — this is what the review page counts.
  { n: 10, title: "Submit the Northwind application", type: "application", lane: "primary", app: 10, co: 3, done: 5 },
  { n: 11, title: "Coffee chat with Alina", type: "informational_interview_followup", lane: "secondary", co: 5, done: 9 },
  { n: 12, title: "Phone screen with Arcadia", type: "interview_prep", lane: "primary", app: 17, co: 1, done: 11 },
  { n: 13, title: "Send five applications this week", type: "application", done: 13 },
  { n: 14, title: "Rewrite the cover letter template", type: "admin", done: 17 },
  { n: 15, title: "Message Rachel at Lumen about timelines", type: "networking_outreach", lane: "secondary", co: 8, done: 22 },
  { n: 16, title: "Go to the climate careers mixer", type: "networking_outreach", done: 20, fromCapture: 2 },
  { n: 17, title: "Apply to Meridian's TPA opening", type: "application", lane: "secondary", app: 15, co: 5, done: 3, fromCapture: 1 },
];

/* ── Habits, goals, captures, reviews ────────────────────────────────────── */

const HABITS: [n: number, label: string, category: string, target: string, order: number][] = [
  [1, "Applications sent", "output", "3 a day", 0],
  [2, "Outreach messages", "network", "2 a day", 1],
  [3, "Interview prep", "craft", "30 min", 2],
];

/**
 * Six weeks of ticks. Not a clean streak: the pattern dips mid-week and over
 * weekends, because a habit grid that is solid green teaches a visitor nothing
 * about what the grid is for.
 */
function habitTicks(dayIndex: number, habitNumber: number): boolean {
  const weekday = (dayIndex + 3) % 7; // arbitrary phase so weeks do not align
  if (weekday === 5 || weekday === 6) return habitNumber === 3 && dayIndex % 3 === 0;
  if (habitNumber === 1) return dayIndex % 4 !== 0;
  if (habitNumber === 2) return dayIndex % 3 !== 1;
  return dayIndex % 2 === 0;
}

const CAPTURES: [n: number, text: string, daysAgo: number][] = [
  [1, "Applied to the technical program analyst role at Meridian Software today, found it on Handshake", 3],
  [2, "Went to the climate careers mixer, met Ben Osei who is a development associate at Terrawatt, same year as me", 20],
  [3, "Call with Dana at Arcadia — final round is three interviews, they want availability for next week", 1],
  [4, "Priya said she passed my resume to the hiring manager at Helio Grid", 12],
];

/* ── The rows ────────────────────────────────────────────────────────────────
   Everything above is description; everything below turns it into rows. */

/* ── Connections ─────────────────────────────────────────────────────────────
   The fictional stand-in for a LinkedIn export.

   Why this exists at all: until 2026-10-19 the demo's connections table was
   empty and the radar replayed a recording end to end. That made the one part
   of the feature that needs no model - comparing two lists of company names -
   fake for no reason. With people in the table, the demo's "check for
   connections" runs the real matching code over invented data: same function,
   same comparison rules, same result shape.

   Three of these are load-bearing. Priya, Marcus and Dana work at companies
   Jamie has applied to, so they are the leads the check finds. Nobody here
   works at Terrawatt Energy, Meridian Software or Helio Grid - those stay
   empty on purpose, because they are what the (still recorded) web search is
   shown looking for. Everyone else works somewhere outside the pipeline, which
   is what makes a match mean something: most of your network is irrelevant to
   most of your applications, and a matcher that cannot show that is not being
   tested.                                                                   */

const LEAD_CONNECTIONS: [name: string, company: string, position: string, days: number][] = [
  ["Priya Raghunathan", "Arcadia Climate", "Senior Analyst, Grid Strategy", 410],
  ["Marcus Oyelaran", "Northwind Analytics", "Engagement Manager", 290],
  ["Dana Whitfield", "Current Labs", "Technical Recruiter", 96],
];

/** Everyone else. Employers deliberately outside the applications list. */
const FILLER_FIRST = [
  "Alex", "Rosa", "Tomas", "Nadia", "Ibrahim", "Clara", "Dev", "Maeve", "Hugo",
  "Yuki", "Sofia", "Omar", "Lena", "Caleb", "Amara", "Jonas", "Mira", "Ravi",
  "Elise", "Noah", "Thandi", "Felix", "Ingrid", "Kwame",
];
const FILLER_LAST = [
  "Okafor", "Lindqvist", "Moreau", "Castellanos", "Bergstrom", "Nakamura",
  "Duarte", "Halvorsen", "Mbeki", "Rinaldi", "Sorensen", "Achebe", "Vasquez",
  "Kowalski", "Petrova", "Fontaine", "Delgado", "Haugen", "Iqbal", "Novak",
  "Ferreira", "Adeyemi", "Lindgren", "Marchetti",
];
const FILLER_EMPLOYERS = [
  "Brightline Analytics", "Cobalt Systems", "Harborview Partners", "Juniper Health",
  "Lanternfish Media", "Mercator Logistics", "Nimbus Retail", "Overland Freight",
  "Pinecrest Bank", "Quarry Materials", "Redwood Insurance", "Saltmarsh Foods",
  "Tidewater Shipping", "Umber Design", "Vantage Telecom", "Westfall Education",
  "Yarrow Biotech", "Zephyr Aviation",
];
const FILLER_POSITIONS = [
  "Analyst", "Senior Analyst", "Product Manager", "Software Engineer",
  "Operations Lead", "Account Executive", "Research Associate", "Consultant",
  "Data Scientist", "Programme Manager", "Designer", "Finance Associate",
];

/** How many people the fictional export holds. */
const FILLER_COUNT = 147;

export function seedRows(): Record<SeedTable, Record<string, unknown>[]> {
  const now = today();
  const u = USER_ID;

  const companies = COMPANIES.map(([n, name, sector, site]) => ({
    id: company(n),
    user_id: u,
    name,
    website: `https://${site}`,
    sector,
    notes: null,
    source: "demo",
    last_touched_at: at(ago(n % 9)),
    visibility: "private",
    created_at: at(ago(42)),
  }));

  const applications = APPLICATIONS.map((a) => ({
    id: application(a.n),
    user_id: u,
    company_id: company(a.co),
    role_title: a.role,
    lane: a.lane,
    stage: a.stage,
    applied_date: a.applied === undefined ? null : ago(a.applied),
    deadline: a.deadline === undefined ? null : ago(a.deadline),
    job_posting_url: null,
    source_platform: a.platform ?? null,
    source: "manual",
    kind: a.kind ?? "job",
    remind_on: a.remind === undefined ? null : ago(a.remind),
    remind_estimated: a.remindEst ?? false,
    resume_passed: a.passed ?? false,
    last_touched_at: at(ago(a.touched)),
    stage_changed_at: at(ago(a.touched)),
    notes: a.notes ?? null,
    created_at: at(ago(a.applied ?? a.touched)),
  }));

  const contacts = CONTACTS.map((c) => ({
    id: contact(c.n),
    user_id: u,
    company_id: c.co === null ? null : company(c.co),
    name: c.name,
    role: c.role,
    relationship_type: c.type,
    contact_info: `${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.invalid`,
    notes: c.notes ?? null,
    last_contacted_at: c.contacted === null ? null : at(ago(c.contacted)),
    next_follow_up_at: c.followUp === null ? null : at(ago(c.followUp)),
    status: c.contacted !== null && c.contacted > 30 ? "dormant" : "active",
    visibility: "private",
    created_at: at(ago(42)),
  }));

  const habit_definitions = HABITS.map(([n, label, category, target, order]) => ({
    id: habit(n),
    user_id: u,
    label,
    category,
    target,
    sort_order: order,
    active: true,
    created_at: at(ago(42)),
  }));

  const raw_captures = CAPTURES.map(([n, text, daysAgo]) => ({
    id: capture(n),
    user_id: u,
    source: "web_form",
    raw_text: text,
    image_url: null,
    classification: null,
    status: "confirmed",
    created_at: at(ago(daysAgo), 15),
  }));

  const tasks = TASKS.map((t) => ({
    id: task(t.n),
    user_id: u,
    title: t.title,
    description: t.description ?? null,
    task_type: t.type,
    lane: t.lane ?? null,
    company_id: t.co === undefined ? null : company(t.co),
    application_id: t.app === undefined ? null : application(t.app),
    due_date: t.due === undefined ? null : ago(t.due),
    priority_score: 0,
    status: t.done === undefined ? "open" : "done",
    completed_at: t.done === undefined ? null : at(ago(t.done), 21),
    source: t.fromCapture === undefined ? "manual" : "ai_capture",
    source_capture_id: t.fromCapture === undefined ? null : capture(t.fromCapture),
    created_at: at(ago((t.done ?? Math.abs(t.due ?? 0)) + 6)),
  }));

  /* Stage history. Every application that has been sent gets its `applied`
     event, and anything beyond that gets the steps it must have passed
     through — a board where half the cards have no history would make the
     timeline look broken rather than empty. */
  const application_events: Record<string, unknown>[] = [];
  let eventN = 0;
  const addEvent = (
    appN: number,
    from: string | null,
    to: string,
    daysAgo: number,
    note?: string,
  ) => {
    eventN += 1;
    application_events.push({
      id: event(eventN),
      user_id: u,
      application_id: application(appN),
      from_stage: from,
      to_stage: to,
      occurred_at: at(ago(daysAgo), 16),
      note: note ?? null,
      created_at: at(ago(daysAgo), 16),
    });
  };

  for (const a of APPLICATIONS) {
    if (a.applied === undefined) continue;
    addEvent(a.n, null, "applied", a.applied);

    const midpoint = Math.round((a.applied + a.touched) / 2);
    if (a.stage === "interviewing" || a.stage === "offer") {
      addEvent(a.n, "applied", "interviewing", a.stage === "offer" ? midpoint : a.touched);
    }
    if (a.stage === "offer") {
      addEvent(a.n, "interviewing", "offer", a.touched, "Verbal offer.");
    }
    if (a.stage === "rejected") {
      if (a.passed) addEvent(a.n, "applied", "interviewing", midpoint);
      addEvent(a.n, a.passed ? "interviewing" : "applied", "rejected", a.touched);
    }
    if (a.stage === "archived") {
      addEvent(a.n, "applied", "archived", a.touched, a.notes ?? null ? "Withdrawn." : undefined);
    }
  }

  /* Six weeks of habit ticks, one row per day. `notes` is the jsonb the habit
     grid reads; the shape is {habits: {<habit id>: true}} plus the day's
     focus line, exactly as the real app writes it. */
  const daily_logs: Record<string, unknown>[] = [];
  for (let d = 0; d < 42; d += 1) {
    const date = ago(d);
    const ticks: Record<string, boolean> = {};
    for (const [n] of HABITS) {
      if (habitTicks(d, n)) ticks[habit(n)] = true;
    }
    daily_logs.push({
      id: log(d + 1),
      user_id: u,
      log_date: date,
      notes: {
        habits: ticks,
        ...(d === 0 ? { focus: "Finish the Northwind case study and prep for Arcadia." } : {}),
      },
      created_at: at(date, 13),
      updated_at: at(date, 23),
    });
  }

  const weekStart = startOfWeek(now);
  const weekly_reviews = [
    {
      id: review(1),
      user_id: u,
      week_start: addDays(weekStart, -14),
      wins: "Two first-round interviews in one week, both from referrals rather than cold applications.",
      what_slipped: "Sent four applications against a target of twelve. Spent the time on interview prep instead, which was probably right but should have been a decision rather than a drift.",
      open_loops: "Current Labs has not come back about round three. Lumen went quiet entirely.",
      follow_up_people: "Tomas Lindqvist, Rachel Imamura",
      next_week_top3: "Finish the Northwind case study. Nudge Current Labs. Send eight applications.",
      auto_draft: null,
      sealed_at: at(addDays(weekStart, -7), 2),
      visibility: "private",
      created_at: at(addDays(weekStart, -8)),
      updated_at: at(addDays(weekStart, -7)),
    },
    {
      id: review(2),
      user_id: u,
      week_start: addDays(weekStart, -7),
      wins: "Helio Grid made a verbal offer. Fieldstone followed with a second one two days later.",
      what_slipped: "Still have not replied to Prof. Vasquez about the reference letter.",
      open_loops: "Two offers with overlapping deadlines and no decision made.",
      follow_up_people: "Priya Raghunathan, Elena Vasquez",
      next_week_top3: "Decide on Helio Grid. Arcadia final round. Thank Priya properly.",
      auto_draft: null,
      sealed_at: at(weekStart, 2),
      visibility: "private",
      created_at: at(addDays(weekStart, -1)),
      updated_at: at(weekStart),
    },
    // This week's, left unsealed, so the review page has a live one to open.
    {
      id: review(3),
      user_id: u,
      week_start: weekStart,
      wins: null,
      what_slipped: null,
      open_loops: null,
      follow_up_people: null,
      next_week_top3: null,
      auto_draft: null,
      sealed_at: null,
      visibility: "private",
      created_at: at(weekStart),
      updated_at: at(weekStart),
    },
  ];

  const goals = [
    { id: goal(1), user_id: u, scope: "week", period_start: currentPeriodStart("week", now), lane: "primary", description: "Send 8 applications", target_count: 8, metric: "applications", completed: false, created_at: at(weekStart) },
    { id: goal(2), user_id: u, scope: "week", period_start: currentPeriodStart("week", now), lane: null, description: "4 outreach messages", target_count: 4, metric: "networking_outreach", completed: false, created_at: at(weekStart) },
    { id: goal(3), user_id: u, scope: "week", period_start: currentPeriodStart("week", now), lane: "primary", description: "Decide on the Helio Grid offer", target_count: 1, metric: "manual", completed: false, created_at: at(weekStart) },
    { id: goal(4), user_id: u, scope: "month", period_start: currentPeriodStart("month", now), lane: null, description: "3 informational interviews", target_count: 3, metric: "informational_interviews", completed: false, created_at: at(ago(20)) },
  ];

  /* Brain's contents. Assembled from everything above rather than written
     separately, so searching the demo turns up the same events the board and
     the timeline show — which is the whole point of the page. */
  const memory_log: Record<string, unknown>[] = [];
  let memoryN = 0;
  const addMemory = (
    sourceType: string,
    sourceId: string | null,
    text: string,
    daysAgo: number,
  ) => {
    memoryN += 1;
    memory_log.push({
      id: memory(memoryN),
      user_id: u,
      source_type: sourceType,
      source_id: sourceId,
      text,
      occurred_at: at(ago(daysAgo), 16),
      created_at: at(ago(daysAgo), 16),
    });
  };

  for (const [n, text, daysAgo] of CAPTURES) {
    addMemory("capture", capture(n), text, daysAgo);
  }
  for (const a of APPLICATIONS) {
    const name = COMPANIES.find(([n]) => n === a.co)?.[1] ?? "a company";
    if (a.applied !== undefined) {
      addMemory("stage_change", application(a.n), `Applied to ${a.role} at ${name}.`, a.applied);
    }
    if (a.stage !== "applied" && a.stage !== "researching" && a.applied !== undefined) {
      addMemory(
        "stage_change",
        application(a.n),
        `${a.role} at ${name} moved to ${a.stage}.`,
        a.touched,
      );
    }
  }
  for (const t of TASKS) {
    if (t.done !== undefined) addMemory("task_completed", task(t.n), `Done: ${t.title}`, t.done);
  }
  for (const c of CONTACTS) {
    if (c.contacted !== null) {
      addMemory("contact_touch", contact(c.n), `Spoke with ${c.name} — ${c.role}.`, c.contacted);
    }
  }
  addMemory("weekly_review", review(1), "Weekly review sealed: two first-round interviews, both from referrals.", 14);
  addMemory("weekly_review", review(2), "Weekly review sealed: two offers in one week, no decision made yet.", 7);

  const user_settings = [
    {
      user_id: u,
      compress_job_days: 30,
      compress_contact_days: 30,
      compress_task_days: 7,
      compress_reminder_days: 3,
      updated_at: at(ago(10)),
    },
  ];

  /*
    The fictional connections export. Deterministic: the demo resets to this
    same set every night, so a visitor's "212 connections" is the same number
    the next visitor sees, and the matcher is exercised against stable data.
  */
  const connections = [
    ...LEAD_CONNECTIONS.map(([name, company, position, days], i) => ({
      id: connection(i),
      user_id: u,
      name,
      profile_url: `https://www.example.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      company,
      position,
      connected_on: ago(days),
      imported_at: at(ago(12)),
      created_at: at(ago(12)),
    })),
    ...Array.from({ length: FILLER_COUNT }, (_, i) => {
      // Co-prime strides so the three pools do not fall into step with each
      // other and repeat the same person every few rows.
      const first = FILLER_FIRST[i % FILLER_FIRST.length];
      const last = FILLER_LAST[(i * 7) % FILLER_LAST.length];
      const name = `${first} ${last}`;
      return {
        id: connection(100 + i),
        user_id: u,
        name,
        profile_url: `https://www.example.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${i}`,
        company: FILLER_EMPLOYERS[(i * 5) % FILLER_EMPLOYERS.length],
        position: FILLER_POSITIONS[(i * 3) % FILLER_POSITIONS.length],
        connected_on: ago(30 + ((i * 13) % 900)),
        imported_at: at(ago(12)),
        created_at: at(ago(12)),
      };
    }),
  ];

  return {
    companies,
    applications,
    contacts,
    connections,
    habit_definitions,
    goals,
    raw_captures,
    tasks,
    application_events,
    daily_logs,
    weekly_reviews,
    memory_log,
    user_settings,
  };
}
