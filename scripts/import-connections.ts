import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseConnectionsCsv } from "../src/lib/connections/parseCsv.ts";
import { upsertConnections, clearConnections, countConnections } from "../src/lib/db/connections.ts";

/**
 * Load LinkedIn's export of your own connections.
 *
 *   npm run import-connections -- ~/Downloads/Connections.csv
 *   npm run import-connections -- ~/Downloads/Basic_LinkedInDataExport.zip
 *   npm run import-connections -- <either> --replace
 *
 * ── The full archive, and reading only one file out of it ───────────────────
 * LinkedIn does not always offer the Connections-only export; when it does
 * not, what arrives is the whole archive — messages, invitations, search
 * history, ad interests, the lot. The standing rule is that only
 * Connections.csv is ever read.
 *
 * Given a .zip this enforces that rather than trusting it: `unzip -p` streams
 * one named member to standard output and writes nothing to disk, so the other
 * files are never extracted, never opened, and never land anywhere they could
 * be read later by accident. The archive stays packed.
 *
 * A script rather than an upload page, for two reasons. It is an occasional
 * thing — a few times a year at most — so a page would be interface nobody
 * looks at. And several hundred real people's details never travel through a
 * browser this way; the file is read on the laptop and the rows go straight to
 * the database.
 *
 * By default this updates: someone who changed jobs since the last export is
 * corrected, and nobody is removed. `--replace` empties the table first, for
 * when the previous import was wrong rather than merely old.
 */

const args = process.argv.slice(2);
const replace = args.includes("--replace");
/** Read and report, write nothing. Worth doing once before the real run. */
const dryRun = args.includes("--dry-run");
const path = args.find((a) => !a.startsWith("--"));

function bail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!path) {
  bail(
    "Give me the file:\n" +
      "  npm run import-connections -- ~/Downloads/Connections.csv\n" +
      "  npm run import-connections -- ~/Downloads/Basic_LinkedInDataExport.zip\n" +
      "  …add --dry-run to see what it found without writing anything\n\n" +
      "Get it from LinkedIn → Settings & Privacy → Data Privacy →\n" +
      "Get a copy of your data. Connections-only is quicker when offered; the\n" +
      "full archive works too, and only Connections.csv is read out of it.",
  );
}

/**
 * The connections file, from a .csv directly or from one member of a .zip.
 *
 * For an archive this never extracts anything: `unzip -p` writes the one named
 * member to standard output and leaves everything else packed. The messages
 * and the rest of the archive are not read, not copied, and not touched.
 */
function readConnectionsFile(from: string): string {
  if (!from.toLowerCase().endsWith(".zip")) return readFileSync(from, "utf8");

  let listing: string;
  try {
    listing = execFileSync("unzip", ["-Z", "-1", from], { encoding: "utf8" });
  } catch (err) {
    bail(`Could not open ${from} as a zip archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const members = listing.split("\n").map((l) => l.trim()).filter(Boolean);
  const connectionsFile = members.find((m) => /(^|\/)Connections\.csv$/i.test(m));

  if (!connectionsFile) {
    bail(
      `No Connections.csv inside ${from}.\n` +
        `The archive holds ${members.length} files; none of them is the one needed.`,
    );
  }

  console.log(
    `Archive holds ${members.length} files. Reading only ${connectionsFile} — ` +
      "nothing else is extracted or opened.",
  );

  try {
    // maxBuffer raised: a few thousand connections is comfortably over the
    // 1MB default, and exceeding it truncates silently rather than failing.
    return execFileSync("unzip", ["-p", from, connectionsFile], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    bail(`Could not read ${connectionsFile} from the archive: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/*
  Captured here rather than used directly inside main(): the `if (!path)` check
  above narrows it to a string at this point, but TypeScript widens it back
  inside a function, which could be called later.
*/
const sourcePath: string = path;

async function main() {
  if (!dryRun && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    bail("Supabase is not configured — run this through `npm run import-connections`.");
  }

  let text: string;
  try {
    text = readConnectionsFile(sourcePath);
  } catch (err) {
    bail(`Could not read ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed;
  try {
    parsed = parseConnectionsCsv(text);
  } catch (err) {
    bail(err instanceof Error ? err.message : String(err));
  }

  const { connections, skipped } = parsed;
  console.log(`Read ${connections.length} connections from ${sourcePath}`);

  const withCompany = connections.filter((c) => c.company).length;
  console.log(
    `  ${withCompany} list a company (${connections.length - withCompany} do not, ` +
      "so they can never be matched to an application)",
  );

  if (skipped.length > 0) {
    console.log(`  ${skipped.length} rows skipped:`);
    for (const s of skipped.slice(0, 5)) console.log(`    line ${s.line}: ${s.reason}`);
    if (skipped.length > 5) console.log(`    … and ${skipped.length - 5} more`);
  }

  if (connections.length === 0) bail("Nothing to import.");

  if (dryRun) {
    console.log("\nThe first few, as they would be stored:");
    for (const c of connections.slice(0, 5)) {
      console.log(
        `  ${c.name}${c.position ? ` — ${c.position}` : ""}` +
          `${c.company ? ` @ ${c.company}` : " @ (no company)"}` +
          `${c.connected_on ? ` · ${c.connected_on}` : ""}`,
      );
    }
    console.log("\n--dry-run: nothing was written.");
    process.exit(0);
  }

  const before = await countConnections();

  if (replace) {
    console.log(`\nReplacing all ${before} existing rows…`);
    await clearConnections();
  }

  const { written, added, updated } = await upsertConnections(connections);
  const after = await countConnections();

  console.log(
    `\nDone. ${added} added, ${updated} updated (${written} rows written) — ` +
      `the table went from ${before} to ${after}.` +
      (replace ? "" : "\n(Existing people were updated, not duplicated; nobody was removed.)"),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
