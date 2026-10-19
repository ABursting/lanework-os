"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { addDays, formatRange, isoWeekNumber } from "@/lib/time";
import type { WeeklyReview } from "@/lib/types";

const SECTIONS = [
  { field: "wins", title: "Wins This Week", hint: "WHAT MOVED" },
  { field: "what_slipped", title: "What Slipped", hint: "BE HONEST" },
  { field: "open_loops", title: "Open Loops", hint: "STILL OPEN" },
  { field: "follow_up_people", title: "People to Follow Up With", hint: "FROM CRM" },
  { field: "next_week_top3", title: "Next Week's Top 3", hint: "PICK THREE" },
] as const;

type Field = (typeof SECTIONS)[number]["field"];

/**
 * The weekly review document.
 *
 * Fields autosave on blur. The auto-draft, when one has been generated, sits
 * beside each field as something to copy in — it is never written into the
 * field automatically, because the whole value of this page is that the words
 * in it are yours. Sealing locks the week.
 */
export function WeeklyReviewDoc({ review, week }: { review: WeeklyReview; week: string }) {
  const router = useRouter();
  const sealed = Boolean(review.sealed_at);

  const [values, setValues] = useState<Record<Field, string>>(() => ({
    wins: review.wins ?? "",
    what_slipped: review.what_slipped ?? "",
    open_loops: review.open_loops ?? "",
    follow_up_people: review.follow_up_people ?? "",
    next_week_top3: review.next_week_top3 ?? "",
  }));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const report = useReportError();
  const [drafting, setDrafting] = useState(false);
  const [sealing, setSealing] = useState(false);
  const dirty = useRef<Set<Field>>(new Set());

  // Server data can arrive after an edit (a refresh already in flight when you
  // typed). Fields you have touched keep their local value.
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      for (const { field } of SECTIONS) {
        if (!dirty.current.has(field)) next[field] = review[field] ?? "";
      }
      return next;
    });
  }, [review]);

  async function save(field: Field) {
    if (sealed) return;
    setStatus("saving");
    try {
      await api.patch("/api/review", { week_start: week, [field]: values[field] || null });
      dirty.current.delete(field);
      setStatus("saved");
      router.refresh();
    } catch (err) {
      report("save this week\u2019s review", err);
      setStatus("idle");
    }
  }

  async function generateDraft() {
    setDrafting(true);
    try {
      await api.post("/api/review/draft", { week_start: week });
      router.refresh();
    } catch (err) {
      report("generate the weekly draft", err);
    } finally {
      setDrafting(false);
    }
  }

  async function seal() {
    if (!confirm("Seal this week? The fields stop accepting edits afterwards.")) return;
    setSealing(true);
    try {
      await api.post("/api/review/seal", { week_start: week });
      router.refresh();
    } catch (err) {
      report("seal this week", err);
    } finally {
      setSealing(false);
    }
  }

  const draft = review.auto_draft;

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="flex items-end justify-between gap-4 border-b border-edge pb-[14px]">
        <div>
          <div className="kicker">Weekly review</div>
          <h1 className="mt-[6px] text-[30px] leading-tight">
            {formatRange(week, addDays(week, 6))}
          </h1>
          <div className="mt-[7px] font-mono text-[11px] text-faint">
            WEEK {isoWeekNumber(week)} ·{" "}
            {sealed
              ? `SEALED ${new Date(review.sealed_at!).toLocaleDateString()}`
              : status === "saving"
                ? "SAVING…"
                : status === "saved"
                  ? "DRAFT · SAVED"
                  : "DRAFT"}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          <Link href={`/review?week=${addDays(week, -7)}`} className="btn btn-ghost" aria-label="Previous week">
            ←
          </Link>
          <Link href={`/review?week=${addDays(week, 7)}`} className="btn btn-ghost" aria-label="Next week">
            →
          </Link>
          {!sealed ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={generateDraft}
                disabled={drafting}
              >
                {drafting ? "Reading the week…" : draft ? "Redraft" : "Auto-draft"}
              </button>
              <button
                type="button"
                className="btn btn-primary !px-[18px] !py-[9px] !text-[13px]"
                onClick={seal}
                disabled={sealing}
              >
                {sealing ? "Sealing…" : "Seal Week"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {sealed ? (
        <p className="mt-3 text-[12.5px] text-muted">
          This week is sealed. It is now a fixed record and is searchable from Brain.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {SECTIONS.map(({ field, title, hint }) => {
          const suggestion = draft?.[field]?.trim();
          const showSuggestion = Boolean(suggestion) && !sealed;

          return (
            <Panel key={field} className="px-[15px] py-[14px]">
              <div className="mb-[9px] flex items-baseline gap-[10px]">
                <h2 className="text-[15px]">{title}</h2>
                <span className="flex-1" />
                <span className="font-mono text-[10px] text-ghost">{hint}</span>
              </div>

              <textarea
                className="input min-h-[96px] text-[13.5px]"
                value={values[field]}
                readOnly={sealed}
                onChange={(e) => {
                  dirty.current.add(field);
                  setValues((v) => ({ ...v, [field]: e.target.value }));
                  setStatus("idle");
                }}
                onBlur={() => {
                  if (dirty.current.has(field)) void save(field);
                }}
                placeholder={sealed ? "—" : "…"}
              />

              {showSuggestion ? (
                <div
                  className="mt-2 rounded-lg px-3 py-2"
                  style={{
                    background: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--color-accent) 22%, transparent)",
                  }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="kicker">Draft</span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="btn btn-ghost !py-0 text-[11.5px]"
                      onClick={() => {
                        dirty.current.add(field);
                        setValues((v) => ({
                          ...v,
                          [field]: v[field] ? `${v[field]}\n${suggestion}` : suggestion!,
                        }));
                      }}
                    >
                      Use this
                    </button>
                  </div>
                  <p className="m-0 mt-1 whitespace-pre-line text-[12.5px] leading-[1.5] text-muted">
                    {suggestion}
                  </p>
                </div>
              ) : null}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
