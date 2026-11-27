import { PAYMENT_METHODS, SALE_STATUSES } from '@stockwise/shared';
import { Plus, Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCan } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { useFormat } from '@/lib/format';
import { useDebounced, useUrlFilters } from '@/lib/hooks';
import { SaleStatusBadge } from './SaleStatusBadge';
import { useSales } from './queries';

const PAGE_SIZE = 25;

/** UC-31: sales history, newest first. Employees only see their own (enforced by the API). */
export function SalesPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const navigate = useNavigate();
  const { values, page, set } = useUrlFilters([
    'q',
    'status',
    'paymentMethod',
    'from',
    'to',
  ] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  const query = useSales({ ...values, page, pageSize: PAGE_SIZE });
  const filtered = Object.values(values).some(Boolean);

  return (
    <>
      <PageHeader
        title={t('sales:title')}
        description={can('sales.view_all') ? t('sales:subtitle') : t('sales:subtitleOwn')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => navigate('/sales/new')}>
            {t('sales:new')}
          </Button>
        }
      />
      <Card>
        <div className="space-y-3 border-b border-stone-200 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('sales:searchPlaceholder')}
                aria-label={t('sales:searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <Select
              value={values.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value || null })}
              aria-label={t('sales:fields.paymentMethod')}
            >
              <option value="">{t('sales:allPaymentMethods')}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`sales:paymentMethods.${m}`)}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={values.from}
              max={values.to || undefined}
              onChange={(e) => set({ from: e.target.value || null })}
              aria-label={t('sales:filters.from')}
              title={t('sales:filters.from')}
            />
            <Input
              type="date"
              value={values.to}
              min={values.from || undefined}
              onChange={(e) => set({ to: e.target.value || null })}
              aria-label={t('sales:filters.to')}
              title={t('sales:filters.to')}
            />
          </div>
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1"
            role="group"
            aria-label={t('sales:fields.status')}
          >
            {(['', ...SALE_STATUSES] as const).map((s) => {
              const active = values.status === s;
              return (
                <button
                  key={s || 'ALL'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ status: s || null })}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap ${active ? 'bg-brand-800 font-medium text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                >
                  {t(`sales:status.${s || 'ALL'}`)}
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
            <EmptyState title={t('sales:empty.filteredTitle')} />
          ) : (
            <EmptyState
              icon={<Receipt className="size-6" />}
              title={t('sales:empty.title')}
              description={t('sales:empty.text')}
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-stone-100">
              {query.data.data.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/sales/${s.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium whitespace-nowrap">
                          {s.reference}
                        </span>
                        {s.status !== 'COMPLETED' && <SaleStatusBadge status={s.status} />}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-stone-600">
                        {[
                          t('sales:itemCount', { count: s.itemCount }),
                          t(`sales:paymentMethods.${s.paymentMethod}`),
                          s.customerName,
                          s.soldBy.fullName,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p
                        className={`font-medium tabular ${s.status === 'VOIDED' ? 'text-stone-400 line-through' : ''}`}
                      >
                        {f.money(s.total)}
                      </p>
                      <p className="text-xs text-stone-500">{f.dateTime(s.soldAt)}</p>
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
