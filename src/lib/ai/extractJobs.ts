import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic } from "./client";
import { dedupeKey, normalizeName, listApplications } from "@/lib/db/applications";
import { findPossibleMatch } from "@/lib/roleMatch";
import { listCompanyNames } from "@/lib/db/companies";
import { civilOrNull } from "@/lib/reminders";
import { today } from "@/lib/time";
import { APP_TIMEZONE } from "@/lib/constants";
import type { ExtractedJob, ScreenshotClassification, Stage } from "@/lib/types";

/**
 * Screenshot import.
 *
 * Same pipeline as a text capture — extract, dedupe, confirm, commit — with
 * images where the note would be. One screenshot of a LinkedIn or Handshake
 * page holds many listings, and one capture can carry several screenshots, so
 * this returns a list rather than a single reading. Every row is deduped
 * against the other screenshots and against the applications that already
 * exist before a human is asked to tick anything.
 *
 * An "application received" email counts as a listing too (2026-09-29): it
 * names a company and a role, and the confirm screen's "Already applied" is
 * the right answer for it. Rejections and interview invites are not read here
 * — they move an existing application, which the text classifier does.
 *
 * The model is NOT asked whether the page shows roles already applied to or
 * roles to consider. The person says so on the confirm screen, and nothing
 * commits until they have — a guess that is wrong half the time is worse than
 * one required click. What the model does read is each listing's deadline or
 * posting age, which is what reminders are worked out from.
 */

const JobsSchema = z.object({
  jobs: z.array(
    z.object({
      company_name: z.string(),
      role_title: z.string(),
      location: z.string().describe("Empty string if the listing shows no location."),
      source_platform: z
        .string()
        .describe('The site this was captured from — "LinkedIn", "Handshake" — or empty.'),
      deadline: z
        .string()
        .describe("YYYY-MM-DD application deadline the listing shows, or the empty string."),
      posted_days_ago: z
        .number()
        .describe("How many days ago the listing says it was posted. -1 if it does not say."),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You read one or more screenshots and list every job listing visible in them. A screenshot is usually a job board page — saved jobs, search results, or an applications tab. It can also be an email confirming an application was received ("Thank you for applying", "Your application has been received"); that email is one listing — the company and role it names.

Rules:
- One entry per listing. Do not merge or split listings. The same listing seen in two screenshots is one entry.
- Transcribe company and role exactly as shown. Do not expand abbreviations, tidy titles, or guess at anything cut off by the edge of the image.
- Skip anything that is not a job listing: ads, navigation, recommended-people modules, footers. Skip rejection emails and interview invitations — they are not listings.
- If a listing is partially cut off but the company and role are both legible, include it. If either is unreadable, leave it out.
- location and source_platform are empty strings when not visible. For a confirmation email, source_platform is "Email".
- deadline: only a date the listing itself presents as a deadline — "Apply by Oct 15", "Deadline: Nov 1", "Closes 10/20". Write it as YYYY-MM-DD, resolving a date with no year to its next occurrence on or after today. Empty string when the listing shows none. Never infer a deadline from a posting date.
- posted_days_ago: from text like "2 days ago", "Posted 3 weeks ago", "Reposted 1 month ago", "30+ days ago" — as whole days (a week is 7, a month is 30; "30+" is 30; "today" or "just now" or hours ago is 0). -1 when the listing shows no posting age.
- confidence reflects overall legibility of the screenshot.`;

/** Split a data: URL into the media type and payload the API expects. */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Attach a PNG, JPEG, GIF or WebP image.");
  }
  return { mediaType: match[1].toLowerCase().replace("image/jpg", "image/jpeg"), data: match[2] };
}

/** What is already tracked. Read from the database unless the eval passes its own. */
/**
 * Exactly what the extractor is allowed to say. Names, never ids — the same
 * rule the typed-note path follows.
 */
export type ParsedJobs = z.infer<typeof JobsSchema>;

export interface KnownRows {
  applications: { id: string; company_name: string; role_title: string; stage: Stage }[];
  companies: { id: string; name: string }[];
}

export async function extractJobsFromScreenshot(
  dataUrls: string[],
  note?: string | null,
  known?: KnownRows,
): Promise<ScreenshotClassification> {
  const images = dataUrls.map(parseDataUrl);

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(JobsSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map(({ mediaType, data }) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data,
            },
          })),
          {
            type: "text",
            text:
              `Today is ${today()} (${APP_TIMEZONE}). List every job listing in ` +
              (images.length === 1 ? "this screenshot." : `these ${images.length} screenshots.`) +
              (note?.trim() ? `\n\nContext from the user: ${note.trim()}` : ""),
          },
        ],
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("The extractor returned nothing that matched the expected shape.");
  }

  const rows: KnownRows =
    known ??
    (await (async () => {
      const [applications, companies] = await Promise.all([
        listApplications(),
        listCompanyNames(),
      ]);
      return { applications, companies };
    })());

  return resolveExtractedJobs(parsed, rows);
}

/**
 * Turn what the extractor read off the screenshots into what the confirm
 * screen shows.
 *
 * Pure, and split out of the call above so it can be tested without a model
 * call — the same split made for the typed-note path on 2026-10-05, and for
 * the same reason: this half decides whether confirming creates a second
 * company, and that decision is invisible until it has already happened.
 */
export function resolveExtractedJobs(
  parsed: ParsedJobs,
  rows: KnownRows,
): ScreenshotClassification {
  // Dedupe against what is already tracked, and pre-resolve companies that
  // already exist so confirming does not create a second "Stripe".
  const existing = new Map(
    rows.applications.map((a) => [
      dedupeKey(a.company_name, a.role_title),
      { id: a.id, stage: a.stage as Stage | null },
    ]),
  );

  // Compared the same way role titles are. Until 2026-10-05 this was
  // lowercase-and-trim alone, so a screenshot naming "Arcadia Climate."
  // created a duplicate of a company a typed note would have matched.
  const companyByName = new Map(rows.companies.map((c) => [normalizeName(c.name), c.id]));

  const seen = new Set<string>();
  const jobs: ExtractedJob[] = [];

  for (const job of parsed.jobs) {
    const company = job.company_name?.trim();
    const role = job.role_title?.trim();
    if (!company || !role) continue;

    const key = dedupeKey(company, role);
    // The same listing can appear twice — pinned and in-list, or in two screenshots.
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      company_name: company,
      role_title: role,
      location: job.location?.trim() || null,
      source_platform: job.source_platform?.trim() || null,
      deadline: civilOrNull(job.deadline),
      posted_days_ago:
        Number.isFinite(job.posted_days_ago) && job.posted_days_ago >= 0
          ? Math.round(job.posted_days_ago)
          : null,
      duplicate_of_application_id: existing.get(key)?.id ?? null,
      duplicate_stage: existing.get(key)?.stage ?? null,
      // Close but not certain — the confirm screen asks rather than deciding.
      possible_match: existing.has(key)
        ? null
        : findPossibleMatch(company, role, rows.applications),
      existing_company_id: companyByName.get(normalizeName(company)) ?? null,
    });
  }

  return { jobs, confidence: Math.max(0, Math.min(1, parsed.confidence)) };
}
