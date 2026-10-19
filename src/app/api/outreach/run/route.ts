import { runConnectionRadar } from "@/lib/outreach/radar";
import { ok, serverError } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { demoAlumniOverlay } from "@/lib/demo/radarRun";

/**
 * Run the outreach radar.
 *
 * Triggered by a click, never on page load — rule 4. This half costs nothing
 * (two lists compared), but the half that follows it searches the web and
 * calls the model, and a feature that quietly spends money when a page loads
 * is the thing that rule exists to prevent.
 *
 * In the demo this returns a recording. See src/lib/demo/radarRun.ts for why,
 * and note that the recording is marked `recorded: true` so the page can say
 * so — a demo that lets a visitor believe a live search just happened is lying
 * to them.
 */
/** A search run makes one web search per company. */
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wantsSearch = searchParams.get("search") === "1";
    const applicationIds = searchParams.getAll("application_id");

    if (DEMO_MODE) {
      /*
        The demo matches for real. Its connections table holds ~150 invented
        people, so this runs the same comparison the real app runs and gets a
        real answer about fictional data — which is what the first half of this
        feature actually is. Only the web search is still a replay, layered on
        and labelled as such.
      */
      const run = await runConnectionRadar({ applicationIds, search: false });
      if (!wantsSearch) return ok(run);

      const overlay = demoAlumniOverlay();
      const found = new Set(overlay.leads.map((l) => l.company_name.toLowerCase()));
      return ok({
        ...run,
        replayed: "search" as const,
        steps: [...run.steps, ...overlay.steps],
        leads: [...run.leads, ...overlay.leads],
        // A company the replayed search turned somebody up at is no longer a gap.
        gaps: run.gaps.filter((g) => !found.has(g.company_name.toLowerCase())),
      });
    }

    return ok(
      await runConnectionRadar({
        includeUnmarked: searchParams.get("include_unmarked") === "1",
        // Only when asked for in so many words. This is the half that searches
        // the web and calls the model, and it must never be the default.
        // Searching does not draft: that is a separate step, per lead.
        search: wantsSearch,
        applicationIds,
      }),
    );
  } catch (err) {
    return serverError("outreach.run", err);
  }
}
