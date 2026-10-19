"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { Empty } from "@/components/ui/Empty";
import { CompressWindows } from "./CompressWindows";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { STAGE_LABEL, TASK_TYPE_LABEL, laneColor } from "@/lib/display";
import { WINDOW_KEYS, taskAge } from "@/lib/compress";
import { reminderState } from "@/lib/reminders";
import {
  addDays, daysBetween, daysSince, formatShortDate, toCivilDate, today,
} from "@/lib/time";
import type { ApplicationRow, ContactRow, TaskRow, UserSettings } from "@/lib/types";

/** How long a Snooze pushes an ignored reminder, and how far a Push dates a task. */
const SNOOZE_DAYS = 3;
const PUSH_DAYS = 7;

/**
 * Compress — the deliberate cull.
 *
 * Four sections, each a short list with a decision per row:
 *   Reminders ignored   Researching roles whose reminder to apply came and went
 *   Stale tasks         open tasks past their due date, or — with no due
 *                       date — left open since they were created
 *   Applications quiet  live applications nothing has touched
 *   Contacts quiet      people gone quiet, or a follow-up date that has passed
 *
 * How old something has to be before it shows is set per section by the
 * Windows sliders at the top. The page holds every candidate and filters here
 * in the browser, so a slider re-filters instantly. Terminal-stage
 * applications never appear — a rejection is not something to revive.
 */
export function CompressList({
  applications,
  contacts,
  tasks,
  settings,
  week,
}: {
  applications: ApplicationRow[];
  contacts: ContactRow[];
  tasks: TaskRow[];
  settings: UserSettings;
  /** Job applications sent this week, against the weekly goal if one is set. */
  week: { sent: number; target: number | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const report = useReportError();
  const now = today();

  // ── windows ──────────────────────────────────────────────────────────────
  // The slider's value wins locally until the server's own settings come back
  // matching it — a refresh already in flight when you dragged must not snap
  // the slider back. Saved a moment after you stop moving.
  const [localWindows, setLocalWindows] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windows = localWindows ?? settings;

  useEffect(() => {
    setLocalWindows((local) =>
      local && WINDOW_KEYS.every((k) => local[k] === settings[k]) ? null : local,
    );
  }, [settings]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function changeWindows(next: UserSettings) {
    setLocalWindows(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.patch("/api/settings", next);
      } catch (err) {
        // Put the sliders back where the saved values are, so what you see is
        // what will be there next visit.
        setLocalWindows(null);
        report("save the Compress windows", err);
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  // ── what each section shows ──────────────────────────────────────────────

  const reminders = applications
    .filter((a) => a.stage === "researching")
    .map((a) => ({ app: a, state: reminderState(a, windows.compress_reminder_days, now) }))
    .filter((r) => r.state === "ignored" || r.state === "missed")
    .sort((a, b) => ((a.app.deadline ?? a.app.remind_on ?? "") < (b.app.deadline ?? b.app.remind_on ?? "") ? -1 : 1));

  // Every open task, dated or not — one window for both. Oldest first.
  const staleTasks = tasks
    .filter((t) => t.status === "open")
    .map((t) => ({ task: t, age: taskAge(t, now) }))
    .filter(({ age }) => age.days >= windows.compress_task_days)
    .sort((a, b) => b.age.days - a.age.days);

  // A Researching role with no dates has nothing to remind about, so it is
  // judged like any other application: by how long since anything happened.
  const quietApplications = applications
    .filter(
      (a) =>
        a.stage !== "researching" || reminderState(a, windows.compress_reminder_days, now) === "undated",
    )
    .filter((a) => (daysSince(a.last_touched_at) ?? 0) >= windows.compress_job_days);

  const nowIso = new Date().toISOString();
  const quietContacts = contacts.filter((c) => {
    if (c.next_follow_up_at) return c.next_follow_up_at < nowIso;
    return (daysSince(c.last_contacted_at ?? c.created_at) ?? 0) >= windows.compress_contact_days;
  });

  // ── acting on a row ──────────────────────────────────────────────────────

  /** `what` names the act, so a failure can say which button you pressed. */
  async function act(id: string, what: string, run: () => Promise<unknown>) {
    setBusy(id);
    try {
      await run();
      router.refresh();
    } catch (err) {
      report(what, err);
    } finally {
      setBusy(null);
    }
  }

  const roleName = (a: ApplicationRow) => `${a.company_name} — ${a.role_title}`;

  return (
    <div className="flex max-w-[1100px] flex-col gap-[14px]">
      <CompressWindows value={windows} onChange={changeWindows} saving={saving} />

      <Section
        title="Reminders Ignored"
        stamp={`${reminders.length} IGNORED · WINDOW ${windows.compress_reminder_days}D`}
        lead={
          <span>
            Applications this week:{" "}
            <strong className="font-medium text-text">
              {week.target === null ? week.sent : `${week.sent} of ${week.target}`}
            </strong>
            {week.target === null ? " (no weekly goal set)" : ""}
            {" · "}
            <strong
              className="font-medium"
              style={{ color: reminders.length > 0 ? "var(--color-danger)" : "var(--color-text)" }}
            >
              {reminders.length}
            </strong>{" "}
            reminder{reminders.length === 1 ? "" : "s"} ignored
          </span>
        }
      >
        {reminders.length === 0 ? (
          <Empty>
            No reminder has been left sitting. Every Researching role is either inside its window
            or has no date yet.
          </Empty>
        ) : (
          reminders.map(({ app, state }) => {
            const missed = state === "missed";
            // Snooze never pushes past the day before the deadline; inside
            // that, there is nothing left to snooze into.
            const snoozeTo = app.deadline
              ? [addDays(now, SNOOZE_DAYS), addDays(app.deadline, -1)].sort()[0]
              : addDays(now, SNOOZE_DAYS);
            const canSnooze = !missed && snoozeTo > now;
            const ignoredFor = app.remind_on ? daysBetween(app.remind_on, now) : 0;
            return (
              <Row
                key={app.id}
                lane={laneColor(app.lane)}
                title={roleName(app)}
                note={
                  missed
                    ? `Deadline passed ${formatShortDate(app.deadline!)}. Still in Researching.`
                    : [
                        app.remind_on
                          ? `Reminder was ${formatShortDate(app.remind_on)}${app.remind_estimated ? " (est.)" : ""}`
                          : null,
                        app.deadline ? `due ${formatShortDate(app.deadline)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                }
                stamp={missed ? "MISSED" : app.remind_on ? `${ignoredFor}D IGNORED` : "DUE SOON"}
                busy={busy === app.id}
                actions={[
                  {
                    label: "Drop",
                    onClick: () =>
                      act(app.id, `drop ${roleName(app)}`, () =>
                        api.patch(`/api/applications/${app.id}`, { stage: "archived" }),
                      ),
                  },
                  ...(canSnooze
                    ? [
                        {
                          label: `Snooze ${daysBetween(now, snoozeTo)}d`,
                          onClick: () =>
                            act(app.id, `snooze the reminder for ${roleName(app)}`, () =>
                              api.patch(`/api/applications/${app.id}`, { remind_on: snoozeTo }),
                            ),
                        },
                      ]
                    : []),
                  {
                    label: "Applied",
                    primary: true,
                    onClick: () =>
                      act(app.id, `move ${roleName(app)} to Applied`, () =>
                        api.patch(`/api/applications/${app.id}`, { stage: "applied" }),
                      ),
                  },
                ]}
              />
            );
          })
        )}
      </Section>

      <Section
        title="Stale Tasks"
        stamp={`${staleTasks.length} STALE · WINDOW ${windows.compress_task_days}D`}
      >
        {staleTasks.length === 0 ? (
          <Empty>
            No open task is {windows.compress_task_days} day
            {windows.compress_task_days === 1 ? "" : "s"} or more past its due date, or
            that long open with no due date.
          </Empty>
        ) : (
          staleTasks.map(({ task, age }) => (
            <Row
              key={task.id}
              lane={laneColor(task.lane)}
              title={task.title}
              note={[
                task.due_date
                  ? `Due ${formatShortDate(task.due_date)}`
                  : `No due date · added ${formatShortDate(toCivilDate(new Date(task.created_at)))}`,
                TASK_TYPE_LABEL[task.task_type],
                task.company_name,
              ]
                .filter(Boolean)
                .join(" · ")}
              stamp={age.since === "due" ? `${age.days}D OVERDUE` : `${age.days}D OPEN`}
              busy={busy === task.id}
              actions={[
                {
                  label: "Delete",
                  confirm: true,
                  onClick: () =>
                    act(task.id, `delete ${task.title}`, () => api.del(`/api/tasks/${task.id}`)),
                },
                {
                  // An undated task has nothing to push, so the same button
                  // gives it a due date a week out instead.
                  label: task.due_date ? `Push ${PUSH_DAYS}d` : `Due in ${PUSH_DAYS}d`,
                  onClick: () =>
                    act(task.id, `push ${task.title}`, () =>
                      api.patch(`/api/tasks/${task.id}`, { due_date: addDays(now, PUSH_DAYS) }),
                    ),
                },
                {
                  label: "Done",
                  primary: true,
                  onClick: () =>
                    act(task.id, `complete ${task.title}`, () =>
                      api.patch(`/api/tasks/${task.id}`, { status: "done" }),
                    ),
                },
              ]}
            />
          ))
        )}
      </Section>

      <Section
        title="Stale Applications"
        stamp={`${quietApplications.length} QUIET · WINDOW ${windows.compress_job_days}D`}
      >
        {quietApplications.length === 0 ? (
          <Empty>Nothing has gone quiet. Every live application was touched inside the window.</Empty>
        ) : (
          quietApplications.map((application) => (
            <Row
              key={application.id}
              lane={laneColor(application.lane)}
              title={roleName(application)}
              note={
                application.stage === "researching"
                  ? "Still in Researching, with no reminder or deadline."
                  : `Still in ${STAGE_LABEL[application.stage]}.`
              }
              stamp={`${daysSince(application.last_touched_at) ?? 0}D QUIET`}
              busy={busy === application.id}
              actions={[
                {
                  label: "Kill",
                  onClick: () =>
                    act(application.id, `archive ${roleName(application)}`, () =>
                      api.patch(`/api/applications/${application.id}`, { stage: "archived" }),
                    ),
                },
                {
                  label: "Revive",
                  primary: true,
                  onClick: () =>
                    act(application.id, `revive ${roleName(application)}`, () =>
                      api.post(`/api/applications/${application.id}/touch`),
                    ),
                },
              ]}
            />
          ))
        )}
      </Section>

      <Section
        title="Stale Contacts"
        stamp={`${quietContacts.length} QUIET · WINDOW ${windows.compress_contact_days}D`}
      >
        {quietContacts.length === 0 ? (
          <Empty>No overdue follow-ups.</Empty>
        ) : (
          quietContacts.map((contact) => {
            const overdue = Boolean(contact.next_follow_up_at && contact.next_follow_up_at < nowIso);
            return (
              <Row
                key={contact.id}
                lane={laneColor(contact.derived_lane)}
                title={contact.name}
                note={
                  overdue
                    ? "Follow-up date has passed."
                    : `No contact since ${
                        contact.last_contacted_at ? "the last note" : "you added them"
                      }.`
                }
                stamp={`${daysSince(contact.last_contacted_at ?? contact.created_at) ?? 0}D QUIET`}
                busy={busy === contact.id}
                actions={[
                  {
                    label: "Let Go",
                    onClick: () =>
                      act(contact.id, `let go of ${contact.name}`, () =>
                        api.patch(`/api/contacts/${contact.id}`, { status: "dormant" }),
                      ),
                  },
                  {
                    label: "Follow Up",
                    primary: true,
                    onClick: () =>
                      act(contact.id, `follow up with ${contact.name}`, () =>
                        api.post(`/api/contacts/${contact.id}/touch`),
                      ),
                  },
                ]}
              />
            );
          })
        )}
      </Section>
    </div>
  );
}

function Section({
  title, stamp, lead, children,
}: {
  title: string;
  stamp: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-[15px]">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
        <h2 className="text-[17px]">{title}</h2>
        <span className="font-mono text-[11px] text-faint">{stamp}</span>
        {lead ? <span className="basis-full text-[12.5px] text-muted">{lead}</span> : null}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </Panel>
  );
}

interface RowAction {
  label: string;
  onClick: () => void;
  /** The action the row is most likely there for. */
  primary?: boolean;
  /** Ask once more before running — for an act that cannot be taken back. */
  confirm?: boolean;
}

function Row({
  lane, title, note, stamp, busy, actions,
}: {
  lane: string;
  title: string;
  note: string;
  stamp: string;
  busy: boolean;
  actions: RowAction[];
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-[14px] gap-y-2 rounded-[10px] px-3 py-[11px]"
      style={{
        background: "color-mix(in oklab, var(--color-text) 3.5%, transparent)",
        border: "1px solid var(--color-edge-soft)",
      }}
    >
      <span className="h-[26px] w-[3px] flex-none rounded-[2px]" style={{ background: lane }} aria-hidden />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="truncate text-[14px]">{title}</div>
        <div className="mt-[2px] truncate text-[12px] text-muted">{note}</div>
      </div>
      <div className="flex-none font-mono text-[11px]" style={{ color: "var(--color-danger)" }}>
        {stamp}
      </div>
      <div className="flex flex-none gap-[7px]">
        {actions.map((action) =>
          action.confirm ? (
            <ConfirmButton key={action.label} action={action} busy={busy} />
          ) : (
            <button
              key={action.label}
              type="button"
              className={`btn ${action.primary ? "btn-primary" : "btn-secondary"} text-[12px]`}
              onClick={action.onClick}
              disabled={busy}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** First click asks "Sure?"; a second runs it. Walking away cancels after five seconds. */
function ConfirmButton({ action, busy }: { action: RowAction; busy: boolean }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setAsking(false), 5_000);
    return () => clearTimeout(id);
  }, [asking]);

  return (
    <button
      type="button"
      className={`btn ${asking ? "btn-danger" : "btn-secondary"} text-[12px]`}
      onClick={() => {
        if (!asking) {
          setAsking(true);
          return;
        }
        setAsking(false);
        action.onClick();
      }}
      disabled={busy}
    >
      {asking ? "Sure?" : action.label}
    </button>
  );
}
