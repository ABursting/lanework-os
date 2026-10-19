import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic client.
 *
 * The governing rule for every call in this app: AI never runs on page load.
 * It runs on an explicit capture, or on an explicit "regenerate" for a cached
 * generation (the Priorities rationale, the weekly review draft). Nothing here
 * is called from a render path.
 */

export const MODEL = "claude-opus-5";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }

  // Identity-linked keys are not bound to a workspace, so every request has to
  // name the workspace it acts in or the API rejects it with a 400. A
  // workspace-scoped key already carries that and needs no header — hence the
  // env var being optional rather than required.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  cached = new Anthropic({
    apiKey,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  });
  return cached;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Turn an SDK error into something worth putting in front of a person. */
export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by Anthropic. Wait a moment and try the capture again.";
  }
  if (err instanceof Anthropic.APIError) {
    // The one 400 that is a setup problem rather than a bad request, and whose
    // raw message gives no hint about where to go and fix it.
    if (/anthropic-workspace-id is required/i.test(err.message)) {
      return (
        "This Anthropic key is identity-linked, so it has to say which workspace " +
        "it is acting in. Either create a workspace-scoped key in the Anthropic " +
        "Console (Settings → API Keys, pick a workspace when creating it) and use " +
        "that instead, or set ANTHROPIC_WORKSPACE_ID in .env.local to the " +
        "workspace's id. Restart the dev server after either change."
      );
    }
    return `Anthropic API error ${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
