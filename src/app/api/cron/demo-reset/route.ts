import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { ok, serverError } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { assertDemoDatabase } from "@/lib/demoGuard";
import { SEED_ORDER, seedRows } from "@/lib/demo/seed";

/** Thirteen deletes and thirteen inserts, on a free-tier database across a continent. */
export const maxDuration = 60;

/**
 * Put the demo back the way it started.
 *
 * ── Why the demo is a real sandbox ──────────────────────────────────────────
 * A demo you cannot click is a screenshot. Visitors can drag cards, tick
 * habits, add companies, log conversations — everything the real app does —
 * because that is the only way to show what the app is. Making that safe means
 * throwing the whole thing away every night and writing the seed back, so
 * nobody inherits the last visitor's mess and nothing anyone types sticks
 * around on a public address.
 *
 * Runs nightly at 08:00 UTC, which is 3am in America/Chicago for most of the
 * year — an hour out when daylight saving shifts, which does not matter for
 * a job that only has to happen while nobody is looking.
 *
 * ── The three locks ─────────────────────────────────────────────────────────
 * This route deletes every row in thirteen tables, so it is the single most
 * destructive thing in the codebase. It will not run unless all three hold:
 *
 *   1. DEMO_MODE is on. On Asher's real deployment this route answers 404 and
 *      nothing else.
 *   2. The caller knows CRON_SECRET. The cron paths sit outside the password
 *      gate by design (hard rule 2 says anything exempted brings its own
 *      check), and in demo mode there is no gate at all — so this is the only
 *      thing standing between the reset and the open internet.
 *   3. The database answers to `demo_marker`. Environment variables get copied
 *      between projects by hand; this is the check that a copied variable
 *      cannot satisfy. See src/lib/demoGuard.ts.
 *
 * The same route does the first seeding, so there is one definition of what
 * the demo contains and no separate script to drift away from it.
 */

function authorize(req: Request): NextResponse | null {
  if (!DEMO_MODE) {
    // Not an error worth explaining — on the real deployment this route should
    // look like it does not exist, because for every purpose it does not.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:demo-reset] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ error: "The reset is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron:demo-reset] rejected a request with a bad or missing bearer token.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  try {
    // Before anything is deleted. This throws rather than returning false
    // precisely so a failure here stops the run instead of continuing.
    await assertDemoDatabase();

    const db = supabaseAdmin();
    const rows = seedRows();

    /*
      Children before parents. The foreign keys mostly cascade, but relying on
      a cascade to clear a table is relying on a schema detail to do a job the
      code should be explicit about — and a cascade would not tell us how many
      rows went.
    */
    const deleted: Record<string, number> = {};
    for (const table of [...SEED_ORDER].reverse()) {
      const { error, count } = await db
        .from(table)
        .delete({ count: "exact" })
        .eq("user_id", USER_ID);
      if (error) throw new Error(`Clearing ${table} failed: ${error.message}`);
      deleted[table] = count ?? 0;
    }

    /*
      The day's model-call allowance goes back to zero too. It is part of what
      "resets nightly" means on the banner, and it keeps the table from growing
      a row a day forever.
    */
    const { error: usageError } = await db
      .from("demo_ai_usage")
      .delete()
      .gte("day", "1970-01-01");
    if (usageError) {
      // Worth knowing about, but not worth abandoning a reset over: the cap is
      // keyed by date, so a stale row only affects the day it belongs to.
      console.error("[cron:demo-reset] could not clear demo_ai_usage:", usageError.message);
    }

    const inserted: Record<string, number> = {};
    for (const table of SEED_ORDER) {
      const batch = rows[table];
      if (batch.length === 0) {
        inserted[table] = 0;
        continue;
      }
      const { error } = await db.from(table).insert(batch);
      if (error) throw new Error(`Seeding ${table} failed: ${error.message}`);
      inserted[table] = batch.length;
    }

    console.log("[cron:demo-reset] demo restored:", inserted);
    return ok({ deleted, inserted });
  } catch (err) {
    return serverError("cron.demo-reset", err);
  }
}

/** Vercel Cron issues a GET; POST is here so the first seeding can be triggered by hand. */
export const POST = GET;
