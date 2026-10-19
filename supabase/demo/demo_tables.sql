-- ============================================================================
-- Two extra tables that exist ONLY in the demo database.
--
-- These are a deliberate departure from the scope's data model, and they are
-- confined to the public demo: they are not in supabase/migrations/, so Asher's
-- real database has never had them and running the real migrations will never
-- create them. Flagged to Asher on 2026-10-03.
--
--   demo_marker    - proof of identity. The demo deployment refuses to serve
--                    or erase anything unless it can read this table. That is
--                    what stops a mis-pasted URL and key pointing the public,
--                    password-free, self-wiping deployment at the real
--                    database. A copied environment variable cannot bring this
--                    table with it. See src/lib/demoGuard.ts.
--
--   demo_ai_usage  - one row per day, counting live model calls across every
--                    visitor so the daily cap is shared rather than per
--                    browser. It has to live in the database because the demo
--                    runs as several server instances at once, and a counter
--                    held in memory would reset whenever one spun up.
--
-- Idempotent: safe to run twice.
-- ============================================================================

-- -- Identity ----------------------------------------------------------------
-- A single-row table. The `check (id)` clause allows only true, so the primary
-- key makes a second row impossible.
create table if not exists public.demo_marker (
  id        boolean primary key default true check (id),
  seeded_at timestamptz not null default now()
);

insert into public.demo_marker (id) values (true)
on conflict (id) do nothing;

alter table public.demo_marker enable row level security;
grant all privileges on public.demo_marker to service_role;
revoke all on public.demo_marker from anon, authenticated;

-- -- The AI allowance --------------------------------------------------------
-- `day` is a civil date in the app's timezone, not UTC, so the allowance
-- resets at midnight where the dashboard thinks it lives (rule 3).
create table if not exists public.demo_ai_usage (
  day   date primary key,
  calls integer not null default 0 check (calls >= 0)
);

alter table public.demo_ai_usage enable row level security;
grant all privileges on public.demo_ai_usage to service_role;
revoke all on public.demo_ai_usage from anon, authenticated;

-- Count a call and return the new total in one statement, so two visitors
-- capturing at the same moment cannot both read "24" and both be let through.
create or replace function public.demo_count_ai_call(for_day date)
returns integer
language sql
as $$
  insert into public.demo_ai_usage (day, calls)
  values (for_day, 1)
  on conflict (day) do update set calls = public.demo_ai_usage.calls + 1
  returning calls;
$$;

grant execute on function public.demo_count_ai_call(date) to service_role;
revoke execute on function public.demo_count_ai_call(date) from anon, authenticated;
