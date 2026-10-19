import { listCompanyNames } from "@/lib/db/companies";
import { listApplications } from "@/lib/db/applications";
import { ok, serverError } from "@/lib/api";

/**
 * The pickers the capture confirm step needs. Fetched only when a confirm
 * dialog actually opens, so it costs nothing on an ordinary page view.
 */
export async function GET() {
  try {
    const [companies, applications] = await Promise.all([
      listCompanyNames(),
      listApplications(),
    ]);
    return ok({
      companies,
      applications: applications.map((a) => ({
        id: a.id,
        label: `${a.company_name} — ${a.role_title}`,
        stage: a.stage,
      })),
    });
  } catch (err) {
    return serverError("entities.list", err);
  }
}
