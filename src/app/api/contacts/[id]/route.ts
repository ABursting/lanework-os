import { deleteContact, updateContact, type ContactInput } from "@/lib/db/contacts";
import { companyExists } from "@/lib/db/companies";
import {
  ValidationError, handleThrown, nullable, ok, optionalOneOf, readJson,
} from "@/lib/api";
import { RELATIONSHIP_TYPES } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: Partial<ContactInput> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ValidationError("Contact name cannot be empty");
      patch.name = name;
    }
    if (body.company_id !== undefined) {
      const companyId = nullable(body.company_id);
      if (companyId && !(await companyExists(companyId))) {
        throw new ValidationError(`No company with id ${companyId}`);
      }
      patch.company_id = companyId;
    }
    if (body.role !== undefined) patch.role = nullable(body.role);
    if (body.relationship_type !== undefined) {
      patch.relationship_type =
        optionalOneOf(body.relationship_type, RELATIONSHIP_TYPES, "relationship_type") ?? "other";
    }
    if (body.contact_info !== undefined) patch.contact_info = nullable(body.contact_info);
    if (body.notes !== undefined) patch.notes = nullable(body.notes);
    if (body.last_contacted_at !== undefined) patch.last_contacted_at = nullable(body.last_contacted_at);
    if (body.next_follow_up_at !== undefined) patch.next_follow_up_at = nullable(body.next_follow_up_at);
    if (body.status !== undefined) {
      patch.status = optionalOneOf(body.status, ["active", "dormant"] as const, "status") ?? "active";
    }

    return ok(await updateContact(id, patch));
  } catch (err) {
    return handleThrown("contacts.update", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteContact(id);
    return ok({ id });
  } catch (err) {
    return handleThrown("contacts.delete", err);
  }
}
