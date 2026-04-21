import test from "node:test";
import assert from "node:assert/strict";
import { buildPersistableAuditEventForTests } from "../audit-log";
import { sanitizeForLog } from "../logger";

test("audit event sanitiza campos sensiveis e financeiros", () => {
  const event = buildPersistableAuditEventForTests({
    action: "payment",
    status: "success",
    domain: "parcelas",
    route: "/api/parcelas/123",
    method: "patch",
    userId: "user-1",
    targetId: "parcela-1",
    requestId: "req-123",
    requestIp: "127.0.0.1",
    userAgent: "Mozilla/5.0 Test",
    details: {
      valor: "100.00",
      status: "pago",
      token: "abc123",
      nested: {
        password: "secret",
      },
      requestPayload: {
        qualquer: "coisa",
      },
    },
    error: "token=abc123",
  });

  const details = event.details as Record<string, unknown>;

  assert.equal(details.valor, "[REDACTED_FINANCIAL]");
  assert.equal(details.token, "[REDACTED]");
  assert.equal((details.nested as Record<string, unknown>).password, "[REDACTED]");
  assert.match(String(details.requestPayload), /^\[OMITTED_/);
  assert.equal(event.error, "token=[REDACTED]");
  assert.equal(event.requestId, "req-123");
  assert.notEqual(event.ipHash, "127.0.0.1");
  assert.equal(event.ipHash?.length, 24);
});

test("audit event limita route e user-agent muito grandes", () => {
  const longRoute = `/api/${"x".repeat(300)}`;
  const longAgent = "agent ".repeat(80);

  const event = buildPersistableAuditEventForTests({
    action: "auth",
    status: "failure",
    domain: "auth.login",
    route: longRoute,
    method: "post",
    userAgent: longAgent,
  });

  assert.ok(event.route.length <= 194);
  assert.ok(event.route.includes("[TRUNCATED]"));
  assert.ok((event.userAgent ?? "").length <= 194);
  assert.ok((event.userAgent ?? "").includes("[TRUNCATED]"));
  assert.equal(event.method, "POST");
});

test("sanitizeForLog remove segredos em texto livre e reduz payload tecnico", () => {
  const raw = sanitizeForLog({
    message: "authorization: Bearer abc.def.ghi token=xyz password=123",
    headers: {
      authorization: "Bearer another-token",
      cookie: "sid=abc",
    },
    valorTotal: "1500.00",
  }, {
    redactFinancial: true,
    dropHeavyPayloads: true,
  }) as Record<string, unknown>;

  assert.equal(raw.valorTotal, "[REDACTED_FINANCIAL]");
  assert.equal(raw.message, "authorization: Bearer [REDACTED] token=[REDACTED] password=[REDACTED]");
  assert.match(String(raw.headers), /^\[OMITTED_/);
});
