import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Can, useBusinessKey, useCan } from '@/app/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { PurchaseStatusBadge } from '@/features/purchases/PurchaseStatusBadge';
import type { PurchaseStatus, Supplier } from '@/lib/types';
import { SupplierFormDialog } from './SupplierFormDialog';

interface SupplierPurchase {
  id: string;
  reference: string;
  status: PurchaseStatus;
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  total?: string;
}

interface SupplierProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const b = useBusinessKey();
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const supplier = useQuery({
    queryKey: [b, 'suppliers', 'detail', id],
    queryFn: () => api<Supplier>(`/suppliers/${id}`),
  });
  const products = useQuery({
    queryKey: [b, 'suppliers', 'products', id],
    queryFn: () => api<{ data: SupplierProduct[] }>(`/suppliers/${id}/products`),
  });
  const purchases = useQuery({
    queryKey: [b, 'purchases', 'bySupplier', id],
    queryFn: () => api<{ data: SupplierPurchase[] }>(`/suppliers/${id}/purchases`),
    enabled: can('purchases.view'),
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api<Supplier>(`/suppliers/${id}/${archived ? 'archive' : 'restore'}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [b, 'suppliers'] }),
  });

  const back = (
    <Link
      to="/suppliers"
      className="mb-2 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-4" /> {t('suppliers:title')}
    </Link>
  );
  if (supplier.isPending)
    return (
      <>
        {back}
        <Skeleton className="h-40" />
      </>
    );
  if (supplier.isError)
    return (
      <>
        {back}
        <ErrorState error={supplier.error} onRetry={() => void supplier.refetch()} />
      </>
    );
  const s = supplier.data;
  const archived = !!s.archivedAt;

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex items-center gap-2">
            {s.name} {archived && <Badge>{t('products:archived')}</Badge>}
          </span>
        }
        description={t('suppliers:leadTime', { count: s.leadTimeDays })}
        actions={
          <>
            {!archived && (
              <Can perm="purchases.manage">
                <Button
                  icon={<Plus className="size-4" />}
                  onClick={() => navigate(`/purchases/new?supplierId=${s.id}`)}
                >
                  {t('purchases:actions.newForSupplier')}
                </Button>
              </Can>
            )}
            <Can perm="suppliers.manage">
              <Button
                variant="secondary"
                icon={<Pencil className="size-4" />}
                onClick={() => setEditing(true)}
              >
                {t('common:actions.edit')}
              </Button>
              <Button
                variant="secondary"
                icon={
                  archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />
                }
                loading={archive.isPending}
                onClick={() => archive.mutate(!archived)}
              >
                {archived ? t('common:actions.restore') : t('common:actions.archive')}
              </Button>
            </Can>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="space-y-3 p-4 text-sm">
          <h2 className="font-semibold">{t('suppliers:contact')}</h2>
          {s.contactName && <p className="font-medium">{s.contactName}</p>}
          {s.phone && (
            <a
              href={`tel:${s.phone}`}
              className="flex items-center gap-2 text-brand-800 hover:underline"
            >
              <Phone className="size-4" /> {s.phone}
            </a>
          )}
          {s.email && (
            <a
              href={`mailto:${s.email}`}
              className="flex items-center gap-2 text-brand-800 hover:underline"
            >
              <Mail className="size-4" /> {s.email}
            </a>
          )}
          {s.address && (
            <p className="flex items-start gap-2 text-stone-700">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {s.address}
            </p>
          )}
          {s.nif && (
            <p className="text-stone-600">
              {t('suppliers:fields.nif')}: {s.nif}
            </p>
          )}
          {s.notes && (
            <p className="rounded-lg bg-stone-50 p-2 whitespace-pre-line text-stone-700">
              {s.notes}
            </p>
          )}
          {s.openPurchases && (
            <p className="border-t border-stone-100 pt-3 text-stone-600">
              {t('suppliers:openPurchases', { count: s.openPurchases.count })}
              {can('products.view_cost') &&
                s.openPurchases.value !== undefined &&
                ` · ${f.money(s.openPurchases.value)}`}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('suppliers:products')}
          </h2>
          {products.isPending ? (
            <div className="p-4">
              <Skeleton className="h-20" />
            </div>
          ) : products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : products.data.data.length === 0 ? (
            <EmptyState
              title={t('suppliers:noProducts')}
              description={t('suppliers:noProductsText')}
            />
          ) : (
            <ul className="divide-y divide-stone-100">
              {products.data.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/products/${p.id}`}
                    className="flex justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone-50"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-stone-500">{p.sku}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Can perm="purchases.view">
        <Card className="mt-4">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('purchases:supplierHistory')}
          </h2>
          {purchases.isPending ? (
            <div className="p-4">
              <Skeleton className="h-16" />
            </div>
          ) : purchases.isError ? (
            <ErrorState error={purchases.error} onRetry={() => void purchases.refetch()} />
          ) : purchases.data.data.length === 0 ? (
            <EmptyState title={t('purchases:noSupplierPurchases')} />
          ) : (
            <ul className="divide-y divide-stone-100">
              {purchases.data.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/purchases/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-medium">{p.reference}</span>
                      <PurchaseStatusBadge status={p.status} />
                    </span>
                    <span className="text-right text-stone-600">
                      {p.total !== undefined && (
                        <span className="mr-3 font-medium text-stone-900 tabular">
                          {f.money(p.total)}
                        </span>
                      )}
                      {f.date(p.receivedAt ?? p.orderedAt ?? p.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Can>
      <SupplierFormDialog open={editing} onClose={() => setEditing(false)} supplier={s} />
    </>
  );
}
