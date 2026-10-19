-- ============================================================================
-- Outreach radar: who you already know where you have applied.
--
-- Two changes, both for the same feature.
--
-- 1. `connections` - a THIRTEENTH table, and a flagged departure from the
--    scope's data model. It holds Asher's own LinkedIn connections, imported
--    from the export LinkedIn gives you of your own data. Deliberately NOT
--    merged into `contacts`: contacts are the handful of people he is actually
--    in conversation with, and the follow-up card, the Compress page and the
--    Brain timeline all assume that. Several hundred people he has merely
--    connected with would bury the five who matter, and none of them belong in
--    a follow-up queue. A connection becomes a contact only when he reaches
--    out, by hand.
--
--    No agent ever logs in to LinkedIn to collect these. LinkedIn has no API
--    for an individual's connections, and automated browsing as the account
--    holder breaks its terms and risks the account. This is his own data
--    export, which he downloads and imports himself.
--
-- 2. `applications.outreach_wanted` - a toggle meaning "I want to do outreach
--    for this role, whether or not I already know anyone there." Without it
--    the radar could only ever report coincidences; with it, Asher can point
--    it at the roles he actually cares about and have it go looking.
--
-- Deliberately NOT added to the nightly backup's table list. Asher's decision,
-- 2026-10-06: the backup copies every row to a GitHub repo, and several
-- hundred real people's names and employers do not need to be there. The file
-- can be re-imported from LinkedIn at any time, so nothing is lost.
--
-- Idempotent - safe to run twice.
-- ============================================================================

-- -- 1. The connections ------------------------------------------------------

create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,

  -- Exactly the five columns LinkedIn's Connections.csv carries, and nothing
  -- else. The same export also contains messages and other private data; only
  -- this one file is ever read.
  name          text not null,
  profile_url   text,
  company       text,
  position      text,
  connected_on  date,

  -- When this row was last seen in an import. A re-import refreshes it, so a
  -- connection who changed jobs updates rather than duplicating.
  imported_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists connections_user_idx on public.connections (user_id);

-- The radar's query is "everyone at this company", so the company is the
-- thing worth indexing. Matching itself happens in the app, through the same
-- normalizeName the capture classifier and the screenshot importer use -
-- repeating that rule in SQL would be a third copy of it, and a third copy is
-- how the screenshot importer came to disagree with the other two.
create index if not exists connections_company_idx on public.connections (user_id, company);

-- One row per person. LinkedIn's export has no stable id, and a profile URL is
-- the closest thing to one; a connection with no URL falls back to their name.
create unique index if not exists connections_identity_idx
  on public.connections (user_id, coalesce(profile_url, name));

alter table public.connections enable row level security;
grant all privileges on public.connections to service_role;
revoke all on public.connections from anon, authenticated;

-- -- 2. The outreach toggle --------------------------------------------------

alter table public.applications
  add column if not exists outreach_wanted boolean not null default false;

-- The radar reads "roles I want outreach for", so that is the index.
create index if not exists applications_outreach_idx
  on public.applications (user_id, outreach_wanted)
  where outreach_wanted;
