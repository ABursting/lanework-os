"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { LaneBadge } from "@/components/ui/Badge";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { TASK_TYPE_LABEL, laneColor } from "@/lib/display";
import { compareTasks, dueColor, dueNote } from "@/lib/priority";
import { formatShortDate } from "@/lib/time";
import type { TaskRow } from "@/lib/types";

/**
 * Today's top three.
 *
 * The order is the deterministic score from src/lib/priority.ts — lane weight
 * plus deadline urgency plus a small type nudge — recomputed on every read so
 * it cannot go stale. The one-line "why today" underneath is the only AI on
 * this card, and it is read from the cache written into daily_logs. Clicking
 * Regenerate is the only thing that calls the model.
 *
 * ── Why ticking a task is instant ───────────────────────────────────────────
 * Completing used to await the PATCH and then await a full router.refresh()
 * before anything moved, so a click sat there doing visibly nothing for the
 * length of two network round trips plus a re-render of every card on the
 * page. The write is now applied locally first and the network happens behind
 * it. `overrides` is that local truth: an id mapped to the status we believe
 * it has, held until the server's own data agrees.
 *
 * Holding until confirmed — rather than clearing on a timer, or trusting the
 * next payload blindly — is what stops the habit-card bug from recurring here:
 * a refresh that was already in flight when you clicked lands with the old
 * status and must not be allowed to undo your click.
 */
export function Priorities({
  tasks,
  completedToday,
  reasons,
  generatedAt,
}: {
  tasks: TaskRow[];
  completedToday: TaskRow[];
  reasons: Record<string, string>;
  generatedAt: string | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const report = useReportError();

  /**
   * Statuses we have applied locally and the server has not confirmed yet.
   * Empty in the steady state — every entry is a write in flight or a write
   * whose refresh has not landed.
   */
  const [overrides, setOverrides] = useState<Record<string, "done" | "open">>({});

  /**
   * The task just ticked. Purely the highlight in the Done-today list — the
   * undo itself lives on every row there, so it never expires.
   */
  const [justDone, setJustDone] = useState<string | null>(null);

  /**
   * Drop an override once the server independently reports the same thing.
   * Until then the local value wins, whatever arrives.
   */
  useEffect(() => {
    setOverrides((prev) => {
      const next: Record<string, "done" | "open"> = {};
      let changed = false;
      for (const [id, want] of Object.entries(prev)) {
        const inOpen = tasks.some((t) => t.id === id);
        const inDone = completedToday.some((t) => t.id === id);
        const confirmed = want === "done" ? inDone && !inOpen : inOpen && !inDone;
        if (confirmed) changed = true;
        else next[id] = want;
      }
      return changed ? next : prev;
    });
  }, [tasks, completedToday]);

  // The two lists, with local intent applied. A task the server still calls
  // open but we have ticked is filtered out of one list and rendered into the
  // other from the row we already hold — no placeholder, no second fetch.
  const openTasks = useMemo(() => {
    const staying = tasks.filter((t) => overrides[t.id] !== "done");
    const returning = completedToday.filter((t) => overrides[t.id] === "open");
    if (returning.length === 0) return staying;
    // Re-ranked with the same comparator the server uses, so an undone task
    // lands where it belongs instead of jumping position on the next refresh.
    return [...staying, ...returning].sort((a, b) => compareTasks(a, b));
  }, [tasks, completedToday, overrides]);

  const doneToday = useMemo(() => {
    const staying = completedToday.filter((t) => overrides[t.id] !== "open");
    const arriving = tasks.filter(
      (t) => overrides[t.id] === "done" && !staying.some((d) => d.id === t.id),
    );
    return [...arriving, ...staying];
  }, [tasks, completedToday, overrides]);

  // The card is a top-three by default — that is the point of it. Expanding
  // shows the same ranking, just all of it, rather than a second screen with
  // a different order.
  const TOP = 3;
  const visible = expanded ? openTasks : openTasks.slice(0, TOP);
  const overflow = openTasks.length - TOP;

  /**
   * Done today, capped at three.
   *
   * Deliberately not a scrollable box with a fade: a small scroll region
   * inside a card is awkward to hit, and a fade says "there is more" without
   * saying how much. Three rows plus a count says both, never grows, and the
   * overflow goes to the Tasks tab, which is built for browsing.
   */
  const DONE_SHOWN = 3;
  const doneOverflow = doneToday.length - DONE_SHOWN;

  async function regenerate() {
    setGenerating(true);
    try {
      await api.post("/api/priorities/rationale");
      router.refresh();
    } catch (err) {
      report("explain today's priorities", err);
    } finally {
      setGenerating(false);
    }
  }

  function clearOverride(id: string) {
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /**
   * Move the row now, tell the server after.
   *
   * Not awaited by the click handler: the list has already changed by the time
   * the request leaves. The refresh afterwards is what keeps the rest of the
   * page honest — goal progress counts completed tasks — and runs inside a
   * transition so re-rendering six cards never blocks this one.
   */
  function setStatus(task: TaskRow, status: "done" | "open") {
    setOverrides((prev) => ({ ...prev, [task.id]: status }));
    setJustDone(status === "done" ? task.id : (current) => (current === task.id ? null : current));

    void (async () => {
      try {
        // Reopening also retracts the "Completed" line this wrote into Brain.
        await api.patch(`/api/tasks/${task.id}`, { status });
        startTransition(() => router.refresh());
      } catch (err) {
        // The write did not happen, so neither did the move.
        clearOverride(task.id);
        setJustDone((current) => (current === task.id ? null : current));
        report(
          status === "done" ? `mark "${task.title}" done` : `reopen "${task.title}"`,
          err,
        );
      }
    })();
  }

  // Long enough to notice a mis-click, glance away and come back. A short
  // toast is the classic way to make undo technically present and practically
  // useless; the completed-today list is the permanent path.
  useEffect(() => {
    if (!justDone) return;
    const id = setTimeout(() => setJustDone(null), 45_000);
    return () => clearTimeout(id);
  }, [justDone]);

  return (
    <Panel variant="raised" className="px-4 pb-2 pt-4">
      <PanelHeader
        kicker="Priorities"
        title={expanded ? `All open tasks (${openTasks.length})` : "Today's top three"}
        aside={
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10.5px] text-faint">RANKED BY LANE WEIGHT</span>
            <button
              type="button"
              className="btn btn-ghost text-[11.5px]"
              onClick={regenerate}
              disabled={generating || openTasks.length === 0}
              title={
                generatedAt
                  ? `Rationale generated ${new Date(generatedAt).toLocaleString()}`
                  : "No rationale generated today"
              }
            >
              {generating ? "Thinking…" : generatedAt ? "Regenerate" : "Explain"}
            </button>
          </div>
        }
      />

      {openTasks.length === 0 ? (
        <Empty
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Add a task
            </button>
          }
        >
          Nothing open. Tasks arrive here from a capture, or you can add one directly.
        </Empty>
      ) : (
        <>
          {visible.map((task, index) => (
            <div
              key={task.id}
              className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-[14px] border-t border-edge-soft px-1 py-[13px]"
            >
              <button
                type="button"
                onClick={() => setStatus(task, "done")}
                className="rank-check"
                style={{ color: laneColor(task.lane) }}
                title={`Mark "${task.title}" done`}
                aria-label={`Mark "${task.title}" done`}
              >
                <span className="rank-num">{String(index + 1).padStart(2, "0")}</span>
                <span className="rank-tick" aria-hidden>✓</span>
              </button>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="text-[15px]">{task.title}</span>
                  <LaneBadge lane={task.lane} />
                  {task.company_name ? (
                    <span className="text-[11.5px] text-faint">{task.company_name}</span>
                  ) : null}
                </div>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.45] text-muted">
                  {reasons[task.id] ?? task.description ?? TASK_TYPE_LABEL[task.task_type]}
                </p>
              </div>

              <div className="text-right font-mono">
                <div className="text-[12px]">
                  {task.due_date ? formatShortDate(task.due_date) : "—"}
                </div>
                <div className="mt-[3px] text-[10px]" style={{ color: dueColor(task.due_date) }}>
                  {dueNote(task.due_date)}
                </div>
              </div>
            </div>
          ))}

          <div className="mb-1 mt-2 flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost !px-1 text-[12px] text-faint hover:text-text"
              onClick={() => setAdding(true)}
            >
              + Add task
            </button>
            {overflow > 0 ? (
              <button
                type="button"
                className="btn btn-ghost !px-1 text-[12px]"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show top three" : `Show all (${openTasks.length})`}
              </button>
            ) : null}
            <span className="flex-1" />
            <Link href="/crm/tasks" className="btn btn-ghost !px-1 text-[12px] no-underline">
              Manage tasks →
            </Link>
          </div>
        </>
      )}

      {doneToday.length > 0 ? (
        <div className="mt-3 border-t border-edge-soft pt-3">
          <div className="micro mb-2">Done today · {doneToday.length}</div>
          <div className="flex flex-col gap-[2px]">
            {doneToday.slice(0, DONE_SHOWN).map((task) => {
              // The one you just ticked keeps the accent for a moment, so the
              // completion registers as having happened somewhere.
              const fresh = justDone === task.id;
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-[6px] text-[12.5px] transition-colors"
                  style={
                    fresh
                      ? {
                          background: "color-mix(in oklab, var(--color-pass) 10%, transparent)",
                          border: "1px solid color-mix(in oklab, var(--color-pass) 28%, transparent)",
                        }
                      : { border: "1px solid transparent" }
                  }
                >
                  <span className="flex-none" style={{ color: "var(--color-pass)" }} aria-hidden>
                    ✓
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: fresh ? "var(--color-text)" : "var(--color-muted)" }}
                  >
                    {task.title}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost flex-none !py-0 text-[12px]"
                    onClick={() => setStatus(task, "open")}
                  >
                    Undo
                  </button>
                </div>
              );
            })}
          </div>

          {doneOverflow > 0 ? (
            <Link
              href="/crm/tasks?status=done"
              className="btn btn-ghost mt-1 !px-2 text-[12px] no-underline"
            >
              +{doneOverflow} more today →
            </Link>
          ) : null}
        </div>
      ) : null}

      {adding ? <TaskDialog onClose={() => setAdding(false)} /> : null}
    </Panel>
  );
}
