import type { StockStatus } from '@stockwise/shared';
import { History, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Can, useCan } from '@/app/auth';
import { StockBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { useFormat } from '@/lib/format';
import { useDebounced, useUrlFilters } from '@/lib/hooks';
import { useStock } from './queries';

const PAGE_SIZE = 50;
const CHIP: Record<StockStatus, string> = {
  OUT: 'border-red-200 bg-red-50 text-red-800',
  LOW: 'border-amber-200 bg-amber-50 text-amber-800',
  OK: 'border-green-200 bg-green-50 text-green-800',
};

/** Stock overview (docs/06 §3.4): status chips, on-hand and value per product. */
export function StockPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const { values, page, set } = useUrlFilters(['q', 'status'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  const query = useStock({
    ...values,
    page,
    pageSize: PAGE_SIZE,
    sort: values.status ? 'quantityOnHand' : 'name',
  });
  const showCost = can('products.view_cost');

  return (
    <>
      <PageHeader
        title={t('inventory:stock.title')}
        description={t('inventory:stock.subtitle')}
        actions={
          <Can perm="inventory.view_movements">
            <Link to="/inventory/movements">
              <Button variant="secondary" icon={<History className="size-4" />}>
                {t('common:nav.movements')}
              </Button>
            </Link>
          </Can>
        }
      />

      {query.data && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(['OUT', 'LOW', 'OK'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={values.status === s}
              onClick={() => set({ status: values.status === s ? null : s })}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${CHIP[s]} ${values.status === s ? 'ring-2 ring-stone-800/30' : ''}`}
            >
              {t(`common:stockStatus.${s}`)}:{' '}
              <span className="tabular">{query.data.summary[s]}</span>
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="border-b border-stone-200 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('products:searchPlaceholder')}
              aria-label={t('products:searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>
        {query.isPending ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <EmptyState title={t('products:empty.filteredTitle')} />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('products:fields.name')}</th>
                  <th className="px-4 py-2.5 text-right">{t('products:fields.onHand')}</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">
                    {t('products:fields.minStockLevel')}
                  </th>
                  <th className="px-4 py-2.5">{t('products:fields.status')}</th>
                  {showCost && (
                    <th className="hidden px-4 py-2.5 text-right md:table-cell">
                      {t('products:fields.stockValue')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {query.data.data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <Link to={`/products/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-stone-500">{p.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular">
                      {f.quantity(p.quantityOnHand, p.unit)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-stone-600 tabular sm:table-cell">
                      {f.number(p.minStockLevel)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StockBadge status={p.stockStatus} />
                    </td>
                    {showCost && (
                      <td className="hidden px-4 py-2.5 text-right tabular md:table-cell">
                        {f.money(p.stockValue)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
