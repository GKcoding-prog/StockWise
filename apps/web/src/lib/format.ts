/**
 * All user-facing formatting of money, quantities and dates goes through here.
 * Never hard-code currency symbols or date formats in components (docs/01 §12).
 *
 * The API sends decimals as strings ("12500.00"); Intl accepts numeric strings directly,
 * which avoids float rounding for display.
 */

type Numeric = number | string;

const toIntlNumber = (value: Numeric) => value as unknown as number; // Intl accepts numeric strings

/** e.g. formatMoney('12500', 'BIF', 'fr-BI') → "12 500 FBu" (BIF has no decimals). */
export function formatMoney(value: Numeric, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(toIntlNumber(value));
}

/** Quantities: up to 3 decimals, trailing zeros dropped ("12.500" → "12,5"). */
export function formatQuantity(value: Numeric, locale: string, unit?: string): string {
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(toIntlNumber(value));
  return unit && unit !== 'pcs' ? `${n} ${unit}` : n;
}

/** Dates are stored in UTC and shown in the business timezone. */
export function formatDateTime(iso: string | Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}
