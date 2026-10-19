import { generatePrioritiesRationale } from "@/lib/ai/rationale";
import { DemoLimitReached, spendDemoAiCall } from "@/lib/demo/budget";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { ValidationError, handleThrown, ok, serverError } from "@/lib/api";

/**
 * Regenerate the cached "why today" lines.
 *
 * POST only, and only ever from an explicit click. The Home page reads the
 * cached copy out of daily_logs and never calls this during a render.
 */
export async function POST() {
  try {
    if (!isAiConfigured()) {
      throw new ValidationError("ANTHROPIC_API_KEY is not set.");
    }
    await spendDemoAiCall();
    return ok(await generatePrioritiesRationale());
  } catch (err) {
    // The demo's daily allowance, not a failure — its own message, its own code.
    if (err instanceof DemoLimitReached) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ValidationError) return handleThrown("priorities.rationale", err);
    console.error("[api:priorities.rationale]", describeAiError(err));
    return serverError("priorities.rationale", err);
  }
}
