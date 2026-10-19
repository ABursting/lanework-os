/**
 * The browser's only route to the database: fetch against /api.
 *
 * Nothing here talks to Supabase. RLS denies the anon key everything, so a
 * direct client write would fail silently-ish anyway; routing through /api is
 * what makes the failure legible. These helpers deliberately throw with the
 * server's own message so a form can render the real reason rather than a
 * generic "something went wrong".
 */

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: { data?: T; error?: string } | null = null;
  try {
    payload = await res.json();
  } catch {
    // A non-JSON response means the route crashed before it could format one.
  }

  if (!res.ok) {
    const message = payload?.error ?? `${method} ${url} failed (${res.status})`;
    console.error(`[client] ${message}`);
    throw new Error(message);
  }
  return payload!.data as T;
}

export const api = {
  post: <T>(url: string, body?: unknown) => send<T>(url, "POST", body ?? {}),
  patch: <T>(url: string, body: unknown) => send<T>(url, "PATCH", body),
  del: <T>(url: string) => send<T>(url, "DELETE"),
  get: <T>(url: string) => send<T>(url, "GET"),
};

/** Narrow an unknown catch into something safe to show a human. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
