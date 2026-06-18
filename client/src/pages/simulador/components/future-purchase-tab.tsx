import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DashboardOverviewResponse } from "@shared/financial";
import type { Parcela } from "@shared/schema";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  PiggyBank,
  Plus,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { parseMoney } from "@/lib/money";
import {
  buildFuturePurchaseSimulation,
  type FuturePurchaseExtraReceivable,
  type FuturePurchaseSimulationInput,
} from "@/pages/simulador/future-purchase-simulation";
import { fetchDashboardOverview } from "@/services/api/dashboard";

type FuturePurchaseTabProps = {
  resetSignal: number;
};

type ExtraReceivableFormRow = {
  id: string;
  descricao: string;
  valor: string;
  data: string;
  recorrente: boolean;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function createExtraReceivableRow(defaultMonth: string): ExtraReceivableFormRow {
  return {
    id: `extra-${Math.random().toString(36).slice(2, 11)}`,
    descricao: "",
    valor: "",
    data: `${defaultMonth}-05`,
    recorrente: false,
  };
}

export function FuturePurchaseTab({ resetSignal }: FuturePurchaseTabProps) {
  const { visible } = useValuesVisibility();
  const currentMonth = format(new Date(), "yyyy-MM");
  const fc = (value: number) => maskValue(formatCurrency(value), visible);

  const overviewQuery = useQuery<DashboardOverviewResponse>({
    queryKey: ["/api/dashboard/overview", currentMonth],
    queryFn: () => fetchDashboardOverview(currentMonth),
  });
  const parcelasQuery = useQuery<Parcela[]>({
    queryKey: ["/api/parcelas"],
  });

  const isLoading = overviewQuery.isLoading || parcelasQuery.isLoading;
  const error = overviewQuery.error ?? parcelasQuery.error;

  const [nomeCompra, setNomeCompra] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [parcelas, setParcelas] = useState("10");
  const [cartaoId, setCartaoId] = useState("");
  const [mesPrimeiraParcela, setMesPrimeiraParcela] = useState(currentMonth);
  const [reservaMinima, setReservaMinima] = useState("");
  const [entradasExtras, setEntradasExtras] = useState<ExtraReceivableFormRow[]>([]);

  const resetLocalScenario = (nextCardId?: string) => {
    setNomeCompra("");
    setValorTotal("");
    setParcelas("10");
    setCartaoId(nextCardId ?? "");
    setMesPrimeiraParcela(currentMonth);
    setReservaMinima("");
    setEntradasExtras([]);
  };

  useEffect(() => {
    if (!cartaoId && overviewQuery.data?.cartoes[0]?.id) {
      setCartaoId(overviewQuery.data.cartoes[0].id);
    }
  }, [cartaoId, overviewQuery.data]);

  useEffect(() => {
    resetLocalScenario(overviewQuery.data?.cartoes[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const entradasExtrasNormalizadas = useMemo<FuturePurchaseExtraReceivable[]>(
    () => entradasExtras.map((row) => ({
      id: row.id,
      descricao: row.descricao,
      valor: parseMoney(row.valor) ?? 0,
      data: row.data,
      recorrente: row.recorrente,
    })),
    [entradasExtras],
  );

  const simulationInput = useMemo<FuturePurchaseSimulationInput>(() => ({
    nomeCompra,
    valorTotal: parseMoney(valorTotal) ?? 0,
    parcelas: Math.max(1, Math.trunc(Number(parcelas) || 1)),
    cartaoId,
    mesPrimeiraParcela,
    reservaMinima: parseMoney(reservaMinima) ?? 0,
    entradasExtras: entradasExtrasNormalizadas,
  }), [cartaoId, entradasExtrasNormalizadas, mesPrimeiraParcela, nomeCompra, parcelas, reservaMinima, valorTotal]);

  const canSimulate = (
    simulationInput.valorTotal > 0
    && simulationInput.parcelas >= 1
    && simulationInput.cartaoId.length > 0
    && /^\d{4}-\d{2}$/.test(simulationInput.mesPrimeiraParcela)
    && Boolean(overviewQuery.data)
    && Boolean(parcelasQuery.data)
  );

  const simulation = useMemo(() => {
    if (!canSimulate || !overviewQuery.data || !parcelasQuery.data) return null;

    return buildFuturePurchaseSimulation({
      cartoes: overviewQuery.data.cartoes,
      compras: overviewQuery.data.compras,
      parcelasCompra: overviewQuery.data.parcelasCompra,
      dividas: overviewQuery.data.dividas,
      parcelas: parcelasQuery.data,
      servicos: overviewQuery.data.servicos,
      rendas: overviewQuery.data.rendas,
      patrimonios: overviewQuery.data.patrimonios,
    }, simulationInput);
  }, [canSimulate, overviewQuery.data, parcelasQuery.data, simulationInput]);

  const selectedCard = overviewQuery.data?.cartoes.find((card) => card.id === cartaoId) ?? null;

  const addExtraReceivable = () => {
    setEntradasExtras((current) => [...current, createExtraReceivableRow(mesPrimeiraParcela)]);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/25 bg-red-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-4 w-4" />
                <p className="font-semibold">Não foi possível carregar a simulação de compra futura</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Tente novamente em instantes."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void overviewQuery.refetch();
                void parcelasQuery.refetch();
              }}
            >
              Recarregar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="simulador-compra-futura-tab">
      <Card className={
        simulation?.status === "Não recomendado"
          ? "border-red-500/30 bg-red-500/5"
          : simulation?.status === "Atenção"
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"
      }
      >
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className={
                  simulation?.status === "Não recomendado"
                    ? "w-fit border-red-500/30 bg-red-500/10 text-red-700"
                    : simulation?.status === "Atenção"
                      ? "w-fit border-amber-500/30 bg-amber-500/10 text-amber-700"
                      : "w-fit border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                }
              >
                {simulation?.status ?? "Aguardando dados"}
              </Badge>

              <div className="space-y-1">
                <h3 className="text-xl font-semibold tracking-tight">Compra Futura</h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Simule uma compra parcelada sem mexer nos seus dados reais e veja mês a mês se o cenário segue saudável.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                  Saldo líquido inicial considerado: {simulation ? fc(simulation.initialAvailableBalance) : fc(0)}
                </span>
                {selectedCard ? (
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                    Cartão: {selectedCard.nome} · vencimento dia {selectedCard.diaVencimento}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[440px]">
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pior mês</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {simulation?.worstMonth?.label ?? "Defina a compra"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Menor saldo</p>
                <p className={`mt-2 text-base font-semibold ${simulation && simulation.lowestBalance < 0 ? "text-red-600" : "text-foreground"}`}>
                  {simulation ? fc(simulation.lowestBalance) : fc(0)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Compra máxima segura</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {simulation ? fc(simulation.safePurchaseAmount) : fc(0)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sugestão de parcelas</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {simulation?.recommendedInstallmentCount ? `${simulation.recommendedInstallmentCount}x` : "Aguardando"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-4 w-4" />
              Dados da compra simulada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="future-purchase-name">Nome da compra</Label>
                <Input
                  id="future-purchase-name"
                  value={nomeCompra}
                  onChange={(event) => setNomeCompra(event.target.value)}
                  placeholder="Ex.: Notebook novo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="future-purchase-value">Valor total</Label>
                <Input
                  id="future-purchase-value"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={valorTotal}
                  onChange={(event) => setValorTotal(event.target.value)}
                  placeholder="2000,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="future-purchase-installments">Número de parcelas</Label>
                <Input
                  id="future-purchase-installments"
                  type="number"
                  min="1"
                  max="48"
                  step="1"
                  value={parcelas}
                  onChange={(event) => setParcelas(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cartão usado</Label>
                <Select value={cartaoId} onValueChange={setCartaoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {(overviewQuery.data?.cartoes ?? []).map((cartao) => (
                      <SelectItem key={cartao.id} value={cartao.id}>
                        {cartao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="future-purchase-month">Mês da primeira parcela</Label>
                <Input
                  id="future-purchase-month"
                  type="month"
                  min={currentMonth}
                  value={mesPrimeiraParcela}
                  onChange={(event) => setMesPrimeiraParcela(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="future-purchase-reserve">Reserva mínima desejada</Label>
                <Input
                  id="future-purchase-reserve"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={reservaMinima}
                  onChange={(event) => setReservaMinima(event.target.value)}
                  placeholder="500,00"
                />
              </div>
            </div>

            {simulation ? (
              <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Parcela simulada</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulation.installmentAmount)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Meses abaixo da reserva</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{simulation.monthsBelowReserveCount}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Meses no vermelho</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{simulation.monthsNegativeCount}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                Preencha ao menos o valor, a quantidade de parcelas, o cartão e o mês da primeira parcela para gerar a projeção.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              Entradas extras simuladas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Adicione entradas futuras sem salvar nada no sistema. Elas entram apenas nesta projeção.
            </p>

            <div className="space-y-3">
              {entradasExtras.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-4 text-sm text-muted-foreground">
                  Nenhuma entrada extra simulada por enquanto.
                </div>
              ) : entradasExtras.map((entrada) => (
                <div key={entrada.id} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input
                        value={entrada.descricao}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setEntradasExtras((current) => current.map((item) => (
                            item.id === entrada.id ? { ...item, descricao: nextValue } : item
                          )));
                        }}
                        placeholder="Ex.: freela, bônus, venda"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={entrada.valor}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setEntradasExtras((current) => current.map((item) => (
                            item.id === entrada.id ? { ...item, valor: nextValue } : item
                          )));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={entrada.data}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setEntradasExtras((current) => current.map((item) => (
                            item.id === entrada.id ? { ...item, data: nextValue } : item
                          )));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={entrada.recorrente ? "recorrente" : "unica"}
                        onValueChange={(value) => {
                          setEntradasExtras((current) => current.map((item) => (
                            item.id === entrada.id ? { ...item, recorrente: value === "recorrente" } : item
                          )));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unica">Única</SelectItem>
                          <SelectItem value="recorrente">Recorrente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setEntradasExtras((current) => current.filter((item) => item.id !== entrada.id))}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={addExtraReceivable}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar entrada extra
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4" />
              Sugestões do cenário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!simulation ? (
              <p className="text-sm text-muted-foreground">
                A simulação vai mostrar aqui se a compra cabe, se pressiona a reserva ou se não é recomendada.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {simulation.suggestions.length === 0 ? (
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4 text-sm text-muted-foreground">
                      Nenhuma observação adicional além do resultado principal.
                    </div>
                  ) : simulation.suggestions.map((suggestion) => (
                    <div key={`${suggestion.kind}-${suggestion.text}`} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        {suggestion.kind === "fit" ? (
                          <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                        ) : suggestion.kind === "installments" ? (
                          <CreditCard className="mt-0.5 h-4 w-4 text-sky-600" />
                        ) : suggestion.kind === "extra_income" ? (
                          <ArrowUpRight className="mt-0.5 h-4 w-4 text-emerald-600" />
                        ) : suggestion.kind === "reserve" ? (
                          <PiggyBank className="mt-0.5 h-4 w-4 text-amber-600" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
                        )}
                        <p className="text-sm leading-6 text-foreground">{suggestion.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reserva mínima</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulationInput.reservaMinima)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Receita extra necessária</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{fc(simulation.extraAmountNeeded)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                  Nenhum dado é salvo automaticamente. Os botões abaixo ficam apenas como próximo passo planejado.
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button disabled className="sm:flex-1">
                    Adicionar compra ao cartão
                  </Button>
                  <Button disabled variant="outline" className="sm:flex-1">
                    Salvar simulação
                  </Button>
                  <Button variant="ghost" onClick={() => resetLocalScenario(overviewQuery.data?.cartoes[0]?.id)}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Linha do tempo mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!simulation ? (
              <p className="text-sm text-muted-foreground">
                Assim que a compra for preenchida, esta área vai projetar entradas, saídas, parcela simulada e saldo final mês a mês.
              </p>
            ) : simulation.months.map((month) => (
              <div key={month.monthReference} className="rounded-2xl border border-border/60 bg-background/85 p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{month.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {month.simulatedInstallment > 0 ? (
                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700">
                          Parcela simulada
                        </Badge>
                      ) : null}
                      {month.belowZero ? (
                        <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700">
                          No vermelho
                        </Badge>
                      ) : month.belowReserve ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">
                          Abaixo da reserva
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                          Saudável
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className={`text-right ${month.endingBalance < 0 ? "text-red-600" : month.belowReserve ? "text-amber-600" : "text-emerald-600"}`}>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saldo final previsto</p>
                    <p className="text-lg font-semibold">{fc(month.endingBalance)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Saldo inicial</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{fc(month.startingBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Entradas reais</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-600">{fc(month.actualIncome)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Entradas extras</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-600">{fc(month.simulatedExtraIncome)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Saídas reais</p>
                    <p className="mt-1 text-sm font-semibold text-rose-600">{fc(month.actualExpenses)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Parcela simulada</p>
                    <p className="mt-1 text-sm font-semibold text-sky-700">{fc(month.simulatedInstallment)}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default FuturePurchaseTab;
