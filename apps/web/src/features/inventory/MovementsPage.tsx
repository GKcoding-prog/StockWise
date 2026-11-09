import { MOVEMENT_TYPES } from '@stockwise/shared';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { useUrlFilters } from '@/lib/hooks';
import { MovementTable } from './MovementTable';
import { useMovements } from './queries';

const PAGE_SIZE = 30;

/** Global ledger with filters (docs/06 §3.4). */
export function MovementsPage() {
  const { t } = useTranslation();
  const { values, page, set } = useUrlFilters(['type', 'from', 'to', 'flagged'] as const);
  const query = useMovements({ ...values, page, pageSize: PAGE_SIZE });
  const filtered = Object.values(values).some(Boolean);

  return (
    <>
      <PageHeader
        title={t('inventory:movements.title')}
        description={t('inventory:movements.subtitle')}
      />
      <Card>
        <div className="grid grid-cols-2 gap-3 border-b border-stone-200 p-4 sm:flex sm:flex-wrap sm:items-end">
          <Field label={t('inventory:fields.type')} className="col-span-2 sm:w-52">
            {(p) => (
              <Select {...p} value={values.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="">{t('inventory:movements.allTypes')}</option>
                {MOVEMENT_TYPES.filter((m) => !m.startsWith('TRANSFER')).map((m) => (
                  <option key={m} value={m}>
                    {t(`inventory:types.${m}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('inventory:movements.from')} className="sm:w-40">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={values.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('inventory:movements.to')} className="sm:w-40">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={values.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            )}
          </Field>
          <div className="col-span-2 pb-2.5">
            <Checkbox
              label={t('inventory:movements.flaggedOnly')}
              checked={values.flagged === 'true'}
              onChange={(e) => set({ flagged: e.target.checked ? 'true' : null })}
            />
          </div>
        </div>
        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <EmptyState
            title={
              filtered ? t('products:empty.filteredTitle') : t('inventory:empty.movementsTitle')
            }
            description={filtered ? undefined : t('inventory:empty.movementsText')}
          />
        ) : (
          <>
            <MovementTable movements={query.data.data} showProduct />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.meta.total}
              onPage={(p) => set({ page: p })}
            />
          </>
        )}
      </Card>
    </>
  );
}
