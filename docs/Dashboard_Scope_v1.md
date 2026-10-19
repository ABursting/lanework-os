---
Locked scope from the design/ideation session (Aug 2026), following Recruiting_Status_8.26.2026.md. Reference source: Miles Deutscher's "Personal OS Build Cheat Sheet" + dashboard screenshots (pattern library, not a spec — several deliberate divergences noted below). Ready for Claude Design mockup → Claude Code build.
---

# Recruiting Dashboard — v1 Scope & Data Model

## Resolved decisions

**CRM is first-class**, not a dependency of Priorities. It's already a full page with a real stage pipeline in Tier 1; nearly every other feature (Priorities, Calendar, Compress, Weekly Review, the AI Classifier) reads from CRM entities. Built early, not bolted on.

**Access model:** the future public/shareable view (Tier 2) is for portfolio/interview use — proving the build to an AI-integration interviewer, not giving a mentor a live feed of the real search. A `visibility` field (`private`/`shareable`, default private) is added now to `companies`, `contacts`, and `weekly_reviews` as cheap insurance, but the actual Tier 2 build will most likely be a seeded demo/fixture dataset that exercises the real AI pipeline safely, rather than filtering real rows. Nothing to build for this in v1.

**Calendar:** reads the target Google Calendar's private "secret address in iCal format" — read-only, no OAuth, no separate calendar system. Recommend a dedicated "Job Search" calendar in Google Calendar so the feed only ever contains recruiting events. Write-back / full Calendar API is a possible later upgrade, not v1.

**Resume effectiveness tracking:** a sticky marker on each application records whether it ever cleared the initial resume/application screen, independent of final outcome — so a rejection after interviewing and a rejection that never got a look stay distinguishable. See `resume_passed` and `sector` below.

**No auth gate for v1** — confirmed cut from Tier 1 scope. Single hardcoded `user_id` constant throughout, structured so swapping in real auth later (if this ever goes multi-user) is a one-line change, not a rearchitecture.

## Data model

**companies** — id, user_id, name, website, sector (freeform industry tag, e.g. "climate tech," "fintech," "consulting"), notes, source, last_touched_at, visibility, created_at. Employer identity only — no stage/lane/deadline (moved to `applications`, since lanes are defined by role type and one company can have roles in different lanes).

**applications** — id, user_id, company_id (fk), role_title, lane (`primary`/`secondary`/`peripheral`), stage (`researching`/`applied`/`interviewing`/`offer`/`rejected`/`archived`), applied_date (auto-fills on stage → applied), deadline, job_posting_url, source_platform (LinkedIn/Handshake/etc.), source (`manual`/`ai_capture`/`screenshot_import`), resume_passed (boolean, default false — auto-set true on first stage transition into `interviewing`, also manually togglable, stays true regardless of later outcome), last_touched_at (updates on any linked activity, not just stage change), stage_changed_at, notes. One row per job opportunity — handles multiple roles per company. `rejected` (they said no) and `archived` (you gave up) are kept as distinct terminal states.

**contacts** — id, user_id, company_id (fk, nullable — "Independent" contacts allowed), name, role, relationship_type (`recruiter`/`alum`/`referral`/`hiring_manager`/`peer`/`other`), contact_info, notes, last_contacted_at, next_follow_up_at, status (`active`/`dormant`), visibility, created_at.

**tasks** — id, user_id, title, description, task_type (`application`/`networking_outreach`/`informational_interview_followup`/`interview_prep`/`research`/`admin`/`other`), lane, company_id (fk, nullable), application_id (fk, nullable), due_date, priority_score, status (`open`/`done`), completed_at, source (`manual`/`ai_capture`), source_capture_id (fk), created_at, updated_at.

Priority ranking is a deterministic formula, not a live AI call: `lane_weight` (primary 100 / secondary 50 / peripheral 10) + `deadline_urgency` (overdue > today > this week > this month > none) + a small `task_type` nudge. AI adds a cached, once-daily one-line "why today" rationale per top-3 task — generated on demand, never re-run on page load.

**habit_definitions** — id, user_id, label, category, sort_order, active. Kept separate from daily state so the habit set can evolve without corrupting history.

**daily_logs** — id, user_id, log_date (unique per user), notes (jsonb: `{ habits: {habit_id: boolean}, score, focus_today, priorities_rationale }`). Local-midnight reset (user's clock, not the server's — a real bug Miles hit).

**raw_captures** — id, user_id, source (`web_form`/`screenshot`), raw_text, image_url (for screenshot captures), classification (jsonb), status (`pending_review`/`confirmed`/`corrected`), created_at.

Text capture classification shape: `{ summary, category, matched_companies: [{company_id|null, matched_name, is_new}], matched_contacts: [...], suggested_task, suggested_stage_change, confidence }`. Categories: task / company update / contact update / interview note / application status change / reflection. Entity matching is a plain name-list lookup against existing CRM records (Claude gets the list as context) — never a fabricated ID; unmatched names are flagged `is_new`, never invented.

Screenshot capture (LinkedIn/Handshake saved-jobs pages): same pipeline, image input instead of text, returns a *list* of extracted jobs (company, role, location, platform) since one screenshot can contain many listings. Deduped against existing `applications` by company+role match before showing the confirm checklist. Confirmed jobs land as new `applications` rows at `stage = 'researching'`.

Every capture — text or screenshot — goes through a human confirm/correct step before anything is written to `companies`/`contacts`/`applications`/`tasks`. The AI never commits on its own say-so.

**memory_log** — id, user_id, source_type (`capture`/`stage_change`/`task_completed`/`weekly_review`/`habit_note`), source_id, text (denormalized), occurred_at, search_vector (tsvector, GIN indexed). Postgres full-text search, not embeddings — smallest possible diff from the pattern library's vector-shaped table if an upgrade is ever needed later (one column swap, not a rearchitecture).

**weekly_reviews** — id, user_id, week_start, wins, what_slipped, open_loops, follow_up_people, next_week_top3, auto_draft (jsonb), sealed_at, visibility.

Auto-draft: on first visit after week-end (or a button), Claude reads the week's `memory_log` entries and drafts each field; human edits, then seals (locks further edits). Second real AI-generation showcase alongside the Priorities rationale — synthesis from raw event data, human approval gate before it's final.

**goals** — id, user_id, scope (`week`/`month`), period_start, lane (nullable), description, target_count, metric (`applications`/`networking_outreach`/`informational_interviews`/`manual`, nullable), completed (bool, manual only). When `metric` is set, progress is computed at read time from `applications`/`memory_log` — not a checkbox you maintain by hand.

**Compress view** — no new table. Two queries surfaced together: applications with `last_touched_at` 30+ days stale (excluding offer/rejected/archived) → Kill (archive) or Revive; contacts with `next_follow_up_at` overdue, or (if unset) `last_contacted_at` 30+ days stale → Follow Up or Let Go (sets `status = 'dormant'`).

**Cron-to-GitHub backup** — no schema. Nightly Vercel cron exports every table as JSON to a private repo. Direct reuse of the pattern library's Part 7, no new design needed.

## Resume effectiveness reporting

Not a dedicated view for v1 — just make sure the fields are captured from day one so the data exists later. The CRM summary strip shows an overall pass rate ("Resume pass rate: 62% — 18/29"). A breakdown grouped by lane or by sector is a single group-by query once there's enough application volume to make it meaningful — worth adding once the base engine's running, not before.

## Page & card structure

Four top-level pages, ordered by visit frequency: **Home** → **CRM** → **Brain** → **Review**.

- **Home** (2-column): left rail — Operator, Habit Tracker, Goals (stacked, glanceable). Main column — Priorities, Calendar (stacked, wider, action-oriented).
- **CRM** (sub-tabs: Applications / Companies / Contacts / Compress): Applications is a kanban with stage as columns, lane as a colored badge per card, a checkmark badge for `resume_passed`, plus a summary count strip at top (counts per stage + overall resume pass rate).
- **Brain**: search bar + ranked results over `memory_log`.
- **Review**: single-column weekly review document with a seal action.

Global: a persistent floating capture bar on every page, accepting typed text or an attached screenshot — one surface, two input modes, same AI-extract-then-confirm pipeline either way.

No UI surface at all for: the AI Classifier itself (runs behind the capture bar), Memory storage (Brain is its UI), or the backup cron (pure ops).

## Build notes carried from the pattern library

Implementation-specific gotchas worth building in from the start, filtered to what's actually relevant to this scope (the source cheat sheet covers more surface than we're building — Finance Pulse, auth gate, etc. — those are dropped):

- **Calendar parsing:** use `ical.js` (pure JavaScript) to parse the iCal feed, not `node-ical` or anything else that uses BigInt internally — those work locally but break on Vercel's bundler in production ("o.BigInt is not a function").
- **Day-boundary logic:** every place "today" or a day/week/month boundary matters — habit reset, `daily_logs`, goal periods — should call one shared helper based on the user's local clock, not the server's UTC day. Write it once, use it everywhere, so these can't drift out of sync with each other.
- **AI never runs on page load** — only on an explicit capture, or a cached generation (Priorities rationale, Weekly Review draft) that's regenerated on request, never re-run on every render. This is the throughline for every AI touchpoint in this build.
- **Validate AI-returned entity IDs** — never trust an ID the classifier returns directly; check it actually exists in `companies`/`contacts` before writing anything, fall back to `is_new`/null if it doesn't match a real row.
- **Log every server error explicitly, validate NOT NULL columns before insert** — a silently-caught POST failure looks like a card saved successfully, then reverts on the next refresh.
- **Optimistic UI + async fetch race:** on any card with instant-feedback local state (habits especially), guard against a slow mount-time GET resolving after the user's first edit and clobbering it — a `dirty` flag that, once set, ignores the stale response.

## Next step

Take the mockup (from Claude Design) and this document into Claude Code for the build. This doc carries the schema/behavior; Claude Design's handoff carries the visual layer — Claude Code needs both.

---

## Amendments after first use (Aug 31, 2026)

The body of this document is the locked scope from the design session. These
are the changes made after actually using the build, recorded here rather than
edited in above, so the original intent stays legible.

**The `researching` stage is removed.** `applications.stage` is now
`applied` / `interviewing` / `offer` / `rejected` / `archived`, and `applied`
is the default. In practice, tracking roles you were merely considering meant
hand-maintaining a column of maybes — the opposite of the low-friction capture
this system is for.

Consequences, all applied:
- Screenshot import lands confirmed jobs at `applied`, not `researching`.
  Screenshots are taken from a job platform's own "Applied" tab, so the rows
  really have been submitted and the stage is honest.
- The resume pass rate's denominator is now every application, since there is
  no longer a pre-submission stage to exclude.
- Migration `20260831000000_drop_researching_stage.sql` moves any existing
  `researching` rows to `applied` and tightens the CHECK constraint.

**Habits can be edited, retired, and deleted.** `habit_definitions` gains no
new columns; retiring sets `active = false`. Hard delete is refused once a
habit has been completed on any day, because `daily_logs` keys its records by
habit id and deleting the definition would rewrite that history.

**Tasks get a full view.** A `Tasks` sub-tab under CRM lists every task, open
and completed, with the same deterministic ranking the Priorities card uses.
The Priorities card keeps its top-three framing and gains a "show all" toggle.
No schema change.

**A capture can propose several tasks.** The classification shape's
`suggested_task` (a single nullable object) is now `suggested_tasks` (an
array). Written as one slot, a note like "tailor the resume, email the
recruiter, prep behavioural answers" was classified correctly but committed
only the first action — the other two were visible in Brain and absent from the
task list. Notes are written the way thoughts arrive, several at a time, so the
shape has to match.

The confirm step lists every proposed task with its own tick, title, type,
lane and due date; the commit route writes each accepted one. No schema change
— `tasks` rows were always independent.

Note the same single-slot shape still applies to `suggested_stage_change`, so
a note reporting two pipeline moves will only offer the first.

## Amendment: text captures can log a new application (Sep 2, 2026)

**A typed note can now create an application, not just move one.** This
extends the locked scope rather than implementing it, so it is recorded here
the same way the Aug 31 changes were.

The gap: `suggested_stage_change` can only ever move an application that
already exists, and `createApplication` was reachable from exactly two places
— the screenshot import and the direct form. A note like "applied to the PM
role at Notion this morning" was classified correctly, created the *company*
Notion, wrote the note to Brain, and left no pipeline row at all. The confirm
dialog offered an application picker listing only roles already tracked, so
there was no manual workaround either.

The original scope routed application creation through screenshots on the
reasoning that job platforms already keep an accurate "Applied" tab. That
holds for LinkedIn and Handshake. It does not cover applying on a company's
own site, by email, or through a referral — which is most of the pipeline.

What changed:
- `CaptureCategory` gains `new_application`.
- `CaptureClassification` gains `suggested_application` — company, role, lane,
  stage, plus two server-resolved fields: `existing_company_id` so confirming
  does not create a second "Stripe", and `duplicate_of_application_id` so a
  role already tracked is shown as tracked instead of logged twice. The model
  is asked for neither, consistent with the existing rule that it never
  returns an id.
- The classifier reports what the note says and does **not** decide whether a
  role is already tracked — that check runs server-side against real rows,
  matching how `matched_companies`/`matched_contacts` already work.
- Submission and movement are mutually exclusive for one role: a role being
  logged for the first time carries its stage on the new row, so the redundant
  stage change is dropped server-side.
- A note describing a screen or interview at an untracked company creates the
  application at `interviewing` rather than `applied`, which sets
  `resume_passed` correctly on the way in.
- The commit route creates the application after companies and before tasks,
  and re-runs the dedupe rather than trusting the check from classification
  time. Ticking the role implies its employer, so the company is created even
  if its own box was left unticked.
- The confirm dialog gains an unticked-by-default block with editable company,
  role, lane and stage, and states plainly when the role is already tracked.

No schema change — `applications` rows already supported everything here.

Known limitation, unchanged from the Aug 31 note: `suggested_application` is a
single slot, so a note reporting two submissions at once will only offer the
first.

**Captures can log a conversation, not only propose work.** The classification
shape gains `suggested_contact_touches`: people the note says were already
contacted or spoken to. Confirming one sets `contacts.last_contacted_at`,
optionally sets `next_follow_up_at`, and writes a `contact_touch` entry to
`memory_log` attributed to that contact — so a conversation is dated and
searchable in Brain rather than accumulating in an undated notes blob.

This closes a gap rather than adding a feature: `contacts` always had
`last_contacted_at`, `next_follow_up_at` and `notes`, and Compress always read
them, but nothing except manual editing could write them. A note reporting
outreach had to be expressed as tasks.

`memory_log.source_type` gains `contact_touch`
(migration `20260903000000_contact_touches.sql`).

Overdue follow-ups now also appear on Home — explicit dates only. The 30-day
"gone quiet" sweep stays in Compress, where triage belongs.

**An eleventh table: `application_events`.** id, user_id, application_id (fk),
from_stage (nullable — the submission has nothing before it), to_stage,
occurred_at, note, created_at. One row per transition, written by the app and
never edited.

`applications.stage_changed_at` holds only the most recent change, which is
enough for staleness and useless for history. This makes the sequence
queryable: when a role was submitted, when it moved, and how long it sat at
each stage. `memory_log` keeps its prose `stage_change` entry alongside, for
Brain search — the two serve different questions.

Migration `20260904000000_application_events.sql` backfills the submission and
the current stage's arrival for existing rows; intermediate transitions were
never recorded structurally and are not reconstructed.

**Review gains sub-tabs.** Weekly (the document) and Timeline (daily completed
tasks by category, with pipeline moves on a separate strip). Still four
top-level pages.

## Amendment: a password screen before deploying (Sep 14, 2026)

**Overrides "No auth gate for v1" in Resolved decisions.** That decision assumed
the dashboard ran only on the operator's machine. Deploying to Vercel puts all
real recruiting data on a public address, and exposes the capture bar, which
spends Anthropic credit. Flagged as a conflict and resolved by Asher: a single
shared password in front of every page and API route, with an email alert on
each login.

What did **not** change: this is access control, not identity. There is still
exactly one user, one hardcoded `USER_ID`, and no accounts table — the
"one-line change to real auth" property is intact. The session is a signed,
expiring cookie with nothing stored server-side (`src/lib/auth/session.ts`),
enforced by `src/middleware.ts`. Routes outside the gate must carry their own
check, as the backup cron already does with `CRON_SECRET`.


## Amendment: Researching returns, with reminders to apply (Sep 15, 2026)

**Reverses the Aug 31 removal of `researching`.** Asher's call, made knowing
why it was removed. It comes back with a narrower meaning so it cannot become
the column of maybes again: a Researching role is one you *plan to apply to,
by a date*. It carries a deadline and a remind-me date; the reminder shows on
the Home calendar; an ignored reminder comes back in Compress; and once the role
moves to Applied both dates drop off on their own.

`applications` gains:
- `stage` accepts `researching` again (first in the list). The default stays
  `applied`, so imports and "I applied to…" notes land where they did.
- `kind` — `job` / `grad_school`. Grad programs share the board and reminders
  but are excluded from the resume pass rate and the `applications` goal
  metric. A program is stored as university = company, program = role.
- `remind_on` (date) and `remind_estimated` (bool). Estimated means the date
  was worked out from a listing's posting age because it showed no deadline.

Reminder rules (`src/lib/reminders.ts`, tested): default 10 days before the
deadline, or 10 days from today with none; never a day already gone. A listing
with only a posting age gets posting date + 14 days, marked estimated. An
ignored reminder resurfaces in Compress its window after the reminder, capped at
two days before the deadline; a passed deadline shows as Missed.

**The calendar shows dashboard-drawn entries.** "Apply" and "Due" entries for
Researching roles are drawn from `applications`, next to the read-only iCal
feed. They do not reach Google Calendar. Pushing them there is the natural first
use of the Google write access still pending (see the Sep 10 scheduling
thread); nothing here is thrown away when that lands.

**Compress grows from two sections to four, with adjustable windows.**
Overrides the fixed 30-day thresholds in "Compress view". Sections: Reminders
ignored (Applied / Snooze / Drop), Stale tasks — every open task, measured from its due date or, when it has
none, from when it was created (Done / Push / Delete),
Applications quiet (Kill / Revive), Contacts quiet (Follow Up / Let Go). Each
section's window has a slider, plus an all-windows slider that sets every
section to one multiple of its default. The Reminders section leads with this
week's job applications against the weekly goal.

**A twelfth table: `user_settings`.** One row per user holding the four window
values. The scope has nowhere to keep a preference that must survive across
devices once deployed; a browser cookie would not.

**Capture.** The note classifier's `suggested_applications` gains `kind`,
`deadline`, `remind_on` and `remind_days_before`, and is told that a role you
want to track or be reminded about is a Researching application, not a task. A
submission of a role already in Researching is turned into a stage change.
Screenshot extraction gains `deadline` and `posted_days_ago`; the confirm step
now **requires** choosing "Already applied" or "To apply" before anything
commits — the model is deliberately not asked to guess. In Applied mode, a
listing already tracked in Researching moves to Applied instead of being skipped.

Migration `20260915000000_researching_and_reminders.sql`.
