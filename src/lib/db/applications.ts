import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { REMINDER_LEAD_DAYS, USER_ID } from "@/lib/constants";
import { appendMemory } from "./memory";
import { touchCompany } from "./companies";
import { recordApplicationEvent } from "./applicationEvents";
import { STAGE_LABEL } from "@/lib/display";
import { startOfDayInstant, today, type CivilDate } from "@/lib/time";
import { reminderForLead } from "@/lib/reminders";
import {
  ACTIVE_STAGES, STAGES,
  type Application, type ApplicationKind, type ApplicationRow, type Lane, type Stage,
  type EntitySource,
} from "@/lib/types";

const SELECT = "*, companies!inner(name, sector)";

type JoinedRow = Application & { companies: { name: string; sector: string | null } | null };

function flatten(row: JoinedRow): ApplicationRow {
  const { companies, ...app } = row;
  return {
    ...app,
    company_name: companies?.name ?? "—",
    company_sector: companies?.sector ?? null,
  };
}

export async function listApplications(): Promise<ApplicationRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("applications")
    .select(SELECT)
    .eq("user_id", USER_ID)
    .order("last_touched_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as JoinedRow[]).map(flatten);
}

export interface BoardData {
  columns: { stage: Stage; applications: ApplicationRow[] }[];
  counts: Record<Stage, number>;
  resumePassed: number;
  resumeConsidered: number;
  resumeRate: number | null;
}

/** The kanban: one column per stage, plus the summary strip above it. */
export async function getBoard(): Promise<BoardData> {
  const applications = await listApplications();

  const counts = STAGES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<Stage, number>,
  );
  for (const a of applications) counts[a.stage] += 1;

  // "Of everything I sent, how much got a look." So only roles actually sent —
  // Researching has never been in front of a screen — and only jobs: a grad
  // program's admissions process is not a resume screen, and mixing the two
  // would make the number mean neither.
  const considered = applications.filter(
    (a) => a.stage !== "researching" && (a.kind ?? "job") === "job",
  );
  const passed = considered.filter((a) => a.resume_passed);

  return {
    columns: STAGES.map((stage) => ({
      stage,
      applications: applications.filter((a) => a.stage === stage),
    })),
    counts,
    resumePassed: passed.length,
    resumeConsidered: considered.length,
    resumeRate: considered.length > 0 ? passed.length / considered.length : null,
  };
}

/**
 * Every live application, for Compress.
 *
 * Deliberately not pre-filtered by age: the Compress page applies its windows
 * in the browser, so dragging a slider re-filters instantly rather than asking
 * the server again. Terminal stages are excluded — a rejection is not a thing
 * to chase.
 */
export async function listOpenApplications(): Promise<ApplicationRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("applications")
    .select(SELECT)
    .eq("user_id", USER_ID)
    .in("stage", ACTIVE_STAGES)
    .order("last_touched_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as JoinedRow[]).map(flatten);
}

/**
 * Researching roles with a reminder or a deadline falling between two dates —
 * what the Home calendar draws alongside the Google feed.
 *
 * Only Researching: once a role is submitted its deadline has been met and its
 * reminder has done its job, so both drop off the calendar on their own.
 */
export async function listResearchingDates(
  from: CivilDate,
  to: CivilDate,
): Promise<ApplicationRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("applications")
    .select(SELECT)
    .eq("user_id", USER_ID)
    .eq("stage", "researching")
    .or(
      `and(remind_on.gte.${from},remind_on.lte.${to}),` +
        `and(deadline.gte.${from},deadline.lte.${to})`,
    );
  if (error) throw error;
  return ((data ?? []) as unknown as JoinedRow[]).map(flatten);
}

export async function getApplication(id: string): Promise<ApplicationRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("applications")
    .select(SELECT)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? flatten(data as unknown as JoinedRow) : null;
}

export interface ApplicationInput {
  company_id: string;
  role_title: string;
  lane?: Lane;
  stage?: Stage;
  kind?: ApplicationKind;
  deadline?: string | null;
  /**
   * Undefined lets a Researching role with a deadline get the default
   * reminder; null means "no reminder", on purpose.
   */
  remind_on?: string | null;
  remind_estimated?: boolean;
  job_posting_url?: string | null;
  source_platform?: string | null;
  source?: EntitySource;
  notes?: string | null;
  outreach_wanted?: boolean;
}

export async function createApplication(input: ApplicationInput): Promise<Application> {
  const stage = input.stage ?? "applied";
  const now = new Date().toISOString();

  // A role you plan to apply to by a date gets reminded before it, unless the
  // caller said otherwise. The confirm screens always send a date; this covers
  // anything that does not, so a deadline never sits on the board unreminded.
  let remindOn = input.remind_on ?? null;
  let remindEstimated = input.remind_estimated ?? false;
  if (input.remind_on === undefined && stage === "researching" && input.deadline) {
    remindOn = reminderForLead(input.deadline, REMINDER_LEAD_DAYS, today());
    remindEstimated = false;
  }

  const { data, error } = await supabaseAdmin()
    .from("applications")
    .insert({
      user_id: USER_ID,
      company_id: input.company_id,
      role_title: input.role_title.trim(),
      lane: input.lane ?? "primary",
      stage,
      // The Sep 15 columns are only written when they carry something other
      // than their database default. A plain job at Applied then saves on a
      // database that has not had migration 20260915000000 yet — on Sep 16 a
      // screenshot import failed outright because every insert named `kind`.
      ...(input.kind && input.kind !== "job" ? { kind: input.kind } : {}),
      // A row entering at Applied is dated today unless the caller knows
      // better. Edit the row if you actually applied earlier — this date is
      // what the "applications out" goal counts against. A Researching row has
      // none until it moves to Applied.
      applied_date: stage === "applied" ? today() : null,
      deadline: input.deadline ?? null,
      ...(remindOn ? { remind_on: remindOn, remind_estimated: remindEstimated } : {}),
      job_posting_url: input.job_posting_url ?? null,
      source_platform: input.source_platform ?? null,
      source: input.source ?? "manual",
      resume_passed: stage === "interviewing" || stage === "offer",
      last_touched_at: now,
      stage_changed_at: now,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;

  const application = data as Application;

  // The first entry in the role's history — the submission, or for a
  // Researching role, the day it was added. Dated from applied_date where
  // there is one, so an import of something you sent last
  // week does not claim you sent it today.
  await recordApplicationEvent({
    application_id: application.id,
    from_stage: null,
    to_stage: application.stage,
    occurred_at: application.applied_date
      ? startOfDayInstant(application.applied_date).toISOString()
      : application.created_at,
  });

  await touchCompany(input.company_id);
  return application;
}

export type ApplicationPatch = Partial<
  Omit<ApplicationInput, "company_id"> & { resume_passed: boolean; applied_date: string | null }
>;

/**
 * Update an application, applying the stage-transition rules the scope defines.
 *
 *  - applied_date auto-fills the first time the stage becomes `applied`
 *  - resume_passed latches true on the first transition into `interviewing`
 *    (and on `offer`, which cannot be reached without clearing a screen), and
 *    is never cleared by a later rejection — that is the whole point of the
 *    marker: it keeps "rejected after interviewing" distinct from "never got
 *    a look". It stays manually togglable.
 *  - stage_changed_at moves only on an actual stage change
 *  - last_touched_at moves on any edit at all
 */
export async function updateApplication(
  id: string,
  patch: ApplicationPatch,
): Promise<Application> {
  const current = await getApplication(id);
  if (!current) throw new Error(`Application ${id} not found`);

  const now = new Date().toISOString();
  const nextStage = patch.stage ?? current.stage;
  const stageChanged = nextStage !== current.stage;

  const update: Record<string, unknown> = {
    ...patch,
    last_touched_at: now,
  };

  // A reminder you set or moved by hand is no longer a guess from a posting
  // date, whatever it was before.
  if (patch.remind_on !== undefined && patch.remind_estimated === undefined) {
    update.remind_estimated = false;
  }

  if (stageChanged) {
    update.stage_changed_at = now;
    if (nextStage === "applied" && !current.applied_date) {
      update.applied_date = today();
    }
    if ((nextStage === "interviewing" || nextStage === "offer") && !current.resume_passed) {
      update.resume_passed = true;
    }
  }

  // An explicit toggle from the UI always wins over the automatic latch.
  if (patch.resume_passed !== undefined) update.resume_passed = patch.resume_passed;

  const { data, error } = await supabaseAdmin()
    .from("applications")
    .update(update)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  await touchCompany(current.company_id);

  // A resume screen ticked or unticked by hand is worth a line in Brain; the
  // automatic latch on reaching Interviewing is already covered by the move.
  if (patch.resume_passed !== undefined && patch.resume_passed !== current.resume_passed) {
    await appendMemory({
      source_type: "crm_change",
      source_id: id,
      text: patch.resume_passed
        ? `${current.company_name} — ${current.role_title}: cleared the resume screen.`
        : `${current.company_name} — ${current.role_title}: resume-screen mark removed.`,
      occurred_at: now,
    });
  }

  if (stageChanged) {
    await Promise.all([
      // The structured record, for the timeline and for "how long did that
      // take" questions.
      recordApplicationEvent({
        application_id: id,
        from_stage: current.stage,
        to_stage: nextStage,
        occurred_at: now,
      }),
      // And the readable one, so it turns up in a Brain search.
      appendMemory({
        source_type: "stage_change",
        source_id: id,
        text:
          `${current.company_name} — ${current.role_title}: ` +
          `${STAGE_LABEL[current.stage]} → ${STAGE_LABEL[nextStage]}.`,
        occurred_at: now,
      }),
    ]);
  }

  return data as Application;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("applications")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw error;
}

/** Bump last_touched_at without changing anything else. */
export async function touchApplication(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const { error } = await supabaseAdmin()
    .from("applications")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) console.error(`[db:applications] touch failed for ${id}: ${error.message}`);
}

/**
 * Existing company+role pairs, for deduping a screenshot import.
 * Normalised so "Sr. Product Manager" and "sr product manager" collide.
 */
/**
 * How names and roles are compared lives in lib/roleMatch.ts, so the confirm
 * screens and tests share it. Re-exported because three places need to agree
 * on it and, until 2026-10-05, two of them did not.
 */
export { normalizeName, dedupeKey } from "@/lib/roleMatch";
import { dedupeKey } from "@/lib/roleMatch";

export interface ExistingApplication {
  id: string;
  /** Null for a row created earlier in the same request. */
  stage: Stage | null;
}

/**
 * Every tracked role by its dedupe key, with its stage — so an import can tell
 * a role already submitted from one still in Researching that it can move on.
 */
/**
 * Every date an application was submitted on, oldest first.
 *
 * Read from `applied_date` rather than counted from stage-change events: an
 * application created directly as Applied - which is what a screenshot import
 * produces - never generates a transition into Applied, so counting events
 * would quietly undercount exactly the roles that arrive in bulk.
 *
 * Grad school applications are included. The resume pass rate excludes them
 * because admissions are not a resume screen, but "how much have I sent out"
 * is a measure of effort, and the effort was real.
 */
export async function listAppliedDates(): Promise<CivilDate[]> {
  const { data, error } = await supabaseAdmin()
    .from("applications")
    .select("applied_date")
    .eq("user_id", USER_ID)
    .not("applied_date", "is", null)
    .order("applied_date");

  if (error) {
    console.error("[db:applications] applied dates failed:", error.code ?? "?", error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => r.applied_date as CivilDate);
}

export async function existingApplicationKeys(): Promise<Map<string, ExistingApplication>> {
  const applications = await listApplications();
  return new Map(
    applications.map((a) => [
      dedupeKey(a.company_name, a.role_title),
      { id: a.id, stage: a.stage },
    ]),
  );
}
