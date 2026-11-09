import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/lib/errors';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-stone-200/70 ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 p-4" role="status" aria-label={t('common:states.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-stone-100 p-3 text-stone-500">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="font-medium text-stone-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 rounded-full bg-red-50 p-3 text-red-700">
        <AlertTriangle className="size-6" />
      </div>
      <p className="font-medium text-stone-800">{t('common:states.errorTitle')}</p>
      <p className="mt-1 max-w-sm text-sm text-stone-600">{message(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          {t('common:actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-stone-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
