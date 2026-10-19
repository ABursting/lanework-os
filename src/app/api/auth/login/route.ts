import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  authMode,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth/session";
import { buildLoginAlert, loginDetailsFrom } from "@/lib/auth/loginAlert";
import { sendAlertEmail } from "@/lib/notify/email";

/**
 * Exchange the password for a session cookie, then email a login alert.
 *
 * The alert is sent before replying rather than after, and the reply says
 * whether it went. Login alerts that fail silently are worse than none: you
 * stop watching for the email and would never learn it had stopped coming.
 * The login page passes a failure on to the error banner. A failed email
 * never blocks the login itself — being locked out of your own dashboard
 * because a mail provider hiccuped would be the wrong trade.
 */
export async function POST(req: Request) {
  const mode = authMode();
  if (mode === "disabled-dev") {
    return NextResponse.json({ data: { alert: "not_configured" } });
  }
  if (mode === "misconfigured") {
    return NextResponse.json(
      { error: "No password is configured on the server. Set APP_PASSWORD and AUTH_SECRET." },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    password = (await readJson<{ password?: unknown }>(req)).password;
  } catch {
    return NextResponse.json({ error: "Enter the password." }, { status: 400 });
  }

  const details = loginDetailsFrom(req.headers);

  if (!(await passwordMatches(password))) {
    console.warn(`[auth] wrong password from ${details.ip ?? "unknown address"}`);
    // A fixed pause on every miss makes guessing slow. It does not stop a
    // determined attacker on its own — a long password does that.
    await new Promise((resolve) => setTimeout(resolve, 900));
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const alert = await sendAlertEmail(buildLoginAlert(details));
  console.log(`[auth] login from ${details.ip ?? "unknown address"}; alert ${alert.status}`);

  const res = NextResponse.json({
    data: { alert: alert.status, reason: "reason" in alert ? alert.reason : null },
  });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
