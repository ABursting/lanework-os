-- ============================================================================
-- Let a logged conversation be its own kind of memory.
--
-- The contacts table always had last_contacted_at, next_follow_up_at and
-- notes, and Compress always read them - but nothing could write them except
-- by hand. A capture saying "I reached out to three people today" had no way
-- to express that, so the classifier expressed it with the only vocabulary it
-- had and proposed three tasks instead. Tasks are things to do; this is a
-- record of something that happened.
--
-- The note goes to memory_log rather than being appended to contacts.notes so
-- that each conversation is dated, searchable in Brain, and attributable to
-- one person - the same treatment stage changes and completed tasks already
-- get. contacts.notes stays what it is: standing facts about the person.
-- ============================================================================

alter table public.memory_log
  drop constraint if exists memory_log_source_type_check;

alter table public.memory_log
  add constraint memory_log_source_type_check
  check (source_type in ('capture', 'stage_change', 'task_completed',
                         'weekly_review', 'habit_note', 'contact_touch'));
