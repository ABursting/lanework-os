import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Log this browser out. Only this browser — the cookie is the whole session.
 * To sign out every device, change APP_PASSWORD; see src/lib/auth/session.ts.
 */
export async function POST() {
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
