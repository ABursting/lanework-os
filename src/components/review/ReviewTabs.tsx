"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { name: "Weekly", href: "/review" },
  { name: "Timeline", href: "/review/timeline" },
] as const;

/** Both halves of looking backwards: this week in words, the months in shape. */
export function ReviewTabs() {
  const pathname = usePathname();
  return (
    <nav className="segbar mb-[14px]" aria-label="Review views">
      {TABS.map((tab) => {
        const active = tab.href === "/review" ? pathname === "/review" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="seg-opt !px-[15px] !text-[12.5px]"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
