import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { Stage } from "@/lib/types";

/**
 * An application's stage history — every transition, not just the last one.
 *
 * Written by the app and never edited: these are events, and an event that can
 * be rewritten is not a record. The row on `applications` still holds the
 * current stage, which is what the board reads; this is what the timeline and
 * any "how long did that take" question read.
 */

export interface ApplicationEvent {
  id: string;
  user_id: string;
  application_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

/** An event joined to the role it belongs to, for the timeline. */
export interface ApplicationEventRow extends ApplicationEvent {
  company_name: string;
  role_title: string;
}

/**
 * Record a transition.
 *
 * Never throws into the caller's path: the stage change itself already
 * happened and succeeded, and losing the audit line is not a reason to fail
 * the action or to roll it back. It is logged loudly instead, because a
 * missing event is a quietly wrong history.
 */
export async function recordApplicationEvent(input: {
  application_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  occurred_at?: string;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("application_events").insert({
    user_id: USER_ID,
    application_id: input.application_id,
    from_stage: input.from_stage,
    to_stage: input.to_stage,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    note: input.note ?? null,
  });

  if (error) {
    console.error(
      `[db:applicationEvents] failed to record ${input.from_stage ?? "new"} → ` +
        `${input.to_stage} for ${input.application_id}: ${error.message}`,
      error,
    );
  }
}

/** One application's history, oldest first — the order you would read it in. */
export async function listApplicationEvents(
  applicationId: string,
): Promise<ApplicationEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("application_events")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("application_id", applicationId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ApplicationEvent[];
}

/** Every event in a window, newest first, with the role attached. */
export async function applicationEventsBetween(
  fromIso: string,
  toIso: string,
): Promise<ApplicationEventRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("application_events")
    .select("*, applications!inner(role_title, companies!inner(name))")
    .eq("user_id", USER_ID)
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .order("occurred_at", { ascending: false });

  if (error) {
    // Before the migration is run this table does not exist. Half the timeline
    // is better than none: the task history still draws, and the pipeline strip
    // fills in once the migration lands. Any other error is a real failure and
    // still throws.
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      console.warn(
        "[db:applicationEvents] application_events is missing — run migration " +
          "20260904000000_application_events.sql. Pipeline history omitted for now.",
      );
      return [];
    }
    throw error;
  }

  type Joined = ApplicationEvent & {
    applications: { role_title: string; companies: { name: string } | null } | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((row) => {
    const { applications, ...event } = row;
    return {
      ...event,
      company_name: applications?.companies?.name ?? "—",
      role_title: applications?.role_title ?? "—",
    };
  });
}
