"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";

/**
 * The per-row Edit and Delete controls, shared by every CRM table.
 *
 * Delete used to live only inside each edit dialog, behind a row that did not
 * look clickable, which meant that in practice nothing in the CRM could be
 * removed. It is on the row now, recessive until you hover so a table of
 * fourteen rows is not a wall of red.
 *
 * How hard it asks depends on what it takes with it. A task or a contact
 * disappears alone, so a second click is enough — quick, in place, and
 * cancels itself if you walk away. A company drags its applications down with
 * it and an application drags its stage history; those get a dialog, because
 * a consequence you cannot see is not one you can consent to. Matching the
 * weight of the question to the weight of the answer is the whole point —
 * a confirm you always click without reading protects nobody.
 */
export function RowActions({
  onEdit,
  onDelete,
  label,
  detail,
  deleteTitle,
  reveal = "hover",
}: {
  onEdit?: () => void;
  onDelete: () => void;
  /** What is being deleted, named the way it reads on screen. */
  label: string;
  /** What else goes with it. Its presence is what upgrades the second click to a dialog. */
  detail?: ReactNode;
  /** Hover text on the Delete button itself. */
  deleteTitle?: string;
  /**
   * "hover" keeps the controls recessive until the row is hovered — right for
   * a table of many rows. "always" shows them outright — right for a single
   * item already on screen by itself, where hiding them just hides them.
   */
  reveal?: "hover" | "always";
}) {
  const [asking, setAsking] = useState(false);

  // A second click confirms; walking away cancels. A "Sure?" left sitting on
  // screen eventually gets clicked by someone who has forgotten what it asked.
  useEffect(() => {
    if (!asking || detail) return;
    const id = setTimeout(() => setAsking(false), 5_000);
    return () => clearTimeout(id);
  }, [asking, detail]);

  const hidden =
    reveal === "always"
      ? ""
      : "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100";

  return (
    <div
      className="flex items-center justify-end gap-1"
      // The row underneath usually opens the editor; these are their own acts.
      onClick={(e) => e.stopPropagation()}
    >
      {onEdit ? (
        <button
          type="button"
          className={`btn btn-ghost !px-[7px] !py-[2px] text-[11.5px] ${hidden}`}
          onClick={onEdit}
        >
          Edit
        </button>
      ) : null}

      {asking && !detail ? (
        <button
          type="button"
          className="btn btn-danger !px-[7px] !py-[2px] text-[11.5px]"
          onClick={onDelete}
          title="Click again to delete permanently"
          autoFocus
        >
          Sure?
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-ghost !px-[7px] !py-[2px] text-[11.5px] ${hidden}`}
          style={{ color: "var(--color-danger)" }}
          onClick={() => setAsking(true)}
          title={deleteTitle ?? `Delete ${label} permanently`}
        >
          Delete
        </button>
      )}

      {detail ? (
        <Dialog
          open={asking}
          onClose={() => setAsking(false)}
          title={`Delete ${label}?`}
          width={420}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAsking(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setAsking(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <div className="text-[13px] leading-[1.55] text-dim">{detail}</div>
        </Dialog>
      ) : null}
    </div>
  );
}
