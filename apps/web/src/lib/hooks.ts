import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** List filters kept in the URL, so back/forward and shared links keep them. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const set = (patch: Partial<Record<K | 'page', string | number | null>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '' || v === undefined) next.delete(k);
          else next.set(k, String(v));
        }
        // Changing a filter goes back to the first page.
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  return { values, page, set };
}
