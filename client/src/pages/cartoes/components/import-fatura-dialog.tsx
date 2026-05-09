import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Cartao } from "@shared/schema";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import type { ImportConfirmResponse } from "@/services/api/cartoes";
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

interface ImportFaturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartoes: Cartao[];
  importCartaoId: string;
  setImportCartaoId: (value: string) => void;
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
  onConfirmImport: () => void;
  confirmResult?: ImportConfirmResponse | null;
  onRollbackImport?: () => void;
  isRollbackPending?: boolean;
  onStartNewImport?: () => void;
}

export function ImportFaturaDialog({
  open,
  onOpenChange,
  cartoes,
  importCartaoId,
  setImportCartaoId,
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
  onConfirmImport,
  confirmResult,
  onRollbackImport,
  isRollbackPending = false,
  onStartNewImport,
}: ImportFaturaDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalImportar = importItems.filter((item) => {
    const status = getEffectiveStatus(item);
    if (item.action !== "import") return false;
    if (status === "invalido") return false;
    if (status === "duplicata_exata" && item.forceImport !== true) return false;
    return true;
  }).length;
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
  };
  const hasConfirmSummary = Boolean(confirmResult);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cartao de destino (obrigatorio)</Label>
            <Select value={importCartaoId} onValueChange={setImportCartaoId}>
              <SelectTrigger data-testid="select-import-cartao">
                <SelectValue placeholder="Selecione o cartao para esta importacao" />
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
                O cartao e obrigatorio. O sistema nao usa mais o primeiro cartao automaticamente.
              </p>
            )}
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
              <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Arraste ou selecione o arquivo</p>
                  <p className="text-xs text-muted-foreground">Formatos suportados: CSV, OFX, QFX</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.ofx,.qfx,.txt"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.[0]) onFileUpload(event.target.files[0]);
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold">{importItems.length} compra(s) detectada(s)</p>
                <div className="flex gap-1">
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

              <div className="flex items-center gap-2">
                <Label className="text-xs flex-shrink-0">Vencimento da fatura (opcional):</Label>
                <Input
                  type="date"
                  className="h-7 text-xs flex-1"
                  value={importVencimento}
                  onChange={(event) => setImportVencimento(event.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex-shrink-0"
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
                        <div className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
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
                          <div className="grid grid-cols-3 gap-2">
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
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs" onClick={onApplyImportEdit}>Salvar</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setImportEditingId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 py-2 flex items-start gap-2">
                          <Select
                            value={selectValue}
                            onValueChange={(value) => setImportItems((items) => items.map((current, index) => {
                              if (index !== idx) return current;
                              const currentStatus = getEffectiveStatus(current);
                              if (currentStatus === "invalido") {
                                return { ...current, action: "skip", forceImport: false };
                              }
                              if (currentStatus === "duplicata_exata") {
                                if (value === "force") {
                                  return { ...current, action: "import", forceImport: true };
                                }
                                return { ...current, action: "skip", forceImport: false };
                              }
                              return {
                                ...current,
                                action: value as "import" | "skip",
                                forceImport: false,
                              };
                            }))}
                          >
                            <SelectTrigger className="h-7 w-20 text-xs flex-shrink-0 mt-0.5">
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
                                  Confianca: {Math.round(item.confidenceScore)}%
                                </span>
                              )}
                              {status === "duplicata_exata" && item.forceImport !== true && (
                                <span className="text-orange-700">Marque "Forçar" para importar esta duplicata exata</span>
                              )}
                            </div>
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
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 mt-0.5"
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
                            className="h-7 w-7 flex-shrink-0 mt-0.5"
                            onClick={() => setImportItems((items) => items.filter((_, index) => index !== idx))}
                            data-testid={`button-remove-import-item-${idx}`}
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {totalImportar} de {importItems.length} serao importadas
                    {" · "}Total: {formatCurrency(totalMensalImportar)}/mes
                  </p>
                  {hasInvalidImportAttempt ? (
                    <p className="text-xs text-red-600">Itens inválidos não podem ser confirmados para importação.</p>
                  ) : null}
                  {hasDuplicateExactWithoutForce ? (
                    <p className="text-xs text-orange-700">Duplicatas exatas exigem ação de "Forçar" para confirmar.</p>
                  ) : null}
                </div>
                <Button
                  data-testid="button-confirmar-importacao"
                  disabled={
                    totalImportar === 0
                    || isBatchImportPending
                    || !importCartaoId
                    || hasInvalidImportAttempt
                    || hasDuplicateExactWithoutForce
                  }
                  onClick={onConfirmImport}
                >
                  {isBatchImportPending ? "Importando..." : "Confirmar importacao"}
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


