import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

type Severity = "error" | "warn" | "info";

type Finding = {
  severity: Severity;
  category: string;
  location: string;
  message: string;
};

const ROOT_DIR = process.cwd();
const STRICT_MODE = process.argv.includes("--strict");
const JSON_MODE = process.argv.includes("--json");

const IGNORED_WALK_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "artifacts",
  "diagnostics",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

const ARCHIVE_EXTENSIONS = [".zip", ".tar", ".tar.gz", ".tgz"];

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function addFinding(
  findings: Finding[],
  severity: Severity,
  category: string,
  location: string,
  message: string,
): void {
  findings.push({
    severity,
    category,
    location: normalizePath(path.relative(ROOT_DIR, location) || "."),
    message,
  });
}

async function runGitLsFiles(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["ls-files"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ls-files falhou (${code}): ${stderr}`));
        return;
      }
      const files = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      resolve(files);
    });
  });
}

function classifyTrackedPath(normalized: string): { severity: Severity; message: string } | null {
  if ((/^\.env(\..+)?$/).test(normalized) && normalized !== ".env.example") {
    return {
      severity: "error",
      message: "Arquivo de ambiente sensivel rastreado no git.",
    };
  }

  if ((/^\.envrc$/).test(normalized)) {
    return {
      severity: "error",
      message: "Arquivo .envrc rastreado no git.",
    };
  }

  if ((/^(\.git|node_modules|dist)(\/|$)/).test(normalized)) {
    return {
      severity: "error",
      message: "Pasta critica de runtime/build rastreada no git.",
    };
  }

  if ((/^(artifacts|diagnostics|attached_assets|\.local|\.agents|\.config)(\/|$)/).test(normalized)) {
    return {
      severity: "info",
      message: "Pasta operacional/auxiliar rastreada no git (excluida do fluxo de distribuicao).",
    };
  }

  if ((/\.(pem|key|p12|pfx|kdbx)$/i).test(normalized)) {
    return {
      severity: "error",
      message: "Arquivo potencialmente sensivel/certificado rastreado no git.",
    };
  }

  if ((/\.(zip|tar|tar\.gz|tgz)$/i).test(normalized)) {
    return {
      severity: "warn",
      message: "Arquivo compactado nao deve ser versionado.",
    };
  }

  return null;
}

async function auditRootEntries(findings: Finding[]): Promise<void> {
  const rootEntries: Array<{ entry: string; severity: Severity; message: string }> = [
    {
      entry: ".env",
      severity: "info",
      message: "Arquivo de ambiente local presente. Garanta que nao e versionado/empacotado.",
    },
    {
      entry: ".env.local",
      severity: "info",
      message: "Arquivo de ambiente local presente. Garanta que nao e versionado/empacotado.",
    },
    {
      entry: ".env.development",
      severity: "info",
      message: "Arquivo de ambiente local presente. Garanta que nao e versionado/empacotado.",
    },
    {
      entry: ".env.production",
      severity: "info",
      message: "Arquivo de ambiente local presente. Garanta que nao e versionado/empacotado.",
    },
    {
      entry: ".env.test",
      severity: "info",
      message: "Arquivo de ambiente local presente. Garanta que nao e versionado/empacotado.",
    },
    {
      entry: ".git",
      severity: "info",
      message: "Repositorio git presente no workspace local. Nao deve sair em pacote de distribuicao.",
    },
    {
      entry: "node_modules",
      severity: "info",
      message: "Dependencias locais presentes no workspace. Nao devem sair no pacote.",
    },
    {
      entry: "dist",
      severity: "info",
      message: "Artefato de build local presente. Nao deve sair em source package.",
    },
    {
      entry: "artifacts",
      severity: "info",
      message: "Pasta de artefatos local presente. Nao deve ser redistribuida.",
    },
    {
      entry: "diagnostics",
      severity: "info",
      message: "Pasta de diagnostico local presente. Nao deve ser redistribuida.",
    },
    {
      entry: "attached_assets",
      severity: "info",
      message: "Pasta de anexos local presente. Nao deve ser redistribuida.",
    },
  ];

  for (const item of rootEntries) {
    const full = path.join(ROOT_DIR, item.entry);
    if (await exists(full)) {
      addFinding(
        findings,
        item.severity,
        "workspace",
        full,
        item.message,
      );
    }
  }
}

async function walkForFiles(
  dir: string,
  onFile: (filePath: string) => Promise<void>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_WALK_DIRS.has(entry.name)) continue;
      await walkForFiles(fullPath, onFile);
      continue;
    }
    if (!entry.isFile()) continue;
    await onFile(fullPath);
  }
}

async function auditArchivesAndTemps(findings: Finding[]): Promise<void> {
  await walkForFiles(ROOT_DIR, async (filePath) => {
    const normalized = normalizePath(path.relative(ROOT_DIR, filePath));
    const lower = normalized.toLowerCase();
    const isArchive = ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    const isTemp = lower.endsWith(".tmp") || lower.endsWith(".temp") || lower.endsWith(".bak") || lower.endsWith(".swp");

    if (isArchive) {
      addFinding(
        findings,
        "warn",
        "archives",
        filePath,
        "Arquivo compactado encontrado no workspace. Evite distribuir pacote contendo arquivos internos.",
      );
    }

    if (isTemp) {
      addFinding(
        findings,
        "warn",
        "temporary",
        filePath,
        "Artefato temporario encontrado.",
      );
    }
  });
}

async function auditFrontendExposure(findings: Finding[]): Promise<void> {
  const clientSrc = path.join(ROOT_DIR, "client", "src");
  if (!(await exists(clientSrc))) return;

  await walkForFiles(clientSrc, async (filePath) => {
    if (!(/\.(ts|tsx|js|jsx)$/i).test(filePath)) return;
    const content = await readFile(filePath, "utf8");
    const relative = normalizePath(path.relative(ROOT_DIR, filePath));

    if ((/DATABASE_URL|SESSION_SECRET|VITE_DATABASE_URL|VITE_SESSION_SECRET/).test(content)) {
      addFinding(
        findings,
        "error",
        "frontend-secrets",
        filePath,
        "Referencia direta a segredo/variavel sensivel encontrada no frontend.",
      );
    }

    if ((/process\.env\./).test(content)) {
      addFinding(
        findings,
        "warn",
        "frontend-env",
        filePath,
        "Uso de process.env no frontend. Prefira import.meta.env.VITE_* para evitar vazamentos acidentais.",
      );
    }

    if ((/import\.meta\.env\.(?!VITE_)[A-Za-z0-9_]+/).test(content)) {
      addFinding(
        findings,
        "warn",
        "frontend-env",
        filePath,
        "Uso de import.meta.env sem prefixo VITE_.",
      );
    }

    if ((/window\.__ENV__|__SECRET__/).test(content)) {
      addFinding(
        findings,
        "error",
        "frontend-secrets",
        filePath,
        "Padrao suspeito de injecao de segredo no frontend.",
      );
    }

    if (relative.endsWith(".map")) {
      addFinding(
        findings,
        "warn",
        "frontend-build",
        filePath,
        "Sourcemap encontrado em src (incomum).",
      );
    }
  });
}

async function auditTrackedSensitivePaths(findings: Finding[]): Promise<void> {
  const tracked = await runGitLsFiles();
  const dedupeByTopLevel = new Set<string>();
  for (const file of tracked) {
    const normalized = normalizePath(file);
    const classification = classifyTrackedPath(normalized);
    if (!classification) continue;

    const topLevel = normalized.split("/")[0] ?? normalized;
    if (
      classification.severity === "info"
      && [".local", ".agents", ".config", "artifacts", "diagnostics", "attached_assets"].includes(topLevel)
    ) {
      if (dedupeByTopLevel.has(topLevel)) {
        continue;
      }
      dedupeByTopLevel.add(topLevel);
    }

    addFinding(
      findings,
      classification.severity,
      "git-tracked-sensitive",
      path.join(ROOT_DIR, normalized),
      classification.message,
    );
  }
}

function severityWeight(severity: Severity): number {
  if (severity === "error") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function summarize(findings: Finding[]) {
  const summary = {
    errors: findings.filter((f) => f.severity === "error").length,
    warns: findings.filter((f) => f.severity === "warn").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
  return summary;
}

function printFindings(findings: Finding[]): void {
  if (JSON_MODE) {
    console.log(JSON.stringify({ findings, summary: summarize(findings) }, null, 2));
    return;
  }

  const grouped = new Map<string, { sample: Finding; count: number }>();
  for (const finding of findings) {
    const key = `${finding.severity}|${finding.category}|${finding.message}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, { sample: finding, count: 1 });
  }

  const orderedGroups = [...grouped.values()].sort((a, b) => {
    const severityDelta = severityWeight(b.sample.severity) - severityWeight(a.sample.severity);
    if (severityDelta !== 0) return severityDelta;
    return b.count - a.count;
  });

  const maxPrint = 30;
  const visibleGroups = orderedGroups.slice(0, maxPrint);

  for (const group of visibleGroups) {
    const prefix = group.sample.severity.toUpperCase();
    const multiplicity = group.count > 1 ? ` (x${group.count})` : "";
    console.log(
      `[${prefix}] (${group.sample.category}) ${group.sample.location}${multiplicity} :: ${group.sample.message}`,
    );
  }

  if (orderedGroups.length > maxPrint) {
    console.log(
      `[ops-audit] ... ${orderedGroups.length - maxPrint} grupos adicionais omitidos. Use --json para ver todos.`,
    );
  }
}

async function run(): Promise<void> {
  const findings: Finding[] = [];
  await auditRootEntries(findings);
  await auditArchivesAndTemps(findings);
  await auditTrackedSensitivePaths(findings);
  await auditFrontendExposure(findings);

  printFindings(findings);
  const summary = summarize(findings);
  console.log(
    `[ops-audit] erros=${summary.errors} avisos=${summary.warns} info=${summary.infos}`,
  );

  if (summary.errors > 0) {
    process.exit(1);
  }

  if (STRICT_MODE && summary.warns > 0) {
    process.exit(2);
  }
}

run().catch((error) => {
  console.error("[ops-audit] falha inesperada", error);
  process.exit(3);
});
