const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

async function enhanceImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(2, Math.max(1, 2400 / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível preparar a imagem para leitura.");

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const gray = Math.round(
        imageData.data[index] * 0.299
        + imageData.data[index + 1] * 0.587
        + imageData.data[index + 2] * 0.114,
      );
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      imageData.data[index] = contrasted;
      imageData.data[index + 1] = contrasted;
      imageData.data[index + 2] = contrasted;
    }
    context.putImageData(imageData, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem.")), "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export async function extractCnpjDasTextFromImage(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Use uma imagem PNG, JPG, JPEG ou WEBP.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("A imagem deve ter no máximo 12 MB.");
  }

  const [{ createWorker }, preparedImage] = await Promise.all([
    import("tesseract.js"),
    enhanceImage(file),
  ]);
  const worker = await createWorker("por", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });

  try {
    const result = await worker.recognize(preparedImage);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
