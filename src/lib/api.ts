import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Shared plumbing for the /api routes.
 *
 * The rule this file exists to enforce: a server error is always logged with
 * its context before anything is returned to the browser. A silently swallowed
 * insert is the worst failure mode in this app — the card animates as if it
 * saved, then the row is gone on the next refresh, and there is nothing
 * anywhere to explain why.
 */

export type ApiResult<T> = { data: T } | { error: string };

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, detail?: unknown): NextResponse {
  if (detail !== undefined) {
    console.error(`[api] ${message}`, detail);
  }
  return NextResponse.json({ error: message }, { status });
}

/**
 * Postgres codes that mean the code expects something the database does not
 * have yet — a migration that has not been run.
 */
const MISSING_SCHEMA = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

/**
 * A human-readable message from anything thrown.
 *
 * A database error from Supabase arrives as a plain object with a `message`,
 * not as an Error, so `String(err)` turned it into "[object Object]" — which
 * is exactly what the banner showed on 2026-09-16 when a screenshot import
 * failed, hiding that a column was missing.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const { message, code } = err as { message?: unknown; code?: unknown };
    const text = String(message ?? "Unknown error");
    if (typeof code === "string" && MISSING_SCHEMA.has(code)) {
      return (
        `${text}. The database is behind the app — a migration has not been run. ` +
        "Paste supabase/check_migrations.sql into the Supabase SQL Editor to see which."
      );
    }
    return text;
  }
  return String(err);
}

/** Log a thrown error with the route that produced it, then return a 500. */
export function serverError(scope: string, err: unknown): NextResponse {
  const message = describeError(err);
  console.error(`[api:${scope}] unhandled error: ${message}`, err);
  return NextResponse.json(
    { error: `${scope} failed: ${message}` },
    { status: 500 },
  );
}

/** Log a PostgREST error with everything Supabase gave us, then return a 500. */
export function dbError(scope: string, err: PostgrestError): NextResponse {
  console.error(
    `[api:${scope}] postgrest ${err.code ?? "?"}: ${err.message}` +
      (err.details ? ` | details: ${err.details}` : "") +
      (err.hint ? ` | hint: ${err.hint}` : ""),
  );
  return NextResponse.json({ error: err.message }, { status: 500 });
}

/** Wrap a route body so nothing can throw past it unlogged. */
export function route(
  scope: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return fn().catch((err) => serverError(scope, err));
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Check the NOT NULL columns before the insert rather than after.
 *
 * Postgres would reject a null anyway, but it rejects it as a 23502 several
 * layers away from the field the user actually left blank. Catching it here
 * means the message names the field.
 */
export function requireFields<T extends object>(
  body: T,
  fields: readonly (keyof T)[],
): void {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  if (missing.length > 0) {
    throw new ValidationError(`Missing required field(s): ${missing.join(", ")}`);
  }
}

/** Reject a value that is not in the allowed set for a CHECK-constrained column. */
export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(value)})`,
    );
  }
  return value as T;
}

/** Same, but lets the column stay null. */
export function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (value === undefined || value === null || value === "") return null;
  return requireOneOf(value, allowed, field);
}

/** Trim a string to null so empty inputs don't land as "" in nullable columns. */
export function nullable(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const t = value.trim();
  return t === "" ? null : t;
}

/** Parse a JSON body, turning a malformed one into a ValidationError. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Request body was not valid JSON");
  }
}

/** Turn a ValidationError into a 400 and anything else into a logged 500. */
export function handleThrown(scope: string, err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    console.warn(`[api:${scope}] validation: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return serverError(scope, err);
}
