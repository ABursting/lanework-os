"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Select } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Badge";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { LANE_LABEL, STAGE_LABEL } from "@/lib/display";
import { REMINDER_LEAD_DAYS } from "@/lib/constants";
import { estimatedReminderFromPosting, reminderForLead } from "@/lib/reminders";
import { toCivilDate, today } from "@/lib/time";
import type { PossibleMatch } from "@/lib/roleMatch";
import {
  LANES, type Lane, type RawCapture, type ScreenshotClassification, type Stage,
} from "@/lib/types";

/** What the screenshot shows. Null until you say — there is no default. */
type Mode = "applied" | "researching";

interface Draft {
  company_name: string;
  role_title: string;
  location: string | null;
  source_platform: string | null;
  duplicate: boolean;
  duplicate_stage: Stage | null;
  /** A tracked role whose title is close but not the same. */
  possible: PossibleMatch | null;
  /** Your answer to "same role?" — null until you give one. */
  verdict: "same" | "different" | null;
  /** Null follows the default for the chosen mode; true/false is your click. */
  dismissed: boolean | null;
  lane: Lane;
  deadline: string;
  posted_days_ago: number | null;
  /** A reminder date you typed over the worked-out one. */
  remind_override: string | null;
  /** The posting's address. A screenshot rarely shows it, so it starts empty. */
  job_url: string;
}

/**
 * The screenshot confirm checklist.
 *
 * First, a required choice: are these roles you have already applied to (a
 * platform's Applied tab) or roles to apply to (saved jobs, search results)?
 * Nothing is guessed and nothing commits until one is picked — the two look
 * alike in a screenshot and mean opposite things to the pipeline.
 *
 * Everything listed is added unless you dismiss it, because the common case is
 * "yes, all of these". Dismissing is one click and reversible until you commit.
 *
 * To apply: each role lands in Researching with a reminder. One lead time
 * covers the batch — ten days before each deadline unless you change it — and
 * any row's reminder can be typed over. A listing with no deadline but a
 * posting age gets an estimated reminder from the posting date, marked "est.".
 *
 * Already applied: a role already tracked in Researching is moved on to
 * Applied rather than skipped. Other duplicates arrive dismissed and greyed
 * rather than hidden — seeing that a role is already tracked is useful.
 *
 * A near-match — same company, almost the same title, as when one listing is
 * copied from two sites — is neither skipped nor added on its own. The row
 * asks "Same role?" and nothing commits until it is answered. Exact matches
 * are not asked about; that would make the question noise.
 */
export function ConfirmScreenshot({
  capture,
  classification,
  onDone,
  onCancel,
}: {
  capture: RawCapture;
  classification: ScreenshotClassification;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [lead, setLead] = useState(String(REMINDER_LEAD_DAYS));
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    classification.jobs.map((job) => ({
      company_name: job.company_name,
      role_title: job.role_title,
      location: job.location,
      source_platform: job.source_platform,
      duplicate: Boolean(job.duplicate_of_application_id),
      duplicate_stage: job.duplicate_stage ?? null,
      possible: job.possible_match ?? null,
      verdict: null,
      dismissed: null,
      lane: "primary",
      deadline: job.deadline ?? "",
      posted_days_ago: job.posted_days_ago ?? null,
      remind_override: null,
      job_url: "",
    })),
  );
  const [saving, setSaving] = useState(false);
  // Holds the outcome summary ("added 3, skipped 2"), not failures.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();
  const [touched, setTouched] = useState(false);

  const now = today();
  // "Posted 3 weeks ago" was relative to the day the screenshot was read.
  const seenOn = toCivilDate(new Date(capture.created_at));
  const leadDays = Math.max(0, Math.round(Number(lead) || 0));

  const update = (index: number, patch: Partial<Draft>) => {
    setTouched(true);
    setDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  /** Tracked already: an exact match, or a near-match you said is the same role. */
  const isTracked = (d: Draft) => d.duplicate || d.verdict === "same";
  const trackedStage = (d: Draft) =>
    d.duplicate ? d.duplicate_stage : d.verdict === "same" ? (d.possible?.stage ?? null) : null;

  /** A tracked Researching role, in Applied mode, is moved on rather than skipped. */
  const willMove = (d: Draft) =>
    isTracked(d) && mode === "applied" && trackedStage(d) === "researching";

  const isDismissed = (d: Draft) => d.dismissed ?? (isTracked(d) && !willMove(d));

  /** A near-match still waiting for "same role?". A dismissed row needs no answer. */
  const unanswered = (d: Draft) => Boolean(d.possible) && d.verdict === null && d.dismissed !== true;

  function reminderFor(d: Draft): { date: string; estimated: boolean } {
    if (d.remind_override) return { date: d.remind_override, estimated: false };
    if (d.deadline) return { date: reminderForLead(d.deadline, leadDays, now), estimated: false };
    if (d.posted_days_ago !== null) {
      return { date: estimatedReminderFromPosting(d.posted_days_ago, seenOn, now), estimated: true };
    }
    return { date: reminderForLead(null, leadDays, now), estimated: false };
  }

  const keeping = drafts.filter((d) => !isDismissed(d));
  const adding = keeping.filter((d) => !isTracked(d)).length;
  const moving = keeping.filter(willMove).length;
  const duplicates = drafts.filter((d) => d.duplicate).length;
  const toCheck = drafts.filter(unanswered).length;

  async function commit() {
    if (!mode) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ created: string[]; moved: string[]; skipped: string[] }>(
        `/api/capture/${capture.id}/confirm-jobs`,
        {
          mode,
          corrected: touched,
          jobs: keeping.map((d) => {
            const reminder = reminderFor(d);
            return {
              company_name: d.company_name,
              role_title: d.role_title,
              lane: d.lane,
              source_platform: d.source_platform,
              location: d.location,
              job_posting_url: d.job_url.trim() || null,
              // A near-match you said is the same role, moving on to Applied.
              // The server checks the id exists before touching it.
              ...(willMove(d) && !d.duplicate && d.possible
                ? { same_as_application_id: d.possible.application_id }
                : {}),
              ...(mode === "researching"
                ? {
                    deadline: d.deadline || null,
                    remind_on: reminder.date,
                    remind_estimated: reminder.estimated,
                    posted_days_ago: d.posted_days_ago,
                  }
                : {}),
            };
          }),
        },
      );
      router.refresh();
      if (res.skipped.length > 0) {
        setError(
          `Added ${res.created.length}` +
            (res.moved.length > 0 ? `, moved ${res.moved.length} to Applied` : "") +
            `; skipped ${res.skipped.length} already tracked.`,
        );
        setSaving(false);
        return;
      }
      onDone();
    } catch (err) {
      report("add those roles", err);
      setSaving(false);
    }
  }

  const commitLabel = saving
    ? "Saving…"
    : !mode
      ? "Choose Already applied or To apply"
      : toCheck > 0
        ? `Answer ${toCheck} “same role?” question${toCheck === 1 ? "" : "s"}`
        : adding + moving === 0
        ? "Nothing new to add"
        : [
            adding > 0 ? `Add ${adding} to ${mode === "applied" ? "Applied" : "Researching"}` : null,
            moving > 0 ? `Move ${moving} to Applied` : null,
          ]
            .filter(Boolean)
            .join(" · ");

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`${classification.jobs.length} role${classification.jobs.length === 1 ? "" : "s"} found`}
      width={720}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={commit}
            disabled={saving || !mode || toCheck > 0 || adding + moving === 0}
          >
            {commitLabel}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />

      <div
        className="rounded-lg p-3"
        style={{
          border: `1px solid ${
            mode
              ? "var(--color-edge-soft)"
              : "color-mix(in oklab, var(--color-warn) 45%, transparent)"
          }`,
          background: mode ? "transparent" : "color-mix(in oklab, var(--color-warn) 7%, transparent)",
        }}
      >
        <div className="mb-2 text-[12.5px] text-dim">
          These roles are…
          {mode ? null : (
            <span className="ml-2 text-[11.5px]" style={{ color: "var(--color-warn)" }}>
              pick one — nothing is added until you do
            </span>
          )}
        </div>
        <div className="segbar w-full">
          <button
            type="button"
            className="seg-opt flex-1"
            data-active={mode === "applied"}
            onClick={() => setMode("applied")}
          >
            Already applied
          </button>
          <button
            type="button"
            className="seg-opt flex-1"
            data-active={mode === "researching"}
            onClick={() => setMode("researching")}
          >
            To apply
          </button>
        </div>

        {mode === "researching" ? (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-dim">
            Remind me
            <input
              type="number"
              min={0}
              max={90}
              className="input !w-[64px] !py-[3px] text-center"
              value={lead}
              onChange={(e) => {
                setTouched(true);
                setLead(e.target.value);
              }}
            />
            days before each deadline
            <span className="text-[11.5px] text-faint">
              · no deadline shown: 14 days after posting (est.), or {leadDays} days from today
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip color={classification.confidence < 0.5 ? "var(--color-warn)" : undefined}>
          {Math.round(classification.confidence * 100)}% legible
        </Chip>
        {duplicates > 0 ? (
          <Chip color="var(--color-warn)">{duplicates} already tracked</Chip>
        ) : null}
        {toCheck > 0 ? (
          <Chip color="var(--color-warn)">{toCheck} to check</Chip>
        ) : null}
      </div>

      <div className="flex max-h-[46vh] flex-col gap-[6px] overflow-y-auto pr-1">
        {drafts.map((draft, index) => {
          const dismissed = isDismissed(draft);
          const reminder = reminderFor(draft);
          return (
            <div
              key={`${draft.company_name}-${draft.role_title}-${index}`}
              className="rounded-[10px] px-3 py-2 transition-opacity"
              style={{
                background: dismissed
                  ? "transparent"
                  : "color-mix(in oklab, var(--color-accent) 8%, transparent)",
                border: `1px solid ${
                  dismissed
                    ? "var(--color-edge-soft)"
                    : "color-mix(in oklab, var(--color-accent) 26%, transparent)"
                }`,
                opacity: dismissed ? 0.45 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    className="input h-auto min-h-0 border-0 bg-transparent p-0 text-[13.5px]"
                    value={draft.company_name}
                    onChange={(e) => update(index, { company_name: e.target.value })}
                    disabled={dismissed}
                    style={{ textDecoration: dismissed ? "line-through" : "none" }}
                  />
                  <input
                    className="input h-auto min-h-0 border-0 bg-transparent p-0 text-[11.5px] text-muted"
                    value={draft.role_title}
                    onChange={(e) => update(index, { role_title: e.target.value })}
                    disabled={dismissed}
                    style={{ textDecoration: dismissed ? "line-through" : "none" }}
                  />
                </div>

                {draft.location ? (
                  <span className="hidden flex-none font-mono text-[10px] text-faint sm:inline">
                    {draft.location}
                  </span>
                ) : null}
                {willMove(draft) ? (
                  <Chip color="var(--color-accent)">researching → applied</Chip>
                ) : isTracked(draft) ? (
                  <Chip color="var(--color-warn)">tracked</Chip>
                ) : unanswered(draft) ? (
                  <Chip color="var(--color-warn)">possibly tracked</Chip>
                ) : null}

                <div className="w-[124px] flex-none">
                  <Select
                    value={draft.lane}
                    onChange={(v) => update(index, { lane: v ?? "primary" })}
                    options={LANES}
                    labels={LANE_LABEL}
                  />
                </div>

                {dismissed ? (
                  <button
                    type="button"
                    className="btn btn-ghost flex-none !px-2 text-[11.5px]"
                    onClick={() => update(index, { dismissed: false })}
                  >
                    Undo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="grid size-[26px] flex-none place-items-center rounded-md text-[13px] text-faint transition-colors hover:text-[var(--color-danger)]"
                    style={{ border: "1px solid var(--color-edge-strong)" }}
                    onClick={() => update(index, { dismissed: true })}
                    title={`Dismiss ${draft.company_name}`}
                    aria-label={`Dismiss ${draft.company_name} ${draft.role_title}`}
                  >
                    ✕
                  </button>
                )}
              </div>

              {draft.possible && draft.dismissed !== true ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11.5px] text-muted">
                  <span className="min-w-0 flex-1">
                    You already track{" "}
                    <strong className="font-medium text-dim">{draft.possible.role_title}</strong>{" "}
                    ({STAGE_LABEL[draft.possible.stage]}). Same role?
                  </span>
                  <div className="segbar flex-none">
                    <button
                      type="button"
                      className="seg-opt"
                      data-active={draft.verdict === "same"}
                      onClick={() => update(index, { verdict: "same", dismissed: null })}
                    >
                      Same role
                    </button>
                    <button
                      type="button"
                      className="seg-opt"
                      data-active={draft.verdict === "different"}
                      onClick={() => update(index, { verdict: "different", dismissed: null })}
                    >
                      Different role
                    </button>
                  </div>
                </div>
              ) : null}

              {mode === "researching" && !dismissed && !isTracked(draft) ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11.5px] text-muted">
                  <label className="flex items-center gap-[6px]">
                    Deadline
                    <input
                      type="date"
                      className="input !w-auto !py-[2px] text-[12px]"
                      value={draft.deadline}
                      onChange={(e) =>
                        // A new deadline re-derives the reminder unless you typed one.
                        update(index, { deadline: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-[6px]">
                    Remind
                    <input
                      type="date"
                      className="input !w-auto !py-[2px] text-[12px]"
                      value={reminder.date}
                      onChange={(e) => update(index, { remind_override: e.target.value || null })}
                    />
                  </label>
                  {reminder.estimated ? (
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--color-warn)" }}
                      title="No deadline on the listing — worked out from when it was posted"
                    >
                      est.
                    </span>
                  ) : null}
                  {draft.posted_days_ago !== null ? (
                    <span className="font-mono text-[10px] text-faint">
                      POSTED {draft.posted_days_ago === 0 ? "TODAY" : `${draft.posted_days_ago}D AGO`}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {mode && !dismissed && !isTracked(draft) ? (
                <label className="mt-2 flex items-center gap-[6px] text-[11.5px] text-muted">
                  Link
                  <input
                    type="url"
                    className="input !py-[2px] text-[12px]"
                    placeholder="Job posting address (optional)"
                    value={draft.job_url}
                    onChange={(e) => update(index, { job_url: e.target.value })}
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="m-0 text-[11.5px] text-faint">
        {mode === "researching"
          ? "Everything still listed is added to Researching with its reminder, which shows on the Home calendar and comes back in Compress if ignored."
          : mode === "applied"
            ? "Everything still listed is added at Applied. Roles already in Researching move to Applied."
            : "Dismissed rows are ignored."}{" "}
        Companies already in the CRM are reused, not duplicated.
      </p>
    </Dialog>
  );
}
