import { z } from 'zod';

/** Business.settings JSON (docs/02 §6). `prefault` parses the default, so nested defaults apply. */
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
      maxDaysOfSales: z.number().min(0).default(7), // rule R1
      valueThreshold: z.number().min(0).default(100_000), // rule R2, business currency
      shareOfStockPercent: z.number().min(0).max(100).default(20), // rule R3
      modifiedZThreshold: z.number().min(0).default(3.5), // rule R4
      perUserDailyNegativeCount: z.number().int().min(1).default(5), // rule R5
    })
    .prefault({}),
  expiryWarningDays: z.number().int().min(0).default(30),
});

export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

/** Reads stored settings, filling in defaults for anything missing or added since. */
export function parseBusinessSettings(raw: unknown): BusinessSettings {
  return BusinessSettingsSchema.parse(raw ?? {});
}
