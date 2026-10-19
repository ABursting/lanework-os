import {
  deleteApplication, getApplication, updateApplication, type ApplicationPatch,
} from "@/lib/db/applications";
import { appendMemory } from "@/lib/db/memory";
import { STAGE_LABEL } from "@/lib/display";
import { handleThrown, nullable, ok, optionalOneOf, readJson } from "@/lib/api";
import { civilOrNull } from "@/lib/reminders";
import { APPLICATION_KINDS, LANES, STAGES } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: ApplicationPatch = {};

    if (body.role_title !== undefined) patch.role_title = String(body.role_title).trim();
    if (body.lane !== undefined) patch.lane = optionalOneOf(body.lane, LANES, "lane") ?? undefined;
    if (body.stage !== undefined) patch.stage = optionalOneOf(body.stage, STAGES, "stage") ?? undefined;
    if (body.kind !== undefined) {
      patch.kind = optionalOneOf(body.kind, APPLICATION_KINDS, "kind") ?? undefined;
    }
    if (body.deadline !== undefined) patch.deadline = civilOrNull(body.deadline);
    // Setting or moving a reminder by hand clears its "estimated" flag — see
    // updateApplication.
    if (body.remind_on !== undefined) patch.remind_on = civilOrNull(body.remind_on);
    if (body.applied_date !== undefined) patch.applied_date = nullable(body.applied_date);
    if (body.job_posting_url !== undefined) patch.job_posting_url = nullable(body.job_posting_url);
    if (body.source_platform !== undefined) patch.source_platform = nullable(body.source_platform);
    if (body.notes !== undefined) patch.notes = nullable(body.notes);
    if (body.resume_passed !== undefined) patch.resume_passed = Boolean(body.resume_passed);
    // "I want to do outreach here" — what the outreach radar goes looking for.
    if (body.outreach_wanted !== undefined) {
      patch.outreach_wanted = Boolean(body.outreach_wanted);
    }

    return ok(await updateApplication(id, patch));
  } catch (err) {
    return handleThrown("applications.update", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    // Read first: once it is gone there is nothing left to name in the entry.
    const application = await getApplication(id);
    await deleteApplication(id);
    if (application) {
      await appendMemory({
        source_type: "crm_change",
        source_id: id,
        text:
          `Deleted application: ${application.company_name} — ${application.role_title} ` +
          `(was in ${STAGE_LABEL[application.stage]}).`,
      });
    }
    return ok({ id });
  } catch (err) {
    return handleThrown("applications.delete", err);
  }
}
