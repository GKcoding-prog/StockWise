import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Boxes, PackageX, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useBusinessKey, useCan, useMe } from '@/app/auth';
import { StockBadge } from '@/components/ui/Badge';
import { Card, EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { MovementTable } from '@/features/inventory/MovementTable';
import { useMovements, useStock } from '@/features/inventory/queries';
import { useProducts } from '@/features/products/queries';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';

function Kpi({
  label,
  value,
  icon,
  to,
  tone = 'stone',
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  to?: string;
  tone?: 'stone' | 'amber' | 'red';
  loading?: boolean;
}) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  };
  const body = (
    <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300">
      <div className={`rounded-lg p-2.5 ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-stone-500">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-20" />
        ) : (
          <p className="mt-0.5 truncate text-2xl font-semibold tabular">{value}</p>
        )}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/**
 * Every number comes from a real query; no placeholder statistics (brief §12). Sales KPIs and
 * charts arrive with the sales and analytics modules.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const me = useMe();
  const can = useCan();
  const f = useFormat();
  const b = useBusinessKey();

  const stock = useStock({ pageSize: 1 });
  const out = useProducts({ stockStatus: 'OUT', pageSize: 5, sort: 'name' });
  const low = useProducts({ stockStatus: 'LOW', pageSize: 5, sort: 'quantityOnHand' });
  const valuation = useQuery({
    queryKey: [b, 'dashboard', 'valuation'],
    queryFn: () => api<{ totalValue: string }>('/analytics/valuation'),
    enabled: can('products.view_cost'),
  });
  const movements = useMovements({ pageSize: 8 }, can('inventory.view_movements'));

  const summary = stock.data?.summary;
  const total = summary ? summary.OK + summary.LOW + summary.OUT : 0;
  const attention = [...(out.data?.data ?? []), ...(low.data?.data ?? [])];
  const firstName = me.user.fullName.split(' ')[0];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          {t('dashboard:greeting', { name: firstName })}
        </h1>
        <p className="mt-1 text-sm text-stone-600">{t('dashboard:subtitle')}</p>
      </div>

      {stock.isError ? (
        <Card>
          <ErrorState error={stock.error} onRetry={() => void stock.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={t('dashboard:kpi.products')}
            value={f.number(total)}
            icon={<Boxes className="size-5" />}
            to="/inventory"
            loading={stock.isPending}
          />
          <Kpi
            label={t('dashboard:kpi.low')}
            value={f.number(summary?.LOW ?? 0)}
            icon={<AlertTriangle className="size-5" />}
            tone={summary?.LOW ? 'amber' : 'stone'}
            to="/inventory?status=LOW"
            loading={stock.isPending}
          />
          <Kpi
            label={t('dashboard:kpi.out')}
            value={f.number(summary?.OUT ?? 0)}
            icon={<PackageX className="size-5" />}
            tone={summary?.OUT ? 'red' : 'stone'}
            to="/inventory?status=OUT"
            loading={stock.isPending}
          />
          {can('products.view_cost') && (
            <Kpi
              label={t('dashboard:kpi.value')}
              value={f.money(valuation.data?.totalValue)}
              icon={<Wallet className="size-5" />}
              loading={valuation.isPending}
            />
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_3fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="font-semibold">{t('dashboard:attention.title')}</h2>
            <Link
              to="/inventory?status=LOW"
              className="inline-flex items-center gap-1 text-sm text-brand-800 hover:underline"
            >
              {t('dashboard:seeAll')} <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {out.isPending || low.isPending ? (
            <SkeletonRows rows={4} />
          ) : attention.length === 0 ? (
            <EmptyState
              title={t('dashboard:attention.emptyTitle')}
              description={t('dashboard:attention.emptyText')}
            />
          ) : (
            <ul className="divide-y divide-stone-100">
              {attention.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/products/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular">
                        {f.quantity(p.quantityOnHand, p.unit)}
                      </span>
                      <StockBadge status={p.stockStatus} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {can('inventory.view_movements') && (
          <Card>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="font-semibold">{t('dashboard:recent.title')}</h2>
              <Link
                to="/inventory/movements"
                className="inline-flex items-center gap-1 text-sm text-brand-800 hover:underline"
              >
                {t('dashboard:seeAll')} <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {movements.isPending ? (
              <SkeletonRows rows={4} />
            ) : movements.isError ? (
              <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />
            ) : movements.data.data.length === 0 ? (
              <EmptyState
                title={t('inventory:empty.movementsTitle')}
                description={t('inventory:empty.movementsText')}
              />
            ) : (
              <MovementTable movements={movements.data.data} showProduct compact />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
