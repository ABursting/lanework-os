import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_TOOLS } from "../src/lib/mcp/tools.ts";

/**
 * The MCP tool surface — what the Claude app can ask the dashboard.
 *
 * These check the contract rather than the answers: the answers need a
 * database, and were verified by driving the real protocol against the real
 * rows on 2026-10-05. What is worth holding in a test is the shape — that
 * every tool is described well enough for a model to pick the right one, and
 * that bad arguments are refused *before* anything reaches the database.
 *
 * That last one matters more than it looks. The arguments come from a model,
 * not from a form, so they are the least predictable input anywhere in this
 * project.
 */

const byName = new Map(MCP_TOOLS.map((t) => [t.name, t]));
const get = (name: string) => {
  const tool = byName.get(name);
  assert.ok(tool, `no tool named ${name}`);
  return tool;
};

test("the tool surface is complete and distinct", () => {
  assert.ok(MCP_TOOLS.length >= 8, `only ${MCP_TOOLS.length} tools`);
  assert.equal(new Set(MCP_TOOLS.map((t) => t.name)).size, MCP_TOOLS.length, "duplicate tool name");

  for (const tool of MCP_TOOLS) {
    // A model picks a tool from its name and description alone. A thin
    // description is the difference between the right tool and a guess.
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, `${tool.name} is not a plain snake_case name`);
    assert.ok(tool.description.length > 60, `${tool.name} has a thin description`);
    assert.ok(tool.inputSchema, `${tool.name} has no input schema`);
  }
});

test("nothing in the surface is named like a write", () => {
  // Read-only is the whole premise of this version. A tool called create_* or
  // delete_* would mean the premise had quietly stopped being true.
  for (const tool of MCP_TOOLS) {
    assert.doesNotMatch(
      tool.name,
      /^(create|add|update|delete|remove|set|log|move|mark|seal)_/,
      `${tool.name} sounds like it writes`,
    );
  }
});

test("arguments that do not fit are refused before any lookup happens", async () => {
  // Each of these throws from the schema check, which runs before the function
  // body — so nothing reaches Supabase, and the message names the field.
  await assert.rejects(
    () => get("list_applications").run({ stage: "banana" }),
    /stage/,
    "an invalid stage was accepted",
  );
  await assert.rejects(
    () => get("list_applications").run({ lane: "sideways" }),
    /lane/,
  );
  await assert.rejects(
    () => get("search_brain").run({ query: "x", limit: 9999 }),
    /limit/,
    "an unbounded limit was accepted",
  );
  await assert.rejects(
    () => get("search_brain").run({ query: "x", limit: 0 }),
    /limit/,
  );
  await assert.rejects(
    () => get("search_brain").run({}),
    /query/,
    "a search with no query was accepted",
  );
  await assert.rejects(
    () => get("contact_history").run({ name: 42 }),
    /name/,
  );
});

test("the error names the argument, so the model can correct itself", async () => {
  // A model that is told "limit: too big" retries correctly. One told
  // "invalid input" tries the same call again.
  await assert.rejects(() => get("search_brain").run({ query: "x", limit: 500 }), (err: Error) => {
    assert.match(err.message, /search_brain/);
    assert.match(err.message, /limit/);
    return true;
  });
});

test("tools that take no arguments accept nothing, null and empty alike", async () => {
  // The transports differ on what they send for a no-argument call. All three
  // must get past the schema rather than failing before the lookup.
  for (const tool of ["pipeline_summary", "today", "needs_attention"]) {
    const schema = get(tool).inputSchema;
    for (const given of [{}, undefined, null]) {
      assert.ok(
        schema.safeParse(given ?? {}).success,
        `${tool} rejected ${JSON.stringify(given)}`,
      );
    }
  }
});

test("optional filters really are optional", () => {
  // Every filter on these is a narrowing, so a bare call must be valid —
  // otherwise "list my applications" fails until the model guesses a filter.
  assert.ok(get("list_applications").inputSchema.safeParse({}).success);
  assert.ok(get("list_contacts").inputSchema.safeParse({}).success);
  assert.ok(get("search_brain").inputSchema.safeParse({ query: "anything" }).success);
});
