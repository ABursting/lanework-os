"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { formatShortDate } from "@/lib/time";
import type { CumulativePoint } from "@/lib/db/timeline";

/**
 * The running total of applications submitted.
 *
 * ── Why cumulative rather than per-day ──────────────────────────────────────
 * A per-day count of a job search is mostly zeroes with the odd spike, which
 * reads as noise. A line that only ever climbs makes the *slope* the message:
 * a flat stretch is a fortnight that got away, a steep one is a week that went
 * well. That is the question this answers — "is this still moving, and how
 * fast" — and it is the only chart here where the shape matters more than any
 * individual value.
 *
 * ── Form ────────────────────────────────────────────────────────────────────
 * One series, so there is no legend: the heading names it. A line rather than
 * bars because the quantity is continuous and monotonic — bars would imply
 * each day is a separate magnitude worth comparing, and they are not. The fill
 * beneath is decoration for the eye, not a second encoding, so it is the same
 * hue at low strength.
 *
 * The y-axis starts at the window's own first value rather than at zero. That
 * would normally be a lie — truncating an axis exaggerates change — but this
 * line is a running total that began before the window, so zero is not its
 * origin and pretending otherwise would flatten every recent week into
 * invisibility. The starting value is printed on the axis so the baseline is
 * never implied.
 */

const W = 1000;
const H = 120;
const PAD_T = 10;
const PAD_B = 18;

export function CumulativeApplications({ points }: { points: CumulativePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <Panel variant="raised" className="p-4">
        <div className="kicker">Applications sent</div>
        <p className="m-0 mt-2 text-[12.5px] text-faint">
          Not enough history in this range to draw a trend yet.
        </p>
      </Panel>
    );
  }

  const first = points[0].total;
  const last = points[points.length - 1].total;
  const added = last - first;

  const min = first;
  const max = Math.max(last, min + 1);
  const span = max - min;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (total: number) => PAD_T + (1 - (total - min) / span) * (H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`;

  /** Days in the window that added at least one application. */
  const activeDays = points.filter((p) => p.added > 0).length;
  const perWeek = added / Math.max(1, points.length / 7);

  const active = hover === null ? points.length - 1 : hover;
  const point = points[active];

  return (
    <Panel variant="raised" className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Applications sent</div>
          <h2 className="mt-1 text-[19px] leading-tight">Total over time</h2>
        </div>
        <div className="flex items-baseline gap-[14px] font-mono text-[11px] text-faint">
          <span>
            <span className="text-[15px] text-text">{last}</span> TOTAL
          </span>
          <span>
            <span className="text-[15px] text-accent">+{added}</span> THIS RANGE
          </span>
          <span>
            <span className="text-[15px] text-text">{perWeek.toFixed(1)}</span> / WEEK
          </span>
          <span>
            <span className="text-[15px] text-text">{activeDays}</span> ACTIVE DAYS
          </span>
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[120px] w-full"
          role="img"
          aria-label={`Applications submitted rose from ${first} to ${last} over this range.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - box.left) / box.width;
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
          }}
        >
          <defs>
            <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Baseline only. A grid would compete with a line whose whole point
              is its shape. */}
          <line
            x1="0" y1={H - PAD_B} x2={W} y2={H - PAD_B}
            stroke="var(--color-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />

          <path d={area} fill="url(#cumulative-fill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* The crosshair. Drawn only on hover, so the resting state is the
              shape and nothing else. */}
          {hover !== null ? (
            <line
              x1={x(hover)} y1={PAD_T} x2={x(hover)} y2={H - PAD_B}
              stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke" opacity="0.6"
            />
          ) : null}

          <circle
            cx={x(active)}
            cy={y(point.total)}
            r="4"
            fill="var(--color-accent)"
            stroke="var(--color-bg)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The axis ends, so the baseline is stated rather than implied. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between font-mono text-[10px] text-ghost">
          <span>{formatShortDate(points[0].date)}</span>
          <span>{formatShortDate(points[points.length - 1].date)}</span>
        </div>
      </div>

      <p className="m-0 mt-2 text-[12px] text-muted">
        <span className="font-mono text-faint">{point.date}</span> — {point.total} submitted in
        total
        {point.added > 0 ? `, ${point.added} that day` : ""}.
        {first > 0 ? (
          <span className="ml-[6px] text-faint">
            The line starts at {first}, not zero: that many were already sent before this range.
          </span>
        ) : null}
      </p>
    </Panel>
  );
}
