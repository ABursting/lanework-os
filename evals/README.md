# Evals

A fixed set of notes and screenshots with known right answers, used to score
the dashboard's two AI readers: the note classifier (`src/lib/ai/classify.ts`)
and the screenshot reader (`src/lib/ai/extractJobs.ts`).

```bash
npm run eval            # list the cases — calls nothing
npm run eval -- --run   # call the model once per case and write a report
```

A run is 17 model calls. Reports land in `results/`, one per run, so a change
to a prompt can be judged by whether the score moved — not by a hunch.

**Nothing touches real data.** The classifier is handed the fictional CRM in
`fixtures.ts` instead of reading the database, and no capture row is written.
Every name in the cases and screenshots is invented
(`python3 evals/make-screenshots.py` redraws the images).

**What is checked** is structure, not wording: how many tasks, which
application moved to which stage, whether an unknown person was wrongly
matched to a real one. Those are what become rows. A case counts as correct
only if every one of its checks passes.

Each case names the failure it probes — most are bugs this project actually
had: single-slot outputs that dropped the second task or the second pipeline
move, outreach logged as to-dos, a confirmation email turned away by the
screenshot reader.
