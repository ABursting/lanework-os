# Asking the dashboard questions from the Claude app

The dashboard can answer questions about itself inside Claude — "how's my
search going", "who am I supposed to get back to", "when did I last talk to
Danny". This is the MCP server: a small program that runs on this laptop and
hands Claude a set of read-only lookups.

**It can only read.** Nothing it does can change, add or delete a row.

---

## Connecting it

Three steps, in this order. The order matters — see below.

1. **Quit Claude completely.** Cmd-Q, or Claude → Quit Claude. Closing the
   window is not enough.

2. In the macOS **Terminal** app (not inside Claude):

   ```
   ~/recruiting-dashboard/scripts/install-mcp.sh
   ```

3. **Open Claude again.** Settings → Developer should list **lanework** as
   Running, and a new chat should offer ten tools.

If it says Failed, press **View logs** there.

### Why it has to be done with Claude closed

The Claude app owns `claude_desktop_config.json` and keeps its own preferences
and sidebar state in the same file. From time to time it writes its in-memory
copy back to disk — and that copy is whatever it read when it started. So an
entry added while the app is running is silently erased the next time it saves.

That is not a guess. On 2026-10-06 the entry was written at 15:38 and verified
on disk; by 22:40 the app had rewritten the file without it, with only its own
`epitaxyPrefs` changed. The script refuses to run while any Claude process is
alive for exactly this reason.

### Why it starts through a shell script

`scripts/mcp.sh` rather than `npm` directly. The app launches this from the
macOS GUI, which does not read your shell's startup files and so has a bare
PATH: nvm is not loaded, which means **there is no `node` and no `npm` at
all**. Pointing the config straight at `npm` gives "command not found" and a
server stuck on Failed, with nothing naming PATH as the cause.

The wrapper loads nvm first and honours `.nvmrc`, so upgrading Node later does
not break it — which hardcoding `.nvm/versions/node/v22.23.2/bin/npm` into the
app's config would.

---

## What you can ask

| Tool | Answers |
|---|---|
| `pipeline_summary` | "How's my search going?" — counts by stage, resume pass rate, what's gone quiet |
| `list_applications` | "What am I interviewing for?" — filter by stage, lane or company |
| `today` | "What should I do today?" — ranked tasks, habits, goals, this week's calendar |
| `needs_attention` | "What am I forgetting?" — stale applications, cold contacts, overdue tasks, missed reminders |
| `list_contacts` | "Who do I owe a reply?" |
| `contact_history` | "What did I talk to Danny about?" |
| `application_history` | "How did the Northwind one progress?" |
| `search_brain` | "When did I last…?" — full-text over everything recorded |
| `outreach_radar` | "Where is outreach worth doing?" — who you know where you applied |
| `who_do_i_know_at` | "Do I know anyone at Stripe?" |

You don't name the tools. You ask the question and Claude picks.

---

## Why it runs here rather than on the internet

The launch list called for a **custom connector** — a version living at a web
address, which would also work from a phone. That route requires OAuth: the
Claude app's custom-connector screen walks you through a sign-in and has no
field for a plain password or token.

Standing up an OAuth sign-in server, for one person, in front of every
application and contact, is a large and security-sensitive piece of machinery.
It would be the only part of this project where one mistake exposes everything
at once.

Running it here avoids all of that. There is nothing listening on a port,
nothing reachable from outside, and no second copy of the credentials — it
reads the same `.env.local` the dev server reads.

**The cost:** it only works on this laptop, in the desktop app. Not on a phone,
not on claude.ai.

**If you want the phone version later,** the lookups themselves don't change.
They live in `src/lib/mcp/tools.ts` and know nothing about how they're reached;
`scripts/mcp.ts` is a thin wrapper around them. A hosted version is a second
wrapper beside it, plus the OAuth work.

---

## Adding the ability to change things

Right now it answers questions. It can't log a conversation or move a card.

That was deliberate — a first version that can only read cannot damage
anything while you work out whether you actually use it.

Adding writes stays cheap, for the same reason. A write tool is a wrapper over
an `/api` route the browser already posts to, so the validation, the entity
resolution and the error logging are already written and already tested. It's
a new tool beside the existing ones, not a change to them.

Worth deciding first: **whether a write should ask before it happens.** The
capture bar has a confirm step for a reason — the scope requires a human gate
between what a model proposes and what gets written. The same question applies
here, and the answer probably isn't "no".

---

## Running it by hand

To check it starts:

```bash
npm run mcp
```

It will sit there waiting — that's correct, it's waiting for the app to talk to
it over its own input and output. `Ctrl-C` to stop. It prints
`[mcp] lanework ready — 10 tools, read-only.` to the error stream first; if it
prints a complaint about Supabase instead, `.env.local` isn't being found.
