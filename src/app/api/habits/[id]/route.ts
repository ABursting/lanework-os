import { deleteHabit, habitHasHistory, retireHabit, updateHabit } from "@/lib/db/habits";
import { handleThrown, nullable, ok, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: Record<string, unknown> = {};
    if (body.label !== undefined) patch.label = String(body.label).trim();
    if (body.category !== undefined) patch.category = nullable(body.category);
    if (body.target !== undefined) patch.target = nullable(body.target);
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    return ok(await updateHabit(id, patch));
  } catch (err) {
    return handleThrown("habits.update", err);
  }
}

/**
 * Two ways for a habit to leave the list.
 *
 * Default is retire: it disappears going forward, every past day keeps its
 * record. `?purge=true` really deletes the row, and is refused once the habit
 * has been logged on any day — daily_logs keys its records by habit id, so
 * deleting a used definition would rewrite history rather than just tidying
 * the list.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const purge = new URL(req.url).searchParams.get("purge") === "true";
  try {
    if (purge) {
      await deleteHabit(id);
      return ok({ id, deleted: true });
    }
    await retireHabit(id);
    return ok({ id, retired: true });
  } catch (err) {
    return handleThrown(purge ? "habits.delete" : "habits.retire", err);
  }
}

/** Whether this habit can be hard-deleted, so the UI can say so up front. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return ok({ id, hasHistory: await habitHasHistory(id) });
  } catch (err) {
    return handleThrown("habits.history", err);
  }
}
