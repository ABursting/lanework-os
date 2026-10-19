-- ============================================================================
-- Every stage an application has passed through, and when.
--
-- The applications row already carried `applied_date` and `stage_changed_at`,
-- but stage_changed_at is a single value: it holds the LATEST transition and
-- forgets the one before it. So "applied Aug 12, screened Aug 30, rejected
-- Sep 4" collapsed into "changed Sep 4". Every change was narrated into
-- memory_log as prose ("Applied -> Interviewing"), which is readable but not
-- queryable - you cannot ask it how long a role sat in Applied.
--
-- This is an eleventh table, which the locked scope did not have. It earns its
-- place: an application's history is a list of events, and there is no honest
-- way to keep a list in a column that holds one value. See the amendment in
-- docs/Dashboard_Scope_v1.md.
--
-- Rows are written by the app, never edited. Deleting an application takes its
-- history with it.
--
-- Safe to run more than once: the table and indexes are created only if
-- absent, and each backfill skips applications that already have events.
-- ============================================================================

create table if not exists public.application_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  application_id uuid not null references public.applications (id) on delete cascade,
  -- Null on the first event: nothing came before submitting.
  from_stage     text check (from_stage in ('applied', 'interviewing', 'offer',
                                            'rejected', 'archived')),
  to_stage       text not null
                   check (to_stage in ('applied', 'interviewing', 'offer',
                                       'rejected', 'archived')),
  occurred_at    timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);

-- The timeline reads by date across everything; a role's own history reads by
-- application. Both get an index.
create index if not exists application_events_user_time_idx
  on public.application_events (user_id, occurred_at desc);
create index if not exists application_events_application_idx
  on public.application_events (application_id, occurred_at);

alter table public.application_events enable row level security;
grant all privileges on public.application_events to service_role;
revoke all on public.application_events from anon, authenticated;

-- -- Backfill ----------------------------------------------------------------
-- What can honestly be recovered, and no more.
--
-- The submission is known: applied_date, falling back to when the row was
-- created. The current stage's arrival is known too, from stage_changed_at.
-- Anything in between was never recorded structurally and is not invented here
-- - history before today starts with these two points per application.

insert into public.application_events (user_id, application_id, from_stage, to_stage, occurred_at, note)
select
  a.user_id,
  a.id,
  null,
  'applied',
  coalesce(a.applied_date::timestamptz, a.created_at),
  'Backfilled from the application record.'
from public.applications a
-- Guarded so running this file twice cannot double the backfill.
where not exists (
  select 1 from public.application_events e where e.application_id = a.id
);

insert into public.application_events (user_id, application_id, from_stage, to_stage, occurred_at, note)
select
  a.user_id,
  a.id,
  'applied',
  a.stage,
  a.stage_changed_at,
  'Backfilled from the application record.'
from public.applications a
where a.stage <> 'applied'
  and a.stage_changed_at > coalesce(a.applied_date::timestamptz, a.created_at)
  and not exists (
    select 1 from public.application_events e
     where e.application_id = a.id and e.from_stage is not null
  );
