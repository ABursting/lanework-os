import { addDays, today } from "../time";
import type { RadarLead, RadarRun, RadarStep } from "../outreach/types";

/**
 * The demo's radar run.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * A finished list of three people to message looks exactly like a hardcoded
 * list of three people. The interesting part of this feature is invisible in
 * its own output: that something read several hundred connections, compared
 * them against the board, noticed which marked roles had nobody, searched the
 * open web for those, and wrote a draft for each.
 *
 * So the demo shows the steps, through the same component the real app uses
 * and typed as the same `RadarRun`. It is not a screenshot of the feature; it
 * is the feature, fed a recording. A visitor sees the machinery, which is the
 * only honest way to demonstrate that there is machinery.
 *
 * ── Why recorded rather than live ───────────────────────────────────────────
 * Three reasons, and the third is the one that settles it. A live web search
 * per visitor costs real money on Asher's key. A live search is unpredictable
 * in a way a demo should not be. And it would be searching for *real people*
 * on behalf of a fictional student — which is not something to do to strangers
 * to decorate a portfolio.
 *
 * It is labelled as recorded wherever it is shown. A demo that lets someone
 * believe a live search just happened is lying to them.
 *
 * ── Everything here is invented ─────────────────────────────────────────────
 * The people, the companies, the alumni, the evidence links. The universities
 * and firms do not exist, and the URLs point at example.com on purpose.
 */

/**
 * Built per request so the dates move with today — a recorded run stamped last
 * month would read as a demo nobody has touched.
 */
export function demoRadarRun(): RadarRun {
  const ago = (days: number) => addDays(today(), -days);

  return {
    ran_at: `${today()}T14:02:00.000Z`,
    recorded: true,

    steps: [
      {
        kind: "read",
        label: "Read your LinkedIn connections",
        count: 847,
        detail: "from your own LinkedIn export — nothing logs in to LinkedIn",
        ms: 214,
      },
      {
        kind: "read",
        label: "Read the applications you have submitted",
        count: 26,
        detail: "Researching roles excluded — outreach comes after applying",
        ms: 96,
      },
      {
        kind: "match",
        label: "Compared every connection's employer against those companies",
        count: 4,
        detail:
          "names compared ignoring case, punctuation and spacing — but never fuzzily, " +
          "so a near-miss is not a match",
        ms: 11,
      },
      {
        kind: "match",
        label: "Found 3 first-degree leads",
        count: 3,
        detail: "2 marked roles have nobody you know — those need a search",
        ms: 2,
      },
      {
        kind: "search",
        label: "Searched the open web for Calloway alumni at Terrawatt Energy",
        count: 2,
        detail:
          "public pages only — public profiles, team pages, press. The alumni " +
          "directory is behind a login and is never automated.",
        ms: 4120,
      },
      {
        kind: "search",
        label: "Searched the open web for Calloway alumni at Meridian Software",
        count: 0,
        detail: "nothing public tied an alum to this company — left for you to judge",
        ms: 3880,
      },
      {
        kind: "draft",
        label: "Drafted 4 messages",
        count: 4,
        detail: "each names why you are writing to that person specifically",
        ms: 9340,
      },
    ],

    leads: [
      {
        application_id: "demo-lead-1",
        company_name: "Arcadia Climate",
        role_title: "Data Analyst, Climate Risk",
        stage: "Interviewing",
        person_name: "Priya Raghunathan",
        person_role: "Senior Analyst, Grid Strategy",
        profile_url: "https://www.example.com/in/priya-raghunathan",
        via: "connection",
        draft:
          "Hi Priya — I saw you're on the grid strategy side at Arcadia. I'm in the " +
          "final round for the Climate Risk Analyst role there and would love 15 minutes " +
          "to hear how the team actually uses the risk models day to day. No pressure " +
          "either way — happy to work around your week.",
      },
      {
        application_id: "demo-lead-2",
        company_name: "Northwind Analytics",
        role_title: "Data Scientist, Energy Practice",
        stage: "Interviewing",
        person_name: "Marcus Oyelaran",
        person_role: "Engagement Manager",
        profile_url: "https://www.example.com/in/marcus-oyelaran",
        via: "connection",
        draft:
          "Hi Marcus — I'm working through the case study for the Energy Practice data " +
          "scientist role and remembered you're an EM there. Would you have 20 minutes " +
          "this week? Mostly curious what separates a good case response from a fine one.",
      },
      {
        application_id: "demo-lead-3",
        company_name: "Current Labs",
        role_title: "Associate Product Manager",
        stage: "Applied",
        person_name: "Dana Whitfield",
        person_role: "Technical Recruiter",
        profile_url: "https://www.example.com/in/dana-whitfield",
        via: "connection",
        draft:
          "Hi Dana — I applied for the APM role at Current Labs about a week ago. I know " +
          "recruiters get a lot of these, so no obligation at all, but if the req is still " +
          "open I'd welcome the chance to say briefly why grid software specifically.",
      },
      {
        application_id: "demo-lead-4",
        company_name: "Terrawatt Energy",
        role_title: "Project Development Analyst",
        stage: "Interviewing",
        person_name: "Alina Chaudhry",
        person_role: "Director of Development, Southeast",
        profile_url: "https://www.example.com/in/alina-chaudhry",
        via: "alumni",
        evidence_url: "https://www.example.com/terrawatt/team/alina-chaudhry",
        evidence_note:
          "Terrawatt's own team page lists her as Calloway University, class of 2016.",
        draft:
          "Hi Alina — fellow Calloway grad here, a few years behind you. I'm two rounds " +
          "into the Project Development Analyst role at Terrawatt and saw you lead " +
          "development for the Southeast. Would you be open to a short call? I'd mostly " +
          "like to understand how the team thinks about siting in this region.",
      },
    ],

    gaps: [
      {
        application_id: "demo-gap-1",
        company_name: "Meridian Software",
        role_title: "Product Manager Intern → FT",
        reason:
          "Nobody in your connections works here, and nothing public tied a Calloway " +
          "alum to the company. Worth checking the alumni directory yourself.",
      },
      {
        application_id: "demo-gap-2",
        company_name: "Helio Grid",
        role_title: "Analyst, Grid Strategy",
        reason: `Marked for outreach on ${ago(3)}, but the offer arrived first — probably no longer needed.`,
      },
    ],
  };
}

/**
 * The recorded half: the web search, and the alumnus it found.
 *
 * Since 2026-10-19 the demo does its own matching for real - there are
 * fictional connections in its database, and the same code compares them
 * against the same board. Only this part is still a replay, for the three
 * reasons in the note above: it costs money per visitor, it is unpredictable,
 * and it would be searching for *real people* on behalf of a fictional
 * student, which is not a thing to do to strangers to decorate a portfolio.
 *
 * Layered on top of a real run rather than replacing it, and labelled as the
 * one replayed part. The lead comes back with no draft: drafting is live in
 * the demo now, so the visitor's own click is what writes the message.
 */
export function demoAlumniOverlay(): { steps: RadarStep[]; leads: RadarLead[] } {
  const full = demoRadarRun();
  return {
    steps: full.steps.filter((s) => s.kind === "search"),
    leads: full.leads
      .filter((l) => l.via === "alumni")
      .map((l) => ({ ...l, draft: null })),
  };
}
