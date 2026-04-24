import type { SubscriptionUsageSnapshot } from "../../shared/subscription.js";
import { buildSubscriptionAccess, calculateRemaining } from "../../shared/subscription.js";
import type { IStorage } from "../storage.js";

type SubscriptionUserLike = {
  subscriptionTier?: unknown;
} | null | undefined;

export class SubscriptionService {
  constructor(private readonly storage: IStorage) {}

  async getUsage(userId: string, user: SubscriptionUserLike): Promise<SubscriptionUsageSnapshot> {
    const access = buildSubscriptionAccess(user?.subscriptionTier);

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
      subscriptionTier: access.subscriptionTier,
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

