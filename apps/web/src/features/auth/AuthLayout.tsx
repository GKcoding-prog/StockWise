import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { chooseLanguage } from '@/lib/i18n';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-stone-50">
      <div className="flex justify-end p-4">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          onClick={() => chooseLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
        >
          {i18n.language === 'fr' ? 'English' : 'Français'}
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center px-4 pt-4 pb-12 sm:pt-12">
        <div className="mb-6 flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-9" />
          <span className="text-xl font-semibold tracking-tight">StockWise</span>
        </div>
        <p className="mb-6 max-w-sm text-center text-sm text-stone-600">{t('auth:tagline')}</p>
        <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-sm text-stone-600">{footer}</div>}
      </div>
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  );
}
