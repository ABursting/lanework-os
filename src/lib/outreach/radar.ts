import "server-only";
import { DEMO_MODE } from "@/lib/demo";
import { listOpenApplications } from "@/lib/db/applications";
import { listConnections, matchConnectionsToCompanies, countConnections } from "@/lib/db/connections";
import { STAGE_LABEL } from "@/lib/display";
import { MAX_COMPANIES_PER_RUN, findAlumniAt } from "@/lib/ai/outreach";
import { isAiConfigured } from "@/lib/ai/client";
import type { RadarGap, RadarLead, RadarRun, RadarStep } from "./types";

/**
 * The outreach radar: where outreach is worth doing, and who to do it with.
 *
 * ── What this half does ─────────────────────────────────────────────────────
 * Reads the connections, compares them against the companies on the board, and
 * reports who is already known where. No model call, no network — just two
 * lists compared — so it is free to run and runs in the time a query takes.
 *
 * The other half (searching the open web for alumni at the companies where
 * nobody is known, and drafting messages) costs money per run and is kept
 * separate for that reason.
 *
 * ── Only roles already submitted ────────────────────────────────────────────
 * Researching roles are excluded. Outreach before applying is a different move
 * with a different message, and the radar is explicitly post-application.
 *
 * ── Nothing here sends anything ─────────────────────────────────────────────
 * There is no code path from this file to LinkedIn, to email, or to any
 * outbound channel at all. It produces drafts to read.
 */

/** Time one step so a slow run shows where it went, rather than merely feeling slow. */
async function step<T>(
  steps: RadarStep[],
  partial: Omit<RadarStep, "ms" | "count">,
  run: () => Promise<T>,
  count?: (result: T) => number,
): Promise<T> {
  const started = Date.now();
  const result = await run();
  steps.push({
    ...partial,
    ms: Date.now() - started,
    ...(count ? { count: count(result) } : {}),
  });
  return result;
}

export interface RadarOptions {
  /**
   * Also search the open web for alumni where nobody is known.
   *
   * Off by default, and deliberately not the same button: this is the half
   * that spends money and takes half a minute, where the half above is two
   * lists compared.
   *
   * Searching does NOT draft. Drafting is a separate, later step the operator
   * asks for per lead - see /api/outreach/draft. Asher's call, 2026-10-09, and
   * it is the same shape as the capture bar: the machine proposes, he picks,
   * and only then is anything written. Drafting everything up front also pays
   * for messages to people he was never going to contact.
   */
  search?: boolean;

  /**
   * Limit the run to these applications. Without it the run covers whatever is
   * marked "Worth reaching out about". With it, a single role can be pointed
   * at directly - which is how the first live run was kept to one company.
   */
  applicationIds?: string[];
  /**
   * Also report companies where someone is known but outreach was not marked.
   * Off by default: the marked roles are the ones he has decided matter, and
   * mixing in everything else turns a short list into a scan.
   */
  includeUnmarked?: boolean;
}

export async function runConnectionRadar(options: RadarOptions = {}): Promise<RadarRun> {
  const steps: RadarStep[] = [];
  const ran_at = new Date().toISOString();

  const connections = await step(
    steps,
    { kind: "read", label: "Read your LinkedIn connections", detail: "from your own export — nothing logs in to LinkedIn" },
    () => listConnections(),
    (rows) => rows.length,
  );

  if (connections.length === 0) {
    /*
      Two audiences, two messages. On Asher's dashboard this is a to-do with a
      command attached. On the public demo it is a state that should not happen
      - the nightly reset seeds connections - but if it ever does, a visitor
      would otherwise be told to run a shell command against a repository they
      have never cloned.
    */
    steps.push({
      kind: "skip",
      label: "No connections imported yet",
      detail: DEMO_MODE
        ? "This demo seeds its own invented connections each night; today's reset has not run yet."
        : "Run `npm run import-connections -- <file>` after exporting them from LinkedIn.",
    });
    return { ran_at, steps, leads: [], gaps: [] };
  }

  const applications = await step(
    steps,
    { kind: "read", label: "Read the applications you have submitted", detail: "Researching roles excluded — outreach comes after applying" },
    async () => (await listOpenApplications()).filter((a) => a.stage !== "researching"),
    (rows) => rows.length,
  );

  const chosen = options.applicationIds?.length ? new Set(options.applicationIds) : null;
  const marked = chosen
    ? applications.filter((a) => chosen.has(a.id))
    : applications.filter((a) => a.outreach_wanted);

  const matches = await step(
    steps,
    {
      kind: "match",
      label: "Compared every connection's employer against those companies",
      detail: "names compared ignoring case, punctuation and spacing — but never fuzzily, so a near-miss is not a match",
    },
    async () =>
      new Map(
        matchConnectionsToCompanies(applications.map((a) => a.company_name), connections)
          .map((m) => [m.company_name.toLowerCase(), m.connections]),
      ),
    (m) => m.size,
  );

  const knownAt = (company: string) => matches.get(company.toLowerCase()) ?? [];

  const considered = options.includeUnmarked
    ? applications.filter((a) => a.outreach_wanted || knownAt(a.company_name).length > 0)
    : marked;

  const leads: RadarLead[] = [];
  const gaps: RadarGap[] = [];

  for (const application of considered) {
    const people = knownAt(application.company_name);

    if (people.length === 0) {
      gaps.push({
        application_id: application.id,
        company_name: application.company_name,
        role_title: application.role_title,
        reason: "Nobody in your connections works here — worth searching for alumni.",
      });
      continue;
    }

    for (const person of people) {
      leads.push({
        application_id: application.id,
        company_name: application.company_name,
        role_title: application.role_title,
        stage: STAGE_LABEL[application.stage],
        person_name: person.name,
        person_role: person.position,
        profile_url: person.profile_url,
        via: "connection",
        draft: null,
      });
    }
  }

  steps.push({
    kind: "match",
    label: `Found ${leads.length} first-degree ${leads.length === 1 ? "lead" : "leads"}`,
    count: leads.length,
    detail:
      gaps.length > 0
        ? `${gaps.length} picked ${gaps.length === 1 ? "role has" : "roles have"} nobody you know — those need a search`
        : undefined,
  });

  if (marked.length === 0 && !chosen) {
    steps.push({
      kind: "skip",
      label: "No roles are marked for outreach",
      detail: 'Tick "Worth reaching out about" on an application to point the radar at it.',
    });
  }

  if (!options.search) return { ran_at, steps, leads, gaps };

  /*
    From here on every step costs money. Reached only when the caller asked
    for it explicitly — rule 4 is about page loads, but the same reasoning
    applies harder to a web search: nothing below should ever happen because
    someone opened a tab.
  */
  if (!isAiConfigured()) {
    steps.push({
      kind: "skip",
      label: "Searching skipped",
      detail: "ANTHROPIC_API_KEY is not set.",
    });
    return { ran_at, steps, leads, gaps };
  }

  const remainingGaps: RadarGap[] = [];

  /*
    The cap is on COMPANIES, and this is what makes that true.

    `gaps` has one entry per role, so two roles at the same employer were two
    entries - and slicing that list meant a run could spend two of its five
    searches asking the open web the same question about the same company, and
    report "5 companies" when it had looked at three. Searching is the part
    that costs money, so the unit it is counted in has to be the unit it is
    billed in.

    The first role at each company carries the search; any others there are
    answered by the same result below.
  */
  const byCompany = new Map<string, RadarGap[]>();
  for (const gap of gaps) {
    const key = gap.company_name.toLowerCase();
    byCompany.set(key, [...(byCompany.get(key) ?? []), gap]);
  }
  const companies = [...byCompany.values()].map((roles) => roles[0]);
  const searchable = companies.slice(0, MAX_COMPANIES_PER_RUN);
  const searchedCompanies = new Set(searchable.map((g) => g.company_name.toLowerCase()));
  /** Every role at a company, so an answer about the company covers all of them. */
  const rolesAt = (company: string) => byCompany.get(company.toLowerCase()) ?? [];

  if (companies.length > searchable.length) {
    const left = companies.length - searchable.length;
    steps.push({
      kind: "skip",
      label: `Left ${left} ${left === 1 ? "company" : "companies"} unsearched`,
      detail: `A run searches at most ${MAX_COMPANIES_PER_RUN}. Run it again to continue.`,
    });
  }

  // Roles at a company this run did not reach stay exactly as they were.
  for (const gap of gaps) {
    if (!searchedCompanies.has(gap.company_name.toLowerCase())) remainingGaps.push(gap);
  }

  for (const gap of searchable) {
    try {
      const started = Date.now();
      const found = await findAlumniAt(gap.company_name, gap.role_title);

      /*
        The model's own account of what it looked at, not a fixed string. A
        search that finds nobody is a common and correct outcome, and without
        this there is no way to tell "looked hard, found nothing" from "barely
        looked" - which is exactly the question the first live run raised.
      */
      steps.push({
        kind: "search",
        label: `Searched the open web for alumni at ${gap.company_name}`,
        count: found.candidates.length,
        detail: found.searched,
        ms: Date.now() - started,
      });

      if (found.candidates.length === 0) {
        // Every role at this company, not just the one that carried the
        // search: the answer was about the employer, and the others would
        // otherwise disappear from the report having never been accounted for.
        for (const role of rolesAt(gap.company_name)) {
          remainingGaps.push({
            ...role,
            reason:
              "Nobody in your connections works here, and nothing public tied an alum " +
              "to the company. Worth checking the alumni directory yourself.",
          });
        }
        continue;
      }

      for (const person of found.candidates) {
        leads.push({
          application_id: gap.application_id,
          company_name: gap.company_name,
          role_title: gap.role_title,
          stage: "",
          person_name: person.name,
          person_role: person.role,
          profile_url: person.profile_url,
          via: "alumni",
          evidence_url: person.evidence_url,
          evidence_note: person.evidence_note,
          draft: null,
        });
      }
    } catch (err) {
      // One company failing should not lose the others, or the connection
      // leads already found above.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[radar] alumni search failed for ${gap.company_name}:`, message);
      steps.push({
        kind: "skip",
        label: `Could not search ${gap.company_name}`,
        detail: message,
      });
      for (const role of rolesAt(gap.company_name)) remainingGaps.push(role);
    }
  }

  // The stage is only known for leads that came from an application row; an
  // alumni lead borrows it from the role it belongs to.
  for (const lead of leads) {
    if (!lead.stage) {
      const match = applications.find((a) => a.id === lead.application_id);
      lead.stage = match ? STAGE_LABEL[match.stage] : "";
    }
  }

  return { ran_at, steps, leads, gaps: remainingGaps };
}

/** For the header line: how much there is to work with at all. */
export async function radarInventory(): Promise<{ connections: number }> {
  return { connections: await countConnections() };
}
