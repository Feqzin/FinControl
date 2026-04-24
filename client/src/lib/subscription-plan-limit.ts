import type { SubscriptionTier } from "@shared/subscription";

type PlanLimitResource = "cartoes" | "pessoas" | "servicos" | "metas";

export type PlanLimitErrorPayload = {
  code: "PLAN_LIMIT_REACHED";
  message: string;
  resource: PlanLimitResource;
  currentUsage: number;
  limit: number;
  subscriptionTier: SubscriptionTier;
};

const RESOURCE_LABELS: Record<PlanLimitResource, string> = {
  cartoes: "cartões",
  pessoas: "pessoas",
  servicos: "serviços",
  metas: "metas",
};

function parseErrorBodyFromMessage(message: string): unknown {
  const colonIndex = message.indexOf(":");
  if (colonIndex < 0) return null;

  const maybeJson = message.slice(colonIndex + 1).trim();
  if (!maybeJson.startsWith("{")) return null;

  try {
    return JSON.parse(maybeJson);
  } catch {
    return null;
  }
}

function isPlanLimitPayload(value: unknown): value is PlanLimitErrorPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PlanLimitErrorPayload>;
  return (
    payload.code === "PLAN_LIMIT_REACHED"
    && (payload.resource === "cartoes"
      || payload.resource === "pessoas"
      || payload.resource === "servicos"
      || payload.resource === "metas")
    && typeof payload.currentUsage === "number"
    && typeof payload.limit === "number"
    && (payload.subscriptionTier === "free" || payload.subscriptionTier === "premium")
  );
}

export function parsePlanLimitError(error: unknown): PlanLimitErrorPayload | null {
  if (!(error instanceof Error)) return null;
  const parsed = parseErrorBodyFromMessage(error.message);
  if (!isPlanLimitPayload(parsed)) return null;
  return parsed;
}

export function buildPlanLimitFriendlyMessage(payload: PlanLimitErrorPayload): string {
  const resourceLabel = RESOURCE_LABELS[payload.resource];
  return `Você atingiu o limite de ${resourceLabel} do plano ${payload.subscriptionTier} (${payload.currentUsage}/${payload.limit}). Faça upgrade para Premium para continuar criando.`;
}
