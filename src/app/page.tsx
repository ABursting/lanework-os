import { Operator } from "@/components/home/Operator";
import { HabitTracker } from "@/components/home/HabitTracker";
import { Goals } from "@/components/home/Goals";
import { FollowUps } from "@/components/home/FollowUps";
import { Priorities } from "@/components/home/Priorities";
import { CalendarWeek } from "@/components/home/CalendarWeek";
import { DataError } from "@/components/ui/DataError";
import { listHabits } from "@/lib/db/habits";
import { listDueFollowUps } from "@/lib/db/contacts";
import { getNotes, habitStreak } from "@/lib/db/dailyLogs";
import { listGoalsForCurrentPeriods } from "@/lib/db/goals";
import { listTasks, tasksCompletedToday } from "@/lib/db/tasks";
import { listResearchingDates } from "@/lib/db/applications";
import { getBackupHealth } from "@/lib/db/settings";
import { DEMO_MODE } from "@/lib/demo";
import { fetchEvents, isCalendarConfigured } from "@/lib/calendar";
import type { ApplicationRow, CalendarEvent } from "@/lib/types";
import { CALENDAR_BAND_WEEKS } from "@/lib/constants";
import {
  addDays, endOfDayInstant, endOfMonth, endOfWeek, startOfDayInstant, startOfMonth,
  startOfWeek, today, type CivilDate,
} from "@/lib/time";

/**
 * A Researching role's reminder and deadline, as calendar entries.
 *
 * Drawn by the dashboard, not read from Google: the calendar connection is
 * read-only until the Google write access is set up, so these live only here
 * for now. All-day, because a reminder is for a day, not a time.
 */
function reminderEvents(roles: ApplicationRow[], from: CivilDate, to: CivilDate): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const inBand = (d: string | null): d is string => Boolean(d && d >= from && d <= to);
  const entry = (role: ApplicationRow, date: CivilDate, kind: "apply" | "deadline") => ({
    uid: `app-${role.id}-${kind}`,
    summary:
      `${kind === "apply" ? "Apply" : "Due"}: ${role.company_name} — ${role.role_title}` +
      (kind === "apply" && role.remind_estimated ? " (est.)" : ""),
    date,
    start: startOfDayInstant(date),
    end: endOfDayInstant(date),
    allDay: true,
    kind,
    location: null,
    origin: "dashboard" as const,
  });
  for (const role of roles) {
    if (inBand(role.remind_on)) events.push(entry(role, role.remind_on, "apply"));
    if (inBand(role.deadline)) events.push(entry(role, role.deadline, "deadline"));
  }
  return events;
}

/** Live data on every view — nothing here may be baked in at build time. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // A band either side of today rather than just this week, so the calendar's
  // arrows move between weeks instantly instead of asking the server each
  // time. Costs no extra network — see CALENDAR_BAND_WEEKS.
  const anchor = today();
  const bandStart = startOfWeek(addDays(anchor, -CALENDAR_BAND_WEEKS * 7));
  const bandEnd = addDays(startOfWeek(addDays(anchor, CALENDAR_BAND_WEEKS * 7)), 6);

  try {
    // The calendar is a third-party fetch and is allowed to fail on its own
    // without taking the rest of the page down with it.
    const calendar: { events: CalendarEvent[]; error: string | null } = await fetchEvents(
      bandStart,
      bandEnd,
    )
      .then((events) => ({ events, error: null }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[page:home] calendar feed failed: ${message}`, err);
        return { events: [], error: message };
      });

    let reminderError: string | null = null;
    const [allHabits, notes, streak, goals, openTasks, doneToday, followUps, researching, backup] =
      await Promise.all([
      // Retired habits come down too, so the card can offer to restore one
      // without a second round trip.
      listHabits(true),
      getNotes(),
      habitStreak(),
      listGoalsForCurrentPeriods(),
      // The whole open list, already ranked. Priorities shows the top three
      // and keeps the rest behind "show all" — one query either way.
      listTasks("open"),
      tasksCompletedToday(),
      listDueFollowUps(),
      // Like the feed, reminders are allowed to fail without taking Home down
      // — the calendar card says so instead.
      listResearchingDates(bandStart, bandEnd).catch((err: unknown) => {
        // A database error arrives as a plain object with a message, not an Error.
        const message =
          (err as { message?: string } | null)?.message ?? String(err);
        console.error(`[page:home] reminder dates failed: ${message}`, err);
        reminderError = `Couldn't load your reminders to apply: ${message}`;
        return [] as ApplicationRow[];
      }),
      // Says when the nightly backup last succeeded. Reports its own failure
      // as "can't tell" rather than throwing, so a dashboard running ahead of
      // its database still loads.
      //
      // Skipped in the demo: there is no backup there to report on, the card
      // renders nothing either way, and asking the demo database for a column
      // it has no reason to carry would log a failed read on every page view.
      DEMO_MODE
        ? Promise.resolve({ at: null, path: null, known: false })
        : getBackupHealth(),
    ]);

    const habits = allHabits.filter((h) => h.active);
    const retired = allHabits.filter((h) => !h.active);

    return (
      // Two columns is the mockup's layout and the one that matters. Below
      // ~1024px the 316px rail plus a usable main column stops fitting, so the
      // rail stacks on top instead of both halves being squeezed.
      <div className="grid max-w-[1560px] grid-cols-1 items-start gap-[14px] lg:grid-cols-[316px_minmax(0,1fr)]">
        <div className="flex flex-col gap-[14px]">
          <Operator focusToday={notes.focus_today ?? null} backup={backup} />
          <FollowUps contacts={followUps} />
          <HabitTracker
            habits={habits}
            retired={retired}
            completed={notes.habits ?? {}}
            streak={streak}
          />
          <Goals
            week={goals.week}
            month={goals.month}
            weekRange={[startOfWeek(), endOfWeek()]}
            monthRange={[startOfMonth(), endOfMonth()]}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <Priorities
            tasks={openTasks}
            completedToday={doneToday}
            reasons={notes.priorities_rationale?.reasons ?? {}}
            generatedAt={notes.priorities_rationale?.generated_at ?? null}
          />
          <CalendarWeek
            // The dashboard's own entries go first within a day: a reminder to
            // apply is the thing on that day you can act on right now.
            events={[...reminderEvents(researching, bandStart, bandEnd), ...calendar.events]}
            error={calendar.error ?? reminderError}
            configured={isCalendarConfigured()}
          />
        </div>
      </div>
    );
  } catch (err) {
    return <DataError scope="home" error={err} />;
  }
}
