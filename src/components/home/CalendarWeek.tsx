"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EVENT_KIND_LABEL, EVENT_KIND_VAR } from "@/lib/display";
import type { CalendarEvent, EventKind } from "@/lib/types";
import { CALENDAR_BAND_WEEKS } from "@/lib/constants";
import {
  addDays, dayNumber, formatRange, formatTime, today, weekDays, weekdayLabel,
} from "@/lib/time";

const LEGEND: EventKind[] = ["apply", "deadline", "interview", "informational", "networking"];

/** "This week" / "Next week" / "3 weeks ago" — where you are, in words. */
function offsetLabel(offset: number): string {
  if (offset === 0) return "This week";
  if (offset === 1) return "Next week";
  if (offset === -1) return "Last week";
  return offset > 0 ? `In ${offset} weeks` : `${Math.abs(offset)} weeks ago`;
}

/**
 * The week strip.
 *
 * Two sources on one strip. Most events are read straight off the iCal feed —
 * a calendar’s secret iCal address is a subscription, not an account, so
 * there is no write path back to Google Calendar. The rest are the
 * dashboard's own: each Researching role's reminder to apply and its
 * deadline. Those link to the board, where the role is, and disappear on
 * their own once the role moves to Applied.
 *
 * The arrows move between weeks with no network at all: the page hands this
 * component every event in a band either side of today, and moving weeks just
 * re-slices what is already in the browser. See CALENDAR_BAND_WEEKS.
 */
export function CalendarWeek({
  events,
  error,
  configured,
}: {
  events: CalendarEvent[];
  error: string | null;
  configured: boolean;
}) {
  const now = today();
  /** Weeks from the current one. 0 is the week containing today. */
  const [offset, setOffset] = useState(0);

  // weekDays() resolves the Monday of whatever date it is given, so shifting
  // the date by whole weeks is all this needs to do. Day maths stays in
  // src/lib/time.ts, where the timezone rules live.
  const days = useMemo(() => weekDays(addDays(now, offset * 7)), [now, offset]);

  const canGoBack = offset > -CALENDAR_BAND_WEEKS;
  const canGoForward = offset < CALENDAR_BAND_WEEKS;

  return (
    <Panel className="p-4">
      <PanelHeader
        kicker="Calendar"
        title={
          <span className="flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
            <span>Week of {formatRange(days[0], days[6]).replace(/, \d{4}$/, "")}</span>
            <span className="text-[11.5px] font-normal text-faint">{offsetLabel(offset)}</span>
          </span>
        }
        aside={
          <div className="flex items-center gap-[14px]">
            <div className="hidden gap-[14px] text-[10.5px] text-muted xl:flex">
              {LEGEND.map((kind) => (
                <span key={kind} className="flex items-center gap-[5px]">
                  <span
                    className="size-[7px] rounded-[2px]"
                    style={{ background: EVENT_KIND_VAR[kind] }}
                    aria-hidden
                  />
                  {EVENT_KIND_LABEL[kind]}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {/* Only offered when it would do something — a Today button on
                  the week you are already looking at is furniture. */}
              {offset !== 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-[3px] text-[11.5px]"
                  onClick={() => setOffset(0)}
                >
                  Today
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost !px-[9px] !py-[3px] text-[13px] leading-none"
                onClick={() => setOffset((o) => o - 1)}
                disabled={!canGoBack}
                aria-label="Previous week"
                title={
                  canGoBack
                    ? "Previous week"
                    : `Loaded ${CALENDAR_BAND_WEEKS} weeks back — this is as far as it goes`
                }
              >
                &lsaquo;
              </button>
              <button
                type="button"
                className="btn btn-ghost !px-[9px] !py-[3px] text-[13px] leading-none"
                onClick={() => setOffset((o) => o + 1)}
                disabled={!canGoForward}
                aria-label="Next week"
                title={
                  canGoForward
                    ? "Next week"
                    : `Loaded ${CALENDAR_BAND_WEEKS} weeks ahead — this is as far as it goes`
                }
              >
                &rsaquo;
              </button>
            </div>
          </div>
        }
      />

      {!configured ? (
        <p className="m-0 mt-3 text-[13px] text-muted">
          No calendar connected. Put your Google Calendar&rsquo;s secret iCal address in{" "}
          <code className="font-mono text-[12px] text-dim">CALENDAR_ICS_URL</code> to fill
          this in.
        </p>
      ) : error ? (
        <p className="m-0 mt-3 text-[13px]" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      {/* Seven day columns need real width. Rather than crushing them into
          unreadable slivers on a narrow window, the strip scrolls sideways
          inside its own box and the page never scrolls horizontally. */}
      <div className="-mx-1 mt-[14px] overflow-x-auto px-1">
        <div className="grid min-w-[700px] grid-cols-7 gap-2">
        {days.map((date) => {
          const isToday = date === now;
          const dayEvents = events.filter((e) => e.date === date);

          return (
            <div
              key={date}
              className="min-h-[168px] rounded-[10px] px-2 py-[9px]"
              style={{
                background: isToday
                  ? "color-mix(in oklab, var(--color-accent) 9%, transparent)"
                  : "color-mix(in oklab, var(--color-text) 3%, transparent)",
                border: `1px solid ${
                  isToday
                    ? "color-mix(in oklab, var(--color-accent) 34%, transparent)"
                    : "var(--color-edge-soft)"
                }`,
              }}
            >
              <div className="mb-[9px] flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted">
                  {weekdayLabel(date)}
                </span>
                <span
                  className="font-mono text-[13px]"
                  style={{ color: isToday ? "var(--color-accent)" : "var(--color-text)" }}
                >
                  {dayNumber(date)}
                </span>
              </div>

              <div className="flex flex-col gap-[5px]">
                {dayEvents.map((event) => {
                  const color = EVENT_KIND_VAR[event.kind];
                  const style = {
                    background: `color-mix(in oklab, ${color} 14%, transparent)`,
                    borderLeft: `2px solid ${color}`,
                  };

                  if (event.origin === "dashboard") {
                    // "Apply: Notion — PM" reads "APPLY" above "Notion — PM",
                    // matching how a feed event puts its time above its title.
                    const [label, ...rest] = event.summary.split(": ");
                    return (
                      <Link
                        key={event.uid}
                        href="/crm/applications"
                        className="block rounded-[6px] px-[6px] py-[5px] transition-[filter] hover:brightness-125"
                        style={style}
                        title={`${event.summary} — open the board`}
                      >
                        <div className="font-mono text-[9.5px] uppercase" style={{ color }}>
                          {label}
                        </div>
                        <div className="mt-[2px] text-[11px] leading-[1.3]">{rest.join(": ")}</div>
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={event.uid}
                      className="rounded-[6px] px-[6px] py-[5px]"
                      style={style}
                      title={event.location ?? undefined}
                    >
                      <div className="font-mono text-[9.5px]" style={{ color }}>
                        {event.allDay ? "ALL DAY" : formatTime(event.start)}
                      </div>
                      <div className="mt-[2px] text-[11px] leading-[1.3]">{event.summary}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </Panel>
  );
}
