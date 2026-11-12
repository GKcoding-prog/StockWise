import { PURCHASE_STATUSES } from '@stockwise/shared';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Can } from '@/app/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { useFormat } from '@/lib/format';
import { useDebounced, useUrlFilters } from '@/lib/hooks';
import { PurchaseStatusBadge } from './PurchaseStatusBadge';
import { isOverdue } from './purchase-rules';
import { usePurchases } from './queries';

const PAGE_SIZE = 25;

/** UC-20 list: status tabs, search, newest first (docs/06 §3.5). */
export function PurchasesPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const { values, page, set } = useUrlFilters(['q', 'status', 'supplierId'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  const query = usePurchases({ ...values, page, pageSize: PAGE_SIZE });
  const filtered = !!(values.q || values.status || values.supplierId);

  return (
    <>
      <PageHeader
        title={t('purchases:title')}
        description={t('purchases:subtitle')}
        actions={
          <Can perm="purchases.manage">
            <Button icon={<Plus className="size-4" />} onClick={() => navigate('/purchases/new')}>
              {t('purchases:new')}
            </Button>
          </Can>
        }
      />
      <Card>
        <div className="space-y-3 border-b border-stone-200 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('purchases:searchPlaceholder')}
              aria-label={t('purchases:searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1"
            role="group"
            aria-label={t('purchases:fields.status')}
          >
            {(['', ...PURCHASE_STATUSES] as const).map((s) => {
              const active = values.status === s;
              return (
                <button
                  key={s || 'ALL'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ status: s || null })}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap ${active ? 'bg-brand-800 font-medium text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                >
                  {t(`purchases:status.${s || 'ALL'}`)}
                </button>
              );
            })}
          </div>
        </div>

        {query.isPending ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          filtered ? (
            <EmptyState title={t('purchases:empty.filteredTitle')} />
          ) : (
            <EmptyState
              icon={<ClipboardList className="size-6" />}
              title={t('purchases:empty.title')}
              description={t('purchases:empty.text')}
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-stone-100">
              {query.data.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/purchases/${p.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium whitespace-nowrap">
                          {p.reference}
                        </span>
                        <PurchaseStatusBadge status={p.status} />
                        {isOverdue(p) && <Badge tone="red">{t('purchases:detail.overdue')}</Badge>}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-stone-600">
                        {p.supplier.name} · {t('purchases:itemCount', { count: p.itemCount })}
                      </p>
                    </div>
                    <div className="max-w-[45%] shrink-0 text-right text-sm">
                      {p.total !== undefined && (
                        <p className="font-medium tabular">{f.money(p.total)}</p>
                      )}
                      <p className="text-xs text-stone-500">
                        {p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED'
                          ? `${t('purchases:fields.expectedAt')} ${f.date(p.expectedAt)}`
                          : f.date(p.receivedAt ?? p.cancelledAt ?? p.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.meta.total}
              onPage={(n) => set({ page: n })}
            />
          </>
        )}
      </Card>
    </>
  );
}
