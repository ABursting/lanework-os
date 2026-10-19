import { test } from "node:test";
import assert from "node:assert/strict";
import { rollbackLastContacted } from "../src/lib/touchRollback.ts";

const MON = "2026-09-07T15:00:00.000Z";
const WED = "2026-09-09T15:00:00.000Z";
const FRI = "2026-09-11T15:00:00.000Z";

test("deleting the newest conversation rolls back to the one before it", () => {
  assert.deepEqual(
    rollbackLastContacted({ current: FRI, deleted: FRI, latestRemaining: WED }),
    { change: true, value: WED },
  );
});

test("deleting the only conversation clears the date", () => {
  assert.deepEqual(
    rollbackLastContacted({ current: WED, deleted: WED, latestRemaining: null }),
    { change: true, value: null },
  );
});

test("deleting an older conversation leaves the date alone", () => {
  // Friday's conversation still stands, so the contact was still last spoken
  // to on Friday.
  assert.deepEqual(
    rollbackLastContacted({ current: FRI, deleted: MON, latestRemaining: FRI }),
    { change: false },
  );
});

test("a date typed in by hand is never disturbed", () => {
  const typedByHand = "2026-09-12T09:30:00.000Z";
  assert.deepEqual(
    rollbackLastContacted({ current: typedByHand, deleted: FRI, latestRemaining: WED }),
    { change: false },
  );
});

test("the same instant written two ways still counts as a match", () => {
  // JavaScript writes "Z"; Postgres hands the same moment back as "+00:00".
  assert.deepEqual(
    rollbackLastContacted({
      current: "2026-09-11T15:00:00+00:00",
      deleted: FRI,
      latestRemaining: MON,
    }),
    { change: true, value: MON },
  );
});

test("out-of-order deletes stay correct", () => {
  // Three conversations: Mon, Wed, Fri. Delete Wed first — nothing moves.
  assert.deepEqual(
    rollbackLastContacted({ current: FRI, deleted: WED, latestRemaining: FRI }),
    { change: false },
  );
  // Then Fri — the date lands on Mon, not on the already-deleted Wed.
  assert.deepEqual(
    rollbackLastContacted({ current: FRI, deleted: FRI, latestRemaining: MON }),
    { change: true, value: MON },
  );
});

test("a contact with no date is left alone", () => {
  assert.deepEqual(
    rollbackLastContacted({ current: null, deleted: FRI, latestRemaining: null }),
    { change: false },
  );
});
