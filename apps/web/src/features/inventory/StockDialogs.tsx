import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADJUSTMENT_REASONS,
  CreateAdjustmentSchema,
  CreateWriteOffSchema,
  WRITE_OFF_REASONS,
} from '@stockwise/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormAlert } from '@/features/auth/AuthLayout';
import { useInvalidateStock } from '@/features/products/queries';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useErrorMessage, useValidationMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { Product } from '@/lib/types';

type ProductLike = Pick<Product, 'id' | 'name' | 'unit' | 'quantityOnHand' | 'allowFractional'>;

/** Plain decimal maths for a preview only; the server computes the real result. */
const toNum = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

// ── Adjust stock (UC-41) ─────────────────────────────────────────────────────────────────────

interface AdjustValues {
  mode: 'set' | 'change';
  amount: string;
  reason: (typeof ADJUSTMENT_REASONS)[number];
  note: string;
}

export function AdjustStockDialog({
  product,
  open,
  onClose,
}: {
  product: ProductLike;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const invalidate = useInvalidateStock();
  const errorMessage = useErrorMessage();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const toBody = (values: AdjustValues) => ({
    reason: values.reason,
    note: values.note,
    lines: [
      values.mode === 'set'
        ? { productId: product.id, newQuantity: values.amount }
        : { productId: product.id, quantityChange: values.amount },
    ],
  });
  const resolver: Resolver<AdjustValues> = async (values, ctx, opts) => {
    const result = await (zodResolver(CreateAdjustmentSchema) as unknown as Resolver<AdjustValues>)(
      toBody(values) as unknown as AdjustValues,
      ctx,
      opts,
    );
    // Errors on lines.0.* belong to the single amount input.
    const lineErrors = (result.errors as Record<string, unknown>).lines as
      Record<string, Record<string, { message?: string }>> | undefined;
    const amountError = lineErrors?.[0] && Object.values(lineErrors[0]).find((e) => e?.message);
    if (amountError)
      return { values: {}, errors: { amount: { type: 'validate', message: amountError.message } } };
    return Object.keys(result.errors).length ? result : { values, errors: {} };
  };

  const { register, handleSubmit, watch, reset, formState } = useForm<AdjustValues>({
    resolver,
    defaultValues: { mode: 'set', amount: '', reason: 'COUNT_CORRECTION', note: '' },
  });
  useEffect(() => {
    if (open) {
      reset({ mode: 'set', amount: '', reason: 'COUNT_CORRECTION', note: '' });
      setFormError(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: AdjustValues) =>
      api('/inventory/adjustments', { method: 'POST', body: toBody(values) }),
    onSuccess: () => invalidate(),
  });

  const mode = watch('mode');
  const amount = toNum(watch('amount'));
  const current = Number(product.quantityOnHand);
  const result = amount === null ? null : mode === 'set' ? amount : current + amount;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('inventory:adjust.title')}
      description={product.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="adjust-form" loading={formState.isSubmitting}>
            {t('inventory:adjust.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={formError} />
      <form id="adjust-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-stone-600">
          {t('inventory:adjust.current')}:{' '}
          <strong className="text-stone-900 tabular">
            {f.quantity(product.quantityOnHand, product.unit)}
          </strong>
        </p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(['set', 'change'] as const).map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${mode === m ? 'border-brand-700 bg-brand-50 font-medium' : 'border-stone-300'}`}
            >
              <input type="radio" value={m} className="sr-only" {...register('mode')} />
              {t(`inventory:adjust.mode.${m}`)}
            </label>
          ))}
        </div>
        <Field
          label={
            mode === 'set' ? t('inventory:adjust.newQuantity') : t('inventory:adjust.difference')
          }
          error={v(formState.errors.amount?.message)}
          hint={mode === 'change' ? t('inventory:adjust.differenceHint') : undefined}
        >
          {(p) => <Input {...p} inputMode="decimal" autoFocus {...register('amount')} />}
        </Field>
        <Field label={t('inventory:fields.reason')}>
          {(p) => (
            <Select {...p} {...register('reason')}>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`inventory:reasons.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('inventory:fields.note')} error={v(formState.errors.note?.message)}>
          {(p) => <Textarea {...p} rows={2} {...register('note')} />}
        </Field>
        {result !== null && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${result < 0 ? 'bg-red-50 text-red-800' : 'bg-stone-50 text-stone-700'}`}
          >
            {t('inventory:adjust.preview', {
              from: f.quantity(product.quantityOnHand, product.unit),
              to: f.quantity(result, product.unit),
            })}
          </p>
        )}
      </form>
    </Dialog>
  );
}

// ── Write-off (UC-43) ────────────────────────────────────────────────────────────────────────

const WriteOffForm = z.object({
  quantity: CreateWriteOffSchema.shape.lines.element.shape.quantity,
  reason: z.enum(WRITE_OFF_REASONS),
  note: CreateWriteOffSchema.shape.note,
});
type WriteOffValues = z.input<typeof WriteOffForm>;

export function WriteOffDialog({
  product,
  open,
  onClose,
}: {
  product: ProductLike;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const invalidate = useInvalidateStock();
  const errorMessage = useErrorMessage();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<
    WriteOffValues,
    unknown,
    z.output<typeof WriteOffForm>
  >({
    resolver: zodResolver(WriteOffForm),
    defaultValues: { quantity: '', reason: 'DAMAGED', note: '' },
  });
  useEffect(() => {
    if (open) {
      reset({ quantity: '', reason: 'DAMAGED', note: '' });
      setFormError(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: z.output<typeof WriteOffForm>) =>
      api('/inventory/write-offs', {
        method: 'POST',
        body: {
          reason: values.reason,
          note: values.note,
          lines: [{ productId: product.id, quantity: values.quantity }],
        },
      }),
    onSuccess: () => invalidate(),
  });

  const qty = toNum(String(watch('quantity') ?? ''));
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('inventory:writeOff.title')}
      description={product.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="submit"
            variant="danger"
            form="writeoff-form"
            loading={formState.isSubmitting}
          >
            {t('inventory:writeOff.submit')}
          </Button>
        </>
      }
    >
      <FormAlert message={formError} />
      <form id="writeoff-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-stone-600">
          {t('inventory:adjust.current')}:{' '}
          <strong className="text-stone-900 tabular">
            {f.quantity(product.quantityOnHand, product.unit)}
          </strong>
        </p>
        <Field
          label={t('inventory:writeOff.quantity')}
          error={v(formState.errors.quantity?.message)}
        >
          {(p) => <Input {...p} inputMode="decimal" autoFocus {...register('quantity')} />}
        </Field>
        <Field label={t('inventory:fields.reason')}>
          {(p) => (
            <Select {...p} {...register('reason')}>
              {WRITE_OFF_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`inventory:reasons.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={`${t('inventory:fields.note')} *`}
          error={v(formState.errors.note?.message)}
          hint={t('inventory:writeOff.noteHint')}
        >
          {(p) => <Textarea {...p} rows={2} {...register('note')} />}
        </Field>
        {qty !== null && qty > 0 && (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
            {t('inventory:adjust.preview', {
              from: f.quantity(product.quantityOnHand, product.unit),
              to: f.quantity(Number(product.quantityOnHand) - qty, product.unit),
            })}
          </p>
        )}
      </form>
    </Dialog>
  );
}
