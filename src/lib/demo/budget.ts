import "server-only";
import { supabaseAdmin } from "../supabase";
import { today } from "../time";
import { DEMO_AI_CAP_MESSAGE, DEMO_AI_DAILY_CAP, DEMO_MODE } from "../demo";

/**
 * The demo's daily allowance of live model calls.
 *
 * One pot for the whole demo, not one per visitor: a per-browser limit is a
 * limit on nobody, since a new browser is a click away. Twenty-five calls a
 * day caps a bad day at roughly a dollar of Asher's Anthropic credit.
 *
 * The count lives in the demo database rather than in memory because the demo
 * runs as several server instances at once and each would keep its own tally,
 * so the real limit would quietly become twenty-five times however many
 * instances happened to be warm. The counting is done by a single SQL
 * statement (`demo_count_ai_call`) that increments and returns in one go, so
 * two people capturing at the same moment cannot both read 24 and both pass.
 *
 * The day is a civil date in the app's timezone — rule 3 — so the allowance
 * refills at midnight where the dashboard thinks it lives, not at 6pm because
 * the server is in UTC.
 */

export class DemoLimitReached extends Error {
  constructor() {
    super(DEMO_AI_CAP_MESSAGE);
    this.name = "DemoLimitReached";
  }
}

/**
 * Take one call from today's allowance, or throw.
 *
 * Called immediately before a model call, never after: counting afterwards
 * would let a burst of simultaneous captures all check an empty tally and all
 * go through. A capture that then fails has still spent its allowance, which
 * is the right way round — the money is spent at the call, not at the success.
 */
export async function spendDemoAiCall(): Promise<void> {
  if (!DEMO_MODE) return;

  const { data, error } = await supabaseAdmin().rpc("demo_count_ai_call", {
    for_day: today(),
  });

  if (error) {
    /*
      Fail closed. If the counter is unreachable there is no way to know what
      has already been spent, and the failure mode of guessing wrong is an
      uncapped bill on a public address. A demo that says "try a sample note"
      for an hour is a much smaller problem.
    */
    console.error("[demo] could not count an AI call, refusing it:", error.message);
    throw new DemoLimitReached();
  }

  const used = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(used) || used > DEMO_AI_DAILY_CAP) {
    throw new DemoLimitReached();
  }
}

/** How many of today's calls are left. For display only — never for a decision. */
export async function demoCallsRemaining(): Promise<number> {
  if (!DEMO_MODE) return Number.POSITIVE_INFINITY;

  const { data, error } = await supabaseAdmin()
    .from("demo_ai_usage")
    .select("calls")
    .eq("day", today())
    .maybeSingle();

  if (error) return 0;
  return Math.max(0, DEMO_AI_DAILY_CAP - ((data?.calls as number | undefined) ?? 0));
}
