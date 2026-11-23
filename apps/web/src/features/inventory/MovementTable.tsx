import type { MovementType } from '@stockwise/shared';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { useFormat } from '@/lib/format';
import type { Movement } from '@/lib/types';

const TYPE_TONE: Record<MovementType, 'green' | 'red' | 'amber' | 'blue' | 'stone'> = {
  OPENING_BALANCE: 'stone',
  PURCHASE_RECEIPT: 'green',
  SUPPLIER_RETURN: 'amber',
  SALE: 'blue',
  SALE_VOID: 'amber',
  CUSTOMER_RETURN: 'amber',
  ADJUSTMENT: 'amber',
  WRITE_OFF: 'red',
  TRANSFER_IN: 'stone',
  TRANSFER_OUT: 'stone',
};

export function MovementTypeBadge({ type }: { type: MovementType }) {
  const { t } = useTranslation();
  return <Badge tone={TYPE_TONE[type]}>{t(`inventory:types.${type}`)}</Badge>;
}

function Source({ m }: { m: Movement }) {
  // Receipts and supplier returns link back to their purchase.
  if (m.purchase) {
    return (
      <Link
        to={`/purchases/${m.purchase.id}`}
        className="font-mono text-xs text-brand-800 hover:underline"
      >
        {m.documentRef ?? m.purchase.reference}
      </Link>
    );
  }
  const ref = m.sale?.reference ?? m.documentRef;
  return ref ? (
    <span className="font-mono text-xs text-stone-600">{ref}</span>
  ) : (
    <span className="text-stone-400">—</span>
  );
}

/** Ledger rows: date, type, change, before → after, user, reason, source document (UC-40). */
/** `compact` drops the before → after, reason and document columns (dashboard widget). */
export function MovementTable({
  movements,
  showProduct,
  compact,
}: {
  movements: Movement[];
  showProduct?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = (m: Movement) =>
    m.reason ? t(`inventory:reasons.${m.reason}`, { defaultValue: m.reason }) : null;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">{t('inventory:fields.date')}</th>
              {showProduct && <th className="px-4 py-2.5">{t('inventory:fields.product')}</th>}
              <th className="px-4 py-2.5">{t('inventory:fields.type')}</th>
              <th className="px-4 py-2.5 text-right">{t('inventory:fields.change')}</th>
              {!compact && (
                <th className="px-4 py-2.5 text-right">{t('inventory:fields.beforeAfter')}</th>
              )}
              <th className="px-4 py-2.5">{t('inventory:fields.user')}</th>
              {!compact && <th className="px-4 py-2.5">{t('inventory:fields.reason')}</th>}
              {!compact && <th className="px-4 py-2.5">{t('inventory:fields.document')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-stone-600">
                  {f.dateTime(m.occurredAt)}
                </td>
                {showProduct && (
                  <td className="px-4 py-2.5">
                    {m.product ? (
                      <Link
                        to={`/products/${m.product.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.product.name}
                      </Link>
                    ) : null}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <MovementTypeBadge type={m.type} />
                    {m.isFlagged && (
                      <Flag className="size-3.5 text-red-700" aria-label={t('inventory:flagged')} />
                    )}
                  </span>
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-medium tabular ${m.quantityChange.startsWith('-') ? 'text-red-700' : 'text-green-700'}`}
                >
                  {f.signedQuantity(m.quantityChange)}
                </td>
                {!compact && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-stone-600 tabular">
                    {f.number(m.quantityBefore)} → {f.number(m.quantityAfter)}
                  </td>
                )}
                <td className="px-4 py-2.5 text-stone-600">{m.user?.fullName ?? '—'}</td>
                {!compact && (
                  <td className="max-w-56 px-4 py-2.5 text-stone-600">
                    {reason(m) ?? '—'}
                    {m.note && (
                      <div className="truncate text-xs text-stone-500" title={m.note}>
                        {m.note}
                      </div>
                    )}
                  </td>
                )}
                {!compact && (
                  <td className="px-4 py-2.5">
                    <Source m={m} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-stone-100 md:hidden">
        {movements.map((m) => (
          <li key={m.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <MovementTypeBadge type={m.type} />
                {m.isFlagged && (
                  <Flag className="size-3.5 text-red-700" aria-label={t('inventory:flagged')} />
                )}
              </div>
              <span
                className={`font-semibold tabular ${m.quantityChange.startsWith('-') ? 'text-red-700' : 'text-green-700'}`}
              >
                {f.signedQuantity(m.quantityChange)}
              </span>
            </div>
            {showProduct && m.product && (
              <p className="mt-1 truncate text-sm font-medium">{m.product.name}</p>
            )}
            <p className="mt-1 text-xs text-stone-500">
              {f.dateTime(m.occurredAt)} · {m.user?.fullName} · {f.number(m.quantityBefore)} →{' '}
              {f.number(m.quantityAfter)}
            </p>
            {(reason(m) || m.note) && (
              <p className="mt-0.5 text-xs text-stone-600">
                {[reason(m), m.note].filter(Boolean).join(' — ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
