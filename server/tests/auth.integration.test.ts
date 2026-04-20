import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testAuth = (await shouldRunDbIntegrationTests()) ? test : test.skip;

function extractCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return "";
  return setCookie.split(";")[0] ?? "";
}

testAuth("fluxo de autenticacao: register -> me -> logout", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { setupAuth } = await import("../auth");
  const { db } = await import("../db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  setupAuth(app);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const username = `it_auth_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const password = "SenhaIntegracaoForte!123";
  let cookie = "";

  try {
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, nomeCompleto: "Teste Integracao" }),
    });
    assert.equal(registerRes.status, 200);
    cookie = extractCookie(registerRes);
    assert.ok(cookie.includes("fincontrol.sid"));

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie },
    });
    assert.equal(meRes.status, 200);
    const me = await meRes.json() as { username: string; nomeCompleto: string | null };
    assert.equal(me.username, username);
    assert.equal(me.nomeCompleto, "Teste Integracao");

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(logoutRes.status, 200);

    const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie },
    });
    assert.equal(meAfterLogout.status, 401);
  } finally {
    await db.delete(users).where(eq(users.username, username));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
