import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-600/20 focus:outline-none disabled:bg-stone-100 disabled:text-stone-500 aria-invalid:border-red-600';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, error, hint, children, className = '' }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className = '',
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${CONTROL} h-10 ${className}`} {...props} />;
}

export function Select({
  className = '',
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select ref={ref} className={`${CONTROL} h-10 pr-8 ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={`${CONTROL} min-h-20 py-2 ${className}`} {...props} />;
}

export function Checkbox({
  label,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-stone-800">
      <input
        ref={ref}
        type="checkbox"
        className="size-4 rounded border-stone-300 accent-brand-800"
        {...props}
      />
      {label}
    </label>
  );
}
