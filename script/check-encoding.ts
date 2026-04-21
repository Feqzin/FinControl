import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_PATHS = ["client/src", "server", "shared", "README.md"];
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".json", ".sql"]);

const MOJIBAKE_PATTERNS: Array<{ reason: string; regex: RegExp }> = [
  { reason: "replacement-character", regex: /\uFFFD/ }, // �
  { reason: "mojibake-c3", regex: /\u00C3[\u0080-\u00BF]/ }, // Ãx
  { reason: "mojibake-c2", regex: /\u00C2[\u0080-\u00BF]/ }, // Âx
  { reason: "mojibake-e2-euro", regex: /\u00E2\u20AC[\u0080-\u00BF]/ }, // â€x
];

type Finding = {
  file: string;
  line: number;
  reason: string;
  snippet: string;
};

async function collectFilesInDir(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesInDir(fullPath)));
      continue;
    }

    if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function collectFilesFromPath(target: string): Promise<string[]> {
  const absoluteTarget = path.resolve(target);

  try {
    const stat = await fs.stat(absoluteTarget);
    if (stat.isDirectory()) {
      return collectFilesInDir(absoluteTarget);
    }

    if (stat.isFile() && ALLOWED_EXTENSIONS.has(path.extname(absoluteTarget))) {
      return [absoluteTarget];
    }
  } catch {
    return [];
  }

  return [];
}

function collectFindings(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (!pattern.regex.test(line)) continue;
      findings.push({
        file,
        line: index + 1,
        reason: pattern.reason,
        snippet: line.trim(),
      });
    }

    if (line !== line.normalize("NFC")) {
      findings.push({
        file,
        line: index + 1,
        reason: "unicode-not-nfc",
        snippet: line.trim(),
      });
    }
  });

  return findings;
}

function normalizeSnippet(input: string): string {
  if (!input) return "<linha vazia>";
  return input.length > 180 ? `${input.slice(0, 177)}...` : input;
}

async function main(): Promise<void> {
  const findings: Finding[] = [];

  for (const rootPath of ROOT_PATHS) {
    const files = await collectFilesFromPath(rootPath);
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      findings.push(...collectFindings(file, content));
    }
  }

  if (findings.length === 0) {
    console.log("Encoding check OK: nenhum texto corrompido detectado.");
    return;
  }

  console.error("Encoding check FAILED: textos suspeitos detectados.");
  for (const finding of findings) {
    const relative = path.relative(process.cwd(), finding.file);
    console.error(
      `- ${relative}:${finding.line} [${finding.reason}] ${normalizeSnippet(finding.snippet)}`,
    );
  }

  process.exitCode = 1;
}

void main();
