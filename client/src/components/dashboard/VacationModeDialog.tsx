import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Loader2, LockKeyhole, LockKeyholeOpen, Trash2, Umbrella, WalletCards } from "lucide-react";
import type { Renda, VacationPlan } from "@shared/schema";
import {
  buildVacationPlansProjectionMonths,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  createVacationPlans,
  deleteVacationPlan,
  type CreateVacationPlansPayload,
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
  const [rendaIds, setRendaIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [durationDays, setDurationDays] = useState("30");
  const [vacationPayReceived, setVacationPayReceived] = useState(false);
  const [vacationPayDate, setVacationPayDate] = useState("");
  const [grossSalaryAmount, setGrossSalaryAmount] = useState("");
  const [vacationPayAmount, setVacationPayAmount] = useState("");
  const [vacationPayAmountLocked, setVacationPayAmountLocked] = useState(true);
  const [includedInPatrimony, setIncludedInPatrimony] = useState(false);
  const [competencyOffsets, setCompetencyOffsets] = useState<Record<string, -1 | 0>>({});

  useEffect(() => {
    setRendaIds((currentIds) => {
      const availableIds = new Set(fixedIncomes.map((income) => income.id));
      const validIds = currentIds.filter((id) => availableIds.has(id));
      if (validIds.length > 0) return validIds;
      return fixedIncomes[0] ? [fixedIncomes[0].id] : [];
    });
  }, [fixedIncomes]);

  useEffect(() => {
    setCompetencyOffsets((current) => {
      const next: Record<string, -1 | 0> = {};
      fixedIncomes.forEach((income) => {
        next[income.id] = current[income.id] ?? (income.diaRecebimento <= 10 ? -1 : 0);
      });
      return next;
    });
  }, [fixedIncomes]);

  useEffect(() => {
    if (!vacationPayReceived) setVacationPayDate("");
  }, [startDate, vacationPayReceived]);

  const selectedIncomes = useMemo(
    () => fixedIncomes.filter((income) => rendaIds.includes(income.id)),
    [fixedIncomes, rendaIds],
  );
  const combinedIncome = useMemo(() => {
    if (selectedIncomes.length === 0) return null;
    return {
      id: "selected-vacation-incomes",
      descricao: selectedIncomes.map((income) => income.descricao).join(" + "),
      valor: selectedIncomes.reduce((sum, income) => sum + Number(income.valor), 0).toFixed(2),
      ativo: true,
    };
  }, [selectedIncomes]);
  const normalizedDuration = Math.min(90, Math.max(1, Number.parseInt(durationDays, 10) || 1));
  const normalizedGrossSalary = grossSalaryAmount.trim()
    ? Number(grossSalaryAmount.trim().replace(",", "."))
    : null;
  const normalizedAmount = !vacationPayAmountLocked && vacationPayAmount.trim()
    ? Number(vacationPayAmount.trim().replace(",", "."))
    : null;
  const draftPlan = useMemo<VacationProjectionPlan>(() => ({
    rendaId: combinedIncome?.id ?? "",
    startDate,
    durationDays: normalizedDuration,
    vacationPayReceived,
    vacationPayDate: vacationPayDate || null,
    vacationPayAmount: !vacationPayAmountLocked && Number.isFinite(normalizedAmount) ? normalizedAmount : null,
    grossSalaryAmount: Number.isFinite(normalizedGrossSalary) ? normalizedGrossSalary : null,
    incomeCompetencyOffsetMonths: 0,
    includedInPatrimony,
  }), [
    durationDays,
    includedInPatrimony,
    combinedIncome,
    normalizedGrossSalary,
    normalizedAmount,
    startDate,
    vacationPayAmount,
    vacationPayAmountLocked,
    vacationPayDate,
    vacationPayReceived,
  ]);
  const estimate = combinedIncome && normalizedGrossSalary != null && normalizedGrossSalary > 0
    ? calculateVacationPlanEstimate(draftPlan, combinedIncome)
    : null;
  const draftPlans = useMemo<VacationProjectionPlan[]>(() => {
    if (!estimate || selectedIncomes.length === 0) return [];
    const totalIncome = selectedIncomes.reduce((sum, income) => sum + Math.max(0, Number(income.valor) || 0), 0);
    let remainingGrossCents = Math.round(estimate.grossSalaryAmount * 100);
    const manualPayCents = !vacationPayAmountLocked && normalizedAmount != null && Number.isFinite(normalizedAmount)
      ? Math.round(normalizedAmount * 100)
      : null;
    let remainingPayCents = manualPayCents;

    return selectedIncomes.map((income, index) => {
      const weight = totalIncome > 0 ? Math.max(0, Number(income.valor) || 0) / totalIncome : 1 / selectedIncomes.length;
      const grossCents = index === selectedIncomes.length - 1
        ? remainingGrossCents
        : Math.min(remainingGrossCents, Math.round(estimate.grossSalaryAmount * 100 * weight));
      remainingGrossCents -= grossCents;
      const payCents = manualPayCents == null
        ? null
        : index === selectedIncomes.length - 1
          ? remainingPayCents
          : Math.min(remainingPayCents ?? 0, Math.round(manualPayCents * weight));
      if (remainingPayCents != null && payCents != null) remainingPayCents -= payCents;

      return {
        ...draftPlan,
        rendaId: income.id,
        grossSalaryAmount: grossCents / 100,
        vacationPayAmount: payCents == null ? null : payCents / 100,
        incomeCompetencyOffsetMonths: competencyOffsets[income.id] ?? 0,
      };
    });
  }, [competencyOffsets, draftPlan, estimate, normalizedAmount, selectedIncomes, vacationPayAmountLocked]);
  const projection = draftPlans.length > 0
    ? buildVacationPlansProjectionMonths(draftPlans, selectedIncomes)
    : [];
  const suspendedCashflow = projection.reduce((sum, month) => sum + month.suspendedIncome, 0);

  const createMutation = useMutation({
    mutationFn: (payload: CreateVacationPlansPayload) => createVacationPlans(payload),
    onSuccess: async (createdPlans) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vacation-plans"] });
      toast({
        title: "Modo férias programado",
        description: createdPlans.length === 1
          ? "A renda fixa será ajustada nas projeções do período."
          : `${createdPlans.length} rendas fixas serão ajustadas nas projeções do período.`,
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
    if (!checked) {
      setIncludedInPatrimony(false);
      setVacationPayDate("");
    }
    if (checked && !vacationPayDate) setVacationPayDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleVacationPayAmountLock = () => {
    if (vacationPayAmountLocked) {
      setVacationPayAmount(estimate ? estimate.estimatedVacationPay.toFixed(2).replace(".", ",") : "");
      setVacationPayAmountLocked(false);
      return;
    }

    setVacationPayAmount("");
    setVacationPayAmountLocked(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (selectedIncomes.length === 0 || !startDate) {
      toast({ title: "Selecione as rendas e informe a data das férias", variant: "destructive" });
      return;
    }
    if (normalizedAmount != null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) {
      toast({ title: "Informe um valor de férias válido", variant: "destructive" });
      return;
    }
    if (normalizedGrossSalary == null || !Number.isFinite(normalizedGrossSalary) || normalizedGrossSalary <= 0) {
      toast({ title: "Informe o salário bruto contratual", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      rendaIds: selectedIncomes.map((income) => income.id),
      startDate,
      durationDays: normalizedDuration,
      vacationPayReceived,
      vacationPayDate: vacationPayDate || estimate?.vacationPayDate || null,
      vacationPayAmount: normalizedAmount,
      grossSalaryAmount: normalizedGrossSalary,
      competencyOffsetMonthsByIncomeId: Object.fromEntries(
        selectedIncomes.map((income) => [income.id, competencyOffsets[income.id] ?? 0]),
      ),
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
            Separe o cálculo trabalhista bruto dos depósitos líquidos que entram na sua conta.
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
                <div>
                  <Label>Depósitos salariais que podem ficar pausados</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Selecione as parcelas do mesmo salário e informe a competência de cada depósito.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2" data-testid="vacation-income-options">
                  {fixedIncomes.map((income) => {
                    const checked = rendaIds.includes(income.id);
                    const checkboxId = `vacation-income-${income.id}`;
                    return (
                      <div
                        key={income.id}
                        className={`space-y-3 rounded-xl border p-3 transition-colors ${checked ? "border-sky-500/40 bg-sky-500/5" : "border-border/70 hover:bg-muted/45"}`}
                      >
                        <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3">
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              setRendaIds((currentIds) => nextChecked === true
                                ? (currentIds.includes(income.id) ? currentIds : [...currentIds, income.id])
                                : currentIds.filter((id) => id !== income.id));
                            }}
                            data-testid={`checkbox-vacation-income-${income.id}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{income.descricao}</span>
                            <span className="block text-xs text-muted-foreground">
                              {formatCurrencyBRL(Number(income.valor))} · dia {income.diaRecebimento}
                            </span>
                          </span>
                        </label>
                        {checked ? (
                          <div className="space-y-1.5 pl-7">
                            <Label htmlFor={`vacation-competency-${income.id}`} className="text-xs">Este depósito paga qual mês?</Label>
                            <select
                              id={`vacation-competency-${income.id}`}
                              value={competencyOffsets[income.id] ?? 0}
                              onChange={(event) => setCompetencyOffsets((current) => ({
                                ...current,
                                [income.id]: Number(event.target.value) === -1 ? -1 : 0,
                              }))}
                              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs"
                              data-testid={`select-vacation-competency-${income.id}`}
                            >
                              <option value={-1}>Saldo do mês anterior</option>
                              <option value={0}>Adiantamento do mesmo mês</option>
                            </select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {selectedIncomes.length > 1 ? (
                  <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                    Total mensal selecionado: {formatCurrencyBRL(Number(combinedIncome?.valor ?? 0))}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="vacation-gross-salary">Salário bruto contratual</Label>
                <Input
                  id="vacation-gross-salary"
                  inputMode="decimal"
                  placeholder="Ex.: 3200,00"
                  value={grossSalaryAmount}
                  onChange={(event) => setGrossSalaryAmount(event.target.value)}
                  data-testid="input-vacation-gross-salary"
                />
                <p className="text-xs text-muted-foreground">
                  Usado somente no cálculo trabalhista. Os depósitos selecionados acima continuam definindo quando o dinheiro entra na conta.
                </p>
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
                <Label htmlFor="vacation-payment-amount">Valor líquido pago ou esperado (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="vacation-payment-amount"
                    inputMode="decimal"
                    readOnly={vacationPayAmountLocked}
                    value={vacationPayAmountLocked
                      ? (estimate?.estimatedVacationPay.toFixed(2).replace(".", ",") ?? "")
                      : vacationPayAmount}
                    onChange={(event) => setVacationPayAmount(event.target.value)}
                    className={vacationPayAmountLocked ? "bg-muted/45 text-muted-foreground" : ""}
                    data-testid="input-vacation-payment-amount"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label={vacationPayAmountLocked
                      ? "Desbloquear valor calculado"
                      : "Usar novamente o valor automático"}
                    title={vacationPayAmountLocked
                      ? "Desbloquear para alterar o valor"
                      : "Bloquear e voltar ao cálculo automático"}
                    onClick={handleVacationPayAmountLock}
                    data-testid="button-vacation-payment-amount-lock"
                  >
                    {vacationPayAmountLocked
                      ? <LockKeyhole className="h-4 w-4" />
                      : <LockKeyholeOpen className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {vacationPayAmountLocked
                    ? "Mostra as férias brutas. Abra o cadeado para informar o valor líquido que realmente entrará na conta."
                    : selectedIncomes.length > 1
                    ? "Se informado, será dividido proporcionalmente entre as rendas selecionadas."
                    : "Valor manual ativo. Feche o cadeado para voltar ao cálculo automático."}
                </p>
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Base salarial bruta</p>
                    <p className="mt-1 font-semibold">{formatCurrencyBRL(estimate.grossSalaryAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">1/3 constitucional</p>
                    <p className="mt-1 font-semibold text-emerald-600">{formatCurrencyBRL(estimate.constitutionalThird)}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Férias brutas calculadas</p>
                    <p className="mt-1 font-semibold text-emerald-600">{formatCurrencyBRL(estimate.estimatedVacationPay)}</p>
                  </div>
                  <div className="rounded-xl bg-background/80 p-3">
                    <p className="text-xs text-muted-foreground">Valor que entra na projeção</p>
                    <p className="mt-1 font-semibold text-sky-600">
                      {formatCurrencyBRL(vacationPayReceived && includedInPatrimony ? 0 : estimate.projectedVacationPay)}
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Depósitos líquidos pausados por competência: <strong>{formatCurrencyBRL(suspendedCashflow)}</strong>. Não há rateio diário. INSS e IRRF não são estimados automaticamente; para maior fidelidade, desbloqueie o valor e informe o líquido recebido. O 13º deve ser lançado separadamente.
                </p>
              </div>
            ) : null}

            {projection.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Impacto mês a mês</h3>
                  <p className="text-xs text-muted-foreground">Cada depósito é mantido ou pausado inteiro conforme a competência salarial.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <div className="hidden grid-cols-5 gap-2 bg-muted/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Mês</span><span>Normal</span><span>Depósito pausado</span><span>Férias</span><span>Projetado</span>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        Competência {plan.incomeCompetencyOffsetMonths === -1 ? "do mês anterior" : "do próprio mês"}
                        {plan.grossSalaryAmount ? ` · base bruta vinculada ${formatCurrencyBRL(Number(plan.grossSalaryAmount))}` : " · base bruta não informada"}
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
