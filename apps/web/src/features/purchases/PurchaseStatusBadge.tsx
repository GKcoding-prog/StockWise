import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import type { PurchaseStatus } from '@/lib/types';
import { STATUS_TONE } from './purchase-rules';

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`purchases:status.${status}`)}</Badge>;
}
