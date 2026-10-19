import { createContact } from "@/lib/db/contacts";
import { companyExists, getCompany } from "@/lib/db/companies";
import { appendMemory } from "@/lib/db/memory";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson, requireFields,
} from "@/lib/api";
import { RELATIONSHIP_TYPES } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["name"]);

    const companyId = nullable(body.company_id);
    if (companyId && !(await companyExists(companyId))) {
      throw new ValidationError(`No company with id ${companyId}`);
    }

    const contact = await createContact({
      name: String(body.name).trim(),
      company_id: companyId,
      role: nullable(body.role),
      relationship_type:
        optionalOneOf(body.relationship_type, RELATIONSHIP_TYPES, "relationship_type") ?? "other",
      contact_info: nullable(body.contact_info),
      notes: nullable(body.notes),
      last_contacted_at: nullable(body.last_contacted_at),
      next_follow_up_at: nullable(body.next_follow_up_at),
    });

    // The hand-entry path; a contact created from a capture is recorded by
    // that capture's summary instead.
    const company = companyId ? await getCompany(companyId) : null;
    await appendMemory({
      source_type: "crm_change",
      source_id: contact.id,
      text: `Added contact by hand: ${contact.name}` +
        (contact.role ? `, ${contact.role}` : "") +
        (company ? ` at ${company.name}` : "") + ".",
    });
    return ok(contact, 201);
  } catch (err) {
    return handleThrown("contacts.create", err);
  }
}
