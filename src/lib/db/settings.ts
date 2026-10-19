import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { COMPRESS_DEFAULTS, WINDOW_KEYS } from "@/lib/compress";
import type { UserSettings } from "@/lib/types";

/**
 * Your saved preferences — today, just the Compress windows.
 *
 * One row per user, created the first time a slider is saved. Until then, and
 * if the row cannot be read at all, the defaults stand: a missing preference
 * is not a reason to take the Compress page down. The read failure is logged,
 * and the next save reports its own failure to the banner.
 */
export async function getSettings(): Promise<UserSettings> {
  const { data, error } = await supabaseAdmin()
    .from("user_settings")
    .select(WINDOW_KEYS.join(", "))
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) {
    console.error(
      `[db:settings] could not read user_settings, using defaults: ${error.message}` +
        " — has migration 20260915000000_researching_and_reminders.sql been run?",
    );
    return { ...COMPRESS_DEFAULTS };
  }
  return { ...COMPRESS_DEFAULTS, ...((data as Partial<UserSettings> | null) ?? {}) };
}

/**
 * When the nightly backup last finished, and the file it wrote.
 *
 * Read on its own rather than folded into getSettings, so that a dashboard
 * running ahead of its database still shows the Compress windows: the columns
 * arrive with migration 20261018000000, and until it is run this read fails
 * and reports `known: false`. That is deliberately not treated as "fine" —
 * Home shows the same warning it shows for a stale backup, because "the
 * dashboard cannot tell whether your data is being backed up" and "your data
 * is not being backed up" deserve the same amount of your attention.
 */
export type BackupHealth = {
  /** ISO timestamp of the last success, or null if there has never been one. */
  at: string | null;
  /** The file that run wrote, so the claim can be checked in the backup repo. */
  path: string | null;
  /** False when the columns could not be read — the migration is not in yet. */
  known: boolean;
};

export async function getBackupHealth(): Promise<BackupHealth> {
  const { data, error } = await supabaseAdmin()
    .from("user_settings")
    .select("last_backup_at, last_backup_path")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) {
    console.error(
      `[db:settings] could not read backup health: ${error.message}` +
        " — has migration 20261018000000_backup_health.sql been run?",
    );
    return { at: null, path: null, known: false };
  }
  const row = data as { last_backup_at?: string | null; last_backup_path?: string | null } | null;
  return { at: row?.last_backup_at ?? null, path: row?.last_backup_path ?? null, known: true };
}

/**
 * Record that the backup succeeded. Called by the cron job, never by a page.
 *
 * Only the two backup columns are sent, so the Compress windows in the same
 * row are left exactly as they are; upsert updates what it is given.
 */
export async function recordBackupSuccess(path: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("user_settings")
    .upsert(
      { user_id: USER_ID, last_backup_at: new Date().toISOString(), last_backup_path: path },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const { data, error } = await supabaseAdmin()
    .from("user_settings")
    .upsert(
      { ...current, ...patch, user_id: USER_ID, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select(WINDOW_KEYS.join(", "))
    .single();
  if (error) throw error;
  return data as unknown as UserSettings;
}
