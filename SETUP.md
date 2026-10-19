# Setup

## 1. Node

Node 22 is installed via nvm and pinned by `.nvmrc`. New terminals pick it up
automatically. If a shell ever reports the old v18:

```bash
nvm use
```

## 2. Supabase

1. Create a project at https://supabase.com/dashboard (free tier is fine).
   On the security settings for the project, use:
   - **Enable Data API — ON.** This is how the app reaches the database; with
     it off, nothing works.
   - **Automatically expose new tables — OFF.** Safer, and the migration grants
     the server its own access explicitly so this does not break anything.
   - **Enable automatic RLS — ON.** Redundant with the migration, which locks
     all ten tables down itself, but it means anything you add later can't
     accidentally be created wide open.
2. Run the migration. In a terminal, copy the file's *contents* to your
   clipboard (not its name — pasting the filename into the SQL editor gets you
   `syntax error at or near "supabase"`):

   ```bash
   pbcopy < supabase/migrations/20260827000000_init.sql
   ```

   Then open the Supabase SQL Editor, paste, and hit Run. It should start with
   `create extension if not exists "pgcrypto";` and run to "Success. No rows
   returned". That creates all ten tables, the full-text index, and turns on
   RLS.
3. Collect two values from the dashboard:
   - **Project URL** — Project Settings → **Data API**. It looks like
     `https://abcdefgh.supabase.co`. This is *not* the address in your
     browser's bar (that one starts `supabase.com/dashboard/...`), though the
     project id is the same string in both.
   - **service_role key** — Project Settings → **API Keys**, behind a Reveal
     button. Take `service_role`, not `anon`.
4. `cp .env.example .env.local`, then open the file in an editor —
   `open -e .env.local` — and replace the text after the `=` on each line.
   Nothing is typed into the terminal for this step. No quotes, no spaces
   around the `=`, and each key stays on a single line however far it wraps.

The `service_role` key bypasses RLS and is the only key that can touch these
tables. It must never get a `NEXT_PUBLIC_` prefix and must never be imported
into a client component — `src/lib/supabase.ts` is marked `server-only`, so
that mistake is a build error rather than a leak.

## 3. Anthropic

Get a key from https://console.anthropic.com → API Keys and put it in
`.env.local` as `ANTHROPIC_API_KEY`.

**Create it scoped to a workspace.** When the Console asks which workspace the
key belongs to, pick one rather than leaving it tied to your account. A key
tied to your account ("identity-linked") has to name a workspace on every
single request, and captures fail with:

> anthropic-workspace-id is required when authenticating with an identity-linked API key

If you already have such a key and would rather keep it, set
`ANTHROPIC_WORKSPACE_ID` in `.env.local` to the workspace's id (Console →
Settings → Workspaces; it looks like `wrkspc_01...`). Either route works.

## 4. Calendar (optional, for the Calendar card)

In Google Calendar, open the settings for your job-search calendar, scroll to
**Integrate calendar**, and copy the **Secret address in iCal format**. Put it
in `.env.local` as `CALENDAR_ICS_URL`. Read-only — the app never writes to it.

Use a dedicated "Job Search" calendar so the feed only carries recruiting
events.

## 5. Check it, then run it

```bash
npm run check
```

That confirms each key is present, well-formed, and actually accepted — and
that all ten tables exist. It never prints a key, only whether it works. Fix
anything it lists, then:

```bash
npm run dev
```

Leave that terminal window open; it *is* the server. Then open
http://localhost:3000. To stop it, press Ctrl+C or close the window — the site
goes away until you run `npm run dev` again.

If Chrome says the site can't be reached, the server is not running. Look at
the terminal: a healthy start prints `✓ Ready in …` and `Local:
http://localhost:3000`. Anything else is the reason.

## 6. Starter habits (optional)

`supabase/seed.sql` inserts a generic starter habit set. Run it in the SQL
Editor if you want the habit tracker pre-populated; otherwise add habits from
the card itself.

## Running the tests

```bash
npm test
```

Covers the pieces that are pure logic and easy to get subtly wrong: the
day-boundary helper (including both DST transitions), the priority formula,
and iCal parsing against a fixture feed. It needs no database and no API key.

## A note on Node

Tools that spawn a non-interactive shell (editors, task runners) don't read
`~/.bashrc`, so they can still pick up the old system Node 18 and fail with a
version error. `scripts/dev.sh` loads nvm explicitly and is what
`.claude/launch.json` uses. From your own terminal, `npm run dev` is fine.
