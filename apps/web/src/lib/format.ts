import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/auth';

/**
 * Locale-aware formatters bound to the business currency and timezone (docs/01 §12).
 * Intl.NumberFormat accepts decimal strings, so values never pass through float arithmetic.
 */
export function useFormat() {
  const { i18n } = useTranslation();
  const { me } = useAuth();
  const currency = me?.business?.currency ?? 'BIF';
  const timeZone = me?.business?.timezone ?? 'Africa/Bujumbura';
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-BI';

  return useMemo(() => {
    const moneyFmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const numberFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const dateTimeFmt = new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const dateFmt = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium' });
    // Intl's types predate string support; the runtime accepts exact decimal strings.
    const asNumber = (v: string | number) => v as unknown as number;
    return {
      money: (v: string | number | null | undefined) =>
        v == null ? '—' : moneyFmt.format(asNumber(v)),
      number: (v: string | number | null | undefined) =>
        v == null ? '—' : numberFmt.format(asNumber(v)),
      quantity: (v: string | number | null | undefined, unit?: string) =>
        v == null
          ? '—'
          : `${numberFmt.format(asNumber(v))}${unit && unit !== 'pcs' ? ` ${unit}` : ''}`,
      signedQuantity: (v: string) =>
        `${v.startsWith('-') ? '' : '+'}${numberFmt.format(asNumber(v))}`,
      dateTime: (v: string | Date | null | undefined) =>
        v ? dateTimeFmt.format(new Date(v)) : '—',
      date: (v: string | Date | null | undefined) => (v ? dateFmt.format(new Date(v)) : '—'),
      locale,
      currency,
    };
  }, [locale, currency, timeZone]);
}
