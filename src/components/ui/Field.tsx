import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-[5px] block text-[12px] text-dim">
        {label}
        {hint ? <span className="ml-2 text-[11px] text-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/** Two fields side by side — the shape most of the CRM forms want. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  labels,
  allowEmpty,
  emptyLabel = "—",
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: readonly T[];
  labels?: Record<T, string>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <select
      className="input"
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
    >
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels ? labels[o] : o}
        </option>
      ))}
    </select>
  );
}

/** An inline error strip. Server failures surface here, never in a console. */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="m-0 rounded-md px-3 py-2 text-[12.5px]"
      style={{
        color: "var(--color-danger)",
        background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
        border: "1px solid color-mix(in oklab, var(--color-danger) 32%, transparent)",
      }}
      role="alert"
    >
      {message}
    </p>
  );
}
