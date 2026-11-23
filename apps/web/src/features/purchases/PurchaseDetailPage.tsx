import { ArrowLeft, Ban, PackageCheck, Pencil, Phone, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useCan } from '@/app/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { MovementTable } from '@/features/inventory/MovementTable';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { CancelPurchaseDialog, ReceiveDialog, SupplierReturnDialog } from './PurchaseDialogs';
import { PurchaseStatusBadge } from './PurchaseStatusBadge';
import { isOverdue, purchaseActions } from './purchase-rules';
import { useOrderPurchase, usePurchase, usePurchaseMovements } from './queries';

type DialogName = 'receive' | 'cancel' | 'return' | null;

/** UC-20 … UC-24 on one page: lines, status, actions and the stock movements it caused. */
export function PurchaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const purchase = usePurchase(id);
  const order = useOrderPurchase(id);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const showMovements =
    can('inventory.view_movements') && !!purchase.data && purchase.data.status !== 'DRAFT';
  const movements = usePurchaseMovements(id, showMovements);

  const back = (
    <Link
      to="/purchases"
      className="mb-2 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-4" /> {t('purchases:title')}
    </Link>
  );
  if (purchase.isPending)
    return (
      <>
        {back}
        <Skeleton className="h-48" />
      </>
    );
  if (purchase.isError)
    return (
      <>
        {back}
        <ErrorState error={purchase.error} onRetry={() => void purchase.refetch()} />
      </>
    );

  const p = purchase.data;
  const actions = purchaseActions(p, can);
  const showCost = p.total !== undefined;
  const partiallyCancelled =
    p.status === 'CANCELLED' && p.items.some((i) => Number(i.quantityReceived) > 0);

  const markOrdered = async () => {
    setActionError(null);
    try {
      await order.mutateAsync();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.reference}</span>
            <PurchaseStatusBadge status={p.status} />
            {isOverdue(p) && <Badge tone="red">{t('purchases:detail.overdue')}</Badge>}
          </span>
        }
        description={
          <Link to={`/suppliers/${p.supplier.id}`} className="hover:underline">
            {p.supplier.name}
          </Link>
        }
        actions={
          <>
            {actions.receive && (
              <Button
                icon={<PackageCheck className="size-4" />}
                onClick={() => setDialog('receive')}
              >
                {t('purchases:actions.receive')}
              </Button>
            )}
            {actions.order && (
              <Button
                icon={<Send className="size-4" />}
                loading={order.isPending}
                onClick={() => void markOrdered()}
              >
                {t('purchases:actions.order')}
              </Button>
            )}
            {actions.edit && (
              <Button
                variant="secondary"
                icon={<Pencil className="size-4" />}
                onClick={() => navigate(`/purchases/${p.id}/edit`)}
              >
                {t('purchases:actions.edit')}
              </Button>
            )}
            {actions.return && (
              <Button
                variant="secondary"
                icon={<Undo2 className="size-4" />}
                onClick={() => setDialog('return')}
              >
                {t('purchases:actions.return')}
              </Button>
            )}
            {actions.cancel && (
              <Button
                variant="ghost"
                icon={<Ban className="size-4" />}
                onClick={() => setDialog('cancel')}
              >
                {t('purchases:actions.cancel')}
              </Button>
            )}
          </>
        }
      />
      <FormAlert message={actionError} />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="space-y-2 p-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-stone-500">{t('purchases:fields.createdAt')}</dt>
            <dd>
              {f.date(p.createdAt)} · {p.createdBy.fullName}
            </dd>
            {p.orderedAt && (
              <>
                <dt className="text-stone-500">{t('purchases:fields.orderedAt')}</dt>
                <dd>{f.date(p.orderedAt)}</dd>
              </>
            )}
            {p.expectedAt && p.status !== 'RECEIVED' && p.status !== 'CANCELLED' && (
              <>
                <dt className="text-stone-500">{t('purchases:fields.expectedAt')}</dt>
                <dd className={isOverdue(p) ? 'font-medium text-red-700' : ''}>
                  {f.date(p.expectedAt)}
                </dd>
              </>
            )}
            {p.receivedAt && (
              <>
                <dt className="text-stone-500">{t('purchases:fields.receivedAt')}</dt>
                <dd>{f.date(p.receivedAt)}</dd>
              </>
            )}
            {p.cancelledAt && (
              <>
                <dt className="text-stone-500">{t('purchases:fields.cancelledAt')}</dt>
                <dd>{f.date(p.cancelledAt)}</dd>
              </>
            )}
          </dl>
          {p.supplier.phone && (
            <a
              href={`tel:${p.supplier.phone}`}
              className="flex items-center gap-2 pt-1 text-brand-800 hover:underline"
            >
              <Phone className="size-4" /> {p.supplier.phone}
            </a>
          )}
          {p.notes && (
            <p className="rounded-lg bg-stone-50 p-2 whitespace-pre-line text-stone-700">
              {p.notes}
            </p>
          )}
          {p.cancelReason && (
            <p className="rounded-lg bg-red-50 p-2 text-red-800">
              <span className="font-medium">
                {partiallyCancelled
                  ? t('purchases:detail.partiallyCancelled')
                  : t('purchases:detail.cancelReason')}
                :
              </span>{' '}
              {p.cancelReason}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('purchases:detail.lines')}
          </h2>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('purchases:fields.product')}</th>
                  <th className="px-4 py-2.5 text-right">
                    {t('purchases:fields.quantityOrdered')}
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    {t('purchases:fields.quantityReceived')}
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    {t('purchases:fields.quantityRemaining')}
                  </th>
                  {showCost && (
                    <>
                      <th className="px-4 py-2.5 text-right">{t('purchases:fields.unitCost')}</th>
                      <th className="px-4 py-2.5 text-right">{t('purchases:fields.lineTotal')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/products/${i.product.id}`}
                        className="font-medium hover:underline"
                      >
                        {i.product.name}
                      </Link>
                      <div className="text-xs text-stone-500">{i.product.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {f.quantity(i.quantityOrdered, i.product.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {f.quantity(i.quantityReceived, i.product.unit)}
                      {Number(i.quantityReturned) > 0 && (
                        <div className="text-xs text-amber-700">
                          −{f.quantity(i.quantityReturned)} {t('purchases:fields.quantityReturned')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {f.quantity(i.quantityRemaining, i.product.unit)}
                    </td>
                    {showCost && (
                      <>
                        <td className="px-4 py-2.5 text-right tabular">{f.money(i.unitCost)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular">
                          {f.money(i.lineTotal)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-stone-100 md:hidden">
            {p.items.map((i) => (
              <li key={i.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <Link to={`/products/${i.product.id}`} className="truncate font-medium">
                    {i.product.name}
                  </Link>
                  {showCost && <span className="font-medium tabular">{f.money(i.lineTotal)}</span>}
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  {t('purchases:fields.quantityOrdered')}{' '}
                  {f.quantity(i.quantityOrdered, i.product.unit)} ·{' '}
                  {t('purchases:fields.quantityReceived')} {f.quantity(i.quantityReceived)} ·{' '}
                  {t('purchases:fields.quantityRemaining')} {f.quantity(i.quantityRemaining)}
                </p>
              </li>
            ))}
          </ul>
          {showCost && (
            <div className="flex justify-between border-t border-stone-200 px-4 py-3 text-sm">
              <span className="text-stone-600">{t('purchases:fields.total')}</span>
              <span className="font-semibold tabular">{f.money(p.total)}</span>
            </div>
          )}
        </Card>
      </div>

      {showMovements && (
        <Card className="mt-4">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('purchases:detail.movements')}
          </h2>
          {movements.isPending ? (
            <div className="p-4">
              <Skeleton className="h-16" />
            </div>
          ) : movements.isError ? (
            <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />
          ) : movements.data.length === 0 ? (
            <EmptyState title={t('purchases:detail.noMovements')} />
          ) : (
            <MovementTable movements={movements.data} showProduct />
          )}
        </Card>
      )}

      <ReceiveDialog purchase={p} open={dialog === 'receive'} onClose={() => setDialog(null)} />
      <CancelPurchaseDialog
        purchase={p}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
      />
      <SupplierReturnDialog
        purchase={p}
        open={dialog === 'return'}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
