"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { LogTouchDialog } from "@/components/crm/LogTouchDialog";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { laneColor, tint } from "@/lib/display";
import { daysSince } from "@/lib/time";
import type { ContactRow } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * People you said you would chase, whose date has passed.
 *
 * Deliberately only explicit follow-up dates — not everyone who has gone quiet
 * for a month. That broader sweep is Compress's job, and it is a triage
 * session you sit down for. This is a short list of promises you made to
 * yourself, on the page you actually look at.
 *
 * The card hides itself entirely when nothing is due, rather than sitting
 * there saying "nothing to do" — an empty state you see every day stops
 * carrying information.
 */
export function FollowUps({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const [logging, setLogging] = useState<ContactRow | null>(null);
  /**
   * Contacts snoozed here, hidden at once and kept hidden until the server's
   * list no longer has them — not merely until the request returns, or a
   * refresh already in flight would put them back for a moment.
   */
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const report = useReportError();

  useEffect(() => {
    setSnoozed((prev) => {
      const next = prev.filter((id) => contacts.some((c) => c.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [contacts]);

  const shown = contacts.filter((c) => !snoozed.includes(c.id));
  if (shown.length === 0 && !logging) return null;

  /** Push the reminder out without claiming a conversation happened. */
  function snooze(contact: ContactRow, days: number) {
    setSnoozed((prev) => [...prev, contact.id]);
    void (async () => {
      try {
        await api.patch(`/api/contacts/${contact.id}`, {
          next_follow_up_at: new Date(Date.now() + days * 86_400_000).toISOString(),
        });
        startTransition(() => router.refresh());
      } catch (err) {
        setSnoozed((prev) => prev.filter((id) => id !== contact.id));
        report(`push back the follow-up with ${contact.name}`, err);
      }
    })();
  }

  return (
    <Panel className="p-[15px]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="kicker" style={{ color: "var(--color-warn)" }}>
          Follow up
        </div>
        <span className="font-mono text-[10px] text-faint">{shown.length} DUE</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {shown.map((contact) => {
          const color = laneColor(contact.derived_lane);
          const overdueBy = daysSince(contact.next_follow_up_at);
          return (
            <div key={contact.id} className="flex items-center gap-[9px]">
              <span
                className="grid size-[26px] flex-none place-items-center rounded-lg font-mono text-[10px]"
                style={{ color, background: tint(color, 16) }}
                aria-hidden
              >
                {initials(contact.name)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{contact.name}</div>
                <div className="truncate text-[11px] text-faint">
                  {[contact.role, contact.company_name].filter(Boolean).join(" · ") ||
                    "Independent"}
                </div>
              </div>

              <span
                className="flex-none font-mono text-[10px]"
                style={{ color: "var(--color-warn)" }}
                title={`Follow-up was due ${overdueBy ?? 0} day(s) ago`}
              >
                {overdueBy && overdueBy > 0 ? `${overdueBy}D` : "TODAY"}
              </span>

              <button
                type="button"
                className="btn btn-ghost flex-none !px-2 !py-[2px] text-[11.5px]"
                onClick={() => setLogging(contact)}
              >
                Log
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-none !px-1 !py-[2px] text-[11.5px] text-faint"
                onClick={() => snooze(contact, 7)}
                title="Push the reminder out a week"
              >
                +1w
              </button>
            </div>
          );
        })}
      </div>

      <Link
        href="/crm/compress"
        className="btn btn-ghost mt-2 !px-0 text-[11.5px] text-faint no-underline hover:text-text"
      >
        Everything that has gone quiet →
      </Link>

      {logging ? (
        <LogTouchDialog
          key={logging.id}
          contact={logging}
          onClose={() => setLogging(null)}
        />
      ) : null}
    </Panel>
  );
}
