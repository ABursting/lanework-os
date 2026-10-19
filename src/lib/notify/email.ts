import "server-only";
import { DEMO_MODE } from "@/lib/demo";

/**
 * Outbound email, through Resend's HTTP API.
 *
 * Deliberately a single fetch rather than Resend's SDK: one request is all
 * this needs, and every dependency is one more thing that can behave
 * differently once bundled for Vercel.
 *
 * Without a verified domain, Resend only delivers from its shared
 * onboarding@resend.dev address to the email on your own Resend account — which
 * is exactly the one recipient a login alert has. LOGIN_ALERT_TO must be that
 * address until a domain is verified.
 */

export type EmailResult =
  | { status: "sent" }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; reason: string };

export async function sendAlertEmail(message: {
  subject: string;
  text: string;
}): Promise<EmailResult> {
  /*
    The public demo sends no mail, ever. It has no password to sign in through,
    so there is nothing legitimate to alert about — and a public deployment
    that can trigger email to Asher's inbox is a way to pester him from the
    internet. Refused here rather than at the call site so no future caller can
    reopen it by accident.
  */
  if (DEMO_MODE) {
    return { status: "not_configured", reason: "email is off in demo mode" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.LOGIN_ALERT_TO?.trim();
  const from = process.env.LOGIN_ALERT_FROM?.trim() || "Lanework <onboarding@resend.dev>";

  if (!apiKey || !to) {
    const reason = `${!apiKey ? "RESEND_API_KEY" : "LOGIN_ALERT_TO"} is not set`;
    console.warn(`[notify:email] not sent — ${reason}`);
    return { status: "not_configured", reason };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text }),
      // A slow mail provider must not hold a login hostage.
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string; name?: string };
        detail = `${detail}: ${body.message ?? body.name ?? "no detail"}`;
      } catch {
        // Not JSON; the status is all there is.
      }
      console.error(`[notify:email] Resend refused the alert — ${detail}`);
      return { status: "failed", reason: detail };
    }
    return { status: "sent" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[notify:email] could not reach Resend — ${reason}`, err);
    return { status: "failed", reason };
  }
}
