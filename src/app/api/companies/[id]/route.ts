import { deleteCompany, updateCompany } from "@/lib/db/companies";
import { handleThrown, nullable, ok, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new Error("Company name cannot be empty");
      patch.name = name;
    }
    for (const field of ["website", "sector", "notes", "source"] as const) {
      if (body[field] !== undefined) patch[field] = nullable(body[field]);
    }
    return ok(await updateCompany(id, patch));
  } catch (err) {
    return handleThrown("companies.update", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    // Applications cascade with the company; contacts survive as Independent.
    await deleteCompany(id);
    return ok({ id });
  } catch (err) {
    return handleThrown("companies.delete", err);
  }
}
