import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Cartao } from "@shared/schema";
import type { CompraCartao } from "@shared/schema";
import type { Servico } from "@shared/schema";
import type { ServicoPessoa } from "@shared/schema";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import { findPossibleExistingPurchaseMatch } from "@/pages/cartoes/import-existing-purchase-match";
import type { CompraAliasApiModel, ImportConfirmResponse, ImportLogEntry } from "@/services/api/cartoes";
import { FileText, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

          <div className="rounded-md border px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">Histórico</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs sm:w-auto"
                onClick={() => setShowHistory((current) => !current)}
                data-testid="button-toggle-import-history"
              >
                {showHistory ? "Ocultar" : "Ver importações anteriores"}
              </Button>
            </div>
            {showHistory ? (
              <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
                {isImportLogsLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                ) : importLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma importação anterior encontrada.</p>
                ) : (
                  importLogs.map((log) => {
                    const status = getHistoryStatusMeta(log.status);
                    return (
                      <div key={log.id} className="rounded-md border px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {formatHistoryDateTime(log.createdAt)} · Lote {log.id.slice(0, 8)}
                            </p>
                            <p className="text-sm font-medium truncate">
                              {cartoes.find((cartao) => cartao.id === log.cartaoId)?.nome ?? `Cartão ${log.cartaoId.slice(0, 8)}`}
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            Criadas: {log.importedItems} · Ignoradas: {log.skippedItems}
                          </p>
                          {log.status === "confirmed" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={rollbackImportLogLoadingId === log.id}
                              onClick={() => onRollbackImportLog?.(log.id)}
                              data-testid={`button-rollback-log-${log.id}`}
                            >
                              {rollbackImportLogLoadingId === log.id ? "Desfazendo..." : "Desfazer"}
                            </Button>
                          ) : null}
                        </div>
                        {log.status === "rolled_back" ? (
                          <div className="text-[11px] text-muted-foreground space-y-0.5">
                            <p>
                              Serviços removidos: {log.rollbackServicesRemovedCount ?? 0}
                              {" · "}
                              Desvinculados: {log.rollbackServicesUnlinkedCount ?? 0}
                              {" · "}
                              Restaurados: {log.rollbackServicesRestoredCount ?? 0}
                            </p>
                            {(log.rollbackWarningsCount ?? 0) > 0 ? (
                              <p className="text-amber-700">
                                Avisos de segurança: {log.rollbackWarningsCount}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          <div className={hasConfirmSummary ? "hidden" : "space-y-4"}>
          <Tabs value={importTab} onValueChange={(value) => setImportTab(value as ImportTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="texto" className="flex-1">Colar texto / CSV</TabsTrigger>
              <TabsTrigger value="arquivo" className="flex-1">Enviar arquivo</TabsTrigger>
            </TabsList>

            <TabsContent value="texto" className="space-y-3">
              <Label>Cole o extrato da fatura (texto livre, CSV, ou linha por linha)</Label>
              <Textarea
                data-testid="textarea-import-texto"
                value={importTexto}
                onChange={(event) => setImportTexto(event.target.value)}
                placeholder={"Exemplos:\n25/02 NETFLIX 60,00 1/1\n01/02 LOJA ABC 150,00 3/10\n\nOu CSV:\nData,Descricao,Valor\n25/02/2026,NETFLIX,60.00"}
                rows={6}
                className="font-mono text-sm"
              />
              <Button
                onClick={onParseTexto}
                className="w-full"
                data-testid="button-parse-texto"
              >
                <FileText className="w-4 h-4 mr-2" /> Detectar compras
              </Button>
            </TabsContent>

            <TabsContent value="arquivo" className="space-y-3">
              <div className="space-y-3 rounded-lg border-2 border-dashed p-4 text-center sm:p-8">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Arraste ou selecione o arquivo</p>
                  <p className="text-xs text-muted-foreground">
                    Formatos suportados: CSV, OFX, QFX, TXT e PDF textual (PDF escaneado ainda não)
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.ofx,.qfx,.txt,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected) onFileUpload(selected);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLoading}
                  data-testid="button-upload-file"
                >
                  {importLoading ? "Processando..." : "Selecionar arquivo"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {importItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">{importItems.length} compra(s) detectada(s)</p>
                <div className="flex w-full flex-wrap gap-1 sm:w-auto sm:justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setImportItems((items) => items.map((item) => {
                      const status = getEffectiveStatus(item);
                      if (status === "invalido") {
                        return { ...item, action: "skip", forceImport: false };
                      }
                      if (status === "duplicata_exata") {
                        return { ...item, action: "skip", forceImport: false };
                      }
                      return { ...item, action: "import", forceImport: false };
                    }))}
                  >
                    Marcar todas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setImportItems((items) => items.map((item) => ({ ...item, action: "skip", forceImport: false })))}
                  >
                    Ignorar todas
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label className="text-xs sm:flex-shrink-0">Vencimento da fatura (opcional):</Label>
                <Input
                  type="date"
                  className="h-8 text-xs sm:h-7 sm:flex-1"
                  value={importVencimento}
                  onChange={(event) => setImportVencimento(event.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs sm:h-7 sm:flex-shrink-0"
                  onClick={onApplyVencimentoToAll}
                  disabled={!importVencimento}
                >
                  Aplicar a todos
                </Button>
              </div>

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
                                  };
                                }
                                return {
                                  ...current,
                                  action: "skip",
                                  forceImport: false,
                                  reconcileAction: "none",
                                  reconcileExistingCompraCartaoId: null,
                                  reconcileConfirmValueChange: false,
                                };
                              }
                              return {
                                ...current,
                                action: value as "import" | "skip",
                                forceImport: false,
                                reconcileAction: "none",
                                reconcileExistingCompraCartaoId: null,
                                reconcileConfirmValueChange: false,
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
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="font-medium truncate">{item.descricao}</p>
                              <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${statusBadge.className}`}>
                                {statusBadge.label}
                              </span>
                              {item.reviewRequired && (
                                <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700">
                                  Revisar
                                </span>
                              )}
                              {item.tipo === "taxa" && (
                                <span className="inline-flex items-center text-xs px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">
                                  Taxa
                                </span>
                              )}
                              {isServiceCandidate ? (
                                <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700">
                                  Possível serviço
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span className="font-semibold text-foreground">{formatCurrency(item.valorParcela)}/parc</span>
                              <span>Total: {formatCurrency(item.valor)}</span>
                              <span className="flex items-center gap-0.5">
                                Parc <strong className="text-foreground">{item.parcelaAtual}/{item.parcelas}</strong>
                                {item.parcelasRestantes > 0 && <span className="text-amber-600"> · faltam {item.parcelasRestantes}</span>}
                              </span>
                              <span>Compra: {item.dataCompra}</span>
                              {item.vencimentoFatura && <span className="text-emerald-600">Venc: {item.vencimentoFatura}</span>}
                              {typeof item.confidenceScore === "number" && (
                                <span
                                  className={
                                    item.confidenceScore >= 85
                                      ? "text-emerald-600"
                                      : item.confidenceScore >= 65
                                      ? "text-amber-600"
                                      : "text-red-600"
                                  }
                                >
                                  Confiança: {Math.round(item.confidenceScore)}%
                                </span>
                              )}
                              {status === "duplicata_exata" && item.forceImport !== true && (
                                <span className="text-orange-700">Marque "Forçar" para importar esta duplicata exata</span>
                              )}
                            </div>
                            {isServiceCandidate ? (
                              <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-2 py-2 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-xs text-indigo-800">
                                    {serviceCandidate?.matchedProvider
                                      ? `Parece ${serviceCandidate.matchedProvider}`
                                      : "Possível serviço recorrente"}{" "}
                                    · {formatServiceCategoryLabel(serviceCandidate?.categorySuggestion)}
                                  </p>
                                  <span className="text-[11px] text-indigo-700">
                                    Confiança {serviceCandidate?.confidence ?? "baixa"}
                                  </span>
                                </div>

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

                                {serviceAction === "link_existing" && selectedLinkedService && selectedLinkedServiceSharedPeopleCount > 0 ? (
                                  <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-2">
                                    <p className="text-xs text-blue-800">
                                      Este serviço é compartilhado. A cobrança foi vinculada, mas o mês só será marcado
                                      como pago quando a pessoa pagar a parte dela.
                                    </p>
                                  </div>
                                ) : null}

                                {serviceAction === "create_new" && item.createServiceSuggestion ? (
                                  <p className="text-xs text-indigo-900">
                                    Sugestão: criar serviço <strong>{item.createServiceSuggestion.nome}</strong>{" "}
                                    ({formatCurrency(item.createServiceSuggestion.valorMensal)}/mês, cobrança dia{" "}
                                    {item.createServiceSuggestion.dataCobranca}, categoria{" "}
                                    {formatServiceCategoryLabel(item.createServiceSuggestion.categoria)}).
                                    O serviço será criado ao confirmar a importação deste item.
                                  </p>
                                ) : null}

                                {item.serviceSuggestionWarning ? (
                                  <p className="text-xs text-amber-700">{item.serviceSuggestionWarning}</p>
                                ) : null}
                                {serviceAction === "link_existing" && selectedLinkedService == null ? (
                                  <p className="text-xs text-amber-700">
                                    Selecione um serviço para concluir o vínculo sugerido.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {item.validationIssues && item.validationIssues.length > 0 && (
                              <p className="text-xs text-red-600 mt-0.5">
                                {item.validationIssues.join(" · ")}
                              </p>
                            )}
                            {item.duplicata && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                Similar a: "{item.duplicata.descricao}" ({formatCurrency(Number(item.duplicata.valorParcela))})
                              </p>
                            )}
                            {isCompraAliasesLoading && possibleExisting ? (
                              <p className="text-[11px] text-sky-700">
                                Carregando equivalências salvas...
                              </p>
                            ) : null}
                            {possibleExisting ? (
                              <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/60 px-2 py-2 space-y-1.5">
                                <p className="text-xs font-medium text-sky-800">Possível mesma compra encontrada</p>
                                {possibleExisting.aliasMatched ? (
                                  <div className="rounded border border-sky-300 bg-sky-100/70 px-2 py-1">
                                    <p className="text-xs font-medium text-sky-900">Equivalência conhecida</p>
                                    <p className="text-[11px] text-sky-900">
                                      Esse nome já foi associado anteriormente a:{" "}
                                      <strong>
                                        {possibleExisting.aliasMatchedNameOriginal ?? possibleExisting.existing.descricao}
                                      </strong>
                                      .
                                    </p>
                                  </div>
                                ) : null}
                                <p className="text-xs text-sky-900">
                                  Nome importado: <strong>{item.descricao}</strong>
                                </p>
                                <p className="text-xs text-sky-900">
                                  Nome existente: <strong>{possibleExisting.existing.descricao}</strong>
                                </p>
                                <p className="text-xs text-sky-900">
                                  Valor existente: {formatCurrency(Number(possibleExisting.existing.valorParcela))}/parc
                                  {" · "}
                                  Total existente: {formatCurrency(Number(possibleExisting.existing.valorTotal))}
                                  {" · "}
                                  Parcelas existentes: {possibleExisting.existing.parcelaAtual}/{possibleExisting.existing.parcelas}x
                                </p>
                                <p className="text-[11px] text-sky-700">
                                  Confiança do match: {possibleExisting.confidence} ·
                                  diferença da parcela: {formatCurrency(possibleExisting.valueDiff)} ·
                                  diferença do total: {formatCurrency(possibleExisting.totalDiff)} ·
                                  alias: {possibleExisting.aliasMatched ? "sim" : "não"}
                                </p>
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
                                        };
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Ação para compra existente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ignore">Ignorar</SelectItem>
                                      <SelectItem value="import_new">Importar como nova</SelectItem>
                                      <SelectItem value="replace_existing">
                                        Vincular/Substituir existente
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {possibleExistingAction === "replace_existing" ? (
                                  <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-2">
                                    <p className="text-xs text-amber-900">
                                      Esta ação atualiza a compra existente sem criar nova compra.
                                      Parcelas pagas e comprovantes são preservados.
                                    </p>
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
                                    {isSavingCompraAlias ? "Salvando..." : "Lembrar equivalência"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-0.5 h-7 w-7 flex-shrink-0 sm:mt-0"
                              aria-label={`Editar item ${idx + 1} da importação`}
                              title="Editar item"
                              onClick={() => {
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
                                data-testid={`button-edit-import-item-${idx}`}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-0.5 h-7 w-7 flex-shrink-0 sm:mt-0"
                              aria-label={`Remover item ${idx + 1} da importação`}
                              title="Remover item"
                              onClick={() => setImportItems((items) => items.filter((_, index) => index !== idx))}
                              data-testid={`button-remove-import-item-${idx}`}
                            >
                              <X className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  {issuerMismatchWarning ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                      <p>{issuerMismatchWarning}</p>
                      {issuerMismatchRequiresAcknowledgement ? (
                        <label className="mt-1 inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={issuerMismatchAcknowledged}
                            onChange={(event) => onIssuerMismatchAcknowledgedChange?.(event.target.checked)}
                          />
                          <span>Estou ciente e quero importar neste cartão mesmo assim.</span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {totalImportar} de {importItems.length} serão importadas
                    {totalReconciliar > 0 ? ` · ${totalReconciliar} serão reconciliadas` : ""}
                    {" · "}Total: {formatCurrency(totalMensalImportar)}/mês
                  </p>
                  {hasReconcileWithoutTarget ? (
                    <p className="text-xs text-red-600">Há item de reconciliação sem compra existente vinculada.</p>
                  ) : null}
                  {hasReconcilePendingValueConfirmation ? (
                    <p className="text-xs text-amber-700">Confirme alterações de valor antes de concluir a reconciliação.</p>
                  ) : null}
                  {hasInvalidImportAttempt ? (
                    <p className="text-xs text-red-600">Itens inválidos não podem ser confirmados para importação.</p>
                  ) : null}
                  {hasDuplicateExactWithoutForce ? (
                    <p className="text-xs text-orange-700">Duplicatas exatas exigem ação de "Forçar" para confirmar.</p>
                  ) : null}
                </div>
                <Button
                  className="w-full sm:w-auto"
                  data-testid="button-confirmar-importacao"
                  disabled={
                    (totalImportar === 0 && totalReconciliar === 0)
                    || isBatchImportPending
                    || !importCartaoId
                    || hasInvalidImportAttempt
                    || hasDuplicateExactWithoutForce
                    || hasReconcileWithoutTarget
                    || hasReconcilePendingValueConfirmation
                    || (issuerMismatchRequiresAcknowledgement && !issuerMismatchAcknowledged)
                  }
                  onClick={onConfirmImport}
                >
                  {isBatchImportPending ? "Importando..." : "Confirmar importação"}
                </Button>
              </div>
            </div>
          )}
          </div>

          {hasConfirmSummary ? (
            <div className="space-y-4" data-testid="import-confirm-summary">
              <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 px-4 py-3">
                <p className="text-base font-semibold text-emerald-700">Importação concluída</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Lote {confirmResult?.importLogId.slice(0, 8)} processado.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Compras criadas</p>
                  <p className="text-lg font-semibold">{confirmSummary.createdCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Compras reconciliadas</p>
                  <p className="text-lg font-semibold">{confirmSummary.reconciledExistingCount ?? 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Itens ignorados</p>
                  <p className="text-lg font-semibold">{confirmSummary.ignoredCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Duplicatas bloqueadas</p>
                  <p className="text-lg font-semibold">{confirmSummary.blockedExactDuplicates}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Duplicatas forçadas</p>
                  <p className="text-lg font-semibold">{confirmSummary.forcedExactDuplicates}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Itens inválidos</p>
                  <p className="text-lg font-semibold">{confirmSummary.invalidCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Itens com erro</p>
                  <p className="text-lg font-semibold">{confirmSummary.errorCount}</p>
                </div>
                <div className="rounded-md border p-3 sm:col-span-2">
                  <p className="text-muted-foreground">Serviços criados</p>
                  <p className="text-lg font-semibold">{confirmSummary.servicesCreatedCount ?? 0}</p>
                </div>
                <div className="rounded-md border p-3 sm:col-span-2">
                  <p className="text-muted-foreground">Serviços vinculados</p>
                  <p className="text-lg font-semibold">{confirmSummary.servicesLinkedCount ?? 0}</p>
                </div>
              </div>

              <div className="rounded-md border px-4 py-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Total processado:</span>{" "}
                  <span className="font-semibold">{confirmSummary.totalProcessed}</span>
                </p>
                {confirmSummary.createdCount === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Nenhuma compra foi criada. Revise itens ignorados, inválidos ou duplicatas exatas bloqueadas.
                  </p>
                ) : null}
                {confirmSummary.blockedExactDuplicates > 0 ? (
                  <p className="text-xs text-amber-700 mt-1">
                    Há duplicatas exatas bloqueadas. Use "Forçar" no preview apenas quando necessário.
                  </p>
                ) : null}
                {confirmSummary.invalidCount > 0 ? (
                  <p className="text-xs text-red-600 mt-1">
                    Há itens inválidos que precisam de revisão antes de nova confirmação.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {onStartNewImport ? (
                  <Button variant="outline" onClick={onStartNewImport}>
                    Nova importação
                  </Button>
                ) : null}
                {onRollbackImport ? (
                  <Button
                    variant="outline"
                    onClick={onRollbackImport}
                    disabled={isRollbackPending}
                    data-testid="button-rollback-import-summary"
                  >
                    {isRollbackPending ? "Desfazendo..." : "Desfazer importação"}
                  </Button>
                ) : null}
                <Button onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}


