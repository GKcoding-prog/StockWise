import { ERROR_CODES } from '@stockwise/shared';
import { resources } from '@/lib/i18n';

/** Flattened keys, with i18next plural suffixes folded together. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v, `${prefix}${k}.`)
      : [`${prefix}${k.replace(/_(one|other|many)$/, '')}`],
  );
}

describe('translations (a feature is not done until it is translated)', () => {
  const namespaces = Object.keys(resources.fr) as (keyof typeof resources.fr)[];

  it.each(namespaces)('FR and EN have the same keys in %s', (ns) => {
    expect([...new Set(keys(resources.en[ns]))].sort()).toEqual(
      [...new Set(keys(resources.fr[ns]))].sort(),
    );
  });

  it('translates every API error code', () => {
    for (const code of ERROR_CODES) {
      expect(resources.fr.errors).toHaveProperty(code);
      expect(resources.en.errors).toHaveProperty(code);
    }
  });
});
