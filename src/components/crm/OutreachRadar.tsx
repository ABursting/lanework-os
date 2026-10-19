"use client";

import { useCallback, useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { Panel } from "@/components/ui/Panel";
import { Empty } from "@/components/ui/Empty";
import { safeHref } from "@/lib/display";
import type { RadarRun, RadarStep } from "@/lib/outreach/types";

/**
 * The outreach radar.
 *
 * ── The redesign, 2026-10-16 ────────────────────────────────────────────────
 * The first version was built for the information and not for the page, and it
 * showed. Four things were wrong, and they are worth naming because they are
 * the same four mistakes any page here could make:
 *
 *   - It inherited the CRM's 1800px width. That is right for a six-column
 *     board and wrong for one column of prose, which ended as short lines
 *     stranded on the left of a very wide screen.
 *   - It explained itself in a paragraph of 10.5px monospace. Monospace is for
 *     small meta labels in this design; a sentence set in it reads as a log
 *     file, not as an interface.
 *   - Its two actions were a ghost button and a bare one, which next to each
 *     other read as two pieces of text rather than the free action and the
 *     expensive one.
 *   - It rendered a full-height panel to say "Nobody to message yet", and then
 *     told the operator to go and tick a box on a different page - while being
 *     the page that knows which boxes are worth ticking.
 *
 * So: a reading-width column, the kicker-and-heading the rest of the dashboard
 * uses, two buttons that look like what they cost, no panel for an empty set,
 * and a watchlist that can be ticked here.
 */

/**
 * ── The second redesign, 2026-10-19 ─────────────────────────────────────────
 * The watchlist is gone. Choosing a role used to mean ticking a box that was
 * saved to the application and stayed ticked forever, so the radar ran against
 * a standing list you had to remember to curate. In practice nothing was ever
 * ticked, which is the clearest verdict a feature can get.
 *
 * It is now a selection, not a setting: pick roles, run the check, and the
 * picks evaporate. Nothing is written to the database by choosing, which also
 * means choosing is instant. All / Recent / a search box, because ticking
 * thirty roles one at a time is the same dead end by a slower route.
 */

/** A submitted role the radar can be pointed at. */
export interface SelectableRole {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  /** When it was applied for — the sort key, newest first. */
  appliedOn: string;
  /** Applied within the last week; "Recent" selects exactly these. */
  recent: boolean;
  /** How many of your connections work there already. */
  knownHere: number;
}

const STEP_COLOR: Record<RadarStep["kind"], string> = {
  read: "var(--color-lane-secondary)",
  match: "var(--color-accent)",
  search: "var(--color-warn)",
  draft: "var(--color-pass)",
  skip: "var(--color-faint)",
};

/**
 * The run's steps.
 *
 * A dot in the step's own colour rather than the glyphs the first version used
 * (a triangle, a bowtie, a dash). Those needed a key nobody was given; a dot
 * carries the same grouping without pretending to be a symbol.
 */
function Steps({ steps }: { steps: RadarStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-[10px] text-[12.5px]">
          <span
            aria-hidden
            className="mt-[6px] size-[6px] flex-none rounded-full"
            style={{ background: STEP_COLOR[step.kind] }}
          />
          <span className="min-w-0 flex-1">
            <span className="text-dim">{step.label}</span>
            {step.count !== undefined ? (
              <span className="ml-[7px] font-mono text-[11px] text-accent">{step.count}</span>
            ) : null}
            {step.detail ? (
              <span className="mt-[2px] block text-[11.5px] leading-snug text-faint">
                {step.detail}
              </span>
            ) : null}
          </span>
          {step.ms !== undefined ? (
            <span className="mt-[1px] flex-none font-mono text-[10.5px] text-ghost">
              {step.ms >= 1000 ? `${(step.ms / 1000).toFixed(1)}s` : `${step.ms}ms`}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Draft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="mt-[9px] rounded-[8px] p-[11px] text-[12.5px] leading-relaxed"
      style={{
        background: "color-mix(in oklab, var(--color-text) 4%, transparent)",
        border: "1px solid var(--color-edge-soft)",
      }}
    >
      <p className="m-0 whitespace-pre-wrap text-dim">{text}</p>
      <button
        type="button"
        className="btn btn-secondary mt-[9px] !px-[9px] !py-[2px] !text-[11px]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // Clipboard access can be refused; the text is on screen regardless.
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function OutreachRadar({
  connectionCount,
  roles,
}: {
  connectionCount: number;
  roles: SelectableRole[];
}) {
  const [run, setRun] = useState<RadarRun | null>(null);
  const [busy, setBusy] = useState<"quick" | "deep" | "draft" | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** The roles this run is about. Ephemeral by design — never saved. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  /** True once the paid web search has run, so it is not offered twice. */
  const [searched, setSearched] = useState(false);
  /** Set when the demo's daily budget sent back recorded drafts instead. */
  const [draftsReplayed, setDraftsReplayed] = useState(false);
  const report = useReportError();

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? roles.filter(
        (r) =>
          r.company_name.toLowerCase().includes(needle) ||
          r.role_title.toLowerCase().includes(needle),
      )
    : roles;

  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const togglePick = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /*
    Bulk select acts on what is on screen, not on everything. With a search
    term typed, "All" meaning "all thirty roles including the twenty-seven you
    just filtered out" would be a trap.
  */
  const selectAll = () => setPicked(new Set(visible.map((r) => r.id)));
  const selectRecent = () =>
    setPicked(new Set(visible.filter((r) => r.recent).map((r) => r.id)));
  const clearPicks = () => setPicked(new Set());

  /**
   * Run the radar over the picked roles.
   *
   * `deep` is the half that costs money: one web search per company where
   * nobody is known. It is never the first thing that happens — the free
   * check runs first, and the search is offered afterwards against the gaps
   * it found, so you can see what you would be paying to look for.
   */
  async function go(deep: boolean) {
    if (picked.size === 0) return;
    setBusy(deep ? "deep" : "quick");
    setSelected(new Set());
    setDraftsReplayed(false);
    try {
      const params = new URLSearchParams();
      if (deep) params.set("search", "1");
      for (const id of picked) params.append("application_id", id);

      const result = await api.post<RadarRun>(`/api/outreach/run?${params}`);
      setRun(result);
      if (deep) setSearched(true);
    } catch (err) {
      report("run the outreach radar", err);
      console.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  /*
    How many distinct employers the gaps cover. The searching is per company
    and billed per company, so this is the number the page must quote.
  */
  const gapCompanies = run
    ? new Set(run.gaps.map((g) => g.company_name.toLowerCase())).size
    : 0;

  /** Back to the picker, keeping the picks so a near-miss can be adjusted. */
  function chooseAgain() {
    setRun(null);
    setSearched(false);
    setSelected(new Set());
  }

  /** Draft for the ticked people only. One call, and only what was asked for. */
  async function draftSelected() {
    if (!run || selected.size === 0) return;
    const indexes = [...selected].sort((a, b) => a - b);

    setBusy("draft");
    try {
      const { drafts, replayed } = await api.post<{
        drafts: { index: number; message: string }[];
        replayed?: boolean;
      }>("/api/outreach/draft", { leads: indexes.map((i) => run.leads[i]) });
      setDraftsReplayed(Boolean(replayed));

      // The route is given a compacted list, so its indexes are positions in
      // that list - mapped back here rather than assuming they line up.
      const next = run.leads.map((l) => ({ ...l }));
      for (const { index, message } of drafts) {
        const target = indexes[index];
        if (target !== undefined && message) next[target].draft = message;
      }
      setRun({ ...run, leads: next });
      setSelected(new Set());
    } catch (err) {
      report("draft those messages", err);
      console.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    /* A reading column. The CRM's own 1800px is for the board, not for this. */
    <div className="mx-auto flex max-w-[920px] flex-col gap-[14px]">
      <Panel variant="raised" className="p-4">
        <div className="min-w-0">
          <div className="kicker">Outreach</div>
          <h2 className="mt-1 text-[19px] leading-tight">Who you already know</h2>
          <p className="m-0 mt-[5px] max-w-[54ch] text-[12.5px] leading-snug text-muted">
            Pick the roles you want to reach out about, and this checks your LinkedIn
            connections against those companies. Where you know nobody, it can then search
            the open web for alumni — that half costs money, and is offered afterwards
            against what the free check missed, never before it.
          </p>
        </div>

        <div className="mt-[12px] flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-edge-soft pt-[10px] font-mono text-[10.5px] tracking-[0.04em] text-faint">
          <span>{connectionCount} CONNECTIONS</span>
          <span>{roles.length} APPLIED</span>
          <span>NOTHING IS EVER SENT FOR YOU</span>
          <span className="flex-1" />
          {run !== null ? (
            <button
              type="button"
              className="btn btn-ghost !py-[2px] font-mono !text-[10.5px] tracking-[0.04em]"
              onClick={chooseAgain}
            >
              CHOOSE AGAIN
            </button>
          ) : null}
        </div>
      </Panel>

      {/*
        Step one: the picker. Two screens rather than one, because a list of
        every role you have applied to is noise the moment the question has
        narrowed to "which of these four people do I write to".
      */}
      {run === null ? (
        roles.length === 0 ? (
          <Empty>
            Nothing to reach out about yet — roles appear here once they leave Researching.
          </Empty>
        ) : (
          <Panel className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="kicker">Step one</div>
                <h3 className="m-0 mt-1 text-[14px] leading-tight">Which roles?</h3>
              </div>
              <span className="font-mono text-[10.5px] text-faint">
                {picked.size} OF {roles.length} PICKED
              </span>
            </div>

            <div className="mt-[11px] flex flex-wrap items-center gap-2">
              <input
                type="search"
                className="input min-w-[170px] flex-1 !py-[5px] !text-[12.5px]"
                placeholder="Search company or role…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search your applications"
              />
              {/* These act on what is on screen. With a search term typed, an
                  "All" that also picked the roles you just filtered out would
                  be a trap. */}
              <button
                type="button"
                className="btn btn-secondary !px-[10px] !py-[3px] !text-[11.5px]"
                onClick={selectAll}
              >
                {needle ? "All shown" : "All"}
              </button>
              <button
                type="button"
                className="btn btn-secondary !px-[10px] !py-[3px] !text-[11.5px]"
                onClick={selectRecent}
              >
                Last 7 days
              </button>
              <button
                type="button"
                className="btn btn-ghost !px-[10px] !py-[3px] !text-[11.5px]"
                onClick={clearPicks}
                disabled={picked.size === 0}
              >
                Clear
              </button>
            </div>

            <ul className="m-0 mt-[10px] flex max-h-[380px] list-none flex-col gap-[4px] overflow-y-auto p-0">
              {visible.map((role) => {
                const on = picked.has(role.id);
                return (
                  <li key={role.id}>
                    <label
                      className="flex cursor-pointer items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] transition-colors"
                      style={{
                        background: on
                          ? "color-mix(in oklab, var(--color-accent) 11%, transparent)"
                          : "color-mix(in oklab, var(--color-surface) 65%, transparent)",
                        border: `1px solid ${on ? "color-mix(in oklab, var(--color-accent) 34%, transparent)" : "var(--color-edge-soft)"}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        className="flex-none accent-[var(--color-accent)]"
                        checked={on}
                        onChange={() => togglePick(role.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px]">{role.company_name}</span>
                        <span className="block truncate text-[11.5px] text-muted">
                          {role.role_title}
                        </span>
                      </span>
                      {role.knownHere > 0 ? (
                        <span
                          className="flex-none rounded-full px-[8px] py-[2px] text-[10.5px]"
                          style={{
                            color: "var(--color-accent)",
                            background: "color-mix(in oklab, var(--color-accent) 14%, transparent)",
                          }}
                        >
                          {role.knownHere} known
                        </span>
                      ) : null}
                      <span className="w-[72px] flex-none text-right font-mono text-[10px] text-ghost">
                        {role.stage.toUpperCase()}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {visible.length === 0 ? (
              <p className="m-0 mt-[10px] text-[12px] text-faint">
                {`Nothing matches "${query.trim()}".`}
              </p>
            ) : null}

            <div className="mt-[13px] flex flex-wrap items-center justify-between gap-3 border-t border-edge-soft pt-[12px]">
              <span className="text-[11.5px] text-faint">
                Free and instant — two lists compared. No model call, nothing written.
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => go(false)}
                disabled={busy !== null || picked.size === 0}
              >
                {busy === "quick"
                  ? "Checking…"
                  : picked.size === 0
                    ? "Pick some roles"
                    : `Check ${picked.size} for connections`}
              </button>
            </div>
          </Panel>
        )
      ) : null}

      {run ? (
        <>
          {/*
            Which parts were real. It used to say "this is a recorded run" over
            everything, which stopped being true when the demo started doing
            its own matching — and a label that overstates what is fake is the
            same failure as one that overstates what is real.
          */}
          {run.replayed === "search" || run.recorded ? (
            <div
              className="rounded-[10px] px-[12px] py-[9px] text-[12.5px] leading-snug"
              style={{
                color: "var(--color-warn)",
                background: "color-mix(in oklab, var(--color-warn) 12%, transparent)",
                border: "1px solid color-mix(in oklab, var(--color-warn) 30%, transparent)",
              }}
              role="note"
            >
              <strong>The web search in this run is replayed.</strong> The connection
              matching above it really ran, against this demo&rsquo;s own fictional
              contacts. The search did not: a live one would cost money per visitor and
              would be looking up real strangers on behalf of a student who does not
              exist. Everyone named here is invented.
            </div>
          ) : null}

          {draftsReplayed ? (
            <div className="text-[11.5px] leading-snug text-faint" role="note">
              Today&rsquo;s limit for live drafting is spent, so these are the recorded
              drafts. The cap is for the whole demo, not per visitor — it resets tomorrow.
            </div>
          ) : null}

          <Panel className="p-4">
            <div className="kicker">Run</div>
            <h3 className="m-0 mb-[12px] mt-1 text-[14px] leading-tight">What it did</h3>
            <Steps steps={run.steps} />
          </Panel>

          {/* No panel for an empty set. The run's own steps already say that
              nothing was found, and a box saying it again is furniture. */}
          {run.leads.length > 0 ? (
            <Panel className="p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="kicker">Leads</div>
                  <h3 className="m-0 mt-1 text-[14px] leading-tight">
                    Worth messaging
                    <span className="ml-[8px] font-mono text-[11px] text-faint">
                      {run.leads.length}
                    </span>
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-primary !px-[10px] !py-[3px] !text-[11.5px]"
                  onClick={draftSelected}
                  disabled={busy !== null || selected.size === 0}
                  title="Writes a message for each person you have ticked. Costs money."
                >
                  {busy === "draft"
                    ? "Drafting…"
                    : selected.size === 0
                      ? "Tick people to draft for"
                      : `Draft ${selected.size} message${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>

              <ul className="m-0 mt-[12px] flex list-none flex-col gap-[14px] p-0">
                {run.leads.map((lead, i) => {
                  const href = safeHref(lead.profile_url);
                  const evidence = safeHref(lead.evidence_url);
                  return (
                    <li
                      key={`${lead.application_id}-${i}`}
                      className="border-t border-edge-soft pt-[13px] first:border-t-0 first:pt-0"
                    >
                      <div className="flex items-start gap-[10px]">
                        <input
                          type="checkbox"
                          className="mt-[4px] flex-none accent-[var(--color-accent)]"
                          checked={selected.has(i)}
                          onChange={() => toggle(i)}
                          aria-label={`Draft a message to ${lead.person_name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
                            <span className="text-[13.5px] font-medium">{lead.person_name}</span>
                            {lead.person_role ? (
                              <span className="text-[12.5px] text-muted">{lead.person_role}</span>
                            ) : null}
                            <span
                              className="rounded-full px-[7px] py-[1px] text-[10.5px]"
                              style={{
                                color:
                                  lead.via === "connection"
                                    ? "var(--color-accent)"
                                    : "var(--color-warn)",
                                background:
                                  lead.via === "connection"
                                    ? "color-mix(in oklab, var(--color-accent) 14%, transparent)"
                                    : "color-mix(in oklab, var(--color-warn) 14%, transparent)",
                              }}
                            >
                              {lead.via === "connection" ? "You know them" : "Alumni — found on the web"}
                            </span>
                          </div>

                          <p className="m-0 mt-[3px] text-[12px] text-faint">
                            for {lead.company_name} — {lead.role_title}
                            {lead.stage ? ` · ${lead.stage}` : ""}
                            {href ? (
                              <>
                                {" · "}
                                <a href={href} target="_blank" rel="noreferrer noopener" className="underline">
                                  profile
                                </a>
                              </>
                            ) : null}
                          </p>

                          {lead.evidence_note ? (
                            <p className="m-0 mt-[5px] text-[11.5px] leading-snug text-muted">
                              <span className="text-faint">Why them: </span>
                              {lead.evidence_note}
                              {evidence ? (
                                <>
                                  {" "}
                                  <a href={evidence} target="_blank" rel="noreferrer noopener" className="underline">
                                    source
                                  </a>
                                </>
                              ) : null}
                            </p>
                          ) : null}

                          {lead.draft ? <Draft text={lead.draft} /> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {/*
            The gaps, and the offer to go looking. This is the only place the
            paid search is reachable from, and deliberately: by the time it is
            shown you can see exactly which companies it would search and how
            many, so "costs money" is a number rather than a warning.
          */}
          {run.gaps.length > 0 ? (
            <Panel className="p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="kicker">Step two</div>
                  {/*
                    Counted in companies, because that is what a search costs
                    one of. The gaps are per role, so two roles at the same
                    employer are one search - saying "12 companies" when it
                    means 12 roles at 8 companies overstates the bill on the
                    button next to it.
                  */}
                  <h3 className="m-0 mt-1 text-[14px] leading-tight">
                    You know nobody at {gapCompanies}{" "}
                    {gapCompanies === 1 ? "company" : "companies"}
                    {run.gaps.length !== gapCompanies ? (
                      <span className="ml-[7px] font-mono text-[11px] text-faint">
                        {run.gaps.length} ROLES
                      </span>
                    ) : null}
                  </h3>
                </div>
                {!searched ? (
                  <button
                    type="button"
                    className="btn btn-primary flex-none"
                    onClick={() => go(true)}
                    disabled={busy !== null}
                    title="One web search per company, on public pages only. Costs money and takes about half a minute each."
                  >
                    {busy === "deep" ? "Searching…" : "Search the web for alumni"}
                  </button>
                ) : null}
              </div>

              <p className="m-0 mt-[6px] max-w-[56ch] text-[11.5px] leading-snug text-faint">
                {searched
                  ? "Searched. Anyone found without a page the claim could be read from was dropped before it got here."
                  : "A search reads public pages for alumni who work there. Every person it returns must carry a source you can open — one without it is dropped rather than shown."}
              </p>

              <ul className="m-0 mt-[11px] flex list-none flex-col gap-[10px] p-0">
                {run.gaps.map((gap, i) => (
                  <li key={`${gap.application_id}-${i}`} className="text-[12.5px]">
                    <span className="font-medium">{gap.company_name}</span>
                    <span className="text-muted"> — {gap.role_title}</span>
                    <span className="mt-[2px] block text-[11.5px] leading-snug text-faint">
                      {gap.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {run.leads.length === 0 && run.gaps.length === 0 ? (
            <Empty>
              Nothing came back for the roles you picked. Choose again to try others.
            </Empty>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
