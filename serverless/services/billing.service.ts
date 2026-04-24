import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { buildSubscriptionAccess, type SubscriptionTier } from "../../shared/subscription.js";
import {
  billingWebhookEvents,
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

type BillingWebhookEventStatus = "received" | "processed" | "ignored" | "error";

export type BillingStatusResponse = {
  subscriptionTier: SubscriptionTier;
  billingStatus: BillingSubscriptionStatus;
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

export type BillingCheckoutResponse = {
  provider: BillingProvider;
  billingStatus: "pending";
  checkoutUrl: string;
  externalReference: string;
  subscription: {
    id: string;
    status: string;
    providerStatus: string | null;
    providerSubscriptionId: string | null;
  };
};

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
  init_point?: unknown;
  sandbox_init_point?: unknown;
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

export class BillingServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class BillingService {
  constructor(private readonly dataStorage: IStorage = storage) {}

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

  async getStatus(userId: string, user: BillingUserLike): Promise<BillingStatusResponse> {
    const access = buildSubscriptionAccess(user?.subscriptionTier);
    const currentSubscription = await this.getCurrentSubscription(userId);

    if (!currentSubscription) {
      return {
        subscriptionTier: access.subscriptionTier,
        billingStatus: "no_subscription",
        subscription: null,
      };
    }

    return {
      subscriptionTier: access.subscriptionTier,
      billingStatus: toBillingStatus(currentSubscription.status),
      subscription: {
        id: currentSubscription.id,
        provider: currentSubscription.provider,
        providerSubscriptionId: currentSubscription.providerSubscriptionId ?? null,
        providerPlanId: currentSubscription.providerPlanId ?? null,
        externalReference: currentSubscription.externalReference ?? null,
        status: currentSubscription.status,
        providerStatus: currentSubscription.providerStatus ?? null,
        amount: currentSubscription.amount ?? null,
        currency: currentSubscription.currency,
        startedAt: currentSubscription.startedAt ?? null,
        currentPeriodEnd: currentSubscription.currentPeriodEnd ?? null,
        canceledAt: currentSubscription.canceledAt ?? null,
        lastWebhookAt: currentSubscription.lastWebhookAt ?? null,
        lastSyncAt: currentSubscription.lastSyncAt ?? null,
        createdAt: currentSubscription.createdAt,
        updatedAt: currentSubscription.updatedAt,
      },
    };
  }

  async createMercadoPagoCheckout(userId: string): Promise<BillingCheckoutResponse> {
    const config = resolveMercadoPagoConfig();
    const currentSubscription = await this.getCurrentSubscription(userId);

    if (currentSubscription?.status === "active") {
      throw new BillingServiceError(409, "Sua assinatura premium ja esta ativa.");
    }

    if (currentSubscription?.status === "pending") {
      throw new BillingServiceError(409, "Pagamento pendente. Aguarde a confirmacao da assinatura para continuar.");
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
      subscription: {
        id: localSubscription.id,
        status: localSubscription.status,
        providerStatus: localSubscription.providerStatus ?? null,
        providerSubscriptionId: localSubscription.providerSubscriptionId ?? null,
      },
    };
  }
}
