import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic } from "./client";
import { setPrioritiesRationale } from "@/lib/db/dailyLogs";
import { topPriorities } from "@/lib/db/tasks";
import { dueNote } from "@/lib/priority";
import { LANE_LABEL, TASK_TYPE_LABEL } from "@/lib/display";
import { today } from "@/lib/time";
import type { PrioritiesRationale } from "@/lib/types";

/**
 * The one-line "why today" under each of the top three priorities.
 *
 * The ranking itself is deterministic (src/lib/priority.ts) — this only
 * explains it. It is generated once a day on an explicit request, cached in
 * daily_logs.notes.priorities_rationale, and read from there on every render.
 * It is never called from a page load: a card that quietly bills an API call
 * every time you glance at the dashboard is the thing this rule exists to
 * prevent.
 */

const RationaleSchema = z.object({
  reasons: z.array(
    z.object({
      task_id: z.string(),
      why: z.string().describe("One sentence. Under 110 characters. No preamble."),
    }),
  ),
});

const SYSTEM = `You write a single line under each of a job-seeker's top three tasks explaining why it matters today.

You are given the ranking, which was computed deterministically from lane weight and deadline urgency. Do not re-rank, do not argue with the order, and do not restate the task title.

Each line: one sentence, under 110 characters, plain and specific. Say what is actually at stake — the thing that gets worse if it slips to tomorrow. No motivational language, no exclamation marks, no "make sure to".`;

export async function generatePrioritiesRationale(): Promise<PrioritiesRationale> {
  const tasks = await topPriorities(3);

  if (tasks.length === 0) {
    const empty: PrioritiesRationale = { generated_at: new Date().toISOString(), reasons: {} };
    await setPrioritiesRationale(empty);
    return empty;
  }

  const now = today();
  const brief = tasks
    .map((task, index) =>
      [
        `${index + 1}. [id: ${task.id}] ${task.title}`,
        `   type: ${TASK_TYPE_LABEL[task.task_type]}`,
        `   lane: ${task.lane ? LANE_LABEL[task.lane] : "none"}`,
        `   due: ${task.due_date ?? "no deadline"} (${dueNote(task.due_date, now)})`,
        task.company_name ? `   company: ${task.company_name}` : null,
        task.application_role ? `   role: ${task.application_role}` : null,
        task.description ? `   notes: ${task.description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(RationaleSchema) },
    messages: [
      {
        role: "user",
        content: `Today is ${now}. Write the "why today" line for each of these, keyed by task_id.\n\n${brief}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The rationale generator returned an unexpected shape.");

  // Only keep lines whose task_id is one we actually asked about.
  const valid = new Set(tasks.map((t) => t.id));
  const reasons: Record<string, string> = {};
  for (const entry of parsed.reasons) {
    if (valid.has(entry.task_id) && entry.why.trim()) {
      reasons[entry.task_id] = entry.why.trim();
    }
  }

  const rationale: PrioritiesRationale = {
    generated_at: new Date().toISOString(),
    reasons,
  };
  await setPrioritiesRationale(rationale);
  return rationale;
}
