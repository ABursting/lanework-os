"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Field, FieldRow, Select } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Badge";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import {
  KIND_LABEL, LANE_LABEL, RELATIONSHIP_LABEL, STAGE_LABEL, TASK_TYPE_LABEL, humanize,
} from "@/lib/display";
import {
  REMINDER_CHOICES, leadDaysFor, reminderChoiceLabel, reminderForLead,
  type ReminderChoice,
} from "@/lib/reminders";
import { formatShortDate, today } from "@/lib/time";
import type { PossibleMatch } from "@/lib/roleMatch";
import { APPLICATION_KINDS, LANES, RELATIONSHIP_TYPES, STAGES, TASK_TYPES } from "@/lib/types";
import type {
  ApplicationKind, CaptureClassification, Lane, RawCapture, RelationshipType, Stage, TaskType,
} from "@/lib/types";

interface TouchDraft {
  include: boolean;
  contact_id: string | null;
  contact_name: string;
  company_name: string | null;
  role: string | null;
  relationship_type: RelationshipType | null;
  note: string;
  /** "" means no reminder. */
  follow_up_in_days: string;
}

interface TaskDraft {
  include: boolean;
  title: string;
  task_type: TaskType;
  lane: Lane | null;
  due_date: string;
}

interface AppDraft {
  include: boolean;
  company_name: string;
  role_title: string;
  lane: Lane | null;
  stage: Stage;
  kind: ApplicationKind;
  /** Researching only. "" means none. */
  deadline: string;
  /** How far ahead to be reminded; "date" uses remind_date. */
  reminder: ReminderChoice;
  remind_date: string;
  /** The posting's address. "" means none. */
  job_url: string;
  existing_company_id: string | null;
  duplicate: boolean;
  /**
   * A tracked role at the same company with a near-identical title. The row is
   * unticked already, so this is a warning beside it rather than a question
   * that blocks saving.
   */
  possible: PossibleMatch | null;
  /** What the classifier proposed, so an edit invalidates the resolved id. */
  original_company_name: string;
}

/**
 * The reminder a draft will be saved with. Worked out here, from the same
 * rules the server uses, so the date shown under the picker is the date saved.
 */
function draftReminder(draft: AppDraft): string | null {
  if (draft.reminder === "date") return draft.remind_date || null;
  return reminderForLead(draft.deadline || null, leadDaysFor(draft.reminder), today());
}

/** What the classifier heard about a reminder, as a starting choice. */
function initialReminder(
  deadline: string | null | undefined,
  remindOn: string | null | undefined,
  daysBefore: number | null | undefined,
): { reminder: ReminderChoice; remind_date: string } {
  if (remindOn) return { reminder: "date", remind_date: remindOn };
  if (daysBefore === 7 || daysBefore === 14) {
    return { reminder: String(daysBefore) as ReminderChoice, remind_date: "" };
  }
  if (daysBefore && daysBefore > 0) {
    return {
      reminder: "date",
      remind_date: reminderForLead(deadline ?? null, daysBefore, today()),
    };
  }
  return { reminder: "default", remind_date: "" };
}

interface Entities {
  companies: { id: string; name: string }[];
  applications: { id: string; label: string; stage: Stage }[];
}

interface MoveDraft {
  include: boolean;
  application_id: string | null;
  /** Whether the classifier found the application, rather than you picking it. */
  matched: boolean;
  /** How the note named it — shown even before you pick the application. */
  named: string;
  to_stage: Stage;
}

/**
 * The confirm gate.
 *
 * Everything the classifier proposed is shown unchecked-by-default where it
 * would create a row, editable where it would write text, and nothing at all
 * happens until this dialog is submitted. Editing anything marks the capture
 * `corrected` rather than `confirmed`, which is how the raw_captures table
 * stays useful as a record of where the model actually gets things wrong.
 */
export function ConfirmCapture({
  capture,
  classification,
  onDone,
  onCancel,
}: {
  capture: RawCapture;
  classification: CaptureClassification;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [entities, setEntities] = useState<Entities | null>(null);

  const [summary, setSummary] = useState(classification.summary);
  const [newCompanies, setNewCompanies] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      classification.matched_companies.filter((c) => c.is_new).map((c) => [c.matched_name, false]),
    ),
  );
  const [newContacts, setNewContacts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      classification.matched_contacts.filter((c) => c.is_new).map((c) => [c.matched_name, false]),
    ),
  );

  /**
   * One editable draft per proposed task. A note commonly contains several
   * actions, so this is a list — the earlier single-slot version silently
   * dropped everything after the first.
   *
   * `?? []` guards captures classified before the shape became an array.
   */
  const [taskDrafts, setTaskDrafts] = useState<TaskDraft[]>(() =>
    (classification.suggested_tasks ?? []).map((t) => ({
      include: true,
      title: t.title,
      task_type: t.task_type,
      lane: t.lane,
      due_date: t.due_date ?? "",
    })),
  );

  /**
   * One draft per role the note reported submitting. A single note routinely
   * names several — "I applied to the AI PM intern and the PGC PM intern" —
   * and a single slot silently dropped everything after the first.
   *
   * `?? []` guards captures classified before this became a list. Unticked by
   * default like every other row-creating control here: the classifier
   * proposes, the person decides. Ones already in the pipeline stay untickable.
   */
  const [appDrafts, setAppDrafts] = useState<AppDraft[]>(() =>
    (classification.suggested_applications ?? []).map((a) => ({
      include: false,
      company_name: a.company_name,
      role_title: a.role_title,
      lane: a.lane,
      stage: a.stage,
      kind: a.kind ?? "job",
      deadline: a.deadline ?? "",
      ...initialReminder(a.deadline, a.remind_on, a.remind_days_before),
      existing_company_id: a.existing_company_id,
      duplicate: Boolean(a.duplicate_of_application_id),
      possible: a.possible_match ?? null,
      job_url: "",
      original_company_name: a.company_name,
    })),
  );

  const updateApp = (index: number, patch: Partial<AppDraft>) => {
    setTouched(true);
    setAppDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  /**
   * One row per move the note reported. Ticked only when the classifier found
   * the application itself; a move it could not match waits for you to pick.
   */
  const [moveDrafts, setMoveDrafts] = useState<MoveDraft[]>(() =>
    (classification.suggested_stage_changes ?? []).map((m) => ({
      include: Boolean(m.application_id),
      application_id: m.application_id,
      matched: Boolean(m.application_id),
      named: m.role_title ? `${m.company_name} — ${m.role_title}` : m.company_name,
      to_stage: m.to_stage,
    })),
  );
  const updateMove = (index: number, patch: Partial<MoveDraft>) => {
    setTouched(true);
    setMoveDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const [saving, setSaving] = useState(false);
  const report = useReportError();
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<Entities>("/api/entities")
      .then((data) => {
        if (alive) setEntities(data);
      })
      .catch((err) => {
        if (alive) report("load your companies and contacts", err);
      });
    return () => {
      alive = false;
    };
    // `report` is stable, so this still runs exactly once on mount.
  }, [report]);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setTouched(true);
    setter(v);
  };

  /**
   * Conversations the note says already happened. Ticked by default, unlike
   * the row-creating controls above: recording something you did is closer to
   * transcription than to a decision, and the whole point of the capture was
   * to log it.
   */
  const [touchDrafts, setTouchDrafts] = useState<TouchDraft[]>(() =>
    (classification.suggested_contact_touches ?? []).map((t) => ({
      include: true,
      contact_id: t.contact_id,
      contact_name: t.contact_name,
      company_name: t.company_name,
      role: t.role,
      relationship_type: t.relationship_type,
      note: t.note,
      follow_up_in_days: t.follow_up_in_days ? String(t.follow_up_in_days) : "",
    })),
  );

  const updateTouch = (index: number, patch: Partial<TouchDraft>) => {
    setTouched(true);
    setTouchDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const updateTask = (index: number, patch: Partial<TaskDraft>) => {
    setTouched(true);
    setTaskDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  async function commit() {
    setSaving(true);
    try {
      await api.post(`/api/capture/${capture.id}/confirm`, {
        summary,
        corrected: touched,
        companies_to_create: Object.entries(newCompanies)
          .filter(([, on]) => on)
          .map(([name]) => name),
        contacts_to_create: Object.entries(newContacts)
          .filter(([, on]) => on)
          .map(([name]) => ({ name })),
        contact_touches: touchDrafts
          .filter((t) => t.include && t.contact_name.trim())
          .map((t) => ({
            contact_id: t.contact_id,
            contact_name: t.contact_name.trim(),
            company_name: t.company_name,
            role: t.role,
            relationship_type: t.relationship_type,
            note: t.note.trim() || null,
            follow_up_in_days: t.follow_up_in_days ? Number(t.follow_up_in_days) : null,
          })),
        tasks: taskDrafts
          .filter((t) => t.include && t.title.trim())
          .map((t) => ({
            title: t.title,
            task_type: t.task_type,
            lane: t.lane,
            due_date: t.due_date || null,
          })),
        stage_changes: moveDrafts
          .filter((m) => m.include && m.application_id)
          .map((m) => ({ application_id: m.application_id!, to_stage: m.to_stage })),
        applications_to_create: appDrafts
          .filter((a) => a.include && !a.duplicate && a.company_name.trim() && a.role_title.trim())
          .map((a) => ({
            company_name: a.company_name.trim(),
            // Only pass the pre-resolved id while the name still matches it;
            // an edited company name has to be resolved again server-side.
            company_id:
              a.company_name.trim() === a.original_company_name ? a.existing_company_id : null,
            role_title: a.role_title.trim(),
            lane: a.lane,
            stage: a.stage,
            kind: a.kind,
            job_posting_url: a.job_url.trim() || null,
            ...(a.stage === "researching"
              ? { deadline: a.deadline || null, remind_on: draftReminder(a) }
              : {}),
          })),
      });
      router.refresh();
      onDone();
    } catch (err) {
      report("commit this capture", err);
      setSaving(false);
    }
  }

  const known = [
    ...classification.matched_companies.filter((c) => !c.is_new).map((c) => c.matched_name),
    ...classification.matched_contacts.filter((c) => !c.is_new).map((c) => c.matched_name),
  ];
  const unknownCompanies = classification.matched_companies.filter((c) => c.is_new);
  const unknownContacts = classification.matched_contacts.filter((c) => c.is_new);
  const lowConfidence = classification.confidence < 0.5;

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Confirm capture"
      width={620}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Discard
          </button>
          <button type="button" className="btn btn-primary" onClick={commit} disabled={saving}>
            {saving ? "Saving…" : "Commit"}
          </button>
        </>
      }
    >

      <div className="flex flex-wrap items-center gap-2">
        <Chip color="var(--color-accent)">{humanize(classification.category)}</Chip>
        <Chip color={lowConfidence ? "var(--color-warn)" : undefined}>
          {Math.round(classification.confidence * 100)}% confident
        </Chip>
        {known.map((name) => (
          <Chip key={name} color="var(--color-lane-secondary)">
            matched {name}
          </Chip>
        ))}
      </div>

      {lowConfidence ? (
        <p className="m-0 text-[12px] text-warn" style={{ color: "var(--color-warn)" }}>
          The note was ambiguous. Read this over carefully before committing.
        </p>
      ) : null}

      <Field label="Summary" hint="goes into Brain">
        <textarea
          className="input min-h-[64px]"
          value={summary}
          onChange={(e) => edit(setSummary)(e.target.value)}
        />
      </Field>

      {unknownCompanies.length > 0 || unknownContacts.length > 0 ? (
        <div>
          <div className="micro mb-2">New records — nothing is created unless you tick it</div>
          <div className="flex flex-col gap-[6px]">
            {unknownCompanies.map((c) => (
              <label key={c.matched_name} className="flex cursor-pointer items-center gap-[10px] text-[13px]">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  checked={newCompanies[c.matched_name] ?? false}
                  onChange={(e) =>
                    edit(setNewCompanies)({ ...newCompanies, [c.matched_name]: e.target.checked })
                  }
                />
                <span>
                  Create company <strong className="font-medium">{c.matched_name}</strong>
                </span>
              </label>
            ))}
            {unknownContacts.map((c) => (
              <label key={c.matched_name} className="flex cursor-pointer items-center gap-[10px] text-[13px]">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  checked={newContacts[c.matched_name] ?? false}
                  onChange={(e) =>
                    edit(setNewContacts)({ ...newContacts, [c.matched_name]: e.target.checked })
                  }
                />
                <span>
                  Create contact <strong className="font-medium">{c.matched_name}</strong>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {touchDrafts.length > 0 ? (
        <div
          className="rounded-lg p-3"
          style={{
            background: "color-mix(in oklab, var(--color-lane-secondary) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-lane-secondary) 22%, transparent)",
          }}
        >
          {/* Tinted differently from the task block on purpose: these are
              things that already happened, and confusing the two is exactly
              what sent outreach into the task list in the first place. */}
          <div
            className="mb-2 text-[10px] uppercase tracking-[0.09em]"
            style={{ color: "var(--color-lane-secondary)" }}
          >
            {touchDrafts.length === 1
              ? "Conversation logged"
              : `${touchDrafts.length} conversations logged`}
          </div>

          <div className="flex flex-col gap-2">
            {touchDrafts.map((draft, index) => (
              <div
                key={index}
                className="rounded-lg p-[10px]"
                style={{
                  background: draft.include
                    ? "color-mix(in oklab, var(--color-text) 4%, transparent)"
                    : "transparent",
                  border: "1px solid var(--color-edge-soft)",
                  opacity: draft.include ? 1 : 0.5,
                }}
              >
                <label className="flex cursor-pointer items-start gap-[10px] text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-[3px] flex-none accent-[var(--color-accent)]"
                    checked={draft.include}
                    onChange={(e) => updateTouch(index, { include: e.target.checked })}
                  />
                  <span className="min-w-0">
                    <strong className="font-medium">{draft.contact_name}</strong>
                    {draft.role || draft.company_name ? (
                      <span className="text-muted">
                        {" — "}
                        {[draft.role, draft.company_name].filter(Boolean).join(" @ ")}
                      </span>
                    ) : null}
                    {draft.contact_id ? null : (
                      <span className="ml-2 text-[11.5px] text-faint">will be added</span>
                    )}
                  </span>
                </label>

                {draft.include ? (
                  <div className="mt-2 flex flex-col gap-2 pl-[26px]">
                    <Field label="What happened" hint="goes into Brain">
                      <textarea
                        className="input min-h-[54px] text-[13px]"
                        value={draft.note}
                        onChange={(e) => updateTouch(index, { note: e.target.value })}
                        placeholder="Sent a cold intro about the AI Agent Builder role"
                      />
                    </Field>
                    <FieldRow>
                      <Field label="Follow up in" hint="days — blank for none">
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={draft.follow_up_in_days}
                          onChange={(e) =>
                            updateTouch(index, { follow_up_in_days: e.target.value })
                          }
                          placeholder="—"
                        />
                      </Field>
                      {draft.contact_id ? (
                        <div />
                      ) : (
                        <Field label="Relationship">
                          <Select
                            value={draft.relationship_type ?? "other"}
                            onChange={(v) =>
                              updateTouch(index, { relationship_type: v ?? "other" })
                            }
                            options={RELATIONSHIP_TYPES}
                            labels={RELATIONSHIP_LABEL}
                          />
                        </Field>
                      )}
                    </FieldRow>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {taskDrafts.length > 0 ? (
        <div
          className="rounded-lg p-3"
          style={{ background: "color-mix(in oklab, var(--color-text) 4%, transparent)" }}
        >
          <div className="micro mb-2">
            {taskDrafts.length === 1
              ? "Task found"
              : `${taskDrafts.length} tasks found — untick any you don't want`}
          </div>

          <div className="flex flex-col gap-2">
            {taskDrafts.map((draft, index) => (
              <div
                key={index}
                className="rounded-lg p-[10px]"
                style={{
                  background: draft.include
                    ? "color-mix(in oklab, var(--color-accent) 7%, transparent)"
                    : "transparent",
                  border: `1px solid ${
                    draft.include
                      ? "color-mix(in oklab, var(--color-accent) 24%, transparent)"
                      : "var(--color-edge-soft)"
                  }`,
                  opacity: draft.include ? 1 : 0.5,
                }}
              >
                <div className="flex items-center gap-[10px]">
                  <input
                    type="checkbox"
                    className="flex-none accent-[var(--color-accent)]"
                    checked={draft.include}
                    onChange={(e) => updateTask(index, { include: e.target.checked })}
                    aria-label={`Add task: ${draft.title}`}
                  />
                  <input
                    className="input h-auto min-h-0 flex-1 border-0 bg-transparent p-0 text-[13.5px]"
                    value={draft.title}
                    onChange={(e) => updateTask(index, { title: e.target.value })}
                    disabled={!draft.include}
                  />
                </div>

                {draft.include ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 pl-[26px]">
                    <Select
                      value={draft.task_type}
                      onChange={(v) => updateTask(index, { task_type: v ?? "other" })}
                      options={TASK_TYPES}
                      labels={TASK_TYPE_LABEL}
                    />
                    <Select
                      value={draft.lane}
                      onChange={(v) => updateTask(index, { lane: v })}
                      options={LANES}
                      labels={LANE_LABEL}
                      allowEmpty
                      emptyLabel="— no lane —"
                    />
                    <input
                      type="date"
                      className="input"
                      value={draft.due_date}
                      onChange={(e) => updateTask(index, { due_date: e.target.value })}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {appDrafts.length > 0 ? (
        <div
          className="rounded-lg p-3"
          style={{ background: "color-mix(in oklab, var(--color-text) 4%, transparent)" }}
        >
          <div className="micro mb-2">
            {appDrafts.length === 1
              ? "Application found"
              : `${appDrafts.length} applications found — tick the ones to log`}
          </div>

          <div className="flex flex-col gap-2">
            {appDrafts.map((draft, index) => (
              <div
                key={index}
                className="rounded-lg p-[10px]"
                style={{
                  background: draft.include
                    ? "color-mix(in oklab, var(--color-accent) 7%, transparent)"
                    : "transparent",
                  border: `1px solid ${
                    draft.include
                      ? "color-mix(in oklab, var(--color-accent) 24%, transparent)"
                      : "var(--color-edge-soft)"
                  }`,
                  opacity: draft.duplicate ? 0.55 : 1,
                }}
              >
                {draft.duplicate ? (
                  <p className="m-0 text-[12.5px] text-muted">
                    <strong className="font-medium text-dim">
                      {draft.company_name} — {draft.role_title}
                    </strong>{" "}
                    is already in your pipeline, so there is nothing to add.
                  </p>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-start gap-[10px] text-[13px]">
                      <input
                        type="checkbox"
                        className="mt-[3px] flex-none accent-[var(--color-accent)]"
                        checked={draft.include}
                        onChange={(e) => updateApp(index, { include: e.target.checked })}
                      />
                      <span className="min-w-0">
                        {draft.stage === "researching" ? "Track" : "Log"}{" "}
                        <strong className="font-medium">
                          {draft.company_name} — {draft.role_title}
                        </strong>
                        {draft.existing_company_id ? null : (
                          <span className="ml-2 text-[11.5px] text-faint">
                            company will be created
                          </span>
                        )}
                      </span>
                    </label>

                    {draft.possible ? (
                      <p
                        className="m-0 mt-2 pl-[26px] text-[12px]"
                        style={{ color: "var(--color-warn)" }}
                      >
                        Possibly tracked already as{" "}
                        <strong className="font-medium">{draft.possible.role_title}</strong>{" "}
                        ({STAGE_LABEL[draft.possible.stage]}). Tick only if this is a different role.
                      </p>
                    ) : null}

                    {draft.include ? (
                      <div className="mt-3 flex flex-col gap-2 pl-[26px]">
                        <FieldRow>
                          <Field label="Company">
                            <input
                              className="input"
                              value={draft.company_name}
                              onChange={(e) => updateApp(index, { company_name: e.target.value })}
                            />
                          </Field>
                          <Field label="Role">
                            <input
                              className="input"
                              value={draft.role_title}
                              onChange={(e) => updateApp(index, { role_title: e.target.value })}
                            />
                          </Field>
                        </FieldRow>
                        <FieldRow>
                          <Field label="Lane">
                            <Select
                              value={draft.lane}
                              onChange={(v) => updateApp(index, { lane: v })}
                              options={LANES}
                              labels={LANE_LABEL}
                              allowEmpty
                              emptyLabel="— no lane —"
                            />
                          </Field>
                          <Field label="Stage">
                            <Select
                              value={draft.stage}
                              onChange={(v) => updateApp(index, { stage: v ?? "applied" })}
                              options={STAGES}
                              labels={STAGE_LABEL}
                            />
                          </Field>
                        </FieldRow>
                        <FieldRow>
                          <Field
                            label="Type"
                            hint={draft.kind === "grad_school" ? "kept out of job stats" : undefined}
                          >
                            <Select
                              value={draft.kind}
                              onChange={(v) => updateApp(index, { kind: v ?? "job" })}
                              options={APPLICATION_KINDS}
                              labels={KIND_LABEL}
                            />
                          </Field>
                          {draft.stage === "researching" ? (
                            <Field label="Deadline" hint="blank if rolling">
                              <input
                                type="date"
                                className="input"
                                value={draft.deadline}
                                onChange={(e) => updateApp(index, { deadline: e.target.value })}
                              />
                            </Field>
                          ) : (
                            <div />
                          )}
                        </FieldRow>
                        {draft.stage === "researching" ? (
                          <FieldRow>
                            <Field label="Remind me to apply">
                              <Select
                                value={draft.reminder}
                                onChange={(v) => updateApp(index, { reminder: v ?? "default" })}
                                options={REMINDER_CHOICES}
                                labels={
                                  Object.fromEntries(
                                    REMINDER_CHOICES.map((c) => [
                                      c,
                                      reminderChoiceLabel(c, Boolean(draft.deadline)),
                                    ]),
                                  ) as Record<ReminderChoice, string>
                                }
                              />
                            </Field>
                            {draft.reminder === "date" ? (
                              <Field label="On">
                                <input
                                  type="date"
                                  className="input"
                                  value={draft.remind_date}
                                  onChange={(e) => updateApp(index, { remind_date: e.target.value })}
                                />
                              </Field>
                            ) : (
                              <p className="m-0 self-end pb-[9px] text-[12px] text-muted">
                                Reminder on{" "}
                                <strong className="font-medium text-text">
                                  {formatShortDate(draftReminder(draft)!)}
                                </strong>
                              </p>
                            )}
                          </FieldRow>
                        ) : null}
                        <Field label="Job link" hint="optional">
                          <input
                            type="url"
                            className="input"
                            placeholder="https://…"
                            value={draft.job_url}
                            onChange={(e) => updateApp(index, { job_url: e.target.value })}
                          />
                        </Field>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {moveDrafts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {moveDrafts.map((move, index) => (
            <div
              key={index}
              className="rounded-lg p-3"
              style={{ background: "color-mix(in oklab, var(--color-text) 4%, transparent)" }}
            >
              <label className="flex cursor-pointer items-center gap-[10px] text-[13px]">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  checked={move.include}
                  onChange={(e) => updateMove(index, { include: e.target.checked })}
                />
                <span>
                  Move {move.named} to{" "}
                  <strong className="font-medium">{STAGE_LABEL[move.to_stage]}</strong>
                </span>
              </label>
              {move.include ? (
                <div className="mt-3 flex flex-col gap-3">
                  <Field
                    label="Application"
                    hint={move.matched ? undefined : "no exact match — pick one"}
                  >
                    <Select
                      value={move.application_id}
                      onChange={(v) => updateMove(index, { application_id: v })}
                      options={(entities?.applications ?? []).map((a) => a.id)}
                      labels={Object.fromEntries(
                        (entities?.applications ?? []).map((a) => [a.id, a.label]),
                      )}
                      allowEmpty
                      emptyLabel={entities ? "— pick one —" : "loading…"}
                    />
                  </Field>
                  <Field label="New stage">
                    <Select
                      value={move.to_stage}
                      onChange={(v) => updateMove(index, { to_stage: v ?? "applied" })}
                      options={STAGES}
                      labels={STAGE_LABEL}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <details className="text-[12px] text-faint">
        <summary className="cursor-pointer">Original note</summary>
        <p className="m-0 mt-2 whitespace-pre-line text-muted">{capture.raw_text}</p>
      </details>
    </Dialog>
  );
}
