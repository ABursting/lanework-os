/**
 * What a radar run did, not just what it found.
 *
 * ── Why a trace exists at all ───────────────────────────────────────────────
 * The radar's useful output is a short list — three people to message. Shown
 * on its own that list is indistinguishable from a hardcoded one, and it hides
 * the only interesting part: that something read several hundred connections,
 * compared them against the board, noticed which marked roles had nobody, went
 * looking on the open web for those, and wrote a draft for each.
 *
 * So the run records its own steps and the dashboard shows them. In the real
 * app this is the honest answer to "what did it actually do, and can I trust
 * it" — every claim comes with where it came from. In the public demo it is
 * the only way to show that there is an agent here rather than a page of
 * prepared text.
 *
 * ── The same shape for both ─────────────────────────────────────────────────
 * The demo replays a recorded run through this exact type and the exact
 * component the real one uses. Nothing in the demo is a screenshot or a mockup
 * of the feature; it is the feature, fed recorded input. That is also what
 * keeps the demo honest as the real thing changes — a step added to the real
 * radar and not to the recording shows up as a visible difference rather than
 * quietly drifting.
 */

export type RadarStepKind =
  /** Reading rows that were already there. */
  | "read"
  /** Comparing two sets — connections against companies. */
  | "match"
  /** Going out to the open web. */
  | "search"
  /** Asking the model for something. */
  | "draft"
  /** Nothing to do, and why. */
  | "skip";

export interface RadarStep {
  kind: RadarStepKind;
  /** One line, past tense, what happened. */
  label: string;
  /** The number this step produced, when it produced one. */
  count?: number;
  /** Where it looked, or what it decided — shown smaller, under the label. */
  detail?: string;
  /** Milliseconds, so a slow step is visible rather than merely suspected. */
  ms?: number;
}

/** Someone worth messaging about a particular role. */
export interface RadarLead {
  application_id: string;
  company_name: string;
  role_title: string;
  stage: string;

  person_name: string;
  person_role: string | null;
  profile_url: string | null;

  /**
   * How this person was found. A first-degree connection is someone he already
   * knows; an alumnus is a stranger found on the open web, and the message has
   * to read differently — so the difference is carried through rather than
   * flattened into one list.
   */
  via: "connection" | "alumni";

  /**
   * For an alumni lead: where the claim came from. Never a bare assertion —
   * the model is being asked to say a stranger went to the same university,
   * and that is exactly the kind of thing it will invent if nothing holds it
   * to a source.
   */
  evidence_url?: string | null;
  evidence_note?: string | null;

  /** The drafted message, or null when drafting has not run for this lead. */
  draft?: string | null;
}

/** A role marked for outreach where nobody was found at all. */
export interface RadarGap {
  application_id: string;
  company_name: string;
  role_title: string;
  reason: string;
}

export interface RadarRun {
  ran_at: string;
  steps: RadarStep[];
  leads: RadarLead[];
  gaps: RadarGap[];
  /**
   * Set when part of this run was replayed rather than done — the public demo.
   * Rendered as a visible label, because a demo that lets a visitor believe a
   * live search just happened is lying to them.
   *
   * It names the part, rather than being a flag over the whole run, because
   * since 2026-10-19 the demo's runs are a mixture: the connection matching is
   * real work over fictional data, and only the web search is a recording.
   * "This is recorded" would now be the lie it was written to prevent.
   */
  replayed?: "search";
  /** @deprecated Use `replayed`. Kept so an older cached payload still renders. */
  recorded?: boolean;
  /** Set when a step failed; the run still returns what it managed. */
  error?: string | null;
}
