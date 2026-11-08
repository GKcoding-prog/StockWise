import { formatDateTime, formatMoney, formatQuantity } from './format';

// Intl output uses narrow no-break spaces in French; normalise for readable assertions.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney', () => {
  it('formats BIF without decimals', () => {
    expect(plain(formatMoney('12500', 'BIF', 'fr-BI'))).toBe('12 500 FBu');
  });

  it('keeps decimals for currencies that have them', () => {
    expect(formatMoney('12.5', 'USD', 'en-US')).toBe('$12.50');
  });
});

describe('formatQuantity', () => {
  it('drops trailing zeros and shows the unit', () => {
    expect(formatQuantity('12.500', 'fr-BI', 'kg')).toBe('12,5 kg');
  });

  it('hides the default "pcs" unit', () => {
    expect(formatQuantity('3.000', 'en-US', 'pcs')).toBe('3');
  });
});

describe('formatDateTime', () => {
  it('shows UTC timestamps in the business timezone (UTC+2)', () => {
    expect(formatDateTime('2026-11-08T22:30:00Z', 'en-GB', 'Africa/Bujumbura')).toContain('00:30');
    expect(formatDateTime('2026-11-08T22:30:00Z', 'en-GB', 'Africa/Bujumbura')).toContain(
      '9 Nov 2026',
    );
  });
});
