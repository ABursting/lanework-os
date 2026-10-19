import { touchApplication } from "@/lib/db/applications";
import { handleThrown, ok } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Revive: mark an application as still live without changing its stage. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await touchApplication(id);
    return ok({ id });
  } catch (err) {
    return handleThrown("applications.touch", err);
  }
}
