import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  time: string;
}

/**
 * GET /health. A 503 still carries a body ({ db: 'down' }), so treat it as data,
 * not as "API unreachable".
 */
export async function fetchHealth(): Promise<HealthStatus> {
  try {
    return await apiFetch<HealthStatus>('/health');
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) {
      return { status: 'degraded', db: 'down', time: new Date().toISOString() };
    }
    throw err;
  }
}

export function useHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
}
