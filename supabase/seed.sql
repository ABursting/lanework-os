-- Optional starter habits. Run this in the Supabase SQL Editor if you'd rather
-- not add them one at a time from the Habit Tracker card.
--
-- The user_id must match USER_ID in src/lib/constants.ts.

insert into public.habit_definitions (user_id, label, category, target, sort_order)
values
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Applications out',        'applications', '3/day', 0),
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Networking outreach',     'outreach',     '2/day', 1),
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Resume tailoring block',  'applications', '30m',   2),
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Interview drill',         'prep',         '20m',   3),
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Industry reading',        'research',     '1',     4),
  ('a0f7c3e2-5b41-4d8a-9e6f-1c2b3a4d5e60', 'Log the day in Brain',    'admin',        null,    5);
