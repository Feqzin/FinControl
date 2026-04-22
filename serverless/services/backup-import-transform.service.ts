import { randomUUID } from "node:crypto";
import type { BackupJsonImportPayload } from "../validators/backup-import.validators.js";

type JsonRow = Record<string, unknown>;

type BackupImportIdMaps = {
  oldPessoaIdToNewPessoaId: Record<string, string>;
  oldCartaoIdToNewCartaoId: Record<string, string>;
};

export type BackupImportTransformResult = {
  pessoas: JsonRow[];
  dividas: JsonRow[];
  cartoes: JsonRow[];
  compras: JsonRow[];
  servicos: JsonRow[];
  metas: JsonRow[];
  idMaps: BackupImportIdMaps;
};

function asRow(value: unknown, label: string): JsonRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Registro invalido em ${label}`);
  }
  return value as JsonRow;
}

function readRequiredString(row: JsonRow, field: string, label: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Campo obrigatorio invalido: ${label}.${field}`);
  }
  return value;
}

function withCurrentUser(row: JsonRow, currentUserId: string): JsonRow {
  const { userId: _ignoredUserId, ...rest } = row;
  return { ...rest, userId: currentUserId };
}

export function transformBackupForPersistence(
  backup: BackupJsonImportPayload,
  currentUserId: string,
): BackupImportTransformResult {
  const oldPessoaIdToNewPessoaId: Record<string, string> = {};
  const oldCartaoIdToNewCartaoId: Record<string, string> = {};

  const pessoas = backup.pessoas.map((item, index) => {
    const row = asRow(item, `pessoas[${index}]`);
    const oldId = readRequiredString(row, "id", `pessoas[${index}]`);
    const newId = randomUUID();

    oldPessoaIdToNewPessoaId[oldId] = newId;
    return {
      ...withCurrentUser(row, currentUserId),
      id: newId,
    };
  });

  const cartoes = backup.cartoes.map((item, index) => {
    const row = asRow(item, `cartoes[${index}]`);
    const oldId = readRequiredString(row, "id", `cartoes[${index}]`);
    const newId = randomUUID();

    oldCartaoIdToNewCartaoId[oldId] = newId;
    return {
      ...withCurrentUser(row, currentUserId),
      id: newId,
    };
  });

  const dividas = backup.dividas.map((item, index) => {
    const row = asRow(item, `dividas[${index}]`);
    const oldPessoaId = readRequiredString(row, "pessoaId", `dividas[${index}]`);
    const newPessoaId = oldPessoaIdToNewPessoaId[oldPessoaId];

    if (!newPessoaId) {
      throw new Error(`Relacionamento invalido: dividas[${index}].pessoaId`);
    }

    return {
      ...withCurrentUser(row, currentUserId),
      id: randomUUID(),
      pessoaId: newPessoaId,
    };
  });

  const compras = backup.compras.map((item, index) => {
    const row = asRow(item, `compras[${index}]`);
    const oldCartaoId = readRequiredString(row, "cartaoId", `compras[${index}]`);
    const newCartaoId = oldCartaoIdToNewCartaoId[oldCartaoId];

    if (!newCartaoId) {
      throw new Error(`Relacionamento invalido: compras[${index}].cartaoId`);
    }

    const rawPessoaId = row.pessoaId;
    let newPessoaId: string | null = null;

    if (rawPessoaId != null) {
      if (typeof rawPessoaId !== "string" || rawPessoaId.trim() === "") {
        throw new Error(`Campo invalido: compras[${index}].pessoaId`);
      }

      newPessoaId = oldPessoaIdToNewPessoaId[rawPessoaId] ?? null;
      if (!newPessoaId) {
        throw new Error(`Relacionamento invalido: compras[${index}].pessoaId`);
      }
    }

    return {
      ...withCurrentUser(row, currentUserId),
      id: randomUUID(),
      cartaoId: newCartaoId,
      pessoaId: newPessoaId,
    };
  });

  const servicos = backup.servicos.map((item, index) => {
    const row = asRow(item, `servicos[${index}]`);
    return {
      ...withCurrentUser(row, currentUserId),
      id: randomUUID(),
    };
  });

  const metas = backup.metas.map((item, index) => {
    const row = asRow(item, `metas[${index}]`);
    return {
      ...withCurrentUser(row, currentUserId),
      id: randomUUID(),
    };
  });

  return {
    pessoas,
    dividas,
    cartoes,
    compras,
    servicos,
    metas,
    idMaps: {
      oldPessoaIdToNewPessoaId,
      oldCartaoIdToNewCartaoId,
    },
  };
}
