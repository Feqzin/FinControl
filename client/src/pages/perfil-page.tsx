import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  getUserSubscriptionLimits,
  getUserSubscriptionTier,
  useAuth,
} from "@/hooks/use-auth";
import { useSubscriptionUsage } from "@/hooks/useSubscriptionUsage";
import {
  createCloudBackup,
  deleteCloudBackup,
  listCloudBackups,
  previewCloudBackup,
  restoreCloudBackup,
  type CloudBackupItem,
  type CloudBackupRestoreModulesSelection,
  type CloudBackupRestorePreview,
} from "@/services/api/cloud-backups";
import {
  cancelMercadoPagoSubscription,
  createMercadoPagoCheckout,
  getBillingStatus,
  startPremiumTrial,
  type BillingStatusResponse,
} from "@/services/api/billing";
import {
  fetchOwnCommunityProfile,
  updateOwnCommunityProfile,
  type CommunityProfileVisibility,
} from "@/services/api/community-profiles";
import {
  Download, Shield, Upload
} from "lucide-react";
import {
  PerfilAccountStatusCard,
  PerfilBackupCloudCard,
  PerfilBackupExportCard,
  PerfilBackupImportCard,
  PerfilDataSummaryCard,
  PerfilHelpCard,
  PerfilLogoutCard,
  PerfilCommunityProfileCard,
  PerfilPersonalInfoCard,
  PerfilPlanActionsCard,
  PerfilPlanBenefitsCard,
  PerfilPageHeader,
  PerfilPlanStatusCard,
  PerfilPlanUsageCard,
  PerfilTabsNav,
} from "@/pages/perfil/components";
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
import {
  normalizePublicUsername,
  resolvePublicUsernameForResponse,
  validatePublicUsername,
} from "@shared/public-username";
import {
  BACKUP_RESTORE_SUPPORTED_MODULE_KEYS,
  isBackupRestoreModuleKey,
  type BackupRestoreAction,
  type BackupRestoreMode,
  type BackupRestoreModuleKey,
} from "@shared/backup-restore-modules";

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
  modoImportacao?: BackupRestoreMode;
  modulosAplicados?: Record<BackupRestoreModuleKey, BackupRestoreAction>;
  avisos?: string[];
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
type RestoreReviewSource = "cloud" | "local";

function createDefaultRestoreModuleActions(defaultAction: Extract<BackupRestoreAction, "merge" | "replace">): Record<BackupRestoreModuleKey, BackupRestoreAction> {
  return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.reduce((acc, moduleKey) => {
    acc[moduleKey] = defaultAction;
    return acc;
  }, {} as Record<BackupRestoreModuleKey, BackupRestoreAction>);
}

function hasReplaceRestoreAction(actions: Record<BackupRestoreModuleKey, BackupRestoreAction>): boolean {
  return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.some((moduleKey) => actions[moduleKey] === "replace");
}

function countSelectedRestoreModules(actions: Record<BackupRestoreModuleKey, BackupRestoreAction>): number {
  return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.filter((moduleKey) => actions[moduleKey] !== "ignore").length;
}

function resolveRestoreSubmissionMode(
  actions: Record<BackupRestoreModuleKey, BackupRestoreAction>,
): {
  mode: BackupRestoreMode;
  modules?: CloudBackupRestoreModulesSelection;
} {
  const selectedCount = countSelectedRestoreModules(actions);
  const allMerge = BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.every((moduleKey) => actions[moduleKey] === "merge");
  const allReplace = BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.every((moduleKey) => actions[moduleKey] === "replace");

  if (selectedCount === BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.length && allMerge) {
    return { mode: "merge" };
  }
  if (selectedCount === BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.length && allReplace) {
    return { mode: "replace" };
  }

  return {
    mode: "custom",
    modules: actions,
  };
}

function formatRestoreModeLabel(mode: BackupRestoreMode): string {
  if (mode === "replace") return "Substituir dados atuais";
  if (mode === "custom") return "Personalizado";
  return "Mesclar com dados atuais";
}

export default function PerfilPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [nomeCompleto, setNomeCompleto] = useState(user?.nomeCompleto || "");
  const [publicUsername, setPublicUsername] = useState(user?.username || "");
  const [fullNameVisibility, setFullNameVisibility] = useState<"private" | "public">(
    user?.fullNameVisibility === "public" ? "public" : "private",
  );
  const [communityBio, setCommunityBio] = useState("");
  const [communityProfileVisibility, setCommunityProfileVisibility] = useState<CommunityProfileVisibility>("private");
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [backupRestaurandoId, setBackupRestaurandoId] = useState<string | null>(null);
  const [restoreReviewOpen, setRestoreReviewOpen] = useState(false);
  const [restoreReviewSource, setRestoreReviewSource] = useState<RestoreReviewSource | null>(null);
  const [restoreReviewBackupId, setRestoreReviewBackupId] = useState<string | null>(null);
  const [restoreReviewTitle, setRestoreReviewTitle] = useState("");
  const [restorePreviewData, setRestorePreviewData] = useState<CloudBackupRestorePreview | null>(null);
  const [restoreReviewModuleActions, setRestoreReviewModuleActions] = useState<Record<BackupRestoreModuleKey, BackupRestoreAction>>(
    createDefaultRestoreModuleActions("merge"),
  );
  const [restoreReviewLoading, setRestoreReviewLoading] = useState(false);
  const [restoreReviewApplyPending, setRestoreReviewApplyPending] = useState(false);
  const [restoreReviewConfirmText, setRestoreReviewConfirmText] = useState("");
  const [restoreLocalBackupPayload, setRestoreLocalBackupPayload] = useState<unknown | null>(null);
  const [deleteCloudBackupTarget, setDeleteCloudBackupTarget] = useState<CloudBackupItem | null>(null);
  const [deleteCloudBackupConfirmText, setDeleteCloudBackupConfirmText] = useState("");
  const [perfilTab, setPerfilTab] = useState<"conta" | "planos" | "backup" | "ajuda">("planos");
  const inputImportacaoRef = useRef<HTMLInputElement | null>(null);
  const resolvedPublicUsername = resolvePublicUsernameForResponse(user?.username);
  const canDefinePublicUsername = resolvedPublicUsername === null;
  const planoAtualAutenticado = getUserSubscriptionTier(user);
  const limitsFromAuth = getUserSubscriptionLimits(user);
  const usageQuery = useSubscriptionUsage();
  const billingStatusQuery = useQuery({
    queryKey: ["/api/billing/status"],
    queryFn: getBillingStatus,
    enabled: Boolean(user),
    retry: false,
  });
  const communityProfileQuery = useQuery({
    queryKey: ["/api/community/profile"],
    queryFn: fetchOwnCommunityProfile,
    enabled: Boolean(user),
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

  useEffect(() => {
    if (!user) return;
    setNomeCompleto(user.nomeCompleto || "");
    setPublicUsername(resolvePublicUsernameForResponse(user.username) ?? "");
    setFullNameVisibility(user.fullNameVisibility === "public" ? "public" : "private");
  }, [user]);

  useEffect(() => {
    if (!communityProfileQuery.data) return;
    setCommunityBio(communityProfileQuery.data.bio ?? "");
    setCommunityProfileVisibility(communityProfileQuery.data.profileVisibility);
  }, [communityProfileQuery.data]);

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
      const payload: Record<string, unknown> = {
        nomeCompleto,
        fullNameVisibility,
      };
      if (canDefinePublicUsername) {
        const normalizedPublicUsername = normalizePublicUsername(publicUsername);
        const usernameValidationError = validatePublicUsername(normalizedPublicUsername);
        if (usernameValidationError) {
          throw new Error(usernameValidationError);
        }
        payload.username = normalizedPublicUsername;
      }
      const res = await apiRequest("PATCH", "/api/auth/profile", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Perfil atualizado" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: parseApiErrorMessage(error, "Não foi possível atualizar seu perfil agora."),
        variant: "destructive",
      });
    },
  });

  const updateCommunityProfileMutation = useMutation({
    mutationFn: () => updateOwnCommunityProfile({
      bio: communityBio,
      profileVisibility: communityProfileVisibility,
    }),
    onSuccess: (profile) => {
      queryClient.setQueryData(["/api/community/profile"], profile);
      queryClient.invalidateQueries({
        queryKey: ["/api/community/creators", profile.publicCode],
      });
      toast({ title: "Perfil de criador atualizado" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar perfil de criador",
        description: parseApiErrorMessage(error, "Não foi possível salvar as configurações da comunidade."),
        variant: "destructive",
      });
    },
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

  const deleteCloudBackupMutation = useMutation({
    mutationFn: async ({
      backupId,
      confirmationText,
    }: {
      backupId: string;
      confirmationText: string;
    }) => deleteCloudBackup(backupId, confirmationText),
    onSuccess: (result) => {
      queryClient.setQueryData<CloudBackupItem[] | undefined>(["/api/backups/cloud"], (current) =>
        (current ?? []).filter((item) => item.id !== result.backupId),
      );
      setDeleteCloudBackupTarget(null);
      setDeleteCloudBackupConfirmText("");
      toast({
        title: "Backup excluído com sucesso",
        description: result.fileName,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir backup da nuvem",
        description: parseApiErrorMessage(error, "Falha ao excluir backup da nuvem."),
        variant: "destructive",
      });
    },
  });

  const restoreCloudBackupMutation = useMutation({
    mutationFn: async ({
      backupId,
      modo,
      modules,
    }: {
      backupId: string;
      modo: BackupRestoreMode;
      modules?: CloudBackupRestoreModulesSelection;
    }) => restoreCloudBackup(backupId, modo, modules),
    onMutate: ({ backupId }) => {
      setBackupRestaurandoId(backupId);
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups/cloud"] });
      invalidateFinancialQueries();
      toast({
        title: "Backup restaurado da nuvem",
        description: `Modo: ${formatRestoreModeLabel(resultado.modoImportacao)}. Pessoas: ${resultado.pessoasImportadas}, Cartoes: ${resultado.cartoesImportados}, Dividas: ${resultado.dividasImportadas}, Compras: ${resultado.comprasImportadas}, Servicos: ${resultado.servicosImportados}, Vinculos de servico: ${resultado.servicoPessoasImportados ?? 0}, Pagamentos de servico: ${resultado.servicoPagamentosImportados ?? 0}, Movimentações de saldo: ${resultado.saldoMovimentacoesImportados ?? 0}, Metas: ${resultado.metasImportadas}`,
      });
      if ((resultado.avisos?.length ?? 0) > 0) {
        toast({
          title: "Restauração concluída com avisos",
          description: resultado.avisos?.[0] ?? "Alguns módulos foram ignorados durante a restauração.",
        });
      }
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
      setRestoreReviewApplyPending(false);
    },
  });

  const importBackup = useMutation({
    mutationFn: async ({
      modo,
      modules,
      backup,
    }: {
      modo: BackupRestoreMode;
      modules?: CloudBackupRestoreModulesSelection;
      backup: unknown;
    }): Promise<ImportBackupResponse> => {
      const res = await apiRequest("POST", "/api/import", { modo, modules, backup });
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
        description: `Modo: ${formatRestoreModeLabel(resultado.modoImportacao ?? "custom")}. Pessoas: ${resultado.pessoasImportadas}, Cartoes: ${resultado.cartoesImportados}, Dividas: ${resultado.dividasImportadas}, Compras: ${resultado.comprasImportadas}, Servicos: ${resultado.servicosImportados}, Vinculos de servico: ${resultado.servicoPessoasImportados ?? 0}, Pagamentos de servico: ${resultado.servicoPagamentosImportados ?? 0}, Movimentações de saldo: ${resultado.saldoMovimentacoesImportadas ?? 0}, Metas: ${resultado.metasImportadas}`,
      });
      if ((resultado.avisos?.length ?? 0) > 0) {
        toast({
          title: "Restauração concluída com avisos",
          description: resultado.avisos?.[0] ?? "Alguns módulos foram ignorados durante a restauração.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Erro ao importar backup",
        description: parseApiErrorMessage(error, "Falha ao importar backup. Tente novamente."),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setRestoreReviewApplyPending(false);
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

  const resetRestoreReviewState = () => {
    setRestoreReviewOpen(false);
    setRestoreReviewSource(null);
    setRestoreReviewBackupId(null);
    setRestoreReviewTitle("");
    setRestorePreviewData(null);
    setRestoreReviewModuleActions(createDefaultRestoreModuleActions("merge"));
    setRestoreReviewConfirmText("");
    setRestoreReviewLoading(false);
    setRestoreReviewApplyPending(false);
    setRestoreLocalBackupPayload(null);
  };

  const applyRestoreActionToAvailableModules = (action: BackupRestoreAction) => {
    setRestoreReviewModuleActions((current) => {
      const next = { ...current };
      for (const module of restorePreviewData?.modules ?? []) {
        if (!isBackupRestoreModuleKey(module.key)) continue;
        if (!module.foundInBackup || !module.canMerge) {
          next[module.key] = "ignore";
          continue;
        }
        next[module.key] = action;
      }
      return next;
    });
  };

  const applyRestoreModeToSelectedModules = (mode: Extract<BackupRestoreAction, "merge" | "replace">) => {
    setRestoreReviewModuleActions((current) => {
      const next = { ...current };
      for (const module of restorePreviewData?.modules ?? []) {
        if (!isBackupRestoreModuleKey(module.key)) continue;
        if (!module.foundInBackup || !module.canMerge) continue;
        if (next[module.key] === "ignore") continue;
        next[module.key] = mode;
      }
      return next;
    });
  };

  const updateRestoreModuleAction = (moduleKey: BackupRestoreModuleKey, action: BackupRestoreAction) => {
    setRestoreReviewModuleActions((current) => ({
      ...current,
      [moduleKey]: action,
    }));
  };

  const openRestoreReviewWithPreview = (
    source: RestoreReviewSource,
    preview: CloudBackupRestorePreview,
    options: {
      title: string;
      backupId?: string | null;
      defaultMode: ImportMode;
      localBackupPayload?: unknown;
    },
  ) => {
    const defaultAction = options.defaultMode === "replace" ? "replace" : "merge";
    const initialActions = createDefaultRestoreModuleActions(defaultAction);

    for (const module of preview.modules) {
      if (!isBackupRestoreModuleKey(module.key)) continue;
      if (!module.foundInBackup || !module.canMerge) {
        initialActions[module.key] = "ignore";
      }
    }

    setRestoreReviewSource(source);
    setRestoreReviewBackupId(options.backupId ?? null);
    setRestoreReviewTitle(options.title);
    setRestorePreviewData(preview);
    setRestoreReviewModuleActions(initialActions);
    setRestoreReviewConfirmText("");
    setRestoreLocalBackupPayload(options.localBackupPayload ?? null);
    setRestoreReviewOpen(true);
  };

  const importarDados = async (defaultMode: ImportMode = "replace") => {
    if (!arquivoImportacao) {
      toast({
        title: "Selecione um arquivo",
        description: "Escolha um arquivo .json de backup para importar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setRestoreReviewLoading(true);
      const texto = await arquivoImportacao.text();
      let backupPayload: unknown;
      try {
        backupPayload = JSON.parse(texto);
      } catch {
        throw new Error("Arquivo JSON invalido. Verifique o arquivo e tente novamente.");
      }

      const previewResponse = await apiRequest("POST", "/api/import/preview", {
        backup: backupPayload,
      });
      const preview = await previewResponse.json() as CloudBackupRestorePreview;

      openRestoreReviewWithPreview("local", preview, {
        title: arquivoImportacao.name || "Backup local",
        defaultMode,
        localBackupPayload: backupPayload,
      });
    } catch (error) {
      toast({
        title: "Erro ao analisar backup",
        description: parseApiErrorMessage(error, "Falha ao analisar backup local."),
        variant: "destructive",
      });
    } finally {
      setRestoreReviewLoading(false);
    }
  };

  const restaurarBackupNuvem = async (backup: CloudBackupItem, defaultMode: ImportMode = "replace") => {
    try {
      setRestoreReviewLoading(true);
      const preview = await previewCloudBackup(backup.id);
      openRestoreReviewWithPreview("cloud", preview, {
        title: backup.fileName,
        backupId: backup.id,
        defaultMode,
      });
    } catch (error) {
      toast({
        title: "Erro ao analisar backup da nuvem",
        description: parseApiErrorMessage(error, "Falha ao analisar backup da nuvem."),
        variant: "destructive",
      });
    } finally {
      setRestoreReviewLoading(false);
    }
  };

  const abrirRestauracaoCloud = () => {
    const backupsDisponiveis = cloudBackupsQuery.data ?? [];
    if (backupsDisponiveis.length === 0) {
      toast({
        title: "Nenhum backup disponível",
        description: "Salve um backup na nuvem antes de restaurar.",
        variant: "destructive",
      });
      return;
    }

    const backupPreferencial = backupsDisponiveis.find((backup) => backup.status === "completed") ?? backupsDisponiveis[0];
    void restaurarBackupNuvem(backupPreferencial, "replace");
  };

  const abrirExclusaoCloudBackup = (backup: CloudBackupItem) => {
    setDeleteCloudBackupTarget(backup);
    setDeleteCloudBackupConfirmText("");
  };

  const fecharExclusaoCloudBackup = () => {
    if (deleteCloudBackupMutation.isPending) return;
    setDeleteCloudBackupTarget(null);
    setDeleteCloudBackupConfirmText("");
  };

  const confirmarExclusaoCloudBackup = () => {
    if (!deleteCloudBackupTarget || deleteCloudBackupMutation.isPending) return;
    deleteCloudBackupMutation.mutate({
      backupId: deleteCloudBackupTarget.id,
      confirmationText: deleteCloudBackupConfirmText,
    });
  };

  const aplicarRestauracaoRevisada = () => {
    if (!restoreReviewSource || !restorePreviewData) {
      return;
    }

    const selectedModulesCount = countSelectedRestoreModules(restoreReviewModuleActions);
    if (selectedModulesCount === 0) {
      toast({
        title: "Selecione ao menos um módulo",
        description: "Escolha pelo menos um módulo com Mesclar ou Substituir.",
        variant: "destructive",
      });
      return;
    }

    const hasReplace = hasReplaceRestoreAction(restoreReviewModuleActions);
    if (hasReplace && restoreReviewConfirmText.trim() !== "RESTAURAR") {
      toast({
        title: "Confirmação obrigatória",
        description: "Digite RESTAURAR para confirmar a substituição de dados.",
        variant: "destructive",
      });
      return;
    }

    const submission = resolveRestoreSubmissionMode(restoreReviewModuleActions);
    setRestoreReviewApplyPending(true);

    if (restoreReviewSource === "cloud") {
      if (!restoreReviewBackupId) {
        setRestoreReviewApplyPending(false);
        return;
      }
      restoreCloudBackupMutation.mutate(
        {
          backupId: restoreReviewBackupId,
          modo: submission.mode,
          modules: submission.modules,
        },
        {
          onSuccess: () => {
            resetRestoreReviewState();
          },
        },
      );
      return;
    }

    if (!restoreLocalBackupPayload) {
      setRestoreReviewApplyPending(false);
      toast({
        title: "Backup local não encontrado",
        description: "Selecione o arquivo novamente para continuar.",
        variant: "destructive",
      });
      return;
    }

    importBackup.mutate(
      {
        modo: submission.mode,
        modules: submission.modules,
        backup: restoreLocalBackupPayload,
      },
      {
        onSuccess: () => {
          resetRestoreReviewState();
        },
      },
    );
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
  const restorePreviewModules = restorePreviewData?.modules ?? [];
  const restoreModulesFound = restorePreviewModules.filter((module) => module.foundInBackup);
  const restoreModulesNotFound = restorePreviewModules.filter((module) => !module.foundInBackup);
  const startTrialButtonLabel = startTrialMutation.isPending
    ? "Iniciando teste grátis..."
    : "Testar Premium grátis por 7 dias";
  const subscribeButtonLabel = createBillingCheckoutMutation.isPending
    ? "Redirecionando..."
    : billingStatus?.billingStatus === "pending"
      ? "Continuar pagamento"
      : "Assinar Premium";
  const cancelSubscriptionButtonLabel = cancelBillingSubscriptionMutation.isPending
    ? "Cancelando assinatura..."
    : "Cancelar assinatura";
  const createCloudBackupButtonLabel = backupNuvemLiberado
    ? (createCloudBackupMutation.isPending ? "Salvando backup..." : "Salvar backup na nuvem")
    : "Disponível no plano Premium";
  const restoreLatestCloudBackupLabel = restoreReviewLoading
    ? "Analisando backup..."
    : "Substituir com a nuvem";
  const cloudBackupItems = (cloudBackupsQuery.data ?? []).map((backup) => ({
    backup,
    metaLabel: `${formatDateTimeBR(backup.createdAt)} · ${formatBytes(backup.sizeBytes)}`,
    statusVariant: backup.status === "completed" ? "default" as const : "destructive" as const,
    restoreLabel:
      restoreCloudBackupMutation.isPending && backupRestaurandoId === backup.id
        ? "Restaurando..."
        : restoreReviewLoading
          ? "Analisando..."
          : "Substituir",
    restoreDisabled:
      restoreCloudBackupMutation.isPending || restoreReviewApplyPending || restoreReviewLoading,
    deleteLabel:
      deleteCloudBackupMutation.isPending && deleteCloudBackupTarget?.id === backup.id
        ? "Excluindo..."
        : "Excluir",
    deleteDisabled:
      deleteCloudBackupMutation.isPending || restoreCloudBackupMutation.isPending || restoreReviewApplyPending,
  }));
  const cloudBackupsState =
    cloudBackupsQuery.isLoading
      ? "loading"
      : cloudBackupsQuery.isError
        ? "error"
        : cloudBackupItems.length === 0
          ? "empty"
          : "ready";
  const planUsageItems = [
    {
      label: "Cartões",
      value: `${usageComLimitesAtuais.usage.cartoes} / ${formatPlanLimit(usageComLimitesAtuais.limits.maxCartoes)}`,
      remainingLabel: `Restante: ${formatRemainingLimit(usageComLimitesAtuais.remaining.cartoes)}`,
    },
    {
      label: "Pessoas",
      value: `${usageComLimitesAtuais.usage.pessoas} / ${formatPlanLimit(usageComLimitesAtuais.limits.maxPessoas)}`,
      remainingLabel: `Restante: ${formatRemainingLimit(usageComLimitesAtuais.remaining.pessoas)}`,
    },
    {
      label: "Serviços",
      value: `${usageComLimitesAtuais.usage.servicos} / ${formatPlanLimit(usageComLimitesAtuais.limits.maxServicos)}`,
      remainingLabel: `Restante: ${formatRemainingLimit(usageComLimitesAtuais.remaining.servicos)}`,
    },
  ] as const;
  const personalInfoAvatarText = (user?.nomeCompleto || resolvedPublicUsername || "U")[0].toUpperCase();
  const personalInfoDisplayName = user?.nomeCompleto || (resolvedPublicUsername ? `@${resolvedPublicUsername}` : "Usuário");
  const personalInfoUsernameLabel = resolvedPublicUsername ? `@${resolvedPublicUsername}` : "Usuário sem username público";
  const publicUsernameInputValue = canDefinePublicUsername ? publicUsername : `@${resolvedPublicUsername}`;
  const publicUsernameHelperText = canDefinePublicUsername
    ? "Como sua conta foi criada antes dessa atualização, você pode definir seu usuário público uma vez."
    : "Seu usuário público é usado em packs e recursos compartilhados. Para alterar, entre em contato com o suporte.";
  const saveProfileButtonLabel = updateProfile.isPending ? "Salvando..." : "Salvar alteracoes";

  return (
    <div className="app-page-shell app-section-stack mx-auto max-w-2xl" data-testid="perfil-page">
      <PerfilPageHeader
        title="Meu Perfil"
        subtitle="Gerencie sua conta, planos e backups"
      />

      <PerfilTabsNav value={perfilTab} onValueChange={setPerfilTab} />

      <PerfilPersonalInfoCard
        isVisible={perfilTab === "conta"}
        title="Informacoes pessoais"
        avatarText={personalInfoAvatarText}
        displayName={personalInfoDisplayName}
        usernameLabel={personalInfoUsernameLabel}
        nomeCompleto={nomeCompleto}
        onNomeCompletoChange={setNomeCompleto}
        publicUsername={publicUsernameInputValue}
        onPublicUsernameChange={setPublicUsername}
        publicUsernameDisabled={!canDefinePublicUsername}
        publicUsernameHelperText={publicUsernameHelperText}
        fullNameVisibility={fullNameVisibility}
        onFullNameVisibilityChange={setFullNameVisibility}
        onSave={() => updateProfile.mutate()}
        saveDisabled={updateProfile.isPending}
        saveLabel={saveProfileButtonLabel}
      />

      <PerfilCommunityProfileCard
        isVisible={perfilTab === "conta"}
        bio={communityBio}
        onBioChange={setCommunityBio}
        profileVisibility={communityProfileVisibility}
        onProfileVisibilityChange={setCommunityProfileVisibility}
        onSave={() => updateCommunityProfileMutation.mutate()}
        onViewProfile={() => {
          const publicCode = communityProfileQuery.data?.publicCode;
          if (publicCode) {
            navigate(`/comunidade/criadores/${encodeURIComponent(publicCode)}`);
          }
        }}
        saveDisabled={updateCommunityProfileMutation.isPending}
        canViewProfile={Boolean(communityProfileQuery.data?.publicCode)}
      />

      <PerfilAccountStatusCard
        isVisible={perfilTab === "conta"}
        premiumAtivoNaUi={premiumAtivoNaUi}
      />

      <Card className={perfilTab === "planos" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Planos e benefícios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerfilPlanStatusCard
            title={billingStatusUi.title}
            description={billingStatusUi.description}
            tone={billingStatusUi.tone}
            premiumAtivoNaUi={premiumAtivoNaUi}
          />

          <PerfilPlanUsageCard
            title="Uso atual do plano"
            items={planUsageItems}
            showError={usageQuery.isError}
            errorText="Não foi possível atualizar o uso do plano agora. Exibindo contagem local como fallback."
          />

          <PerfilPlanBenefitsCard />

          <PerfilPlanActionsCard
            showStartTrial={!premiumAtivoNaUi && canStartTrial}
            showSubscribe={!premiumAtivoNaUi && canSubscribe}
            showCancelSubscription={canCancelSubscription}
            startTrialPending={startTrialMutation.isPending}
            subscribePending={createBillingCheckoutMutation.isPending}
            cancelSubscriptionPending={cancelBillingSubscriptionMutation.isPending}
            startTrialLabel={startTrialButtonLabel}
            subscribeLabel={subscribeButtonLabel}
            cancelSubscriptionLabel={cancelSubscriptionButtonLabel}
            onStartTrial={() => startTrialMutation.mutate()}
            onSubscribe={() => createBillingCheckoutMutation.mutate()}
            onCancelSubscription={handleCancelSubscription}
          />
        </CardContent>
      </Card>

      <PerfilDataSummaryCard
        isVisible={perfilTab === "backup"}
        pessoasCount={pessoas.length}
        dividasCount={dividas.length}
        cartoesCount={cartoes.length}
        servicosCount={servicos.length}
        metasCount={metas.length}
        comprasCount={compras.length}
        movimentacoesSaldoCount={pessoaSaldoMovimentacoes.length}
        totalReceberFormatted={formatCurrency(totalReceber)}
        totalPagarFormatted={formatCurrency(totalPagar)}
      />

      <Card className={perfilTab === "backup" ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Backup de dados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Exporte, salve e restaure seus dados com revisão seletiva por módulo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerfilBackupExportCard onExport={exportarDados} />

          <PerfilBackupCloudCard
            backupNuvemLiberado={backupNuvemLiberado}
            premiumBadgeVariant={backupNuvemLiberado ? "default" : "secondary"}
            premiumBadgeLabel={backupNuvemLiberado ? "Premium ativo" : "Premium"}
            createBackupLabel={createCloudBackupButtonLabel}
            createBackupDisabled={!backupNuvemLiberado || createCloudBackupMutation.isPending}
            restoreLatestLabel={restoreLatestCloudBackupLabel}
            restoreLatestDisabled={
              !backupNuvemLiberado
              || cloudBackupsQuery.isLoading
              || cloudBackupItems.length === 0
              || restoreCloudBackupMutation.isPending
              || restoreReviewApplyPending
              || restoreReviewLoading
            }
            showSavedBackups={backupNuvemLiberado}
            cloudBackupsState={cloudBackupsState}
            cloudBackupItems={cloudBackupItems}
            onCreateBackup={() => createCloudBackupMutation.mutate()}
            onRestoreLatest={abrirRestauracaoCloud}
            onRestoreBackup={(backup) => restaurarBackupNuvem(backup, "replace")}
            onDeleteBackup={abrirExclusaoCloudBackup}
          />

          <PerfilBackupImportCard
            inputRef={inputImportacaoRef}
            onFileChange={(e) => setArquivoImportacao(e.target.files?.[0] ?? null)}
            onImport={() => importarDados("replace")}
            inputDisabled={importBackup.isPending || restoreReviewApplyPending || restoreReviewLoading}
            importDisabled={!arquivoImportacao || importBackup.isPending || restoreReviewApplyPending || restoreReviewLoading}
            buttonContent={
              importBackup.isPending || restoreReviewApplyPending ? (
                "Restaurando..."
              ) : restoreReviewLoading ? (
                "Analisando backup..."
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" /> Substituir por arquivo
                </>
              )
            }
          />
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteCloudBackupTarget)}
        onOpenChange={(open) => {
          if (!open) {
            fecharExclusaoCloudBackup();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir backup da nuvem?</DialogTitle>
            <DialogDescription className="sr-only">
              Confirme a exclusão permanente do backup selecionado digitando o nome exato do arquivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Essa ação removerá permanentemente este backup da nuvem. Você não poderá restaurá-lo depois.
            </p>
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{deleteCloudBackupTarget?.fileName ?? "-"}</p>
              <p className="mt-1">
                Digite exatamente o nome do arquivo para confirmar a exclusão.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-cloud-backup-confirmation">Confirmação</Label>
              <Input
                id="delete-cloud-backup-confirmation"
                value={deleteCloudBackupConfirmText}
                onChange={(event) => setDeleteCloudBackupConfirmText(event.target.value)}
                disabled={deleteCloudBackupMutation.isPending}
                placeholder={deleteCloudBackupTarget?.fileName ?? "nome-do-backup.json"}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={fecharExclusaoCloudBackup}
                disabled={deleteCloudBackupMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmarExclusaoCloudBackup}
                disabled={
                  deleteCloudBackupMutation.isPending
                  || !deleteCloudBackupTarget
                  || deleteCloudBackupConfirmText.trim() !== deleteCloudBackupTarget.fileName
                }
              >
                {deleteCloudBackupMutation.isPending ? "Excluindo..." : "Excluir backup"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restoreReviewOpen}
        onOpenChange={(open) => {
          if (!open && (restoreReviewApplyPending || restoreCloudBackupMutation.isPending || importBackup.isPending)) {
            return;
          }
          if (!open) {
            resetRestoreReviewState();
            return;
          }
          setRestoreReviewOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[980px] max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 sm:w-[min(95vw,980px)] sm:max-h-[calc(100dvh-1.5rem)]">
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 sm:px-6">
              <DialogTitle>Revisar restauração</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Escolha quais dados deseja restaurar antes de aplicar.
              </p>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
              <div className="space-y-4">
                {restorePreviewData ? (
                  <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Arquivo:</span>{" "}
                      {(restorePreviewData.backupInfo.fileName ?? restoreReviewTitle) || "Backup"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Gerado em:</span>{" "}
                      {restorePreviewData.backupInfo.createdAt ? formatDateTimeBR(restorePreviewData.backupInfo.createdAt) : "-"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Tamanho:</span>{" "}
                      {restorePreviewData.backupInfo.sizeBytes != null ? formatBytes(restorePreviewData.backupInfo.sizeBytes) : "-"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Versão:</span>{" "}
                      {restorePreviewData.backupInfo.version ?? "não informada"}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {restoreReviewLoading ? "Analisando backup..." : "Nenhuma prévia disponível."}
                  </p>
                )}

                {restorePreviewData && (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => applyRestoreActionToAvailableModules("merge")}
                      disabled={restoreReviewApplyPending}
                    >
                      Selecionar tudo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => applyRestoreActionToAvailableModules("ignore")}
                      disabled={restoreReviewApplyPending}
                    >
                      Ignorar tudo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => applyRestoreModeToSelectedModules("merge")}
                      disabled={restoreReviewApplyPending}
                    >
                      Modo global: Mesclar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => applyRestoreModeToSelectedModules("replace")}
                      disabled={restoreReviewApplyPending}
                    >
                      Modo global: Substituir
                    </Button>
                  </div>
                )}

                {restoreModulesFound.length > 0 && (
                  <div className="space-y-2">
                    {restoreModulesFound.map((module) => {
                      const moduleKey = isBackupRestoreModuleKey(module.key) ? module.key : null;
                      const action: BackupRestoreAction = moduleKey
                        ? restoreReviewModuleActions[moduleKey]
                        : "ignore";
                      return (
                        <div key={module.key} className="rounded-md border p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{module.label}</p>
                              <p className="text-xs text-muted-foreground">
                                Encontrados: {module.count}
                                {module.activeCount != null && module.removedCount != null
                                  ? ` · Ativos: ${module.activeCount} · Removidos: ${module.removedCount}`
                                  : ""}
                              </p>
                              {module.warnings.map((warning) => (
                                <p key={`${module.key}-${warning}`} className="text-xs text-amber-700">
                                  {warning}
                                </p>
                              ))}
                            </div>
                            {moduleKey ? (
                              <select
                                className="h-10 min-w-[170px] rounded-md border border-input bg-background px-2 text-sm"
                                value={action}
                                onChange={(event) =>
                                  updateRestoreModuleAction(moduleKey, event.target.value as BackupRestoreAction)}
                                disabled={restoreReviewApplyPending}
                              >
                                <option value="merge">Mesclar</option>
                                <option value="replace">Substituir</option>
                                <option value="ignore">Ignorar</option>
                              </select>
                            ) : (
                              <Badge variant="secondary">Não encontrado</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {restoreModulesNotFound.length > 0 && (
                  <div className="rounded-md border border-dashed p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Não encontrados no backup
                    </p>
                    <div className="mt-2 space-y-1">
                      {restoreModulesNotFound.map((module) => (
                        <div
                          key={`not-found-${module.key}`}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                        >
                          <span className="font-medium">{module.label} · {module.count}</span>
                          <Badge variant="secondary">Não encontrado</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(restorePreviewData?.warnings.length ?? 0) > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {restorePreviewData?.warnings.map((warning) => (
                      <p key={`restore-warning-${warning}`}>{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
              <div className="space-y-3">
                {hasReplaceRestoreAction(restoreReviewModuleActions) && (
                  <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-800">
                      Você escolheu substituir dados. Dados atuais dos módulos selecionados serão removidos antes da restauração.
                    </p>
                    <Label htmlFor="restore-confirm-text" className="text-xs text-red-900">
                      Digite RESTAURAR para confirmar
                    </Label>
                    <Input
                      id="restore-confirm-text"
                      value={restoreReviewConfirmText}
                      onChange={(event) => setRestoreReviewConfirmText(event.target.value)}
                      disabled={restoreReviewApplyPending}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetRestoreReviewState()}
                    disabled={restoreReviewApplyPending || restoreCloudBackupMutation.isPending || importBackup.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={aplicarRestauracaoRevisada}
                    disabled={
                      restoreReviewApplyPending
                      || restoreCloudBackupMutation.isPending
                      || importBackup.isPending
                      || countSelectedRestoreModules(restoreReviewModuleActions) === 0
                      || (hasReplaceRestoreAction(restoreReviewModuleActions) && restoreReviewConfirmText.trim() !== "RESTAURAR")
                    }
                  >
                    {restoreReviewApplyPending || restoreCloudBackupMutation.isPending || importBackup.isPending
                      ? "Aplicando..."
                      : "Aplicar restauração"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PerfilHelpCard isVisible={perfilTab === "ajuda"} />

      <PerfilLogoutCard
        isVisible={perfilTab === "conta"}
        onLogout={() => logout.mutate()}
      />
    </div>
  );
}

