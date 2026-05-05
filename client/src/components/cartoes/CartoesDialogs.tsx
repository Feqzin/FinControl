import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Cartao, CompraCartao } from "@shared/schema";
import type { DeleteCompraResponse, DeleteCompraScope, DeleteFaturaResponse } from "@/services/api/cartoes";

type CartoesDialogsProps = {
  openDeleteFaturaDialog: boolean;
  setOpenDeleteFaturaDialog: (open: boolean) => void;
  deleteFaturaScope: "cartao" | "todos";
  setDeleteFaturaScope: (scope: "cartao" | "todos") => void;
  deleteFaturaMes: string;
  setDeleteFaturaMes: (value: string) => void;
  deleteFaturaCartaoId: string;
  setDeleteFaturaCartaoId: (value: string) => void;
  deleteFaturaImpact: DeleteFaturaResponse | null;
  setDeleteFaturaImpact: (impact: DeleteFaturaResponse | null) => void;
  deleteFaturaImpactLoading: boolean;
  deleteFaturaImpactError: string | null;
  setDeleteFaturaImpactError: (message: string | null) => void;
  onRetryDeleteFaturaImpact: () => void;
  setDeleteFaturaImpactLoading: (value: boolean) => void;
  deleteFaturaCartaoPending: boolean;
  deleteFaturasMesPending: boolean;
  onConfirmDeleteFatura: () => void;
  formatMesExibicao: (mes: string) => string;
  formatCurrency: (value: number) => string;
  cartoes: Cartao[];
  openDeleteCompraDialog: boolean;
  setOpenDeleteCompraDialog: (open: boolean) => void;
  resetDeleteCompraDialog: () => void;
  deleteCompraTarget: CompraCartao | null;
  deleteCompraScope: DeleteCompraScope;
  setDeleteCompraScope: (scope: DeleteCompraScope) => void;
  deleteCompraImpact: DeleteCompraResponse | null;
  setDeleteCompraImpact: (impact: DeleteCompraResponse | null) => void;
  deleteCompraImpactLoading: boolean;
  deleteCompraImpactError: string | null;
  deleteCompraSubmitting: boolean;
  onRetryDeleteCompraImpact: () => void;
  onConfirmDeleteCompra: () => void;
};

export function CartoesDialogs({
  openDeleteFaturaDialog,
  setOpenDeleteFaturaDialog,
  deleteFaturaScope,
  setDeleteFaturaScope,
  deleteFaturaMes,
  setDeleteFaturaMes,
  deleteFaturaCartaoId,
  setDeleteFaturaCartaoId,
  deleteFaturaImpact,
  setDeleteFaturaImpact,
  deleteFaturaImpactLoading,
  deleteFaturaImpactError,
  setDeleteFaturaImpactError,
  onRetryDeleteFaturaImpact,
  setDeleteFaturaImpactLoading,
  deleteFaturaCartaoPending,
  deleteFaturasMesPending,
  onConfirmDeleteFatura,
  formatMesExibicao,
  formatCurrency,
  cartoes,
  openDeleteCompraDialog,
  setOpenDeleteCompraDialog,
  resetDeleteCompraDialog,
  deleteCompraTarget,
  deleteCompraScope,
  setDeleteCompraScope,
  deleteCompraImpact,
  setDeleteCompraImpact,
  deleteCompraImpactLoading,
  deleteCompraImpactError,
  deleteCompraSubmitting,
  onRetryDeleteCompraImpact,
  onConfirmDeleteCompra,
}: CartoesDialogsProps) {
  return (
    <>
      <Dialog
        open={openDeleteFaturaDialog}
        onOpenChange={(open) => {
          setOpenDeleteFaturaDialog(open);
          if (!open) {
            setDeleteFaturaImpact(null);
            setDeleteFaturaImpactLoading(false);
            setDeleteFaturaImpactError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Escopo da exclusão</Label>
              <Select
                value={deleteFaturaScope}
                onValueChange={(value) => {
                  if (value === "cartao" || value === "todos") {
                    setDeleteFaturaScope(value);
                    setDeleteFaturaImpact(null);
                    setDeleteFaturaImpactError(null);
                  }
                }}
              >
                <SelectTrigger data-testid="select-delete-fatura-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartao">Excluir fatura deste cartão</SelectItem>
                  <SelectItem value="todos">Excluir faturas de todos os cartões neste mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {deleteFaturaScope === "cartao" ? (
              <div className="space-y-2">
                <Label>Cartão afetado</Label>
                <Select
                  value={deleteFaturaCartaoId}
                  onValueChange={(value) => {
                    setDeleteFaturaCartaoId(value);
                    setDeleteFaturaImpact(null);
                    setDeleteFaturaImpactError(null);
                  }}
                >
                  <SelectTrigger data-testid="select-delete-fatura-cartao">
                    <SelectValue placeholder="Selecione um cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {cartoes.map((cartao) => (
                      <SelectItem key={cartao.id} value={cartao.id}>
                        {cartao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Mês da fatura</Label>
              <Input
                type="month"
                value={deleteFaturaMes}
                onChange={(event) => {
                  setDeleteFaturaMes(event.target.value);
                  setDeleteFaturaImpact(null);
                  setDeleteFaturaImpactError(null);
                }}
                data-testid="input-delete-fatura-mes"
              />
            </div>

            <Card className="border-dashed">
              <CardContent className="space-y-2 p-3 text-sm">
                <p className="font-medium">Impacto da exclusão</p>
                {deleteFaturaImpactLoading ? <p className="text-muted-foreground">Calculando impacto...</p> : null}
                {!deleteFaturaImpactLoading && deleteFaturaImpactError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-red-700">{deleteFaturaImpactError}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={onRetryDeleteFaturaImpact}
                      disabled={deleteFaturaImpactLoading || deleteFaturaCartaoPending || deleteFaturasMesPending}
                      data-testid="button-retry-delete-fatura-impact"
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : null}
                {!deleteFaturaImpactLoading && deleteFaturaImpact ? (
                  <>
                    <p className="text-muted-foreground">
                      Mês: <span className="font-medium text-foreground">{formatMesExibicao(deleteFaturaImpact.impact.mes)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Compras: <span className="font-medium text-foreground">{deleteFaturaImpact.impact.comprasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Parcelas: <span className="font-medium text-foreground">{deleteFaturaImpact.impact.parcelasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Total removido: <span className="font-medium text-foreground">{formatCurrency(deleteFaturaImpact.impact.valorTotalRemovido)}</span>
                    </p>
                    {deleteFaturaImpact.impact.cartoesAfetados.length > 0 ? (
                      <div className="space-y-1 pt-1">
                        {deleteFaturaImpact.impact.cartoesAfetados.map((item) => (
                          <p key={item.cartaoId} className="text-xs text-muted-foreground">
                            {item.cartaoNome}: {item.comprasRemovidas} compra(s), {item.parcelasRemovidas} parcela(s),{" "}
                            {formatCurrency(item.valorTotalRemovido)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {!deleteFaturaImpactLoading && !deleteFaturaImpact ? (
                  <p className="text-muted-foreground">Selecione os dados para visualizar o impacto.</p>
                ) : null}
              </CardContent>
            </Card>

            <Button
              type="button"
              className="w-full"
              variant="destructive"
              disabled={
                deleteFaturaImpactLoading
                || deleteFaturaCartaoPending
                || deleteFaturasMesPending
                || !deleteFaturaImpact
                || deleteFaturaImpact.impact.comprasRemovidas === 0
              }
              onClick={onConfirmDeleteFatura}
              data-testid="button-confirm-delete-fatura"
            >
              {deleteFaturaCartaoPending || deleteFaturasMesPending ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDeleteCompraDialog}
        onOpenChange={(open) => {
          if (!open) {
            resetDeleteCompraDialog();
          } else {
            setOpenDeleteCompraDialog(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Compra: <span className="font-medium text-foreground">{deleteCompraTarget?.descricao ?? "-"}</span>
            </p>

            {deleteCompraTarget && Number(deleteCompraTarget.parcelas) > 1 ? (
              <div className="space-y-2">
                <Label>Como deseja excluir?</Label>
                <Select
                  value={deleteCompraScope}
                  onValueChange={(value) => {
                    if (value === "all_parcelas" || value === "single_parcela") {
                      setDeleteCompraScope(value);
                      setDeleteCompraImpact(null);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-delete-compra-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_parcela">Excluir apenas esta parcela</SelectItem>
                    <SelectItem value="all_parcelas">Excluir todas as parcelas da compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Card className="border-dashed">
              <CardContent className="space-y-2 p-3 text-sm">
                <p className="font-medium">Impacto da exclusão</p>
                {deleteCompraImpactLoading ? <p className="text-muted-foreground">Calculando impacto...</p> : null}
                {!deleteCompraImpactLoading && deleteCompraImpactError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-red-700">{deleteCompraImpactError}</p>
                    {deleteCompraTarget ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={onRetryDeleteCompraImpact}
                        disabled={deleteCompraImpactLoading || deleteCompraSubmitting}
                        data-testid="button-retry-delete-compra-impact"
                      >
                        Tentar novamente
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {!deleteCompraImpactLoading && deleteCompraImpact ? (
                  <>
                    <p className="text-muted-foreground">
                      Cartão afetado:{" "}
                      <span className="font-medium text-foreground">{deleteCompraImpact.impact.cartao?.nome ?? "Não identificado"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Compras removidas: <span className="font-medium text-foreground">{deleteCompraImpact.impact.comprasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Parcelas removidas: <span className="font-medium text-foreground">{deleteCompraImpact.impact.parcelasRemovidas}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Total removido: <span className="font-medium text-foreground">{formatCurrency(deleteCompraImpact.impact.valorTotalRemovido)}</span>
                    </p>
                    {deleteCompraImpact.impact.parcelaAlvo ? (
                      <p className="text-xs text-muted-foreground">
                        Parcela alvo: {deleteCompraImpact.impact.parcelaAlvo.numero} -{" "}
                        {formatCurrency(deleteCompraImpact.impact.parcelaAlvo.valor)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {!deleteCompraImpactLoading && !deleteCompraImpact ? (
                  <p className="text-muted-foreground">Não foi possível calcular o impacto com os dados atuais.</p>
                ) : null}
              </CardContent>
            </Card>

            <Button
              type="button"
              className="w-full"
              variant="destructive"
              onClick={onConfirmDeleteCompra}
              disabled={
                deleteCompraSubmitting
                || deleteCompraImpactLoading
                || !deleteCompraImpact
                || deleteCompraImpact.impact.parcelasRemovidas === 0
              }
              data-testid="button-confirm-delete-compra"
            >
              {deleteCompraSubmitting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
