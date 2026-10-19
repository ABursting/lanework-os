"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { Chip, LaneBadge, ResumePassedMark } from "@/components/ui/Badge";
import { ApplicationDialog } from "./ApplicationDialog";
import { StageSummary } from "./StageSummary";
import { RowActions } from "./RowActions";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { KIND_LABEL, STAGE_LABEL, safeHref, stageColor, tint, touchColor, touchLabel } from "@/lib/display";
import { RESURFACE_BEFORE_DEADLINE_DAYS, STALE_APPLICATION_DAYS } from "@/lib/constants";
import { addDays, daysSince, formatShortDate, toCivilDate, today } from "@/lib/time";
import { Dialog } from "@/components/ui/Dialog";
import { STAGES, type ApplicationKind, type ApplicationRow, type Stage } from "@/lib/types";
import type { BoardData } from "@/lib/db/applications";

/**
 * The Applications kanban: stage as columns, lane as a chip on the card.
 *
 * Cards drag between columns to change stage. The move is applied locally
 * first so the board never lags a drop, and rolled back if the PATCH fails —
 * the alternative is a card that appears to move and is back in its old
 * column after the next refresh, with nothing to explain why.
 *
 * A Jobs / Grad school filter sits above it. It filters the cards and the
 * stage counts; the resume pass rate always describes jobs alone.
 *
 * Each column shows its COLUMN_LIMIT newest cards — newest by when the card
 * moved into that column, so editing a card does not reshuffle the board —
 * and a "Show all" button opens the whole column as a searchable list. With
 * hundreds of applications an unbounded column was an endless scroll.
 */

const COLUMN_LIMIT = 10;

type KindFilter = ApplicationKind | "all";
const KIND_FILTERS: KindFilter[] = ["all", "job", "grad_school"];
export function ApplicationBoard({
  board,
  companies,
}: {
  board: BoardData;
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ApplicationRow | null>(null);
  const [creatingIn, setCreatingIn] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<Stage | null>(null);
  /** Stage overrides applied locally while a PATCH is in flight. */
  const [pending, setPending] = useState<Record<string, Stage>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [expanded, setExpanded] = useState<Stage | null>(null);
  /** When each in-flight move was dropped, so a moved card sorts to the top at once. */
  const [movedAt, setMovedAt] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const report = useReportError();

  const stageOf = (a: ApplicationRow): Stage => pending[a.id] ?? a.stage;
  const enteredAt = (a: ApplicationRow): string => movedAt[a.id] ?? a.stage_changed_at;
  const newestFirst = (x: ApplicationRow, y: ApplicationRow) =>
    enteredAt(y).localeCompare(enteredAt(x));
  const all = board.columns
    .flatMap((c) => c.applications)
    .filter((a) => !removed.includes(a.id))
    .filter((a) => kindFilter === "all" || (a.kind ?? "job") === kindFilter);

  const counts = Object.fromEntries(STAGES.map((st) => [st, 0])) as Record<Stage, number>;
  for (const a of all) counts[stageOf(a)] += 1;

  /*
    Everything ever submitted, wherever it sits now - anything that has left
    Researching has been sent. Follows the Jobs / Grad school filter, like the
    other counts do.
  */
  const totalApplied = all.filter((a) => stageOf(a) !== "researching").length;

  const now = today();

  // Local truth until the server independently agrees — a refresh already in
  // flight when you deleted must not put the card back on the board.
  useEffect(() => {
    const live = board.columns.flatMap((c) => c.applications);
    setRemoved((prev) => {
      const next = prev.filter((id) => live.some((a) => a.id === id));
      return next.length === prev.length ? prev : next;
    });
    // A dragged card stays in its new column until the server's board puts
    // it there too. Dropping the override as soon as the PATCH returned let
    // the card flash back to its old column while the refresh was in flight.
    setPending((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id, stage]) => {
          const row = live.find((a) => a.id === id);
          return row !== undefined && row.stage !== stage;
        }),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    // Same rule for the sort override: kept until the server's own
    // stage_changed_at has caught up with the drop.
    setMovedAt((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id, at]) => {
          const row = live.find((a) => a.id === id);
          return row !== undefined && row.stage_changed_at < at;
        }),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [board]);

  function remove(application: ApplicationRow) {
    setRemoved((prev) => [...prev, application.id]);
    void (async () => {
      try {
        await api.del(`/api/applications/${application.id}`);
        startTransition(() => router.refresh());
      } catch (err) {
        setRemoved((prev) => prev.filter((id) => id !== application.id));
        report(
          `delete the ${application.role_title} application at ${application.company_name}`,
          err,
        );
      }
    })();
  }

  async function move(application: ApplicationRow, stage: Stage) {
    if (stageOf(application) === stage) return;
    const previousMovedAt = movedAt[application.id];
    setPending((p) => ({ ...p, [application.id]: stage }));
    setMovedAt((m) => ({ ...m, [application.id]: new Date().toISOString() }));
    try {
      await api.patch(`/api/applications/${application.id}`, { stage });
      // The override is dropped by the effect above once the refreshed board
      // agrees — not here, where the refresh has only just been asked for.
      startTransition(() => router.refresh());
    } catch (err) {
      setPending((p) => {
        const next = { ...p };
        delete next[application.id];
        return next;
      });
      setMovedAt((m) => {
        const next = { ...m };
        if (previousMovedAt) next[application.id] = previousMovedAt;
        else delete next[application.id];
        return next;
      });
      report(
        `move ${application.company_name} to ${STAGE_LABEL[stage]}`,
        err,
      );
    }
  }

  return (
    <>
      <div className="mb-[10px] flex gap-2">
        {KIND_FILTERS.map((option) => {
          const active = kindFilter === option;
          const color = "var(--color-accent)";
          return (
            <button
              key={option}
              type="button"
              onClick={() => setKindFilter(option)}
              className="rounded-md px-[11px] py-[5px] text-[11px] uppercase tracking-[0.06em] transition-colors"
              style={{
                color: active ? color : "var(--color-muted)",
                border: `1px solid ${active ? tint(color, 42) : "var(--color-edge-strong)"}`,
                background: active ? tint(color, 14) : "transparent",
              }}
              aria-pressed={active}
            >
              {option === "all" ? "All" : option === "job" ? "Jobs" : KIND_LABEL[option]}
            </button>
          );
        })}
      </div>

      <StageSummary
        counts={counts}
        totalApplied={totalApplied}
        resumePassed={board.resumePassed}
        resumeConsidered={board.resumeConsidered}
        resumeRate={board.resumeRate}
      />

      {/* Column count follows the stage list rather than being hard-coded, so
          adding or dropping a stage cannot leave an empty slot behind. */}
      <div
        className="grid gap-[10px] overflow-x-auto pb-[6px]"
        style={{
          gridTemplateColumns: `repeat(${board.columns.length}, minmax(224px, 1fr))`,
        }}
      >
        {board.columns.map((column) => {
          const inColumn = all.filter((a) => stageOf(a) === column.stage).sort(newestFirst);
          const cards = inColumn.slice(0, COLUMN_LIMIT);
          const color = stageColor(column.stage);
          const isTarget = hoverStage === column.stage;

          return (
            <Panel
              key={column.stage}
              variant="well"
              className="min-h-[380px] p-[10px] transition-colors"
              style={
                isTarget
                  ? {
                      background: `color-mix(in oklab, ${color} 10%, transparent)`,
                      borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
                    }
                  : undefined
              }
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                setHoverStage(column.stage);
              }}
              onDragLeave={() => setHoverStage((s) => (s === column.stage ? null : s))}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                setHoverStage(null);
                // Cleared here, not only on dragend: a card that lands in a new
                // column is a fresh element, and the browser sends dragend to
                // the old one that was just removed — so it never arrives and
                // the card stays faded as if still mid-drag.
                setDragging(null);
                const id = e.dataTransfer.getData("text/plain") || dragging;
                const application = all.find((a) => a.id === id);
                if (application) void move(application, column.stage);
              }}
            >
              <div className="flex items-center gap-[7px] px-1 pb-[11px] pt-[2px]">
                <span
                  className="size-[7px] flex-none rounded-[2px]"
                  style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                  aria-hidden
                />
                <span className="flex-1 text-[11px] uppercase tracking-[0.09em] text-dim">
                  {STAGE_LABEL[column.stage]}
                </span>
                <span className="font-mono text-[11px] text-faint">{inColumn.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {cards.map((application) => {
                  const days = daysSince(application.last_touched_at);
                  return (
                    <article
                      key={application.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", application.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(application.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setEditing(application)}
                      className="group cursor-pointer rounded-[10px] px-[11px] py-[10px] backdrop-blur-[10px] transition-shadow hover:brightness-110"
                      style={{
                        background:
                          "linear-gradient(180deg, color-mix(in oklab, var(--color-surface) 82%, transparent), color-mix(in oklab, var(--color-bg) 72%, transparent))",
                        border: "1px solid var(--color-edge)",
                        borderLeft: `2px solid ${
                          application.lane === "primary"
                            ? "var(--color-lane-primary)"
                            : application.lane === "secondary"
                              ? "var(--color-lane-secondary)"
                              : "var(--color-lane-peripheral)"
                        }`,
                        boxShadow: "0 6px 16px oklch(0% 0 0 / 0.3)",
                        opacity: dragging === application.id ? 0.4 : 1,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <h3 className="flex-1 text-[13.5px] leading-tight">
                          {application.company_name}
                        </h3>
                        <PostingLink url={application.job_posting_url} />
                        <ResumePassedMark passed={application.resume_passed} />
                      </div>
                      <p className="m-0 mt-[3px] text-[11.5px] text-muted">
                        {application.role_title}
                      </p>
                      {stageOf(application) === "researching" &&
                      (application.remind_on || application.deadline) ? (
                        <ResearchDates application={application} now={now} />
                      ) : null}
                      <div className="mt-[9px] flex items-center gap-[7px]">
                        <LaneBadge lane={application.lane} size="xs" />
                        {application.kind === "grad_school" ? <Chip>Grad</Chip> : null}
                        <span className="flex-1" />
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: touchColor(days, STALE_APPLICATION_DAYS) }}
                          title={`Last touched ${touchLabel(days)} ago`}
                        >
                          {touchLabel(days)}
                        </span>
                        {/* No Edit here — the card itself opens the editor. */}
                        <RowActions
                          label={`${application.company_name} — ${application.role_title}`}
                          onDelete={() => remove(application)}
                          detail={
                            <>
                              Removes the {application.role_title} application at{" "}
                              {application.company_name}, along with its stage
                              history — every move between Researching, Applied,
                              Interviewing and the rest, and the dates they
                              happened. Tasks
                              linked to it are kept, without the application
                              attached.
                              <br />
                              <br />
                              To take it off the board without losing the record,
                              move it to Archived instead.
                            </>
                          }
                        />
                      </div>
                    </article>
                  );
                })}

                {inColumn.length > COLUMN_LIMIT ? (
                  <button
                    type="button"
                    className="btn btn-secondary w-full text-[12px]"
                    onClick={() => setExpanded(column.stage)}
                  >
                    Show all {inColumn.length} →
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn btn-ghost w-full justify-start !px-2 text-[12px] text-faint hover:text-text"
                  onClick={() => setCreatingIn(column.stage)}
                >
                  + Add
                </button>
              </div>
            </Panel>
          );
        })}
      </div>

      {expanded ? (
        <ColumnPanel
          stage={expanded}
          applications={all.filter((a) => stageOf(a) === expanded).sort(newestFirst)}
          enteredAt={enteredAt}
          onClose={() => setExpanded(null)}
          onMove={move}
          onOpen={(application) => {
            setExpanded(null);
            setEditing(application);
          }}
        />
      ) : null}

      {editing ? (
        <ApplicationDialog
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          companies={companies}
          application={editing}
        />
      ) : null}

      {creatingIn ? (
        <ApplicationDialog
          key={`new-${creatingIn}`}
          open
          onClose={() => setCreatingIn(null)}
          companies={companies}
          defaultStage={creatingIn}
        />
      ) : null}
    </>
  );
}

/**
 * "APPLY OCT 5 · DUE OCT 15" on a Researching card. The deadline turns red
 * inside the last two days, the same point an ignored reminder is forced back
 * into Compress.
 */
function ResearchDates({ application, now }: { application: ApplicationRow; now: string }) {
  const { remind_on, deadline, remind_estimated } = application;
  const dueSoon = Boolean(deadline && addDays(deadline, -RESURFACE_BEFORE_DEADLINE_DAYS) <= now);
  return (
    <div className="mt-[6px] flex flex-wrap gap-x-[8px] font-mono text-[9.5px] uppercase tracking-[0.04em]">
      {remind_on ? (
        <span
          style={{ color: "var(--color-accent)" }}
          title={remind_estimated ? "Estimated from when the listing was posted" : "Reminder to apply"}
        >
          Apply {formatShortDate(remind_on)}
          {remind_estimated ? " est." : ""}
        </span>
      ) : null}
      {deadline ? (
        <span style={{ color: dueSoon ? "var(--color-danger)" : "var(--color-muted)" }}>
          {deadline < now ? "Missed " : "Due "}
          {formatShortDate(deadline)}
        </span>
      ) : null}
    </div>
  );
}

/** The ↗ on a card. Opens the posting in a new tab without opening the editor. */
function PostingLink({ url }: { url: string | null }) {
  const href = safeHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      className="flex-none text-[12px] leading-none text-faint transition-colors hover:text-accent"
      title="Open the application link"
      aria-label="Open the application link"
    >
      ↗
    </a>
  );
}

/**
 * Every application in one column, newest arrival first, with a search box.
 * Clicking a row opens the same editor a card does.
 */
function ColumnPanel({
  stage,
  applications,
  enteredAt,
  onClose,
  onOpen,
  onMove,
}: {
  stage: Stage;
  applications: ApplicationRow[];
  enteredAt: (a: ApplicationRow) => string;
  onClose: () => void;
  onOpen: (a: ApplicationRow) => void;
  onMove: (a: ApplicationRow, stage: Stage) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  /**
   * Ticked rows, by id.
   *
   * With ninety in Applied the common action is not moving one card, it is
   * "these six came back as rejections". Dragging handles one at a time and
   * only for the ten cards the board shows; this is the rest of the column.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const shown = q
    ? applications.filter((a) =>
        `${a.company_name} ${a.role_title}`.toLowerCase().includes(q),
      )
    : applications;

  return (
    <Dialog open onClose={onClose} title={`${STAGE_LABEL[stage]} · ${applications.length}`} width={760}>
      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search company or role…"
      />

      {/* The bulk bar. Present only once something is ticked, so the ordinary
          case - reading the list - is not crowded by a control nobody needs. */}
      {picked.size > 0 ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] px-3 py-[8px]"
          style={{
            background: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-accent) 28%, transparent)",
          }}
        >
          <span className="text-[12.5px]">
            {picked.size} selected
          </span>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-[2px] !text-[11px]"
            onClick={() => setPicked(new Set())}
          >
            Clear
          </button>
          <span className="flex-1" />
          <span className="text-[11.5px] text-faint">Move all to</span>
          {STAGES.filter((st) => st !== stage).map((target) => (
            <button
              key={target}
              type="button"
              className="btn btn-secondary !px-[9px] !py-[3px] !text-[11.5px]"
              style={{ borderColor: `color-mix(in oklab, ${stageColor(target)} 45%, transparent)` }}
              onClick={() => {
                // Snapshot first: moving mutates the list this is iterating.
                const moving = applications.filter((a) => picked.has(a.id));
                setPicked(new Set());
                for (const a of moving) void onMove(a, target);
              }}
            >
              {STAGE_LABEL[target]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-[60vh] overflow-y-auto">
        {shown.length === 0 ? (
          <p className="m-0 py-6 text-center text-[12.5px] text-faint">Nothing matches.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
            {shown.map((a) => (
              <li key={a.id}>
                <div
                  className="flex items-center gap-3 rounded-[8px] px-3 py-[9px] transition-colors hover:brightness-125"
                  style={{
                    background: picked.has(a.id)
                      ? "color-mix(in oklab, var(--color-accent) 13%, transparent)"
                      : "color-mix(in oklab, var(--color-surface) 70%, transparent)",
                    border: `1px solid ${picked.has(a.id) ? "color-mix(in oklab, var(--color-accent) 40%, transparent)" : "var(--color-edge)"}`,
                  }}
                >
                  <input
                    type="checkbox"
                    className="flex-none accent-[var(--color-accent)]"
                    checked={picked.has(a.id)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) next.delete(a.id);
                        else next.add(a.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${a.company_name} — ${a.role_title}`}
                  />

                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onOpen(a);
                    }}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <span className="block truncate text-[13px]">{a.company_name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{a.role_title}</span>
                  </span>

                  <LaneBadge lane={a.lane} size="xs" />
                  <PostingLink url={a.job_posting_url} />
                  <span
                    className="w-[58px] flex-none text-right font-mono text-[10.5px] text-faint"
                    title={`In ${STAGE_LABEL[stage]} since ${formatShortDate(toCivilDate(new Date(enteredAt(a))))}`}
                  >
                    {formatShortDate(toCivilDate(new Date(enteredAt(a))))}
                  </span>

                  {/*
                    One click to move, rather than opening the whole edit form.
                    A native select so the keyboard and a trackpad both work,
                    and so the list of destinations cannot drift from STAGES.
                  */}
                  <select
                    className="input !w-[112px] flex-none !px-[6px] !py-[3px] !text-[11.5px]"
                    value=""
                    onChange={(e) => {
                      const target = e.target.value as Stage;
                      if (target) void onMove(a, target);
                    }}
                    aria-label={`Move ${a.company_name} to another stage`}
                    title="Move this one"
                  >
                    <option value="">Move to…</option>
                    {STAGES.filter((st) => st !== stage).map((st) => (
                      <option key={st} value={st}>
                        {STAGE_LABEL[st]}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
