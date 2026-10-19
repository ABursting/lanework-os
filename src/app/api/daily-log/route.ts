import { setFocusToday, setHabit } from "@/lib/db/dailyLogs";
import { ValidationError, handleThrown, nullable, ok, readJson } from "@/lib/api";
import { today } from "@/lib/time";

/**
 * Today's state. The date is resolved server-side from the operator's zone —
 * the client never sends one, so a browser left open past local midnight
 * cannot write yesterday's checkmark onto today's row.
 *
 * Habit toggles send one habit at a time and are merged server-side, so two
 * fast taps cannot overwrite each other.
 */
export async function PATCH(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);

    if (typeof body.habit_id === "string") {
      if (typeof body.done !== "boolean") {
        throw new ValidationError("A habit toggle needs `done` to be true or false.");
      }
      const log = await setHabit(body.habit_id, body.done, today());
      return ok(log);
    }

    if ("focus_today" in body) {
      const log = await setFocusToday(nullable(body.focus_today), today());
      return ok(log);
    }

    throw new ValidationError("Nothing to update — send habit_id + done, or focus_today.");
  } catch (err) {
    return handleThrown("dailyLog.patch", err);
  }
}
