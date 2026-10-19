import { STAGE_LABEL, stageColor } from "@/lib/display";
import { STAGES, type Stage } from "@/lib/types";

/**
 * The count strip above the board, plus the resume pass rate.
 *
 * The rate is the whole point of the sticky resume_passed marker: it answers
 * "is the resume getting me looked at" separately from "am I getting offers".
 * Its denominator is job applications actually submitted — anything still in
 * Researching has never been in front of a screen, and a grad program's
 * admissions are not a resume screen.
 *
 * The stage counts follow the board's Jobs / Grad school filter; the pass rate
 * does not, because it only ever describes jobs.
 */
export function StageSummary({
  counts,
  totalApplied,
  resumePassed,
  resumeConsidered,
  resumeRate,
}: {
  counts: Record<Stage, number>;
  /**
   * Everything ever submitted, wherever it sits now.
   *
   * The Applied tile shows this rather than the column's own length, because
   * the column count goes DOWN when a role moves to Interviewing - progress
   * reading as regress. "How much have I sent out" is a measure of effort and
   * only ever increases; "how many are still waiting" is the queue. They are
   * different questions and the tile now answers both.
   */
  totalApplied: number;
  resumePassed: number;
  resumeConsidered: number;
  resumeRate: number | null;
}) {
  const pct = resumeRate === null ? null : Math.round(resumeRate * 100);

  return (
    <div className="mb-[14px] flex flex-wrap gap-2">
      {STAGES.map((stage) => {
        // Applied alone is cumulative. Rejected and Archived are already
        // terminal, so their count never falls; a cumulative Interviewing
        // would double-count anyone who went on to an offer.
        const isApplied = stage === "applied";
        return (
          <div
            key={stage}
            className="min-w-[118px] flex-1 rounded-[10px] px-3 py-[10px] backdrop-blur-[12px]"
            style={{
              background: "color-mix(in oklab, var(--color-surface) 60%, transparent)",
              border: "1px solid var(--color-edge)",
              borderTop: `2px solid ${stageColor(stage)}`,
            }}
          >
            <div className="font-mono text-[20px] leading-none">
              {isApplied ? totalApplied : counts[stage]}
            </div>
            <div className="mt-[5px] text-[10.5px] uppercase tracking-[0.06em] text-muted">
              {STAGE_LABEL[stage]}
            </div>
            {isApplied ? (
              <div className="mt-[3px] text-[10.5px] text-faint" title="Still sitting in Applied with no reply yet">
                {counts.applied} awaiting reply
              </div>
            ) : null}
          </div>
        );
      })}

      <div
        className="min-w-[176px] flex-1 rounded-[10px] px-3 py-[10px]"
        style={{
          background:
            "linear-gradient(150deg, color-mix(in oklab, var(--color-accent-800) 60%, transparent), color-mix(in oklab, var(--color-surface) 55%, transparent))",
          border: "1px solid color-mix(in oklab, var(--color-accent) 30%, transparent)",
        }}
      >
        <div className="flex items-baseline gap-[7px]">
          <span className="font-mono text-[20px] leading-none text-accent">
            {pct === null ? "—" : `${pct}%`}
          </span>
          <span className="font-mono text-[11px] text-faint">
            {resumePassed}/{resumeConsidered}
          </span>
        </div>
        <div className="mt-[5px] text-[10.5px] uppercase tracking-[0.06em] text-dim">
          Resume pass rate · jobs
        </div>
      </div>
    </div>
  );
}
