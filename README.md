# Lanework OS

**A personal operating system for a job search — with AI that proposes and a human who decides.**

Built by Asher Burstin to run his own post-graduation search: dozens of applications
across several kinds of roles, a growing network of contacts, and the daily discipline
it takes to keep both moving. It is in daily use.

**[Try the live demo →](https://lanework-demo.vercel.app)** — a fictional student's
pipeline, with every page working. All data is invented; it resets nightly.

![The Home page: today's three ranked priorities with the reason each is there, a week
calendar carrying interviews and apply-by deadlines, the habit tracker and this week's
goals, and the capture bar across the bottom](docs/screenshots/home.png)

---

## The problem

A serious job search is a CRM problem disguised as a to-do list. Applications sit in a
spreadsheet, conversations in your head, deadlines in an inbox, and the question that
matters every morning — *what should I do today, and who have I let go quiet?* — has no
single place to be answered.

The usual fixes fail in the same way: they demand data entry at the exact moment you
have the least patience for it.

## What it does

| Page | What you see |
|---|---|
| **Home** | Today's top three tasks, ranked; a week calendar with apply-by reminders; people you promised to follow up with; habits and weekly goals |
| **CRM** | An applications pipeline (Researching → Applied → Interviewing → Offer), companies, contacts, tasks, and **Compress** — a triage view of everything that has gone quiet |
| **Brain** | A searchable record of everything that has happened: captures, pipeline moves, conversations, finished work |
| **Review** | An AI-drafted weekly review you edit and seal, and an activity timeline |

**The capture bar** sits on every page. Type a note the way you'd text a friend —
*"rejected from Brightline, Northwind wants to interview, need to prep the case study"* —
or paste up to five screenshots of saved-jobs pages or application emails. The AI reads
it into proposed changes: a pipeline move, a new application with its deadline, a task,
a logged conversation. **Nothing is written until you confirm it on a review screen.**

## How the AI is used — and constrained

The interesting decisions here are less about calling a model than about where *not* to
trust one.

- **The model proposes; a human commits.** Every capture produces a proposal shown on a
  confirm screen with each item tickable and editable. The model never writes to the
  database.
- **The model never supplies an ID.** It answers with names. The server matches those
  names against the rows it just read and treats anything unmatched as new — so a
  confidently invented "existing contact" can't attach a note to the wrong person.
- **AI never runs on page load.** Every model call is triggered by a click. The daily
  "why this task today" lines and the weekly review draft are generated on request and
  cached. Opening the dashboard costs nothing.
- **Ranking is deterministic.** Today's priorities come from a plain formula (lane weight +
  deadline urgency + task type), not a model. The AI only *explains* the order.
- **Outputs are lists, not slots.** Early versions had single-value outputs, and real notes
  ("email Dara, book the call, redo the deck") were silently cut down to their first item.
  Every output that can be plural now is.
- **It is measured.** [`evals/`](evals/) holds 17 fixed notes and screenshots with known
  right answers, scored per run against a fictional CRM — so a prompt change is judged by
  whether the score moved, not by a hunch. First run: **17/17 cases, 46/46 checks**
  ([report](evals/results/2026-10-18T22-51.md)). Most of the cases are regressions frozen
  from bugs this app actually had, so a clean sweep means those fixes have held — not that
  the readers are infallible on notes nobody has thought to write yet.

Page-by-page detail is in [`docs/FEATURES.md`](docs/FEATURES.md).

## Architecture

```
Browser ──► Next.js pages (read)          ──► Supabase Postgres
        └─► Next.js API routes (write)    ──► Supabase Postgres
                     │
                     └─► Anthropic API (classify · read screenshots · draft review)
Vercel cron ─► nightly backup
Google Calendar ─► read-only iCal feed
```

- **Next.js 15** (App Router, TypeScript strict), **Tailwind v4**, deployed on **Vercel**.
- **Supabase Postgres** with row-level security on and no policies: the browser can read
  and write nothing directly. Every write goes through a server route.
- **Anthropic Claude** with structured outputs, validated with Zod before anything is
  shown to the user.
- One password gates every page and every API route. Sign-in alert emails are built and
  wired in, but not switched on: they need a mail-provider key, which is not set.

## Engineering notes

A few problems that took real thought:

- **Optimistic UI that can't be undone by its own refresh.** Ticking a task updates the
  screen instantly and saves behind it. The naive version broke twice: a page refresh
  already in flight would land with the old value and visibly untick the box. The fix
  holds the local value until the server's data independently agrees.
- **Time zones.** Habits reset at the user's midnight, not the server's. All date
  arithmetic goes through one helper; nothing else is allowed to do it.
- **Large screenshots.** A single full-resolution screenshot can exceed the hosting
  platform's request limit. Images are downscaled in the browser to the size the model
  would downscale them to anyway — no information lost, five images fit in one request.

## How it was built

I decided what this dashboard should do, feature by feature, and directed the work that
built it. Each piece started as a specification from me — the four pages, the capture bar,
how roles move through the pipeline, what Compress surfaces and when — along with the
architecture it had to fit and the rules the AI inside the app is not allowed to break:
no model writes to the database, no model supplies an ID, nothing runs on page load.

Claude Code wrote the code; I wrote the brief it worked from. [`CLAUDE.md`](CLAUDE.md) is
the standing version of that brief. I reviewed every change, and ran the result against my
own job search daily — which is how most of the bugs were found.

[`docs/CHANGELOG.md`](docs/CHANGELOG.md) is the record, kept honestly: a backup that
failed silently for three nights, a test that passed on broken code, a migration that was
never actually safe to re-run.

*This repository is a published snapshot rather than the working one, so it carries a
single commit. The development record — every bug, what caused it, and why each fix was
chosen over the alternatives — is in the changelog above.*

## Running it

See [SETUP.md](SETUP.md). In short: a Supabase project, an Anthropic API key, the
migrations in `supabase/migrations/` applied in order, and `npm run dev`.

```bash
npm test          # unit tests
npm run eval      # list the AI eval cases (add `-- --run` to score them)
```
