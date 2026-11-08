import { z } from 'zod';

/**
 * Per-business settings stored in `Business.settings` (JSON).
 * Defaults and meaning: docs/02-data-model.md §6 and docs/04-inventory-intelligence.md.
 */
export const BusinessSettingsSchema = z.object({
  allowNegativeStock: z.boolean().default(false),
  employeeMaxDiscountPercent: z.number().min(0).max(100).default(5),
  analysis: z
    .object({
      salesWindowDays: z.number().int().min(7).max(365).default(30),
      safetyStockDays: z.number().min(0).max(60).default(3),
      reviewPeriodDays: z.number().int().min(1).max(90).default(14),
      slowMovingDays: z.number().int().min(14).max(365).default(60),
      deadStockDays: z.number().int().min(30).max(730).default(90),
    })
    .prefault({}),
  anomaly: z
    .object({
      maxDaysOfSales: z.number().positive().default(7), // rule R1
      valueThreshold: z.number().nonnegative().default(100_000), // rule R2, business currency
      shareOfStockPercent: z.number().min(0).max(100).default(20), // rule R3
      modifiedZThreshold: z.number().positive().default(3.5), // rule R4
      perUserDailyNegativeCount: z.number().int().positive().default(5), // rule R5
    })
    .prefault({}),
  expiryWarningDays: z.number().int().min(1).max(365).default(30),
});

export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

/** Parses stored JSON, filling in defaults for anything missing. */
export function parseBusinessSettings(raw: unknown): BusinessSettings {
  return BusinessSettingsSchema.parse(raw ?? {});
}
