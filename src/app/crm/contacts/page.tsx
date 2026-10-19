import { listContacts } from "@/lib/db/contacts";
import { listCompanyNames } from "@/lib/db/companies";
import { ContactsTable } from "@/components/crm/ContactsTable";
import { DataError } from "@/components/ui/DataError";

export default async function ContactsPage() {
  try {
    const [contacts, companies] = await Promise.all([listContacts(), listCompanyNames()]);
    return <ContactsTable contacts={contacts} companies={companies} />;
  } catch (err) {
    return <DataError scope="contacts" error={err} />;
  }
}
