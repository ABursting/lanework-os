import { createHabit } from "@/lib/db/habits";
import { handleThrown, nullable, ok, readJson, requireFields } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["label"]);
    const habit = await createHabit({
      label: String(body.label),
      category: nullable(body.category),
      target: nullable(body.target),
    });
    return ok(habit, 201);
  } catch (err) {
    return handleThrown("habits.create", err);
  }
}
