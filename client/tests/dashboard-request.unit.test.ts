import test from "node:test";
import assert from "node:assert/strict";
import { fetchDashboardOverview } from "../src/services/api/dashboard";

test("dashboard request cancels the network when its query is cancelled", async (t) => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(requestSignal!.reason), { once: true });
    });
  });
  const request = fetchDashboardOverview("2026-11", controller.signal);
  controller.abort();
  await assert.rejects(request);
  assert.equal(requestSignal?.aborted, true);
});

test("dashboard timeout aborts the network rather than leaving it running", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(requestSignal!.reason), { once: true });
    });
  });
  const request = fetchDashboardOverview("2026-11");
  const rejection = assert.rejects(request, /Tempo limite/);
  t.mock.timers.tick(12_000);
  await rejection;
  assert.equal(requestSignal?.aborted, true);
});

test("dashboard returns real data and preserves HTTP failures", async (t) => {
  const payload = { mesReferencia: "2026-11", financialSummary: { saldoPrevisto: 123 } };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  assert.deepEqual(await fetchDashboardOverview("2026-11"), payload);
  fetchMock.mock.mockImplementation(async () => new Response("indisponível", { status: 503 }));
  await assert.rejects(fetchDashboardOverview("2026-11"), /503: indisponível/);
});
