import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  authMode,
  createSessionToken,
  passwordMatches,
  safeNextPath,
  verifySessionToken,
} from "../src/lib/auth/session.ts";

const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  env.APP_PASSWORD = "correct horse battery staple";
  env.AUTH_SECRET = "test-secret-that-is-long-enough-to-mean-something";
  env.NODE_ENV = "production";
});

test("a fresh session cookie is accepted", async () => {
  assert.equal(await verifySessionToken(await createSessionToken()), true);
});

/**
 * Every position, not one.
 *
 * This used to change only the final character, swapping "A" for "B" — and
 * failed about one run in sixteen. The signature is 32 bytes, which base64url
 * encodes as 43 characters, and the last of those carries only four meaningful
 * bits; the remaining two are padding that decoding throws away. So the final
 * character is always one of the sixteen whose index is a multiple of four,
 * and when it happened to be "A", changing it to "B" moved nothing but a
 * padding bit. The bytes came back identical, the cookie verified, and a
 * correct implementation looked like a broken one.
 *
 * Stepping four places along the alphabet instead changes a real bit wherever
 * it is applied, so every position is a genuine tamper.
 */
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

test("a cookie with any character changed is rejected", async () => {
  const token = await createSessionToken();

  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    // The two separators are structure, not payload; a cookie that loses one
    // is rejected for being the wrong shape, which is tested elsewhere.
    if (c === ".") continue;
    const swapped = B64URL[(B64URL.indexOf(c) + 4) % 64];
    const tampered = token.slice(0, i) + swapped + token.slice(i + 1);
    assert.equal(
      await verifySessionToken(tampered),
      false,
      `changing character ${i} of the cookie did not invalidate it`,
    );
  }
});

test("a cookie cannot have its expiry pushed back", async () => {
  const token = await createSessionToken();
  const [, nonce, sig] = token.split(".");
  const forged = `${Date.now() + 10 * 365 * 86_400_000}.${nonce}.${sig}`;
  assert.equal(await verifySessionToken(forged), false);
});

test("an expired cookie is rejected", async () => {
  const issued = Date.now() - 31 * 86_400_000;
  assert.equal(await verifySessionToken(await createSessionToken(issued)), false);
});

test("changing the password signs out every existing cookie", async () => {
  const token = await createSessionToken();
  env.APP_PASSWORD = "a brand new password";
  assert.equal(await verifySessionToken(token), false);
});

test("changing the secret signs out every existing cookie", async () => {
  const token = await createSessionToken();
  env.AUTH_SECRET = "rotated-secret-rotated-secret-rotated";
  assert.equal(await verifySessionToken(token), false);
});

test("garbage and missing cookies are rejected, not thrown on", async () => {
  for (const junk of [undefined, "", "a.b", "x.y.z", "123.abc.$$$", "..."]) {
    assert.equal(await verifySessionToken(junk), false, String(junk));
  }
});

test("the password check accepts only the exact password", async () => {
  assert.equal(await passwordMatches("correct horse battery staple"), true);
  assert.equal(await passwordMatches("correct horse battery stapl"), false);
  assert.equal(await passwordMatches("Correct horse battery staple"), false);
  assert.equal(await passwordMatches(""), false);
  assert.equal(await passwordMatches(undefined), false);
  assert.equal(await passwordMatches(12345), false);
});

test("a deployed copy with no password refuses everything", () => {
  delete env.APP_PASSWORD;
  assert.equal(authMode(), "misconfigured");
  env.APP_PASSWORD = "set";
  delete env.AUTH_SECRET;
  assert.equal(authMode(), "misconfigured");
});

test("only local development may run without a password", () => {
  delete env.APP_PASSWORD;
  env.NODE_ENV = "development";
  assert.equal(authMode(), "disabled-dev");
  env.APP_PASSWORD = "set";
  env.AUTH_SECRET = "set";
  assert.equal(authMode(), "enforced");
});

test("after logging in, you only ever land on a page of this site", () => {
  assert.equal(safeNextPath("/crm/tasks?status=done"), "/crm/tasks?status=done");
  assert.equal(safeNextPath(undefined), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/api/contacts"), "/");
});
