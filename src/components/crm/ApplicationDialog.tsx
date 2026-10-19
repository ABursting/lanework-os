"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow, Select } from "@/components/ui/Field";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { KIND_LABEL, LANE_LABEL, STAGE_LABEL, laneBadgeStyle, safeHref } from "@/lib/display";
import { REMINDER_LEAD_DAYS } from "@/lib/constants";
import { reminderForLead } from "@/lib/reminders";
import { formatShortDate, today } from "@/lib/time";
import {
  APPLICATION_KINDS, LANES, STAGES,
  type ApplicationKind, type ApplicationRow, type Lane, type Stage,
} from "@/lib/types";

interface CompanyOption {
  id: string;
  name: string;
}

/**
 * Create or edit one application.
 *
 * The company field accepts either an existing row or a new name — a job you
 * find before you have an employer in the CRM should not require two trips.
 * The server creates the company only if the name is genuinely new.
 *
 * A Researching role also takes a reminder date. Typing a deadline fills one
 * in ten days before, until you set the reminder yourself — after that your
 * date is left alone.
 */
export function ApplicationDialog({
  open,
  onClose,
  companies,
  application,
  defaultStage,
}: {
  open: boolean;
  onClose: () => void;
  companies: CompanyOption[];
  application?: ApplicationRow | null;
  defaultStage?: Stage;
}) {
  const router = useRouter();
  const editing = Boolean(application);

  const [companyId, setCompanyId] = useState<string | null>(application?.company_id ?? null);
  const [newCompany, setNewCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState(application?.role_title ?? "");
  const [lane, setLane] = useState<Lane>(application?.lane ?? "primary");
  const [stage, setStage] = useState<Stage>(application?.stage ?? defaultStage ?? "applied");
  const [kind, setKind] = useState<ApplicationKind>(application?.kind ?? "job");
  const [deadline, setDeadline] = useState(application?.deadline ?? "");
  const [remindOn, setRemindOn] = useState(application?.remind_on ?? "");
  /** Once you touch the reminder, the deadline stops rewriting it. */
  const [remindTouched, setRemindTouched] = useState(Boolean(application?.remind_on));
  const estimated = Boolean(application?.remind_estimated) && remindOn === application?.remind_on;
  const [url, setUrl] = useState(application?.job_posting_url ?? "");
  const [platform, setPlatform] = useState(application?.source_platform ?? "");
  const [resumePassed, setResumePassed] = useState(application?.resume_passed ?? false);
  const [notes, setNotes] = useState(application?.notes ?? "");

  const [saving, setSaving] = useState(false);
  // Local state holds validation only; a failed write goes to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();

  async function save() {
    setError(null);
    if (!roleTitle.trim()) {
      setError("Role title is required.");
      return;
    }
    if (!editing && !companyId && !newCompany.trim()) {
      setError("Pick a company or type a new one.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        role_title: roleTitle,
        lane,
        stage,
        // Only when it changed — so saving an untouched job never names a
        // column a not-yet-migrated database lacks (see createApplication).
        ...(kind !== (application?.kind ?? "job") ? { kind } : {}),
        deadline: deadline || null,
        // Only sent when it could have changed, so saving an untouched form
        // does not turn an estimated reminder into a "set by hand" one.
        ...(remindOn !== (application?.remind_on ?? "") || !editing
          ? { remind_on: remindOn || null }
          : {}),
        job_posting_url: url || null,
        source_platform: platform || null,
        notes: notes || null,
        resume_passed: resumePassed,
      };
      if (editing) {
        await api.patch(`/api/applications/${application!.id}`, payload);
      } else {
        await api.post("/api/applications", {
          ...payload,
          ...(companyId ? { company_id: companyId } : { company_name: newCompany.trim() }),
        });
      }
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? `save ${roleTitle}` : "add the application", err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!application) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/api/applications/${application.id}`);
      router.refresh();
      onClose();
    } catch (err) {
      report(`delete ${application!.role_title}`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit application" : "New application"}
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
            {saving ? "Saving…" : editing ? "Save" : "Add application"}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />

      {editing ? (
        <div className="text-[13px] text-dim">
          {application!.company_name}
          <span className="ml-2 text-faint">· company is fixed after creation</span>
        </div>
      ) : (
        <FieldRow>
          <Field label="Company">
            <Select
              value={companyId}
              onChange={setCompanyId}
              options={companies.map((c) => c.id)}
              labels={Object.fromEntries(companies.map((c) => [c.id, c.name]))}
              allowEmpty
              emptyLabel="— new company —"
            />
          </Field>
          <Field label="…or a new one" hint={companyId ? "ignored" : undefined}>
            <input
              className="input"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Company name"
              disabled={Boolean(companyId)}
            />
          </Field>
        </FieldRow>
      )}

      <Field label="Role title">
        <input
          className="input"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder="Associate PM, Climate Platform"
        />
      </Field>

      {/* Near the top, where a Researching role needs it: it is how you find
          the posting again when the reminder to apply comes round. */}
      <Field label="Application link">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… the posting or application page"
          />
          {safeHref(url) ? (
            <a
              href={safeHref(url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary flex-none text-[12px]"
            >
              Open ↗
            </a>
          ) : null}
        </div>
      </Field>

      <Field label="Type" hint={kind === "grad_school" ? "kept out of job stats" : undefined}>
        <div className="segbar w-full">
          {APPLICATION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="seg-opt flex-1"
              data-active={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Lane">
        <div className="segbar w-full">
          {LANES.map((l) => (
            <button
              key={l}
              type="button"
              className="seg-opt flex-1"
              data-active={lane === l}
              style={lane === l ? laneBadgeStyle(l) : undefined}
              onClick={() => setLane(l)}
            >
              {LANE_LABEL[l]}
            </button>
          ))}
        </div>
      </Field>

      <FieldRow>
        <Field label="Stage">
          <Select
            value={stage}
            onChange={(v) => {
              const next = v ?? "applied";
              setStage(next);
              if (next === "researching" && deadline && !remindOn && !remindTouched) {
                setRemindOn(reminderForLead(deadline, REMINDER_LEAD_DAYS, today()));
              }
            }}
            options={STAGES}
            labels={STAGE_LABEL}
          />
        </Field>
        <Field label="Deadline">
          <input
            type="date"
            className="input"
            value={deadline}
            onChange={(e) => {
              const next = e.target.value;
              setDeadline(next);
              if (stage === "researching" && !remindTouched) {
                setRemindOn(next ? reminderForLead(next, REMINDER_LEAD_DAYS, today()) : "");
              }
            }}
          />
        </Field>
      </FieldRow>

      {stage === "researching" ? (
        <FieldRow>
          <Field
            label="Remind me to apply on"
            hint={
              estimated
                ? "estimated from the posting date"
                : deadline && !remindTouched
                  ? `${REMINDER_LEAD_DAYS} days before the deadline`
                  : undefined
            }
          >
            <input
              type="date"
              className="input"
              value={remindOn}
              onChange={(e) => {
                setRemindTouched(true);
                setRemindOn(e.target.value);
              }}
            />
          </Field>
          <p className="m-0 self-end pb-[9px] text-[11.5px] text-faint">
            {remindOn
              ? `Shows on the calendar ${formatShortDate(remindOn)}. Ignored, it comes back in Compress.`
              : "No reminder — this role only shows in Compress once it goes quiet."}
          </p>
        </FieldRow>
      ) : null}

      <Field label="Source platform">
        <input
          className="input"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="LinkedIn / Handshake"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-[10px] text-[13px]">
        <input
          type="checkbox"
          className="mt-[3px] accent-[var(--color-accent)]"
          checked={resumePassed}
          onChange={(e) => setResumePassed(e.target.checked)}
        />
        <span>
          Cleared the resume screen
          <span className="mt-[2px] block text-[11.5px] text-faint">
            Latches on automatically the first time this reaches Interviewing, and stays
            on through a later rejection.
          </span>
        </span>
      </label>


      <Field label="Notes">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
