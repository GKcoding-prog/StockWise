import type { StockStatus } from '@stockwise/shared';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

type Tone = 'green' | 'amber' | 'red' | 'stone' | 'blue';

const TONES: Record<Tone, string> = {
  green: 'bg-green-50 text-green-800 ring-green-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-800 ring-red-600/20',
  stone: 'bg-stone-100 text-stone-700 ring-stone-500/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
};

export function Badge({ tone = 'stone', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STOCK_TONE: Record<StockStatus, Tone> = { OK: 'green', LOW: 'amber', OUT: 'red' };
const DOT: Record<StockStatus, string> = {
  OK: 'bg-green-600',
  LOW: 'bg-amber-500',
  OUT: 'bg-red-600',
};

/** Colour plus a text label — status is never conveyed by colour alone (docs/06 §3.3). */
export function StockBadge({ status }: { status: StockStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STOCK_TONE[status]}>
      <span className={`size-1.5 rounded-full ${DOT[status]}`} aria-hidden />
      {t(`common:stockStatus.${status}`)}
    </Badge>
  );
}
