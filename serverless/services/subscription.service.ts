import type { SubscriptionUsageSnapshot } from "../../shared/subscription.js";
import { calculateRemaining } from "../../shared/subscription.js";
import type { IStorage } from "../storage.js";
import { BillingService } from "./billing.service.js";

export class SubscriptionService {
  constructor(
    private readonly storage: IStorage,
    private readonly billingService: BillingService = new BillingService(storage),
  ) {}

  async getUsage(userId: string): Promise<SubscriptionUsageSnapshot> {
    const access = await this.billingService.syncUserSubscriptionTier(userId, "subscription_usage_read");

    const [cartoes, pessoas, servicos, metas] = await Promise.all([
      this.storage.getCartoes(userId),
      this.storage.getPessoas(userId),
      this.storage.getServicos(userId),
      this.storage.getMetas(userId),
    ]);

    const usage = {
      cartoes: cartoes.length,
      pessoas: pessoas.length,
      servicos: servicos.length,
      metas: metas.length,
    };

    return {
      subscriptionTier: access.effectiveTier,
      limits: access.limits,
      usage,
      remaining: {
        cartoes: calculateRemaining(access.limits.maxCartoes, usage.cartoes),
        pessoas: calculateRemaining(access.limits.maxPessoas, usage.pessoas),
        servicos: calculateRemaining(access.limits.maxServicos, usage.servicos),
        metas: calculateRemaining(access.limits.maxMetas, usage.metas),
      },
    };
  }
}
