"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow, Select } from "@/components/ui/Field";
import { RowActions } from "./RowActions";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { RELATIONSHIP_LABEL } from "@/lib/display";
import { formatShortDate, toCivilDate } from "@/lib/time";
import { RELATIONSHIP_TYPES, type ContactRow, type RelationshipType } from "@/lib/types";

interface Touch {
  id: string;
  text: string;
  occurred_at: string;
}

/** A datetime-local value from an ISO timestamp, in the browser's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ContactDialog({
  open,
  onClose,
  contact,
  companies,
}: {
  open: boolean;
  onClose: () => void;
  contact?: ContactRow | null;
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const editing = Boolean(contact);

  const [name, setName] = useState(contact?.name ?? "");
  const [companyId, setCompanyId] = useState<string | null>(contact?.company_id ?? null);
  const [role, setRole] = useState(contact?.role ?? "");
  const [relationship, setRelationship] = useState<RelationshipType>(
    contact?.relationship_type ?? "other",
  );
  const [contactInfo, setContactInfo] = useState(contact?.contact_info ?? "");
  const [lastContacted, setLastContacted] = useState(toLocalInput(contact?.last_contacted_at ?? null));
  /**
   * Whether you have typed into Last contacted since opening the form. Deleting
   * a conversation updates that field to the rolled-back date — otherwise
   * pressing Save would write the old date straight back and undo the
   * rollback — but it never overwrites something you typed yourself.
   */
  const lastContactedTyped = useRef(false);
  const [nextFollowUp, setNextFollowUp] = useState(toLocalInput(contact?.next_follow_up_at ?? null));
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [saving, setSaving] = useState(false);
  // Local state holds validation only; a failed write goes to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();
  const [, startTransition] = useTransition();

  /** null while loading; "unavailable" if the read failed (the banner says why). */
  const [touches, setTouches] = useState<Touch[] | null | "unavailable">(null);
  const contactId = contact?.id ?? null;
  const contactName = contact?.name ?? "";

  // A read, not an AI call, and only for a contact that already exists.
  useEffect(() => {
    if (!contactId) return;
    let alive = true;
    api
      .get<Touch[]>(`/api/contacts/${contactId}/touches`)
      .then((rows) => {
        if (alive) setTouches(rows);
      })
      .catch((err) => {
        if (!alive) return;
        setTouches("unavailable");
        report(`load conversations with ${contactName}`, err);
      });
    return () => {
      alive = false;
    };
  }, [contactId, contactName, report]);

  /**
   * Delete one conversation. Immediate — unlike the fields above, it does not
   * wait for Save — and it rolls Last contacted back on the server.
   */
  function removeTouch(touch: Touch) {
    if (!contactId) return;
    const before = touches;
    setTouches((list) => (Array.isArray(list) ? list.filter((t) => t.id !== touch.id) : list));

    void (async () => {
      try {
        const res = await api.del<{ last_contacted_at: string | null; rolled_back: boolean }>(
          `/api/contacts/${contactId}/touches/${touch.id}`,
        );
        if (res.rolled_back && !lastContactedTyped.current) {
          setLastContacted(toLocalInput(res.last_contacted_at));
        }
      } catch (err) {
        report(`delete a conversation with ${contactName}`, err);
        // Re-read rather than restore: on a partial failure the conversation
        // is already gone, and only the server knows which case this was.
        api
          .get<Touch[]>(`/api/contacts/${contactId}/touches`)
          .then(setTouches)
          .catch(() => setTouches(before));
      } finally {
        startTransition(() => router.refresh());
      }
    })();
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        company_id: companyId,
        role: role || null,
        relationship_type: relationship,
        contact_info: contactInfo || null,
        notes: notes || null,
        last_contacted_at: lastContacted ? new Date(lastContacted).toISOString() : null,
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
      };
      if (editing) await api.patch(`/api/contacts/${contact!.id}`, payload);
      else await api.post("/api/contacts", payload);
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? `save ${name}` : "add the contact", err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contact) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/api/contacts/${contact.id}`);
      router.refresh();
      onClose();
    } catch (err) {
      report(`delete ${contact!.name}`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit contact" : "New contact"}
      width={560}
      footer={
        <>
          {editing ? (
            <button type="button" className="btn btn-danger mr-auto" onClick={remove} disabled={saving}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />
      <FieldRow>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Company" hint="optional">
          <Select
            value={companyId}
            onChange={setCompanyId}
            options={companies.map((c) => c.id)}
            labels={Object.fromEntries(companies.map((c) => [c.id, c.name]))}
            allowEmpty
            emptyLabel="— Independent —"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Role">
          <input
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Recruiting Lead"
          />
        </Field>
        <Field label="Relationship">
          <Select
            value={relationship}
            onChange={(v) => setRelationship(v ?? "other")}
            options={RELATIONSHIP_TYPES}
            labels={RELATIONSHIP_LABEL}
          />
        </Field>
      </FieldRow>
      <Field label="Contact info" hint="email, LinkedIn, phone">
        <input
          className="input"
          value={contactInfo}
          onChange={(e) => setContactInfo(e.target.value)}
        />
      </Field>
      <FieldRow>
        <Field label="Last contacted">
          <input
            type="datetime-local"
            className="input"
            value={lastContacted}
            onChange={(e) => {
              lastContactedTyped.current = true;
              setLastContacted(e.target.value);
            }}
          />
        </Field>
        <Field label="Next follow-up" hint="drives Compress">
          <input
            type="datetime-local"
            className="input"
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
          />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {editing ? (
        <section className="mt-1">
          <hr className="rule-fade my-[14px]" />
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="micro">
              Conversations{Array.isArray(touches) ? ` · ${touches.length}` : ""}
            </span>
            <span className="text-[11px] text-faint">
              Deleting one is immediate and rolls back Last contacted
            </span>
          </div>

          {touches === null ? (
            <p className="m-0 text-[12.5px] text-faint">Loading…</p>
          ) : touches === "unavailable" ? (
            <p className="m-0 text-[12.5px] text-faint">Not available right now.</p>
          ) : touches.length === 0 ? (
            <p className="m-0 text-[12.5px] text-faint">
              None logged yet. Use Log on the contacts table, or mention them in a capture.
            </p>
          ) : (
            <div className="flex flex-col gap-[2px]">
              {touches.map((touch) => (
                <div
                  key={touch.id}
                  className="group flex items-start gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)]"
                >
                  <span className="w-[52px] flex-none pt-[2px] font-mono text-[11px] text-faint">
                    {formatShortDate(toCivilDate(new Date(touch.occurred_at)))}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-dim">
                    {/* Filed as "Name: note" so it reads right in Brain; inside
                        that person's own form the name is redundant. */}
                    {touch.text.startsWith(`${contactName}: `)
                      ? touch.text.slice(contactName.length + 2)
                      : touch.text}
                  </span>
                  <RowActions
                    label="this conversation"
                    onDelete={() => removeTouch(touch)}
                    deleteTitle="Delete this conversation. Last contacted rolls back to the one before it."
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </Dialog>
  );
}
