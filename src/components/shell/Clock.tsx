"use client";

import { useEffect, useState } from "react";
import { APP_TIMEZONE } from "@/lib/constants";

/**
 * The rail clock, in the operator's zone rather than the browser's.
 *
 * Rendered empty on the server and filled in after mount: the server has no
 * idea what minute it is where you are, and rendering a time during SSR is a
 * guaranteed hydration mismatch.
 */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Reserve the space so the rail does not shift when the time arrives.
    return <span className="text-[13px] tracking-[0.04em] opacity-0">00:00</span>;
  }

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(now)
    .replace(/,/g, "")
    .toUpperCase();

  return (
    <>
      <span className="whitespace-nowrap text-[13px] tracking-[0.04em]">{time}</span>
      {/* The date is the expendable half — it wraps into a column of four
          lines long before the rail actually runs out of room. */}
      <span className="hidden whitespace-nowrap text-[11px] text-faint lg:inline">{date}</span>
    </>
  );
}
