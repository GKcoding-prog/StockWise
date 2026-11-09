import { zodResolver } from '@hookform/resolvers/zod';
import { CreateProductSchema, UpdateProductSchema } from '@stockwise/shared';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/app/auth';
import { FormAlert } from '@/features/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useApplyServerErrors, useErrorMessage, useValidationMessage } from '@/lib/errors';
import type { Product, ProductDetail } from '@/lib/types';
import { useCategoryOptions, useSaveProduct, useSupplierOptions } from './queries';

interface Values {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  defaultSupplierId: string;
  unit: string;
  allowFractional: boolean;
  sellingPrice: string;
  costPrice: string;
  minStockLevel: string;
  targetStockLevel: string;
  reorderMultiple: string;
  leadTimeDaysOverride: string;
  openingQuantity: string;
  openingUnitCost: string;
}

const NULLABLE = [
  'barcode',
  'description',
  'categoryId',
  'defaultSupplierId',
  'costPrice',
  'targetStockLevel',
  'reorderMultiple',
  'leadTimeDaysOverride',
];
const CREATE_ONLY_OPTIONAL = ['sku', 'openingQuantity', 'openingUnitCost'];

/** Empty inputs mean "not set": null for nullable fields, omitted for create-only optionals. */
function clean(values: Values, editing: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (editing && CREATE_ONLY_OPTIONAL.slice(1).includes(key)) continue;
    if (value === '') {
      if (NULLABLE.includes(key)) out[key] = null;
      else if (!CREATE_ONLY_OPTIONAL.includes(key)) out[key] = value; // let required fields fail
      continue;
    }
    out[key] = value;
  }
  return out;
}

function toValues(p?: Product): Values {
  return {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    description: p?.description ?? '',
    categoryId: p?.category?.id ?? '',
    defaultSupplierId: p?.defaultSupplier?.id ?? '',
    unit: p?.unit ?? 'pcs',
    allowFractional: p?.allowFractional ?? false,
    sellingPrice: p?.sellingPrice ?? '',
    costPrice: p?.costPrice ?? '',
    minStockLevel: p?.minStockLevel ?? '0',
    targetStockLevel: p?.targetStockLevel ?? '',
    reorderMultiple: p?.reorderMultiple ?? '',
    leadTimeDaysOverride: p?.leadTimeDaysOverride?.toString() ?? '',
    openingQuantity: '',
    openingUnitCost: '',
  };
}

export function ProductFormDialog({
  open,
  onClose,
  product,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product;
  onSaved?: (p: ProductDetail) => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const editing = !!product;
  const save = useSaveProduct(product?.id);
  const categories = useCategoryOptions();
  const suppliers = useSupplierOptions(can('suppliers.view'));
  const errorMessage = useErrorMessage();
  const applyServerErrors = useApplyServerErrors<Values>();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = editing ? UpdateProductSchema : CreateProductSchema;
  const resolver: Resolver<Values> = (values, ctx, opts) =>
    (zodResolver(schema) as unknown as Resolver<Values>)(
      clean(values, editing) as unknown as Values,
      ctx,
      opts,
    );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver, defaultValues: toValues(product) });

  useEffect(() => {
    if (open) {
      reset(toValues(product));
      setFormError(null);
    }
  }, [open, product, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values as unknown as Record<string, unknown>);
      onClose();
      onSaved?.(saved);
    } catch (err) {
      if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
    }
  });

  const fractional = watch('allowFractional');
  const section = 'text-xs font-semibold tracking-wide text-stone-500 uppercase';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={editing ? t('products:form.editTitle') : t('products:form.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="product-form" loading={isSubmitting}>
            {t('common:actions.save')}
          </Button>
        </>
      }
    >
      <FormAlert message={formError} />
      <form id="product-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <fieldset className="space-y-3">
          <legend className={section}>{t('products:form.basic')}</legend>
          <Field label={`${t('products:fields.name')} *`} error={v(errors.name?.message)}>
            {(p) => <Input {...p} autoFocus {...register('name')} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('products:fields.sku')}
              error={v(errors.sku?.message)}
              hint={editing ? undefined : t('products:form.skuHint')}
            >
              {(p) => (
                <Input {...p} {...register('sku')} placeholder={editing ? undefined : 'AUTO'} />
              )}
            </Field>
            <Field
              label={t('products:fields.barcode')}
              error={v(errors.barcode?.message)}
              hint={t('products:form.barcodeHint')}
            >
              {(p) => <Input {...p} inputMode="numeric" {...register('barcode')} />}
            </Field>
            <Field label={t('products:fields.category')} error={v(errors.categoryId?.message)}>
              {(p) => (
                <Select {...p} {...register('categoryId')}>
                  <option value="">{t('common:none')}</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent ? `${c.parent.name} › ${c.name}` : c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t('products:fields.supplier')}
              error={v(errors.defaultSupplierId?.message)}
            >
              {(p) => (
                <Select {...p} {...register('defaultSupplierId')}>
                  <option value="">{t('common:none')}</option>
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t('products:fields.unit')}
              error={v(errors.unit?.message)}
              hint={t('products:form.unitHint')}
            >
              {(p) => <Input {...p} list="units" {...register('unit')} />}
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                label={t('products:fields.allowFractional')}
                {...register('allowFractional')}
              />
            </div>
          </div>
          <datalist id="units">
            {['pcs', 'kg', 'g', 'L', 'ml', 'm', 'box', 'pack'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <Field label={t('products:fields.description')} error={v(errors.description?.message)}>
            {(p) => <Textarea {...p} rows={2} {...register('description')} />}
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={section}>{t('products:form.pricing')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`${t('products:fields.sellingPrice')} *`}
              error={v(errors.sellingPrice?.message)}
            >
              {(p) => <Input {...p} inputMode="decimal" {...register('sellingPrice')} />}
            </Field>
            {can('products.view_cost') && (
              <Field
                label={t('products:fields.costPrice')}
                error={v(errors.costPrice?.message)}
                hint={t('products:form.costHint')}
              >
                {(p) => <Input {...p} inputMode="decimal" {...register('costPrice')} />}
              </Field>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={section}>{t('products:form.stockSettings')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('products:fields.minStockLevel')}
              error={v(errors.minStockLevel?.message)}
              hint={t('products:form.minHint')}
            >
              {(p) => <Input {...p} inputMode="decimal" {...register('minStockLevel')} />}
            </Field>
            <Field
              label={t('products:fields.targetStockLevel')}
              error={v(errors.targetStockLevel?.message)}
              hint={t('products:form.targetHint')}
            >
              {(p) => <Input {...p} inputMode="decimal" {...register('targetStockLevel')} />}
            </Field>
            <Field
              label={t('products:fields.reorderMultiple')}
              error={v(errors.reorderMultiple?.message)}
              hint={t('products:form.packHint')}
            >
              {(p) => <Input {...p} inputMode="decimal" {...register('reorderMultiple')} />}
            </Field>
            <Field
              label={t('products:fields.leadTimeDaysOverride')}
              error={v(errors.leadTimeDaysOverride?.message)}
              hint={t('products:form.leadTimeHint')}
            >
              {(p) => <Input {...p} inputMode="numeric" {...register('leadTimeDaysOverride')} />}
            </Field>
          </div>
        </fieldset>

        {editing ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
            {t('products:form.quantityNotEditable')}
          </p>
        ) : (
          <fieldset className="space-y-3">
            <legend className={section}>{t('products:form.openingStock')}</legend>
            <p className="text-sm text-stone-600">{t('products:form.openingHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('products:fields.openingQuantity')}
                error={v(errors.openingQuantity?.message)}
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    step={fractional ? 'any' : 1}
                    {...register('openingQuantity')}
                  />
                )}
              </Field>
              <Field
                label={t('products:fields.openingUnitCost')}
                error={v(errors.openingUnitCost?.message)}
              >
                {(p) => <Input {...p} inputMode="decimal" {...register('openingUnitCost')} />}
              </Field>
            </div>
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}
