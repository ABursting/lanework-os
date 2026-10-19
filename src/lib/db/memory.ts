import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { MemoryEntry, MemorySourceType } from "@/lib/types";

/**
 * memory_log is the append-only spine everything else feeds: captures, stage
 * changes, completed tasks, sealed reviews. Brain searches it, and the weekly
 * review draft is synthesised from a week of it.
 *
 * search_vector is a generated column, so nothing here maintains it.
 */
export async function appendMemory(entry: {
  source_type: MemorySourceType;
  source_id?: string | null;
  text: string;
  occurred_at?: string;
}): Promise<void> {
  const text = entry.text?.trim();
  if (!text) {
    // memory_log.text is NOT NULL; an empty event is a bug upstream, not a row.
    console.warn(`[memory] refused an empty ${entry.source_type} entry`);
    return;
  }

  const { error } = await supabaseAdmin().from("memory_log").insert({
    user_id: USER_ID,
    source_type: entry.source_type,
    source_id: entry.source_id ?? null,
    text,
    occurred_at: entry.occurred_at ?? new Date().toISOString(),
  });

  // A failed memory write must never fail the action that triggered it — the
  // stage change still happened — but it must be loud in the logs.
  if (error) {
    console.error(`[memory] insert failed for ${entry.source_type}: ${error.message}`, error);
  }
}

/**
 * Retract entries written for a source that has been undone.
 *
 * Completing a task logs "Completed: X" into the history Brain searches. If
 * the completion is taken back — a mis-click, or you realise you were not
 * actually finished — that line has to go with it: as far as the record is
 * concerned the event did not happen, and leaving it would mean Brain
 * confidently reports work you never did.
 *
 * Deletes every matching entry rather than the latest one, so a
 * complete/reopen/complete/reopen cycle cannot silently accumulate them.
 */
export async function retractMemory(
  sourceType: MemorySourceType,
  sourceId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("memory_log")
    .delete()
    .eq("user_id", USER_ID)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  // Never fail the action that triggered this — the reopen still happened —
  // but say so loudly, because a stale entry is a quietly wrong record.
  if (error) {
    console.error(
      `[memory] failed to retract ${sourceType} for ${sourceId}: ${error.message}`,
      error,
    );
  }
}

/**
 * Ranked full-text search over memory_log.
 *
 * Postgres FTS, not embeddings. websearch_to_tsquery is the forgiving parser:
 * it takes bare words, quoted phrases and OR, and does not throw on the
 * punctuation a human types into a search box.
 */
export async function searchMemory(query: string, limit = 40): Promise<MemoryEntry[]> {
  const db = supabaseAdmin();
  const q = query.trim();

  if (!q) {
    const { data, error } = await db
      .from("memory_log")
      .select("*")
      .eq("user_id", USER_ID)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as MemoryEntry[];
  }

  const { data, error } = await db
    .from("memory_log")
    .select("*")
    .eq("user_id", USER_ID)
    .textSearch("search_vector", q, { type: "websearch", config: "english" })
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as MemoryEntry[];
}

export async function countMemory(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("memory_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID);
  if (error) throw error;
  return count ?? 0;
}

/** Everything that happened in a window — the weekly review draft's input. */
export async function memoryBetween(fromIso: string, toIso: string): Promise<MemoryEntry[]> {
  const { data, error } = await supabaseAdmin()
    .from("memory_log")
    .select("*")
    .eq("user_id", USER_ID)
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemoryEntry[];
}

export interface MemoryEntryWithLink extends MemoryEntry {
  /** A human label for whatever this entry came from, when it can be resolved. */
  link: { tag: string; label: string } | null;
}

/**
 * Attach a source label to each entry in one batch per source type, so the
 * Brain detail panel can say what an entry was about without N round trips.
 * An entry whose source row has since been deleted simply gets no link.
 */
export async function withLinks(entries: MemoryEntry[]): Promise<MemoryEntryWithLink[]> {
  const db = supabaseAdmin();
  const idsOf = (type: MemorySourceType) =>
    entries.filter((e) => e.source_type === type && e.source_id).map((e) => e.source_id!);

  // A crm_change id can be an application or a contact; looking it up among
  // applications is harmless either way, and a deleted row just has no link.
  const applicationIds = [...idsOf("stage_change"), ...idsOf("crm_change")];
  const taskIds = idsOf("task_completed");

  const [applications, tasks] = await Promise.all([
    applicationIds.length
      ? db.from("applications").select("id, role_title, companies(name)").in("id", applicationIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? db.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (applications.error) console.error(`[memory] link lookup: ${applications.error.message}`);
  if (tasks.error) console.error(`[memory] link lookup: ${tasks.error.message}`);

  const appLabels = new Map(
    ((applications.data ?? []) as unknown as {
      id: string; role_title: string; companies: { name: string } | null;
    }[]).map((a) => [a.id, `${a.companies?.name ?? "—"} — ${a.role_title}`]),
  );
  const taskLabels = new Map(
    ((tasks.data ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]),
  );

  return entries.map((entry) => {
    let link: { tag: string; label: string } | null = null;
    if (entry.source_id) {
      if (
        (entry.source_type === "stage_change" || entry.source_type === "crm_change") &&
        appLabels.has(entry.source_id)
      ) {
        link = { tag: "APP", label: appLabels.get(entry.source_id)! };
      } else if (entry.source_type === "task_completed" && taskLabels.has(entry.source_id)) {
        link = { tag: "TASK", label: taskLabels.get(entry.source_id)! };
      }
    }
    return { ...entry, link };
  });
}
