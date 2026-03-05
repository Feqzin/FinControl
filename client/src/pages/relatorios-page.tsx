import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useValuesVisibility, maskValue } from "@/context/values-visibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown, CreditCard, Users, Receipt, PiggyBank, Wallet, BarChart as BarChartIcon, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type Periodo = "mes_atual" | "mes_anterior" | "ultimos_3_meses" | "ano_atual" | "total_geral";

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<Periodo>("mes_atual");
  const { visible } = useValuesVisibility();
  const fc = (v: number) => maskValue(formatCurrency(v), visible);

  const { data: rendas = [], isLoading: l1 } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });
  const { data: patrimonios = [], isLoading: l2 } = useQuery<Patrimonio[]>({ queryKey: ["/api/patrimonios"] });
  const { data: compras = [], isLoading: l3 } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: cartoes = [], isLoading: l4 } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: servicos = [], isLoading: l5 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: dividas = [], isLoading: l6 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: pessoas = [], isLoading: l7 } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const { interval, monthsInPeriod, label } = useMemo(() => {
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
      label: lbl
    };
  }, [periodo]);

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

    const totalRenda = activeRendas.reduce((acc, r) => acc + Number(r.valor), 0) * monthsInPeriod;
    const totalCartoes = periodCompras.reduce((acc, c) => acc + Number(c.valorParcela), 0);
    const totalDividasPagar = periodDividas
      .filter(d => d.tipo === "pagar" && d.status === "pendente")
      .reduce((acc, d) => acc + Number(d.valor), 0);
    const totalReceber = periodDividas
      .filter(d => d.tipo === "receber" && d.status === "pendente")
      .reduce((acc, d) => acc + Number(d.valor), 0);
    const totalPatrimonio = patrimonios.reduce((acc, p) => acc + Number(p.valorAtual), 0);
    
    const totalServicosMensal = activeServicos.reduce((acc, s) => acc + Number(s.valorMensal), 0);
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
      totalServicosMensal
    };
  }, [compras, dividas, rendas, patrimonios, servicos, interval, monthsInPeriod]);

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

  const exportPDF = () => {
    const doc = new jsPDF();
    const nowStr = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.text("FinControl — Relatório Financeiro", 14, 20);
    doc.setFontSize(11);
    doc.text(`Período: ${label} | Gerado em: ${nowStr}`, 14, 28);

    // Resumo Geral
    autoTable(doc, {
      startY: 35,
      head: [['Resumo Geral', 'Valor']],
      body: [
        ['Renda Total', formatCurrency(filteredData.totalRenda)],
        ['Total Cartões', formatCurrency(filteredData.totalCartoes)],
        ['Total Dívidas', formatCurrency(filteredData.totalDividasPagar)],
        ['Total a Receber', formatCurrency(filteredData.totalReceber)],
        ['Patrimônio Total', formatCurrency(filteredData.totalPatrimonio)],
        ['Saldo Líquido', formatCurrency(filteredData.saldoLiquido)],
      ],
      theme: 'striped'
    });

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
    const pessoasBody = pessoas.map(p => {
      const pDividas = dividas.filter(d => d.pessoaId === p.id && d.status === "pendente");
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
      body: pessoasBody,
    });

    // Serviços
    const servicosBody: any[] = filteredData.activeServicos.map(s => [
      s.nome,
      s.categoria,
      formatCurrency(Number(s.valorMensal)),
      s.formaPagamento
    ]);
    servicosBody.push(['Total Mensal', '', formatCurrency(filteredData.totalServicosMensal), '']);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Serviço', 'Categoria', 'Valor Mensal', 'Pagamento']],
      body: servicosBody,
    });

    // Patrimônio
    const patrimoniosBody: any[] = patrimonios.map(p => [
      p.nome,
      p.tipo.replace('_', ' '),
      formatCurrency(Number(p.valorAtual))
    ]);
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
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const getPessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome || "—";

  return (
    <div className="p-6 space-y-6" data-testid="relatorios-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">Análise detalhada da sua saúde financeira</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={periodo} onValueChange={(v: Periodo) => setPeriodo(v)}>
            <SelectTrigger className="w-[180px]" data-testid="select-periodo">
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
          <Button onClick={exportPDF} data-testid="button-export-pdf" className="gap-2">
            <FileDown className="w-4 h-4" />
            Baixar PDF
          </Button>
        </div>
      </div>

      {/* Section 1 — Resumo Geral */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Renda Total</p>
              <p className="text-lg font-bold text-emerald-600">{fc(filteredData.totalRenda)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <CreditCard className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cartões</p>
              <p className="text-lg font-bold text-red-600">{fc(filteredData.totalCartoes)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Receipt className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Dívidas</p>
              <p className="text-lg font-bold text-red-600">{fc(filteredData.totalDividasPagar)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">A Receber</p>
              <p className="text-lg font-bold text-blue-600">{fc(filteredData.totalReceber)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <PiggyBank className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Patrimônio</p>
              <p className="text-lg font-bold text-indigo-600">{fc(filteredData.totalPatrimonio)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <div className="w-5 h-5 flex items-center justify-center font-bold text-primary">B$</div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo Líquido</p>
              <p className={`text-lg font-bold ${filteredData.saldoLiquido >= 0 ? "text-primary" : "text-red-600"}`}>
                {fc(filteredData.saldoLiquido)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 — Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChartIcon className="w-5 h-5" />
            Histórico (últimos 6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `R$ ${v}`} />
                <RechartsTooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="entradas" fill="hsl(var(--chart-2))" name="Entradas" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="hsl(var(--chart-1))" name="Saídas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 3 — Detalhamento em Cartões */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Detalhamento em Cartões
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cartão</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead className="text-right">Valor/Parc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.compras.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma compra no período
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
                      <>
                        <TableRow key={cardName} className="bg-muted/50 font-semibold">
                          <TableCell colSpan={4}>{cardName}</TableCell>
                        </TableRow>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="pl-6 text-xs text-muted-foreground">{cardName}</TableCell>
                            <TableCell className="max-w-[150px] truncate" title={item.descricao}>{item.descricao}</TableCell>
                            <TableCell>{item.parcelaAtual}/{item.parcelas}</TableCell>
                            <TableCell className="text-right">{fc(Number(item.valorParcela))}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-bold">
                          <TableCell colSpan={3} className="text-right">Subtotal {cardName}</TableCell>
                          <TableCell className="text-right">
                            {fc(items.reduce((s, i) => s + Number(i.valorParcela), 0))}
                          </TableCell>
                        </TableRow>
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Section 4 — Pessoas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Pessoas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Pendente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pessoas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhuma pessoa cadastrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    pessoas.map((p) => {
                      const pDividas = dividas.filter(d => d.pessoaId === p.id && d.status === "pendente");
                      const total = pDividas.reduce((acc, d) => acc + (d.tipo === "receber" ? Number(d.valor) : -Number(d.valor)), 0);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell>
                            <Badge variant={total >= 0 ? "default" : "destructive"}>
                              {total >= 0 ? "Me deve" : "Eu devo"}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${total >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Serviços Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor Mensal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.activeServicos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum serviço ativo
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.activeServicos.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nome}</TableCell>
                        <TableCell>{s.categoria}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {fc(Number(s.valorMensal))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell colSpan={2} className="text-right">Total Mensal</TableCell>
                    <TableCell className="text-right">
                      {fc(filteredData.totalServicosMensal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Section 6 — Patrimônio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PiggyBank className="w-5 h-5" />
              Patrimônio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor Atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patrimonios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum patrimônio cadastrado
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
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{labels[p.tipo] || p.tipo}</TableCell>
                          <TableCell className="text-right font-bold text-indigo-600">
                            {fc(Number(p.valorAtual))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell colSpan={2} className="text-right">Total</TableCell>
                    <TableCell className="text-right text-indigo-600">
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
