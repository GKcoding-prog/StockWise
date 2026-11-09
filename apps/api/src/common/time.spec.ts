import { addDays, localDateOf, localDateRange, startOfLocalDay } from './time';

describe('business-timezone helpers', () => {
  const TZ = 'Africa/Bujumbura'; // UTC+2, no DST

  it('finds local midnight in UTC', () => {
    expect(startOfLocalDay('2026-11-08', TZ).toISOString()).toBe('2026-11-07T22:00:00.000Z');
    expect(startOfLocalDay('2026-11-08', 'UTC').toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('handles a DST zone on both sides of the change', () => {
    expect(startOfLocalDay('2026-07-01', 'Europe/Brussels').toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
    expect(startOfLocalDay('2026-12-01', 'Europe/Brussels').toISOString()).toBe(
      '2026-11-30T23:00:00.000Z',
    );
  });

  it('builds an inclusive local date range as [start, end)', () => {
    const range = localDateRange('2026-11-01', '2026-11-30', TZ);
    expect(range.gte?.toISOString()).toBe('2026-10-31T22:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-11-30T22:00:00.000Z');
  });

  it('gives the local calendar date of an instant', () => {
    // 23:30 UTC on the 7th is 01:30 on the 8th in Bujumbura.
    expect(localDateOf(new Date('2026-11-07T23:30:00Z'), TZ)).toBe('2026-11-08');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
