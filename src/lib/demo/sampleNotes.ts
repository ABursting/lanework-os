import { addDays, today } from "../time";
import type { ParsedClassification } from "../ai/classify";

/**
 * The capture bar's free samples.
 *
 * ── Why these exist ─────────────────────────────────────────────────────────
 * The capture bar is the most interesting thing in the app and the only part
 * that costs money to run. Every typed note is a live model call on Asher's
 * key, so a demo that sends every visitor's note to the model is a demo with
 * an open tab at his expense.
 *
 * The compromise agreed on 2026-10-03: a handful of notes come with their
 * answers already recorded. Clicking one shows the real confirm screen, filled
 * in exactly as the model filled it in, instantly and for nothing. Anyone who
 * wants to see the model actually read something can still type their own, up
 * to the day's cap.
 *
 * ── Names, never ids ────────────────────────────────────────────────────────
 * These are written in `ParsedClassification` — the shape the model itself is
 * allowed to answer in, which carries no identifiers at all. The server
 * resolves every name against the rows that actually exist, through the same
 * `resolveClassification` a live call goes through. Only the model call is
 * skipped.
 *
 * That is hard rule 5, and the first version of this file broke it: the
 * answers were written in the resolved shape with every id left null, so the
 * confirm screen offered to create a second Arcadia Climate beside the one
 * already on the board. Resolution also has to happen at request time rather
 * than being baked in here, because the demo's rows change as visitors use it
 * and are rebuilt every night.
 *
 * ── Where these answers came from ───────────────────────────────────────────
 * Written by hand to match what the classifier returns for these four notes.
 * They are not transcripts of a live run — running the real classifier against
 * the demo data would be four live calls, and the point of this file is not to
 * make them. The type is the only thing holding them honest, so a change to
 * what the model may answer must be reflected here too.
 *
 * Nothing here matches a real company, person or role.
 */

export interface SampleNote {
  /** The short label on the chip. */
  label: string;
  /** The note text, dropped into the capture bar verbatim. */
  text: string;
  /** What the model would have said, before anything is resolved. */
  parsed: ParsedClassification;
}

/**
 * Built per request rather than held as a constant, because two of the four
 * carry dates and a recorded answer with last month's deadline in it would
 * make the confirm screen look broken.
 */
export function sampleNotes(): SampleNote[] {
  const inDays = (n: number) => addDays(today(), n);

  const notes: SampleNote[] = [
    {
      label: "Logged an application",
      text: "Applied to the climate risk analyst role at Arcadia Climate this morning, found it through Priya's referral",
      parsed: {
        summary: "Applied to Climate Risk Analyst at Arcadia Climate via a referral from Priya Raghunathan.",
        category: "new_application",
        matched_companies: [{ matched_name: "Arcadia Climate", known: true }],
        matched_contacts: [{ matched_name: "Priya Raghunathan", known: true }],
        suggested_tasks: [],
        suggested_stage_changes: [],
        suggested_applications: [
          {
            company_name: "Arcadia Climate",
            role_title: "Climate Risk Analyst",
            lane: "primary",
            stage: "applied",
            kind: "job",
            deadline: "",
            remind_on: "",
            remind_days_before: 0,
          },
        ],
        suggested_contact_touches: [],
        confidence: 0.92,
      },
    },

    {
      label: "A role to apply to later",
      text: "Found a grid software PM opening at Current Labs, deadline is three weeks out, remind me two weeks before",
      parsed: {
        summary:
          "A Product Manager opening at Current Labs to apply to, due in three weeks, with a reminder two weeks ahead.",
        category: "new_application",
        matched_companies: [{ matched_name: "Current Labs", known: true }],
        matched_contacts: [],
        suggested_tasks: [],
        suggested_stage_changes: [],
        suggested_applications: [
          {
            company_name: "Current Labs",
            role_title: "Product Manager, Grid Software",
            lane: "primary",
            // Planned, not sent — which is exactly what Researching is for.
            stage: "researching",
            kind: "job",
            deadline: inDays(21),
            remind_on: "",
            remind_days_before: 14,
          },
        ],
        suggested_contact_touches: [],
        confidence: 0.88,
      },
    },

    {
      label: "Several things at once",
      text: "Rejected from Lumen Robotics. Current Labs wants to schedule round three. Need to send Tomas my availability by Friday and redo the case study slides.",
      parsed: {
        summary:
          "Rejected by Lumen Robotics; Current Labs is moving to a third round; two things to do before Friday.",
        category: "application_status_change",
        matched_companies: [
          { matched_name: "Lumen Robotics", known: true },
          { matched_name: "Current Labs", known: true },
        ],
        matched_contacts: [{ matched_name: "Tomas Lindqvist", known: true }],
        suggested_tasks: [
          {
            title: "Send Tomas my availability for round three",
            task_type: "interview_prep",
            lane: "secondary",
            due_date: inDays(3),
          },
          {
            title: "Redo the case study slides",
            task_type: "interview_prep",
            lane: "primary",
            due_date: inDays(3),
          },
        ],
        // Two moves in one note. A single slot would have dropped the second.
        suggested_stage_changes: [
          {
            company_name: "Lumen Robotics",
            role_title: "Applied AI Analyst",
            to_stage: "rejected",
          },
          {
            company_name: "Current Labs",
            role_title: "Solutions Engineer",
            to_stage: "interviewing",
          },
        ],
        suggested_applications: [],
        suggested_contact_touches: [],
        confidence: 0.81,
      },
    },

    {
      label: "A conversation I had",
      text: "Coffee with Dana Whitfield at Arcadia this morning, she walked me through how the final round is scored and said to check back in a week",
      parsed: {
        summary:
          "Coffee chat with Dana Whitfield at Arcadia Climate about the final round; she suggested following up in a week.",
        category: "contact_update",
        matched_companies: [{ matched_name: "Arcadia Climate", known: true }],
        matched_contacts: [{ matched_name: "Dana Whitfield", known: true }],
        suggested_tasks: [],
        suggested_stage_changes: [],
        suggested_applications: [],
        // Something that happened, not something to do — hence a touch rather
        // than a task.
        suggested_contact_touches: [
          {
            contact_name: "Dana Whitfield",
            company_name: "Arcadia Climate",
            role: "Technical Recruiter",
            relationship_type: "recruiter",
            note: "Coffee chat — walked me through how the final round is scored.",
            follow_up_in_days: 7,
          },
        ],
        confidence: 0.9,
      },
    },
  ];

  return notes;
}

/**
 * The recorded answer for a note, or null if this is not one of the samples.
 *
 * Matched on the text itself rather than on an id sent from the browser: the
 * capture bar posts a note, and anything the browser could send to claim "this
 * one is free" could be sent by anyone wanting a free model call.
 */
export function recordedAnswer(text: string): ParsedClassification | null {
  const needle = text.trim().toLowerCase();
  return sampleNotes().find((s) => s.text.toLowerCase() === needle)?.parsed ?? null;
}
