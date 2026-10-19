import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConnectionsCsv } from "../src/lib/connections/parseCsv.ts";
import { matchConnectionsToCompanies, type ConnectionRow } from "../src/lib/db/connections.ts";

/**
 * Reading the LinkedIn export, and matching it to the board.
 *
 * Worth testing hard because every failure here is silent. A mis-split row
 * does not throw — it attributes a real person to the wrong employer, and the
 * first anyone knows is an outreach message sent to a stranger. A missed match
 * does not throw either; the feature just quietly finds nothing and looks like
 * it works.
 */

/** LinkedIn's real file shape: a few lines of preamble, then the header. */
const PREAMBLE = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the',
  'information is missing. ..."',
  "",
].join("\n");

const header = "First Name,Last Name,URL,Email Address,Company,Position,Connected On";
const file = (...rows: string[]) => [PREAMBLE, header, ...rows].join("\n");

/* ── Reading the file ─────────────────────────────────────────────────────── */

test("a plain export is read", () => {
  const { connections, skipped } = parseConnectionsCsv(
    file(
      "Priya,Raghunathan,https://www.linkedin.com/in/priya,priya@x.com,Helio Grid,Senior Analyst,20 Mar 2024",
      "Marcus,Oyelaran,https://www.linkedin.com/in/marcus,m@x.com,Northwind Analytics,Engagement Manager,05 Jan 2023",
    ),
  );

  assert.equal(skipped.length, 0);
  assert.equal(connections.length, 2);
  assert.deepEqual(connections[0], {
    name: "Priya Raghunathan",
    profile_url: "https://www.linkedin.com/in/priya",
    company: "Helio Grid",
    position: "Senior Analyst",
    connected_on: "2024-03-20",
  });
});

/**
 * The reason this is a parser and not a split on commas. Both of these rows
 * are ordinary; splitting either one shifts every later field by one and
 * attributes the person to their own job title.
 */
test("commas inside a quoted field do not shift the columns", () => {
  const { connections } = parseConnectionsCsv(
    file(
      'Dana,Whitfield,https://x.com/dana,d@x.com,Arcadia Climate,"Director, Product",01 Feb 2024',
      'Ben,"Osei, Jr.",https://x.com/ben,b@x.com,Terrawatt Energy,Associate,02 Feb 2024',
    ),
  );

  assert.equal(connections[0].company, "Arcadia Climate");
  assert.equal(connections[0].position, "Director, Product");
  assert.equal(connections[1].name, "Ben Osei, Jr.");
  assert.equal(connections[1].company, "Terrawatt Energy");
});

test("a doubled quote inside a quoted field is one literal quote", () => {
  const { connections } = parseConnectionsCsv(
    file('Alex,Reed,https://x.com/a,a@x.com,Acme,"The ""Growth"" Team",03 Feb 2024'),
  );
  assert.equal(connections[0].position, 'The "Growth" Team');
});

test("the email column is read but never kept", () => {
  const { connections } = parseConnectionsCsv(
    file("Priya,Raghunathan,https://x.com/p,priya@private.example,Helio Grid,Analyst,20 Mar 2024"),
  );
  // Several hundred people's addresses are not needed to match a company and
  // draft a LinkedIn message, so they are not stored.
  assert.ok(!JSON.stringify(connections).includes("private.example"));
  assert.deepEqual(Object.keys(connections[0]).sort(), [
    "company", "connected_on", "name", "position", "profile_url",
  ]);
});

test("the header is found rather than a fixed number of lines skipped", () => {
  // The preamble's length has changed before. Skipping a fixed count would
  // silently eat the first connections, or read a preamble line as a person.
  const longPreamble = Array.from({ length: 9 }, (_, i) => `Note line ${i}`).join("\n");
  const { connections } = parseConnectionsCsv(
    [longPreamble, header, "A,B,https://x.com/ab,e@x.com,Acme,Analyst,01 Jan 2024"].join("\n"),
  );
  assert.equal(connections.length, 1);
  assert.equal(connections[0].name, "A B");
});

test("a file that is not a connections export is refused, not half-read", () => {
  assert.throws(
    () => parseConnectionsCsv("Date,Amount,Description\n2026-01-01,5.00,Coffee"),
    /LinkedIn Connections export/,
  );
});

test("a byte-order mark does not become part of the first column name", () => {
  // Opening the file in Excel adds one.
  const { connections } = parseConnectionsCsv(
    "﻿" + [header, "A,B,https://x.com/ab,e@x.com,Acme,Analyst,01 Jan 2024"].join("\n"),
  );
  assert.equal(connections.length, 1);
});

test("both date formats LinkedIn writes are understood", () => {
  const { connections } = parseConnectionsCsv(
    file(
      "A,One,https://x.com/1,e@x.com,Acme,Analyst,20 Mar 2024",
      "B,Two,https://x.com/2,e@x.com,Acme,Analyst,03/20/24",
      "C,Three,https://x.com/3,e@x.com,Acme,Analyst,2024-03-20",
      "D,Four,https://x.com/4,e@x.com,Acme,Analyst,sometime last spring",
    ),
  );
  assert.equal(connections[0].connected_on, "2024-03-20");
  assert.equal(connections[1].connected_on, "2024-03-20");
  assert.equal(connections[2].connected_on, "2024-03-20");
  // Unreadable is null, not a guess and not a crash.
  assert.equal(connections[3].connected_on, null);
});

test("a connection with a restricted profile is skipped with a reason", () => {
  const { connections, skipped } = parseConnectionsCsv(
    file(
      ",,,,,,20 Mar 2024",
      "Real,Person,https://x.com/r,e@x.com,Acme,Analyst,21 Mar 2024",
    ),
  );
  assert.equal(connections.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /no name/);
});

test("missing company or title is null rather than an empty string", () => {
  // A person with no company can never be matched, and the import says so —
  // but an empty string would make them look like they work somewhere called "".
  const { connections } = parseConnectionsCsv(
    file("A,One,https://x.com/1,e@x.com,,,20 Mar 2024"),
  );
  assert.equal(connections[0].company, null);
  assert.equal(connections[0].position, null);
});

test("the same person twice in one file is imported once", () => {
  const { connections, skipped } = parseConnectionsCsv(
    file(
      "Priya,Raghunathan,https://x.com/priya,e@x.com,Helio Grid,Analyst,20 Mar 2024",
      "Priya,Raghunathan,https://x.com/priya,e@x.com,Helio Grid,Senior Analyst,20 Mar 2024",
    ),
  );
  assert.equal(connections.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /duplicate/);
});

/* ── Matching to the board ────────────────────────────────────────────────── */

const people = (...rows: [string, string | null][]): ConnectionRow[] =>
  rows.map(([name, company], i) => ({
    id: `c${i}`, name, company, profile_url: null, position: null, connected_on: null,
  }));

test("a company you have applied to finds the people you know there", () => {
  const matches = matchConnectionsToCompanies(
    ["Arcadia Climate", "Helio Grid"],
    people(["Dana Whitfield", "Arcadia Climate"], ["Priya Raghunathan", "Helio Grid"], ["Nobody", "Elsewhere Inc"]),
  );
  assert.equal(matches.length, 2);
  assert.equal(matches[0].connections[0].name, "Dana Whitfield");
});

test("matching ignores case, punctuation and spacing — the same rule as everywhere else", () => {
  for (const spelling of ["arcadia climate", "ARCADIA CLIMATE", "Arcadia  Climate", "Arcadia Climate."]) {
    const matches = matchConnectionsToCompanies(["Arcadia Climate"], people(["Dana", spelling]));
    assert.equal(matches.length, 1, `failed on "${spelling}"`);
  }
});

test("a near-miss is not a match", () => {
  // "Google" and "Google LLC" stay apart on purpose. A wrong match means an
  // outreach message to a stranger at a different company, which is worse than
  // missing a real one.
  const matches = matchConnectionsToCompanies(["Google"], people(["Someone", "Google LLC"]));
  assert.equal(matches.length, 0);
});

test("several people at one company come back together", () => {
  const matches = matchConnectionsToCompanies(
    ["Arcadia Climate"],
    people(["Dana", "Arcadia Climate"], ["Sam", "arcadia climate"], ["Lee", "Arcadia Climate"]),
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].connections.length, 3);
});

test("a company where you know nobody is left out entirely", () => {
  // Rather than returned with an empty list, so the caller cannot accidentally
  // render "0 people you know here" against every role on the board.
  const matches = matchConnectionsToCompanies(["Nowhere Corp"], people(["Dana", "Arcadia Climate"]));
  assert.deepEqual(matches, []);
});

test("connections with no company never match anything", () => {
  const matches = matchConnectionsToCompanies(["Acme"], people(["Dana", null], ["Sam", "   "]));
  assert.deepEqual(matches, []);
});

test("the same company listed twice is answered once", () => {
  const matches = matchConnectionsToCompanies(
    ["Arcadia Climate", "arcadia climate"],
    people(["Dana", "Arcadia Climate"]),
  );
  assert.equal(matches.length, 1);
});
