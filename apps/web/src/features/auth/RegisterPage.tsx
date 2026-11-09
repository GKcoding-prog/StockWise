import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema } from '@stockwise/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { api, type Session } from '@/lib/api';
import { useApplyServerErrors, useErrorMessage, useValidationMessage } from '@/lib/errors';
import { AuthLayout, FormAlert } from './AuthLayout';

type Values = z.input<typeof RegisterSchema>;

const CURRENCIES = ['BIF', 'USD', 'EUR', 'RWF', 'TZS', 'UGX', 'KES', 'CDF'];

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const errorMessage = useErrorMessage();
  const applyServerErrors = useApplyServerErrors<Values>();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { currency: 'BIF', locale: i18n.language === 'en' ? 'en' : 'fr' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      signIn(await api<Session>('/auth/register', { method: 'POST', body: values }));
    } catch (err) {
      if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
    }
  });

  return (
    <AuthLayout
      title={t('auth:register.title')}
      subtitle={t('auth:register.subtitle')}
      footer={
        <>
          {t('auth:register.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-brand-800 hover:underline">
            {t('auth:register.loginLink')}
          </Link>
        </>
      }
    >
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('auth:fields.fullName')} error={v(errors.fullName?.message)}>
          {(p) => <Input {...p} autoComplete="name" autoFocus {...register('fullName')} />}
        </Field>
        <Field label={t('auth:fields.email')} error={v(errors.email?.message)}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field
          label={t('auth:fields.password')}
          error={v(errors.password?.message)}
          hint={t('auth:register.passwordHint')}
        >
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </Field>
        <Field label={t('auth:fields.businessName')} error={v(errors.businessName?.message)}>
          {(p) => <Input {...p} autoComplete="organization" {...register('businessName')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('auth:fields.currency')} error={v(errors.currency?.message)}>
            {(p) => (
              <Select {...p} {...register('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('auth:fields.language')} error={v(errors.locale?.message)}>
            {(p) => (
              <Select {...p} {...register('locale')}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t('auth:register.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
