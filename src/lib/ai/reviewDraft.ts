import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic } from "./client";
import { memoryBetween } from "@/lib/db/memory";
import { tasksCompletedBetween } from "@/lib/db/tasks";
import { saveAutoDraft } from "@/lib/db/weeklyReviews";
import { MEMORY_KIND_LABEL } from "@/lib/display";
import { addDays, endOfDayInstant, startOfDayInstant, type CivilDate } from "@/lib/time";
import type { WeeklyReviewDraft } from "@/lib/types";

/**
 * The weekly review auto-draft.
 *
 * Synthesis from raw event data — a week of memory_log plus the tasks actually
 * finished — into the five fields of the review. Generated on request only,
 * cached in weekly_reviews.auto_draft, and never written straight into the
 * real fields: the human copies what they agree with, edits it, and seals.
 */

const DraftSchema = z.object({
  wins: z.string(),
  what_slipped: z.string(),
  open_loops: z.string(),
  follow_up_people: z.string(),
  next_week_top3: z.string(),
});

const SYSTEM = `You draft a job-seeker's weekly review from a log of what actually happened that week.

Write each field as short lines, one item per line, no bullet characters and no numbering except in next_week_top3, which is numbered 1-3.

- wins: what genuinely moved. Concrete, from the log. If the week was thin, say so plainly rather than inflating it.
- what_slipped: what did not happen, and the honest reason where the log shows one. Do not invent failures the log does not support.
- open_loops: unfinished threads that need a decision or an action.
- follow_up_people: named people to contact, with what is owed to each.
- next_week_top3: exactly three numbered items, drawn from the open loops and what slipped.

Every claim must be traceable to the log. Where the log is silent, write "Nothing logged." rather than guessing. This is a draft a person will edit — being wrong is worse than being brief.`;

export async function generateReviewDraft(week: CivilDate): Promise<WeeklyReviewDraft> {
  const weekEnd = addDays(week, 6);
  const fromIso = startOfDayInstant(week).toISOString();
  const toIso = endOfDayInstant(weekEnd).toISOString();

  const [entries, tasks] = await Promise.all([
    memoryBetween(fromIso, toIso),
    tasksCompletedBetween(fromIso, toIso),
  ]);

  const log = entries.length
    ? entries
        .map(
          (e) =>
            `[${e.occurred_at.slice(0, 10)}] (${MEMORY_KIND_LABEL[e.source_type]}) ${e.text}`,
        )
        .join("\n")
    : "(nothing logged this week)";

  const done = tasks.length
    ? tasks.map((t) => `- ${t.title}`).join("\n")
    : "(no tasks completed)";

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(DraftSchema) },
    messages: [
      {
        role: "user",
        content: `Week of ${week} to ${weekEnd}.

EVENT LOG:
${log}

TASKS COMPLETED:
${done}

Draft the review.`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The review drafter returned an unexpected shape.");

  const draft: WeeklyReviewDraft = {
    generated_at: new Date().toISOString(),
    wins: parsed.wins.trim(),
    what_slipped: parsed.what_slipped.trim(),
    open_loops: parsed.open_loops.trim(),
    follow_up_people: parsed.follow_up_people.trim(),
    next_week_top3: parsed.next_week_top3.trim(),
  };

  await saveAutoDraft(week, draft);
  return draft;
}
