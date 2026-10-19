"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow, Select } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { GOAL_METRIC_LABEL, LANE_LABEL, laneColor } from "@/lib/display";
import { formatRange } from "@/lib/time";
import { LANES, type GoalMetric, type GoalProgress, type GoalScope, type Lane } from "@/lib/types";

const METRICS: GoalMetric[] = [
  "applications", "networking_outreach", "informational_interviews", "manual",
];

/**
 * Week and month goals.
 *
 * A goal with a metric counts itself from real rows at read time; only a
 * `manual` goal has a checkbox, because only a manual goal has nothing to
 * count. That is the difference between this card and a to-do list.
 */
export function Goals({
  week,
  month,
  weekRange,
  monthRange,
}: {
  week: GoalProgress[];
  month: GoalProgress[];
  weekRange: [string, string];
  monthRange: [string, string];
}) {
  const [adding, setAdding] = useState<GoalScope | null>(null);

  return (
    <Panel className="p-[15px]">
      <div className="kicker mb-3">Goals</div>

      <Group
        title="THIS WEEK"
        range={formatRange(...weekRange).toUpperCase()}
        goals={week}
        onAdd={() => setAdding("week")}
      />
      <Group
        title="THIS MONTH"
        range={formatRange(...monthRange).toUpperCase()}
        goals={month}
        onAdd={() => setAdding("month")}
      />

      {adding ? <GoalDialog scope={adding} onClose={() => setAdding(null)} /> : null}
    </Panel>
  );
}

function Group({
  title, range, goals, onAdd,
}: {
  title: string;
  range: string;
  goals: GoalProgress[];
  onAdd: () => void;
}) {
  return (
    <div className="mb-[14px] last:mb-0">
      <div className="mb-[7px] flex items-baseline justify-between">
        <span className="text-[13px] tracking-[0.04em]">{title}</span>
        <span className="font-mono text-[10px] text-faint">{range}</span>
      </div>

      {goals.length === 0 ? (
        <Empty>Nothing set for this period.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost mt-1 !px-0 text-[11.5px] text-faint hover:text-text"
        onClick={onAdd}
      >
        + Add
      </button>
    </div>
  );
}

function GoalRow({ goal }: { goal: GoalProgress }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const report = useReportError();
  /**
   * The tick as you set it, held until the server reports the same value —
   * the Priorities pattern. A refresh already in flight when you clicked
   * lands with the old value and must not untick the box under you.
   */
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (override !== null && goal.completed === override) setOverride(null);
  }, [goal.completed, override]);
  const completed = override ?? goal.completed;
  const [editing, setEditing] = useState(false);
  const color = laneColor(goal.lane);
  /**
   * A manual goal is the only kind you tick. One with a metric counts itself
   * from your real records, so a checkbox would be a lie — clicking it could
   * not change 4 applications into 40. The row makes that visible instead of
   * leaving you clicking something that silently does nothing.
   */
  const manual = !goal.metric || goal.metric === "manual";
  const hit = goal.current_count >= goal.target_count;
  const done = manual ? completed : hit;

  function toggleManual() {
    if (!manual) return;
    const next = !completed;
    setOverride(next);
    void (async () => {
      try {
        await api.patch(`/api/goals/${goal.id}`, { completed: next });
        startTransition(() => router.refresh());
      } catch (err) {
        setOverride(null); // the write failed, so the tick did not happen
        report(
          next
            ? `tick off \u201c${goal.description}\u201d`
            : `reopen \u201c${goal.description}\u201d`,
          err,
        );
      }
    })();
  }

  return (
    <div className="group">
      <div className="flex items-center gap-[7px]">
        <span
          className="size-[5px] flex-none rounded-full"
          style={{ background: color }}
          aria-hidden
        />

        {manual ? (
          <button
            type="button"
            onClick={toggleManual}
            className="flex min-w-0 flex-1 items-center gap-[7px] text-left"
            aria-pressed={completed}
          >
            <span
              className="grid size-[13px] flex-none place-items-center rounded-[3px] border text-[9px] leading-none"
              style={{
                borderColor: done ? color : "color-mix(in oklab, var(--color-text) 22%, transparent)",
                background: done ? color : "transparent",
                color: "var(--color-bg)",
              }}
              aria-hidden
            >
              {done ? "✓" : ""}
            </span>
            <span
              className="min-w-0 flex-1 text-[12.5px] leading-[1.35]"
              style={{
                textDecoration: completed ? "line-through" : "none",
                color: completed ? "var(--color-muted)" : "var(--color-text)",
              }}
            >
              {goal.description}
            </span>
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-[7px]">
            {/* Not a checkbox: this goal is counted, not ticked. */}
            <span
              className="grid size-[13px] flex-none place-items-center rounded-[3px] font-mono text-[8px] leading-none"
              style={{
                color: hit ? color : "var(--color-faint)",
                border: `1px dashed ${
                  hit ? color : "color-mix(in oklab, var(--color-text) 18%, transparent)"
                }`,
              }}
              title={`Counted automatically from ${GOAL_METRIC_LABEL[goal.metric!].toLowerCase()}`}
              aria-hidden
            >
              {hit ? "✓" : "∑"}
            </span>
            <span
              className="min-w-0 flex-1 text-[12.5px] leading-[1.35]"
              title={`Counted automatically from ${GOAL_METRIC_LABEL[goal.metric!].toLowerCase()} — there is nothing to tick`}
            >
              {goal.description}
            </span>
          </span>
        )}

        <span
          className="flex-none font-mono text-[11px]"
          style={{ color: hit ? color : "var(--color-muted)" }}
        >
          {goal.current_count}/{goal.target_count}
        </span>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-none rounded px-1 text-[12px] leading-none text-faint opacity-0 transition-opacity hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
          title={`Edit ${goal.description}`}
          aria-label={`Edit goal: ${goal.description}`}
        >
          ⋯
        </button>
      </div>

      <div
        className="ml-3 mt-[6px] h-[2px] overflow-hidden rounded-[2px]"
        style={{ background: "color-mix(in oklab, var(--color-text) 8%, transparent)" }}
      >
        <div
          className="h-full transition-[width] duration-200"
          style={{ width: `${Math.round(goal.fraction * 100)}%`, background: color }}
        />
      </div>

      {editing ? (
        <GoalDialog scope={goal.scope} goal={goal} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

/** Create a goal, or edit and delete an existing one. */
function GoalDialog({
  scope,
  goal,
  onClose,
}: {
  scope: GoalScope;
  goal?: GoalProgress;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(goal);
  const [description, setDescription] = useState(goal?.description ?? "");
  const [target, setTarget] = useState(String(goal?.target_count ?? 1));
  const [lane, setLane] = useState<Lane | null>(goal?.lane ?? null);
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? "manual");
  const [saving, setSaving] = useState(false);
  // Local state now holds validation only — "Describe the goal." belongs beside
  // the field. A failed write goes to the banner instead.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();

  async function save() {
    if (!description.trim()) {
      setError("Describe the goal.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        scope,
        description,
        target_count: Number(target) || 1,
        lane,
        metric,
      };
      if (editing) await api.patch(`/api/goals/${goal!.id}`, payload);
      else await api.post("/api/goals", payload);
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? "save this goal" : "add the goal", err);
      setSaving(false);
    }
  }

  /**
   * Removing a goal is not the same as finishing it. A goal you abandon, or
   * added by mistake, should leave no trace — ticking it off would record an
   * achievement that never happened.
   */
  async function remove() {
    if (!goal) return;
    setSaving(true);
    try {
      await api.del(`/api/goals/${goal.id}`);
      router.refresh();
      onClose();
    } catch (err) {
      report(`delete \u201c${goal.description}\u201d`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        editing
          ? "Edit goal"
          : scope === "week"
            ? "New weekly goal"
            : "New monthly goal"
      }
      footer={
        <>
          {editing ? (
            <button
              type="button"
              className="btn btn-danger mr-auto"
              onClick={remove}
              disabled={saving}
              title="Removes the goal entirely — not the same as marking it done"
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Add goal"}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Goal">
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Apply to 8 primary-lane companies"
        />
      </Field>
      <FieldRow>
        <Field label="Target count">
          <input
            className="input"
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field label="Lane" hint="optional">
          <Select
            value={lane}
            onChange={setLane}
            options={LANES}
            labels={LANE_LABEL}
            allowEmpty
            emptyLabel="— any —"
          />
        </Field>
      </FieldRow>
      <Field label="Counted from" hint="how progress is measured">
        <Select
          value={metric}
          onChange={(v) => setMetric(v ?? "manual")}
          options={METRICS}
          labels={GOAL_METRIC_LABEL}
        />
      </Field>
      <p className="m-0 text-[11.5px] text-faint">
        Anything but &ldquo;tracked by hand&rdquo; counts itself from your real records —
        you never tick it off.
      </p>
    </Dialog>
  );
}
