"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { OPERATOR, APP_TIMEZONE } from "@/lib/constants";
import { DEMO_MODE } from "@/lib/demo";
import { daysSince } from "@/lib/time";
import type { BackupHealth } from "@/lib/db/settings";

/**
 * How old a successful backup may be before the card says something.
 *
 * The job runs nightly at 2am local. Seeing yesterday's date during the day is
 * therefore normal and must not cry wolf; two days means a night was missed.
 */
const BACKUP_STALE_DAYS = 2;

/**
 * Who is running this, and what today is for.
 *
 * Identity comes from the OPERATOR constant beside USER_ID — there is no
 * profile table in the scope's ten, and these fields move with the user id
 * when real auth arrives. Its values are read from the environment, so a
 * public clone of this repo shows placeholders rather than a real person.
 * "Focus today" is different: it is per-day state and lives in
 * daily_logs.notes.
 */
export function Operator({
  focusToday,
  backup,
}: {
  focusToday: string | null;
  backup: BackupHealth;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(focusToday ?? "");
  const [saving, setSaving] = useState(false);
  const report = useReportError();

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/daily-log", { focus_today: draft.trim() || null });
      router.refresh();
      setEditing(false);
    } catch (err) {
      report("save today's focus", err);
    } finally {
      setSaving(false);
    }
  }

  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;

  return (
    <Panel variant="hero" className="p-[15px]">
      <div className="kicker mb-[10px]">Operator</div>
      <h2 className="text-[21px] leading-tight">{OPERATOR.name}</h2>
      <p className="m-0 mt-[3px] text-[12.5px] text-muted">{OPERATOR.track}</p>
      <div className="mt-2 flex items-center gap-[6px] font-mono text-[11px] text-muted">
        <span>{OPERATOR.location}</span>
        <span>·</span>
        <span>{offset ?? APP_TIMEZONE}</span>
      </div>

      <BackupLine backup={backup} />

      <hr className="rule-fade my-[13px]" />

      <div className="micro">Focus today</div>
      {editing ? (
        <div className="mt-[5px] flex flex-col gap-2">
          <textarea
            className="input min-h-[64px] text-[13.5px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="The one thing that has to happen today."
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDraft(focusToday ?? "");
                setEditing(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-[5px] w-full text-left text-[13.5px] leading-[1.45] transition-colors hover:text-accent"
        >
          {focusToday || <span className="text-faint">Set a focus for today…</span>}
        </button>
      )}
    </Panel>
  );
}

/**
 * One line saying whether the nightly backup is still happening.
 *
 * It exists because the backup failed silently for three nights in October and
 * nothing anywhere said so — no email, nothing on screen, and the host drops
 * its logs within the hour. A backup nobody checks is a backup you only find
 * out about when you need it.
 *
 * Silent on the good days by design: a line that is always there stops being
 * read. It speaks up when the date is old, and when it cannot tell at all —
 * those deserve the same attention, because both mean nobody can say your data
 * is safe.
 */
function BackupLine({ backup }: { backup: BackupHealth }) {
  // The demo has no backup to report on, and an amber warning on a public page
  // would be describing a failure that is not one.
  if (DEMO_MODE) return null;

  const days = backup.at ? daysSince(backup.at) : null;
  const stale = !backup.known || backup.at === null || (days !== null && days >= BACKUP_STALE_DAYS);

  if (!stale) {
    return (
      <div className="mt-[7px] font-mono text-[11px] text-faint">
        Backup {days === 0 ? "ran today" : "ran yesterday"}
      </div>
    );
  }

  const why = !backup.known
    ? "can't tell — the dashboard is ahead of the database"
    : backup.at === null
      ? "no successful run on record"
      : `last succeeded ${days} days ago`;

  return (
    <div className="mt-[7px] font-mono text-[11px] text-warn">
      <span aria-hidden="true">▲ </span>
      Backup: {why}
    </div>
  );
}
