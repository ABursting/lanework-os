import { test } from "node:test";
import assert from "node:assert/strict";
import { compareTasks, deadlineUrgency, dueNote, scoreTask } from "../src/lib/priority.ts";
import type { Lane, TaskType } from "../src/lib/types.ts";

const NOW = "2026-08-27"; // a Thursday

const task = (lane: Lane | null, due: string | null, type: TaskType = "other") => ({
  lane, due_date: due, task_type: type, created_at: "2026-08-01T00:00:00Z",
});

test("lane weight dominates the score", () => {
  // A Primary task with no deadline still outranks a Peripheral one due today:
  // the lane is the strategic decision, the deadline is the tiebreak.
  assert.ok(scoreTask(task("primary", null), NOW) > scoreTask(task("peripheral", NOW), NOW));
  assert.equal(scoreTask(task("primary", null), NOW), 100);
  assert.equal(scoreTask(task("secondary", null), NOW), 50);
  assert.equal(scoreTask(task("peripheral", null), NOW), 10);
  assert.equal(scoreTask(task(null, null), NOW), 0);
});

test("deadline urgency buckets by calendar proximity", () => {
  assert.equal(deadlineUrgency("2026-08-26", NOW), 80); // overdue
  assert.equal(deadlineUrgency("2026-08-27", NOW), 60); // today
  assert.equal(deadlineUrgency("2026-08-30", NOW), 35); // Sunday — still this week
  assert.equal(deadlineUrgency("2026-08-31", NOW), 15); // next week, same month
  assert.equal(deadlineUrgency("2026-09-15", NOW), 0);  // beyond the month
  assert.equal(deadlineUrgency(null, NOW), 0);
});

test("the task-type nudge only breaks ties, never reorders lanes", () => {
  const app = scoreTask(task("peripheral", null, "application"), NOW);
  const admin = scoreTask(task("peripheral", null, "admin"), NOW);
  assert.ok(app > admin);
  // Even the largest nudge cannot lift a Peripheral task past a Secondary one.
  assert.ok(app < scoreTask(task("secondary", null, "admin"), NOW));
});

test("ordering puts the overdue primary task first", () => {
  const tasks = [
    { ...task("secondary", "2026-08-28"), id: "b" },
    { ...task("primary", "2026-08-26"), id: "a" },
    { ...task("peripheral", null), id: "d" },
    { ...task("primary", "2026-09-30"), id: "c" },
  ];
  const ranked = [...tasks].sort((x, y) => compareTasks(x, y, NOW)).map((t) => t.id);
  assert.deepEqual(ranked, ["a", "c", "b", "d"]);
});

test("a nearer deadline breaks a score tie", () => {
  const soon = { ...task("primary", "2026-08-28"), id: "soon" };
  const later = { ...task("primary", "2026-08-30"), id: "later" };
  // Same lane, same bucket (both "this week"), same type — the date decides.
  assert.equal(scoreTask(soon, NOW), scoreTask(later, NOW));
  assert.ok(compareTasks(soon, later, NOW) < 0);
});

test("due notes read in plain language", () => {
  assert.equal(dueNote("2026-08-27", NOW), "TODAY");
  assert.equal(dueNote("2026-08-28", NOW), "TOMORROW");
  assert.equal(dueNote("2026-08-30", NOW), "IN 3 DAYS");
  assert.equal(dueNote("2026-08-26", NOW), "1 DAY OVERDUE");
  assert.equal(dueNote("2026-08-24", NOW), "3 DAYS OVERDUE");
  assert.equal(dueNote(null, NOW), "NO DEADLINE");
});
