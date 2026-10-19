"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Empty } from "@/components/ui/Empty";
import { STAGE_LABEL, TASK_TYPE_LABEL, TASK_TYPE_VAR, stageColor } from "@/lib/display";
import { formatShortDate, weekdayLabel } from "@/lib/time";
import type { Stage, TaskType } from "@/lib/types";
import type { TimelineData, TimelineDay } from "@/lib/db/timeline";

/** Chart geometry. Fixed viewBox, scaled by CSS — crisp at any width. */
const H = 150;          // plot height for the task chart, above the shared line
const EVENT_H = 34;     // room for pipeline moves hanging below the same line
const PAD_L = 26;       // room for the y-axis numbers
const PAD_B = 16;       // room for the date labels
const GAP = 2;          // surface gap between stacked segments
const PAD_T = 9;        // headroom: the peak gridline's label sits on y=0 and
                        // would otherwise be sliced off by the viewBox edge

export function ActivityTimeline({
  data,
  range,
  onRangeChange,
  below,
}: {
  /** Rendered between the chart and the detail list. */
  below?: React.ReactNode;
  data: TimelineData;
  range: number;
  onRangeChange: (days: number) => void;
}) {
  const [hover, setHover] = useState<TimelineDay | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { days, presentTypes, presentStages, totals } = data;

  const peak = useMemo(
    () => Math.max(1, ...days.map((d) => d.taskTotal)),
    [days],
  );
  const eventPeak = useMemo(
    () => Math.max(1, ...days.map((d) => d.eventTotal)),
    [days],
  );

  // One column per day, so a quiet stretch reads as a quiet stretch.
  const W = 720;
  const plotW = W - PAD_L;
  const colW = plotW / days.length;
  const barW = Math.max(2, Math.min(14, colW - 2));

  // Gridlines at whole numbers only — half a task does not exist.
  const ticks = niceTicks(peak);

  /**
   * One shared line: tasks rise from it, pipeline moves hang below it.
   *
   * There used to be two baselines with a gap between them, so on a day with
   * no move the task bar seemed to hover above the bottom of the chart. The
   * move strip is dropped entirely when the window has no moves, so the chart
   * then simply ends at the line. (Agreed 2026-09-09, built 2026-10-01.)
   */
  const BASE = PAD_T + H;
  const stripH = totals.events > 0 ? EVENT_H : 0;
  const SVG_H = BASE + stripH + PAD_B;

  return (
    <div className="flex flex-col gap-[14px]">
      <Panel variant="raised" className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">Activity</div>
            <h2 className="mt-1 text-[19px] leading-tight">What you have been doing</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="segbar">
              {[30, 90, 180].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="seg-opt !px-[13px] !text-[12.5px]"
                  data-active={range === n}
                  onClick={() => onRangeChange(n)}
                >
                  {n}d
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost text-[12px]"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
            >
              {showTable ? "Chart" : "Table"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-faint">
          <span>
            <span className="text-text">{totals.tasks}</span> TASKS DONE
          </span>
          <span>
            <span className="text-text">{totals.events}</span> PIPELINE MOVES
          </span>
          <span>
            <span className="text-text">{totals.activeDays}</span>/{days.length} ACTIVE DAYS
          </span>
        </div>

        {totals.tasks === 0 && totals.events === 0 ? (
          <Empty>
            Nothing recorded in this window yet. Completed tasks and application stage
            changes both land here as you go.
          </Empty>
        ) : showTable ? (
          <TimelineTable data={data} />
        ) : (
          <>
            <div className="relative mt-3">
              <svg
                viewBox={`0 0 ${W} ${SVG_H}`}
                className="w-full"
                role="img"
                aria-label={`Daily completed tasks and pipeline moves over the last ${range} days`}
                onMouseLeave={() => setHover(null)}
              >
                {/* Gridlines and the y-axis, kept recessive. */}
                {ticks.map((t) => {
                  const y = PAD_T + H - (t / peak) * H;
                  return (
                    <g key={t}>
                      <line
                        x1={PAD_L}
                        x2={W}
                        y1={y}
                        y2={y}
                        stroke="var(--color-edge-soft)"
                        strokeWidth={1}
                      />
                      <text
                        x={PAD_L - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize={9}
                        fill="var(--color-faint)"
                        fontFamily="var(--font-mono)"
                      >
                        {t}
                      </text>
                    </g>
                  );
                })}

                {days.map((day, i) => {
                  const x = PAD_L + i * colW + (colW - barW) / 2;
                  const isHover = hover?.date === day.date;

                  // Stacked task bar, drawn from the baseline up.
                  let yCursor = BASE;
                  const segments = presentTypes
                    .map((type) => {
                      const n = day.tasksByType[type] ?? 0;
                      if (n === 0) return null;
                      const h = (n / peak) * H;
                      yCursor -= h;
                      return { type, n, y: yCursor, h };
                    })
                    .filter(Boolean) as { type: TaskType; n: number; y: number; h: number }[];

                  return (
                    <g key={day.date}>
                      {/* A full-height hit target: the bar itself is too thin
                          to aim at, and empty days need a tooltip too. */}
                      <rect
                        x={PAD_L + i * colW}
                        y={0}
                        width={colW}
                        height={SVG_H}
                        fill={isHover ? "var(--color-edge-soft)" : "transparent"}
                        onMouseEnter={() => setHover(day)}
                      />

                      {segments.map((seg, si) => {
                        const isTop = si === segments.length - 1;
                        const h = Math.max(1, seg.h - (si > 0 ? GAP : 0));
                        return (
                          <rect
                            key={seg.type}
                            x={x}
                            y={seg.y + (si > 0 ? GAP : 0)}
                            width={barW}
                            height={h}
                            rx={isTop ? Math.min(3, barW / 2) : 0}
                            fill={TASK_TYPE_VAR[seg.type]}
                            pointerEvents="none"
                          />
                        );
                      })}

                      {/* Pipeline moves hang below the line rather than stacking
                          onto the tasks — effort spent and results arriving
                          are different units, and summing them means nothing. */}
                      {day.eventTotal > 0
                        ? (() => {
                            const h = Math.max(3, (day.eventTotal / eventPeak) * (EVENT_H - 8));
                            return (
                              <rect
                                x={x}
                                y={BASE + GAP}
                                width={barW}
                                height={h}
                                rx={Math.min(2, barW / 2)}
                                fill="var(--color-neutral-500)"
                                pointerEvents="none"
                              />
                            );
                          })()
                        : null}
                    </g>
                  );
                })}

                {/* The one shared line. */}
                <line
                  x1={PAD_L} x2={W} y1={BASE} y2={BASE}
                  stroke="var(--color-edge-strong)" strokeWidth={1}
                />
                {stripH > 0 ? (
                  <text
                    x={PAD_L - 6}
                    y={BASE + GAP + (EVENT_H - 8) + 3}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--color-faint)"
                    fontFamily="var(--font-mono)"
                  >
                    {eventPeak}
                  </text>
                ) : null}

                {/* Date labels, thinned so they never collide. */}
                {days.map((day, i) => {
                  const every = Math.ceil(days.length / 10);
                  if (i % every !== 0) return null;
                  return (
                    <text
                      key={day.date}
                      x={PAD_L + i * colW + colW / 2}
                      y={BASE + stripH + 12}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--color-faint)"
                      fontFamily="var(--font-mono)"
                    >
                      {formatShortDate(day.date)}
                    </text>
                  );
                })}
              </svg>

              {hover ? <DayTooltip day={hover} /> : null}
            </div>

            {/* A legend is always present for two or more series. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {presentTypes.map((type) => (
                <span key={type} className="flex items-center gap-[6px] text-[11px] text-muted">
                  <span
                    className="size-[8px] rounded-[2px]"
                    style={{ background: TASK_TYPE_VAR[type] }}
                    aria-hidden
                  />
                  {TASK_TYPE_LABEL[type]}
                </span>
              ))}
              {presentStages.length > 0 ? (
                <span className="flex items-center gap-[6px] text-[11px] text-faint">
                  <span
                    className="size-[8px] rounded-[2px]"
                    style={{ background: "var(--color-neutral-500)" }}
                    aria-hidden
                  />
                  Pipeline moves (below the line)
                </span>
              ) : null}
            </div>
          </>
        )}
      </Panel>

      {/*
        Between the activity chart and the detail list, not after both: the two
        charts answer the same window and belong beside each other, and the
        detail list is long enough that anything below it is never seen.
      */}
      {below}

      <RecentActivity data={data} />
    </div>
  );
}

/** Whole-number gridlines, at most four of them. */
function niceTicks(peak: number): number[] {
  const step = Math.max(1, Math.ceil(peak / 4));
  const out: number[] = [];
  for (let v = step; v <= peak; v += step) out.push(v);
  return out;
}

function DayTooltip({ day }: { day: TimelineDay }) {
  const types = Object.entries(day.tasksByType) as [TaskType, number][];
  const stages = Object.entries(day.eventsByStage) as [Stage, number][];

  return (
    <div
      className="pointer-events-none absolute right-0 top-0 rounded-lg px-3 py-2 text-[12px]"
      style={{
        background: "color-mix(in oklab, var(--color-surface) 94%, transparent)",
        border: "1px solid var(--color-edge-strong)",
        boxShadow: "0 8px 24px oklch(0% 0 0 / 0.5)",
        minWidth: 172,
      }}
      role="status"
    >
      <div className="font-mono text-[10.5px] text-faint">
        {weekdayLabel(day.date)} {formatShortDate(day.date)}
      </div>
      {types.length === 0 && stages.length === 0 ? (
        <div className="mt-1 text-muted">Nothing logged</div>
      ) : null}
      {types.map(([type, n]) => (
        <div key={type} className="mt-1 flex items-center gap-2">
          <span
            className="size-[8px] flex-none rounded-[2px]"
            style={{ background: TASK_TYPE_VAR[type] }}
            aria-hidden
          />
          <span className="flex-1 text-dim">{TASK_TYPE_LABEL[type]}</span>
          <span className="font-mono">{n}</span>
        </div>
      ))}
      {stages.map(([stage, n]) => (
        <div key={stage} className="mt-1 flex items-center gap-2">
          <span
            className="size-[8px] flex-none rounded-full"
            style={{ background: stageColor(stage) }}
            aria-hidden
          />
          <span className="flex-1 text-dim">→ {STAGE_LABEL[stage]}</span>
          <span className="font-mono">{n}</span>
        </div>
      ))}
    </div>
  );
}

/** The accessible equivalent of the chart, and useful in its own right. */
function TimelineTable({ data }: { data: TimelineData }) {
  const rows = data.days.filter((d) => d.taskTotal > 0 || d.eventTotal > 0).reverse();
  return (
    <div className="mt-3 max-h-[360px] overflow-y-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="micro">
            <th className="py-1 text-left font-normal">Day</th>
            <th className="py-1 text-right font-normal">Tasks</th>
            <th className="py-1 text-left font-normal">Breakdown</th>
            <th className="py-1 text-right font-normal">Moves</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.date} className="border-t border-edge-soft">
              <td className="py-[6px] font-mono text-[11.5px]">
                {formatShortDate(day.date)}
              </td>
              <td className="py-[6px] text-right font-mono">{day.taskTotal || "—"}</td>
              <td className="py-[6px] text-dim">
                {(Object.entries(day.tasksByType) as [TaskType, number][])
                  .map(([t, n]) => `${TASK_TYPE_LABEL[t]} ${n}`)
                  .join(" · ") || "—"}
              </td>
              <td className="py-[6px] text-right font-mono">{day.eventTotal || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What exactly happened, newest first — the detail the chart abstracts away. */
function RecentActivity({ data }: { data: TimelineData }) {
  const entries = data.entries;
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineData["entries"]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return [...map.entries()];
  }, [entries]);

  if (grouped.length === 0) return null;

  return (
    <Panel className="p-4">
      <div className="kicker mb-3">Detail</div>
      <div className="flex flex-col gap-4">
        {grouped.slice(0, 30).map(([date, entries]) => (
          <div key={date}>
            <div className="mb-2 font-mono text-[10.5px] text-faint">
              {weekdayLabel(date)} {formatShortDate(date)}
            </div>
            <div className="flex flex-col gap-[6px]">
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-[9px] text-[12.5px]">
                  {entry.kind === "task" ? (
                    <>
                      <span
                        className="size-[8px] flex-none rounded-[2px]"
                        style={{ background: TASK_TYPE_VAR[entry.task_type] }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                      <span className="flex-none text-[11px] text-faint">
                        {TASK_TYPE_LABEL[entry.task_type]}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="size-[8px] flex-none rounded-full"
                        style={{ background: stageColor(entry.to_stage) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-dim">{entry.title}</span>
                      <span className="flex-none text-[11px] text-faint">
                        {entry.from_stage
                          ? `${STAGE_LABEL[entry.from_stage]} → ${STAGE_LABEL[entry.to_stage]}`
                          : `Logged as ${STAGE_LABEL[entry.to_stage]}`}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
