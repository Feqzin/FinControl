import { apiRequest } from "@/lib/queryClient";
import type {
  SubscriptionFeatures,
  SubscriptionLimits,
  SubscriptionTier,
} from "@shared/subscription";

export type BillingStatusResponse = {
  subscriptionTier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  subscriptionTierStored: SubscriptionTier;
  billingStatus: "no_subscription" | "trialing" | "pending" | "active" | "paused" | "canceled" | "expired" | "rejected";
  trial: {
    startedAt: string | null;
    endsAt: string | null;
    usedAt: string | null;
    isActive: boolean;
  };
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
  canStartTrial: boolean;
  canSubscribe: boolean;
  canCancel: boolean;
  subscription: {
    id: string;
    provider: string;
    providerSubscriptionId: string | null;
    providerPlanId: string | null;
    externalReference: string | null;
    status: string;
    providerStatus: string | null;
    amount: string | null;
    currency: string;
    startedAt: string | null;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
    lastWebhookAt: string | null;
    lastSyncAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type MercadoPagoCheckoutResponse = {
  provider: "mercado_pago";
  billingStatus: "pending";
  checkoutUrl: string;
  externalReference: string | null;
  checkoutMode: "new" | "resume";
  subscription: {
    id: string;
    status: string;
    providerStatus: string | null;
    providerSubscriptionId: string | null;
  };
};

export type MercadoPagoCancelResponse = {
  message: string;
  status: BillingStatusResponse;
};

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const res = await apiRequest("GET", "/api/billing/status");
  return res.json() as Promise<BillingStatusResponse>;
}

export async function startPremiumTrial(): Promise<BillingStatusResponse> {
  const res = await apiRequest("POST", "/api/billing/trial/start");
  return res.json() as Promise<BillingStatusResponse>;
}

export async function createMercadoPagoCheckout(): Promise<MercadoPagoCheckoutResponse> {
  const res = await apiRequest("POST", "/api/billing/mercadopago/checkout");
  return res.json() as Promise<MercadoPagoCheckoutResponse>;
}

export async function cancelMercadoPagoSubscription(): Promise<MercadoPagoCancelResponse> {
  const res = await apiRequest("POST", "/api/billing/mercadopago/cancel");
  return res.json() as Promise<MercadoPagoCancelResponse>;
}
