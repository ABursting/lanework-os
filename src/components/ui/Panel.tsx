import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PanelVariant = "default" | "raised" | "hero" | "well";

const VARIANT_CLASS: Record<PanelVariant, string> = {
  default: "panel",
  raised: "panel panel-raised",
  hero: "panel panel-hero",
  well: "panel-well",
};

/**
 * The glass card the whole mockup is built out of. Four weights: the default,
 * a slightly lifted one for the card that leads a column, the accent-tinted
 * hero (Operator only), and the recessed well the kanban columns sit in.
 */
export function Panel({
  variant = "default",
  className = "",
  children,
  ...rest
}: {
  variant?: PanelVariant;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"section">, "children">) {
  return (
    <section className={`${VARIANT_CLASS[variant]} ${className}`} {...rest}>
      {children}
    </section>
  );
}

/**
 * The header every card leads with: a small uppercase accent kicker, an
 * optional larger title beneath it, and a right-hand slot for a monospace
 * stamp or an action.
 */
export function PanelHeader({
  kicker,
  title,
  aside,
  align = "end",
}: {
  kicker: string;
  title?: ReactNode;
  aside?: ReactNode;
  align?: "end" | "start";
}) {
  return (
    <div
      className={`flex flex-wrap justify-between gap-x-3 gap-y-2 ${
        align === "end" ? "items-end" : "items-start"
      }`}
    >
      <div className="min-w-0">
        <div className="kicker">{kicker}</div>
        {title ? (
          <div className="mt-1 text-[19px] font-medium leading-tight">{title}</div>
        ) : null}
      </div>
      {/* Wraps under the title rather than squeezing it into a column of
          single words once the panel narrows. */}
      {aside ? <div className="flex-none">{aside}</div> : null}
    </div>
  );
}

/** The fading hairline the system uses instead of a hard rule. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`rule-fade ${className}`} />;
}
