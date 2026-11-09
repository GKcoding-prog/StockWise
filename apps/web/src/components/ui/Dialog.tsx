import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * Native <dialog> (focus trap, Esc, inert background for free). Full-screen sheet on phones.
 */
export function Dialog({ open, onClose, title, description, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sw-dialog ${wide ? 'sm:max-w-2xl' : ''}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
    >
      {open && (
        <div className="flex h-full max-h-[90dvh] flex-col sm:max-h-[85dvh]">
          <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-stone-600">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label={t('common:actions.close')}
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-stone-200 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
