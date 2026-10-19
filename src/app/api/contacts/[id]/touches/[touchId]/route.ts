import { deleteContactTouch } from "@/lib/db/contacts";
import { handleThrown, ok } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; touchId: string }> };

/**
 * Delete one logged conversation and roll the contact's last-contacted date
 * back to what the remaining history supports. Returns the date it landed on,
 * so an open contact form can show it rather than saving the stale one back.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, touchId } = await params;
  try {
    return ok(await deleteContactTouch(id, touchId));
  } catch (err) {
    return handleThrown("contacts.touches.delete", err);
  }
}
