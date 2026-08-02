import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Parcela,
  ParcelaCompra,
  Pessoa,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";
import type { CartaoResumo } from "@/services/api/cartoes";
import type { PessoaSaldoMovimentacao } from "@/services/api/pessoas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyBRL } from "@/utils/formatters";
import { generatePessoaFinancialReportPdf } from "@/pages/pessoas/pessoa-financial-report-pdf";
import {
  buildPessoaFinancialReport,
  type PessoaFinancialReportOptions,
} from "@/pages/pessoas/pessoa-financial-report.utils";

type PessoaPdfReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoa: Pessoa | null;
  dividas: Divida[];
  parcelas: Parcela[];
  comprasCartao: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  cartoes: Cartao[];
  cartoesResumo: CartaoResumo[];
  servicoPessoas: ServicoPessoa[];
  servicoPagamentos: ServicoPagamento[];
  servicos: Servico[];
  saldoMovimentacoes: PessoaSaldoMovimentacao[];
};

const DEFAULT_OPTIONS: PessoaFinancialReportOptions = {
  includePersonalDebts: true,
  includeSharedServices: true,
  includeCardDebts: true,
};

export function PessoaPdfReportDialog({
  open,
  onOpenChange,
  pessoa,
  dividas,
  parcelas,
  comprasCartao,
  parcelasCompra,
  cartoes,
  cartoesResumo,
  servicoPessoas,
  servicoPagamentos,
  servicos,
  saldoMovimentacoes,
}: PessoaPdfReportDialogProps) {
  const { toast } = useToast();
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const hasSelection = Object.values(options).some(Boolean);
  const report = useMemo(() => {
    if (!pessoa || !open) return null;
    return buildPessoaFinancialReport({
      pessoa,
      dividas,
      parcelas,
      comprasCartao,
      parcelasCompra,
      cartoes,
      cartoesResumo,
      servicoPessoas,
      servicoPagamentos,
      servicos,
      saldoMovimentacoes,
    }, options);
  }, [
    cartoes,
    cartoesResumo,
    comprasCartao,
    dividas,
    options,
    open,
    parcelas,
    parcelasCompra,
    pessoa,
    saldoMovimentacoes,
    servicoPagamentos,
    servicoPessoas,
    servicos,
  ]);

  const setOption = (key: keyof PessoaFinancialReportOptions, checked: boolean) => {
    setOptions((current) => ({ ...current, [key]: checked }));
  };

  const handleGenerate = async () => {
    if (!report || !hasSelection) return;
    setIsGenerating(true);
    try {
      await generatePessoaFinancialReportPdf(report);
      toast({
        title: "PDF criado",
        description: `O extrato de ${report.person.name} foi baixado.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro ao criar PDF",
        description: error instanceof Error ? error.message : "Não foi possível gerar o documento.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extrato financeiro de {pessoa?.nome ?? "pessoa"}</DialogTitle>
          <DialogDescription>
            Escolha as informações que devem aparecer no PDF. O documento mostrará pagamentos, parcelas, meses quitados e valores restantes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ReportOption
            id="pdf-personal-debts"
            checked={options.includePersonalDebts}
            onCheckedChange={(checked) => setOption("includePersonalDebts", checked)}
            title="Dívidas pessoais"
            description="Valores combinados diretamente, parcelas pagas, vencimentos e saldo restante."
          />
          <ReportOption
            id="pdf-shared-services"
            checked={options.includeSharedServices}
            onCheckedChange={(checked) => setOption("includeSharedServices", checked)}
            title="Serviços compartilhados"
            description="Cota mensal, meses pagos, pagamentos parciais e pendência do mês atual."
          />
          <ReportOption
            id="pdf-card-debts"
            checked={options.includeCardDebts}
            onCheckedChange={(checked) => setOption("includeCardDebts", checked)}
            title="Dívidas de cartões"
            description="Compras vinculadas, parcelas pagas e uso do limite de cada cartão e do conjunto."
          />
        </div>

        {report && hasSelection ? (
          <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Já pago registrado</p>
              <p className="font-semibold text-emerald-600">{formatCurrencyBRL(report.summary.totalPaidTracked)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente atual</p>
              <p className="font-semibold text-amber-600">{formatCurrencyBRL(report.summary.totalPending)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Progresso parcelado</p>
              <p className="font-semibold">{report.summary.installmentProgressPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Selecione pelo menos uma categoria para gerar o documento.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={!report || !hasSelection || isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            {isGenerating ? "Gerando..." : "Gerar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportOption({
  id,
  checked,
  onCheckedChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border p-4">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="min-w-0 cursor-pointer space-y-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>
      </Label>
    </div>
  );
}
