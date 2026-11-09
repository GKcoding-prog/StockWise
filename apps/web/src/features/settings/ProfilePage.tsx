import { zodResolver } from '@hookform/resolvers/zod';
import { ChangePasswordSchema, UpdateMeSchema } from '@stockwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useAuth, useMe } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Card } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { api } from '@/lib/api';
import { useErrorMessage, useValidationMessage } from '@/lib/errors';
import { chooseLanguage } from '@/lib/i18n';
import { SettingsTabs } from './SettingsTabs';

function Saved({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return show ? (
    <span className="text-sm text-green-700" role="status">
      {t('common:states.saved')}
    </span>
  ) : null;
}

export function ProfilePage() {
  const { t } = useTranslation();
  const me = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const v = useValidationMessage();
  const errorMessage = useErrorMessage();
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profile = useForm<z.input<typeof UpdateMeSchema>, unknown, z.output<typeof UpdateMeSchema>>(
    {
      resolver: zodResolver(UpdateMeSchema),
      defaultValues: {
        fullName: me.user.fullName,
        phone: me.user.phone ?? '',
        locale: (me.user.locale as 'fr' | 'en' | null) ?? 'fr',
      },
    },
  );
  const password = useForm<
    z.input<typeof ChangePasswordSchema>,
    unknown,
    z.output<typeof ChangePasswordSchema>
  >({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const saveProfile = profile.handleSubmit(async (values) => {
    setProfileSaved(false);
    setProfileError(null);
    try {
      await api('/me', { method: 'PATCH', body: values });
      if (values.locale) chooseLanguage(values.locale);
      await qc.invalidateQueries({ queryKey: ['me'] });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(errorMessage(err));
    }
  });

  const changePassword = password.handleSubmit(async (values) => {
    setPasswordSaved(false);
    setPasswordError(null);
    try {
      await api('/me/change-password', { method: 'POST', body: values });
      password.reset();
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(errorMessage(err));
    }
  });

  return (
    <>
      <SettingsTabs />
      <div className="grid max-w-3xl gap-5">
        <Card className="p-5">
          <h2 className="font-semibold">{t('settings:profile.title')}</h2>
          <p className="mt-0.5 text-sm text-stone-600">{me.user.email}</p>
          <FormAlert message={profileError} />
          <form onSubmit={saveProfile} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label={t('auth:fields.fullName')}
              error={v(profile.formState.errors.fullName?.message)}
            >
              {(p) => <Input {...p} {...profile.register('fullName')} />}
            </Field>
            <Field
              label={t('settings:profile.phone')}
              error={v(profile.formState.errors.phone?.message)}
            >
              {(p) => <Input {...p} type="tel" {...profile.register('phone')} />}
            </Field>
            <Field label={t('auth:fields.language')}>
              {(p) => (
                <Select {...p} {...profile.register('locale')}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </Select>
              )}
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={profile.formState.isSubmitting}>
                {t('common:actions.save')}
              </Button>
              <Saved show={profileSaved} />
            </div>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">{t('settings:password.title')}</h2>
          <p className="mt-0.5 text-sm text-stone-600">{t('settings:password.text')}</p>
          <FormAlert message={passwordError} />
          <form onSubmit={changePassword} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label={t('settings:password.current')}
              error={v(password.formState.errors.currentPassword?.message)}
            >
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  {...password.register('currentPassword')}
                />
              )}
            </Field>
            <Field
              label={t('settings:password.new')}
              error={v(password.formState.errors.newPassword?.message)}
            >
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  {...password.register('newPassword')}
                />
              )}
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={password.formState.isSubmitting}>
                {t('settings:password.submit')}
              </Button>
              <Saved show={passwordSaved} />
            </div>
          </form>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-semibold">{t('settings:sessions.title')}</h2>
            <p className="mt-0.5 text-sm text-stone-600">{t('settings:sessions.text')}</p>
          </div>
          <Button
            variant="secondary"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await api('/auth/logout-all', { method: 'POST' }).catch(() => undefined);
              await signOut();
            }}
          >
            {t('settings:sessions.submit')}
          </Button>
        </Card>
      </div>
    </>
  );
}
