import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySessionToken } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/demo";

/**
 * The password gate. Runs before every page and every API route.
 *
 * Signed in: the request passes through untouched. Not signed in: pages
 * redirect to /login and remember where you were going; API routes answer 401,
 * which the error banner reads out, so a session that expires mid-use says so
 * instead of failing silently.
 *
 * Left outside the gate, each for a stated reason:
 *   /login, /api/auth/*  — you have to be able to reach the door.
 *   /api/cron/*          — Vercel's scheduler has no cookie. The backup route
 *                          checks CRON_SECRET itself and refuses anything else.
 *   /_next/*, files      — the site's own scripts and styles, which carry no data.
 *
 * Anything added to that list later (the Telegram connection, for one) must
 * bring its own check, the way the backup route does.
 */
export async function middleware(req: NextRequest) {
  /*
    The public demo opens to everyone, by design — a demo behind a password is
    not a demo. This is the single deliberate exception to hard rule 2 in
    CLAUDE.md ("the gate fails closed in production"), approved by Asher on
    2026-10-03, and it is confined to these two lines.

    What makes it safe is not this check but the one behind it: the demo
    deployment refuses to serve or change anything unless the database it is
    connected to proves it is the demo database, which holds only invented
    data. See src/lib/demoGuard.ts.
  */
  if (DEMO_MODE) return NextResponse.next();

  const mode = authMode();
  if (mode === "disabled-dev") return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (mode === "misconfigured") {
    console.error("[auth] APP_PASSWORD or AUTH_SECRET is not set — refusing every request.");
    const message =
      "This dashboard has no password configured, so it is refusing to serve anything. " +
      "Set APP_PASSWORD and AUTH_SECRET in the hosting settings and redeploy.";
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { "content-type": "text/plain" } });
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json(
      { error: "Not signed in — your login may have expired. Reload the page to log in again." },
      { status: 401 },
    );
  }

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!login|api/auth/|api/cron/|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
