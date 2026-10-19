import type { Lane, Task, TaskType } from "./types";
import { daysBetween, endOfWeek, endOfMonth, today, type CivilDate } from "./time";

/**
 * The Priorities ranking.
 *
 * This is a deterministic formula, not an AI call. The model's only job on
 * this card is a cached one-line "why today" for the top three, generated once
 * a day on demand — the ordering itself has to be reproducible, explainable,
 * and free, because it runs on every load of the Home page.
 *
 *   score = lane weight + deadline urgency + a small task-type nudge
 *
 * The score is recomputed at read time. It is also written to tasks.priority_score
 * on every write so the column the scope defines is populated and sortable in
 * SQL, but the card never trusts that stored value: deadline urgency decays
 * with the calendar, and a score written last Tuesday is wrong by Thursday.
 */

const LANE_WEIGHT: Record<Lane, number> = {
  primary: 100,
  secondary: 50,
  peripheral: 10,
};

/** Nudges, deliberately small — they break ties, they don't reorder lanes. */
const TYPE_NUDGE: Record<TaskType, number> = {
  application: 6,                          // the thing with a closing window
  interview_prep: 5,                       // time-boxed and high-stakes
  networking_outreach: 4,                  // compounding, easy to defer
  informational_interview_followup: 3,     // decays fast if left
  research: 1,
  admin: 0,
  other: 0,
};

export const DEADLINE_URGENCY = {
  overdue: 80,
  today: 60,
  thisWeek: 35,
  thisMonth: 15,
  none: 0,
} as const;

export function deadlineUrgency(
  dueDate: string | null | undefined,
  now: CivilDate = today(),
): number {
  if (!dueDate) return DEADLINE_URGENCY.none;
  if (dueDate < now) return DEADLINE_URGENCY.overdue;
  if (dueDate === now) return DEADLINE_URGENCY.today;
  if (dueDate <= endOfWeek(now)) return DEADLINE_URGENCY.thisWeek;
  if (dueDate <= endOfMonth(now)) return DEADLINE_URGENCY.thisMonth;
  return DEADLINE_URGENCY.none;
}

export function scoreTask(
  task: Pick<Task, "lane" | "due_date" | "task_type">,
  now: CivilDate = today(),
): number {
  const lane = task.lane ? LANE_WEIGHT[task.lane] : 0;
  return lane + deadlineUrgency(task.due_date, now) + (TYPE_NUDGE[task.task_type] ?? 0);
}

/** Highest score first; a nearer deadline, then an older task, breaks ties. */
export function compareTasks<T extends Pick<Task, "lane" | "due_date" | "task_type" | "created_at">>(
  a: T,
  b: T,
  now: CivilDate = today(),
): number {
  const diff = scoreTask(b, now) - scoreTask(a, now);
  if (diff !== 0) return diff;
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return a.created_at < b.created_at ? -1 : 1;
}

/** "TODAY, 2:00PM" / "IN 2 DAYS" / "3 DAYS OVERDUE" — the right-hand stamp. */
export function dueNote(dueDate: string | null | undefined, now: CivilDate = today()): string {
  if (!dueDate) return "NO DEADLINE";
  const delta = daysBetween(now, dueDate);
  if (delta === 0) return "TODAY";
  if (delta === 1) return "TOMORROW";
  if (delta > 1) return `IN ${delta} DAYS`;
  if (delta === -1) return "1 DAY OVERDUE";
  return `${Math.abs(delta)} DAYS OVERDUE`;
}

export function dueColor(dueDate: string | null | undefined, now: CivilDate = today()): string {
  if (!dueDate) return "var(--color-faint)";
  if (dueDate <= now) return "var(--color-danger)";
  if (dueDate <= endOfWeek(now)) return "var(--color-warn)";
  return "var(--color-muted)";
}
