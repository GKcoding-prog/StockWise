import type { ApiErrorBody, ErrorCode } from '@stockwise/shared';

/** Error thrown for any non-2xx API response. Translate in the UI with `t(`errors.${code}`)`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE = '/api/v1';

/**
 * Thin fetch wrapper: JSON in/out, cookies included, errors normalised to ApiError.
 * The access token and silent refresh are added in Phase 2 (auth).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  const text = await res.text();
  const body: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (body as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
