"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LaneFilter, type LaneFilterValue } from "./LaneFilter";
import { CompanyDialog } from "./CompanyDialog";
import { RowActions } from "./RowActions";
import { LaneBadge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { touchColor, touchLabel } from "@/lib/display";
import { STALE_APPLICATION_DAYS } from "@/lib/constants";
import { daysSince } from "@/lib/time";
import type { CompanyRow } from "@/lib/types";

const GRID =
  "grid grid-cols-[minmax(0,2fr)_112px_minmax(0,1.6fr)_84px_92px_124px] gap-3";

/**
 * The companies table.
 *
 * The lane chip here is derived from the company's live applications, not
 * stored — the scope keeps lane on the role because one employer can hold
 * roles in different lanes. A company with no live role shows no lane.
 */
export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilterValue>("all");
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const report = useReportError();
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Local truth until the server independently agrees.
  useEffect(() => {
    setRemoved((prev) => {
      const next = prev.filter((id) => companies.some((c) => c.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [companies]);

  function remove(company: CompanyRow) {
    setRemoved((prev) => [...prev, company.id]);
    void (async () => {
      try {
        await api.del(`/api/companies/${company.id}`);
        startTransition(() => router.refresh());
      } catch (err) {
        setRemoved((prev) => prev.filter((id) => id !== company.id));
        report(`delete ${company.name}`, err);
      }
    })();
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (removed.includes(c.id)) return false;
      if (lane !== "all" && c.derived_lane !== lane) return false;
      if (!q) return true;
      return `${c.name} ${c.sector ?? ""} ${c.open_roles.join(" ")}`.toLowerCase().includes(q);
    });
  }, [companies, query, lane, removed]);

  return (
    <>
      <div
        className="overflow-hidden rounded-xl backdrop-blur-[14px]"
        style={{
          background: "color-mix(in oklab, var(--color-surface) 60%, transparent)",
          border: "1px solid var(--color-edge)",
        }}
      >
        <div className="flex items-center gap-2 border-b border-edge px-[14px] py-3">
          <input
            className="input max-w-[260px]"
            placeholder="Filter companies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <LaneFilter value={lane} onChange={setLane} />
          <div className="flex-1" />
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + Company
          </button>
        </div>

        <div className={`${GRID} px-4 py-[9px] micro`}>
          <div>Company</div>
          <div>Lane</div>
          <div>Open roles</div>
          <div>Contacts</div>
          <div>Last touch</div>
          <div className="text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <Empty>
            {companies.length === 0
              ? "No companies yet. Add one, or let a capture create it for you."
              : "No companies match that filter."}
          </Empty>
        ) : (
          rows.map((company) => {
            const days = daysSince(company.last_touched_at);
            return (
              <div
                key={company.id}
                className={`group ${GRID} w-full items-center border-t border-edge-soft px-4 py-[11px] text-left transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)]`}
              >
                <button
                  type="button"
                  onClick={() => setEditing(company)}
                  className="flex min-w-0 items-center gap-[9px] text-left"
                  title="Edit this company"
                >
                  <span
                    className="h-[22px] w-[3px] flex-none rounded-[2px]"
                    style={{
                      background: company.derived_lane
                        ? `var(--color-lane-${company.derived_lane})`
                        : "var(--color-neutral-800)",
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] underline decoration-transparent underline-offset-2 transition-colors group-hover:decoration-[color-mix(in_oklab,var(--color-text)_35%,transparent)]">
                      {company.name}
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      {company.sector ?? "—"}
                    </span>
                  </span>
                </button>
                <div className="justify-self-start">
                  <LaneBadge lane={company.derived_lane} />
                </div>
                <div className="truncate text-[12.5px] text-dim">
                  {company.open_roles.length > 0 ? company.open_roles.join(" · ") : "—"}
                </div>
                <div className="font-mono text-[12px]">{company.contact_count}</div>
                <div
                  className="font-mono text-[11.5px]"
                  style={{ color: touchColor(days, STALE_APPLICATION_DAYS) }}
                >
                  {touchLabel(days)}
                </div>

                <RowActions
                  label={company.name}
                  onEdit={() => setEditing(company)}
                  onDelete={() => remove(company)}
                  detail={
                    <>
                      Deleting {company.name} also deletes{" "}
                      <strong>
                        {company.application_count} application
                        {company.application_count === 1 ? "" : "s"}
                      </strong>{" "}
                      filed against it, and their stage history.
                      {company.contact_count > 0 ? (
                        <>
                          {" "}
                          Its {company.contact_count} contact
                          {company.contact_count === 1 ? "" : "s"} are kept, and
                          become independent.
                        </>
                      ) : null}{" "}
                      Tasks linked to it are kept, without the company attached.
                    </>
                  }
                />
              </div>
            );
          })
        )}
      </div>

      {editing ? (
        <CompanyDialog key={editing.id} open onClose={() => setEditing(null)} company={editing} />
      ) : null}
      {creating ? <CompanyDialog open onClose={() => setCreating(false)} /> : null}
    </>
  );
}
