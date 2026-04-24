import type { PremiumFeature, SubscriptionTier } from "@shared/subscription";

export type PremiumFeatureErrorPayload = {
  message: string;
  feature: PremiumFeature;
  requiredTier: "premium";
  currentTier: SubscriptionTier;
};

const FEATURE_LABEL_MAP: Record<PremiumFeature, string> = {
  cloudBackup: "backup na nuvem",
  cloudRestore: "restauração de backup na nuvem",
  advancedReports: "relatórios avançados",
  smartImport: "importação inteligente de faturas/extratos",
  automation: "automações",
  unlimitedHistory: "histórico ilimitado",
  forecast: "previsão financeira",
  simulator: "simulador financeiro",
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

function isPremiumFeatureErrorPayload(value: unknown): value is PremiumFeatureErrorPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PremiumFeatureErrorPayload>;
  return (
    typeof payload.message === "string"
    && payload.requiredTier === "premium"
    && typeof payload.feature === "string"
    && (payload.currentTier === "free" || payload.currentTier === "premium")
  );
}

export function parsePremiumFeatureError(error: unknown): PremiumFeatureErrorPayload | null {
  if (!(error instanceof Error)) return null;
  const parsed = parseErrorBodyFromMessage(error.message);
  if (!isPremiumFeatureErrorPayload(parsed)) return null;
  return parsed;
}

export function buildPremiumFeatureFriendlyMessage(payload: PremiumFeatureErrorPayload): string {
  const label = FEATURE_LABEL_MAP[payload.feature] ?? "recurso premium";
  return `A ${label} está disponível apenas no plano Premium. Faça upgrade para liberar esse recurso.`;
}
