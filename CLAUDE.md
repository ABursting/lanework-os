# Lanework OS — recruiting dashboard

A single-user, AI-native operating system for Asher Burstin's post-grad job search.
Deployed, password-gated, and in daily use; a public demo runs on fictional data.

**Read this before doing anything.** It is the standing briefing for every session.

> *This file is addressed to the coding agent, not to the reader. That is why it
> refers to Asher in the third person, why it is blunt about what he does and
> does not want, and why it records bugs by date: it is the brief the agent is
> held to at the start of every session, kept current as the project changed.*

---

## Who you are working with

Asher is a Vanderbilt senior running his own job search. Explain things in
terms of what he would **see** — a page, a button, a row in a table — not in
terms of schemas, types or frameworks. Jargon does not sound rigorous to him,
it blocks the answer.

**Discuss before executing.** His standing instruction: for each item, lay out
options and trade-offs with a recommendation, and wait — unless he has said to
execute. "Consult" means consult.

**Do not make live Anthropic API calls or write test rows to his database
without asking first.** He interrupted a `curl` that would have done both. He
has never lifted that, so treat it as standing.

---

## The two source documents

- `docs/Dashboard_Scope_v1.md` — the locked architecture, data model and
  card-by-card behaviour. **Authoritative.**
- `mockup/` — a Claude Design export. **Visual reference only.** Port it, do
  not redesign it.

Where they conflict, the scope wins, and the conflict must be **flagged to
Asher**, never silently resolved. Conflicts already settled are recorded in
`docs/CHANGELOG.md`.

- `docs/Recruiting_Status_8.26.2026.md` — his real recruiting context.
  **Background only. Never hardcode any of it into the app.** Kept out of git
  on purpose (the repo is meant to go public one day) — it lives only on this
  laptop.

---

## Stack and hard rules

Next.js 15 App Router · TypeScript strict · Tailwind v4 (`@theme`, oklch) ·
Supabase Postgres · Anthropic `claude-opus-5` · Vercel (not yet deployed).

These are not preferences. Breaking one is a bug:

1. **No client ever touches the database.** RLS is enabled with zero policies,
   so the anon key can read and write nothing. The service-role key is the only
   way in, it lives in `src/lib/supabase.ts`, and that module is `server-only`.
   Every write goes through a route under `src/app/api/`.
2. **One user, one password.** One hardcoded `USER_ID` in `src/lib/constants.ts`,
   used everywhere, so swapping in real accounts stays a one-line change. Never
   scatter a second source of identity. Separately, a single shared password
   (`APP_PASSWORD`) gates every page and API route via `src/middleware.ts` —
   access control, not identity. Any route exempted from that gate must check
   its own secret, as `/api/cron/*` does with `CRON_SECRET`. The gate fails
   closed in production and stands aside only under `npm run dev` with no
   password set.
3. **One day-boundary helper.** `src/lib/time.ts`, based on `APP_TIMEZONE` —
   his local clock, never server UTC. Nothing else may do civil-date maths.
4. **AI never runs on page load.** Every model call is triggered by an explicit
   click or by the nightly cron. Cached output is read from `daily_logs`.
5. **Never trust an entity ID the classifier returns.** The model answers with
   names; the server resolves them and validates the row exists before writing.
6. **Log every server error explicitly**, and validate NOT NULL columns before
   insert.
7. **Guard optimistic local state** against a slower server payload landing on
   top of it and undoing the user's edit. This has bitten twice (habits, then
   priorities). The pattern that works: local value wins until the server's own
   data independently agrees — see `src/components/home/Priorities.tsx`.
8. **Failures go to the banner, not the card.** `useReportError()` from
   `src/components/ui/ErrorBanner.tsx`, with an action that completes
   "Couldn't …" and names the thing rather than the endpoint. No component
   keeps its own error state for a failed write. Form validation is the sole
   exception and stays beside its field.
9. **Never link to a route that redirects.** A redirect met during an in-app
   navigation makes Next.js fall back to a full page load. The top rail links
   to `/crm/applications`, not `/crm`, for exactly this reason.
10. **iCal is parsed with `ical.js`**, never `node-ical` — the latter reaches for
   BigInt and dies on Vercel's bundler *after* deploy.

---

## Running it

```bash
npm run dev      # development server
npm run check    # verifies credentials and that every table exists
npm test         # unit tests (time helpers, priority scoring)
npm run lint
npx tsc --noEmit
```

`npm run build && npm run start` runs the production build locally — several
times snappier than `dev`, and the honest baseline when judging performance.

Credentials live in `.env.local` (see `.env.example`). Never print a key.

`npm run dev` asks for a **laptop-only test password**, not the real one: it
lives in `.env.development.local` (git-ignored; Next loads it ahead of
`.env.local` in development only). It exists so Claude can log in to preview
pages without ever typing Asher's real password, while the gate stays on —
`next dev` listens on the whole network, so an unlocked dev server on campus
wifi would be open to anyone on it. Never switch the gate off to preview.

---

## Migrations

SQL files in `supabase/migrations/`, applied **by hand** in the Supabase SQL
Editor — there is no CLI wired up. The flow is:

```bash
LC_CTYPE=UTF-8 pbcopy < supabase/migrations/<file>.sql
```

→ paste → Run. **The `LC_CTYPE=UTF-8` matters.** `pbcopy` converts using the
shell's character encoding, which is unset in a non-interactive shell, so it
falls back to a legacy single-byte Mac encoding and mangles anything outside
plain English — an em dash arrives as `‚Äî`. That happened on 2026-10-07 and
was harmless only because the mangled characters sat in comments; the same
mangling inside a string literal would insert corrupted data silently.

Belt and braces: **every file under `supabase/` is plain ASCII**, enforced by
`test/migrations.test.ts`, which also checks that each migration is guarded
(`if not exists`, and `drop trigger if exists` before `create trigger`).

`supabase/check_migrations.sql` is a read-only status query: it prints DONE /
NOT RUN for each migration. Run that first when the state is unclear.

All migrations are idempotent — safe to run twice. (`20260827000000_init.sql`
was **not**, until 2026-10-07: its `create table` / `create index` /
`create trigger` statements were unguarded, so the claim here and in
`supabase/demo/schema.sql`'s header was false. Fixed and verified by running
the whole concatenated schema a second time against the demo database.)

**One caveat the word "idempotent" hides:** the *schema* is safe to re-run; the
*data* is not. `20260831000000` contains a one-off `update` that moves
Researching rows to Applied. Re-running the concatenated `schema.sql` against a
**populated** database therefore empties the Researching column — observed on
the demo on 2026-10-07, 5 Researching became 0, and repaired by re-seeding.

| File | Adds |
|---|---|
| `20260827000000_init.sql` | the ten scope tables |
| `20260831000000_drop_researching_stage.sql` | removes the Researching stage |
| `20260903000000_contact_touches.sql` | `contact_touch` as a memory_log source |
| `20260904000000_application_events.sql` | stage history (an **eleventh** table — a flagged scope departure, justified in the file header) |
| `20260915000000_researching_and_reminders.sql` | Researching restored; `kind` (job/grad school), `remind_on`, `remind_estimated` on applications; `user_settings` (a **twelfth** table, for the Compress window sliders) |
| `20261001000000_crm_change_memory.sql` | `crm_change` as a memory_log source — hand-made CRM changes in Brain |
| `20261006000000_outreach_radar.sql` | `connections` (a **thirteenth** table — his own LinkedIn export, flagged) and `applications.outreach_wanted` |

`supabase/demo/schema.sql` is **not** a migration. It is every migration above
concatenated, plus two tables that exist only in the demo database
(`demo_marker`, `demo_ai_usage`), for creating the demo's Supabase project in
one paste. Regenerate it with `scripts/build-demo-schema.sh` whenever a
migration is added. **Never run it against the real database** — it would
create `demo_marker` there, which is the one thing that tells the demo
deployment it is safe to erase what it is connected to.

**When you add a migration, tell Asher explicitly.** Code ships to his machine
the moment you save; schema does not. Out-of-sync is the cause of "the table
doesn't exist" errors.

---

## Shape of the code

```
src/app/            pages (server components, reads) and api/ routes (writes)
src/components/     home/ crm/ review/ capture/ ui/
src/lib/db/         every Supabase query, one module per table
src/lib/ai/         classify · rationale · extractJobs · reviewDraft
src/lib/time.ts     the day-boundary helper (rule 3)
src/lib/priority.ts the deterministic task ranking — no AI
src/lib/reminders.ts reminder-to-apply dates and when Compress resurfaces them
src/lib/compress.ts the Compress window defaults, bounds and all-windows scaling
src/lib/display.ts  labels and the validated chart palette
src/lib/mcp/      the read-only tools the Claude app can call (scripts/mcp.ts runs them)
```

Reads happen in server components. Writes happen in `/api` routes called via
`src/lib/client.ts`. Nothing else.

---

## Performance notes

The dominant costs, largest first: running the dev server rather than a
production build; his laptop being the server and therefore far from the
database; and `router.refresh()` after every write, which rebuilds all six Home
cards. Optimistic UI plus a backgrounded refresh is the fix. Priorities is the
reference implementation; since 2026-10-01 goals, habits, follow-up snooze and
board drags follow it too. Forms (dialogs) still await their save.

---

## Portfolio launch list (agreed 2026-10-01)

Asher wants to publish the dashboard as a portfolio piece within days. The
working order, before the repo goes public:

1. ~~Live site actually current~~ — it always was. Every push since Sep 29
   deployed; Asher was viewing one old build's own URL, which never updates.
   The live address is the project's own production domain on Vercel — not
   behind Vercel's login; the per-build URLs are. The address itself is kept
   out of this file, which is public: the site is password-gated, and there is
   no point publishing where the gate is (see the lockout note below).
2. **Backup** configured 2026-10-01: a private GitHub repo of its own,
   a token scoped to it alone (Contents read/write, expires 2027-10-01) in
   Vercel only — not in `.env.local`. **Working since 2026-10-03, confirmed.**
   Runs nightly at 07:00 UTC (2 AM Central).
   It had silently failed every night until then: both GitHub settings were
   listed in Vercel but reached the running job empty, so it read all twelve
   tables and then threw at the last step without ever contacting GitHub.
   Re-entering both with Production selected, and redeploying, fixed it. The
   October token was lost (GitHub shows a token once), so a new one was made.
   **A failed backup still tells nobody** — no email, nothing on the dashboard,
   and Vercel's free plan drops the logs within the hour. Worth a visible
   signal before the repo goes public; raised, not approved.
   Login alert emails are **not** set up: `RESEND_API_KEY` / `LOGIN_ALERT_TO`
   are absent from Vercel as of 2026-10-01.
3. **Public demo — LIVE at lanework-demo.vercel.app since 2026-10-05.**
   Supabase project `lanework-demo` (East US, project ref `ejjqegjjhgcsdiawpekv`),
   Vercel project `lanework-demo`, both from this same repo. Seeded and
   verified. The decisions it was built to are below, kept for reference.
   - **Separate Supabase project** (`lanework-demo`, free tier) holding only
     fictional data. Never a "demo user" in the real database.
   - **Full sandbox, reset nightly** (~3 AM Central) back to the seed data by
     a cron route, so nothing a visitor does persists.
   - **AI: hybrid.** A few sample notes on the capture bar return
     pre-recorded results (free, instant); anything typed goes to the live
     model under a **hard daily cap of ~25 calls for the whole demo**, then
     "Demo limit reached — try a sample note." Worst case ≈ $1/day.
   - **Persona:** a fictional student (e.g. "Jamie Rivera", fictional
     university) targeting **climate, energy, data & AI, and product
     management** roles. ~30 applications across every stage, contacts,
     tasks, habits, goals, ~6 weeks of history so the timeline and Brain look
     lived-in. Lanes stay primary/secondary/peripheral (they are priority
     tiers); those four fields are spread across them.
   - **Address** like `lanework-demo.vercel.app` (free), with a banner:
     "Demo — all data is fictional. Resets nightly."
   - **Demo mode** is one env switch (e.g. `DEMO_MODE=1`) on a **second Vercel
     project from the same repo**. It turns off the password gate, login
     alerts, backup and calendar sync, and reads a fictional static .ics for
     the calendar card. **This is a deliberate exception to hard rule 2**
     (gate fails closed in production) — approved by Asher. Safety catch:
     demo mode must refuse to start if pointed at the real Supabase project.
   - Asher's part: be signed in to Supabase/Vercel in Chrome so Claude can
     create the project and paste the one combined migration file; **he
     pastes every key himself** (Claude never types keys into a site).
   Vercel's own login (Deployment Protection) sits in front of per-build URLs
   only; the production domain is public.
4. **MCP server — built 2026-10-05, read-only, runs on the laptop.** Eight
   lookups; `npm run mcp`; setup and reasoning in `docs/MCP.md`. **Not** a
   custom connector as written here: that means a hosted server and the Claude
   app only offers OAuth sign-in for one, which is disproportionate machinery
   in front of this data. Flagged as a departure. The tools are
   transport-agnostic (`src/lib/mcp/tools.ts`), so hosting it later — or adding
   writes, which would wrap the existing `/api` routes — is an addition beside
   it, not a rewrite.
   **Connecting it must happen with Claude QUIT** — run
   `scripts/install-mcp.sh` from the macOS Terminal. The app owns
   `claude_desktop_config.json` (its preferences live there too) and writes its
   in-memory copy back periodically, so an entry added while it runs is erased:
   written 15:38 on 2026-10-06, gone by 22:40 with only `epitaxyPrefs` changed.
   The config points at `scripts/mcp.sh`, not `npm`, because the app launches
   from the GUI with a bare PATH where nvm — and therefore node and npm — do
   not exist at all. Both verified 2026-10-06 by handshaking under GUI launch
   conditions. Ten tools now (the two outreach ones were added 2026-10-06).
5. **Eval suite** for the AI readers — built 2026-10-01 in `evals/`. First
   run 2026-10-18, with Asher's permission: **17/17 cases, 46/46 checks**, the
   report in `evals/results/`. A run is 17 live model calls: ask before every
   one. The cases are regressions frozen from bugs the app had, so a clean
   sweep means those fixes held, not that the readers are infallible.
6. **README as a case study** — drafted 2026-10-01, settled with Asher
   2026-10-18: demo link and a Home screenshot at the top, the real eval
   score with what it does not prove, and a "How it was built" section that
   says he specified the product feature by feature and the agent implemented
   it. The old "not a software engineer" line is gone from this file: it was
   a self-assessment, not an instruction, and the sentences after it already
   say how to explain things.
7. **Google Calendar two-way sync** — Asher, 2026-10-01: without it the Home
   calendar card is close to useless. The read-only iCal feed is connected
   and works, but it points at his Google calendar named "Recruiting", which
   had **zero events** on 2026-10-01 — so the card showed only the
   dashboard's own Apply/Due entries. Asher chose (2026-10-01) to keep using
   the Recruiting calendar and give the dashboard edit rights to it via the
   robot account — paused at his request. His setup steps, when he resumes:
   Google Cloud project → enable Calendar API → service account → JSON key
   (he reports the file's location; Claude moves it into env without printing
   it) → share only "Recruiting" with the robot as "Make changes to events" →
   send the Calendar ID. First build: Apply/Due reminders written to that
   calendar, touching only events the dashboard created. See the two calendar
   threads below.
8. **Outreach radar — half built 2026-10-06.** Decisions (2026-10-06):
   connections in their own table, not Contacts · a toggle on the application
   ("Worth reaching out about") · runs **on demand**, not nightly — the Vercel
   plan allows two scheduled jobs and the backup and demo reset use both ·
   **public web search only** for alumni; the Vanderbilt alumni portal is
   behind his login and automating it is the same terms-of-service and
   account-risk problem as LinkedIn, so results from it are pasted in by hand ·
   connections **excluded from the nightly backup** (his call: hundreds of real
   people's details need not go to a GitHub repo, and the file is re-importable).
   **Nothing ever auto-sends. The radar drafts; he sends.**
   Built: the migration, the CSV parser, the import script
   (`npm run import-connections -- <file>`, which reads a `.csv` or pulls only
   Connections.csv out of the full `.zip` with `unzip -p`, extracting nothing
   else; `--dry-run` to check before writing), company matching, two MCP tools
   (`outreach_radar`, `who_do_i_know_at`), the toggle on the application form,
   the **Outreach tab** with a visible run trace, and the demo's recorded run
   (`src/lib/demo/radarRun.ts`). The trace exists because the radar's output —
   three people to message — looks identical to a hardcoded list; the steps are
   what show the machinery. Demo and real use the same `RadarRun` type and the
   same component.
   **Alumni web search and drafting built 2026-10-07, NEVER RUN LIVE.** Two
   buttons on the Outreach tab, deliberately separate: "Who do I know" compares
   two lists and is free; "Search and draft" makes one web search per company
   (capped at `MAX_COMPANIES_PER_RUN` = 5) plus one drafting call. Public pages
   only; the Vanderbilt alumni directory is never touched. **Every alumnus must
   come back with a source URL the claim was read from — one without it is
   dropped before it is shown**, because a model will happily invent that a
   stranger went to your university and the cost is a message to a real person
   that opens with a lie. `OPERATOR.university` carries the school name.
   **Ask before the first live run** — it spends real money.
   **Blocked on Asher:** running migration `20261006000000` on the **real**
   database (already run on the demo, 2026-10-06), and the LinkedIn export —
   re-requested 2026-10-06, arriving within 24h. Connections-only was not
   offered, so it is the full archive; the importer handles that and reads only
   Connections.csv out of it.
   Later / roadmap: Telegram voice capture,
   AI cost page, Brain additions.
   **Outreach scout plan (2026-10-01):** LinkedIn has no API for an
   individual's connections, and automated browsing of LinkedIn as Asher
   breaks its terms and risks his account — so no agent logs in to LinkedIn.
   Step one is importing his own LinkedIn data export (`Connections.csv`:
   name, profile URL, company, position, connected-on) and matching
   applications to people he already knows; only then the open web for
   alumni/recruiters. He requested the full archive on 2026-10-01. Use only
   `Connections.csv` from it — the archive also holds his messages and other
   private data; never read the rest.

## Open threads

Carry these forward. Ask before acting on them.

- **Deployed 2026-09-29** to its production domain on Vercel. Login
  alert emails: `RESEND_API_KEY` / `LOGIN_ALERT_TO` were never added to
  `.env.local`; they are absent from Vercel too, confirmed 2026-10-03. The
  nightly backup works as of 2026-10-03 (see launch list item 2).
  When adding a table, add it to `TABLES` in `src/app/api/cron/backup/route.ts`
  — the eleventh and twelfth were missed until 2026-10-01.
- **Telegram voice capture — decided: confirm inside Telegram, not a dashboard
  inbox.** Asher wants it for use on the go, so the bot should reply with what
  it understood and Confirm / Edit buttons. The scope's rule that every capture
  passes a human confirm step still holds; Telegram is where that step happens.
  Needs the app deployed first (Telegram delivers to a public address), a bot
  key from @BotFather, a migration adding a voice source to `raw_captures`, and
  a transcription provider — Groq Whisper Turbo was recommended over OpenAI,
  not yet chosen. The webhook route sits outside the password gate, so it must
  verify Telegram's secret token and accept only Asher's Telegram user id.
- **No lockout on repeated wrong passwords.** Each miss waits ~1s; there is no
  per-address limit, because that needs somewhere to count attempts (a table).
  A long passphrase is the real protection. Revisit if the logs show guessing.

- **Reminders to apply are dashboard-only.** Since 2026-09-15 the Home
  calendar draws "Apply" and "Due" entries for Researching roles from the
  applications table. They do not reach Google Calendar or Asher's phone.
  Asher chose the Google robot-account route and will set it up himself
  ("later"); when he has, pushing these entries is the first thing to build —
  touch only events the dashboard created, marked with a hidden label, and
  move/delete them as the role's dates and stage change. Confirm the shared
  calendar is the separate recruiting one (he says it is).
- **Sep 15 capture changes: model checked, commit path not.** With Asher's OK,
  both AI readers were run live on 2026-09-15 by calling them directly (not
  through the capture bar, which writes an undeletable capture row) — a sample
  note and a fictional saved-jobs screenshot. Every field came back right:
  Researching vs Applied, grad school, deadlines, "two weeks before", posting
  ages, a tracked duplicate. Not yet exercised: committing from either confirm
  screen, and a note moving a role already in Researching to Applied (there
  were no Researching rows to test against). Both write real rows — ask.

- **Calendar write-back.** The calendar is connected by its secret iCal
  address, which is read-only — a subscription, not an account — so nothing in
  the dashboard can create, move or delete an event, and the classifier has no
  event output at all. Asher asked for scheduling on 2026-09-10; options were
  put to him (Google service account with the calendar shared to it — the
  recommendation; a dashboard-local events table; or a prefilled "add to
  Google" link) and he has not chosen yet. The scope doc sanctions this as a
  later upgrade rather than forbidding it, so it is not a conflict — but it is
  still a change to a locked decision and needs saying out loud when built.
  Whichever path, the classifier needs a fifth output (`suggested_events`).
- **Outreach-shaped tasks** left over from before `contact_touch` existed —
  Asher is cleaning these up by hand.

- **Captures still cannot be deleted.** No button and no server route, so a
  capture made by accident stays in Brain. (Logged conversations became
  deletable on 2026-09-14, with the contact's last-contacted date rolling back —
  see `src/lib/touchRollback.ts`.) Application stage history is deliberately
  **not** on this list — a history you can edit is not a history.

- **Deleting a conversation does not restore the follow-up reminder** that
  logging it set or cleared. Logging overwrites `next_follow_up_at` without
  recording the old value, so a mistaken log can make someone silently drop
  off the Home follow-up card, and deleting the log won't bring them back.
  Fixing it properly means storing the previous value at logging time (a
  migration). Flagged to Asher, not approved.

- **Errors persist across a page reload.** The banner is kept in session
  storage, so a refresh does not clear it — only the × does, or closing the
  tab. That follows Asher's "always show no matter what", but a stale error
  reappearing after a refresh may read as noise. Easy to change if it does.

Keep `docs/CHANGELOG.md` current: newest first, with the reasoning, and honest
about bugs.
