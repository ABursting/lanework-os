"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { RowActions } from "@/components/crm/RowActions";
import { MEMORY_KIND_LABEL, MEMORY_KIND_VAR } from "@/lib/display";
import { APP_TIMEZONE } from "@/lib/constants";
import type { MemoryEntryWithLink } from "@/lib/db/memory";

interface Payload {
  entries: MemoryEntryWithLink[];
  total: number;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Brain — search over everything that has happened.
 *
 * Every capture, stage change, completed task and sealed review lands in
 * memory_log; this is that table's only UI. Queries are debounced against the
 * search endpoint rather than filtered in the browser, because the point is
 * to search a history far larger than one page of it.
 */
export function BrainSearch({ initial }: { initial: Payload }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Payload>(initial);
  const [loading, setLoading] = useState(false);
  const report = useReportError();
  const [selectedId, setSelectedId] = useState<string | null>(initial.entries[0]?.id ?? null);
  /** Bumped to re-run the current search — after a delete the server disagreed with. */
  const [reloadKey, setReloadKey] = useState(0);

  // Guards against an earlier, slower request landing after a later one and
  // painting stale results over fresh ones.
  const requestId = useRef(0);

  useEffect(() => {
    const mine = ++requestId.current;
    const timer = setTimeout(
      () => {
        setLoading(true);
        api
          .get<Payload>(`/api/brain?q=${encodeURIComponent(query)}`)
          .then((next) => {
            if (mine !== requestId.current) return;
            setData(next);
            setSelectedId((current) =>
              next.entries.some((e) => e.id === current) ? current : next.entries[0]?.id ?? null,
            );
          })
          .catch((err) => {
            if (mine !== requestId.current) return;
            report("search Brain", err);
          })
          .finally(() => {
            if (mine === requestId.current) setLoading(false);
          });
      },
      query ? 220 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, report, reloadKey]);

  const selected = useMemo(
    () => data.entries.find((e) => e.id === selectedId) ?? null,
    [data.entries, selectedId],
  );

  /**
   * Delete a logged conversation from here, where you are most likely to find
   * it by searching. Same server path as the contact form, so it rolls the
   * contact's last-contacted date back the same way.
   *
   * Only conversations. Everything else in Brain is a record of something the
   * app did — a stage change, a completed task, a sealed review — and those are
   * undone at their source, not by deleting the line that describes them.
   */
  function removeConversation(entry: MemoryEntryWithLink) {
    if (!entry.source_id) return;
    const index = data.entries.findIndex((e) => e.id === entry.id);
    const neighbour = data.entries[index + 1] ?? data.entries[index - 1] ?? null;

    setData((d) => ({
      entries: d.entries.filter((e) => e.id !== entry.id),
      total: Math.max(0, d.total - 1),
    }));
    setSelectedId(neighbour?.id ?? null);

    api.del(`/api/contacts/${entry.source_id}/touches/${entry.id}`).catch((err) => {
      const preview = entry.text.length > 48 ? `${entry.text.slice(0, 48)}…` : entry.text;
      report(`delete the conversation \u201c${preview}\u201d`, err);
      // Re-run the search rather than restore: on a partial failure the entry
      // is already gone, and only the server knows which case this was.
      setReloadKey((k) => k + 1);
    });
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <div
        className="flex items-center gap-[11px] rounded-xl px-4 py-3 backdrop-blur-[16px]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--color-surface) 75%, transparent), color-mix(in oklab, var(--color-bg) 60%, transparent))",
          border: "1px solid color-mix(in oklab, var(--color-accent) 26%, transparent)",
          boxShadow: "0 12px 34px oklch(0% 0 0 / 0.4)",
        }}
      >
        <span className="font-mono text-[13px] text-accent" aria-hidden>
          ⌕
        </span>
        <input
          className="input min-h-[30px] flex-1 border-0 bg-transparent p-0 text-base"
          placeholder="search your recruiting history…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <span className="font-mono text-[10.5px] text-faint">
          {loading ? "SEARCHING…" : `${data.entries.length} MATCHES · ${data.total} ENTRIES INDEXED`}
        </span>
      </div>

      <div className="mt-[14px] grid grid-cols-[minmax(0,1fr)_420px] items-start gap-[14px]">
        <div className="flex flex-col gap-[7px]">
          {data.entries.length === 0 ? (
            <Panel className="p-4">
              <Empty>
                {query
                  ? `Nothing in your history matches “${query}”.`
                  : "Nothing logged yet. Captures, stage changes and completed tasks all land here."}
              </Empty>
            </Panel>
          ) : (
            data.entries.map((entry) => {
              const open = entry.id === selectedId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className="grid grid-cols-[88px_minmax(0,1fr)] gap-[14px] rounded-[10px] px-[14px] py-3 text-left transition-colors"
                  style={{
                    background: open
                      ? "color-mix(in oklab, var(--color-accent) 10%, transparent)"
                      : "color-mix(in oklab, var(--color-surface) 50%, transparent)",
                    border: `1px solid ${
                      open
                        ? "color-mix(in oklab, var(--color-accent) 36%, transparent)"
                        : "var(--color-edge-soft)"
                    }`,
                  }}
                >
                  <div>
                    <div className="font-mono text-[11.5px]">{formatDate(entry.occurred_at)}</div>
                    <div
                      className="mt-1 text-[9.5px] uppercase tracking-[0.08em]"
                      style={{ color: MEMORY_KIND_VAR[entry.source_type] }}
                    >
                      {MEMORY_KIND_LABEL[entry.source_type]}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[13px] leading-[1.45]">{entry.text}</div>
                    {entry.link ? (
                      <div className="mt-1 truncate text-[11px] text-faint">
                        <span className="font-mono text-accent">{entry.link.tag}</span>{" "}
                        {entry.link.label}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <Panel variant="raised" className="sticky top-0 p-4">
          {selected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="kicker">Full context</span>
                <span className="flex-1" />
                <span className="font-mono text-[10.5px] text-faint">
                  {formatDate(selected.occurred_at)}
                </span>
              </div>
              <div className="mt-[10px] flex items-center gap-[7px]">
                <span
                  className="rounded-[5px] px-2 py-[2px] text-[9.5px] uppercase tracking-[0.08em]"
                  style={{
                    color: MEMORY_KIND_VAR[selected.source_type],
                    background: `color-mix(in oklab, ${MEMORY_KIND_VAR[selected.source_type]} 15%, transparent)`,
                  }}
                >
                  {MEMORY_KIND_LABEL[selected.source_type]}
                </span>
              </div>
              <hr className="rule-fade my-[14px]" />
              <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.6] text-dim">
                {selected.text}
              </p>
              {selected.link ? (
                <div className="mt-4 flex items-center gap-[9px] rounded-lg px-[10px] py-2 text-[12px]"
                  style={{ background: "color-mix(in oklab, var(--color-text) 4%, transparent)" }}
                >
                  <span className="font-mono text-[10px] text-accent">{selected.link.tag}</span>
                  <span className="text-dim">{selected.link.label}</span>
                </div>
              ) : null}
              {selected.source_type === "contact_touch" && selected.source_id ? (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-edge-soft pt-3">
                  <span className="text-[11px] leading-[1.4] text-faint">
                    Deleting rolls this contact&rsquo;s Last contacted back to the conversation before it.
                  </span>
                  {/* keyed so a pending "Sure?" never carries over to the next entry */}
                  <RowActions
                    key={selected.id}
                    reveal="always"
                    label="this conversation"
                    onDelete={() => removeConversation(selected)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <Empty>Pick an entry to read it in full.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
