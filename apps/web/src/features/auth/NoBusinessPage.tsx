import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from './AuthLayout';

/** A signed-in user without any active membership (removed or suspended everywhere). */
export function NoBusinessPage() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  if (session?.activeBusinessId) return <Navigate to="/" replace />;
  return (
    <AuthLayout title={t('auth:noBusiness.title')} subtitle={t('auth:noBusiness.text')}>
      <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
        {t('common:actions.signOut')}
      </Button>
    </AuthLayout>
  );
}
