-- ============================================================================
-- Drop the `researching` stage.
--
-- In use, the stage turned out to be busywork rather than a pipeline step:
-- tracking jobs you are merely considering meant hand-maintaining a column of
-- maybes. Screenshot imports are taken from a job platform's own "Applied"
-- tab, so they arrive already applied - `applied` is now both the default and
-- the landing stage for an import, and it is honest about what it means.
--
-- Safe to run on a board that still has rows in `researching`: they are moved
-- to `applied` first, and given an applied_date if they lack one.
-- ============================================================================

update public.applications
   set stage = 'applied',
       applied_date = coalesce(applied_date, current_date)
 where stage = 'researching';

alter table public.applications
  drop constraint if exists applications_stage_check;

alter table public.applications
  add constraint applications_stage_check
  check (stage in ('applied', 'interviewing', 'offer', 'rejected', 'archived'));

alter table public.applications
  alter column stage set default 'applied';
