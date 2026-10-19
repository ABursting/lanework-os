/**
 * Row shapes for the tables in supabase/migrations/ — the ten from the initial
 * schema, plus application_events and user_settings.
 * The unions here mirror the CHECK constraints exactly — if one changes, both
 * change together.
 *
 * The calendar event at the bottom is the exception: it is not a table, it is
 * what one entry in the iCal feed parses into. It lives here because both the
 * server (which parses it) and the browser (which draws it) need the shape,
 * and src/lib/calendar.ts is server-only.
 */
import type { CivilDate } from "./time";
import type { PossibleMatch } from "./roleMatch";

export type Lane = "primary" | "secondary" | "peripheral";
export const LANES: Lane[] = ["primary", "secondary", "peripheral"];

/**
 * Researching was removed on Aug 31 and restored on Sep 15 with a narrower
 * meaning: a role you plan to apply to, by a date, with a reminder. It is
 * first because it comes before submission.
 */
export type Stage =
  | "researching" | "applied" | "interviewing" | "offer" | "rejected" | "archived";
export const STAGES: Stage[] = [
  "researching", "applied", "interviewing", "offer", "rejected", "archived",
];
/** The stages a live opportunity can be in — not yet decided either way. */
export const ACTIVE_STAGES: Stage[] = ["researching", "applied", "interviewing"];
export const TERMINAL_STAGES: Stage[] = ["offer", "rejected", "archived"];

/**
 * A job, or a grad school program. Grad programs share the board and the
 * reminders but are kept out of the resume pass rate and the "applications
 * out" goal, which are about the job search.
 */
export type ApplicationKind = "job" | "grad_school";
export const APPLICATION_KINDS: ApplicationKind[] = ["job", "grad_school"];

export type RelationshipType =
  | "recruiter" | "alum" | "referral" | "hiring_manager" | "peer" | "other";
export const RELATIONSHIP_TYPES: RelationshipType[] = [
  "recruiter", "alum", "referral", "hiring_manager", "peer", "other",
];

export type ContactStatus = "active" | "dormant";

export type TaskType =
  | "application" | "networking_outreach" | "informational_interview_followup"
  | "interview_prep" | "research" | "admin" | "other";
export const TASK_TYPES: TaskType[] = [
  "application", "networking_outreach", "informational_interview_followup",
  "interview_prep", "research", "admin", "other",
];

export type TaskStatus = "open" | "done";
export type EntitySource = "manual" | "ai_capture" | "screenshot_import";
export type TaskSource = "manual" | "ai_capture";
export type CaptureSource = "web_form" | "screenshot";
export type CaptureStatus = "pending_review" | "confirmed" | "corrected";
export type MemorySourceType =
  | "capture" | "stage_change" | "task_completed" | "weekly_review"
  | "habit_note" | "contact_touch"
  /** Made by hand in the CRM: added, resume screen marked, deleted. Sep 29 ask. */
  | "crm_change";
export type GoalScope = "week" | "month";
export type GoalMetric =
  | "applications" | "networking_outreach" | "informational_interviews" | "manual";
export type Visibility = "private" | "shareable";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  website: string | null;
  sector: string | null;
  notes: string | null;
  source: string | null;
  last_touched_at: string;
  visibility: Visibility;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company_id: string;
  role_title: string;
  lane: Lane;
  stage: Stage;
  kind: ApplicationKind;
  applied_date: string | null;
  deadline: string | null;
  /** The day to be reminded to apply. Only meaningful while Researching. */
  remind_on: string | null;
  /**
   * True when remind_on was worked out from a listing's posting date, because
   * the listing showed no deadline. Shown as "est." — it is a guess.
   */
  remind_estimated: boolean;
  job_posting_url: string | null;
  source_platform: string | null;
  source: EntitySource;
  resume_passed: boolean;
  /**
   * "I want to do outreach for this one" — whether or not anyone he already
   * knows works there. Without it the outreach radar could only ever report
   * coincidences; with it, he points it at the roles he actually cares about
   * and it goes looking. Added 2026-10-06.
   */
  outreach_wanted: boolean;
  last_touched_at: string;
  stage_changed_at: string;
  notes: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  role: string | null;
  relationship_type: RelationshipType;
  contact_info: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  status: ContactStatus;
  visibility: Visibility;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  lane: Lane | null;
  company_id: string | null;
  application_id: string | null;
  due_date: string | null;
  priority_score: number;
  status: TaskStatus;
  completed_at: string | null;
  source: TaskSource;
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitDefinition {
  id: string;
  user_id: string;
  label: string;
  category: string | null;
  /** Display-only label ("3/day", "30m"). Nothing counts against it. */
  target: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

/** The jsonb shape of daily_logs.notes. */
export interface DailyLogNotes {
  habits?: Record<string, boolean>;
  score?: number;
  focus_today?: string;
  priorities_rationale?: PrioritiesRationale;
}

/** Cached once a day, keyed by task id. Never regenerated on render. */
export interface PrioritiesRationale {
  generated_at: string;
  /** task_id -> the one-line "why today". */
  reasons: Record<string, string>;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  notes: DailyLogNotes;
  created_at: string;
  updated_at: string;
}

/** What the classifier returns for a text capture. */
export interface CaptureClassification {
  summary: string;
  category: CaptureCategory;
  matched_companies: MatchedEntity[];
  matched_contacts: MatchedEntity[];
  /**
   * Every concrete next action in the note, not just the first.
   *
   * This was a single nullable object originally, which silently truncated a
   * capture like "email Dara, book the Lumen call, redo the deck" down to one
   * task. A note is written the way a thought arrives — several things at
   * once — so the shape has to match.
   */
  suggested_tasks: SuggestedTask[];
  /**
   * Every pipeline move the note reports — "rejected from X, interview with Y"
   * is two. A single slot until 2026-10-01, which silently dropped the second
   * move the same way single-slot tasks once dropped all but the first task.
   */
  suggested_stage_changes: SuggestedStageChange[];
  /**
   * A role the note says was submitted that no application row covers yet.
   *
   * `suggested_stage_changes` can only ever move an application that already
   * exists, so a note about applying somewhere new produced a company, a
   * memory entry, and no pipeline row at all. This is that missing half.
   */
  /** Every role the note reported submitting — a note often names several. */
  suggested_applications: SuggestedApplication[];
  /**
   * Conversations the note says already happened — outreach sent, a coffee
   * chat had, a reply received.
   *
   * Distinct from suggested_tasks on purpose: a task is something still to do,
   * a touch is something done. Without this the classifier had to describe
   * "I emailed three people today" as three things to go and email.
   */
  suggested_contact_touches: SuggestedContactTouch[];
  confidence: number;
}

export type CaptureCategory =
  | "task" | "company_update" | "contact_update"
  | "interview_note" | "application_status_change" | "new_application"
  | "reflection";

/**
 * An entity the classifier thinks the capture refers to.
 * `company_id`/`contact_id` is only ever a real row id that has been checked
 * against the database after the model answered — never something the model
 * produced on its own. An unrecognised name comes back is_new, id null.
 */
export interface MatchedEntity {
  id: string | null;
  matched_name: string;
  is_new: boolean;
}

export interface SuggestedTask {
  title: string;
  task_type: TaskType;
  lane: Lane | null;
  due_date: string | null;
}

export interface SuggestedContactTouch {
  /** A real contact id, resolved server-side by name. Null means new. */
  contact_id: string | null;
  contact_name: string;
  /** Only used when the contact has to be created. */
  company_name: string | null;
  role: string | null;
  relationship_type: RelationshipType | null;
  /** What happened, in the operator's words. Goes into Brain. */
  note: string;
  /** Days from today to chase, when the note implies one. */
  follow_up_in_days: number | null;
}

export interface SuggestedStageChange {
  application_id: string | null;
  company_name: string;
  role_title: string | null;
  to_stage: Stage;
}

/**
 * A new application the classifier read out of a typed note.
 *
 * Both resolved fields are filled in server-side after the model answers —
 * `existing_company_id` so confirming does not create a second "Stripe", and
 * `duplicate_of_application_id` so a role already in the pipeline is shown as
 * tracked rather than logged twice. The model is asked for neither.
 */
export interface SuggestedApplication {
  company_name: string;
  role_title: string;
  lane: Lane | null;
  stage: Stage;
  /** Missing on captures classified before Sep 15; treat as "job". */
  kind?: ApplicationKind;
  /** A due date the note gave. Only used for a Researching role. */
  deadline?: string | null;
  /** An explicit reminder date the note gave ("remind me on the 1st"). */
  remind_on?: string | null;
  /** A reminder lead the note gave ("remind me two weeks before" = 14). */
  remind_days_before?: number | null;
  existing_company_id: string | null;
  duplicate_of_application_id: string | null;
  /** A tracked role at the same company with a near-identical title. */
  possible_match?: PossibleMatch | null;
}

/** One job pulled out of a job-board screenshot. */
export interface ExtractedJob {
  company_name: string;
  role_title: string;
  location: string | null;
  source_platform: string | null;
  /** A deadline the listing shows. Missing on captures read before Sep 15. */
  deadline?: string | null;
  /** "Posted 3 weeks ago" = 21. Null when the listing does not say. */
  posted_days_ago?: number | null;
  /** Filled in server-side after deduping against existing applications. */
  duplicate_of_application_id?: string | null;
  /** The tracked role's current stage, so a Researching one can be moved on. */
  duplicate_stage?: Stage | null;
  /**
   * A tracked role at the same company whose title is close but not the same
   * ("… Leaders Program (2027)" against "… Leaders (2027)"). Asked about on the
   * confirm screen, never decided alone. Missing on captures read before
   * 2026-10-06.
   */
  possible_match?: PossibleMatch | null;
  existing_company_id?: string | null;
}

export interface ScreenshotClassification {
  jobs: ExtractedJob[];
  confidence: number;
}

export interface RawCapture {
  id: string;
  user_id: string;
  source: CaptureSource;
  raw_text: string | null;
  image_url: string | null;
  classification: CaptureClassification | ScreenshotClassification | null;
  status: CaptureStatus;
  created_at: string;
}

export interface MemoryEntry {
  id: string;
  user_id: string;
  source_type: MemorySourceType;
  source_id: string | null;
  text: string;
  occurred_at: string;
  created_at: string;
}

export interface WeeklyReview {
  id: string;
  user_id: string;
  week_start: string;
  wins: string | null;
  what_slipped: string | null;
  open_loops: string | null;
  follow_up_people: string | null;
  next_week_top3: string | null;
  auto_draft: WeeklyReviewDraft | null;
  sealed_at: string | null;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReviewDraft {
  generated_at: string;
  wins: string;
  what_slipped: string;
  open_loops: string;
  follow_up_people: string;
  next_week_top3: string;
}

/** The Compress window sliders, in days. One row per user. */
export interface UserSettings {
  compress_job_days: number;
  compress_contact_days: number;
  compress_task_days: number;
  compress_reminder_days: number;
}

export interface Goal {
  id: string;
  user_id: string;
  scope: GoalScope;
  period_start: string;
  lane: Lane | null;
  description: string;
  target_count: number;
  metric: GoalMetric | null;
  completed: boolean;
  created_at: string;
}

/* — read models: what the API hands the UI, after joins and derivation — */

/** A company with the counts the CRM table shows. Lane is derived, never stored:
 *  the scope keeps lane on the role, so a company shows the strongest lane
 *  among its applications. */
export interface CompanyRow extends Company {
  derived_lane: Lane | null;
  open_roles: string[];
  contact_count: number;
  application_count: number;
}

export interface ContactRow extends Contact {
  company_name: string | null;
  derived_lane: Lane | null;
}

export interface ApplicationRow extends Application {
  company_name: string;
  company_sector: string | null;
}

export interface TaskRow extends Task {
  company_name: string | null;
  application_role: string | null;
  /** Freshly computed at read time, so deadline urgency is never stale. */
  computed_score: number;
}

export interface GoalProgress extends Goal {
  current_count: number;
  /** 0–1, clamped. */
  fraction: number;
}

// ── Calendar ────────────────────────────────────────────────────────────────

export type EventKind =
  | "interview" | "informational" | "deadline" | "networking" | "apply" | "other";

export interface CalendarEvent {
  uid: string;
  summary: string;
  /** The local civil date this occurrence sits on. */
  date: CivilDate;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: EventKind;
  location: string | null;
  /**
   * Where it came from. Feed events are read off Google Calendar; dashboard
   * events are drawn from your own Researching roles — their reminder and
   * deadline dates. Missing means the feed.
   */
  origin?: "feed" | "dashboard";
}
