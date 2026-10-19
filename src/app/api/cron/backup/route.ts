import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { today } from "@/lib/time";
import { ok, serverError } from "@/lib/api";
import { recordBackupSuccess } from "@/lib/db/settings";
import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/demo";

/** Long enough for ten table dumps plus two GitHub round trips. */
export const maxDuration = 60;

/**
 * Every table. The two added after the scope's ten — stage history (Sep 4) and
 * the Compress settings (Sep 15) — were missing from this list until Oct 1, so
 * a backup would have silently lost every application's history.
 */
const TABLES = [
  "companies", "applications", "contacts", "tasks", "habit_definitions",
  "daily_logs", "raw_captures", "memory_log", "weekly_reviews", "goals",
  "application_events", "user_settings",
  /*
    `connections` is deliberately absent. It holds several hundred real
    people's names, employers and profile URLs, and this job copies every row
    it is given to a GitHub repository nightly. Asher's call, 2026-10-06: not
    worth sending there, and nothing is lost — the file can be re-imported
    from LinkedIn at any time.
  */
] as const;

/**
 * Nightly backup to a private GitHub repo.
 *
 * Every table, dumped as one JSON file per night. Supabase's own backups exist,
 * but they are not something you can read, diff, or restore a single row from —
 * this is the copy you can actually open.
 *
 * The endpoint is public by URL, so it checks the bearer token Vercel sends on
 * scheduled invocations and refuses anything else.
 */
function authorize(req: Request): NextResponse | null {
  /*
    Both Vercel projects are built from this one repository, so they share
    vercel.json and the demo deployment schedules this job too. There is
    nothing in the demo worth backing up, and a backup token on a public
    deployment is a liability, so it declines rather than running.
  */
  if (DEMO_MODE) {
    console.log("[cron:backup] demo deployment — nothing to back up, skipping.");
    return NextResponse.json({ error: "Backups are off in demo mode." }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:backup] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ error: "Backup is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron:backup] rejected a request with a bad or missing bearer token.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function dumpAll(): Promise<Record<string, unknown[]>> {
  const db = supabaseAdmin();
  const dump: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    // memory_log carries a generated tsvector that is large, derived, and
    // regenerated on restore — no reason to ship it in the backup.
    const columns = table === "memory_log"
      ? "id, user_id, source_type, source_id, text, occurred_at, created_at"
      : "*";

    const { data, error } = await db.from(table).select(columns).eq("user_id", USER_ID);
    if (error) {
      throw new Error(`Dumping ${table} failed: ${error.message}`);
    }
    dump[table] = data ?? [];
  }
  return dump;
}

async function commitToGitHub(path: string, contents: string): Promise<string> {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo = process.env.GITHUB_BACKUP_REPO;
  const branch = process.env.GITHUB_BACKUP_BRANCH ?? "main";

  if (!token || !repo) {
    throw new Error("GITHUB_BACKUP_TOKEN and GITHUB_BACKUP_REPO must both be set.");
  }

  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // A same-day re-run overwrites that day's file, which needs the blob's sha.
  let sha: string | undefined;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) {
    const body = (await existing.json()) as { sha?: string };
    sha = body.sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub lookup failed (${existing.status}): ${await existing.text()}`);
  }

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Backup ${path}`,
      content: Buffer.from(contents, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub commit failed (${res.status}): ${await res.text()}`);
  }
  return path;
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  try {
    const date = today();
    const dump = await dumpAll();
    const counts = Object.fromEntries(
      Object.entries(dump).map(([table, rows]) => [table, rows.length]),
    );

    const path = await commitToGitHub(
      `backups/${date}.json`,
      `${JSON.stringify({ exported_at: new Date().toISOString(), date, counts, tables: dump }, null, 2)}\n`,
    );

    /*
      Record the success so Home can say when the last one was. Deliberately
      after the upload and deliberately swallowed: the backup is safe at this
      point, and failing the job over its own bookkeeping would turn a working
      night into a reported failure. A miss here shows as a stale date, which
      is the cautious direction to be wrong in.
    */
    try {
      await recordBackupSuccess(path);
    } catch (err) {
      console.error("[cron:backup] wrote the backup but could not record it:", err);
    }

    console.log(`[cron:backup] wrote ${path}:`, counts);
    return ok({ path, counts });
  } catch (err) {
    return serverError("cron.backup", err);
  }
}

/** Vercel Cron issues a GET; POST is here so the job can be triggered by hand. */
export const POST = GET;
