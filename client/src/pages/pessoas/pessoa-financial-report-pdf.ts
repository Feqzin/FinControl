import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PessoaFinancialReport } from "@/pages/pessoas/pessoa-financial-report.utils";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function formatMonth(value: string): string {
  try {
    return format(parseISO(`${value}-01`), "MMM/yyyy", { locale: ptBR }).replace(".", "");
  } catch {
    return value;
  }
}

function formatMonths(values: string[]): string {
  if (values.length === 0) return "Nenhum";
  return values.map(formatMonth).join(", ");
}

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "pessoa";
}

export async function generatePessoaFinancialReportPdf(report: PessoaFinancialReport): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  const drawPageFooter = (pageNumber: number) => {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("Relatório informativo gerado pelo FinControl", margin, pageHeight - 8);
    doc.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  };

  const tableDefaults = {
    margin: { left: margin, right: margin, bottom: 14 },
    styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak" as const },
    headStyles: { fillColor: [20, 184, 166] as [number, number, number], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 250] as [number, number, number] },
  };

  doc.setTextColor(20, 30, 40);
  doc.setFontSize(19);
  doc.text("FinControl — Extrato financeiro por pessoa", margin, 18);
  doc.setFontSize(13);
  doc.text(report.person.name, margin, 27);
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 110);
  doc.text(`Gerado em: ${new Date(report.generatedAt).toLocaleString("pt-BR")}`, margin, 34);
  doc.text(`Competência atual: ${formatMonth(report.monthReference)}`, margin, 39);
  if (report.person.phone) doc.text(`Contato cadastrado: ${report.person.phone}`, margin, 44);

  autoTable(doc, {
    ...tableDefaults,
    startY: report.person.phone ? 50 : 45,
    head: [["Resumo", "Valor"]],
    body: [
      ["Total já pago registrado", formatCurrency(report.summary.totalPaidTracked)],
      ["Total pendente atual", formatCurrency(report.summary.totalPending)],
      ["Total das dívidas e compras parceladas", formatCurrency(report.summary.installmentTotal)],
      ["Pago nas dívidas e compras parceladas", formatCurrency(report.summary.installmentPaid)],
      ["Restante das dívidas e compras parceladas", formatCurrency(report.summary.installmentPending)],
      ["Progresso das dívidas e compras parceladas", formatPercent(report.summary.installmentProgressPercent)],
      ["Serviços pendentes na competência atual", formatCurrency(report.summary.currentServicesPending)],
    ],
    theme: "striped",
  });

  if (report.options.includePersonalDebts) {
    autoTable(doc, {
      ...tableDefaults,
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Dívidas pessoais", "Parcelas", "Meses pagos", "Total", "Pago", "Restante", "Vencimento", "Status"]],
      body: report.personalDebts.length > 0
        ? report.personalDebts.map((item) => [
          item.description,
          item.installmentProgress,
          formatMonths(item.paidMonthReferences),
          formatCurrency(item.total),
          formatCurrency(item.paid),
          formatCurrency(item.pending),
          formatDate(item.dueDate),
          item.status === "pago" ? "Pago" : item.status === "vencido" ? "Vencido" : "Pendente",
        ])
        : [["Nenhuma dívida pessoal vinculada", "", "", "", "", "", "", ""]],
    });
  }

  if (report.options.includeCardDebts) {
    autoTable(doc, {
      ...tableDefaults,
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Compras no cartão", "Cartão", "Parcelas pagas", "Meses pagos", "Total", "Pago", "Restante", "% pago"]],
      body: report.cardDebts.length > 0
        ? report.cardDebts.map((item) => [
          item.description,
          item.cardName,
          `${item.paidInstallments}/${item.totalInstallments}`,
          formatMonths(item.paidMonthReferences),
          formatCurrency(item.total),
          formatCurrency(item.paid),
          formatCurrency(item.pending),
          formatPercent(item.progressPercent),
        ])
        : [["Nenhuma compra de cartão vinculada", "", "", "", "", "", "", ""]],
    });

    autoTable(doc, {
      ...tableDefaults,
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Uso dos cartões", "Limite", "Uso total", "% total", "Dívida da pessoa", "% do limite", "% do uso"]],
      body: report.cardUsage.length > 0
        ? [
          ...report.cardUsage.map((item) => [
            item.cardName,
            formatCurrency(item.limit),
            formatCurrency(item.totalUsed),
            formatPercent(item.totalUsagePercent),
            formatCurrency(item.personPending),
            formatPercent(item.personLimitPercent),
            formatPercent(item.personShareOfUsedPercent),
          ]),
          ...(report.overallCardUsage ? [[
            "Total dos cartões envolvidos",
            formatCurrency(report.overallCardUsage.limit),
            formatCurrency(report.overallCardUsage.totalUsed),
            formatPercent(report.overallCardUsage.totalUsagePercent),
            formatCurrency(report.overallCardUsage.personPending),
            formatPercent(report.overallCardUsage.personLimitPercent),
            formatPercent(report.overallCardUsage.personShareOfUsedPercent),
          ]] : []),
        ]
        : [["Nenhum cartão envolvido", "", "", "", "", "", ""]],
    });
  }

  if (report.options.includeSharedServices) {
    autoTable(doc, {
      ...tableDefaults,
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Serviços compartilhados", "Cota mensal", "Meses pagos", "Meses parciais", "Pago no histórico", "Pago no mês", "Pendente no mês"]],
      body: report.sharedServices.length > 0
        ? report.sharedServices.map((item) => [
          item.name,
          formatCurrency(item.monthlyShare),
          formatMonths(item.paidMonthReferences),
          formatMonths(item.partialMonthReferences),
          formatCurrency(item.totalPaid),
          formatCurrency(item.currentMonthPaid),
          formatCurrency(item.currentMonthPending),
        ])
        : [["Nenhum serviço compartilhado vinculado", "", "", "", "", "", ""]],
    });
  }

  const notesY = (doc as any).lastAutoTable.finalY + 9;
  if (notesY > pageHeight - 35) doc.addPage();
  const finalNotesY = notesY > pageHeight - 35 ? 18 : notesY;
  doc.setFontSize(8);
  doc.setTextColor(90, 100, 110);
  const notes = doc.splitTextToSize(
    "Observações: serviços recorrentes mostram o histórico registrado e a pendência da competência atual; cobranças futuras não formam um saldo final fixo. O uso total do cartão inclui todas as compras do titular. A coluna da pessoa considera apenas compras vinculadas a ela.",
    pageWidth - (margin * 2),
  );
  doc.text(notes, margin, finalNotesY);

  const pages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawPageFooter(pageNumber);
  }

  doc.save(`extrato-${sanitizeFileName(report.person.name)}-${report.monthReference}.pdf`);
}
