import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">{t('notFound.title')}</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
        {t('notFound.back')}
      </Link>
    </div>
  );
}
