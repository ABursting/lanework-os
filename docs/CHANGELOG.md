# Changelog

A running record of what has changed in the dashboard and why.

**How to read this:** newest at the top. Each entry says what changed in plain
terms, and — where it matters — *why*, because the reason is usually the part
worth remembering. Bugs are recorded honestly, including ones introduced and
then fixed in the same sitting.

**How to maintain it:** add an entry whenever behaviour changes. Not needed for
comment tweaks or refactors nobody would notice. Related docs:
[`Dashboard_Scope_v1.md`](Dashboard_Scope_v1.md) holds the locked design and its
amendments; [`SETUP.md`](../SETUP.md) holds installation.

Entries before 2026-09-02 were reconstructed from the build sessions rather
than written as they happened.

---

## 2026-10-19

- **Four bugs found by looking at the running app.** Everything below passed
  `tsc`, the linter, 184 tests and a clean production build. None of them was
  visible from any of those.

  **The capture bar was covering the bottom 34px of every page.** The frame
  reserved a fixed 96px for a bar that occupies 130px, so the last strip of
  every page was visible and unclickable. On most pages that strip is
  whitespace, which is why it went unnoticed - until the outreach picker ended
  in a button, which rendered, looked enabled, and did nothing. The bar
  measures itself now and publishes `--capture-bar-space`; the frame pads to
  that, because the number copied between two components is the bug waiting to
  come back.

  **The alumni search cap counted roles, not companies.** `MAX_COMPANIES_PER_RUN`
  is named for companies and was applied to a list holding one entry per role,
  so two roles at one employer could spend two of the five searches asking the
  same question about the same company - and the run would report five
  companies searched having looked at three. Searching is the half that costs
  money; the unit it is capped in has to be the unit it is billed in.

  **Roles past the cap vanished from the report.** The returned gaps were
  rebuilt only from companies the run reached, so the sixth company onwards was
  neither searched nor listed as still needing one. Carried through untouched
  now, which is also what makes "run it again to continue" true.

  **The gap heading inflated the bill.** "You know nobody at 12 companies" was
  12 roles at 8 companies, sitting directly above the button that charges per
  company. It counts employers now, with the role count beside it.

- **The demo told visitors to run npm.** With its connections table empty the
  radar reported "No connections imported yet - run `npm run
  import-connections`" to whoever was looking at the public site: a to-do
  addressed to Asher, shown to a stranger who has never cloned anything.

- **First live drafting run on the demo, with permission.** One call, two
  messages, both correct: the person already known got no self-introduction,
  the alumna got one, and each first sentence named why that person rather than
  opening with a pleasantry. Both ran to about 75 words against a 60-word
  target and an 80-word cap, and both asked for "fifteen minutes" - watch for
  that repeating when a larger batch is drafted at once.

- **The demo stopped pretending, in the direction of doing more.** Its radar
  replayed a recording end to end, which made the one part of the feature that
  needs no model - comparing two lists of company names - fake for no reason.

  Its database now holds 150 invented connections, so "check for connections"
  runs the real matching code and gets a real answer about fictional people.
  Three of them work at companies Jamie has applied to; nobody works at the
  three the web search is shown looking at, which is what keeps the replayed
  half coherent.

  **Drafting is live in the demo too**, sharing the capture bar's daily cap. It
  is the cheap half - one call for the batch, a few seconds - and it is the
  half worth paying for, because a replayed draft is indistinguishable from a
  hardcoded paragraph and the whole claim of the feature is that a model wrote
  that sentence about that person. When the cap is spent it falls back to the
  recorded drafts and says so, rather than failing.

  **The web search stays recorded**, for the three reasons it always was: a
  call per company, most of a minute each, and it would be looking up real
  strangers on behalf of a student who does not exist.

- **"This is a recorded run" became a lie, so it was replaced.** The banner
  covered the whole run; the run is now a mixture. It names the replayed part
  instead. A label that overstates what is fake fails in the same way as one
  that overstates what is real - and `RadarRun.recorded` (a boolean over
  everything) gave way to `replayed: "search"`.

- **The demo has a guide.** "What am I looking at?" under the banner, closed by
  default, explaining the capture bar first and then the four pages. It had
  been relying on being intuitive, which is a lot to ask of an app whose main
  input is a box you type a sentence into. It also says which AI is live and
  which is replayed, where that is true.

- **[`docs/FEATURES.md`](FEATURES.md)** - the same walkthrough for someone
  reading the repository rather than clicking the demo. The README is a case
  study and SETUP.md is how to run it; neither said what the thing does.

- **The outreach radar's watchlist is gone; you pick roles per run instead.**
  Choosing a role used to mean ticking "Worth reaching out about", which saved
  a flag on the application and kept it there. So the radar ran against a
  standing list you had to curate and then remember to un-curate.

  In six weeks nothing was ever ticked. That is about as clear a verdict as a
  feature gets, and it is why the radar had never been run against the real
  board: the only way in was a box on a form, one role at a time.

  It is now a selection rather than a setting. The Outreach tab lists every
  role you have applied for, newest first, with a search box and All / Last 7
  days / Clear. Pick some, press Check, and the picks evaporate afterwards.
  Nothing is written to the database by choosing, so choosing is instant.

- **Two screens, and the paid search moved to the second one.** The free check
  (two lists compared) and the web search (one call per company, real money)
  used to sit side by side as two buttons before you had chosen anything. Now
  the check runs first, and the search is offered against the companies it
  found nobody at - so by the time the expensive button exists, it says how
  many companies it would search and names them. "Costs money" as a number
  rather than a warning.

- **Newest first, and why the clever sort went.** The list used to float
  companies where you already knew somebody to the top. That was solving a
  problem the new flow solves properly one step later, when it filters to
  exactly those - so all the sort did was break the order every other list in
  the dashboard uses. Asher's call, and he was right.

- **Drafts are three sentences now.** Greeting plus the specific reason it is
  them; one line on who you are; the ask, with an easy way to say no in the
  same sentence. About 60 words, down from 80. The ask is a short call rather
  than the smaller "fifteen minutes or one question" - a clearer ask that
  converts a little worse, chosen deliberately (Asher, 2026-10-19).

  The rule the shape had to keep: sentence one must say why *this* person. A
  first sentence that would work for anyone makes the other two worthless,
  because the reader has already decided. The prompt still branches on whether
  you know them - introducing yourself to an existing connection reads as
  having forgotten them.

- **The MCP tool stopped depending on the flag too.** `outreach_radar` filtered
  on the same never-ticked box, so it could only ever answer "nothing is
  marked". It now reports every submitted role and who you know there, with an
  optional `recent_days`. The question it actually gets asked is "where do I
  know someone", and that needs no curation to answer.

- `outreach_wanted` stays in the database, unread. Dropping a column is a
  migration that buys nothing, and leaving it costs nothing.

- **A failed backup is now visible.** The nightly job records when it last
  succeeded and the file it wrote; the Operator card on Home says "Backup ran
  today" in grey, and turns amber when the last success is two days old, when
  there has never been one, or when it cannot tell because migration
  `20261018000000` has not been run. That last case is amber on purpose: "your
  data is not being backed up" and "nobody can say whether your data is being
  backed up" deserve the same attention. It exists because the backup failed
  silently for three nights in October and nothing anywhere said so.

  The success is recorded in a try/catch that swallows failures: at that point
  the backup is already uploaded, and failing the job over its own bookkeeping
  would turn a working night into a reported failure.

- **The README's login-alert claim was false.** It said "a login alert email
  fires on every sign-in". The mail code looks for a provider key, finds none,
  and returns without sending - and those keys have never been set, here or on
  Vercel. No sign-in has ever produced an alert. Reworded to say the feature is
  built but not switched on. Found while auditing the repo for publication,
  which is exactly the sort of thing that audit was for.

## 2026-10-16

- **The Outreach page redesigned.** Asher, before launch: "visually the
  networking radar panels and features are very ugly, non intuitive, and do not
  fit with design of the rest of the dashboard." All three were fair. Four
  specific faults, worth naming because any page here could repeat them:

  - It inherited the CRM's 1800px width, which is right for a six-column board
    and wrong for one column of prose - short lines stranded on the left of a
    very wide screen. It is a reading column now.
  - It explained itself in a paragraph of 10.5px monospace. Monospace in this
    design is for small meta labels; a sentence set in it reads as a log file.
  - Its two actions were a ghost button beside a bare one, so the free action
    and the one that spends money looked like two pieces of text. They are
    secondary and primary buttons now.
  - It rendered a full-height panel to say "Nobody to message yet", then told
    the operator to tick a box on another page - while being the page that
    knows which boxes are worth ticking.

  It now uses the kicker-and-heading every other panel uses, renders no panel
  for an empty set, and the step trace uses coloured dots rather than glyphs
  (a triangle, a bowtie, a dash) that needed a key nobody was given.

- **The watchlist is on the page, and sorted by who you already know.** The
  radar only looks at roles you have marked, so the page now lists every
  submitted role with a tick, companies where you already know somebody first:
  the top four had 6, 6, 5 and 4 known connections - and the one with 4 is the
  role at Interviewing. That is the whole feature in one glance, and it was previously
  three pages away. It opens by default whenever nothing is watched and there
  is nothing to show, because that is the state where choosing a role is the
  next useful thing.

- Note for later: running `npm run build` while the dev server is up corrupts
  the build folder they share, and the page answers "Internal Server Error"
  with nothing wrong in the code. Stop the server, delete `.next`, restart.

## 2026-10-11

- **Moving applications out of a full column.** With 89 in Applied, the only
  way to move number 40 was: Show all -> find it -> click -> the whole edit
  form opens -> change the stage dropdown -> Save. Five steps and a form. The
  Show-all list was read-only, and dragging only ever worked on the ten cards
  the board itself shows.

  Each row now carries a "Move to..." control that saves on the spot, and rows
  can be ticked for a bulk move to **any** stage, not just Rejected - which is
  the real action when four replies land in a week. Both reuse the board's
  existing `move()`, so the optimistic update and the rollback on failure are
  the ones already proven rather than a second copy.

- **The Applied tile counts everything ever sent, not what is sitting there.**
  It used to show the column's own length, so moving a role to Interviewing
  made the number go *down* - progress reading as regress. It now reads 95 with
  "89 awaiting reply" beneath: effort above, queue below. Two different
  questions that were being answered with one number.

  Applied alone is cumulative. Rejected and Archived are already terminal, and
  a cumulative Interviewing would double-count anyone who went on to an offer.

- **A cumulative chart on the timeline**, between the activity chart and the
  detail list. The running total of applications submitted, so the *slope* is
  the message - a flat fortnight is one that got away, a steep week is one that
  went well. A per-day count of a job search is mostly zeroes with occasional
  spikes, which reads as noise rather than progress.

  Read from `applied_date` rather than counted from stage-change events: an
  application created directly as Applied - which is what a screenshot import
  produces - never generates a transition into Applied, so counting events
  would have quietly undercounted exactly the roles that arrive in bulk.

  The line continues from the count before the window rather than restarting at
  zero, so changing the range slides along one curve instead of drawing a
  different one. The axis says so when there is a carry-over, and says nothing
  when there is not - the first version claimed "starts at 0, not zero" on a
  range that contained everything.

## 2026-10-09

- **Drafting is now a separate step from searching.** Asher's call: the search
  says who exists, then he ticks the people worth writing to and presses Draft.
  Drafting everything a search turns up pays for messages to people who were
  never going to be contacted, and buries the two that matter in a page of ones
  that do not. It is the capture bar's shape applied here - the machine
  proposes, the human picks, and only the picked part costs anything.

- **First live runs, with permission.** Three model calls.

  **Drafting works.** Two real connections at one company, 66 words each,
  specific to the person rather than a template: it noticed that "Incoming
  Technology Analyst" means that person went through those interviews recently
  and built the ask around that. One small request each, an easy way to say no, none of the
  "I hope this finds you well" register the prompt forbids.

  **The alumni search found a real bug in itself.** A large consulting firm
  returned nobody. Nothing had been dropped by the evidence filter, so the model
  genuinely reported nothing - which at a firm that size was suspicious. A second
  run against another large employer found two people with proper sources and
  explained why in its own words: *"the search tool quota was exhausted before I
  could check [...]"*.

  `max_uses` was 6. That is not enough to work through a large employer, and a
  search that stops early looks exactly like a company with no alumni - a
  confident nothing, which is the worst way for this to fail. Raised to 14, and
  that first result should be treated as unknown rather than negative.

- **The run now reports what the search actually looked at**, in the model's
  own words, rather than a fixed sentence. `findAlumniAt` had always returned
  that note and the radar was throwing it away. Without it there is no way to
  tell "looked hard, found nothing" from "barely looked" - which is precisely
  the question that run raised and could not answer.

- Measured: a company search takes 45-70 seconds. Drafting two messages took 8.

- The searches read public LinkedIn profiles through a search engine, the way
  anyone with a browser would. That is not signing in and browsing as Asher,
  which is what breaks LinkedIn's terms, and it is not the alumni directory,
  which is behind his login and still untouched.

## 2026-10-07

- **Job link on both capture confirm screens.** Asher was capturing a role,
  then opening it in Researching just to paste the posting's address. Each new
  role on the screenshot screen now has an optional Link box, and each ticked
  role on the typed-note screen a "Job link" field; both save to the same
  field the Edit application dialog uses. Not filled by the AI — a screenshot
  rarely shows the address. Roles already tracked get no box.

- **"Couldn't save" on Edit application: migration `20261006000000` was
  never run on the real database.** The dialog always sends "Worth reaching
  out about", whose column that migration adds, so *every* edit failed — not
  only ones touching the toggle. It had been listed as blocked on Asher since
  2026-10-06; this is what it looks like when the app runs ahead of the
  database.

- **821 LinkedIn connections imported** - 796 of them list an employer, which
  is what makes a match possible. Read out of the full
  `Complete_LinkedInDataExport` archive: `unzip -p` streamed only
  `Connections.csv` out of 34 files, so the messages and search history stayed
  packed and unopened. 4 rows skipped, all people whose profiles are now
  restricted and who export with no name.

  Immediately useful. Against the real board the radar found people at eight
  companies, including four at the employer behind the one role sitting at
  Interviewing.

- **Fixed at the first real import: the upsert could not work.** The unique
  index is on `(user_id, coalesce(profile_url, name))`, an *expression*, and
  Postgres will not match an expression index against the plain column list an
  upsert gives it - "there is no unique or exclusion constraint matching the ON
  CONFLICT specification".

  The expression is not incidental: a plain index on
  `(user_id, profile_url, name)` would admit the same person twice whenever the
  URL is null, because SQL treats nulls as distinct, and about a quarter of an
  export has no URL. So the index stayed and the merge moved into code, against
  the same rule. Verified by importing the same file twice: the second run
  added 0 and updated 0.

- **`pbcopy` was mangling the migration files.** It converts using the shell's
  character encoding, which is unset in a non-interactive shell, so it fell
  back to a legacy single-byte Mac encoding: every em dash in the outreach
  migration arrived in the SQL Editor as mojibake. Harmless this time only
  because the mangled characters were all inside comments - inside a string
  literal it would have inserted corrupted data with nothing raising an error.

  Two fixes rather than one, because being careful is not a fix. The documented
  command is now `LC_CTYPE=UTF-8 pbcopy < file`, and **every file under
  `supabase/` is plain ASCII**, so there is nothing left that can be mangled.
  `test/migrations.test.ts` enforces both that and the guards below.

- **That test immediately found something worse: the first migration was never
  idempotent.** `20260827000000_init.sql` created tables, indexes and triggers
  unguarded, so CLAUDE.md's "safe to run twice" was false - and so was the
  header on `supabase/demo/schema.sql`, which concatenates it. Both now use
  `if not exists`, and triggers are dropped before being created, which is the
  only idempotent form Postgres offers.

  Verified rather than asserted: the whole 768-line schema was run a **second**
  time against the demo database. Success, no errors.

- **A caveat that verification exposed.** The schema is idempotent; the *data*
  is not. Migration `20260831000000` carries a one-off `update` moving
  Researching rows to Applied, so re-running the concatenated file against a
  **populated** database empties the Researching column - 5 became 0 on the
  demo. Repaired by re-seeding, and now written down in CLAUDE.md rather than
  left to be rediscovered.

## 2026-10-06

- **"Possibly tracked": near-duplicate roles are asked about, not missed.**
  The bug: one Lenovo role was captured from two sites, once as "AI Strategy &
  Innovation Analyst - Global Future Leaders Program (2027)" and once without
  "Program". The duplicate check needed the title to match exactly after
  ignoring case and punctuation, so the second capture went in as a new
  application with no warning. A scan of all 81 applications found only this
  one pair.

  Now there are two tiers, both in `src/lib/roleMatch.ts` and shared by the
  screenshot and typed-note paths:
  - **Same role**, decided without asking: equal once connecting words ("and",
    "&", "of", "the"…) are ignored as well. "Program" is deliberately *not*
    ignored — "Program Manager" is not "Manager".
  - **Possible match**, asked about: same company, and the titles share at
    least 70% of their words, or one is the other with words added (a site
    shortening the title). Set so that roles which merely share a programme
    name — the three different Lenovo Future Leaders roles — are left alone.
    A different year of the same programme is asked about, not assumed.

  On the screenshot confirm screen a possible match shows "possibly tracked"
  and "You already track … Same role?" with Same role / Different role, and
  nothing saves until each is answered. Same role skips it, or moves a
  Researching one on to Applied (the server looks the id up before moving
  anything). On the typed-note screen the row is unticked already, so it
  carries a warning instead of a blocking question.

  Not covered: company names that differ ("Lenovo" vs "Lenovo Group") are
  still treated as two companies.

- **Outreach radar, first half.** Who you already know at the companies you
  have applied to, and which roles you want outreach for regardless.

  **Migration `20261006000000_outreach_radar.sql` — Asher must run it by hand.**
  It adds `connections`, a **thirteenth** table (flagged), and
  `applications.outreach_wanted`.

  Decisions taken 2026-10-06: connections live in their own table rather than
  Contacts, because several hundred people he has merely connected with would
  bury the five he is actually in conversation with, and none of them belong in
  a follow-up queue. The radar runs **on demand**, not nightly — the Vercel plan
  allows two scheduled jobs and the backup and the demo reset already use both.
  Alumni searching will use **public web search only**: the university's alumni
  portal sits behind his login, and automating a logged-in session there is the
  same terms-of-service and account-risk problem as LinkedIn. Connections are
  **excluded from the nightly backup** — hundreds of real people's names and
  employers do not need to be copied to a GitHub repo, and the export can be
  re-downloaded at any time. **Nothing ever auto-sends.**

  Built: the migration, the CSV parser, `npm run import-connections`, company
  matching, two MCP tools (`outreach_radar`, `who_do_i_know_at`), and a "Worth
  reaching out about" toggle on the application form. Not yet built: the alumni
  web search, message drafting, the demo version.

- **The CSV parser is a parser, not a split on commas.** Real job titles
  contain them — "Director, Product" — and so do names: "Osei, Jr.". Splitting
  on commas shifts every later column by one for exactly those rows, which
  silently files a real person under their own job title as an employer. For
  this feature that is the whole point being wrong, and nothing would throw.
  Verified by reintroducing the naive split and watching the tests fail.

  Also deliberate: the export's email column is read and discarded. Matching a
  company and drafting a LinkedIn message needs no address, and several hundred
  people's email addresses are not worth holding without a reason.

- **Matching reuses `normalizeName`** rather than repeating the rule, and is
  exact-after-normalising rather than fuzzy. "Google" and "Google LLC" stay
  apart on purpose: a near-match that is wrong means an outreach message to a
  stranger at a different company, which costs more than a match that was
  missed.

- `*.csv` added to `.gitignore`. The repository is meant to go public, and a
  file committed once stays in the history after it is deleted.

- 18 tests for the parser and the matching (169 total).

- **The MCP server is connected.** `lanework` added to the Claude desktop app's
  config beside the existing `markitdown` entry, with a backup taken first —
  one misplaced comma in that file costs every preference in it.

- **The demo shows the radar's work, not just its result.** Asher's objection
  to a recorded demo was right: a finished list of three people to message is
  indistinguishable from a hardcoded list of three people, and the interesting
  part of this feature is invisible in its own output.

  So a run records its own steps, and the new **Outreach** tab shows them —
  connections read, compared against the board, gaps noticed, the open web
  searched for those, a draft written for each, with what each step produced
  and how long it took. In the real app that is the honest answer to "what did
  it actually do, and can I trust it". In the demo it is the only way to show
  there is an agent here rather than a page of prepared text.

  The demo replays a recorded run through the same `RadarRun` type and the same
  component the real one uses — not a screenshot of the feature, the feature fed
  a recording. A banner says so. Recorded rather than live for three reasons,
  the third decisive: a live search costs money per visitor, is unpredictable in
  a way a demo should not be, and would be hunting **real people** on behalf of
  a fictional student.

  Alumni leads carry evidence — a source link and what it said. The model is
  being asked to assert that a stranger attended a particular university, which
  is exactly the kind of claim it will invent if nothing holds it to a source.

- **The importer reads the full LinkedIn archive**, since LinkedIn would not
  offer the Connections-only export this time. Given a `.zip` it uses
  `unzip -p`, which streams one named member to standard output and extracts
  nothing — so the messages, invitations and search history stay packed and are
  never opened. The standing "only Connections.csv" rule is now enforced by the
  code rather than remembered. `--dry-run` reports what an import found without
  writing anything.

  Migration `20261006000000` run against the **demo** database 2026-10-06. The
  real database still needs it.

---

## 2026-10-05

- **The public demo is live at lanework-demo.vercel.app.** A second Vercel
  project from this same repository, with `NEXT_PUBLIC_DEMO_MODE=1`, pointed at
  a separate Supabase project in East US holding only invented data. No
  password, a banner saying the data is fictional, and a full sandbox wiped
  back to seed every night at 3am Central.

  Seeded on 2026-10-05: 12 companies, 31 applications across all six stages,
  8 contacts, 17 tasks, 3 habits, 42 days of logs, 4 goals, 45 stage events,
  63 memory rows, 3 weekly reviews. Pages return in about 0.4s.

- **The safety catch was verified against the real database before any of this
  went out.** Running demo mode on the laptop pointed at the real Supabase
  project shows a refusal screen and no data, because the real database has no
  `demo_marker` table. The nightly reset makes the same check before its first
  delete — visible in the logs as a `demo_marker` read ahead of twelve DELETEs.

- **Fixed, caught on the live demo: the sample notes skipped entity
  resolution.** The pre-recorded answers were written in the *resolved* shape
  with every id left null and went straight to the confirm screen. Confirming
  "applied to the climate risk analyst role at Arcadia Climate" would have
  created a second Arcadia Climate beside the one already on the board, a
  second Dana Whitfield, and stage changes attached to no application. The
  confirm screen said "company will be created" for a company plainly already
  there, which is what gave it away.

  This was hard rule 5 — the model answers with names, the server resolves
  them — being bypassed by a code path that skipped the server half. The
  resolution step is now its own exported function (`resolveClassification`),
  and the recorded answers are written in `ParsedClassification`, the shape the
  model itself answers in, which carries no identifiers at all. Only the model
  call is skipped. Resolution happens per request rather than being baked in,
  because the demo's rows change as visitors use it and are rebuilt nightly.
  Dropping the type casts also turned the recorded answers into something
  TypeScript checks, which immediately caught a missing field the casts hid.

- **The commit path is exercised at last** — the open thread since 2026-09-15.
  A sample note was taken all the way through on the demo: confirm screen →
  Commit → a new application on the existing Arcadia Climate company, the
  contact matched rather than duplicated, the companies list still 12, and the
  weekly "send 8 applications" goal ticking from 0/8 to 1/8. Done on fictional
  data that is wiped nightly, so nothing real was touched.

- **Three things the first live demo got wrong, all now fixed.** The Operator
  card introduced the visitor to Asher by name, degree and city — wrong for a
  demo of a fictional student, and more of his own information than a portfolio
  piece should publish; it now reads Jamie Rivera, Calloway University. Every
  calendar event showed five hours early (the 9:30am coffee chat at 4:30am)
  because the feed emitted iCal "floating" times, which are parsed as UTC
  rather than as the same wall clock everywhere; times are now resolved to real
  instants through the app's own day-boundary helper, which also handles the
  daylight-saving changeover. And the top rail offered "Log out" on a site with
  no password screen.

- **The demo's Supabase project was created twice.** Supabase placed the first
  one in Oregon while Vercel serves from Washington DC, so every query would
  have crossed the country. Deleted while still empty and recreated in East US
  (North Virginia). Worth remembering: Supabase's default region is not
  necessarily near the deployment.

- **Tests: 63 → 145, and three real defects found by writing them.** Seven
  test files became eleven. The new ones cover the half of each AI reader that
  runs *after* the model — the part that turns names into rows — plus the
  demo, the Compress windows, and the display layer.

  Every regression test was checked by reintroducing the original bug and
  confirming it fails. A regression test that passes on the broken code is
  theatre, and two of these would have been.

  What the tests found, none of which had been noticed in use:

  1. **The screenshot importer created duplicate companies.** It matched
     company names on lowercase-and-trim alone, while role dedupe and the
     typed-note path both stripped punctuation and collapsed runs of spaces.
     A job board naming "Arcadia Climate." therefore made a second Arcadia
     Climate, where the same text typed as a note matched the one already
     there. Three places needed to agree on what a name is; two did. The rule
     is now exported once as `normalizeName`.
  2. **A cleared Compress window became a one-day window.** `Number(null)`,
     `Number("")` and `Number([])` are all 0, which is finite, which clamped
     up to the minimum — and a one-day window surfaces the whole board at
     once. Not reachable from the sliders, which always send a number, but
     this is the validation for a public route. It now drops anything that is
     not a number or a numeric string.
  3. The sample-note and calendar bugs above, which now have the tests that
     would have caught them.

  `resolveExtractedJobs` is split out as a pure function, matching the split
  made for `resolveClassification`, so both readers' resolution halves can be
  exercised exhaustively without a model call or a database.

  Deliberately still untested: everything in `src/lib/db/`, which is thin
  wrappers over Supabase queries and needs a database rather than a unit test.

- **MCP server: the dashboard can be asked questions from the Claude app.**
  Eight read-only lookups — pipeline summary, applications by stage or company,
  what today holds, what needs attention, contacts and follow-ups, one person's
  conversation history, one role's stage history, and full-text search over
  Brain. Nothing it does can change a row. Setup is in `docs/MCP.md`.

  **A flagged departure from launch list item 4,** which says "connected to the
  Claude app as a custom connector". A custom connector is a server at a web
  address, and the Claude app's connector screen only offers OAuth sign-in —
  there is no field for a plain token. Standing up an OAuth authorisation
  server, for one user, in front of every application and contact, is a large
  piece of security-sensitive machinery and the one place where a single
  mistake would expose everything at once. This runs on the laptop over stdin
  and stdout instead: nothing listening on a port, nothing reachable from
  outside, no second copy of the credentials. The cost is that it does not work
  from a phone.

  The lookups live in `src/lib/mcp/tools.ts` and know nothing about how they
  are reached, so the hosted version is a second thin wrapper beside
  `scripts/mcp.ts` rather than a rewrite — and so is a write tool, which would
  wrap the same `/api` routes the browser already posts to.

  They also reuse `src/lib/db` rather than querying separately. Two ways of
  reading the same rows would drift, and then the Claude app and the dashboard
  would disagree about the same question — worse than either being wrong,
  because nothing would say which.

  Verified by driving the real protocol against the real database: the
  handshake, all eight tools listed with their schemas and a read-only
  annotation, every tool called, and the two-step chain a model actually makes
  (list applications, then ask one for its history). Zero stray writes to
  standard output, which would silently corrupt the protocol.

- **Fixed during that: a failed lookup said "[object Object]".** A Supabase
  error arrives as a plain object with a `message`, not an `Error`, so
  `String(err)` produced nothing useful — the same failure `describeError` was
  written for on 2026-09-16, in a different place. It now uses that helper. A
  malformed application id also reads as "that is not an application id" rather
  than as a failure, because asking about something that does not exist is a
  question, not a fault.

---

## 2026-10-03

- **The nightly backup had never once run. Fixed — it has now written its
  first file.** The job had been failing silently every night since the backup
  repo was set up on Oct 1, and nothing anywhere said so.

  The cause was not the token, the schedule, or the repo. Vercel's project
  settings listed `GITHUB_BACKUP_TOKEN` and `GITHUB_BACKUP_REPO`, but at least
  one of them reached the running job empty, so the job threw
  "GITHUB_BACKUP_TOKEN and GITHUB_BACKUP_REPO must both be set" at the very
  last step — after it had read all twelve tables and built the file. The
  giveaway in the log was that the run made twelve calls to Supabase and *zero*
  to GitHub. Re-entering both values with Production selected, and redeploying,
  fixed it.

  First successful run, by hand on 2026-10-03: `backups/2026-10-03.json`,
  commit `9ca2fc8`. 53 companies, 56 applications, 5 contacts, 32 tasks,
  3 habits, 7 daily logs, 53 captures, 68 memory rows, 3 weekly reviews,
  4 goals, 60 stage events, 0 user_settings (no Compress slider has been
  moved yet, so that row does not exist — expected, not a fault).

- **Known, not fixed: a failed backup tells nobody.** The job returns a 500 and
  logs the reason, but nothing surfaces it — no email, nothing on the
  dashboard. That is exactly how three nights were lost without a sign. Vercel's
  free plan keeps logs for about an hour, so by morning the evidence is gone
  too. Flagged to Asher; a visible signal is worth building before the repo
  goes public.

- **Demo mode built — the code half of the public demo.** One switch,
  `NEXT_PUBLIC_DEMO_MODE=1`, meant for a second Vercel project built from this
  same repository and pointed at a separate Supabase project holding only
  invented data. It opens the site with no password (the approved exception to
  hard rule 2, confined to two lines in `src/middleware.ts`), and switches off
  login alert emails, the nightly backup and the live calendar feed.

  **The safety catch is a marker table, not a URL check.** The demo refuses to
  render a page or delete a row unless the database answers to a `demo_marker`
  table that only the demo setup file creates. The mistake worth defending
  against is an environment variable copied between two projects built from one
  repo — so the URL cannot be the thing that detects the mistake. Pointed at
  the real database, the demo shows a refusal screen and the nightly reset
  stops before deleting anything.

- **The demo is a full sandbox, wiped nightly.** `/api/cron/demo-reset` at
  08:00 UTC deletes every row in the twelve tables and writes the seed back, so
  visitors can drag cards, tick habits and add companies without inheriting the
  last visitor's mess. Three locks: demo mode on, `CRON_SECRET` correct, marker
  present. Both Vercel projects share `vercel.json`, so each declines the job
  that is not its own — the backup refuses in demo mode, the reset answers 404
  outside it.

- **Seed data is generated, not fixed.** Jamie Rivera at Calloway University,
  targeting climate, energy, data & AI and product: 31 applications across
  every stage, 12 companies, 8 contacts, 17 tasks, 3 habits ticked unevenly
  over six weeks, goals part-met, two sealed weekly reviews and a live one, and
  a Brain assembled from all of it. Every date is relative to today, so a
  visitor in March sees a search in progress rather than a board that stopped.
  The same definition seeds the first time and restores every night.

- **Capture bar: four sample notes answered from a recording, free and
  instant**, with anything typed going to the live model behind a shared cap of
  25 calls a day for the whole demo — then "Demo limit reached — try a sample
  note." The count lives in the database, incremented and read in one SQL
  statement, because the demo runs as several instances and an in-memory tally
  would quietly become 25 per instance. Fails closed if the counter is
  unreachable. The cap covers the screenshot reader, the Priorities rationale
  and the review draft too, not just typed captures.

- `supabase/demo/schema.sql` — all six migrations concatenated in order plus
  two demo-only tables, for creating the demo's Supabase project in a single
  paste. Generated by `scripts/build-demo-schema.sh`, not hand-written. Not yet
  run anywhere.

- **Two demo-only tables, flagged as a scope departure.** `demo_marker` (the
  safety catch above) and `demo_ai_usage` (the daily allowance). They live in
  `supabase/demo/demo_tables.sql`, never in `supabase/migrations/`, so the real
  database has never had them and never will — which is precisely what makes
  the marker mean something.

- **Fixed: a test that failed about one run in sixteen.** "A cookie with any
  character changed is rejected" changed only the last character, swapping "A"
  for "B". The session signature is 32 bytes, which base64url encodes as 43
  characters, and the last of those carries only four meaningful bits — the
  other two are padding that decoding discards. So the final character is
  always one of the sixteen whose index is a multiple of four, and when it
  happened to be "A", changing it to "B" moved nothing but a padding bit: the
  bytes decoded identically, the cookie correctly verified, and the test called
  it a failure. Measured at 132 failures in 2000 cookies — 6.6%, which is 1/16
  to the decimal. The authentication code was never wrong. The test now walks
  every position in the cookie and steps four places along the base64 alphabet,
  which changes a real bit wherever it lands, so it is both deterministic and a
  far stronger check than the one it replaces.

---

## 2026-10-01

- **Fixed before it ever ran: the nightly backup skipped two tables** —
  application stage history and the Compress settings, both added after the
  backup was written. A restore would have brought back every application with
  none of its history. The backup has still never run (no destination yet).
- Migration `20261001000000` (Brain records hand-made CRM changes) applied by
  Asher.

- **Eval suite for the AI readers (`evals/`), built but not yet run.** 14
  notes and 3 screenshots, each with the structural answer a correct reading
  must contain, scored into a dated report. `npm run eval` only lists the cases;
  `npm run eval -- --run` makes the 17 model calls. To test without touching
  real data, both readers now accept the CRM rows as an argument (the app still
  loads them from the database exactly as before) and the suite passes a
  fictional CRM.

- **Goals, habits, follow-up snoozes and card drags respond instantly.**
  Ticking a manual goal or snoozing a follow-up used to wait for the server
  and then a full page refresh. Both now change on screen first and save
  behind it, the Priorities pattern: your value holds until the server's own
  data agrees, and a failed save puts it back and goes to the error banner.
- **Fixed: a dragged card could flash back to its old column.** The board
  dropped its "this card is now in Interviewing" hold the moment the save
  returned — before the refreshed board had arrived — so for an instant the
  old board was drawn again. The hold now lasts until the server agrees.
- **Activity chart: one shared line.** Task bars rise from it and pipeline
  moves hang below it; the strip of moves is dropped entirely in a window with
  none. Previously two baselines with a gap made bars appear to float on days
  without a move. (Agreed 2026-09-09.)

- **A note can report several pipeline moves.** "Rejected from X, interview
  at Y" used to keep only one of the two — the classifier had a single slot
  for stage changes, the last single slot left after tasks and applications
  were made plural for the same reason. It is now a list, and the confirm
  screen shows one tickable row per move. **Scope departure, flagged and
  approved by Asher:** the scope defines `suggested_stage_change` as one
  object. Every move is checked against a real application before any is
  applied. Not yet exercised against the live model.
- **Brain records changes made by hand** (Asher's ask, Sep 29): an
  application, contact or company added by hand; the resume screen ticked or
  unticked; an application or contact deleted. Shown as **CRM** entries.
  Anything added through the capture bar is not logged twice — the capture's
  summary already covers it. **Needs migration `20261001000000`**, run by
  hand; until then these entries are refused by the database and logged as
  server errors, and nothing else is affected.

## 2026-09-29

- **Capture bar takes up to five screenshots at once.** Attach, pick several
  in the file picker, or paste — each gets its own chip and ×. They go to the
  reader in one request, and a listing that appears in two of them comes back
  once. Images are shrunk to 1568px on the longer side before sending: the
  model scales anything larger down to that anyway, and a single full-size
  Retina screenshot could already exceed Vercel's 4.5MB request limit.
- **The screenshot reader accepts "application received" emails** (Asher's
  Option A). A StepStone confirmation email was turned away because the reader
  was told to read job-board pages and skip everything else. Rejection and
  interview emails are still skipped on purpose — they move an existing
  application, which the text capture does — and the "nothing found" message
  now says to paste those as text.
- **Applications board shows 10 cards per column**, newest first by when the
  card arrived in that column (previously: most recently touched, so any edit
  jumped a card to the top). "Show all N →" opens the whole column as a
  searchable list; clicking a row opens the editor. A card you drag in sorts
  to the top immediately rather than waiting for the server.
- **Application link.** The existing "Job posting URL" field moved up the
  form, was renamed, and has an "Open ↗" button; cards with a link show a ↗
  that opens it without opening the editor. Only http/https links are ever
  made clickable.

- **Fixed: the capture bar's own messages had no way to close them.** "No job
  listings were found in that screenshot" (and the other messages the bar shows
  about its own input) sat above the bar until the next capture. They now have
  a ×. The main error banner always had one; this was the one message that
  didn't.

- **First deploy.** The project now lives in a private GitHub repo
  (a private GitHub repo) and Vercel builds the live site from it on
  every upload. A production build, the tests and the type check all passed
  beforehand. The password, the signing secret and the nightly-backup secret
  were generated as random values straight into `.env.local` and copied into
  Vercel from there — none was ever shown in a chat.
- **Kept out of the repo on purpose:** the personal recruiting-status doc, so
  the repo can be made public later as a portfolio piece without it ever
  having been in the history. It stays on the laptop.
- **Not yet set up:** the nightly backup has no destination (no backup repo,
  no key), so the cron will answer "not configured" until it does. Your data
  is still in Supabase; the backup is the second copy.

## 2026-09-26

- **Fixed: a card stayed faded after being dragged to another column.** The
  board fades a card while you drag it and un-fades it when the browser says
  the drag ended. But a card dropped into a new column is redrawn there as a
  new card, and the "drag ended" signal goes to the old one, which is already
  gone — so the fade never lifted. Seen on a rejected card after it was dragged
  to Archived and back to Rejected. The fade is now also cleared on drop. It
  only ever affected the look; the move itself saved correctly, and a page
  reload always cleared it.

## 2026-09-16

### Fixed: no new application could be saved before the Sep 15 migration
A screenshot import of one role failed with *"Couldn't add those roles —
capture.confirmJobs failed: [object Object]"*.

**The cause was introduced on Sep 15.** Every new application was saved naming
the new Job/Grad school and reminder fields, which only exist once migration
`20260915000000_researching_and_reminders.sql` has run. It had not, so every
new application failed — screenshot imports, notes that log an application,
and the + Add form alike. The Sep 15 hand-off said the new *features* would
wait on the migration; it did not say existing ones would break. They should
never have depended on it.

- A new application now names those fields only when it uses them (a grad
  school program, or a reminder). A plain job saves either way.
- Editing an application sends Job/Grad school only when you changed it, for
  the same reason.
- The "applications submitted" count behind goals (and the Compress progress
  line) also asked the database to filter on Job/Grad school, so it silently
  read 0 before the migration. It now counts correctly either way.
- The failed attempt had already created the company (Procter & Gamble) before
  the application was refused. It was reused, not duplicated, when the import
  was retried — the retry went through and the role is on the board.

**And the message itself was the second bug.** Database errors arrive as a plain
object rather than an error, and the banner turned that into "[object Object]".
It now shows the database's own words — here, that the `kind` column does not
exist — and, when the cause is a missing column or table, says a migration has
not been run and points to `supabase/check_migrations.sql`. This applies to
every failure reported to the banner, not just imports.

Still waiting on that migration until it is run — these are new, so nothing
you used before is affected: reminders on the calendar, the Compress sliders
saving, Researching itself, and marking something Grad school.

---

## 2026-09-15

### Researching is back — as roles you plan to apply to, with a reminder
**Requires migration `20260915000000_researching_and_reminders.sql`.**
**Scope amendment — see `docs/Dashboard_Scope_v1.md`.**

Researching was removed on Aug 31 because a column of roles you were merely
considering turned into upkeep. It returns with a narrower job: holding roles
you intend to apply to *by a date*, so due dates stay visible and the pipeline
keeps moving.

- **The board** has a Researching column first. Each card shows its reminder
  and deadline ("APPLY OCT 5 · DUE OCT 15"); the deadline turns red in the last
  two days and reads "Missed" after.
- **The application form** has a "Remind me to apply on" date for Researching
  roles. Typing a deadline fills it in ten days before, until you set it
  yourself.
- **The Home calendar** draws an "Apply" entry on each reminder day and a
  "Due" entry on each deadline, beside your Google events. Clicking one opens the
  board. Both disappear once the role moves to Applied. They live only in the
  dashboard for now — putting them into Google Calendar waits on the Google
  write access.
- Moving a role from Researching to Applied stamps today as the applied date and
  counts toward your applications goal, as it always did.
- **The resume pass rate** leaves Researching roles out again, since they were
  never sent.
- **The Timeline** does not count adding a role to Researching as a pipeline
  move. Its move to Applied counts.

### Job or grad school
Every application is now marked Job or Grad school (the university goes in
Company, the program in Role). The board has an All / Jobs / Grad school filter,
and grad cards carry a GRAD chip. Grad programs are kept out of the resume pass
rate, which is now labelled "· jobs", and out of the "applications submitted"
goal. The board's stage counts follow the filter; the pass rate does not.

### Compress: four sections, and windows you can slide
Compress was two fixed lists: applications and contacts quiet for 30 days. It is
now four:

- **Reminders ignored** — Researching roles whose reminder came and went. It
  comes back 3 days after the reminder by default, but never later than 2 days
  before the deadline. Buttons: **Applied**, **Snooze** (3 days, never past the
  day before the deadline) and **Drop** (archives it). A passed deadline shows
  as Missed. The section opens with *"Applications this week: 2 of 5 · 4
  reminders ignored"*, using your weekly applications goal when one is set.
- **Stale tasks** — every open task, dated or not. A task with a due date shows
  once it is 7 days past it; a task with no due date shows 7 days after it was
  added. One slider covers both. **Done**, **Push 7d** (for an undated task,
  **Due in 7d**, which gives it a due date a week out) and **Delete** (asks
  "Sure?"). First built for dated tasks only; Asher asked the same day for
  undated ones to count too, by how long they have been open.
- **Applications quiet** and **Contacts quiet** — as before. A Researching role
  with no dates at all is judged here, by how long it has sat untouched.

A **Windows** panel at the top holds one slider per section, plus an **All
windows** slider that sets every section to the same multiple of its default
(×0.25 to ×3) — narrower for a sprint, wider for a slow week. The lists
re-filter as you drag, with nothing sent to the server. The values save a
moment after you stop and are kept in a new `user_settings` table, so they
follow you to another device once the app is online.

### The capture bar can set up reminders
**Notes.** "Remind me to apply to the analyst role at Rhodium, due Oct 15" now
proposes a Researching role rather than a task, and one note can hold several.
The confirm screen gives each role a Type, a Deadline and a reminder: 10 days
before (default), 1 week, 2 weeks, or a specific date — shown as the actual
date before you commit. With no deadline the same choices count from today.
Saying "applied to X" for a role already in Researching is offered as the move
to Applied.

**Screenshots.** The reader now picks up each listing's deadline ("Apply by Oct
15") or its age ("Posted 3 weeks ago"). The confirm screen **will not commit
until you choose** *Already applied* or *To apply* — the AI is deliberately not
asked to guess, since the two kinds of page look alike and mean opposite things.
- *To apply*: every role lands in Researching. One "remind me N days before"
  control covers the batch, and each row's deadline and reminder can be edited.
  A listing with only a posting age gets a reminder 14 days after it was posted
  (or today, if that has passed), marked **est.**
- *Already applied*: as before, plus a listing already in Researching is moved
  to Applied instead of being skipped as a duplicate.

### Fixed: screenshot imports were logged to Brain as "added to Researching"
Since Aug 31, screenshot imports landed at Applied but wrote a Brain entry saying
"added N roles to Researching". The entry now names the stage the roles actually
landed in. Entries already written still carry the wrong word; they have not
been edited.

### Fixed: the setup check could report a missing table as present
`npm run check` asked each table for a head-only count. For a table that does
not exist, that request can come back with no error, so a missing table read as
fine. Found by checking for the new `user_settings` table before the migration
had run. It now asks for zero rows, which fails properly. The check also covers
`application_events` and `user_settings` now.

---

## 2026-09-14 (later)

### A password screen, ahead of putting the dashboard online

**Scope amendment — see `docs/Dashboard_Scope_v1.md`.** The scope cut login
from v1 on the assumption the app stayed on one laptop. Deploying it would put
every contact, note and application on a public address, and put the capture
bar — which spends Anthropic credit — in front of anyone with the link. Asher
approved a single shared password.

- **Every page and every API route is behind it.** Pages send you to a bare
  login screen and bring you back to where you were going afterwards; data
  requests answer "not signed in", which the error banner reads out, so a login
  that expires mid-use says so rather than failing silently.
- **One password, remembered for 30 days per browser.** The login screen is a
  real form with the hints phone password managers need to save and fill it.
- **Log out** in the top rail signs out *this* browser. Changing `APP_PASSWORD`
  (or `AUTH_SECRET`) in Vercel and redeploying signs out *every* device at once.
- **Fails closed.** A deployed copy with no password configured refuses to
  serve anything. Only `npm run dev` on your own machine runs without one, so
  nothing about local use changed.
- **Two routes stay outside, each with its own check:** the login endpoints
  themselves, and the nightly backup, which Vercel's scheduler calls without a
  cookie and which already refuses anything lacking `CRON_SECRET`.
- A wrong password waits about a second before answering, which makes guessing
  slow. It is not a lockout; a long passphrase is what actually protects this.

Nothing is stored server-side: the cookie carries a signed expiry, checked on
every request. Tests cover a tampered cookie, a pushed-back expiry, an expired
cookie, and a password or secret change invalidating existing cookies.

### An email every time someone logs in

Each successful password entry sends an email with the time, the device and
browser (iPhone · iOS 18.6 · Safari 18.6), an approximate location from the
network address, and the address itself — plus what to do if it was not you.
It fires on *entering the password*, not on every visit, so a browser that stays
logged in does not email again.

Sent through Resend's free plan, which with no domain of your own delivers only
to the email on your Resend account — exactly the one recipient this needs. The
email is sent *before* the login finishes, so the app knows whether it went; if
it did not, you are still let in, and the error banner says no alert was sent.
Login alerts that stop arriving silently would be worse than none.

Device and location are what the browser and Vercel report. They describe an
honest login well and a deliberate intruder poorly — a browser can claim to be
anything — so read the email as "does this look like me?".

---

## 2026-09-14

### Logged conversations can be deleted, and "last contacted" rolls back

Until now a conversation logged against the wrong person — or logged by
accident — was permanent: no button, and nothing on the server to support one.

You can now delete a conversation from two places:

- **The contact's edit form**, which gains a Conversations list at the bottom:
  every conversation logged with that person, newest first.
- **Brain**, in the detail panel, when the selected entry is a conversation.
  Only conversations get a Delete there — everything else in Brain describes
  something the app did (a stage change, a completed task) and is undone at its
  source, not by erasing the line.

Both ask once ("Sure?"), remove the row instantly, and report to the banner if
the delete fails. A delete is immediate — it does not wait for the form's Save.

**The rollback rule.** If the deleted conversation is the one that set the
contact's current "last contacted" date, the date moves back to the most recent
conversation still on record, or clears if none remain. If the date came from
anywhere else — a later conversation, or a date typed into the contact by hand
— it is left alone. The date is worked out from the history that remains rather
than from a stored "what it was before", because a stored value can point at a
conversation that has itself since been deleted. The rule lives on its own in
`src/lib/touchRollback.ts` with seven tests, including out-of-order deletes.

With the contact form open, the Last contacted field updates to the rolled-back
date on its own, so pressing Save afterwards cannot write the old date back —
unless you had already typed into that field, in which case your typing wins.

**Known limits, deliberately not guessed at:**

- If you delete someone's only conversation and had typed a last-contacted date
  by hand *before* logging it, that earlier date is not recoverable — nothing
  recorded it. The field clears; re-enter it.
- Logging a conversation also cleared or set the follow-up reminder, un-marked
  the contact as dormant, and bumped the company's last-touched date. Deleting
  the conversation does not undo those — their previous values were never
  stored, so any restore would be invented.
- A conversation that came in through the capture bar also left the raw note in
  Brain as a Capture entry. That stays; deleting captures is still unbuilt.

---

## 2026-09-10

### The calendar slides between weeks

The Home calendar was pinned to the current week with no way off it. It now has
‹ › arrows, a **Today** button that appears only once you have moved, and a
plain-words label beside the date range — "This week", "Next week", "3 weeks
ago" — so you always know where you are looking.

Moving between weeks costs no network at all. The page now loads every event
six weeks either side of today and hands the whole band to the browser, which
re-slices it on each arrow press. That is free: the iCal feed is a single
download of the *entire* calendar however narrow the window asked for, so
requesting thirteen weeks instead of one adds no fetching — only the events
themselves travel to the browser. The arrows stop at the edge of the band and
say so; `CALENDAR_BAND_WEEKS` in `src/lib/constants.ts` widens it.

Making the card interactive meant it had to run in the browser, and it was
importing its types and colours from `src/lib/calendar.ts`, which is
server-only — that module holds the feed URL and must never reach the browser.
The event shape moved to `src/lib/types.ts` and the kind labels and colours to
`src/lib/display.ts`, which is where labels already live. `calendar.ts` now
holds only the parsing.

### Note: scheduling from the capture bar is not a phrasing problem

"Schedule chat with Matt Panzella for Monday at 2pm" became a task rather than
a calendar entry. That is not the classifier misreading it: the classifier has
four outputs — tasks, applications, contact touches, stage changes — and none
of them is an event, so a task was the only thing it could produce. Underneath
that, the calendar is connected by its secret iCal address, which is a
subscription and read-only by design. Nothing in the dashboard can write to
Google Calendar today. See the scope doc, which anticipated this: "Write-back /
full Calendar API is a possible later upgrade, not v1."

---

## 2026-09-09 (later)

### Every failure now surfaces in one banner, on whatever screen you are on

Each card used to keep its own error message. That works while you are looking
at the card — and the dashboard is built to *stop* you having to look at it,
because clicks apply locally and the network catches up behind them. So a
failed write could land after you had scrolled past the card or changed tabs:
the optimistic change quietly rolled back, and the explanation rendered
somewhere you were not.

There is now a single banner, fixed just under the top rail, above everything
including dialogs. It says what you were doing (*"Couldn't delete TikTok"*),
the reason as the server or browser gave it, and which screen it happened on —
which matters, because you may have left. It does not expire; it waits for the
× . No retry button: repeating a write whose outcome you cannot see is how a
thing gets done twice. Up to four stack; a fifth pushes the oldest out.

Form validation deliberately did **not** move. "Name is required" belongs
beside the field, not at the top of the screen.

The list is kept in the browser's per-tab session storage rather than in the
page. Two simpler versions were tried first and both lost the banner when you
changed screens — React state went when the layout's client children remounted,
and plain module state went because each route ends up with its own copy of the
module. Storage is the one place every copy agrees on. It clears when the tab
closes.

### The CRM tab was forcing a full page reload

The top rail's CRM link pointed at `/crm`, which is a server-side redirect to
`/crm/applications`. A redirect met during an in-app navigation makes Next.js
give up and do a full browser page load — the slowest kind there is, throwing
away everything the browser was holding. It now links straight to
`/crm/applications`; `/crm` still redirects for anyone typing the bare address.
Found while chasing the banner; it was making every trip to the CRM slower than
every other tab.

### A failed tick no longer leaves an Undo behind

In the task list, ticking a task pinned the row so the Undo stayed reachable.
If the write then failed, the pin stayed too — offering to undo something that
never happened. The pin is now dropped along with the change.

---

## 2026-09-09

### Anything you add to the CRM can now be removed from where you see it

Every CRM row has its own **Edit** and **Delete**, shown when you hover it.
Both already existed; neither was findable. Delete lived inside the edit
dialog, reached by clicking a row title that looked like plain text — so in
practice nothing in the CRM could be deleted without knowing where to look.

How hard it asks depends on what goes with it. A task or a contact leaves
alone, so a second click on the same button is enough; it cancels itself after
five seconds so a forgotten "Sure?" cannot be hit by accident. A company drags
its applications down with it, and an application drags its stage history, so
those open a dialog that says so, with the real counts: *"Deleting TikTok also
deletes 2 applications filed against it, and their stage history."* A
consequence you cannot see is not one you can consent to.

Applications get a note in the confirm pointing at Archived, which takes a role
off the board without losing the record.

### Ticking a task in the CRM no longer loses the undo

The task list filters to Open by default, so completing a task made it stop
matching and vanish — taking with it the checkbox that would have undone the
tick. The only way back was knowing to switch the filter to Done.

A task whose status you change now stays pinned in the list for as long as you
are on the page, whatever the filter says, tinted faintly green and carrying a
spelled-out **Undo**. Unticking the checkbox always did the same thing; a
checkbox just does not announce itself as the way back.

### Deleting and completing feel instant

Both apply locally the moment you click and let the network catch up behind
them, the same way the Priorities card does. The guard is the same too: the
local value wins until the server independently reports the same thing, so a
refresh already in flight when you clicked cannot undo the click. If the write
fails, the row comes back and the error says why.

---

## 2026-09-04

### Every stage an application passes through is now kept
**Requires migration `20260904000000_application_events.sql`.**

`stage_changed_at` held one value — the latest transition — and forgot the one
before it, so "applied Aug 12, screened Aug 30, rejected Sep 4" collapsed into
"changed Sep 4". Every change was narrated into Brain as prose, which reads
well but cannot answer how long a role sat in Applied.

There is now an `application_events` table: one row per transition, including
the submission itself, with from-stage, to-stage and a timestamp. This is an
eleventh table, which the locked scope did not have — an application's history
is a list, and a column that holds one value cannot hold a list.

The migration backfills what can honestly be recovered: the submission date,
and the arrival at the current stage. Anything in between was never recorded
structurally and is not invented.

### A timeline of what you have been doing
**Review → Timeline.** Daily stacked bars of completed tasks by category, with
a separate strip beneath for pipeline moves — deliberately not stacked
together, because effort you spent and results that arrived are different units
and adding them produces a number that means nothing. 30 / 90 / 180-day
windows, a hover tooltip per day, a table view, and a dated detail list below.

Review gained sub-tabs (Weekly / Timeline) rather than the app gaining a fifth
top-level page: the scope fixes four, ordered by how often you visit them, and
looking backwards belongs together.

### Category colours were rebuilt as a chart palette
The old set borrowed the theme's lane and status tokens. It looked right as
chips and failed as adjacent fills: interview-prep and informational sat at
ΔE 5.6 in *normal* vision — indistinguishable to full-colour readers, never
mind colourblind ones — and admin and other were effectively grey.

Replaced with a validated seven-hue categorical palette, checked against this
app's dark panel surface for lightness band, chroma floor, colourblind
separation (worst adjacent ΔE 8.4), normal-vision floor (19.3) and contrast.
The same colour is used in both places, so a category means one thing wherever
you meet it — chips render it as a 15% tint, the chart at full strength.

### Fixed: the capture bar opened at full height
Every page load left the box at its 168px maximum while empty. The textarea is
`flex: 1 1 0%`, so the intrinsic-size pass behind `scrollHeight` laid it out at
a width of zero, the placeholder wrapped to one word per line, and it measured
about a thousand pixels. It now never measures an empty box — there is nothing
to fit, and the CSS minimum is the collapsed state.

Introduced on 2026-09-02 with the growing text box and missed because that was
verified by typing into it, never by loading the page and looking.

---

## 2026-09-03

### The classifier can now log conversations, not just tasks
**Requires migration `20260903000000_contact_touches.sql`.** Run it before
logging anything, or the conversation note is silently dropped.

A capture saying "I reached out to three people today" was read correctly —
the classifier even labelled it CONTACT UPDATE — and then proposed three tasks
to go and contact them. It was not a misreading. The classifier could propose
exactly five things (companies, contacts, tasks, applications, a stage change)
and none of them meant *"this already happened."* Having understood the note,
it had to describe it with the only vocabulary available, and a task was the
nearest fit.

There is now a sixth output: a contact touch. The prompt draws the line by
tense — "I reached out to three people" is three touches; "I need to reach out
to three people" is three tasks; never both for the same interaction.

Confirming a touch does three things at once, because they are one event: the
contact's `last_contacted_at` moves, an optional reminder is set, and the note
becomes a dated entry in Brain attributed to that person. Logging a touch for
someone new creates them — you cannot have spoken to a person who does not
exist.

The note goes to Brain rather than being appended to `contacts.notes` so each
conversation is dated, searchable, and attributable, the same treatment stage
changes and completed tasks already get. `contacts.notes` stays what it was:
standing facts about the person.

### Log a conversation by hand
A **Log** control on each contact row opens a note field and a follow-up
picker (3 days / 1 week / 2 weeks / 1 month / none). Same endpoint as the
capture path — one meaning, one code path. Most conversations do not get
narrated into the capture bar.

### Follow-ups surface on Home
A card under Operator listing people whose follow-up date has passed, with
**Log** and **+1w** on each. Deliberately narrower than Compress: only explicit
dates you set, not everyone who has gone quiet for 30 days. Compress is a
triage session you sit down for; this is a short list of promises you made to
yourself, on the page you actually look at. The card hides entirely when
nothing is due — an empty state seen daily stops carrying information.

### A changelog
This file. Backfilled from the build sessions.

---

## 2026-09-02

### Capture bar became a growing text box
It was a single-line input, so a long note scrolled sideways out of view and
editing the middle of it meant hunting blind. It now starts at one line, grows
downward as you type, caps at eight lines and scrolls inside itself past that.
The bar grows upward from the bottom, so the dashboard never shifts. Widened
from 760px to 900px.

**Keys changed:** Enter now makes a new line. **⌘Enter sends.** Enter used to
send, which was fine for one-liners and dangerous for a three-application note
— firing off half a capture costs a model call and a dialog to dismiss.

### Captures can propose several applications at once
A note saying "I applied to the AI PM intern and the PGC PM intern" was read
correctly and then truncated to the first role. The classifier had exactly one
slot for a new application. It is now a list, the confirm dialog shows each
role with its own tick, and dedupe runs per-role so two identical rows in one
submission cannot both land.

### Task categories are filterable and colour-coded
A category chip in the Type column plus an "All categories" dropdown. Colours
are drawn from tokens already in the theme rather than seven invented hues —
outreach borrows the peripheral lane's gold, informational follow-ups the
secondary lane's teal — so the chips do not compete with the lane badges beside
them.

---

## 2026-09-01

### Goals can be edited and deleted
Hover a goal for a `⋯` control: description, target, lane, and how it is
counted, with Delete. Deleting is deliberately not the same as ticking a goal
off — a goal you abandon should leave no trace, where marking it done records
an achievement that never happened.

### Manual and counted goals now look different
Only a "tracked by hand" goal can be ticked. One with a metric counts itself
from your real records, so a checkbox would be a lie — clicking could not turn
4 applications into 40. Both rows previously looked identical, so the counted
one just seemed broken. Manual goals now show a real checkbox; counted goals
show a dashed ∑ with a tooltip naming what feeds it.

### Captures can propose several tasks at once
Same single-slot bug as applications, found first. A note listing three things
to do was classified correctly and committed as one. The classifier is now told
a note listing three actions produces three entries, "never collapse them into
one, and never stop after the first."

---

## 2026-08-31

### The Researching stage was removed
Applications now run Applied → Interviewing → Offer → Rejected → Archived.
Tracking roles you were only considering meant hand-maintaining a column of
maybes, which is the opposite of low-friction capture. Screenshot imports land
in Applied, which is honest because they come off a job platform's own Applied
tab. The resume pass rate's denominator became every application, since there
is no longer a pre-submission stage to exclude.
Migration: `20260831000000_drop_researching_stage.sql`.

### Habits can be renamed, retired, and deleted
There was no way to remove one at all. Hover a habit for a `⋯` control.
Retiring hides it and keeps every past day's record; deleting is offered only
when the habit has never been completed, because daily logs key their records
by habit id and deleting a used one would rewrite history. Retired habits
collapse into a "Retired (n)" section with Restore.

**Fixed same day:** the first version counted ticking-then-unticking as
history, so two stray clicks permanently blocked deleting a habit added by
mistake — exactly the case delete exists for. Only an actual completion counts.

### Tasks got a real completion control and a full list
Completing a task previously meant clicking the rank number, which looked like
decoration. The number now turns into a green tick in a bordered box on hover.
Added "Show all (n)" to expand the Priorities card in place, and a **Tasks**
sub-tab under CRM with Open/Done/All, lane, and search filters.

### Undo for completed tasks, and history that retracts
Completing a task made it vanish from the Priorities card with no way back.
There is now a "Done today" section listing the three most recent completions,
each with its own Undo, plus "+n more today →" linking to the Tasks tab. The
just-completed row keeps a green highlight briefly.

Reopening a task now also deletes the "Completed: …" line it wrote into Brain.
An accidental tick should leave no record claiming work that was not done.

**Fixed same day:** the undo was first placed inside the "has tasks" section,
so completing your *last* task flipped the card to its empty state and took the
undo with it.

### Dialogs stopped rendering inside cards
The habit editor opened clipped and squeezed into the 316px left column.
`.panel` uses `backdrop-filter`, which makes an element a containing block for
`position: fixed` children — so a modal inside a card anchored to the card
instead of the page. Every dialog nested in a card had this. All dialogs now
render through a portal into `<body>`.

---

## 2026-08-27 — initial build

Built to `Dashboard_Scope_v1.md` in the order specified there: foundation,
mockup port, CRM, capture pipeline, Home cards, Compress/Review/Brain,
screenshot import, backup cron.

- **Foundation.** Next.js 15, TypeScript strict, Tailwind v4 with the mockup's
  Nocturne palette restated in oklch. Supabase schema for all ten tables, RLS
  denying the browser everything, service-role access server-side only.
- **Four pages** ported from the Claude Design mockup: Home, CRM, Brain, Review,
  plus the floating capture bar.
- **CRM** — companies, contacts, and an applications kanban with drag-between
  -columns stage changes.
- **Capture pipeline** — typed notes and pasted screenshots, both classified by
  Claude and both gated behind a confirm step. The classifier is never asked
  for a database id; it answers with names, which are resolved server-side, so
  it cannot invent a record that does not exist.
- **Home cards** — Operator, habit tracker with streak, week/month goals,
  deterministic top-three priorities with a cached AI "why today", and a
  read-only calendar week from an iCal feed.
- **Brain** — Postgres full-text search over everything that has happened.
- **Review** — the weekly document with a cached auto-draft and a seal.
- **Backup** — a nightly Vercel cron exporting every table to a private GitHub
  repo. Written but not yet running; it needs a deploy.

### Setup fixes from the same period
- Node 22 installed via nvm; `~/.bash_profile` now loads `~/.bashrc` so the
  terminal actually sees it.
- `npm run check` added — verifies the Supabase and Anthropic credentials are
  present, well-formed, and accepted, and that all ten tables exist. It never
  prints a key.
- Support for `ANTHROPIC_WORKSPACE_ID`, for identity-linked API keys that must
  name a workspace on every request.
- The migration grants the server role its own table privileges explicitly, so
  Supabase's "Automatically expose new tables" setting can safely be turned off.
- Layout no longer breaks in a narrow window: below ~1024px the left rail
  stacks, the version stamp and clock date drop away, and the calendar week
  scrolls sideways inside its own box rather than crushing seven days into
  slivers.
