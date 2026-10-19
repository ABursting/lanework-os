/**
 * Demo mode: the public, fictional copy of the dashboard.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 * One switch, `NEXT_PUBLIC_DEMO_MODE=1`, set on a *second* Vercel project built
 * from this same repository and pointed at a *separate* Supabase project that
 * holds nothing but invented data. Nobody's real information is ever in it.
 * Decided 2026-10-03; see the portfolio launch list in CLAUDE.md, item 3.
 *
 * Turning it on changes five things:
 *   1. The password gate stands aside, so the site opens to anyone.
 *   2. Login alert emails, the nightly backup and the live calendar feed are
 *      all switched off.
 *   3. The Home calendar reads a fictional .ics shipped in `public/` instead.
 *   4. A banner says the data is fictional and resets nightly.
 *   5. A nightly job wipes the demo database back to its seed, so nothing a
 *      visitor does survives the night.
 *
 * ── The deliberate exception ────────────────────────────────────────────────
 * Hard rule 2 in CLAUDE.md says the password gate fails closed in production.
 * Demo mode breaks that on purpose — a demo nobody can open is not a demo.
 * Asher approved this specifically. It is the only exception, it is confined
 * to the one check in `src/middleware.ts`, and it is why the safety catch
 * below exists: the cost of this switch being set on the wrong deployment is
 * his real data served to the public and then erased at 3am.
 *
 * ── The safety catch ────────────────────────────────────────────────────────
 * Demo mode refuses to serve anything unless the database it is pointed at
 * proves it is the demo one, by carrying a `demo_marker` table that only the
 * demo seed file ever creates. Checking the Supabase URL instead would be
 * weaker: URLs get copied between projects by hand, and a copied env var is
 * exactly the mistake worth defending against. The marker cannot be copied by
 * pasting a key. See `assertDemoDatabase()` in `src/lib/demoGuard.ts`.
 *
 * This module is deliberately free of `server-only` and of any database
 * import, because the banner is a client component and the gate check runs in
 * the edge middleware. Anything that touches Supabase belongs in demoGuard.ts.
 */

/**
 * True on the public demo deployment.
 *
 * Written out in full rather than read through a variable: Next replaces this
 * exact text at build time so the value reaches the browser bundle, and an
 * indirect lookup would arrive as `undefined` in client components.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/** The line shown across the top of every page of the demo. */
export const DEMO_BANNER_TEXT = "Demo — all data is fictional. Resets nightly.";

/**
 * How many live model calls the whole demo may make in one day — everyone
 * who visits, added together, not each.
 *
 * Captures typed by a visitor go to the real model, which costs real money on
 * Asher's key. The sample notes on the capture bar are answered from a
 * recording instead and never count against this. At roughly four cents a
 * capture, this caps a bad day at about a dollar.
 */
export const DEMO_AI_DAILY_CAP = 25;

/** What a visitor sees once the day's allowance is gone. */
export const DEMO_AI_CAP_MESSAGE = "Demo limit reached — try a sample note.";

/**
 * The fictional calendar, served from `public/`. A static file, so the demo
 * never reaches for Asher's real calendar feed even if CALENDAR_ICS_URL were
 * somehow present in its environment.
 */
export const DEMO_CALENDAR_PATH = "/demo-calendar.ics";
