import { D } from '../../common/decimal';
import { discountPercent, refundShare } from './sale-math';

describe('discountPercent (employee discount limit, docs/03 §3)', () => {
  it('counts the line discount against the line at the selling price', () => {
    // 2 × 1,000 with 100 off → 5 %
    const p = discountPercent({ quantity: D(2), listPrice: D(1000), lineTotal: D(1900) });
    expect(p.toString()).toBe('5');
  });

  it('counts a lower unit price as a discount too', () => {
    // sold at 900 instead of 1,000 → 10 %
    const p = discountPercent({ quantity: D(1), listPrice: D(1000), lineTotal: D(900) });
    expect(p.toString()).toBe('10');
  });

  it('is 0 for a price above the list price or a free product', () => {
    expect(
      discountPercent({ quantity: D(1), listPrice: D(1000), lineTotal: D(1200) }).isZero(),
    ).toBe(true);
    expect(discountPercent({ quantity: D(1), listPrice: D(0), lineTotal: D(0) }).isZero()).toBe(
      true,
    );
  });
});

describe('refundShare (customer returns)', () => {
  const item = { lineTotal: D(2900), quantity: D(3) };

  it('refunds the paid amount pro rata, rounded to the cent', () => {
    expect(refundShare(item, D(1)).toString()).toBe('966.67');
  });

  it('adds up to exactly the line total when returned in steps', () => {
    const first = refundShare(item, D(1)).minus(refundShare(item, D(0)));
    const second = refundShare(item, D(2)).minus(refundShare(item, D(1)));
    const third = refundShare(item, D(3)).minus(refundShare(item, D(2)));
    expect(first.plus(second).plus(third).toString()).toBe('2900');
  });

  it('handles fractional quantities', () => {
    // 1.5 kg for 6,300 → 0.5 kg = 2,100
    expect(refundShare({ lineTotal: D(6300), quantity: D('1.5') }, D('0.5')).toString()).toBe(
      '2100',
    );
  });
});
