import { listContactTouches } from "@/lib/db/contacts";
import { ok, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** A contact's logged conversations, newest first. Read-only. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return ok(await listContactTouches(id));
  } catch (err) {
    return serverError("contacts.touches.list", err);
  }
}
