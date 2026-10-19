import { countMemory, searchMemory, withLinks } from "@/lib/db/memory";
import { ok, serverError } from "@/lib/api";

/**
 * Brain search.
 *
 * Postgres full-text over memory_log.search_vector — a generated tsvector
 * column with a GIN index, not embeddings. No model is called here; searching
 * your own history should be instant and free.
 */
export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams.get("q") ?? "";
    const [entries, total] = await Promise.all([searchMemory(query), countMemory()]);
    return ok({ entries: await withLinks(entries), total });
  } catch (err) {
    return serverError("brain.search", err);
  }
}
