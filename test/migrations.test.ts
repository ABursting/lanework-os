import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration files have to survive a copy and paste into a browser.
 *
 * There is no migration tool here: the flow is `pbcopy < file`, paste into the
 * Supabase SQL Editor, Run. `pbcopy` converts text using whatever character
 * encoding the shell says to use, and in a non-interactive shell that is often
 * unset — so it falls back to a legacy single-byte Mac encoding and mangles
 * anything outside plain English. An em dash arrives as "aEUR", a box-drawing
 * rule as a wall of noise.
 *
 * On 2026-10-07 that happened to the outreach radar migration. It was harmless
 * only because every mangled character sat inside a comment. The same mangling
 * inside a string literal would have inserted corrupted data with nothing
 * raising an error — so the fix is not to be careful, it is to keep these
 * files to characters that cannot be mangled.
 */

const SQL_DIRS = ["supabase", "supabase/migrations", "supabase/demo"];

function sqlFiles(): string[] {
  const out: string[] = [];
  for (const dir of SQL_DIRS) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".sql")) out.push(join(dir, entry.name));
    }
  }
  return out;
}

test("there are SQL files to check", () => {
  // A path change that silently found nothing would make every test below pass.
  assert.ok(sqlFiles().length >= 8, `only found ${sqlFiles().length} .sql files`);
});

test("every SQL file is plain ASCII", () => {
  for (const file of sqlFiles()) {
    const text = readFileSync(file, "utf8");

    const offenders = new Map<string, number>();
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      if (code > 126 || (code < 32 && ch !== "\n" && ch !== "\t")) {
        offenders.set(ch, (offenders.get(ch) ?? 0) + 1);
      }
    }

    assert.equal(
      offenders.size,
      0,
      `${file} contains characters that pbcopy can mangle: ` +
        [...offenders].map(([c, n]) => `${JSON.stringify(c)} x${n}`).join(", ") +
        ". Use plain ASCII — '-' not an em dash, '->' not an arrow.",
    );
  }
});

test("no SQL file carries a byte-order mark", () => {
  // Invisible, and Postgres rejects it as a syntax error on line 1 with a
  // message that names a character you cannot see.
  for (const file of sqlFiles()) {
    assert.ok(!readFileSync(file, "utf8").startsWith("﻿"), `${file} starts with a BOM`);
  }
});

test("every migration is idempotent on its face", () => {
  // CLAUDE.md promises migrations are safe to run twice, and they are applied
  // by hand — so a second paste is a normal thing to do, not an accident.
  const files = sqlFiles().filter((f) => f.includes("migrations"));
  assert.ok(files.length > 0);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const statements = text
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");

    for (const [pattern, guard] of [
      [/\bcreate table\s+(?!if not exists)/i, "create table if not exists"],
      [/\bcreate index\s+(?!if not exists)/i, "create index if not exists"],
      [/\bcreate unique index\s+(?!if not exists)/i, "create unique index if not exists"],
      [/\badd column\s+(?!if not exists)/i, "add column if not exists"],
    ] as const) {
      assert.ok(
        !pattern.test(statements),
        `${file} has an unguarded statement — use "${guard}" so a second run is safe`,
      );
    }

    /*
      Postgres has no "create trigger if not exists", so the idempotent form is
      to drop it first. Checked separately because the guard is a different
      statement rather than a clause on the same one.
    */
    for (const match of statements.matchAll(/create trigger\s+(\w+)/gi)) {
      const name = match[1];
      assert.match(
        statements,
        new RegExp(`drop trigger if exists\\s+${name}\\b`, "i"),
        `${file} creates trigger "${name}" without dropping it first, so a second run fails`,
      );
    }
  }
});
