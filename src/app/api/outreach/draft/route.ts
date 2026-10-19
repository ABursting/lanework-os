import { draftOutreach } from "@/lib/ai/outreach";
import { isAiConfigured } from "@/lib/ai/client";
import { ValidationError, handleThrown, ok, readJson } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { demoRadarRun } from "@/lib/demo/radarRun";
import { DemoLimitReached, spendDemoAiCall } from "@/lib/demo/budget";
import type { RadarLead } from "@/lib/outreach/types";

/** One model call, but a slow one when several leads are selected. */
export const maxDuration = 60;

/**
 * Draft messages for the leads the operator picked.
 *
 * Separate from the search on purpose, and asked for per lead. The search says
 * who exists; this says what to tell them, and only for the people actually
 * worth writing to. Drafting everything a search turns up pays for messages to
 * people who were never going to be contacted, and buries the two that matter
 * in a page of ones that do not.
 *
 * The same shape as the capture bar: the machine proposes, the human picks,
 * and only the picked part costs anything. Asher's call, 2026-10-09.
 *
 * Nothing here sends a message. It returns text for him to read and edit.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ leads?: RadarLead[] }>(req);
    const leads = Array.isArray(body.leads) ? body.leads : [];

    if (leads.length === 0) throw new ValidationError("No leads were selected to draft for.");
    if (leads.length > 12) {
      // A guard on cost, not on taste: twelve drafts is already a long read.
      throw new ValidationError("Select at most 12 people at a time.");
    }

    if (!isAiConfigured()) throw new ValidationError("ANTHROPIC_API_KEY is not set.");

    /*
      Drafting is live in the demo, which the search above is not.

      It is the part worth paying for: a visitor watching a message get written
      about a specific person is the whole claim this feature makes, and a
      replay of it is indistinguishable from a hardcoded paragraph. It is also
      the cheap half — one call for the batch, a few seconds, against the same
      daily cap the capture bar spends from. The search is the opposite on
      every count: a call per company, most of a minute each, and aimed at real
      strangers.

      When the cap is spent the demo falls back to the recorded drafts rather
      than failing. A visitor arriving after the day's budget is gone still
      sees what the feature produces; they just see yesterday's sentence
      instead of a new one, and the page says so.
    */
    if (DEMO_MODE) {
      try {
        await spendDemoAiCall();
      } catch (err) {
        if (!(err instanceof DemoLimitReached)) throw err;
        const recorded = new Map(
          demoRadarRun().leads.map((l) => [l.person_name.toLowerCase(), l.draft ?? ""]),
        );
        return ok({
          drafts: leads.map((lead, index) => ({
            index,
            message: recorded.get(lead.person_name.toLowerCase()) ?? "",
          })),
          replayed: true,
        });
      }
      const drafted = await draftOutreach(leads);
      return ok({
        drafts: [...drafted].map(([index, message]) => ({ index, message })),
        replayed: false,
      });
    }

    await spendDemoAiCall();
    const drafted = await draftOutreach(leads);

    return ok({
      drafts: [...drafted].map(([index, message]) => ({ index, message })),
      replayed: false,
    });
  } catch (err) {
    if (err instanceof DemoLimitReached) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    return handleThrown("outreach.draft", err);
  }
}
