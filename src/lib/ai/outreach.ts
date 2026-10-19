import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic } from "./client";
import { OPERATOR } from "@/lib/constants";
import type { RadarLead } from "@/lib/outreach/types";

/**
 * The expensive half of the outreach radar: finding alumni on the open web,
 * and drafting what to say.
 *
 * ── What this does and does not touch ───────────────────────────────────────
 * Searches public pages only — public profiles, company team pages, press,
 * university news. It does **not** sign in to LinkedIn, and it does not go
 * near the university's own alumni directory: that sits behind his login, and
 * automating a logged-in session there is the same terms-of-service and
 * account-risk problem as LinkedIn. Results from the directory are his to
 * paste in by hand. Decided 2026-10-06.
 *
 * Nothing here sends a message. It writes drafts for him to read, edit and
 * send himself. There is no code path from this file to any outbound channel.
 *
 * ── Why alumni answers must carry a source ──────────────────────────────────
 * The model is being asked to assert that a named stranger attended a
 * particular university and works at a particular company. That is precisely
 * the kind of claim a language model will produce confidently from nothing, and
 * the cost of being wrong is not a bad row in a table — it is Asher opening a
 * message to a real person with "fellow alum here" when they never
 * went there.
 *
 * So every alumnus must come back with a URL the claim was read from, and a
 * candidate without one is dropped here rather than shown. That is the same
 * instinct as hard rule 5: what the model says is a lead, not a fact.
 *
 * ── Cost and time ───────────────────────────────────────────────────────────
 * One model call per company searched, plus one for drafting whatever the
 * operator picks. A search is the slow, expensive kind of call — measured at
 * 45-70 seconds per company on 2026-10-09 — so the caller caps how many
 * companies a single run may look at (MAX_COMPANIES_PER_RUN) and drafting is a
 * separate, later step for the few leads actually worth writing to.
 *
 * ── What "public web" means here in practice ────────────────────────────────
 * The first live runs read public LinkedIn profiles through a search engine,
 * the way anyone with a browser would. That is not the same as signing in and
 * browsing as Asher, which is the thing that breaks LinkedIn's terms and risks
 * his account, and it is not the alumni directory, which is behind his login.
 */

/** A deliberately small cap. A run that searches twenty companies is a run nobody authorised. */
export const MAX_COMPANIES_PER_RUN = 5;

/* ── Finding alumni ───────────────────────────────────────────────────────── */

const AlumniSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string().describe("The person's full name as the source gives it."),
      role: z.string().describe("Their job title at this company, or the empty string."),
      profile_url: z.string().describe("Their public profile, or the empty string."),
      evidence_url: z
        .string()
        .describe(
          "The page you read the university connection from. Required. If you " +
            "cannot point at a page that states it, do not include this person.",
        ),
      evidence_note: z
        .string()
        .describe("One sentence: what that page actually said. No inference beyond it."),
      confidence: z.number().describe("0 to 1."),
    }),
  ),
  searched: z.string().describe("One line on what you looked at, for the run log."),
});

const ALUMNI_SYSTEM = `You find people at a company who went to the same university as a job applicant, using public web pages only.

RULES, in order of importance:

1. Every person you return MUST have evidence_url pointing at a page you actually read that states BOTH the university connection AND that they work at this company. A company team page, a public profile, a news item, a university alumni story. If you cannot point at such a page, do not return the person. An empty list is a correct and useful answer.

2. Never infer the university from a name, a photo, a location, or a job title. Never guess. "Likely attended" is not evidence.

3. evidence_note must say what the page said, in one sentence, and nothing beyond it.

4. Prefer people whose role makes them worth talking to about this specific job: someone on the team, a hiring manager, a recruiter, a recent graduate in a similar seat. A senior executive with no connection to the role is rarely the right person.

5. Do not return more than four people. Fewer and better is the point.

You are helping someone decide who to send a short, polite message to. Being wrong wastes a real stranger's time and embarrasses the sender.`;

export interface AlumniSearchResult {
  candidates: {
    name: string;
    role: string | null;
    profile_url: string | null;
    evidence_url: string;
    evidence_note: string;
  }[];
  searched: string;
}

export async function findAlumniAt(
  companyName: string,
  roleTitle: string,
): Promise<AlumniSearchResult> {
  /*
    The university is configured rather than hardcoded (see OPERATOR in
    constants.ts), so it can be absent. Without it there is nothing to search
    for: the prompt below would ask for people who attended "", and a model
    handed a blank will either return nothing or fill the gap itself - and an
    invented school is exactly how a real stranger receives a message claiming
    a connection that does not exist. Refuse rather than run.
  */
  if (!OPERATOR.university.trim()) {
    throw new Error(
      "No university is configured, so the alumni search cannot run. " +
        "Set NEXT_PUBLIC_OPERATOR_UNIVERSITY.",
    );
  }

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: ALUMNI_SYSTEM,
    output_config: { format: zodOutputFormat(AlumniSchema) },
    tools: [
      {
        // Dynamic filtering; supported on claude-opus-5.
        type: "web_search_20260209",
        name: "web_search",
        /*
          Raised from 6 on 2026-10-09, after the first live runs. Six was not
          enough to work through a large employer: at one large consulting firm
          the search returned nobody, and at another the model said in its own
          words that "the search tool quota was exhausted before I could check
          [...]". A search that stops early looks
          exactly like a company with no alumni, which is the worst way for
          this to fail - it reports a confident nothing.
        */
        max_uses: 14,
      },
    ],
    messages: [
      {
        role: "user",
        content:
          `Find people at ${companyName} who attended ${OPERATOR.university}.\n\n` +
          `Context: the applicant has applied for "${roleTitle}" at ${companyName}, ` +
          `and wants to send one short message to someone there who might talk to them ` +
          `about it.\n\n` +
          `Return only people you can evidence from a page you read.`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The alumni search returned nothing in the expected shape.");

  const blank = (v: string | undefined | null) => {
    const t = v?.trim();
    return t ? t : null;
  };

  /*
    The schema can ask for an evidence URL; it cannot make the answer true. A
    candidate with no usable source is dropped here — silently to the model,
    loudly to the log, because a search that keeps producing unsourced people
    is worth knowing about.
  */
  const candidates = parsed.candidates
    .filter((c) => {
      const name = c.name?.trim();
      const url = c.evidence_url?.trim();
      if (!name) return false;
      if (!url || !/^https?:\/\//i.test(url)) {
        console.warn(
          `[ai:outreach] dropped "${name}" at ${companyName}: no usable evidence URL.`,
        );
        return false;
      }
      return true;
    })
    .slice(0, 4)
    .map((c) => ({
      name: c.name.trim(),
      role: blank(c.role),
      profile_url: blank(c.profile_url),
      evidence_url: c.evidence_url.trim(),
      evidence_note: c.evidence_note?.trim() || "No note given.",
    }));

  return { candidates, searched: parsed.searched?.trim() || `Searched for ${OPERATOR.university} alumni at ${companyName}.` };
}

/* ── Drafting ─────────────────────────────────────────────────────────────── */

const DraftsSchema = z.object({
  drafts: z.array(
    z.object({
      index: z.number().describe("The index of the lead this is for, as given."),
      message: z.string().describe("The message itself. No subject line, no signature."),
    }),
  ),
});

const DRAFT_SYSTEM = `You write short LinkedIn messages for a final-year student reaching out about jobs they have already applied for.

SHAPE. Exactly three sentences, in this order:

1. The greeting, and in the same sentence the specific reason it is THEM. Their team, their role, how the sender knows them, or the thing the evidence says they share.
2. One sentence on who the sender is and what they are after.
3. The ask: a short call, with an easy way to say no in the same sentence.

Around 60 words. Never more than 80. No subject line, no sign-off, no bullet points.

THE FIRST SENTENCE IS THE WHOLE MESSAGE. A first sentence that would work for anyone makes the other two worthless, because the reader has already decided. "Hi Dana - I saw you moved onto the grid-modelling team last year" is a message. "Hi Dana - I hope you're well" is a template, and reads as one.

NEVER:
- "I hope this finds you well", "I was wondering if you might possibly", exclamation marks, or flattery about their impressive career.
- Asking them to refer the sender, pass on a resume, or put in a word. The ask is their time, not their credibility.
- Claiming anything about them that is not in the material given.

TONE: a capable person asking a reasonable favour. Not a supplicant, not a salesperson.

TWO KINDS OF RECIPIENT, and the difference matters:
- Someone the sender already knows (a first-degree connection): resume contact. Do NOT introduce yourself to them as though you were strangers - sentence 2 is what you are doing now, not who you are.
- An alumnus the sender has not met: the shared university is one clause of sentence 1, not its subject, and sentence 2 is a real introduction.

Return one draft per lead given, keyed by the index supplied.`;

/**
 * Draft a message per lead, in one call.
 *
 * Batched rather than one call each: the drafts are better when the model can
 * see them together — it stops writing the same sentence four times — and it
 * is a fraction of the cost.
 */
export async function draftOutreach(
  leads: RadarLead[],
): Promise<Map<number, string>> {
  if (leads.length === 0) return new Map();

  const described = leads
    .map((lead, i) => {
      const how =
        lead.via === "connection"
          ? "Already connected on LinkedIn."
          : `Does not know them. ${OPERATOR.university} alum. ${lead.evidence_note ?? ""}`;
      return (
        `[${i}] ${lead.person_name}${lead.person_role ? `, ${lead.person_role}` : ""} ` +
        `at ${lead.company_name}\n` +
        `    Applied for: ${lead.role_title} (currently ${lead.stage})\n` +
        `    ${how}`
      );
    })
    .join("\n\n");

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: DRAFT_SYSTEM,
    output_config: { format: zodOutputFormat(DraftsSchema) },
    messages: [
      {
        role: "user",
        content:
          `The sender is ${OPERATOR.name}, ${OPERATOR.track}, at ${OPERATOR.university}.\n\n` +
          `Write one message per lead:\n\n${described}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The drafter returned nothing in the expected shape.");

  const out = new Map<number, string>();
  for (const draft of parsed.drafts) {
    const text = draft.message?.trim();
    // An index the model invented refers to no lead; dropping it is better than
    // attaching someone else's message to a person.
    if (!text || !Number.isInteger(draft.index)) continue;
    if (draft.index < 0 || draft.index >= leads.length) {
      console.warn(`[ai:outreach] dropped a draft for index ${draft.index}; only ${leads.length} leads.`);
      continue;
    }
    out.set(draft.index, text);
  }

  return out;
}
