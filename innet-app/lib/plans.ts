export type PlanId = 'free' | 'pro';

export type PlanProduct = 'pro-monthly' | 'pro-annual';

export type PlanEntitlements = {
  contactLimit: number | null;
  factGroupLimit: number | null;
  factsPerGroupLimit: number | null;
  factLengthLimit: number | null;
  allowCustomGroupNames: boolean;
  allowFullPrivacy: boolean;
  allowSyncAcrossDevices: boolean;
  allowAiSuggestions: boolean;
  allowCustomTags: boolean;
};

export type PlanMeta = {
  id: PlanId;
  label: string;
  description: string;
};

export const DEFAULT_PLAN: PlanId = 'free';

const unlimited = null;

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    contactLimit: 50,
    factGroupLimit: 3,
    factsPerGroupLimit: 5,
    factLengthLimit: 128,
    allowCustomGroupNames: false,
    allowFullPrivacy: false,
    allowSyncAcrossDevices: false,
    allowAiSuggestions: false,
    allowCustomTags: false,
  },
  pro: {
    contactLimit: unlimited,
    factGroupLimit: unlimited,
    factsPerGroupLimit: unlimited,
    factLengthLimit: unlimited,
    allowCustomGroupNames: true,
    allowFullPrivacy: true,
    allowSyncAcrossDevices: true,
    allowAiSuggestions: true,
    allowCustomTags: true,
  },
};

export const PLAN_CATALOG: Record<PlanId, PlanMeta> = {
  free: {
    id: 'free',
    label: 'InNet Start',
    description: 'Бесплатный базовый функционал',
  },
  pro: {
    id: 'pro',
    label: 'InNet Pro',
    description: 'Подписка с полным функционалом',
  },
};

export function normalizePlanProduct(value: string | null | undefined): PlanProduct | null {
  if (!value) return null;
  if (value === 'pro-monthly' || value === 'pro-annual') {
    return value;
  }
  return null;
}

export function getPlanEntitlements(plan: PlanId): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan] ?? PLAN_ENTITLEMENTS.free;
}

export function isUnlimited(value: number | null | undefined): boolean {
  return value == null || value === Infinity;
}
