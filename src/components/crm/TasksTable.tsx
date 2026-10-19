"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LaneFilter, type LaneFilterValue } from "./LaneFilter";
import { TaskDialog } from "./TaskDialog";
import { Chip, LaneBadge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { TASK_TYPE_LABEL, TASK_TYPE_VAR } from "@/lib/display";
import { dueColor, dueNote } from "@/lib/priority";
import { formatShortDate } from "@/lib/time";
import { TASK_TYPES, type TaskRow, type TaskType } from "@/lib/types";

const GRID =
  "grid grid-cols-[30px_minmax(0,2fr)_150px_112px_minmax(0,1fr)_106px_124px] gap-3";

type StatusFilter = "open" | "done" | "all";

/**
 * The full task list.
 *
 * The Priorities card is deliberately a top-three; this is where everything
 * else lives — the backlog, the things with no deadline, and the history of
 * what has been finished. Open tasks keep the same deterministic ranking they
 * have on the Home page, so the order never disagrees between the two.
 *
 * ── Undo and delete ─────────────────────────────────────────────────────────
 * Both were technically possible before and neither was findable. Ticking a
 * task made it vanish, because the filter defaults to Open and a completed
 * task no longer matches it — the checkbox that would undo the tick went with
 * the row. And delete lived inside the edit dialog, behind a row title that
 * did not look like a button.
 *
 * So: a task whose status you changed on this visit stays pinned in the list
 * whatever the filter says, carrying a labelled Undo, until you leave the
 * page. And every row now carries its own Edit and Delete. Delete asks once,
 * because unlike completing, it does not keep the task anywhere.
 */
export function TasksTable({
  tasks,
  initialStatus = "open",
}: {
  tasks: TaskRow[];
  initialStatus?: StatusFilter;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilterValue>("all");
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [type, setType] = useState<TaskType | null>(null);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const report = useReportError();

  /**
   * Local truth, applied on top of whatever the server last sent and held
   * until the server independently agrees. Same rule as the Priorities card:
   * a refresh already in flight when you click must not undo your click.
   */
  const [overrides, setOverrides] = useState<Record<string, "done" | "open">>({});
  const [removed, setRemoved] = useState<string[]>([]);

  /** Rows whose status you changed on this visit. They stay put; see above. */
  const [pinned, setPinned] = useState<string[]>([]);

  /** The row whose Delete is asking for a second click. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const statusOf = (task: TaskRow) => overrides[task.id] ?? task.status;

  // Drop local state as soon as the server reports the same thing.
  useEffect(() => {
    setOverrides((prev) => {
      const next: Record<string, "done" | "open"> = {};
      let changed = false;
      for (const [id, want] of Object.entries(prev)) {
        const row = tasks.find((t) => t.id === id);
        if (row && row.status === want) changed = true;
        else next[id] = want;
      }
      return changed ? next : prev;
    });
    setRemoved((prev) => {
      const next = prev.filter((id) => tasks.some((t) => t.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [tasks]);

  // A second click confirms; walking away cancels. A confirm that waits
  // forever eventually gets clicked by accident.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(null), 5_000);
    return () => clearTimeout(id);
  }, [confirming]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (removed.includes(t.id)) return false;
      // Pinned rows ignore the status filter — that is what keeps the Undo
      // reachable after a tick has moved the task out of the Open list.
      if (status !== "all" && statusOf(t) !== status && !pinned.includes(t.id)) return false;
      if (lane !== "all" && t.lane !== lane) return false;
      if (type && t.task_type !== type) return false;
      if (!q) return true;
      return `${t.title} ${t.description ?? ""} ${t.company_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, query, lane, status, type, overrides, removed, pinned]);

  const counts = useMemo(() => {
    const live = tasks.filter((t) => !removed.includes(t.id));
    return {
      open: live.filter((t) => statusOf(t) === "open").length,
      done: live.filter((t) => statusOf(t) === "done").length,
      all: live.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, overrides, removed]);

  /** Tick or untick. The row moves now; the write follows. */
  function setDone(task: TaskRow, done: boolean) {
    const next = done ? "done" : "open";
    setOverrides((prev) => ({ ...prev, [task.id]: next }));
    setPinned((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));

    void (async () => {
      try {
        await api.patch(`/api/tasks/${task.id}`, { status: next });
        startTransition(() => router.refresh());
      } catch (err) {
        setOverrides((prev) => {
          const copy = { ...prev };
          delete copy[task.id];
          return copy;
        });
        // Unpin too. A row whose status never changed must not be left
        // offering an Undo for something that did not happen.
        setPinned((prev) => prev.filter((id) => id !== task.id));
        report(done ? `mark "${task.title}" done` : `reopen "${task.title}"`, err);
      }
    })();
  }

  /** Gone for good — no completed-history entry, no undo. Hence the confirm. */
  function remove(task: TaskRow) {
    setConfirming(null);
    setRemoved((prev) => [...prev, task.id]);

    void (async () => {
      try {
        await api.del(`/api/tasks/${task.id}`);
        startTransition(() => router.refresh());
      } catch (err) {
        setRemoved((prev) => prev.filter((id) => id !== task.id));
        report(`delete "${task.title}"`, err);
      }
    })();
  }

  return (
    <>
      <div
        className="overflow-hidden rounded-xl backdrop-blur-[14px]"
        style={{
          background: "color-mix(in oklab, var(--color-surface) 60%, transparent)",
          border: "1px solid var(--color-edge)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-[14px] py-3">
          <input
            className="input max-w-[260px]"
            placeholder="Filter tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="segbar">
            {(["open", "done", "all"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                className="seg-opt !px-[13px] !text-[12.5px] capitalize"
                data-active={status === s}
                onClick={() => setStatus(s)}
              >
                {s} ({counts[s]})
              </button>
            ))}
          </div>
          <LaneFilter value={lane} onChange={setLane} />
          {/* Seven categories is too many for a chip row beside everything
              else in this bar, so it is a select. */}
          <div className="w-[190px]">
            <Select
              value={type}
              onChange={setType}
              options={TASK_TYPES}
              labels={TASK_TYPE_LABEL}
              allowEmpty
              emptyLabel="All categories"
            />
          </div>
          <div className="flex-1" />
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + Task
          </button>
        </div>

        <div className={`${GRID} px-4 py-[9px] micro`}>
          <div />
          <div>Task</div>
          <div>Type</div>
          <div>Lane</div>
          <div>Company</div>
          <div>Due</div>
          <div className="text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <Empty
            action={
              tasks.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  Add a task
                </button>
              ) : undefined
            }
          >
            {tasks.length === 0
              ? "No tasks yet. They arrive from a capture, or you can add one here."
              : status === "done"
                ? "Nothing completed yet that matches."
                : "No tasks match those filters."}
          </Empty>
        ) : (
          rows.map((task) => {
            const done = statusOf(task) === "done";
            // Showing only because you just changed it — the filter would
            // otherwise have dropped it out from under your cursor.
            const heldOpen =
              pinned.includes(task.id) && status !== "all" && statusOf(task) !== status;
            return (
              <div
                key={task.id}
                className={`${GRID} group items-center border-t border-edge-soft px-4 py-[11px] transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)]`}
                style={
                  heldOpen
                    ? { background: "color-mix(in oklab, var(--color-pass) 7%, transparent)" }
                    : undefined
                }
              >
                {/* Completion is its own control; the rest of the row edits. */}
                <button
                  type="button"
                  onClick={() => setDone(task, !done)}
                  className="grid size-[17px] place-items-center rounded-[4px] border text-[10px] leading-none transition-colors"
                  style={{
                    borderColor: done
                      ? "var(--color-pass)"
                      : "color-mix(in oklab, var(--color-text) 22%, transparent)",
                    background: done ? "var(--color-pass)" : "transparent",
                    color: "var(--color-bg)",
                  }}
                  title={done ? "Reopen" : "Mark done"}
                  aria-label={done ? `Reopen "${task.title}"` : `Mark "${task.title}" done`}
                  aria-pressed={done}
                >
                  {done ? "✓" : ""}
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(task)}
                  className="min-w-0 text-left"
                  title="Edit this task"
                >
                  <span
                    className="block truncate text-[14px] underline decoration-transparent underline-offset-2 transition-colors group-hover:decoration-[color-mix(in_oklab,var(--color-text)_35%,transparent)]"
                    style={{
                      color: done ? "var(--color-muted)" : "var(--color-text)",
                      textDecorationLine: done ? "line-through" : undefined,
                    }}
                  >
                    {task.title}
                  </span>
                  {task.description ? (
                    <span className="block truncate text-[11.5px] text-faint">
                      {task.description}
                    </span>
                  ) : null}
                </button>

                <div className="min-w-0">
                  <Chip
                    color={TASK_TYPE_VAR[task.task_type]}
                    className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {TASK_TYPE_LABEL[task.task_type]}
                  </Chip>
                </div>
                <div className="justify-self-start">
                  <LaneBadge lane={task.lane} />
                </div>
                <div className="truncate text-[12.5px] text-dim">
                  {task.company_name ?? "—"}
                </div>
                <div className="font-mono text-[11.5px]">
                  {task.due_date ? (
                    <>
                      <div>{formatShortDate(task.due_date)}</div>
                      {!done ? (
                        <div className="text-[10px]" style={{ color: dueColor(task.due_date) }}>
                          {dueNote(task.due_date)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1">
                  {/* Undo is spelled out and always visible once you have
                      touched the row. Unticking the checkbox does the same
                      thing, but a checkbox does not announce itself as the
                      way back. */}
                  {pinned.includes(task.id) ? (
                    <button
                      type="button"
                      className="btn btn-ghost !px-[7px] !py-[2px] text-[11.5px]"
                      style={{ color: "var(--color-pass)" }}
                      onClick={() => setDone(task, !done)}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost !px-[7px] !py-[2px] text-[11.5px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => setEditing(task)}
                    >
                      Edit
                    </button>
                  )}

                  {confirming === task.id ? (
                    <button
                      type="button"
                      className="btn btn-danger !px-[7px] !py-[2px] text-[11.5px]"
                      onClick={() => remove(task)}
                      title="Click again to delete permanently"
                      autoFocus
                    >
                      Sure?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost !px-[7px] !py-[2px] text-[11.5px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      style={{ color: "var(--color-danger)" }}
                      onClick={() => setConfirming(task.id)}
                      title="Delete this task outright. Completing it instead keeps it in your history."
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing ? (
        <TaskDialog key={editing.id} task={editing} onClose={() => setEditing(null)} />
      ) : null}
      {creating ? <TaskDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
