import { Package, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Can, useCan } from '@/app/auth';
import { StockBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/States';
import { useFormat } from '@/lib/format';
import { useDebounced, useUrlFilters } from '@/lib/hooks';
import { ProductFormDialog } from './ProductFormDialog';
import { useCategoryOptions, useProducts } from './queries';

const PAGE_SIZE = 25;

export function ProductsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const f = useFormat();
  const navigate = useNavigate();
  const { values, page, set } = useUrlFilters([
    'q',
    'categoryId',
    'stockStatus',
    'archived',
  ] as const);
  const [search, setSearch] = useState(values.q);
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const categories = useCategoryOptions();

  useEffect(() => {
    if (debounced !== values.q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  const query = useProducts({ ...values, page, pageSize: PAGE_SIZE });
  const filtered = Boolean(values.q || values.categoryId || values.stockStatus || values.archived);
  const showCost = can('products.view_cost');

  return (
    <>
      <PageHeader
        title={t('products:title')}
        description={t('products:subtitle')}
        actions={
          <Can perm="products.manage">
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('products:new')}
            </Button>
          </Can>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-200 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
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
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
            <Select
              value={values.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
              aria-label={t('products:fields.category')}
              className="sm:w-44"
            >
              <option value="">{t('products:filters.allCategories')}</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent ? `${c.parent.name} › ${c.name}` : c.name}
                </option>
              ))}
            </Select>
            <Select
              value={values.stockStatus}
              onChange={(e) => set({ stockStatus: e.target.value })}
              aria-label={t('products:fields.status')}
              className="sm:w-40"
            >
              <option value="">{t('products:filters.allStatuses')}</option>
              <option value="OK">{t('common:stockStatus.OK')}</option>
              <option value="LOW">{t('common:stockStatus.LOW')}</option>
              <option value="OUT">{t('common:stockStatus.OUT')}</option>
            </Select>
            <div className="col-span-2 sm:col-span-1">
              <Checkbox
                label={t('products:filters.archived')}
                checked={values.archived === 'true'}
                onChange={(e) => set({ archived: e.target.checked ? 'true' : null })}
              />
            </div>
          </div>
        </div>

        {query.isPending ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          filtered ? (
            <EmptyState
              title={t('products:empty.filteredTitle')}
              description={t('products:empty.filteredText')}
            />
          ) : (
            <EmptyState
              icon={<Package className="size-6" />}
              title={t('products:empty.title')}
              description={t('products:empty.text')}
              action={
                <Can perm="products.manage">
                  <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                    {t('products:new')}
                  </Button>
                </Can>
              }
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t('products:fields.name')}</th>
                    <th className="px-4 py-2.5">{t('products:fields.category')}</th>
                    <th className="px-4 py-2.5 text-right">{t('products:fields.onHand')}</th>
                    <th className="px-4 py-2.5">{t('products:fields.status')}</th>
                    <th className="px-4 py-2.5 text-right">{t('products:fields.sellingPrice')}</th>
                    {showCost && (
                      <th className="px-4 py-2.5 text-right">{t('products:fields.averageCost')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {query.data.data.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-stone-50"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/products/${p.id}`}
                          className="font-medium text-stone-900 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-stone-500">{p.sku}</div>
                      </td>
                      <td className="px-4 py-2.5 text-stone-600">{p.category?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular">
                        {f.quantity(p.quantityOnHand, p.unit)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StockBadge status={p.stockStatus} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{f.money(p.sellingPrice)}</td>
                      {showCost && (
                        <td className="px-4 py-2.5 text-right text-stone-600 tabular">
                          {f.money(p.averageCost)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {query.data.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/products/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 active:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-stone-500">
                        {p.sku} · {f.money(p.sellingPrice)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular">
                        {f.quantity(p.quantityOnHand, p.unit)}
                      </span>
                      <StockBadge status={p.stockStatus} />
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

      <ProductFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(p) => navigate(`/products/${p.id}`)}
      />
    </>
  );
}
