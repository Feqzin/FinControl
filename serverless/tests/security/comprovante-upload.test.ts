import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  decodeComprovanteBase64OrThrow,
  validateComprovanteBinarySignatureOrThrow,
} from "../../services/comprovante-storage.shared";
import { createPagamentosTimelineController } from "../../controllers/pagamentos-timeline.controller";

async function withTestServer(
  app: ReturnType<typeof express>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("magic bytes: PDF, PNG e JPG validos passam na validacao", () => {
  const pdfBuffer = Buffer.from("%PDF-1.4 comprovante valido");
  const pngBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("PNG-DATA"),
  ]);
  const jpgBuffer = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("JPEG-DATA"),
  ]);

  assert.doesNotThrow(() => validateComprovanteBinarySignatureOrThrow(pdfBuffer, "application/pdf"));
  assert.doesNotThrow(() => validateComprovanteBinarySignatureOrThrow(pngBuffer, "image/png"));
  assert.doesNotThrow(() => validateComprovanteBinarySignatureOrThrow(jpgBuffer, "image/jpeg"));
});

test("magic bytes bloqueiam arquivo disfarcado e assinatura desconhecida", () => {
  const txtBuffer = Buffer.from("texto comum fingindo imagem");
  const pdfBuffer = Buffer.from("%PDF-1.4 payload");
  const jpgBuffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("JPEG")]);
  const unknownSignature = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);

  assert.throws(
    () => validateComprovanteBinarySignatureOrThrow(txtBuffer, "image/png"),
    /INVALID_FILE_CONTENT/,
  );
  assert.throws(
    () => validateComprovanteBinarySignatureOrThrow(pdfBuffer, "image/png"),
    /INVALID_FILE_CONTENT/,
  );
  assert.throws(
    () => validateComprovanteBinarySignatureOrThrow(jpgBuffer, "application/pdf"),
    /INVALID_FILE_CONTENT/,
  );
  assert.throws(
    () => validateComprovanteBinarySignatureOrThrow(unknownSignature, "image/png"),
    /INVALID_FILE_CONTENT/,
  );
});

test("decode base64 de comprovante rejeita payload invalido", () => {
  assert.throws(() => decodeComprovanteBase64OrThrow("!!!!"), /INVALID_FILE_CONTENT/);
  assert.throws(() => decodeComprovanteBase64OrThrow(""), /INVALID_FILE_CONTENT/);
});

test("uploadComprovante retorna erro generico para arquivo invalido", async () => {
  const controller = createPagamentosTimelineController({
    uploadComprovante: async () => ({ error: "INVALID_FILE_CONTENT" as const }),
  } as any);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: "user_test_security" };
    next();
  });
  app.post("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.uploadComprovante);

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pagamentos/divida/divida_1/comprovante`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "falso.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("arquivo-falso").toString("base64"),
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body, {
      error: "Arquivo inválido ou não permitido.",
      message: "Arquivo inválido ou não permitido.",
    });

    const serialized = JSON.stringify(body).toLowerCase();
    assert.equal(serialized.includes("stack"), false);
    assert.equal(serialized.includes("sql"), false);
    assert.equal(serialized.includes("base64"), false);
  });
});
