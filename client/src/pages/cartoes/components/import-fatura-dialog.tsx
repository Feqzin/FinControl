import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Cartao } from "@shared/schema";
import type { ParsedItem } from "@/pages/cartoes/import-parser";
import { AlertTriangle, FileText, Pencil, Upload, X } from "lucide-react";
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

interface ImportEditForm {
  descricao: string;
  valor: string;
  dataCompra: string;
  parcelas: string;
  parcelaAtual: string;
  vencimentoFatura: string;
}

interface ImportFaturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartoes: Cartao[];
  importCartaoId: string;
  setImportCartaoId: (value: string) => void;
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
}

export function ImportFaturaDialog({
  open,
  onOpenChange,
  cartoes,
  importCartaoId,
  setImportCartaoId,
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
}: ImportFaturaDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalImportar = importItems.filter((item) => item.action === "import").length;
  const totalMensalImportar = importItems
    .filter((item) => item.action === "import")
    .reduce((sum, item) => sum + item.valorParcela, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {cartoes.length > 1 && (
            <div className="space-y-2">
              <Label>Cartao de destino</Label>
              <Select value={importCartaoId} onValueChange={setImportCartaoId}>
                <SelectTrigger data-testid="select-import-cartao"><SelectValue placeholder="Selecione o cartao" /></SelectTrigger>
                <SelectContent>
                  {cartoes.map((cartao) => <SelectItem key={cartao.id} value={cartao.id}>{cartao.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

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
              <Button onClick={onParseTexto} className="w-full" data-testid="button-parse-texto">
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
                    onClick={() => setImportItems((items) => items.map((item) => ({ ...item, action: "import" })))}
                  >
                    Marcar todas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setImportItems((items) => items.map((item) => ({ ...item, action: "skip" })))}
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

                  return (
                    <div
                      key={item.id}
                      data-testid={`row-import-${idx}`}
                      className={`text-sm ${item.duplicata ? "bg-amber-500/5" : item.action === "skip" ? "bg-muted/20 opacity-60" : ""}`}
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
                            value={item.action}
                            onValueChange={(value) =>
                              setImportItems((items) => items.map((current, index) => (
                                index === idx ? { ...current, action: value as "import" | "skip" } : current
                              )))
                            }
                          >
                            <SelectTrigger className="h-7 w-20 text-xs flex-shrink-0 mt-0.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="import">Importar</SelectItem>
                              <SelectItem value="skip">Ignorar</SelectItem>
                            </SelectContent>
                          </Select>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="font-medium truncate">{item.descricao}</p>
                              {item.tipo === "taxa" && (
                                <span className="inline-flex items-center text-xs px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">
                                  Taxa
                                </span>
                              )}
                              {item.duplicata && (
                                <span className="inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 flex-shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Duplicata?
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
                              {item.reviewRequired && <span className="text-amber-600">Revisao recomendada</span>}
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
                <p className="text-sm text-muted-foreground">
                  {totalImportar} de {importItems.length} serao importadas
                  {" · "}Total: {formatCurrency(totalMensalImportar)}/mes
                </p>
                <Button
                  data-testid="button-confirmar-importacao"
                  disabled={totalImportar === 0 || isBatchImportPending}
                  onClick={onConfirmImport}
                >
                  {isBatchImportPending ? "Importando..." : "Confirmar importacao"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
