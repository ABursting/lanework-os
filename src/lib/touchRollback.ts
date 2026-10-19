/**
 * What a contact's "last contacted" date should become when one logged
 * conversation is deleted.
 *
 * Kept free of any database access so the rule can be tested on its own —
 * getting it wrong silently rewrites a date you rely on in Compress and on the
 * Home follow-up card.
 *
 * The rule, in order:
 *
 * 1. If the date on the contact is NOT the deleted conversation's, leave it.
 *    It came from somewhere else — a later conversation, or a date you typed
 *    into the contact by hand — and deleting an unrelated entry must not
 *    disturb it.
 *
 * 2. If it IS, the date rolls back to the most recent conversation that is
 *    left. Deriving it from what remains, rather than storing "what it was
 *    before" at logging time, is what keeps this correct when conversations
 *    are deleted out of order: a stored "before" can point at an entry that
 *    has itself since been deleted.
 *
 * 3. If no conversations are left, the date clears — the contact reads as
 *    never contacted. The one case this gets wrong: a date you typed in by hand
 *    BEFORE logging that only conversation is not recoverable, because nothing
 *    recorded it. Re-enter it on the contact if so.
 */
export function rollbackLastContacted(input: {
  /** The contact's current last_contacted_at. */
  current: string | null;
  /** occurred_at of the conversation being deleted. */
  deleted: string;
  /** occurred_at of the newest conversation that will remain, if any. */
  latestRemaining: string | null;
}): { change: false } | { change: true; value: string | null } {
  if (!input.current) return { change: false };

  // Compare instants, not strings: the same moment comes back from Postgres as
  // "+00:00" where JavaScript wrote "Z".
  const same = new Date(input.current).getTime() === new Date(input.deleted).getTime();
  if (!same) return { change: false };

  return { change: true, value: input.latestRemaining };
}
