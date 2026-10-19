import { getCapture, settleCapture } from "@/lib/db/captures";
import { companyExists, ensureCompany, findCompanyByName } from "@/lib/db/companies";
import {
  contactExists, createContact, findContactByName, logContactTouch,
} from "@/lib/db/contacts";
import {
  createApplication, dedupeKey, existingApplicationKeys, getApplication, updateApplication,
} from "@/lib/db/applications";
import { createTask } from "@/lib/db/tasks";
import { appendMemory } from "@/lib/db/memory";
import { addDays, startOfDayInstant, today } from "@/lib/time";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson,
} from "@/lib/api";
import { civilOrNull } from "@/lib/reminders";
import {
  APPLICATION_KINDS, LANES, RELATIONSHIP_TYPES, STAGES, TASK_TYPES,
  type CaptureClassification, type Lane, type RelationshipType, type Stage, type TaskType,
} from "@/lib/types";

/** A role the note reported submitting, as the confirm dialog sends it. */
interface ApplicationDraft {
  company_name: string;
  /** Set when the person picked an existing company; resolved by name otherwise. */
  company_id?: string | null;
  role_title: string;
  lane?: string | null;
  stage?: string;
  kind?: string | null;
  /** Only kept for a Researching role. */
  deadline?: string | null;
  /** The reminder the person chose, already worked out to a date. */
  remind_on?: string | null;
  /** The posting's address, if you pasted one on the confirm screen. */
  job_posting_url?: string | null;
}

type Ctx = { params: Promise<{ id: string }> };

interface CommitBody {
  summary?: string;
  /** True when the human edited the model's reading before accepting it. */
  corrected?: boolean;
  companies_to_create?: string[];
  contacts_to_create?: {
    name: string;
    company_id?: string | null;
    role?: string | null;
    relationship_type?: string;
  }[];
  tasks?: {
    title: string;
    task_type?: string;
    lane?: string | null;
    due_date?: string | null;
    company_id?: string | null;
    application_id?: string | null;
  }[];
  contact_touches?: {
    contact_id?: string | null;
    contact_name: string;
    company_name?: string | null;
    role?: string | null;
    relationship_type?: string | null;
    note?: string | null;
    follow_up_in_days?: number | null;
  }[];
  stage_changes?: { application_id: string; to_stage: string }[];
  applications_to_create?: ApplicationDraft[];
}

/**
 * Step two of a capture: commit what the human approved.
 *
 * Every id that arrives here is checked against a real row before it is used,
 * even though the classifier was never asked to produce one — the UI can send
 * an id the user picked, and a stale page could send one that has since been
 * deleted. An unresolvable id is a 400, never a silent skip.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const capture = await getCapture(id);
    if (!capture) throw new ValidationError(`No capture with id ${id}`);
    if (capture.status !== "pending_review") {
      throw new ValidationError("This capture has already been committed.");
    }

    const body = await readJson<CommitBody>(req);
    const created = {
      companies: 0, contacts: 0, tasks: 0,
      stageChanges: 0, applications: 0, touches: 0,
    };
    const skipped: string[] = [];

    // 1. New companies first — contacts and tasks may reference them.
    const newCompanyIds = new Map<string, string>();
    for (const rawName of body.companies_to_create ?? []) {
      const name = rawName?.trim();
      if (!name) continue;
      const company = await ensureCompany({ name, source: "ai_capture" });
      newCompanyIds.set(name.toLowerCase(), company.id);
      created.companies += 1;
    }

    // 2. Every application the note reported submitting. A note routinely
    //    names more than one role at the same employer; committing only the
    //    first was the original bug here.
    //
    //    Runs after companies so one ticked in this same request is available,
    //    and dedupes again rather than trusting the check that ran at
    //    classification time — the two are separated by however long the person
    //    spent reading this dialog, and a duplicate created in between would
    //    otherwise land silently. The key set is updated as we go, so two
    //    identical rows inside one submission cannot both be written.
    const existingApps = await existingApplicationKeys();

    for (const appDraft of body.applications_to_create ?? []) {
      const companyName = appDraft.company_name?.trim();
      const roleTitle = appDraft.role_title?.trim();
      if (!companyName || !roleTitle) continue;

      const key = dedupeKey(companyName, roleTitle);
      if (existingApps.has(key)) {
        skipped.push(`${companyName} — ${roleTitle}`);
        continue;
      }

      // An application cannot exist without an employer, so ticking the role
      // implies the company even when its own box was left unticked.
      let companyId = nullable(appDraft.company_id);
      if (companyId && !(await companyExists(companyId))) companyId = null;
      companyId ??= newCompanyIds.get(companyName.toLowerCase()) ?? null;

      if (!companyId) {
        const already = await findCompanyByName(companyName);
        const company = already ?? (await ensureCompany({
          name: companyName,
          source: "ai_capture",
        }));
        if (!already) created.companies += 1;
        companyId = company.id;
        newCompanyIds.set(companyName.toLowerCase(), companyId);
      }

      const stage = (optionalOneOf(appDraft.stage, STAGES, "stage") as Stage | null) ?? "applied";
      const researching = stage === "researching";
      await createApplication({
        company_id: companyId,
        role_title: roleTitle,
        lane: (optionalOneOf(appDraft.lane, LANES, "lane") as Lane | null) ?? "primary",
        stage,
        kind: optionalOneOf(appDraft.kind, APPLICATION_KINDS, "kind") ?? "job",
        // A deadline and reminder only mean something before you apply. For a
        // role logged as already sent they are dropped rather than left to put
        // a stale reminder on the calendar.
        deadline: researching ? civilOrNull(appDraft.deadline) : null,
        ...(researching && appDraft.remind_on !== undefined
          ? { remind_on: civilOrNull(appDraft.remind_on) }
          : {}),
        job_posting_url: nullable(appDraft.job_posting_url),
        source: "ai_capture",
      });
      existingApps.set(key, { id: "just-created", stage: null });
      created.applications += 1;
    }

    // 3. Contacts.
    for (const draft of body.contacts_to_create ?? []) {
      const name = draft.name?.trim();
      if (!name) continue;

      let companyId = nullable(draft.company_id);
      if (companyId && !(await companyExists(companyId))) {
        // Might be a company created moments ago in this same request.
        companyId = newCompanyIds.get(companyId.toLowerCase()) ?? null;
      }

      await createContact({
        name,
        company_id: companyId,
        role: nullable(draft.role),
        relationship_type:
          (optionalOneOf(
            draft.relationship_type, RELATIONSHIP_TYPES, "relationship_type",
          ) as RelationshipType | null) ?? "other",
      });
      created.contacts += 1;
    }

    // 3b. Conversations that already happened.
    //
    //     Runs after contacts so a person ticked for creation in this same
    //     request is found rather than duplicated, and resolves by name before
    //     creating so the two paths cannot both make the same row. Logging a
    //     touch for someone new creates them — you cannot have spoken to a
    //     person who does not exist, and making that two steps would be busywork.
    for (const draft of body.contact_touches ?? []) {
      const name = draft.contact_name?.trim();
      if (!name) continue;

      let contactId = nullable(draft.contact_id);
      if (contactId && !(await contactExists(contactId))) contactId = null;

      if (!contactId) {
        const existing = await findContactByName(name);
        if (existing) {
          contactId = existing.id;
        } else {
          let companyId: string | null = null;
          const companyName = nullable(draft.company_name);
          if (companyName) {
            companyId =
              newCompanyIds.get(companyName.toLowerCase()) ??
              (await findCompanyByName(companyName))?.id ??
              null;
            if (!companyId) {
              const company = await ensureCompany({ name: companyName, source: "ai_capture" });
              companyId = company.id;
              newCompanyIds.set(companyName.toLowerCase(), companyId);
              created.companies += 1;
            }
          }

          const contact = await createContact({
            name,
            company_id: companyId,
            role: nullable(draft.role),
            relationship_type:
              (optionalOneOf(
                draft.relationship_type, RELATIONSHIP_TYPES, "relationship_type",
              ) as RelationshipType | null) ?? "other",
          });
          contactId = contact.id;
          created.contacts += 1;
        }
      }

      // A follow-up lands at the start of that local day, so "chase in 5 days"
      // is a date you can see rather than a time five days from this minute.
      const days = Number(draft.follow_up_in_days);
      const followUp =
        Number.isFinite(days) && days > 0
          ? startOfDayInstant(addDays(today(), Math.round(days))).toISOString()
          : null;

      await logContactTouch({
        contact_id: contactId,
        note: nullable(draft.note),
        next_follow_up_at: followUp,
      });
      created.touches += 1;
    }

    // 4. Every task that was accepted. A note routinely carries more than one
    //    action; committing only the first was the original bug here.
    for (const draft of body.tasks ?? []) {
      if (!draft.title?.trim()) continue;

      const companyId = nullable(draft.company_id);
      if (companyId && !(await companyExists(companyId))) {
        throw new ValidationError(`Task references a company that no longer exists (${companyId})`);
      }
      const applicationId = nullable(draft.application_id);
      if (applicationId && !(await getApplication(applicationId))) {
        throw new ValidationError(
          `Task references an application that no longer exists (${applicationId})`,
        );
      }

      await createTask({
        title: draft.title.trim(),
        task_type:
          (optionalOneOf(draft.task_type, TASK_TYPES, "task_type") as TaskType | null) ?? "other",
        lane: optionalOneOf(draft.lane, LANES, "lane") as Lane | null,
        due_date: nullable(draft.due_date),
        company_id: companyId,
        application_id: applicationId,
        source: "ai_capture",
        source_capture_id: capture.id,
      });
      created.tasks += 1;
    }

    // 5. The stage changes that were accepted. Every one is resolved and
    //    checked before any is applied, so a stale id cannot leave the note
    //    half-committed. updateApplication applies the applied_date /
    //    resume_passed rules and writes its own memory entry per move.
    const moves: { id: string; to: Stage }[] = [];
    for (const change of body.stage_changes ?? []) {
      if (!change?.application_id) continue;
      const application = await getApplication(change.application_id);
      if (!application) {
        throw new ValidationError(
          `Stage change references an application that no longer exists ` +
            `(${change.application_id})`,
        );
      }
      const toStage = optionalOneOf(change.to_stage, STAGES, "to_stage") as Stage | null;
      if (!toStage) throw new ValidationError("Stage change is missing a target stage.");
      if (!moves.some((m) => m.id === application.id)) moves.push({ id: application.id, to: toStage });
    }
    for (const move of moves) {
      await updateApplication(move.id, { stage: move.to });
      created.stageChanges += 1;
    }

    // 6. The note itself goes into memory_log so Brain can find it later.
    const summary = body.summary?.trim() || capture.raw_text?.trim();
    if (summary) {
      await appendMemory({
        source_type: "capture",
        source_id: capture.id,
        text: summary,
        occurred_at: capture.created_at,
      });
    }

    await settleCapture(
      capture.id,
      body.corrected ? "corrected" : "confirmed",
      (capture.classification as CaptureClassification | null) ?? undefined,
    );

    return ok({ capture_id: capture.id, created, skipped });
  } catch (err) {
    return handleThrown("capture.confirm", err);
  }
}
