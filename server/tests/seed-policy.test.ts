import test from "node:test";
import assert from "node:assert/strict";
import { resolveDemoSeedConfig } from "../seed-policy";

test("mantem seed desabilitada por padrao", () => {
  const config = resolveDemoSeedConfig({
    nodeEnv: "development",
    enableDemoSeed: undefined,
    demoSeedUsername: undefined,
    demoSeedPassword: undefined,
  });

  assert.deepEqual(config, { enabled: false });
});

test("bloqueia seed demo em producao", () => {
  assert.throws(
    () =>
      resolveDemoSeedConfig({
        nodeEnv: "production",
        enableDemoSeed: "true",
        demoSeedUsername: "dev_demo_local",
        demoSeedPassword: "SenhaSuperForte!123",
      }),
    /nao pode ser habilitado em producao/
  );
});

test("bloqueia username demo previsivel", () => {
  assert.throws(
    () =>
      resolveDemoSeedConfig({
        nodeEnv: "development",
        enableDemoSeed: "true",
        demoSeedUsername: "demo",
        demoSeedPassword: "SenhaSuperForte!123",
      }),
    /username menos previsivel/
  );
});

test("bloqueia senha fraca para seed demo", () => {
  assert.throws(
    () =>
      resolveDemoSeedConfig({
        nodeEnv: "development",
        enableDemoSeed: "true",
        demoSeedUsername: "dev_demo_local",
        demoSeedPassword: "demo123",
      }),
    /DEMO_SEED_PASSWORD fraca/
  );
});

test("habilita seed demo com credenciais fortes", () => {
  const config = resolveDemoSeedConfig({
    nodeEnv: "development",
    enableDemoSeed: "true",
    demoSeedUsername: "dev_demo_local",
    demoSeedPassword: "SenhaSuperForte!123",
  });

  assert.deepEqual(config, {
    enabled: true,
    username: "dev_demo_local",
    password: "SenhaSuperForte!123",
  });
});
