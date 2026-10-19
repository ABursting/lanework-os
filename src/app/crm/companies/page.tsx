import { listCompanies } from "@/lib/db/companies";
import { CompaniesTable } from "@/components/crm/CompaniesTable";
import { DataError } from "@/components/ui/DataError";

export default async function CompaniesPage() {
  try {
    return <CompaniesTable companies={await listCompanies()} />;
  } catch (err) {
    return <DataError scope="companies" error={err} />;
  }
}
