import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordResetUrl, passwordResetEmailConfigured, sendPasswordResetEmail } from "../password-reset-email";

test("reset URL uses configured origin and encodes token", () => {
  const previous = process.env.PASSWORD_RESET_BASE_URL;
  process.env.PASSWORD_RESET_BASE_URL = "https://fin-control-tau.vercel.app/other";
  try {
    assert.equal(createPasswordResetUrl("a+b"), "https://fin-control-tau.vercel.app/redefinir-senha?token=a%2Bb");
  } finally { if (previous === undefined) delete process.env.PASSWORD_RESET_BASE_URL; else process.env.PASSWORD_RESET_BASE_URL = previous; }
});

test("reset email requires all provider settings", () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try { assert.equal(passwordResetEmailConfigured(), false); }
  finally { if (previous !== undefined) process.env.RESEND_API_KEY = previous; }
});

test("reset email sends plain text and does not expose the token in errors", async () => {
  const originalFetch = globalThis.fetch;
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.PASSWORD_RESET_FROM_EMAIL };
  process.env.RESEND_API_KEY = "test-key";
  process.env.PASSWORD_RESET_FROM_EMAIL = "FinControl <conta@exemplo.com>";
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(null, { status: 202 }); };
  try {
    await sendPasswordResetEmail("user@example.com", "https://example.com/redefinir-senha?token=secret");
    assert.deepEqual(body.to, ["user@example.com"]);
    assert.match(String(body.text), /token=secret/);
    globalThis.fetch = async () => new Response("sensitive", { status: 403 });
    await assert.rejects(() => sendPasswordResetEmail("user@example.com", "https://example.com/secret"), /^Error: Password reset email provider returned 403$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.PASSWORD_RESET_FROM_EMAIL; else process.env.PASSWORD_RESET_FROM_EMAIL = previous.from;
  }
});
