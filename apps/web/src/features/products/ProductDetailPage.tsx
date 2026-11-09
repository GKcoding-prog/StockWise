import {
  Archive,
  ArrowLeft,
  ArchiveRestore,
  PackageMinus,
  Pencil,
  SlidersHorizontal,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Can, useCan } from '@/app/auth';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonRows,
} from '@/components/ui/States';
import { AdjustStockDialog, WriteOffDialog } from '@/features/inventory/StockDialogs';
import { MovementTable } from '@/features/inventory/MovementTable';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';
import { ProductFormDialog } from './ProductFormDialog';
import { useArchiveProduct, useProduct, useProductMovements } from './queries';

type Tab = 'overview' | 'movements';

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-900">{children}</dd>
    </div>
  );
}

function Overview({ product }: { product: ProductDetail }) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('products:fields.onHand')}
          value={f.quantity(product.quantityOnHand, product.unit)}
          sub={<StockBadge status={product.stockStatus} />}
        />
        <Stat
          label={t('products:fields.minStockLevel')}
          value={f.quantity(product.minStockLevel, product.unit)}
        />
        <Stat label={t('products:fields.sellingPrice')} value={f.money(product.sellingPrice)} />
        {can('products.view_cost') ? (
          <Stat
            label={t('products:fields.stockValue')}
            value={f.money(product.stockValue)}
            sub={t('products:detail.atAverageCost', { cost: f.money(product.averageCost) })}
          />
        ) : (
          <Stat label={t('products:fields.unit')} value={product.unit} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">{t('products:detail.velocity')}</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {t('products:detail.velocityHint', { days: product.velocity.daysOfHistory })}
          </p>
          {product.velocity.daysOfHistory === 0 ? (
            <p className="mt-4 text-sm text-stone-600">{t('products:detail.noHistory')}</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 font-medium">{t('products:detail.window')}</th>
                  <th className="py-1 text-right font-medium">{t('products:detail.netSold')}</th>
                  <th className="py-1 text-right font-medium">{t('products:detail.perDay')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {product.velocity.windows.map((w) => (
                  <tr key={w.days}>
                    <td className="py-2">{t('products:detail.lastDays', { count: w.days })}</td>
                    <td className="py-2 text-right tabular">
                      {f.quantity(w.netSold, product.unit)}
                    </td>
                    <td className="py-2 text-right font-medium tabular">
                      {f.number(w.averageDailySales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">{t('products:detail.details')}</h2>
          <dl className="mt-2 divide-y divide-stone-100">
            <Detail label={t('products:fields.sku')}>{product.sku}</Detail>
            <Detail label={t('products:fields.barcode')}>{product.barcode ?? '—'}</Detail>
            <Detail label={t('products:fields.category')}>{product.category?.name ?? '—'}</Detail>
            <Detail label={t('products:fields.supplier')}>
              {product.defaultSupplier ? (
                <Link to={`/suppliers/${product.defaultSupplier.id}`} className="hover:underline">
                  {product.defaultSupplier.name}
                </Link>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label={t('products:fields.leadTime')}>
              {product.leadTimeDaysOverride ?? product.defaultSupplier?.leadTimeDays ?? 7}{' '}
              {t('common:units.days')}
            </Detail>
            <Detail label={t('products:fields.reorderMultiple')}>
              {product.reorderMultiple ? f.number(product.reorderMultiple) : '—'}
            </Detail>
            <Detail label={t('products:fields.allowFractional')}>
              {product.allowFractional ? t('common:yes') : t('common:no')}
            </Detail>
            {can('products.view_cost') && (
              <Detail label={t('products:fields.costPrice')}>{f.money(product.costPrice)}</Detail>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Movements({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useProductMovements(productId, page);
  return (
    <Card>
      {query.isPending ? (
        <SkeletonRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={t('inventory:empty.movementsTitle')}
          description={t('inventory:empty.movementsText')}
        />
      ) : (
        <>
          <MovementTable movements={query.data.data} />
          <Pagination page={page} pageSize={20} total={query.data.meta.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const can = useCan();
  const query = useProduct(id);
  const archive = useArchiveProduct(id!);
  const errorMessage = useErrorMessage();
  const [tab, setTab] = useState<Tab>('overview');
  const [dialog, setDialog] = useState<'edit' | 'adjust' | 'writeOff' | 'archive' | null>(null);

  const back = (
    <Link
      to="/products"
      className="mb-2 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-4" /> {t('products:title')}
    </Link>
  );

  if (query.isPending) {
    return (
      <>
        {back}
        <Skeleton className="mb-5 h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </>
    );
  }
  if (query.isError)
    return (
      <>
        {back}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  const product = query.data;
  const archived = !!product.archivedAt;

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {product.name}
            {archived && <Badge>{t('products:archived')}</Badge>}
          </span>
        }
        description={`${product.sku}${product.category ? ` · ${product.category.name}` : ''}`}
        actions={
          !archived && (
            <>
              <Can perm="inventory.adjust">
                <Button
                  variant="secondary"
                  icon={<SlidersHorizontal className="size-4" />}
                  onClick={() => setDialog('adjust')}
                >
                  {t('inventory:adjust.action')}
                </Button>
              </Can>
              <Can perm="inventory.write_off">
                <Button
                  variant="secondary"
                  icon={<PackageMinus className="size-4" />}
                  onClick={() => setDialog('writeOff')}
                >
                  {t('inventory:writeOff.action')}
                </Button>
              </Can>
              <Can perm="products.manage">
                <Button
                  variant="secondary"
                  icon={<Pencil className="size-4" />}
                  onClick={() => setDialog('edit')}
                >
                  {t('common:actions.edit')}
                </Button>
              </Can>
            </>
          )
        }
      />

      <div className="mb-4 flex gap-1 border-b border-stone-200" role="tablist">
        {(['overview', ...(can('inventory.view_movements') ? ['movements'] : [])] as Tab[]).map(
          (key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? 'border-brand-800 text-brand-900' : 'border-transparent text-stone-600 hover:text-stone-900'}`}
            >
              {t(`products:tabs.${key}`)}
            </button>
          ),
        )}
      </div>

      {tab === 'overview' ? <Overview product={product} /> : <Movements productId={product.id} />}

      <Can perm="products.manage">
        <div className="mt-8 border-t border-stone-200 pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            onClick={() => (archived ? archive.mutate(false) : setDialog('archive'))}
            loading={archive.isPending}
          >
            {archived ? t('common:actions.restore') : t('common:actions.archive')}
          </Button>
          {archive.isError && (
            <p className="mt-2 text-sm text-red-700">{errorMessage(archive.error)}</p>
          )}
        </div>
      </Can>

      <ProductFormDialog
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
        product={product}
      />
      <AdjustStockDialog
        open={dialog === 'adjust'}
        onClose={() => setDialog(null)}
        product={product}
      />
      <WriteOffDialog
        open={dialog === 'writeOff'}
        onClose={() => setDialog(null)}
        product={product}
      />
      <Dialog
        open={dialog === 'archive'}
        onClose={() => setDialog(null)}
        title={t('products:archiveConfirm.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={archive.isPending}
              onClick={async () => {
                await archive.mutateAsync(true).catch(() => undefined);
                setDialog(null);
              }}
            >
              {t('common:actions.archive')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-700">
          {t('products:archiveConfirm.text', { name: product.name })}
        </p>
      </Dialog>
    </>
  );
}
