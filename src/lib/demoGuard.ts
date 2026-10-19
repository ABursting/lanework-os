import "server-only";
import { supabaseAdmin } from "./supabase";
import { DEMO_MODE } from "./demo";

/**
 * The safety catch for demo mode.
 *
 * The failure this exists to prevent: the demo deployment, with its password
 * gate switched off and a nightly wipe on a timer, ends up pointed at Asher's
 * real Supabase project. That would publish every real contact and application
 * to the internet and then delete them at 3am. It is a copy-paste away — the
 * two Vercel projects are built from the same repository and want
 * near-identical environment variables.
 *
 * So demo mode does not trust its own configuration. It asks the database to
 * identify itself. The demo database carries a `demo_marker` table, created
 * only by `supabase/demo/seed.sql` and existing nowhere in
 * `supabase/migrations/`, so Asher's real database has never had it and never
 * will. Pasting the wrong URL and key cannot bring the marker along.
 *
 * Checking the project ref in the Supabase URL would have been simpler and
 * worse: the URL is exactly the thing that gets copied by mistake, so it
 * cannot be the thing that detects the mistake.
 */

/** Cached per server instance — the answer cannot change under a running deployment. */
let verified: boolean | null = null;

export class NotTheDemoDatabase extends Error {
  constructor(detail: string) {
    super(
      "Demo mode is on, but this database is not the demo database. " +
        detail +
        " Refusing to serve or change anything. Check NEXT_PUBLIC_SUPABASE_URL " +
        "and SUPABASE_SERVICE_ROLE_KEY on the demo project — they must point at " +
        "the separate lanework-demo Supabase project, never the real one.",
    );
    this.name = "NotTheDemoDatabase";
  }
}

/**
 * Throws unless the connected database is demonstrably the demo one.
 *
 * Call this before anything in demo mode that reads data out to the public or
 * writes data at all — and unconditionally at the top of the nightly reset,
 * which is the one operation that destroys rows.
 */
export async function assertDemoDatabase(): Promise<void> {
  if (!DEMO_MODE) {
    throw new Error(
      "assertDemoDatabase() was called on a deployment that is not in demo mode. " +
        "This is a bug: the demo-only routes must never be reachable here.",
    );
  }
  if (verified) return;

  const { error } = await supabaseAdmin().from("demo_marker").select("seeded_at").limit(1);

  if (error) {
    // 42P01 / PGRST205 both mean "no such table", which is the expected shape
    // of the dangerous case: a real database, which has no marker.
    console.error("[demo] marker check failed:", error.code ?? "?", error.message);
    throw new NotTheDemoDatabase(
      `Looking for the demo_marker table gave: ${error.message}.`,
    );
  }

  verified = true;
}

/**
 * The same check, as a yes/no, for places that need to degrade rather than
 * throw. Never use this to decide whether to delete anything — use
 * `assertDemoDatabase()` there, so a failure stops the operation.
 */
export async function isDemoDatabase(): Promise<boolean> {
  try {
    await assertDemoDatabase();
    return true;
  } catch {
    return false;
  }
}
