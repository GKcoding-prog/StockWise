import { zodResolver } from '@hookform/resolvers/zod';
import {
  BusinessSettingsSchema,
  UpdateBusinessSchema,
  type BusinessSettings,
} from '@stockwise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useBusinessKey } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Card, ErrorState, Skeleton } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { api } from '@/lib/api';
import { useErrorMessage, useValidationMessage } from '@/lib/errors';
import { SettingsTabs } from './SettingsTabs';

interface Business {
  id: string;
  name: string;
  legalName: string | null;
  nif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  locale: 'fr' | 'en';
  timezone: string;
  settings: BusinessSettings;
}

type ProfileValues = z.input<typeof UpdateBusinessSchema>;
type SettingsValues = z.input<typeof BusinessSettingsSchema>;

function ProfileForm({ business }: { business: Business }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const b = useBusinessKey();
  const v = useValidationMessage();
  const errorMessage = useErrorMessage();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ProfileValues, unknown, z.output<typeof UpdateBusinessSchema>>({
    resolver: zodResolver(UpdateBusinessSchema),
  });
  useEffect(() => {
    form.reset({
      name: business.name,
      legalName: business.legalName ?? '',
      nif: business.nif ?? '',
      address: business.address ?? '',
      phone: business.phone ?? '',
      email: business.email ?? '',
      currency: business.currency,
      locale: business.locale,
      timezone: business.timezone,
    });
  }, [business, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(false);
    setError(null);
    try {
      await api('/business', { method: 'PATCH', body: values });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [b, 'business'] }),
        qc.invalidateQueries({ queryKey: ['me'] }),
      ]);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  const e = form.formState.errors;

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('settings:business.profile')}</h2>
      <FormAlert message={error} />
      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t('settings:business.name')} error={v(e.name?.message)}>
          {(p) => <Input {...p} {...form.register('name')} />}
        </Field>
        <Field label={t('settings:business.legalName')} error={v(e.legalName?.message)}>
          {(p) => <Input {...p} {...form.register('legalName')} />}
        </Field>
        <Field label={t('settings:business.nif')} error={v(e.nif?.message)}>
          {(p) => <Input {...p} {...form.register('nif')} />}
        </Field>
        <Field label={t('settings:business.phone')} error={v(e.phone?.message)}>
          {(p) => <Input {...p} type="tel" {...form.register('phone')} />}
        </Field>
        <Field label={t('settings:business.email')} error={v(e.email?.message)}>
          {(p) => <Input {...p} type="email" {...form.register('email')} />}
        </Field>
        <Field label={t('settings:business.address')} error={v(e.address?.message)}>
          {(p) => <Input {...p} {...form.register('address')} />}
        </Field>
        <Field
          label={t('auth:fields.currency')}
          error={v(e.currency?.message)}
          hint={t('settings:business.currencyHint')}
        >
          {(p) => (
            <Input {...p} maxLength={3} className="uppercase" {...form.register('currency')} />
          )}
        </Field>
        <Field label={t('auth:fields.language')} error={v(e.locale?.message)}>
          {(p) => (
            <Select {...p} {...form.register('locale')}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        <Field label={t('settings:business.timezone')} error={v(e.timezone?.message)}>
          {(p) => <Input {...p} {...form.register('timezone')} />}
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('common:actions.save')}
          </Button>
          {saved && (
            <span className="text-sm text-green-700" role="status">
              {t('common:states.saved')}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function RulesForm({ settings }: { settings: BusinessSettings }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const b = useBusinessKey();
  const v = useValidationMessage();
  const errorMessage = useErrorMessage();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SettingsValues, unknown, BusinessSettings>({
    resolver: zodResolver(BusinessSettingsSchema),
    defaultValues: settings,
  });
  useEffect(() => form.reset(settings), [settings, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaved(false);
    setError(null);
    try {
      await api('/business/settings', { method: 'PATCH', body: values });
      await qc.invalidateQueries({ queryKey: [b, 'business'] });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  const num = { valueAsNumber: true } as const;
  const e = form.formState.errors;
  const help = (key: string) => t(`settings:rules.${key}Help`);

  return (
    <Card className="p-5">
      <h2 className="font-semibold">{t('settings:rules.title')}</h2>
      <p className="mt-0.5 text-sm text-stone-600">{t('settings:rules.text')}</p>
      <FormAlert message={error} />
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('settings:rules.employeeMaxDiscountPercent')}
            error={v(e.employeeMaxDiscountPercent?.message)}
            hint={help('employeeMaxDiscountPercent')}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                step="0.5"
                {...form.register('employeeMaxDiscountPercent', num)}
              />
            )}
          </Field>
          <div className="pt-7">
            <Checkbox
              label={t('settings:rules.allowNegativeStock')}
              {...form.register('allowNegativeStock')}
            />
            <p className="mt-1 text-xs text-stone-500">{help('allowNegativeStock')}</p>
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            {t('settings:rules.analysis')}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                'salesWindowDays',
                'safetyStockDays',
                'reviewPeriodDays',
                'slowMovingDays',
                'deadStockDays',
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={t(`settings:rules.${k}`)}
                error={v(e.analysis?.[k]?.message)}
                hint={help(k)}
              >
                {(p) => <Input {...p} type="number" {...form.register(`analysis.${k}`, num)} />}
              </Field>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            {t('settings:rules.anomaly')}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                'maxDaysOfSales',
                'valueThreshold',
                'shareOfStockPercent',
                'modifiedZThreshold',
                'perUserDailyNegativeCount',
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={t(`settings:rules.${k}`)}
                error={v(e.anomaly?.[k]?.message)}
                hint={help(k)}
              >
                {(p) => (
                  <Input {...p} type="number" step="any" {...form.register(`anomaly.${k}`, num)} />
                )}
              </Field>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('common:actions.save')}
          </Button>
          {saved && (
            <span className="text-sm text-green-700" role="status">
              {t('common:states.saved')}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

export function BusinessSettingsPage() {
  const b = useBusinessKey();
  const query = useQuery({ queryKey: [b, 'business'], queryFn: () => api<Business>('/business') });
  return (
    <>
      <SettingsTabs />
      <div className="grid max-w-3xl gap-5">
        {query.isPending ? (
          <Skeleton className="h-96" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <ProfileForm business={query.data} />
            <RulesForm settings={query.data.settings} />
          </>
        )}
      </div>
    </>
  );
}
