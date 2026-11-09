import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm"
      aria-label={t('common:pagination.label')}
    >
      <p className="text-stone-600 tabular">{t('common:pagination.range', { from, to, total })}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          icon={<ChevronLeft className="size-4" />}
        >
          <span className="sr-only sm:not-sr-only">{t('common:pagination.previous')}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <span className="sr-only sm:not-sr-only">{t('common:pagination.next')}</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
