/**
 * Score the two AI readers against fixed cases with known right answers.
 *
 *   npm run eval            list the cases; calls nothing
 *   npm run eval -- --run   call the model for every case and write a report
 *
 * Each run is ~17 calls to the model (about $1–3), so a bare `npm run eval`
 * deliberately does nothing but describe what a run would do.
 *
 * The CRM the classifier sees is the fictional one in fixtures.ts, passed in
 * directly: nothing is read from or written to the real database, and no
 * capture row is created.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyCapture } from "../src/lib/ai/classify.ts";
import { extractJobsFromScreenshot } from "../src/lib/ai/extractJobs.ts";
import { MODEL } from "../src/lib/ai/client.ts";
import { ROWS } from "./fixtures.ts";
import { NOTE_CASES, SCREENSHOT_CASES, type Check } from "./cases.ts";

const DIR = new URL(".", import.meta.url).pathname;

interface Result {
  kind: "note" | "screenshot";
  id: string;
  probes: string;
  checks: Check[];
  error?: string;
  ms: number;
}

function dataUrl(file: string): string {
  const bytes = readFileSync(join(DIR, "screenshots", file));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function timed(fn: () => Promise<Check[]>): Promise<{ checks: Check[]; error?: string; ms: number }> {
  const start = Date.now();
  try {
    return { checks: await fn(), ms: Date.now() - start };
  } catch (err) {
    return { checks: [], error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
  }
}

async function main() {
  const total = NOTE_CASES.length + SCREENSHOT_CASES.length;
  if (!process.argv.includes("--run")) {
    console.log(`${NOTE_CASES.length} note cases, ${SCREENSHOT_CASES.length} screenshot cases.`);
    for (const c of NOTE_CASES) console.log(`  note        ${c.id.padEnd(26)} ${c.probes}`);
    for (const c of SCREENSHOT_CASES) console.log(`  screenshot  ${c.id.padEnd(26)} ${c.probes}`);
    console.log(`\nNothing was sent. A run makes ${total} model calls (${MODEL}).`);
    console.log("To run it:  npm run eval -- --run");
    return;
  }

  const results: Result[] = [];
  for (const c of NOTE_CASES) {
    process.stdout.write(`note ${c.id} … `);
    const r = await timed(async () => c.expect(await classifyCapture(c.note, ROWS)));
    results.push({ kind: "note", id: c.id, probes: c.probes, ...r });
    console.log(r.error ? "ERROR" : `${r.checks.filter((x) => x.pass).length}/${r.checks.length}`);
  }
  for (const c of SCREENSHOT_CASES) {
    process.stdout.write(`screenshot ${c.id} … `);
    const r = await timed(async () =>
      c.expect(await extractJobsFromScreenshot(c.files.map(dataUrl), null, {
        applications: ROWS.applications,
        companies: ROWS.companies,
      })),
    );
    results.push({ kind: "screenshot", id: c.id, probes: c.probes, ...r });
    console.log(r.error ? "ERROR" : `${r.checks.filter((x) => x.pass).length}/${r.checks.length}`);
  }

  // A case passes only if every one of its checks does — a reading that gets
  // the company right and drops the second move is still a wrong reading.
  const casesPassed = results.filter((r) => !r.error && r.checks.every((c) => c.pass)).length;
  const checks = results.flatMap((r) => r.checks);
  const checksPassed = checks.filter((c) => c.pass).length;

  const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 16);
  const lines = [
    `# Eval run ${stamp.replace("T", " ")}`,
    "",
    `Model: \`${MODEL}\` · fictional CRM from \`evals/fixtures.ts\``,
    "",
    `**${casesPassed}/${results.length} cases fully correct** · ${checksPassed}/${checks.length} individual checks`,
    "",
    "| | Case | What it probes | Checks | Time |",
    "|---|---|---|---|---|",
    ...results.map((r) => {
      const ok = !r.error && r.checks.every((c) => c.pass);
      return `| ${ok ? "✅" : "❌"} | ${r.kind}: \`${r.id}\` | ${r.probes} | ` +
        `${r.error ? "error" : `${r.checks.filter((c) => c.pass).length}/${r.checks.length}`} | ` +
        `${(r.ms / 1000).toFixed(1)}s |`;
    }),
    "",
    "## Failures",
    "",
    ...results.flatMap((r) => {
      const failed = r.checks.filter((c) => !c.pass);
      if (!r.error && failed.length === 0) return [];
      return [
        `**${r.id}**`,
        ...(r.error ? [`- error: ${r.error}`] : []),
        ...failed.map((c) => `- ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
        "",
      ];
    }),
  ];
  mkdirSync(join(DIR, "results"), { recursive: true });
  const out = join(DIR, "results", `${stamp}.md`);
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\n${casesPassed}/${results.length} cases, ${checksPassed}/${checks.length} checks. Report: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
