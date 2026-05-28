import test from "node:test";
import assert from "node:assert/strict";
import { servicoBody, servicoUpdateBody } from "../../validators/core-domain.validators.js";

test("servicos validator: aceita categoria cuidados pessoais e normaliza para cuidados_pessoais", () => {
  const parsed = servicoBody.safeParse({
    nome: "Cabeleireiro",
    categoria: "Cuidados pessoais",
    valorCobranca: "45.00",
    periodicidadeCobranca: "semanal",
    dataCobranca: null,
    formaPagamento: "pix",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.categoria, "cuidados_pessoais");
});

test("servicos validator: aceita categoria cuidados-pessoais no update e normaliza", () => {
  const parsed = servicoUpdateBody.safeParse({
    categoria: "cuidados-pessoais",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.categoria, "cuidados_pessoais");
});

test("servicos validator: categoria invalida retorna erro controlado", () => {
  const parsed = servicoUpdateBody.safeParse({
    categoria: "categoria_inexistente_123",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.match(parsed.error.message, /Categoria de servico invalida/i);
});
