import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Field';
import { useProducts } from '@/features/products/queries';
import { useDebounced } from '@/lib/hooks';
import type { Product } from '@/lib/types';

/**
 * Search box that adds a product to a document (purchase lines now, sale cart later).
 * A barcode scanner works too: it types the code, and an exact match shows first.
 */
export function ProductPicker({
  onPick,
  excludeIds,
}: {
  onPick: (product: Product) => void;
  excludeIds: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const results = useProducts({ q, pageSize: 8 });
  const show = q.length > 0;

  const pick = (p: Product) => {
    onPick(p);
    setText('');
  };

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter picks the first available match (handy with a barcode scanner).
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const first = results.data?.data.find((p) => !excludeIds.has(p.id));
          if (show && first) pick(first);
        }}
        placeholder={t('purchases:form.searchProduct')}
        aria-label={t('purchases:form.addProduct')}
        aria-controls={show ? listId : undefined}
        className="pl-9"
      />
      {show && (
        // A plain list of buttons: reachable with Tab and announced as buttons by screen readers.
        <ul
          id={listId}
          aria-label={t('purchases:form.addProduct')}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {results.isPending ? (
            <li className="px-3 py-2 text-sm text-stone-500">{t('common:states.loading')}</li>
          ) : !results.data?.data.length ? (
            <li className="px-3 py-2 text-sm text-stone-500">
              {t('purchases:form.noProductFound')}
            </li>
          ) : (
            results.data.data.map((p) => {
              const added = excludeIds.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => pick(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-stone-500">{p.sku}</span>
                    </span>
                    {added && (
                      <span className="shrink-0 text-xs text-stone-500">
                        {t('purchases:form.alreadyAdded')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
