type ResolveDemoSeedConfigInput = {
  nodeEnv: string | undefined;
  enableDemoSeed: string | undefined;
  demoSeedUsername: string | undefined;
  demoSeedPassword: string | undefined;
};

export type DemoSeedConfig =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      username: string;
      password: string;
    };

const weakPasswords = new Set([
  "123456",
  "12345678",
  "password",
  "password123",
  "qwerty",
  "admin",
  "demo",
  "demo123",
  "troque-por-um-segredo-forte",
]);

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasEnoughPasswordComplexity(value: string): boolean {
  let groups = 0;
  if (/[a-z]/.test(value)) groups += 1;
  if (/[A-Z]/.test(value)) groups += 1;
  if (/\d/.test(value)) groups += 1;
  if (/[^A-Za-z0-9]/.test(value)) groups += 1;
  return groups >= 3;
}

export function resolveDemoSeedConfig(input: ResolveDemoSeedConfigInput): DemoSeedConfig {
  const enabled = isTruthy(input.enableDemoSeed);
  if (!enabled) {
    return { enabled: false };
  }

  const normalizedEnv = (input.nodeEnv || "development").trim().toLowerCase();
  if (normalizedEnv === "production") {
    throw new Error(
      "ENABLE_DEMO_SEED nao pode ser habilitado em producao. Desative essa variavel para subir a aplicacao."
    );
  }

  const username = input.demoSeedUsername?.trim();
  const password = input.demoSeedPassword?.trim();

  if (!username || !password) {
    throw new Error(
      "Para habilitar ENABLE_DEMO_SEED, defina DEMO_SEED_USERNAME e DEMO_SEED_PASSWORD no .env."
    );
  }

  if (username.toLowerCase() === "demo") {
    throw new Error(
      'DEMO_SEED_USERNAME="demo" foi bloqueado por seguranca. Use um username menos previsivel.'
    );
  }

  if (password.length < 12 || !hasEnoughPasswordComplexity(password) || weakPasswords.has(password.toLowerCase())) {
    throw new Error(
      "DEMO_SEED_PASSWORD fraca. Use ao menos 12 caracteres e combine letras, numeros e simbolos."
    );
  }

  return {
    enabled: true,
    username,
    password,
  };
}
