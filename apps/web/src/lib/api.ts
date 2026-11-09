import type { ApiErrorBody, ErrorCode } from '@stockwise/shared';

/** Session returned by login, register, refresh and switch-business. */
export interface Session {
  accessToken: string;
  expiresIn: number;
  activeBusinessId: string | null;
  user: { id: string; email: string; fullName: string; locale: string | null };
  memberships: { businessId: string; businessName: string; role: { key: string; name: string } }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

/**
 * The access token lives only in memory (docs/01 D6). The refresh token is an httpOnly
 * cookie the browser sends to /api/v1/auth/* by itself.
 */
let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<(session: Session | null) => void>();

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSession(session: Session | null): void {
  accessToken = session?.accessToken ?? null;
  listeners.forEach((l) => l(session));
}

/** One shared refresh for all parallel requests that hit an expired token. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => (res.ok ? ((await res.json()) as Session) : null))
    .catch(() => null)
    .then((session) => {
      setSession(session);
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'include',
    signal: opts.signal,
  });
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(res.status, 'INTERNAL_ERROR', res.statusText);
  }
}

/** JSON request with one transparent refresh-and-retry on an expired access token. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts);
  if (res.status === 401 && accessToken) {
    const error = await toError(res);
    if (error.code === 'TOKEN_EXPIRED' && (await refreshSession())) {
      res = await send(path, opts);
    } else {
      setSession(null);
      throw error;
    }
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
