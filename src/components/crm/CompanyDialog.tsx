"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow } from "@/components/ui/Field";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import type { CompanyRow } from "@/lib/types";

export function CompanyDialog({
  open,
  onClose,
  company,
}: {
  open: boolean;
  onClose: () => void;
  company?: CompanyRow | null;
}) {
  const router = useRouter();
  const editing = Boolean(company);

  const [name, setName] = useState(company?.name ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [sector, setSector] = useState(company?.sector ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [saving, setSaving] = useState(false);
  // Local state holds validation only; a failed write goes to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        website: website || null,
        sector: sector || null,
        notes: notes || null,
      };
      if (editing) await api.patch(`/api/companies/${company!.id}`, payload);
      else await api.post("/api/companies", payload);
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? `save ${name}` : "add the company", err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!company) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/api/companies/${company.id}`);
      router.refresh();
      onClose();
    } catch (err) {
      report(`delete ${company!.name}`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit company" : "New company"}
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
      {editing ? (
        <p className="m-0 text-[11.5px] text-faint">
          Deleting a company also deletes its applications. Its contacts survive as
          Independent.
        </p>
      ) : null}
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <FieldRow>
        <Field label="Sector" hint="freeform">
          <input
            className="input"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="climate tech"
          />
        </Field>
        <Field label="Website">
          <input
            className="input"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
          />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
