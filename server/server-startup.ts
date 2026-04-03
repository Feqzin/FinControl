import type { Server } from "http";
import type { AddressInfo } from "net";

type LogFn = (message: string) => void;

export interface StartHttpServerOptions {
  preferredHost: string;
  preferredPort: number;
  nodeEnv: string;
  log?: LogFn;
}

export interface StartedServerInfo {
  host: string;
  port: number;
}

interface ListenAttempt {
  host: string;
  port: number;
}

function isAddressInfo(value: ReturnType<Server["address"]>): value is AddressInfo {
  return typeof value === "object" && value !== null;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function isRecoverableListenError(error: unknown): boolean {
  const code = getErrorCode(error);
  return (
    code === "EADDRINUSE" ||
    code === "ENOTSUP" ||
    code === "EADDRNOTAVAIL" ||
    code === "EACCES"
  );
}

function pushUniqueAttempt(target: ListenAttempt[], next: ListenAttempt): void {
  const exists = target.some(
    (attempt) => attempt.host === next.host && attempt.port === next.port,
  );
  if (!exists) target.push(next);
}

function buildAttempts(preferredHost: string, preferredPort: number, nodeEnv: string): ListenAttempt[] {
  if (nodeEnv === "production") {
    return [{ host: preferredHost, port: preferredPort }];
  }

  const attempts: ListenAttempt[] = [];
  pushUniqueAttempt(attempts, { host: preferredHost, port: preferredPort });
  pushUniqueAttempt(attempts, { host: "127.0.0.1", port: preferredPort });
  pushUniqueAttempt(attempts, { host: preferredHost, port: 0 });
  pushUniqueAttempt(attempts, { host: "127.0.0.1", port: 0 });
  return attempts;
}

function listen(server: Server, attempt: ListenAttempt): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onListening = () => {
      cleanup();
      const address = server.address();
      if (!isAddressInfo(address)) {
        reject(new Error("Nao foi possivel resolver endereco do servidor."));
        return;
      }
      resolve(address);
    };

    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };

    server.once("error", onError);
    server.once("listening", onListening);

    try {
      server.listen(attempt.port, attempt.host);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function startHttpServer(
  server: Server,
  options: StartHttpServerOptions,
): Promise<StartedServerInfo> {
  const attempts = buildAttempts(
    options.preferredHost,
    options.preferredPort,
    options.nodeEnv,
  );

  let lastError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      const address = await listen(server, attempt);

      if (index > 0 && options.log) {
        if (attempt.host !== options.preferredHost) {
          options.log(
            `host ${options.preferredHost} indisponivel; usando ${attempt.host}`,
          );
        }
        if (address.port !== options.preferredPort) {
          options.log(
            `porta ${options.preferredPort} indisponivel; usando ${address.port}`,
          );
        }
      }

      return {
        host: attempt.host,
        port: address.port,
      };
    } catch (error) {
      lastError = error;
      if (!isRecoverableListenError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Falha ao iniciar servidor HTTP.");
}
