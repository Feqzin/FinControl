import { apiRequest } from "@/lib/queryClient";
import {
  INVALID_ICON_ID_REFERENCE_MESSAGE,
  isRemoteIconReference,
} from "@shared/icon-persistence";

export type IconMatchRuleApiModel = {
  id: string;
  userId: string;
  iconId: string;
  normalizedTerm: string;
  originalTerm: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateIconMatchRulesPayload = {
  iconId: string;
  terms: string[];
};

function sanitizeIconMatchRuleIconId(iconId: string): string {
  const trimmed = iconId.trim();
  if (!trimmed || isRemoteIconReference(trimmed)) {
    throw new Error(INVALID_ICON_ID_REFERENCE_MESSAGE);
  }
  return trimmed;
}

export async function fetchIconMatchRules(): Promise<IconMatchRuleApiModel[]> {
  const response = await apiRequest("GET", "/api/icon-match-rules");
  return response.json();
}

export async function createIconMatchRules(payload: CreateIconMatchRulesPayload): Promise<IconMatchRuleApiModel[]> {
  const response = await apiRequest("POST", "/api/icon-match-rules", {
    iconId: sanitizeIconMatchRuleIconId(payload.iconId),
    terms: payload.terms,
  });
  const body = await response.json();
  return Array.isArray(body?.rules) ? body.rules : [];
}

export async function deleteIconMatchRule(ruleId: string): Promise<void> {
  await apiRequest("DELETE", `/api/icon-match-rules/${ruleId}`);
}
