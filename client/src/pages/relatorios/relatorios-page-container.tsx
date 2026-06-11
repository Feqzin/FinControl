import { useState, useMemo, lazy, Suspense, Fragment } from "react";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FintechPageHeader } from "@/components/layout/fintech-page-header";
import { FintechEmptyState } from "@/components/layout/fintech-empty-state";
import {
  FintechLoadingActionCluster,
  FintechLoadingListItem,
  FintechLoadingMetricCard,
  FintechLoadingPageHeader,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown, CreditCard, Users, Receipt, PiggyBank, Wallet, BarChart as BarChartIcon, TrendingUp } from "lucide-react";
import type { Divida, Pessoa, Renda, Patrimonio, CompraCartao, Cartao, Servico } from "@shared/schema";
import {
  format, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfYear, 
  isWithinInterval, 
  parseISO, 
  differenceInMonths,
  addMonths
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRelatoriosQueries } from "@/pages/relatorios/hooks/use-relatorios-queries";
import { buildRelatorioPdfMetadata } from "@/pages/relatorios/relatorios-pdf-utils";
import { buildRelatoriosServicosMetrics } from "@/pages/relatorios/relatorios-servicos-metrics.utils";

const RelatoriosHistoricoChart = lazy(
  () => import("@/components/charts/relatorios-historico-chart"),
);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type Periodo = "mes_atual" | "mes_anterior" | "ultimos_3_meses" | "ano_atual" | "total_geral";

export default function RelatoriosPageContainer() {
  const [periodo, setPeriodo] = useState<Periodo>("mes_atual");
  const { visible } = useValuesVisibility();
  const fc = (v: number) => maskValue(formatCurrency(v), visible);

  const { interval, monthsInPeriod, label, startDateIso, endDateIso } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfMonth(now);
    let lbl = "";

    switch (periodo) {
      case "mes_atual":
        start = startOfMonth(now);
        lbl = format(now, "MMMM yyyy", { locale: ptBR });
        break;
      case "mes_anterior":
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        lbl = format(start, "MMMM yyyy", { locale: ptBR });
        break;
      case "ultimos_3_meses":
        start = startOfMonth(subMonths(now, 2));
        lbl = `Últimos 3 meses (${format(start, "MMM/yy")} - ${format(now, "MMM/yy")})`;
        break;
      case "ano_atual":
        start = startOfYear(now);
        lbl = `Ano de ${format(now, "yyyy")}`;
        break;
      case "total_geral":
        start = new Date(2000, 0, 1);
        end = new Date(2100, 11, 31);
        lbl = "Total Geral";
        break;
      default:
        start = startOfMonth(now);
    }

    const mCount = periodo === "total_geral" ? 1 : Math.max(1, differenceInMonths(end, start) + 1);

    return {
      interval: { start, end },
      monthsInPeriod: mCount,
      label: lbl,
      startDateIso: format(start, "yyyy-MM-dd"),
      endDateIso: format(end, "yyyy-MM-dd"),
    };
  }, [periodo]);

  const {
    rendas,
    patrimonios,
    compras,
    cartoes,
    servicos,
    dividas,
    pessoas,
    isLoading,
    dataSource,
    isCompatibilityMode,
    overviewSummary,
    overviewPeriod,
    overviewGeneratedAt,
  } = useRelatoriosQueries({
    startDate: startDateIso,
    endDate: endDateIso,
    enableOverview: periodo !== "total_geral",
  });

  const filteredData = useMemo(() => {
    const isInPeriod = (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      try {
        const d = parseISO(dateStr);
        return isWithinInterval(d, interval);
      } catch {
        return false;
      }
    };

    const periodCompras = compras.filter(c => isInPeriod(c.dataCompra));
    const periodDividas = dividas.filter(d => isInPeriod(d.dataVencimento));
    
    const activeRendas = rendas.filter(r => r.ativo);
    const activeServicos = servicos.filter(s => s.status === "ativo");

    const totalRendaComputed = activeRendas.reduce((acc, r) => acc + Number(r.valor), 0) * monthsInPeriod;
    const totalCartoes = periodCompras.reduce((acc, c) => acc + Number(c.valorParcela), 0);
    const totalDividasPagarComputed = periodDividas
      .filter(d => d.tipo === "pagar" && d.status === "pendente")
      .reduce((acc, d) => acc + Number(d.valor), 0);
    const totalReceberComputed = periodDividas
      .filter(d => d.tipo === "receber" && d.status === "pendente")
      .reduce((acc, d) => acc + Number(d.valor), 0);
    const totalPatrimonioComputed = patrimonios.reduce((acc, p) => acc + Number(p.valorAtual), 0);
    
    const servicosMetricsStartDateIso = periodo === "total_geral"
      ? format(startOfMonth(new Date()), "yyyy-MM-dd")
      : startDateIso;
    const servicosMetricsEndDateIso = periodo === "total_geral"
      ? format(endOfMonth(new Date()), "yyyy-MM-dd")
      : endDateIso;

    const servicosMetrics = buildRelatoriosServicosMetrics({
      activeServicos,
      overviewSummary,
      startDateIso: servicosMetricsStartDateIso,
      endDateIso: servicosMetricsEndDateIso,
    });

    const totalRenda = overviewSummary?.incomeTotal ?? totalRendaComputed;
    const totalDividasPagar = overviewSummary?.dividasAPagar ?? totalDividasPagarComputed;
    const totalReceber = overviewSummary?.valoresAReceber ?? totalReceberComputed;
    const totalPatrimonio = overviewSummary?.patrimonioTotal ?? totalPatrimonioComputed;
    const totalServicosMensal = servicosMetrics.legacyMonthlyTotal;
    const totalServicosMediaMensal = servicosMetrics.monthlyAverageTotal;
    const totalServicosCobrancaRealPeriodo = servicosMetrics.realChargeInPeriodTotal;
    const totalServicosVinculadosCartaoMediaMensal = servicosMetrics.linkedCardMonthlyAverageTotal;
    const totalServicosVinculadosCartaoCobrancaRealPeriodo = servicosMetrics.linkedCardRealChargeInPeriodTotal;
    const totalServicosNaoVinculadosCartaoMediaMensal = servicosMetrics.nonLinkedCardMonthlyAverageTotal;
    const totalServicosNaoVinculadosCartaoCobrancaRealPeriodo = servicosMetrics.nonLinkedCardRealChargeInPeriodTotal;

    const saldoLiquido = totalRenda - totalCartoes - (totalServicosMensal * monthsInPeriod);

    return {
      compras: periodCompras,
      dividas: periodDividas,
      totalRenda,
      totalCartoes,
      totalDividasPagar,
      totalReceber,
      totalPatrimonio,
      saldoLiquido,
      activeServicos,
      totalServicosMensal,
      totalServicosMediaMensal,
      totalServicosCobrancaRealPeriodo,
      totalServicosVinculadosCartaoMediaMensal,
      totalServicosVinculadosCartaoCobrancaRealPeriodo,
      totalServicosNaoVinculadosCartaoMediaMensal,
      totalServicosNaoVinculadosCartaoCobrancaRealPeriodo,
      hasDetailedServicosMetrics: servicosMetrics.hasDetailedSummaryMetrics,
      servicosDetalhados: servicosMetrics.detailedServices,
    };
  }, [compras, dividas, rendas, patrimonios, servicos, interval, monthsInPeriod, overviewSummary, startDateIso, endDateIso, periodo]);

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      const mKey = format(d, "yyyy-MM");
      const mDividas = dividas.filter((dv) => dv.dataVencimento?.startsWith(mKey));
      return {
        name: format(d, "MMM", { locale: ptBR }),
        entradas: mDividas.filter((dv) => dv.tipo === "receber" && dv.status === "pago").reduce((s, dv) => s + Number(dv.valor), 0),
        saidas: mDividas.filter((dv) => dv.tipo === "pagar" && dv.status === "pago").reduce((s, dv) => s + Number(dv.valor), 0),
      };
    });
  }, [dividas]);

  const exportPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    const pdfMeta = buildRelatorioPdfMetadata({
      label,
      dataSource,
      overviewPeriod,
      overviewGeneratedAt,
      fallbackStartDateIso: startDateIso,
      fallbackEndDateIso: endDateIso,
    });
    
    doc.setFontSize(18);
    doc.text("FinControl — Relatório Financeiro", 14, 20);
    doc.setFontSize(11);
    doc.text(`Período: ${pdfMeta.periodLabel}`, 14, 28);
    doc.text(`Gerado em: ${pdfMeta.generatedAtLabel}`, 14, 34);
    doc.text(`Fonte: ${pdfMeta.sourceLabel}`, 14, 40);

    // Resumo Geral
    autoTable(doc, {
      startY: 47,
      head: [['Resumo Geral', 'Valor']],
      body: [
        ['Renda Total', formatCurrency(filteredData.totalRenda)],
        ['Total Cartões', formatCurrency(filteredData.totalCartoes)],
        ['Total Dívidas', formatCurrency(filteredData.totalDividasPagar)],
        ['Serviços — média mensal', formatCurrency(filteredData.totalServicosMediaMensal)],
        ['Serviços — cobrança real no período', formatCurrency(filteredData.totalServicosCobrancaRealPeriodo)],
        ['Serviços vinculados a cartão (real no período)', formatCurrency(filteredData.totalServicosVinculadosCartaoCobrancaRealPeriodo)],
        ['Total a Receber', formatCurrency(filteredData.totalReceber)],
        ['Patrimônio Total', formatCurrency(filteredData.totalPatrimonio)],
        ['Saldo Líquido', formatCurrency(filteredData.saldoLiquido)],
      ],
      theme: 'striped'
    });

    doc.setFontSize(9);
    doc.text(
      "Serviços: média mensal representa planejamento. Cobrança real representa o que vence no período selecionado.",
      14,
      (doc as any).lastAutoTable.finalY + 6,
    );
    doc.text(
      "Cobranças vinculadas ao cartão já aparecem na fatura.",
      14,
      (doc as any).lastAutoTable.finalY + 11,
    );

    // Cartões
    const cartoesBody: any[] = [];
    const groupedCompras = filteredData.compras.reduce((acc, c) => {
      const cardName = cartoes.find(ca => ca.id === c.cartaoId)?.nome || "Outros";
      if (!acc[cardName]) acc[cardName] = [];
      acc[cardName].push(c);
      return acc;
    }, {} as Record<string, CompraCartao[]>);

    Object.entries(groupedCompras).forEach(([cardName, items]) => {
      const subtotal = items.reduce((s, i) => s + Number(i.valorParcela), 0);
      items.forEach(i => {
        cartoesBody.push([cardName, i.descricao, `${i.parcelaAtual}/${i.parcelas}`, formatCurrency(Number(i.valorParcela)), i.dataCompra]);
      });
      cartoesBody.push([`Subtotal ${cardName}`, '', '', formatCurrency(subtotal), '']);
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Cartão', 'Descrição', 'Parcela', 'Valor/Parc', 'Data']],
      body: cartoesBody.length ? cartoesBody : [['Nenhuma compra no período', '', '', '', '']],
      didDrawPage: (data) => {
        doc.text(`Página ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    // Pessoas
    const pessoasBody: string[][] = pessoas.map(p => {
      const pDividas = filteredData.dividas.filter(d => d.pessoaId === p.id && d.status === "pendente");
      const total = pDividas.reduce((acc, d) => acc + (d.tipo === "receber" ? Number(d.valor) : -Number(d.valor)), 0);
      return [
        p.nome,
        total >= 0 ? "Me deve" : "Eu devo",
        formatCurrency(Math.abs(total)),
        total === 0 ? "Quitado" : "Pendente"
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Pessoa', 'Tipo', 'Valor Total Pendente', 'Status']],
      body: pessoasBody.length ? pessoasBody : [['Sem dados no período', '', '', '']],
    });

    // Serviços
    const servicosBody: any[] = filteredData.servicosDetalhados.map((s) => [
      s.nome,
      s.categoria,
      s.periodicidadeLabel,
      formatCurrency(s.valorCobranca),
      formatCurrency(s.equivalenteMensal),
      s.vinculadoCartao ? "Sim" : "Não",
    ]);
    if (servicosBody.length === 0) {
      servicosBody.push(['Sem dados no período', '', '', '', '', '']);
    }
    servicosBody.push([
      'Totais',
      '',
      '',
      formatCurrency(filteredData.totalServicosCobrancaRealPeriodo),
      formatCurrency(filteredData.totalServicosMediaMensal),
      '',
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Serviço', 'Categoria', 'Periodicidade', 'Cobrança', 'Equiv. mensal', 'Vinc. cartão']],
      body: servicosBody,
    });

    // Patrimônio
    const patrimoniosBody: any[] = patrimonios.map(p => [
      p.nome,
      p.tipo.replace('_', ' '),
      formatCurrency(Number(p.valorAtual))
    ]);
    if (patrimoniosBody.length === 0) {
      patrimoniosBody.push(['Sem dados no período', '', '']);
    }
    patrimoniosBody.push(['Total', '', formatCurrency(filteredData.totalPatrimonio)]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Item', 'Tipo', 'Valor Atual']],
      body: patrimoniosBody,
    });

    doc.save(`relatorio-fincontrol-${periodo}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-6 overflow-x-hidden p-4 sm:p-6">
        <FintechLoadingPageHeader
          className="rounded-3xl"
          showEyebrow={false}
          titleWidth="w-48"
          subtitleWidth="w-72 max-w-full"
          actions={
            <FintechLoadingActionCluster
              widths={["w-full sm:w-[190px]", "w-full sm:w-[152px]"]}
              className="grid-cols-1 sm:grid-cols-2"
            />
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <FintechLoadingMetricCard
              key={i}
              className="rounded-3xl"
              titleWidth="w-24"
              valueWidth="w-28"
              iconSizeClassName="h-11 w-11"
            />
          ))}
        </div>
        <FintechLoadingSurface className="rounded-3xl">
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-2xl bg-muted/70" />
            <Skeleton className="h-6 w-52 rounded-xl bg-muted/65" />
          </div>
          <Skeleton className="h-[320px] w-full rounded-2xl bg-muted/70" />
        </FintechLoadingSurface>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <FintechLoadingSurface key={i} className="rounded-3xl">
              <div className="mb-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-2xl bg-muted/70" />
                <Skeleton className="h-6 w-40 rounded-xl bg-muted/65" />
              </div>
              <FintechLoadingSurface tone="inset" className="rounded-2xl">
                <div className="space-y-3">
                  {[...Array(5)].map((__, rowIndex) => (
                    <FintechLoadingListItem
                      key={rowIndex}
                      tone="inset"
                      titleWidth="w-28"
                      subtitleWidth="w-20"
                      trailingWidth="w-20"
                      className="border-0 bg-transparent shadow-none"
                    />
                  ))}
                </div>
              </FintechLoadingSurface>
            </FintechLoadingSurface>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 overflow-x-hidden p-4 sm:p-6" data-testid="relatorios-page">
      <FintechPageHeader
        className="rounded-3xl"
        rowClassName="xl:items-end"
        title="Relatórios"
        titleClassName="sm:text-[2rem]"
        subtitle="Análise detalhada da sua saúde financeira"
        badges={isCompatibilityMode ? (
          <p className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
            Exibindo dados em modo compatibilidade.
          </p>
        ) : undefined}
        actionsClassName="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center xl:justify-end"
        actions={(
          <>
            <div className="rounded-2xl border border-border/60 bg-background/80 p-2 shadow-sm">
              <Select value={periodo} onValueChange={(v: Periodo) => setPeriodo(v)}>
                <SelectTrigger
                  className="h-10 w-full border-0 bg-transparent px-2 shadow-none sm:w-[190px]"
                  data-testid="select-periodo"
                >
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                  <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                  <SelectItem value="ano_atual">Ano atual</SelectItem>
                  <SelectItem value="total_geral">Total geral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={exportPDF}
              data-testid="button-export-pdf"
              className="h-11 gap-2 rounded-2xl px-5 shadow-sm"
            >
              <FileDown className="w-4 h-4" />
              Baixar PDF
            </Button>
          </>
        )}
      />

      {/* Section 1 — Resumo Geral */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Renda Total
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/15 bg-emerald-500/10 shadow-sm">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className="fin-value-kpi text-emerald-600 [overflow-wrap:anywhere]">{fc(filteredData.totalRenda)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Total Cartões
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/10 shadow-sm">
                <CreditCard className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className="fin-value-kpi text-red-600 [overflow-wrap:anywhere]">{fc(filteredData.totalCartoes)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Total Dívidas
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/10 shadow-sm">
                <Receipt className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className="fin-value-kpi text-red-600 [overflow-wrap:anywhere]">{fc(filteredData.totalDividasPagar)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                A Receber
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-500/15 bg-blue-500/10 shadow-sm">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className="fin-value-kpi text-blue-600 [overflow-wrap:anywhere]">{fc(filteredData.totalReceber)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Patrimônio
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/15 bg-indigo-500/10 shadow-sm">
                <PiggyBank className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className="fin-value-kpi text-indigo-600 [overflow-wrap:anywhere]">{fc(filteredData.totalPatrimonio)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex min-h-[132px] flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Saldo Líquido
              </p>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
                <div className="flex h-5 w-5 items-center justify-center text-sm font-bold text-primary">
                  B$
                </div>
              </div>
            </div>
            <div className="space-y-1 pt-6">
              <p className={`fin-value-kpi [overflow-wrap:anywhere] ${filteredData.saldoLiquido >= 0 ? "text-primary" : "text-red-600"}`}>
                {fc(filteredData.saldoLiquido)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 — Histórico */}
      <Card className="rounded-3xl border border-border/60 bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
              <BarChartIcon className="w-5 h-5 text-primary" />
            </span>
            Histórico (últimos 6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
            <RelatoriosHistoricoChart
              data={chartData}
              formatCurrency={formatCurrency}
            />
          </Suspense>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 3 — Detalhamento em Cartões */}
        <Card className="rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/10 shadow-sm">
                <CreditCard className="w-5 h-5 text-red-600" />
              </span>
              Detalhamento em Cartões
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cartão</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parcela</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor/Parc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.compras.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10">
                        <FintechEmptyState
                          icon={<CreditCard className="h-5 w-5 text-muted-foreground/70" />}
                          title="Nenhuma compra no período"
                          size="compact"
                          className="mx-auto max-w-sm bg-background/80"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(
                      filteredData.compras.reduce((acc, c) => {
                        const cardName = cartoes.find(ca => ca.id === c.cartaoId)?.nome || "Outros";
                        if (!acc[cardName]) acc[cardName] = [];
                        acc[cardName].push(c);
                        return acc;
                      }, {} as Record<string, CompraCartao[]>)
                    ).map(([cardName, items]) => (
                      <Fragment key={cardName}>
                        <TableRow key={cardName} className="border-border/50 bg-muted/35 font-semibold">
                          <TableCell colSpan={4}>{cardName}</TableCell>
                        </TableRow>
                        {items.map((item) => (
                          <TableRow key={item.id} className="border-border/40 hover:bg-muted/20">
                            <TableCell className="pl-6 text-xs text-muted-foreground">{cardName}</TableCell>
                            <TableCell className="max-w-[220px] whitespace-normal break-words font-medium align-top" title={item.descricao}>{item.descricao}</TableCell>
                            <TableCell>{item.parcelaAtual}/{item.parcelas}</TableCell>
                            <TableCell className="fin-value-table text-right">{fc(Number(item.valorParcela))}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-border/60 bg-muted/20 font-bold">
                          <TableCell colSpan={3} className="text-right">Subtotal {cardName}</TableCell>
                          <TableCell className="fin-value-table text-right">
                            {fc(items.reduce((s, i) => s + Number(i.valorParcela), 0))}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Section 4 — Pessoas */}
        <Card className="rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-500/15 bg-blue-500/10 shadow-sm">
                <Users className="w-5 h-5 text-blue-600" />
              </span>
              Pessoas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pessoas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10">
                        <FintechEmptyState
                          icon={<Users className="h-5 w-5 text-muted-foreground/70" />}
                          title="Nenhuma pessoa cadastrada"
                          size="compact"
                          className="mx-auto max-w-sm bg-background/80"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    pessoas.map((p) => {
                      const pDividas = filteredData.dividas.filter(d => d.pessoaId === p.id && d.status === "pendente");
                      const total = pDividas.reduce((acc, d) => acc + (d.tipo === "receber" ? Number(d.valor) : -Number(d.valor)), 0);
                      return (
                        <TableRow key={p.id} className="border-border/40 hover:bg-muted/20">
                          <TableCell className="max-w-[220px] whitespace-normal break-words font-medium align-top" title={p.nome}>{p.nome}</TableCell>
                          <TableCell>
                            <Badge variant={total >= 0 ? "default" : "destructive"} className="rounded-full px-2.5">
                              {total >= 0 ? "Me deve" : "Eu devo"}
                            </Badge>
                          </TableCell>
                          <TableCell className={`fin-value-table text-right ${total >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {fc(Math.abs(total))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Section 5 — Serviços Ativos */}
        <Card className="rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/15 bg-amber-500/10 shadow-sm">
                <Receipt className="w-5 h-5 text-amber-600" />
              </span>
              Serviços Ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Média mensal de serviços</p>
                <p className="pt-2 text-sm font-semibold">{fc(filteredData.totalServicosMediaMensal)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrança real no período</p>
                <p className="pt-2 text-sm font-semibold">{fc(filteredData.totalServicosCobrancaRealPeriodo)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vinculados a cartão (real)</p>
                <p className="pt-2 text-sm font-semibold">{fc(filteredData.totalServicosVinculadosCartaoCobrancaRealPeriodo)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Não vinculados a cartão (real)</p>
                <p className="pt-2 text-sm font-semibold">{fc(filteredData.totalServicosNaoVinculadosCartaoCobrancaRealPeriodo)}</p>
              </div>
            </div>

            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700">
              Cobranças vinculadas ao cartão já aparecem na fatura.
            </p>

            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serviço</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Periodicidade</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobrança</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equiv. mensal</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vinculado cartão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.activeServicos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10">
                        <FintechEmptyState
                          icon={<Receipt className="h-5 w-5 text-muted-foreground/70" />}
                          title="Nenhum serviço ativo"
                          size="compact"
                          className="mx-auto max-w-sm bg-background/80"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.servicosDetalhados.map((s) => (
                      <TableRow key={s.id} className="border-border/40 hover:bg-muted/20">
                        <TableCell className="max-w-[220px] whitespace-normal break-words font-medium align-top" title={s.nome}>{s.nome}</TableCell>
                        <TableCell>{s.categoria}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.periodicidadeLabel}</TableCell>
                        <TableCell className="fin-value-table text-right">
                          {fc(s.valorCobranca)}
                        </TableCell>
                        <TableCell className="fin-value-table text-right">
                          {fc(s.equivalenteMensal)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.vinculadoCartao ? "secondary" : "outline"} className="rounded-full px-2.5">
                            {s.vinculadoCartao ? "Sim" : "Não"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="border-t-2 border-border/60 bg-muted/20 font-bold">
                    <TableCell colSpan={3} className="text-right">Totais</TableCell>
                    <TableCell className="fin-value-table text-right">
                      {fc(filteredData.totalServicosCobrancaRealPeriodo)}
                    </TableCell>
                    <TableCell className="fin-value-table text-right">
                      {fc(filteredData.totalServicosMediaMensal)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {!filteredData.hasDetailedServicosMetrics ? (
              <p className="text-xs text-muted-foreground">
                Modo compatibilidade: detalhamento avançado de serviços calculado localmente.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Section 6 — Patrimônio */}
        <Card className="rounded-3xl border border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/15 bg-indigo-500/10 shadow-sm">
                <PiggyBank className="w-5 h-5 text-indigo-600" />
              </span>
              Patrimônio
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor Atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patrimonios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10">
                        <FintechEmptyState
                          icon={<PiggyBank className="h-5 w-5 text-muted-foreground/70" />}
                          title="Nenhum patrimônio cadastrado"
                          size="compact"
                          className="mx-auto max-w-sm bg-background/80"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    patrimonios.map((p) => {
                      const labels: Record<string, string> = {
                        conta_bancaria: "Conta Bancária",
                        dinheiro: "Dinheiro",
                        poupanca: "Poupança",
                        investimento: "Investimento",
                        outros: "Outros"
                      };
                      return (
                        <TableRow key={p.id} className="border-border/40 hover:bg-muted/20">
                          <TableCell className="max-w-[220px] whitespace-normal break-words font-medium align-top" title={p.nome}>{p.nome}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{labels[p.tipo] || p.tipo}</TableCell>
                          <TableCell className="fin-value-table text-right text-indigo-600">
                            {fc(Number(p.valorAtual))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  <TableRow className="border-t-2 border-border/60 bg-muted/20 font-bold">
                    <TableCell colSpan={2} className="text-right">Total</TableCell>
                    <TableCell className="fin-value-table text-right text-indigo-600">
                      {fc(filteredData.totalPatrimonio)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
