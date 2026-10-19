/**
 * A plain-language check that the setup is actually wired up.
 *
 * Run it with `npm run check`. It never prints a key — only whether each one
 * is present, well-formed, and accepted by the service it belongs to.
 */

const problems = [];
const notes = [];

const ok = (msg) => console.log(`  OK    ${msg}`);
const warn = (msg) => console.log(`  note  ${msg}`);
function bad(msg, fix) {
  console.log(`  FIX   ${msg}`);
  problems.push(fix);
}

console.log("\nChecking .env.local\n");

// — Supabase URL —
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || url.includes("YOUR-PROJECT")) {
  bad(
    "Project URL is still the placeholder",
    'Supabase dashboard -> Project Settings -> Data API -> copy "Project URL" ' +
      "into NEXT_PUBLIC_SUPABASE_URL. It looks like https://abcdefgh.supabase.co",
  );
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim())) {
  bad(
    `Project URL does not look right: ${url}`,
    "It should be exactly https://<your-project-id>.supabase.co — no /dashboard " +
      "and no trailing path. If you copied it out of the browser address bar, " +
      "that is the wrong one.",
  );
} else {
  ok("Project URL looks right");
}

// — service-role key —
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  bad(
    "Service-role key is empty",
    "Supabase dashboard -> Project Settings -> API Keys -> reveal the " +
      "service_role key (not anon) and paste it into SUPABASE_SERVICE_ROLE_KEY.",
  );
} else if (key.trim().length < 40) {
  bad(
    "Service-role key looks too short — it may have been cut off",
    "Re-copy the whole key. It is very long; make sure it all sits on one line " +
      "with no line breaks in the middle.",
  );
} else {
  ok("Service-role key is present");
}

// — the real test: can we reach the database, and did the migration run? —
if (url && key && !url.includes("YOUR-PROJECT")) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url.trim().replace(/\/$/, ""), key.trim(), {
    auth: { persistSession: false },
  });

  const TABLES = [
    "companies", "applications", "contacts", "tasks", "habit_definitions",
    "daily_logs", "raw_captures", "memory_log", "weekly_reviews", "goals",
    "application_events", "user_settings",
  ];

  const missing = [];
  let reachable = true;
  let authFailed = false;

  for (const table of TABLES) {
    // Not a head-only request: for a table that does not exist, a head
    // request can come back with no error at all, so a missing table read as
    // present. Asking for zero rows costs the same and fails honestly.
    const { error } = await db.from(table).select("*").limit(0);
    if (!error) continue;
    if (/Invalid API key|JWT/i.test(error.message)) { authFailed = true; break; }
    if (/fetch failed|ENOTFOUND|getaddrinfo/i.test(error.message)) { reachable = false; break; }
    missing.push(`${table} (${error.message})`);
  }

  if (authFailed) {
    bad(
      "Supabase rejected the key",
      "The key is being read but is not valid for this project. Check that you " +
        "copied the service_role key from THIS project, and all of it.",
    );
  } else if (!reachable) {
    bad(
      "Could not reach that Supabase URL",
      "The address does not resolve. Double-check the Project URL — a typo in " +
        "the project id lands on a host that does not exist.",
    );
  } else if (missing.length > 0) {
    bad(
      `Connected, but ${missing.length} of ${TABLES.length} tables are missing or unreadable`,
      "A migration has not run, or did not finish. Paste " +
        "supabase/check_migrations.sql into the Supabase SQL Editor to see " +
        "which, then run the ones marked NOT RUN from supabase/migrations/.\n" +
        "     First problem: " + missing[0],
    );
  } else {
    ok(`Connected to Supabase, and all ${TABLES.length} tables are there`);
  }
}

// — Anthropic —
const anthropic = process.env.ANTHROPIC_API_KEY;
if (!anthropic) {
  warn("Anthropic key is empty — everything works except captures and AI drafts");
  notes.push(
    "Add ANTHROPIC_API_KEY from console.anthropic.com -> API Keys when you want " +
      "the capture bar and the weekly auto-draft to work.",
  );
} else if (!anthropic.trim().startsWith("sk-ant-")) {
  bad(
    "Anthropic key does not start with sk-ant-",
    "That does not look like an Anthropic key. Re-copy it from " +
      "console.anthropic.com -> API Keys.",
  );
} else {
  // Actually exercise it. countTokens is free and goes through the same auth
  // path as a real request, so it catches an identity-linked key missing its
  // workspace — which otherwise only surfaces as a failed capture later.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic({
    apiKey: anthropic.trim(),
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
    maxRetries: 0,
  });

  try {
    await client.messages.countTokens({
      model: "claude-opus-5",
      messages: [{ role: "user", content: "ping" }],
    });
    ok(
      workspaceId
        ? "Anthropic key works (using the workspace id you set)"
        : "Anthropic key works",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/anthropic-workspace-id is required/i.test(message)) {
      bad(
        "Anthropic key is identity-linked and needs a workspace id",
        "Console -> Settings -> Workspaces, open your workspace, copy its id " +
          "(starts wrkspc_01...), and put it in .env.local as\n" +
          "     ANTHROPIC_WORKSPACE_ID=wrkspc_01...",
      );
    } else if (/authentication|invalid x-api-key|401/i.test(message)) {
      bad(
        "Anthropic rejected the key",
        "Re-copy the key from console.anthropic.com -> API Keys. Check it is " +
          "all on one line and has not been truncated.",
      );
    } else if (/workspace/i.test(message)) {
      bad(
        `Anthropic rejected the workspace id: ${message}`,
        "Check ANTHROPIC_WORKSPACE_ID matches a workspace this key can use. " +
          "It comes from Console -> Settings -> Workspaces and starts wrkspc_01...",
      );
    } else if (/credit|billing|quota/i.test(message)) {
      bad(
        "Anthropic key is valid but the account cannot spend",
        "Add credit at console.anthropic.com -> Billing. Captures and the AI " +
          "drafts need it; nothing else in the app does.",
      );
    } else {
      warn(`Could not verify the Anthropic key: ${message}`);
    }
  }
}

// — password screen —
const appPassword = process.env.APP_PASSWORD ?? "";
const authSecret = process.env.AUTH_SECRET ?? "";
if (!appPassword && !authSecret) {
  warn("No password set — fine on this machine, required before the app goes online");
  notes.push(
    "Before deploying, set APP_PASSWORD (a long passphrase) and AUTH_SECRET " +
      "(run: openssl rand -base64 32) in Vercel. Without them the deployed site " +
      "refuses to open.",
  );
} else if (!appPassword || !authSecret) {
  bad(
    `${appPassword ? "AUTH_SECRET" : "APP_PASSWORD"} is empty but the other is set`,
    "Set both or neither. With only one, the password screen treats the app as " +
      "misconfigured. Generate AUTH_SECRET with: openssl rand -base64 32",
  );
} else {
  if (authSecret.length < 32) {
    bad(
      "AUTH_SECRET is too short to protect the login cookie",
      "Replace it with the output of: openssl rand -base64 32",
    );
  } else {
    ok("AUTH_SECRET is set");
  }
  if (appPassword.length < 16) {
    warn(`APP_PASSWORD is only ${appPassword.length} characters`);
    notes.push(
      "The password is the only thing between the internet and your data. A " +
        "passphrase of four or five unrelated words (20+ characters) is much " +
        "harder to guess than a short one.",
    );
  } else {
    ok("APP_PASSWORD is set and a sensible length");
  }
}

// — login alert emails —
const resendKey = process.env.RESEND_API_KEY?.trim();
const alertTo = process.env.LOGIN_ALERT_TO?.trim();
if (!resendKey && !alertTo) {
  warn("Login alert emails are not set up — logins will work, but no email is sent");
} else if (resendKey && !resendKey.startsWith("re_")) {
  bad(
    "RESEND_API_KEY does not start with re_",
    "Re-copy it from resend.com -> API Keys.",
  );
} else if (!resendKey || !alertTo) {
  bad(
    `${resendKey ? "LOGIN_ALERT_TO" : "RESEND_API_KEY"} is empty`,
    "Login alerts need both: the Resend API key, and LOGIN_ALERT_TO set to the " +
      "email address on your Resend account.",
  );
} else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertTo)) {
  bad(
    "LOGIN_ALERT_TO does not look like an email address",
    "Set it to the address you signed up to Resend with.",
  );
} else {
  // Deliberately not tested live: the only real test is sending an email.
  ok("Login alert email settings look right (not test-sent)");
}

// — calendar —
if (!process.env.CALENDAR_ICS_URL) {
  warn("No calendar feed — the Calendar card will say so; everything else works");
}

console.log();
if (problems.length === 0) {
  console.log("Ready. Run `npm run dev` and open http://localhost:3000\n");
  for (const n of notes) console.log(`  Note: ${n}\n`);
} else {
  console.log(`${problems.length} thing(s) to fix:\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}\n`));
  process.exitCode = 1;
}
