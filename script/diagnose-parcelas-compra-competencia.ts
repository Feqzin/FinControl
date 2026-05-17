import "dotenv/config";
import { addMonths, format } from "date-fns";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { writeAuditLog } from "../server/audit-log";
import { db } from "../server/db";
import { cartoes, comprasCartao, importLogs, parcelasCompra } from "../shared/schema";
import { buildParcelasCompraRows } from "../server/services/parcelas-compra-materialization";
import {
  canAutoRematerializeCompetency,
  diffParcelasCompetencySchedules,
  matchesLegacyPurchaseDateSchedule,
  type ParcelaCompetencyDiff,
} from "../shared/parcelas-compra-competency";

type CliOptions = {
  userId: string | null;
  compraId: string | null;
  limit: number;
  apply: boolean;
  confirm: boolean;
  json: boolean;
};

type ScheduleRowOutput = {
  numero: number;
  dataVencimento: string | null;
  statusCartao: string | null;
  statusPessoa: string | null;
};

type DiagnosedCompra = {
  compraCartaoId: string;
  userId: string;
  cartaoId: string;
  cartaoNome: string;
  descricao: string;
  dataCompra: string;
  totalParcelas: number;
  parcelaAtual: number;
  vencimentoFaturaImportada: string | null;
  cronogramaAtual: ScheduleRowOutput[];
  cronogramaSugerido: Array<{ numero: number; dataVencimento: string | null }>;
  diferencas: ParcelaCompetencyDiff[];
  razoesSuspeita: string[];
  hasParcelasPagas: boolean;
  hasComprovantes: boolean;
  hasPagamentoPessoa: boolean;
  statusPessoaCompra: string | null;
  reembolsoModo: string | null;
  canAutoApply: boolean;
  blockedReason: string | null;
};

type RunSummary = {
  scannedPurchases: number;
  suspects: number;
  eligibleForAutoApply: number;
  blocked: number;
  applied: number;
  unchanged: number;
};

function parseOptions(argv: string[]): CliOptions {
  let userId: string | null = null;
  let compraId: string | null = null;
  let limit = 200;
  let apply = false;
  let confirm = false;
  let json = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--confirm") {
      confirm = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("--user-id=")) {
      userId = arg.slice("--user-id=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--compra-id=")) {
      compraId = arg.slice("--compra-id=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.max(1, Math.min(2000, Math.trunc(parsed)));
      }
      continue;
    }
  }

  return { userId, compraId, limit, apply, confirm, json };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseSafeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function buildLegacySchedule(dataCompra: string, parcelas: number): Array<{ numero: number; dataVencimento: string }> {
  const baseDate = new Date(`${dataCompra}T12:00:00`);
  return Array.from({ length: Math.max(1, parcelas) }, (_, index) => ({
    numero: index + 1,
    dataVencimento: format(addMonths(baseDate, index), "yyyy-MM-dd"),
  }));
}

type ImportedAnchor = {
  vencimentoFatura: string;
  at: number;
  importLogId: string;
};

function extractImportedItems(payloadRaw: unknown): Array<{ action?: string; vencimentoFatura?: string | null }> {
  if (Array.isArray(payloadRaw)) return payloadRaw as Array<{ action?: string; vencimentoFatura?: string | null }>;
  if (!payloadRaw || typeof payloadRaw !== "object") return [];
  const payload = payloadRaw as Record<string, unknown>;
  if (Array.isArray(payload.items)) {
    return payload.items as Array<{ action?: string; vencimentoFatura?: string | null }>;
  }
  return [];
}

async function buildInvoiceAnchorByCompraId(
  compraIds: Set<string>,
  userId: string | null,
): Promise<Map<string, ImportedAnchor>> {
  if (compraIds.size === 0) return new Map();

  const logs = userId
    ? await db.select({
      id: importLogs.id,
      userId: importLogs.userId,
      sourceType: importLogs.sourceType,
      createdCompraIds: importLogs.createdCompraIds,
      confirmedPayload: importLogs.confirmedPayload,
      confirmedAt: importLogs.confirmedAt,
      createdAt: importLogs.createdAt,
      status: importLogs.status,
    }).from(importLogs).where(and(
      eq(importLogs.userId, userId),
      eq(importLogs.status, "confirmed"),
      sql`${importLogs.createdCompraIds} is not null`,
      sql`${importLogs.confirmedPayload} is not null`,
    )).orderBy(desc(importLogs.confirmedAt), desc(importLogs.createdAt))
    : await db.select({
      id: importLogs.id,
      userId: importLogs.userId,
      sourceType: importLogs.sourceType,
      createdCompraIds: importLogs.createdCompraIds,
      confirmedPayload: importLogs.confirmedPayload,
      confirmedAt: importLogs.confirmedAt,
      createdAt: importLogs.createdAt,
      status: importLogs.status,
    }).from(importLogs).where(and(
      eq(importLogs.status, "confirmed"),
      sql`${importLogs.createdCompraIds} is not null`,
      sql`${importLogs.confirmedPayload} is not null`,
    )).orderBy(desc(importLogs.confirmedAt), desc(importLogs.createdAt));

  const anchorByCompraId = new Map<string, ImportedAnchor>();

  for (const row of logs) {
    const createdIds = parseSafeJson<string[]>(row.createdCompraIds, []);
    if (!Array.isArray(createdIds) || createdIds.length === 0) continue;

    const confirmedPayload = parseSafeJson<unknown>(row.confirmedPayload, null);
    const importedItems = extractImportedItems(confirmedPayload).filter((item) => item.action === "import");
    if (importedItems.length === 0) continue;

    const referenceAt = row.confirmedAt
      ? new Date(row.confirmedAt).getTime()
      : new Date(row.createdAt).getTime();

    for (let index = 0; index < createdIds.length; index += 1) {
      const compraId = createdIds[index];
      if (!compraId || !compraIds.has(compraId)) continue;

      const importedItem = importedItems[index];
      if (!importedItem || !isIsoDate(importedItem.vencimentoFatura)) continue;

      const current = anchorByCompraId.get(compraId);
      if (current && current.at >= referenceAt) continue;

      anchorByCompraId.set(compraId, {
        vencimentoFatura: importedItem.vencimentoFatura,
        at: referenceAt,
        importLogId: row.id,
      });
    }
  }

  return anchorByCompraId;
}

function formatDifferencesCompact(diffs: ParcelaCompetencyDiff[]): string {
  return diffs.map((diff) => {
    const reasonSuffix = diff.protectedReasons.length > 0
      ? ` [bloqueio: ${diff.protectedReasons.join(",")}]`
      : "";
    return `${diff.kind}#${diff.numero}: ${diff.currentDueDate ?? "-"} -> ${diff.suggestedDueDate ?? "-"}${reasonSuffix}`;
  }).join(" | ");
}

function buildSuspectReasons(params: {
  diffs: ParcelaCompetencyDiff[];
  compraDataCompra: string;
  compraParcelas: number;
  currentRows: Array<{ numero: number; dataVencimento: string | null }>;
  invoiceAnchor: string | null;
  parcelaAtual: number;
}): string[] {
  const reasons: string[] = [];
  const { diffs, compraDataCompra, compraParcelas, currentRows, invoiceAnchor, parcelaAtual } = params;
  if (diffs.some((diff) => diff.kind === "due_date_mismatch")) {
    reasons.push("cronograma_data_vencimento_divergente");
  }
  if (diffs.some((diff) => diff.kind === "missing_parcela" || diff.kind === "extra_parcela")) {
    reasons.push("estrutura_de_parcelas_divergente");
  }

  const legacySchedule = buildLegacySchedule(compraDataCompra, compraParcelas);
  if (matchesLegacyPurchaseDateSchedule(currentRows, legacySchedule) && diffs.length > 0) {
    reasons.push("cronograma_ancorado_na_data_da_compra_legado");
  }

  if (invoiceAnchor) {
    const currentParcelaAtual = currentRows.find((row) => row.numero === parcelaAtual);
    if (currentParcelaAtual && currentParcelaAtual.dataVencimento !== invoiceAnchor) {
      reasons.push("parcela_atual_nao_ancorada_no_vencimento_da_fatura_importada");
    }
  }

  return reasons;
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.apply && !options.confirm) {
    throw new Error("Para aplicar correções use --apply --confirm (sem isso o script roda apenas diagnóstico/preview).");
  }

  const compraPredicates = [];
  if (options.userId) compraPredicates.push(eq(comprasCartao.userId, options.userId));
  if (options.compraId) compraPredicates.push(eq(comprasCartao.id, options.compraId));

  const compras = await db.select({
    id: comprasCartao.id,
    userId: comprasCartao.userId,
    cartaoId: comprasCartao.cartaoId,
    descricao: comprasCartao.descricao,
    dataCompra: comprasCartao.dataCompra,
    parcelas: comprasCartao.parcelas,
    parcelaAtual: comprasCartao.parcelaAtual,
    valorTotal: comprasCartao.valorTotal,
    valorParcela: comprasCartao.valorParcela,
    pessoaId: comprasCartao.pessoaId,
    statusPessoa: comprasCartao.statusPessoa,
    dataPagamentoPessoa: comprasCartao.dataPagamentoPessoa,
    reembolsoModo: comprasCartao.reembolsoModo,
  }).from(comprasCartao).where(compraPredicates.length > 0 ? and(...compraPredicates) : undefined);

  const limitedCompras = compras.slice(0, options.limit);
  const compraIds = limitedCompras.map((row) => row.id);
  const compraIdSet = new Set(compraIds);

  const cardIds = Array.from(new Set(limitedCompras.map((row) => row.cartaoId)));
  const cards = cardIds.length > 0
    ? await db.select({
      id: cartoes.id,
      nome: cartoes.nome,
      diaVencimento: cartoes.diaVencimento,
      melhorDiaCompra: cartoes.melhorDiaCompra,
    }).from(cartoes).where(inArray(cartoes.id, cardIds))
    : [];
  const cardById = new Map(cards.map((card) => [card.id, card] as const));

  const allParcelas = compraIds.length > 0
    ? await db.select({
      id: parcelasCompra.id,
      userId: parcelasCompra.userId,
      compraCartaoId: parcelasCompra.compraCartaoId,
      numero: parcelasCompra.numero,
      dataVencimento: parcelasCompra.dataVencimento,
      statusCartao: parcelasCompra.statusCartao,
      dataPagamentoCartao: parcelasCompra.dataPagamentoCartao,
      statusPessoa: parcelasCompra.statusPessoa,
      dataPagamentoPessoa: parcelasCompra.dataPagamentoPessoa,
      comprovantePath: parcelasCompra.comprovantePath,
      comprovanteNome: parcelasCompra.comprovanteNome,
      comprovanteMimeType: parcelasCompra.comprovanteMimeType,
      comprovanteTamanho: parcelasCompra.comprovanteTamanho,
      comprovanteEnviadoEm: parcelasCompra.comprovanteEnviadoEm,
    }).from(parcelasCompra).where(inArray(parcelasCompra.compraCartaoId, compraIds))
    : [];
  const parcelasByCompraId = new Map<string, typeof allParcelas>();
  for (const row of allParcelas) {
    const bucket = parcelasByCompraId.get(row.compraCartaoId);
    if (bucket) bucket.push(row);
    else parcelasByCompraId.set(row.compraCartaoId, [row]);
  }

  const invoiceAnchorByCompraId = await buildInvoiceAnchorByCompraId(compraIdSet, options.userId);
  const suspects: DiagnosedCompra[] = [];
  let unchanged = 0;

  for (const compra of limitedCompras) {
    const card = cardById.get(compra.cartaoId);
    if (!card) continue;

    const currentRowsRaw = (parcelasByCompraId.get(compra.id) ?? []).slice().sort((a, b) => a.numero - b.numero);
    const invoiceAnchor = invoiceAnchorByCompraId.get(compra.id)?.vencimentoFatura ?? null;
    const suggestedRows = buildParcelasCompraRows({
      ...compra,
      vencimentoFatura: invoiceAnchor,
      dataPagamentoPessoa: null,
      pessoaId: compra.pessoaId,
    }, {
      cardCycle: {
        diaVencimento: card.diaVencimento,
        melhorDiaCompra: card.melhorDiaCompra,
      },
    });

    const diffs = diffParcelasCompetencySchedules(currentRowsRaw, suggestedRows);
    if (diffs.length === 0) {
      unchanged += 1;
      continue;
    }

    const reasons = buildSuspectReasons({
      diffs,
      compraDataCompra: compra.dataCompra,
      compraParcelas: compra.parcelas,
      currentRows: currentRowsRaw.map((row) => ({ numero: row.numero, dataVencimento: row.dataVencimento })),
      invoiceAnchor,
      parcelaAtual: compra.parcelaAtual,
    });
    const applyDecision = canAutoRematerializeCompetency(diffs);
    const hasParcelasPagas = currentRowsRaw.some((row) => row.statusCartao === "pago" || Boolean(row.dataPagamentoCartao));
    const hasComprovantes = currentRowsRaw.some((row) => Boolean(
      row.comprovantePath
      || row.comprovanteNome
      || row.comprovanteMimeType
      || row.comprovanteTamanho != null
      || row.comprovanteEnviadoEm != null
    ));
    const hasPagamentoPessoa = currentRowsRaw.some((row) => row.statusPessoa === "pago" || Boolean(row.dataPagamentoPessoa));
    const purchaseProtectedReason = hasParcelasPagas
      ? "compra_tem_parcelas_pagas"
      : hasComprovantes
        ? "compra_tem_comprovantes"
        : hasPagamentoPessoa
          ? "compra_tem_pagamento_pessoa"
          : (compra.statusPessoa === "pago" || Boolean(compra.dataPagamentoPessoa))
            ? "compra_status_pessoa_pago"
            : null;

    const canAutoApply = applyDecision.canApply && purchaseProtectedReason == null;
    const blockedReason = canAutoApply
      ? null
      : (purchaseProtectedReason ?? applyDecision.reason);

    suspects.push({
      compraCartaoId: compra.id,
      userId: compra.userId,
      cartaoId: compra.cartaoId,
      cartaoNome: card.nome,
      descricao: compra.descricao,
      dataCompra: compra.dataCompra,
      totalParcelas: compra.parcelas,
      parcelaAtual: compra.parcelaAtual,
      vencimentoFaturaImportada: invoiceAnchor,
      cronogramaAtual: currentRowsRaw.map((row) => ({
        numero: row.numero,
        dataVencimento: row.dataVencimento,
        statusCartao: row.statusCartao,
        statusPessoa: row.statusPessoa,
      })),
      cronogramaSugerido: suggestedRows.map((row) => ({
        numero: row.numero,
        dataVencimento: row.dataVencimento,
      })),
      diferencas: diffs,
      razoesSuspeita: reasons,
      hasParcelasPagas,
      hasComprovantes,
      hasPagamentoPessoa,
      statusPessoaCompra: compra.statusPessoa ?? null,
      reembolsoModo: compra.reembolsoModo ?? null,
      canAutoApply,
      blockedReason,
    });
  }

  let applied = 0;
  if (options.apply && options.confirm && suspects.length > 0) {
    for (const suspect of suspects) {
      if (!suspect.canAutoApply) {
        writeAuditLog({
          action: "update",
          status: "failure",
          domain: "parcelas_compra.competencia_rematerialization",
          route: "script/diagnose-parcelas-compra-competencia",
          method: "SCRIPT",
          userId: suspect.userId,
          targetId: suspect.compraCartaoId,
          details: {
            reason: suspect.blockedReason ?? "blocked",
            changedParcelasCount: suspect.diferencas.length,
          },
        });
        continue;
      }

      const purchaseDiffs = suspect.diferencas
        .filter((diff) => diff.kind === "due_date_mismatch" && diff.suggestedDueDate);
      if (purchaseDiffs.length === 0) continue;

      await db.transaction(async (tx) => {
        const rows = await tx.select({
          id: parcelasCompra.id,
          numero: parcelasCompra.numero,
        }).from(parcelasCompra).where(and(
          eq(parcelasCompra.compraCartaoId, suspect.compraCartaoId),
          eq(parcelasCompra.userId, suspect.userId),
        ));
        const rowByNumber = new Map(rows.map((row) => [row.numero, row] as const));

        for (const diff of purchaseDiffs) {
          const row = rowByNumber.get(diff.numero);
          if (!row || !diff.suggestedDueDate) continue;

          await tx.update(parcelasCompra).set({
            dataVencimento: diff.suggestedDueDate,
          }).where(and(
            eq(parcelasCompra.id, row.id),
            eq(parcelasCompra.userId, suspect.userId),
          ));
        }
      });

      applied += 1;
      writeAuditLog({
        action: "update",
        status: "success",
        domain: "parcelas_compra.competencia_rematerialization",
        route: "script/diagnose-parcelas-compra-competencia",
        method: "SCRIPT",
        userId: suspect.userId,
        targetId: suspect.compraCartaoId,
        details: {
          changedParcelasCount: purchaseDiffs.length,
          previousToNext: purchaseDiffs.map((diff) => ({
            numero: diff.numero,
            from: diff.currentDueDate,
            to: diff.suggestedDueDate,
          })),
        },
      });
    }
  }

  const summary: RunSummary = {
    scannedPurchases: limitedCompras.length,
    suspects: suspects.length,
    eligibleForAutoApply: suspects.filter((item) => item.canAutoApply).length,
    blocked: suspects.filter((item) => !item.canAutoApply).length,
    applied,
    unchanged,
  };

  if (options.json) {
    console.log(JSON.stringify({ summary, suspects }, null, 2));
    return;
  }

  console.log("[diagnose-parcelas-competencia] resumo");
  console.log(`- mode: ${options.apply ? "apply" : "diagnose"}`);
  console.log(`- confirm: ${options.confirm}`);
  console.log(`- userId: ${options.userId ?? "ALL"}`);
  console.log(`- compraId: ${options.compraId ?? "ALL"}`);
  console.log(`- scanned: ${summary.scannedPurchases}`);
  console.log(`- suspects: ${summary.suspects}`);
  console.log(`- unchanged: ${summary.unchanged}`);
  console.log(`- eligibleForAutoApply: ${summary.eligibleForAutoApply}`);
  console.log(`- blocked: ${summary.blocked}`);
  console.log(`- applied: ${summary.applied}`);

  if (suspects.length === 0) {
    console.log("Nenhuma compra suspeita encontrada.");
    return;
  }

  console.log("\n[preview] compras suspeitas");
  for (const suspect of suspects) {
    console.log(`\n- compra: ${suspect.compraCartaoId} | cartao: ${suspect.cartaoNome} (${suspect.cartaoId})`);
    console.log(`  descricao: ${suspect.descricao}`);
    console.log(`  dataCompra: ${suspect.dataCompra} | parcelas: ${suspect.parcelaAtual}/${suspect.totalParcelas}`);
    console.log(`  vencimentoFaturaImportada: ${suspect.vencimentoFaturaImportada ?? "n/a"}`);
    console.log(`  suspeitas: ${suspect.razoesSuspeita.join(", ") || "divergencia_detectada"}`);
    console.log(`  autoApply: ${suspect.canAutoApply ? "sim" : `nao (${suspect.blockedReason ?? "blocked"})`}`);
    console.log(`  diff: ${formatDifferencesCompact(suspect.diferencas)}`);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[diagnose-parcelas-competencia] erro: ${message}`);
  process.exit(1);
});
