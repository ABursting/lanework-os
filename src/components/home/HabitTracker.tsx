"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import type { HabitDefinition } from "@/lib/types";

/**
 * The habit grid.
 *
 * Toggling has to feel instant, which means local state runs ahead of the
 * server. The hazard that creates is the one this component is built around:
 * a refresh that was already in flight when you tapped resolves *after* the
 * tap and pushes the old value back down, so the checkbox visibly un-checks
 * itself a second later.
 *
 * The guard is an override map. A locally toggled habit keeps its override
 * until the server's own value agrees with it — a stale payload that still
 * says false is simply ignored. Incoming data for habits you have not touched
 * is applied normally.
 */
export function HabitTracker({
  habits,
  retired,
  completed,
  streak,
}: {
  habits: HabitDefinition[];
  retired: HabitDefinition[];
  completed: Record<string, boolean>;
  streak: number;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HabitDefinition | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [, startTransition] = useTransition();
  const report = useReportError();

  // Runs whenever fresh server data arrives. An override is retired only once
  // the server reports the same value — never merely because data showed up.
  useEffect(() => {
    setOverrides((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(current)) {
        if (!inFlight.current.has(id) && completed[id] === value) {
          changed = true;              // server caught up; drop the override
          continue;
        }
        next[id] = value;
      }
      return changed ? next : current;
    });
  }, [completed]);

  const isDone = (id: string) => overrides[id] ?? completed[id] ?? false;
  const doneCount = habits.filter((h) => isDone(h.id)).length;
  const pct = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;

  async function toggle(habit: HabitDefinition) {
    const next = !isDone(habit.id);
    setOverrides((o) => ({ ...o, [habit.id]: next }));
    inFlight.current.add(habit.id);

    try {
      await api.patch("/api/daily-log", { habit_id: habit.id, done: next });
      inFlight.current.delete(habit.id);
      // In a transition, so re-rendering the other Home cards never holds
      // this one up.
      startTransition(() => router.refresh());
    } catch (err) {
      inFlight.current.delete(habit.id);
      // The write failed, so the optimistic value was wrong — take it back
      // rather than leaving a checkmark that does not exist in the database.
      setOverrides((o) => {
        const revert = { ...o };
        delete revert[habit.id];
        return revert;
      });
      report(`save \u201c${habit.label}\u201d`, err);
    }
  }

  async function restore(habit: HabitDefinition) {
    try {
      await api.patch(`/api/habits/${habit.id}`, { active: true });
      router.refresh();
    } catch (err) {
      report(`restore \u201c${habit.label}\u201d`, err);
    }
  }

  return (
    <Panel className="p-[15px]">
      <div className="flex items-start justify-between gap-[10px]">
        <div>
          <div className="kicker">Habit tracker</div>
          <div className="mt-[3px] text-[11px] text-muted">
            Daily discipline
            {streak > 0 ? ` · ${streak}-day streak` : null}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[22px] leading-none text-accent">
            {doneCount}/{habits.length}
          </div>
          <div className="mt-[3px] font-mono text-[10px] text-faint">{pct}%</div>
        </div>
      </div>

      <div
        className="mb-1 mt-3 h-[3px] overflow-hidden rounded-[3px]"
        style={{ background: "color-mix(in oklab, var(--color-text) 9%, transparent)" }}
      >
        <div
          className="h-full rounded-[3px] transition-[width] duration-200"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--color-accent-600), var(--color-accent-400))",
          }}
        />
      </div>

      <div className="mt-2 flex flex-col gap-px">
        {habits.length === 0 ? (
          <Empty>No habits yet.</Empty>
        ) : (
          habits.map((habit) => {
            const done = isDone(habit.id);
            return (
              // A row is two controls, not one: ticking the habit and editing
              // it are different intents, and a button cannot nest a button.
              <div
                key={habit.id}
                className="group flex items-center gap-[9px] rounded-[7px] px-[6px] py-[7px] transition-colors"
                style={{
                  background: done
                    ? "color-mix(in oklab, var(--color-accent) 6%, transparent)"
                    : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(habit)}
                  className="flex min-w-0 flex-1 items-center gap-[9px] text-left"
                  aria-pressed={done}
                >
                  <span
                    className="grid size-[15px] flex-none place-items-center rounded-[4px] border text-[10px] leading-none"
                    style={{
                      borderColor: done
                        ? "var(--color-accent)"
                        : "color-mix(in oklab, var(--color-text) 20%, transparent)",
                      background: done ? "var(--color-accent)" : "transparent",
                      color: "var(--color-bg)",
                    }}
                    aria-hidden
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    style={{
                      color: done ? "var(--color-muted)" : "var(--color-text)",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {habit.label}
                  </span>
                </button>

                {habit.target ? (
                  <span className="flex-none font-mono text-[10.5px] text-faint">
                    {habit.target}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => setEditing(habit)}
                  className="flex-none rounded px-1 text-[13px] leading-none text-faint opacity-0 transition-opacity hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
                  title={`Edit ${habit.label}`}
                  aria-label={`Edit ${habit.label}`}
                >
                  ⋯
                </button>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost mt-1 w-full justify-start !px-[6px] text-[12px] text-faint hover:text-text"
        onClick={() => setAdding(true)}
      >
        + Add habit
      </button>

      {retired.length > 0 ? (
        <div className="mt-1">
          <button
            type="button"
            className="btn btn-ghost w-full justify-start !px-[6px] text-[11.5px] text-faint hover:text-text"
            onClick={() => setShowRetired((v) => !v)}
          >
            {showRetired ? "▾" : "▸"} Retired ({retired.length})
          </button>
          {showRetired ? (
            <div className="mt-1 flex flex-col gap-px">
              {retired.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center gap-2 px-[6px] py-[5px] text-[12.5px] text-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{habit.label}</span>
                  <button
                    type="button"
                    className="btn btn-ghost flex-none !px-2 !py-[2px] text-[11px]"
                    onClick={() => restore(habit)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {adding ? <HabitDialog onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <HabitDialog key={editing.id} habit={editing} onClose={() => setEditing(null)} />
      ) : null}
    </Panel>
  );
}

/** Create, or rename / retire / delete an existing habit. */
function HabitDialog({
  habit,
  onClose,
}: {
  habit?: HabitDefinition;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(habit);

  const [label, setLabel] = useState(habit?.label ?? "");
  const [target, setTarget] = useState(habit?.target ?? "");
  const [category, setCategory] = useState(habit?.category ?? "");
  const [saving, setSaving] = useState(false);
  // Validation only; a failed write goes to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();
  /** null while we are still asking; drives whether Delete is offered. */
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);

  // Whether this habit was ever logged decides between delete and retire, so
  // ask before showing the buttons rather than failing after a click.
  useEffect(() => {
    if (!habit) return;
    let alive = true;
    api
      .get<{ hasHistory: boolean }>(`/api/habits/${habit.id}`)
      .then((r) => alive && setHasHistory(r.hasHistory))
      .catch(() => alive && setHasHistory(true)); // assume history: the safe default
    return () => {
      alive = false;
    };
  }, [habit]);

  async function save() {
    if (!label.trim()) {
      setError("Give the habit a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { label, target: target || null, category: category || null };
      if (editing) await api.patch(`/api/habits/${habit!.id}`, payload);
      else await api.post("/api/habits", payload);
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? `save \u201c${label}\u201d` : "add the habit", err);
      setSaving(false);
    }
  }

  /** `what` names the act, so a failure can say which button you pressed. */
  async function act(what: string, run: () => Promise<unknown>) {
    setSaving(true);
    try {
      await run();
      router.refresh();
      onClose();
    } catch (err) {
      report(what, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit habit" : "New habit"}
      footer={
        <>
          {editing ? (
            <div className="mr-auto flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  act(`retire \u201c${habit!.label}\u201d`, () =>
                    api.patch(`/api/habits/${habit!.id}`, { active: false }),
                  )
                }
                disabled={saving}
                title="Hide it from the list; every past day keeps its record"
              >
                Retire
              </button>
              {hasHistory === false ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    act(`delete \u201c${habit!.label}\u201d`, () =>
                      api.del(`/api/habits/${habit!.id}?purge=true`),
                    )
                  }
                  disabled={saving}
                  title="Never logged, so nothing is lost"
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Habit">
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Networking outreach"
        />
      </Field>
      <FieldRow>
        <Field label="Target" hint="label only">
          <input
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="2/day"
          />
        </Field>
        <Field label="Category" hint="optional">
          <input
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="outreach"
          />
        </Field>
      </FieldRow>

      {editing ? (
        <p className="m-0 text-[11.5px] text-faint">
          {hasHistory === null
            ? "Checking whether this habit has been completed before…"
            : hasHistory
              ? "You have completed this habit on at least one day, so it can be retired but not deleted — deleting it would rewrite those days. Retiring hides it from the list and keeps the history."
              : "This habit has never been completed, so deleting it removes it outright."}
        </p>
      ) : (
        <p className="m-0 text-[11.5px] text-faint">
          The target is a reminder to yourself — the habit is still a single check, and
          nothing counts against it.
        </p>
      )}
    </Dialog>
  );
}
