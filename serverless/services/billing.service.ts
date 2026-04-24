import { and, desc, eq } from "drizzle-orm";
import { buildSubscriptionAccess, type SubscriptionTier } from "../../shared/subscription.js";
import {
  billingWebhookEvents,
  userSubscriptions,
  type BillingWebhookEvent,
  type UserSubscription,
} from "../../shared/schema.js";
import { db } from "../db.js";

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

export class BillingService {
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
}
