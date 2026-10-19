import type { Stage } from "@/lib/types";

/**
 * How a new role is compared with the ones already tracked.
 *
 * Two tiers, because one is not enough:
 *
 *   same       the company and role title match once case, punctuation and
 *              little connecting words ("and", "&", "of", "the") are ignored.
 *              Safe to treat as the same role without asking.
 *
 *   possible   same company, and the titles share most of their words — or one
 *              title is the other with extra words on it. Not safe to decide
 *              alone, so the confirm screen asks.
 *
 * The case that prompted this (2026-10-06): one Lenovo role was captured from
 * two sites, once as "… Global Future Leaders Program (2027)" and once as
 * "… Global Future Leaders (2027)". Exact matching saw two roles. "Program" is
 * deliberately *not* ignored by the `same` tier — "Program Manager" and
 * "Manager" are different jobs — so that pair lands in `possible` instead.
 *
 * Pure, and kept free of the database so both confirm screens and the tests
 * can use it.
 */

/**
 * How a company or role name is compared.
 *
 * Case, punctuation and runs of spaces are all noise: "Arcadia Climate",
 * "arcadia climate" and "Arcadia  Climate." are one company, and a listing
 * that spells it differently must not produce a second row.
 */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Words that never change which job a title means. "&" is already gone. */
const CONNECTORS = new Set(["and", "the", "of", "a", "an", "for", "at", "in", "to"]);

function titleWords(roleTitle: string): string[] {
  return normalizeName(roleTitle)
    .split(" ")
    .filter((w) => w && !CONNECTORS.has(w));
}

/** The `same` tier: two roles with equal keys are one role. */
export function dedupeKey(companyName: string, roleTitle: string): string {
  return `${normalizeName(companyName)}::${titleWords(roleTitle).join(" ")}`;
}

/**
 * Share of words two titles have in common, 0–1. The bar is set so that a
 * programme name shared by several different roles does not on its own make
 * them look alike: "Strategy Specialist – Global Future Leaders Program" and
 * "AI Strategy & Innovation Analyst – Global Future Leaders Program" score 0.6
 * and are left alone; the Lenovo pair above scores 0.89 and is asked about.
 */
const POSSIBLE_OVERLAP = 0.7;

function titleSimilarity(a: string, b: string): number {
  const wa = new Set(titleWords(a));
  const wb = new Set(titleWords(b));
  if (wa.size === 0 || wb.size === 0) return 0;

  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const overlap = shared / (wa.size + wb.size - shared);

  // "AI Strategy Analyst" inside "AI Strategy Analyst – Future Leaders": one
  // site shortened the title. Needs two words so "Intern" does not match
  // every internship.
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  const contained = small.size >= 2 && [...small].every((w) => large.has(w));

  return contained ? Math.max(overlap, POSSIBLE_OVERLAP) : overlap;
}

export interface TrackedRole {
  id: string;
  company_name: string;
  role_title: string;
  stage: Stage;
}

export interface PossibleMatch {
  application_id: string;
  role_title: string;
  stage: Stage;
}

/**
 * The tracked role that looks most like this one without being the same by
 * `dedupeKey`, or null. Only roles at the same company are considered.
 */
export function findPossibleMatch(
  companyName: string,
  roleTitle: string,
  tracked: readonly TrackedRole[],
): PossibleMatch | null {
  const company = normalizeName(companyName);
  const key = dedupeKey(companyName, roleTitle);

  let best: { role: TrackedRole; score: number } | null = null;
  for (const role of tracked) {
    if (normalizeName(role.company_name) !== company) continue;
    if (dedupeKey(role.company_name, role.role_title) === key) continue;
    const score = titleSimilarity(roleTitle, role.role_title);
    if (score >= POSSIBLE_OVERLAP && (!best || score > best.score)) best = { role, score };
  }

  return best
    ? { application_id: best.role.id, role_title: best.role.role_title, stage: best.role.stage }
    : null;
}
