import { generateReviewDraft } from "@/lib/ai/reviewDraft";
import { DemoLimitReached, spendDemoAiCall } from "@/lib/demo/budget";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { ValidationError, handleThrown, ok, readJson, serverError } from "@/lib/api";
import { startOfWeek } from "@/lib/time";

/**
 * Generate the auto-draft. Explicit POST only — never on a page load, and
 * never written into the real fields. It is cached on the row for the human
 * to read alongside their own answers.
 */
export async function POST(req: Request) {
  try {
    if (!isAiConfigured()) throw new ValidationError("ANTHROPIC_API_KEY is not set.");
    const body = await readJson<{ week_start?: string }>(req).catch(() => ({}) as { week_start?: string });
    const week = body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)
      ? body.week_start
      : startOfWeek();
    await spendDemoAiCall();
    return ok(await generateReviewDraft(week));
  } catch (err) {
    // The demo's daily allowance, not a failure — its own message, its own code.
    if (err instanceof DemoLimitReached) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ValidationError) return handleThrown("review.draft", err);
    console.error("[api:review.draft]", describeAiError(err));
    return serverError("review.draft", err);
  }
}
