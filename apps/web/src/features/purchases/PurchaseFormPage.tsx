import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePurchaseSchema } from '@stockwise/shared';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useMe } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { useSupplierOptions } from '@/features/products/queries';
import { ApiError } from '@/lib/api';
import { useApplyServerErrors, useErrorMessage, useValidationMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { Product, PurchaseDetail } from '@/lib/types';
import { ProductPicker } from './ProductPicker';
import { previewLineTotal, trimDecimal } from './purchase-rules';
import { usePurchase, useSavePurchase } from './queries';

const FormSchema = CreatePurchaseSchema.omit({ markOrdered: true });
type FormValues = z.input<typeof FormSchema>;
type LineInfo = Pick<Product, 'name' | 'sku' | 'unit' | 'allowFractional'>;

/** Business-local YYYY-MM-DD for an <input type="date">. */
function localDateInput(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** /purchases/new and /purchases/:id/edit (UC-20). */
export function PurchaseFormPage() {
  const { id } = useParams<{ id: string }>();
  const existing = usePurchase(id);
  const { t } = useTranslation();

  const back = (
    <Link
      to={id ? `/purchases/${id}` : '/purchases'}
      className="mb-2 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-4" /> {t('purchases:title')}
    </Link>
  );
  if (id && existing.isPending)
    return (
      <>
        {back}
        <Skeleton className="h-64" />
      </>
    );
  if (id && existing.isError)
    return (
      <>
        {back}
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </>
    );
  return <PurchaseForm back={back} purchase={existing.data} />;
}

function PurchaseForm({ back, purchase }: { back: React.ReactNode; purchase?: PurchaseDetail }) {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suppliers = useSupplierOptions();
  const save = useSavePurchase(purchase?.id);
  const errorMessage = useErrorMessage();
  const applyServerErrors = useApplyServerErrors<FormValues>();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const timeZone = me.business?.timezone ?? 'Africa/Bujumbura';

  const [info, setInfo] = useState<Record<string, LineInfo>>(() =>
    Object.fromEntries((purchase?.items ?? []).map((i) => [i.productId, i.product])),
  );

  const { register, control, handleSubmit, watch, setError, formState } = useForm<
    FormValues,
    unknown,
    z.output<typeof FormSchema>
  >({
    resolver: zodResolver(FormSchema),
    defaultValues: purchase
      ? {
          supplierId: purchase.supplier.id,
          expectedAt: localDateInput(purchase.expectedAt, timeZone),
          notes: purchase.notes ?? '',
          items: purchase.items.map((i) => ({
            productId: i.productId,
            quantityOrdered: trimDecimal(i.quantityOrdered),
            unitCost: trimDecimal(i.unitCost),
          })),
        }
      : {
          supplierId: params.get('supplierId') ?? '',
          expectedAt: '',
          notes: '',
          items: [],
        },
  });
  const lines = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const selectedIds = new Set(items.map((i) => i.productId));
  const lineTotals = items.map((i) =>
    previewLineTotal(String(i.quantityOrdered), String(i.unitCost)),
  );
  const total = lineTotals.reduce<number>((acc, n) => acc + (n ?? 0), 0);

  // Adding or removing a line clears a stale "add at least one product" banner.
  useEffect(() => setFormError(null), [items.length]);

  const addProduct = (p: Product) => {
    setInfo((prev) => ({ ...prev, [p.id]: p }));
    lines.append({
      productId: p.id,
      quantityOrdered: '',
      unitCost: trimDecimal(p.costPrice),
    });
  };

  /** Whole-unit products can't take 12.5 — say so under the field instead of after a round trip. */
  const wholeUnitErrors = (values: { items: { productId: string; quantityOrdered: string }[] }) =>
    values.items.flatMap((line, index) =>
      info[line.productId] &&
      !info[line.productId].allowFractional &&
      /\.\d*[1-9]/.test(line.quantityOrdered)
        ? [index]
        : [],
    );

  const submit = (markOrdered: boolean) =>
    handleSubmit(async (values) => {
      setFormError(null);
      const fractional = wholeUnitErrors(values);
      if (fractional.length) {
        fractional.forEach((i) =>
          setError(`items.${i}.quantityOrdered`, { message: 'sw.wholeNumber' }),
        );
        return;
      }
      try {
        const body = { ...values, expectedAt: values.expectedAt || null };
        const saved = await save.mutateAsync(purchase ? body : { ...body, markOrdered });
        navigate(`/purchases/${saved.id}`);
      } catch (err) {
        // The server reports whole-unit violations by product: put them on the matching lines.
        if (err instanceof ApiError && err.code === 'FRACTIONAL_QUANTITY_NOT_ALLOWED') {
          const ids = new Set(
            ((err.details as { productId: string }[]) ?? []).map((d) => d.productId),
          );
          values.items.forEach((line, i) => {
            if (ids.has(line.productId)) {
              setError(`items.${i}.quantityOrdered`, { message: 'sw.wholeNumber' });
            }
          });
          return;
        }
        if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
      }
    });

  const itemsError = formState.errors.items?.root?.message ?? formState.errors.items?.message;

  return (
    <>
      <PageHeader
        back={back}
        title={
          purchase
            ? t('purchases:form.editTitle', { reference: purchase.reference })
            : t('purchases:form.createTitle')
        }
      />
      <FormAlert message={formError} />
      <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <Field
            label={t('purchases:fields.supplier')}
            error={v(formState.errors.supplierId?.message)}
          >
            {(p) =>
              // Rendered once options exist, so a preselected supplier shows as selected.
              suppliers.isPending ? (
                <Skeleton className="h-10" />
              ) : (
                <Select {...p} {...register('supplierId')}>
                  <option value="">{t('purchases:form.chooseSupplier')}</option>
                  {purchase && !suppliers.data?.some((s) => s.id === purchase.supplier.id) && (
                    <option value={purchase.supplier.id}>{purchase.supplier.name}</option>
                  )}
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )
            }
          </Field>
          <Field
            label={t('purchases:fields.expectedAt')}
            hint={t('purchases:fields.expectedAtHint')}
            error={v(formState.errors.expectedAt?.message)}
          >
            {(p) => <Input {...p} type="date" {...register('expectedAt')} />}
          </Field>
          <Field
            label={t('purchases:fields.notes')}
            className="sm:col-span-2"
            error={v(formState.errors.notes?.message)}
          >
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
        </Card>

        <Card>
          <div className="border-b border-stone-200 p-4">
            <h2 className="mb-3 font-semibold">{t('purchases:fields.items')}</h2>
            <ProductPicker onPick={addProduct} excludeIds={selectedIds} />
          </div>
          {lines.fields.length === 0 ? (
            <p
              className={`px-4 py-6 text-center text-sm ${itemsError ? 'text-red-700' : 'text-stone-500'}`}
            >
              {itemsError ? v(itemsError) : t('purchases:form.noLines')}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.fields.map((field, index) => {
                const product = info[field.productId];
                const err = formState.errors.items?.[index];
                return (
                  <li
                    key={field.id}
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_8rem_9rem_8rem_auto] sm:items-start"
                  >
                    <div className="min-w-0 sm:pt-7">
                      <p className="truncate font-medium">{product?.name}</p>
                      <p className="text-xs text-stone-500">
                        {product?.sku}
                        {product && product.unit !== 'pcs' ? ` · ${product.unit}` : ''}
                      </p>
                    </div>
                    <Field
                      label={t('purchases:fields.quantityOrdered')}
                      error={v(err?.quantityOrdered?.message)}
                    >
                      {(p) => (
                        <Input
                          {...p}
                          inputMode={product?.allowFractional ? 'decimal' : 'numeric'}
                          {...register(`items.${index}.quantityOrdered`)}
                        />
                      )}
                    </Field>
                    <Field label={t('purchases:fields.unitCost')} error={v(err?.unitCost?.message)}>
                      {(p) => (
                        <Input
                          {...p}
                          inputMode="decimal"
                          {...register(`items.${index}.unitCost`)}
                        />
                      )}
                    </Field>
                    <div className="text-sm sm:pt-7 sm:text-right">
                      <span className="text-stone-500 sm:hidden">
                        {t('purchases:fields.lineTotal')}:{' '}
                      </span>
                      <span className="font-medium tabular">{f.money(lineTotals[index])}</span>
                    </div>
                    <div className="sm:pt-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('purchases:form.removeLine', {
                          name: product?.name ?? '',
                        })}
                        icon={<Trash2 className="size-4" />}
                        onClick={() => lines.remove(index)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {lines.fields.length > 0 && (
            <div className="flex justify-between border-t border-stone-200 px-4 py-3 text-sm">
              <span className="text-stone-600">{t('purchases:form.estimatedTotal')}</span>
              <span className="font-semibold tabular">{f.money(total)}</span>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          {purchase ? (
            <Button loading={formState.isSubmitting} onClick={() => void submit(false)()}>
              {t('purchases:form.save')}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                loading={formState.isSubmitting}
                onClick={() => void submit(false)()}
              >
                {t('purchases:form.saveDraft')}
              </Button>
              <Button loading={formState.isSubmitting} onClick={() => void submit(true)()}>
                {t('purchases:form.saveAndOrder')}
              </Button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
