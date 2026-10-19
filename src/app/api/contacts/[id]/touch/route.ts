import { logContactTouch } from "@/lib/db/contacts";
import { handleThrown, nullable, ok, readJson } from "@/lib/api";
import { addDays, startOfDayInstant, today } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

interface TouchBody {
  note?: string | null;
  /** An explicit timestamp, or use follow_up_in_days. */
  next_follow_up_at?: string | null;
  follow_up_in_days?: number | null;
}

/**
 * Record a conversation with a contact.
 *
 * Moves last_contacted_at to now, files the note as a dated entry in Brain
 * attributed to that person, and sets or clears the follow-up reminder. Used
 * by the capture confirm step, by the Log control in the CRM, and by Compress's
 * "Follow Up" button — all three mean the same thing, so they share a path.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    let body: TouchBody = {};
    try {
      body = await readJson<TouchBody>(req);
    } catch {
      // An empty body is the common case from Compress: "I dealt with this."
    }

    let followUp = nullable(body.next_follow_up_at);
    const days = Number(body.follow_up_in_days);
    if (!followUp && Number.isFinite(days) && days > 0) {
      // Land on the start of that local day, so "in 5 days" is a date rather
      // than a time five days from this exact minute.
      followUp = startOfDayInstant(addDays(today(), Math.round(days))).toISOString();
    }

    return ok(
      await logContactTouch({
        contact_id: id,
        note: nullable(body.note),
        next_follow_up_at: followUp,
      }),
    );
  } catch (err) {
    return handleThrown("contacts.touch", err);
  }
}
