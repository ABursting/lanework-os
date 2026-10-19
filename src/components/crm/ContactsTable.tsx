"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LaneFilter, type LaneFilterValue } from "./LaneFilter";
import { ContactDialog } from "./ContactDialog";
import { LogTouchDialog } from "./LogTouchDialog";
import { RowActions } from "./RowActions";
import { LaneBadge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { RELATIONSHIP_LABEL, laneColor, tint, touchColor, touchLabel } from "@/lib/display";
import { STALE_CONTACT_DAYS } from "@/lib/constants";
import { daysSince } from "@/lib/time";
import type { ContactRow } from "@/lib/types";

const GRID =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_112px_120px_92px_186px] gap-3";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function ContactsTable({
  contacts,
  companies,
}: {
  contacts: ContactRow[];
  companies: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilterValue>("all");
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [logging, setLogging] = useState<ContactRow | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const report = useReportError();
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Local truth until the server independently agrees — a refresh already in
  // flight when you clicked must not bring the row back.
  useEffect(() => {
    setRemoved((prev) => {
      const next = prev.filter((id) => contacts.some((c) => c.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [contacts]);

  function remove(contact: ContactRow) {
    setRemoved((prev) => [...prev, contact.id]);
    void (async () => {
      try {
        await api.del(`/api/contacts/${contact.id}`);
        startTransition(() => router.refresh());
      } catch (err) {
        setRemoved((prev) => prev.filter((id) => id !== contact.id));
        report(`delete ${contact.name}`, err);
      }
    })();
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (removed.includes(c.id)) return false;
      if (lane !== "all" && c.derived_lane !== lane) return false;
      if (!q) return true;
      return `${c.name} ${c.role ?? ""} ${c.company_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [contacts, query, lane, removed]);

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
            placeholder="Filter contacts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <LaneFilter value={lane} onChange={setLane} />
          <div className="flex-1" />
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + Contact
          </button>
        </div>

        <div className={`${GRID} px-4 py-[9px] micro`}>
          <div>Name</div>
          <div>Role · company</div>
          <div>Lane</div>
          <div>Relationship</div>
          <div>Last touch</div>
          <div className="text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <Empty>
            {contacts.length === 0
              ? "No contacts yet. Independent contacts — no company attached — are fine."
              : "No contacts match that filter."}
          </Empty>
        ) : (
          rows.map((contact) => {
            const days = daysSince(contact.last_contacted_at ?? contact.created_at);
            const color = laneColor(contact.derived_lane);
            return (
              <div
                key={contact.id}
                className={`group ${GRID} w-full items-center border-t border-edge-soft px-4 py-[11px] text-left transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)]`}
              >
                {/* Editing who someone is and recording that you spoke to them
                    are different acts, so they are different controls. */}
                <button
                  type="button"
                  onClick={() => setEditing(contact)}
                  className="flex min-w-0 items-center gap-[9px] text-left"
                >
                  <span
                    className="grid size-[26px] flex-none place-items-center rounded-lg font-mono text-[10px]"
                    style={{ color, background: tint(color, 16) }}
                    aria-hidden
                  >
                    {initials(contact.name)}
                  </span>
                  <span className="truncate text-[14px]">{contact.name}</span>
                  {contact.status === "dormant" ? (
                    <span className="flex-none text-[10px] uppercase tracking-[0.08em] text-faint">
                      dormant
                    </span>
                  ) : null}
                </button>
                <div className="truncate text-[12.5px] text-dim">
                  {[contact.role, contact.company_name ?? "Independent"]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="justify-self-start">
                  <LaneBadge lane={contact.derived_lane} />
                </div>
                <div className="text-[12px] text-muted">
                  {RELATIONSHIP_LABEL[contact.relationship_type]}
                </div>
                <div
                  className="font-mono text-[11.5px]"
                  style={{ color: touchColor(days, STALE_CONTACT_DAYS) }}
                >
                  {touchLabel(days)}
                </div>

                <div className="flex items-center justify-end gap-1">
                  {/* Logging a conversation is the thing you do most often
                      here, so it keeps its own button rather than hiding
                      behind the same treatment as the destructive one. */}
                  <button
                    type="button"
                    onClick={() => setLogging(contact)}
                    className="rounded-md px-2 py-[3px] text-[11.5px] text-faint opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
                    style={{ border: "1px solid var(--color-edge-strong)" }}
                    title={`Log a conversation with ${contact.name}`}
                  >
                    Log
                  </button>
                  <RowActions
                    label={contact.name}
                    onEdit={() => setEditing(contact)}
                    onDelete={() => remove(contact)}
                    detail={
                      <>
                        Removes {contact.name} from your contacts for good.
                        Conversations you logged with them stay in Brain as
                        written, but will no longer be attached to anyone.
                      </>
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing ? (
        <ContactDialog
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          contact={editing}
          companies={companies}
        />
      ) : null}
      {creating ? (
        <ContactDialog open onClose={() => setCreating(false)} companies={companies} />
      ) : null}
      {logging ? (
        <LogTouchDialog
          key={logging.id}
          contact={logging}
          onClose={() => setLogging(null)}
        />
      ) : null}
    </>
  );
}
