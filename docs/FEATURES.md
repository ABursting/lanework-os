# What it does

A walk through the dashboard, page by page, in the order you would meet them.
For *why* it is built this way, see [`../README.md`](../README.md); for the
record of how it got here, [`CHANGELOG.md`](CHANGELOG.md).

A live version with invented data is at
**[lanework-demo.vercel.app](https://lanework-demo.vercel.app)** — it resets
every night, so nothing you do there sticks.

---

## The capture bar

The one thing to understand first. It sits at the bottom of every page, and it
is how almost everything gets into the system.

Type a note the way you would text a friend:

> *rejected from Brightline, Northwind wants to interview, need to prep the case
> study by Friday*

or paste up to five screenshots of a saved-jobs page or an application email.
The AI reads it and comes back with **proposed** changes — a pipeline move, a
new application with its deadline, a task, a conversation to log — each one
tickable and editable on a confirm screen.

**Nothing is written to the database until you confirm it.** That is the rule
the whole project is organised around. The model proposes; a person decides.

Three things it will not do, each for a reason:

- **It never supplies an ID.** It answers with names, and the server matches
  those names against rows it has just read. An invented "existing contact"
  therefore cannot attach your note to the wrong person — it becomes a new one.
- **It never runs on page load.** Every model call is behind a click or the
  nightly job. Opening the dashboard costs nothing.
- **Its outputs are lists.** An early version had single-value outputs, so
  *"email Dara, book the call, redo the deck"* quietly became one task. Every
  output that can be plural is.

---

## Home

**Today's top three.** Ranked by a plain formula — lane weight, deadline
urgency, task type — with no model involved. Ranking by AI would be
unpredictable in a way a to-do list cannot afford. What the AI *does* do, when
asked, is explain the order it produced.

**The week.** A calendar strip carrying your real calendar events (through a
read-only iCal feed) alongside the dashboard's own apply-by reminders for roles
you are still researching.

**Follow-ups.** People you said you would get back to, surfacing on the day you
said it.

**Habits and goals.** A daily grid and weekly targets that reset at *your*
midnight, not the server's.

**Backup status.** One line saying when the nightly backup last succeeded. It
stays quiet on good days and turns amber when the last success is two days old
— or when it cannot tell. Both get the same colour, because "your data is not
backed up" and "nobody can say whether your data is backed up" deserve the same
amount of your attention.

---

## CRM

**Applications** — a board: Researching → Applied → Interviewing → Offer, with
Rejected and Archived. Drag to move; the move is recorded in a history you
cannot edit, because a history you can edit is not a history.

**Companies** and **Contacts** — the people and organisations behind the roles,
with the date you last spoke to each.

**Tasks** — everything outstanding, ranked by the same formula Home uses.

**Compress** — the triage view. Everything that has gone quiet: applications
with no movement, contacts you have not spoken to, overdue tasks, ignored
reminders. You set the window for each with a slider, so "quiet" means what you
think it means.

**Outreach** — described below.

---

## Outreach

Built on your own LinkedIn data export, never by logging in to LinkedIn. No
agent signs in anywhere, and the university alumni directory — which sits behind
a login — is never touched.

1. **Pick roles.** Every role you have applied for, newest first, with a search
   box and All / Last 7 days / Clear. Picking is a selection, not a setting:
   nothing is saved, and the picks evaporate after the run.
2. **Check for connections.** Free and instant — it compares your imported
   connections against those companies. Names are matched ignoring case,
   punctuation and spacing, but never *fuzzily*, so a near-miss is not a match.
3. **Search the open web**, optionally, for the companies where you know
   nobody. This part costs money, so it is offered only after the free check,
   against a named list of companies, with the count in front of you.
   **Every person it returns must carry a URL the claim was read from.**
   Anyone without one is dropped before you see them — a model will happily
   invent that a stranger went to your university, and the cost of believing it
   is a message to a real person that opens with a lie.
4. **Draft.** Three sentences: why you are writing to *them* specifically, one
   line on who you are, and the ask — with an easy way to say no. Only for the
   people you tick.

**Nothing is ever sent for you.** The radar drafts; you send.

---

## Brain

A searchable record of everything that has happened: captures, pipeline moves,
conversations logged, tasks finished, reviews sealed, and changes you made by
hand in the CRM. It answers "what did I actually do in October".

---

## Review

**The weekly review** — drafted by the AI from the record above, then edited and
sealed by you. Sealing fixes it; the draft is a starting point, not a verdict.

**The timeline** — the whole search as one activity view, including a cumulative
applications chart.

---

## Behind the scenes

- **One password** gates every page and every API route. Sign-in alert emails
  are built but switched off — they need a mail-provider key that is not set.
- **The browser never touches the database.** Row-level security is on with no
  policies, so the public key can read and write nothing. Every write goes
  through a server route.
- **A nightly backup** writes every table to a private repository as JSON.
  Connections are deliberately excluded: several hundred real people's details
  do not need to be in a backup repo, and the file can be re-imported.
- **An MCP server** exposes ten read-only lookups, so the Claude desktop app can
  answer questions about the pipeline without a browser. See
  [`MCP.md`](MCP.md).
- **An eval suite** scores the two AI readers against 17 fixed cases with known
  answers. See [`../evals/`](../evals/).

---

## About the demo

The public demo runs the same code against a separate database of invented
people, and resets nightly. Two differences worth knowing:

- **The password gate is off**, which is a deliberate exception. The demo
  refuses to start unless the database it is pointed at proves it is the demo
  one, by carrying a marker table only the demo setup creates. Checking the URL
  instead would be weaker — the URL is exactly the thing that gets copied by
  mistake.
- **Some AI is live and some is replayed, and the demo says which.** A note you
  type into the capture bar is a real model call; the sample notes are
  recordings. In Outreach, the connection matching is real work over fictional
  data and the drafting is a real call; only the web search is replayed —
  a live one would cost money per visitor and would be looking up real
  strangers on behalf of a student who does not exist. Live calls share one
  daily cap for the whole site, and when it is spent the demo says so.
