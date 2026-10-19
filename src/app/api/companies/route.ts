import { createCompany } from "@/lib/db/companies";
import { appendMemory } from "@/lib/db/memory";
import { handleThrown, nullable, ok, readJson, requireFields } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    requireFields(body, ["name"]);
    const company = await createCompany({
      name: String(body.name).trim(),
      website: nullable(body.website),
      sector: nullable(body.sector),
      notes: nullable(body.notes),
      source: nullable(body.source) ?? "manual",
    });
    await appendMemory({
      source_type: "crm_change",
      source_id: company.id,
      text: `Added company by hand: ${company.name}.`,
    });
    return ok(company, 201);
  } catch (err) {
    return handleThrown("companies.create", err);
  }
}
