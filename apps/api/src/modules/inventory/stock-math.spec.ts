import { D } from '../../common/decimal';
import { incomingAverageCost, stockStatus } from './stock-math';

describe('incomingAverageCost (docs/04 §9)', () => {
  it('matches the worked example: 40 @ 1,000 + 60 @ 1,250 → 1,150', () => {
    expect(incomingAverageCost(D(40), D(1000), D(60), D(1250)).toString()).toBe('1150');
  });

  it('takes the incoming cost when stock was empty or negative', () => {
    expect(incomingAverageCost(D(0), D(999), D(10), D(500)).toString()).toBe('500');
    expect(incomingAverageCost(D(-3), D(999), D(10), D(500)).toString()).toBe('500');
  });

  it('works with fractional quantities without float drift', () => {
    // 2.5 kg @ 3,600 + 0.5 kg @ 4,200 = (9,000 + 2,100) / 3 = 3,700
    expect(incomingAverageCost(D('2.5'), D(3600), D('0.5'), D(4200)).toString()).toBe('3700');
  });

  it('rounds to 4 decimals', () => {
    // (1 × 1 + 2 × 2) / 3 = 1.6666…
    expect(incomingAverageCost(D(1), D(1), D(2), D(2)).toString()).toBe('1.6667');
  });
});

describe('stockStatus (docs/04 §1)', () => {
  it('is OUT at or below zero', () => {
    expect(stockStatus(D(0), D(5))).toBe('OUT');
    expect(stockStatus(D(-1), D(0))).toBe('OUT');
  });

  it('is LOW above zero and at or below the minimum', () => {
    expect(stockStatus(D(5), D(5))).toBe('LOW');
    expect(stockStatus(D('0.5'), D(1))).toBe('LOW');
  });

  it('is OK above the minimum, and only OUT can fire when the minimum is 0', () => {
    expect(stockStatus(D(6), D(5))).toBe('OK');
    expect(stockStatus(D('0.001'), D(0))).toBe('OK');
  });
});
