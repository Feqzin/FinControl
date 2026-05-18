import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { iconMatchRules, type IconMatchRule } from "../shared/schema.js";
import type { IconMatchRuleCreateBodyInput } from "../validators/icon-match-rules.validators.js";

const MIN_NORMALIZED_TERM_LENGTH = 3;
const MAX_NORMALIZED_TERM_LENGTH = 140;

function normalizeIconTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeTerms(terms: string[]): Array<{ originalTerm: string; normalizedTerm: string }> {
  const unique = new Map<string, { originalTerm: string; normalizedTerm: string }>();
  for (const raw of terms) {
    const originalTerm = raw.trim();
    if (!originalTerm) continue;
    const normalizedTerm = normalizeIconTerm(originalTerm);
    if (normalizedTerm.length < MIN_NORMALIZED_TERM_LENGTH) continue;
    if (normalizedTerm.length > MAX_NORMALIZED_TERM_LENGTH) continue;
    if (!unique.has(normalizedTerm)) {
      unique.set(normalizedTerm, { originalTerm, normalizedTerm });
    }
  }
  return Array.from(unique.values());
}

export class IconMatchRulesService {
  async list(userId: string): Promise<IconMatchRule[]> {
    return db
      .select()
      .from(iconMatchRules)
      .where(eq(iconMatchRules.userId, userId))
      .orderBy(desc(iconMatchRules.updatedAt), desc(iconMatchRules.createdAt));
  }

  async createOrUpdate(userId: string, payload: IconMatchRuleCreateBodyInput): Promise<IconMatchRule[]> {
    const terms = sanitizeTerms(payload.terms);
    if (terms.length === 0) return [];

    const upserted: IconMatchRule[] = [];
    for (const term of terms) {
      const [existing] = await db
        .select()
        .from(iconMatchRules)
        .where(and(
          eq(iconMatchRules.userId, userId),
          eq(iconMatchRules.normalizedTerm, term.normalizedTerm),
        ))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(iconMatchRules)
          .set({
            iconId: payload.iconId,
            originalTerm: term.originalTerm,
            updatedAt: new Date(),
          })
          .where(and(
            eq(iconMatchRules.id, existing.id),
            eq(iconMatchRules.userId, userId),
          ))
          .returning();
        if (updated) upserted.push(updated);
        continue;
      }

      const [created] = await db
        .insert(iconMatchRules)
        .values({
          userId,
          iconId: payload.iconId,
          normalizedTerm: term.normalizedTerm,
          originalTerm: term.originalTerm,
        })
        .returning();
      if (created) upserted.push(created);
    }

    return upserted;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(iconMatchRules)
      .where(and(
        eq(iconMatchRules.id, id),
        eq(iconMatchRules.userId, userId),
      ))
      .returning({ id: iconMatchRules.id });
    return deleted.length > 0;
  }
}
