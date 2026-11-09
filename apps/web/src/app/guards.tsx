import type { PermissionKey } from '@stockwise/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { EmptyState } from '@/components/ui/States';
import { applyPreferredLanguage } from '@/lib/i18n';
import { useAuth, useCan } from './auth';

function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <div className="size-8 animate-spin rounded-full border-2 border-stone-300 border-t-brand-800" />
      <span className="sr-only">{t('common:states.loading')}</span>
    </div>
  );
}

/** Waits for the silent refresh and /me, then renders the app or sends the user to login. */
export function ProtectedRoute() {
  const { status, session, me } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (me) applyPreferredLanguage(me.user.locale ?? me.business?.locale);
  }, [me]);

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  if (!session?.activeBusinessId && location.pathname !== '/no-business') {
    return <Navigate to="/no-business" replace />;
  }
  if (session?.activeBusinessId && !me) return <FullPageSpinner />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}

/** Route-level permission check. UX only: the API enforces every permission itself. */
export function RequirePermission({ perm }: { perm: PermissionKey }) {
  const can = useCan();
  const { t } = useTranslation();
  if (!can(perm)) {
    return (
      <EmptyState
        title={t('common:states.forbiddenTitle')}
        description={t('common:states.forbiddenText')}
      />
    );
  }
  return <Outlet />;
}
