import type { Plan } from './enums';

/**
 * Plan entitlements as feature flags (docs/01 D12). No billing in v1: during the pilot,
 * businesses can be moved between plans by hand.
 */
export const PLAN_FEATURES = {
  STARTER: [],
  BUSINESS: ['reorderRecommendations', 'slowMoving', 'anomalyReview', 'pdfReports'],
  PRO: [
    'reorderRecommendations',
    'slowMoving',
    'anomalyReview',
    'pdfReports',
    'multiLocation',
    'customRoles',
  ],
} as const satisfies Record<Plan, readonly string[]>;

export type PlanFeature = (typeof PLAN_FEATURES)['PRO'][number];

export function planHasFeature(plan: Plan, feature: PlanFeature): boolean {
  return (PLAN_FEATURES[plan] as readonly string[]).includes(feature);
}
