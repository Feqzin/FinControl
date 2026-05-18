import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CompraCartao, ParcelaCompra, Pessoa } from "@shared/schema";
import { Check, ExternalLink, Paperclip, Pencil, RefreshCw, Trash2, Wallet, X } from "lucide-react";
import { formatBytes } from "@/pages/pessoas/payment-timeline.utils";
import { getInvoiceCompetency } from "@/lib/card-limit-usage";

type AbaterSaldoParcelaForm = {
  valor: string;
  data: string;
  observacao: string;
};

type ParcelaComprovanteResumo = {
  nome: string;
  mimeType: string;
  tamanho: number;
  enviadoEm: string | null;
  downloadUrl: string;
};

function formatCompetenciaLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  const asDate = new Date(year, month - 1, 1);
  const formatted = asDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return formatted.replace(/^\w/, (char) => char.toUpperCase());
}

type ParcelasTabProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewingCompra: CompraCartao | null;
  parcelasCompraData: ParcelaCompra[];
  parcelasLoading: boolean;
  parcelasErrorMessage: string | null;
  pessoas: Pessoa[];
  formatCurrency: (value: number) => string;
  getParcelaSaldoPendente: (parcela: ParcelaCompra) => number;
  getParcelaSaldoAbatido: (parcelaId: string) => number;
  getPessoaSaldoDisponivel: (pessoaId: string) => number;
  isParcelaVencida: (parcela: ParcelaCompra) => boolean;
  isParcelaComprometendoLimite: (status: string) => boolean;
  editingParcelaId: string | null;
  setEditingParcelaId: (id: string | null) => void;
  editingParcelaValor: string;
  setEditingParcelaValor: (value: string) => void;
  editingParcelaData: string;
  setEditingParcelaData: (value: string) => void;
  payingParcelaId: string | null;
  setPayingParcelaId: (id: string | null) => void;
  payParcelaData: string;
  setPayParcelaData: (value: string) => void;
  onEditParcela: (id: string) => void;
  onMoveParcelaCompetencia: (id: string, competencia: string) => Promise<void>;
  onPayParcela: (id: string, pago: boolean, dataPagamento?: string) => void;
  onPayParcelaPessoa: (id: string, pago: boolean) => void;
  parcelaActionLoadingId: string | null;
  isParcelaActionPending: boolean;
  onOpenAbaterSaldoParcela: (parcelaId: string, pessoaId: string) => void;
  abaterSaldoParcelaId: string | null;
  setAbaterSaldoParcelaId: (id: string | null) => void;
  abaterSaldoParcelaForm: AbaterSaldoParcelaForm;
  setAbaterSaldoParcelaForm: (updater: (prev: AbaterSaldoParcelaForm) => AbaterSaldoParcelaForm) => void;
  onSubmitAbaterSaldo: () => void;
  isAbaterSaldoPending: boolean;
  getParcelaComprovante: (parcela: ParcelaCompra) => ParcelaComprovanteResumo | null;
  onUploadParcelaComprovante: (parcelaId: string, file: File) => Promise<void> | void;
  comprovanteUploadLoadingId: string | null;
  onDeleteParcelaComprovante: (parcelaId: string) => Promise<void> | void;
  comprovanteDeleteLoadingId: string | null;
};

export function ParcelasTab({
  open,
  onOpenChange,
  viewingCompra,
  parcelasCompraData,
  parcelasLoading,
  parcelasErrorMessage,
  pessoas,
  formatCurrency,
  getParcelaSaldoPendente,
  getParcelaSaldoAbatido,
  getPessoaSaldoDisponivel,
  isParcelaVencida,
  isParcelaComprometendoLimite,
  editingParcelaId,
  setEditingParcelaId,
  editingParcelaValor,
  setEditingParcelaValor,
  editingParcelaData,
  setEditingParcelaData,
  payingParcelaId,
  setPayingParcelaId,
  payParcelaData,
  setPayParcelaData,
  onEditParcela,
  onMoveParcelaCompetencia,
  onPayParcela,
  onPayParcelaPessoa,
  parcelaActionLoadingId,
  isParcelaActionPending,
  onOpenAbaterSaldoParcela,
  abaterSaldoParcelaId,
  setAbaterSaldoParcelaId,
  abaterSaldoParcelaForm,
  setAbaterSaldoParcelaForm,
  onSubmitAbaterSaldo,
  isAbaterSaldoPending,
  getParcelaComprovante,
  onUploadParcelaComprovante,
  comprovanteUploadLoadingId,
  onDeleteParcelaComprovante,
  comprovanteDeleteLoadingId,
}: ParcelasTabProps) {
  const [comprovanteFiles, setComprovanteFiles] = useState<Record<string, File | null>>({});
  const [movingParcelaId, setMovingParcelaId] = useState<string | null>(null);
  const [movingParcelaCompetencia, setMovingParcelaCompetencia] = useState("");

  const setComprovanteFile = (parcelaId: string, file: File | null) => {
    setComprovanteFiles((prev) => ({ ...prev, [parcelaId]: file }));
  };

  const getComprovanteFile = (parcelaId: string): File | null => comprovanteFiles[parcelaId] ?? null;

  useEffect(() => {
    if (open) return;
    setMovingParcelaId(null);
    setMovingParcelaCompetencia("");
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {viewingCompra ? (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>Parcelas — {viewingCompra.descricao}</SheetTitle>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{viewingCompra.parcelas}x de {formatCurrency(Number(viewingCompra.valorParcela))}</span>
                <span>Total: {formatCurrency(Number(viewingCompra.valorTotal))}</span>
              </div>
            </SheetHeader>

            <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              {parcelasLoading ? (
                <div className="col-span-full rounded-md border border-border/50 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  Carregando parcelas...
                </div>
              ) : parcelasErrorMessage ? (
                <div className="col-span-full rounded-md border border-red-500/20 bg-red-500/5 p-3 text-center text-xs text-red-600">
                  Nao foi possivel carregar as parcelas agora. {parcelasErrorMessage}
                </div>
              ) : (
                (() => {
                  const pagas = parcelasCompraData.filter((parcela) => parcela.statusCartao === "pago").length;
                  const pendentes = parcelasCompraData.filter((parcela) => isParcelaComprometendoLimite(parcela.statusCartao)).length;
                  const vencidas = parcelasCompraData.filter(
                    (parcela) => isParcelaVencida(parcela) && getParcelaSaldoPendente(parcela) > 0,
                  ).length;
                  return (
                    <>
                      <div className="rounded-md bg-emerald-500/5 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Pagas</p>
                        <p className="font-bold text-emerald-600">{pagas}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Pendentes</p>
                        <p className="font-bold">{pendentes}</p>
                      </div>
                      <div className="rounded-md bg-red-500/5 p-2 text-center">
                        <p className="text-xs text-muted-foreground">Vencidas</p>
                        <p className="font-bold text-red-600">{vencidas}</p>
                      </div>
                    </>
                  );
                })()
              )}
            </div>

            <div className="space-y-2">
              {!parcelasLoading && !parcelasErrorMessage && parcelasCompraData.length === 0 ? (
                <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">
                  Nenhuma parcela encontrada para esta compra.
                </div>
              ) : null}

              {!parcelasLoading && !parcelasErrorMessage ? parcelasCompraData.map((parcela) => {
                const saldoPendente = getParcelaSaldoPendente(parcela);
                const vencida = isParcelaVencida(parcela) && saldoPendente > 0;
                const pago = parcela.statusCartao === "pago";
                const isPaying = payingParcelaId === parcela.id;
                const isEditing = editingParcelaId === parcela.id;
                const isMovingCompetencia = movingParcelaId === parcela.id;
                const pessoaVinculadaId = viewingCompra.pessoaId || null;
                const saldoAbatido = getParcelaSaldoAbatido(parcela.id);
                const parcialViaSaldo = !pago && saldoAbatido > 0;
                const saldoPessoaDisponivel = pessoaVinculadaId ? getPessoaSaldoDisponivel(pessoaVinculadaId) : 0;
                const podeAbaterSaldo = Boolean(pessoaVinculadaId) && !pago && parcela.statusCartao !== "cancelado"
                  && saldoPendente > 0 && saldoPessoaDisponivel > 0;
                const aguardaReembolso = pago && viewingCompra.pessoaId && (!parcela.statusPessoa || parcela.statusPessoa === "pendente");
                const isSubmittingThisRow = isParcelaActionPending && parcelaActionLoadingId === parcela.id;
                const comprovante = getParcelaComprovante(parcela);
                const uploadFile = getComprovanteFile(parcela.id);
                const isUploadingComprovante = comprovanteUploadLoadingId === parcela.id;
                const isDeletingComprovante = comprovanteDeleteLoadingId === parcela.id;
                const currentCompetencia = getInvoiceCompetency(parcela.dataVencimento);
                const hasHistoricalSignals = pago || Boolean(comprovante);

                return (
                  <div
                    key={parcela.id}
                    className={`space-y-2 rounded-md border p-3 text-sm ${pago ? "border-emerald-500/10 bg-emerald-500/5" : vencida ? "border-red-500/20 bg-red-500/5" : "border-border/40 bg-muted/20"}`}
                    data-testid={`row-parcela-compra-${parcela.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 flex-shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${pago ? "bg-emerald-500 text-white" : vencida ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
                          {pago ? <Check className="h-3 w-3" /> : parcela.numero}
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-6 w-20 px-1 text-xs"
                              value={editingParcelaValor}
                              onChange={(event) => setEditingParcelaValor(event.target.value)}
                            />
                            <Input
                              type="date"
                              className="h-6 px-1 text-xs"
                              value={editingParcelaData}
                              onChange={(event) => setEditingParcelaData(event.target.value)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => onEditParcela(parcela.id)}
                              aria-label="Salvar edição da parcela"
                              title="Salvar edição"
                            >
                              <Check className="h-3 w-3 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => setEditingParcelaId(null)}
                              aria-label="Cancelar edição da parcela"
                              title="Cancelar edição"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{formatCurrency(Number(parcela.valor))}</span>
                              {pago ? (
                                <span className="text-xs text-emerald-600">
                                  Pago {parcela.dataPagamentoCartao ? `em ${parcela.dataPagamentoCartao}` : ""}
                                </span>
                              ) : null}
                              {parcialViaSaldo ? (
                                <span className="text-xs text-blue-600">
                                  Parcial via saldo: abatido {formatCurrency(saldoAbatido)} · pendente {formatCurrency(saldoPendente)}
                                </span>
                              ) : null}
                              {!pago && parcela.dataVencimento ? (
                                <span className={`text-xs ${vencida ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                                  Venc. {parcela.dataVencimento}{vencida ? " · VENCIDA" : ""}
                                </span>
                              ) : null}
                              {currentCompetencia ? (
                                <span className="text-xs text-muted-foreground">
                                  Fatura: {formatCompetenciaLabel(currentCompetencia)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {saldoAbatido > 0 ? (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600">Saldo pessoa</span>
                              ) : null}
                              {aguardaReembolso ? (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">Ag. reembolso</span>
                              ) : null}
                              {parcela.statusPessoa === "pago" ? (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600">Reembolsado</span>
                              ) : null}
                              {comprovante ? (
                                <a
                                  href={comprovante.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 hover:bg-emerald-500/15"
                                  title={`Comprovante: ${comprovante.nome}`}
                                  data-testid={`link-comprovante-parcela-${parcela.id}`}
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  Comprovante
                                </a>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
                        {!isEditing && !isPaying && !pago ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Editar parcela"
                              title="Editar parcela"
                              onClick={() => {
                                setEditingParcelaId(parcela.id);
                                setEditingParcelaValor(String(parcela.valor));
                                setEditingParcelaData(parcela.dataVencimento || "");
                              }}
                              data-testid={`button-edit-parcela-compra-${parcela.id}`}
                              disabled={isSubmittingThisRow}
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Marcar parcela como paga"
                              title="Marcar como pago"
                              onClick={() => setPayingParcelaId(parcela.id)}
                              data-testid={`button-pay-parcela-compra-${parcela.id}`}
                              disabled={isSubmittingThisRow}
                            >
                              <Check className="h-3 w-3 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Abater parcela com saldo da pessoa"
                              title="Abater com saldo da pessoa"
                              onClick={() => {
                                if (!pessoaVinculadaId) return;
                                onOpenAbaterSaldoParcela(parcela.id, pessoaVinculadaId);
                              }}
                              data-testid={`button-abater-saldo-parcela-${parcela.id}`}
                              disabled={!podeAbaterSaldo || isSubmittingThisRow}
                            >
                              <Wallet className="h-3 w-3 text-blue-600" />
                            </Button>
                          </>
                        ) : null}
                        {pago ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={saldoAbatido > 0 ? "Pago via saldo da pessoa" : "Desfazer pagamento da parcela"}
                            title={saldoAbatido > 0 ? "Pago via saldo da pessoa" : "Desfazer pagamento"}
                            onClick={() => {
                              if (saldoAbatido > 0) return;
                              onPayParcela(parcela.id, false);
                            }}
                            disabled={saldoAbatido > 0 || isSubmittingThisRow}
                            data-testid={`button-undo-parcela-compra-${parcela.id}`}
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        ) : null}
                        {aguardaReembolso ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Marcar reembolso recebido"
                            title="Marcar reembolso recebido"
                            onClick={() => onPayParcelaPessoa(parcela.id, true)}
                            data-testid={`button-reembolso-parcela-${parcela.id}`}
                          >
                            <RefreshCw className="h-3 w-3 text-amber-600" />
                          </Button>
                        ) : null}
                        {!isEditing && !isPaying ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            aria-label="Mover parcela para outra fatura"
                            title="Mover para outra fatura"
                            onClick={() => {
                              const defaultCompetencia = currentCompetencia ?? new Date().toISOString().slice(0, 7);
                              setMovingParcelaId(parcela.id);
                              setMovingParcelaCompetencia(defaultCompetencia);
                            }}
                            disabled={isSubmittingThisRow}
                            data-testid={`button-move-parcela-competencia-${parcela.id}`}
                          >
                            Mover fatura
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={comprovante ? "Ver comprovante da parcela" : "Anexar comprovante da parcela"}
                          title={comprovante ? "Ver comprovante" : "Anexar comprovante"}
                          onClick={() => {
                            if (comprovante) {
                              window.open(comprovante.downloadUrl, "_blank", "noopener,noreferrer");
                              return;
                            }
                            const input = document.getElementById(`input-comprovante-parcela-${parcela.id}`) as HTMLInputElement | null;
                            input?.click();
                          }}
                          disabled={isUploadingComprovante || isDeletingComprovante}
                          data-testid={`button-comprovante-parcela-${parcela.id}`}
                        >
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        {comprovante ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Excluir comprovante da parcela"
                            title="Excluir comprovante"
                            onClick={() => {
                              const confirmed = window.confirm("Excluir este comprovante anexado?");
                              if (!confirmed) return;
                              void Promise.resolve(onDeleteParcelaComprovante(parcela.id));
                            }}
                            disabled={isDeletingComprovante || isUploadingComprovante}
                            data-testid={`button-delete-comprovante-parcela-${parcela.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <input
                      id={`input-comprovante-parcela-${parcela.id}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setComprovanteFile(parcela.id, file);
                        event.currentTarget.value = "";
                      }}
                    />

                    {!pago || comprovante || uploadFile ? (
                      <div className="space-y-1 border-t border-border/40 pt-1.5">
                        {comprovante ? (
                          <p className="text-[11px] text-muted-foreground">
                            {comprovante.nome} · {formatBytes(comprovante.tamanho)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Nenhum comprovante anexado.</p>
                        )}
                        {!comprovante ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {uploadFile ? (
                              <span className="max-w-full truncate text-[11px] text-muted-foreground">{uploadFile.name}</span>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!uploadFile || isUploadingComprovante || isDeletingComprovante}
                              onClick={() => {
                                if (!uploadFile) return;
                                const maybePromise = onUploadParcelaComprovante(parcela.id, uploadFile);
                                Promise.resolve(maybePromise).finally(() => {
                                  setComprovanteFile(parcela.id, null);
                                });
                              }}
                              data-testid={`button-upload-comprovante-parcela-${parcela.id}`}
                            >
                              {isUploadingComprovante ? "Enviando..." : "Anexar comprovante"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isPaying ? (
                      <div className="flex flex-col gap-2 border-t border-border/40 pt-1 sm:flex-row sm:items-center">
                        <Input
                          type="date"
                          className="h-8 flex-1 text-xs sm:h-7"
                          value={payParcelaData}
                          onChange={(event) => setPayParcelaData(event.target.value)}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs sm:h-7"
                          onClick={() => onPayParcela(parcela.id, true, payParcelaData)}
                          data-testid={`button-confirm-pay-parcela-${parcela.id}`}
                          disabled={isSubmittingThisRow}
                        >
                          {isSubmittingThisRow ? "Salvando..." : "Confirmar"}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs sm:h-7" onClick={() => setPayingParcelaId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : null}

                    {isMovingCompetencia ? (
                      <div className="space-y-2 border-t border-border/40 pt-2">
                        <p className="text-xs text-muted-foreground">
                          {currentCompetencia
                            ? `Esta parcela sairá de ${formatCompetenciaLabel(currentCompetencia)} e irá para ${formatCompetenciaLabel(movingParcelaCompetencia || currentCompetencia)}.`
                            : `Selecione o mês da nova fatura para esta parcela.`}
                        </p>
                        {hasHistoricalSignals ? (
                          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
                            Esta parcela já possui histórico. A alteração mudará apenas o mês da fatura, sem alterar pagamento ou comprovante.
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="flex-1">
                            <Label htmlFor={`input-competencia-parcela-${parcela.id}`} className="text-xs text-muted-foreground">
                              Mover para fatura (mês/ano)
                            </Label>
                            <Input
                              id={`input-competencia-parcela-${parcela.id}`}
                              type="month"
                              className="h-8 text-xs"
                              value={movingParcelaCompetencia}
                              onChange={(event) => setMovingParcelaCompetencia(event.target.value)}
                              data-testid={`input-move-parcela-competencia-${parcela.id}`}
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={
                              !movingParcelaCompetencia
                              || movingParcelaCompetencia === currentCompetencia
                              || isSubmittingThisRow
                            }
                            onClick={async () => {
                              try {
                                await onMoveParcelaCompetencia(parcela.id, movingParcelaCompetencia);
                                setMovingParcelaId(null);
                                setMovingParcelaCompetencia("");
                              } catch {
                                // O toast de erro é tratado no container.
                              }
                            }}
                            data-testid={`button-confirm-move-parcela-competencia-${parcela.id}`}
                          >
                            {isSubmittingThisRow ? "Salvando..." : "Confirmar"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setMovingParcelaId(null);
                              setMovingParcelaCompetencia("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }) : null}
            </div>

            <Dialog open={!!abaterSaldoParcelaId} onOpenChange={(isOpen) => { if (!isOpen) setAbaterSaldoParcelaId(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Abater saldo na parcela</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitAbaterSaldo();
                  }}
                >
                  {(() => {
                    const parcela = parcelasCompraData.find((item) => item.id === abaterSaldoParcelaId);
                    if (!parcela || !viewingCompra?.pessoaId) return null;
                    const pessoa = pessoas.find((item) => item.id === viewingCompra.pessoaId);
                    const saldoDisponivel = getPessoaSaldoDisponivel(viewingCompra.pessoaId);
                    const pendente = getParcelaSaldoPendente(parcela);

                    return (
                      <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
                        <p className="font-medium">
                          Parcela {parcela.numero} - {formatCurrency(Number(parcela.valor))}
                        </p>
                        <p className="text-muted-foreground">
                          Pessoa: {pessoa?.nome ?? "Vinculada"} · Saldo disponível: {formatCurrency(saldoDisponivel)}
                        </p>
                        <p className="text-muted-foreground">
                          Pendente atual da parcela: {formatCurrency(pendente)}
                        </p>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <Label>Valor do abatimento</Label>
                    <Input
                      value={abaterSaldoParcelaForm.valor}
                      onChange={(event) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, valor: event.target.value }))}
                      placeholder="0,00"
                      required
                      data-testid="input-abater-saldo-parcela-valor"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={abaterSaldoParcelaForm.data}
                      onChange={(event) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, data: event.target.value }))}
                      required
                      data-testid="input-abater-saldo-parcela-data"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Observação (opcional)</Label>
                    <Input
                      value={abaterSaldoParcelaForm.observacao}
                      onChange={(event) => setAbaterSaldoParcelaForm((prev) => ({ ...prev, observacao: event.target.value }))}
                      placeholder="Ex.: abatimento usando saldo da pessoa"
                      data-testid="input-abater-saldo-parcela-observacao"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isAbaterSaldoPending} data-testid="button-confirmar-abater-saldo-parcela">
                    {isAbaterSaldoPending ? "Aplicando..." : "Aplicar abatimento"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
