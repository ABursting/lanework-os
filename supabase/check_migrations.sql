-- ============================================================================
-- Which migrations have been applied?
--
-- Paste this whole file into the Supabase SQL Editor and hit Run. It only
-- reads - it changes nothing - and returns one row per migration saying DONE
-- or NOT RUN. Safe to run any time you are unsure.
-- ============================================================================

select '20260827  initial schema'            as migration,
       case when to_regclass('public.companies') is not null
            then 'DONE' else 'NOT RUN' end   as status
union all
-- Sep 15 puts Researching back, so from then on its presence no longer means
-- this one never ran. The Sep 15 table is the tell that it has moved past.
select '20260831  remove Researching stage',
       case when to_regclass('public.user_settings') is not null then 'DONE'
            when coalesce(
              (select pg_get_constraintdef(oid) from pg_constraint
                where conrelid = 'public.applications'::regclass
                  and conname  = 'applications_stage_check'), '') like '%researching%'
            then 'NOT RUN' else 'DONE' end
union all
select '20260903  log conversations',
       case when coalesce(
              (select pg_get_constraintdef(oid) from pg_constraint
                where conrelid = 'public.memory_log'::regclass
                  and conname  = 'memory_log_source_type_check'), '') like '%contact_touch%'
            then 'DONE' else 'NOT RUN' end
union all
select '20260904  application history',
       case when to_regclass('public.application_events') is not null
            then 'DONE' else 'NOT RUN' end
union all
select '20260915  researching + reminders',
       case when to_regclass('public.user_settings') is not null
             and exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'applications'
                            and column_name = 'remind_on')
            then 'DONE' else 'NOT RUN' end
union all
select '20261001  CRM changes in Brain',
       case when coalesce(
              (select pg_get_constraintdef(oid) from pg_constraint
                where conrelid = 'public.memory_log'::regclass
                  and conname  = 'memory_log_source_type_check'), '') like '%crm_change%'
            then 'DONE' else 'NOT RUN' end
order by migration;
