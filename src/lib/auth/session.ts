/**
 * The password screen's session: a signed cookie, checked on every request.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The scope cut authentication from v1 because the app was only ever going to
 * run on Asher's own machine. Deploying it puts every contact, note and
 * application on a public address, and puts the capture bar — which spends
 * Anthropic credit — in front of anyone who finds the link. On 2026-09-14 he
 * approved a single shared password as the fix. It is access control, not
 * identity: there is still exactly one user, and USER_ID is untouched.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 * Entering the password sets a cookie holding an expiry and a random value,
 * signed with a key derived from AUTH_SECRET *and* APP_PASSWORD. The gate in
 * src/middleware.ts re-checks that signature on every request. Nothing is
 * stored server-side, which has two consequences worth knowing:
 *
 *   - Changing APP_PASSWORD or AUTH_SECRET invalidates every cookie ever
 *     issued. That is the "sign out every device" lever.
 *   - "Log out" only removes the cookie from the browser you click it in.
 *
 * ── Constraints on this file ────────────────────────────────────────────────
 * It runs in the middleware (Vercel's edge runtime) as well as in ordinary
 * server routes, so it uses only the Web Crypto API — no `node:crypto`, no
 * `server-only` import. It must still never be imported by client code: it
 * reads secrets from the environment, which the browser does not have.
 */

export const SESSION_COOKIE = "lanework_session";
export const SESSION_DAYS = 30;

export type AuthMode =
  /** Password and secret are set: every request is checked. */
  | "enforced"
  /** Local development with no password configured: the gate stands aside. */
  | "disabled-dev"
  /** A production build with no password configured: refuse everything. */
  | "misconfigured";

/**
 * Fails closed. A deployed copy with no password set does not quietly serve
 * your data to the internet — it serves an error until the password is added.
 * Only `next dev` on your own machine is allowed to run without one.
 */
export function authMode(): AuthMode {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (password && secret) return "enforced";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "disabled-dev";
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * An HMAC key derived from the configured secrets. `purpose` keeps the cookie
 * key and the password-comparison key distinct, so one can never stand in for
 * the other. JSON encoding keeps the parts unambiguous whatever characters the
 * secrets themselves contain.
 */
async function hmacKey(purpose: "session" | "password"): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET ?? "";
  // The session key folds in the password, so changing it invalidates every
  // existing cookie. The comparison key must not — it checks candidates
  // against the real password.
  const material =
    purpose === "session"
      ? JSON.stringify(["session", secret, process.env.APP_PASSWORD ?? ""])
      : JSON.stringify(["password", secret]);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/**
 * Compare a typed password with the real one without leaking, through timing,
 * how many leading characters were right. HMAC verification is constant-time,
 * so the candidate is checked against the real password's signature rather
 * than compared as a string.
 */
export async function passwordMatches(candidate: unknown): Promise<boolean> {
  const real = process.env.APP_PASSWORD;
  if (!real || typeof candidate !== "string") return false;
  const key = await hmacKey("password");
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(real));
  return crypto.subtle.verify("HMAC", key, expected, encoder.encode(candidate));
}

/** A fresh cookie value, valid for SESSION_DAYS. */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const expires = now + SESSION_DAYS * 86_400_000;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const key = await hmacKey("session");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v1.${expires}.${nonce}`),
  );
  return `${expires}.${nonce}.${toBase64Url(signature)}`;
}

/** True only for an unexpired cookie signed with the current secrets. */
export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresText, nonce, signatureText] = parts;

  const expires = Number(expiresText);
  if (!/^\d+$/.test(expiresText) || !Number.isFinite(expires) || expires <= now) return false;

  const signature = fromBase64Url(signatureText);
  if (!signature) return false;

  const key = await hmacKey("session");
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`v1.${expiresText}.${nonce}`),
  );
}

/**
 * Where to send someone after logging in. Only a path on this site — a full
 * address would let a crafted login link bounce you somewhere else entirely.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/api/")) return "/";
  return next;
}
