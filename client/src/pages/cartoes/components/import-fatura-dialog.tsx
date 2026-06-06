import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Cartao } from "@shared/schema";
import type { CompraCartao } from "@shared/schema";
import type { Servico } from "@shared/schema";
import type { ServicoPessoa } from "@shared/schema";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import { findPossibleExistingPurchaseMatch } from "@/pages/cartoes/import-existing-purchase-match";
import type { CompraAliasApiModel, ImportConfirmResponse, ImportLogEntry } from "@/services/api/cartoes";
import { Button } from "@/components/ui/button";
import { ImportFaturaConfirmFooter } from "./import-fatura-confirm-footer";
import { ImportFaturaConfirmSummary } from "./import-fatura-confirm-summary";
import { ImportFaturaHistorySection } from "./import-fatura-history-section";
import { ImportFaturaIssuerMismatchWarning } from "./import-fatura-issuer-mismatch-warning";
import { ImportFaturaPreviewItemActions } from "./import-fatura-preview-item-actions";
import { ImportFaturaPreviewHeader } from "./import-fatura-preview-header";
import { ImportFaturaPreviewItemNotices } from "./import-fatura-preview-item-notices";
import { ImportFaturaPreviewItemReconcileInfo } from "./import-fatura-preview-item-reconcile-info";
import { ImportFaturaPreviewItemServiceInfo } from "./import-fatura-preview-item-service-info";
import { ImportFaturaPreviewItemSummary } from "./import-fatura-preview-item-summary";
import { ImportFaturaSourceTabsSection } from "./import-fatura-source-tabs-section";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type ImportTab = "texto" | "arquivo";
type CanonicalImportStatus = "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";
type PossibleExistingAction = "ignore" | "import_new" | "replace_existing";

interface ImportEditForm {
  descricao: string;
  valor: string;
  dataCompra: string;
  parcelas: string;
  parcelaAtual: string;
  vencimentoFatura: string;
}

function isStructurallyInvalid(item: ParsedItem): boolean {
  if (!item.descricao?.trim()) return true;
  if (!Number.isFinite(item.valor) || item.valor <= 0) return true;
  if (!Number.isFinite(item.valorParcela) || item.valorParcela <= 0) return true;
  if (!Number.isInteger(item.parcelas) || item.parcelas < 1 || item.parcelas > 360) return true;
  if (!Number.isInteger(item.parcelaAtual) || item.parcelaAtual < 1 || item.parcelaAtual > item.parcelas) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.dataCompra)) return true;
  return false;
}

function getEffectiveStatus(item: ParsedItem): CanonicalImportStatus {
  const hasDuplicate = Boolean(item.duplicateId || item.duplicata);
  const isInvalid = isStructurallyInvalid(item);
  if (isInvalid) return "invalido";

  if (item.status === "duplicata_exata" || item.status === "possivel_duplicata" || item.status === "novo") {
    return item.status;
  }
  if (item.status === "invalido") {
    return hasDuplicate ? "possivel_duplicata" : "novo";
  }
  return hasDuplicate ? "possivel_duplicata" : "novo";
}

function getStatusBadge(status: CanonicalImportStatus): { label: string; className: string } {
  switch (status) {
    case "novo":
      return { label: "Novo", className: "bg-emerald-500/10 text-emerald-700" };
    case "duplicata_exata":
      return { label: "Duplicata exata", className: "bg-orange-500/10 text-orange-700" };
    case "possivel_duplicata":
      return { label: "Duplicata possível", className: "bg-amber-500/10 text-amber-700" };
    case "invalido":
      return { label: "Inválido", className: "bg-red-500/10 text-red-700" };
    default:
      return { label: "Revisar", className: "bg-muted text-muted-foreground" };
  }
}

function formatHistoryDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function getHistoryStatusMeta(status: ImportLogEntry["status"]): { label: string; className: string } {
  switch (status) {
    case "confirmed":
      return { label: "Confirmado", className: "bg-emerald-500/10 text-emerald-700" };
    case "rolled_back":
      return { label: "Desfeito", className: "bg-muted text-muted-foreground" };
    case "previewed":
    default:
      return { label: "Prévia", className: "bg-blue-500/10 text-blue-700" };
  }
}

function formatServiceCategoryLabel(category?: string): string {
  switch (category) {
    case "streaming":
      return "Streaming";
    case "seguro":
      return "Seguro";
    case "software":
      return "Software";
    case "assinatura":
      return "Assinatura";
    default:
      return "Outro";
  }
}

interface ImportFaturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartoes: Cartao[];
  compras: CompraCartao[];
  importCartaoId: string;
  setImportCartaoId: (value: string) => void;
  servicos: Servico[];
  servicoPessoas: ServicoPessoa[];
  importCartaoHint: string;
  formatCartaoOptionLabel: (cartao: Cartao) => string;
  importTab: ImportTab;
  setImportTab: (value: ImportTab) => void;
  importTexto: string;
  setImportTexto: (value: string) => void;
  onParseTexto: () => void;
  importLoading: boolean;
  onFileUpload: (file: File) => void;
  importItems: ParsedItem[];
  setImportItems: Dispatch<SetStateAction<ParsedItem[]>>;
  importVencimento: string;
  setImportVencimento: (value: string) => void;
  onApplyVencimentoToAll: () => void;
  importEditingId: string | null;
  setImportEditingId: (value: string | null) => void;
  importEditForm: ImportEditForm;
  setImportEditForm: (value: ImportEditForm) => void;
  onApplyImportEdit: () => void;
  formatCurrency: (value: number) => string;
  isBatchImportPending: boolean;
  issuerMismatchWarning?: string;
  issuerMismatchRequiresAcknowledgement?: boolean;
  issuerMismatchAcknowledged?: boolean;
  onIssuerMismatchAcknowledgedChange?: (value: boolean) => void;
  onConfirmImport: () => void;
  confirmResult?: ImportConfirmResponse | null;
  onRollbackImport?: () => void;
  isRollbackPending?: boolean;
  onStartNewImport?: () => void;
  importLogs?: ImportLogEntry[];
  isImportLogsLoading?: boolean;
  rollbackImportLogLoadingId?: string | null;
  onRollbackImportLog?: (importLogId: string) => void;
  onRememberCompraAlias?: (params: { item: ParsedItem; existingCompra: CompraCartao }) => Promise<void>;
  rememberingCompraAliasByItemId?: Record<string, boolean>;
  savedCompraAliasByItemId?: Record<string, boolean>;
  compraAliases?: CompraAliasApiModel[];
  isCompraAliasesLoading?: boolean;
}

export function ImportFaturaDialog({
  open,
  onOpenChange,
  cartoes,
  compras,
  importCartaoId,
  setImportCartaoId,
  servicos,
  servicoPessoas,
  importCartaoHint,
  formatCartaoOptionLabel,
  importTab,
  setImportTab,
  importTexto,
  setImportTexto,
  onParseTexto,
  importLoading,
  onFileUpload,
  importItems,
  setImportItems,
  importVencimento,
  setImportVencimento,
  onApplyVencimentoToAll,
  importEditingId,
  setImportEditingId,
  importEditForm,
  setImportEditForm,
  onApplyImportEdit,
  formatCurrency,
  isBatchImportPending,
  issuerMismatchWarning = "",
  issuerMismatchRequiresAcknowledgement = false,
  issuerMismatchAcknowledged = false,
  onIssuerMismatchAcknowledgedChange,
  onConfirmImport,
  confirmResult,
  onRollbackImport,
  isRollbackPending = false,
  onStartNewImport,
  importLogs = [],
  isImportLogsLoading = false,
  rollbackImportLogLoadingId = null,
  onRollbackImportLog,
  onRememberCompraAlias,
  rememberingCompraAliasByItemId = {},
  savedCompraAliasByItemId = {},
  compraAliases = [],
  isCompraAliasesLoading = false,
}: ImportFaturaDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const totalImportar = importItems.filter((item) => {
    const status = getEffectiveStatus(item);
    if (item.action !== "import") return false;
    if (status === "invalido") return false;
    if (status === "duplicata_exata" && item.forceImport !== true) return false;
    return true;
  }).length;
  const totalReconciliar = importItems.filter((item) => (
    item.reconcileAction === "replace_existing" && Boolean(item.reconcileExistingCompraCartaoId)
  )).length;
  const totalMensalImportar = importItems
    .filter((item) => {
      const status = getEffectiveStatus(item);
      if (item.action !== "import") return false;
      if (status === "invalido") return false;
      if (status === "duplicata_exata" && item.forceImport !== true) return false;
      return true;
    })
    .reduce((sum, item) => sum + item.valorParcela, 0);
  const hasInvalidImportAttempt = importItems.some((item) => (
    item.action === "import" && getEffectiveStatus(item) === "invalido"
  ));
  const hasDuplicateExactWithoutForce = importItems.some((item) => (
    item.action === "import" &&
    getEffectiveStatus(item) === "duplicata_exata" &&
    item.forceImport !== true
  ));
  const confirmSummary = confirmResult?.summary ?? {
    totalProcessed: (confirmResult?.createdCount ?? 0) + (confirmResult?.skippedCount ?? 0),
    createdCount: confirmResult?.createdCount ?? 0,
    ignoredCount: confirmResult?.skippedCount ?? 0,
    blockedExactDuplicates: 0,
    forcedExactDuplicates: 0,
    invalidCount: 0,
    errorCount: 0,
    servicesCreatedCount: 0,
    servicesSkippedCount: 0,
    servicesLinkedCount: 0,
    servicesLinkSkippedCount: 0,
    reconciledExistingCount: 0,
  };
  const hasConfirmSummary = Boolean(confirmResult);
  const historyItems = importLogs.map((log) => {
    const status = getHistoryStatusMeta(log.status);
    return {
      id: log.id,
      createdAtLabel: formatHistoryDateTime(log.createdAt),
      batchId: log.id.slice(0, 8),
      cartaoNome: cartoes.find((cartao) => cartao.id === log.cartaoId)?.nome ?? `Cartão ${log.cartaoId.slice(0, 8)}`,
      statusLabel: status.label,
      statusClassName: status.className,
      importedItems: log.importedItems,
      skippedItems: log.skippedItems,
      canRollback: log.status === "confirmed",
      isRollbackPending: rollbackImportLogLoadingId === log.id,
      isRolledBack: log.status === "rolled_back",
      rollbackServicesRemovedCount: log.rollbackServicesRemovedCount ?? 0,
      rollbackServicesUnlinkedCount: log.rollbackServicesUnlinkedCount ?? 0,
      rollbackServicesRestoredCount: log.rollbackServicesRestoredCount ?? 0,
      rollbackWarningsCount: log.rollbackWarningsCount ?? 0,
    };
  });
  const servicoPessoasCountByServicoId = useMemo(() => {
    const map = new Map<string, number>();
    for (const vinculo of servicoPessoas) {
      map.set(vinculo.servicoId, (map.get(vinculo.servicoId) ?? 0) + 1);
    }
    return map;
  }, [servicoPessoas]);
  const possibleExistingByItemId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findPossibleExistingPurchaseMatch>>();
    for (const item of importItems) {
      const match = findPossibleExistingPurchaseMatch(item, compras, importCartaoId, compraAliases);
      if (!match) continue;
      if (item.duplicata?.id && item.duplicata.id === match.existing.id) continue;
      map.set(item.id, match);
    }
    return map;
  }, [compras, importCartaoId, importItems, compraAliases]);
  const hasReconcileWithoutTarget = importItems.some((item) => (
    item.reconcileAction === "replace_existing" && !item.reconcileExistingCompraCartaoId
  ));
  const hasReconcilePendingValueConfirmation = importItems.some((item) => {
    if (item.reconcileAction !== "replace_existing") return false;
    const possibleExisting = possibleExistingByItemId.get(item.id);
    if (!possibleExisting) return false;
    const requiresConfirmation = possibleExisting.valueDiff > 0.01 || possibleExisting.totalDiff > 0.01;
    if (!requiresConfirmation) return false;
    return item.reconcileConfirmValueChange !== true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:w-full sm:p-6">
        <DialogHeader>
          <DialogTitle>Importar Fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cartão de destino (obrigatório)</Label>
            <Select value={importCartaoId} onValueChange={setImportCartaoId}>
              <SelectTrigger data-testid="select-import-cartao">
                <SelectValue placeholder="Selecione o cartão para esta importação" />
              </SelectTrigger>
              <SelectContent>
                {cartoes.map((cartao) => (
                  <SelectItem key={cartao.id} value={cartao.id}>
                    {formatCartaoOptionLabel(cartao)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {importCartaoHint ? (
              <p className="text-xs text-amber-700">{importCartaoHint}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                O cartão é obrigatório. O sistema não usa mais o primeiro cartão automaticamente.
              </p>
            )}
          </div>

          <ImportFaturaHistorySection
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory((current) => !current)}
            isImportLogsLoading={isImportLogsLoading}
            items={historyItems}
            onRollbackImportLog={onRollbackImportLog}
          />

          <div className={hasConfirmSummary ? "hidden" : "space-y-4"}>
          <ImportFaturaSourceTabsSection
            importTab={importTab}
            onImportTabChange={setImportTab}
            importTexto={importTexto}
            onImportTextoChange={setImportTexto}
            onParseTexto={onParseTexto}
            fileInputRef={fileInputRef}
            onFileSelected={onFileUpload}
            onUploadClick={() => fileInputRef.current?.click()}
            isUploadDisabled={importLoading}
            uploadButtonLabel={importLoading ? "Processando..." : "Selecionar arquivo"}
          />

          {importItems.length > 0 && (
            <div className="space-y-3">
              <ImportFaturaPreviewHeader
                detectedCount={importItems.length}
                onMarkAll={() => setImportItems((items) => items.map((item) => {
                  const status = getEffectiveStatus(item);
                  if (status === "invalido") {
                    return {
                      ...item,
                      action: "skip",
                      forceImport: false,
                      reconcileAction: "none",
                      reconcileExistingCompraCartaoId: null,
                      reconcileConfirmValueChange: false,
                      reconcileUpdateNameFromImport: false,
                    };
                  }
                  if (status === "duplicata_exata") {
                    return {
                      ...item,
                      action: "skip",
                      forceImport: false,
                      reconcileAction: "none",
                      reconcileExistingCompraCartaoId: null,
                      reconcileConfirmValueChange: false,
                      reconcileUpdateNameFromImport: false,
                    };
                  }
                  return {
                    ...item,
                    action: "import",
                    forceImport: false,
                    reconcileAction: "none",
                    reconcileExistingCompraCartaoId: null,
                    reconcileConfirmValueChange: false,
                    reconcileUpdateNameFromImport: false,
                  };
                }))}
                onIgnoreAll={() => setImportItems((items) => items.map((item) => ({
                  ...item,
                  action: "skip",
                  forceImport: false,
                  reconcileAction: "none",
                  reconcileExistingCompraCartaoId: null,
                  reconcileConfirmValueChange: false,
                  reconcileUpdateNameFromImport: false,
                })))}
                importVencimento={importVencimento}
                onImportVencimentoChange={setImportVencimento}
                onApplyVencimentoToAll={onApplyVencimentoToAll}
                isApplyVencimentoDisabled={!importVencimento}
              />

              <div className="border rounded-md overflow-hidden divide-y divide-border/40">
                {importItems.map((item, idx) => {
                  const isEditingRow = importEditingId === item.id;
                  const status = getEffectiveStatus(item);
                  const statusBadge = getStatusBadge(status);
                  const possibleExisting = possibleExistingByItemId.get(item.id) ?? null;
                  const possibleExistingAction: PossibleExistingAction =
                    item.reconcileAction === "replace_existing"
                      ? "replace_existing"
                      : item.action === "skip"
                        ? "ignore"
                        : "import_new";
                  const requiresReconcileValueChangeConfirmation = Boolean(
                    possibleExisting && (possibleExisting.valueDiff > 0.01 || possibleExisting.totalDiff > 0.01),
                  );
                  const isSavingCompraAlias = rememberingCompraAliasByItemId[item.id] === true;
                  const compraAliasSaved = savedCompraAliasByItemId[item.id] === true;
                  const serviceCandidate = item.recurringServiceCandidate;
                  const isServiceCandidate = Boolean(serviceCandidate?.isServiceCandidate);
                  const serviceAction = item.serviceSuggestionAction ?? "ignore";
                  const selectedLinkedService = servicos.find((servico) => servico.id === item.linkedServiceId) ?? null;
                  const selectedLinkedServiceSharedPeopleCount = selectedLinkedService
                    ? (servicoPessoasCountByServicoId.get(selectedLinkedService.id) ?? 0)
                    : 0;
                  const selectValue = status === "duplicata_exata"
                    ? (item.action === "import" && item.forceImport === true ? "force" : "skip")
                    : item.action;
                  const rowClassName =
                    status === "invalido"
                      ? "bg-red-500/5"
                      : status === "duplicata_exata"
                        ? "bg-orange-500/5"
                        : status === "possivel_duplicata"
                          ? "bg-amber-500/5"
                          : item.action === "skip"
                            ? "bg-muted/20 opacity-60"
                            : "";
                  const confidenceClassName =
                    typeof item.confidenceScore === "number"
                      ? item.confidenceScore >= 85
                        ? "text-emerald-600"
                        : item.confidenceScore >= 65
                          ? "text-amber-600"
                          : "text-red-600"
                      : undefined;

                  return (
                    <div
                      key={item.id}
                      data-testid={`row-import-${idx}`}
                      className={`text-sm ${rowClassName}`}
                    >
                      {isEditingRow ? (
                        <div className="space-y-2 p-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Descricao</p>
                              <Input
                                className="h-7 text-xs"
                                value={importEditForm.descricao}
                                onChange={(event) => setImportEditForm({ ...importEditForm, descricao: event.target.value })}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Valor da parcela (R$)</p>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-7 text-xs"
                                value={importEditForm.valor}
                                onChange={(event) => setImportEditForm({ ...importEditForm, valor: event.target.value })}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Data compra</p>
                              <Input
                                type="date"
                                className="h-7 text-xs"
                                value={importEditForm.dataCompra}
                                onChange={(event) => setImportEditForm({ ...importEditForm, dataCompra: event.target.value })}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Parcela atual</p>
                              <Input
                                type="number"
                                min="1"
                                className="h-7 text-xs"
                                value={importEditForm.parcelaAtual}
                                onChange={(event) => setImportEditForm({ ...importEditForm, parcelaAtual: event.target.value })}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Total parcelas</p>
                              <Input
                                type="number"
                                min="1"
                                max="48"
                                className="h-7 text-xs"
                                value={importEditForm.parcelas}
                                onChange={(event) => setImportEditForm({ ...importEditForm, parcelas: event.target.value })}
                              />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Vencimento desta fatura</p>
                            <Input
                              type="date"
                              className="h-7 text-xs"
                              value={importEditForm.vencimentoFatura}
                              onChange={(event) => setImportEditForm({ ...importEditForm, vencimentoFatura: event.target.value })}
                            />
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button size="sm" className="h-8 text-xs sm:h-7" onClick={onApplyImportEdit}>Salvar</Button>
                            <Button variant="ghost" size="sm" className="h-8 text-xs sm:h-7" onClick={() => setImportEditingId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start gap-2 px-3 py-2">
                          <Select
                            value={selectValue}
                            onValueChange={(value) => setImportItems((items) => items.map((current, index) => {
                              if (index !== idx) return current;
                              const currentStatus = getEffectiveStatus(current);
                              if (currentStatus === "invalido") {
                                return {
                                  ...current,
                                  action: "skip",
                                  forceImport: false,
                                  reconcileAction: "none",
                                  reconcileExistingCompraCartaoId: null,
                                  reconcileConfirmValueChange: false,
                                  reconcileUpdateNameFromImport: false,
                                };
                              }
                              if (currentStatus === "duplicata_exata") {
                                if (value === "force") {
                                  return {
                                    ...current,
                                    action: "import",
                                    forceImport: true,
                                    reconcileAction: "none",
                                    reconcileExistingCompraCartaoId: null,
                                    reconcileConfirmValueChange: false,
                                    reconcileUpdateNameFromImport: false,
                                  };
                                }
                                return {
                                  ...current,
                                  action: "skip",
                                  forceImport: false,
                                  reconcileAction: "none",
                                  reconcileExistingCompraCartaoId: null,
                                  reconcileConfirmValueChange: false,
                                  reconcileUpdateNameFromImport: false,
                                };
                              }
                              return {
                                ...current,
                                action: value as "import" | "skip",
                                forceImport: false,
                                reconcileAction: "none",
                                reconcileExistingCompraCartaoId: null,
                                reconcileConfirmValueChange: false,
                                reconcileUpdateNameFromImport: false,
                              };
                            }))}
                          >
                            <SelectTrigger className="mt-0.5 h-7 w-20 flex-shrink-0 text-xs sm:mt-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {status === "duplicata_exata" ? (
                                <SelectItem value="force">Forçar</SelectItem>
                              ) : (
                                <SelectItem value="import">Importar</SelectItem>
                              )}
                              <SelectItem value="skip">Ignorar</SelectItem>
                            </SelectContent>
                          </Select>

                          <div className="flex-1 min-w-0">
                            <ImportFaturaPreviewItemSummary
                              descricao={item.descricao}
                              statusLabel={statusBadge.label}
                              statusClassName={statusBadge.className}
                              showReviewBadge={item.reviewRequired === true}
                              showTaxaBadge={item.tipo === "taxa"}
                              showServiceBadge={isServiceCandidate}
                              valorParcelaLabel={`${formatCurrency(item.valorParcela)}/parc`}
                              totalLabel={`Total: ${formatCurrency(item.valor)}`}
                              parcelaLabel={`Parc ${item.parcelaAtual}/${item.parcelas}`}
                              parcelasRestantesLabel={item.parcelasRestantes > 0 ? ` · faltam ${item.parcelasRestantes}` : null}
                              dataCompraLabel={`Compra: ${item.dataCompra}`}
                              vencimentoLabel={item.vencimentoFatura ? `Venc: ${item.vencimentoFatura}` : null}
                              confidenceLabel={typeof item.confidenceScore === "number" ? `Confiança: ${Math.round(item.confidenceScore)}%` : null}
                              confidenceClassName={confidenceClassName}
                              showDuplicateForceWarning={status === "duplicata_exata" && item.forceImport !== true}
                            />
                            {isServiceCandidate ? (
                              <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-2 py-2 space-y-2">
                                <ImportFaturaPreviewItemServiceInfo
                                  serviceInfoLabel={`${
                                    serviceCandidate?.matchedProvider
                                      ? `Parece ${serviceCandidate.matchedProvider}`
                                      : "Possível serviço recorrente"
                                  } · ${formatServiceCategoryLabel(serviceCandidate?.categorySuggestion)}`}
                                  serviceConfidenceLabel={`Confiança ${serviceCandidate?.confidence ?? "baixa"}`}
                                  sharedServiceNotice={
                                    serviceAction === "link_existing" && selectedLinkedService && selectedLinkedServiceSharedPeopleCount > 0
                                      ? "Este serviço é compartilhado. A cobrança foi vinculada, mas o mês só será marcado como pago quando a pessoa pagar a parte dela."
                                      : null
                                  }
                                  createSuggestionName={
                                    serviceAction === "create_new" && item.createServiceSuggestion
                                      ? item.createServiceSuggestion.nome
                                      : null
                                  }
                                  createSuggestionDetailsLabel={
                                    serviceAction === "create_new" && item.createServiceSuggestion
                                      ? `(${formatCurrency(item.createServiceSuggestion.valorMensal)}/mês, cobrança dia ${item.createServiceSuggestion.dataCobranca}, categoria ${formatServiceCategoryLabel(item.createServiceSuggestion.categoria)}). O serviço será criado ao confirmar a importação deste item.`
                                      : null
                                  }
                                  serviceSuggestionWarning={item.serviceSuggestionWarning ?? null}
                                  selectLinkedServiceWarning={
                                    serviceAction === "link_existing" && selectedLinkedService == null
                                      ? "Selecione um serviço para concluir o vínculo sugerido."
                                      : null
                                  }
                                >
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    <Select
                                      value={serviceAction}
                                      onValueChange={(value) => {
                                        const nextAction = value as "ignore" | "link_existing" | "create_new";
                                        setImportItems((items) => items.map((current, index) => {
                                          if (index !== idx) return current;
                                          return {
                                            ...current,
                                            serviceSuggestionAction: nextAction,
                                            linkedServiceId: nextAction === "link_existing"
                                              ? (current.linkedServiceId ?? null)
                                              : null,
                                            replaceExistingServiceLink: nextAction === "link_existing"
                                              ? current.replaceExistingServiceLink === true
                                              : false,
                                          };
                                        }));
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Ação do serviço" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ignore">Ignorar sugestão</SelectItem>
                                        <SelectItem value="link_existing">Vincular serviço existente</SelectItem>
                                        <SelectItem value="create_new">Criar novo serviço</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {serviceAction === "link_existing" ? (
                                      <Select
                                        value={item.linkedServiceId ?? "__none"}
                                        onValueChange={(value) => {
                                          setImportItems((items) => items.map((current, index) => {
                                            if (index !== idx) return current;
                                            return {
                                              ...current,
                                              linkedServiceId: value === "__none" ? null : value,
                                              replaceExistingServiceLink: false,
                                            };
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue placeholder="Selecione o serviço" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none">Sem vínculo</SelectItem>
                                          {servicos.length === 0 ? (
                                            <SelectItem value="__empty" disabled>
                                              Nenhum serviço cadastrado
                                            </SelectItem>
                                          ) : (
                                            servicos.map((servico) => (
                                              <SelectItem key={servico.id} value={servico.id}>
                                                {servico.nome} · {formatCurrency(Number(servico.valorMensal) || 0)}
                                              </SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    ) : null}
                                  </div>

                                  {serviceAction === "link_existing" && selectedLinkedService?.compraCartaoId ? (
                                    <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-2">
                                      <p className="text-xs text-amber-800">
                                        Este serviço já está vinculado a outra compra. Deseja substituir o vínculo?
                                      </p>
                                      <label className="mt-1 inline-flex items-center gap-2 text-xs text-amber-900">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5"
                                          checked={item.replaceExistingServiceLink === true}
                                          onChange={(event) => {
                                            const checked = event.target.checked;
                                            setImportItems((items) => items.map((current, index) => (
                                              index === idx
                                                ? { ...current, replaceExistingServiceLink: checked }
                                                : current
                                            )));
                                          }}
                                        />
                                        <span>Estou ciente e quero substituir o vínculo existente.</span>
                                      </label>
                                    </div>
                                  ) : null}
                                </ImportFaturaPreviewItemServiceInfo>
                              </div>
                            ) : null}
                            <ImportFaturaPreviewItemNotices
                              validationIssues={item.validationIssues}
                              duplicateNotice={
                                item.duplicata
                                  ? `Similar a: "${item.duplicata.descricao}" (${formatCurrency(Number(item.duplicata.valorParcela))})`
                                  : null
                              }
                              showAliasesLoadingNotice={isCompraAliasesLoading && possibleExisting != null}
                            />
                            {possibleExisting ? (
                              <div className="mt-2 space-y-1.5 rounded-md border border-sky-200 bg-sky-50/60 px-2 py-2">
                                <ImportFaturaPreviewItemReconcileInfo
                                  title={possibleExisting.aliasMatched
                                    ? "Essa compra parece já existir"
                                    : "Essa compra pode já existir"}
                                  showRecognizedBadge={possibleExisting.aliasMatched}
                                  recognizedBadgeLabel="Já reconhecido"
                                  firstInfoPrefix={possibleExisting.aliasMatched
                                    ? "A fatura trouxe o nome:"
                                    : "A fatura trouxe:"}
                                  firstInfoValue={item.descricao}
                                  secondInfoPrefix={possibleExisting.aliasMatched
                                    ? "Mas você já salvou essa compra como:"
                                    : "Encontramos uma compra parecida:"}
                                  secondInfoValue={possibleExisting.aliasMatched
                                    ? (possibleExisting.aliasMatchedNameOriginal ?? possibleExisting.existing.descricao)
                                    : possibleExisting.existing.descricao}
                                  thirdInfoText={possibleExisting.aliasMatched
                                    ? "O sistema reconheceu que esses dois nomes representam a mesma compra."
                                    : "Os valores e parcelas são muito parecidos."}
                                  recommendationText="Recomendado: use a compra já existente para evitar duplicidade."
                                  keepExistingNameText={possibleExisting.existing.descricao}
                                  keepAliasNameText={item.descricao}
                                />
                                <div className="max-w-xs">
                                  <Select
                                    value={possibleExistingAction}
                                    onValueChange={(value) => {
                                      const nextAction = value as PossibleExistingAction;
                                      setImportItems((items) => items.map((current, index) => {
                                        if (index !== idx) return current;

                                        if (nextAction === "replace_existing") {
                                          return {
                                            ...current,
                                            action: "skip",
                                            forceImport: false,
                                            reconcileAction: "replace_existing",
                                            reconcileExistingCompraCartaoId: possibleExisting.existing.id,
                                            reconcileConfirmValueChange: requiresReconcileValueChangeConfirmation
                                              ? current.reconcileConfirmValueChange === true
                                              : true,
                                            reconcileUpdateNameFromImport: current.reconcileUpdateNameFromImport === true,
                                            serviceSuggestionAction: "ignore",
                                            linkedServiceId: null,
                                            replaceExistingServiceLink: false,
                                          };
                                        }

                                        return {
                                          ...current,
                                          action: nextAction === "ignore" ? "skip" : "import",
                                          forceImport: false,
                                          reconcileAction: "none",
                                          reconcileExistingCompraCartaoId: possibleExisting.existing.id,
                                          reconcileConfirmValueChange: false,
                                          reconcileUpdateNameFromImport: false,
                                        };
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs" aria-label="Escolha o que fazer com esta compra">
                                      <SelectValue placeholder="Escolha como tratar esta compra" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ignore">Ignorar</SelectItem>
                                      <SelectItem value="import_new">Importar como nova</SelectItem>
                                      <SelectItem value="replace_existing">Usar compra já existente</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {possibleExistingAction === "replace_existing" ? (
                                  <p className="text-[11px] text-sky-700">Não será criada uma nova compra.</p>
                                ) : null}
                                {possibleExistingAction === "import_new" ? (
                                  <p className="text-[11px] text-amber-700">Isso criará uma compra separada.</p>
                                ) : null}
                                <details className="rounded border border-sky-200 bg-white/60 px-2 py-1">
                                  <summary className="cursor-pointer text-[11px] font-medium text-sky-800">
                                    Ver detalhes da comparação
                                  </summary>
                                  <div className="mt-1 space-y-1 text-[11px] text-sky-700">
                                    <p>
                                      Parcela: {formatCurrency(item.valorParcela)} (fatura) vs{" "}
                                      {formatCurrency(Number(possibleExisting.existing.valorParcela))} (existente)
                                    </p>
                                    <p>
                                      Total: {formatCurrency(item.valorParcela * item.parcelas)} (fatura) vs{" "}
                                      {formatCurrency(Number(possibleExisting.existing.valorTotal))} (existente)
                                    </p>
                                    <p>
                                      Parcelas: {item.parcelaAtual}/{item.parcelas}x (fatura) vs{" "}
                                      {possibleExisting.existing.parcelaAtual}/{possibleExisting.existing.parcelas}x
                                      {" "}(existente)
                                    </p>
                                    <p>
                                      Confiança da comparação: {possibleExisting.confidence} · diferença da parcela:{" "}
                                      {formatCurrency(possibleExisting.valueDiff)} · diferença do total:{" "}
                                      {formatCurrency(possibleExisting.totalDiff)} · equivalência salva:{" "}
                                      {possibleExisting.aliasMatched ? "sim" : "não"}
                                    </p>
                                  </div>
                                </details>
                                {possibleExistingAction === "replace_existing" ? (
                                  <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-2">
                                    <p className="text-xs text-amber-900">
                                      Esta ação atualiza a compra existente sem criar nova compra.
                                      Parcelas pagas e comprovantes são preservados.
                                    </p>
                                    <label className="mt-1 inline-flex items-center gap-2 text-xs text-amber-900">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5"
                                        checked={item.reconcileUpdateNameFromImport === true}
                                        onChange={(event) => {
                                          const checked = event.target.checked;
                                          setImportItems((items) => items.map((current, index) => (
                                            index === idx
                                              ? { ...current, reconcileUpdateNameFromImport: checked }
                                              : current
                                          )));
                                        }}
                                      />
                                      <span>
                                        Atualizar nome da compra para o nome da fatura.
                                        {item.reconcileUpdateNameFromImport === true
                                          ? ` Isso substituirá "${possibleExisting.existing.descricao}" por "${item.descricao}".`
                                          : ""}
                                      </span>
                                    </label>
                                    {requiresReconcileValueChangeConfirmation ? (
                                      <label className="mt-1 inline-flex items-center gap-2 text-xs text-amber-900">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5"
                                          checked={item.reconcileConfirmValueChange === true}
                                          onChange={(event) => {
                                            const checked = event.target.checked;
                                            setImportItems((items) => items.map((current, index) => (
                                              index === idx
                                                ? { ...current, reconcileConfirmValueChange: checked }
                                                : current
                                            )));
                                          }}
                                        />
                                        <span>
                                          Essa ação atualizará a compra existente de{" "}
                                          {formatCurrency(Number(possibleExisting.existing.valorParcela))} para{" "}
                                          {formatCurrency(item.valorParcela)} por parcela.
                                        </span>
                                      </label>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap items-center gap-2">
                                  {compraAliasSaved ? (
                                    <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                      Equivalência salva
                                    </span>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!onRememberCompraAlias || isSavingCompraAlias || compraAliasSaved}
                                    onClick={() => {
                                      if (!onRememberCompraAlias) return;
                                      void onRememberCompraAlias({
                                        item,
                                        existingCompra: possibleExisting.existing,
                                      });
                                    }}
                                  >
                                    {isSavingCompraAlias ? "Salvando..." : "Salvar como mesma compra"}
                                  </Button>
                                </div>
                                <p className="text-[11px] text-sky-700">
                                  Ao salvar, o sistema vai reconhecer esse nome nas próximas faturas.
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <ImportFaturaPreviewItemActions
                            editAriaLabel={`Editar item ${idx + 1} da importação`}
                            editTitle="Editar item"
                            editTestId={`button-edit-import-item-${idx}`}
                            onEdit={() => {
                              setImportEditingId(item.id);
                              setImportEditForm({
                                descricao: item.descricao,
                                valor: String(item.valorParcela),
                                dataCompra: item.dataCompra,
                                parcelas: String(item.parcelas),
                                parcelaAtual: String(item.parcelaAtual),
                                vencimentoFatura: item.vencimentoFatura ?? "",
                              });
                            }}
                            removeAriaLabel={`Remover item ${idx + 1} da importação`}
                            removeTitle="Remover item"
                            removeTestId={`button-remove-import-item-${idx}`}
                            onRemove={() => setImportItems((items) => items.filter((_, index) => index !== idx))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <ImportFaturaConfirmFooter
                totalImportar={totalImportar}
                totalItems={importItems.length}
                totalReconciliar={totalReconciliar}
                totalMensalImportarLabel={formatCurrency(totalMensalImportar)}
                hasReconcileWithoutTarget={hasReconcileWithoutTarget}
                hasReconcilePendingValueConfirmation={hasReconcilePendingValueConfirmation}
                hasInvalidImportAttempt={hasInvalidImportAttempt}
                hasDuplicateExactWithoutForce={hasDuplicateExactWithoutForce}
                isConfirmDisabled={
                  (totalImportar === 0 && totalReconciliar === 0)
                  || isBatchImportPending
                  || !importCartaoId
                  || hasInvalidImportAttempt
                  || hasDuplicateExactWithoutForce
                  || hasReconcileWithoutTarget
                  || hasReconcilePendingValueConfirmation
                  || (issuerMismatchRequiresAcknowledgement && !issuerMismatchAcknowledged)
                }
                isBatchImportPending={isBatchImportPending}
                onConfirmImport={onConfirmImport}
              >
                {issuerMismatchWarning ? (
                  <ImportFaturaIssuerMismatchWarning
                    warning={issuerMismatchWarning}
                    requiresAcknowledgement={issuerMismatchRequiresAcknowledgement}
                    acknowledged={issuerMismatchAcknowledged}
                    onAcknowledgedChange={onIssuerMismatchAcknowledgedChange}
                  />
                ) : null}
              </ImportFaturaConfirmFooter>
            </div>
          )}
          </div>

          {hasConfirmSummary ? (
            <ImportFaturaConfirmSummary
              batchId={confirmResult?.importLogId.slice(0, 8)}
              summary={confirmSummary}
              onStartNewImport={onStartNewImport}
              onRollbackImport={onRollbackImport}
              isRollbackPending={isRollbackPending}
              onClose={() => onOpenChange(false)}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}


