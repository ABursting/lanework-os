"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { name: "Applications", href: "/crm/applications" },
  { name: "Companies", href: "/crm/companies" },
  { name: "Contacts", href: "/crm/contacts" },
  { name: "Tasks", href: "/crm/tasks" },
  { name: "Outreach", href: "/crm/outreach" },
  { name: "Compress", href: "/crm/compress" },
] as const;

export function CrmTabs({ recordCount }: { recordCount: number }) {
  const pathname = usePathname();

  return (
    <div className="mb-[14px] flex items-center gap-4">
      <nav className="segbar" aria-label="CRM views">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="seg-opt !px-[15px] !text-[12.5px]"
            data-active={pathname.startsWith(tab.href)}
            aria-current={pathname.startsWith(tab.href) ? "page" : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="font-mono text-[10.5px] tracking-[0.04em] text-faint">
        {recordCount} ACTIVE RECORD{recordCount === 1 ? "" : "S"}
      </div>
    </div>
  );
}
