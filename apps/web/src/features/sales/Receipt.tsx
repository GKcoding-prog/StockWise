import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import type { BusinessProfile, SaleDetail } from '@/lib/types';

export type ReceiptFormat = '80mm' | 'a4';

/**
 * Printable receipt (UC-30 step 6). Rendered outside the app root, hidden on screen; while
 * printing, body.sw-printing hides everything else (see index.css), so only the receipt prints.
 */
export function Receipt({
  sale,
  business,
  format,
}: {
  sale: SaleDetail;
  business: BusinessProfile | undefined;
  format: ReceiptFormat;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const voided = sale.status === 'VOIDED';

  return createPortal(
    <div className={`sw-receipt sw-receipt-${format}`} aria-hidden>
      <header className="sw-receipt-center">
        <p className="sw-receipt-title">{business?.legalName ?? business?.name}</p>
        {business?.address && <p>{business.address}</p>}
        {business?.phone && <p>{business.phone}</p>}
        {business?.nif && <p>NIF {business.nif}</p>}
      </header>
      <hr />
      <p>
        {t('sales:receipt.reference')} {sale.reference}
      </p>
      <p>{f.dateTime(sale.soldAt)}</p>
      <p>
        {t('sales:receipt.cashier')} {sale.soldBy.fullName}
      </p>
      {sale.customerName && (
        <p>
          {t('sales:receipt.customer')} {sale.customerName}
        </p>
      )}
      {voided && <p className="sw-receipt-title">{t('sales:status.VOIDED')}</p>}
      <hr />
      <table>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.productName}
                <br />
                <span className="sw-receipt-muted">
                  {f.quantity(i.quantity, i.product.unit)} × {f.money(i.unitPrice)}
                  {Number(i.discountAmount) > 0 && ` − ${f.money(i.discountAmount)}`}
                </span>
              </td>
              <td className="sw-receipt-amount">{f.money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr>
            <td>{t('sales:fields.subtotal')}</td>
            <td className="sw-receipt-amount">{f.money(sale.subtotal)}</td>
          </tr>
          {Number(sale.discountTotal) > 0 && (
            <tr>
              <td>{t('sales:fields.discount')}</td>
              <td className="sw-receipt-amount">−{f.money(sale.discountTotal)}</td>
            </tr>
          )}
          <tr className="sw-receipt-title">
            <td>{t('sales:fields.total')}</td>
            <td className="sw-receipt-amount">{f.money(sale.total)}</td>
          </tr>
          <tr>
            <td>{t(`sales:paymentMethods.${sale.paymentMethod}`)}</td>
            <td className="sw-receipt-amount">{f.money(sale.amountTendered ?? sale.total)}</td>
          </tr>
          {sale.changeDue !== null && Number(sale.changeDue) > 0 && (
            <tr>
              <td>{t('sales:fields.changeDue')}</td>
              <td className="sw-receipt-amount">{f.money(sale.changeDue)}</td>
            </tr>
          )}
          {Number(sale.returnedTotal) > 0 && (
            <tr>
              <td>{t('sales:fields.returnedTotal')}</td>
              <td className="sw-receipt-amount">−{f.money(sale.returnedTotal)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <hr />
      <p className="sw-receipt-center">{t('sales:receipt.thanks')}</p>
    </div>,
    document.body,
  );
}

/** Mounts the receipt and prints it in the chosen layout. */
export function useReceiptPrinter() {
  const [format, setFormat] = useState<ReceiptFormat>('80mm');
  const print = (next: ReceiptFormat) => {
    setFormat(next);
    // Let React render the chosen layout before the print dialog takes a snapshot.
    requestAnimationFrame(() => {
      document.body.classList.add('sw-printing');
      const done = () => {
        document.body.classList.remove('sw-printing');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      window.print();
    });
  };
  return { format, print };
}
