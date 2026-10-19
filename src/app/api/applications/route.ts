import { createApplication } from "@/lib/db/applications";
import { getCompany } from "@/lib/db/companies";
import { appendMemory } from "@/lib/db/memory";
import { STAGE_LABEL } from "@/lib/display";
import { companyExists, ensureCompany } from "@/lib/db/companies";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson, requireFields,
} from "@/lib/api";
import { civilOrNull } from "@/lib/reminders";
import { APPLICATION_KINDS, LANES, STAGES } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["role_title"]);

    // Accept either an existing company id or a name to create/reuse. An id
    // that does not resolve is rejected rather than silently inserted — the
    // FK would reject it anyway, but several layers away from the field.
    let companyId: string;
    if (body.company_id) {
      const id = String(body.company_id);
      if (!(await companyExists(id))) {
        throw new ValidationError(`No company with id ${id}`);
      }
      companyId = id;
    } else if (body.company_name) {
      const company = await ensureCompany({ name: String(body.company_name) });
      companyId = company.id;
    } else {
      throw new ValidationError("Provide either company_id or company_name");
    }

    const application = await createApplication({
      company_id: companyId,
      role_title: String(body.role_title).trim(),
      lane: optionalOneOf(body.lane, LANES, "lane") ?? "primary",
      stage: optionalOneOf(body.stage, STAGES, "stage") ?? "applied",
      kind: optionalOneOf(body.kind, APPLICATION_KINDS, "kind") ?? "job",
      deadline: civilOrNull(body.deadline),
      // Absent lets a Researching role with a deadline take the default
      // reminder; an explicit empty value means no reminder.
      ...(body.remind_on !== undefined ? { remind_on: civilOrNull(body.remind_on) } : {}),
      job_posting_url: nullable(body.job_posting_url),
      source_platform: nullable(body.source_platform),
      notes: nullable(body.notes),
    });

    // This route is the hand-entry path ("+ Add"). Captures create rows
    // directly and are already recorded by the capture's own summary.
    const company = await getCompany(companyId);
    await appendMemory({
      source_type: "crm_change",
      source_id: application.id,
      text:
        `Added by hand: ${company?.name ?? "—"} — ${application.role_title}, ` +
        `in ${STAGE_LABEL[application.stage]}.`,
    });
    return ok(application, 201);
  } catch (err) {
    return handleThrown("applications.create", err);
  }
}
