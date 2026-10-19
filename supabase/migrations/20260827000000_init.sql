-- ============================================================================
-- Recruiting Dashboard - initial schema
-- All ten tables from Dashboard_Scope_v1.md "Data model".
--
-- Access model: RLS is enabled on every table with ZERO policies, which denies
-- all access to the anon and authenticated roles. The service_role key bypasses
-- RLS entirely, so every read and write must go through a server-side route
-- using that key. There is no auth gate in v1: user_id is a hardcoded constant
-- (see src/lib/constants.ts). It is a uuid so that swapping in Supabase Auth
-- later means pointing that constant at auth.uid() - not a schema change.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Shared updated_at trigger -------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- companies -----------------------------------------------------------------
-- Employer identity only. Deliberately has no stage/lane/deadline: lanes are a
-- property of the role, not the employer, and one company can hold roles in
-- different lanes. Anything lane-shaped is derived from its applications.
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  name            text not null,
  website         text,
  sector          text,                        -- freeform: "climate tech", "fintech"
  notes           text,
  source          text,
  last_touched_at timestamptz not null default now(),
  visibility      text not null default 'private'
                    check (visibility in ('private', 'shareable')),
  created_at      timestamptz not null default now()
);
create index if not exists companies_user_idx on public.companies (user_id);
create index if not exists companies_touched_idx on public.companies (user_id, last_touched_at desc);
create unique index if not exists companies_user_name_idx on public.companies (user_id, lower(name));

-- applications --------------------------------------------------------------
-- One row per job opportunity, so a company can carry several roles.
-- `rejected` (they said no) and `archived` (you gave up) stay distinct.
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  company_id       uuid not null references public.companies (id) on delete cascade,
  role_title       text not null,
  lane             text not null default 'primary'
                     check (lane in ('primary', 'secondary', 'peripheral')),
  stage            text not null default 'researching'
                     check (stage in ('researching', 'applied', 'interviewing',
                                      'offer', 'rejected', 'archived')),
  applied_date     date,                       -- auto-fills on stage -> applied
  deadline         date,
  job_posting_url  text,
  source_platform  text,                       -- LinkedIn / Handshake / etc.
  source           text not null default 'manual'
                     check (source in ('manual', 'ai_capture', 'screenshot_import')),
  -- Sticky resume-effectiveness marker: set true on the first transition into
  -- `interviewing`, manually togglable, and never cleared by a later outcome -
  -- so "rejected after interviewing" stays distinct from "never got a look".
  resume_passed    boolean not null default false,
  last_touched_at  timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists applications_user_stage_idx on public.applications (user_id, stage);
create index if not exists applications_company_idx on public.applications (company_id);
create index if not exists applications_stale_idx on public.applications (user_id, last_touched_at);
create index if not exists applications_deadline_idx on public.applications (user_id, deadline);

-- contacts ------------------------------------------------------------------
-- company_id is nullable: "Independent" contacts are allowed.
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  company_id        uuid references public.companies (id) on delete set null,
  name              text not null,
  role              text,
  relationship_type text not null default 'other'
                      check (relationship_type in ('recruiter', 'alum', 'referral',
                                                   'hiring_manager', 'peer', 'other')),
  contact_info      text,
  notes             text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  status            text not null default 'active'
                      check (status in ('active', 'dormant')),
  visibility        text not null default 'private'
                      check (visibility in ('private', 'shareable')),
  created_at        timestamptz not null default now()
);
create index if not exists contacts_user_idx on public.contacts (user_id);
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_followup_idx on public.contacts (user_id, next_follow_up_at);
create index if not exists contacts_contacted_idx on public.contacts (user_id, last_contacted_at);

-- raw_captures --------------------------------------------------------------
-- Declared before `tasks` so tasks.source_capture_id can reference it.
-- Every capture lands here first and waits for a human confirm/correct step;
-- the classifier never writes straight through to the CRM tables.
create table if not exists public.raw_captures (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  source         text not null
                   check (source in ('web_form', 'screenshot')),
  raw_text       text,                         -- null for a pure screenshot capture
  image_url      text,
  classification jsonb,
  status         text not null default 'pending_review'
                   check (status in ('pending_review', 'confirmed', 'corrected')),
  created_at     timestamptz not null default now()
);
create index if not exists raw_captures_user_status_idx on public.raw_captures (user_id, status, created_at desc);

-- tasks ---------------------------------------------------------------------
-- priority_score is written from the deterministic formula on every write
-- (lane weight + deadline urgency + task_type nudge). The Priorities card
-- recomputes it at read time so deadline urgency can't go stale in the column.
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  title            text not null,
  description      text,
  task_type        text not null default 'other'
                     check (task_type in ('application', 'networking_outreach',
                                          'informational_interview_followup',
                                          'interview_prep', 'research', 'admin', 'other')),
  lane             text check (lane in ('primary', 'secondary', 'peripheral')),
  company_id       uuid references public.companies (id) on delete set null,
  application_id   uuid references public.applications (id) on delete set null,
  due_date         date,
  priority_score   integer not null default 0,
  status           text not null default 'open'
                     check (status in ('open', 'done')),
  completed_at     timestamptz,
  source           text not null default 'manual'
                     check (source in ('manual', 'ai_capture')),
  source_capture_id uuid references public.raw_captures (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status, priority_score desc);
create index if not exists tasks_due_idx on public.tasks (user_id, due_date);
create index if not exists tasks_company_idx on public.tasks (company_id);
create index if not exists tasks_application_idx on public.tasks (application_id);
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- habit_definitions ---------------------------------------------------------
-- Kept separate from daily state so the habit set can evolve without
-- corrupting history. `target` is a display-only label ("3/day", "30m") -
-- nothing in the app counts against it; a habit is still a plain boolean.
create table if not exists public.habit_definitions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  label      text not null,
  category   text,
  target     text,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists habit_definitions_user_idx on public.habit_definitions (user_id, active, sort_order);

-- daily_logs ----------------------------------------------------------------
-- One row per local day. log_date is resolved from the user's local clock via
-- the shared day-boundary helper, never from the server's UTC date.
-- notes shape: { habits: { habit_id: boolean }, score, focus_today,
--                priorities_rationale }
create table if not exists public.daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  log_date   date not null,
  notes      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create index if not exists daily_logs_user_date_idx on public.daily_logs (user_id, log_date desc);
drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

-- memory_log ----------------------------------------------------------------
-- Postgres full-text search, not embeddings. search_vector is a generated
-- column, so it can never drift from `text`. If this is ever upgraded to
-- vectors it is a one-column swap, not a rearchitecture.
create table if not exists public.memory_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  source_type text not null
                check (source_type in ('capture', 'stage_change', 'task_completed',
                                       'weekly_review', 'habit_note')),
  source_id   uuid,
  text        text not null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  search_vector tsvector generated always as
    (to_tsvector('english', coalesce(text, ''))) stored
);
create index if not exists memory_log_search_idx on public.memory_log using gin (search_vector);
create index if not exists memory_log_user_time_idx on public.memory_log (user_id, occurred_at desc);
create index if not exists memory_log_source_idx on public.memory_log (source_type, source_id);

-- weekly_reviews ------------------------------------------------------------
-- auto_draft holds Claude's synthesis of the week's memory_log entries.
-- The human edits the real fields; sealed_at locks further edits.
create table if not exists public.weekly_reviews (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  week_start       date not null,
  wins             text,
  what_slipped     text,
  open_loops       text,
  follow_up_people text,
  next_week_top3   text,
  auto_draft       jsonb,
  sealed_at        timestamptz,
  visibility       text not null default 'private'
                     check (visibility in ('private', 'shareable')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_reviews_user_week_idx on public.weekly_reviews (user_id, week_start desc);
drop trigger if exists weekly_reviews_set_updated_at on public.weekly_reviews;
create trigger weekly_reviews_set_updated_at
  before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

-- goals ---------------------------------------------------------------------
-- When `metric` is set, progress is computed at read time from applications /
-- memory_log. `completed` is only meaningful for metric = 'manual'.
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  scope        text not null
                 check (scope in ('week', 'month')),
  period_start date not null,
  lane         text check (lane in ('primary', 'secondary', 'peripheral')),
  description  text not null,
  target_count integer not null default 1,
  metric       text check (metric in ('applications', 'networking_outreach',
                                      'informational_interviews', 'manual')),
  completed    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists goals_user_period_idx on public.goals (user_id, scope, period_start desc);

-- ============================================================================
-- RLS: deny-all.
--
-- Enabling RLS with zero policies denies the anon and authenticated roles
-- everything, which is the whole access model - the browser cannot read or
-- write a single row even if the anon key leaks. service_role carries
-- BYPASSRLS, so the server-side routes still work.
--
-- Deliberately NOT `force row level security`: FORCE would apply RLS to the
-- table owner as well, which is the role the Supabase dashboard's table editor
-- runs as. You would open the dashboard, see ten empty tables, and reasonably
-- conclude the app never saved anything. The owner keeping access costs
-- nothing here - it is you, holding the keys already.
-- ============================================================================
alter table public.companies         enable row level security;
alter table public.applications      enable row level security;
alter table public.contacts          enable row level security;
alter table public.tasks             enable row level security;
alter table public.habit_definitions enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.raw_captures      enable row level security;
alter table public.memory_log        enable row level security;
alter table public.weekly_reviews    enable row level security;
alter table public.goals             enable row level security;

-- The server's own access, granted explicitly.
--
-- Supabase's "Automatically expose new tables" project setting is what
-- normally hands out table privileges, and it is worth turning OFF. But it
-- grants service_role along with anon and authenticated, so switching it off
-- would leave the API routes with BYPASSRLS and no privileges to bypass RLS
-- *to* - every query would fail "permission denied for table companies".
-- Granting here makes the app work either way, so the safer project setting
-- stays available.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- And the browser-facing roles get nothing, whatever the project setting says.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
