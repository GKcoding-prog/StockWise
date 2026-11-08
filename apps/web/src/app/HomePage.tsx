import { useTranslation } from 'react-i18next';
import { SystemStatusCard } from '../features/system/SystemStatusCard';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('home.title')}</h1>
        <p className="mt-1 text-sm text-brand-700">{t('app.tagline')}</p>
      </div>
      <p className="text-slate-700">{t('home.intro')}</p>
      <SystemStatusCard />
      <p className="text-sm text-slate-500">{t('home.nextSteps')}</p>
    </div>
  );
}
