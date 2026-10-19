import { createTask } from "@/lib/db/tasks";
import { companyExists } from "@/lib/db/companies";
import { getApplication } from "@/lib/db/applications";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson, requireFields,
} from "@/lib/api";
import { LANES, TASK_TYPES, type Lane, type TaskType } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["title"]);

    const companyId = nullable(body.company_id);
    if (companyId && !(await companyExists(companyId))) {
      throw new ValidationError(`No company with id ${companyId}`);
    }
    const applicationId = nullable(body.application_id);
    if (applicationId && !(await getApplication(applicationId))) {
      throw new ValidationError(`No application with id ${applicationId}`);
    }

    const task = await createTask({
      title: String(body.title),
      description: nullable(body.description),
      task_type:
        (optionalOneOf(body.task_type, TASK_TYPES, "task_type") as TaskType | null) ?? "other",
      lane: optionalOneOf(body.lane, LANES, "lane") as Lane | null,
      company_id: companyId,
      application_id: applicationId,
      due_date: nullable(body.due_date),
    });
    return ok(task, 201);
  } catch (err) {
    return handleThrown("tasks.create", err);
  }
}
