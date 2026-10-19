-- ============================================================================
-- Let Brain record changes made by hand in the CRM.
--
-- Until now Brain only heard about five things: confirmed captures, stage
-- moves, completed tasks, logged conversations and sealed reviews. An
-- application added with "+ Add", a resume screen ticked by hand, or an
-- application or contact deleted left no trace - so Brain looked like it was
-- missing things, because it was (Asher, 2026-09-29). These become one new
-- kind of entry, 'crm_change'.
--
-- Captures are not affected: something added through the capture bar is
-- already recorded by the capture's own summary, and is not logged twice.
--
-- Until this runs, the app still works - those entries are refused by the
-- old constraint, logged as an error on the server, and simply not written.
-- Safe to run twice.
-- ============================================================================

alter table public.memory_log
  drop constraint if exists memory_log_source_type_check;

alter table public.memory_log
  add constraint memory_log_source_type_check
  check (source_type in ('capture', 'stage_change', 'task_completed',
                         'weekly_review', 'habit_note', 'contact_touch',
                         'crm_change'));
