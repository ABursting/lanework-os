import { createGoal } from "@/lib/db/goals";
import {
  handleThrown, ok, optionalOneOf, readJson, requireFields, requireOneOf,
} from "@/lib/api";
import { LANES, type GoalMetric, type Lane } from "@/lib/types";

const METRICS = ["applications", "networking_outreach", "informational_interviews", "manual"] as const;

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["description"]);
    const goal = await createGoal({
      scope: requireOneOf(body.scope, ["week", "month"] as const, "scope"),
      description: String(body.description),
      target_count: Math.max(1, Number(body.target_count) || 1),
      lane: optionalOneOf(body.lane, LANES, "lane") as Lane | null,
      metric: (optionalOneOf(body.metric, METRICS, "metric") as GoalMetric | null) ?? "manual",
    });
    return ok(goal, 201);
  } catch (err) {
    return handleThrown("goals.create", err);
  }
}
