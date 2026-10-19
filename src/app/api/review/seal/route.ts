import { sealReview } from "@/lib/db/weeklyReviews";
import { ValidationError, handleThrown, ok, readJson } from "@/lib/api";
import { startOfWeek } from "@/lib/time";

/** Seal a week. Irreversible from the UI; the fields stop accepting edits. */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ week_start?: string }>(req).catch(() => ({}) as { week_start?: string });
    const week = body.week_start ?? startOfWeek();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      throw new ValidationError("week_start must be a YYYY-MM-DD date.");
    }
    return ok(await sealReview(week));
  } catch (err) {
    return handleThrown("review.seal", err);
  }
}
