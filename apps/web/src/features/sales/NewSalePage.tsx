import { PAYMENT_METHODS, type CreateSaleInput, type PaymentMethod } from '@stockwise/shared';
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCan } from '@/app/auth';
import { StockBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card, EmptyState, PageHeader } from '@/components/ui/States';
import { FormAlert } from '@/features/auth/AuthLayout';
import { useProducts } from '@/features/products/queries';
import { newIdempotencyKey } from '@/features/purchases/purchase-rules';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { Product, SaleDetail } from '@/lib/types';
import { Receipt, useReceiptPrinter } from './Receipt';
import { lookupProduct, useBusinessProfile, useCreateSale } from './queries';
import {
  addToCart,
  cartTotals,
  changeDue,
  exceedsStock,
  isValidQuantity,
  lineProblem,
  lineTotal,
  trimNumber,
  type CartLine,
} from './sale-rules';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** UC-30: the point-of-sale screen (docs/06 §3.2). */
export function NewSalePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const errorMessage = useErrorMessage();
  const business = useBusinessProfile();
  const create = useCreateSale();
  const searchRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [tendered, setTendered] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Products the server refused for stock, with the quantity it said is available. */
  const [shortages, setShortages] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState<SaleDetail | null>(null);
  /** One key per attempt: a retry of the same cart reuses it, so it can't sell twice. */
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const maxDiscount = can('sales.discount_unlimited')
    ? null
    : (business.data?.settings.employeeMaxDiscountPercent ?? null);
  const totals = cartTotals(lines);
  const change = payment === 'CASH' ? changeDue(tendered, totals.total) : null;
  const problems = lines.map((l) => lineProblem(l, maxDiscount));

  const setLine = (productId: string, patch: Partial<CartLine>) => {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
    setShortages(({ [productId]: _removed, ...rest }) => rest);
  };
  const add = (product: Product) => {
    setLines((prev) => addToCart(prev, product));
    setError(null);
  };
  const reset = () => {
    setLines([]);
    setTendered('');
    setCustomerName('');
    setCustomerPhone('');
    setShowCustomer(false);
    setPayment('CASH');
    setShortages({});
    setError(null);
    attempt.current = null;
  };

  const submit = async () => {
    if (create.isPending || lines.length === 0) return;
    setError(null);
    if (problems.some(Boolean)) {
      setError(t('sales:pos.fixLines'));
      return;
    }
    if (payment === 'CASH' && tendered.trim() !== '' && change === null) {
      setError(t('validation:tenderedTooLow'));
      return;
    }
    const body: CreateSaleInput = {
      paymentMethod: payment,
      customerName,
      customerPhone,
      amountTendered: payment === 'CASH' ? tendered.trim() : null,
      items: lines.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity.trim(),
        discountAmount: l.discount.trim() || '0',
      })),
    };
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) {
      attempt.current = { key: newIdempotencyKey(), body: serialized };
    }
    try {
      const sale = await create.mutateAsync({ body, idempotencyKey: attempt.current.key });
      reset();
      setCompleted(sale);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK') {
        const details = (err.details ?? []) as { productId: string; available: string }[];
        setShortages(Object.fromEntries(details.map((d) => [d.productId, d.available])));
      }
      setError(errorMessage(err));
    }
  };

  // Keyboard: "/" focuses search, F2 completes the sale (docs/06 §3.2).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        void submitRef.current();
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (completed) {
    return (
      <SaleCompleted
        sale={completed}
        onNewSale={() => {
          setCompleted(null);
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('sales:pos.title')}
        description={<span className="hidden sm:inline">{t('sales:pos.shortcuts')}</span>}
        actions={
          lines.length > 0 && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={reset}>
              {t('sales:pos.clear')}
            </Button>
          )
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <ProductSearch onPick={add} inputRef={searchRef} />
          <Card>
            {lines.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="size-6" />}
                title={t('sales:pos.cartEmptyTitle')}
                description={t('sales:pos.cartEmptyText')}
              />
            ) : (
              <ul className="divide-y divide-stone-100">
                {lines.map((line, index) => (
                  <CartRow
                    key={line.product.id}
                    line={line}
                    problem={problems[index]}
                    maxDiscount={maxDiscount}
                    shortage={shortages[line.product.id]}
                    onChange={(patch) => setLine(line.product.id, patch)}
                    onRemove={() =>
                      setLines((prev) => prev.filter((l) => l.product.id !== line.product.id))
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="space-y-4 p-4 lg:sticky lg:top-20">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">{t('sales:fields.subtotal')}</dt>
              <dd className="tabular">{f.money(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">{t('sales:fields.discount')}</dt>
                <dd className="tabular">−{f.money(totals.discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2">
              <dt className="font-medium">{t('sales:fields.total')}</dt>
              <dd className="text-2xl font-semibold tabular">{f.money(totals.total)}</dd>
            </div>
          </dl>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-stone-700">
              {t('sales:fields.paymentMethod')}
            </legend>
            <div className="grid grid-cols-2 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={payment === m}
                  onClick={() => setPayment(m)}
                  className={`rounded-lg border px-2 py-2 text-sm ${payment === m ? 'border-brand-800 bg-brand-50 font-medium text-brand-900' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}
                >
                  {t(`sales:paymentMethods.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {payment === 'CASH' && (
            <div>
              <Field
                label={t('sales:fields.amountTendered')}
                hint={t('sales:pos.tenderedHint')}
                error={
                  tendered.trim() !== '' && change === null
                    ? t('validation:tenderedTooLow')
                    : undefined
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    className="text-right"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                  />
                )}
              </Field>
              {change !== null && (
                <p className="mt-2 flex justify-between text-sm" aria-live="polite">
                  <span className="text-stone-600">{t('sales:fields.changeDue')}</span>
                  <span className="font-semibold tabular">{f.money(change)}</span>
                </p>
              )}
            </div>
          )}

          {showCustomer ? (
            <div className="grid gap-3">
              <Field label={t('sales:fields.customerName')}>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={120}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('sales:fields.customerPhone')}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    maxLength={30}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomer(true)}
              className="text-sm text-brand-800 hover:underline"
            >
              {t('sales:pos.addCustomer')}
            </button>
          )}

          <FormAlert message={error} />
          <Button
            className="h-12 w-full text-base"
            loading={create.isPending}
            disabled={lines.length === 0}
            onClick={() => void submit()}
          >
            {t('sales:pos.complete')}
            <kbd className="ml-1 hidden rounded bg-white/15 px-1.5 text-xs font-normal sm:inline">
              F2
            </kbd>
          </Button>
        </Card>
      </div>
    </>
  );
}

// ── Search ───────────────────────────────────────────────────────────────────────────────

/**
 * Autofocused search. Typing lists matches with price and stock; Enter (or a barcode scanner,
 * which types the code and presses Enter) adds the exact SKU/barcode match, else the first hit.
 */
function ProductSearch({
  onPick,
  inputRef,
}: {
  onPick: (product: Product) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const listId = useId();
  const [text, setText] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const results = useProducts({ q, pageSize: 8 });
  const show = q.length > 0 && q === text.trim();

  const pick = (p: Product) => {
    onPick(p);
    setText('');
    setNotFound(false);
    inputRef.current?.focus();
  };

  const pickTyped = async () => {
    const code = text.trim();
    if (!code || looking) return;
    setLooking(true);
    try {
      const exact = await lookupProduct(code);
      const match =
        exact ??
        (await api<Paginated<Product>>('/products', { query: { q: code, pageSize: 1 } })).data[0];
      if (match) pick(match);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setNotFound(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void pickTyped();
          } else if (e.key === 'Escape') {
            setText('');
          }
        }}
        placeholder={t('sales:pos.search')}
        aria-label={t('sales:pos.search')}
        aria-controls={show ? listId : undefined}
        className="h-12 pl-9 text-base"
      />
      {notFound && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {t('sales:pos.noProductFound', { code: text.trim() })}
        </p>
      )}
      {show && !notFound && (
        <ul
          id={listId}
          aria-label={t('sales:pos.results')}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {results.isPending ? (
            <li className="px-3 py-2 text-sm text-stone-500">{t('common:states.loading')}</li>
          ) : !results.data?.data.length ? (
            <li className="px-3 py-2 text-sm text-stone-500">
              {t('sales:pos.noProductFound', { code: q })}
            </li>
          ) : (
            results.data.data.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-stone-500">
                      {p.sku} · {f.quantity(p.quantityOnHand, p.unit)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular">{f.money(p.sellingPrice)}</span>
                    <StockBadge status={p.stockStatus} />
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── Cart line ────────────────────────────────────────────────────────────────────────────

function CartRow({
  line,
  problem,
  maxDiscount,
  shortage,
  onChange,
  onRemove,
}: {
  line: CartLine;
  problem: ReturnType<typeof lineProblem>;
  maxDiscount: number | null;
  shortage: string | undefined;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const { product } = line;
  const step = (delta: number) => {
    if (!isValidQuantity(line.quantity, true)) return onChange({ quantity: '1' });
    const next = Number(line.quantity) + delta;
    if (next > 0) onChange({ quantity: trimNumber(next) });
  };

  const message =
    problem === 'quantity'
      ? product.allowFractional
        ? t('sales:pos.invalidQuantity')
        : t('validation:wholeNumber')
      : problem === 'discount'
        ? t('validation:decimals2')
        : problem === 'discountAboveLine'
          ? t('validation:discountAboveLine')
          : problem === 'discountLimit'
            ? t('sales:pos.discountLimit', { max: maxDiscount })
            : null;
  const available = shortage ?? (exceedsStock(line) ? product.quantityOnHand : null);
  const total = lineTotal(line);

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_9.5rem_7rem_6.5rem_2.5rem] ${problem || shortage ? 'bg-red-50/60' : ''}`}
    >
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="truncate font-medium">{product.name}</p>
        <p className="text-xs text-stone-500">
          {f.money(product.sellingPrice)}
          {product.unit !== 'pcs' && ` / ${product.unit}`} · {product.sku}
        </p>
        {available !== null && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-800">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t('sales:pos.onlyAvailable', { quantity: f.quantity(available, product.unit) })}
          </p>
        )}
        {message && <p className="mt-0.5 text-xs text-red-700">{message}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="secondary"
          className="w-9 shrink-0 px-0!"
          aria-label={t('sales:pos.decrease', { name: product.name })}
          onClick={() => step(-1)}
        >
          <Minus className="size-4" />
        </Button>
        <Input
          inputMode={product.allowFractional ? 'decimal' : 'numeric'}
          className="min-w-0 px-1 text-center"
          aria-label={t('sales:fields.quantity')}
          aria-invalid={problem === 'quantity' || !!shortage || undefined}
          value={line.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
        <Button
          variant="secondary"
          className="w-9 shrink-0 px-0!"
          aria-label={t('sales:pos.increase', { name: product.name })}
          onClick={() => step(1)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <Input
        inputMode="decimal"
        className="text-right"
        placeholder={t('sales:pos.discountPlaceholder')}
        aria-label={t('sales:fields.discount')}
        aria-invalid={(problem !== null && problem !== 'quantity') || undefined}
        value={line.discount}
        onChange={(e) => onChange({ discount: e.target.value })}
      />
      <p className="text-right font-semibold whitespace-nowrap tabular">{f.money(total)}</p>
      <Button
        size="sm"
        variant="ghost"
        className="w-9 justify-self-end px-0!"
        aria-label={t('sales:pos.remove', { name: product.name })}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

// ── After a sale ─────────────────────────────────────────────────────────────────────────

function SaleCompleted({ sale, onNewSale }: { sale: SaleDetail; onNewSale: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const business = useBusinessProfile();
  const printer = useReceiptPrinter();
  const names = new Map(sale.items.map((i) => [i.productId, i]));
  const warnings = (sale.stockAfter ?? []).filter((s) => s.stockStatus !== 'OK');

  return (
    <div className="mx-auto max-w-lg">
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-brand-700" aria-hidden />
        <h1 className="mt-2 text-xl font-semibold">{t('sales:done.title')}</h1>
        <p className="mt-1 font-mono text-sm text-stone-600">{sale.reference}</p>
        <p className="mt-4 text-3xl font-semibold tabular">{f.money(sale.total)}</p>
        <p className="text-sm text-stone-600">{t(`sales:paymentMethods.${sale.paymentMethod}`)}</p>
        {sale.changeDue !== null && Number(sale.changeDue) > 0 && (
          <p className="mt-3 rounded-lg bg-brand-50 p-3 text-brand-900">
            {t('sales:done.change')}{' '}
            <span className="text-lg font-semibold tabular">{f.money(sale.changeDue)}</span>
          </p>
        )}
        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-left text-sm text-amber-900">
            <p className="font-medium">{t('sales:done.stockWarning')}</p>
            <ul className="mt-1 space-y-1">
              {warnings.map((w) => {
                const item = names.get(w.productId);
                return (
                  <li key={w.productId} className="flex items-center justify-between gap-2">
                    <span className="truncate">{item?.productName}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular">
                        {f.quantity(w.quantityOnHand, item?.product.unit)}
                      </span>
                      <StockBadge status={w.stockStatus} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            icon={<Printer className="size-4" />}
            onClick={() => printer.print('80mm')}
          >
            {t('sales:actions.print80')}
          </Button>
          <Button
            variant="secondary"
            icon={<Printer className="size-4" />}
            onClick={() => printer.print('a4')}
          >
            {t('sales:actions.printA4')}
          </Button>
          <Link
            to={`/sales/${sale.id}`}
            className="inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            {t('sales:done.view')}
          </Link>
          <Button autoFocus icon={<Plus className="size-4" />} onClick={onNewSale}>
            {t('sales:new')}
          </Button>
        </div>
      </Card>
      <Receipt sale={sale} business={business.data} format={printer.format} />
    </div>
  );
}
