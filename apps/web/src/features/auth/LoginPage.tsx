import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema } from '@stockwise/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { api, type Session } from '@/lib/api';
import { useErrorMessage, useValidationMessage } from '@/lib/errors';
import { AuthLayout, FormAlert } from './AuthLayout';

type Values = z.input<typeof LoginSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const errorMessage = useErrorMessage();
  const v = useValidationMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      signIn(await api<Session>('/auth/login', { method: 'POST', body: values }));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <AuthLayout
      title={t('auth:login.title')}
      footer={
        <>
          {t('auth:login.noAccount')}{' '}
          <Link to="/register" className="font-medium text-brand-800 hover:underline">
            {t('auth:login.registerLink')}
          </Link>
        </>
      }
    >
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('auth:fields.email')} error={v(errors.email?.message)}>
          {(p) => (
            <Input {...p} type="email" autoComplete="email" autoFocus {...register('email')} />
          )}
        </Field>
        <Field label={t('auth:fields.password')} error={v(errors.password?.message)}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t('auth:login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
