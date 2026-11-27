import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import type { SaleStatus } from '@/lib/types';
import { STATUS_TONE } from './sale-rules';

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`sales:status.${status}`)}</Badge>;
}
