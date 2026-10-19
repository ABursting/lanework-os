"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import {
  COMPRESS_DEFAULTS, SCALE_BOUNDS, WINDOW_BOUNDS, WINDOW_KEYS, scaleWindows, uniformScale,
  type WindowKey,
} from "@/lib/compress";
import { RESURFACE_BEFORE_DEADLINE_DAYS } from "@/lib/constants";
import type { UserSettings } from "@/lib/types";

const WINDOW_COPY: Record<WindowKey, { name: string; describe: (days: number) => string }> = {
  compress_reminder_days: {
    name: "Reminders ignored",
    describe: (d) =>
      `A reminder to apply comes back ${d === 0 ? "on its own day" : `${d} day${d === 1 ? "" : "s"} after it`}` +
      ` — never later than ${RESURFACE_BEFORE_DEADLINE_DAYS} days before the deadline.`,
  },
  compress_task_days: {
    name: "Stale tasks",
    describe: (d) => {
      const days = `${d} day${d === 1 ? "" : "s"}`;
      return `An open task shows ${days} past its due date — or, with no due date, ${days} after it was added.`;
    },
  },
  compress_job_days: {
    name: "Applications quiet",
    describe: (d) => `A live application shows after ${d} day${d === 1 ? "" : "s"} with no activity.`,
  },
  compress_contact_days: {
    name: "Contacts quiet",
    describe: (d) =>
      `A contact shows after ${d} day${d === 1 ? "" : "s"} without a conversation. ` +
      "Overdue follow-ups always show.",
  },
};

/** The order the sliders appear in — the same order as the sections below. */
const ORDER: WindowKey[] = [
  "compress_reminder_days",
  "compress_task_days",
  "compress_job_days",
  "compress_contact_days",
];

const SHORT: Record<WindowKey, string> = {
  compress_reminder_days: "Reminders",
  compress_task_days: "Tasks",
  compress_job_days: "Applications",
  compress_contact_days: "Contacts",
};

/**
 * The Compress window sliders.
 *
 * Collapsed to a one-line summary until opened. Moving a slider re-filters the
 * sections below immediately — the page already holds every candidate — and
 * the new value is saved a moment after you stop moving. The all-windows
 * slider sets every section to the same multiple of its default; moving one
 * on its own afterwards leaves the all-windows slider reading "mixed".
 */
export function CompressWindows({
  value,
  onChange,
  saving,
}: {
  value: UserSettings;
  onChange: (next: UserSettings) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scale = uniformScale(value);
  const isDefault = WINDOW_KEYS.every((k) => value[k] === COMPRESS_DEFAULTS[k]);

  return (
    <Panel className="p-[15px]">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-2">
        <h2 className="text-[15px]">Windows</h2>
        <span className="flex-1 font-mono text-[11px] text-faint">
          {ORDER.map((k) => `${SHORT[k].toUpperCase()} ${value[k]}D`).join(" · ")}
          {saving ? " · SAVING…" : ""}
        </span>
        <button
          type="button"
          className="btn btn-secondary text-[12px]"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Done" : "Adjust"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 flex flex-col gap-4">
          <SliderRow
            label="All windows"
            readout={scale === null ? "mixed" : `×${scale.toFixed(2)}`}
            hint="Moves every section together, as a multiple of its default. Narrower for a sprint, wider for a slow week."
            min={SCALE_BOUNDS.min}
            max={SCALE_BOUNDS.max}
            step={SCALE_BOUNDS.step}
            value={scale ?? value.compress_job_days / COMPRESS_DEFAULTS.compress_job_days}
            onChange={(v) => onChange(scaleWindows(v))}
            emphasis
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ORDER.map((key) => (
              <SliderRow
                key={key}
                label={WINDOW_COPY[key].name}
                readout={`${value[key]} day${value[key] === 1 ? "" : "s"}`}
                hint={WINDOW_COPY[key].describe(value[key])}
                min={WINDOW_BOUNDS[key].min}
                max={WINDOW_BOUNDS[key].max}
                step={1}
                value={value[key]}
                onChange={(v) => onChange({ ...value, [key]: v })}
              />
            ))}
          </div>

          <div>
            <button
              type="button"
              className="btn btn-ghost !px-2 text-[12px]"
              onClick={() => onChange({ ...COMPRESS_DEFAULTS })}
              disabled={isDefault}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function SliderRow({
  label, readout, hint, min, max, step, value, onChange, emphasis = false,
}: {
  label: string;
  readout: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  emphasis?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2">
        <span className={`text-[13px] ${emphasis ? "text-text" : "text-dim"}`}>{label}</span>
        <span className="ml-auto font-mono text-[12px] text-accent">{readout}</span>
      </span>
      <input
        type="range"
        className="mt-[6px] w-full accent-[var(--color-accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="mt-[2px] block text-[11.5px] text-faint">{hint}</span>
    </label>
  );
}
