-- ============================================================================
-- Researching comes back, with a deadline and a reminder to apply.
--
-- Researching was removed on Aug 31 because it had become a column of maybes
-- you had to keep up by hand. It returns with a narrower meaning: a role you
-- PLAN to apply to, by a date. Each one carries a remind-me date, it shows on
-- the Home calendar, and an ignored reminder surfaces in Compress - so the
-- column clears itself instead of rotting. See the Sep 15 amendment in
-- docs/Dashboard_Scope_v1.md.
--
-- What this adds:
--   1. `researching` back on applications.stage (and on the stage history).
--      The default stays `applied`, so screenshot imports and "I applied to..."
--      notes still land where they always did unless told otherwise.
--   2. applications.kind - `job` or `grad_school`, so grad programs stay out
--      of the resume pass rate and the "applications out" goal.
--   3. applications.remind_on - the day to be reminded to apply - and
--      remind_estimated, true when that date was worked out from a listing's
--      posting date rather than a real deadline.
--   4. user_settings - a twelfth table, holding the Compress window sliders.
--      The scope has no place for a preference that persists; a cookie would
--      forget it on another device once the app is online. One row per user.
--
-- Safe to run more than once: every step checks before it changes anything,
-- and no existing row is modified except to receive the column defaults.
-- ============================================================================

-- -- 1. The Researching stage ------------------------------------------------

alter table public.applications
  drop constraint if exists applications_stage_check;

alter table public.applications
  add constraint applications_stage_check
  check (stage in ('researching', 'applied', 'interviewing', 'offer', 'rejected', 'archived'));

-- Unchanged, restated so this file alone describes the column.
alter table public.applications
  alter column stage set default 'applied';

-- The history table's own checks, so a move out of Researching can be recorded.
alter table public.application_events
  drop constraint if exists application_events_from_stage_check;
alter table public.application_events
  add constraint application_events_from_stage_check
  check (from_stage in ('researching', 'applied', 'interviewing', 'offer', 'rejected', 'archived'));

alter table public.application_events
  drop constraint if exists application_events_to_stage_check;
alter table public.application_events
  add constraint application_events_to_stage_check
  check (to_stage in ('researching', 'applied', 'interviewing', 'offer', 'rejected', 'archived'));

-- -- 2. Job or grad school ---------------------------------------------------

alter table public.applications
  add column if not exists kind text not null default 'job';

alter table public.applications
  drop constraint if exists applications_kind_check;
alter table public.applications
  add constraint applications_kind_check
  check (kind in ('job', 'grad_school'));

-- -- 3. The reminder to apply ------------------------------------------------

alter table public.applications
  add column if not exists remind_on date;

alter table public.applications
  add column if not exists remind_estimated boolean not null default false;

-- Compress and the calendar both read "Researching roles with a date".
create index if not exists applications_reminder_idx
  on public.applications (user_id, stage, remind_on);

-- -- 4. Compress windows -----------------------------------------------------
-- Days, each with its own sensible bounds. The defaults are the scope's
-- original 30-day thresholds plus the two new sections.

create table if not exists public.user_settings (
  user_id                 uuid primary key,
  compress_job_days       integer not null default 30
                            check (compress_job_days between 1 and 365),
  compress_contact_days   integer not null default 30
                            check (compress_contact_days between 1 and 365),
  compress_task_days      integer not null default 7
                            check (compress_task_days between 1 and 365),
  compress_reminder_days  integer not null default 3
                            check (compress_reminder_days between 0 and 365),
  updated_at              timestamptz not null default now()
);

alter table public.user_settings enable row level security;
grant all privileges on public.user_settings to service_role;
revoke all on public.user_settings from anon, authenticated;
