import { OutreachRadar, type SelectableRole } from "@/components/crm/OutreachRadar";
import { DataError } from "@/components/ui/DataError";
import { radarInventory } from "@/lib/outreach/radar";
import { listOpenApplications } from "@/lib/db/applications";
import { listConnections, matchConnectionsToCompanies } from "@/lib/db/connections";
import { STAGE_LABEL } from "@/lib/display";
import { addDays, today, toCivilDate } from "@/lib/time";

/** How far back "Recent" reaches. A week of applications is one sitting's work. */
const RECENT_DAYS = 7;

/**
 * The outreach page.
 *
 * Nothing runs until a button is pressed - rule 4, and the half behind the
 * second button searches the web and calls the model, so a page load that
 * quietly started it would be the exact thing that rule exists to prevent.
 *
 * What the page DOES load is the roles you could point the radar at, and how
 * many people are already known at each. Both are plain queries.
 *
 * ── Why the dates are worked out here ───────────────────────────────────────
 * "Most recent first" and "applied in the last week" are both civil-date
 * questions, and rule 3 keeps those in src/lib/time.ts rather than letting a
 * component do its own date arithmetic in the browser's zone. So the server
 * resolves each role's date once and hands down a plain flag; the picker only
 * has to read it.
 */
export default async function OutreachPage() {
  try {
    /*
      No demo special-casing here any more. Since 2026-10-19 the demo's own
      database carries ~150 invented connections, so the count, the badges and
      the matching are all real work over fictional data - the same code path
      Asher's deployment takes. The only replayed part of this feature is the
      web search, and that lives in the run route.
    */
    const [inventory, applications, rows] = await Promise.all([
      radarInventory(),
      listOpenApplications(),
      listConnections(),
    ]);

    // Outreach is explicitly post-application: a role still being researched
    // has nothing to reach out about yet.
    const submitted = applications.filter((a) => a.stage !== "researching");
    const known = new Map(
      matchConnectionsToCompanies(submitted.map((a) => a.company_name), rows).map((m) => [
        m.company_name.toLowerCase(),
        m.connections.length,
      ]),
    );

    const cutoff = addDays(today(), -RECENT_DAYS);

    const roles: SelectableRole[] = submitted
      .map((a) => {
        // applied_date is what you mean by "when I applied", but it is optional;
        // the row's own creation date is the honest stand-in when it is missing.
        const appliedOn = a.applied_date ?? toCivilDate(new Date(a.created_at));
        return {
          id: a.id,
          company_name: a.company_name,
          role_title: a.role_title,
          stage: STAGE_LABEL[a.stage],
          appliedOn,
          recent: appliedOn >= cutoff,
          knownHere: known.get(a.company_name.toLowerCase()) ?? 0,
        };
      })
      // Newest first, like every other list in the dashboard. The radar used to
      // float "companies you already know someone at" to the top, which this
      // flow no longer needs: the connection check filters to exactly those a
      // step later, so sorting for it here only broke the expected order.
      .sort((x, y) => y.appliedOn.localeCompare(x.appliedOn));

    return <OutreachRadar connectionCount={inventory.connections} roles={roles} />;
  } catch (err) {
    return <DataError scope="the outreach radar" error={err} />;
  }
}
