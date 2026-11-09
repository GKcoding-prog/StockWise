import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Can, useBusinessKey } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { api, type Paginated } from '@/lib/api';
import { useDebounced, useUrlFilters } from '@/lib/hooks';
import type { Supplier } from '@/lib/types';
import { SupplierFormDialog } from './SupplierFormDialog';

const PAGE_SIZE = 25;

export function SuppliersPage() {
  const { t } = useTranslation();
  const b = useBusinessKey();
  const navigate = useNavigate();
  const { values, page, set } = useUrlFilters(['q', 'archived'] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  const query = useQuery({
    queryKey: [b, 'suppliers', 'list', values, page],
    queryFn: () =>
      api<Paginated<Supplier>>('/suppliers', { query: { ...values, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('suppliers:title')}
        description={t('suppliers:subtitle')}
        actions={
          <Can perm="suppliers.manage">
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('suppliers:new')}
            </Button>
          </Can>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('suppliers:searchPlaceholder')}
              aria-label={t('suppliers:searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <Checkbox
            label={t('products:filters.archived')}
            checked={values.archived === 'true'}
            onChange={(e) => set({ archived: e.target.checked ? 'true' : null })}
          />
        </div>
        {query.isPending ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          values.q || values.archived ? (
            <EmptyState title={t('products:empty.filteredTitle')} />
          ) : (
            <EmptyState
              icon={<Truck className="size-6" />}
              title={t('suppliers:empty.title')}
              description={t('suppliers:empty.text')}
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-stone-100">
              {query.data.data.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/suppliers/${s.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-sm text-stone-500">
                        {[s.contactName, s.phone].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm text-stone-600">
                      <p>{t('suppliers:leadTime', { count: s.leadTimeDays })}</p>
                      <p className="text-xs text-stone-500">
                        {t('suppliers:productCount', { count: s.productCount ?? 0 })}
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
              onPage={(p) => set({ page: p })}
            />
          </>
        )}
      </Card>
      <SupplierFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(s) => navigate(`/suppliers/${s.id}`)}
      />
    </>
  );
}
