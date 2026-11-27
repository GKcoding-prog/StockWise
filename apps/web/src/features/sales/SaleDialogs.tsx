import {
  CUSTOMER_RETURN_REASONS,
  CustomerReturnSchema,
  type CustomerReturnReason,
} from '@stockwise/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormAlert } from '@/features/auth/AuthLayout';
import { newIdempotencyKey } from '@/features/purchases/purchase-rules';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { SaleDetail } from '@/lib/types';
import { useCustomerReturn, useVoidSale } from './queries';
import { refundPreview } from './sale-rules';

// ── Void (UC-32) ─────────────────────────────────────────────────────────────────────────

export function VoidSaleDialog({
  sale,
  open,
  onClose,
}: {
  sale: SaleDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const voidSale = useVoidSale(sale.id);
  const errorMessage = useErrorMessage();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    try {
      await voidSale.mutateAsync({ reason });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('sales:void.title', { reference: sale.reference })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('sales:void.keep')}
          </Button>
          <Button
            variant="danger"
            loading={voidSale.isPending}
            disabled={reason.trim() === ''}
            onClick={() => void submit()}
          >
            {t('sales:void.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      <p className="mb-4 text-sm text-stone-700">{t('sales:void.text')}</p>
      <Field label={t('sales:void.reason')}>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        )}
      </Field>
    </Dialog>
  );
}

// ── Customer return (UC-33) ──────────────────────────────────────────────────────────────

export function CustomerReturnDialog({
  sale,
  open,
  onClose,
}: {
  sale: SaleDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const customerReturn = useCustomerReturn(sale.id);
  const errorMessage = useErrorMessage();
  const returnable = sale.items.filter((i) => Number(i.quantityReturnable) > 0);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<CustomerReturnReason>('DEFECTIVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // One key per dialog session and body: a retry can't return the same goods twice.
  const attempt = useRef<{ key: string; body: string } | null>(null);
  useEffect(() => {
    if (open) {
      setQuantities({});
      setReason('DEFECTIVE');
      setNote('');
      setError(null);
      attempt.current = null;
    }
  }, [open]);

  const body = {
    reason,
    note,
    lines: returnable
      .map((i) => ({ saleItemId: i.id, quantity: (quantities[i.id] ?? '').trim() }))
      .filter((l) => /[1-9]/.test(l.quantity)),
  };
  const refund = body.lines.reduce((acc, l) => {
    const item = returnable.find((i) => i.id === l.saleItemId)!;
    const q = Number(l.quantity);
    return Number.isNaN(q) ? acc : acc + refundPreview(item, q);
  }, 0);

  const submit = async () => {
    setError(null);
    if (body.lines.length === 0) {
      setError(t('sales:return.nothing'));
      return;
    }
    if (!CustomerReturnSchema.safeParse(body).success) {
      setError(t('errors:VALIDATION_ERROR'));
      return;
    }
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) {
      attempt.current = { key: newIdempotencyKey(), body: serialized };
    }
    try {
      await customerReturn.mutateAsync({ body, idempotencyKey: attempt.current.key });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={t('sales:return.title')}
      description={sale.reference}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            loading={customerReturn.isPending}
            disabled={body.lines.length === 0}
            onClick={() => void submit()}
          >
            {t('sales:return.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      <p className="mb-3 text-sm text-stone-600">{t('sales:return.intro')}</p>
      <ul className="mb-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
        {returnable.map((i) => (
          <li key={i.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_8rem] sm:items-end">
            <div className="min-w-0">
              <p className="truncate font-medium">{i.productName}</p>
              <p className="text-xs text-stone-500">
                {t('sales:return.returnable')}: {f.quantity(i.quantityReturnable, i.product.unit)} ·{' '}
                {f.money(i.lineTotal)}
              </p>
            </div>
            <Field label={t('sales:return.quantity')}>
              {(p) => (
                <Input
                  {...p}
                  inputMode={i.product.allowFractional ? 'decimal' : 'numeric'}
                  className="text-right"
                  value={quantities[i.id] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.id]: e.target.value }))}
                />
              )}
            </Field>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('sales:return.reason')}>
          {(p) => (
            <Select
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value as CustomerReturnReason)}
            >
              {CUSTOMER_RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`sales:return.reasons.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('sales:return.note')}>
          {(p) => (
            <Input {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </div>
      {body.lines.length > 0 && (
        <p
          className="mt-4 flex justify-between rounded-lg bg-stone-50 p-3 text-sm"
          aria-live="polite"
        >
          <span>{t('sales:return.refund')}</span>
          <span className="font-semibold tabular">{f.money(refund)}</span>
        </p>
      )}
    </Dialog>
  );
}
