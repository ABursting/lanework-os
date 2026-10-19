import "server-only";
import { tasksCompletedBetween } from "./tasks";
import { applicationEventsBetween, type ApplicationEventRow } from "./applicationEvents";
import { listAppliedDates } from "./applications";
import {
  addDays, endOfDayInstant, startOfDayInstant, toCivilDate, today, type CivilDate,
} from "@/lib/time";
import type { Stage, Task, TaskType } from "@/lib/types";

/**
 * The activity timeline's data.
 *
 * Two streams over the same days: work you finished (tasks, split by category)
 * and movement in the pipeline (applications changing stage). They are kept
 * apart rather than stacked together because they are different kinds of fact
 * — one is effort you spent, the other is a result that arrived — and adding
 * them would produce a number that means nothing.
 *
 * Every bucket is a local day via the shared helper, so a task finished at
 * 11pm belongs to that evening rather than to tomorrow in UTC.
 */

export interface TimelineDay {
  date: CivilDate;
  /** Completed tasks that day, counted per category. */
  tasksByType: Partial<Record<TaskType, number>>;
  taskTotal: number;
  /** Stage transitions that day, counted per destination stage. */
  eventsByStage: Partial<Record<Stage, number>>;
  eventTotal: number;
}

/** One point on the running total of applications submitted. */
export interface CumulativePoint {
  date: CivilDate;
  /** Everything submitted on or before this day, not just within the window. */
  total: number;
  /** Submitted on this day alone - what makes the line step. */
  added: number;
}

export interface TimelineData {
  days: TimelineDay[];
  /**
   * The running total of applications submitted, over the same days.
   *
   * Cumulative rather than per-day because the question it answers is "is this
   * still moving, and how fast" - and a per-day count of a job search is
   * mostly zeroes with occasional spikes, which looks like noise rather than
   * progress. A line that only ever goes up makes the slope the message.
   *
   * It starts from the count already submitted before the window opened, so
   * the line continues from where the search actually was rather than
   * restarting at zero every time the range changes.
   */
  cumulative: CumulativePoint[];
  /** Categories that actually occur in the window, in TASK_TYPES order. */
  presentTypes: TaskType[];
  presentStages: Stage[];
  totals: { tasks: number; events: number; activeDays: number };
  /** The raw entries, newest first, for the detail list beneath the chart. */
  entries: TimelineEntry[];
}

export type TimelineEntry =
  | { kind: "task"; at: string; date: CivilDate; title: string; task_type: TaskType }
  | {
      kind: "event";
      at: string;
      date: CivilDate;
      title: string;
      from_stage: Stage | null;
      to_stage: Stage;
    };

export async function getTimeline(days = 30): Promise<TimelineData> {
  const end = today();
  const start = addDays(end, -(days - 1));
  const fromIso = startOfDayInstant(start).toISOString();
  const toIso = endOfDayInstant(end).toISOString();

  const [tasks, events, appliedDates] = await Promise.all([
    tasksCompletedBetween(fromIso, toIso),
    applicationEventsBetween(fromIso, toIso),
    listAppliedDates(),
  ]);

  // Every day in the range exists, including the empty ones — a gap is data.
  // Bars for quiet days are what make a busy week look busy.
  const buckets = new Map<CivilDate, TimelineDay>();
  for (let i = 0; i < days; i += 1) {
    const date = addDays(start, i);
    buckets.set(date, {
      date,
      tasksByType: {},
      taskTotal: 0,
      eventsByStage: {},
      eventTotal: 0,
    });
  }

  const entries: TimelineEntry[] = [];

  for (const task of tasks as Task[]) {
    if (!task.completed_at) continue;
    const date = toCivilDate(new Date(task.completed_at));
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.tasksByType[task.task_type] = (bucket.tasksByType[task.task_type] ?? 0) + 1;
    bucket.taskTotal += 1;
    entries.push({
      kind: "task",
      at: task.completed_at,
      date,
      title: task.title,
      task_type: task.task_type,
    });
  }

  for (const event of events as ApplicationEventRow[]) {
    // Adding a role to Researching is not a pipeline move — nothing was sent
    // and nothing came back. Its move on to Applied is, and counts there.
    if (event.to_stage === "researching") continue;
    const date = toCivilDate(new Date(event.occurred_at));
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.eventsByStage[event.to_stage] = (bucket.eventsByStage[event.to_stage] ?? 0) + 1;
    bucket.eventTotal += 1;
    entries.push({
      kind: "event",
      at: event.occurred_at,
      date,
      title: `${event.company_name} — ${event.role_title}`,
      from_stage: event.from_stage,
      to_stage: event.to_stage,
    });
  }

  const ordered = [...buckets.values()];
  entries.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Only show a category in the legend if it actually happened in the window;
  // a legend full of zeroes is noise.
  const typeOrder: TaskType[] = [
    "application", "networking_outreach", "informational_interview_followup",
    "interview_prep", "research", "admin", "other",
  ];
  const stageOrder: Stage[] = ["applied", "interviewing", "offer", "rejected", "archived"];
  // Researching is left out on purpose — see the event loop above.

  /*
    The running total. Everything submitted before the window becomes the
    line's starting height, so changing the range slides a window along one
    curve rather than drawing a different curve each time.
  */
  const perDay = new Map<CivilDate, number>();
  let before = 0;
  for (const date of appliedDates) {
    if (date < start) before += 1;
    else if (date <= end) perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }

  let running = before;
  const cumulative: CumulativePoint[] = ordered.map((day) => {
    const added = perDay.get(day.date) ?? 0;
    running += added;
    return { date: day.date, total: running, added };
  });

  return {
    days: ordered,
    cumulative,
    presentTypes: typeOrder.filter((t) => ordered.some((d) => (d.tasksByType[t] ?? 0) > 0)),
    presentStages: stageOrder.filter((st) =>
      ordered.some((d) => (d.eventsByStage[st] ?? 0) > 0),
    ),
    totals: {
      tasks: ordered.reduce((n, d) => n + d.taskTotal, 0),
      events: ordered.reduce((n, d) => n + d.eventTotal, 0),
      activeDays: ordered.filter((d) => d.taskTotal > 0 || d.eventTotal > 0).length,
    },
    entries,
  };
}
