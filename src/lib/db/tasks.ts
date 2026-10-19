import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { appendMemory, retractMemory } from "./memory";
import { touchApplication } from "./applications";
import { touchCompany } from "./companies";
import { compareTasks, scoreTask } from "@/lib/priority";
import { endOfDayInstant, startOfDayInstant, today } from "@/lib/time";
import type { Lane, Task, TaskRow, TaskType, TaskStatus } from "@/lib/types";

const SELECT = "*, companies(name), applications(role_title)";

type JoinedRow = Task & {
  companies: { name: string } | null;
  applications: { role_title: string } | null;
};

function flatten(row: JoinedRow): TaskRow {
  const { companies, applications, ...task } = row;
  return {
    ...task,
    company_name: companies?.name ?? null,
    application_role: applications?.role_title ?? null,
    // Recomputed here rather than read from the column: deadline urgency
    // decays with the calendar, so a score written last week is wrong today.
    computed_score: scoreTask(task),
  };
}

export async function listTasks(status?: TaskStatus): Promise<TaskRow[]> {
  let query = supabaseAdmin().from("tasks").select(SELECT).eq("user_id", USER_ID);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;

  const now = today();
  return ((data ?? []) as unknown as JoinedRow[])
    .map(flatten)
    .sort((a, b) => compareTasks(a, b, now));
}

/** The Priorities card: the highest-scoring open tasks, ranked deterministically. */
export async function topPriorities(limit = 3): Promise<TaskRow[]> {
  return (await listTasks("open")).slice(0, limit);
}

/**
 * What was finished today, newest first.
 *
 * "Today" is the operator's local day via the shared helper, so the list
 * clears at your midnight rather than at 7pm when UTC rolls over. Bounded by
 * one day, which is what keeps it short enough to sit on the Home page.
 */
export async function tasksCompletedToday(): Promise<TaskRow[]> {
  const day = today();
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select(SELECT)
    .eq("user_id", USER_ID)
    .eq("status", "done")
    .gte("completed_at", startOfDayInstant(day).toISOString())
    .lt("completed_at", endOfDayInstant(day).toISOString())
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as JoinedRow[]).map(flatten);
}

export interface TaskInput {
  title: string;
  description?: string | null;
  task_type?: TaskType;
  lane?: Lane | null;
  company_id?: string | null;
  application_id?: string | null;
  due_date?: string | null;
  source?: "manual" | "ai_capture";
  source_capture_id?: string | null;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const draft = {
    lane: input.lane ?? null,
    due_date: input.due_date ?? null,
    task_type: input.task_type ?? "other",
  };

  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .insert({
      user_id: USER_ID,
      title: input.title.trim(),
      description: input.description ?? null,
      task_type: draft.task_type,
      lane: draft.lane,
      company_id: input.company_id ?? null,
      application_id: input.application_id ?? null,
      due_date: draft.due_date,
      // The column is kept current on write; reads recompute it anyway.
      priority_score: scoreTask(draft),
      status: "open",
      source: input.source ?? "manual",
      source_capture_id: input.source_capture_id ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;

  await Promise.all([
    touchCompany(input.company_id),
    touchApplication(input.application_id),
  ]);
  return data as Task;
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
  const current = await supabaseAdmin()
    .from("tasks").select("*").eq("user_id", USER_ID).eq("id", id).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error(`Task ${id} not found`);

  const merged = { ...(current.data as Task), ...patch };
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .update({ ...patch, priority_score: scoreTask(merged) })
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

/**
 * Complete or reopen.
 *
 * Completing stamps the time and writes the event into memory_log. Reopening
 * clears the stamp *and* retracts that entry, so an accidental tick leaves no
 * trace claiming work that was not finished.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const task = data as Task;
  if (status === "done") {
    await Promise.all([
      appendMemory({
        source_type: "task_completed",
        source_id: task.id,
        text: `Completed: ${task.title}`,
      }),
      touchCompany(task.company_id),
      touchApplication(task.application_id),
    ]);
  } else {
    await retractMemory("task_completed", task.id);
  }
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks").delete().eq("user_id", USER_ID).eq("id", id);
  if (error) throw error;
}

/** Tasks finished inside a window — an input to the weekly review draft. */
export async function tasksCompletedBetween(fromIso: string, toIso: string): Promise<Task[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("status", "done")
    .gte("completed_at", fromIso)
    .lt("completed_at", toIso);
  if (error) throw error;
  return (data ?? []) as Task[];
}
