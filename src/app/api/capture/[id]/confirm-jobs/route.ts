import { getCapture, settleCapture } from "@/lib/db/captures";
import { ensureCompany } from "@/lib/db/companies";
import {
  createApplication, dedupeKey, existingApplicationKeys, getApplication, updateApplication,
} from "@/lib/db/applications";
import { appendMemory } from "@/lib/db/memory";
import { civilOrNull } from "@/lib/reminders";
import { toCivilDate } from "@/lib/time";
import { STAGE_LABEL } from "@/lib/display";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson,
} from "@/lib/api";
import { LANES, type Lane, type Stage } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

interface JobDraft {
  company_name: string;
  role_title: string;
  lane?: string;
  source_platform?: string | null;
  location?: string | null;
  /** Researching only: the listing's deadline, as confirmed. */
  deadline?: string | null;
  /** Researching only: the reminder date the screen worked out or you typed. */
  remind_on?: string | null;
  /** True when that reminder came from the posting date, not a deadline. */
  remind_estimated?: boolean;
  /** "Posted 3 weeks ago", carried into the role's notes. */
  posted_days_ago?: number | null;
  /** The posting's address, if you pasted one on the confirm screen. */
  job_posting_url?: string | null;
  /**
   * A tracked role whose title was close but not the same, which you said on
   * the confirm screen is this role. Sent only to move it on to Applied.
   */
  same_as_application_id?: string | null;
}

/**
 * What the screenshot shows — chosen by the person, never guessed.
 *   applied      a job platform's Applied tab: these were sent.
 *   researching  saved jobs or search results: these are to apply to.
 */
const MODES = ["applied", "researching"] as const;
type Mode = (typeof MODES)[number];

/**
 * Commit the job listings a human kept.
 *
 * The confirm screen will not send without a mode, and this route refuses one
 * that arrives without it too — the two kinds of screenshot look alike to a
 * model and mean opposite things to the pipeline.
 *
 * In `applied` mode, a listing that is already tracked in Researching is moved
 * on to Applied rather than skipped: that is exactly what happened to it.
 * Anything else already tracked is skipped.
 *
 * A near-match you confirmed as the same role arrives with its id. That id
 * came through the browser, so the row is looked up before anything moves.
 *
 * Dedupe runs again here rather than trusting the check that ran at extraction
 * time — the two are separated by however long the person spent reading the
 * list, and a duplicate created in between is silent otherwise.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const capture = await getCapture(id);
    if (!capture) throw new ValidationError(`No capture with id ${id}`);
    if (capture.status !== "pending_review") {
      throw new ValidationError("This capture has already been committed.");
    }

    const body = await readJson<{ jobs?: JobDraft[]; corrected?: boolean; mode?: string }>(req);
    const mode = optionalOneOf(body.mode, MODES, "mode") as Mode | null;
    if (!mode) {
      throw new ValidationError(
        "Choose whether these roles are already applied to or still to apply to.",
      );
    }
    const stage: Stage = mode;

    const drafts = (body.jobs ?? []).filter(
      (j) => j.company_name?.trim() && j.role_title?.trim(),
    );

    const existing = await existingApplicationKeys();
    const created: string[] = [];
    const moved: string[] = [];
    const skipped: string[] = [];

    for (const draft of drafts) {
      const companyName = draft.company_name.trim();
      const roleTitle = draft.role_title.trim();
      const label = `${companyName} — ${roleTitle}`;
      const key = dedupeKey(companyName, roleTitle);
      let tracked = existing.get(key);

      const sameAs = nullable(draft.same_as_application_id);
      if (!tracked && sameAs) {
        const row = await getApplication(sameAs);
        if (!row) {
          throw new ValidationError(
            `${label}: the role you matched it to no longer exists. Reopen the capture.`,
          );
        }
        tracked = { id: row.id, stage: row.stage };
      }

      if (tracked) {
        if (mode === "applied" && tracked.stage === "researching") {
          await updateApplication(tracked.id, { stage: "applied" });
          existing.set(key, { id: tracked.id, stage: "applied" });
          moved.push(label);
        } else {
          skipped.push(label);
        }
        continue;
      }

      const company = await ensureCompany({
        name: companyName,
        source: "screenshot_import",
      });

      const notes = [
        draft.location ? `Location: ${draft.location.trim()}` : null,
        mode === "researching" && Number.isFinite(draft.posted_days_ago)
          ? `Posted ${draft.posted_days_ago} day${draft.posted_days_ago === 1 ? "" : "s"} ` +
            `before ${toCivilDate(new Date(capture.created_at))}`
          : null,
      ].filter(Boolean);

      await createApplication({
        company_id: company.id,
        role_title: roleTitle,
        lane: (optionalOneOf(draft.lane, LANES, "lane") as Lane | null) ?? "primary",
        stage,
        source: "screenshot_import",
        source_platform: nullable(draft.source_platform),
        job_posting_url: nullable(draft.job_posting_url),
        notes: notes.length > 0 ? notes.join("\n") : null,
        ...(mode === "researching"
          ? {
              deadline: civilOrNull(draft.deadline),
              remind_on: civilOrNull(draft.remind_on),
              remind_estimated: Boolean(draft.remind_estimated),
            }
          : {}),
      });

      existing.set(key, { id: "just-created", stage: null });
      created.push(label);
    }

    // Named for the stage the roles actually landed in. Until Sep 15 this
    // said "to Researching" while importing to Applied — every screenshot
    // import from Aug 31 on wrote a Brain entry naming the wrong stage.
    const parts: string[] = [];
    if (created.length > 0) {
      parts.push(
        `added ${created.length} role${created.length === 1 ? "" : "s"} to ` +
          `${STAGE_LABEL[stage]} — ${created.join("; ")}`,
      );
    }
    if (moved.length > 0) {
      parts.push(
        `moved ${moved.length} from Researching to Applied — ${moved.join("; ")}`,
      );
    }
    if (parts.length > 0) {
      await appendMemory({
        source_type: "capture",
        source_id: capture.id,
        text: `Screenshot import: ${parts.join(". ")}.`,
        occurred_at: capture.created_at,
      });
    }

    await settleCapture(capture.id, body.corrected ? "corrected" : "confirmed");
    return ok({ capture_id: capture.id, created, moved, skipped });
  } catch (err) {
    return handleThrown("capture.confirmJobs", err);
  }
}
