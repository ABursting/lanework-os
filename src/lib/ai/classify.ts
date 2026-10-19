import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic } from "./client";
import { listCompanyNames } from "@/lib/db/companies";
import { listContactNames } from "@/lib/db/contacts";
import { dedupeKey, normalizeName, listApplications } from "@/lib/db/applications";
import { findPossibleMatch } from "@/lib/roleMatch";
import { today } from "@/lib/time";
import { APP_TIMEZONE } from "@/lib/constants";
import { civilOrNull } from "@/lib/reminders";
import { APPLICATION_KINDS, RELATIONSHIP_TYPES, STAGES, TASK_TYPES, LANES } from "@/lib/types";
import type {
  ApplicationRow,
  ApplicationKind, CaptureClassification, Lane, MatchedEntity, RelationshipType, Stage,
  SuggestedApplication, SuggestedContactTouch, SuggestedStageChange, SuggestedTask,
} from "@/lib/types";

/**
 * The text-capture classifier.
 *
 * Two rules shape everything here.
 *
 * 1. The model is never asked for a database id. It gets the list of real
 *    company and contact names as context and answers with NAMES ONLY. Ids are
 *    resolved afterwards, server-side, by looking those names up. A model
 *    cannot fabricate an id it was never asked to produce.
 * 2. Even the ids it could have echoed back are re-checked against real rows
 *    before anything is written. Anything that does not resolve comes back
 *    is_new with a null id, and the confirm step shows it as a new entity for
 *    a human to approve.
 *
 * Nothing in this file writes to the CRM. It returns a proposal.
 */

const MatchSchema = z.object({
  matched_name: z
    .string()
    .describe("The company or person name exactly as it appears in the note."),
  known: z
    .boolean()
    .describe(
      "True only if this name appears in the provided list of existing records. " +
        "False if it is new or you are unsure.",
    ),
});

const ClassificationSchema = z.object({
  summary: z.string().describe("One sentence, past tense, third person."),
  category: z.enum([
    "task", "company_update", "contact_update",
    "interview_note", "application_status_change", "new_application", "reflection",
  ]),
  matched_companies: z.array(MatchSchema),
  matched_contacts: z.array(MatchSchema),
  suggested_tasks: z
    .array(
      z.object({
        title: z.string(),
        task_type: z.enum(TASK_TYPES as [string, ...string[]]),
        lane: z.enum(["primary", "secondary", "peripheral", "none"]),
        due_date: z
          .string()
          .describe("YYYY-MM-DD, or the empty string if the note gives no date."),
      }),
    )
    .describe(
      "Every concrete next action the note implies — one entry each. Empty " +
        "array if the note only records what happened.",
    ),
  suggested_stage_changes: z
    .array(
      z.object({
        company_name: z.string(),
        role_title: z.string().describe("Empty string if the note does not name a role."),
        to_stage: z.enum(STAGES as [string, ...string[]]),
      }),
    )
    .describe("One entry per real pipeline movement the note reports. Empty array if none."),
  suggested_contact_touches: z
    .array(
      z.object({
        contact_name: z.string(),
        company_name: z.string().describe("Empty string if the note names none."),
        role: z.string().describe("Their job title, or the empty string."),
        relationship_type: z.enum([
          "recruiter", "alum", "referral", "hiring_manager", "peer", "other", "unknown",
        ]),
        note: z
          .string()
          .describe("What happened, one line, past tense. This is what gets stored."),
        follow_up_in_days: z
          .number()
          .describe("Days until you should chase them. 0 if the note implies none."),
      }),
    )
    .describe(
      "One entry per person the note says was ALREADY contacted or spoken to. " +
        "Empty array if the note only describes people to contact later.",
    ),
  suggested_applications: z
    .array(
      z.object({
        company_name: z.string(),
        role_title: z.string(),
        lane: z.enum(["primary", "secondary", "peripheral", "none"]),
        stage: z.enum(STAGES as [string, ...string[]]),
        kind: z.enum(["job", "grad_school"]),
        deadline: z
          .string()
          .describe("YYYY-MM-DD due date the note gives, or the empty string."),
        remind_on: z
          .string()
          .describe("YYYY-MM-DD the note asks to be reminded on, or the empty string."),
        remind_days_before: z
          .number()
          .describe("Days before the deadline the note asks to be reminded. 0 if it does not say."),
      }),
    )
    .describe(
      "One entry for every role the note reports submitting, or asks to track " +
        "and be reminded to apply to. Empty array if it names none.",
    ),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You turn a job-seeker's raw note into a structured proposal for their recruiting CRM.

You are given the complete list of companies and contacts that already exist in their CRM. When the note refers to one of them, echo the name back exactly as it appears in that list and set known=true. When it refers to someone or something not in the list, use the name as written in the note and set known=false. Never invent a name that appears in neither the note nor the list.

Rules:
- summary: one sentence, past tense, third person, no preamble.
- suggested_contact_touches: one entry per person the note says has ALREADY been contacted or spoken to — outreach sent, a message written, a coffee chat had, a reply received. "I reached out to three people today" is three touches, NOT three tasks. "I need to reach out to three people" is three tasks, NOT touches. The test is tense: something that happened is a touch; something still to do is a task. Never produce both for the same interaction.
- note on a touch: one line, past tense, in the operator's own terms ("Sent a cold intro about the AI Agent Builder role"). This is stored and searched later, so keep the detail that would help them remember the conversation.
- follow_up_in_days: only when the note implies waiting on a reply or names a time ("follow up next week" = 7). 0 when it does not.
- suggested_tasks: one entry for EVERY concrete next action the note implies, in the order they appear. A note listing three things to do produces three entries — never collapse them into one, and never stop after the first. A note that merely records what happened produces an empty array. Use the empty string for due_date when no date is stated or clearly implied.
- suggested_stage_changes: one entry for EVERY role the note reports movement on that ALREADY appears in OPEN APPLICATIONS (a screen passed, an interview scheduled, a rejection, an offer — or a role listed as researching now being submitted, which is a move to "applied"). "Rejected from X and got an interview at Y" is two entries — never stop after the first. Do not infer a stage change from enthusiasm or intent.
- suggested_applications: one entry for EVERY role the note says was SUBMITTED to a named company ("applied to X", "sent in my application for Y"). A note naming two roles at the same company produces TWO entries — one per role — never one entry covering both, and never just the first. Answer from what the note says: do not check whether a role is already in OPEN APPLICATIONS, and do not omit one because you think it is already tracked. That check runs after you answer.
- If the note instead reports PROGRESS on a role — a screen, an interview, a rejection, an offer — rather than the submission itself: use suggested_stage_changes when that role appears in OPEN APPLICATIONS, and suggested_applications when it does not, with stage set to where the note leaves it ("interviewing" for a screen or interview, "rejected" for a rejection).
- A role the note wants to TRACK or be REMINDED to apply to — "remind me to apply to the analyst role at Rhodium, due Oct 15", "want to apply to Stanford's MS in Energy by December 1", "add the PM role at Notion to my list" — is a suggested_applications entry with stage "researching". It is not a task, and never both. Use the same rule for several roles in one note: one entry each.
- deadline on a suggested application: the due date the note gives, as YYYY-MM-DD, resolving a date with no year to its next occurrence after today. Empty string when none is given. Only meaningful for "researching".
- remind_on / remind_days_before: only when the note itself asks for a particular reminder — "remind me on the 1st" sets remind_on; "remind me two weeks before" sets remind_days_before to 14. Otherwise the empty string and 0; the person picks a reminder when they confirm.
- kind: "grad_school" for a graduate degree program (a master's, PhD, MBA, law or medical school); "job" for everything else, including internships and fellowships at employers.
- For a grad school program, company_name is the university and role_title is the program.
- Intent without a named role is still a task. "I should apply to Figma" names no role: a task.
- lane on a suggested application: "none" unless the note or the CRM context makes it obvious.
- lane: "none" unless the note or the CRM context makes the lane obvious.
- confidence: how sure you are of the overall reading. Below 0.5 means the note was ambiguous.`;

/**
 * The CRM rows the classifier reads names from. Normally loaded from the
 * database; the eval suite (evals/) passes a fictional set instead, so the
 * model can be scored without touching real data.
 */
export interface ClassifierRows {
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; company_id: string | null }[];
  applications: Pick<
    ApplicationRow, "id" | "company_name" | "role_title" | "stage" | "lane" | "kind"
  >[];
}

async function loadRows(): Promise<ClassifierRows> {
  const [companies, contacts, applications] = await Promise.all([
    listCompanyNames(),
    listContactNames(),
    listApplications(),
  ]);
  return { companies, contacts, applications };
}

/** Everything the model needs to recognise an entity, and nothing more. */
function buildContext({ companies, contacts, applications }: ClassifierRows): ClassifierRows & {
  prompt: string;
} {

  const companyLines = companies.length
    ? companies.map((c) => `- ${c.name}`).join("\n")
    : "(none yet)";

  const contactLines = contacts.length
    ? contacts
        .map((c) => {
          const company = companies.find((co) => co.id === c.company_id);
          return `- ${c.name}${company ? ` (${company.name})` : " (independent)"}`;
        })
        .join("\n")
    : "(none yet)";

  const applicationLines = applications.length
    ? applications
        .map(
          (a) =>
            `- ${a.company_name} — ${a.role_title} [${a.stage}, ${a.lane} lane` +
            `${a.kind === "grad_school" ? ", grad school" : ""}]`,
        )
        .join("\n")
    : "(none yet)";

  return {
    companies,
    contacts,
    applications,
    prompt: `Today is ${today()} (${APP_TIMEZONE}).

COMPANIES IN THE CRM:
${companyLines}

CONTACTS IN THE CRM:
${contactLines}

OPEN APPLICATIONS:
${applicationLines}`,
  };
}

/** The shared comparison rule — see normalizeName in db/applications.ts. */
const normalize = normalizeName;

/**
 * Resolve a model-supplied name to a real row.
 *
 * This is the guard the scope calls for. The model's `known` flag is treated
 * as a hint, never as authority — the only thing that makes an entity real
 * here is finding it in the list of rows that were just read from the
 * database. Anything else is is_new with a null id.
 */
function resolveMatches(
  matches: { matched_name: string; known: boolean }[],
  rows: { id: string; name: string }[],
): MatchedEntity[] {
  const byName = new Map(rows.map((r) => [normalize(r.name), r.id]));

  return matches
    .filter((m) => m.matched_name.trim().length > 0)
    .map((m) => {
      const id = byName.get(normalize(m.matched_name)) ?? null;
      if (m.known && !id) {
        // The model claimed a match that does not exist. Downgrade it rather
        // than trusting the claim; this is exactly the fabrication case.
        console.warn(
          `[ai:classify] model claimed "${m.matched_name}" was known; no such row. Treating as new.`,
        );
      }
      return { id, matched_name: m.matched_name.trim(), is_new: id === null };
    });
}

/**
 * Exactly what the model is allowed to say. Names, never ids.
 *
 * Exported so the demo's pre-recorded sample answers can be written in this
 * shape and resolved by the same code path — see resolveClassification below.
 */
export type ParsedClassification = z.infer<typeof ClassificationSchema>;

export async function classifyCapture(
  rawText: string,
  rows?: ClassifierRows,
): Promise<CaptureClassification> {
  const context = buildContext(rows ?? (await loadRows()));

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    // Classification of a short note is a small task; low effort keeps the
    // capture bar responsive without changing the answer.
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
    messages: [
      { role: "user", content: `${context.prompt}\n\nNOTE:\n${rawText}` },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("The classifier returned nothing that matched the expected shape.");
  }

  return resolveClassification(parsed, context);
}

/**
 * Turn what the model said into what the confirm screen shows.
 *
 * This is where hard rule 5 lives: the model answers with names, and every id
 * on the way out of here — the company a role belongs to, the contact a
 * conversation was with, the application a stage change moves — is looked up
 * against the rows that actually exist. Nothing the model says is taken as an
 * identifier.
 *
 * Split out of classifyCapture on 2026-10-05 because the demo's pre-recorded
 * sample answers were skipping it. They went straight to the confirm screen
 * with every id null, so confirming "applied to Arcadia Climate" would have
 * created a second Arcadia Climate beside the one already on the board. The
 * recorded answers now take the same route as a live one; only the model call
 * is skipped.
 */
export function resolveClassification(
  parsed: ParsedClassification,
  context: ClassifierRows,
): CaptureClassification {
  const matched_companies = resolveMatches(parsed.matched_companies, context.companies);
  const matched_contacts = resolveMatches(parsed.matched_contacts, context.contacts);

  const suggested_tasks: SuggestedTask[] = (parsed.suggested_tasks ?? [])
    .filter((t) => t.title?.trim())
    .map((t) => ({
      title: t.title.trim(),
      task_type: (TASK_TYPES as string[]).includes(t.task_type)
        ? (t.task_type as SuggestedTask["task_type"])
        : "other",
      lane: (LANES as string[]).includes(t.lane) ? (t.lane as SuggestedTask["lane"]) : null,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
    }));

  /**
   * A newly submitted role, resolved the same way everything else here is:
   * the company by name, the role by the same dedupe key the screenshot path
   * uses. The model is asked for neither id, and a role that turns out to be
   * tracked already comes back flagged rather than silently logged twice.
   */
  /**
   * Resolve each touch to a real contact by name. The model is never asked for
   * an id — same rule as everywhere else here — so a name that matches nothing
   * comes back with contact_id null and the confirm step offers to create the
   * person along with the touch.
   */
  const suggested_contact_touches: SuggestedContactTouch[] = (
    parsed.suggested_contact_touches ?? []
  )
    .filter((t) => t.contact_name?.trim())
    .map((t) => {
      const name = t.contact_name.trim();
      const existing = context.contacts.find((c) => normalize(c.name) === normalize(name));
      const rel = t.relationship_type;
      return {
        contact_id: existing?.id ?? null,
        contact_name: name,
        company_name: t.company_name?.trim() || null,
        role: t.role?.trim() || null,
        relationship_type: (RELATIONSHIP_TYPES as string[]).includes(rel)
          ? (rel as RelationshipType)
          : null,
        note: t.note?.trim() || "",
        follow_up_in_days:
          Number.isFinite(t.follow_up_in_days) && t.follow_up_in_days > 0
            ? Math.round(t.follow_up_in_days)
            : null,
      };
    });

  const suggested_applications: SuggestedApplication[] = (parsed.suggested_applications ?? [])
    .filter((a) => a.company_name?.trim() && a.role_title?.trim())
    .map((proposed) => {
      const company_name = proposed.company_name.trim();
      const role_title = proposed.role_title.trim();
      const duplicate = context.applications.find(
        (a) => dedupeKey(a.company_name, a.role_title) === dedupeKey(company_name, role_title),
      );
      const company = context.companies.find(
        (c) => normalize(c.name) === normalize(company_name),
      );

      const lead = Number(proposed.remind_days_before);
      return {
        company_name,
        role_title,
        lane: (LANES as string[]).includes(proposed.lane) ? (proposed.lane as Lane) : null,
        stage: ((STAGES as string[]).includes(proposed.stage)
          ? proposed.stage
          : "applied") as Stage,
        kind: ((APPLICATION_KINDS as string[]).includes(proposed.kind)
          ? proposed.kind
          : "job") as ApplicationKind,
        deadline: civilOrNull(proposed.deadline),
        remind_on: civilOrNull(proposed.remind_on),
        remind_days_before: Number.isFinite(lead) && lead > 0 ? Math.round(lead) : null,
        existing_company_id: company?.id ?? null,
        duplicate_of_application_id: duplicate?.id ?? null,
        // Close but not certain — shown on the confirm screen as a question.
        possible_match: duplicate
          ? null
          : findPossibleMatch(company_name, role_title, context.applications),
      };
    });

  /**
   * Roles being logged for the first time. A proposed stage change for one of
   * these would ask the person to tick the same fact twice — the new row
   * already carries its stage.
   */
  const newRoles = suggested_applications.filter((a) => !a.duplicate_of_application_id);

  /** True when the proposed move is for the very role being logged as new. */
  function coveredByNewRole(company_name: string, role_title: string | null): boolean {
    return newRoles.some((newRole) =>
      role_title?.trim()
        ? dedupeKey(company_name, role_title) ===
          dedupeKey(newRole.company_name, newRole.role_title)
        : normalize(company_name) === normalize(newRole.company_name),
    );
  }

  const suggested_stage_changes: SuggestedStageChange[] = [];
  /** One move per application — the model naming a role twice is one move. */
  const alreadyMoving = (applicationId: string | null) =>
    applicationId !== null &&
    suggested_stage_changes.some((m) => m.application_id === applicationId);

  for (const move of parsed.suggested_stage_changes ?? []) {
    if (!move.company_name?.trim() || coveredByNewRole(move.company_name, move.role_title)) {
      continue;
    }
    const { company_name, role_title, to_stage } = move;
    // Attach it to a real application if one matches; otherwise leave the id
    // null and let the confirm step ask which application was meant.
    const candidates = context.applications.filter(
      (a) => normalize(a.company_name) === normalize(company_name),
    );
    const exact = role_title
      ? candidates.find((a) => normalize(a.role_title) === normalize(role_title))
      : undefined;
    const application = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (alreadyMoving(application?.id ?? null)) continue;

    suggested_stage_changes.push({
      application_id: application?.id ?? null,
      company_name: company_name.trim(),
      role_title: role_title?.trim() || null,
      to_stage: ((STAGES as string[]).includes(to_stage) ? to_stage : "applied") as Stage,
    });
  }

  /**
   * "Applied to the Notion PM role" when that role is already sitting in
   * Researching is a move, not a new role — but the model is told to report
   * submissions without checking what is tracked, so it arrives as a duplicate
   * application. Turn every such duplicate into the stage change it means,
   * unless that application is already being moved.
   */
  for (const proposed of suggested_applications) {
    if (!proposed.duplicate_of_application_id || proposed.stage === "researching") continue;
    const tracked = context.applications.find(
      (a) => a.id === proposed.duplicate_of_application_id,
    );
    if (tracked?.stage === "researching" && !alreadyMoving(tracked.id)) {
      suggested_stage_changes.push({
        application_id: tracked.id,
        company_name: tracked.company_name,
        role_title: tracked.role_title,
        to_stage: proposed.stage,
      });
    }
  }

  return {
    summary: parsed.summary.trim(),
    category: parsed.category,
    matched_companies,
    matched_contacts,
    suggested_tasks,
    suggested_stage_changes,
    suggested_applications,
    suggested_contact_touches,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
  };
}

/**
 * Resolve a pre-recorded answer against the live rows.
 *
 * The demo's sample notes come with the model's answer already written down,
 * so clicking one costs nothing and returns instantly — but the resolution
 * still has to happen against whatever is in the demo database right now,
 * because visitors change it and it is rebuilt every night.
 */
export async function resolveRecorded(
  parsed: ParsedClassification,
  rows?: ClassifierRows,
): Promise<CaptureClassification> {
  return resolveClassification(parsed, rows ?? (await loadRows()));
}
