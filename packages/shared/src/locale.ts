export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

export const DEFAULT_CURRENCY = 'BIF';
export const DEFAULT_TIMEZONE = 'Africa/Bujumbura';
export const DEFAULT_COUNTRY = 'BI';

/** Maps an app locale + business country to an Intl locale tag, e.g. fr + BI → fr-BI. */
export function intlLocale(locale: Locale, country: string = DEFAULT_COUNTRY): string {
  return `${locale}-${country.toUpperCase()}`;
}
