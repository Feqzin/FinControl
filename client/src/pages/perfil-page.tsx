import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  getUserSubscriptionLimits,
  getUserSubscriptionTier,
  useAuth,
} from "@/hooks/use-auth";
import { useSubscriptionUsage } from "@/hooks/useSubscriptionUsage";
import { createCloudBackup, listCloudBackups, restoreCloudBackup, type CloudBackupItem } from "@/services/api/cloud-backups";
import {
  cancelMercadoPagoSubscription,
  createMercadoPagoCheckout,
  getBillingStatus,
  startPremiumTrial,
  type BillingStatusResponse,
} from "@/services/api/billing";
import {
  User, Download, Shield, Database, LogOut, CheckCircle, HelpCircle, Upload, Cloud
} from "lucide-react";
import { TourRestartButton } from "@/components/onboarding-tour";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Meta,
  ParcelaCompra,
  Pessoa,
  PessoaSaldoMovimentacao,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";
import { calculateRemaining, type SubscriptionAccess, type SubscriptionLimitValue } from "@shared/subscription";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateTimeBR(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatPlanLimit(limit: SubscriptionLimitValue): string {
  return limit === null ? "Ilimitado" : String(limit);
}

function formatRemainingLimit(limit: SubscriptionLimitValue): string {
  if (limit === null) return "Ilimitado";
  return String(Math.max(0, limit));
}

function resolveBillingStatusUi(
  status: BillingStatusResponse | undefined,
  subscriptionAccess?: SubscriptionAccess
): {
  title: string;
  description: string;
  tone: "default" | "secondary" | "destructive";
} {
if (!status) {
  return {
    title:
      subscriptionAccess?.subscriptionTier === "premium"
        ? "Plano Premium ativo"
        : "Plano Free ativo",
    description:
      subscriptionAccess?.subscriptionTier === "premium"
        ? "Assinatura premium ativa no momento."
        : "Sem assinatura ativa no momento.",
    tone: "secondary",
  };
}

  if (status.billingStatus === "trialing") {
    const trialEndsAtLabel = status.trial.endsAt ? formatDateTimeBR(status.trial.endsAt) : null;
    if (status.subscription?.status === "pending") {
      return {
        title: "Premium em teste + pagamento pendente",
        description: trialEndsAtLabel
          ? `Seu teste gratis esta ativo ate ${trialEndsAtLabel}. Conclua o pagamento para manter o Premium.`
          : "Seu teste gratis esta ativo. Conclua o pagamento para manter o Premium.",
        tone: "default",
      };
    }

    return {
      title: "Premium em teste",
      description: trialEndsAtLabel
        ? `Teste gratis ativo ate ${trialEndsAtLabel}.`
        : "Teste gratis ativo.",
      tone: "default",
    };
  }

  switch (status.billingStatus) {
    case "active":
      return {
        title: "Premium ativo",
        description: "Assinatura ativa e recursos premium liberados.",
        tone: "default",
      };
    case "pending":
      return {
        title: "Pagamento pendente",
        description: "Aguardando confirmacao do Mercado Pago para liberar o Premium.",
        tone: "secondary",
      };
    case "paused":
      return {
        title: "Assinatura pausada",
        description: "A assinatura esta pausada e o plano atual permanece Free.",
        tone: "destructive",
      };
    case "canceled":
      return {
        title: "Assinatura cancelada",
        description: "Assinatura encerrada. Voce esta no plano Free.",
        tone: "destructive",
      };
    case "expired":
      return {
        title: "Assinatura expirada",
        description: "A assinatura expirou e o plano atual e Free.",
        tone: "destructive",
      };
    case "rejected":
      return {
        title: "Assinatura rejeitada",
        description: "Pagamento rejeitado. Continue no plano Free.",
        tone: "destructive",
      };
    case "no_subscription":
    default:
      return {
        title: "Plano Free ativo",
        description: "Sem assinatura ativa no momento.",
        tone: "secondary",
      };
  }
}

type ImportBackupResponse = {
  modoImportacao?: "merge" | "replace";
  pessoasImportadas: number;
  cartoesImportados: number;
  dividasImportadas: number;
  comprasImportadas: number;
  servicosImportados: number;
  servicoPessoasImportados?: number;
  servicoPagamentosImportados?: number;
  saldoMovimentacoesImportadas?: number;
  metasImportadas: number;
};

function parseApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const rawMessage = error.message ?? "";
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
        return parsed.message;
      }
    } catch {
      // Mantem fallback padrao.
    }
  }

  const withoutStatusPrefix = rawMessage.replace(/^\d{3}:\s*/, "").trim();
  if (withoutStatusPrefix.length > 0 && !/^internal server error$/i.test(withoutStatusPrefix)) {
    return withoutStatusPrefix;
  }

  return fallbackMessage;
}

type ImportMode = "merge" | "replace";

export default function PerfilPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [nomeCompleto, setNomeCompleto] = useState(user?.nomeCompleto || "");
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [modoImportacao, setModoImportacao] = useState<ImportMode>("merge");
  const [modoRestauracaoCloud, setModoRestauracaoCloud] = useState<ImportMode>("merge");
  const [backupRestaurandoId, setBackupRestaurandoId] = useState<string | null>(null);
  const [perfilTab, setPerfilTab] = useState<"conta" | "planos" | "backup" | "ajuda">("planos");
  const inputImportacaoRef = useRef<HTMLInputElement | null>(null);
  const planoAtualAutenticado = getUserSubscriptionTier(user);
  const limitsFromAuth = getUserSubscriptionLimits(user);
  const usageQuery = useSubscriptionUsage();
  const billingStatusQuery = useQuery({
    queryKey: ["/api/billing/status"],
    queryFn: getBillingStatus,
    enabled: Boolean(user),
    retry: false,
  });
  const billingStatus = billingStatusQuery.data;
  const planoEfetivo = billingStatus?.effectiveTier ?? planoAtualAutenticado;
  const premiumAtivoNaUi = planoEfetivo === "premium";
  const backupNuvemLiberado = billingStatus?.features.cloudBackup ?? premiumAtivoNaUi;
  const billingLimits = billingStatus?.limits ?? limitsFromAuth;
  const canStartTrial = billingStatus?.canStartTrial ?? false;
  const canSubscribe = billingStatus ? billingStatus.canSubscribe : planoEfetivo === "free";
  const canCancelSubscription = billingStatus?.canCancel ?? false;

  useEffect(() => {
    if (!user || !billingStatus) return;
    if (billingStatus.effectiveTier === planoAtualAutenticado) return;

    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
  }, [billingStatus, planoAtualAutenticado, user]);

  const { data: dividas = [] } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: pessoaSaldoMovimentacoes = [] } = useQuery<PessoaSaldoMovimentacao[]>({
    queryKey: ["/api/pessoas/saldo-movimentacoes"],
  });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: parcelasCompra = [] } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: metas = [] } = useQuery<Meta[]>({ queryKey: ["/api/metas"] });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/auth/profile", { nomeCompleto });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Perfil atualizado" });
    },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const invalidateFinancialQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
    queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
    queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/metas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial/score"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial/insights"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial/summary"] });
  };

  const cloudBackupsQuery = useQuery<CloudBackupItem[]>({
    queryKey: ["/api/backups/cloud"],
    queryFn: () => listCloudBackups(30),
    enabled: backupNuvemLiberado,
    retry: false,
  });

  const createCloudBackupMutation = useMutation({
    mutationFn: createCloudBackup,
    onSuccess: (backup) => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups/cloud"] });
      toast({
        title: "Backup na nuvem salvo",
        description: `${backup.fileName} · ${formatBytes(backup.sizeBytes)}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar backup na nuvem",
        description: parseApiErrorMessage(error, "Falha ao salvar backup na nuvem."),
        variant: "destructive",
      });
    },
  });

  const restoreCloudBackupMutation = useMutation({
    mutationFn: async ({
      backupId,
      modo,
    }: {
      backupId: string;
      modo: ImportMode;
    }) => restoreCloudBackup(backupId, modo),
    onMutate: ({ backupId }) => {
      setBackupRestaurandoId(backupId);
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups/cloud"] });
      invalidateFinancialQueries();
      toast({
        title: "Backup restaurado da nuvem",
        description: `Modo: ${resultado.modoImportacao === "replace" ? "Substituir dados atuais" : "Mesclar com dados atuais"}. Pessoas: ${resultado.pessoasImportadas}, Cartoes: ${resultado.cartoesImportados}, Dividas: ${resultado.dividasImportadas}, Compras: ${resultado.comprasImportadas}, Servicos: ${resultado.servicosImportados}, Vinculos de servico: ${resultado.servicoPessoasImportados ?? 0}, Pagamentos de servico: ${resultado.servicoPagamentosImportados ?? 0}, Movimentações de saldo: ${resultado.saldoMovimentacoesImportados ?? 0}, Metas: ${resultado.metasImportadas}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao restaurar backup da nuvem",
        description: parseApiErrorMessage(error, "Falha ao restaurar backup da nuvem."),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setBackupRestaurandoId(null);
    },
  });

  const importBackup = useMutation({
    mutationFn: async ({
      arquivo,
      modo,
    }: {
      arquivo: File;
      modo: ImportMode;
    }): Promise<ImportBackupResponse> => {
      const texto = await arquivo.text();
      let backup: unknown;

      try {
        backup = JSON.parse(texto);
      } catch {
        throw new Error("Arquivo JSON invalido. Verifique o arquivo e tente novamente.");
      }

      const res = await apiRequest("POST", "/api/import", { modo, backup });
      return res.json();
    },
    onSuccess: (resultado) => {
      setArquivoImportacao(null);
      if (inputImportacaoRef.current) {
        inputImportacaoRef.current.value = "";
      }

      invalidateFinancialQueries();

      toast({
        title: "Importacao concluida",
        description: `Modo: ${(resultado.modoImportacao ?? modoImportacao) === "replace" ? "Substituir dados atuais" : "Mesclar com dados atuais"}. Pessoas: ${resultado.pessoasImportadas}, Cartoes: ${resultado.cartoesImportados}, Dividas: ${resultado.dividasImportadas}, Compras: ${resultado.comprasImportadas}, Servicos: ${resultado.servicosImportados}, Vinculos de servico: ${resultado.servicoPessoasImportados ?? 0}, Pagamentos de servico: ${resultado.servicoPagamentosImportados ?? 0}, Movimentações de saldo: ${resultado.saldoMovimentacoesImportadas ?? 0}, Metas: ${resultado.metasImportadas}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao importar backup",
        description: parseApiErrorMessage(error, "Falha ao importar backup. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  const startTrialMutation = useMutation({
    mutationFn: startPremiumTrial,
    onSuccess: async (status) => {
      queryClient.setQueryData(["/api/billing/status"], status);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/billing/status"],
          exact: true,
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/auth/me"],
          exact: true,
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/subscription/usage"],
          exact: true,
          refetchType: "all",
        }),
      ]);

      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["/api/billing/status"],
          exact: true,
          type: "all",
        }),
        queryClient.refetchQueries({
          queryKey: ["/api/auth/me"],
          exact: true,
          type: "all",
        }),
        queryClient.refetchQueries({
          queryKey: ["/api/subscription/usage"],
          exact: true,
          type: "all",
        }),
      ]);

      toast({
        title: "Teste grátis iniciado",
        description: status.trial.endsAt
          ? `Premium liberado por 7 dias. Termina em ${formatDateTimeBR(status.trial.endsAt)}.`
          : "Premium liberado por 7 dias.",
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível iniciar o teste grátis",
        description: parseApiErrorMessage(error, "Falha ao iniciar teste grátis."),
        variant: "destructive",
      });
    },
  });

  const createBillingCheckoutMutation = useMutation({
    mutationFn: createMercadoPagoCheckout,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
      if (typeof window !== "undefined") {
        window.location.assign(result.checkoutUrl);
      }
    },
    onError: (error) => {
      toast({
        title: "Erro ao iniciar assinatura",
        description: parseApiErrorMessage(error, "Falha ao iniciar assinatura premium."),
        variant: "destructive",
      });
    },
  });

  const cancelBillingSubscriptionMutation = useMutation({
    mutationFn: cancelMercadoPagoSubscription,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
      toast({
        title: "Assinatura cancelada",
        description: result.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao cancelar assinatura",
        description: parseApiErrorMessage(error, "Falha ao cancelar assinatura."),
        variant: "destructive",
      });
    },
  });

  const billingStatusUi = resolveBillingStatusUi(billingStatus, {
    subscriptionTier: planoEfetivo,
  } as SubscriptionAccess);

  const handleCancelSubscription = () => {
    if (!canCancelSubscription || cancelBillingSubscriptionMutation.isPending) return;
    const confirmed = window.confirm(
      "Tem certeza que deseja cancelar sua assinatura Premium?\n\n" +
      "Regra atual: o cancelamento rebaixa o plano imediatamente para Free.",
    );
    if (!confirmed) return;
    cancelBillingSubscriptionMutation.mutate();
  };

  const exportarDados = () => {
    const data = {
      exportadoEm: new Date().toISOString(),
      usuario: user?.username,
      pessoas,
      dividas,
      cartoes,
      compras,
      parcelasCompra,
      servicos,
      servicoPessoas,
      servicoPagamentos,
      pessoaSaldoMovimentacoes,
      metas,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fincontrol-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup exportado com sucesso" });
  };

  const importarDados = () => {
    if (!arquivoImportacao) {
      toast({
        title: "Selecione um arquivo",
        description: "Escolha um arquivo .json de backup para importar.",
        variant: "destructive",
      });
      return;
    }

    if (modoImportacao === "replace") {
      const confirmado = window.confirm(
        "Modo substituir: todos os seus dados financeiros atuais serao apagados e substituidos pelo backup. Sua conta/login permanecerao intactos. Deseja continuar?",
      );
      if (!confirmado) {
        return;
      }

      const confirmacaoForte = window.prompt(
        "Para confirmar a substituicao, digite SUBSTITUIR:",
      );
      if (confirmacaoForte !== "SUBSTITUIR") {
        toast({
          title: "Substituicao cancelada",
          description: "Confirmacao nao realizada. Nenhum dado foi alterado.",
        });
        return;
      }
    } else {
      const confirmed = window.confirm(
        "Importar novamente pode duplicar dados. Deseja continuar com a importação?",
      );
      if (!confirmed) {
        return;
      }
    }

    importBackup.mutate({ arquivo: arquivoImportacao, modo: modoImportacao });
  };

  const restaurarBackupNuvem = (backup: CloudBackupItem) => {
    if (modoRestauracaoCloud === "replace") {
      const confirmado = window.confirm(
        "Modo substituir: todos os seus dados financeiros atuais serao apagados e substituidos pelo backup da nuvem. Sua conta/login permanecerao intactos. Deseja continuar?",
      );
      if (!confirmado) {
        return;
      }

      const confirmacaoForte = window.prompt(
        "Para confirmar a restauracao com substituicao, digite SUBSTITUIR:",
      );
      if (confirmacaoForte !== "SUBSTITUIR") {
        toast({
          title: "Restauracao cancelada",
          description: "Confirmacao nao realizada. Nenhum dado foi alterado.",
        });
        return;
      }
    } else {
      const confirmed = window.confirm(
        "Restaurar em modo mesclar pode adicionar dados sem apagar os atuais. Deseja continuar?",
      );
      if (!confirmed) {
        return;
      }
    }

    restoreCloudBackupMutation.mutate({
      backupId: backup.id,
      modo: modoRestauracaoCloud,
    });
  };

  const totalReceber = dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const totalPagar = dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const usageSnapshot = usageQuery.data ?? {
    subscriptionTier: planoEfetivo,
    limits: billingLimits,
    usage: {
      cartoes: cartoes.length,
      pessoas: pessoas.length,
      servicos: servicos.length,
      metas: metas.length,
    },
    remaining: {
      cartoes: calculateRemaining(billingLimits.maxCartoes, cartoes.length),
      pessoas: calculateRemaining(billingLimits.maxPessoas, pessoas.length),
      servicos: calculateRemaining(billingLimits.maxServicos, servicos.length),
      metas: calculateRemaining(billingLimits.maxMetas, metas.length),
    },
  };
  const usageComLimitesAtuais = {
    ...usageSnapshot,
    subscriptionTier: planoEfetivo,
    limits: billingLimits,
    remaining: {
      cartoes: calculateRemaining(billingLimits.maxCartoes, usageSnapshot.usage.cartoes),
      pessoas: calculateRemaining(billingLimits.maxPessoas, usageSnapshot.usage.pessoas),
      servicos: calculateRemaining(billingLimits.maxServicos, usageSnapshot.usage.servicos),
      metas: calculateRemaining(billingLimits.maxMetas, usageSnapshot.usage.metas),
    },
  };

  return (
    <div className="app-page-shell app-section-stack mx-auto max-w-2xl" data-testid="perfil-page">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground sm:text-base">Gerencie sua conta e exporte seus dados</p>
      </div>

      <Tabs value={perfilTab} onValueChange={(value) => setPerfilTab(value as typeof perfilTab)}>
        <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
          <TabsTrigger value="planos" data-testid="tab-perfil-planos">Planos</TabsTrigger>
          <TabsTrigger value="backup" data-testid="tab-perfil-backup">Backup</TabsTrigger>
          <TabsTrigger value="conta" data-testid="tab-perfil-conta">Conta</TabsTrigger>
          <TabsTrigger value="ajuda" data-testid="tab-perfil-ajuda">Ajuda</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className={perfilTab === "conta" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Informacoes pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-2xl flex-shrink-0">
              {(user?.nomeCompleto || user?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.nomeCompleto || user?.username}</p>
              <p className="text-sm text-muted-foreground">{user?.username}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                data-testid="input-nome-completo"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input value={user?.username || ""} disabled />
            </div>
          </div>
          <Button
            onClick={() => updateProfile.mutate()}
            disabled={updateProfile.isPending}
            data-testid="button-save-profile"
          >
            {updateProfile.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        </CardContent>
      </Card>

      <Card className={perfilTab === "conta" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Status da conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Dados isolados — apenas voce acessa sua conta</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Senha protegida com criptografia segura</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Sessao segura com cookie httpOnly</span>
            </div>
            <div className="fintech-surface-subtle flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-medium">Plano atual</p>
                <p className="text-xs text-muted-foreground">
                  {premiumAtivoNaUi
                    ? "Recursos premium liberados para sua conta."
                    : "Plano free ativo. Recursos premium aparecem bloqueados."}
                </p>
              </div>
              <Badge variant={premiumAtivoNaUi ? "default" : "secondary"}>
                {premiumAtivoNaUi ? "Premium" : "Free"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={perfilTab === "planos" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Planos e benefícios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="fintech-surface-subtle flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium">{billingStatusUi.title}</p>
              <p className="text-xs text-muted-foreground">{billingStatusUi.description}</p>
            </div>
            <Badge variant={billingStatusUi.tone}>
              {premiumAtivoNaUi ? "Premium" : "Free"}
            </Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Uso atual do plano</p>
            <div className="fintech-grid-fluid-260">
              <div className="fintech-stat-card">
                <p className="text-xs text-muted-foreground">Cartões</p>
                <p className="text-lg font-semibold">
                  {usageComLimitesAtuais.usage.cartoes} / {formatPlanLimit(usageComLimitesAtuais.limits.maxCartoes)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Restante: {formatRemainingLimit(usageComLimitesAtuais.remaining.cartoes)}
                </p>
              </div>
              <div className="fintech-stat-card">
                <p className="text-xs text-muted-foreground">Pessoas</p>
                <p className="text-lg font-semibold">
                  {usageComLimitesAtuais.usage.pessoas} / {formatPlanLimit(usageComLimitesAtuais.limits.maxPessoas)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Restante: {formatRemainingLimit(usageComLimitesAtuais.remaining.pessoas)}
                </p>
              </div>
              <div className="fintech-stat-card">
                <p className="text-xs text-muted-foreground">Serviços</p>
                <p className="text-lg font-semibold">
                  {usageComLimitesAtuais.usage.servicos} / {formatPlanLimit(usageComLimitesAtuais.limits.maxServicos)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Restante: {formatRemainingLimit(usageComLimitesAtuais.remaining.servicos)}
                </p>
              </div>
            </div>
            {usageQuery.isError && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                Não foi possível atualizar o uso do plano agora. Exibindo contagem local como fallback.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="fintech-surface-subtle p-3">
              <p className="text-sm font-semibold mb-2">Plano Free</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>Dashboard financeiro básico</li>
                <li>Pessoas até 20</li>
                <li>Cartões até 4</li>
                <li>Serviços até 10</li>
                <li>Export/import local JSON</li>
                <li>Saldo por pessoa e abatimentos</li>
              </ul>
            </div>
            <div className="fintech-surface-subtle border-primary/25 bg-primary/5 p-3">
              <p className="text-sm font-semibold mb-2">Plano Premium</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>Backup na nuvem</li>
                <li>Restauração na nuvem</li>
                <li>Pessoas ilimitadas</li>
                <li>Cartões ilimitados</li>
                <li>Serviços ilimitados</li>
                <li>Relatórios avançados</li>
                <li>Previsão financeira</li>
                <li>Importação inteligente</li>
                <li>Automações futuras</li>
              </ul>
            </div>
          </div>

          {!premiumAtivoNaUi && canStartTrial && (
            <Button
              className="w-full touch-feedback"
              variant="secondary"
              onClick={() => startTrialMutation.mutate()}
              data-testid="button-start-trial"
              disabled={startTrialMutation.isPending}
            >
              {startTrialMutation.isPending
                ? "Iniciando teste grátis..."
                : "Testar Premium grátis por 7 dias"}
            </Button>
          )}

          {!premiumAtivoNaUi && canSubscribe && (
            <Button
              className="w-full touch-feedback"
              onClick={() => createBillingCheckoutMutation.mutate()}
              data-testid="button-upgrade-premium"
              disabled={createBillingCheckoutMutation.isPending}
            >
              {createBillingCheckoutMutation.isPending
                ? "Redirecionando..."
                : billingStatus?.billingStatus === "pending"
                  ? "Continuar pagamento"
                  : "Assinar Premium"}
            </Button>
          )}

          {canCancelSubscription && (
            <Button
              type="button"
              variant="outline"
              className="w-full touch-feedback"
              onClick={handleCancelSubscription}
              disabled={cancelBillingSubscriptionMutation.isPending}
              data-testid="button-cancel-premium"
            >
              {cancelBillingSubscriptionMutation.isPending ? "Cancelando assinatura..." : "Cancelar assinatura"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className={perfilTab === "conta" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> Resumo dos dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Pessoas", value: pessoas.length },
              { label: "Dividas", value: dividas.length },
              { label: "Cartoes", value: cartoes.length },
              { label: "Servicos", value: servicos.length },
              { label: "Metas", value: metas.length },
              { label: "Compras", value: compras.length },
              { label: "Mov. saldo", value: pessoaSaldoMovimentacoes.length },
            ].map(({ label, value }) => (
              <div key={label} className="fintech-stat-card text-center">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="fintech-surface-subtle border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className="font-bold text-emerald-600">{formatCurrency(totalReceber)}</p>
            </div>
            <div className="fintech-surface-subtle border-red-500/20 bg-red-500/5 p-3">
              <p className="text-xs text-muted-foreground">A pagar</p>
              <p className="font-bold text-red-600">{formatCurrency(totalPagar)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={perfilTab === "backup" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Backup de dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Backup local em JSON continua disponivel para todos os planos.
          </p>
          <Button
            variant="outline"
            onClick={exportarDados}
            data-testid="button-export"
            className="w-full touch-feedback"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar dados (JSON)
          </Button>
          <div className="fintech-surface-subtle space-y-3 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium">
                  Backup na nuvem com proteção avançada dos seus dados (Premium)
                </p>
              </div>
              <Badge variant={backupNuvemLiberado ? "default" : "secondary"}>
                {backupNuvemLiberado ? "Premium ativo" : "Premium"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {backupNuvemLiberado
                ? "Seu plano premium permite salvar e restaurar backups na nuvem privada."
                : "Seu plano free nao inclui backup na nuvem. Upgrade para Premium liberara esse recurso."}
            </p>
            <Button
              variant="outline"
              className="w-full touch-feedback"
              onClick={() => createCloudBackupMutation.mutate()}
              disabled={!backupNuvemLiberado || createCloudBackupMutation.isPending}
              data-testid="button-cloud-backup-premium"
            >
              {backupNuvemLiberado
                ? (createCloudBackupMutation.isPending ? "Salvando backup..." : "Salvar backup na nuvem")
                : "Disponível no plano Premium"}
            </Button>
            {backupNuvemLiberado && (
              <div className="fintech-surface-subtle space-y-2 p-3">
                <div className="space-y-2">
                  <Label htmlFor="modo-restauracao-cloud">Modo de restauracao da nuvem</Label>
                  <select
                    id="modo-restauracao-cloud"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={modoRestauracaoCloud}
                    onChange={(event) => setModoRestauracaoCloud(event.target.value as ImportMode)}
                    disabled={restoreCloudBackupMutation.isPending}
                    data-testid="select-cloud-restore-mode"
                  >
                    <option value="merge">Mesclar com dados atuais (recomendado)</option>
                    <option value="replace">Substituir dados atuais pelo backup</option>
                  </select>
                  {modoRestauracaoCloud === "replace" ? (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                      Modo substituir: os dados financeiros atuais serao apagados antes da restauracao.
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                      Modo mesclar: pode manter dados atuais e adicionar registros do backup.
                    </p>
                  )}
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Backups salvos na nuvem
                </p>
                {cloudBackupsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando backups...</p>
                ) : cloudBackupsQuery.isError ? (
                  <p className="text-sm text-red-700">
                    Nao foi possivel carregar backups na nuvem agora.
                  </p>
                ) : (cloudBackupsQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum backup na nuvem salvo ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cloudBackupsQuery.data?.map((backup) => (
                      <div
                        key={backup.id}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{backup.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTimeBR(backup.createdAt)} · {formatBytes(backup.sizeBytes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={backup.status === "completed" ? "default" : "destructive"}>
                            {backup.status}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => restaurarBackupNuvem(backup)}
                            disabled={restoreCloudBackupMutation.isPending}
                            data-testid={`button-cloud-restore-${backup.id}`}
                          >
                            {restoreCloudBackupMutation.isPending && backupRestaurandoId === backup.id
                              ? "Restaurando..."
                              : "Restaurar"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Importe um backup JSON para restaurar seus dados nesta conta.
          </p>
          <div className="space-y-2">
            <Label htmlFor="modo-importacao-backup">Modo de importacao</Label>
            <select
              id="modo-importacao-backup"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={modoImportacao}
              onChange={(event) => setModoImportacao(event.target.value as ImportMode)}
              disabled={importBackup.isPending}
              data-testid="select-import-mode"
            >
              <option value="merge">Mesclar com dados atuais (recomendado)</option>
              <option value="replace">Substituir dados atuais pelo backup</option>
            </select>
          </div>
          {modoImportacao === "replace" ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              Modo substituir: os dados financeiros atuais desta conta serao apagados antes da restauracao.
              Recomenda-se exportar um backup novo antes de continuar.
            </p>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              Modo mesclar: importar novamente pode duplicar dados.
            </p>
          )}
          <Input
            ref={inputImportacaoRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => setArquivoImportacao(e.target.files?.[0] ?? null)}
            disabled={importBackup.isPending}
            data-testid="input-import-backup"
          />
          <Button
            onClick={importarDados}
            disabled={!arquivoImportacao || importBackup.isPending}
            data-testid="button-import-backup"
            className="w-full touch-feedback"
          >
            {importBackup.isPending ? (
              "Importando..."
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" /> Importar dados (JSON)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className={perfilTab === "ajuda" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Ajuda e Tutorial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Precisa de uma ajuda para entender como o sistema funciona?
          </p>
          <TourRestartButton />
        </CardContent>
      </Card>

      <Card className={perfilTab === "conta" ? "fintech-surface" : "hidden"}>
        <CardContent className="p-4">
          <Button
            variant="destructive"
            onClick={() => logout.mutate()}
            className="w-full"
            data-testid="button-logout-profile"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

