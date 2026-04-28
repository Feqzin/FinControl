import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  buildSubscriptionAccess,
  type SubscriptionFeatures,
  type SubscriptionLimits,
  type SubscriptionTier,
} from "../../shared/subscription.js";
import {
  billingWebhookEvents,
  users,
  userSubscriptions,
  type BillingWebhookEvent,
  type UserSubscription,
} from "../../shared/schema.js";
import { db } from "../db.js";
import { storage, type IStorage } from "../storage.js";
import { toErrorLog, writeTechnicalLog } from "../logger.js";

type BillingUserLike = {
  subscriptionTier?: unknown;
} | null | undefined;

type BillingProvider = "mercado_pago";
type BillingSubscriptionStatus =
  | "no_subscription"
  | "pending"
  | "active"
  | "paused"
  | "canceled"
  | "expired"
  | "rejected";

type BillingEffectiveStatus = BillingSubscriptionStatus | "trialing";

type BillingWebhookEventStatus = "received" | "processed" | "ignored" | "error";

export type BillingStatusResponse = {
  subscriptionTier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  subscriptionTierStored: SubscriptionTier;
  billingStatus: BillingEffectiveStatus;
  trial: {
    startedAt: Date | null;
    endsAt: Date | null;
    usedAt: Date | null;
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
    startedAt: Date | null;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
    lastWebhookAt: Date | null;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

type EffectiveSubscriptionAccess = {
  effectiveTier: SubscriptionTier;
  subscriptionTierStored: SubscriptionTier;
  billingStatus: BillingEffectiveStatus;
  trial: BillingStatusResponse["trial"];
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
  canStartTrial: boolean;
  canSubscribe: boolean;
  canCancel: boolean;
  subscription: BillingStatusResponse["subscription"];
};

export type BillingCheckoutResponse = {
  provider: BillingProvider;
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

export type BillingWebhookProcessResult = {
  outcome: "processed" | "ignored";
  reason: string;
  providerEventId: string;
};

export type BillingCancelResponse = {
  message: string;
  status: BillingStatusResponse;
};

const TRIAL_DURATION_DAYS = 7;

export type UpsertLocalSubscriptionInput = {
  userId: string;
  provider: BillingProvider;
  providerSubscriptionId?: string | null;
  providerPlanId?: string | null;
  externalReference?: string | null;
  status: Exclude<BillingSubscriptionStatus, "no_subscription">;
  providerStatus?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  startedAt?: Date | null;
  currentPeriodEnd?: Date | null;
  canceledAt?: Date | null;
  lastWebhookAt?: Date | null;
  lastSyncAt?: Date | null;
  rawPayload?: unknown;
};

export type RegisterWebhookEventInput = {
  provider: BillingProvider;
  providerEventId: string;
  topic?: string | null;
  payload?: unknown;
  status?: BillingWebhookEventStatus;
  processedAt?: Date | null;
};

export type RegisterWebhookEventResult = {
  alreadyExists: boolean;
  event: BillingWebhookEvent;
};

type MercadoPagoPreapprovalResponse = {
  id?: unknown;
  status?: unknown;
  preapproval_plan_id?: unknown;
  external_reference?: unknown;
  reason?: unknown;
  date_created?: unknown;
  date_last_updated?: unknown;
  next_payment_date?: unknown;
  auto_recurring?: {
    transaction_amount?: unknown;
    currency_id?: unknown;
  } | unknown;
  init_point?: unknown;
  sandbox_init_point?: unknown;
};

type MercadoPagoSearchResponse = {
  results?: unknown;
};

type ResolvedMercadoPagoSubscription = {
  providerSubscriptionId: string | null;
  externalReference: string | null;
  providerStatus: string;
  providerPlanId: string | null;
  amount: string | null;
  currency: string | null;
  startedAt: Date | null;
  currentPeriodEnd: Date | null;
  rawPayload: MercadoPagoPreapprovalResponse;
};

type TrialSnapshot = {
  startedAt: Date | null;
  endsAt: Date | null;
  usedAt: Date | null;
  isActive: boolean;
  wasUsed: boolean;
};

type MercadoPagoConfig = {
  accessToken: string;
  amount: number;
  currency: string;
  reason: string;
  appBaseUrl: string;
  endpoint: string;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAmount(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value.toFixed(2);
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toBillingStatus(status: string | null | undefined): BillingSubscriptionStatus {
  if (!status) return "no_subscription";
  if (
    status === "pending"
    || status === "active"
    || status === "paused"
    || status === "canceled"
    || status === "expired"
    || status === "rejected"
  ) {
    return status;
  }
  return "pending";
}

function isPaidSubscriptionStatus(status: BillingSubscriptionStatus): boolean {
  return status === "active";
}

function resolveEffectiveTierByPriority(params: {
  subscriptionTierStored: SubscriptionTier;
  subscriptionStatus: BillingSubscriptionStatus;
  trialIsActive: boolean;
}): SubscriptionTier {
  const { subscriptionTierStored, subscriptionStatus, trialIsActive } = params;

  if (
    (subscriptionStatus === "canceled"
      || subscriptionStatus === "expired"
      || subscriptionStatus === "rejected")
    && !trialIsActive
  ) {
    return "free";
  }

  if (subscriptionStatus === "pending" && !trialIsActive) {
    return "free";
  }

  if (subscriptionTierStored === "premium") {
    return "premium";
  }

  if (isPaidSubscriptionStatus(subscriptionStatus)) {
    return "premium";
  }

  if (trialIsActive) {
    return "premium";
  }

  return "free";
}

function toSubscriptionResponse(subscription: UserSubscription | null): BillingStatusResponse["subscription"] {
  if (!subscription) return null;
  return {
    id: subscription.id,
    provider: subscription.provider,
    providerSubscriptionId: subscription.providerSubscriptionId ?? null,
    providerPlanId: subscription.providerPlanId ?? null,
    externalReference: subscription.externalReference ?? null,
    status: subscription.status,
    providerStatus: subscription.providerStatus ?? null,
    amount: subscription.amount ?? null,
    currency: subscription.currency,
    startedAt: subscription.startedAt ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    canceledAt: subscription.canceledAt ?? null,
    lastWebhookAt: subscription.lastWebhookAt ?? null,
    lastSyncAt: subscription.lastSyncAt ?? null,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseMercadoPagoAmount(value: string | undefined): number {
  if (!value) return 9.9;
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BillingServiceError(500, "Configuracao invalida de valor da assinatura no servidor.");
  }
  return Number(parsed.toFixed(2));
}

function buildExternalReference(userId: string): string {
  const suffix = randomUUID().slice(0, 8);
  return `fincontrol:${userId}:${Date.now()}:${suffix}`;
}

function extractCheckoutUrlFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const payload = rawPayload as { checkoutUrl?: unknown };
  if (typeof payload.checkoutUrl !== "string" || payload.checkoutUrl.trim() === "") return null;

  const candidate = payload.checkoutUrl.trim();
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return candidate;
  } catch {
    return null;
  }
}

function extractInitPoint(payload: MercadoPagoPreapprovalResponse): string | null {
  if (typeof payload.init_point === "string" && payload.init_point.trim()) {
    return payload.init_point.trim();
  }
  if (typeof payload.sandbox_init_point === "string" && payload.sandbox_init_point.trim()) {
    return payload.sandbox_init_point.trim();
  }
  return null;
}

function resolveMercadoPagoConfig(): MercadoPagoConfig {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  const appBaseUrlRaw = process.env.APP_BASE_URL?.trim();
  const reason = process.env.MERCADO_PAGO_SUBSCRIPTION_REASON?.trim() || "FinControl Premium Mensal";
  const currency = process.env.MERCADO_PAGO_SUBSCRIPTION_CURRENCY?.trim().toUpperCase() || "BRL";
  const endpoint = process.env.MERCADO_PAGO_API_URL?.trim() || "https://api.mercadopago.com";

  if (!accessToken) {
    throw new BillingServiceError(503, "Cobranca premium indisponivel: configuracao do Mercado Pago pendente no servidor.");
  }

  if (!appBaseUrlRaw) {
    throw new BillingServiceError(503, "Cobranca premium indisponivel: APP_BASE_URL nao configurada no servidor.");
  }

  let appBaseUrl: string;
  try {
    const parsed = new URL(appBaseUrlRaw);
    appBaseUrl = normalizeBaseUrl(parsed.toString());
  } catch {
    throw new BillingServiceError(503, "Cobranca premium indisponivel: APP_BASE_URL invalida no servidor.");
  }

  return {
    accessToken,
    amount: parseMercadoPagoAmount(process.env.MERCADO_PAGO_SUBSCRIPTION_AMOUNT),
    currency,
    reason,
    appBaseUrl,
    endpoint: normalizeBaseUrl(endpoint),
  };
}

function parseMercadoPagoError(statusCode: number, payloadText: string): string {
  if (!payloadText) {
    return "Nao foi possivel iniciar assinatura no Mercado Pago agora.";
  }

  try {
    const payload = JSON.parse(payloadText) as {
      message?: unknown;
      error?: unknown;
      cause?: Array<{ description?: unknown }> | unknown;
    };

    const directMessage = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : null;
    if (directMessage && directMessage.trim()) {
      return `Mercado Pago: ${directMessage.trim()}`;
    }

    if (Array.isArray(payload.cause) && payload.cause.length > 0) {
      const causeMessage = payload.cause
        .map((item) => (typeof item?.description === "string" ? item.description : null))
        .filter((value): value is string => Boolean(value))
        .join("; ");
      if (causeMessage) {
        return `Mercado Pago: ${causeMessage}`;
      }
    }
  } catch {
    // fallback abaixo
  }

  if (statusCode >= 500) {
    return "Mercado Pago indisponivel no momento. Tente novamente em instantes.";
  }

  return "Nao foi possivel iniciar assinatura no Mercado Pago com os dados atuais.";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isBillingSchemaOutdatedError(error: unknown): boolean {
  const messages: string[] = [];
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === "string") {
      messages.push(current.toLowerCase());
      continue;
    }

    if (typeof current === "object") {
      const maybeError = current as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof maybeError.message === "string") {
        messages.push(maybeError.message.toLowerCase());
      }
      if (typeof maybeError.code === "string") {
        messages.push(maybeError.code.toLowerCase());
      }
      if (maybeError.cause !== undefined) {
        queue.push(maybeError.cause);
      }
    }
  }

  const combined = messages.join(" | ");
  if (!combined) return false;

  const hasKnownDbCode = combined.includes("42703") || combined.includes("42p01");
  if (!hasKnownDbCode) return false;

  return (
    combined.includes("user_subscriptions")
    || combined.includes("billing_webhook_events")
    || combined.includes("subscription_tier")
    || combined.includes("trial_started_at")
    || combined.includes("trial_ends_at")
    || combined.includes("trial_used_at")
    || combined.includes("does not exist")
    || combined.includes("undefined column")
    || combined.includes("relation")
  );
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function extractTrialFromSubscription(
  subscription: UserSubscription | null,
  now: Date,
): TrialSnapshot {
  if (!subscription) {
    return {
      startedAt: null,
      endsAt: null,
      usedAt: null,
      isActive: false,
      wasUsed: false,
    };
  }

  const rawPayload = (subscription.rawPayload && typeof subscription.rawPayload === "object")
    ? subscription.rawPayload as {
      trial?: {
        startedAt?: unknown;
        endsAt?: unknown;
        usedAt?: unknown;
      };
    }
    : null;

  const trialBlock = rawPayload?.trial;
  const providerStatus = normalizeMercadoPagoStatus(subscription.providerStatus);
  const hasTrialFlag = providerStatus === "trialing" || Boolean(trialBlock);

  if (!hasTrialFlag) {
    return {
      startedAt: null,
      endsAt: null,
      usedAt: null,
      isActive: false,
      wasUsed: false,
    };
  }

  const startedAt =
    parseIsoDate(trialBlock?.startedAt)
    ?? subscription.startedAt
    ?? null;
  const endsAt =
    parseIsoDate(trialBlock?.endsAt)
    ?? subscription.currentPeriodEnd
    ?? null;
  const usedAt =
    parseIsoDate(trialBlock?.usedAt)
    ?? startedAt
    ?? null;

  const isActive = Boolean(endsAt && endsAt.getTime() > now.getTime());
  const wasUsed = Boolean(usedAt || startedAt || endsAt);

  return {
    startedAt,
    endsAt,
    usedAt,
    isActive,
    wasUsed,
  };
}

function normalizeMercadoPagoStatus(status: string | null | undefined): string {
  if (!status) return "pending";
  return status.trim().toLowerCase();
}

function mapMercadoPagoStatus(status: string | null | undefined): {
  localStatus: Exclude<BillingSubscriptionStatus, "no_subscription">;
} {
  const normalized = normalizeMercadoPagoStatus(status);

  if (normalized === "authorized" || normalized === "approved" || normalized === "active") {
    return { localStatus: "active" };
  }

  if (normalized === "paused") {
    return { localStatus: "paused" };
  }

  if (
    normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "cancelled_by_user"
    || normalized === "stopped"
  ) {
    return { localStatus: "canceled" };
  }

  if (normalized === "expired") {
    return { localStatus: "expired" };
  }

  if (normalized === "rejected") {
    return { localStatus: "rejected" };
  }

  return { localStatus: "pending" };
}

function toSafeProviderEventId(value: string): string {
  return value.slice(0, 180);
}

function parseMercadoPagoSignature(signatureHeader: string): { ts: string; v1: string } | null {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let ts = "";
  let v1 = "";
  for (const part of parts) {
    const [keyRaw, valueRaw] = part.split("=", 2);
    const key = keyRaw?.trim().toLowerCase();
    const value = valueRaw?.trim();
    if (!key || !value) continue;
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }

  if (!ts || !v1) return null;
  return { ts, v1: v1.toLowerCase() };
}

function safeCompareHexSignature(expectedHex: string, actualHex: string): boolean {
  const normalizedExpected = expectedHex.toLowerCase();
  const normalizedActual = actualHex.toLowerCase();
  if (normalizedExpected.length !== normalizedActual.length) return false;
  const expectedBuffer = Buffer.from(normalizedExpected, "hex");
  const actualBuffer = Buffer.from(normalizedActual, "hex");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function extractString(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function buildFallbackProviderEventId(payload: unknown, queryId: string | null, topic: string | null): string {
  const content = JSON.stringify({
    queryId,
    topic,
    payload,
  });
  const hash = createHash("sha256").update(content ?? "empty").digest("hex").slice(0, 32);
  return `generated:${hash}`;
}

export class BillingServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class BillingService {
  constructor(private readonly dataStorage: IStorage = storage) {}

  private async getMercadoPagoConfig(): Promise<MercadoPagoConfig> {
    return resolveMercadoPagoConfig();
  }

  private async cancelMercadoPagoPreapprovalById(
    config: MercadoPagoConfig,
    providerSubscriptionId: string,
  ): Promise<void> {
    let response;
    try {
      response = await fetch(
        `${config.endpoint}/preapproval/${encodeURIComponent(providerSubscriptionId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "cancelled",
          }),
        },
      );
    } catch (error) {
      throw new BillingServiceError(503, "Nao foi possivel conectar ao Mercado Pago para reiniciar o checkout.");
    }

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      const payloadText = await response.text();
      writeTechnicalLog({
        event: "billing.checkout.pending_reset_failed",
        source: "billing.service",
        level: "error",
        data: {
          providerSubscriptionId,
          statusCode: response.status,
          providerResponse: payloadText,
        },
      });
      throw new BillingServiceError(
        response.status >= 500 ? 503 : 400,
        "Existe assinatura pendente sem link de pagamento e nao foi possivel reiniciar automaticamente. Cancele a pendencia e tente novamente.",
      );
    }
  }

  private async fetchMercadoPagoPreapprovalById(
    config: MercadoPagoConfig,
    providerSubscriptionId: string,
  ): Promise<ResolvedMercadoPagoSubscription | null> {
    let response;
    try {
      response = await fetch(`${config.endpoint}/preapproval/${encodeURIComponent(providerSubscriptionId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      });
    } catch (error) {
      writeTechnicalLog({
        event: "billing.webhook.provider_fetch_failed",
        source: "billing.service",
        level: "error",
        data: {
          providerSubscriptionId,
          error: toErrorLog(error),
        },
      });
      throw new BillingServiceError(503, "Falha ao consultar assinatura no Mercado Pago.");
    }

    if (response.status === 404) {
      return null;
    }

    const payloadText = await response.text();
    if (!response.ok) {
      writeTechnicalLog({
        event: "billing.webhook.provider_fetch_error",
        source: "billing.service",
        level: "error",
        data: {
          providerSubscriptionId,
          statusCode: response.status,
          payloadText,
        },
      });
      throw new BillingServiceError(503, "Mercado Pago indisponivel para validar assinatura.");
    }

    let payload: MercadoPagoPreapprovalResponse;
    try {
      payload = JSON.parse(payloadText) as MercadoPagoPreapprovalResponse;
    } catch {
      throw new BillingServiceError(502, "Resposta invalida do Mercado Pago ao validar assinatura.");
    }

    const resolvedId = extractString(payload.id) ?? providerSubscriptionId;
    const status = normalizeMercadoPagoStatus(extractString(payload.status));
    const amount = normalizeAmount(payload.auto_recurring && typeof payload.auto_recurring === "object"
      ? extractString((payload.auto_recurring as { transaction_amount?: unknown }).transaction_amount)
      : null);
    const currency = payload.auto_recurring && typeof payload.auto_recurring === "object"
      ? normalizeOptionalText(extractString((payload.auto_recurring as { currency_id?: unknown }).currency_id))
      : null;

    return {
      providerSubscriptionId: resolvedId,
      externalReference: normalizeOptionalText(extractString(payload.external_reference)),
      providerStatus: status,
      providerPlanId: normalizeOptionalText(extractString(payload.preapproval_plan_id)),
      amount,
      currency,
      startedAt: parseIsoDate(payload.date_created),
      currentPeriodEnd: parseIsoDate(payload.next_payment_date),
      rawPayload: payload,
    };
  }

  private async searchMercadoPagoPreapprovalByExternalReference(
    config: MercadoPagoConfig,
    externalReference: string,
  ): Promise<ResolvedMercadoPagoSubscription | null> {
    let response;
    try {
      response = await fetch(
        `${config.endpoint}/preapproval/search?external_reference=${encodeURIComponent(externalReference)}&limit=1&sort=date_created&criteria=desc`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
          },
        },
      );
    } catch (error) {
      writeTechnicalLog({
        event: "billing.webhook.provider_search_failed",
        source: "billing.service",
        level: "error",
        data: {
          externalReference,
          error: toErrorLog(error),
        },
      });
      throw new BillingServiceError(503, "Falha ao consultar assinatura no Mercado Pago.");
    }

    const payloadText = await response.text();
    if (!response.ok) {
      writeTechnicalLog({
        event: "billing.webhook.provider_search_error",
        source: "billing.service",
        level: "error",
        data: {
          externalReference,
          statusCode: response.status,
          payloadText,
        },
      });
      throw new BillingServiceError(503, "Mercado Pago indisponivel para validar assinatura.");
    }

    let payload: MercadoPagoSearchResponse;
    try {
      payload = JSON.parse(payloadText) as MercadoPagoSearchResponse;
    } catch {
      throw new BillingServiceError(502, "Resposta invalida do Mercado Pago ao buscar assinatura.");
    }

    const first = Array.isArray(payload.results) && payload.results.length > 0
      ? payload.results[0] as MercadoPagoPreapprovalResponse
      : null;

    if (!first) return null;

    const providerSubscriptionId = extractString(first.id);
    if (!providerSubscriptionId) return null;

    return this.fetchMercadoPagoPreapprovalById(config, providerSubscriptionId);
  }

  private async findLocalSubscriptionByProviderIdentifiers(params: {
    providerSubscriptionId?: string | null;
    externalReference?: string | null;
  }): Promise<UserSubscription | null> {
    const providerSubscriptionId = normalizeOptionalText(params.providerSubscriptionId);
    if (providerSubscriptionId) {
      const [row] = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.provider, "mercado_pago"),
          eq(userSubscriptions.providerSubscriptionId, providerSubscriptionId),
        ))
        .limit(1);
      if (row) return row;
    }

    const externalReference = normalizeOptionalText(params.externalReference);
    if (externalReference) {
      const [row] = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.provider, "mercado_pago"),
          eq(userSubscriptions.externalReference, externalReference),
        ))
        .limit(1);
      if (row) return row;
    }

    return null;
  }

  private validateMercadoPagoWebhookSignature(input: {
    webhookSecret: string;
    dataId: string | null;
    xRequestId: string | null;
    xSignature: string | null;
  }): boolean {
    if (!input.webhookSecret) return true;
    if (!input.dataId || !input.xRequestId || !input.xSignature) return false;

    const parsedSignature = parseMercadoPagoSignature(input.xSignature);
    if (!parsedSignature) return false;

    const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${parsedSignature.ts};`;
    const expected = createHmac("sha256", input.webhookSecret)
      .update(manifest)
      .digest("hex");

    return safeCompareHexSignature(expected, parsedSignature.v1);
  }

  private async updateWebhookEventStatus(
    eventId: string,
    status: BillingWebhookEventStatus,
    processedAt: Date | null = new Date(),
  ): Promise<void> {
    await db.update(billingWebhookEvents)
      .set({
        status,
        processedAt,
      })
      .where(eq(billingWebhookEvents.id, eventId));
  }

  async getCurrentSubscription(userId: string): Promise<UserSubscription | null> {
    const [row] = await db.select().from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.updatedAt), desc(userSubscriptions.createdAt))
      .limit(1);

    return row ?? null;
  }

  private async findSubscriptionForUpsert(input: UpsertLocalSubscriptionInput): Promise<UserSubscription | null> {
    const providerSubscriptionId = normalizeOptionalText(input.providerSubscriptionId);
    if (providerSubscriptionId) {
      const [row] = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.provider, input.provider),
          eq(userSubscriptions.providerSubscriptionId, providerSubscriptionId),
        ))
        .limit(1);
      if (row) return row;
    }

    const externalReference = normalizeOptionalText(input.externalReference);
    if (externalReference) {
      const [row] = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.provider, input.provider),
          eq(userSubscriptions.externalReference, externalReference),
        ))
        .limit(1);
      if (row) return row;
    }

    const [row] = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, input.userId),
        eq(userSubscriptions.provider, input.provider),
      ))
      .orderBy(desc(userSubscriptions.updatedAt), desc(userSubscriptions.createdAt))
      .limit(1);
    return row ?? null;
  }

  async upsertLocalSubscription(input: UpsertLocalSubscriptionInput): Promise<UserSubscription> {
    const now = new Date();
    const existing = await this.findSubscriptionForUpsert(input);

    const values = {
      userId: input.userId,
      provider: input.provider,
      providerSubscriptionId: normalizeOptionalText(input.providerSubscriptionId),
      providerPlanId: normalizeOptionalText(input.providerPlanId),
      externalReference: normalizeOptionalText(input.externalReference),
      status: input.status,
      providerStatus: normalizeOptionalText(input.providerStatus),
      amount: normalizeAmount(input.amount),
      currency: normalizeOptionalText(input.currency) ?? "BRL",
      startedAt: input.startedAt ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      canceledAt: input.canceledAt ?? null,
      lastWebhookAt: input.lastWebhookAt ?? null,
      lastSyncAt: input.lastSyncAt ?? null,
      rawPayload: input.rawPayload ?? null,
      updatedAt: now,
    } as const;

    if (existing) {
      const [updated] = await db.update(userSubscriptions)
        .set(values)
        .where(eq(userSubscriptions.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(userSubscriptions).values({
      ...values,
      createdAt: now,
    }).returning();
    return created;
  }

  async registerWebhookEventIdempotent(input: RegisterWebhookEventInput): Promise<RegisterWebhookEventResult> {
    const providerEventId = normalizeOptionalText(input.providerEventId);
    if (!providerEventId) {
      throw new Error("providerEventId obrigatorio para registrar evento de webhook");
    }

    const [existing] = await db.select().from(billingWebhookEvents)
      .where(and(
        eq(billingWebhookEvents.provider, input.provider),
        eq(billingWebhookEvents.providerEventId, providerEventId),
      ))
      .limit(1);

    if (existing) {
      return {
        alreadyExists: true,
        event: existing,
      };
    }

    const [created] = await db.insert(billingWebhookEvents).values({
      provider: input.provider,
      providerEventId,
      topic: normalizeOptionalText(input.topic),
      payload: input.payload ?? null,
      processedAt: input.processedAt ?? null,
      status: input.status ?? "received",
    }).returning();

    return {
      alreadyExists: false,
      event: created,
    };
  }

  private buildEffectiveAccessFromState(params: {
    user: {
      subscriptionTier?: unknown;
      trialStartedAt?: Date | null;
      trialEndsAt?: Date | null;
      trialUsedAt?: Date | null;
    };
    currentSubscription: UserSubscription | null;
    now: Date;
  }): EffectiveSubscriptionAccess {
    const { user, currentSubscription, now } = params;
    const storedAccess = buildSubscriptionAccess(user.subscriptionTier);
    const subscriptionTierStored = storedAccess.subscriptionTier;
    const subscriptionStatus = currentSubscription
      ? toBillingStatus(currentSubscription.status)
      : "no_subscription";

    const userTrialStartedAt = user.trialStartedAt ?? null;
    const userTrialEndsAt = user.trialEndsAt ?? null;
    const userTrialUsedAt = user.trialUsedAt ?? null;
    const subscriptionTrial = extractTrialFromSubscription(currentSubscription, now);
    const trialStartedAt = userTrialStartedAt ?? subscriptionTrial.startedAt;
    const trialEndsAt = userTrialEndsAt ?? subscriptionTrial.endsAt;
    const trialUsedAt = userTrialUsedAt ?? subscriptionTrial.usedAt;
    const trialIsActive = Boolean(
      trialEndsAt
      && trialEndsAt.getTime() > now.getTime(),
    );
    const trialWasUsed = Boolean(
      trialUsedAt
      || trialStartedAt
      || trialEndsAt
      || subscriptionTrial.wasUsed,
    );

    const effectiveTier = resolveEffectiveTierByPriority({
      subscriptionTierStored,
      subscriptionStatus,
      trialIsActive,
    });
    const effectiveAccess = buildSubscriptionAccess(effectiveTier);
    let billingStatus: BillingEffectiveStatus;
    if (isPaidSubscriptionStatus(subscriptionStatus)) {
      billingStatus = "active";
    } else if (trialIsActive) {
      billingStatus = "trialing";
    } else if (subscriptionStatus !== "no_subscription") {
      billingStatus = subscriptionStatus;
    } else if (subscriptionTierStored === "premium") {
      // Mantém a leitura do Perfil coerente quando o tier armazenado já é premium.
      billingStatus = "active";
    } else {
      billingStatus = "no_subscription";
    }

    return {
      effectiveTier,
      subscriptionTierStored,
      billingStatus,
      trial: {
        startedAt: trialStartedAt,
        endsAt: trialEndsAt,
        usedAt: trialUsedAt,
        isActive: trialIsActive,
      },
      features: effectiveAccess.features,
      limits: effectiveAccess.limits,
      canStartTrial: !trialWasUsed,
      canSubscribe: effectiveTier !== "premium" && !isPaidSubscriptionStatus(subscriptionStatus),
      canCancel:
        subscriptionStatus === "active"
        || subscriptionStatus === "pending"
        || subscriptionStatus === "paused",
      subscription: toSubscriptionResponse(currentSubscription),
    };
  }

  async getEffectiveSubscriptionAccess(userId: string): Promise<EffectiveSubscriptionAccess> {
    const user = await this.dataStorage.getUser(userId);
    if (!user) {
      throw new BillingServiceError(404, "Usuario nao encontrado.");
    }

    const currentSubscription = await this.getCurrentSubscription(userId);
    return this.buildEffectiveAccessFromState({
      user,
      currentSubscription,
      now: new Date(),
    });
  }

  async syncUserSubscriptionTier(userId: string, reason: string): Promise<EffectiveSubscriptionAccess> {
    const access = await this.getEffectiveSubscriptionAccess(userId);

    if (access.subscriptionTierStored === access.effectiveTier) {
      return access;
    }

    await db.update(users)
      .set({
        subscriptionTier: access.effectiveTier,
      })
      .where(eq(users.id, userId));

    writeTechnicalLog({
      event: "billing.subscription_tier.synced",
      source: "billing.service",
      level: "info",
      data: {
        userId,
        reason,
        previousTier: access.subscriptionTierStored,
        nextTier: access.effectiveTier,
        billingStatus: access.billingStatus,
      },
    });

    return {
      ...access,
      subscriptionTierStored: access.effectiveTier,
    };
  }

  async getStatus(userId: string, _user?: BillingUserLike): Promise<BillingStatusResponse> {
    const access = await this.syncUserSubscriptionTier(userId, "billing_status_read");
    return {
      subscriptionTier: access.effectiveTier,
      effectiveTier: access.effectiveTier,
      subscriptionTierStored: access.subscriptionTierStored,
      billingStatus: access.billingStatus,
      trial: access.trial,
      features: access.features,
      limits: access.limits,
      canStartTrial: access.canStartTrial,
      canSubscribe: access.canSubscribe,
      canCancel: access.canCancel,
      subscription: access.subscription,
    };
  }

  async startTrial(userId: string): Promise<BillingStatusResponse> {
    try {
      const user = await this.dataStorage.getUser(userId);
      if (!user) {
        throw new BillingServiceError(404, "Usuario nao encontrado.");
      }

      const currentSubscription = await this.getCurrentSubscription(userId);
      if (currentSubscription && toBillingStatus(currentSubscription.status) === "active") {
        throw new BillingServiceError(409, "Sua assinatura premium ja esta ativa.");
      }

      const trialState = this.buildEffectiveAccessFromState({
        user,
        currentSubscription,
        now: new Date(),
      }).trial;
      if (trialState.usedAt || trialState.startedAt || trialState.endsAt) {
        throw new BillingServiceError(409, "Seu teste gratis de 7 dias ja foi utilizado.");
      }

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000));
      const currentRawPayload = (currentSubscription?.rawPayload && typeof currentSubscription.rawPayload === "object")
        ? currentSubscription.rawPayload as Record<string, unknown>
        : {};

      const trialPayload = {
        ...currentRawPayload,
        trial: {
          startedAt: now.toISOString(),
          endsAt: trialEndsAt.toISOString(),
          usedAt: now.toISOString(),
        },
      };

      if (currentSubscription) {
        await db.update(userSubscriptions)
          .set({
            // "pending" é compatível com o check constraint atual; trial fica explícito em providerStatus/rawPayload.
            status: "pending",
            providerStatus: "trialing",
            startedAt: now,
            currentPeriodEnd: trialEndsAt,
            canceledAt: null,
            lastSyncAt: now,
            rawPayload: trialPayload,
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, currentSubscription.id));
      } else {
        await db.insert(userSubscriptions)
          .values({
            userId,
            provider: "mercado_pago",
            status: "pending",
            providerStatus: "trialing",
            startedAt: now,
            currentPeriodEnd: trialEndsAt,
            currency: "BRL",
            rawPayload: trialPayload,
            createdAt: now,
            updatedAt: now,
            lastSyncAt: now,
          });
      }

      await this.syncUserSubscriptionTier(userId, "trial_started");
      return this.getStatus(userId);
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw error;
      }

      if (isBillingSchemaOutdatedError(error)) {
        writeTechnicalLog({
          event: "billing.trial.start.schema_outdated",
          source: "billing.service",
          level: "error",
          data: {
            userId,
            error: toErrorLog(error),
          },
        });

        throw new BillingServiceError(
          500,
          "Estrutura do banco desatualizada para iniciar o teste gratis. Aplique as migrations de billing/trial e tente novamente.",
        );
      }

      writeTechnicalLog({
        event: "billing.trial.start.unexpected_error",
        source: "billing.service",
        level: "error",
        data: {
          userId,
          error: toErrorLog(error),
        },
      });
      throw error;
    }
  }

  async processMercadoPagoWebhook(input: {
    query: Record<string, unknown>;
    payload: unknown;
    rawBody: string;
    xSignature: string | null;
    xRequestId: string | null;
  }): Promise<BillingWebhookProcessResult> {
    const topic =
      normalizeOptionalText(extractString(input.query.topic))
      ?? normalizeOptionalText(extractString(input.query.type))
      ?? normalizeOptionalText(extractString((input.payload as { topic?: unknown } | null | undefined)?.topic))
      ?? normalizeOptionalText(extractString((input.payload as { type?: unknown } | null | undefined)?.type));

    const queryId = normalizeOptionalText(extractString(input.query.id));
    const payloadId = normalizeOptionalText(extractString((input.payload as { id?: unknown } | null | undefined)?.id));
    const providerEventId = toSafeProviderEventId(
      normalizeOptionalText(input.xRequestId)
      ?? queryId
      ?? payloadId
      ?? buildFallbackProviderEventId(input.payload, queryId, topic),
    );

    const dataIdFromPayload = normalizeOptionalText(
      extractString((input.payload as { data?: { id?: unknown } } | null | undefined)?.data?.id),
    );
    const dataIdFromQuery = normalizeOptionalText(
      extractString((input.query as Record<string, unknown>)["data.id"]),
    );
    const dataId = dataIdFromPayload ?? dataIdFromQuery ?? queryId;

    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
    if (webhookSecret.length > 0) {
      const signatureValid = this.validateMercadoPagoWebhookSignature({
        webhookSecret,
        dataId,
        xRequestId: normalizeOptionalText(input.xRequestId),
        xSignature: normalizeOptionalText(input.xSignature),
      });

      if (!signatureValid) {
        return {
          outcome: "ignored",
          reason: "invalid_signature",
          providerEventId,
        };
      }
    }

    const eventRegistration = await this.registerWebhookEventIdempotent({
      provider: "mercado_pago",
      providerEventId,
      topic,
      payload: {
        query: input.query,
        body: input.payload,
        rawBody: input.rawBody,
      },
      status: "received",
    });

    if (eventRegistration.alreadyExists) {
      return {
        outcome: "ignored",
        reason: "duplicate_event",
        providerEventId,
      };
    }

    try {
      const externalReferenceFromPayload = normalizeOptionalText(
        extractString((input.payload as { external_reference?: unknown } | null | undefined)?.external_reference),
      );
      const externalReferenceFromQuery = normalizeOptionalText(
        extractString((input.query as Record<string, unknown>).external_reference),
      );
      const webhookExternalReference = externalReferenceFromPayload ?? externalReferenceFromQuery;

      const providerSubscriptionIdHint = dataId;
      const config = await this.getMercadoPagoConfig();

      let remoteSubscription: ResolvedMercadoPagoSubscription | null = null;
      if (providerSubscriptionIdHint) {
        remoteSubscription = await this.fetchMercadoPagoPreapprovalById(config, providerSubscriptionIdHint);
      }
      if (!remoteSubscription && webhookExternalReference) {
        remoteSubscription = await this.searchMercadoPagoPreapprovalByExternalReference(config, webhookExternalReference);
      }

      if (!remoteSubscription) {
        await this.updateWebhookEventStatus(eventRegistration.event.id, "ignored", new Date());
        return {
          outcome: "ignored",
          reason: "subscription_not_found_in_provider",
          providerEventId,
        };
      }

      const localSubscription = await this.findLocalSubscriptionByProviderIdentifiers({
        providerSubscriptionId: remoteSubscription.providerSubscriptionId,
        externalReference: remoteSubscription.externalReference ?? webhookExternalReference,
      });

      if (!localSubscription) {
        await this.updateWebhookEventStatus(eventRegistration.event.id, "ignored", new Date());
        return {
          outcome: "ignored",
          reason: "local_subscription_not_found",
          providerEventId,
        };
      }

      const mappedStatus = mapMercadoPagoStatus(remoteSubscription.providerStatus);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.update(userSubscriptions)
          .set({
            providerSubscriptionId: remoteSubscription.providerSubscriptionId,
            providerPlanId: remoteSubscription.providerPlanId,
            externalReference: remoteSubscription.externalReference ?? localSubscription.externalReference,
            status: mappedStatus.localStatus,
            providerStatus: remoteSubscription.providerStatus,
            amount: remoteSubscription.amount ?? localSubscription.amount,
            currency: remoteSubscription.currency ?? localSubscription.currency,
            startedAt: remoteSubscription.startedAt ?? localSubscription.startedAt,
            currentPeriodEnd: remoteSubscription.currentPeriodEnd ?? localSubscription.currentPeriodEnd,
            canceledAt: mappedStatus.localStatus === "canceled" ? now : null,
            lastWebhookAt: now,
            lastSyncAt: now,
            rawPayload: {
              webhook: {
                query: input.query,
                body: input.payload,
              },
              provider: remoteSubscription.rawPayload,
            },
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, localSubscription.id));

        await tx.update(billingWebhookEvents)
          .set({
            status: "processed",
            processedAt: now,
          })
          .where(eq(billingWebhookEvents.id, eventRegistration.event.id));
      });

      await this.syncUserSubscriptionTier(localSubscription.userId, "mercadopago_webhook");

      return {
        outcome: "processed",
        reason: `status_synced_${mappedStatus.localStatus}`,
        providerEventId,
      };
    } catch (error) {
      await this.updateWebhookEventStatus(eventRegistration.event.id, "error", new Date());
      throw error;
    }
  }

  async cancelMercadoPagoSubscription(userId: string): Promise<BillingCancelResponse> {
    const currentSubscription = await this.getCurrentSubscription(userId);
    if (!currentSubscription) {
      throw new BillingServiceError(404, "Nenhuma assinatura encontrada para cancelar.");
    }

    if (currentSubscription.provider !== "mercado_pago") {
      throw new BillingServiceError(400, "Assinatura atual usa provedor nao suportado para cancelamento manual.");
    }

    if (
      currentSubscription.status === "canceled"
      || currentSubscription.status === "expired"
      || currentSubscription.status === "rejected"
    ) {
      throw new BillingServiceError(409, "Assinatura ja esta encerrada.");
    }

    if (!currentSubscription.providerSubscriptionId) {
      throw new BillingServiceError(409, "Assinatura sem identificador no provedor. Nao foi possivel cancelar automaticamente.");
    }

    const config = await this.getMercadoPagoConfig();

    let response;
    try {
      response = await fetch(
        `${config.endpoint}/preapproval/${encodeURIComponent(currentSubscription.providerSubscriptionId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "cancelled",
          }),
        },
      );
    } catch (error) {
      writeTechnicalLog({
        event: "billing.cancel.request_failed",
        source: "billing.service",
        level: "error",
        data: {
          userId,
          subscriptionId: currentSubscription.id,
          providerSubscriptionId: currentSubscription.providerSubscriptionId,
          error: toErrorLog(error),
        },
      });
      throw new BillingServiceError(503, "Nao foi possivel conectar ao Mercado Pago para cancelar a assinatura.");
    }

    const payloadText = await response.text();
    if (!response.ok) {
      writeTechnicalLog({
        event: "billing.cancel.provider_error",
        source: "billing.service",
        level: "error",
        data: {
          userId,
          subscriptionId: currentSubscription.id,
          providerSubscriptionId: currentSubscription.providerSubscriptionId,
          statusCode: response.status,
          providerResponse: payloadText,
        },
      });
      throw new BillingServiceError(
        response.status >= 500 ? 503 : 400,
        "Nao foi possivel cancelar a assinatura no Mercado Pago no momento.",
      );
    }

    let providerPayload: MercadoPagoPreapprovalResponse | null = null;
    try {
      providerPayload = payloadText ? JSON.parse(payloadText) as MercadoPagoPreapprovalResponse : null;
    } catch {
      providerPayload = null;
    }

    const providerStatus = normalizeMercadoPagoStatus(extractString(providerPayload?.status) ?? "cancelled");
    const mapped = mapMercadoPagoStatus(providerStatus);
    const now = new Date();

    await db.update(userSubscriptions)
      .set({
        status: mapped.localStatus,
        providerStatus,
        canceledAt: now,
        lastSyncAt: now,
        updatedAt: now,
        rawPayload: {
          cancelByUser: true,
          requestedAt: now.toISOString(),
          providerResponse: providerPayload ?? payloadText,
        },
      })
      .where(eq(userSubscriptions.id, currentSubscription.id));

    const syncedAccess = await this.syncUserSubscriptionTier(userId, "mercadopago_cancel");
    const status = await this.getStatus(userId);
    const trialEndsAtLabel = syncedAccess.trial.endsAt
      ? syncedAccess.trial.endsAt.toISOString().slice(0, 10)
      : "o fim do periodo de teste";
    const message = syncedAccess.trial.isActive
      ? `Assinatura cancelada com sucesso. Seu teste gratis permanece ativo ate ${trialEndsAtLabel}.`
      : "Assinatura cancelada com sucesso. O plano foi rebaixado para Free.";

    return {
      message,
      status,
    };
  }

  async createMercadoPagoCheckout(userId: string): Promise<BillingCheckoutResponse> {
    const config = await this.getMercadoPagoConfig();
    const currentSubscription = await this.getCurrentSubscription(userId);

    if (currentSubscription?.status === "active") {
      throw new BillingServiceError(409, "Sua assinatura premium ja esta ativa.");
    }

    if (currentSubscription?.status === "pending") {
      const savedCheckoutUrl = extractCheckoutUrlFromRawPayload(currentSubscription.rawPayload);
      if (savedCheckoutUrl) {
        return {
          provider: "mercado_pago",
          billingStatus: "pending",
          checkoutUrl: savedCheckoutUrl,
          externalReference: currentSubscription.externalReference ?? null,
          checkoutMode: "resume",
          subscription: {
            id: currentSubscription.id,
            status: currentSubscription.status,
            providerStatus: currentSubscription.providerStatus ?? null,
            providerSubscriptionId: currentSubscription.providerSubscriptionId ?? null,
          },
        };
      }

      if (currentSubscription.providerSubscriptionId) {
        await this.cancelMercadoPagoPreapprovalById(config, currentSubscription.providerSubscriptionId);
      }

      const now = new Date();
      await db.update(userSubscriptions)
        .set({
          status: "canceled",
          providerStatus: "cancelled",
          canceledAt: now,
          updatedAt: now,
          lastSyncAt: now,
          rawPayload: {
            checkoutResetReason: "pending_without_checkout_url",
            previousRawPayload: currentSubscription.rawPayload ?? null,
            resetAt: now.toISOString(),
          },
        })
        .where(eq(userSubscriptions.id, currentSubscription.id));
    }

    const user = await this.dataStorage.getUser(userId);
    if (!user) {
      throw new BillingServiceError(404, "Usuario nao encontrado para iniciar assinatura.");
    }

    const payerEmail = user.username?.trim() ?? "";
    if (!isValidEmail(payerEmail)) {
      throw new BillingServiceError(
        400,
        "Nao foi possivel iniciar a assinatura: sua conta precisa de um e-mail valido como usuario.",
      );
    }

    const externalReference = buildExternalReference(userId);
    const webhookUrl = `${config.appBaseUrl}/api/billing/mercadopago/webhook`;
    const backUrl = `${config.appBaseUrl}/perfil`;
    const requestPayload = {
      reason: config.reason,
      payer_email: payerEmail,
      external_reference: externalReference,
      back_url: backUrl,
      notification_url: webhookUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: config.amount,
        currency_id: config.currency,
      },
      status: "pending",
    };

    let response;
    try {
      response = await fetch(`${config.endpoint}/preapproval`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
    } catch (error) {
      writeTechnicalLog({
        event: "billing.checkout.request_failed",
        source: "billing.service",
        level: "error",
        data: {
          userId,
          error: toErrorLog(error),
        },
      });
      throw new BillingServiceError(503, "Nao foi possivel conectar ao Mercado Pago para iniciar a assinatura.");
    }

    const payloadText = await response.text();
    if (!response.ok) {
      writeTechnicalLog({
        event: "billing.checkout.provider_error",
        source: "billing.service",
        level: "error",
        data: {
          userId,
          statusCode: response.status,
          providerResponse: payloadText,
        },
      });
      throw new BillingServiceError(response.status >= 500 ? 503 : 400, parseMercadoPagoError(response.status, payloadText));
    }

    let providerPayload: MercadoPagoPreapprovalResponse;
    try {
      providerPayload = JSON.parse(payloadText) as MercadoPagoPreapprovalResponse;
    } catch {
      throw new BillingServiceError(502, "Resposta invalida do Mercado Pago ao iniciar a assinatura.");
    }

    const checkoutUrl = extractInitPoint(providerPayload);
    if (!checkoutUrl) {
      throw new BillingServiceError(502, "Mercado Pago nao retornou URL de checkout para assinatura.");
    }

    const providerSubscriptionId = typeof providerPayload.id === "string"
      ? providerPayload.id
      : typeof providerPayload.id === "number"
        ? String(providerPayload.id)
        : null;
    const providerStatus = typeof providerPayload.status === "string"
      ? providerPayload.status
      : "pending";
    const providerPlanId = typeof providerPayload.preapproval_plan_id === "string"
      ? providerPayload.preapproval_plan_id
      : null;

    const localSubscription = await this.upsertLocalSubscription({
      userId,
      provider: "mercado_pago",
      providerSubscriptionId,
      providerPlanId,
      externalReference,
      status: "pending",
      providerStatus,
      amount: config.amount,
      currency: config.currency,
      lastSyncAt: new Date(),
      rawPayload: {
        checkoutUrl,
        mercadoPago: {
          id: providerSubscriptionId,
          status: providerStatus,
          providerPlanId,
        },
      },
    });

    return {
      provider: "mercado_pago",
      billingStatus: "pending",
      checkoutUrl,
      externalReference,
      checkoutMode: "new",
      subscription: {
        id: localSubscription.id,
        status: localSubscription.status,
        providerStatus: localSubscription.providerStatus ?? null,
        providerSubscriptionId: localSubscription.providerSubscriptionId ?? null,
      },
    };
  }
}
