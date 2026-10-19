import { Panel } from "./Panel";

/**
 * What a page shows when its query failed.
 *
 * The error is logged server-side with its scope and also shown here, rather
 * than rendering an empty card: an empty CRM and a broken connection look
 * identical otherwise, and the difference matters a lot.
 */
export function DataError({ scope, error }: { scope: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[page:${scope}] ${message}`, error);

  const unconfigured = message.includes("Supabase is not configured");

  return (
    <Panel className="max-w-[720px] p-4">
      <div className="kicker" style={{ color: "var(--color-danger)" }}>
        {unconfigured ? "Not connected" : `${scope} unavailable`}
      </div>
      <p className="m-0 mt-2 text-[13.5px] text-dim">
        {unconfigured
          ? "Supabase credentials are missing. Copy .env.example to .env.local, fill in the project URL and service-role key, then restart the dev server."
          : message}
      </p>
    </Panel>
  );
}
