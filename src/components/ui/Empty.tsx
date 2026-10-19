import type { ReactNode } from "react";

/** What a card shows before there is any data in it. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-1 py-6 text-[13px] text-muted">
      <p className="m-0">{children}</p>
      {action}
    </div>
  );
}
