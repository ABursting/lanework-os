import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { LANE_RANK } from "@/lib/display";
import { touchCompany } from "./companies";
import { appendMemory } from "./memory";
import { ValidationError } from "@/lib/api";
import { rollbackLastContacted } from "@/lib/touchRollback";
import {
  TERMINAL_STAGES,
  type Contact, type ContactRow, type ContactStatus, type Lane, type RelationshipType,
} from "@/lib/types";

const SELECT = "*, companies(name)";

type JoinedRow = Contact & { companies: { name: string } | null };

/**
 * Contacts.
 *
 * company_id is nullable — an "Independent" contact (an alum with no target
 * employer attached yet) is a first-class row, not a workaround. Like the
 * companies table, the lane chip the mockup shows is derived from the linked
 * company's live applications; an independent contact simply has no lane.
 */
export async function listContacts(): Promise<ContactRow[]> {
  const db = supabaseAdmin();

  const [contacts, applications] = await Promise.all([
    db.from("contacts").select(SELECT).eq("user_id", USER_ID)
      .order("last_contacted_at", { ascending: false, nullsFirst: false }),
    db.from("applications").select("company_id, lane, stage").eq("user_id", USER_ID),
  ]);

  if (contacts.error) throw contacts.error;
  if (applications.error) throw applications.error;

  const laneByCompany = new Map<string, Lane>();
  for (const a of applications.data ?? []) {
    if (!a.company_id) continue;
    if (TERMINAL_STAGES.includes(a.stage as never)) continue;
    const current = laneByCompany.get(a.company_id);
    const lane = a.lane as Lane;
    if (!current || LANE_RANK[lane] > LANE_RANK[current]) {
      laneByCompany.set(a.company_id, lane);
    }
  }

  return ((contacts.data ?? []) as unknown as JoinedRow[]).map((row) => {
    const { companies, ...contact } = row;
    return {
      ...contact,
      company_name: companies?.name ?? null,
      derived_lane: contact.company_id ? laneByCompany.get(contact.company_id) ?? null : null,
    };
  });
}

/** Name + company, for the classifier's entity list and form pickers. */
export async function listContactNames(): Promise<
  { id: string; name: string; company_id: string | null }[]
> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select("id, name, company_id")
    .eq("user_id", USER_ID)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function contactExists(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[db:contacts] existence check failed for ${id}: ${error.message}`);
    return false;
  }
  return Boolean(data);
}

export async function findContactByName(name: string): Promise<Contact | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select("*")
    .eq("user_id", USER_ID)
    .ilike("name", trimmed)
    .maybeSingle();
  if (error) throw error;
  return (data as Contact) ?? null;
}

/**
 * Every active contact, for Compress.
 *
 * Not pre-filtered by age: the Compress page applies its contact window in the
 * browser, so the slider re-filters instantly. The rule it applies is the
 * scope's — an explicit next_follow_up_at that has passed, or (when none was
 * ever set) no contact inside the window. Dormant contacts have already been
 * let go and stay out.
 */
export async function listActiveContacts(): Promise<ContactRow[]> {
  const all = await listContacts();
  return all
    .filter((c) => c.status === "active")
    .sort((a, b) => {
      const ka = a.next_follow_up_at ?? a.last_contacted_at ?? a.created_at;
      const kb = b.next_follow_up_at ?? b.last_contacted_at ?? b.created_at;
      return ka < kb ? -1 : 1;
    });
}

export interface ContactInput {
  name: string;
  company_id?: string | null;
  role?: string | null;
  relationship_type?: RelationshipType;
  contact_info?: string | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  status?: ContactStatus;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .insert({
      user_id: USER_ID,
      name: input.name.trim(),
      company_id: input.company_id ?? null,
      role: input.role ?? null,
      relationship_type: input.relationship_type ?? "other",
      contact_info: input.contact_info ?? null,
      notes: input.notes ?? null,
      last_contacted_at: input.last_contacted_at ?? null,
      next_follow_up_at: input.next_follow_up_at ?? null,
      status: input.status ?? "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  await touchCompany(input.company_id);
  return data as Contact;
}

export async function updateContact(id: string, patch: Partial<ContactInput>): Promise<Contact> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  if (patch.company_id) await touchCompany(patch.company_id);
  return data as Contact;
}

/**
 * Delete a contact, leaving one line in Brain saying so. Their logged
 * conversations stay searchable — deleting the person is not the same as
 * deciding the conversations never happened.
 */
export async function deleteContact(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("contacts")
    .select("name")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();

  const { error } = await db
    .from("contacts")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw error;

  const name = (existing as { name: string } | null)?.name;
  if (name) {
    await appendMemory({ source_type: "crm_change", source_id: id, text: `Deleted contact: ${name}.` });
  }
}

/**
 * Record that a conversation happened.
 *
 * Three things at once, because they are one event: the contact's
 * last_contacted_at moves, an optional reminder is set, and the note becomes a
 * dated entry in Brain attributed to that person. Searching "what did Danny
 * say" later is then a Brain search rather than a scroll through a notes blob.
 *
 * next_follow_up_at is cleared when not supplied — a conversation that just
 * happened answers whatever follow-up was outstanding, and leaving a stale
 * overdue date would keep the contact sitting in Compress forever.
 */
export async function logContactTouch(input: {
  contact_id: string;
  note?: string | null;
  occurred_at?: string;
  next_follow_up_at?: string | null;
}): Promise<Contact> {
  const occurredAt = input.occurred_at ?? new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .update({
      last_contacted_at: occurredAt,
      next_follow_up_at: input.next_follow_up_at ?? null,
      status: "active",           // talking to someone un-dormants them
    })
    .eq("user_id", USER_ID)
    .eq("id", input.contact_id)
    .select("*")
    .single();
  if (error) throw error;

  const contact = data as Contact;
  const note = input.note?.trim();
  await appendMemory({
    source_type: "contact_touch",
    source_id: contact.id,
    text: note ? `${contact.name}: ${note}` : `Reached out to ${contact.name}.`,
    occurred_at: occurredAt,
  });
  await touchCompany(contact.company_id);
  return contact;
}

/** One logged conversation, as it reads on the contact. */
export interface ContactTouch {
  id: string;
  text: string;
  occurred_at: string;
}

/**
 * A contact's logged conversations, newest first.
 *
 * They live in memory_log rather than a table of their own — see
 * logContactTouch — so this is a filtered read of Brain, not a separate store.
 */
export async function listContactTouches(contactId: string): Promise<ContactTouch[]> {
  const { data, error } = await supabaseAdmin()
    .from("memory_log")
    .select("id, text, occurred_at")
    .eq("user_id", USER_ID)
    .eq("source_type", "contact_touch")
    .eq("source_id", contactId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactTouch[];
}

/**
 * Delete one logged conversation, and put the contact's last-contacted date
 * back to what the remaining history says it should be.
 *
 * The decision itself is src/lib/touchRollback.ts, which is tested on its own.
 *
 * Order matters and there is no transaction to lean on (these are separate
 * requests to the database), so the conversation is deleted first — it is the
 * thing you asked for. If the date then fails to roll back, that is reported
 * as exactly that, rather than as "couldn't delete", which would be untrue
 * and would invite a second click on something already gone.
 *
 * Deliberately NOT undone: the follow-up reminder that logging set or cleared,
 * the dormant-to-active switch, and the company's last-touched date. None of
 * their previous values were ever recorded, so any "restore" would be a guess.
 */
export async function deleteContactTouch(
  contactId: string,
  touchId: string,
): Promise<{ last_contacted_at: string | null; rolled_back: boolean }> {
  const db = supabaseAdmin();

  const [touchRes, contactRes] = await Promise.all([
    db
      .from("memory_log")
      .select("id, occurred_at")
      .eq("user_id", USER_ID)
      .eq("id", touchId)
      .eq("source_type", "contact_touch")
      .eq("source_id", contactId)
      .maybeSingle(),
    db
      .from("contacts")
      .select("name, last_contacted_at")
      .eq("user_id", USER_ID)
      .eq("id", contactId)
      .maybeSingle(),
  ]);
  if (touchRes.error) throw touchRes.error;
  if (contactRes.error) throw contactRes.error;

  // Scoped by contact as well as id, so a conversation can only ever be
  // deleted from the person it is actually filed under.
  if (!touchRes.data) {
    throw new ValidationError("That conversation no longer exists — it may already be deleted.");
  }
  const touch = touchRes.data as { id: string; occurred_at: string };
  const contact = contactRes.data as { name: string; last_contacted_at: string | null } | null;

  const del = await db.from("memory_log").delete().eq("user_id", USER_ID).eq("id", touch.id);
  if (del.error) throw del.error;

  // The contact itself may be gone: conversations outlive a deleted contact.
  // Then there is no date to roll back and the delete alone is the whole job.
  if (!contact) return { last_contacted_at: null, rolled_back: false };

  const remaining = await db
    .from("memory_log")
    .select("occurred_at")
    .eq("user_id", USER_ID)
    .eq("source_type", "contact_touch")
    .eq("source_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (remaining.error) {
    console.error(
      `[db:contacts] deleted touch ${touch.id} but could not read remaining history: ` +
        remaining.error.message,
    );
    throw new Error(
      `The conversation was deleted, but ${contact.name}'s last-contacted date could not be ` +
        `checked. Review it on the contact.`,
    );
  }

  const decision = rollbackLastContacted({
    current: contact.last_contacted_at,
    deleted: touch.occurred_at,
    latestRemaining: (remaining.data as { occurred_at: string } | null)?.occurred_at ?? null,
  });
  if (!decision.change) {
    return { last_contacted_at: contact.last_contacted_at, rolled_back: false };
  }

  const upd = await db
    .from("contacts")
    .update({ last_contacted_at: decision.value })
    .eq("user_id", USER_ID)
    .eq("id", contactId);
  if (upd.error) {
    console.error(
      `[db:contacts] deleted touch ${touch.id} but rollback failed: ${upd.error.message}`,
    );
    throw new Error(
      `The conversation was deleted, but ${contact.name}'s last-contacted date could not be ` +
        `rolled back. Review it on the contact.`,
    );
  }

  return { last_contacted_at: decision.value, rolled_back: true };
}

/**
 * Contacts that are overdue a follow-up — an explicit date that has passed.
 *
 * Deliberately narrower than the Compress query, which also sweeps up anyone
 * who has simply gone quiet for 30 days. This is only the people you told
 * yourself you would chase, which is what belongs on the Home page: a short,
 * specific list you can act on rather than a backlog to triage.
 */
export async function listDueFollowUps(limit = 5): Promise<ContactRow[]> {
  const nowIso = new Date().toISOString();
  const all = await listContacts();
  return all
    .filter((c) => c.status === "active" && c.next_follow_up_at && c.next_follow_up_at <= nowIso)
    .sort((a, b) => (a.next_follow_up_at! < b.next_follow_up_at! ? -1 : 1))
    .slice(0, limit);
}

/** Mark a conversation as having happened, now. */
export async function touchContact(
  id: string | null | undefined,
  nextFollowUp?: string | null,
): Promise<void> {
  if (!id) return;
  const patch: Record<string, unknown> = { last_contacted_at: new Date().toISOString() };
  if (nextFollowUp !== undefined) patch.next_follow_up_at = nextFollowUp;
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) console.error(`[db:contacts] touch failed for ${id}: ${error.message}`);
}
