import { extractJobsFromScreenshot } from "@/lib/ai/extractJobs";
import { DemoLimitReached, spendDemoAiCall } from "@/lib/demo/budget";
import { createCapture } from "@/lib/db/captures";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { ValidationError, handleThrown, ok, readJson, serverError } from "@/lib/api";

/** Bodies carry base64 images, so the default 1MB action limit is not enough. */
export const maxDuration = 60;

/** Matches the capture bar. More than this and the request outgrows Vercel's body limit. */
const MAX_IMAGES = 5;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ images?: unknown; note?: string | null }>(req);
    const images = Array.isArray(body.images)
      ? body.images.filter((i): i is string => typeof i === "string" && i.length > 0)
      : [];
    if (images.length === 0) throw new ValidationError("No image was attached.");
    if (images.length > MAX_IMAGES) {
      throw new ValidationError(`Attach at most ${MAX_IMAGES} screenshots at a time.`);
    }
    if (!isAiConfigured()) {
      throw new ValidationError(
        "ANTHROPIC_API_KEY is not set, so screenshots cannot be read yet.",
      );
    }

    // A screenshot is one model call like any other, and a costlier one.
    await spendDemoAiCall();

    let classification;
    try {
      classification = await extractJobsFromScreenshot(images, body.note);
    } catch (err) {
    // The demo's daily allowance, not a failure — its own message, its own code.
    if (err instanceof DemoLimitReached) {
      return Response.json({ error: err.message }, { status: 429 });
    }
      console.error("[api:capture.screenshot] extraction failed", err);
      // image_url stays null: v1 does not archive the image itself, only what
      // was read out of it. The column is there if archival is added later.
      const capture = await createCapture({
        source: "screenshot",
        raw_text: body.note ?? null,
      });
      return ok({ capture, classification: null, error: describeAiError(err) }, 202);
    }

    const capture = await createCapture({
      source: "screenshot",
      raw_text: body.note ?? null,
      classification,
    });
    return ok({ capture, classification }, 201);
  } catch (err) {
    if (err instanceof ValidationError) return handleThrown("capture.screenshot", err);
    return serverError("capture.screenshot", err);
  }
}
