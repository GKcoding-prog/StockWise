import { VALIDATION_MESSAGE_PREFIX } from '@stockwise/shared';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiError } from './api';

/** Translates an API error by its code (docs/01 D9). */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        return t(`errors:${error.code}`, { defaultValue: t('errors:INTERNAL_ERROR') });
      }
      if (error instanceof TypeError) return t('errors:NETWORK');
      return t('errors:INTERNAL_ERROR');
    },
    [t],
  );
}

/** Translates a Zod issue message: our own keys ("sw.positive") or Zod's localised text. */
export function useValidationMessage(): (message: string | undefined) => string | undefined {
  const { t } = useTranslation();
  return useCallback(
    (message) =>
      message?.startsWith(VALIDATION_MESSAGE_PREFIX)
        ? t(`validation:${message.slice(VALIDATION_MESSAGE_PREFIX.length)}`)
        : message,
    [t],
  );
}

/** Field the server's conflict codes belong to, so they show under the right input. */
const FIELD_BY_CODE: Partial<Record<string, string>> = {
  SKU_TAKEN: 'sku',
  BARCODE_TAKEN: 'barcode',
  NAME_TAKEN: 'name',
  EMAIL_TAKEN: 'email',
};

/**
 * Maps a server error onto form fields: VALIDATION_ERROR details by path, conflict codes by
 * field. Returns false when nothing could be attached to a field (show a banner instead).
 */
export function useApplyServerErrors<T extends FieldValues>() {
  const message = useErrorMessage();
  const validation = useValidationMessage();
  return useCallback(
    (error: unknown, setError: UseFormSetError<T>): boolean => {
      if (!(error instanceof ApiError)) return false;
      if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
        let applied = false;
        for (const d of error.details as { path: string; message: string }[]) {
          if (!d.path) continue;
          setError(d.path as Path<T>, { message: validation(d.message) });
          applied = true;
        }
        return applied;
      }
      const field = FIELD_BY_CODE[error.code];
      if (field) {
        setError(field as Path<T>, { message: message(error) });
        return true;
      }
      return false;
    },
    [message, validation],
  );
}
