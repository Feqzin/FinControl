import type { FuturePurchaseReportData } from "@/pages/simulador/future-purchase-report";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatBoolean(value: boolean): string {
  return value ? "Sim" : "Não";
}

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "simulacao";
}

function drawBalanceChart(doc: any, report: FuturePurchaseReportData, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const chartWidth = pageWidth - (margin * 2);
  const chartHeight = 54;
  const plotTop = startY + 8;
  const plotBottom = plotTop + chartHeight;
  const values = report.result.months.flatMap((month) => [month.endingBalance]);
  values.push(0, report.input.reservaMinima);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(1, maxValue - minValue);
  const toY = (value: number) => plotBottom - ((value - minValue) / valueRange) * chartHeight;

  doc.setFontSize(12);
  doc.setTextColor(25, 35, 45);
  doc.text("Gráfico do dinheiro que sobra em cada mês", margin, startY);
  doc.setFontSize(8);
  doc.setTextColor(100, 110, 120);
  doc.text("Verde = suficiente | Amarelo = abaixo da reserva | Vermelho = saldo negativo", margin, startY + 4.5);

  doc.setDrawColor(220, 225, 230);
  doc.line(margin, plotBottom, margin + chartWidth, plotBottom);
  doc.setDrawColor(239, 68, 68);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, toY(0), margin + chartWidth, toY(0));
  if (report.input.reservaMinima > 0) {
    doc.setDrawColor(245, 158, 11);
    doc.line(margin, toY(report.input.reservaMinima), margin + chartWidth, toY(report.input.reservaMinima));
  }
  doc.setLineDashPattern([], 0);

  const points = report.result.months;
  const slotWidth = chartWidth / Math.max(1, points.length);
  points.forEach((month, index) => {
    const x = margin + slotWidth * index + slotWidth / 2;
    const y = toY(month.endingBalance);
    const baselineY = toY(0);
    const top = Math.min(y, baselineY);
    const height = Math.max(1, Math.abs(baselineY - y));
    const width = Math.max(1.4, Math.min(7, slotWidth * 0.58));
    if (month.belowZero) doc.setFillColor(239, 68, 68);
    else if (month.belowReserve) doc.setFillColor(245, 158, 11);
    else doc.setFillColor(16, 185, 129);
    doc.roundedRect(x - width / 2, top, width, height, 0.8, 0.8, "F");
    const labelInterval = Math.max(1, Math.ceil(points.length / 8));
    if (index % labelInterval === 0 || index === points.length - 1) {
      doc.setFontSize(6.5);
      doc.setTextColor(100, 110, 120);
      doc.text(month.monthReference.slice(5), x, plotBottom + 4, { align: "center" });
    }
  });

  return plotBottom + 10;
}

export async function generateFuturePurchaseReportPdf(report: FuturePurchaseReportData): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableDefaults = {
    margin: { left: margin, right: margin, bottom: 14 },
    styles: { fontSize: 7.5, cellPadding: 2.1, overflow: "linebreak" as const },
    headStyles: { fillColor: [14, 165, 233] as [number, number, number], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 250] as [number, number, number] },
  };

  doc.setTextColor(20, 30, 40);
  doc.setFontSize(19);
  doc.text("FinControl - Relatório completo da simulação", margin, 18);
  doc.setFontSize(13);
  doc.text(report.simulationName, margin, 27);
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 110);
  doc.text(`Compra: ${report.purchaseName}`, margin, 34);
  doc.text(`Cartão: ${report.cardName}`, margin, 39);
  doc.text(`Gerado em: ${new Date(report.generatedAt).toLocaleString("pt-BR")}`, margin, 44);

  autoTable(doc, {
    ...tableDefaults,
    startY: 50,
    head: [["Resumo simples", "Resultado"]],
    body: [
      ["Recomendação", report.result.status],
      ["Motivo principal", report.result.primaryReason ?? "Nenhum alerta adicional"],
      ["Valor total da compra", formatCurrency(report.input.valorTotal)],
      ["Parcelamento", `${report.input.parcelas}x de ${formatCurrency(report.result.installmentAmount)}`],
      ["Menor saldo previsto", formatCurrency(report.result.lowestBalance)],
      ["Mês mais apertado", report.result.worstMonth?.label ?? "Não identificado"],
      ["Reserva desejada", formatCurrency(report.input.reservaMinima)],
      ["Meses no vermelho", String(report.result.monthsNegativeCount)],
      ["Contas mensais conferidas", report.allMonthsReconciled ? "Sim - todas fecham até o centavo" : "Atenção - há diferença"],
    ],
    theme: "striped",
  });

  autoTable(doc, {
    ...tableDefaults,
    startY: (doc as any).lastAutoTable.finalY + 7,
    head: [["O cálculo considerou", "Escolha", "Valor no período"]],
    body: [
      ["Patrimônio líquido disponível", formatBoolean(report.result.calculationBasis.includeLiquidAssets), formatCurrency(report.result.calculationBasis.liquidAssetsUsed)],
      ["Dívidas pessoais a pagar", formatBoolean(report.result.calculationBasis.includePersonalDebts), formatCurrency(report.result.calculationBasis.personalDebtsConsidered)],
      ["Faturas e compras existentes", formatBoolean(report.result.calculationBasis.includeCardCommitments), formatCurrency(report.result.calculationBasis.cardCommitmentsConsidered)],
      ["Valores esperados de outras pessoas", formatBoolean(report.result.calculationBasis.includeExpectedReceivables), formatCurrency(report.result.calculationBasis.expectedReceivablesConsidered)],
      ["Pessoas consideradas", report.result.calculationBasis.selectedReceivablePeople.join(", ") || "Nenhuma", `${report.result.calculationBasis.selectedReceivablePeople.length}`],
      ["Modo Férias", formatBoolean(report.result.calculationBasis.includeVacationPlans), `${report.result.calculationBasis.vacationPlansConsidered} planejamento(s)`],
      ["Renda pausada pelas férias", "Desconto", formatCurrency(report.result.calculationBasis.vacationSuspendedIncome)],
      ["Adiantamento de férias", "Entrada", formatCurrency(report.result.calculationBasis.vacationPayIncome)],
    ],
    theme: "striped",
  });

  let nextY = (doc as any).lastAutoTable.finalY + 10;
  if (nextY > 205) {
    doc.addPage();
    nextY = 18;
  }
  nextY = drawBalanceChart(doc, report, nextY);

  autoTable(doc, {
    ...tableDefaults,
    startY: nextY,
    head: [["Mês", "Começou com", "Entrou", "Extras", "Saiu", "Parcela", "Terminou com", "Conferido"]],
    body: report.monthlyEquations.map((month) => [
      month.label,
      formatCurrency(month.startingBalance),
      formatCurrency(month.actualIncome),
      formatCurrency(month.simulatedExtraIncome),
      formatCurrency(month.actualExpenses),
      formatCurrency(month.simulatedInstallment),
      formatCurrency(month.endingBalance),
      month.reconciled ? "Sim" : "Não",
    ]),
  });

  report.result.months.forEach((month) => {
    const details = [
      ...month.actualIncomeBreakdown.map((item) => ["Entrada", item.title, item.subtitle ?? "", formatCurrency(item.impactAmount)]),
      ...month.extraIncomeEntries.map((item) => ["Entrada extra", item.descricao || "Entrada extra", item.data, formatCurrency(item.valor)]),
      ...month.actualExpenseBreakdown.map((item) => ["Saída", item.title, item.subtitle ?? "", formatCurrency(item.impactAmount)]),
      ...(month.simulatedInstallment > 0 ? [["Parcela simulada", report.purchaseName, "Compra futura", formatCurrency(month.simulatedInstallment)]] : []),
    ];
    autoTable(doc, {
      ...tableDefaults,
      startY: (doc as any).lastAutoTable.finalY + 7,
      head: [[`${month.label} - todos os itens`, "Descrição", "Detalhe", "Valor"]],
      body: details.length > 0 ? details : [["Sem movimentações", "", "", formatCurrency(0)]],
      didDrawPage: () => undefined,
    });
  });

  const formulaY = (doc as any).lastAutoTable.finalY + 8;
  if (formulaY > pageHeight - 35) doc.addPage();
  const finalFormulaY = formulaY > pageHeight - 35 ? 18 : formulaY;
  doc.setFontSize(10);
  doc.setTextColor(25, 35, 45);
  doc.text("Como cada mês foi calculado", margin, finalFormulaY);
  doc.setFontSize(8);
  doc.setTextColor(90, 100, 110);
  doc.text(
    doc.splitTextToSize(
      "Saldo final = saldo inicial + renda prevista ajustada + valores selecionados a receber + entradas extras - contas pessoais - faturas existentes - parcela simulada. O Modo Férias reduz somente as rendas pausadas e soma o adiantamento quando ele ainda não está incluído no patrimônio.",
      pageWidth - (margin * 2),
    ),
    margin,
    finalFormulaY + 5,
  );

  const pages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("Relatório informativo gerado pelo FinControl", margin, pageHeight - 8);
    doc.text(`Página ${pageNumber} de ${pages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  doc.save(`simulacao-${sanitizeFileName(report.simulationName)}.pdf`);
}
