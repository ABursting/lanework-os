"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A modal at the top elevation. Used by every CRM create/edit form and by the
 * capture confirm step — the human gate the AI is never allowed to skip.
 *
 * Rendered through a portal into <body>, and that is load-bearing rather than
 * tidiness: `.panel` sets backdrop-filter, which makes an element a containing
 * block for position:fixed descendants. A dialog rendered inside a card would
 * anchor to that card instead of the viewport — clipped, off-centre, and
 * squeezed into a 316px column. The portal escapes any such ancestor.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The portal target only exists in the browser, so hold off until mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Focus the first field so the dialog is usable without reaching for a mouse.
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button",
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
      style={{ background: "color-mix(in oklab, var(--color-neutral-900) 62%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel panel-raised my-auto flex w-full flex-col gap-3 p-4"
        style={{ maxWidth: width, boxShadow: "0 24px 60px oklch(0% 0 0 / 0.6)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[19px]">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
        {footer ? <div className="mt-1 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
