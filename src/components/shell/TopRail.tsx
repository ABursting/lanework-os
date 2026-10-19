"use client";

import Link from "next/link";
import { DEMO_MODE } from "@/lib/demo";
import { usePathname } from "next/navigation";
import { Clock } from "./Clock";

/**
 * `href` is where the tab goes; `match` is what counts as being there.
 *
 * CRM deliberately links straight to /crm/applications rather than to /crm.
 * /crm is a server-side redirect, and a redirect met during an in-app
 * navigation makes Next.js fall back to a full page load — the slowest kind
 * of navigation there is, and one that throws away everything the browser was
 * holding, including any error banner still waiting to be read.
 */
const TABS = [
  { name: "Home", href: "/", match: "/" },
  { name: "CRM", href: "/crm/applications", match: "/crm" },
  { name: "Brain", href: "/brain", match: "/brain" },
  { name: "Review", href: "/review", match: "/review" },
] as const;

/** Ordered by visit frequency, per the scope: Home → CRM → Brain → Review. */
export function TopRail() {
  const pathname = usePathname();

  const isActive = (match: string) =>
    match === "/" ? pathname === "/" : pathname.startsWith(match);

  return (
    <header
      className="flex h-[54px] flex-none items-center gap-4 border-b border-edge px-[18px]
                 backdrop-blur-[18px]"
      style={{ background: "color-mix(in oklab, var(--color-bg) 55%, transparent)" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-[9px]">
        <span
          className="size-[9px] rotate-45 rounded-[2px] bg-accent"
          style={{ boxShadow: "0 0 12px var(--color-accent)" }}
          aria-hidden
        />
        {/* shrink-0: the wordmark is short enough to always fit, and letting it
            flex meant it ellipsised to "LANE…" with room to spare. */}
        <span className="shrink-0 whitespace-nowrap text-[15px] font-medium tracking-[0.14em]">
          LANEWORK
        </span>
        {/* Decoration, and the first thing to go when the rail gets tight. */}
        <span className="hidden pl-1 font-mono text-[10px] tracking-[0.1em] text-faint lg:inline">
          v1.0 · SOLO
        </span>
      </div>

      <nav className="segbar flex-none" aria-label="Sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="seg-opt"
            data-active={isActive(tab.match)}
            aria-current={isActive(tab.match) ? "page" : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 items-baseline justify-end gap-[10px] font-mono">
        <Clock />
        {/* This browser only. Signing out every device means changing the
            password — see src/lib/auth/session.ts.

            Hidden on the public demo: there is no password screen there, so
            the button would send a visitor to a login page they cannot use
            and do not need. */}
        {DEMO_MODE ? null : <button
          type="button"
          className="btn btn-ghost !px-2 !py-[2px] font-sans text-[11px] text-faint hover:text-text"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
            window.location.assign("/login");
          }}
          title="Log this browser out"
        >
          Log out
        </button>}
      </div>
    </header>
  );
}
