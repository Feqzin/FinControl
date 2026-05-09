const PDF_SIGNATURE = "%PDF";
const MIN_TEXT_CHARS_FOR_TEXTUAL_PDF = 20;

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

export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  if (!hasPdfMagicBytes(buffer)) {
    throw new Error("INVALID_PDF_SIGNATURE");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument(({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    stopAtErrors: false,
  }) as any);

  const pdfDocument = await loadingTask.promise;
  const pagesText: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent({ includeMarkedContent: false });
      const pageText = textContent.items
        .map((item) => (typeof item === "object" && item !== null && "str" in item ? String(item.str ?? "") : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText.length > 0) {
        pagesText.push(pageText);
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return pagesText.join("\n").trim();
}
