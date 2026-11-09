import { zodResolver } from '@hookform/resolvers/zod';
import { CreateSupplierSchema } from '@stockwise/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useBusinessKey } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormAlert } from '@/features/auth/AuthLayout';
import { api } from '@/lib/api';
import { useApplyServerErrors, useErrorMessage, useValidationMessage } from '@/lib/errors';
import type { Supplier } from '@/lib/types';

type Values = z.input<typeof CreateSupplierSchema>;

const toValues = (s?: Supplier): Values => ({
  name: s?.name ?? '',
  contactName: s?.contactName ?? '',
  phone: s?.phone ?? '',
  email: s?.email ?? '',
  address: s?.address ?? '',
  nif: s?.nif ?? '',
  leadTimeDays: s?.leadTimeDays ?? 7,
  notes: s?.notes ?? '',
});

export function SupplierFormDialog({
  open,
  onClose,
  supplier,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier;
  onSaved?: (s: Supplier) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const b = useBusinessKey();
  const v = useValidationMessage();
  const errorMessage = useErrorMessage();
  const applyServerErrors = useApplyServerErrors<Values>();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<
    Values,
    unknown,
    z.output<typeof CreateSupplierSchema>
  >({
    resolver: zodResolver(CreateSupplierSchema),
    defaultValues: toValues(supplier),
  });
  useEffect(() => {
    if (open) {
      reset(toValues(supplier));
      setFormError(null);
    }
  }, [open, supplier, reset]);

  const save = useMutation({
    mutationFn: (body: z.output<typeof CreateSupplierSchema>) =>
      supplier
        ? api<Supplier>(`/suppliers/${supplier.id}`, { method: 'PATCH', body })
        : api<Supplier>('/suppliers', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [b, 'suppliers'] }),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      onClose();
      onSaved?.(saved);
    } catch (err) {
      if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier ? t('suppliers:form.editTitle') : t('suppliers:form.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="supplier-form" loading={formState.isSubmitting}>
            {t('common:actions.save')}
          </Button>
        </>
      }
    >
      <FormAlert message={formError} />
      <form id="supplier-form" onSubmit={onSubmit} noValidate className="space-y-3">
        <Field label={`${t('suppliers:fields.name')} *`} error={v(formState.errors.name?.message)}>
          {(p) => <Input {...p} autoFocus {...register('name')} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('suppliers:fields.contactName')}
            error={v(formState.errors.contactName?.message)}
          >
            {(p) => <Input {...p} {...register('contactName')} />}
          </Field>
          <Field label={t('suppliers:fields.phone')} error={v(formState.errors.phone?.message)}>
            {(p) => <Input {...p} type="tel" {...register('phone')} />}
          </Field>
          <Field label={t('suppliers:fields.email')} error={v(formState.errors.email?.message)}>
            {(p) => <Input {...p} type="email" {...register('email')} />}
          </Field>
          <Field label={t('suppliers:fields.nif')} error={v(formState.errors.nif?.message)}>
            {(p) => <Input {...p} {...register('nif')} />}
          </Field>
        </div>
        <Field label={t('suppliers:fields.address')} error={v(formState.errors.address?.message)}>
          {(p) => <Input {...p} {...register('address')} />}
        </Field>
        <Field
          label={t('suppliers:fields.leadTimeDays')}
          error={v(formState.errors.leadTimeDays?.message)}
          hint={t('suppliers:form.leadTimeHint')}
        >
          {(p) => (
            <Input {...p} inputMode="numeric" className="sm:w-32" {...register('leadTimeDays')} />
          )}
        </Field>
        <Field label={t('suppliers:fields.notes')} error={v(formState.errors.notes?.message)}>
          {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
}
