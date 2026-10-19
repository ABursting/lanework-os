import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { addDays, today, type CivilDate } from "@/lib/time";
import type { DailyLog, DailyLogNotes, PrioritiesRationale } from "@/lib/types";

/**
 * One row per local day.
 *
 * `log_date` always comes from src/lib/time — the operator's day, not the
 * server's. On Vercel (UTC) a naive `new Date()` would roll the habit grid
 * over in the middle of a Central-time evening and write that evening's
 * checkmarks onto tomorrow's row.
 */
export async function getDailyLog(date: CivilDate = today()): Promise<DailyLog | null> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("log_date", date)
    .maybeSingle();
  if (error) throw error;
  return (data as DailyLog) ?? null;
}

export async function getNotes(date: CivilDate = today()): Promise<DailyLogNotes> {
  return (await getDailyLog(date))?.notes ?? {};
}

/**
 * Merge a patch into today's notes.
 *
 * Deliberately a server-side merge of one field rather than the client posting
 * the whole notes object: two quick habit taps would otherwise race, and the
 * second would overwrite the first with a snapshot taken before it landed.
 */
async function mergeNotes(
  date: CivilDate,
  patch: (current: DailyLogNotes) => DailyLogNotes,
): Promise<DailyLog> {
  const existing = await getDailyLog(date);
  const next = patch(existing?.notes ?? {});

  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .upsert(
      { user_id: USER_ID, log_date: date, notes: next },
      { onConflict: "user_id,log_date" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as DailyLog;
}

export async function setHabit(
  habitId: string,
  done: boolean,
  date: CivilDate = today(),
): Promise<DailyLog> {
  return mergeNotes(date, (notes) => {
    const habits = { ...(notes.habits ?? {}), [habitId]: done };
    return {
      ...notes,
      habits,
      score: Object.values(habits).filter(Boolean).length,
    };
  });
}

export async function setFocusToday(
  focus: string | null,
  date: CivilDate = today(),
): Promise<DailyLog> {
  return mergeNotes(date, (notes) => ({ ...notes, focus_today: focus ?? undefined }));
}

export async function setPrioritiesRationale(
  rationale: PrioritiesRationale,
  date: CivilDate = today(),
): Promise<DailyLog> {
  return mergeNotes(date, (notes) => ({ ...notes, priorities_rationale: rationale }));
}

/**
 * Consecutive days ending today with at least one habit checked.
 *
 * Counts back from yesterday when today is still empty, so the number does
 * not read 0 every morning before the first tick.
 */
export async function habitStreak(): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("log_date, notes")
    .eq("user_id", USER_ID)
    .lte("log_date", today())
    .order("log_date", { ascending: false })
    .limit(400);
  if (error) throw error;

  const active = new Set(
    ((data ?? []) as { log_date: string; notes: DailyLogNotes }[])
      .filter((row) => Object.values(row.notes?.habits ?? {}).some(Boolean))
      .map((row) => row.log_date),
  );

  let cursor = today();
  if (!active.has(cursor)) {
    // Today may simply not have started yet.
    cursor = addDays(cursor, -1);
    if (!active.has(cursor)) return 0;
  }

  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
