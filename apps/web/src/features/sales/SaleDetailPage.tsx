import { ArrowLeft, Ban, Printer, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCan } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { MovementTable } from '@/features/inventory/MovementTable';
import { useFormat } from '@/lib/format';
import { Receipt, useReceiptPrinter } from './Receipt';
import { CustomerReturnDialog, VoidSaleDialog } from './SaleDialogs';
import { SaleStatusBadge } from './SaleStatusBadge';
import { useBusinessProfile, useSale, useSaleMovements } from './queries';
import { saleActions } from './sale-rules';

type DialogName = 'void' | 'return' | null;

/** UC-31 … UC-33: lines, payment, receipt, void/return, and the stock movements it caused. */
export function SaleDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const sale = useSale(id);
  const business = useBusinessProfile();
  const printer = useReceiptPrinter();
  const [dialog, setDialog] = useState<DialogName>(null);
  const showMovements = can('inventory.view_movements');
  const movements = useSaleMovements(id, showMovements && !!sale.data);

  const back = (
    <Link
      to="/sales"
      className="mb-2 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-4" /> {t('sales:title')}
    </Link>
  );
  if (sale.isPending)
    return (
      <>
        {back}
        <Skeleton className="h-48" />
      </>
    );
  if (sale.isError)
    return (
      <>
        {back}
        <ErrorState error={sale.error} onRetry={() => void sale.refetch()} />
      </>
    );

  const s = sale.data;
  const actions = saleActions(s, can);
  const showCost = s.items.some((i) => i.unitCost !== undefined);
  const anyReturned = s.items.some((i) => Number(i.quantityReturned) > 0);

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{s.reference}</span>
            <SaleStatusBadge status={s.status} />
          </span>
        }
        description={`${f.dateTime(s.soldAt)} · ${s.soldBy.fullName}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Printer className="size-4" />}
              onClick={() => printer.print('80mm')}
            >
              {t('sales:actions.print80')}
            </Button>
            <Button variant="secondary" onClick={() => printer.print('a4')}>
              {t('sales:actions.printA4')}
            </Button>
            {actions.return && (
              <Button
                variant="secondary"
                icon={<Undo2 className="size-4" />}
                onClick={() => setDialog('return')}
              >
                {t('sales:actions.return')}
              </Button>
            )}
            {actions.void && (
              <Button
                variant="ghost"
                icon={<Ban className="size-4" />}
                onClick={() => setDialog('void')}
              >
                {t('sales:actions.void')}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="space-y-3 p-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-stone-500">{t('sales:fields.paymentMethod')}</dt>
            <dd>{t(`sales:paymentMethods.${s.paymentMethod}`)}</dd>
            {s.amountTendered !== null && (
              <>
                <dt className="text-stone-500">{t('sales:fields.amountTendered')}</dt>
                <dd className="tabular">{f.money(s.amountTendered)}</dd>
                <dt className="text-stone-500">{t('sales:fields.changeDue')}</dt>
                <dd className="tabular">{f.money(s.changeDue)}</dd>
              </>
            )}
            {s.customerName && (
              <>
                <dt className="text-stone-500">{t('sales:fields.customerName')}</dt>
                <dd>{s.customerName}</dd>
              </>
            )}
            {s.customerPhone && (
              <>
                <dt className="text-stone-500">{t('sales:fields.customerPhone')}</dt>
                <dd>
                  <a href={`tel:${s.customerPhone}`} className="text-brand-800 hover:underline">
                    {s.customerPhone}
                  </a>
                </dd>
              </>
            )}
          </dl>
          {s.notes && (
            <p className="rounded-lg bg-stone-50 p-2 whitespace-pre-line text-stone-700">
              {s.notes}
            </p>
          )}
          {s.status === 'VOIDED' && (
            <p className="rounded-lg bg-red-50 p-2 text-red-800">
              <span className="font-medium">
                {t('sales:detail.voided', {
                  name: s.voidedBy?.fullName ?? '—',
                  date: f.dateTime(s.voidedAt),
                })}
              </span>
              {s.voidReason && (
                <>
                  <br />
                  {s.voidReason}
                </>
              )}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('sales:detail.lines')}
          </h2>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('sales:fields.product')}</th>
                  <th className="px-4 py-2.5 text-right">{t('sales:fields.quantity')}</th>
                  <th className="px-4 py-2.5 text-right">{t('sales:fields.unitPrice')}</th>
                  <th className="px-4 py-2.5 text-right">{t('sales:fields.discount')}</th>
                  <th className="px-4 py-2.5 text-right">{t('sales:fields.lineTotal')}</th>
                  {showCost && (
                    <th className="px-4 py-2.5 text-right">{t('sales:fields.lineCost')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {s.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5">
                      <Link to={`/products/${i.productId}`} className="font-medium hover:underline">
                        {i.productName}
                      </Link>
                      <div className="text-xs text-stone-500">{i.product.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {f.quantity(i.quantity, i.product.unit)}
                      {Number(i.quantityReturned) > 0 && (
                        <div className="text-xs text-amber-700">
                          −{f.quantity(i.quantityReturned)} {t('sales:fields.returned')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{f.money(i.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {Number(i.discountAmount) > 0 ? `−${f.money(i.discountAmount)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular">
                      {f.money(i.lineTotal)}
                    </td>
                    {showCost && (
                      <td className="px-4 py-2.5 text-right text-stone-600 tabular">
                        {f.money(i.lineCost)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-stone-100 md:hidden">
            {s.items.map((i) => (
              <li key={i.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <Link to={`/products/${i.productId}`} className="truncate font-medium">
                    {i.productName}
                  </Link>
                  <span className="font-medium tabular">{f.money(i.lineTotal)}</span>
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  {f.quantity(i.quantity, i.product.unit)} × {f.money(i.unitPrice)}
                  {Number(i.discountAmount) > 0 && ` − ${f.money(i.discountAmount)}`}
                  {Number(i.quantityReturned) > 0 &&
                    ` · ${t('sales:fields.returned')} ${f.quantity(i.quantityReturned)}`}
                </p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-stone-200 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">{t('sales:fields.subtotal')}</dt>
              <dd className="tabular">{f.money(s.subtotal)}</dd>
            </div>
            {Number(s.discountTotal) > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">{t('sales:fields.discount')}</dt>
                <dd className="tabular">−{f.money(s.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>{t('sales:fields.total')}</dt>
              <dd className="tabular">{f.money(s.total)}</dd>
            </div>
            {(anyReturned || s.status === 'VOIDED') && (
              <>
                {anyReturned && (
                  <div className="flex justify-between text-amber-800">
                    <dt>{t('sales:fields.returnedTotal')}</dt>
                    <dd className="tabular">−{f.money(s.returnedTotal)}</dd>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <dt>{t('sales:fields.netTotal')}</dt>
                  <dd className="tabular">{f.money(s.netTotal)}</dd>
                </div>
              </>
            )}
          </dl>
        </Card>
      </div>

      {showMovements && (
        <Card className="mt-4">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            {t('sales:detail.movements')}
          </h2>
          {movements.isPending ? (
            <div className="p-4">
              <Skeleton className="h-16" />
            </div>
          ) : movements.isError ? (
            <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />
          ) : movements.data.length === 0 ? (
            <EmptyState title={t('sales:detail.noMovements')} />
          ) : (
            <MovementTable movements={movements.data} showProduct />
          )}
        </Card>
      )}

      <VoidSaleDialog sale={s} open={dialog === 'void'} onClose={() => setDialog(null)} />
      <CustomerReturnDialog sale={s} open={dialog === 'return'} onClose={() => setDialog(null)} />
      <Receipt sale={s} business={business.data} format={printer.format} />
    </>
  );
}
