import type { PermissionKey } from '@stockwise/shared';
import type { Product, SaleDetail, SaleStatus } from '@/lib/types';
import {
  addToCart,
  cartTotals,
  changeDue,
  discountPercent,
  exceedsStock,
  isValidQuantity,
  lineProblem,
  refundPreview,
  saleActions,
  type CartLine,
} from './sale-rules';

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    name: 'Sugar 1 kg',
    sellingPrice: '1000.00',
    allowFractional: false,
    quantityOnHand: '10.000',
    ...overrides,
  }) as Product;

const line = (quantity: string, discount = '', p: Partial<Product> = {}): CartLine => ({
  product: product(p),
  quantity,
  discount,
});

describe('isValidQuantity', () => {
  it.each([
    ['1', false, true],
    ['12', false, true],
    ['1.5', false, false],
    ['1.5', true, true],
    ['0.250', true, true],
    ['0', true, false],
    ['', true, false],
    ['-1', true, false],
    ['1.2345', true, false],
    ['abc', true, false],
  ])('%s (fractional: %s) → %s', (value, fractional, expected) => {
    expect(isValidQuantity(value, fractional)).toBe(expected);
  });
});

describe('cart arithmetic (preview only)', () => {
  it('totals lines and discounts', () => {
    const lines = [line('2', '100'), line('1.5', '', { id: 'p2', sellingPrice: '4200.00' })];
    expect(cartTotals(lines)).toEqual({ subtotal: 8300, discount: 100, total: 8200 });
  });

  it('computes the discount share of a line', () => {
    expect(discountPercent(line('2', '100'))).toBe(5);
    expect(discountPercent(line('2', ''))).toBe(0);
  });
});

describe('lineProblem', () => {
  it('accepts a clean line', () => {
    expect(lineProblem(line('2', '50'), 5)).toBeNull();
  });
  it('flags whole-unit products sold by fractions', () => {
    expect(lineProblem(line('1.5'), null)).toBe('quantity');
  });
  it('flags bad and oversized discounts', () => {
    expect(lineProblem(line('1', 'abc'), null)).toBe('discount');
    expect(lineProblem(line('1', '1500'), null)).toBe('discountAboveLine');
  });
  it('applies the employee limit, and only when there is one', () => {
    expect(lineProblem(line('1', '60'), 5)).toBe('discountLimit');
    expect(lineProblem(line('1', '50'), 5)).toBeNull();
    expect(lineProblem(line('1', '600'), null)).toBeNull();
  });
});

describe('addToCart', () => {
  it('adds a new product with quantity 1', () => {
    expect(addToCart([], product())).toEqual([{ product: product(), quantity: '1', discount: '' }]);
  });
  it('adds one more unit when the product is already there', () => {
    const cart = addToCart([line('2', '10')], product());
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ quantity: '3', discount: '10' });
  });
});

describe('changeDue and stock hints', () => {
  it('computes change only once enough cash is given', () => {
    expect(changeDue('2000', 1900)).toBe(100);
    expect(changeDue('1900', 1900)).toBe(0);
    expect(changeDue('1000', 1900)).toBeNull();
    expect(changeDue('', 1900)).toBeNull();
  });
  it('warns when the cart asks for more than is on hand', () => {
    expect(exceedsStock(line('11'))).toBe(true);
    expect(exceedsStock(line('10'))).toBe(false);
  });
});

describe('saleActions (mirrors docs/05 §4.11)', () => {
  const sale = (status: SaleStatus, returnable = '1.000', returnedTotal = '0.00') =>
    ({ status, returnedTotal, items: [{ quantityReturnable: returnable }] }) as SaleDetail;
  const manager = (p: PermissionKey) => ['sales.void', 'sales.return'].includes(p);
  const employee = () => false;

  it('lets managers void a sale without returns, and return items', () => {
    expect(saleActions(sale('COMPLETED'), manager)).toEqual({ void: true, return: true });
  });
  it('blocks the void once something was returned', () => {
    expect(saleActions(sale('PARTIALLY_RETURNED', '1.000', '500.00'), manager)).toEqual({
      void: false,
      return: true,
    });
  });
  it('allows nothing on a voided or fully returned sale', () => {
    expect(saleActions(sale('VOIDED', '0.000'), manager)).toEqual({ void: false, return: false });
    expect(saleActions(sale('RETURNED', '0.000', '900.00'), manager)).toEqual({
      void: false,
      return: false,
    });
  });
  it('shows Employees neither action', () => {
    expect(saleActions(sale('COMPLETED'), employee)).toEqual({ void: false, return: false });
  });
});

describe('refundPreview (same rounding as the API)', () => {
  const item = { lineTotal: '2900.00', quantity: '3.000', quantityReturned: '0.000' };
  it('refunds pro rata', () => {
    expect(refundPreview(item, 1)).toBe(966.67);
  });
  it('refunds exactly the rest on the last return', () => {
    expect(refundPreview({ ...item, quantityReturned: '1.000' }, 2)).toBe(1933.33);
  });
});
