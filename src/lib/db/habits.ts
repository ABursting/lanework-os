import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { HabitDefinition } from "@/lib/types";

/**
 * Habit definitions live apart from daily state on purpose: retiring a habit
 * in September must not rewrite what August's checkmarks meant. Deactivating
 * hides it going forward; the history keeps its ids.
 */
export async function listHabits(includeInactive = false): Promise<HabitDefinition[]> {
  let query = supabaseAdmin().from("habit_definitions").select("*").eq("user_id", USER_ID);
  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HabitDefinition[];
}

export async function createHabit(input: {
  label: string;
  category?: string | null;
  target?: string | null;
}): Promise<HabitDefinition> {
  const existing = await listHabits(true);
  const { data, error } = await supabaseAdmin()
    .from("habit_definitions")
    .insert({
      user_id: USER_ID,
      label: input.label.trim(),
      category: input.category ?? null,
      target: input.target ?? null,
      sort_order: existing.length,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as HabitDefinition;
}

export async function updateHabit(
  id: string,
  patch: Partial<{ label: string; category: string | null; target: string | null; active: boolean; sort_order: number }>,
): Promise<HabitDefinition> {
  const { data, error } = await supabaseAdmin()
    .from("habit_definitions")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as HabitDefinition;
}

/** Retire: hide it going forward, leave every past day's ticks intact. */
export async function retireHabit(id: string): Promise<void> {
  await updateHabit(id, { active: false });
}

export async function restoreHabit(id: string): Promise<void> {
  await updateHabit(id, { active: true });
}

/**
 * Has this habit ever actually been completed on any day?
 *
 * Deliberately checks for a `true`, not merely for the id being present.
 * Ticking a habit and immediately unticking it leaves the key behind set to
 * false, and treating that as history would mean two stray clicks
 * permanently blocked deleting a habit you added by mistake — exactly the
 * case delete exists for. A false carries no information: an unticked habit
 * and an absent one are identical in every count and streak the app computes.
 *
 * daily_logs stores habits as keys inside a jsonb blob, so this reads the
 * logs and looks through them rather than asking Postgres to index into json.
 * At one row per day that is a few hundred small rows a year — cheap enough
 * that the simpler query is the right call.
 */
export async function habitHasHistory(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("notes")
    .eq("user_id", USER_ID);
  if (error) throw error;

  return (data ?? []).some((row) => {
    const habits = (row as { notes?: { habits?: Record<string, boolean> } }).notes?.habits;
    return habits?.[id] === true;
  });
}

/**
 * Really delete it. Refused once the habit has history, because daily_logs
 * keys its records by habit id — removing the definition would leave orphaned
 * keys in every past day and quietly change what those days recorded. Retire
 * is the answer in that case; this exists for the habit you added by mistake
 * and never used.
 */
export async function deleteHabit(id: string): Promise<void> {
  if (await habitHasHistory(id)) {
    throw new Error(
      "This habit has been completed on at least one day, so deleting it would " +
        "rewrite that history. Retire it instead — it disappears from the list " +
        "and the past stays intact.",
    );
  }
  const { error } = await supabaseAdmin()
    .from("habit_definitions")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw error;
}
