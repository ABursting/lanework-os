"use client";

import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/demo";

/**
 * "What am I looking at?" — the demo's own guide.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Until 2026-10-19 the demo relied on being intuitive. That is a lot to ask of
 * a four-page app whose main input is a box you type a sentence into: a
 * visitor who does not already know what a capture bar is has no way to find
 * out, and the most interesting thing here is invisible until someone uses it.
 *
 * Closed by default, because a panel that covers the dashboard on arrival is
 * an advert for the dashboard rather than the dashboard. Open it and it
 * stays open across pages for this browser; close it and it stays shut. That
 * preference is the only thing this stores, and losing it costs nothing, which
 * is why a failed read is simply treated as "not opened yet".
 *
 * Demo only. On the real deployment it renders nothing — Asher does not need
 * to be told what his own dashboard does.
 */

const KEY = "lanework.demoGuide.open";

const PAGES: [name: string, what: string][] = [
  [
    "Home",
    "Today's three tasks, ranked by a plain formula — lane weight, deadline urgency, task type — not by a model. The AI only explains the order when you ask it to. Below that: the week's calendar with apply-by reminders, who you owe a reply, habits and weekly goals.",
  ],
  [
    "CRM",
    "The pipeline — Researching, Applied, Interviewing, Offer — plus companies, contacts and tasks. Compress is the triage view: everything that has gone quiet for longer than you chose. Outreach matches your LinkedIn connections against the companies you applied to.",
  ],
  [
    "Brain",
    "A searchable record of everything that happened: every capture, every pipeline move, every conversation logged, every task finished. It is the answer to “what did I actually do in October”.",
  ],
  [
    "Review",
    "A weekly review the AI drafts from that record, which you edit and seal. Plus a timeline of the whole search.",
  ],
];

export function DemoGuide() {
  const [open, setOpen] = useState(false);

  // Read after mount, never during render: the server has no localStorage, and
  // reading it while rendering would make the markup disagree with the DOM.
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(KEY) === "1");
    } catch {
      // Private windows and blocked site data both throw. Closed is correct.
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // The panel still works for this visit; only the memory of it is lost.
    }
  }

  if (!DEMO_MODE) return null;

  return (
    <div className="shrink-0 border-b border-edge bg-surface">
      {/*
        Centred and styled as a button, not a label.

        It was 10.5px muted monospace pinned to the right margin, which is this
        design's treatment for meta text nobody is expected to click - and so
        nobody did. On a demo whose entire job is to explain itself, the way in
        cannot be the quietest thing on the page. Accent rather than the
        banner's amber above it, so the two strips read as different kinds of
        message: one a disclaimer, one an invitation.
      */}
      <div className="mx-auto flex max-w-[1560px] items-center justify-center px-[18px] py-[7px]">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-[7px] rounded-full px-[13px] py-[4px] text-[12px] font-medium transition-[filter,background] hover:brightness-125"
          style={{
            color: "var(--color-accent)",
            background: "color-mix(in oklab, var(--color-accent) 13%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-accent) 34%, transparent)",
          }}
        >
          <span
            aria-hidden="true"
            className="grid size-[15px] flex-none place-items-center rounded-full text-[10px] font-bold"
            style={{ background: "color-mix(in oklab, var(--color-accent) 26%, transparent)" }}
          >
            ?
          </span>
          {open ? "Hide the guide" : "What am I looking at?"}
        </button>
      </div>

      {open ? (
        <div className="mx-auto max-w-[1560px] px-[18px] pb-[15px]">
          <p className="m-0 max-w-[76ch] text-[12.5px] leading-relaxed text-dim">
            A job search run as one system instead of a spreadsheet, an inbox and a
            to-do list. Everything here belongs to a student who does not exist, and it
            resets every night.
          </p>

          <p className="m-0 mt-[9px] max-w-[76ch] text-[12.5px] leading-relaxed text-dim">
            <strong className="text-text">Start with the bar at the bottom.</strong> Type
            a note the way you would text a friend — <em>&ldquo;rejected from Brightline,
            Northwind wants to interview, need to prep the case study&rdquo;</em> — or
            press one of the sample notes beside it. The AI reads it into proposed
            changes: a pipeline move, a new application with its deadline, a task, a
            logged conversation. <strong className="text-text">Nothing is written until
            you confirm it</strong> on the screen that follows. That rule is the point of
            the whole project: the model proposes, a person decides.
          </p>

          <dl className="m-0 mt-[13px] grid gap-x-[26px] gap-y-[9px] sm:grid-cols-2">
            {PAGES.map(([name, what]) => (
              <div key={name}>
                <dt className="kicker">{name}</dt>
                <dd className="m-0 mt-[3px] max-w-[52ch] text-[12px] leading-snug text-muted">
                  {what}
                </dd>
              </div>
            ))}
          </dl>

          <p className="m-0 mt-[13px] max-w-[76ch] text-[11.5px] leading-snug text-faint">
            What costs money is marked where it happens. The sample notes and the
            outreach web search are recordings; a note you type yourself, and the outreach
            drafts, are live model calls against a shared daily cap. When the cap is
            spent the demo says so rather than failing quietly.
          </p>
        </div>
      ) : null}
    </div>
  );
}
