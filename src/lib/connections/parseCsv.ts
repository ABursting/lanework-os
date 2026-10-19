/**
 * Reading LinkedIn's export of your own connections.
 *
 * ── Where the file comes from ───────────────────────────────────────────────
 * LinkedIn → Settings & Privacy → Data Privacy → Get a copy of your data →
 * "Want something in particular?" → Connections. That arrives in minutes,
 * where the full archive takes a day — and, more to the point, the full
 * archive also contains private messages, search history and everything else.
 * Asking for Connections alone means the rest never lands on the disk.
 *
 * No agent collects this. LinkedIn has no API for an individual's connections,
 * and automated browsing as the account holder breaks its terms and risks the
 * account. This is his own data, exported by him.
 *
 * ── What is deliberately dropped ────────────────────────────────────────────
 * The file carries an email column. It is not read. The radar matches people
 * to companies and drafts a message he sends himself on LinkedIn; an address
 * adds nothing to that, and several hundred people's email addresses is not
 * something to hold without a reason.
 *
 * ── Why a parser rather than split(",") ─────────────────────────────────────
 * Real names and job titles contain commas — "Director, Product" and
 * "Smith, Jr." both appear in a few hundred connections — and splitting on
 * commas shifts every later column by one for exactly those rows. The failure
 * is silent: the title lands in the company field and the person is quietly
 * attributed to the wrong employer, which for this feature is the whole point
 * being wrong.
 */

export interface ParsedConnection {
  name: string;
  profile_url: string | null;
  company: string | null;
  position: string | null;
  /** YYYY-MM-DD, or null when the column is missing or unreadable. */
  connected_on: string | null;
}

export interface ParseResult {
  connections: ParsedConnection[];
  /** Rows the file contained but that could not be used, with the reason. */
  skipped: { line: number; reason: string }[];
}

/**
 * One line of CSV into its fields, respecting quotes.
 *
 * A quoted field may contain commas and newlines; a doubled quote inside a
 * quoted field is a literal quote. This handles the first two — the parser
 * splits on newlines first, so a field containing a newline is not supported,
 * which LinkedIn's export does not produce.
 */
function splitRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(current);
      current = "";
    } else current += char;
  }

  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * LinkedIn writes a few lines of explanation above the header. The header is
 * the first line that names the columns, so that is what is searched for
 * rather than a fixed number of lines to skip — the preamble's length has
 * changed before and would silently take the first connections with it.
 */
function findHeader(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 20); i += 1) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("first name") && lower.includes("last name")) return i;
  }
  return -1;
}

/** "20 Mar 2024" and "03/20/24" both appear depending on account locale. */
function parseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const words = value.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (words) {
    const month = MONTHS[words[2].slice(0, 3).toLowerCase()];
    if (month) return `${words[3]}-${month}-${words[1].padStart(2, "0")}`;
  }

  const slashes = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashes) {
    const [, month, day, year] = slashes;
    const full = year.length === 2 ? `20${year}` : year;
    return `${full}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

const blank = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function parseConnectionsCsv(text: string): ParseResult {
  // Strip a byte-order mark; Excel adds one if the file has been opened there,
  // and it would otherwise become part of the first column's name.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  const headerIndex = findHeader(lines);
  if (headerIndex < 0) {
    throw new Error(
      "This does not look like a LinkedIn Connections export — no row naming " +
        "First Name and Last Name was found in the first 20 lines.",
    );
  }

  const header = splitRow(lines[headerIndex]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => {
    for (const name of names) {
      const i = header.indexOf(name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iFirst = col("first name");
  const iLast = col("last name");
  const iUrl = col("url", "profile url");
  const iCompany = col("company");
  const iPosition = col("position");
  const iWhen = col("connected on");

  const connections: ParsedConnection[] = [];
  const skipped: ParseResult["skipped"] = [];
  const seen = new Set<string>();

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;

    const fields = splitRow(raw);
    const name = [blank(fields[iFirst]), blank(fields[iLast])].filter(Boolean).join(" ").trim();

    if (!name) {
      // LinkedIn exports a row with no name for connections who have since
      // restricted their profile. Nothing can be done with those.
      skipped.push({ line: i + 1, reason: "no name" });
      continue;
    }

    const profile_url = iUrl >= 0 ? blank(fields[iUrl]) : null;

    // The same person can appear twice if the export overlaps a re-import.
    // Keyed the way the database's unique index is, so the two agree.
    const key = (profile_url ?? name).toLowerCase();
    if (seen.has(key)) {
      skipped.push({ line: i + 1, reason: `duplicate of an earlier row (${name})` });
      continue;
    }
    seen.add(key);

    connections.push({
      name,
      profile_url,
      company: iCompany >= 0 ? blank(fields[iCompany]) : null,
      position: iPosition >= 0 ? blank(fields[iPosition]) : null,
      connected_on: iWhen >= 0 ? parseDate(fields[iWhen] ?? "") : null,
    });
  }

  return { connections, skipped };
}
