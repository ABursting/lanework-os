import { REVIEW_FIELDS, updateReview, type ReviewField } from "@/lib/db/weeklyReviews";
import { ValidationError, handleThrown, nullable, ok, readJson } from "@/lib/api";
import { startOfWeek } from "@/lib/time";

/** Save edits to an unsealed week. A sealed week rejects the write. */
export async function PATCH(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const week = typeof body.week_start === "string" ? body.week_start : startOfWeek();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      throw new ValidationError("week_start must be a YYYY-MM-DD date.");
    }

    const patch: Partial<Record<ReviewField, string | null>> = {};
    for (const field of REVIEW_FIELDS) {
      if (body[field] !== undefined) patch[field] = nullable(body[field]);
    }
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("Nothing to save.");
    }

    return ok(await updateReview(week, patch));
  } catch (err) {
    return handleThrown("review.update", err);
  }
}
