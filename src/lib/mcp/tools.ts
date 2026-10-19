import "server-only";
import { z } from "zod";
import { getBoard, listOpenApplications, listApplications, getApplication } from "@/lib/db/applications";
import { listApplicationEvents } from "@/lib/db/applicationEvents";
import { listActiveContacts, listDueFollowUps, listContactTouches, findContactByName } from "@/lib/db/contacts";
import { listTasks, topPriorities } from "@/lib/db/tasks";
import { listConnections, matchConnectionsToCompanies, countConnections } from "@/lib/db/connections";
import { listGoalsForCurrentPeriods } from "@/lib/db/goals";
import { listHabits } from "@/lib/db/habits";
import { getNotes, habitStreak } from "@/lib/db/dailyLogs";
import { searchMemory } from "@/lib/db/memory";
import { getSettings } from "@/lib/db/settings";
import { fetchEvents, isCalendarConfigured } from "@/lib/calendar";
import { taskAge } from "@/lib/compress";
import { addDays, daysSince, endOfWeek, startOfWeek, toCivilDate, today } from "@/lib/time";
import { STAGE_LABEL, LANE_LABEL } from "@/lib/display";
import type { ApplicationRow, ContactRow, TaskRow } from "@/lib/types";

/**
 * What the dashboard can be asked about from the Claude app.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 * Nothing here knows how it is being reached. The stdio entry point in
 * `scripts/mcp.ts` is a thin wrapper, and a future HTTP route would be another
 * one — the tools themselves would not change. That split is also what keeps
 * the agreed "read-only first, writes later" plan cheap: a write tool is a
 * wrapper over the same `/api` route the browser already posts to, added
 * beside these rather than threaded through them.
 *
 * ── Read-only, on purpose ───────────────────────────────────────────────────
 * Every tool below reads. None of them writes, and none of them calls the
 * model — rule 4 is about page loads, but the same logic applies here: asking
 * "how is my search going" should cost nothing but a database round trip.
 *
 * ── Why it reuses src/lib/db ────────────────────────────────────────────────
 * These are the same functions the pages call. A second way of reading the
 * same rows would drift from the first, and then the Claude app and the
 * dashboard would disagree about the same question — which is worse than
 * either being wrong, because there would be no way to tell which.
 *
 * ── Output shape ────────────────────────────────────────────────────────────
 * Text, not JSON. The consumer is a language model reading a tool result, and
 * a compact labelled summary costs far fewer tokens than the same rows as
 * JSON — and reads better when quoted back. Where an id is genuinely needed to
 * ask a follow-up question, it is included explicitly.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  /** Arguments arrive untrusted and are validated against the schema first. */
  run: (input: unknown) => Promise<string>;
}

/**
 * One tool, with its arguments checked at the door.
 *
 * The transport hands over whatever the model produced, typed as `unknown`.
 * Parsing against the schema here rather than casting means a malformed
 * argument becomes a clear message about which field is wrong, instead of
 * `undefined` travelling into a query and quietly changing what it returns.
 */
function tool<S extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: S,
  run: (input: z.infer<S>) => Promise<string>,
): McpTool {
  return {
    name,
    description,
    inputSchema,
    run: async (input: unknown) => {
      const parsed = inputSchema.safeParse(input ?? {});
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
          .join("; ");
        throw new Error(`Those arguments do not fit ${name} — ${problems}`);
      }
      return run(parsed.data as z.infer<S>);
    },
  };
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

const dash = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "—");

function describeApplication(a: ApplicationRow): string {
  const bits = [
    `${a.company_name} — ${a.role_title}`,
    `[${STAGE_LABEL[a.stage]}${a.lane ? `, ${LANE_LABEL[a.lane]}` : ""}${a.kind === "grad_school" ? ", grad school" : ""}]`,
  ];
  if (a.applied_date) bits.push(`applied ${a.applied_date}`);
  if (a.deadline) bits.push(`due ${a.deadline}`);
  if (a.remind_on) bits.push(`remind ${a.remind_on}${a.remind_estimated ? " (est.)" : ""}`);
  const idle = daysSince(a.last_touched_at);
  if (idle !== null && idle > 0) bits.push(`${idle}d since last change`);
  return `- ${bits.join(" · ")}  (id ${a.id})`;
}

function describeContact(c: ContactRow): string {
  const since = daysSince(c.last_contacted_at);
  return (
    `- ${c.name}${c.role ? `, ${c.role}` : ""}${c.company_name ? ` @ ${c.company_name}` : ""} ` +
    `[${c.relationship_type}] · last spoke ${since === null ? "never" : `${since}d ago`}` +
    `${c.next_follow_up_at ? ` · follow up ${c.next_follow_up_at.slice(0, 10)}` : ""}  (id ${c.id})`
  );
}

function describeTask(t: TaskRow): string {
  const age = taskAge(t, today());
  const when = t.due_date
    ? age.days > 0 ? `${age.days}d overdue` : age.days === 0 ? "due today" : `due in ${-age.days}d`
    : `undated, ${age.days}d old`;
  return (
    `- ${t.title}${t.lane ? ` [${LANE_LABEL[t.lane]}]` : ""} · ${when}` +
    `${t.company_name ? ` · ${t.company_name}` : ""}  (id ${t.id})`
  );
}

/** A section with a heading, or nothing at all when it is empty. */
function section(heading: string, lines: string[], emptyNote?: string): string {
  if (lines.length === 0) return emptyNote ? `${heading}\n${emptyNote}` : "";
  return `${heading}\n${lines.join("\n")}`;
}

const join = (parts: string[]) => parts.filter(Boolean).join("\n\n");

/* ── The tools ────────────────────────────────────────────────────────────── */

export const MCP_TOOLS: McpTool[] = [
  tool(
    "pipeline_summary",
    "A snapshot of the whole job search: how many applications sit at each stage, " +
      "the resume pass rate, and anything that has gone quiet. Start here for " +
      "questions like 'how is my search going' or 'where do things stand'.",
    z.object({}),
    async () => {
      const [board, settings] = await Promise.all([getBoard(), getSettings()]);

      const counts = board.columns.map((c) => `${STAGE_LABEL[c.stage]}: ${c.applications.length}`);
      const all = board.columns.flatMap((c) => c.applications);

      // The same measure the board shows: of everything actually submitted,
      // how much got past a resume screen at least once.
      const submitted = all.filter((a) => a.stage !== "researching" && a.kind === "job");
      const passed = submitted.filter((a) => a.resume_passed);
      const rate = submitted.length
        ? `${Math.round((passed.length / submitted.length) * 100)}% (${passed.length}/${submitted.length} jobs)`
        : "not enough applications yet";

      const stale = all
        .filter((a) => {
          if (a.stage === "rejected" || a.stage === "archived" || a.stage === "researching") return false;
          const idle = daysSince(a.last_touched_at);
          return idle !== null && idle >= settings.compress_job_days;
        })
        .sort((x, y) => (daysSince(y.last_touched_at) ?? 0) - (daysSince(x.last_touched_at) ?? 0));

      return join([
        `Pipeline as of ${today()} — ${all.length} applications`,
        counts.join(" · "),
        `Resume pass rate: ${rate}`,
        section(
          `Gone quiet (no change in ${settings.compress_job_days}+ days):`,
          stale.map(describeApplication),
          "Nothing stale.",
        ),
      ]);
    },
  ),

  tool(
    "list_applications",
    "The applications themselves, optionally narrowed by stage, lane or company. " +
      "Use this when a question is about particular roles rather than the shape of " +
      "the pipeline as a whole.",
    z.object({
      stage: z
        .enum(["researching", "applied", "interviewing", "offer", "rejected", "archived"])
        .optional()
        .describe("Only applications at this stage."),
      lane: z.enum(["primary", "secondary", "peripheral"]).optional()
        .describe("Only applications in this priority tier."),
      company: z.string().optional().describe("Company name, matched loosely."),
      include_closed: z.boolean().optional()
        .describe("Include rejected and archived roles. Off by default."),
    }),
    async ({ stage, lane, company, include_closed }) => {
      const all = await listApplications();
      const needle = company?.toLowerCase().trim();

      const rows = all.filter((a) => {
        if (stage && a.stage !== stage) return false;
        if (lane && a.lane !== lane) return false;
        if (!stage && !include_closed && (a.stage === "rejected" || a.stage === "archived")) return false;
        if (needle && !a.company_name.toLowerCase().includes(needle)) return false;
        return true;
      });

      const what = [stage && STAGE_LABEL[stage], lane && LANE_LABEL[lane], company && `at ${company}`]
        .filter(Boolean)
        .join(", ");

      return (
        section(
          `${rows.length} application${rows.length === 1 ? "" : "s"}${what ? ` — ${what}` : ""}`,
          rows.map(describeApplication),
          "None match.",
        ) + (!stage && !include_closed ? "\n\n(Rejected and archived roles are hidden; ask for them explicitly.)" : "")
      );
    },
  ),

  tool(
    "today",
    "What today looks like: the ranked top tasks, habits and whether they are done, " +
      "goal progress for this week and month, and the week's calendar. Answers " +
      "'what should I be doing today' and 'what's on this week'.",
    z.object({}),
    async () => {
      const [priorities, habits, notes, streak, goals] = await Promise.all([
        topPriorities(5),
        listHabits(),
        getNotes(),
        habitStreak(),
        listGoalsForCurrentPeriods(),
      ]);

      const ticks = notes.habits ?? {};
      const habitLines = habits.map(
        (h) => `- [${ticks[h.id] ? "x" : " "}] ${h.label}${h.target ? ` (${h.target})` : ""}`,
      );

      const goalLines = (["week", "month"] as const).flatMap((scope) =>
        (goals[scope] ?? []).map(
          (g) => `- [${scope}] ${g.description} — ${g.current_count}/${g.target_count}${g.completed ? " ✓" : ""}`,
        ),
      );

      // The calendar is the one part that can fail on its own, since it reaches
      // outside. A broken feed should not take the rest of the answer with it.
      let calendar = "Calendar: not connected.";
      if (isCalendarConfigured()) {
        try {
          const events = await fetchEvents(startOfWeek(), endOfWeek());
          calendar = section(
            "This week:",
            events.map(
              (e) =>
                `- ${e.date}${e.allDay ? " (all day)" : ` ${e.start.toISOString().slice(11, 16)}Z`} — ${e.summary}`,
            ),
            "Nothing on the calendar this week.",
          );
        } catch (err) {
          calendar = `Calendar unavailable: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      return join([
        `Today is ${today()}.${notes.focus_today ? ` Focus: ${notes.focus_today}` : ""}`,
        section("Top tasks, ranked:", priorities.map(describeTask), "Nothing open."),
        section(`Habits (${streak}-day streak):`, habitLines, "No habits set."),
        section("Goals:", goalLines, "Nothing set for this period."),
        calendar,
      ]);
    },
  ),

  tool(
    "needs_attention",
    "Everything that has gone quiet or slipped: applications with no movement, " +
      "contacts not spoken to in a while, overdue tasks, and reminders to apply " +
      "that have passed. This is the 'what am I forgetting' question.",
    z.object({}),
    async () => {
      const [applications, contacts, tasks, settings] = await Promise.all([
        listOpenApplications(),
        listActiveContacts(),
        listTasks("open"),
        getSettings(),
      ]);
      const now = today();

      const staleJobs = applications.filter((a) => {
        const idle = daysSince(a.last_touched_at);
        return a.stage !== "researching" && idle !== null && idle >= settings.compress_job_days;
      });

      const coldContacts = contacts.filter((c) => {
        const since = daysSince(c.last_contacted_at);
        return since !== null && since >= settings.compress_contact_days;
      });

      const overdue = tasks.filter((t) => taskAge(t, now).days >= settings.compress_task_days);

      const missedReminders = applications.filter(
        (a) => a.stage === "researching" && a.remind_on && a.remind_on <= now,
      );

      return join([
        `Needs attention, as of ${now}`,
        section(`Applications quiet ${settings.compress_job_days}+ days:`, staleJobs.map(describeApplication)),
        section(`Contacts not spoken to in ${settings.compress_contact_days}+ days:`, coldContacts.map(describeContact)),
        section(`Tasks ${settings.compress_task_days}+ days past due:`, overdue.map(describeTask)),
        section("Reminders to apply that have passed:", missedReminders.map(describeApplication)),
      ]) || `Nothing needs attention as of ${now}.`;
    },
  ),

  tool(
    "list_contacts",
    "People in the CRM, with when they were last spoken to and when a follow-up " +
      "is due. Use follow_ups_due for 'who am I supposed to get back to'.",
    z.object({
      follow_ups_due: z.boolean().optional()
        .describe("Only people whose follow-up date has arrived."),
      company: z.string().optional().describe("Company name, matched loosely."),
    }),
    async ({ follow_ups_due, company }) => {
      const rows = follow_ups_due ? await listDueFollowUps(50) : await listActiveContacts();
      const needle = company?.toLowerCase().trim();
      const filtered = needle
        ? rows.filter((c) => (c.company_name ?? "").toLowerCase().includes(needle))
        : rows;

      return section(
        follow_ups_due ? "Follow-ups due:" : `${filtered.length} active contacts:`,
        filtered.map(describeContact),
        follow_ups_due ? "Nobody is waiting on a reply." : "No contacts.",
      );
    },
  ),

  tool(
    "contact_history",
    "Every logged conversation with one person, newest first — what was said and when.",
    z.object({ name: z.string().describe("The person's name, matched loosely.") }),
    async ({ name }) => {
      const contact = await findContactByName(name);
      if (!contact) return `No contact matching "${name}".`;

      const touches = await listContactTouches(contact.id);
      return join([
        `${contact.name}${contact.role ? `, ${contact.role}` : ""} — ${touches.length} logged conversation${touches.length === 1 ? "" : "s"}`,
        section(
          "",
          touches.map((t) => `- ${t.occurred_at.slice(0, 10)} — ${dash(t.text)}`),
          "Nothing logged yet.",
        ),
      ]);
    },
  ),

  tool(
    "application_history",
    "How one application moved through the pipeline, with the date of each step.",
    z.object({ application_id: z.string().describe("The id from list_applications.") }),
    async ({ application_id }) => {
      /*
        A malformed id is a question about something that is not there, not a
        failure. Postgres rejects a non-uuid with its own error, which would
        otherwise surface as "that lookup failed" and leave the model guessing
        whether the role exists.
      */
      let application;
      try {
        application = await getApplication(application_id);
      } catch {
        return `"${application_id}" is not an application id. Use list_applications to find one.`;
      }
      if (!application) return `No application with id ${application_id}.`;

      const events = await listApplicationEvents(application_id);
      return join([
        `${application.company_name} — ${application.role_title} (now ${STAGE_LABEL[application.stage]})`,
        section(
          "History:",
          events.map(
            (e) =>
              `- ${e.occurred_at.slice(0, 10)} — ${e.from_stage ? `${STAGE_LABEL[e.from_stage]} → ` : ""}` +
              `${STAGE_LABEL[e.to_stage]}${e.note ? ` · ${e.note}` : ""}`,
          ),
          "No recorded history.",
        ),
        application.notes ? `Notes: ${application.notes}` : "",
      ]);
    },
  ),

  tool(
    "outreach_radar",
    "Where outreach is worth doing: every role you have applied for, who you " +
      "already know at each company, and which have nobody known there yet. " +
      "This is the one to run before writing outreach messages — the second " +
      "group is what needs a search for alumni instead.",
    z.object({
      recent_days: z.number().optional().describe(
        "Only roles applied for within this many days. Omit for all of them.",
      ),
    }),
    async ({ recent_days }) => {
      const [applications, connections, total] = await Promise.all([
        listOpenApplications(),
        listConnections(),
        countConnections(),
      ]);

      if (total === 0) {
        return (
          "No LinkedIn connections have been imported yet, so there is nobody to " +
          "match against. Export them from LinkedIn (Settings & Privacy → Data " +
          "Privacy → Get a copy of your data → Connections) and run " +
          "`npm run import-connections -- <file>`."
        );
      }

      /*
        Only roles actually submitted. Outreach before applying is a different
        move, and the radar is explicitly post-application.

        There used to be a second filter here: a stored "worth reaching out
        about" flag, set by ticking a box on the application. It was removed on
        2026-10-19 along with the box, because in six weeks nothing was ever
        ticked and so this tool could only ever answer "nothing is marked". The
        question it is actually asked is "where do I know someone", and that
        needs no curation to answer.
      */
      const live = applications.filter((a) => a.stage !== "researching");
      const cutoff = recent_days ? addDays(today(), -recent_days) : null;
      const wanted = cutoff
        ? live.filter((a) => (a.applied_date ?? toCivilDate(new Date(a.created_at))) >= cutoff)
        : live;

      const matches = new Map(
        matchConnectionsToCompanies(live.map((a) => a.company_name), connections)
          .map((m) => [m.company_name.toLowerCase(), m.connections]),
      );
      const knownAt = (a: { company_name: string }) => matches.get(a.company_name.toLowerCase()) ?? [];

      const describeMatch = (a: typeof live[number]) => {
        const people = knownAt(a);
        const names = people
          .map((p) => `    · ${p.name}${p.position ? ` — ${p.position}` : ""}${p.profile_url ? ` (${p.profile_url})` : ""}`)
          .join("\n");
        return `- ${a.company_name} — ${a.role_title} [${STAGE_LABEL[a.stage]}]\n${names}`;
      };

      const readyToSend = wanted.filter((a) => knownAt(a).length > 0);
      const needsSearch = wanted.filter((a) => knownAt(a).length === 0);
      const scope = cutoff ? ` applied in the last ${recent_days} days` : "";

      return join([
        `Outreach radar — ${total} connections, ${wanted.length} role${wanted.length === 1 ? "" : "s"}${scope}`,
        section(
          "You already know someone there — draft a message:",
          readyToSend.map(describeMatch),
          wanted.length > 0 ? "None of these have a direct connection." : undefined,
        ),
        section(
          "Nobody known there — worth searching for alumni:",
          needsSearch.map((a) => `- ${a.company_name} — ${a.role_title} [${STAGE_LABEL[a.stage]}]`),
        ),
        wanted.length === 0
          ? "No submitted applications to match against yet."
          : "",
      ]);
    },
  ),

  tool(
    "who_do_i_know_at",
    "The people in your LinkedIn connections who work at a named company. " +
      "Answers 'do I know anyone at Stripe' without needing an application " +
      "for it to exist.",
    z.object({ company: z.string().describe("The company name.") }),
    async ({ company }) => {
      const connections = await listConnections();
      const matches = matchConnectionsToCompanies([company], connections);

      if (matches.length === 0) {
        return (
          `Nobody in your connections lists "${company}" as their employer. ` +
          "Names are matched exactly apart from case and punctuation, so a " +
          "company written differently there (\"Google LLC\" vs \"Google\") " +
          "will not match."
        );
      }

      return section(
        `${matches[0].connections.length} at ${company}:`,
        matches[0].connections.map(
          (p) =>
            `- ${p.name}${p.position ? ` — ${p.position}` : ""}` +
            `${p.connected_on ? ` · connected ${p.connected_on}` : ""}` +
            `${p.profile_url ? `\n    ${p.profile_url}` : ""}`,
        ),
      );
    },
  ),

  tool(
    "search_brain",
    "Full-text search over everything the dashboard has recorded — captures, stage " +
      "changes, conversations, completed tasks, weekly reviews. Use this for " +
      "'when did I…' and 'what did I say about…' questions.",
    z.object({
      query: z.string().describe("Words to search for."),
      limit: z.number().int().min(1).max(100).optional().describe("Default 25."),
    }),
    async ({ query, limit }) => {
      const entries = await searchMemory(query, limit ?? 25);
      return section(
        `${entries.length} result${entries.length === 1 ? "" : "s"} for "${query}":`,
        entries.map((e) => `- ${e.occurred_at.slice(0, 10)} [${e.source_type}] ${e.text}`),
        "Nothing found.",
      );
    },
  ),
];
