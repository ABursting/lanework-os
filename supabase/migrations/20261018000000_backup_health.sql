-- ============================================================================
-- Let a failed backup be noticed.
--
-- The nightly backup told nobody when it broke. It failed silently every night
-- from 2026-10-01 to 2026-10-03 - both GitHub settings reached the running job
-- empty, so it read all twelve tables and then threw at the last step without
-- ever contacting GitHub. Nothing said so: no email, nothing on the dashboard,
-- and Vercel's free plan drops the logs within the hour. The only reason it was
-- found was that someone went looking.
--
-- So the job now records the moment it last succeeded, and Home says something
-- when that moment gets old. Two columns rather than one: the path is what
-- makes the claim checkable - you can open that file in the backup repo and see
-- for yourself, rather than trusting a green tick.
--
-- Until this runs, the app still works. The read is made on its own and falls
-- back to "unknown" if the columns are not there, which shows the same warning
-- as a stale backup - the honest answer when the dashboard cannot tell.
-- Safe to run twice.
-- ============================================================================

alter table public.user_settings
  add column if not exists last_backup_at timestamptz;

alter table public.user_settings
  add column if not exists last_backup_path text;

comment on column public.user_settings.last_backup_at is
  'When the nightly backup last finished successfully. Null means it has not succeeded since this column was added - which Home reports rather than hides.';
