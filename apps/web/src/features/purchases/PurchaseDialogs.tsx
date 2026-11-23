import {
  ReceivePurchaseSchema,
  SUPPLIER_RETURN_REASONS,
  SupplierReturnSchema,
  type SupplierReturnReason,
} from '@stockwise/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormAlert } from '@/features/auth/AuthLayout';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { PurchaseDetail } from '@/lib/types';
import { newIdempotencyKey, trimDecimal } from './purchase-rules';
import { useCancelPurchase, useReceivePurchase, useSupplierReturn } from './queries';

/**
 * Keeps one Idempotency-Key per dialog session and per request body: a retry of the same body
 * reuses it (no double receipt on a flaky connection); an edited body gets a fresh one.
 */
function useIdempotencyKey(open: boolean) {
  const state = useRef<{ key: string; body: string } | null>(null);
  useEffect(() => {
    if (open) state.current = null;
  }, [open]);
  return (body: unknown) => {
    const serialized = JSON.stringify(body);
    if (!state.current || state.current.body !== serialized) {
      state.current = { key: newIdempotencyKey(), body: serialized };
    }
    return state.current.key;
  };
}

const QtyInput = (props: React.ComponentProps<typeof Input> & { fractional: boolean }) => {
  const { fractional, ...rest } = props;
  return <Input inputMode={fractional ? 'decimal' : 'numeric'} className="text-right" {...rest} />;
};

// ── Receive goods (UC-22) ────────────────────────────────────────────────────────────────

export function ReceiveDialog({
  purchase,
  open,
  onClose,
}: {
  purchase: PurchaseDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const canEditCost = can('purchases.manage') && can('products.view_cost');
  const receive = useReceivePurchase(purchase.id);
  const keyFor = useIdempotencyKey(open);
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const open_ = purchase.items.filter((i) => Number(i.quantityRemaining) > 0);

  const initial = () =>
    Object.fromEntries(
      open_.map((i) => [
        i.id,
        {
          quantity: trimDecimal(i.quantityRemaining),
          unitCost: trimDecimal(i.unitCost),
        },
      ]),
    );
  const [lines, setLines] =
    useState<Record<string, { quantity: string; unitCost: string }>>(initial);
  useEffect(() => {
    if (open) {
      setLines(initial());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  const set = (id: string, patch: Partial<{ quantity: string; unitCost: string }>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const setAll = (mode: 'all' | 'none') =>
    setLines((prev) =>
      Object.fromEntries(
        open_.map((i) => [
          i.id,
          {
            ...prev[i.id],
            quantity: mode === 'all' ? trimDecimal(i.quantityRemaining) : '0',
          },
        ]),
      ),
    );

  const body = {
    lines: open_.map((i) => {
      const l = lines[i.id] ?? { quantity: '', unitCost: '' };
      const costChanged =
        canEditCost && l.unitCost !== '' && l.unitCost !== trimDecimal(i.unitCost);
      return {
        purchaseItemId: i.id,
        quantity: l.quantity.trim() === '' ? '0' : l.quantity.trim(),
        ...(costChanged ? { unitCost: l.unitCost.trim() } : {}),
      };
    }),
  };
  const receiving = body.lines.filter((l) => /[1-9]/.test(l.quantity)).length;

  const submit = async () => {
    setError(null);
    const parsed = ReceivePurchaseSchema.safeParse(body);
    if (!parsed.success) {
      setError(receiving === 0 ? t('purchases:receive.nothing') : t('errors:VALIDATION_ERROR'));
      return;
    }
    try {
      await receive.mutateAsync({ body, idempotencyKey: keyFor(body) });
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
      title={t('purchases:receive.title')}
      description={`${purchase.reference} · ${purchase.supplier.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            loading={receive.isPending}
            disabled={receiving === 0}
            onClick={() => void submit()}
          >
            {t('purchases:receive.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      <p className="mb-3 text-sm text-stone-600">{t('purchases:receive.intro')}</p>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAll('all')}>
          {t('purchases:receive.receiveAll')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAll('none')}>
          {t('purchases:receive.receiveNone')}
        </Button>
      </div>
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {open_.map((i) => (
          <li key={i.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_8rem_9rem] sm:items-end">
            <div className="min-w-0">
              <p className="truncate font-medium">{i.product.name}</p>
              <p className="text-xs text-stone-500">
                {t('purchases:fields.quantityRemaining')}:{' '}
                {f.quantity(i.quantityRemaining, i.product.unit)}
              </p>
            </div>
            <Field label={t('purchases:receive.received')}>
              {(p) => (
                <QtyInput
                  {...p}
                  fractional={i.product.allowFractional}
                  value={lines[i.id]?.quantity ?? ''}
                  onChange={(e) => set(i.id, { quantity: e.target.value })}
                />
              )}
            </Field>
            {canEditCost ? (
              <Field
                label={t('purchases:receive.invoiceCost')}
                hint={t('purchases:receive.costHint')}
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    className="text-right"
                    value={lines[i.id]?.unitCost ?? ''}
                    onChange={(e) => set(i.id, { unitCost: e.target.value })}
                  />
                )}
              </Field>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-stone-700" aria-live="polite">
        {receiving > 0
          ? t('purchases:receive.summary', { count: receiving })
          : t('purchases:receive.nothing')}
      </p>
    </Dialog>
  );
}

// ── Cancel (UC-23) ───────────────────────────────────────────────────────────────────────

export function CancelPurchaseDialog({
  purchase,
  open,
  onClose,
}: {
  purchase: PurchaseDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const cancel = useCancelPurchase(purchase.id);
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
      await cancel.mutateAsync({ reason });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('purchases:cancel.title', { reference: purchase.reference })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('purchases:cancel.keep')}
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            disabled={reason.trim() === ''}
            onClick={() => void submit()}
          >
            {t('purchases:cancel.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      <p className="mb-4 text-sm text-stone-700">
        {purchase.status === 'PARTIALLY_RECEIVED'
          ? t('purchases:cancel.partialText')
          : t('purchases:cancel.text')}
      </p>
      <Field label={t('purchases:cancel.reason')}>
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

// ── Return to supplier (UC-24) ───────────────────────────────────────────────────────────

export function SupplierReturnDialog({
  purchase,
  open,
  onClose,
}: {
  purchase: PurchaseDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const supplierReturn = useSupplierReturn(purchase.id);
  const keyFor = useIdempotencyKey(open);
  const errorMessage = useErrorMessage();
  const returnable = purchase.items
    .map((i) => ({
      item: i,
      max: Number(i.quantityReceived) - Number(i.quantityReturned),
    }))
    .filter((r) => r.max > 0);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<SupplierReturnReason>('DAMAGED');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setQuantities({});
      setReason('DAMAGED');
      setNote('');
      setError(null);
    }
  }, [open]);

  const body = {
    reason,
    note,
    lines: returnable
      .map(({ item }) => ({
        purchaseItemId: item.id,
        quantity: (quantities[item.id] ?? '').trim(),
      }))
      .filter((l) => /[1-9]/.test(l.quantity)),
  };

  const submit = async () => {
    setError(null);
    if (body.lines.length === 0) {
      setError(t('purchases:return.nothing'));
      return;
    }
    if (!SupplierReturnSchema.safeParse(body).success) {
      setError(t('errors:VALIDATION_ERROR'));
      return;
    }
    try {
      await supplierReturn.mutateAsync({ body, idempotencyKey: keyFor(body) });
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
      title={t('purchases:return.title')}
      description={`${purchase.reference} · ${purchase.supplier.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={supplierReturn.isPending}
            disabled={body.lines.length === 0}
            onClick={() => void submit()}
          >
            {t('purchases:return.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      <p className="mb-3 text-sm text-stone-600">{t('purchases:return.intro')}</p>
      <ul className="mb-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
        {returnable.map(({ item, max }) => (
          <li key={item.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_8rem] sm:items-end">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.product.name}</p>
              <p className="text-xs text-stone-500">
                {t('purchases:return.returnable')}: {f.quantity(max, item.product.unit)}
              </p>
            </div>
            <Field label={t('purchases:return.quantity')}>
              {(p) => (
                <QtyInput
                  {...p}
                  fractional={item.product.allowFractional}
                  value={quantities[item.id] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                />
              )}
            </Field>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('purchases:return.reason')}>
          {(p) => (
            <Select
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value as SupplierReturnReason)}
            >
              {SUPPLIER_RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`purchases:return.reasons.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('purchases:return.note')}>
          {(p) => (
            <Input {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
