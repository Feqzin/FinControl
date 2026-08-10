import { useId, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Landmark, ShieldCheck, TrendingUp, WalletCards } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildCnpjDasPaymentGuidance } from "@/pages/dividas/cnpj-das-payment-guidance.utils";
import type { CnpjDasObligationView } from "@/services/api/cnpj-das";

type Props = {
  obligations: CnpjDasObligationView[];
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMonth(value: string): string {
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function CnpjDasPaymentGuidance({ obligations }: Props) {
  const budgetInputId = useId();
  const [budgetText, setBudgetText] = useState("");
  const monthlyBudget = Number(budgetText.replace(",", "."));
  const today = new Date().toISOString().slice(0, 10);
  const guidance = useMemo(
    () => buildCnpjDasPaymentGuidance(obligations, monthlyBudget, today),
    [obligations, monthlyBudget, today],
  );

  if (guidance.totalOpen <= 0) {
    return (
      <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/5">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertTitle>DAS regularizado</AlertTitle>
        <AlertDescription>Não há guia em aberto neste CNPJ.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-blue-600" />
            <h5 className="font-semibold">Plano para pagar sem apertar seu caixa</h5>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Use somente o que sobra depois de moradia, alimentação, transporte, contas essenciais e uma reserva mínima. Não conte valores a receber incertos.
          </p>
        </div>
        <div className="w-full space-y-2 lg:w-72">
          <Label htmlFor={budgetInputId}>Quanto cabe por mês?</Label>
          <Input
            id={budgetInputId}
            type="number"
            min="0"
            step="0.01"
            value={budgetText}
            onChange={(event) => setBudgetText(event.target.value)}
            placeholder="Ex.: 300,00"
          />
          <p className="text-xs text-muted-foreground">Informe o valor realmente livre, sem usar cartão ou cheque especial.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-background p-3">
          <p className="text-xs text-muted-foreground">DAS vencidos</p>
          <p className="font-semibold text-red-600">{formatCurrency(guidance.overdueTotal)}</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="text-xs text-muted-foreground">Vencem nos próximos 30 dias</p>
          <p className="font-semibold text-amber-700">{formatCurrency(guidance.dueSoonTotal)}</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="text-xs text-muted-foreground">Multa diária ainda crescendo</p>
          <p className="font-semibold">{guidance.dailyFineCount} guia(s)</p>
        </div>
      </div>

      {monthlyBudget > 0 ? (
        guidance.budgetFitsGuide ? (
          <Alert className="border-emerald-500/30 bg-background">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <AlertTitle>Sugestão para o primeiro mês</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Quite {guidance.firstMonthPriorities.length} guia(s), somando <strong>{formatCurrency(guidance.firstMonthTotal)}</strong>.
                No ritmo informado, o principal atual levaria aproximadamente <strong>{guidance.estimatedMonths} mês(es)</strong>, sem considerar a Selic futura.
              </p>
              <div className="flex flex-wrap gap-2">
                {guidance.firstMonthPriorities.slice(0, 6).map((item) => (
                  <Badge key={item.id} variant="outline" title={item.reason}>
                    {formatMonth(item.competencia)} · {formatCurrency(item.total)}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-500/30 bg-background">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>O valor mensal não quita uma guia inteira</AlertTitle>
            <AlertDescription>
              A menor guia aberta é de {formatCurrency(guidance.minimumGuide)}. Considere aumentar o valor livre ou simular o parcelamento oficial do MEI.
            </AlertDescription>
          </Alert>
        )
      ) : (
        <p className="rounded-lg border border-dashed bg-background p-3 text-sm text-muted-foreground">
          Informe quanto cabe por mês para receber uma primeira sugestão de quitação.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg bg-background p-3">
          <p className="mb-2 flex items-center gap-2 font-medium"><TrendingUp className="h-4 w-4 text-amber-600" />Ordem recomendada</p>
          <ol className="space-y-2 text-sm">
            {guidance.priorities.slice(0, 4).map((item, index) => (
              <li key={item.id} className="flex gap-2">
                <span className="font-semibold text-primary">{index + 1}.</span>
                <span><strong>{formatMonth(item.competencia)} · {formatCurrency(item.total)}</strong><br /><span className="text-muted-foreground">{item.reason}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg bg-background p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium"><Landmark className="h-4 w-4 text-blue-600" />Regras usadas nas dicas</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Multa de 0,33% por dia de atraso, limitada a 20%.</li>
            <li>Depois, os juros pela Selic continuam até o pagamento.</li>
            <li>O parcelamento convencional do MEI pode chegar a 60 parcelas, com mínimo oficial de R$ 50.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="https://www.gov.br/pt-br/servicos/parcelar-imposto-mei" target="_blank" rel="noreferrer">Parcelamento oficial<ExternalLink className="h-3 w-3" /></a>
            <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/verificar-debitos-do-mei" target="_blank" rel="noreferrer">Consultar situação<ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Orientação educativa. Confirme valores, situação da cobrança e opções disponíveis no PGMEI, e-CAC ou Regularize antes de pagar.
      </p>
    </div>
  );
}
