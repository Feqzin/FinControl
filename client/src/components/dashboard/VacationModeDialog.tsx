import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Loader2, Trash2, Umbrella, WalletCards } from "lucide-react";
import type { Renda, VacationPlan } from "@shared/schema";
import {
  buildVacationPlanProjectionMonths,
  calculateVacationPlanEstimate,
  type VacationProjectionPlan,
} from "@shared/vacation-planning";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  createVacationPlan,
  deleteVacationPlan,
  type CreateVacationPlanPayload,
} from "@/services/api/vacation-plans";
import { formatCurrencyBRL } from "@/utils/formatters";

type VacationModeDialogProps = {
  rendas: Renda[];
  plans: VacationPlan[];
};

function formatDate(value: string): string {
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function formatMonth(value: string): string {
  try {
    const label = format(parseISO(`${value}-01`), "MMM 'de' yyyy", { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível salvar o período de férias.";
  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { message?: string; error?: string };
      return parsed.message ?? parsed.error ?? error.message;
    } catch {
      return error.message;
    }
  }
  return error.message;
}

export function VacationModeDialog({ rendas, plans }: VacationModeDialogProps) {
  const { toast } = useToast();
  const fixedIncomes = useMemo(
    () => rendas.filter((income) => income.ativo && income.tipo === "fixo"),
    [rendas],
  );
  const [open, setOpen] = useState(false);
  const [rendaId, setRendaId] = useState("");
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [durationDays, setDurationDays] = useState("30");
  const [vacationPayReceived, setVacationPayReceived] = useState(false);
  const [vacationPayDate, setVacationPayDate] = useState("");
  const [vacationPayAmount, setVacationPayAmount] = useState("");
  const [includedInPatrimony, setIncludedInPatrimony] = useState(false);

  useEffect(() => {
    if (!rendaId && fixedIncomes[0]) setRendaId(fixedIncomes[0].id);
  }, [fixedIncomes, rendaId]);

  const selectedIncome = fixedIncomes.find((income) => income.id === rendaId) ?? null;
  const normalizedDuration = Math.min(90, Math.max(1, Number.parseInt(durationDays, 10) || 1));
  const normalizedAmount = vacationPayAmount.trim()
    ? Number(vacationPayAmount.trim().replace(",", "."))
    : null;
  const draftPlan = useMemo<VacationProjectionPlan>(() => ({
    rendaId,
    startDate,
    durationDays: normalizedDuration,
    vacationPayReceived,
    vacationPayDate: vacationPayDate || null,
    vacationPayAmount: Number.isFinite(normalizedAmount) ? normalizedAmount : null,
    includedInPatrimony,
  }), [
    durationDays,
    includedInPatrimony,
    normalizedAmount,
    rendaId,
    startDate,
    vacationPayAmount,
    vacationPayDate,
    vacationPayReceived,
  ]);
  const estimate = selectedIncome ? calculateVacationPlanEstimate(draftPlan, selectedIncome) : null;
  const projection = selectedIncome ? buildVacationPlanProjectionMonths(draftPlan, selectedIncome) : [];

  const createMutation = useMutation({
    mutationFn: (payload: CreateVacationPlanPayload) => createVacationPlan(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vacation-plans"] });
      toast({
        title: "Modo férias programado",
        description: "A renda fixa será ajustada apenas nas projeções do período.",
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível programar as férias",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVacationPlan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vacation-plans"] });
      toast({ title: "Período de férias removido" });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível remover o período",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleReceivedChange = (checked: boolean) => {
    setVacationPayReceived(checked);
    if (!checked) setIncludedInPatrimony(false);
    if (checked && !vacationPayDate) setVacationPayDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedIncome || !startDate) {
      toast({ title: "Informe a renda e a data das férias", variant: "destructive" });
      return;
    }
    if (normalizedAmount != null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) {
      toast({ title: "Informe um valor de férias válido", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      rendaId: selectedIncome.id,
      startDate,
      durationDays: normalizedDuration,
      vacationPayReceived,
      vacationPayDate: vacationPayDate || estimate?.vacationPayDate || null,
      vacationPayAmount: normalizedAmount,
      includedInPatrimony,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full rounded-xl border-sky-500/25 bg-sky-500/5 px-3 text-sky-700 shadow-sm hover:bg-sky-500/10 hover:text-sky-800 sm:h-10 sm:w-auto dark:text-sky-300"
          data-testid="button-vacation-mode"
        >
          <Umbrella className="mr-2 h-4 w-4" />
          Modo férias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Umbrella className="h-5 w-5 text-sky-600" />
            Planejar Modo férias
          </DialogTitle>
          <DialogDescription>
            Simule o adiantamento das férias e pause somente a renda fixa escolhida durante o período.
          </DialogDescription>
        </DialogHeader>

        {fixedIncomes.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
            Cadastre e ative uma renda do tipo fixa antes de usar o Modo férias.
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="vacation-income">Renda fixa que ficará pausada</Label>
                <Select value={rendaId} onValueChange={setRendaId}>
                  <SelectTrigger id="vacation-income" data-testid="select-vacation-income">
                    <SelectValue placeholder="Selecione a renda" />
                  </SelectTrigger>
                  <SelectContent>
                    {fixedIncomes.map((income) => (
                      <SelectItem key={income.id} value={income.id}>
                        {income.descricao} · {formatCurrencyBRL(Number(income.valor))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation-start">Data de saída</Label>
                <Input
                  id="vacation-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  data-testid="input-vacation-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation-days">Quantidade de dias</Label>
                <Input
                  id="vacation-days"
                  type="number"
                  min={1}
                  max={90}
                  value={durationDays}
                  onChange={(event) => setDurationDays(event.target.value)}
                  data-testid="input-vacation-days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation-payment-date">Data prevista ou recebida</Label>
                <Input
                  id="vacation-payment-date"
                  type="date"
                  value={vacationPayDate || estimate?.vacationPayDate || ""}
                  onChange={(event) => setVacationPayDate(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Por padrão, dois dias antes do início.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation-payment-amount">Valor pago ou esperado (opcional)</Label>
                <Input
                  id="vacation-payment-amount"
                  inputMode="decimal"
                  placeholder={estimate ? formatCurrencyBRL(estimate.estimatedVacationPay) : "R$ 0,00"}
                  value={vacationPayAmount}
                  onChange={(event) => setVacationPayAmount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Se ficar vazio, usa a estimativa com adicional de 1/3.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 p-3.5">
                <div>
                  <Label htmlFor="vacation-received">Valor já recebido</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Marca o adiantamento como já pago.</p>
                </div>
                <Switch id="vacation-received" checked={vacationPayReceived} onCheckedChange={handleReceivedChange} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 p-3.5">
                <div>
                  <Label htmlFor="vacation-patrimony">Já consta no patrimônio</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Evita somar o mesmo dinheiro novamente.</p>
                </div>
                <Switch
                  id="vacation-patrimony"
                  checked={includedInPatrimony}
                  disabled={!vacationPayReceived}
                  onCheckedChange={setIncludedInPatrimony}
                />
              </div>
            </div>

            {estimate ? (
              <div className="space-y-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-800 dark:text-sky-200">
                  <CalendarDays className="h-4 w-4" />
                  Resumo do período · {formatDate(startDate)} a {formatDate(estimate.endDate)}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Renda que não entra normalmente</p>
                    <p className="mt-1 font-semibold text-amber-600">{formatCurrencyBRL(estimate.suspendedIncome)}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Férias estimadas com 1/3</p>
                    <p className="mt-1 font-semibold text-emerald-600">{formatCurrencyBRL(estimate.estimatedVacationPay)}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Adiantamento que entra na projeção</p>
                    <p className="mt-1 font-semibold text-sky-600">
                      {formatCurrencyBRL(vacationPayReceived && includedInPatrimony ? 0 : estimate.projectedVacationPay)}
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Projeção financeira com divisor de 30 dias. Impostos, descontos e regras específicas da folha podem alterar o valor líquido.
                </p>
              </div>
            ) : null}

            {projection.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Impacto mês a mês</h3>
                  <p className="text-xs text-muted-foreground">Como a renda selecionada aparecerá nas projeções.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <div className="hidden grid-cols-5 gap-2 bg-muted/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Mês</span><span>Normal</span><span>Pausa</span><span>Férias</span><span>Projetado</span>
                  </div>
                  {projection.map((month) => (
                    <div key={month.monthReference} className="grid gap-1 border-t border-border/60 px-3 py-3 text-sm first:border-t-0 sm:grid-cols-5 sm:gap-2">
                      <span className="font-medium">{formatMonth(month.monthReference)}</span>
                      <span className="text-muted-foreground">{formatCurrencyBRL(month.normalIncome)}</span>
                      <span className="text-amber-600">-{formatCurrencyBRL(month.suspendedIncome)}</span>
                      <span className="text-emerald-600">+{formatCurrencyBRL(month.vacationPayIncome)}</span>
                      <span className="font-semibold">{formatCurrencyBRL(month.projectedIncome)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <Button className="w-full sm:w-auto" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Umbrella className="mr-2 h-4 w-4" />}
              Salvar planejamento
            </Button>
          </form>
        )}

        {plans.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Períodos programados</h3>
              </div>
              {plans.map((plan) => {
                const income = rendas.find((item) => item.id === plan.rendaId);
                const planEstimate = income ? calculateVacationPlanEstimate(plan, income) : null;
                return (
                  <div key={plan.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{income?.descricao ?? "Renda removida"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(plan.startDate)} · {plan.durationDays} dias
                        {planEstimate ? ` · até ${formatDate(planEstimate.endDate)}` : ""}
                      </p>
                      {plan.vacationPayReceived ? (
                        <p className="mt-1 text-xs text-emerald-600">
                          Adiantamento recebido{plan.includedInPatrimony ? " e já considerado no patrimônio" : ""}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover período de férias"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(plan.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
