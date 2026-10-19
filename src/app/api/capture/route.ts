import { classifyCapture, resolveRecorded } from "@/lib/ai/classify";
import { createCapture } from "@/lib/db/captures";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { ValidationError, handleThrown, ok, readJson, serverError } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { DemoLimitReached, spendDemoAiCall } from "@/lib/demo/budget";
import { recordedAnswer } from "@/lib/demo/sampleNotes";

/**
 * Step one of a text capture: classify and stage. Nothing is written to
 * companies / contacts / applications / tasks here — the response is a
 * proposal the UI shows for confirmation, and the confirm route does the
 * writing. This is the human gate the scope requires.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ text?: string }>(req);
    const text = body.text?.trim();
    if (!text) throw new ValidationError("Nothing to capture — the note was empty.");

    /*
      The demo's sample notes are answered from a recording: the confirm screen
      is the real one, filled in exactly as the model filled it in, but no call
      is made and nothing is spent. Matched on the note's own text, because an
      "this one is free" flag sent by the browser would be a flag anyone could
      send. See src/lib/demo/sampleNotes.ts.
    */
    if (DEMO_MODE) {
      const recorded = recordedAnswer(text);
      if (recorded) {
        // Resolved against the live rows, through the same path a real answer
        // takes — the recording carries names, never ids (hard rule 5).
        const classification = await resolveRecorded(recorded);
        const capture = await createCapture({
          source: "web_form",
          raw_text: text,
          classification,
        });
        return ok({ capture, classification }, 201);
      }
    }

    if (!isAiConfigured()) {
      throw new ValidationError(
        "ANTHROPIC_API_KEY is not set, so captures cannot be classified yet.",
      );
    }

    // Anything else typed into the demo goes to the real model, against a
    // shared daily allowance. Spent before the call, not after.
    await spendDemoAiCall();

    let classification;
    try {
      classification = await classifyCapture(text);
    } catch (err) {
      // The raw text is still worth keeping even when the model call failed —
      // it is the one thing that cannot be reconstructed.
      console.error("[api:capture] classification failed, staging raw text anyway", err);
      const capture = await createCapture({ source: "web_form", raw_text: text });
      return ok({ capture, classification: null, error: describeAiError(err) }, 202);
    }

    const capture = await createCapture({
      source: "web_form",
      raw_text: text,
      classification,
    });
    return ok({ capture, classification }, 201);
  } catch (err) {
    /*
      The cap is not a server fault and not a bad request — it is the demo
      working as designed — so it goes back as its own message for the capture
      bar to show, rather than through the error banner as a failure.
    */
    if (err instanceof DemoLimitReached) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ValidationError) return handleThrown("capture.create", err);
    return serverError("capture.create", err);
  }
}
