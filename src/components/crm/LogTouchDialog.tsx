"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import type { ContactRow } from "@/lib/types";

/** Common waits, so the usual case is one click rather than arithmetic. */
const PRESETS = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
] as const;

/**
 * Record a conversation with someone.
 *
 * The manual counterpart to what a capture proposes — same endpoint, same
 * result: their last-contacted date moves, the note becomes a dated entry in
 * Brain, and a reminder is set or cleared. Useful when you did not narrate the
 * conversation into the capture bar, which is most of the time.
 */
export function LogTouchDialog({
  contact,
  onClose,
}: {
  contact: ContactRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [followUpDays, setFollowUpDays] = useState<number | null>(7);
  const [saving, setSaving] = useState(false);
  const report = useReportError();

  async function save() {
    setSaving(true);
    try {
      await api.post(`/api/contacts/${contact.id}/touch`, {
        note: note.trim() || null,
        follow_up_in_days: followUpDays,
      });
      router.refresh();
      onClose();
    } catch (err) {
      report(`log the conversation with ${contact.name}`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Log a conversation with ${contact.name}`}
      width={520}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Log it"}
          </button>
        </>
      }
    >

      <Field label="What happened" hint="goes into Brain, searchable later">
        <textarea
          className="input min-h-[90px] text-[13.5px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Coffee chat — she suggested applying to the September posting rather than forcing the August one."
          autoFocus
        />
      </Field>

      <Field label="Follow up" hint="shows on Home once it is due">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setFollowUpDays(preset.days)}
              className="rounded-md px-[11px] py-[5px] text-[12px] transition-colors"
              style={{
                color:
                  followUpDays === preset.days ? "var(--color-accent)" : "var(--color-muted)",
                border: `1px solid ${
                  followUpDays === preset.days
                    ? "color-mix(in oklab, var(--color-accent) 42%, transparent)"
                    : "var(--color-edge-strong)"
                }`,
                background:
                  followUpDays === preset.days
                    ? "color-mix(in oklab, var(--color-accent) 12%, transparent)"
                    : "transparent",
              }}
              aria-pressed={followUpDays === preset.days}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFollowUpDays(null)}
            className="rounded-md px-[11px] py-[5px] text-[12px] transition-colors"
            style={{
              color: followUpDays === null ? "var(--color-accent)" : "var(--color-muted)",
              border: `1px solid ${
                followUpDays === null
                  ? "color-mix(in oklab, var(--color-accent) 42%, transparent)"
                  : "var(--color-edge-strong)"
              }`,
              background:
                followUpDays === null
                  ? "color-mix(in oklab, var(--color-accent) 12%, transparent)"
                  : "transparent",
            }}
            aria-pressed={followUpDays === null}
          >
            No reminder
          </button>
        </div>
      </Field>

      <p className="m-0 text-[11.5px] text-faint">
        This records something that already happened. Any follow-up date still
        outstanding is replaced — the conversation answers it.
      </p>
    </Dialog>
  );
}
