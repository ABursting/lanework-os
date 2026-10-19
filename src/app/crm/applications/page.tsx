import { getBoard } from "@/lib/db/applications";
import { listCompanyNames } from "@/lib/db/companies";
import { ApplicationBoard } from "@/components/crm/ApplicationBoard";
import { DataError } from "@/components/ui/DataError";

/** Reads run in the server component; only writes go through /api. */
export default async function ApplicationsPage() {
  try {
    const [board, companies] = await Promise.all([getBoard(), listCompanyNames()]);
    return (
      // The summary strip is drawn by the board itself, so its counts follow
      // the board's Jobs / Grad school filter and any card mid-move.
      <ApplicationBoard board={board} companies={companies} />
    );
  } catch (err) {
    return <DataError scope="applications" error={err} />;
  }
}
