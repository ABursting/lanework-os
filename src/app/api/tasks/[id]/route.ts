import { deleteTask, setTaskStatus, updateTask } from "@/lib/db/tasks";
import { handleThrown, nullable, ok, optionalOneOf, readJson } from "@/lib/api";
import { LANES, TASK_TYPES, type Lane, type TaskType } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);

    // Completing a task also writes it into memory_log, so it goes through
    // its own path rather than a plain column update.
    if (body.status === "done" || body.status === "open") {
      return ok(await setTaskStatus(id, body.status));
    }

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.description !== undefined) patch.description = nullable(body.description);
    if (body.task_type !== undefined) {
      patch.task_type = optionalOneOf(body.task_type, TASK_TYPES, "task_type") as TaskType | null;
    }
    if (body.lane !== undefined) patch.lane = optionalOneOf(body.lane, LANES, "lane") as Lane | null;
    if (body.due_date !== undefined) patch.due_date = nullable(body.due_date);

    return ok(await updateTask(id, patch));
  } catch (err) {
    return handleThrown("tasks.update", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteTask(id);
    return ok({ id });
  } catch (err) {
    return handleThrown("tasks.delete", err);
  }
}
