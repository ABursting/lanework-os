import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { appendMemory } from "./memory";
import { startOfWeek, type CivilDate } from "@/lib/time";
import type { WeeklyReview, WeeklyReviewDraft } from "@/lib/types";

const FIELDS = [
  "wins", "what_slipped", "open_loops", "follow_up_people", "next_week_top3",
] as const;
export type ReviewField = (typeof FIELDS)[number];
export const REVIEW_FIELDS = FIELDS;

/** The row for a week, created empty on first look so edits have somewhere to go. */
export async function getOrCreateReview(week: CivilDate = startOfWeek()): Promise<WeeklyReview> {
  const db = supabaseAdmin();

  const existing = await db
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("week_start", week)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as WeeklyReview;

  const { data, error } = await db
    .from("weekly_reviews")
    .insert({ user_id: USER_ID, week_start: week })
    .select("*")
    .single();
  if (error) throw error;
  return data as WeeklyReview;
}

export async function updateReview(
  week: CivilDate,
  patch: Partial<Record<ReviewField, string | null>>,
): Promise<WeeklyReview> {
  const current = await getOrCreateReview(week);
  if (current.sealed_at) {
    throw new Error("This week is sealed and can no longer be edited.");
  }

  const { data, error } = await supabaseAdmin()
    .from("weekly_reviews")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("week_start", week)
    .select("*")
    .single();
  if (error) throw error;
  return data as WeeklyReview;
}

export async function saveAutoDraft(
  week: CivilDate,
  draft: WeeklyReviewDraft,
): Promise<WeeklyReview> {
  await getOrCreateReview(week);
  const { data, error } = await supabaseAdmin()
    .from("weekly_reviews")
    .update({ auto_draft: draft })
    .eq("user_id", USER_ID)
    .eq("week_start", week)
    .select("*")
    .single();
  if (error) throw error;
  return data as WeeklyReview;
}

/**
 * Seal the week. This is the one irreversible action in the app: after it, the
 * fields stop accepting edits and the review becomes a fixed record. The sealed
 * text also goes into memory_log so Brain can search across weeks.
 */
export async function sealReview(week: CivilDate): Promise<WeeklyReview> {
  const current = await getOrCreateReview(week);
  if (current.sealed_at) return current;

  const { data, error } = await supabaseAdmin()
    .from("weekly_reviews")
    .update({ sealed_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("week_start", week)
    .select("*")
    .single();
  if (error) throw error;

  const sealed = data as WeeklyReview;
  const body = FIELDS.map((field) => sealed[field])
    .filter((v): v is string => Boolean(v?.trim()))
    .join("\n\n");

  if (body) {
    await appendMemory({
      source_type: "weekly_review",
      source_id: sealed.id,
      text: `Week of ${week} — sealed review.\n\n${body}`,
    });
  }
  return sealed;
}
