const PDF_SIGNATURE = "%PDF";
const MIN_TEXT_CHARS_FOR_TEXTUAL_PDF = 20;
const DEFAULT_Y_TOLERANCE = 2.4;
const MIN_TOKEN_GAP_FOR_SPACE = 0.9;

export function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < PDF_SIGNATURE.length) return false;
  const bytes = new Uint8Array(buffer.slice(0, PDF_SIGNATURE.length));
  let signature = "";
  for (let index = 0; index < bytes.length; index += 1) {
    signature += String.fromCharCode(bytes[index] ?? 0);
  }
  return signature === PDF_SIGNATURE;
}

export function isExtractedPdfTextUsable(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < MIN_TEXT_CHARS_FOR_TEXTUAL_PDF) return false;

  const lettersAndNumbers = cleaned.replace(/[^a-z0-9]/gi, "");
  return lettersAndNumbers.length >= 12;
}

type PdfTextContentItemLike = {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
};

type PositionedTextToken = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function toPositionedTextToken(item: unknown): PositionedTextToken | null {
  if (!item || typeof item !== "object") return null;
  const typed = item as PdfTextContentItemLike;
  if (typeof typed.str !== "string") return null;
  const text = typed.str.replace(/\u00A0/g, " ").trim();
  if (!text) return null;
  if (!Array.isArray(typed.transform) || typed.transform.length < 6) return null;
  const transform = typed.transform;
  const x = Number(transform[4]);
  const y = Number(transform[5]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const explicitWidth = Number(typed.width);
  const rawHeight = Number(typed.height);
  const transformHeight = Math.abs(Number(transform[3]));
  const height = Number.isFinite(rawHeight) && rawHeight > 0
    ? rawHeight
    : Number.isFinite(transformHeight) && transformHeight > 0
      ? transformHeight
      : 10;
  const width = Number.isFinite(explicitWidth) && explicitWidth > 0
    ? explicitWidth
    : Math.max(text.length * Math.max(height * 0.42, 3), 2);

  return {
    text,
    x,
    y,
    width,
    height,
  };
}

function estimateLineTolerance(tokens: PositionedTextToken[]): number {
  const heights = tokens
    .map((token) => token.height)
    .filter((height) => Number.isFinite(height) && height > 0)
    .sort((a, b) => a - b);

  if (heights.length === 0) return DEFAULT_Y_TOLERANCE;
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? DEFAULT_Y_TOLERANCE;
  return Math.max(1.2, Math.min(4.2, medianHeight * 0.38));
}

function shouldTightlyJoinTokens(previousText: string, nextText: string, gap: number): boolean {
  if (gap <= MIN_TOKEN_GAP_FOR_SPACE) return true;
  if (/^[,.;:%/)\]]/.test(nextText)) return true;
  if (/[([/]$/.test(previousText)) return true;
  if (/\d$/.test(previousText) && /^[\/,.-]\d*$/.test(nextText)) return true;
  if (/[\/,.-]$/.test(previousText) && /^\d/.test(nextText)) return true;
  return false;
}

function normalizeReconstructedLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/(\d)\s+\/\s+(\d)/g, "$1/$2")
    .replace(/(\d)\s*,\s*(\d{2})(\b|$)/g, "$1,$2")
    .trim();
}

export function reconstructPdfLinesByPosition(items: readonly unknown[]): string[] {
  const tokens = items
    .map(toPositionedTextToken)
    .filter((token): token is PositionedTextToken => token !== null);

  if (tokens.length === 0) return [];

  const sorted = [...tokens].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 0.0001) return b.y - a.y;
    return a.x - b.x;
  });
  const tolerance = estimateLineTolerance(sorted);
  const lines: Array<{ y: number; tokens: PositionedTextToken[] }> = [];

  for (const token of sorted) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < lines.length; index += 1) {
      const candidate = lines[index];
      if (!candidate) continue;
      const distance = Math.abs(candidate.y - token.y);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      lines.push({ y: token.y, tokens: [token] });
      continue;
    }

    const target = lines[bestIndex];
    if (!target) continue;
    target.tokens.push(token);
    target.y = (target.y * (target.tokens.length - 1) + token.y) / target.tokens.length;
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const ordered = [...line.tokens].sort((a, b) => a.x - b.x);
      let rebuilt = "";
      let previous: PositionedTextToken | null = null;

      for (const token of ordered) {
        if (!previous) {
          rebuilt = token.text;
          previous = token;
          continue;
        }

        const estimatedPreviousEnd = previous.x + previous.width;
        const gap = token.x - estimatedPreviousEnd;
        const glueWithoutSpace = shouldTightlyJoinTokens(previous.text, token.text, gap);
        rebuilt = glueWithoutSpace ? `${rebuilt}${token.text}` : `${rebuilt} ${token.text}`;
        previous = token;
      }

      return normalizeReconstructedLine(rebuilt);
    })
    .filter((line) => line.length > 0);
}

export interface ExtractedPdfTextVariants {
  plainText: string;
  positionalText: string;
}

export async function extractPdfTextVariantsFromPdfBuffer(buffer: ArrayBuffer): Promise<ExtractedPdfTextVariants> {
  if (!hasPdfMagicBytes(buffer)) {
    throw new Error("INVALID_PDF_SIGNATURE");
  }

  // Usa o entrypoint webpack do pdfjs-dist, que configura worker dedicado
  // automaticamente no navegador sem inflar o bundle inicial (import dinâmico).
  const pdfjs = await import("pdfjs-dist/webpack.mjs");
  const loadingTask = pdfjs.getDocument(({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    stopAtErrors: false,
  }) as any);

  const pdfDocument = await loadingTask.promise;
  const plainPagesText: string[] = [];
  const positionalPagesText: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent({ includeMarkedContent: false });
      const pageText = textContent.items
        .map((item: { str?: string } | unknown) => (typeof item === "object" && item !== null && "str" in item ? String((item as { str?: string }).str ?? "") : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const reconstructedLines = reconstructPdfLinesByPosition(textContent.items as unknown[]);
      const positionalPageText = reconstructedLines.join("\n").trim();

      if (pageText.length > 0) {
        plainPagesText.push(pageText);
      }

      if (positionalPageText.length > 0) {
        positionalPagesText.push(positionalPageText);
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    plainText: plainPagesText.join("\n").trim(),
    positionalText: positionalPagesText.join("\n").trim(),
  };
}

export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const extracted = await extractPdfTextVariantsFromPdfBuffer(buffer);
  return extracted.positionalText || extracted.plainText;
}
