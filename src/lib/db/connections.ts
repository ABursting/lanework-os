import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { normalizeName } from "@/lib/db/applications";
import type { ParsedConnection } from "@/lib/connections/parseCsv";

/**
 * Asher's own LinkedIn connections, and who among them works where he has
 * applied.
 *
 * A thirteenth table, kept separate from `contacts` on purpose — see the
 * migration header. Contacts are the people he is in conversation with;
 * connections are everyone he has ever accepted. Mixing them would bury the
 * first in the second.
 */

export interface ConnectionRow {
  id: string;
  name: string;
  profile_url: string | null;
  company: string | null;
  position: string | null;
  connected_on: string | null;
}

/** Everyone, for matching. A few hundred rows — small enough to hold at once. */
export async function listConnections(): Promise<ConnectionRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("connections")
    .select("id, name, profile_url, company, position, connected_on")
    .eq("user_id", USER_ID)
    .order("name");

  if (error) {
    console.error("[db:connections] list failed:", error.code ?? "?", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as ConnectionRow[];
}

export async function countConnections(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID);

  if (error) {
    console.error("[db:connections] count failed:", error.code ?? "?", error.message);
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** How a row is identified across imports — the same rule the unique index uses. */
function identity(c: { profile_url: string | null; name: string }): string {
  return (c.profile_url ?? c.name).trim().toLowerCase();
}

/**
 * Write an import.
 *
 * Someone who changed jobs since the last export is corrected rather than
 * duplicated, and nobody is removed: a connection who drops off a later export
 * — LinkedIn omits people who have since restricted their profile — is still
 * someone he knows.
 *
 * ── Why this merges in code rather than using an upsert ─────────────────────
 * The obvious version is `upsert(..., { onConflict: "user_id, profile_url, name" })`.
 * It fails: the unique index is on `(user_id, coalesce(profile_url, name))`,
 * an *expression*, and Postgres will not match an expression index against a
 * plain column list — "there is no unique or exclusion constraint matching the
 * ON CONFLICT specification", at the moment of the first real import.
 *
 * The expression is not incidental. A plain unique index on
 * `(user_id, profile_url, name)` would let the same person in twice whenever
 * `profile_url` is null, because SQL treats nulls as distinct — and about a
 * quarter of a LinkedIn export has no URL. So the index stays as it is, and
 * the merge happens here, against the same rule.
 */
export async function upsertConnections(
  rows: ParsedConnection[],
): Promise<{ written: number; added: number; updated: number }> {
  if (rows.length === 0) return { written: 0, added: 0, updated: 0 };

  const db = supabaseAdmin();

  const { data: existingRows, error: readError } = await db
    .from("connections")
    .select("id, name, profile_url, company, position, connected_on")
    .eq("user_id", USER_ID);

  if (readError) {
    console.error("[db:connections] read before import failed:", readError.code ?? "?", readError.message);
    throw new Error(`Reading existing connections failed: ${readError.message}`);
  }

  const existing = new Map(
    (existingRows ?? []).map((r) => [identity(r as ConnectionRow), r as ConnectionRow]),
  );

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
  const now = new Date().toISOString();

  for (const c of rows) {
    const found = existing.get(identity(c));

    if (!found) {
      toInsert.push({
        user_id: USER_ID,
        name: c.name,
        profile_url: c.profile_url,
        company: c.company,
        position: c.position,
        connected_on: c.connected_on,
        imported_at: now,
      });
      continue;
    }

    // Only write a row that actually changed. Touching all 800 every time
    // would make the import slow and its own log useless.
    const changed =
      found.name !== c.name ||
      found.company !== c.company ||
      found.position !== c.position ||
      found.connected_on !== c.connected_on;

    if (changed) {
      toUpdate.push({
        id: found.id,
        patch: {
          name: c.name,
          company: c.company,
          position: c.position,
          connected_on: c.connected_on,
          imported_at: now,
        },
      });
    }
  }

  // In batches: a few hundred rows in one statement is fine, a few thousand
  // is a request large enough to be refused.
  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { error } = await db.from("connections").insert(toInsert.slice(i, i + BATCH));
    if (error) {
      console.error("[db:connections] insert failed:", error.code ?? "?", error.message);
      throw new Error(`Writing connections failed: ${error.message}`);
    }
  }

  for (const { id, patch } of toUpdate) {
    const { error } = await db.from("connections").update(patch).eq("id", id);
    if (error) {
      console.error("[db:connections] update failed:", error.code ?? "?", error.message);
      throw new Error(`Updating a connection failed: ${error.message}`);
    }
  }

  return {
    written: toInsert.length + toUpdate.length,
    added: toInsert.length,
    updated: toUpdate.length,
  };
}

/** Replace everything with a fresh export. */
export async function clearConnections(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("connections")
    .delete()
    .eq("user_id", USER_ID);

  if (error) {
    console.error("[db:connections] clear failed:", error.code ?? "?", error.message);
    throw new Error(error.message);
  }
}

/* ── Matching ─────────────────────────────────────────────────────────────── */

export interface CompanyMatch {
  company_name: string;
  connections: ConnectionRow[];
}

/**
 * Who you already know at each of these companies.
 *
 * Matched in TypeScript rather than SQL, through the same `normalizeName` the
 * capture classifier and the screenshot importer use. Writing the rule a
 * second time in SQL is how the screenshot importer came to disagree with the
 * other two and quietly create duplicate companies — one rule, one place.
 *
 * The comparison is deliberately exact-after-normalising rather than fuzzy.
 * "Google" and "Google LLC" do not match, and that is the right failure: a
 * near-match that is wrong sends an outreach message to a stranger at a
 * different company, which costs more than a match that was missed.
 */
export function matchConnectionsToCompanies(
  companyNames: string[],
  connections: ConnectionRow[],
): CompanyMatch[] {
  const byCompany = new Map<string, ConnectionRow[]>();
  for (const connection of connections) {
    if (!connection.company) continue;
    const key = normalizeName(connection.company);
    if (!key) continue;
    const list = byCompany.get(key);
    if (list) list.push(connection);
    else byCompany.set(key, [connection]);
  }

  const seen = new Set<string>();
  const out: CompanyMatch[] = [];

  for (const name of companyNames) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const found = byCompany.get(key);
    if (found && found.length > 0) {
      out.push({ company_name: name, connections: found });
    }
  }

  return out;
}
