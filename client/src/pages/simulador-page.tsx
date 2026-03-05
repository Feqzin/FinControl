import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calculator, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Lightbulb, 
  PieChart, 
  Wallet,
  Target,
  Info
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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

  // Tab 1: Score Financeiro State
  const [rendaExtra, setRendaExtra] = useState(0);
  const [reducaoDespesas, setReducaoDespesas] = useState(0);
  const [quitarDivida, setQuitarDivida] = useState(0);

  // Tab 2: Investimentos State
  const [valorInicial, setValorInicial] = useState(1000);
  const [aporteMensal, setAporteMensal] = useState(500);
  const [taxaAnual, setTaxaAnual] = useState(13.25);
  const [periodoMeses, setPeriodoMeses] = useState(120);
  const [inflacaoAnual, setInflacaoAnual] = useState(4.5);
  const [preset, setPreset] = useState("selic");

  // Tab 3: Independencia State
  const [gastosDesejados, setGastosDesejados] = useState(5000);
  const [retornoIndep, setRetornoIndep] = useState(10);
  const [inflacaoIndep, setInflacaoIndep] = useState(4.5);
  const [patrimonioAtual, setPatrimonioAtual] = useState(10000);
  const [aporteIndep, setAporteIndep] = useState(1000);

  // Tab 1 Calculations
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

  // Tab 2 Calculations
  const investimentoData = useMemo(() => {
    const data = [];
    let saldoBruto = valorInicial;
    let saldoReal = valorInicial;
    let totalInvestido = valorInicial;

    const taxaMensal = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
    const inflacaoMensal = Math.pow(1 + inflacaoAnual / 100, 1 / 12) - 1;

    for (let i = 0; i <= periodoMeses; i++) {
      data.push({
        mes: i,
        bruto: Math.round(saldoBruto),
        real: Math.round(saldoReal),
        investido: Math.round(totalInvestido),
      });

      if (i < periodoMeses) {
        saldoBruto = (saldoBruto + aporteMensal) * (1 + taxaMensal);
        saldoReal = (saldoReal + aporteMensal) * (1 + taxaMensal) / (1 + inflacaoMensal);
        totalInvestido += aporteMensal;
      }
    }
    return data;
  }, [valorInicial, aporteMensal, taxaAnual, periodoMeses, inflacaoAnual]);

  const finalResult = investimentoData[investimentoData.length - 1];
  const jurosGanhos = finalResult.bruto - finalResult.investido;

  // Tab 3 Calculations
  const patrimonioNecessario = (gastosDesejados * 12) / 0.04;
  const quantoFalta = Math.max(0, patrimonioNecessario - patrimonioAtual);
  
  const calcularMesesParaIndep = (aporte: number) => {
    let saldo = patrimonioAtual;
    const taxaMensal = Math.pow(1 + (retornoIndep - inflacaoIndep) / 100, 1 / 12) - 1;
    let meses = 0;
    if (taxaMensal <= 0 && aporte <= 0) return Infinity;
    while (saldo < patrimonioNecessario && meses < 600) {
      saldo = (saldo + aporte) * (1 + taxaMensal);
      meses++;
    }
    return meses;
  };

  const mesesParaAlcancar = calcularMesesParaIndep(aporteIndep);

  const calcularAporteParaAnos = (anos: number) => {
    const meses = anos * 12;
    const taxaMensal = Math.pow(1 + (retornoIndep - inflacaoIndep) / 100, 1 / 12) - 1;
    if (taxaMensal <= 0) return (patrimonioNecessario - patrimonioAtual) / meses;
    
    // Formula for PMT: FV = P*(1+r)^n + PMT * [((1+r)^n - 1) / r]
    // PMT = (FV - P*(1+r)^n) * r / ((1+r)^n - 1)
    const power = Math.pow(1 + taxaMensal, meses);
    const pmt = (patrimonioNecessario - patrimonioAtual * power) * taxaMensal / (power - 1);
    return Math.max(0, pmt);
  };

  const scoreColor = (v: number) =>
    v >= 80 ? "text-emerald-600" : v >= 60 ? "text-primary" : v >= 40 ? "text-amber-600" : "text-red-600";

  const applyPreset = (p: string) => {
    setPreset(p);
    if (p === "selic") setTaxaAnual(13.25);
    else if (p === "cdb") setTaxaAnual(14.6);
    else if (p === "cdi") setTaxaAnual(13.25);
  };

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
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="simulador-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulador Financeiro</h1>
          <p className="text-muted-foreground">Explore cenários e planeje seu futuro sem alterar seus dados reais</p>
        </div>
        <Button variant="outline" onClick={() => {
          setRendaExtra(0);
          setReducaoDespesas(0);
          setQuitarDivida(0);
        }} data-testid="button-resetar-simulacao">
          <RefreshCw className="w-4 h-4 mr-2" /> Resetar
        </Button>
      </div>

      <Tabs defaultValue="score" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="score" className="flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Score Financeiro
          </TabsTrigger>
          <TabsTrigger value="investimentos" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Investimentos
          </TabsTrigger>
          <TabsTrigger value="independencia" className="flex items-center gap-2">
            <Target className="w-4 h-4" /> Independência
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Score Financeiro */}
        <TabsContent value="score" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Variáveis da simulação
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
                        <ArrowDownRight className="w-4 h-4 text-amber-600" /> Redução de gastos fixos
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
                        <TrendingDown className="w-4 h-4 text-red-600" /> Quitar dívidas a pagar
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
                  <CardTitle className="text-base">Resultado da simulação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Situação atual</p>
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
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Após simulação</p>
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
                          <span className="text-muted-foreground">Variação no saldo</span>
                          <span className={`font-bold ${variacaoSaldo > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {variacaoSaldo > 0 ? "+" : ""}{formatCurrency(variacaoSaldo)}
                          </span>
                        </div>
                      )}
                      {variacaoScore !== 0 && (
                        <div className={`flex items-center justify-between p-2.5 rounded-md text-sm ${variacaoScore > 0 ? "bg-emerald-500/5" : "bg-red-500/5"}`}>
                          <span className="text-muted-foreground">Variação no score</span>
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
                    <Lightbulb className="w-4 h-4 text-amber-500" /> Sugestões
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {basePagar > 0 && (
                      <p>Use o slider de "Quitar dívidas" para ver o impacto de eliminar suas {dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").length} dívida(s) a pagar.</p>
                    )}
                    {baseServicos > 200 && (
                      <p>Reduzir {formatCurrency(baseServicos * 0.2)} em serviços já aumentaria seu saldo em {formatCurrency(baseServicos * 0.2)} mensais.</p>
                    )}
                    {baseSaldo < 0 && (
                      <p className="text-red-600">Com saldo negativo, tente aumentar a renda ou reduzir despesas para equilibrar o orçamento.</p>
                    )}
                    {simScore.valor > baseScore.valor && (
                      <p className="text-emerald-600">Essa configuração aumentaria seu score em {variacaoScore} pontos!</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Investimentos */}
        <TabsContent value="investimentos" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Parâmetros do Investimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Investimento Inicial (R$)</Label>
                  <Input 
                    type="number" 
                    value={valorInicial} 
                    onChange={(e) => setValorInicial(Number(e.target.value))}
                    data-testid="input-valor-inicial"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aporte Mensal (R$)</Label>
                  <Input 
                    type="number" 
                    value={aporteMensal} 
                    onChange={(e) => setAporteMensal(Number(e.target.value))}
                    data-testid="input-aporte-mensal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Período (meses)</Label>
                  <div className="flex gap-4 items-center">
                    <Slider
                      value={[periodoMeses]}
                      onValueChange={([v]) => setPeriodoMeses(v)}
                      min={1}
                      max={360}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm font-medium">{periodoMeses}</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Rentabilidade</Label>
                  <Select value={preset} onValueChange={applyPreset}>
                    <SelectTrigger data-testid="select-preset-investimento">
                      <SelectValue placeholder="Selecione um preset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="selic">Tesouro Selic (~13.25%)</SelectItem>
                      <SelectItem value="cdb">CDB 110% CDI (~14.6%)</SelectItem>
                      <SelectItem value="cdi">CDI (~13.25%)</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {preset === "custom" && (
                  <div className="space-y-2">
                    <Label>Taxa Anual (%)</Label>
                    <Input 
                      type="number" 
                      value={taxaAnual} 
                      onChange={(e) => setTaxaAnual(Number(e.target.value))}
                      data-testid="input-taxa-anual"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Inflação Anual (%)</Label>
                  <Input 
                    type="number" 
                    value={inflacaoAnual} 
                    onChange={(e) => setInflacaoAnual(Number(e.target.value))}
                    data-testid="input-inflacao-anual"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Investido</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(finalResult.investido)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Juros Ganhos</p>
                    <p className="text-xl font-bold text-emerald-600">+{formatCurrency(jurosGanhos)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Final Bruto</p>
                    <p className="text-xl font-bold">{formatCurrency(finalResult.bruto)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Final Real</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold text-amber-600">{formatCurrency(finalResult.real)}</p>
                      <TooltipProvider>
                        <TooltipUI>
                          <TooltipTriggerUI>
                            <Info className="w-3 h-3 text-muted-foreground" />
                          </TooltipTriggerUI>
                          <TooltipContentUI>
                            <p>Poder de compra descontando a inflação</p>
                          </TooltipContentUI>
                        </TooltipUI>
                      </TooltipProvider>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolução do Patrimônio</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={investimentoData}>
                      <defs>
                        <linearGradient id="colorBruto" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.2)" />
                      <XAxis 
                        dataKey="mes" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickFormatter={(value) => value % 12 === 0 ? `${value/12}a` : ""}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickFormatter={(value) => `R$ ${value/1000}k`}
                      />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Mês ${label}`}
                        contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
                      />
                      <Area type="monotone" dataKey="bruto" name="Bruto" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorBruto)" />
                      <Area type="monotone" dataKey="investido" name="Investido" stroke="hsl(var(--muted-foreground))" fill="none" strokeDasharray="5 5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Independência */}
        <TabsContent value="independencia" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" /> Planejamento de Liberdade
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Gasto Mensal Desejado (R$)</Label>
                  <Input 
                    type="number" 
                    value={gastosDesejados} 
                    onChange={(e) => setGastosDesejados(Number(e.target.value))}
                    data-testid="input-gastos-desejados"
                  />
                  <p className="text-xs text-muted-foreground">Considerando a regra dos 4%</p>
                </div>
                <div className="space-y-2">
                  <Label>Patrimônio Atual (R$)</Label>
                  <Input 
                    type="number" 
                    value={patrimonioAtual} 
                    onChange={(e) => setPatrimonioAtual(Number(e.target.value))}
                    data-testid="input-patrimonio-atual"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aporte Mensal (R$)</Label>
                  <Input 
                    type="number" 
                    value={aporteIndep} 
                    onChange={(e) => setAporteIndep(Number(e.target.value))}
                    data-testid="input-aporte-indep"
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Retorno Anual Esperado (%)</Label>
                  <Input 
                    type="number" 
                    value={retornoIndep} 
                    onChange={(e) => setRetornoIndep(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Inflação Média Anual (%)</Label>
                  <Input 
                    type="number" 
                    value={inflacaoIndep} 
                    onChange={(e) => setInflacaoIndep(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className={mesesParaAlcancar <= 180 ? "border-emerald-500/50 bg-emerald-500/5" : mesesParaAlcancar >= 480 ? "border-red-500/50 bg-red-500/5" : ""}>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Tempo para a Independência</p>
                    <p className="text-3xl font-bold">
                      {mesesParaAlcancar === Infinity ? "Nunca" : mesesParaAlcancar >= 600 ? "50+ anos" : `${Math.floor(mesesParaAlcancar / 12)} anos e ${mesesParaAlcancar % 12} meses`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Mantendo este ritmo de aportes</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Patrimônio Necessário</p>
                    <p className="text-3xl font-bold text-primary">{formatCurrency(patrimonioNecessario)}</p>
                    <p className="text-xs text-muted-foreground mt-2">Para render {formatCurrency(gastosDesejados)}/mês</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo do Plano</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-between items-center p-4 rounded-lg bg-muted/40">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Quanto falta acumular</p>
                      <p className="text-2xl font-bold text-amber-600">{formatCurrency(quantoFalta)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">Progresso</p>
                      <p className="text-2xl font-bold">{Math.min(100, (patrimonioAtual / patrimonioNecessario) * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold">Aportes necessários para alcançar em:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[10, 15, 20, 30].map(anos => {
                        const aporteNec = calcularAporteParaAnos(anos);
                        return (
                          <div key={anos} className="p-3 border rounded-md text-center">
                            <p className="text-xs text-muted-foreground">{anos} anos</p>
                            <p className="font-bold text-sm">{formatCurrency(aporteNec)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Os dados reais não são alterados — essa é apenas uma simulação para ajudar nas suas decisões financeiras.
      </p>
    </div>
  );
}

// Internal Tooltip Components for quick use
import { 
  Tooltip as TooltipUI, 
  TooltipContent as TooltipContentUI, 
  TooltipProvider, 
  TooltipTrigger as TooltipTriggerUI 
} from "@/components/ui/tooltip";
