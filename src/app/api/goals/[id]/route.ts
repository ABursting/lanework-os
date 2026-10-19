import { deleteGoal, updateGoal } from "@/lib/db/goals";
import { handleThrown, ok, optionalOneOf, readJson } from "@/lib/api";
import { LANES, type GoalMetric, type Lane } from "@/lib/types";

const METRICS = ["applications", "networking_outreach", "informational_interviews", "manual"] as const;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.target_count !== undefined) patch.target_count = Math.max(1, Number(body.target_count) || 1);
    if (body.lane !== undefined) patch.lane = optionalOneOf(body.lane, LANES, "lane") as Lane | null;
    if (body.metric !== undefined) {
      patch.metric = optionalOneOf(body.metric, METRICS, "metric") as GoalMetric | null;
    }
    if (body.completed !== undefined) patch.completed = Boolean(body.completed);
    return ok(await updateGoal(id, patch));
  } catch (err) {
    return handleThrown("goals.update", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteGoal(id);
    return ok({ id });
  } catch (err) {
    return handleThrown("goals.delete", err);
  }
}
