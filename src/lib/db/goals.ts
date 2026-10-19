import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import {
  currentPeriodStart, endOfMonth, endOfWeek, startOfDayInstant, endOfDayInstant,
  today, type CivilDate,
} from "@/lib/time";
import type { Goal, GoalMetric, GoalProgress, GoalScope, Lane } from "@/lib/types";

/**
 * Goals, with progress computed at read time.
 *
 * When a goal carries a `metric`, its count is derived from real rows rather
 * than a checkbox someone remembers to tick — that is the difference between
 * a goal tracker and a to-do list. `completed` is only consulted for
 * metric = 'manual', where there is nothing to count.
 */
export async function listGoalsForCurrentPeriods(): Promise<Record<GoalScope, GoalProgress[]>> {
  const now = today();
  const scopes: GoalScope[] = ["week", "month"];

  const results = await Promise.all(
    scopes.map(async (scope) => {
      const periodStart = currentPeriodStart(scope, now);
      const goals = await listGoals(scope, periodStart);
      const withProgress = await Promise.all(
        goals.map((goal) => attachProgress(goal, periodStart, scope)),
      );
      return [scope, withProgress] as const;
    }),
  );

  return Object.fromEntries(results) as Record<GoalScope, GoalProgress[]>;
}

export async function listGoals(scope: GoalScope, periodStart: CivilDate): Promise<Goal[]> {
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("scope", scope)
    .eq("period_start", periodStart)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Goal[];
}

async function attachProgress(
  goal: Goal,
  periodStart: CivilDate,
  scope: GoalScope,
): Promise<GoalProgress> {
  const periodEnd = scope === "week" ? endOfWeek(periodStart) : endOfMonth(periodStart);
  const current = await countMetric(goal.metric, goal.lane, periodStart, periodEnd, goal.completed);
  return {
    ...goal,
    current_count: current,
    fraction: goal.target_count > 0 ? Math.min(1, current / goal.target_count) : 0,
  };
}

/**
 * How each metric is counted.
 *
 *  applications              — job applications whose applied_date falls in the
 *                              period. Researching rows have no applied_date and
 *                              don't count — the goal is "applications out", not
 *                              "roles found" — and grad school programs don't
 *                              count either; the goal is about the job search.
 *  networking_outreach       — outreach tasks completed in the period.
 *  informational_interviews  — informational-interview follow-up tasks completed
 *                              in the period. This is the closest real signal the
 *                              schema carries; retune here if you'd rather count
 *                              something else.
 *  manual / null             — nothing to count; the `completed` flag is the answer.
 */
async function countMetric(
  metric: GoalMetric | null,
  lane: Lane | null,
  periodStart: CivilDate,
  periodEnd: CivilDate,
  completed: boolean,
): Promise<number> {
  const db = supabaseAdmin();

  if (!metric || metric === "manual") return completed ? 1 : 0;

  if (metric === "applications") return countJobApplicationsSent(periodStart, periodEnd, lane);

  const taskType =
    metric === "networking_outreach"
      ? "networking_outreach"
      : "informational_interview_followup";

  let query = db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID)
    .eq("status", "done")
    .eq("task_type", taskType)
    // completed_at is a timestamptz, so the period bounds have to be the real
    // instants local midnight fell at — not midnight UTC.
    .gte("completed_at", startOfDayInstant(periodStart).toISOString())
    .lt("completed_at", endOfDayInstant(periodEnd).toISOString());
  if (lane) query = query.eq("lane", lane);

  const { count, error } = await query;
  if (error) {
    console.error(`[db:goals] ${metric} count failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/**
 * Job applications sent between two dates, inclusive — the count behind an
 * "applications" goal, and the progress line in Compress.
 */
export async function countJobApplicationsSent(
  periodStart: CivilDate,
  periodEnd: CivilDate,
  lane: Lane | null = null,
): Promise<number> {
  // Rows rather than a server-side count filtered on `kind`: `select("*")`
  // reads whatever columns exist, so this keeps counting correctly on a
  // database that has not had the Sep 15 migration (a row with no kind is a
  // job). A period's applications are a handful of rows either way.
  let query = supabaseAdmin()
    .from("applications")
    .select("*")
    .eq("user_id", USER_ID)
    .gte("applied_date", periodStart)
    .lte("applied_date", periodEnd);
  if (lane) query = query.eq("lane", lane);
  const { data, error } = await query;
  if (error) {
    console.error(`[db:goals] applications count failed: ${error.message}`);
    return 0;
  }
  return ((data ?? []) as { kind?: string | null }[]).filter(
    (row) => (row.kind ?? "job") === "job",
  ).length;
}

export interface GoalInput {
  scope: GoalScope;
  description: string;
  target_count?: number;
  lane?: Lane | null;
  metric?: GoalMetric | null;
  period_start?: CivilDate;
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .insert({
      user_id: USER_ID,
      scope: input.scope,
      period_start: input.period_start ?? currentPeriodStart(input.scope),
      lane: input.lane ?? null,
      description: input.description.trim(),
      target_count: input.target_count ?? 1,
      metric: input.metric ?? "manual",
      completed: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Goal;
}

export async function updateGoal(id: string, patch: Partial<GoalInput & { completed: boolean }>): Promise<Goal> {
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Goal;
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("goals").delete().eq("user_id", USER_ID).eq("id", id);
  if (error) throw error;
}
