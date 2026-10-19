"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { useReportError } from "@/components/ui/ErrorBanner";

/**
 * The password screen.
 *
 * Built to work with a phone's password manager: a real form, a hidden
 * username field so iCloud Keychain and Google Password Manager know what they
 * are saving, and the standard autocomplete hints.
 */
export function LoginForm({ next, misconfigured }: { next: string; misconfigured: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Beside the field, not in the banner: a wrong password is about this form.
  const [wrong, setWrong] = useState<string | null>(null);
  const report = useReportError();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setWrong(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch((err: unknown) => err);

    if (!(res instanceof Response)) {
      report("log in", res);
      setBusy(false);
      return;
    }

    const body = (await res.json().catch(() => null)) as
      | { data?: { alert: string; reason: string | null }; error?: string }
      | null;

    if (res.status === 401) {
      setWrong(body?.error ?? "That password isn't right.");
      setPassword("");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      report("log in", new Error(body?.error ?? `The server answered ${res.status}`));
      setBusy(false);
      return;
    }

    // Signed in. If the alert email did not go out, say so — the banner is
    // kept across the page load below, so it is waiting on the next screen.
    const alert = body?.data?.alert;
    if (alert && alert !== "sent" && process.env.NODE_ENV === "production") {
      report(
        "send the login alert email",
        new Error(
          alert === "not_configured"
            ? `Login alerts are not set up (${body?.data?.reason}). You are logged in, but no email was sent.`
            : `${body?.data?.reason ?? "Unknown error"}. You are logged in, but no email was sent.`,
        ),
      );
    }

    // A full page load rather than an in-app navigation, so every card on the
    // next screen is rendered with the new cookie in place.
    window.location.assign(next);
  }

  return (
    <Panel variant="raised" className="w-full max-w-[380px] p-6">
      <div className="flex items-center gap-[9px]">
        <span
          className="size-[9px] rotate-45 rounded-[2px] bg-accent"
          style={{ boxShadow: "0 0 12px var(--color-accent)" }}
          aria-hidden
        />
        <span className="text-[15px] font-medium tracking-[0.14em]">LANEWORK</span>
      </div>

      {misconfigured ? (
        <p className="m-0 mt-5 text-[13px] leading-[1.55] text-dim">
          No password has been set for this dashboard, so it is refusing to open. Add{" "}
          <code className="font-mono text-[12px]">APP_PASSWORD</code> and{" "}
          <code className="font-mono text-[12px]">AUTH_SECRET</code> in the hosting settings, then
          redeploy.
        </p>
      ) : (
        <form className="mt-5 flex flex-col gap-3" onSubmit={submit}>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value="lanework"
            readOnly
            hidden
          />
          <label className="flex flex-col gap-[6px]">
            <span className="micro">Password</span>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </label>
          {wrong ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--color-danger)" }} role="alert">
              {wrong}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary mt-1" disabled={busy || !password}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      )}
    </Panel>
  );
}
