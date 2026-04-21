import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { scrypt } from "node:crypto";

const scryptAsync = promisify(scrypt);
const hasAuthEnv = Boolean(process.env.DATABASE_URL?.trim()) && Boolean(process.env.SESSION_SECRET?.trim());

async function loadAuthModule() {
  return import("../auth");
}

const testAuth = hasAuthEnv ? test : test.skip;

testAuth("hashPassword gera hash com salt valido e verifica senha correta", async () => {
  const { hashPassword } = await loadAuthModule();
  const password = "SenhaSuperForte!123";
  const hash = await hashPassword(password);

  const [hashHex, salt] = hash.split(".");
  assert.ok(hashHex);
  assert.ok(salt);

  const recomputed = (await scryptAsync(password, salt, 64)) as Buffer;
  assert.equal(recomputed.toString("hex"), hashHex);
});

testAuth("hashPassword usa salt aleatorio para evitar hashes iguais", async () => {
  const { hashPassword } = await loadAuthModule();
  const password = "SenhaSuperForte!123";
  const hashA = await hashPassword(password);
  const hashB = await hashPassword(password);

  assert.notEqual(hashA, hashB);
});

testAuth("requireAuth permite seguir quando usuario autenticado", async () => {
  const { requireAuth } = await loadAuthModule();
  let calledNext = false;
  const req = {
    isAuthenticated: () => true,
  };
  const res = {
    status: () => ({
      json: () => null,
    }),
  };

  requireAuth(req as any, res as any, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
});

testAuth("requireAuth responde 401 quando usuario nao autenticado", async () => {
  const { requireAuth } = await loadAuthModule();
  let statusCode = 0;
  let payload: any;
  const req = {
    isAuthenticated: () => false,
  };
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: unknown) => {
          payload = body;
          return body;
        },
      };
    },
  };

  requireAuth(req as any, res as any, () => {
    assert.fail("Nao deveria chamar next para usuario nao autenticado");
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(payload, { message: "Nao autenticado" });
});
