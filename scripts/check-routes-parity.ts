import { readFile } from "node:fs/promises";
import path from "node:path";

type RuntimeName = "server" | "serverless";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RouteDecl = {
  runtime: RuntimeName;
  filePath: string;
  method: HttpMethod;
  routePath: string;
  line: number;
};

const TARGETS: Array<{ runtime: RuntimeName; filePath: string }> = [
  { runtime: "server", filePath: "server/routes.ts" },
  { runtime: "serverless", filePath: "serverless/routes.ts" },
];

const ROUTE_REGEX = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

function getLineNumber(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function toRouteKey(method: HttpMethod, routePath: string): string {
  return `${method} ${routePath}`;
}

function uniqSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function printSection(title: string, rows: string[]): void {
  console.log(`\n${title} (${rows.length})`);
  if (rows.length === 0) {
    console.log("- nenhum");
    return;
  }

  for (const row of rows) {
    console.log(`- ${row}`);
  }
}

async function loadRoutes(runtime: RuntimeName, filePath: string): Promise<RouteDecl[]> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = await readFile(absolutePath, "utf-8");
  const matches = content.matchAll(ROUTE_REGEX);
  const routes: RouteDecl[] = [];

  for (const match of matches) {
    const method = match[1]?.toUpperCase() as HttpMethod | undefined;
    const routePath = match[2];
    const index = match.index ?? 0;

    if (!method || !routePath) continue;

    routes.push({
      runtime,
      filePath,
      method,
      routePath,
      line: getLineNumber(content, index),
    });
  }

  return routes;
}

async function run(): Promise<void> {
  console.log("=== Runtime Route Parity Check (diagnostic only) ===");
  console.log("Este script nao falha o build. Ele apenas imprime divergencias.\n");

  const allRoutes = await Promise.all(
    TARGETS.map(async (target) => loadRoutes(target.runtime, target.filePath)),
  );

  const serverRoutes = allRoutes[0];
  const serverlessRoutes = allRoutes[1];

  const serverKeys = uniqSorted(serverRoutes.map((route) => toRouteKey(route.method, route.routePath)));
  const serverlessKeys = uniqSorted(serverlessRoutes.map((route) => toRouteKey(route.method, route.routePath)));

  const serverKeySet = new Set(serverKeys);
  const serverlessKeySet = new Set(serverlessKeys);

  const inBoth = serverKeys.filter((key) => serverlessKeySet.has(key));
  const onlyServer = serverKeys.filter((key) => !serverlessKeySet.has(key));
  const onlyServerless = serverlessKeys.filter((key) => !serverKeySet.has(key));

  console.log("Arquivos analisados:");
  for (const target of TARGETS) {
    console.log(`- ${target.runtime}: ${target.filePath}`);
  }

  console.log("\nResumo:");
  console.log(`- server: ${serverKeys.length} rota(s)`);
  console.log(`- serverless: ${serverlessKeys.length} rota(s)`);
  console.log(`- paridade (presentes nos dois): ${inBoth.length}`);
  console.log(`- apenas server: ${onlyServer.length}`);
  console.log(`- apenas serverless: ${onlyServerless.length}`);

  printSection("Rotas presentes nos dois runtimes", inBoth);
  printSection("Rotas apenas no server", onlyServer);
  printSection("Rotas apenas no serverless", onlyServerless);

  if (onlyServer.length > 0 || onlyServerless.length > 0) {
    console.warn("\n[WARN] Divergencia de rotas detectada entre server e serverless.");
    console.warn("[WARN] Recomendacao: alterar primeiro serverless (fonte de producao) e espelhar no server quando necessario.");
  } else {
    console.log("\n[OK] Paridade de rotas detectada entre server e serverless para os arquivos analisados.");
  }

  const serverAnnotated = serverRoutes
    .map((route) => `${toRouteKey(route.method, route.routePath)} (${route.filePath}:${route.line})`);
  const serverlessAnnotated = serverlessRoutes
    .map((route) => `${toRouteKey(route.method, route.routePath)} (${route.filePath}:${route.line})`);

  printSection("Inventario server (metodo + rota + linha)", uniqSorted(serverAnnotated));
  printSection("Inventario serverless (metodo + rota + linha)", uniqSorted(serverlessAnnotated));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[WARN] Falha ao gerar diagnostico de paridade:", message);
  process.exitCode = 0;
});
