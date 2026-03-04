import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, RefreshCw, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Lightbulb } from "lucide-react";
import type { Divida, Servico, Cartao, CompraCartao } from "@shared/schema";
import { calcularScore } from "@/utils/financialEngine";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function SimuladorPage() {
  const { data: dividas = [], isLoading: l1 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [], isLoading: l2 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });

  const isLoading = l1 || l2;

  const [rendaExtra, setRendaExtra] = useState(0);
  const [reducaoDespesas, setReducaoDespesas] = useState(0);
  const [quitarDivida, setQuitarDivida] = useState(0);

  const baseReceber = dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const basePagar = dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const baseServicos = servicos.filter((s) => s.status === "ativo").reduce((s, sv) => s + Number(sv.valorMensal), 0);
  const baseSaldo = baseReceber - basePagar - baseServicos;
  const baseScore = calcularScore(dividas, servicos, cartoes, compras);

  const simReceber = baseReceber + rendaExtra;
  const simServicos = Math.max(0, baseServicos - reducaoDespesas);
  const simPagar = Math.max(0, basePagar - quitarDivida);
  const simSaldo = simReceber - simPagar - simServicos;

  const simDividas = useMemo(() => {
    if (quitarDivida === 0) return dividas;
    let restante = quitarDivida;
    return dividas.map((d) => {
      if (d.status === "pendente" && d.tipo === "pagar" && restante > 0) {
        const v = Number(d.valor);
        if (restante >= v) {
          restante -= v;
          return { ...d, status: "pago" as const };
        }
      }
      return d;
    });
  }, [dividas, quitarDivida]);

  const simServicosArray = useMemo(() => {
    if (reducaoDespesas === 0) return servicos;
    let restante = reducaoDespesas;
    return servicos.map((s) => {
      if (s.status === "ativo" && restante > 0) {
        const v = Number(s.valorMensal);
        if (restante >= v) {
          restante -= v;
          return { ...s, valorMensal: "0" as any };
        }
      }
      return s;
    });
  }, [servicos, reducaoDespesas]);

  const simScore = calcularScore(simDividas, simServicosArray, cartoes, compras);

  const variacaoSaldo = simSaldo - baseSaldo;
  const variacaoScore = simScore.valor - baseScore.valor;

  const resetar = () => {
    setRendaExtra(0);
    setReducaoDespesas(0);
    setQuitarDivida(0);
  };

  const scoreColor = (v: number) =>
    v >= 80 ? "text-emerald-600" : v >= 60 ? "text-primary" : v >= 40 ? "text-amber-600" : "text-red-600";

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl" data-testid="simulador-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulador Financeiro</h1>
          <p className="text-muted-foreground">Explore cenarios sem alterar seus dados reais</p>
        </div>
        <Button variant="outline" onClick={resetar} data-testid="button-resetar-simulacao">
          <RefreshCw className="w-4 h-4 mr-2" /> Resetar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Variaveis da simulacao
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" /> Renda extra mensal
                  </Label>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(rendaExtra)}</span>
                </div>
                <Slider
                  data-testid="slider-renda-extra"
                  value={[rendaExtra]}
                  onValueChange={([v]) => setRendaExtra(v)}
                  min={0}
                  max={10000}
                  step={100}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>R$ 0</span><span>R$ 10.000</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-amber-600" /> Reducao de gastos fixos
                  </Label>
                  <span className="text-sm font-bold text-amber-600">{formatCurrency(reducaoDespesas)}</span>
                </div>
                <Slider
                  data-testid="slider-reducao-despesas"
                  value={[reducaoDespesas]}
                  onValueChange={([v]) => setReducaoDespesas(v)}
                  min={0}
                  max={Math.max(baseServicos, 1000)}
                  step={50}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>R$ 0</span><span>{formatCurrency(baseServicos)}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-600" /> Quitar dividas a pagar
                  </Label>
                  <span className="text-sm font-bold text-red-600">{formatCurrency(quitarDivida)}</span>
                </div>
                <Slider
                  data-testid="slider-quitar-divida"
                  value={[quitarDivida]}
                  onValueChange={([v]) => setQuitarDivida(v)}
                  min={0}
                  max={Math.max(basePagar, 1000)}
                  step={100}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>R$ 0</span><span>{formatCurrency(basePagar)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultado da simulacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Situacao atual</p>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Saldo previsto</p>
                    <p className={`text-lg font-bold ${baseSaldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatCurrency(baseSaldo)}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Score financeiro</p>
                    <p className={`text-2xl font-bold ${scoreColor(baseScore.valor)}`}>
                      {baseScore.valor}<span className="text-sm font-normal text-muted-foreground">/100</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{baseScore.classificacao}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Apos simulacao</p>
                  <div className={`rounded-md p-3 ${simSaldo >= 0 ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20"}`}>
                    <p className="text-xs text-muted-foreground">Saldo previsto</p>
                    <p className={`text-lg font-bold ${simSaldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatCurrency(simSaldo)}
                    </p>
                  </div>
                  <div className={`rounded-md p-3 ${simScore.valor > baseScore.valor ? "bg-emerald-500/5 border border-emerald-500/20" : simScore.valor < baseScore.valor ? "bg-red-500/5 border border-red-500/20" : "bg-muted/40"}`}>
                    <p className="text-xs text-muted-foreground">Score financeiro</p>
                    <p className={`text-2xl font-bold ${scoreColor(simScore.valor)}`}>
                      {simScore.valor}<span className="text-sm font-normal text-muted-foreground">/100</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{simScore.classificacao}</p>
                  </div>
                </div>
              </div>

              {(variacaoSaldo !== 0 || variacaoScore !== 0) && (
                <div className="space-y-2 pt-1">
                  {variacaoSaldo !== 0 && (
                    <div className={`flex items-center justify-between p-2.5 rounded-md text-sm ${variacaoSaldo > 0 ? "bg-emerald-500/5" : "bg-red-500/5"}`}>
                      <span className="text-muted-foreground">Variacao no saldo</span>
                      <span className={`font-bold ${variacaoSaldo > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {variacaoSaldo > 0 ? "+" : ""}{formatCurrency(variacaoSaldo)}
                      </span>
                    </div>
                  )}
                  {variacaoScore !== 0 && (
                    <div className={`flex items-center justify-between p-2.5 rounded-md text-sm ${variacaoScore > 0 ? "bg-emerald-500/5" : "bg-red-500/5"}`}>
                      <span className="text-muted-foreground">Variacao no score</span>
                      <span className={`font-bold flex items-center gap-1 ${variacaoScore > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {variacaoScore > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {variacaoScore > 0 ? "+" : ""}{variacaoScore} pontos
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" /> Sugestoes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                {basePagar > 0 && (
                  <p>Use o slider de "Quitar dividas" para ver o impacto de eliminar suas {dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} divida(s) a pagar.</p>
                )}
                {baseServicos > 200 && (
                  <p>Reduzir {formatCurrency(baseServicos * 0.2)} em servicos ja aumentaria seu saldo em {formatCurrency(baseServicos * 0.2)} mensais.</p>
                )}
                {baseSaldo < 0 && (
                  <p className="text-red-600">Com saldo negativo, tente aumentar a renda ou reduzir despesas para equilibrar o orcamento.</p>
                )}
                {simScore.valor > baseScore.valor && (
                  <p className="text-emerald-600">Essa configuracao aumentaria seu score em {variacaoScore} pontos!</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Os dados reais nao sao alterados — essa e apenas uma simulacao para ajudar nas suas decisoes.
      </p>
    </div>
  );
}
